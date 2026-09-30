/* ==========================================================================
 * views.js — 页面渲染（工作台（含分发） / 我要填报 / 消息详情 / 客户信息 / 池管理）
 * ========================================================================== */

/* ---------- 通用 ---------- */
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
function fmtTime(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}
function fmtSize(n) {
  if (!n && n !== 0) return '';
  if (n < 1024) return n + ' B';
  if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1048576).toFixed(1) + ' MB';
}
function badge(status) { return '<span class="badge b-' + status + '">' + (MSG_STATUS[status] || status) + '</span>'; }

/* 流程是否已结束：倩影发布汇总回复后即视为结束 */
function isEnded(m) { return m.status === 'closed' || m.status === 'cancelled'; }
/* 是否有处理人（链路收件人）给过回复：李倩影的「待汇总」与「已办」以它分界 */
function hasHandlerReply(m) {
  const ids = linksOf(m.id).flatMap((l) => recipientsOf(l));
  return repliesOf(m.id).some((r) => ids.includes(r.authorId));
}
/* 主流程状态（相对当前身份），计算优先级：已解决 > 待办 > 待分发 > 已办。
 * 「我发起的」不参与主状态计算，作为附加标签并存。 */
function flowStatus(m, me) {
  if (isEnded(m)) return 'ended';                                  /* 李倩影已打标「已解决」 */
  const full = isDispatcher(me) || isAdmin(me);
  if (full) {
    /* 李倩影：分发前待分发；有处理人回复即待汇总（待办）；她本人被流转且未回复也是待办；
     * 已分发但无人回复＝已办（等处理人回复） */
    if (m.status === 'dispatch') return 'dispatch';
    if (hasHandlerReply(m) || myActiveUnsubmittedLink(me, m)) return 'todo';
    return 'done';
  }
  /* 发起人与处理人：只有轮到自己行动（尚未提交回复）才是待办；「待分发」对其不显示 */
  if (myActiveUnsubmittedLink(me, m)) return 'todo';
  return 'done';
}
/* 附加标签：来源「我发起的」与独立的提交人确认标签（不改流程状态） */
function extraStatusChipsHtml(m, me) {
  const chips = [];
  if (m.createdBy === me.id) chips.push('<span class="badge b-mine">我发起的</span>');
  if (isEnded(m)) {
    const mark = m.resolveMark || '未确认';
    const cls = mark === '已解决' ? 'b-closed' : mark === '未解决' ? 'b-reopened' : 'b-pending';
    chips.push('<span class="badge ' + cls + '">提交人' + esc(mark) + '</span>');
  }
  return chips.join('');
}
/* 卡片与详情头部的状态标签：流程未结束一律显示「办理中」，李倩影标记解决后才显示「已解决」。
 * 待分发/待办/已办只用于工作台标签分区与状态筛选，不再出现在卡片上。 */
function cardStatusBadgeHtml(m) {
  if (m.status === 'closed') return '<span class="badge b-ended">已解决</span>';
  if (m.status === 'cancelled') return '<span class="badge b-cancelled">已取消</span>';
  return '<span class="badge b-handling">办理中</span>';
}
/* 状态徽章（卡片/详情头部只展示状态标签 + 附加标签） */
function flowBadge(m, me) {
  return cardStatusBadgeHtml(m) + extraStatusChipsHtml(m, me);
}
function attsHtml(atts) {
  if (!atts || !atts.length) return '';
  return '<div class="att-chips">' + atts.map((a) =>
    '<span class="att-chip">' + (a.type === 'voice' ? '[语音] ' : a.type === 'image' ? '[图片] ' : '') + esc(a.name) +
    (a.size ? '（' + fmtSize(a.size) + '）' : '') + '</span>').join('') + '</div>';
}
const PROPOSAL_TYPE_MAP = {
  '客户反馈': '客需',
  '同业交流': '行业信息',
  '行业会议': '投诉与建议',
  '监管与交易所': '投诉与建议',
  '网络媒体': '行业信息'
};
function proposalTypeLabel(source) { return PROPOSAL_TYPE_MAP[source] || source; }
function proposalTypes(m) { return [...new Set((m.sources || []).map(proposalTypeLabel).filter(Boolean))]; }
function proposalTypeText(m) {
  return proposalTypes(m).concat(m.sourceOther ? [m.sourceOther] : []).join('、');
}
function proposalTypeMatches(m, type) {
  return proposalTypes(m).includes(type) || m.sourceOther === type;
}
function toast(msg) {
  const el = document.getElementById('toast');
  if (!el || !el.classList) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 2000);
}
function empty(text) { return '<div class="empty">' + text + '</div>'; }

/* 消息关键字模糊匹配：编号 / 标题 / 客户 / 正文 / 来源 / 提出人 / 涉及池等全局字段 */
function msgKeywordMatch(m, kw) {
  const k = (kw || '').trim().toLowerCase();
  if (!k) return true;
  const relatedPools = linksOf(m.id).map((l) => poolName(l.poolId)).join(' ');
  return [m.no, m.title, m.customerName, m.content, m.sourceOther, userName(m.createdBy),
    (m.tags || []).join(' '), proposalTypeText(m), (m.sources || []).join(' '), relatedPools]
    .some((f) => f && String(f).toLowerCase().includes(k));
}

/* 当前用户可见的消息列表 */
function visibleMessages() {
  const me = curUser();
  return S.messages.filter((m) => canSeeMessage(me, m));
}
/* 消息当前是否挂在某池：链路指向该池或其下部门/小组池，或尚未分发且投递在该池下 */
function poolCovers(filterId, targetId) {
  let cur = poolById(targetId);
  while (cur) {
    if (cur.id === filterId) return true;
    cur = cur.parentId ? poolById(cur.parentId) : null;
  }
  return false;
}
function msgInPool(m, poolId) {
  if (poolId === 'all') return true;
  if (linksOf(m.id).some((l) => poolCovers(poolId, l.poolId))) return true;
  return !linksOf(m.id).length && poolCovers(poolId, m.sourcePoolId);
}

/* ---------- 池树渲染（仅池管理展示用，纯展示树形结构与池名称） ---------- */
function treeHtml(nodes, opts) {
  return nodes.map((n) => {
    const p = n.pool;
    const count = opts.countFor ? opts.countFor(p.id) : 0;
    return '<div class="tree-node">' +
      '<div class="tree-row">' +
        '<span class="tree-caret">' + (n.children.length ? '▾' : '') + '</span>' +
        '<span>' + esc(p.name) + '</span>' +
        (count ? '<span class="tree-count">' + count + '</span>' : '') +
      '</div>' +
      (n.children.length ? '<div class="tree-children">' + treeHtml(n.children, opts) + '</div>' : '') +
    '</div>';
  }).join('');
}

/* ==========================================================================
 * 1. 工作台（总池分发人的分发能力直接融合在本页）
 * ========================================================================== */
let wbTab = null;   /* null = 默认视图：总池分发人默认「待办」（直投后由她与池负责人共同跟进），其余默认「全部」 */
let wbPool = 'all';
let wbStatus = '';
let wbTag = '';
let wbKw = '';
let wbSortKey = 'updatedAt';   /* 表格列头排序，默认按最近更新倒序 */
let wbSortDir = -1;

/* 工作台筛选栏固定 6 个标签；「待分发」只有李倩影视角可见（其余角色该态并入已办） */
function wbTabs() {
  const tabs = [{ key: 'all', name: '全部' }, { key: 'mine', name: '我发起的' }];
  if (isDispatcher(curUser()) || isAdmin(curUser())) tabs.push({ key: 'dispatch', name: '待分发' });
  return tabs.concat([{ key: 'todo', name: '待办' }, { key: 'done', name: '已办' }, { key: 'ended', name: '已解决' }]);
}
function effectiveWbTab() {
  const keys = wbTabs().map((t) => t.key);
  if (wbTab && keys.includes(wbTab)) return wbTab;
  return isDispatcher(curUser()) ? 'todo' : 'all';
}

function wbTabCount(key) {
  const me = curUser();
  let list = visibleMessages();
  if (wbPool !== 'all') list = list.filter((m) => msgInPool(m, wbPool));
  if (wbTag) list = list.filter((m) => (m.tags || []).includes(wbTag));
  if (key === 'mine') return list.filter((m) => m.createdBy === me.id).length;
  if (key === 'all') return list.length;
  return list.filter((m) => flowStatus(m, me) === key).length;
}

/* 表格列头排序：编号/提议类型/发起人/时间/详细描述可排；状态/标签/当前处理人只是徽标展示，不参与排序 */
const WB_SORTERS = {
  no: (m) => m.no,
  src: (m) => proposalTypeText(m),
  creator: (m) => userName(m.createdBy),
  updatedAt: (m) => m.updatedAt,
  desc: (m) => m.content
};
window.setWbSort = (k) => {
  if (wbSortKey === k) { wbSortDir = -wbSortDir; }
  else { wbSortKey = k; wbSortDir = k === 'updatedAt' ? -1 : 1; }
  render();
};

function wbList() {
  const me = curUser();
  const tab = effectiveWbTab();
  let list = visibleMessages();
  /* 六个标签按主流程状态分区；「我发起的」按来源过滤，可与其他状态并存 */
  if (tab === 'mine') list = list.filter((m) => m.createdBy === me.id);
  else if (tab !== 'all') list = list.filter((m) => flowStatus(m, me) === tab);
  if (wbPool !== 'all') list = list.filter((m) => msgInPool(m, wbPool));
  if (wbStatus) list = list.filter((m) => flowStatus(m, me) === wbStatus);
  if (wbTag) list = list.filter((m) => (m.tags || []).includes(wbTag));
  if (wbKw) list = list.filter((m) => msgKeywordMatch(m, wbKw));
  const sorter = WB_SORTERS[wbSortKey] || WB_SORTERS.updatedAt;
  return list.sort((a, b) => {
    const va = sorter(a), vb = sorter(b);
    const c = (typeof va === 'number' && typeof vb === 'number')
      ? va - vb
      : String(va).localeCompare(String(vb), 'zh');
    return c * wbSortDir;
  });
}

window.setWbPool = (id) => { wbPool = id; render(); };
window.setWbTab = (k) => { wbTab = k; render(); };
window.setWbStatus = (v) => { wbStatus = v; render(); };
window.setWbTag = (v) => { wbTag = v; render(); };
window.setWbKw = (v) => { wbKw = v; renderListOnly(); };
window.openMessage = (id) => { location.hash = '#/message/' + id; };

