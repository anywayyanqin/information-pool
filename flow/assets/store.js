/* ==========================================================================
 * store.js — 状态存储与业务动作（状态机 / 日志 / 通知）
 * 扩展点：正式环境中本文件所有读写替换为后端 REST API；
 *         sendWeComNotification() 替换为企业微信应用消息 API。
 *
 * 术语约定：
 *   投递 = 员工填报时从 8 个业务池（零售/产业/机构/买方/财富/国际/中后台/其他）中选择一个，
 *          进池即「直投」＝自动生成一条挂在该业务池上的节点链路，收件人为池负责人+秘书，无需等分发
 *   分发 = 总池分发人（李倩影）与在办处理人均按部门员工组织架构（org.js）把消息派给全公司的部门或个人，
 *          勾选部门＝该部门全员收到待办，抄送消息投递业务池的负责人
 *   汇总回复 = 处理人全部办结后由李倩影统一发布，可多次发布、可编辑，最新一条为有效汇总
 *   处理人 = 分发目标收到的具体人员
 * ========================================================================== */

const LS_KEY = 'flow_state_v6';
const SEED_VERSION = 9;
let S = null;

/* ---------- 持久化 ---------- */
function loadState() {
  try { S = JSON.parse(localStorage.getItem(LS_KEY)); } catch (e) { S = null; }
  /* v6 的数据模型（8 业务池 + 汇总回复 + 收件人链路）与旧版不兼容，直接按种子重建；
   * 种子内容变更（业务池负责人对应关系、落实人抄送业务池负责人）时递增 SEED_VERSION。
   * 旧键 flow_state_v5 / v6 早期数据保留不删，便于回退查看。 */
  if (!S || S.v !== SEED_VERSION) {
    S = buildSeed();
    S.v = SEED_VERSION;
    saveState();
  }
  // 确保所有池对象的 ownerIds / secretaryIds / memberIds 为有效数组
  if (S && Array.isArray(S.pools)) {
    S.pools.forEach((p) => {
      if (!Array.isArray(p.ownerIds)) p.ownerIds = p.ownerId ? [p.ownerId] : [];
      if (!Array.isArray(p.secretaryIds)) p.secretaryIds = [];
      if (!Array.isArray(p.memberIds)) p.memberIds = [...p.ownerIds];
    });
  }
  if (S && Array.isArray(S.messages)) {
    S.messages.forEach((m) => { if (!Array.isArray(m.tags)) m.tags = []; });
  }
  if (S && Array.isArray(S.logs)) {
    S.logs = S.logs.filter((l) => l.action !== 'summary' && l.action !== 'summary_edit');
  }
  S.summaries = [];
}
function saveState() { localStorage.setItem(LS_KEY, JSON.stringify(S)); }
function resetState() {
  localStorage.removeItem(LS_KEY);
  S = buildSeed();
  S.v = SEED_VERSION;
  saveState();
}

/* ---------- 查询 ---------- */
function userById(id) {
  return USERS.find((u) => u.id === id) || ORG_USERS_BY_ID[id] || null;
}
function userName(id) { const u = userById(id); return u ? u.name : '系统'; }
function poolById(id) { return S.pools.find((p) => p.id === id) || null; }
function poolName(id) { const p = poolById(id); return p ? p.name : id; }
function findMsg(id) { return S.messages.find((m) => m.id === id) || null; }
function linksOf(msgId) { return S.links.filter((l) => l.messageId === msgId); }
function linkOf(msgId, poolId) { return S.links.find((l) => l.messageId === msgId && l.poolId === poolId) || null; }
/* 是否已存在指向相同 (消息, 池, 收件人集合) 的链路：避免重复分发同一目标 */
function hasLinkForTarget(msgId, t) {
  const next = (t.recipientIds || []).slice().sort().join(',');
  return S.links.some((l) =>
    l.messageId === msgId && l.poolId === t.poolId &&
    recipientsOf(l).slice().sort().join(',') === next);
}
function linkById(linkId) { return S.links.find((l) => l.id === linkId) || null; }
function repliesOf(msgId, poolId) {
  return S.replies
    .filter((r) => r.messageId === msgId && (!poolId || r.poolId === poolId))
    .sort((a, b) => a.at - b.at);
}
function logsOf(msgId) { return S.logs.filter((l) => l.messageId === msgId).sort((a, b) => a.at - b.at); }
function childPools(poolId) { return S.pools.filter((p) => p.parentId === poolId); }

/* ---------- 汇总回复 ---------- */
function summariesOf(msgId) {
  return (S.summaries || []).filter((s) => s.messageId === msgId).sort((a, b) => a.at - b.at);
}
function latestSummary(msgId) {
  const list = summariesOf(msgId);
  return list.length ? list[list.length - 1] : null;
}
function summaryById(id) { return (S.summaries || []).find((s) => s.id === id) || null; }

/* 节点收件人：负责人 + 秘书（如有），去重保序 */
function nodeRecipients(pool) {
  if (!pool) return [];
  return [...new Set((pool.ownerIds || []).concat(pool.secretaryIds || []))];
}
function nodeOwnerNames(pool) { return (pool.ownerIds || []).map(userName); }
function nodeSecretaryNames(pool) { return (pool.secretaryIds || []).map(userName); }

/* 分发目标的收件人与抄送人（链路建好即为静态名单，便于可见性判定） */
function recipientsOf(l) { return l.recipientIds || (l.handlerId ? [l.handlerId] : []); }
function ccOf(l) { return l.ccIds || []; }

/* 某池所属业务池（沿 parentId 上溯到顶层业务池）的负责人。
 * 指定落实人时抄送这批人，落实人本人由调用方过滤。 */
function bizOwnersOf(poolId) {
  let cur = poolById(poolId);
  while (cur && cur.parentId) cur = poolById(cur.parentId);
  return cur ? (cur.ownerIds || []) : [];
}

/* ---------- 部门员工组织架构（org.js，69 部门 / 1294 人） ----------
 * 分发选人的底库：处理人分发时按这里列出的真实部门与员工选择目标。 */
