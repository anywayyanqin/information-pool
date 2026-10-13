/* ==========================================================================
 * perm.js — 当前身份与权限判断
 * 扩展点：正式环境中身份来自企业微信 OAuth 登录态，权限由后端鉴权返回。
 *
 * 规则口径（与 store.js 术语一致）：
 *   填报 = 员工从 8 个业务池中选一个投递；
 *   分发 = 总池分发人与在办处理人均按部门员工组织架构分发到全公司任意部门/人员（抄送目标所属业务池负责人）；
 *   可见性 = 发起人只见自己的内容与分发去向，处理人只见自己的回复，李倩影见全部，汇总回复人人可见。
 * ========================================================================== */

const IDENTITY_KEY = 'flow_identity';

/* 可切换身份：使用通讯录中的真实员工姓名，权限仍沿用对应演示账号。 */
const IDENTITY_CHOICES = [
  { id: 'u_qy',  label: '李倩影' },
  { id: 'u_zyy', label: '张烨烨' },
  { id: 'u_wjx', label: '王冀湘' },
  { id: 'u_wyx', label: '闻勇翔' },
  { id: 'u_zs',  label: '董丹璐' },
  { id: 'u_wyq', label: '王燕勤' }
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
function isExecutive(u) {
  return !!u && (isAdmin(u) || u.role === 'poolAdmin' || u.role === 'deptAdmin');
}

/* 高管＝只读浏览者：全公司 8 个池的信息都能看，但不发言、不分发、不标记。
 * 有意不并入 isExecutive——那个函数代表「池/部门负责人」，带着标记已解决/未解决的权力。 */
function isExecRole(u) { return !!u && u.role === 'exec'; }
function ownsAnyPool(u) {
  return !!u && !!(S && S.pools) && S.pools.some((p) => (p.ownerIds || []).includes(u.id));
}
/* 本人若同时是池负责人或这条信息的处理人，就按那两个身份的正常权力走 */
function isReadOnlyExec(u, m) {
  if (!isExecRole(u) || ownsAnyPool(u)) return false;
  return !(m && isHandlerOf(u, m));
}

/* 当前身份在池体系中的管理根节点（8 个业务池 → 部门 → 小组）：
 * 总池分发人 / 管理员 -> null，管辖整片森林（见 pmRoots）
 * 业务池负责人 -> 该业务池
 * 部门负责人 -> 其部门池（即使兼任上级池成员，也优先从部门池进入）
 * 组负责人 -> 小组池；普通员工 -> null（无管理池） */
function userRootPool(u) {
  if (!u || isDispatcher(u) || isAdmin(u)) return null;
  const allPools = (S && S.pools) ? S.pools : [];
  const alive = allPools.filter((p) => p.status !== 'DELETED');
  if (u.role === 'deptAdmin') {
    const deptPool = alive.find((p) => p.level === 1 &&
      ((p.ownerIds || []).includes(u.id) || (p.memberIds || []).includes(u.id)));
    if (deptPool) return deptPool;
  }
  const owned = alive.filter((p) => p.ownerIds && p.ownerIds.includes(u.id));
  if (owned.length) {
    owned.sort((a, b) => (a.level != null ? a.level : 99) - (b.level != null ? b.level : 99));
    return owned[0];
  }
  const member = alive.filter((p) => p.memberIds && p.memberIds.includes(u.id));
  if (member.length) {
    member.sort((a, b) => (a.level != null ? a.level : 99) - (b.level != null ? b.level : 99));
    return member[0];
  }
  return null;
}

/* 池管理页的顶层节点：分发人/管理员看全部 8 个业务池，其余只看自己那条枝 */
function pmRoots(u) {
  if (isAdmin(u) || isDispatcher(u)) return poolTree().map((n) => n.pool);
  const root = userRootPool(u);
  return root ? [root] : [];
}

function canAccessPoolManage(u) {
  if (!u) return false;
  if (isAdmin(u) || isDispatcher(u)) return true;
  if (u.role === 'poolAdmin' || u.role === 'deptAdmin') return true;
  return String(u.title || '').includes('负责人');
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
      const children = sortPoolsByPoolOrder((S && S.pools ? S.pools : []).filter((cp) => cp.parentId === curId && cp.status !== 'DELETED'));
      children.forEach((cp) => queue.push(cp.id));
    }
  }
  return result;
}