/* ---------- 导出 Excel（所有具备管理职能的身份）：导出当前 Tab + 筛选条件下的列表 ---------- */
function wbExportTs() {
  const d = new Date(), p = (n) => (n < 10 ? '0' + n : '' + n);
  return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes());
}
function buildWbExportWorkbook(list, me) {
  const header = ['编号', '标题', '客户', '提议类型', '标签', '状态', '涉及池', '当前处理人', '发起人', '提出时间', '最近更新', '超时', '详细描述', '回复数', '完整回复记录'];
  const rows = list.map((m) => {
    const links = linksOf(m.id);
    const replies = visibleReplies(me, m);
    const handlers = activeHandlerNames(m);
    const pools = [...new Set(links.map((l) => poolById(l.poolId)).filter(Boolean).map((p) => p.name))].join('、');
    const src = proposalTypeText(m);
    const replySummary = replies.map((r, index) => {
      const parent = r.parentReplyId ? S.replies.find((x) => x.id === r.parentReplyId) : null;
      const atts = (r.attachments || []).map((a) => a.name).filter(Boolean).join('、');
      return (index + 1) + '. [' + fmtTime(r.at) + '] ' + userName(r.authorId) +
        (parent ? ' 回复 ' + userName(parent.authorId) : '') + ' @ ' + poolName(r.poolId) +
        '：' + r.content + (atts ? '（附件：' + atts + '）' : '');
    }).join('\n');
    return [m.no, m.title, m.customerName || '—', src || '—', (m.tags || []).join('、'),
      MSG_STATUS[m.status] || m.status, pools || '—', handlers || '—',
      userName(m.createdBy), fmtTime(m.createdAt), fmtTime(m.updatedAt),
      isMessageOverdue(m) ? '是' : '—', m.content, replies.length, replySummary || '—'];
  });
  const ws = XLSX.utils.aoa_to_sheet([header].concat(rows));
  ws['!cols'] = [{ wch: 9 }, { wch: 28 }, { wch: 24 }, { wch: 14 }, { wch: 16 }, { wch: 12 }, { wch: 24 }, { wch: 12 }, { wch: 9 }, { wch: 17 }, { wch: 17 }, { wch: 6 }, { wch: 60 }, { wch: 8 }, { wch: 90 }];

  const replyHeader = ['问题编号', '问题标题', '回复序号', '回复类型', '回复对象', '回复人', '回复人角色', '所属池', '回复时间', '回复内容', '附件', '点赞数'];
  const replyRows = [];
  list.forEach((m) => {
    visibleReplies(me, m).forEach((r, index) => {
      const author = userById(r.authorId) || {};
      const parent = r.parentReplyId ? S.replies.find((x) => x.id === r.parentReplyId) : null;
      replyRows.push([
        m.no, m.title, index + 1, parent ? '回复评论' : '问题回复', parent ? userName(parent.authorId) : '—',
        userName(r.authorId), author.title || ROLES[author.role] || '—', poolName(r.poolId), fmtTime(r.at), r.content,
        (r.attachments || []).map((a) => a.name).filter(Boolean).join('、') || '—', r.likeCount || 0
      ]);
    });
  });
  const replyWs = XLSX.utils.aoa_to_sheet([replyHeader].concat(replyRows));
  replyWs['!cols'] = [{ wch: 10 }, { wch: 30 }, { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 16 }, { wch: 20 }, { wch: 18 }, { wch: 60 }, { wch: 28 }, { wch: 8 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '信息池消息');
  XLSX.utils.book_append_sheet(wb, replyWs, '回复明细');
  return { workbook: wb, replyCount: replyRows.length };
}

window.exportWbMessages = function() {
  const me = curUser();
  if (!canAccessPoolManage(me)) return;
  if (typeof XLSX === 'undefined') { toast('Excel 组件未加载，无法导出'); return; }
  const list = wbList();
  if (!list.length) { toast('当前筛选条件下没有可导出的消息'); return; }
  const result = buildWbExportWorkbook(list, me);
  XLSX.writeFile(result.workbook, '信息池消息导出-' + wbExportTs() + '.xlsx');
  toast('已导出 ' + list.length + ' 条消息及 ' + result.replyCount + ' 条回复');
};

function renderListOnly() {
  const el = document.getElementById('msgList');
  if (el) el.innerHTML = wbListHtml();
}

/* 名单过长时折叠：按部门分发会有上百人，卡片与去向只展示前 3 人 */
function peopleBrief(ids) {
  const names = (ids || []).map(userName);
  return names.length > 3 ? names.slice(0, 3).join('、') + ' 等 ' + names.length + ' 人' : names.join('、');
}

/* 在办链路的处理人名单（节点＝负责人+秘书，个人＝指定落实人） */
function activeHandlerNames(m) {
  const ids = [...new Set(linksOf(m.id).filter(linkActive).flatMap((l) => recipientsOf(l)))];
  return peopleBrief(ids);
}

/* 工作台与池管理共用的标准信息卡片 */
function messageListCardHtml(m, me) {
  const actLinks = linksOf(m.id).filter(linkActive);
  const handler = activeHandlerNames(m) || '—';
  const src = proposalTypeText(m);

  return '<div class="msg-row" onclick="openMessage(\'' + m.id + '\')">' +
    '<div class="msg-row-top">' +
      '<span class="msg-no">' + esc(m.no) + '</span>' +
      flowBadge(m, me) +
      (isEnded(m) ? '' : '<span class="msg-meta msg-handler">当前处理人：' + esc(handler) + '</span>') +
    '</div>' +
    messageTagLineHtml(m) +
    '<div class="msg-info"><span class="msg-info-label">提议类型：</span>' + esc(src || '—') + '</div>' +
    '<div class="msg-desc"><span class="msg-info-label">详细描述：</span>' + esc(m.content) + '</div>' +
    '<div class="msg-foot">' +
      '<span class="msg-meta">发起人：' + esc(userName(m.createdBy)) + '</span>' +
      '<span class="msg-time">' + fmtTime(m.updatedAt) + '</span>' +
    '</div>' +
  '</div>';
}

/* 工作台 PC 动态表格列：与卡片信息等价（不加标题列），详细描述截断一行、悬浮看全文 */
const WB_COLS = [
  { key: 'no', label: '编号', sort: 'no' },
  { key: 'status', label: '状态' },
  { key: 'src', label: '提议类型', sort: 'src' },
  { key: 'tags', label: '标签' },
  { key: 'handler', label: '当前处理人' },
  { key: 'creator', label: '发起人', sort: 'creator' },
  { key: 'updatedAt', label: '时间', sort: 'updatedAt' },
  { key: 'desc', label: '详细描述', sort: 'desc' }
];
function wbTableHtml(list, me) {
  const head = WB_COLS.map((c) => {
    if (!c.sort) return '<th>' + c.label + '</th>';
    const on = wbSortKey === c.sort;
    const arrow = on ? (wbSortDir > 0 ? ' ▲' : ' ▼') : '';
    return '<th class="sortable' + (on ? ' on' : '') + '" onclick="setWbSort(\'' + c.sort + '\')">' +
      c.label + arrow + '</th>';
  }).join('');
  const rows = list.map((m) => {
    const handler = activeHandlerNames(m) || '—';
    const src = proposalTypeText(m);
    return '<tr onclick="openMessage(\'' + m.id + '\')">' +
      '<td class="t-no">' + esc(m.no) + '</td>' +
      '<td>' + flowBadge(m, me) + '</td>' +
      '<td>' + esc(src || '—') + '</td>' +
      '<td class="t-tags">' + (messageTagsHtml(m) || '—') + '</td>' +
      '<td>' + esc(isEnded(m) ? '—' : handler) + '</td>' +
      '<td>' + esc(userName(m.createdBy)) + '</td>' +
      '<td class="t-time">' + fmtTime(m.updatedAt) + '</td>' +
      '<td class="t-desc" title="' + esc(m.content) + '">' + esc(m.content) + '</td>' +
    '</tr>';
  }).join('');
  return '<table class="wb-table"><thead><tr>' + head + '</tr></thead><tbody>' + rows + '</tbody></table>';
}

function wbListHtml() {
  const me = curUser();
  const list = wbList();
  if (!list.length) return empty('暂无符合条件的消息');
  /* PC 端表格、手机端同款卡片，由 CSS 断点二选一显示 */
  return '<div class="wb-pc">' + wbTableHtml(list, me) + '</div>' +
    '<div class="wb-mb">' + list.map((m) => messageListCardHtml(m, me)).join('') + '</div>';
}

function renderWorkbench() {
  const me = curUser();
  const tab = effectiveWbTab();
  const statusList = (isDispatcher(me) || isAdmin(me) ? [['dispatch', '待分发']] : [])
    .concat([['todo', '待办'], ['done', '已办'], ['ended', '已解决']]);
  const statusOpts = statusList.map((item) =>
    '<option value="' + item[0] + '"' + (wbStatus === item[0] ? ' selected' : '') + '>' + item[1] + '</option>').join('');
  /* 池筛选与池管理页的「目标池」口径一致：只列一级业务池，选中即连带其下部门/小组 */
  const poolOpts = '<option value="all">全部池</option>' + bizPools().map((p) =>
    '<option value="' + p.id + '"' + (wbPool === p.id ? ' selected' : '') + '>' + esc(p.name) + '</option>').join('');
  const tagNames = [...new Set(MESSAGE_TAGS.concat(S.messages.flatMap((m) => m.tags || [])))];
  const tagOpts = '<option value="">全部标签</option>' + tagNames.map((tag) =>
    '<option value="' + esc(tag) + '"' + (wbTag === tag ? ' selected' : '') + '>' + esc(tag) + '</option>').join('');
  return '<div class="wb-main">' +
    '<div class="wb-tabs-row">' +
    '<div class="tabs">' + wbTabs().map((t) =>
      '<div class="tab' + (tab === t.key ? ' on' : '') + '" onclick="setWbTab(\'' + t.key + '\')">' +
        t.name + '<span class="stat-count-pill">' + wbTabCount(t.key) + '</span></div>').join('') +
    '</div>' +
    (canAccessPoolManage(me) ? '<button type="button" class="btn btn-sm wb-export-btn" onclick="exportWbMessages()">导出</button>' : '') +
    '</div>' +
    '<div class="filters">' +
      '<input placeholder="搜索编号 / 关键字" value="' + esc(wbKw) + '" oninput="setWbKw(this.value)">' +
      '<select onchange="setWbPool(this.value)">' + poolOpts + '</select>' +
      '<select onchange="setWbStatus(this.value)"><option value="">全部状态</option>' + statusOpts + '</select>' +
      '<select onchange="setWbTag(this.value)">' + tagOpts + '</select>' +
    '</div>' +
    '<div id="msgList">' + wbListHtml() + '</div>' +
  '</div>';
}

/* ==========================================================================
 * 1.2 消息中心（回复 / 流转 / 确认通知）
 * ========================================================================== */
function notificationReadKey() { return 'flow_notification_read_' + curUser().id; }
function readNotificationIds() {
  try { return JSON.parse(localStorage.getItem(notificationReadKey()) || '[]'); }
  catch (e) { return []; }
}
function notificationsForMe() {
  const uid = curUser().id;
  /* 回复和赞同从业务数据反向生成，旧 Mock 数据也能完整展示互动人。 */
  const stored = (S.notifications || []).filter((n) => n.to === uid && !['reply', 'like', 'favorite'].includes(n.type));
  const derived = [];
  const replySeen = new Set();
  (S.replies || []).forEach((r) => {
    const m = findMsg(r.messageId);
    if (!m || r.authorId === uid) return;
    const parent = r.parentReplyId ? S.replies.find((x) => x.id === r.parentReplyId) : null;
    if (m.createdBy === uid || (parent && parent.authorId === uid)) {
      const id = 'social_reply_' + uid + '_' + r.id;
      if (!replySeen.has(id)) {
        replySeen.add(id);
        derived.push({
          id, at: r.at, to: uid, actorId: r.authorId, messageId: m.id, type: 'reply',
          content: userName(r.authorId) + (parent && parent.authorId === uid ? ' 回复了你的评论' : ' 回复了你发布的信息')
        });
      }
    }
  });
  (S.messages || []).filter((m) => m.createdBy === uid).forEach((m) => {
    (m.likedByUserIds || []).filter((id) => id !== uid).forEach((actorId) => derived.push({
      id: 'social_like_msg_' + uid + '_' + m.id + '_' + actorId,
      at: m.updatedAt, to: uid, actorId, messageId: m.id, type: 'like',
      content: userName(actorId) + ' 赞同了你发布的信息'
    }));
  });
  (S.replies || []).filter((r) => r.authorId === uid).forEach((r) => {
    (r.likedByUserIds || []).filter((id) => id !== uid).forEach((actorId) => derived.push({
      id: 'social_like_reply_' + uid + '_' + r.id + '_' + actorId,
      at: r.at, to: uid, actorId, messageId: r.messageId, type: 'like',
      content: userName(actorId) + ' 赞同了你的回复'
    }));
  });
  return stored.concat(derived).sort((a, b) => b.at - a.at);
}
function unreadNotificationCount() {
  const read = new Set(readNotificationIds());
  return notificationsForMe().filter((n) => !read.has(n.id)).length;
}
function saveReadNotificationIds(ids) {
  localStorage.setItem(notificationReadKey(), JSON.stringify([...new Set(ids)]));
}
window.openNotification = (id) => {
  const n = notificationsForMe().find((x) => x.id === id);
  if (!n) return;
  saveReadNotificationIds(readNotificationIds().concat(id));
  if (n.messageId) location.hash = '#/message/' + n.messageId;
  else render();
};
window.markAllNotificationsRead = () => {
  saveReadNotificationIds(notificationsForMe().map((n) => n.id));
  render();
};

function notificationKind(n) {
  const text = n.content || '';
  if (n.type === 'reply') return { key: 'reply', cls: 'reply', label: '回复' };
  if (n.type === 'like') return { key: 'like', cls: 'like', label: '赞同' };
  if (text.indexOf('回复') > -1) return { key: 'reply', cls: 'reply', label: '回复' };
  if (text.indexOf('赞同') > -1) return { key: 'like', cls: 'like', label: '赞同' };
  if (n.type === 'assign') return { key: 'task', cls: 'task', label: '任务' };
  if (text.indexOf('确认') > -1 || text.indexOf('关闭') > -1) return { key: 'system', cls: 'confirm', label: '确认' };
  if (text.indexOf('分发') > -1 || text.indexOf('流转') > -1 || text.indexOf('直投') > -1) return { key: 'task', cls: 'task', label: '任务' };
  return { key: 'system', cls: 'system', label: '通知' };
}

function noticeCategoryIcon(key) {
  const paths = {
    reply: '<path d="M5 5h14v10H9l-4 4V5z"/>',
    like: '<path d="M12 20S4 15.5 4 9.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 8 2.5C20 15.5 12 20 12 20z"/>'
  };
  return '<svg viewBox="0 0 24 24" aria-hidden="true">' + paths[key] + '</svg>';
}

function noticeRowsHtml(list, read) {
  return list.map((n) => {
    const kind = notificationKind(n);
    const m = n.messageId ? findMsg(n.messageId) : null;
    const actor = n.actorId ? userById(n.actorId) : null;
    const glyph = kind.key === 'reply' ? '回' : kind.key === 'like' ? '赞' : kind.key === 'task' ? '任' : kind.cls === 'confirm' ? '确' : '知';
    return '<button type="button" class="notice-row' + (!read.has(n.id) ? ' unread' : '') + '" onclick="openNotification(\'' + n.id + '\')">' +
      '<span class="notice-icon notice-' + kind.cls + '">' + (actor ? esc(actor.name.slice(0, 1)) : glyph) + '</span>' +
      '<span class="notice-body"><span class="notice-head"><b>' + esc(actor ? actor.name : kind.label) + '</b><time>' + fmtTime(n.at) + '</time></span>' +
        '<span class="notice-content">' + esc(n.content) + '</span>' +
        (m ? '<span class="notice-link">' + esc(m.no) + ' · ' + esc(m.title) + '</span>' : '') +
      '</span>' + (!read.has(n.id) ? '<i class="notice-dot" aria-label="未读"></i>' : '') +
    '</button>';
  }).join('');
}

function renderNotifications() {
  const list = notificationsForMe();
  const read = new Set(readNotificationIds());
  const unread = list.filter((n) => !read.has(n.id)).length;
  const categories = [
    { key: 'reply', route: 'replies', label: '回复' },
    { key: 'like', route: 'likes', label: '赞同' }
  ];
  const social = list.filter((n) => ['reply', 'like'].includes(notificationKind(n).key));
  const tasks = list.filter((n) => !['reply', 'like'].includes(notificationKind(n).key));
  return '<div class="section-page">' +
    '<div class="section-page-head"><div><h1>消息</h1><p>处理分发给你的任务，查看与你相关的互动</p></div>' +
      (unread ? '<button type="button" class="text-btn" onclick="markAllNotificationsRead()">全部已读</button>' : '') + '</div>' +
    '<div class="notice-category-grid">' + categories.map((c) => {
      const items = social.filter((n) => notificationKind(n).key === c.key);
      const newCount = items.filter((n) => !read.has(n.id)).length;
      return '<a class="notice-category" href="#/notifications/' + c.route + '">' +
        '<span class="notice-category-icon">' + noticeCategoryIcon(c.key) + (newCount ? '<i>' + newCount + '</i>' : '') + '</span>' +
        '<b>' + c.label + '我的</b><small>' + items.length + ' 条</small></a>';
    }).join('') + '</div>' +
    '<div class="notice-section-head"><b>任务与消息</b><span>' + tasks.length + ' 条</span></div>' +
    '<div class="notice-list">' + (noticeRowsHtml(tasks, read) || empty('暂无任务与消息')) + '</div>' +
  '</div>';
}

window.markNotificationKindRead = (key) => {
  const ids = notificationsForMe().filter((n) => notificationKind(n).key === key).map((n) => n.id);
  saveReadNotificationIds(readNotificationIds().concat(ids));
  render();
};

function renderNotificationInteractions(key) {
  const config = key === 'like'
    ? { label: '赞同我的', desc: '查看谁赞同了你发布的信息或回复', emptyText: '还没有收到赞同' }
    : { label: '回复我的', desc: '查看谁回复了你发布的信息或评论', emptyText: '还没有收到回复' };
  const read = new Set(readNotificationIds());
  const items = notificationsForMe().filter((n) => notificationKind(n).key === key);
  const unread = items.filter((n) => !read.has(n.id)).length;
  const backIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>';
  return '<div class="section-page">' +
    '<a class="notice-back-link" href="#/notifications">' + backIcon + '<span>返回消息</span></a>' +
    '<div class="section-page-head"><div><h1>' + config.label + '</h1><p>' + config.desc + '</p></div>' +
      (unread ? '<button type="button" class="text-btn" onclick="markNotificationKindRead(\'' + key + '\')">全部已读</button>' : '') + '</div>' +
    '<div class="notice-list">' + (noticeRowsHtml(items, read) || empty(config.emptyText)) + '</div>' +
  '</div>';
}

/* ==========================================================================
 * 1.3 我的互动（我的回复 / 我赞过的）
 * ========================================================================== */
let myInteractionTab = 'replies';
window.setMyInteractionTab = (tab) => { myInteractionTab = tab; render(); };

function interactionRows(list, mode) {
  const me = curUser();
  return list.map((r) => {
    const m = findMsg(r.messageId);
    if (!m) return '';
    const author = userById(r.authorId) || {};
    return '<button type="button" class="interaction-row" onclick="openMessage(\'' + m.id + '\')">' +
      '<span class="interaction-top"><span class="interaction-message">' + esc(m.no) + ' · ' + esc(m.title) + '</span><time>' + fmtTime(r.at) + '</time></span>' +
      '<span class="interaction-copy">' + esc(r.content) + '</span>' +
      '<span class="interaction-meta">' + (mode === 'liked' ? '来自 ' + esc(author.name || '未知用户') + ' · ' : '') +
        (mode === 'liked' ? '已赞' : '我在 ' + esc(poolName(r.poolId)) + ' 回复') +
        (r.likeCount ? ' · ' + r.likeCount + ' 人点赞' : '') + '</span>' +
    '</button>';
  }).join('');
}

function publishedInteractionRows(list) {
  return list.map((m) => {
    const replies = repliesOf(m.id);
    return '<button type="button" class="interaction-row published-row" onclick="openMessage(\'' + m.id + '\')">' +
      '<span class="interaction-top"><span class="interaction-message">' + esc(m.no) + ' · ' + esc(m.title) + '</span><time>' + fmtTime(m.createdAt) + '</time></span>' +
      '<span class="interaction-copy">' + esc(m.content) + '</span>' +
      '<span class="interaction-meta">发布于 ' + fmtTime(m.createdAt) + ' · ' + replies.length + ' 条回复</span>' +
    '</button>';
  }).join('');
}

function renderMyInteractions() {
  const me = curUser();
  const mine = (S.replies || []).filter((r) => r.authorId === me.id).sort((a, b) => b.at - a.at);
  const published = (S.messages || []).filter((m) => m.createdBy === me.id).sort((a, b) => b.createdAt - a.createdAt);
  const liked = (S.replies || []).filter((r) => (r.likedByUserIds || []).includes(me.id)).sort((a, b) => b.at - a.at);
  const current = myInteractionTab === 'liked' ? liked : mine;
  const currentHtml = myInteractionTab === 'published' ? publishedInteractionRows(published) : interactionRows(current, myInteractionTab);
  const emptyText = myInteractionTab === 'liked' ? '暂无赞过的回复' : myInteractionTab === 'published' ? '暂无发布记录' : '暂无回复记录';
  return '<div class="section-page">' +
    '<div class="profile-strip"><span class="profile-avatar">' + esc(me.name.slice(0, 1)) + '</span>' +
      '<span><b>' + esc(me.name) + '</b><small>' + esc(me.title || ROLES[me.role] || '') + '</small></span></div>' +
    '<div class="section-page-head"><div><h1>我的互动</h1><p>查看你回复、发布和赞过的内容</p></div></div>' +
    '<div class="interaction-tabs" role="tablist">' +
      '<button class="' + (myInteractionTab === 'replies' ? 'on' : '') + '" onclick="setMyInteractionTab(\'replies\')">我回复的 <span>' + mine.length + '</span></button>' +
      '<button class="' + (myInteractionTab === 'published' ? 'on' : '') + '" onclick="setMyInteractionTab(\'published\')">我发布的 <span>' + published.length + '</span></button>' +
      '<button class="' + (myInteractionTab === 'liked' ? 'on' : '') + '" onclick="setMyInteractionTab(\'liked\')">我赞过的 <span>' + liked.length + '</span></button>' +
    '</div>' +
    '<div class="interaction-list">' + (currentHtml || empty(emptyText)) + '</div>' +
  '</div>';
}

/* ==========================================================================
 * 1.5. 信息池（全景信息中心与全池记录浏览）
 * ========================================================================== */
let ipTab = 'all';     /* all, dispatch, handling, summarize, closed, overdue */
let ipPool = 'all';    /* all or specific poolId */
let ipSource = 'all';  /* all or specific source */
let ipKw = '';         /* 搜索关键词 */
let ipSort = 'updated';/* updated, created */

function ipTabs() {
  return [
    { key: 'all', name: '全部信息' },
    { key: 'dispatch', name: '待分发' },
    { key: 'handling', name: '处理中' },
    { key: 'summarize', name: '待汇总' },
    { key: 'closed', name: '已完成' },
    { key: 'overdue', name: '超时预警' }
  ];
}

function ipList() {
  let list = visibleMessages();

  if (ipTab === 'dispatch') {
    list = list.filter((m) => m.status === 'dispatch');
  } else if (ipTab === 'handling') {
    list = list.filter((m) => m.status === 'handling');
  } else if (ipTab === 'summarize') {
    list = list.filter((m) => m.status === 'summarize');
  } else if (ipTab === 'closed') {
    list = list.filter((m) => m.status === 'closed');
  } else if (ipTab === 'overdue') {
    list = list.filter((m) => isMessageOverdue(m));
  }

  if (ipPool !== 'all') {
    list = list.filter((m) => msgInPool(m, ipPool));
  }

  if (ipSource !== 'all') {
    list = list.filter((m) => proposalTypeMatches(m, ipSource));
  }

  if (ipKw) list = list.filter((m) => msgKeywordMatch(m, ipKw));

  if (ipSort === 'created') {
    list.sort((a, b) => b.createdAt - a.createdAt);
  } else {
    list.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  return list;
}

window.setIpTab = (t) => { ipTab = t; render(); };
window.setIpPool = (p) => { ipPool = p; render(); };
window.setIpSource = (s) => { ipSource = s; render(); };
window.setIpSort = (s) => { ipSort = s; render(); };
window.setIpKw = (k) => {
  ipKw = k;
  const el = document.getElementById('ipListContainer');
  if (el) el.innerHTML = ipListHtml();
};

function ipListHtml() {
  const list = ipList();
  if (!list.length) return empty('信息池中暂无符合条件的数据');

  return list.map((m) => {
    const activeLinks = linksOf(m.id).filter(linkActive);
    const poolNames = activeLinks.map((l) => poolName(l.poolId)).filter(Boolean);
    const poolTag = poolNames.length ? poolNames.join('、')
      : (m.status === 'dispatch' ? poolName(m.sourcePoolId) + '（待分发）' : poolName(m.sourcePoolId));

    const handlerNames = activeHandlerNames(m);
    const handlers = handlerNames || '';
    const isOverdue = isMessageOverdue(m);
    const overdueDays = m.overdueDays || (isOverdue ? 1 : 0);

    const src = proposalTypeText(m);

    return '<div class="msg-row" onclick="openMessage(\'' + m.id + '\')">' +
      '<div class="msg-row-top">' +
        '<span class="msg-no">' + esc(m.no) + '</span>' +
        badge(m.status) +
        (isOverdue ? '<span class="badge b-unresolved">超时 ' + overdueDays + ' 天</span>' : '') +
        '<span class="badge b-p_exec" style="max-width:260px; overflow:hidden; text-overflow:ellipsis;" title="当前归属池：' + esc(poolTag) + '">归属池：' + esc(poolTag) + '</span>' +
        (isEnded(m) ? '' : '<span class="msg-meta msg-handler">当前处理人：' + esc(handlers || '—') + '</span>') +
      '</div>' +
      '<div class="msg-title" style="font-size:14px; font-weight:600; color:#1f2430; margin:2px 0;">' + esc(m.title) + '</div>' +
      (src ? '<div class="msg-info"><span class="msg-info-label">提议类型：</span>' + esc(src) + '</div>' : '') +
      (m.customerName ? '<div class="msg-info"><span class="msg-info-label">关联客户：</span><b style="color:#2f6bff;">' + esc(m.customerName) + '</b></div>' : '') +
      '<div class="msg-desc"><span class="msg-info-label">详细描述：</span>' + esc(m.content) + '</div>' +
      '<div class="msg-foot">' +
        '<span class="msg-meta">发起人：' + esc(userName(m.createdBy)) + '</span>' +
        '<span class="msg-time">更新于 ' + fmtTime(m.updatedAt) + '</span>' +
      '</div>' +
    '</div>';
  }).join('');
}

function renderInfoPool() {
  const me = curUser();
  const list = visibleMessages().sort((a, b) => b.updatedAt - a.updatedAt);
  const cards = list.map((m) => {
    const author = userById(m.createdBy) || {};
    const replies = repliesOf(m.id);
    const likeCount = replies.reduce((sum, r) => sum + (r.likeCount || 0), 0);
    const sources = proposalTypes(m).concat(m.sourceOther ? [m.sourceOther] : []);
    const topicTags = sources.concat(m.tags || []);
    return '<article class="square-card" tabindex="0" role="link" onclick="openMessage(\'' + m.id + '\')" ' +
      'onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();openMessage(\'' + m.id + '\')}">' +
      '<div class="square-byline">' +
        '<span class="square-avatar">' + esc((author.name || '系').slice(0, 1)) + '</span>' +
        '<span class="square-author"><b>' + esc(author.name || '系统') + '</b><small>' + esc(author.dept || '') + '</small></span>' +
        '<time>' + fmtTime(m.updatedAt) + '</time>' +
      '</div>' +
      '<h2>' + esc(m.title) + '</h2>' +
      '<p class="square-copy">' + esc(m.content) + '</p>' +
      (topicTags.length ? '<div class="square-topics">' + topicTags.map((tag) => '<span>' + esc(tag) + '</span>').join('') + '</div>' : '') +
      '<div class="square-actions">' +
        '<span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14v10H9l-4 4V5z"/></svg>' + replies.length + ' 条回复</span>' +
        '<span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10v10H4V10h3zm3 10V9l4-6 1 1v5h4a2 2 0 0 1 2 2l-2 9h-9z"/></svg>' + likeCount + ' 个赞</span>' +
        '<span class="square-no">' + esc(m.no) + '</span>' +
      '</div>' +
    '</article>';
  }).join('');

  return '<div class="square-page">' +
    '<header class="square-head"><div><h1>信息广场</h1><p>' + esc(me.name) + '可见的信息，按最近互动排序</p></div>' +
      '<span>' + list.length + ' 条内容</span></header>' +
    '<div class="square-feed">' + (cards || empty('暂无可见信息')) + '</div>' +
  '</div>';
}

/* ==========================================================================
 * 2. 我要填报（投递）
 * ========================================================================== */
let newMsgAtts = [];
let newSources = [];
let newTargetPool = null;
let newDraft = { content: '', customerName: '', sourceOther: '' };
let newCustomerQuery = '';
let newVoiceRecording = false;

function captureNewDraft() {
  const c = document.getElementById('newContent');
  const cn = document.getElementById('newCustomer');
  const so = document.getElementById('newSourceOther');
  if (c) newDraft.content = c.value;
  if (cn) newDraft.customerName = cn.value;
  if (so) newDraft.sourceOther = so.value;
}

window.newAttChange = (input) => {
  [...input.files].forEach((f) => newMsgAtts.push({ name: f.name, size: f.size }));
  input.value = '';
  renderAttChips();
};
window.delNewAtt = (i) => { newMsgAtts.splice(i, 1); renderAttChips(); };
function renderAttChips() {
  const el = document.getElementById('newAttChips');
  if (el) el.innerHTML = newMsgAtts.map((a, i) =>
    '<span class="att-chip">' + esc(a.name) + '（' + fmtSize(a.size) + '）<b onclick="delNewAtt(' + i + ')">×</b></span>').join('');
}

window.toggleNewSource = (source) => {
  captureNewDraft();
  const i = newSources.indexOf(source);
  if (i > -1) newSources.splice(i, 1); else newSources.push(source);
  render();
};
function renderNewSources() {
  const el = document.getElementById('newSourceChips');
  if (el) el.innerHTML = SOURCE_OPTIONS.map((s) =>
    '<span class="chip' + (newSources.includes(s) ? ' on' : '') + '" onclick="toggleNewSource(\'' + s + '\')">' + esc(s) + '</span>').join('');
}

/* 投递目标：8 个业务池之一，进池即直投该池负责人+秘书，李倩影同步跟进 */
window.setNewTargetPool = (poolId) => {
  captureNewDraft();
  newTargetPool = poolId;
  renderNewPools();
};
function renderNewPools() {
  const el = document.getElementById('newPoolChips');
  if (!el) return;
  el.innerHTML = bizPools().map((p) => {
    const owner = (p.ownerIds || []).map(userName).join('、');
    return '<span class="chip' + (newTargetPool === p.id ? ' on' : '') + '" title="' +
      esc(owner ? '负责人 ' + owner : p.name) + '" onclick="setNewTargetPool(\'' + p.id + '\')">' +
      esc(p.name) + '</span>';
  }).join('');
}

function newCustomerOptionsHtml(query) {
  const kw = (query || '').trim().toLowerCase();
  const matches = CUSTOMERS.filter((name) => !kw || name.toLowerCase().includes(kw));
  if (!matches.length) return '<div class="customer-picker-empty">未找到匹配客户</div>';
  return matches.map((name) =>
    '<button type="button" class="customer-picker-option' + (newDraft.customerName === name ? ' selected' : '') + '" ' +
      'data-name="' + esc(name) + '" onmousedown="event.preventDefault()" onclick="selectNewCustomer(this.dataset.name)">' +
      '<span>' + esc(name) + '</span>' + (newDraft.customerName === name ? '<b>✓</b>' : '') +
    '</button>'
  ).join('');
}

window.openNewCustomerPicker = () => {
  const picker = document.getElementById('newCustomerPicker');
  if (picker) picker.classList.add('show');
};
window.closeNewCustomerPicker = () => {
  setTimeout(() => {
    const picker = document.getElementById('newCustomerPicker');
    if (picker) picker.classList.remove('show');
  }, 120);
};
window.filterNewCustomers = (value) => {
  newCustomerQuery = value;
  newDraft.customerName = '';
  const hidden = document.getElementById('newCustomer');
  if (hidden) hidden.value = '';
  const options = document.getElementById('newCustomerOptions');
  if (options) options.innerHTML = newCustomerOptionsHtml(value);
  openNewCustomerPicker();
};
window.selectNewCustomer = (name) => {
  newDraft.customerName = name;
  newCustomerQuery = name;
  const input = document.getElementById('newCustomerSearch');
  const hidden = document.getElementById('newCustomer');
  const picker = document.getElementById('newCustomerPicker');
  if (input) input.value = name;
  if (hidden) hidden.value = name;
  if (picker) picker.classList.remove('show');
};

window.toggleNewVoice = () => {
  const textarea = document.getElementById('newContent');
  if (textarea) newDraft.content = textarea.value;
  if (newVoiceRecording) {
    newVoiceRecording = false;
    const transcript = '客户反馈结算单超过约定时间仍未出具，请相关池协同确认原因并尽快反馈处理进展。';
    const current = (newDraft.content || '').trim();
    newDraft.content = current ? current + '\n' + transcript : transcript;
    toast('语音已转写到详细描述');
  } else {
    newVoiceRecording = true;
    toast('开始语音转写');
  }
  render();
  setTimeout(() => {
    const next = document.getElementById('newContent');
    if (next) next.focus();
  }, 0);
};

window.submitNew = () => {
  captureNewDraft();
  const content = newDraft.content.trim();
  if (!newSources.length) { toast('请选择提议类型'); return; }
  if (newSources.includes('客需') && !newDraft.customerName) { toast('选择客需时必须填写客户名称'); return; }
  if (newSources.includes('其他') && !newDraft.sourceOther.trim()) { toast('选择其他时必须填写类型说明'); return; }
  if (!content) { toast('请填写问题描述'); return; }
  if (!newTargetPool) { toast('请选择 1 个投递目标池'); return; }
  const m = createMessage({
    poolId: newTargetPool, content,
    sources: newSources.slice(),
    customerName: newSources.includes('客需') ? newDraft.customerName : '',
    sourceOther: newSources.includes('其他') ? newDraft.sourceOther.trim() : '',
    attachments: newMsgAtts.slice()
  });
  if (!m || m.ok === false) { toast(m.msg || '提交失败'); return; }
  newMsgAtts = [];
  newSources = [];
  newTargetPool = null;
  newDraft = { content: '', customerName: '', sourceOther: '' };
  newCustomerQuery = '';
  newVoiceRecording = false;
  const tp = poolById(m.sourcePoolId);
  toast('已投递到' + tp.name + '池，直投 ' + peopleBrief(nodeRecipients(tp)) + '，李倩影同步跟进');
  location.hash = '#/message/' + m.id;
};

function renderNew() {
  const needCustomer = newSources.includes('客需');
  const needOther = newSources.includes('其他');
  return '<div class="card" style="max-width:720px;margin:0 auto 14px">' +
    '<div class="form-row"><div class="form-label">提议类型<span class="req">*</span></div>' +
      '<div class="chip-group" id="newSourceChips"></div></div>' +
    (needCustomer ?
      '<div class="form-row"><div class="form-label">客户名称<span class="req">*</span></div>' +
        '<div class="customer-picker" id="newCustomerPicker">' +
          '<input type="text" id="newCustomerSearch" autocomplete="off" placeholder="搜索并选择客户" value="' + esc(newDraft.customerName || newCustomerQuery) + '" ' +
            'onfocus="openNewCustomerPicker()" onblur="closeNewCustomerPicker()" oninput="filterNewCustomers(this.value)">' +
          '<input type="hidden" id="newCustomer" value="' + esc(newDraft.customerName) + '">' +
          '<span class="customer-picker-arrow">⌄</span>' +
          '<div class="customer-picker-options" id="newCustomerOptions">' + newCustomerOptionsHtml(newCustomerQuery) + '</div>' +
        '</div></div>' : '') +
    (needOther ?
      '<div class="form-row"><div class="form-label">类型说明<span class="req">*</span></div>' +
        '<input type="text" id="newSourceOther" placeholder="请填写具体提议类型" value="' + esc(newDraft.sourceOther) + '"></div>' : '') +
    '<div class="form-row"><div class="form-label">目标池<span class="req">*</span></div>' +
      '<div class="chip-group" id="newPoolChips"></div></div>' +
    '<div class="form-row"><div class="form-label">详细描述<span class="req">*</span></div>' +
      '<div class="voice-textarea-wrap' + (newVoiceRecording ? ' recording' : '') + '">' +
        '<textarea id="newContent" placeholder="背景、诉求、涉及的客户或业务线等" oninput="newDraft.content=this.value">' + esc(newDraft.content) + '</textarea>' +
        '<button type="button" class="voice-transcribe-btn" onclick="toggleNewVoice()" aria-label="' + (newVoiceRecording ? '结束语音转写' : '开始语音转写') + '" title="' + (newVoiceRecording ? '结束语音转写' : '语音转写') + '">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V7a3 3 0 0 0-3-3z"></path><path d="M5 11v1a7 7 0 0 0 14 0v-1"></path><path d="M12 19v3"></path><path d="M8 22h8"></path></svg>' +
        '</button>' +
        (newVoiceRecording ? '<div class="voice-transcribe-tip"><span></span>正在聆听并实时转写，再点话筒完成</div>' : '') +
      '</div></div>' +
    '<div class="form-row"><div class="form-label">附件</div>' +
      '<div class="upbtns">' +
        '<button type="button" class="btn btn-ghost btn-sm" onclick="document.getElementById(\'newAttCam\').click()">拍照上传</button>' +
        '<button type="button" class="btn btn-ghost btn-sm" onclick="document.getElementById(\'newAttAlbum\').click()">相册上传</button>' +
        '<button type="button" class="btn btn-ghost btn-sm" onclick="document.getElementById(\'newAttFile\').click()">文件上传</button>' +
      '</div>' +
      '<input type="file" id="newAttCam" accept="image/*" capture="environment" style="display:none" onchange="newAttChange(this)">' +
      '<input type="file" id="newAttAlbum" accept="image/*" style="display:none" onchange="newAttChange(this)">' +
      '<input type="file" id="newAttFile" multiple style="display:none" onchange="newAttChange(this)">' +
      '<div class="att-chips" id="newAttChips"></div></div>' +
    '<div style="display:flex;justify-content:flex-end;gap:10px">' +
      '<button class="btn" onclick="submitNew()">提交</button>' +
    '</div>' +
  '</div>';
}
function afterRenderNew() {
  renderNewSources();
  renderNewPools();
  renderAttChips();
}

/* ==========================================================================
 * 3. 分发 / 流转弹窗（分发入口在工作台消息行与消息详情页）
 * ========================================================================== */
let modalState = null;
/* 二级弹窗：按组织架构选落实人的状态 */
let orgPicker = null;

const MESSAGE_TAGS = ['重点督办', '高优先级', '需协同'];
function messageTagsHtml(m) {
  return (m.tags || []).map((tag) => '<span class="message-tag">' + esc(tag) + '</span>').join('');
}
function messageTagLineHtml(m) {
  if (!(m.tags || []).length) return '';
  return '<div class="message-tag-line">' +
    '<svg class="message-tag-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 13l-7 7L4 11V4h7l9 9z"></path><circle cx="8.5" cy="8.5" r="1.5"></circle></svg>' +
    messageTagsHtml(m) +
  '</div>';
}

window.openTagModal = (msgId) => {
  modalState = { mode: 'tag', msgId };
  showModal();
};

window.applyMessageTag = (msgId, tag) => {
  const m = findMsg(msgId);
  if (!m) return;
  if (tag === '已解决' || tag === '未解决') {
    const me = curUser();
    closeModal();
    /* 发起人：只记录在时间线上，不改状态、不重新拉起处理 */
    if (!isDispatcher(me) && !isAdmin(me)) {
      const r = recordResolveMark(msgId, tag);
      toast(r.ok ? r.msg + '（不影响流转）' : r.msg);
      if (r.ok) render();
      return;
    }
    /* 李倩影：仍然驱动状态机，两项都始终可点，已是当前状态时只提示 */
    if ((m.status === 'closed') === (tag === '已解决')) { toast('当前已是' + tag); return; }
    const result = tag === '已解决' ? resolveMessage(msgId) : reopenMessage(msgId);
    if (!result.ok) { toast(result.msg); return; }
    toast('已标记为' + tag);
    render();
    return;
  }
  const r = toggleMessageTag(msgId, tag);
  if (!r.ok) { toast(r.msg); return; }
  closeModal();
  toast(r.active ? '已添加“' + tag + '”标签' : '已取消“' + tag + '”标签');
  render();
};

window.openDispatchModal = (id) => {
  const m = findMsg(id);
  modalState = {
    mode: 'dispatch', msgId: id, selected: [], kw: '', collapsed: [],
    anchorPoolId: m ? dispatchAnchorPoolId(curUser(), m) : null,
    orgExpanded: []
  };
  showModal();
};
window.openForwardModal = (msgId, linkId) => {
  modalState = { mode: 'forward', msgId, fromLinkId: linkId, selected: [], kw: '', collapsed: [] };
  showModal();
};
function showModal() {
  document.getElementById('modalMask').classList.add('show');
  document.getElementById('modal').classList.add('show');
  renderModal();
}
window.closeModal = () => {
  closeOrgPicker();
  document.getElementById('modalMask').classList.remove('show');
  document.getElementById('modal').classList.remove('show');
  modalState = null;
};

/* 池成员（负责人 + 成员，去重） */
function membersOf(p) { return [...new Set(p.ownerIds.concat(p.memberIds))]; }

window.toggleMtNode = (pid) => {
  if (!modalState) return;
  modalState.collapsed = modalState.collapsed || [];
  const i = modalState.collapsed.indexOf(pid);
  if (i > -1) modalState.collapsed.splice(i, 1); else modalState.collapsed.push(pid);
  renderModal();
  restoreKwFocus();
};
window.modalKwInput = (v) => {
  if (!modalState) return;
  modalState.kw = v;
  renderModal();
  restoreKwFocus();
};
function restoreKwFocus() {
  const el = document.getElementById('modalKw');
  if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
}

/* 勾选节点（负责人+秘书）：与同池的指定落实人互斥 */
window.toggleSelPool = (pid) => {
  if (!modalState) return;
  const key = 'pool:' + pid;
  const i = modalState.selected.indexOf(key);
  if (i > -1) modalState.selected.splice(i, 1);
  else {
    modalState.selected.push(key);
    modalState.selected = modalState.selected.filter((k) => k.indexOf('pers:' + pid + '|') !== 0);
  }
  renderModal();
  restoreKwFocus();
};

/* 弹出组织架构选人（二级弹窗）：候选范围为全公司，本池成员置顶 */
window.openOrgPicker = (pid) => {
  if (!modalState) return;
  const cur = (modalState.selected || [])
    .filter((k) => k.indexOf('pers:' + pid + '|') === 0)
    .map((k) => k.slice(k.lastIndexOf('|') + 1));
  orgPicker = { mode: 'assign', poolId: pid, kw: '', picked: cur };
  document.getElementById('orgMask').classList.add('show');
  document.getElementById('orgModal').classList.add('show');
  renderOrgPicker();
};

/* 分享：与分发同一套部门员工组织架构弹窗（主弹窗），勾选部门＝分享给该部门全员 */
window.openSharePicker = (msgId) => {
  const m = findMsg(msgId);
  if (!m) return;
  if (!canShareMessage(curUser(), m)) { toast('当前身份无权分享'); return; }
  modalState = { mode: 'share', msgId, selected: [], kw: '', collapsed: [], orgExpanded: [] };
  showModal();
};

window.closeOrgPicker = () => {
  document.getElementById('orgMask').classList.remove('show');
  document.getElementById('orgModal').classList.remove('show');
  orgPicker = null;
};

window.orgPickerKw = (v) => {
  if (!orgPicker) return;
  orgPicker.kw = v;
  renderOrgPicker();
  const el = document.getElementById('orgKw');
  if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
};

/* 切换单人勾选（多选） */
window.orgPickToggle = (uid) => {
  if (!orgPicker) return;
  const i = orgPicker.picked.indexOf(uid);
  if (i > -1) orgPicker.picked.splice(i, 1); else orgPicker.picked.push(uid);
  renderOrgPicker();
};

/* 整部门全选 / 取消全选 */
window.orgPickGroup = (gi) => {
  if (!orgPicker) return;
  const g = orgPickerGroups()[gi];
  if (!g) return;
  const ids = g.users.map((u) => u.id);
  const allOn = ids.every((id) => orgPicker.picked.indexOf(id) > -1);
  if (allOn) orgPicker.picked = orgPicker.picked.filter((id) => ids.indexOf(id) === -1);
  else ids.forEach((id) => { if (orgPicker.picked.indexOf(id) === -1) orgPicker.picked.push(id); });
  renderOrgPicker();
};

/* 确定：分享模式直接落库；指派模式写回主弹窗选中集，与同池的整池模式互斥 */
window.confirmOrgPicker = () => {
  if (!orgPicker) return;
  if (orgPicker.mode === 'share') {
    const r = shareMessage(orgPicker.msgId, orgPicker.picked);
    closeOrgPicker();
    if (!r.ok) { toast(r.msg); return; }
    toast('已分享给 ' + r.count + ' 人');
    render();
    return;
  }
  if (!modalState) return;
  const pid = orgPicker.poolId;
  modalState.selected = modalState.selected.filter((k) =>
    k !== 'pool:' + pid && k.indexOf('pers:' + pid + '|') !== 0);
  orgPicker.picked.forEach((uid) => modalState.selected.push('pers:' + pid + '|' + uid));
  const n = orgPicker.picked.length;
  closeOrgPicker();
  renderModal();
  if (n) toast('已指定 ' + n + ' 位落实人');
};

/* 候选分组：本池成员单独一组置顶，其余按部门分组；
 * 输入关键字时追加「公司人员」分组，可检索部门员工组织架构里的全部 1294 名员工 */
function orgPickerGroups() {
  if (!orgPicker) return [];
  const pool = poolById(orgPicker.poolId);
  const k = (orgPicker.kw || '').trim().toLowerCase();
  const match = (u) => !k ||
    (u.name || '').toLowerCase().includes(k) ||
    (u.dept || '').toLowerCase().includes(k) ||
    (u.title || '').toLowerCase().includes(k);
  const memIds = pool ? membersOf(pool) : [];
  const groups = [];
  const mems = memIds.map((id) => userById(id)).filter(Boolean).filter(match);
  if (mems.length) groups.push({ name: '本池成员', users: mems, own: true });
  const listed = {};
  memIds.forEach((id) => { listed[id] = 1; });
  USERS.filter((u) => memIds.indexOf(u.id) === -1 && match(u)).forEach((u) => {
    listed[u.id] = 1;
    const d = u.dept || '其他人员';
    let g = groups.find((x) => x.name === d && !x.own);
    if (!g) { g = { name: d, users: [] }; groups.push(g); }
    g.users.push(u);
  });
  if (k) {
    orgSearchUsers(k, 80).forEach((u) => {
      if (listed[u.id]) return;
      listed[u.id] = 1;
      const d = u.dept || '公司人员';
      let g = groups.find((x) => x.name === d && !x.own);
      if (!g) { g = { name: d, users: [] }; groups.push(g); }
      g.users.push(u);
    });
  }
  return groups;
}

/* 复用「添加池成员」同款组织架构选择形态：部门分组复选框、本池成员置顶为首组，
 * 弹窗打开即可直接勾到本池对应的人选 */
function renderOrgPicker() {
  if (!orgPicker) return;
  const pool = poolById(orgPicker.poolId);
  const groups = orgPickerGroups();
  const picked = orgPicker.picked;
  const isShare = orgPicker.mode === 'share';

  const groupsHtml = groups.length
    ? groups.map((g, gi) => {
        const ids = g.users.map((u) => u.id);
        const onCount = ids.filter((id) => picked.indexOf(id) > -1).length;
        const allOn = onCount === ids.length;
        return '<div class="pm-org-group">' +
          '<label class="pm-org-dept' + (g.own ? ' own' : '') + '">' +
            '<input type="checkbox"' + (allOn ? ' checked' : '') + ' onchange="orgPickGroup(' + gi + ')" />' +
            '<span>' + esc(g.name) + '</span>' +
            '<i>' + g.users.length + '人' + (onCount && !allOn ? ' · 已选 ' + onCount : '') + '</i>' +
          '</label>' +
          '<div class="pm-org-members">' + g.users.map((u) => {
            const on = picked.indexOf(u.id) > -1;
            return '<label class="pm-org-person' + (on ? ' on' : '') + '">' +
              '<input type="checkbox"' + (on ? ' checked' : '') + ' onchange="orgPickToggle(\'' + u.id + '\')" />' +
              '<span class="pm-member-avatar">' + esc((u.name || '?').slice(0, 1)) + '</span>' +
              '<span class="pm-org-person-info"><b>' + esc(u.name) + '</b><small>' + esc(u.title || ROLES[u.role] || '') + '</small></span>' +
            '</label>';
          }).join('') + '</div>' +
        '</div>';
      }).join('')
    : empty('没有匹配的人员');

  document.getElementById('orgModal').innerHTML =
    '<h3>' + (isShare ? '分享 · 抄送他人查看并回复' : '指定落实人 · ' + esc(pool ? pool.name : '')) + '</h3>' +
    '<div class="form-row" style="margin-bottom:10px"><input type="text" id="orgKw" placeholder="搜索姓名 / 部门 / 职位" value="' + esc(orgPicker.kw) + '" oninput="orgPickerKw(this.value)"></div>' +
    '<div class="pm-member-picker-head"><b>' + (isShare ? '按组织架构选择人员' : '按组织架构选择落实人') + '</b><span>已选 ' + picked.length + ' 人</span></div>' +
    '<div class="pm-org-picker">' + groupsHtml + '</div>' +
    '<div class="hint pm-share-hint">' + (isShare
      ? '被分享人可查看该消息并回复，但不进入其待办、也不承担处理与确认义务。'
      : '被指定的落实人将直接收到该信息的待办，并负责处理与回填结论。输入姓名或部门可检索全公司员工。') + '</div>' +
    '<div class="modal-actions">' +
      '<button class="btn btn-ghost" onclick="closeOrgPicker()">取消</button>' +
      '<button class="btn" onclick="confirmOrgPicker()">' + (isShare ? '确认分享' : '确定') + '</button>' +
    '</div>';
}

window.clearSelPerson = (pid, uid) => {
  if (!modalState) return;
  if (uid) {
    const key = 'pers:' + pid + '|' + uid;
    const i = modalState.selected.indexOf(key);
    if (i > -1) modalState.selected.splice(i, 1);
  } else {
    modalState.selected = modalState.selected.filter((k) => k.indexOf('pers:' + pid + '|') !== 0);
  }
  renderModal();
  restoreKwFocus();
};

/* 从已选 chip 区移除一个目标 */
window.removeSelTarget = (key) => {
  if (!modalState) return;
  const i = modalState.selected.indexOf(key);
  if (i > -1) modalState.selected.splice(i, 1);
  renderModal();
  restoreKwFocus();
};

/* 解析分发目标：勾选节点＝该节点负责人+秘书同时收到；勾选个人＝本人落实并抄送其所属业务池负责人。
 * 同一池被指定多人时合并为 handlerId 数组，store 层按人拆成多条链路。
 * orgd:/orgp: 前缀来自处理人的组织架构分发，统一挂在本人正在处理的池下（anchorPoolId）。 */
function resolveSelTargets() {
  const out = [];
  const done = {};
  (modalState.selected || []).forEach((k) => {
    if (k.indexOf('orgd:') === 0) {
      if (done[k]) return;
      done[k] = 1;
      const ids = orgDeptUserIds(k.slice(5));
      if (ids.length) out.push({ poolId: modalState.anchorPoolId, mode: 'people', recipientIds: ids, key: k });
    }
    if (k.indexOf('orgp:') === 0) {
      if (done[k]) return;
      done[k] = 1;
      out.push({ poolId: modalState.anchorPoolId, mode: 'people', recipientIds: [k.slice(5)], key: k });
    }
  });
  (modalState.selected || []).forEach((k) => {
    if (k.indexOf('pool:') === 0) {
      const pid = k.slice(5);
      if (done[pid]) return;
      out.push({ poolId: pid, mode: 'node', key: k });
      done[pid] = 1;
    }
  });
  (modalState.selected || []).forEach((k) => {
    if (k.indexOf('pers:') === 0) {
      const rest = k.slice(5);
      const i = rest.lastIndexOf('|');
      const pid = rest.slice(0, i), uid = rest.slice(i + 1);
      if (done[pid]) return;
      done[pid] = 1;
      const ids = modalState.selected.filter((x) => x.indexOf('pers:' + pid + '|') === 0)
        .map((x) => x.slice(x.lastIndexOf('|') + 1));
      out.push({ poolId: pid, mode: 'person', handlerId: ids, key: 'pers:' + pid + ':*' });
    }
  });
  return out;
}

window.confirmModal = () => {
  if (!modalState) return;
  if (modalState.mode === 'share') {
    const r = shareMessage(modalState.msgId, orgPickedUserIds());
    if (!r.ok) { toast(r.msg); return; }
    closeModal();
    toast('已分享给 ' + r.count + ' 人，对方可查看并回复');
    render();
    return;
  }
  const targets = resolveSelTargets();
  if (!targets.length) { toast('请至少选择一个节点或人员'); return; }
  const isDsp = modalState.mode === 'dispatch';
  const r = isDsp
    ? dispatchMessage(modalState.msgId, targets, '')
    : forwardMessage(modalState.msgId, modalState.fromLinkId, targets, '');
  if (!r.ok) { toast(r.msg); return; }
  closeModal();
  toast((isDsp ? '已分发到 ' : '已流转到 ') + r.count + ' 个目标，处理人已收到待办');
  render();
};

/* 处理人评论后可直接流转到下级节点（是否办结由李倩影判断并汇总回复） */
window.submitForward = () => {
  if (!modalState) return;
  const st = modalState;
  const r = addReply(st.msgId, st.poolId, st.content, st.atts || []);
  if (!r.ok) { toast(r.msg); return; }
  render();
  modalState = { mode: 'forward', msgId: st.msgId, fromLinkId: st.linkId, selected: [], kw: '', collapsed: [] };
  renderModal();
};

/* 选择树节点渲染：只渲染池行，具体人员通过行内「指定落实人」按钮在组织架构弹窗中勾选。
 * 返回 {html, hit, keep}：hit = 子树内是否有显式选中（下级选中时上级呈半选态）；
 * keep = 搜索时该节点是否可见。 */
/* 池行名称：主行池名，副行展示负责人与秘书（如有） */
function mtNameHtml(p) {
  const owner = nodeOwnerNames(p).join('、');
  const sec = nodeSecretaryNames(p).join('、');
  const sub = [owner ? '负责人 ' + owner : '', sec ? '秘书 ' + sec : ''].filter(Boolean).join(' · ');
  return '<span class="mt-name-main">' + esc(p.name) + '</span>' +
    (sub ? '<span class="mt-name-sub">' + esc(sub) + '</span>' : '');
}
function selNode(n, ctx, kw) {
  const p = n.pool;
  const k = (kw || '').trim().toLowerCase();
  const sel = modalState.selected;
  const poolSel = sel.indexOf('pool:' + p.id) > -1;
  const mem = membersOf(p);
  /* 已选的落实人：直接从选中集取（同一池可指定多人）；
   * 落实人由组织架构弹窗选出，可能不是本池成员，故不能从 mem 过滤 */
  const handlerIds = sel
    .filter((k2) => k2.indexOf('pers:' + p.id + '|') === 0)
    .map((k2) => k2.slice(k2.lastIndexOf('|') + 1));
  const hasPersonSel = handlerIds.length > 0;

  const kids = n.children.map((c) => selNode(c, ctx, kw));
  const childHtml = kids.map((x) => x.html).join('');
  const childHit = kids.some((x) => x.hit);
  const childKept = kids.some((x) => x.keep);

  /* 搜索命中本池任一人员（含负责人/秘书）时，该池行保留 */
  const memberHits = k ? [...new Set(mem.concat(nodeRecipients(p)))]
    .filter((uid) => userName(uid).toLowerCase().includes(k)) : [];

  const hit = poolSel || hasPersonSel || childHit;
  const poolNameMatch = k ? p.name.toLowerCase().includes(k) : true;
  const ownerMatch = k ? memberHits.length > 0 : false;
  const keep = !k || poolNameMatch || ownerMatch || poolSel || hasPersonSel || childKept;
  if (!keep) return { html: '', hit: hit, keep: false };

  const pathChecked = hit && !poolSel;
  const linked = ctx.linkedIds.indexOf(p.id) > -1;
  const selectable = ctx.canSelect(p) && !linked;
  const collapsed = !k && (modalState.collapsed || []).indexOf(p.id) > -1;
  const expandable = n.children.length > 0;

  const rowCls = (poolSel || hasPersonSel ? ' sel' : (pathChecked ? ' path' : '')) + (selectable ? '' : ' dis');
  const showCheck = selectable || poolSel || pathChecked;
  const checkCls = poolSel ? ' on' : (hasPersonSel ? ' person' : (pathChecked ? ' half' : (showCheck ? '' : ' dis')));

  let html = '<div class="mt-node">' +
    '<div class="mt-row' + rowCls + '">' +
      '<span class="mt-caret" onclick="event.stopPropagation();toggleMtNode(\'' + p.id + '\')">' + (expandable ? (collapsed ? '▸' : '▾') : '') + '</span>' +
      '<span class="mt-check' + checkCls + '"' + (selectable ? ' onclick="event.stopPropagation();toggleSelPool(\'' + p.id + '\')"' : '') + '>' +
        (poolSel ? '✓' : (hasPersonSel ? '●' : '')) +
      '</span>' +
      '<span class="mt-name"' + (selectable ? ' onclick="toggleSelPool(\'' + p.id + '\')"' : '') + '>' + mtNameHtml(p) + '</span>' +
      '<span class="mt-type">' + esc(POOL_TYPES[p.type] || '') + '</span>' +
      (linked ? '<span class="mt-type">已在处理列表</span>' : '') +
      (selectable
        ? '<button type="button" class="mt-assign-btn' + (hasPersonSel ? ' on' : '') + '"' +
            ' title="指定具体人员落实，抄送其所属业务池负责人"' +
            ' onclick="event.stopPropagation();openOrgPicker(\'' + p.id + '\')">' +
            (hasPersonSel ? '改指定' : '指定落实人') +
          '</button>'
        : '') +
    '</div>';

  html += (collapsed ? '' : '<div class="mt-children">' + childHtml + '</div>');
  html += '</div>';
  return { html: html, hit: hit, keep: true };
}

/* 由任意池向下构建选择树节点 */
function orgTreeNode(pool) {
  return { pool: pool, children: sortPoolsByPoolOrder(childPools(pool.id)).map(orgTreeNode) };
}

/* 统计树中实际可选的池数量：为 0 时提示原因，避免弹窗看起来是死的 */
function countSelectablePools(n, ctx) {
  if (!n) return 0;
  let c = (ctx.canSelect(n.pool) && ctx.linkedIds.indexOf(n.pool.id) === -1) ? 1 : 0;
  n.children.forEach((ch) => { c += countSelectablePools(ch, ctx); });
  return c;
}

/* ==========================================================================
 * 处理人分发：按部门员工组织架构（org.js，69 部门 / 1294 人）选择目标
 * 勾选部门＝该部门全员收到待办；勾选个人＝本人收到待办。均抄送信息所属业务池负责人。
 * ========================================================================== */
const ORG_RENDER_LIMIT = 80;

function orgSelKeys() {
  return (modalState.selected || []).filter((k) => k.indexOf('orgd:') === 0 || k.indexOf('orgp:') === 0);
}
function orgPickedUserIds() {
  const ids = [];
  orgSelKeys().forEach((k) => {
    if (k.indexOf('orgd:') === 0) orgDeptUserIds(k.slice(5)).forEach((uid) => ids.push(uid));
    else ids.push(k.slice(5));
  });
  return [...new Set(ids)];
}

window.toggleOrgDeptExpand = (did) => {
  if (!modalState) return;
  modalState.orgExpanded = modalState.orgExpanded || [];
  const i = modalState.orgExpanded.indexOf(did);
  if (i > -1) modalState.orgExpanded.splice(i, 1); else modalState.orgExpanded.push(did);
  renderModal();
  restoreKwFocus();
};
window.toggleOrgDeptSel = (did) => {
  if (!modalState) return;
  const key = 'orgd:' + did;
  const i = modalState.selected.indexOf(key);
  if (i > -1) { modalState.selected.splice(i, 1); }
  else {
    /* 整部门与部门内的单人选择互斥，避免重复计数 */
    const ids = orgDeptUserIds(did);
    modalState.selected = modalState.selected
      .filter((k) => k.indexOf('orgp:') !== 0 || ids.indexOf(k.slice(5)) === -1);
    modalState.selected.push(key);
  }
  renderModal();
  restoreKwFocus();
};
window.toggleOrgPersonSel = (uid) => {
  if (!modalState) return;
  const did = orgDeptIdOfUser(uid);
  if (did && (modalState.selected || []).indexOf('orgd:' + did) > -1) return;
  const key = 'orgp:' + uid;
  const i = modalState.selected.indexOf(key);
  if (i > -1) modalState.selected.splice(i, 1); else modalState.selected.push(key);
  renderModal();
  restoreKwFocus();
};

function orgPersonRowHtml(u, deptOn) {
  const on = deptOn || (modalState.selected || []).indexOf('orgp:' + u.id) > -1;
  const clickable = !deptOn;
  const handler = clickable ? 'toggleOrgPersonSel(\'' + u.id + '\')' : '';
  return '<div class="mt-row mt-person-row' + (on ? ' sel' : '') + (clickable ? '' : ' dis') + '">' +
    '<span class="mt-caret"></span>' +
    '<span class="mt-check' + (on ? ' on' : (clickable ? '' : ' dis')) + '"' +
      (clickable ? ' onclick="' + handler + '"' : '') + '>' + (on ? '✓' : '') + '</span>' +
    '<span class="mt-name"' + (clickable ? ' onclick="' + handler + '"' : '') + '>' +
      '<span class="mt-name-main">' + esc(u.name) + '</span>' +
    '</span>' +
  '</div>';
}

function orgSelListHtml(kw) {
  const k = (kw || '').trim().toLowerCase();
  const sel = modalState.selected || [];
  const expanded = modalState.orgExpanded || [];
  const rows = [];
  orgDepts().forEach((d) => {
    const deptNameHit = !k || d.name.toLowerCase().includes(k);
    const members = d.userIds.map((uid) => userById(uid)).filter(Boolean);
    const hits = k ? members.filter((u) => (u.name || '').toLowerCase().includes(k)) : [];
    if (k && !deptNameHit && !hits.length) return;
    const deptOn = sel.indexOf('orgd:' + d.id) > -1;
    const personOnCount = members.filter((u) => sel.indexOf('orgp:' + u.id) > -1).length;
    const open = k ? hits.length > 0 || deptNameHit : expanded.indexOf(d.id) > -1;
    const pool = k ? hits : members;
    const list = pool.slice(0, ORG_RENDER_LIMIT);
    const truncated = list.length < pool.length;
    const rowCls = (deptOn ? ' sel' : (personOnCount ? ' path' : ''));
    rows.push('<div class="mt-node">' +
      '<div class="mt-row org-dept-row' + rowCls + '">' +
        '<span class="mt-caret" onclick="event.stopPropagation();toggleOrgDeptExpand(\'' + d.id + '\')">' + (open ? '▾' : '▸') + '</span>' +
        '<span class="mt-check' + (deptOn ? ' on' : (personOnCount ? ' half' : '')) + '"' +
          ' onclick="toggleOrgDeptSel(\'' + d.id + '\')">' + (deptOn ? '✓' : '') + '</span>' +
        '<span class="mt-name" onclick="toggleOrgDeptExpand(\'' + d.id + '\')">' +
          '<span class="mt-name-main">' + esc(d.name) + '</span>' +
          '<span class="mt-name-sub">' + members.length + ' 人' +
            (personOnCount && !deptOn ? ' · 已选 ' + personOnCount : '') + '</span>' +
        '</span>' +
        (k && hits.length ? '<span class="mt-type">命中 ' + hits.length + ' 人</span>' : '') +
      '</div>' +
      (open ? '<div class="mt-children">' +
        list.map((u) => orgPersonRowHtml(u, deptOn)).join('') +
        (list.length ? '' : '<div class="lock-tip">按部门名匹配，可勾选整部门，或输入姓名定位人员</div>') +
        (truncated ? '<div class="lock-tip">' + (k ? '命中 ' + pool.length + ' 人' : '该部门 ' + members.length + ' 人') +
          '，仅显示前 ' + ORG_RENDER_LIMIT + ' 人，输入姓名可精确定位</div>' : '') +
      '</div>' : '') +
    '</div>');
  });
  return rows.join('');
}

function orgChipsHtml() {
  const keys = orgSelKeys();
  if (!keys.length) return '';
  const chips = keys.map((key) => {
    if (key.indexOf('orgd:') === 0) {
      const d = orgDeptById(key.slice(5));
      if (!d) return '';
      return '<span class="mt-chip person">' + esc(d.name) +
        '<i>· ' + d.userIds.length + ' 人</i>' +
        '<b onclick="removeSelTarget(\'' + key + '\')">×</b></span>';
    }
    const uid = key.slice(5);
    const u = userById(uid);
    const dept = orgDeptById(orgDeptIdOfUser(uid));
    return '<span class="mt-chip person">' + esc(u ? u.name : uid) +
      (dept ? '<i>@ ' + esc(dept.name) + '</i>' : '') +
      '<b onclick="removeSelTarget(\'' + key + '\')">×</b></span>';
  }).join('');
  return '<div class="mt-chips"><div class="mt-chips-group">' +
    '<span class="mt-chips-label">目标 · ' + orgPickedUserIds().length + ' 人</span>' + chips +
  '</div></div>';
}

/* 处理人分发弹窗：与总池分发人共用确定/取消与目标 chip 区，只是候选来源换成部门员工组织架构 */
function renderOrgDispatchModal(m) {
  const kw = (modalState.kw || '').trim();
  const anchor = modalState.anchorPoolId || m.sourcePoolId;
  const pool = poolById(anchor);
  const ccNames = bizOwnersOf(anchor).filter((id) => id !== curUser().id).map(userName);
  const listHtml = '<div class="modal-list">' +
    (orgSelListHtml(kw) || '<div class="lock-tip">没有匹配的部门或人员</div>') + '</div>';
  document.getElementById('modal').innerHTML =
    '<h3>分发到部门或人员</h3>' +
    '<div class="form-row" style="margin-bottom:10px"><input type="text" id="modalKw" placeholder="搜索部门 / 姓名" value="' + esc(kw) + '" oninput="modalKwInput(this.value)"></div>' +
    '<div class="form-hint" style="margin:0 0 8px">按部门员工组织架构分发：勾选部门＝该部门全员收到待办；' +
      (ccNames.length ? '抄送' + (pool ? poolName(pool.id) + '所属业务池负责人 ' : '业务池负责人 ') + ccNames.join('、') : '') + '</div>' +
    listHtml +
    orgChipsHtml() +
    '<div class="modal-actions">' +
      '<button class="btn btn-ghost" onclick="closeModal()">取消</button>' +
      '<button class="btn" onclick="confirmModal()">确定</button>' +
    '</div>';
}

/* 分享弹窗：与分发共用部门员工组织架构树，勾选部门＝分享给该部门全员 */
function renderShareModal(m) {
  const kw = (modalState.kw || '').trim();
  const sharedCount = (m.sharedUserIds || []).length;
  document.getElementById('modal').innerHTML =
    '<h3>分享给同事</h3>' +
    '<div class="form-row" style="margin-bottom:10px"><input type="text" id="modalKw" placeholder="搜索部门 / 姓名" value="' + esc(kw) + '" oninput="modalKwInput(this.value)"></div>' +
    '<div class="form-hint" style="margin:0 0 8px">按部门员工组织架构分享：勾选部门＝分享给该部门全员，对方可查看并回复本条信息' +
      (sharedCount ? '；当前已分享给 ' + sharedCount + ' 人' : '') + '</div>' +
    '<div class="modal-list">' + (orgSelListHtml(kw) || '<div class="lock-tip">没有匹配的部门或人员</div>') + '</div>' +
    orgChipsHtml() +
    '<div class="modal-actions">' +
      '<button class="btn btn-ghost" onclick="closeModal()">取消</button>' +
      '<button class="btn" onclick="confirmModal()">确认分享</button>' +
    '</div>';
}

function renderModal() {
  if (!modalState) return;
  const m = findMsg(modalState.msgId);

  /* 标记为：发起人与李倩影都能标 已解决/未解决；打开时任何选项都不带选中态 */
  if (modalState.mode === 'tag') {
    const me = curUser();
    const isQy = isDispatcher(me) || isAdmin(me);
    const rows = ['已解决', '未解决'];
    if (isQy) MESSAGE_TAGS.forEach((tag) => rows.push(tag));
    document.getElementById('modal').innerHTML =
      '<div class="tag-modal-head"><b>标记为</b><span>' + (isQy ? '处理状态与业务标签' : '提交人确认（不改变流程状态）') + '</span></div>' +
      '<div class="tag-choice-list">' + rows.map((tag) =>
        '<button type="button" class="tag-choice"' +
          ' onclick="applyMessageTag(\'' + m.id + '\',\'' + tag + '\')">' +
          '<span>' + esc(tag) + '</span>' +
        '</button>').join('') + '</div>';
    return;
  }

  /* 倩影汇总回复：新增或修改，最新一条为当前有效汇总 */
  if (modalState.mode === 'summary') {
    const target = modalState.summaryId ? summaryById(modalState.summaryId) : latestSummary(m.id);
    document.getElementById('modal').innerHTML =
      '<h3>' + (modalState.summaryId ? '修改汇总回复' : '发布汇总回复') + '</h3>' +
      '<div class="form-row"><textarea id="summaryText" placeholder="请汇总各处理池的结论，统一回复给提出人">' +
        esc(target ? target.content : '') + '</textarea>' +
        '<div class="form-hint">汇总回复对发起人及全部处理人可见；多次发布时以最新一条为当前有效汇总</div></div>' +
      '<div class="modal-actions">' +
        '<button class="btn btn-ghost" onclick="closeModal()">取消</button>' +
        '<button class="btn" onclick="saveSummary()">确定</button>' +
      '</div>';
    return;
  }

  /* 评论提交：处理人不再自行标记办结，只有「评论并流转」一个动作 */
  if (modalState.mode === 'submitChoice') {
    const link = linkById(modalState.linkId);
    const canFwd = canForward(curUser(), m, link);
    document.getElementById('modal').innerHTML =
      '<div class="choice-list">' +
        '<div class="choice-row' + (canFwd ? '' : ' dis') + '"' + (canFwd ? ' onclick="submitForward()"' : '') + '><span class="choice-radio"></span><span class="choice-text">评论并流转</span></div>' +
      '</div>' +
      (canFwd ? '' : '<div class="form-hint" style="margin-top:8px">当前信息暂无可执行的流转操作</div>');
    return;
  }

  /* 分发统一走部门员工组织架构（真实部门/人员），不再按池树勾选 */
  if (modalState.mode === 'dispatch') {
    renderOrgDispatchModal(m);
    return;
  }

  /* 分享同样走部门员工组织架构 */
  if (modalState.mode === 'share') {
    renderShareModal(m);
    return;
  }

  const kw = (modalState.kw || '').trim();
  const linkedIds = linksOf(m.id).map((l) => l.poolId);
  /* 流转下级：在本人链路所属池的下级节点里勾选 */
  const fromLink = linkById(modalState.fromLinkId);
  const fromPool = poolById(fromLink.poolId);
  const title = '流转到下级节点';
  const tip = '流转范围＝' + fromPool.name + ' 的下级节点；原节点置为已流转，由下级继续落实';
  const nodes = [orgTreeNode(fromPool)];
  const ctx = {
    linkedIds: linkedIds,
    canSelect: (p) => p.id !== fromPool.id && getPoolSubtree(fromPool.id).some((sp) => sp.id === p.id)
  };
  const listInner = nodes.map((n) => selNode(n, ctx, kw).html).join('');
  const selectableCount = nodes.reduce((s, n) => s + countSelectablePools(n, ctx), 0);
  const noTargetTip = selectableCount === 0
    ? '<div class="form-hint" style="margin:0 0 8px">暂无可选目标：该范围内的池均已在处理列表中，或尚未建立下级池</div>'
    : '';
  const listHtml = '<div class="modal-list">' +
    (listInner || '<div class="lock-tip">没有匹配的可选池或人员</div>') + '</div>';
  const targets = resolveSelTargets();
  /* 节点目标与具体落实人分组展示、分别计数：落实人按人数逐个计 */
  const nodeTargets = targets.filter((t) => t.mode !== 'person');
  const personChips = [];
  targets.forEach((t) => {
    if (t.mode === 'person') {
      (Array.isArray(t.handlerId) ? t.handlerId : [t.handlerId]).forEach((uid) => personChips.push({ uid: uid, poolId: t.poolId }));
    }
  });
  const nodeChipsHtml = nodeTargets.map((t) => {
    const who = nodeRecipients(poolById(t.poolId)).map(userName).join('、');
    return '<span class="mt-chip">' + esc(poolName(t.poolId)) +
      (who ? '<i>（' + esc(who) + '）</i>' : '') +
      '<b onclick="removeSelTarget(\'' + t.key + '\')">×</b></span>';
  }).join('');
  const personChipsHtml = personChips.map((c) =>
    '<span class="mt-chip person">' + esc(userName(c.uid)) +
      '<i>@ ' + esc(poolName(c.poolId)) + '</i>' +
      '<b onclick="removeSelTarget(\'' + 'pers:' + c.poolId + '|' + c.uid + '\')">×</b></span>').join('');
  const chipsHtml = (nodeTargets.length || personChips.length)
    ? '<div class="mt-chips">' +
        (nodeTargets.length
          ? '<div class="mt-chips-group"><span class="mt-chips-label">节点 · ' + nodeTargets.length + '</span>' + nodeChipsHtml + '</div>'
          : '') +
        (personChips.length
          ? '<div class="mt-chips-group"><span class="mt-chips-label">落实人 · ' + personChips.length + ' 人</span>' + personChipsHtml + '</div>'
          : '') +
      '</div>'
    : '';
  document.getElementById('modal').innerHTML =
    '<h3>' + esc(title) + '</h3>' +
    '<div class="form-row" style="margin-bottom:10px"><input type="text" id="modalKw" placeholder="搜索池 / 部门 / 人员" value="' + esc(kw) + '" oninput="modalKwInput(this.value)"></div>' +
    (tip ? '<div class="form-hint" style="margin:0 0 8px">' + esc(tip) + '</div>' : '') +
    noTargetTip +
    listHtml +
    chipsHtml +
    '<div class="modal-actions">' +
      '<button class="btn btn-ghost" onclick="closeModal()">取消</button>' +
      '<button class="btn" onclick="confirmModal()">确定</button>' +
    '</div>';
}

/* ==========================================================================
 * 4. 消息详情
 * ========================================================================== */
/* ---------- 倩影汇总回复：发布 / 修改，最新一条为当前有效汇总 ---------- */
window.openSummaryModal = (msgId, summaryId) => {
  const m = findMsg(msgId);
  if (!m || !canManageSummary(curUser())) { toast('仅总池分发人可发布汇总回复'); return; }
  modalState = { mode: 'summary', msgId, summaryId: summaryId || null };
  showModal();
};
window.saveSummary = () => {
  if (!modalState || modalState.mode !== 'summary') return;
  const el = document.getElementById('summaryText');
  const text = el ? el.value : '';
  const r = modalState.summaryId
    ? editSummary(modalState.summaryId, text)
    : publishSummary(modalState.msgId, text);
  if (!r.ok) { toast(r.msg); return; }
  closeModal();
  toast(modalState.summaryId ? '汇总回复已更新' : '汇总回复已发布，发起人与处理人均可见');
  render();
};

window.cancelMsg = (msgId) => {
  if (!confirm('确定取消这条消息吗？')) return;
  cancelMessage(msgId);
  toast('消息已取消');
  render();
};

/* ---------- 客户360卡片 ---------- */
function c360CardHtml(customerName) {
  const p = getProfile(customerName);
  const kv = (k, v) => '<div class="kv"><span class="k">' + k + '</span><span class="v">' + esc(v) + '</span></div>';
  const onlineTotal = p.serviceRecords.reduce((s, r) => s + r.online, 0);
  const offlineTotal = p.serviceRecords.reduce((s, r) => s + r.offline, 0);
  return '<div class="card c360">' +
    '<div class="c360-head">' +
      '<div class="c360-name">' + esc(p.name) + '</div>' +
      '<div class="c360-tags">' + p.tags.map((t) => '<span class="c360-tag">' + esc(t) + '</span>').join('') + '</div>' +
    '</div>' +
    '<div class="c360-sec"><h4>交易信息<span class="unit">（单位：万元）</span></h4>' +
      kv('客户权益', p.trading.equity) + kv('当年经纪业务净收入', p.trading.monthIncome) +
      kv('净留存', p.trading.yearIncome) + kv('净减收', p.trading.pnl) + kv('净利息', p.price.interest) +
    '</div>' +
    '<div class="c360-sec"><h4>价格信息</h4>' +
      kv('手续费模版', p.price.feeTemplate) + kv('保证金比例', p.price.marginTemplate) +
      kv('结息比例', p.price.interest) + kv('近一年采购金额（万元）', p.price.yearPurchase) +
      kv('历史采购金额（万元）', p.price.totalPurchase) +
    '</div>' +
    '<div class="c360-sec"><h4>服务跟进记录</h4>' +
      '<div class="svc-total">线上服务 ' + onlineTotal + ' 人次 · 线下服务 ' + offlineTotal + ' 人次</div>' +
      p.serviceRecords.map((r) =>
        '<div class="kv"><span class="k">' + esc(r.dept) + '</span><span class="v svc-v">线上 ' + r.online + ' 人次 / 线下 ' + r.offline + ' 人次</span></div>').join('') +
    '</div>' +
    '<div class="c360-sec"><h4>历史需求</h4>' +
      p.demands.map((d) =>
        '<div class="dm-item">' +
          '<div class="dm-head"><span class="dm-date">' + esc(d.date) + '</span><span class="dm-type">' + esc(d.type) + '</span></div>' +
          '<div class="dm-meta">' + esc(d.owner) + ' · 跟进人：' + esc(d.staff) + '</div>' +
          '<div class="dm-meta">目标：' + esc(d.target) + '</div>' +
          '<div class="dm-desc">' + esc(d.desc) + '</div>' +
        '</div>').join('') +
    '</div>' +
  '</div>';
}

/* ---------- 客户信息独立展示页（从消息详情「客户信息」标签进入） ---------- */
window.openCustomer = (name) => { location.hash = '#/customer/' + encodeURIComponent(name); };
function renderCustomer(name) {
  return c360CardHtml(name);
}

function detailToolbarHtml() {
  const backIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>';
  const searchIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg>';
  return '<div class="detail-toolbar">' +
    '<div class="detail-toolbar-inner">' +
      '<button type="button" class="detail-back-link" onclick="goBackFromDetail()">' + backIcon + '<span>返回</span></button>' +
      '<div class="detail-global-search">' +
        '<button type="button" class="detail-search-toggle" aria-label="展开全局搜索" aria-expanded="false" onclick="openGlobalDetailSearch()">' + searchIcon + '</button>' +
        '<input id="detailGlobalSearch" type="search" autocomplete="off" aria-label="全局搜索信息" ' +
          'placeholder="搜索编号、标题、客户…" oninput="updateGlobalDetailSearch(this.value)" ' +
          'onkeydown="detailSearchKeydown(event)" onblur="closeGlobalDetailSearch()">' +
        '<div id="detailSearchResults" class="detail-search-results" role="listbox" hidden></div>' +
      '</div>' +
    '</div>' +
  '</div>';
}

window.openGlobalDetailSearch = () => {
  const wrap = document.querySelector('.detail-global-search');
  const input = document.getElementById('detailGlobalSearch');
  const toggle = document.querySelector('.detail-search-toggle');
  if (!wrap || !input) return;
  wrap.classList.add('expanded');
  if (toggle) toggle.setAttribute('aria-expanded', 'true');
  requestAnimationFrame(() => input.focus());
};

function globalDetailSearchItems(keyword) {
  return visibleMessages()
    .filter((m) => msgKeywordMatch(m, keyword))
    .sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt))
    .slice(0, 6);
}