function orgDepts() { return ORG_DEPTS; }
function orgDeptById(id) { return ORG_DEPTS_BY_ID[id] || null; }
function orgDeptIdOfUser(uid) { return ORG_DEPTID_BY_USER[uid] || ''; }
function orgDeptUserIds(deptId) {
  const d = orgDeptById(deptId);
  return d ? d.userIds : [];
}
/* 按姓名/部门检索公司人员 */
function orgSearchUsers(kw, limit) {
  const k = (kw || '').trim().toLowerCase();
  if (!k) return [];
  const hit = [];
  for (let i = 0; i < ORG_USERS.length && hit.length < (limit || 60); i++) {
    const u = ORG_USERS[i];
    if ((u.name || '').toLowerCase().includes(k) || (u.dept || '').toLowerCase().includes(k)) hit.push(u);
  }
  return hit;
}

/* 8 个业务池的展示顺序（统一驱动池管理树 / 填报目标池 chip / 池筛选 / 分发弹窗） */
const BIZ_POOL_ORDER = ['p_retail', 'p_industry', 'p_inst', 'p_buy', 'p_wealth', 'p_intl', 'p_midback', 'p_other'];
function poolTree() {
  const nodes = S.pools.map((p) => ({ pool: p, children: [] }));
  const byId = {};
  nodes.forEach((n) => { byId[n.pool.id] = n; });
  const roots = [];
  nodes.forEach((n) => {
    if (n.pool.parentId && byId[n.pool.parentId]) byId[n.pool.parentId].children.push(n);
    else roots.push(n);
  });
  const idx = (id) => { const i = BIZ_POOL_ORDER.indexOf(id); return i < 0 ? BIZ_POOL_ORDER.length : i; };
  nodes.forEach((n) => { if (n.children.length > 1) n.children.sort((a, b) => idx(a.pool.id) - idx(b.pool.id)); });
  roots.sort((a, b) => idx(a.pool.id) - idx(b.pool.id));
  return roots;
}
/* 同一父池下的子池按统一顺序排序，供池管理树等直接遍历 S.pools 的场景复用 */
function sortPoolsByPoolOrder(list) {
  const rank = (id) => {
    const p = (S.pools || []).find((x) => x.id === id);
    if (p && p.type === 'biz') { const i = BIZ_POOL_ORDER.indexOf(id); return i < 0 ? BIZ_POOL_ORDER.length : i; }
    const biz = (function walk(cur) { if (!cur) return null; if (cur.type === 'biz') return cur; return walk(cur.parentId ? poolById(cur.parentId) : null); })(poolById(id));
    const i = biz ? BIZ_POOL_ORDER.indexOf(biz.id) : BIZ_POOL_ORDER.length;
    return i < 0 ? BIZ_POOL_ORDER.length : i;
  };
  return (list || []).slice().sort((a, b) => rank(a.id) - rank(b.id));
}
/* 按 poolTree 深度优先展平为有序池列表（8 个业务池→各自部门/小组池），供平铺下拉复用 */
function orderedPoolsFlat() {
  const out = [];
  (function walk(nodes) {
    (nodes || []).forEach((n) => { out.push(n.pool); walk(n.children); });
  })(poolTree());
  return out;
}
/* 顶层业务池（填报入口） */
function bizPools() {
  return sortPoolsByPoolOrder(S.pools.filter((p) => p.type === 'biz' && p.status !== 'DELETED'));
}

/* 链路是否仍在办理（未办结/未流转走） */
function linkActive(l) { return ['pending', 'processing', 'replied'].includes(l.status); }

/* 最终处理链路列表 */
function finalLinksOf(msgId) { return linksOf(msgId).filter((l) => l.isFinal); }

/* 链路的落实人（第一收件人，兼容旧展示逻辑） */
function handlerOfLink(l) {
  const ids = recipientsOf(l);
  return ids.length ? ids[0] : null;
}

/* ---------- 通知（Mock 企业微信） ----------
 * 扩展点：正式环境替换为企业微信「应用消息」发送接口 */
function sendWeComNotification(userIds, content, messageId, type, actorId) {
  const uniqIds = [...new Set((userIds || []).filter(Boolean))];
  uniqIds.forEach((to) => {
    S.notifications.push({
      id: 'n_' + Math.random().toString(36).slice(2, 9),
      at: Date.now(), to, messageId: messageId || null,
      content, type: type || 'system', actorId: actorId || null,
      channel: '企业微信', status: '模拟发送'
    });
  });
}

/* ---------- 日志 ---------- */
function addLog(messageId, actorId, action, extra) {
  S.logs.push(Object.assign({
    id: 'lg_' + Math.random().toString(36).slice(2, 9),
    messageId, at: Date.now(), actorId: actorId || null, action
  }, extra || {}));
}

/* ---------- 动作：消息业务标签 ---------- */
function toggleMessageTag(msgId, tag) {
  const m = findMsg(msgId);
  if (!m) return { ok: false, msg: '消息不存在' };
  m.tags = Array.isArray(m.tags) ? m.tags : [];
  const i = m.tags.indexOf(tag);
  if (i > -1) m.tags.splice(i, 1); else m.tags.push(tag);
  m.updatedAt = Date.now();
  addLog(m.id, curUser().id, 'tagged', { note: (i > -1 ? '取消标签：' : '添加标签：') + tag });
  saveState();
  return { ok: true, active: i === -1 };
}

/* ---------- 状态机 ----------
 * 未分发 → 待分发；有在办链路 → 处理中；链路全部办结且尚未汇总 → 待汇总；
 * 李倩影发布汇总后 → 已完成。 */
function recomputeStatus(m) {
  if (m.status === 'closed' || m.status === 'cancelled') return;
  const links = linksOf(m.id);
  const from = m.status;
  if (links.some(linkActive)) {
    m.status = 'handling';
  } else if (latestSummary(m.id)) {
    m.status = 'closed';
    m.closedAt = Date.now();
  } else if (!links.length) {
    m.status = 'dispatch';
  } else {
    m.status = 'summarize';
  }
  if (m.status === from) return;
  addLog(m.id, null, 'auto', {
    from, to: m.status,
    note: m.status === 'summarize' ? '所有处理人已回复完成，等待倩影汇总回复'
      : m.status === 'closed' ? '汇总回复已发布，消息完成'
      : '状态变更为「' + (MSG_STATUS[m.status] || m.status) + '」'
  });
  if (m.status === 'summarize') {
    sendWeComNotification(dispatcherIds(), m.no + ' 全部处理人已回复完成，请您统一汇总回复', m.id, 'summary', null);
  }
  if (m.status === 'closed') {
    sendWeComNotification(participantIds(m), m.no + ' 已由李倩影汇总回复，消息完成', m.id, 'summary', null);
  }
}