/* 当前身份可见的池子树列表（分发人/管理员为全部池） */
function visiblePoolSubtree(u) {
  if (isAdmin(u) || isDispatcher(u)) return orderedPoolsFlat();
  const root = userRootPool(u);
  if (!root) return [];
  return getPoolSubtree(root.id);
}

function isPoolVisible(u, poolId) {
  return visiblePoolSubtree(u).some((p) => p.id === poolId);
}

/* 8 个业务池与部门/小组池由组织架构唯一确定，不允许手工新建顶层池 */
function canCreateTopPool(u) {
  return false;
}

/* 权限：只允许在部门池下新建小组池 */
function canCreateSubPool(u, parentPool) {
  if (!parentPool || parentPool.level !== 1) return false;
  if (isDispatcher(u) || isAdmin(u)) return true;
  return (parentPool.ownerIds || []).includes(u.id) || (parentPool.memberIds || []).includes(u.id);
}

/* 我负责或所属的池 id 列表（负责人、秘书与成员均算所属） */
function myPoolIds(u) {
  return S.pools
    .filter((p) => (p.ownerIds || []).includes(u.id) || (p.memberIds || []).includes(u.id))
    .map((p) => p.id);
}

function poolManagedSubtreeIds(u) {
  const root = userRootPool(u);
  if (!root) return [];
  return getPoolSubtree(root.id).map((p) => p.id);
}

/* 权限：能否设置某池的共同负责人。总池分发人管全部；
 * 各池负责人（含一级业务池负责人）可配本池，但动不了上级池 */
function canSetPoolOwner(u, pool) {
  if (!pool) return false;
  if (isDispatcher(u) || isAdmin(u)) return true;
  if ((pool.ownerIds || []).includes(u.id)) return true;
  if (pool.level === 0) return false;
  return poolManagedSubtreeIds(u).includes(pool.id);
}

/* 权限：能否停用某池（仅总池分发人，且必须是业务池以下的节点） */
function canDisablePool(u, pool) {
  if (!pool || pool.level === 0) return false;
  return isDispatcher(u) || isAdmin(u);
}

/* 权限：能否编辑池设置（名称/办结时限等） */
function canEditPoolSettings(u, pool) {
  if (!pool) return false;
  if (isDispatcher(u) || isAdmin(u)) return true;
  return poolManagedSubtreeIds(u).includes(pool.id);
}

/* 权限：能否催办或转派消息 */
function canUrgeOrTransfer(u) {
  return isDispatcher(u) || isAdmin(u) || !!userRootPool(u);
}

/* 链路的待办归属：只有收件人（节点＝负责人+秘书，个人＝指定落实人）承担待办，抄送人不算 */
function linkTodoFor(u, l) {
  return recipientsOf(l).includes(u.id);
}

/* 单条链路对某用户是否可见：收件人与抄送人可见 */
function linkVisibleTo(u, l) {
  return recipientsOf(l).includes(u.id) || ccOf(l).includes(u.id);
}

/* 消息对当前用户是否可见：
 * 管理员与总池分发人看全部 8 个池的消息；高管同为只读全量可见；
 * 发起人看本人提交的；收件人/抄送人看分发给自己的；被分享人可查看；
 * 已解决与被设为公开的人人可查。 */
function canSeeMessage(u, m) {
  if (isAdmin(u) || isDispatcher(u)) return true;
  if (isExecRole(u)) return true;
  if (m.status === 'closed' || m.isPublic) return true;
  if (m.createdBy === u.id) return true;
  if ((m.sharedUserIds || []).includes(u.id)) return true;
  return linksOf(m.id).some((l) => linkVisibleTo(u, l));
}

/* 分享权：总池分发人、发起人、收件人可将消息轻量抄送给任意人 */
function canShareMessage(u, m) {
  if (!canSeeMessage(u, m)) return false;
  if (isAdmin(u) || isDispatcher(u)) return true;
  if (m.createdBy === u.id) return true;
  return linksOf(m.id).some((l) => linkTodoFor(u, l));
}

/* 当前用户在某个池内的身份 */
function poolRole(u, poolId) {
  const p = poolById(poolId);
  if (!p) return null;
  if ((p.ownerIds || []).includes(u.id)) return 'owner';
  if ((p.memberIds || []).includes(u.id)) return 'member';
  return null;
}