window.updateGlobalDetailSearch = (value) => {
  const box = document.getElementById('detailSearchResults');
  if (!box) return;
  const keyword = (value || '').trim();
  if (!keyword) { box.hidden = true; box.innerHTML = ''; return; }
  const items = globalDetailSearchItems(keyword);
  box.innerHTML = items.length ? items.map((m, index) =>
    '<button type="button" class="detail-search-result" role="option" data-message-id="' + esc(m.id) + '" ' +
      'onclick="openGlobalSearchResult(\'' + esc(m.id) + '\')">' +
      '<span class="detail-search-result-top"><b>' + esc(m.no) + '</b><span>' + esc(m.title) + '</span></span>' +
      '<small>' + esc(proposalTypeText(m) || m.customerName || userName(m.createdBy)) + '</small>' +
    '</button>').join('') : '<div class="detail-search-empty">未找到相关信息</div>';
  box.hidden = false;
};

window.closeGlobalDetailSearch = () => {
  setTimeout(() => {
    const box = document.getElementById('detailSearchResults');
    const wrap = document.querySelector('.detail-global-search');
    const input = document.getElementById('detailGlobalSearch');
    const toggle = document.querySelector('.detail-search-toggle');
    if (box) { box.hidden = true; box.innerHTML = ''; }
    if (input) input.value = '';
    if (wrap) wrap.classList.remove('expanded');
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
  }, 160);
};