/* 消息参与人：提出人 + 全部分发收件人 + 抄送人 + 分发操作人 */
function participantIds(m) {
  const ids = [m.createdBy];
  linksOf(m.id).forEach((l) => {
    ids.push.apply(ids, recipientsOf(l));
    ids.push.apply(ids, ccOf(l));
    if (l.dispatchedBy) ids.push(l.dispatchedBy);
  });
  return [...new Set(ids.filter(Boolean))];
}
function dispatcherIds() {
  return USERS.filter((u) => u.role === 'dispatcher' || u.id === 'u_qy').map((u) => u.id);
}

/* ---------- 动作：新建消息（投递到 8 个业务池之一：进池即直投该池负责人+秘书，李倩影同步跟进） ---------- */
function createMessage(data) {
  const me = curUser();
  const seq = ++S.seq;
  const now = Date.now();
  const targetPool = poolById(data.poolId);
  if (!targetPool || targetPool.type !== 'biz') {
    return { ok: false, msg: '请选择 8 个业务池之一作为投递池' };
  }
  const excerpt = (data.content || '').replace(/\s+/g, ' ').slice(0, 18);
  const title = data.customerName || excerpt || '未命名消息';
  const m = {
    id: 'm_' + Math.random().toString(36).slice(2, 9),
    seq, no: 'M-' + String(seq).padStart(4, '0'),
    title, content: data.content, attachments: data.attachments || [],
    sources: data.sources || [], customerName: data.customerName || '', sourceOther: data.sourceOther || '',
    createdBy: me.id, sourcePoolId: targetPool.id,
    status: 'dispatch',
    createdAt: now, updatedAt: now
  };
  S.messages.unshift(m);
  addLog(m.id, me.id, 'created', { note: '创建消息，投递到' + targetPool.name + '池' });
  /* 直投：进池即挂一条节点链路给业务池负责人+秘书，无需等李倩影分发；她仍可继续向下分发 */
  const handlers = nodeRecipients(targetPool);
  if (handlers.length) {
    S.links.push({
      id: 'lk_' + Math.random().toString(36).slice(2, 9),
      messageId: m.id, poolId: targetPool.id, poolType: targetPool.type, mode: 'node',
      parentLinkId: null, parentPoolId: targetPool.id,
      recipientIds: handlers, ccIds: [], status: 'pending', isFinal: true,
      dispatchedBy: me.id, dispatchedAt: now, note: ''
    });
    addLog(m.id, me.id, 'directed', { note: '直投到 ' + targetLabel(targetPool, { mode: 'node', recipientIds: handlers }) });
    sendWeComNotification(handlers,
      me.name + ' 提交的消息 ' + m.no + '《' + m.title + '》已直投到 ' + targetPool.name + '池，请你处理', m.id, 'assign', me.id);
  }
  const qyIds = dispatcherIds().filter((id) => handlers.indexOf(id) === -1);
  if (qyIds.length) {
    sendWeComNotification(qyIds,
      me.name + ' 提交的新消息 ' + m.no + '《' + m.title + '》已直投到 ' + targetPool.name + '池（' +
        handlers.map(userName).join('、') + '），请跟进，必要时继续分发', m.id, 'assign', me.id);
  }
  recomputeStatus(m);
  saveState();
  return m;
}

/* 投递目标归一：
 *   {poolId, mode:'node'}                       → 该节点负责人 + 秘书同时收到
 *   {poolId, mode:'person', handlerId:uid[]}     → 指定落实人，抄送其所属业务池负责人
 *   {poolId, mode:'people', recipientIds:uid[]}  → 一组人（如整个部门）落在同一条链路，同样抄送业务池负责人 */
function normalizeTargets(list) {
  const out = [];
  (list || []).forEach((t) => {
    const pool = poolById(t.poolId);
    if (!pool) return;
    const mode = t.mode || t.assignMode || (t.handlerId ? 'person' : 'node');
    if (mode === 'people') {
      const ids = [...new Set((t.recipientIds || []).filter(Boolean))];
      if (!ids.length) return;
      const cc = (t.ccIds || bizOwnersOf(pool.id)).filter((id) => ids.indexOf(id) === -1);
      out.push({ poolId: pool.id, mode: 'people', recipientIds: ids, ccIds: [...new Set(cc)] });
      return;
    }
    if (mode === 'person') {
      const ids = Array.isArray(t.handlerId) ? t.handlerId.filter(Boolean) : (t.handlerId ? [t.handlerId] : []);
      if (!ids.length) return;
      ids.forEach((uid) => {
        const cc = (t.ccIds || bizOwnersOf(pool.id)).filter((id) => id !== uid);
        out.push({ poolId: pool.id, mode: 'person', recipientIds: [uid], ccIds: [...new Set(cc)] });
      });
    } else {
      const ids = (t.recipientIds || nodeRecipients(pool)).filter(Boolean);
      if (!ids.length) return;
      out.push({ poolId: pool.id, mode: 'node', recipientIds: [...new Set(ids)], ccIds: [] });
    }
  });
  return out;
}

/* 目标描述文案：节点写明负责人+秘书，个人/一组人写明抄送的业务池负责人 */
function targetLabel(pool, t) {
  const names = (t.recipientIds || []).map(userName);
  if (t.mode === 'person' || t.mode === 'people') {
    const cc = (t.ccIds || []).map(userName);
    const who = names.length > 4
      ? names.slice(0, 3).join('、') + ' 等 ' + names.length + ' 人'
      : names.join('、');
    return who + (cc.length ? '（抄送业务池负责人 ' + cc.join('、') + '）' : '');
  }
  const owner = nodeOwnerNames(pool).join('、');
  const sec = nodeSecretaryNames(pool).join('、');
  const who = (owner ? '负责人 ' + owner : '') + (sec ? (owner ? '、' : '') + '秘书 ' + sec : '');
  return pool.name + (who ? '（' + who + '）' : '');
}

