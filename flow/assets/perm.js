/* ==========================================================================
 * perm.js — 当前身份与权限判断
 * 扩展点：正式环境中身份来自企业微信 OAuth 登录态，权限由后端鉴权返回。
 * ========================================================================== */

const IDENTITY_KEY = 'flow_identity';

/* 可切换身份（支持总池分发人、分管人、部门负责人、组负责人、普通员工） */
const IDENTITY_CHOICES = [
  { id: 'u_qy',  label: '总池分发人（李倩影）' },
  { id: 'u_wjx', label: '分管人（王冀湘·研究所）' },
  { id: 'u_wyx', label: '分管人（闻勇翔·机构业务）' },
  { id: 'u_zm',  label: '部门负责人（宏观部·周明）' },
  { id: 'u_ls',  label: '组负责人（华东组·李四）' },
  { id: 'u_zs',  label: '普通员工（张三）' }
];
const DEFAULT_IDENTITY = 'u_qy';

function curUser() {
  const u = USERS.find((x) => x.id === localStorage.getItem(IDENTITY_KEY));
  if (u && IDENTITY_CHOICES.some((c) => c.id === u.id)) return u;
  return USERS.find((x) => x.id === DEFAULT_IDENTITY);
}
function setIdentity(userId) { localStorage.setItem(IDENTITY_KEY, userId); }

function isAdmin(u) { return u && u.role === 'admin'; }
function isDispatcher(u) { return u && (u.role === 'dispatcher' || u.id === 'u_qy'); }
function isExec(u) { return u && (u.role === 'exec' || u.id === 'u_wjx' || u.id === 'u_wyx'); }

/* 当前身份在池体系中的根节点池：
 * 总池分发人 -> 公司总池（全树）
 * 分管人 -> 研究所分管池 / 机构业务分管池（仅该枝）
 * 部门负责人 -> 宏观研究部池
 * 组负责人 -> 华东组池（叶子节点）
 * 普通员工 -> null（无管理池） */
function userRootPool(u) {
  if (!u) return null;
  if (isDispatcher(u) || isAdmin(u)) return poolById('p_company');
  const allPools = (S && S.pools) ? S.pools : [];
  // 部门负责人即使兼任上级池共同负责人，也应优先从自己的部门池进入管理
  if (u.role === 'deptAdmin') {
    const deptPool = allPools.find((p) => p.level === 2 && p.status !== 'DELETED' &&
      ((p.ownerIds || []).includes(u.id) || (p.memberIds || []).includes(u.id)));
    if (deptPool) return deptPool;
  }
  // 查找我作为负责人且 level 最小的池
  const owned = allPools.filter((p) => p.status !== 'DELETED' && p.ownerIds && p.ownerIds.includes(u.id));
  if (owned.length) {
    owned.sort((a, b) => (a.level != null ? a.level : 99) - (b.level != null ? b.level : 99));
    return owned[0];
  }
  // 回退：查找我作为成员且 level 最小的池
  const member = allPools.filter((p) => p.status !== 'DELETED' && p.memberIds && p.memberIds.includes(u.id));
  if (member.length) {
    member.sort((a, b) => (a.level != null ? a.level : 99) - (b.level != null ? b.level : 99));
    return member[0];
  }
  return null;
}

function canAccessPoolManage(u) {
  return !!userRootPool(u);
}

/* 以 rootPool 为顶点的下级子树（包含 rootPool 自身，只向下，向上不可见） */
function getPoolSubtree(rootPoolId) {
  if (!rootPoolId) return [];
  const result = [];
  const queue = [rootPoolId];
  while (queue.length) {
    const curId = queue.shift();
    const p = poolById(curId);
    if (p && p.status !== 'DELETED') {
      result.push(p);
      const children = (S && S.pools ? S.pools : []).filter((cp) => cp.parentId === curId && cp.status !== 'DELETED');
      children.forEach((cp) => queue.push(cp.id));
    }
  }
  return result;
}

/* 当前身份可见的池子树列表 */
function visiblePoolSubtree(u) {
  const root = userRootPool(u);
  if (!root) return [];
  return getPoolSubtree(root.id);
}

function isPoolVisible(u, poolId) {
  const visible = visiblePoolSubtree(u);
  return visible.some((p) => p.id === poolId);
}

/* 分管池和部门池由组织架构唯一确定，不允许手工新建 */
function canCreateTopPool(u) {
  return false;
}

/* 权限：只允许在部门池下新建小组池 */
function canCreateSubPool(u, parentPool) {
  if (!parentPool || parentPool.level !== 2) return false;
  if (isDispatcher(u) || isAdmin(u)) return true;
  // 部门负责人：只要是该部门池负责人或成员，即可在本部门下建立小组池
  if (u.role === 'deptAdmin' &&
      (parentPool.ownerIds.includes(u.id) || parentPool.memberIds.includes(u.id))) return true;
  const root = userRootPool(u);
  if (!root) return false;
  // 分管人：可在自己分管范围内的部门池下新建小组池
  if (isExec(u)) {
    const subtree = getPoolSubtree(root.id);
    return subtree.some((p) => p.id === parentPool.id);
  }
  // 其他被配置为部门池负责人的身份：在自己的部门池下可新建小组池
  if (parentPool.id === root.id && parentPool.level === 2) return true;
  return false;
}

/* 权限：能否设置某池的负责人（支持多负责人管理与协同设置） */
function canSetPoolOwner(u, pool) {
  if (!pool) return false;
  if (pool.level === 0 && !isDispatcher(u) && !isAdmin(u)) return false;
  if (isDispatcher(u) || isAdmin(u)) return true;
  const root = userRootPool(u);
  if (!root) return false;
  // 分管高管、部门负责人、小组负责人均可管理本池及管辖子树的负责人
  const subtree = getPoolSubtree(root.id);
  return subtree.some((p) => p.id === pool.id);
}

/* 权限：能否管理池成员 */
function canManagePoolMembers(u, pool) {
  if (!pool) return false;
  if (isDispatcher(u) || isAdmin(u)) return true;
  const root = userRootPool(u);
  if (!root) return false;
  const subtree = getPoolSubtree(root.id);
  return subtree.some((p) => p.id === pool.id);
}

/* 权限：能否停用某池（仅总池分发人，且必须是子级池） */
function canDisablePool(u, pool) {
  if (!pool || pool.level === 0) return false;
  return isDispatcher(u) || isAdmin(u);
}

/* 权限：能否编辑池设置（名称/时限/直投开关等） */
function canEditPoolSettings(u, pool) {
  if (!pool) return false;
  if (isDispatcher(u) || isAdmin(u)) return true;
  const root = userRootPool(u);
  if (!root) return false;
  const subtree = getPoolSubtree(root.id);
  return subtree.some((p) => p.id === pool.id);
}

/* 权限：能否催办或转派消息 */
function canUrgeOrTransfer(u) {
  if (isDispatcher(u) || isExec(u) || isAdmin(u)) return true;
  const root = userRootPool(u);
  return !!root;
}

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

/* 发起人或总池分发人可在已有回复后直接将整条信息标记为已解决 */
function canResolveMessage(u, m) {
  if (!u || !m || m.status === 'closed' || m.status === 'cancelled') return false;
  if (!repliesOf(m.id).length) return false;
  return m.createdBy === u.id || isDispatcher(u) || isAdmin(u);
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