window.openGlobalSearchResult = (id) => {
  const target = '#/message/' + id;
  if (location.hash === target) {
    const box = document.getElementById('detailSearchResults');
    const input = document.getElementById('detailGlobalSearch');
    if (box) box.hidden = true;
    if (input) { input.value = ''; input.blur(); }
    return;
  }
  location.hash = target;
};

window.detailSearchKeydown = (event) => {
  if (event.key === 'Escape') {
    event.currentTarget.value = '';
    updateGlobalDetailSearch('');
    event.currentTarget.blur();
    return;
  }
  if (event.key !== 'Enter') return;
  const first = document.querySelector('.detail-search-result');
  if (first) {
    event.preventDefault();
    openGlobalSearchResult(first.dataset.messageId);
  }
};

/* ---------- 固定底栏（小红书式互动栏）：评论框 + 消息级点赞 + 评论数；标记/分享/分发等主动作并入右侧 ---------- */
function actionBarHtml(me, m) {
  if (!canSeeMessage(me, m)) return '';
  const comment = '<div class="bar-comment">' +
    '<input class="bar-comment-input" readonly placeholder="说点什么..." onclick="openCommentPanel(\'' + m.id + '\')">' +
  '</div>';
  const acts = [];
  const tagIcon = '<svg class="bar-action-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 13l-7 7L4 11V4h7l9 9z"></path><circle cx="8.5" cy="8.5" r="1.5"></circle></svg>';
  const flowIcon = '<svg class="bar-action-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h10"></path><path d="M12 4l3 3-3 3"></path><path d="M19 17H9"></path><path d="M12 14l-3 3 3 3"></path></svg>';
  if (canMarkMessage(me, m) && m.status !== 'cancelled') {
    acts.push('<button class="btn btn-sm bar-action-btn" onclick="openTagModal(\'' + m.id + '\')">' + tagIcon + '<span>标记为</span></button>');
  }
  if (canShareMessage(me, m)) {
    const shareIcon = '<svg class="bar-action-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"></path></svg>';
    acts.push('<button class="btn btn-sm bar-action-btn" onclick="openSharePicker(\'' + m.id + '\')">' + shareIcon + '<span>分享</span></button>');
  }
  /* 分发目标参照部门员工组织架构 */
  if (canDispatch(me, m)) {
    acts.push('<button class="btn btn-sm bar-action-btn" onclick="openDispatchModal(\'' + m.id + '\')">' + flowIcon + '<span>分发</span></button>');
  }
  const actions = acts.length ? '<div class="bar-actions">' + acts.join('') + '</div>' : '';
  return '<div class="action-bar-spacer"></div>' +
    '<div class="action-bar"><div class="action-bar-inner">' +
      comment + actions +
    '</div></div>';
}