function notifyTargets(pool, t) {
  return (t.recipientIds || []).concat(t.ccIds || []);
}

/* ---------- 动作：分发（总池分发人按池树分发；在办处理人按部门员工组织架构分发） ---------- */
function dispatchMessage(msgId, targets, note) {
  const me = curUser();
  const m = findMsg(msgId);
  if (!m) return { ok: false, msg: '消息不存在' };
  if (!canDispatch(me, m)) return { ok: false, msg: '只有总池分发人与在办处理人可以分发' };
  const now = Date.now();
  const list = normalizeTargets(targets);
  const added = [];
  list.forEach((t) => {
    const pool = poolById(t.poolId);
    if (!pool || hasLinkForTarget(msgId, t)) return;
    S.links.push({
      id: 'lk_' + Math.random().toString(36).slice(2, 9),
      messageId: msgId, poolId: pool.id, poolType: pool.type, mode: t.mode,
      parentLinkId: null, parentPoolId: m.sourcePoolId,
      recipientIds: t.recipientIds, ccIds: t.ccIds || [],
      status: 'pending', isFinal: true,
      dispatchedBy: me.id, dispatchedAt: now, note: note || ''
    });
    added.push({ pool: pool, t: t });
  });
  if (!added.length) return { ok: false, msg: '所选目标均已在处理列表中' };
  m.updatedAt = now;
  addLog(m.id, me.id, 'dispatched', {
    note: '分发到 ' + added.map((x) => targetLabel(x.pool, x.t)).join('；') + (note ? '：' + note : '')
  });
  added.forEach((x) => {
    sendWeComNotification(x.t.recipientIds,
      me.name + ' 将消息 ' + m.no + '《' + m.title + '》分发到 ' + poolName(x.pool.id) + '，请你处理', m.id, 'assign', me.id);
    if ((x.t.ccIds || []).length) {
      sendWeComNotification(x.t.ccIds,
        me.name + ' 将消息 ' + m.no + '《' + m.title + '》分发给 ' + x.t.recipientIds.map(userName).join('、') + '，抄送你知悉', m.id, 'cc', me.id);
    }
  });
  sendWeComNotification([m.createdBy], '您的消息 ' + m.no + ' 已分发到 ' + dispatchBrief(added), m.id, null, me.id);
  recomputeStatus(m);
  saveState();
  return { ok: true, count: added.length };
}

/* 分发去向摘要（给提出人看的：只到池/人，不含处理人中间回复） */
function dispatchBrief(added) {
  return added.map((x) => {
    const people = x.t.mode === 'person' || x.t.mode === 'people';
    if (!people) return poolName(x.pool.id);
    const names = x.t.recipientIds.map(userName);
    const who = names.length > 4 ? names.slice(0, 3).join('、') + ' 等 ' + names.length + ' 人' : names.join('、');
    return poolName(x.pool.id) + '（' + who + '）';
  }).join('、');
}

/* ---------- 动作：向下流转（仍由总池分发人执行，范围＝该节点子树） ---------- */
function forwardMessage(msgId, fromLinkId, targets, note) {
  const me = curUser();
  const m = findMsg(msgId);
  const fromLink = linkById(fromLinkId);
  if (!m || !fromLink) return { ok: false, msg: '记录不存在' };
  if (!linkActive(fromLink)) return { ok: false, msg: '该节点已办结或已流转' };
  const fromPool = poolById(fromLink.poolId);
  const subtree = getPoolSubtree(fromPool.id).map((p) => p.id);
  const list = normalizeTargets(targets).filter((t) => t.poolId !== fromPool.id && subtree.indexOf(t.poolId) > -1);
  const now = Date.now();
  const added = [];
  list.forEach((t) => {
    const pool = poolById(t.poolId);
    if (!pool || hasLinkForTarget(msgId, t)) return;
    S.links.push({
      id: 'lk_' + Math.random().toString(36).slice(2, 9),
      messageId: msgId, poolId: pool.id, poolType: pool.type, mode: t.mode,
      parentLinkId: fromLink.id, parentPoolId: fromPool.id,
      recipientIds: t.recipientIds, ccIds: t.ccIds || [],
      status: 'pending', isFinal: true,
      dispatchedBy: me.id, dispatchedAt: now, note: note || ''
    });
    added.push({ pool: pool, t: t });
  });
  if (!added.length) return { ok: false, msg: '所选下级节点均已在处理列表中' };
  fromLink.status = 'forwarded';
  fromLink.isFinal = false;
  m.updatedAt = now;
  addLog(m.id, me.id, 'forwarded', {
    poolId: fromPool.id,
    note: '从 ' + fromPool.name + ' 流转到 ' + added.map((x) => targetLabel(x.pool, x.t)).join('；') + (note ? '：' + note : '')
  });
  added.forEach((x) => {
    sendWeComNotification(x.t.recipientIds,
      me.name + ' 将消息 ' + m.no + '《' + m.title + '》流转到 ' + poolName(x.pool.id) + '，请你落实', m.id, 'assign', me.id);
    if ((x.t.ccIds || []).length) {
      sendWeComNotification(x.t.ccIds,
        me.name + ' 将消息 ' + m.no + ' 流转到 ' + x.t.recipientIds.map(userName).join('、') + '，抄送你知悉', m.id, 'cc', me.id);
    }
  });
  sendWeComNotification([m.createdBy], '您的消息 ' + m.no + ' 已流转到 ' + dispatchBrief(added), m.id);
  recomputeStatus(m);
  saveState();
  return { ok: true, count: added.length };
}

/* ---------- 动作：倩影汇总回复（发布 / 再编辑，最新一条为有效汇总） ---------- */
function canManageSummary(u) { return isDispatcher(u) || isAdmin(u); }

