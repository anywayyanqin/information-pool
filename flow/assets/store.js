/* ==========================================================================
 * store.js — 状态存储与业务动作（状态机 / 日志 / 通知）
 * 扩展点：正式环境中本文件所有读写替换为后端 REST API；
 *         sendWeComNotification() 替换为企业微信应用消息 API。
 *
 * 术语约定：
 *   投递 = 新建消息时选择入口（公司总池 / 任意分管池）
 *   分发 = 公司总池 -> 分管池（仅总池分发人）
 *   流转 = 分管池 -> 部门池 -> 小组池
 *   落实人 = 最终处理池的当前处理人
 * ========================================================================== */

const LS_KEY = 'flow_state_v5';
let S = null;

/* ---------- 持久化 ---------- */
function loadState() {
  try { S = JSON.parse(localStorage.getItem(LS_KEY)); } catch (e) { S = null; }
  if (!S || S.v !== 5) {
    S = buildSeed();
    S.v = 5;
    saveState();
  }
  // 确保所有池对象的 ownerIds 和 memberIds 为有效数组
  if (S && Array.isArray(S.pools)) {
    S.pools.forEach((p) => {
      if (!Array.isArray(p.ownerIds)) {
        p.ownerIds = p.ownerId ? [p.ownerId] : [];
      }
      if (!Array.isArray(p.memberIds)) {
        p.memberIds = [...p.ownerIds];
      }
    });
  }
  if (S && Array.isArray(S.messages)) {
    S.messages.forEach((m) => { if (!Array.isArray(m.tags)) m.tags = []; });
  }
}
function saveState() { localStorage.setItem(LS_KEY, JSON.stringify(S)); }
function resetState() {
  localStorage.removeItem(LS_KEY);
  localStorage.removeItem('flow_state_v4');
  S = buildSeed();
  S.v = 5;
  saveState();
}

/* ---------- 查询 ---------- */
function userById(id) { return USERS.find((u) => u.id === id) || null; }
function userName(id) { const u = userById(id); return u ? u.name : '系统'; }
function poolById(id) { return S.pools.find((p) => p.id === id) || null; }
function poolName(id) { const p = poolById(id); return p ? p.name : id; }
function findMsg(id) { return S.messages.find((m) => m.id === id) || null; }
function linksOf(msgId) { return S.links.filter((l) => l.messageId === msgId); }
function linkOf(msgId, poolId) { return S.links.find((l) => l.messageId === msgId && l.poolId === poolId) || null; }
function linkById(linkId) { return S.links.find((l) => l.id === linkId) || null; }
function repliesOf(msgId, poolId) {
  return S.replies
    .filter((r) => r.messageId === msgId && (!poolId || r.poolId === poolId))
    .sort((a, b) => a.at - b.at);
}
function logsOf(msgId) { return S.logs.filter((l) => l.messageId === msgId).sort((a, b) => a.at - b.at); }
function childPools(poolId) { return S.pools.filter((p) => p.parentId === poolId); }

function poolTree() {
  const nodes = S.pools.map((p) => ({ pool: p, children: [] }));
  const byId = {};
  nodes.forEach((n) => { byId[n.pool.id] = n; });
  const roots = [];
  nodes.forEach((n) => {
    if (n.pool.parentId && byId[n.pool.parentId]) byId[n.pool.parentId].children.push(n);
    else roots.push(n);
  });
  return roots;
}

/* 链接是否仍在办理（未办结/未流转走） */
function linkActive(l) { return ['pending', 'processing', 'replied'].includes(l.status); }

/* 最终处理池链接列表 */
function finalLinksOf(msgId) { return linksOf(msgId).filter((l) => l.isFinal); }

/* 链接的落实人（最终处理人）：优先链接指定处理人，回退池负责人/首位成员 */
function handlerOfLink(l) {
  if (l.handlerId) return l.handlerId;
  const p = poolById(l.poolId);
  if (!p) return null;
  return p.ownerIds[0] || p.memberIds[0] || null;
}