/* 用户是否为该消息的处理人（任一链路的收件人，含在办与已办结链路） */
function isHandlerOf(u, m) {
  return linksOf(m.id).some((l) => recipientsOf(l).includes(u.id));
}

/* 纯被抄送人＝这条消息对他只有一份"抄送我的"关系（链路抄送或轻量抄送），
 * 他自己既不承办、也非发起人，更没有分发管理权：只读——不出底栏、不能发言。
 * 高管另走 isReadOnlyExec，卡片状态也仍按办理态展示，避免两条只读规则互相抢。 */
function isCcViewerOnly(u, m) {
  if (!u || !m) return false;
  if (isAdmin(u) || isDispatcher(u) || isExecRole(u)) return false;
  if (m.createdBy === u.id) return false;
  if (isHandlerOf(u, m)) return false;
  if ((m.sharedUserIds || []).includes(u.id)) return true;
  return linksOf(m.id).some((l) => ccOf(l).includes(u.id));
}

/* 回复可见性（覆盖旧「所有参与方可见全部回复」规则）：
 * 总池分发人/管理员与高管看全部处理人回复（高管只读，不可发言）；
 * 处理人可看到所处理信息下的所有回复；
 * 被抄送/被分享的人看得到全部回复（不进待办、不承担处理义务）；
 * 发起人只能看到自己的回复；
 * 倩影的汇总回复不在此列，对所有可见者开放（详情页时间线的汇总节点）。 */
function canSeeReply(u, m, r) {
  if (isAdmin(u) || isDispatcher(u)) return true;
  if (isExecRole(u)) return true;
  if (m.status === 'closed') return true;
  if (isHandlerOf(u, m)) return true;
  if ((m.sharedUserIds || []).includes(u.id)) return true;
  if (linksOf(m.id).some((l) => l.id === r.linkId && ccOf(l).includes(u.id))) return true;
  return r.authorId === u.id;
}

/* 当前用户在评论流中实际可见的回复（保持时间正序） */
function visibleReplies(u, m) {
  return repliesOf(m.id).filter((r) => canSeeReply(u, m, r));
}

/* 能否编辑回复：同一分发链路的收件人共享编辑；总池分发人可协助编辑，截止后统一锁定 */
function canEditReply(u, m, r) {
  if (!u || !m || !r) return false;
  if (m.status === 'closed' || m.status === 'cancelled') return false;
  if (typeof replyEditClosed === 'function' && replyEditClosed(r)) return false;
  if (isAdmin(u) || isDispatcher(u) || u.id === 'u_qy') return true;
  const collaborators = typeof replyCollaboratorIds === 'function'
    ? replyCollaboratorIds(r)
    : [r.authorId];
  return collaborators.includes(u.id) || r.authorId === u.id;
}

/* 全局时间线：凡是人的操作都要留痕——谁投递、谁分发/流转、谁回复/编辑回复，
 * 以及底栏「标记为」的业务标签、已解决、未解决、催办，还有分享、取消、转派；
 * 只有 'auto' 这类系统自动状态变更不展示。 */