function publishSummary(msgId, content) {
  const me = curUser();
  const m = findMsg(msgId);
  if (!m) return { ok: false, msg: '消息不存在' };
  if (!canManageSummary(me)) return { ok: false, msg: '仅总池分发人可发布汇总回复' };
  if (m.status === 'cancelled') return { ok: false, msg: '消息已取消' };
  const text = (content || '').trim();
  if (!text) return { ok: false, msg: '请填写汇总回复内容' };
  const now = Date.now();
  const s = {
    id: 'sm_' + Math.random().toString(36).slice(2, 9),
    messageId: msgId, authorId: me.id, content: text,
    at: now, updatedAt: now, edits: 0
  };
  S.summaries.push(s);
  m.updatedAt = now;
  addLog(m.id, me.id, 'summary', { note: '发布汇总回复：' + text.slice(0, 40) });
  /* 发布汇总回复即给出最终结论：在办链路统一置为已办结，消息自动标为已解决 */
  linksOf(msgId).filter((link) => linkActive(link) && link.isFinal).forEach((link) => {
    link.status = 'resolved';
    link.resolvedAt = now;
  });
  recomputeStatus(m);
  saveState();
  return { ok: true, summary: s };
}

function editSummary(summaryId, content) {
  const me = curUser();
  const s = summaryById(summaryId);
  if (!s) return { ok: false, msg: '汇总回复不存在' };
  if (!canManageSummary(me)) return { ok: false, msg: '仅总池分发人可修改汇总回复' };
  const text = (content || '').trim();
  if (!text) return { ok: false, msg: '请填写汇总回复内容' };
  s.content = text;
  s.updatedAt = Date.now();
  s.edits = (s.edits || 0) + 1;
  const m = findMsg(s.messageId);
  if (m) {
    m.updatedAt = Date.now();
    addLog(m.id, me.id, 'summary_edit', { note: '修改汇总回复' });
    sendWeComNotification(participantIds(m).filter((id) => id !== me.id),
      me.name + ' 修改了 ' + m.no + ' 的汇总回复', m.id, 'summary', me.id);
  }
  saveState();
  return { ok: true, summary: s };
}

/* ---------- 动作：分池回复 / 评论嵌套回复（parentReplyId 为空 = 一级评论） ---------- */
function myLinkInPool(msgId, uid, poolId) {
  const list = linksOf(msgId).filter((l) => l.poolId === poolId && recipientsOf(l).indexOf(uid) > -1);
  return list.find(linkActive) || list[0] || linkOf(msgId, poolId) || null;
}

function addReply(msgId, poolId, content, attachments, parentReplyId) {
  const me = curUser();
  const m = findMsg(msgId);
  if (!m) return { ok: false, msg: '消息不存在' };
  if (!canSeeMessage(me, m)) return { ok: false, msg: '无权评论该消息' };
  if (repliesOf(msgId).length > 0) {
    return { ok: false, msg: '已有人回复，无法再新增回复，请直接编辑回复' };
  }
  const link = myLinkInPool(msgId, me.id, poolId);
  const parent = parentReplyId ? S.replies.find((x) => x.id === parentReplyId) : null;
  const r = {
    id: 'rp_' + Math.random().toString(36).slice(2, 9),
    messageId: msgId, poolId, linkId: link ? link.id : null, authorId: me.id,
    parentReplyId: parent ? parent.id : null,
    content, attachments: attachments || [], at: Date.now(),
    likeCount: 0, likedByUserIds: []
  };
  S.replies.push(r);
  if (link && (link.status === 'pending' || link.status === 'processing')) link.status = 'replied';
  addLog(m.id, me.id, 'reply', { poolId, note: content });
  m.updatedAt = Date.now();
  const notify = [m.createdBy].concat(link ? recipientsOf(link) : [], parent ? [parent.authorId] : [])
    .filter((id) => id && id !== me.id);
  sendWeComNotification(notify, me.name + ' 回复了 ' + m.no + '《' + m.title + '》', m.id, 'reply', me.id);
  saveState();
  return { ok: true };
}

/* ---------- 动作：编辑回复（被指派人和李倩影共编同一条回复，流转日志记录谁编辑回复） ---------- */
function editReply(msgId, replyId, content) {
  const me = curUser();
  const m = findMsg(msgId);
  const r = S.replies.find((x) => x.id === replyId);
  if (!m || !r) return { ok: false, msg: '回复不存在' };
  const text = (content || '').trim();
  if (!text) return { ok: false, msg: '请输入回复内容' };
  r.content = text;
  r.updatedAt = Date.now();
  r.lastEditorId = me.id;
  m.updatedAt = Date.now();
  addLog(m.id, me.id, 'reply_edit', {
    replyId: r.id,
    poolId: r.poolId,
    note: text
  });
  saveState();
  return { ok: true, reply: r };
}

/* ---------- 动作：分享（轻量抄送）——被分享人可查看并回复，但不建链路、不进待办、不承担确认义务 ---------- */
function shareMessage(msgId, userIds) {
  const me = curUser();
  const m = findMsg(msgId);
  if (!m) return { ok: false, msg: '消息不存在' };
  if (!canShareMessage(me, m)) return { ok: false, msg: '当前身份无权分享' };
  const ids = [...new Set((userIds || []).filter(Boolean))].filter((id) => id !== me.id);
  if (!ids.length) return { ok: false, msg: '请选择要分享的人员' };
  m.sharedUserIds = [...new Set((m.sharedUserIds || []).concat(ids))];
  m.updatedAt = Date.now();
  addLog(m.id, me.id, 'shared', { note: '分享给 ' + ids.map(userName).join('、'), sharedUserIds: ids.slice() });
  sendWeComNotification(ids, userName(me.id) + ' 与你分享了 ' + m.no + '：' + m.title, m.id, 'share', me.id);
  saveState();
  return { ok: true, count: ids.length };
}