function logText(l) {
  switch (l.action) {
    case 'created': return l.note || '创建了消息';
    case 'directed': return l.note || '直投到业务池负责人';
    case 'dispatched': return l.note || '进行了分发';
    case 'forwarded': return l.note || '进行了流转';
    case 'shared': return l.note || '分享了消息';
    case 'reply': return '在 ' + poolName(l.poolId) + ' 回复：' + (l.note || '');
    case 'summary': return l.note || '发布汇总回复';
    case 'summary_edit': return l.note || '修改汇总回复';
    case 'auto':
      if (l.note && l.note.indexOf('汇总') > -1) return l.note;
      if (l.to === 'summarize') return '所有处理人已回复完成，等待李倩影汇总回复';
      return l.note || '状态变更为「' + (MSG_STATUS[l.to] || l.to) + '」';
    case 'closed': return l.note || '消息关闭';
    case 'cancelled': return l.note || '消息取消';
    default: return l.note || l.action;
  }
}

/* ---------- 评论流卡片：一条评论 + 其所有回复放在同一张卡片内 ----------
 * 一级评论作为卡片主体，嵌套回复紧跟在卡片内部的嵌套区域；
 * 每条回复（含主体）都有赞 / 回复按钮；处理结论由李倩影统一汇总回复给出。 */
let replyBoxFor = null;

function singleReplyRowHtml(me, m, r, orphanParent) {
  const au = userById(r.authorId) || {};
  const liked = (r.likedByUserIds || []).includes(me.id);
  const childCount = S.replies.filter((x) => x.parentReplyId === r.id).length;
  const box = replyBoxFor === r.id
    ? '<div class="cmt-reply-box"><input id="cinput_' + r.id + '" placeholder="回复 ' + esc(au.name || '') + '">' +
      '<button class="btn btn-sm" style="height:36px" onclick="submitCommentReply(\'' + m.id + '\',\'' + r.id + '\')">发送</button></div>'
    : '';
  return '<div class="cmt-row" id="cmtrow_' + r.id + '">' +
    '<div class="avatar">' + esc((au.name || '?').slice(0, 1)) + '</div>' +
    '<div class="cmt-body">' +
      '<div class="reply-head">' +
        '<span class="rname">' + esc(au.name || '') + '</span>' +
        '<span>' + esc(ROLES[au.role] || '') + '</span>' +
        '<span>' + fmtTime(r.at) + '</span>' +
        (orphanParent ? '<span class="cmt-confirm-tag">回复他人</span>' : '') +
      '</div>' +
      '<div class="reply-content">' + esc(r.content) + '</div>' +
      attsHtml(r.attachments) +
      '<div class="cmt-foot">' +
        '<button class="like-btn' + (liked ? ' on' : '') + '" id="like_' + r.id + '" onclick="toggleLike(\'' + r.id + '\')">' + (liked ? '已赞 ' : '赞 ') + (r.likeCount || 0) + '</button>' +
        '<button class="like-btn" onclick="toggleCommentBox(\'' + m.id + '\',\'' + r.id + '\')">回复' + (childCount ? ' ' + childCount : '') + '</button>' +
      '</div>' +
      box +
    '</div>' +
  '</div>';
}

/* 当前身份可见的回复线程：父回复不可见时，该条上提为一级评论 */
function visibleThreads(me, m) {
  const list = visibleReplies(me, m);
  const byId = {};
  list.forEach((r) => { byId[r.id] = r; });
  const byParent = {};
  list.forEach((r) => {
    const k = (r.parentReplyId && byId[r.parentReplyId]) ? r.parentReplyId : '';
    (byParent[k] = byParent[k] || []).push(r);
  });
  Object.keys(byParent).forEach((k) => byParent[k].sort((a, b) => a.at - b.at));
  return { list: list, roots: byParent[''] || [], byParent: byParent, byId: byId };
}

