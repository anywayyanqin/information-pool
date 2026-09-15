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

const LS_KEY = 'flow_state_v3';
let S = null;

/* ---------- 持久化 ---------- */
function loadState() {
  try { S = JSON.parse(localStorage.getItem(LS_KEY)); } catch (e) { S = null; }
  if (!S || S.v !== 3) { S = buildSeed(); saveState(); }
}
function saveState() { localStorage.setItem(LS_KEY, JSON.stringify(S)); }
function resetState() {
  localStorage.removeItem(LS_KEY);
  S = buildSeed();
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
      ownerIds: [app.applicantId], memberIds: [app.applicantId]
    });
  }
  sendWeComNotification([app.applicantId], '您的池申请「' + app.poolName + '」' + (pass ? '已通过，池已创建' : '被驳回'), null);
  saveState();
  return { ok: true };
}