/* ---------- 动作：回复点赞（通知原回复作者） ---------- */
function toggleReplyLike(replyId, userId) {
  const r = S.replies.find((x) => x.id === replyId);
  if (!r) return;
  r.likedByUserIds = r.likedByUserIds || [];
  r.likeCount = r.likeCount || 0;
  const i = r.likedByUserIds.indexOf(userId);
  if (i > -1) {
    r.likedByUserIds.splice(i, 1);
    r.likeCount = Math.max(0, r.likeCount - 1);
  } else {
    r.likedByUserIds.push(userId);
    r.likeCount++;
    if (r.authorId !== userId) {
      const m = findMsg(r.messageId);
      if (m) sendWeComNotification([r.authorId], userName(userId) + ' 赞同了你在 ' + m.no + ' 下的回复', m.id, 'like', userId);
    }
  }
  saveState();
}

/* ---------- 动作：消息点赞（通知提出人） ---------- */
function toggleMsgLike(msgId, userId) {
  const m = findMsg(msgId);
  if (!m) return;
  m.likedByUserIds = m.likedByUserIds || [];
  m.likeCount = m.likeCount || 0;
  const i = m.likedByUserIds.indexOf(userId);
  if (i > -1) {
    m.likedByUserIds.splice(i, 1);
    m.likeCount = Math.max(0, m.likeCount - 1);
  } else {
    m.likedByUserIds.push(userId);
    m.likeCount++;
    if (m.createdBy !== userId) {
      sendWeComNotification([m.createdBy], userName(userId) + ' 赞同了你发布的 ' + m.no, m.id, 'like', userId);
    }
  }
  saveState();
}

/* ---------- 动作：标记整条信息已解决（李倩影与发起人本人） ---------- */
/* 李倩影手动标已解决的前置：所有最终链路的处理人都已回复，且她已发布过汇总 */
function allHandlersReplied(m) {
  const finals = finalLinksOf(m.id);
  if (!finals.length) return false;
  return !finals.some((l) => l.status === 'pending' || l.status === 'processing');
}

function resolveMessage(msgId) {
  const me = curUser();
  const m = findMsg(msgId);
  if (!m) return { ok: false, msg: '消息不存在' };
  if (!canResolveMessage(me, m)) return { ok: false, msg: '只有李倩影或发起人本人可以标记已解决' };
  if (isDispatcher(me) || isAdmin(me)) {
    if (!allHandlersReplied(m)) return { ok: false, msg: '还有处理人未回复，暂不能标记已解决' };
  }
  const now = Date.now();
  linksOf(msgId).filter((link) => linkActive(link) && link.isFinal).forEach((link) => {
    link.status = 'resolved';
    link.resolvedAt = now;
  });
  m.status = 'closed';
  m.closedAt = now;
  m.updatedAt = now;
  addLog(m.id, me.id, 'closed', { note: me.name + '标记信息为已解决' });
  sendWeComNotification(participantIds(m).concat(dispatcherIds()),
    m.no + ' 已由' + me.name + '标记为已解决', m.id);
  saveState();
  return { ok: true };
}

/* 把已解决的消息标回未解决：链路重新进入处理中（李倩影与发起人本人） */
function reopenMessage(msgId) {
  const me = curUser();
  const m = findMsg(msgId);
  if (!m) return { ok: false, msg: '消息不存在' };
  if (!canReopenMessage(me, m)) return { ok: false, msg: '只有李倩影或发起人可以把已解决的消息标为未解决' };
  if (m.status !== 'closed') return { ok: false, msg: '消息尚未标记已解决' };
  const now = Date.now();
  linksOf(msgId).filter((link) => link.isFinal).forEach((link) => {
    link.status = 'processing';
    delete link.resolvedAt;
  });
  delete m.closedAt;
  m.status = linksOf(msgId).length ? 'handling' : 'dispatch';
  m.updatedAt = now;
  addLog(m.id, me.id, 'reopened', { note: me.name + '标记信息为未解决，重新进入处理' });
  sendWeComNotification(participantIds(m), m.no + ' 已由' + me.name + '标记未解决，请相关处理人继续跟进', m.id, 'assign', me.id);
  saveState();
  return { ok: true };
}

/* 提交人确认标签：只在流程「已解决」后可操作，且不改变流程状态——
 * 状态机的开关仍由李倩影的打标与汇总回复决定。 */
function recordResolveMark(msgId, mark) {
  const me = curUser();
  const m = findMsg(msgId);
  if (!m) return { ok: false, msg: '消息不存在' };
  if (mark !== '已解决' && mark !== '未解决') return { ok: false, msg: '标记只能为已解决或未解决' };
  if (m.status !== 'closed') return { ok: false, msg: '流程尚未结束，待李倩影标记已解决后再确认' };
  if (m.resolveMark === mark) return { ok: false, msg: '当前记录已是' + mark };
  m.resolveMark = mark;
  m.resolveMarkAt = Date.now();
  m.updatedAt = m.resolveMarkAt;
  addLog(m.id, me.id, 'resolve_mark', { note: me.name + '标记信息为「' + mark + '」（仅作记录，不影响流转）' });
  saveState();
  return { ok: true, msg: '已记录为' + mark };
}

/* ---------- 动作：取消消息（提出人） ---------- */
function cancelMessage(msgId) {
  const me = curUser();
  const m = findMsg(msgId);
  if (!m || m.createdBy !== me.id) return { ok: false, msg: '仅提出人可取消' };
  if (m.status === 'closed' || m.status === 'cancelled') return { ok: false, msg: '消息已终结' };
  m.status = 'cancelled';
  m.updatedAt = Date.now();
  addLog(m.id, me.id, 'cancelled', { note: '提出人取消消息' });
  sendWeComNotification(participantIds(m).concat(dispatcherIds()), m.no + ' 已由提出人取消', m.id);
  saveState();
  return { ok: true };
}

/* ---------- 动作：池申请 / 审批 ---------- */
function applyPool(data) {
  const me = curUser();
  const app = {
    id: 'pa_' + Math.random().toString(36).slice(2, 9),
    at: Date.now(), poolName: data.poolName, poolType: data.poolType,
    parentId: data.parentId, reason: data.reason || '',
    applicantId: me.id, status: 'pending', reviewBy: null, reviewAt: null
  };
  S.poolApps.unshift(app);
  dispatcherIds().forEach((a) => {
    sendWeComNotification([a], me.name + ' 申请新建' + POOL_TYPES[app.poolType] + '「' + app.poolName + '」（上级：' + poolName(app.parentId) + '）', null);
  });
  saveState();
  return app;
}