function commentCardHtml(me, m, r, threads, isOrphan) {
  let nestedHtml = '';
  const walk = (parentKey) => {
    (threads.byParent[parentKey] || []).forEach((child) => {
      nestedHtml += singleReplyRowHtml(me, m, child, false);
      walk(child.id);
    });
  };
  walk(r.id);
  return '<div class="cmt-thread">' +
    singleReplyRowHtml(me, m, r, isOrphan) +
    (nestedHtml ? '<div class="cmt-nested">' + nestedHtml + '</div>' : '') +
  '</div>';
}

/* 通用评论归属池：优先本人收件中的池，其次任一在办池，最后投递池 */
function pickCommentPool(m, me) {
  const links = linksOf(m.id);
  const mine = links.find((l) => linkActive(l) && recipientsOf(l).includes(me.id));
  if (mine) return mine.poolId;
  const inPool = links.find((l) => myPoolIds(me).includes(l.poolId));
  if (inPool) return inPool.poolId;
  if (links.length) return links[0].poolId;
  return m.sourcePoolId;
}

/* ---------- 评论流卡片列表 ---------- */
function commentAreaHtml(me, m) {
  const threads = visibleThreads(me, m);
  const isFull = isAdmin(me) || isDispatcher(me);
  /* 发起人看不到处理人的中间回复，无可见回复时整张卡片不展示 */
  if (!threads.list.length && me.id === m.createdBy) return '';
  const isHandler = !isFull && isHandlerOf(me, m);
  const sub = (isFull || isHandler)
    ? threads.list.length + ' 条 · 按回复时间排序'
    : '我可见的 ' + threads.list.length + ' 条回复 · 他人中间回复仅李倩影可见';
  /* 标题与全部回复合入同一张卡片，回复线程之间用细线分隔 */
  return '<div class="card"><div class="card-title">回复<span class="sub">' + sub + '</span></div>' +
    (threads.list.length
      ? threads.roots.map((r) => commentCardHtml(me, m, r, threads, !!r.parentReplyId)).join('')
      : empty('暂无我的回复')) +
  '</div>';
}

/* ---------- 消息级点赞（针对当前消息，持久化到 localStorage） ---------- */
window.toggleMsgLikeUI = (msgId) => {
  toggleMsgLike(msgId, curUser().id);
  render();
};

/* ---------- 底部弹出评论输入面板（小红书式） ---------- */
let cmtPanel = null;

/* 当前消息相关人员，发起人置顶 */
function mentionCandidates(m) {
  const ids = [];
  if (m.createdBy) ids.push(m.createdBy);
  linksOf(m.id).forEach((l) => {
    recipientsOf(l).forEach((uid) => ids.push(uid));
    ccOf(l).forEach((uid) => ids.push(uid));
    if (l.dispatchedBy) ids.push(l.dispatchedBy);
  });
  visibleReplies(curUser(), m).forEach((r) => ids.push(r.authorId));
  return [...new Set(ids)];
}

window.openCommentPanel = (msgId) => {
  const m = findMsg(msgId);
  if (!m) return;
  cmtPanel = { msgId, content: '', atts: [], recording: false, showAt: false, atKw: '', showImg: false };
  document.getElementById('cmtMask').classList.add('show');
  document.getElementById('cmtPanel').classList.add('show');
  renderCommentPanel();
  restoreCmtFocus();
};
window.closeCommentPanel = () => {
  const mask = document.getElementById('cmtMask');
  const p = document.getElementById('cmtPanel');
  if (mask) mask.classList.remove('show');
  if (p) p.classList.remove('show');
  cmtPanel = null;
};
function restoreCmtFocus() {
  const t = document.getElementById('cmtText');
  if (t) { t.focus(); t.setSelectionRange(t.value.length, t.value.length); }
}
function restoreAtKwFocus() {
  const t = document.getElementById('cmtAtKw');
  if (t) { t.focus(); t.setSelectionRange(t.value.length, t.value.length); }
}
function renderCommentPanel() {
  if (!cmtPanel) return;
  const m = findMsg(cmtPanel.msgId);
  const chips = cmtPanel.atts.map((a, i) =>
    '<span class="att-chip">' + (a.type === 'voice' ? '[语音] ' : a.type === 'image' ? '[图片] ' : '') + esc(a.name) +
    '<b onclick="cmtDelAtt(' + i + ')">×</b></span>').join('');
  let atBlock = '';
  if (cmtPanel.showAt) {
    const kw = (cmtPanel.atKw || '').trim().toLowerCase();
    const cand = mentionCandidates(m).filter((id) => !kw || userName(id).toLowerCase().includes(kw));
    atBlock = '<div class="at-list">' +
      '<input id="cmtAtKw" class="at-kw" placeholder="搜索人员" value="' + esc(cmtPanel.atKw) + '" oninput="cmtAtKw(this.value)">' +
      (cand.length ? cand.map((id) => {
        const u = userById(id) || {};
        return '<div class="at-row" onclick="cmtPickAt(\'' + id + '\')">' +
          '<span class="mt-avatar">' + esc((userName(id) || '?').slice(0, 1)) + '</span>' +
          '<span class="at-name">' + esc(userName(id)) + '</span>' +
          (id === m.createdBy ? '<span class="at-tag">发起人</span>' : '<span class="at-role">' + esc(ROLES[u.role] || '') + '</span>') +
        '</div>';
      }).join('') : '<div class="lock-tip">无匹配人员</div>') +
    '</div>';
  }
  let imgBlock = '';
  if (cmtPanel.showImg) {
    imgBlock = '<div class="img-pick">' +
      '<div class="img-pick-row" onclick="cmtImagePick(true)">现场拍照</div>' +
      '<div class="img-pick-row" onclick="cmtImagePick(false)">从相册选择</div>' +
    '</div>';
  }
  document.getElementById('cmtPanel').innerHTML =
    '<div class="cmt-panel-head">' +
      '<span class="cmt-panel-title">评论 ' + esc(m.no) + '</span>' +
      '<span class="cmt-panel-x" onclick="closeCommentPanel()">×</span>' +
    '</div>' +
    '<textarea id="cmtText" placeholder="说点什么..." oninput="cmtPanel.content=this.value">' + esc(cmtPanel.content) + '</textarea>' +
    (chips ? '<div class="att-chips">' + chips + '</div>' : '') +
    (cmtPanel.recording ? '<div class="rec-tip">● 录音中… 再点一次话筒结束并插入语音</div>' : '') +
    atBlock +
    imgBlock +
    '<div class="cmt-toolbar">' +
      '<button type="button" class="tl-btn' + (cmtPanel.recording ? ' on' : '') + '" title="语音" onclick="cmtVoice()">语音</button>' +
      '<button type="button" class="tl-btn' + (cmtPanel.showImg ? ' on' : '') + '" title="图片" onclick="cmtImage()">图片</button>' +
      '<button type="button" class="tl-btn' + (cmtPanel.showAt ? ' on' : '') + '" title="提到" onclick="cmtToggleAt()">@</button>' +
      '<button type="button" class="btn cmt-submit" onclick="submitCommentPanel()">提交</button>' +
    '</div>';
}
window.cmtDelAtt = (i) => { if (!cmtPanel) return; cmtPanel.atts.splice(i, 1); renderCommentPanel(); restoreCmtFocus(); };
window.cmtVoice = () => {
  if (!cmtPanel) return;
  if (cmtPanel.recording) { cmtPanel.recording = false; cmtPanel.atts.push({ name: '语音消息', size: 0, type: 'voice' }); }
  else cmtPanel.recording = true;
  renderCommentPanel(); restoreCmtFocus();
};
window.cmtImage = () => { if (!cmtPanel) return; cmtPanel.showImg = !cmtPanel.showImg; renderCommentPanel(); };
window.cmtImagePick = (capture) => {
  if (!cmtPanel) return;
  cmtPanel.showImg = false;
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = 'image/*';
  if (capture) inp.capture = 'environment';
  inp.onchange = () => {
    const f = inp.files && inp.files[0];
    if (f && cmtPanel) {
      cmtPanel.atts.push({ name: f.name || (capture ? '拍照图片' : '图片'), size: f.size, type: 'image' });
      renderCommentPanel(); restoreCmtFocus();
    }
  };
  inp.click();
};
window.cmtToggleAt = () => { if (!cmtPanel) return; cmtPanel.showAt = !cmtPanel.showAt; cmtPanel.atKw = ''; renderCommentPanel(); };
window.cmtAtKw = (v) => { if (!cmtPanel) return; cmtPanel.atKw = v; renderCommentPanel(); restoreAtKwFocus(); };
window.cmtPickAt = (id) => {
  if (!cmtPanel) return;
  cmtPanel.content = (cmtPanel.content ? cmtPanel.content.replace(/\s+$/, '') + ' ' : '') + '@' + userName(id) + ' ';
  cmtPanel.showAt = false; cmtPanel.atKw = '';
  renderCommentPanel(); restoreCmtFocus();
};

/* 提交：处理人有可流转的下级时弹「评论并流转」；否则直接生成评论 */
window.submitCommentPanel = () => {
  if (!cmtPanel) return;
  const st = cmtPanel;
  const content = (st.content || '').trim();
  if (!content && !st.atts.length) { toast('请输入评论内容'); return; }
  const me = curUser();
  const m = findMsg(st.msgId);
  const link = !isEnded(m) ? myActiveUnsubmittedLink(me, m) : null;
  if (link && canForward(me, m, link)) {
    closeCommentPanel();
    modalState = { mode: 'submitChoice', msgId: st.msgId, poolId: link.poolId, linkId: link.id, content: content || '[附件]', atts: st.atts };
    showModal();
    return;
  }
  const r = addReply(st.msgId, pickCommentPool(m, me), content || '[附件]', st.atts, null);
  if (!r.ok) { toast(r.msg); return; }
  closeCommentPanel();
  render();
};

/* 点赞只更新按钮本身，避免整页重渲染跳动 */
window.toggleLike = (replyId) => {
  toggleReplyLike(replyId, curUser().id);
  const r = S.replies.find((x) => x.id === replyId);
  const btn = document.getElementById('like_' + replyId);
  if (r && btn) {
    const liked = (r.likedByUserIds || []).includes(curUser().id);
    btn.className = 'like-btn' + (liked ? ' on' : '');
    btn.textContent = (liked ? '已赞 ' : '赞 ') + (r.likeCount || 0);
  }
};

/* 在该评论下方展开 / 收起嵌套回复输入框（只重渲染评论区） */
window.toggleCommentBox = (msgId, replyId) => {
  replyBoxFor = replyBoxFor === replyId ? null : replyId;
  const el = document.getElementById('cmtArea');
  if (el) el.innerHTML = commentAreaHtml(curUser(), findMsg(msgId));
  if (replyBoxFor) {
    const inp = document.getElementById('cinput_' + replyBoxFor);
    if (inp) inp.focus();
  }
};

window.submitCommentReply = (msgId, parentId) => {
  const inp = document.getElementById('cinput_' + parentId);
  const content = inp ? inp.value.trim() : '';
  if (!content) { toast('请输入回复内容'); return; }
  const parent = S.replies.find((x) => x.id === parentId);
  if (!parent) return;
  const r = addReply(msgId, parent.poolId, content, [], parentId);
  if (!r.ok) { toast(r.msg); return; }
  replyBoxFor = null;
  render();
};

/* 分发去向文案：池/部门（收件人，抄送业务池负责人） */
function dispatchTargetsText(m) {
  return linksOf(m.id).map((l) => {
    const who = peopleBrief(recipientsOf(l));
    const cc = ccOf(l).map(userName);
    return poolName(l.poolId) + (who ? '（' + who + (cc.length ? '，抄送 ' + cc.join('、') : '') + '）' : '');
  }).join('、');
}

function renderDetail(id) {
  const me = curUser();
  const m = findMsg(id);
  const toolbar = detailToolbarHtml();
  if (!m) return toolbar + '<div class="card no-perm">消息不存在</div>';
  if (!canSeeMessage(me, m)) {
    return toolbar + '<div class="card no-perm">您无权查看该消息<br>仅发起人、总池分发人李倩影及被分发到的处理人可查看</div>';
  }
  const links = linksOf(m.id);
  const srcPool = poolById(m.sourcePoolId);

  /* 头部（客户信息标签融合在主卡片内：仅池处理人员可见，提出人不可见，点击跳客户信息页） */
  const targets = dispatchTargetsText(m);
  const head = '<div class="card detail-head">' +
    '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">' +
      '<span class="detail-no">' + m.no + '</span>' + flowBadge(m, me) + messageTagsHtml(m) +
      (m.closedAt ? '<span class="msg-meta">关闭于 ' + fmtTime(m.closedAt) + '</span>' : '') +
    '</div>' +
    '<h2>' + esc(m.title) + '</h2>' +
    '<div class="detail-meta">' +
      '<span>提出人：' + esc(userName(m.createdBy)) + '（' + esc((userById(m.createdBy) || {}).dept || '') + '）</span>' +
      '<span>投递：' + esc(srcPool ? srcPool.name : '—') + '池</span>' +
      '<span>创建于 ' + fmtTime(m.createdAt) + '</span>' +
    '</div>' +
    (proposalTypes(m).length ? '<div class="detail-info-line"><span class="detail-info-label">提议类型：</span><span>' + esc(proposalTypes(m).join('、')) + '</span></div>' : '') +
    (m.customerName ? '<div class="detail-info-line"><span class="detail-info-label">客户：</span><span>' + esc(m.customerName) + '</span></div>' : '') +
    (m.sourceOther ? '<div class="detail-info-line"><span class="detail-info-label">类型说明：</span><span>' + esc(m.sourceOther) + '</span></div>' : '') +
    (links.length
      ? '<div class="detail-info-line"><span class="detail-info-label">分发至：</span><span>' + esc(targets) + '</span></div>'
      : '<div class="detail-info-line"><span class="detail-info-label">分发状态：</span><span>待李倩影分发</span></div>') +
    ((m.sharedUserIds && m.sharedUserIds.length) ? '<div class="detail-info-line"><span class="detail-info-label">分享给了：</span><span>' + esc(peopleBrief(m.sharedUserIds)) + '</span></div>' : '') +
    '<div class="content-box">' + esc(m.content) + '</div>' +
    attsHtml(m.attachments) +
    (m.customerName && me.id !== m.createdBy
      ? '<div class="cust-line"><button class="btn btn-ghost btn-sm" onclick="openCustomer(\'' + esc(m.customerName) + '\')">客户信息</button>' +
        '<span class="msg-meta">' + esc(m.customerName) + '</span></div>'
      : '') +
  '</div>';

  /* 评论流：分发人/管理员见全部回复，处理人见所处理信息的全部回复，发起人只见自己的回复 */
  const comments = '<div id="cmtArea">' + commentAreaHtml(me, m) + '</div>';

  /* 时间线：处理人的中间回复与办结动作仅分发人和本人可见 */
  const isFull = isAdmin(me) || isDispatcher(me);
  const logs = visibleLogs(me, m);
  const timeline = '<div class="card"><div class="card-title">' +
    (isFull ? '全局时间线' : '关键节点时间线') +
    '<span class="sub">' + (isFull ? '分发动作、处理人回复与汇总回复全量记录' : '仅展示投递、分发与汇总回复等关键节点') + '</span></div>' +
    (logs.length ? logs.map((l) => {
      const key = ['created', 'directed', 'dispatched', 'forwarded', 'summary', 'closed', 'cancelled'].includes(l.action);
      return '<div class="tl-item' + (key ? ' tl-key' : '') + '">' +
        '<div class="tl-text"><b>' + esc(userName(l.actorId)) + '</b> ' + esc(logText(l)) + '</div>' +
        '<div class="tl-time">' + fmtTime(l.at) + '</div></div>';
    }).join('') : empty('暂无记录')) + '</div>';

  return toolbar + head + comments + timeline + actionBarHtml(me, m);
}

/* ==========================================================================
 * 5. 池管理（按身份裁剪视图）
 * ========================================================================== */
var pmState = {
  mainTab: 'messages',     // 'messages' (分管池在办信息) | 'tree' (池架构管理)
  selectedPoolId: null,
  filterPoolId: 'all',     // 'all' 或具体 poolId
  includeSub: true,
  statusFilter: 'all',
  keyword: '',
  sortOrder: 'updated',
  activeTab: 'members',    // in tree detail panel: 'members' | 'settings' | 'logs'
  modal: null
};
window.pmState = pmState;

function pmGetLevelName(level) {
  if (level === 0) return '业务池';
  if (level === 1) return '部门池';
  if (level === 2) return '小组池';
  return '池节点';
}

function pmGetLevelTag(level) {
  const name = pmGetLevelName(level);
  return '<span class="pm-node-level-tag pm-level-' + (level != null ? level : 1) + '">' + name + '</span>';
}

function pmFormatOwner(pool) {
  if (!pool || !pool.ownerIds || !pool.ownerIds.length) {
    return '<span class="pm-node-owner unassigned">未设负责人</span>';
  }
  const names = pool.ownerIds.map((id) => userName(id)).join('、');
  const count = pool.ownerIds.length;
  return '<span class="pm-node-owner" title="负责人(' + count + '人)：' + esc(names) + '">' + esc(names) + '</span>';
}

/* 渲染单个业务池行：池管理只列一级池，部门与小组不再展开 */
function pmRenderNodeHtml(pool) {
  if (!pool || pool.status === 'DELETED') return '';

  const metrics = poolMetrics(pool.id, pmState.includeSub);
  const count = metrics.total;
  const hasOverdue = metrics.hasOverdue;

  // 身份与层级判断
  const levelTag = pmGetLevelTag(pool.level);
  const ownerHtml = pmFormatOwner(pool);
  const countClass = 'pm-count-pill' + (hasOverdue ? ' has-overdue' : '');

  let html = '<div class="pm-node-wrap">';
  html += '<div class="pm-node-row">';
  html += '<span class="pm-node-dot"></span>';
  html += '<div class="pm-node-main">';
  html += '<span class="pm-node-title" title="' + esc(pool.name) + '">' + esc(pool.name) + '</span>';
  html += levelTag;
  html += ownerHtml;
  html += '</div>'; // .pm-node-main
  html += '<div class="pm-node-right">';
  html += '<span class="' + countClass + '" title="在办聚合计数' + (hasOverdue ? '（含超时消息）' : '') + '">' + count + '</span>';
  html += '<button type="button" class="pm-menu-btn" title="更多操作" onclick="event.stopPropagation(); pmOpenMenu(\'' + pool.id + '\')">···</button>';
  html += '</div>'; // .pm-node-right
  html += '</div>'; // .pm-node-row
  html += '</div>';
  return html;
}