/* ---------- 通知（Mock 企业微信） ----------
 * 扩展点：正式环境替换为企业微信「应用消息」发送接口 */
function sendWeComNotification(userIds, content, messageId) {
  const uniqIds = [...new Set((userIds || []).filter(Boolean))];
  uniqIds.forEach((to) => {
    S.notifications.push({
      id: 'n_' + Math.random().toString(36).slice(2, 9),
      at: Date.now(), to, messageId: messageId || null,
      content, channel: '企业微信', status: '模拟发送'
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
 * 有在办链接时：按最深层级显示 待分管池处理/待部门处理/待小组处理；
 * 全部办结后：看落实人确认 + 提出人确认。 */
function recomputeStatus(m) {
  if (m.status === 'closed' || m.status === 'cancelled') return;
  const links = linksOf(m.id);
  if (!links.length) { m.status = 'p_company'; return; }
  const from = m.status;
  const active = links.filter(linkActive);
  if (active.length) {
    if (active.some((l) => l.poolType === 'group')) m.status = 'p_group';
    else if (active.some((l) => l.poolType === 'dept')) m.status = 'p_dept';
    else m.status = 'p_exec';
  } else {
    const finals = links.filter((l) => l.isFinal);
    const anyUnresolved =
      finals.some((l) => l.handlerConfirm && l.handlerConfirm.state === 'unresolved');
    const allHandlersOk = finals.length > 0 &&
      finals.every((l) => l.handlerConfirm && l.handlerConfirm.state === 'resolved');
    if (anyUnresolved) {
      m.status = 'reopened';
    } else if (allHandlersOk && m.creatorConfirm.state === 'resolved') {
      m.status = 'closed';
      m.closedAt = Date.now();
    } else {
      m.status = 'confirming';
    }
  }
  if (m.status !== from) {
    addLog(m.id, null, 'auto', {
      from, to: m.status,
      note: m.status === 'confirming' ? '所有分池已办结，进入待确认'
        : m.status === 'closed' ? '落实人与提出人均确认已解决，消息关闭'
        : '状态变更为「' + MSG_STATUS[m.status] + '」'
    });
    if (m.status === 'confirming') {
      sendWeComNotification([m.createdBy], m.no + ' 所有最终落实人已确认已解决，请您进行提出人确认', m.id);
    }
    if (m.status === 'closed') {
      const participants = [m.createdBy]
        .concat(links.map((l) => l.dispatchedBy), links.map((l) => handlerOfLink(l)));
      sendWeComNotification(participants, m.no + ' 落实人与提出人均确认已解决，消息已关闭', m.id);
    }
  }
}

/* ---------- 动作：新建消息（投递） ---------- */
function createMessage(data) {
  const me = curUser();
  const seq = ++S.seq;
  const now = Date.now();
  const targetPool = poolById(data.poolId);
  const direct = targetPool && targetPool.type === 'exec';
  const excerpt = (data.content || '').replace(/\s+/g, ' ').slice(0, 18);
  const title = data.customerName || excerpt || '未命名消息';
  const m = {
    id: 'm_' + Math.random().toString(36).slice(2, 9),
    seq, no: 'M-' + String(seq).padStart(4, '0'),
    title, content: data.content, attachments: data.attachments || [],
    sources: data.sources || [], customerName: data.customerName || '', sourceOther: data.sourceOther || '',
    createdBy: me.id, sourcePoolId: data.poolId, direct,
    status: direct ? 'p_exec' : 'p_company',
    creatorConfirm: { state: 'none' },
    createdAt: now, updatedAt: now
  };
  S.messages.unshift(m);
  if (direct) {
    S.links.push({
      id: 'lk_' + Math.random().toString(36).slice(2, 9),
      messageId: m.id, poolId: targetPool.id, poolType: 'exec',
      parentLinkId: null, parentPoolId: null,
      status: 'pending', handlerId: targetPool.ownerIds[0] || targetPool.memberIds[0] || null,
      isFinal: true, handlerConfirm: { state: 'none' },
      dispatchedBy: me.id, dispatchedAt: now, note: '直投分管池'
    });
    addLog(m.id, me.id, 'created', { note: '创建消息，直投 ' + targetPool.name });
    sendWeComNotification(targetPool.ownerIds.concat(targetPool.memberIds),
      '新消息 ' + m.no + '《' + m.title + '》直投到 ' + targetPool.name, m.id);
  } else {
    addLog(m.id, me.id, 'created', { note: '创建消息，投递到公司总池' });
    const dispatchers = USERS.filter((u) => u.role === 'dispatcher').map((u) => u.id);
    sendWeComNotification(dispatchers, '新消息 ' + m.no + '《' + m.title + '》已进入公司总池，待分发', m.id);
  }
  saveState();
  return m;
}

/* ---------- 动作：分发（公司总池 -> 池树任意层级的一个或多个目标池，任一总池分发人均可直接分发） ---------- */
function dispatchMessage(msgId, targetPoolIds, note) {
  const me = curUser();
  const m = findMsg(msgId);
  if (!m) return { ok: false, msg: '消息不存在' };
  const now = Date.now();
  const targets = (targetPoolIds || []).map((t) => (typeof t === 'string' ? { poolId: t, handlerId: null } : t));
  const added = [];
  targets.forEach((t) => {
    const pid = t.poolId;
    const pool = poolById(pid);
    if (!pool || pool.type === 'company') return;
    if (linkOf(msgId, pid)) return;
    S.links.push({
      id: 'lk_' + Math.random().toString(36).slice(2, 9),
      messageId: msgId, poolId: pid, poolType: pool.type,
      parentLinkId: null, parentPoolId: 'p_company',
      status: 'pending', handlerId: t.handlerId || pool.ownerIds[0] || pool.memberIds[0] || null,
      isFinal: true, handlerConfirm: { state: 'none' },
      dispatchedBy: me.id, dispatchedAt: now, note: note || ''
    });
    added.push(pool);
  });
  if (!added.length) return { ok: false, msg: '所选目标池均已在处理列表中' };
  m.updatedAt = now;
  recomputeStatus(m);
  addLog(m.id, me.id, 'dispatched', {
    note: '分发到 ' + added.map((p) => p.name).join('、') + (note ? '：' + note : '')
  });
  added.forEach((p) => {
    sendWeComNotification(p.ownerIds.concat(p.memberIds), '消息 ' + m.no + '《' + m.title + '》已分发到 ' + p.name, m.id);
  });
  sendWeComNotification([m.createdBy], '您的消息 ' + m.no + ' 已分发到 ' + added.length + ' 个池', m.id);
  saveState();
  return { ok: true, count: added.length };
}

/* ---------- 动作：流转（分管池 -> 本线部门池/小组池，部门池 -> 小组池） ---------- */
function forwardMessage(msgId, fromLinkId, toPoolIds, note) {
  const me = curUser();
  const m = findMsg(msgId);
  const fromLink = linkById(fromLinkId);
  if (!m || !fromLink) return { ok: false, msg: '记录不存在' };
  if (!linkActive(fromLink)) return { ok: false, msg: '该池已办结或已流转' };
  const fromPool = poolById(fromLink.poolId);
  /* 可流转目标：分管池 → 本线全部部门池/小组池；部门池 → 本部门小组池 */
  let validTarget;
  if (fromPool.type === 'exec') {
    const line = execLinePoolIds(fromPool.id);
    validTarget = (pool) => line.includes(pool.id) && pool.id !== fromPool.id &&
      (pool.type === 'dept' || pool.type === 'group');
  } else if (fromPool.type === 'dept') {
    validTarget = (pool) => pool.type === 'group' && pool.parentId === fromPool.id;
  } else {
    return { ok: false, msg: '该池不能再向下流转' };
  }
  const now = Date.now();
  const targets = (toPoolIds || []).map((t) => (typeof t === 'string' ? { poolId: t, handlerId: null } : t));
  const added = [];
  targets.forEach((t) => {
    const pid = t.poolId;
    const pool = poolById(pid);
    if (!pool || !validTarget(pool)) return;
    if (linkOf(msgId, pid)) return;
    S.links.push({
      id: 'lk_' + Math.random().toString(36).slice(2, 9),
      messageId: msgId, poolId: pid, poolType: pool.type,
      parentLinkId: fromLink.id, parentPoolId: fromPool.id,
      status: 'pending', handlerId: t.handlerId || pool.ownerIds[0] || pool.memberIds[0] || null,
      isFinal: true, handlerConfirm: { state: 'none' },
      dispatchedBy: me.id, dispatchedAt: now, note: note || ''
    });
    added.push(pool);
  });
  if (!added.length) return { ok: false, msg: '所选下级池均已在处理列表中' };
  fromLink.status = 'forwarded';
  fromLink.isFinal = false;
  m.updatedAt = now;
  recomputeStatus(m);
  addLog(m.id, me.id, 'forwarded', {
    poolId: fromPool.id,
    note: '从 ' + fromPool.name + ' 流转到 ' + added.map((p) => p.name).join('、') + (note ? '：' + note : '')
  });
  added.forEach((p) => {
    sendWeComNotification(p.ownerIds.concat(p.memberIds), '消息 ' + m.no + '《' + m.title + '》已流转到 ' + p.name, m.id);
  });
  sendWeComNotification([m.createdBy], '您的消息 ' + m.no + ' 已从 ' + fromPool.name + ' 流转到 ' + added.length + ' 个下级池', m.id);
  saveState();
  return { ok: true, count: added.length };
}

/* ---------- 动作：分池回复 / 评论嵌套回复（parentReplyId 为空 = 一级评论） ---------- */
function addReply(msgId, poolId, content, attachments, parentReplyId) {
  const me = curUser();
  const m = findMsg(msgId);
  if (!m) return { ok: false, msg: '消息不存在' };
  if (!canSeeMessage(me, m)) return { ok: false, msg: '无权评论该消息' };
  const link = linkOf(msgId, poolId);
  const parent = parentReplyId ? S.replies.find((x) => x.id === parentReplyId) : null;
  const r = {
    id: 'rp_' + Math.random().toString(36).slice(2, 9),
    messageId: msgId, poolId, authorId: me.id,
    parentReplyId: parent ? parent.id : null,
    content, attachments: attachments || [], at: Date.now(),
    likeCount: 0, likedByUserIds: []
  };
  S.replies.push(r);
  if (link && (link.status === 'pending' || link.status === 'processing')) link.status = 'replied';
  addLog(m.id, me.id, 'reply', { poolId, note: content });
  m.updatedAt = Date.now();
  recomputeStatus(m);
  const notify = [m.createdBy, link && handlerOfLink(link), parent && parent.authorId].filter((id) => id && id !== me.id);
  sendWeComNotification(notify, poolName(poolId) + ' 回复了 ' + m.no, m.id);
  saveState();
  return { ok: true };
}

/* ---------- 动作：落实人确认（仅最终处理池落实人） ---------- */
function setHandlerConfirm(msgId, linkId, state, note) {
  const me = curUser();
  const m = findMsg(msgId);
  const link = linkById(linkId);
  if (!m || !link || !link.isFinal) return { ok: false, msg: '记录不存在或该池不是最终处理池' };
  if (m.status === 'closed' || m.status === 'cancelled') return { ok: false, msg: '消息已终结' };
  const now = Date.now();
  link.handlerConfirm = { state, by: me.id, at: now, note: note || '' };
  if (state === 'resolved') {
    link.status = 'resolved';
    link.resolvedAt = now;
  } else if (state === 'unresolved') {
    link.status = 'processing';
    delete link.resolvedAt;
  }
  m.updatedAt = now;
  addLog(m.id, me.id, 'handler_confirm', {
    poolId: link.poolId,
    note: '落实人确认：' + CONFIRM_STATE[state] + (note ? '（' + note + '）' : '')
  });
  if (state === 'unresolved') {
    m.status = 'reopened';
    addLog(m.id, null, 'auto', { note: '落实人标记未解决，消息重新打开' });
    sendWeComNotification([m.createdBy].concat(linksOf(m.id).map((l) => l.dispatchedBy)),
      m.no + ' 被落实人标记为「未解决」，消息重新打开', m.id);
    saveState();
    return { ok: true };
  }
  recomputeStatus(m);
  if (m.status !== 'closed') {
    sendWeComNotification([m.createdBy], poolName(link.poolId) + ' 落实人已确认 ' + m.no + ' 已解决', m.id);
  }
  saveState();
  return { ok: true };
}

/* ---------- 动作：回复点赞（仅计数，不改状态、不发通知） ---------- */
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
  }
  saveState();
}

/* ---------- 动作：消息点赞（针对当前消息，可点可取消，仅计数） ---------- */
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
  }
  saveState();
}

/* ---------- 动作：提出人确认 ---------- */
function setCreatorConfirm(msgId, state) {
  const me = curUser();
  const m = findMsg(msgId);
  if (!m) return { ok: false, msg: '消息不存在' };
  if (m.createdBy !== me.id) return { ok: false, msg: '仅提出人可确认' };
  if (m.status === 'closed' || m.status === 'cancelled') return { ok: false, msg: '消息已终结' };
  m.creatorConfirm = { state, by: me.id, at: Date.now() };
  m.updatedAt = Date.now();
  addLog(m.id, me.id, 'creator_confirm', { note: '提出人确认：' + CONFIRM_STATE[state] });
  recomputeStatus(m);
  saveState();
  return { ok: true };
}

/* ---------- 动作：发起人/分发人直接标记整条信息已解决 ---------- */
function resolveMessage(msgId) {
  const me = curUser();
  const m = findMsg(msgId);
  if (!m) return { ok: false, msg: '消息不存在' };
  if (!canResolveMessage(me, m)) return { ok: false, msg: '已有回复后，发起人或分发人才可标记为已解决' };
  const now = Date.now();
  linksOf(msgId).filter((link) => linkActive(link) && link.isFinal).forEach((link) => {
    link.status = 'resolved';
    link.resolvedAt = now;
    link.handlerConfirm = { state: 'resolved', by: me.id, at: now, note: '由' + (m.createdBy === me.id ? '发起人' : '分发人') + '标记已解决' };
  });
  m.creatorConfirm = { state: 'resolved', by: me.id, at: now };
  m.status = 'closed';
  m.closedAt = now;
  m.updatedAt = now;
  addLog(m.id, me.id, 'closed', { note: (m.createdBy === me.id ? '发起人' : '分发人') + '标记信息为已解决' });
  const participants = [m.createdBy].concat(linksOf(m.id).map((link) => link.dispatchedBy), linksOf(m.id).map((link) => handlerOfLink(link)));
  sendWeComNotification(participants, m.no + ' 已由' + (m.createdBy === me.id ? '发起人' : '分发人') + '标记为已解决', m.id);
  saveState();
  return { ok: true };
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
  sendWeComNotification(linksOf(m.id).map((l) => handlerOfLink(l)).concat(linksOf(m.id).map((l) => l.dispatchedBy)),
    m.no + ' 已由提出人取消', m.id);
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
  USERS.filter((u) => u.role === 'admin').forEach((a) => {
    sendWeComNotification([a.id], me.name + ' 申请新建' + POOL_TYPES[app.poolType] + '「' + app.poolName + '」（上级：' + poolName(app.parentId) + '）', null);
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
    S.pools.push({
      id: 'p_' + Math.random().toString(36).slice(2, 9),
      name: app.poolName, type: app.poolType, parentId: app.parentId,
      level: 3, timeoutDays: 2, allowDirect: false, autoAssign: false, status: 'ACTIVE',
      ownerIds: [app.applicantId], memberIds: [app.applicantId]
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
  let confirming = 0;
  let closed = 0;
  let overdue = 0;

  msgs.forEach((m) => {
    if (m.status === 'closed') {
      closed++;
    } else if (m.status === 'confirming') {
      confirming++;
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
    confirming,
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
  if (!parent || parent.level !== 2 || !canCreateSubPool(me, parent)) {
    return { ok: false, msg: '只能在部门池下新建小组池' };
  }
  const level = parent ? (parent.level != null ? parent.level + 1 : 2) : 1;
  const poolType = level === 1 ? 'exec' : (level === 2 ? 'dept' : 'group');
  
  // 支持多位负责人
  let ownerIds = [];
  if (Array.isArray(data.ownerIds)) {
    ownerIds = [...new Set(data.ownerIds.filter(Boolean))];
  } else if (data.ownerId) {
    ownerIds = [data.ownerId];
  }

  let memberIds = Array.isArray(data.memberIds) ? [...data.memberIds] : [];
  ownerIds.forEach((oid) => {
    if (!memberIds.includes(oid)) memberIds.push(oid);
  });

  const newPool = {
    id: 'p_' + Math.random().toString(36).slice(2, 9),
    name: (data.name || '').trim(),
    type: poolType,
    level,
    parentId: data.parentId || null,
    ownerIds,
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
  const handlerIds = links.map((l) => handlerOfLink(l)).filter(Boolean);
  sendWeComNotification(handlerIds, '【催办提醒】' + me.name + ' 对消息 ' + m.no + '《' + m.title + '》进行了催办，请尽快办理。', m.id);
  addLog(m.id, me.id, 'urge', { note: '催办消息，提醒处理人尽快办理' });
  saveState();
  return { ok: true };
}

/* 转派操作 */
function transferMessage(messageId, fromPoolId, toPoolId, toUserId, note) {
  const me = curUser();
  const m = findMsg(messageId);
  if (!m) return { ok: false, msg: '消息不存在' };
  const targetPool = poolById(toPoolId);
  if (!targetPool) return { ok: false, msg: '目标池不存在' };

  let link = linkOf(messageId, fromPoolId);
  if (link) {
    link.poolId = toPoolId;
    link.poolType = targetPool.type;
    link.handlerId = toUserId || targetPool.ownerIds[0] || null;
    link.status = 'pending';
  } else {
    link = {
      id: 'lk_' + Math.random().toString(36).slice(2, 9),
      messageId, poolId: toPoolId, poolType: targetPool.type,
      parentLinkId: null, parentPoolId: fromPoolId,
      status: 'pending', handlerId: toUserId || targetPool.ownerIds[0] || null,
      isFinal: true, handlerConfirm: { state: 'none' },
      dispatchedBy: me.id, dispatchedAt: Date.now(), note: note || '转派'
    };
    S.links.push(link);
  }
  addLog(m.id, me.id, 'transfer', {
    note: '转派到 ' + targetPool.name + (toUserId ? '（' + userName(toUserId) + '）' : '') + (note ? '：' + note : '')
  });
  if (toUserId) {
    sendWeComNotification([toUserId], '消息 ' + m.no + '《' + m.title + '》已由 ' + me.name + ' 转派给您处理', m.id);
  }
  saveState();
  return { ok: true };
}

/* 关注/取消关注 */
const FOLLOW_KEY = 'flow_followed_msgs';
function isFollowed(messageId) {
  try {
    const list = JSON.parse(localStorage.getItem(FOLLOW_KEY) || '[]');
    return list.includes(messageId);
  } catch (e) { return false; }
}
function toggleFollowMessage(messageId) {
  try {
    let list = JSON.parse(localStorage.getItem(FOLLOW_KEY) || '[]');
    let state = false;
    if (list.includes(messageId)) {
      list = list.filter((id) => id !== messageId);
      state = false;
    } else {
      list.push(messageId);
      state = true;
    }
    localStorage.setItem(FOLLOW_KEY, JSON.stringify(list));
    return { ok: true, followed: state };
  } catch (e) {
    return { ok: true, followed: true };
  }
}