function visibleLogs(u, m) {
  const allowed = ['created', 'directed', 'dispatched', 'forwarded', 'reply', 'reply_edit',
    'closed', 'reopened', 'resolve_mark', 'tagged', 'urge', 'shared', 'cancelled', 'transfer', 'supplement', 'content_edit', 'published'];
  const seen = new Set();
  return logsOf(m.id).filter((l) => {
    if (!allowed.includes(l.action)) return false;
    const actionKey = (l.action === 'created' || l.action === 'directed') ? 'initial' : l.action;
    const key = actionKey === 'initial'
      ? [actionKey, l.actorId, l.at].join('|')
      : [actionKey, l.actorId, l.at, l.note || '', JSON.stringify(l.meta || {})].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/* 能否回复：未终结的消息，本人是该池在办链路的收件人（或被分享/发起人普通留言） */
function canReplyIn(u, m, poolId) {
  if (m.status === 'closed' || m.status === 'cancelled') return false;
  const link = myLinkInPool(m.id, u.id, poolId);
  if (!link || !linkActive(link)) return false;
  return isAdmin(u) || linkTodoFor(u, link);
}

/* 能否向下流转：分发统一由总池分发人完成，池本身不设其他分发人 */
function canForward(u, m, link) {
  if (m.status === 'closed' || m.status === 'cancelled') return false;
  if (!linkActive(link)) return false;
  if (!isDispatcher(u) && !isAdmin(u)) return false;
  const pool = poolById(link.poolId);
  return !!pool && childPools(pool.id).length > 0;
}

/* 底栏「标记为」按钮可见者：只有李倩影与各池/部门负责人；
 * 发起人不参与标记，消息关闭后只做满意/不满意回访 */
function canMarkMessage(u, m) {
  if (!u || !m || m.status === 'cancelled') return false;
  return isDispatcher(u) || isExecutive(u);
}

/* 标记已解决：李倩影与池/部门负责人，不要求先有处理人回复 */
function canResolveMessage(u, m) {
  if (!u || !m || m.status === 'closed' || m.status === 'cancelled') return false;
  return isDispatcher(u) || isExecutive(u);
}

/* 标为未解决：已解决的退回处理中；到办结时限自动关闭的「待确认」退回继续办理
 * （李倩影与池/部门负责人） */
function canReopenMessage(u, m) {
  if (!u || !m || m.status === 'cancelled') return false;
  if (m.status !== 'closed' && !isPendingConfirm(m)) return false;
  return isDispatcher(u) || isExecutive(u);
}

/* 发起人视角：底栏不给「标记为/已解决/未解决」，发起人只负责提需求。
 * 李倩影例外——关闭与退回的开关必须留在她手上 */
function isRequesterView(u, m) {
  return !!u && !!m && u.id === m.createdBy && !isDispatcher(u);
}

/* 已解决后发起人的满意度回访（满意/不满意）：只写日志，不改流程 */
function canGiveFeedback(u, m) {
  return isRequesterView(u, m) && m.status === 'closed';
}

/* 我作为处理人、链接在办且尚未提交的链接（决定工作台待办与状态徽标） */
function myActiveUnsubmittedLink(u, m) {
  return linksOf(m.id).find((l) => linkTodoFor(u, l) && linkActive(l) && !hasHandledInPool(u, m, l.poolId)) || null;
}

/* 分发权限：
 * 总池分发人/管理员对任何未终结的消息均可分发；
 * 在办处理人同样可以分发。两者的目标均参照部门员工组织架构，可选全公司任意部门或个人。 */
function canDispatch(u, m) {
  if (!u || !m || m.status === 'closed' || m.status === 'cancelled') return false;
  if (isDispatcher(u) || isAdmin(u)) return true;
  return linksOf(m.id).some((l) => linkTodoFor(u, l) && linkActive(l));
}
/* 分发时新链路挂靠的池：优先本人正在处理的链路所在池 */
function dispatchAnchorPoolId(u, m) {
  const mine = linksOf(m.id).find((l) => linkTodoFor(u, l) && linkActive(l));
  if (mine) return mine.poolId;
  const inPool = linksOf(m.id).find((l) => myPoolIds(u).includes(l.poolId));
  return inPool ? inPool.poolId : m.sourcePoolId;
}
function canCancel(u, m) {
  return m.createdBy === u.id && m.status !== 'closed' && m.status !== 'cancelled';
}

/* 本人是否已在该池回复/办结（决定 待办 / 已办） */
function hasHandledInPool(u, m, poolId) {
  return S.replies.some((r) => r.messageId === m.id && r.poolId === poolId && r.authorId === u.id);
}

/* 工作台「待办」：三态视图中的待办判定 */
function isTodoFor(u, m) {
  if (m.status === 'closed' || m.status === 'cancelled') return false;
  if (isAdmin(u)) return true;
  /* 发起人：从提交到倩影汇总完成前，始终待办 */
  if (m.createdBy === u.id) return true;
  /* 总池分发人：待分发的消息，以及直投后尚无人回复的消息，都在她待办里跟进 */
  if (isDispatcher(u)) return m.status === 'dispatch' || !repliesOf(m.id).length;
  /* 处理人：本人是在办链路的收件人且尚未在该池回复/办结 */
  return linksOf(m.id).some((l) => linkTodoFor(u, l) && linkActive(l) && !hasHandledInPool(u, m, l.poolId));
}