/* 渲染右侧选中池的架构配置面板（专注于架构治理、成员权限与规则配置） */
function pmRenderDetailHtml(pool, me) {
  if (!pool) return '<div class="card empty">请选择左侧池节点查看详情</div>';
  const poolMsgs = poolMessages(pool.id, pmState.includeSub);
  const memberList = (pool.memberIds || []).map((id) => userById(id)).filter(Boolean);
  const recentLogs = getPoolRecentLogs(pool.id, 10);

  const canEdit = canEditPoolSettings(me, pool);
  const canSetOwner = canSetPoolOwner(me, pool);
  const canManageMembers = canManagePoolMembers(me, pool);

  let html = '<div class="card pm-detail-card" style="padding: 18px 20px;">';
  // 卡片顶栏
  html += '<div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 14px; padding-bottom: 12px; border-bottom: 1px solid #f0f2f7;">';
  html += '<div style="display: flex; align-items: center; gap: 8px;">';
  html += '<span style="font-size: 18px; font-weight: 700; color: #1f2430;">' + esc(pool.name) + '</span>';
  html += pmGetLevelTag(pool.level);
  if (pool.status === 'DISABLED') {
    html += '<span class="badge b-cancelled">已停用</span>';
  }
  html += '</div>';
  html += '<div style="display: flex; gap: 8px; align-items: center;">';
  html += '<button type="button" class="btn btn-sm btn-primary" onclick="pmViewPoolMessages(\'' + pool.id + '\')">查看此池在办信息 (' + poolMsgs.length + '条) →</button>';
  html += '</div>';
  html += '</div>'; // top bar

  // 核心元数据卡片（支持多位负责人展示与快捷配置）
  const ownerIds = pool.ownerIds || [];
  let ownerValHtml = '';
  if (!ownerIds.length) {
    ownerValHtml = '<span style="color:#d92d20; font-size:12px;">未设负责人</span>';
  } else {
    ownerValHtml = '<div class="pm-owner-chip-list">' +
      ownerIds.map((id) => '<span class="pm-owner-chip" title="池负责人：' + esc(userName(id)) + '">' + esc(userName(id)) + '</span>').join('') +
      '</div>';
  }
  if (canSetOwner) {
    ownerValHtml += ' <button type="button" class="btn btn-sm btn-ghost" style="height: 22px; padding: 0 8px; font-size: 11px; margin-left: 6px;" onclick="pmOpenSetOwner(\'' + pool.id + '\')">' +
      (ownerIds.length ? '配置/增减' : '+ 指定') + '</button>';
  }

  const secIds = pool.secretaryIds || [];
  html += '<div class="pm-detail-meta-grid" style="margin-bottom: 16px;">';
  html += '<div class="pm-meta-item wide"><div class="lbl">共同负责人 (' + ownerIds.length + '人)</div><div class="val">' + ownerValHtml + '</div></div>';
  html += '<div class="pm-meta-item"><div class="lbl">秘书</div><div class="val">' + (secIds.length ? esc(secIds.map(userName).join('、')) : '—') + '</div></div>';
  html += '<div class="pm-meta-item"><div class="lbl">成员规模</div><div class="val">' + memberList.length + ' 人</div></div>';
  html += '<div class="pm-meta-item"><div class="lbl">办结时限</div><div class="val">' + (pool.timeoutDays || 2) + ' 天</div></div>';
  html += '<div class="pm-meta-item"><div class="lbl">管辖层级</div><div class="val">' + pmGetLevelName(pool.level) + '</div></div>';
  html += '</div>'; // .pm-detail-meta-grid

  // 选项卡：配置治理专用（成员与负责人、池配置与规则、流转动态）
  const curSubTab = pmState.activeTab === 'settings' ? 'settings' : (pmState.activeTab === 'logs' ? 'logs' : 'members');
  html += '<div class="tabs" style="margin-bottom: 12px;">';
  html += '<div class="tab' + (curSubTab === 'members' ? ' on' : '') + '" onclick="pmSetTab(\'members\')">池成员与负责人 (' + memberList.length + ')</div>';
  html += '<div class="tab' + (curSubTab === 'settings' ? ' on' : '') + '" onclick="pmSetTab(\'settings\')">池配置与规则</div>';
  html += '<div class="tab' + (curSubTab === 'logs' ? ' on' : '') + '" onclick="pmSetTab(\'logs\')">流转动态 (' + recentLogs.length + ')</div>';
  html += '</div>';

  // 选项卡内容
  if (curSubTab === 'members') {
    html += '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px;">';
    html += '<div><span style="font-size: 13px; font-weight: 600; color: #344054;">本池成员共 ' + memberList.length + ' 人</span>' +
      ' <span style="font-size: 12px; color: #667085;">(其中负责人 ' + ownerIds.length + ' 人)</span></div>';
    html += '<div style="display: flex; gap: 8px;">';
    if (canSetOwner) {
      html += '<button type="button" class="btn btn-sm btn-ghost" onclick="pmOpenSetOwner(\'' + pool.id + '\')">配置共同负责人</button>';
    }
    if (canManageMembers) {
      html += '<button type="button" class="btn btn-sm btn-primary" onclick="pmOpenAddMember(\'' + pool.id + '\')">+ 添加成员</button>';
    }
    html += '</div>';
    html += '</div>';

    if (!memberList.length) {
      html += empty('本池暂未配置成员');
    } else {
      html += '<div class="pm-member-grid">';
      memberList.forEach((u) => {
        const isOwner = pool.ownerIds && pool.ownerIds.includes(u.id);
        html += '<div class="pm-member-row">';
        html += '<div class="pm-member-left">';
        html += '<span class="pm-member-avatar' + (isOwner ? ' is-owner' : '') + '">' + esc(u.name.slice(0, 1)) + '</span>';
        html += '<div><b>' + esc(u.name) + '</b> <span style="font-size: 11px; color: #98a2b3;">' + esc(u.dept || u.role || '') + '</span></div>';
        if (isOwner) {
          html += '<span class="pm-member-role-tag owner">共同负责人</span>';
        } else {
          html += '<span class="pm-member-role-tag">成员</span>';
        }
        html += '</div>';

        html += '<div style="display: flex; gap: 6px; align-items: center;">';
        if (canSetOwner) {
          if (isOwner) {
            html += '<button type="button" class="btn btn-sm btn-ghost" style="height: 24px; padding: 0 8px; font-size: 11px; color: #667085;" onclick="pmDemoteOwnerDirect(\'' + pool.id + '\', \'' + u.id + '\')" title="取消负责人身份">取消负责</button>';
          } else {
            html += '<button type="button" class="btn btn-sm btn-ghost" style="height: 24px; padding: 0 8px; font-size: 11px; color: #2f6bff; border-color: #b2ddff; background: #eff8ff;" onclick="pmPromoteOwnerDirect(\'' + pool.id + '\', \'' + u.id + '\')" title="增设为共同负责人">+ 设为负责人</button>';
          }
        }
        if (canManageMembers && (!isOwner || pool.ownerIds.length > 1)) {
          html += '<button type="button" class="btn btn-sm btn-ghost" style="height: 24px; padding: 0 8px; font-size: 11px; color: #d92d20;" onclick="pmRemoveMember(\'' + pool.id + '\', \'' + u.id + '\')">移出</button>';
        }
        html += '</div>';
        html += '</div>'; // .pm-member-row
      });
      html += '</div>';
    }
  } else if (curSubTab === 'settings') {
    // 池配置与规则 (统一采用我要填报的 form-row 样式)
    const parentPool = pool.parentId ? poolById(pool.parentId) : null;
    html += '<div style="background: #f8f9fc; border-radius: 8px; padding: 16px; border: 1px solid #eef1f7;">';
    html += '<form onsubmit="event.preventDefault(); pmSubmitInlineSettings(\'' + pool.id + '\')">';

    html += '<div class="form-row"><div class="form-label">池名称 <span class="req">*</span></div>' +
      '<input type="text" id="inlinePoolName" value="' + esc(pool.name) + '" required ' + (!canEdit ? 'disabled' : '') + '></div>';

    html += '<div class="form-row"><div class="form-label">所属上级池</div>' +
      '<input type="text" value="' + (parentPool ? esc(parentPool.name) : '无（顶层池）') + '" disabled></div>';

    html += '<div class="form-row"><div class="form-label">办结时限要求 (天)</div>' +
      '<input type="number" id="inlinePoolTimeout" value="' + (pool.timeoutDays || 2) + '" min="1" max="30" ' + (!canEdit ? 'disabled' : '') + '></div>';

    html += '<div class="form-hint">8 个业务池为填报入口，进池消息直投该池负责人+秘书，总池分发人李倩影同步跟进并可继续分发；池本身不设其他分发人。</div>';

    if (canEdit) {
      html += '<div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 16px;">' +
        '<button type="submit" class="btn btn-primary btn-sm">保存池配置</button>' +
      '</div>';
    }
    html += '</form>';
    html += '</div>';
  } else if (curSubTab === 'logs') {
    if (!recentLogs.length) {
      html += empty('本池暂无流转日志记录');
    } else {
      html += '<div style="padding: 4px 0;">';
      recentLogs.forEach((l) => {
        const msg = findMsg(l.messageId);
        html += '<div class="tl-item">';
        html += '<div class="tl-text"><b>' + esc(userName(l.actorId)) + '</b> ' + esc(logText(l));
        if (msg) {
          html += ' <span style="color: #2f6bff; cursor: pointer;" onclick="openMessage(\'' + msg.id + '\')">(' + esc(msg.no) + ')</span>';
        }
        html += '</div>';
        html += '<div class="tl-time">' + fmtTime(l.at) + '</div>';
        html += '</div>';
      });
      html += '</div>';
    }
  }

  html += '</div>'; // .pm-detail-card
  return html;
}