function reviewPoolApp(appId, pass) {
  const me = curUser();
  const app = S.poolApps.find((a) => a.id === appId);
  if (!app || app.status !== 'pending') return { ok: false, msg: '申请不存在或已处理' };
  app.status = pass ? 'approved' : 'rejected';
  app.reviewBy = me.id;
  app.reviewAt = Date.now();
  if (pass) {
    const parent = poolById(app.parentId);
    S.pools.push({
      id: 'p_' + Math.random().toString(36).slice(2, 9),
      name: app.poolName, type: app.poolType, parentId: app.parentId,
      level: parent ? (parent.level != null ? parent.level + 1 : 1) : 0,
      timeoutDays: 2, allowDirect: false, autoAssign: false, status: 'ACTIVE',
      ownerIds: [app.applicantId], secretaryIds: [], memberIds: [app.applicantId]
    });
  }
  sendWeComNotification([app.applicantId], '您的池申请「' + app.poolName + '」' + (pass ? '已通过，池已创建' : '被驳回'), null);
  saveState();
  return { ok: true };
}

/* ---------- 池统计与消息检索 ---------- */
function isMessageOverdue(m) {
  if (!m || m.status === 'closed' || m.status === 'cancelled') return false;
  if (m.overdue) return true;
  // 超过48小时未完成判定为超时
  return (Date.now() - m.createdAt) > 48 * 3600e3;
}

function poolMessages(poolId, includeSub = true) {
  if (!S || !S.messages) return [];
  const targetPoolIds = includeSub
    ? getPoolSubtree(poolId).map((p) => p.id)
    : [poolId];
  const targetSet = new Set(targetPoolIds);

  return S.messages.filter((m) => {
    if (m.sourcePoolId && targetSet.has(m.sourcePoolId)) return true;
    const links = linksOf(m.id);
    return links.some((l) => targetSet.has(l.poolId));
  });
}

function poolMetrics(poolId, includeSub = true) {
  const msgs = poolMessages(poolId, includeSub);
  const targetPoolIds = includeSub ? getPoolSubtree(poolId).map((p) => p.id) : [poolId];
  const targetSet = new Set(targetPoolIds);

  let todo = 0;
  let processing = 0;
  let summarize = 0;
  let closed = 0;
  let overdue = 0;

  msgs.forEach((m) => {
    if (m.status === 'closed') {
      closed++;
    } else if (m.status === 'summarize') {
      summarize++;
    } else {
      const activeLinks = linksOf(m.id).filter((l) => targetSet.has(l.poolId) && linkActive(l));
      if (activeLinks.some((l) => l.status === 'processing' || l.status === 'replied')) {
        processing++;
      } else {
        todo++;
      }
    }
    if (isMessageOverdue(m)) {
      overdue++;
    }
  });

  return {
    total: msgs.length,
    todo,
    processing,
    summarize,
    closed,
    overdue,
    hasOverdue: overdue > 0,
    avgResponseDays: '1.6天'
  };
}

function getPoolRecentLogs(poolId, limit = 5) {
  const msgs = poolMessages(poolId, true);
  const msgIds = new Set(msgs.map((m) => m.id));
  return (S.logs || [])
    .filter((l) => msgIds.has(l.messageId))
    .sort((a, b) => b.at - a.at)
    .slice(0, limit);
}

/* ---------- 动作：池管理相关 ---------- */
function createPool(data) {
  const me = curUser();
  const parent = poolById(data.parentId);
  if (!parent || !canCreateSubPool(me, parent)) {
    return { ok: false, msg: '只能在部门池下新建小组池' };
  }
  const level = (parent.level != null ? parent.level : 0) + 1;
  const poolType = level === 1 ? 'dept' : 'group';

  // 支持多位负责人
  let ownerIds = [];
  if (Array.isArray(data.ownerIds)) {
    ownerIds = [...new Set(data.ownerIds.filter(Boolean))];
  } else if (data.ownerId) {
    ownerIds = [data.ownerId];
  }
  const secretaryIds = Array.isArray(data.secretaryIds)
    ? [...new Set(data.secretaryIds.filter(Boolean))] : [];

  let memberIds = Array.isArray(data.memberIds) ? [...data.memberIds] : [];
  ownerIds.concat(secretaryIds).forEach((oid) => {
    if (!memberIds.includes(oid)) memberIds.push(oid);
  });

  const newPool = {
    id: 'p_' + Math.random().toString(36).slice(2, 9),
    name: (data.name || '').trim(),
    type: poolType,
    level,
    parentId: data.parentId || null,
    ownerIds,
    secretaryIds,
    memberIds,
    timeoutDays: Number(data.timeoutDays) || 2,
    allowDirect: !!data.allowDirect,
    autoAssign: !!data.autoAssign,
    status: 'ACTIVE'
  };
  S.pools.push(newPool);
  saveState();
  return { ok: true, pool: newPool };
}

function updatePool(poolId, patch) {
  const p = poolById(poolId);
  if (!p) return { ok: false, msg: '池不存在' };
  if (patch.name != null) p.name = patch.name.trim();

  // 支持设置多位负责人
  if (patch.ownerIds !== undefined) {
    p.ownerIds = Array.isArray(patch.ownerIds) ? [...new Set(patch.ownerIds.filter(Boolean))] : (patch.ownerIds ? [patch.ownerIds] : []);
    p.ownerIds.forEach((oid) => {
      if (!p.memberIds.includes(oid)) p.memberIds.push(oid);
    });
  } else if (patch.ownerId !== undefined) {
    p.ownerIds = patch.ownerId ? [patch.ownerId] : [];
    if (patch.ownerId && !p.memberIds.includes(patch.ownerId)) {
      p.memberIds.push(patch.ownerId);
    }
  }

  if (patch.timeoutDays != null) p.timeoutDays = Number(patch.timeoutDays) || 2;
  if (patch.secretaryIds !== undefined) {
    p.secretaryIds = Array.isArray(patch.secretaryIds)
      ? [...new Set(patch.secretaryIds.filter(Boolean))] : (patch.secretaryIds ? [patch.secretaryIds] : []);
    p.secretaryIds.forEach((sid) => {
      if (!p.memberIds.includes(sid)) p.memberIds.push(sid);
    });
  }
  if (patch.allowDirect != null) p.allowDirect = !!patch.allowDirect;
  if (patch.autoAssign != null) p.autoAssign = !!patch.autoAssign;
  if (patch.status != null) p.status = patch.status;
  saveState();
  return { ok: true, pool: p };
}

