/* ==========================================================================
 * perm.js — 当前身份与权限判断
 * 扩展点：正式环境中身份来自企业微信 OAuth 登录态，权限由后端鉴权返回。
 * ========================================================================== */

const IDENTITY_KEY = 'flow_identity';

/* 可切换身份（仅这 4 个，其余用户不出现在身份下拉） */
const IDENTITY_CHOICES = [
  { id: 'u_zs',  label: '普通员工（张三）' },
  { id: 'u_wjx', label: '分管池负责人（王冀湘）' },
  { id: 'u_qy',  label: '总池分发人（李倩影）' },
  { id: 'u_cl',  label: '部门池人员（陈立）' }
];
const DEFAULT_IDENTITY = 'u_zs';

function curUser() {
  const u = USERS.find((x) => x.id === localStorage.getItem(IDENTITY_KEY));
  if (u && IDENTITY_CHOICES.some((c) => c.id === u.id)) return u;
  return USERS.find((x) => x.id === DEFAULT_IDENTITY);
}
function setIdentity(userId) { localStorage.setItem(IDENTITY_KEY, userId); }

function isAdmin(u) { return u.role === 'admin'; }
function isDispatcher(u) { return u.role === 'dispatcher'; }
function isExec(u) { return u.role === 'exec'; }

/* 我负责或所属的池 id 列表 */
function myPoolIds(u) {
  return S.pools
    .filter((p) => p.ownerIds.includes(u.id) || p.memberIds.includes(u.id))
    .map((p) => p.id);
}

/* 某分管池整条线的池 id（分管池 + 其下所有部门池/小组池） */
function execLinePoolIds(execPoolId) {
  const ids = [execPoolId];
  for (let i = 0; i < ids.length; i++) {
    childPools(ids[i]).forEach((c) => ids.push(c.id));
  }
  return ids;
}

/* 我作为分管高管可见的本线池 id 并集 */
function myExecLinePoolIds(u) {
  const execPools = S.pools.filter((p) =>
    p.type === 'exec' && (p.ownerIds.includes(u.id) || p.memberIds.includes(u.id)));
  let ids = [];
  execPools.forEach((p) => { ids = ids.concat(execLinePoolIds(p.id)); });
  return [...new Set(ids)];
}

/* 消息对当前用户是否可见：
 * 管理员全部；提出人看本人；总池分发人看经过公司总池的；
 * 分管高管看本线（本分管池及下属部门/小组池）相关；
 * 普通成员看本池相关。不同分管线互不可见。 */
function canSeeMessage(u, m) {
  if (isAdmin(u)) return true;
  if (m.createdBy === u.id) return true;
  if (isDispatcher(u)) return m.sourcePoolId === 'p_company';
  const links = linksOf(m.id);
  const mine = myPoolIds(u);
  if (links.some((l) => mine.includes(l.poolId))) return true;
  if (isExec(u)) {
    const line = myExecLinePoolIds(u);
    return links.some((l) => line.includes(l.poolId));
  }
  return false;
}

/* 当前用户在某个池内的身份 */
function poolRole(u, poolId) {
  const p = poolById(poolId);
  if (!p) return null;
  if (p.ownerIds.includes(u.id)) return 'owner';
  if (p.memberIds.includes(u.id)) return 'member';
  return null;
}

/* 能否看全局汇总时间线 / 全部分池汇总：提出人、总池分发人、管理员 */
function canSeeGlobal(u, m) {
  return isAdmin(u) || m.createdBy === u.id || (isDispatcher(u) && m.sourcePoolId === 'p_company');
}

/* 当前用户可回复的池（本池成员，且链接在办） */
function canReplyIn(u, m, poolId) {
  if (m.status === 'closed' || m.status === 'cancelled') return false;
  const link = linkOf(m.id, poolId);
  return !!link && linkActive(link) && !!poolRole(u, poolId);
}

/* 能否从某池向下流转：链接在办，且本人是该链接处理人或池负责人 */
function canForward(u, m, link) {
  if (m.status === 'closed' || m.status === 'cancelled') return false;
  if (!linkActive(link)) return false;
  const pool = poolById(link.poolId);
  if (!pool || (pool.type !== 'exec' && pool.type !== 'dept')) return false;
  if (!childPools(pool.id).length) return false;
  if (isAdmin(u)) return true;
  return handlerOfLink(link) === u.id || pool.ownerIds.includes(u.id);
}

/* 能否做落实人确认：最终处理池，且本人是落实人（无指定落实人时池成员均可） */
function canConfirmHandler(u, m, link) {
  if (m.status === 'closed' || m.status === 'cancelled') return false;
  if (!link.isFinal || !linkActive(link)) return false;
  if (isAdmin(u)) return true;
  const handlerId = handlerOfLink(link);
  if (handlerId) return handlerId === u.id;
  return !!poolRole(u, link.poolId);
}

/* 能否做提出人确认：提出人本人，且流程已结束（待确认），打标不改变流程状态 */
function canConfirmCreator(u, m) {
  if (m.createdBy !== u.id) return false;
  return m.status === 'confirming';
}

/* 我作为处理人、链接在办且尚未提交的链接（决定评论提交后是否弹 结束处理/流转） */
function myActiveUnsubmittedLink(u, m) {
  const mine = myPoolIds(u);
  return linksOf(m.id).find((l) => mine.includes(l.poolId) && linkActive(l) && !hasHandledInPool(u, m, l.poolId)) || null;
}

function canDispatch(u, m) {
  return isDispatcher(u) && m.sourcePoolId === 'p_company' &&
    m.status !== 'closed' && m.status !== 'cancelled';
}
function canCancel(u, m) {
  return m.createdBy === u.id && m.status !== 'closed' && m.status !== 'cancelled';
}

/* 本人是否已在该池回复/办结（决定 待处理 / 已处理） */
function hasHandledInPool(u, m, poolId) {
  return S.replies.some((r) => r.messageId === m.id && r.poolId === poolId && r.authorId === u.id);
}

/* 工作台「待我处理」：三态视图中的「待处理」判定 */
function isTodoFor(u, m) {
  if (m.status === 'closed' || m.status === 'cancelled') return false;
  if (isAdmin(u)) return true;
  /* 提出人：从提交到消息关闭前，始终待处理 */
  if (m.createdBy === u.id) return true;
  /* 总池分发人：消息在总池待分发 */
  if (isDispatcher(u)) return m.sourcePoolId === 'p_company' && m.status === 'p_company';
  /* 池成员：本池有在办链接且本人尚未在该池回复/结束处理 */
  const mine = myPoolIds(u);
  return linksOf(m.id).some((l) => mine.includes(l.poolId) && linkActive(l) && !hasHandledInPool(u, m, l.poolId));
}