/* 渲染浮层与弹窗 */
function pmRenderModalHtml(me) {
  if (!pmState.modal) return '';
  const m = pmState.modal;
  const pool = m.poolId ? poolById(m.poolId) : null;

  // 1. 操作菜单 ActionSheet 弹窗
  if (m.type === 'menu' && pool) {
    const canSetOwner = canSetPoolOwner(me, pool);
    const canManageMem = canManagePoolMembers(me, pool);
    const canEdit = canEditPoolSettings(me, pool);
    const canDisable = canDisablePool(me, pool);

    return '<div class="pm-modal-overlay" onclick="pmCloseModal()">' +
      '<div class="pm-modal-box pm-action-sheet-modal" onclick="event.stopPropagation()">' +
        '<div class="pm-modal-head">' +
          '<h3>' + esc(pool.name) + ' · 管理操作</h3>' +
          '<button type="button" class="pm-modal-close" onclick="pmCloseModal()">✕</button>' +
        '</div>' +
        '<div class="pm-modal-body">' +
          '<div class="pm-sheet-menu">' +
            (canSetOwner ? '<button type="button" class="pm-sheet-item" onclick="pmOpenSetOwner(\'' + pool.id + '\');">共同负责人</button>' : '') +
            (canManageMem ? '<button type="button" class="pm-sheet-item" onclick="pmOpenAddMember(\'' + pool.id + '\');">池成员</button>' : '') +
            (canEdit ? '<button type="button" class="pm-sheet-item" onclick="pmOpenSettings(\'' + pool.id + '\');">规则设置</button>' : '') +
            (canDisable ? '<button type="button" class="pm-sheet-item danger" onclick="pmToggleDisablePool(\'' + pool.id + '\');">' + (pool.status === 'DISABLED' ? '启用本池' : '停用本池') + '</button>' : '') +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  // 2. 池设置弹窗
  if (m.type === 'settings' && pool) {
    return '<div class="pm-modal-overlay" onclick="pmCloseModal()">' +
      '<div class="pm-modal-box" onclick="event.stopPropagation()">' +
        '<div class="pm-modal-head">' +
          '<h3>' + esc(pool.name) + ' · 池设置</h3>' +
          '<button type="button" class="pm-modal-close" onclick="pmCloseModal()">✕</button>' +
        '</div>' +
        '<form onsubmit="event.preventDefault(); pmSubmitSettings(\'' + pool.id + '\')">' +
          '<div class="pm-modal-body">' +
            '<div class="pm-form-row">' +
              '<label>池名称</label>' +
              '<input type="text" id="editPoolName" value="' + esc(pool.name) + '" required />' +
            '</div>' +
            '<div class="pm-form-row">' +
              '<label>办理时限（天）</label>' +
              '<input type="number" id="editPoolTimeout" value="' + (pool.timeoutDays || 2) + '" min="1" max="30" />' +
            '</div>' +
            '<div class="hint">消息进池后直投池负责人+秘书，总池分发人李倩影同步跟进并可继续分发，池内不再设置其他分发人</div>' +
          '</div>' +
          '<div class="pm-modal-foot">' +
            '<button type="button" class="btn btn-ghost" onclick="pmCloseModal()">取消</button>' +
            '<button type="submit" class="btn btn-primary">保存设置</button>' +
          '</div>' +
        '</form>' +
      '</div>' +
    '</div>';
  }

  // 3. 配置/增减池负责人弹窗（支持多选、共同负责）
  if (m.type === 'setOwner' && pool) {
    const curOwners = new Set(pool.ownerIds || []);
    return '<div class="pm-modal-overlay" onclick="pmCloseModal()">' +
      '<div class="pm-modal-box" onclick="event.stopPropagation()">' +
        '<div class="pm-modal-head">' +
          '<h3>配置池负责人 · ' + esc(pool.name) + '</h3>' +
          '<button type="button" class="pm-modal-close" onclick="pmCloseModal()">✕</button>' +
        '</div>' +
        '<form onsubmit="event.preventDefault(); pmSubmitSetOwners(\'' + pool.id + '\')">' +
          '<div class="pm-modal-body">' +
            '<div style="font-size: 12px; color: #475467; margin-bottom: 12px; line-height: 1.5; background: #f8f9fc; padding: 10px 12px; border-radius: 8px; border: 1px solid #eaecf0;">' +
              '<b>多负责人协同说明</b>：每个池可设置<b>多位共同负责人</b>。勾选的人员将共同拥有本池及下级子池的管理、分发与转派权限。' +
            '</div>' +
            '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 8px;">' +
              '<span style="font-size: 13px; font-weight: 600; color: #344054;">勾选设为共同负责人的成员：</span>' +
              '<span id="pmOwnerSelectCount" style="font-size: 12px; color: #2f6bff; font-weight: 500;">已选 ' + curOwners.size + ' 位</span>' +
            '</div>' +
            '<div class="pm-multi-select-list">' +
              USERS.map((u) => {
                const isChecked = curOwners.has(u.id);
                const isMember = (pool.memberIds || []).includes(u.id);
                return '<label class="pm-multi-select-item' + (isChecked ? ' checked' : '') + '">' +
                  '<input type="checkbox" name="poolOwnerSelect" value="' + u.id + '"' + (isChecked ? ' checked' : '') + ' onchange="this.closest(\'.pm-multi-select-item\').classList.toggle(\'checked\', this.checked); pmUpdateOwnerSelectCount();" />' +
                  '<span class="pm-member-avatar' + (isChecked ? ' is-owner' : '') + '">' + esc(u.name.slice(0, 1)) + '</span>' +
                  '<div class="pm-ms-info">' +
                    '<span class="pm-ms-name">' + esc(u.name) + '</span>' +
                    '<span class="pm-ms-dept">' + esc(u.dept || u.role) + '</span>' +
                  '</div>' +
                  '<span class="pm-ms-tag' + (isChecked ? ' owner' : (isMember ? ' member' : '')) + '">' +
                    (isChecked ? '已是负责人' : (isMember ? '本池成员' : '组织员工')) +
                  '</span>' +
                '</label>';
              }).join('') +
            '</div>' +
          '</div>' +
          '<div class="pm-modal-foot">' +
            '<button type="button" class="btn btn-ghost" onclick="pmCloseModal()">取消</button>' +
            '<button type="submit" class="btn btn-primary">保存负责人配置</button>' +
          '</div>' +
        '</form>' +
      '</div>' +
    '</div>';
  }

  // 4. 添加成员弹窗
  if (m.type === 'addMember' && pool) {
    const existing = new Set(pool.memberIds || []);
    const candidates = USERS.filter((u) => !existing.has(u.id));
    const deptGroups = [];
    candidates.forEach((u) => {
      const dept = u.dept || '其他人员';
      let group = deptGroups.find((item) => item.name === dept);
      if (!group) { group = { name: dept, users: [] }; deptGroups.push(group); }
      group.users.push(u);
    });
    const orgHtml = deptGroups.map((group, groupIndex) =>
      '<div class="pm-org-group">' +
        '<label class="pm-org-dept">' +
          '<input type="checkbox" data-member-group-head="' + groupIndex + '" onchange="pmToggleMemberDept(' + groupIndex + ', this.checked)" />' +
          '<span>' + esc(group.name) + '</span><i>' + group.users.length + '人</i>' +
        '</label>' +
        '<div class="pm-org-members">' + group.users.map((u) =>
          '<label class="pm-org-person">' +
            '<input type="checkbox" name="poolMemberSelect" data-member-group="' + groupIndex + '" value="' + u.id + '" onchange="pmUpdateMemberSelectCount()" />' +
            '<span class="pm-member-avatar">' + esc(u.name.slice(0, 1)) + '</span>' +
            '<span class="pm-org-person-info"><b>' + esc(u.name) + '</b><small>' + esc(u.title || u.role) + '</small></span>' +
          '</label>').join('') +
        '</div>' +
      '</div>').join('');

    return '<div class="pm-modal-overlay" onclick="pmCloseModal()">' +
      '<div class="pm-modal-box" onclick="event.stopPropagation()">' +
        '<div class="pm-modal-head">' +
          '<h3>添加池成员 · ' + esc(pool.name) + '</h3>' +
          '<button type="button" class="pm-modal-close" onclick="pmCloseModal()">✕</button>' +
        '</div>' +
        '<form onsubmit="event.preventDefault(); pmSubmitAddMember(\'' + pool.id + '\')">' +
          '<div class="pm-modal-body">' +
            '<div class="pm-member-picker-head"><b>按组织架构选择成员</b><span id="pmMemberSelectCount">已选 0 人</span></div>' +
            '<div class="pm-org-picker">' + (candidates.length ? orgHtml : '<div class="empty">暂无可添加成员</div>') + '</div>' +
            '<div class="hint pm-share-hint">成员加入后，可共享查看和参与处理进入该池的信息。</div>' +
          '</div>' +
          '<div class="pm-modal-foot">' +
            '<button type="button" class="btn btn-ghost" onclick="pmCloseModal()">取消</button>' +
            '<button type="submit" class="btn btn-primary"' + (!candidates.length ? ' disabled' : '') + '>添加所选成员</button>' +
          '</div>' +
        '</form>' +
      '</div>' +
    '</div>';
  }

  // 5. 催办弹窗
  if (m.type === 'urge') {
    const msg = findMsg(m.messageId);
    return '<div class="pm-modal-overlay" onclick="pmCloseModal()">' +
      '<div class="pm-modal-box" onclick="event.stopPropagation()">' +
        '<div class="pm-modal-head">' +
          '<h3>催办处理提醒</h3>' +
          '<button type="button" class="pm-modal-close" onclick="pmCloseModal()">✕</button>' +
        '</div>' +
        '<form onsubmit="event.preventDefault(); pmSubmitUrge(\'' + m.messageId + '\', \'' + (m.poolId || '') + '\')">' +
          '<div class="pm-modal-body">' +
            '<div class="pm-form-row">' +
              '<label>目标消息</label>' +
              '<input type="text" value="' + (msg ? esc(msg.no + ' ' + msg.title) : '') + '" disabled />' +
            '</div>' +
            '<div class="pm-form-row">' +
              '<label>催办说明</label>' +
              '<textarea id="urgeNote" rows="3" placeholder="请尽快处理客户诉求，谢谢。">此事项已临近/超出处理时限，请当前经办人加紧办理并反馈进展！</textarea>' +
              '<div class="hint">提交后将通过企业微信机器人向本池经办人推送加急通知并计入流转日志。</div>' +
            '</div>' +
          '</div>' +
          '<div class="pm-modal-foot">' +
            '<button type="button" class="btn btn-ghost" onclick="pmCloseModal()">取消</button>' +
            '<button type="submit" class="btn btn-primary" style="background:#d92d20; border-color:#d92d20;">发送催办通知</button>' +
          '</div>' +
        '</form>' +
      '</div>' +
    '</div>';
  }

  // 6. 转派弹窗
  if (m.type === 'transfer') {
    const msg = findMsg(m.messageId);
    const visibleSubtree = visiblePoolSubtree(me);
    return '<div class="pm-modal-overlay" onclick="pmCloseModal()">' +
      '<div class="pm-modal-box" onclick="event.stopPropagation()">' +
        '<div class="pm-modal-head">' +
          '<h3>转派消息责任池</h3>' +
          '<button type="button" class="pm-modal-close" onclick="pmCloseModal()">✕</button>' +
        '</div>' +
        '<form onsubmit="event.preventDefault(); pmSubmitTransfer(\'' + m.messageId + '\', \'' + (m.poolId || '') + '\')">' +
          '<div class="pm-modal-body">' +
            '<div class="pm-form-row">' +
              '<label>当前消息</label>' +
              '<input type="text" value="' + (msg ? esc(msg.no + ' ' + msg.title) : '') + '" disabled />' +
            '</div>' +
            '<div class="pm-form-row">' +
              '<label>转派目标池</label>' +
              '<select id="transferTargetPool">' +
                visibleSubtree.map((p) => '<option value="' + p.id + '">' + esc(p.name) + ' (' + pmGetLevelName(p.level) + ')</option>').join('') +
              '</select>' +
            '</div>' +
            '<div class="pm-form-row">' +
              '<label>指定接单人（可选）</label>' +
              '<select id="transferTargetUser">' +
                '<option value="">由目标池负责人分配</option>' +
                USERS.map((u) => '<option value="' + u.id + '">' + esc(u.name) + ' (' + esc(u.dept || u.role) + ')</option>').join('') +
              '</select>' +
            '</div>' +
            '<div class="pm-form-row">' +
              '<label>转派原因 / 附言</label>' +
              '<textarea id="transferNote" rows="2" placeholder="填写转派业务原因与交接要求"></textarea>' +
            '</div>' +
          '</div>' +
          '<div class="pm-modal-foot">' +
            '<button type="button" class="btn btn-ghost" onclick="pmCloseModal()">取消</button>' +
            '<button type="submit" class="btn btn-primary">确认转派</button>' +
          '</div>' +
        '</form>' +
      '</div>' +
    '</div>';
  }

  return '';
}

/* 主入口函数：renderPools() */
/* 分管池在办信息 Tab 渲染 */
function pmRenderManagedMessagesHtml(me, root, subTreePools, allManagedMsgs) {
  // 1. 数据统计
  const total = allManagedMsgs.length;
  const dispatchCount = allManagedMsgs.filter((m) => flowStatus(m, me) === 'dispatch').length;
  const todoCount = allManagedMsgs.filter((m) => flowStatus(m, me) === 'todo').length;
  const doneCount = allManagedMsgs.filter((m) => flowStatus(m, me) === 'done').length;
  const endedCount = allManagedMsgs.filter((m) => flowStatus(m, me) === 'ended').length;
  const overdueCount = allManagedMsgs.filter((m) => isMessageOverdue(m)).length;
  const validStatuses = ['all', 'dispatch', 'todo', 'done', 'ended', 'overdue'];
  if (!validStatuses.includes(pmState.statusFilter)) pmState.statusFilter = 'all';

  // 2. 消息筛选
  let msgs = allManagedMsgs;
  if (pmState.filterPoolId && pmState.filterPoolId !== 'all') {
    msgs = poolMessages(pmState.filterPoolId, true);
  }

  if (pmState.statusFilter && pmState.statusFilter !== 'all') {
    if (pmState.statusFilter === 'overdue') {
      msgs = msgs.filter((m) => isMessageOverdue(m));
    } else {
      msgs = msgs.filter((m) => flowStatus(m, me) === pmState.statusFilter);
    }
  }

  if (pmState.keyword) {
    const kw = pmState.keyword.trim().toLowerCase();
    msgs = msgs.filter((m) =>
      (m.title && m.title.toLowerCase().includes(kw)) ||
      (m.no && m.no.toLowerCase().includes(kw)) ||
      (m.customerName && m.customerName.toLowerCase().includes(kw)) ||
      (m.content && m.content.toLowerCase().includes(kw)) ||
      (poolName(m.poolId) && poolName(m.poolId).toLowerCase().includes(kw))
    );
  }

  // 排序
  if (pmState.sortOrder === 'created') {
    msgs = [...msgs].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  } else if (pmState.sortOrder === 'overdueFirst') {
    msgs = [...msgs].sort((a, b) => {
      const aOd = isMessageOverdue(a) ? 1 : 0;
      const bOd = isMessageOverdue(b) ? 1 : 0;
      if (bOd !== aOd) return bOd - aOd;
      return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
    });
  } else {
    // 默认最近更新
    msgs = [...msgs].sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
  }

  let html = '';

  // 综合筛选控制台（与工作台、信息池样式高度统一）
  html += '<div class="card pm-filter-card">';
  html += '<div class="pm-filter-layout">';

  // 左侧：管辖池筛选下拉与状态胶囊
  html += '<div class="pm-filter-primary">';
  html += '<span style="font-size: 12px; color: #475467; font-weight: 500;">筛选责任池：</span>';
  html += '<select onchange="pmSetFilterPool(this.value)" style="font-size: 12px; height: 32px; padding: 0 10px; border-radius: 6px; border: 1px solid #d0d5dd; max-width: 220px;">';
  html += '<option value="all"' + (pmState.filterPoolId === 'all' ? ' selected' : '') + '>全部分管池</option>';
  subTreePools.forEach((p) => {
    const indent = p.level === 0 ? '' : (p.level === 1 ? '  ' : (p.level === 2 ? '    ' : '      '));
    html += '<option value="' + p.id + '"' + (pmState.filterPoolId === p.id ? ' selected' : '') + '>' +
      indent + esc(p.name) +
    '</option>';
  });
  html += '</select>';

  // 状态筛选 Tab 胶囊
  html += '<div class="tabs" style="margin: 0;">';
  const stTab = (key, label, c) => '<div class="tab' + (pmState.statusFilter === key ? ' on' : '') + '" onclick="pmSetStatusFilter(\'' + key + '\')">' + label + '<span class="stat-count-pill">' + c + '</span></div>';
  html += stTab('all', '全部', total);
  html += stTab('dispatch', '待分发', dispatchCount);
  html += stTab('todo', '待办', todoCount);
  html += stTab('done', '已办', doneCount);
  html += stTab('ended', '已解决', endedCount);
  html += stTab('overdue', '超时', overdueCount);
  html += '</div>';
  html += '</div>'; // left controls

  // 右侧：搜索框与排序
  html += '<div class="pm-filter-secondary">';
  html += '<input type="text" id="pmMsgSearchInput" placeholder="搜编号/标题/客户/内容/池..." value="' + esc(pmState.keyword || '') + '" oninput="pmSetKeyword(this.value)" style="font-size: 12px; height: 32px; width: 220px; border-radius: 6px; border: 1px solid #d0d5dd; padding: 0 10px;" />';
  html += '<select onchange="pmSetSortOrder(this.value)" style="font-size: 12px; height: 32px; padding: 0 8px; border-radius: 6px; border: 1px solid #d0d5dd;">';
  html += '<option value="updated"' + (pmState.sortOrder === 'updated' ? ' selected' : '') + '>按更新时间</option>';
  html += '<option value="created"' + (pmState.sortOrder === 'created' ? ' selected' : '') + '>按提出时间</option>';
  html += '<option value="overdueFirst"' + (pmState.sortOrder === 'overdueFirst' ? ' selected' : '') + '>超时预警优先</option>';
  html += '</select>';
  if (pmState.filterPoolId !== 'all' || pmState.statusFilter !== 'all' || pmState.keyword) {
    html += '<button type="button" class="btn btn-sm btn-ghost" style="height: 32px;" onclick="pmResetMsgFilters()">重置</button>';
  }
  html += '</div>'; // right controls

  html += '</div>'; // flex container
  html += '</div>'; // .card

  // 消息列表渲染
  if (!msgs.length) {
    html += empty('当前分管范围暂无符合筛选条件的信息');
  } else {
    html += '<div class="pm-message-list">';
    html += msgs.map((m) => messageListCardHtml(m, me)).join('');
    html += '</div>';
  }

  return html;
}

/* 池管理只治理一级业务池：分发人/管理员见全部 8 个，业务池负责人见自己负责的，
 * 部门与小组负责人归入其所属业务池（部门/小组本身不在本页管理） */
function pmBizPoolsFor(me) {
  if (isAdmin(me) || isDispatcher(me)) return bizPools();
  const owned = bizPools().filter((p) => (p.ownerIds || []).includes(me.id));
  if (owned.length) return owned;
  const root = userRootPool(me);
  if (!root) return [];
  let cur = root;
  while (cur && cur.parentId) cur = poolById(cur.parentId);
  return cur && cur.type === 'biz' ? [cur] : [];
}

/* 架构树与配置治理 Tab 渲染：只治理一级业务池，部门与小组随组织架构归入业务池 */
function pmRenderTreeManagementHtml(me) {
  let html = '<div class="pm-split">';

  // 左侧：管辖池架构树
  html += '<div class="pm-split-left">';
  html += '<div class="card pm-tree-card">';
  html += '<div class="card-title" style="font-size: 15px; margin-bottom: 10px;">目标池</div>';

  // 树筛选栏 (统一采用标准 filters 样式)
  html += '<div class="filters" style="margin-bottom: 12px; gap: 8px;">';
  html += '<input type="text" id="pmSearchInput" placeholder="搜池名称 / 负责人 / 秘书..." value="' + esc(pmState.keyword || '') + '" oninput="pmSetKeyword(this.value)" style="font-size: 12px;" />';
  html += '</div>';

  html += '<div class="pm-tree-body" style="max-height: 640px; overflow-y: auto; padding-right: 2px;">';
  const kw = (pmState.keyword || '').trim().toLowerCase();
  const roots = pmBizPoolsFor(me).filter((p) => {
    if (!kw) return true;
    const hay = [p.name]
      .concat((p.ownerIds || []).map(userName))
      .concat((p.secretaryIds || []).map(userName))
      .join(' ').toLowerCase();
    return hay.indexOf(kw) > -1;
  });
  html += roots.length
    ? roots.map((p) => pmRenderNodeHtml(p)).join('')
    : empty(kw ? '没有匹配「' + esc(kw) + '」的业务池' : '部门与小组由组织架构归入业务池，池管理只治理一级业务池');
  html += '</div>';

  html += '</div>'; // .card
  html += '</div>'; // .pm-split-left

  html += '</div>'; // .pm-split
  return html;
}

/* 主入口函数：renderPools() */
function renderPools() {
  const me = curUser();
  const roots = pmRoots(me);

  // 如果普通员工没有所属管理根节点
  if (!roots.length || !canAccessPoolManage(me)) {
    return '<div class="card empty" style="max-width: 640px; margin: 40px auto; padding: 32px 24px;">' +
      '<div style="font-size: 16px; font-weight: 600; margin-bottom: 8px; color: #1f2430;">您当前身份为普通员工，暂无池管理权限</div>' +
      '<div style="font-size: 13px; color: #667085; max-width: 480px; margin: 0 auto 20px; line-height: 1.6;">' +
        '当前身份（<b>' + esc(me.name) + ' · ' + (me.title || ROLES[me.role]) + '</b>）属于基层员工。请在右上角切换为<b>总池分发人、业务池负责人或部门/小组负责人</b>，以体验按职级授权裁剪的组织架构树。' +
      '</div>' +
      '<div style="display: flex; gap: 8px; justify-content: center; flex-wrap: wrap;">' +
        '<button type="button" class="btn btn-primary" onclick="changeIdentity(\'u_qy\')">切为 李倩影 · 总池分发人（全部 8 个池）</button>' +
        '<button type="button" class="btn btn-ghost" onclick="changeIdentity(\'u_wjx\')">切为 王冀湘 · 机构池负责人</button>' +
        '<button type="button" class="btn btn-ghost" onclick="changeIdentity(\'u_zm\')">切为 周明 · 部门负责人</button>' +
      '</div>' +
    '</div>';
  }

  let html = '<div class="pm-container">';

  // 池管理页专注信息池架构与配置
  html += pmRenderTreeManagementHtml(me);

  html += '</div>'; // .pm-container

  // 3. 模态弹窗渲染
  html += pmRenderModalHtml(me);

  return html;
}

/* ---------- 页面事件绑定函数 ---------- */
window.pmOnIdentityChange = function() {
  pmState.modal = null;
  const roots = pmRoots(curUser());
  pmState.selectedPoolId = roots.length ? roots[0].id : null;
  pmState.filterPoolId = 'all';
};

window.pmSetMainTab = function(tab) {
  pmState.mainTab = tab;
  render();
};

window.pmSetFilterPool = function(poolId) {
  pmState.filterPoolId = poolId;
  render();
};

window.pmSetSortOrder = function(order) {
  pmState.sortOrder = order;
  render();
};

window.pmViewPoolMessages = function(poolId) {
  pmState.filterPoolId = poolId;
  pmState.mainTab = 'messages';
  pmCloseModal();
  render();
};

window.pmResetMsgFilters = function() {
  pmState.filterPoolId = 'all';
  pmState.statusFilter = 'all';
  pmState.keyword = '';
  pmState.sortOrder = 'updated';
  render();
};

window.pmSetSelected = function(poolId) {
  pmState.selectedPoolId = poolId;
  render();
};

window.pmSetIncludeSub = function(val) {
  pmState.includeSub = !!val;
  render();
};

window.pmSetStatusFilter = function(val) {
  pmState.statusFilter = val;
  render();
};

window.pmSetKeyword = function(val) {
  pmState.keyword = val;
  render();
  const el = document.getElementById('pmSearchInput');
  if (el) {
    el.focus();
    el.selectionStart = el.selectionEnd = el.value.length;
  }
};

window.pmSetTab = function(tab) {
  pmState.activeTab = tab;
  render();
};

window.pmOpenMenu = function(poolId) {
  pmState.modal = { type: 'menu', poolId };
  render();
};

window.pmOpenSettings = function(poolId) {
  pmState.modal = { type: 'settings', poolId };
  render();
};

window.pmOpenSetOwner = function(poolId) {
  pmState.modal = { type: 'setOwner', poolId };
  render();
};

window.pmOpenAddMember = function(poolId) {
  pmState.modal = { type: 'addMember', poolId };
  render();
};

window.pmOpenUrge = function(messageId, poolId) {
  pmState.modal = { type: 'urge', messageId, poolId };
  render();
};

window.pmOpenTransfer = function(messageId, poolId) {
  pmState.modal = { type: 'transfer', messageId, poolId };
  render();
};

window.pmCloseModal = function() {
  pmState.modal = null;
  render();
};

window.pmUpdateOwnerSelectCount = function() {
  const cbs = document.querySelectorAll('input[name="poolOwnerSelect"]:checked');
  const countEl = document.getElementById('pmOwnerSelectCount');
  if (countEl) {
    countEl.innerText = '已选 ' + cbs.length + ' 位';
  }
};

window.pmToggleMemberDept = function(groupIndex, checked) {
  document.querySelectorAll('input[name="poolMemberSelect"][data-member-group="' + groupIndex + '"]').forEach((cb) => {
    cb.checked = checked;
  });
  pmUpdateMemberSelectCount();
};

window.pmUpdateMemberSelectCount = function() {
  const selected = document.querySelectorAll('input[name="poolMemberSelect"]:checked');
  const countEl = document.getElementById('pmMemberSelectCount');
  if (countEl) countEl.innerText = '已选 ' + selected.length + ' 人';
  document.querySelectorAll('[data-member-group-head]').forEach((head) => {
    const groupIndex = head.getAttribute('data-member-group-head');
    const children = Array.from(document.querySelectorAll('input[name="poolMemberSelect"][data-member-group="' + groupIndex + '"]'));
    const checkedCount = children.filter((cb) => cb.checked).length;
    head.checked = children.length > 0 && checkedCount === children.length;
    head.indeterminate = checkedCount > 0 && checkedCount < children.length;
  });
};

window.pmSubmitSettings = function(poolId) {
  const name = document.getElementById('editPoolName').value;
  const timeoutDays = document.getElementById('editPoolTimeout').value;

  const res = updatePool(poolId, { name, timeoutDays });
  if (res.ok) {
    toast('池设置已成功更新');
    pmState.modal = null;
    render();
  }
};

window.pmSubmitInlineSettings = function(poolId) {
  const nameEl = document.getElementById('inlinePoolName');
  const timeoutEl = document.getElementById('inlinePoolTimeout');

  const name = nameEl ? nameEl.value.trim() : '';
  const timeoutDays = timeoutEl ? timeoutEl.value : 2;

  const res = updatePool(poolId, { name, timeoutDays });
  if (res.ok) {
    toast('已保存池参数配置');
    render();
  }
};

window.pmSubmitSetOwners = function(poolId) {
  const cbs = document.querySelectorAll('input[name="poolOwnerSelect"]:checked');
  const ownerIds = Array.from(cbs).map((cb) => cb.value);
  setPoolOwners(poolId, ownerIds);
  const names = ownerIds.map((id) => userName(id)).join('、');
  toast('已更新池负责人（共 ' + ownerIds.length + ' 位）：' + (names || '未指定'));
  pmState.modal = null;
  render();
};

window.pmSubmitSetOwner = function(poolId) {
  const el = document.getElementById('setPoolOwnerSelect');
  if (el) {
    const ownerId = el.value;
    setPoolOwner(poolId, ownerId);
    toast('负责人已更新为：' + (ownerId ? userName(ownerId) : '未指定'));
  } else {
    pmSubmitSetOwners(poolId);
    return;
  }
  pmState.modal = null;
  render();
};

window.pmSubmitSetOwnerDirect = function(poolId, ownerId) {
  addPoolOwner(poolId, ownerId);
  toast('已将 ' + userName(ownerId) + ' 设为负责人');
  render();
};

window.pmPromoteOwnerDirect = function(poolId, userId) {
  addPoolOwner(poolId, userId);
  toast('已增设 ' + userName(userId) + ' 为本池共同负责人');
  render();
};

window.pmDemoteOwnerDirect = function(poolId, userId) {
  const p = poolById(poolId);
  if (p && p.ownerIds && p.ownerIds.length <= 1) {
    if (!confirm('提示：' + userName(userId) + ' 是本池目前唯一的负责人。确定要取消其负责人身份吗？')) {
      return;
    }
  }
  removePoolOwner(poolId, userId);
  toast('已取消 ' + userName(userId) + ' 的负责人身份');
  render();
};

window.pmSubmitAddMember = function(poolId) {
  const selected = Array.from(document.querySelectorAll('input[name="poolMemberSelect"]:checked')).map((cb) => cb.value);
  if (!selected.length) { toast('请至少选择一名成员'); return; }
  const result = addPoolMembers(poolId, selected);
  if (!result.ok) { toast(result.msg); return; }
  toast('已添加 ' + result.count + ' 名池成员，成员可共享查看该池信息');
  pmState.modal = null;
  render();
};

window.pmRemoveMember = function(poolId, userId) {
  if (!confirm('确定将 ' + userName(userId) + ' 移出该池成员名单吗？')) return;
  removePoolMember(poolId, userId);
  toast('已移出成员 ' + userName(userId));
  render();
};

window.pmToggleDisablePool = function(poolId) {
  const p = poolById(poolId);
  if (!p) return;
  const isDisabling = p.status !== 'DISABLED';
  const metrics = poolMetrics(poolId, true);
  if (isDisabling && metrics.total > 0) {
    if (!confirm('警告：该池当前仍有 ' + metrics.total + ' 条在办消息流转！确定停用该池吗？停用后新消息将无法分发进池。')) {
      return;
    }
  }
  disablePool(poolId);
  toast(isDisabling ? '池已停用' : '池已重新启用');
  pmState.modal = null;
  render();
};

window.pmSubmitUrge = function(messageId, poolId) {
  const res = urgeMessage(messageId, poolId);
  if (res.ok) {
    toast('催办通知已发送');
    pmState.modal = null;
    render();
  }
};

window.pmSubmitTransfer = function(messageId, fromPoolId) {
  const targetPoolId = document.getElementById('transferTargetPool').value;
  const targetUserId = document.getElementById('transferTargetUser').value;
  const note = document.getElementById('transferNote').value;
  const res = transferMessage(messageId, fromPoolId, targetPoolId, targetUserId, note);
  if (res.ok) {
    toast('消息已成功转派到 ' + poolName(targetPoolId));
    pmState.modal = null;
    render();
  }
};

window.pmToggleFollow = function(messageId) {
  const res = toggleFollowMessage(messageId);
  toast(res.followed ? '已关注消息' : '已取消关注');
  render();
};