function disablePool(poolId) {
  const p = poolById(poolId);
  if (!p) return { ok: false, msg: '池不存在' };
  p.status = p.status === 'DISABLED' ? 'ACTIVE' : 'DISABLED';
  saveState();
  return { ok: true, status: p.status };
}

function setPoolOwners(poolId, ownerIds) {
  return updatePool(poolId, { ownerIds });
}

function setPoolOwner(poolId, ownerId) {
  return updatePool(poolId, { ownerId });
}

function addPoolOwner(poolId, userId) {
  const p = poolById(poolId);
  if (!p) return { ok: false, msg: '池不存在' };
  if (!p.ownerIds.includes(userId)) {
    p.ownerIds.push(userId);
  }
  if (!p.memberIds.includes(userId)) {
    p.memberIds.push(userId);
  }
  saveState();
  return { ok: true };
}

function removePoolOwner(poolId, userId) {
  const p = poolById(poolId);
  if (!p) return { ok: false, msg: '池不存在' };
  p.ownerIds = p.ownerIds.filter((id) => id !== userId);
  saveState();
  return { ok: true };
}

function addPoolMember(poolId, userId) {
  const p = poolById(poolId);
  if (!p) return { ok: false, msg: '池不存在' };
  if (!p.memberIds.includes(userId)) {
    p.memberIds.push(userId);
    saveState();
  }
  return { ok: true };
}

function addPoolMembers(poolId, userIds) {
  const p = poolById(poolId);
  if (!p) return { ok: false, msg: '池不存在', count: 0 };
  const before = p.memberIds.length;
  [...new Set((userIds || []).filter(Boolean))].forEach((userId) => {
    if (!p.memberIds.includes(userId)) p.memberIds.push(userId);
  });
  const count = p.memberIds.length - before;
  if (count) saveState();
  return { ok: true, count };
}

function removePoolMember(poolId, userId) {
  const p = poolById(poolId);
  if (!p) return { ok: false, msg: '池不存在' };
  p.memberIds = p.memberIds.filter((id) => id !== userId);
  if (p.ownerIds.includes(userId)) {
    p.ownerIds = p.ownerIds.filter((id) => id !== userId);
  }
  saveState();
  return { ok: true };
}

/* 催办操作 */
function urgeMessage(messageId, poolId) {
  const me = curUser();
  const m = findMsg(messageId);
  if (!m) return { ok: false, msg: '消息不存在' };
  const links = linksOf(messageId).filter((l) => !poolId || l.poolId === poolId);
  const to = [];
  links.filter(linkActive).forEach((l) => { to.push.apply(to, recipientsOf(l)); });
  sendWeComNotification(to, '【催办提醒】' + me.name + ' 对消息 ' + m.no + '《' + m.title + '》进行了催办，请尽快办理。', m.id);
  addLog(m.id, me.id, 'urge', { note: '催办消息，提醒处理人尽快办理' });
  saveState();
  return { ok: true };
}

/* 转派操作：把某条链路的收件人改为指定落实人，并抄送其所属业务池负责人 */
function transferMessage(messageId, fromPoolId, toPoolId, toUserId, note) {
  const me = curUser();
  const m = findMsg(messageId);
  if (!m) return { ok: false, msg: '消息不存在' };
  const targetPool = poolById(toPoolId);
  if (!targetPool) return { ok: false, msg: '目标池不存在' };
  const recipientIds = toUserId ? [toUserId] : nodeRecipients(targetPool);
  const ccIds = toUserId ? bizOwnersOf(toPoolId).filter((id) => id !== toUserId) : [];

  let link = linkOf(messageId, fromPoolId);
  if (link) {
    link.poolId = toPoolId;
    link.poolType = targetPool.type;
    link.mode = toUserId ? 'person' : 'node';
    link.recipientIds = recipientIds;
    link.ccIds = ccIds;
    link.status = 'pending';
  } else {
    link = {
      id: 'lk_' + Math.random().toString(36).slice(2, 9),
      messageId, poolId: toPoolId, poolType: targetPool.type,
      parentLinkId: null, parentPoolId: fromPoolId,
      status: 'pending', mode: toUserId ? 'person' : 'node',
      recipientIds, ccIds, isFinal: true,
      dispatchedBy: me.id, dispatchedAt: Date.now(), note: note || '转派'
    };
    S.links.push(link);
  }
  recomputeStatus(m);
  addLog(m.id, me.id, 'transfer', {
    note: '转派到 ' + targetPool.name + (toUserId ? '（' + userName(toUserId) + '）' : '') + (note ? '：' + note : '')
  });
  sendWeComNotification(recipientIds.concat(ccIds),
    me.name + '将消息 ' + m.no + '《' + m.title + '》转派到 ' + targetPool.name +
    (toUserId ? '（' + userName(toUserId) + '落实）' : ''), m.id, 'assign', me.id);
  saveState();
  return { ok: true };
}

/* 关注/取消关注 */
const FOLLOW_KEY = 'flow_followed_msgs';
function followKeyForUser() { return FOLLOW_KEY + '_' + curUser().id; }
function isFollowed(messageId) {
  try {
    const list = JSON.parse(localStorage.getItem(followKeyForUser()) || '[]');
    return list.includes(messageId);
  } catch (e) { return false; }
}
function toggleFollowMessage(messageId) {
  try {
    let list = JSON.parse(localStorage.getItem(followKeyForUser()) || '[]');
    let state = false;
    if (list.includes(messageId)) {
      list = list.filter((id) => id !== messageId);
      state = false;
    } else {
      list.push(messageId);
      state = true;
    }
    localStorage.setItem(followKeyForUser(), JSON.stringify(list));
    return { ok: true, followed: state };
  } catch (e) {
    return { ok: true, followed: true };
  }
}
