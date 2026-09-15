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
function confirmBadge(state) { return '<span class="badge b-' + state + '">' + CONFIRM_STATE[state] + '</span>'; }

/* 流程是否已结束（所有处理人处理完）：confirming/closed/cancelled 均属已结束 */
function isEnded(m) { return m.status === 'confirming' || m.status === 'closed' || m.status === 'cancelled'; }
/* 主流程状态（相对当前身份）：待分发 / 待办 / 已办 / 已结束 */
function flowStatus(m, me) {
  if (isEnded(m)) return 'ended';
  if (isDispatcher(me) && m.sourcePoolId === 'p_company' && m.status === 'p_company') return 'dispatch';
  if (myActiveUnsubmittedLink(me, m)) return 'todo';
  return 'done';
}
/* 状态徽章（卡片/详情头部只展示主流程状态） */
function flowBadge(m, me) {
  const s = flowStatus(m, me);
  return '<span class="badge b-' + s + '">' + FLOW_STATUS[s] + '</span>';
}
function attsHtml(atts) {
  if (!atts || !atts.length) return '';
  return '<div class="att-chips">' + atts.map((a) =>
    '<span class="att-chip">' + (a.type === 'voice' ? '[语音] ' : a.type === 'image' ? '[图片] ' : '') + esc(a.name) +
    (a.size ? '（' + fmtSize(a.size) + '）' : '') + '</span>').join('') + '</div>';
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

/* 当前用户可见的消息列表 */
function visibleMessages() {
  const me = curUser();
  return S.messages.filter((m) => canSeeMessage(me, m));
}
/* 消息当前是否挂在某池（公司总池 = 待分发） */
function msgInPool(m, poolId) {
  if (poolId === 'all') return true;
  const pool = poolById(poolId);
  if (pool && pool.type === 'company') return !linksOf(m.id).length;
  return linksOf(m.id).some((l) => l.poolId === poolId);
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
let wbTab = null;   /* null = 默认视图：总池分发人默认「待分发」，其余默认「全部」 */
let wbPool = 'all';
let wbStatus = '';
let wbTag = '';
let wbKw = '';

function wbTabs() {
  if (isDispatcher(curUser())) {
    return [
      { key: 'all', name: '全部' },
      { key: 'dispatch', name: '待分发' },
      { key: 'todo', name: '待办' },
      { key: 'done', name: '已办' },
      { key: 'ended', name: '已解决' },
      { key: 'overdue', name: '超时' },
      { key: 'mine', name: '我发起的' }
    ];
  }
  return [
    { key: 'all', name: '全部' },
    { key: 'todo', name: '待办' },
    { key: 'done', name: '已办' },
    { key: 'ended', name: '已解决' },
    { key: 'overdue', name: '超时' },
    { key: 'mine', name: '我发起的' }
  ];
}
function effectiveWbTab() {
  const keys = wbTabs().map((t) => t.key);
  if (wbTab && keys.includes(wbTab)) return wbTab;
  return isDispatcher(curUser()) ? 'dispatch' : 'all';
}

function wbTabCount(key) {
  const me = curUser();
  let list = visibleMessages();
  if (wbPool !== 'all') list = list.filter((m) => msgInPool(m, wbPool));
  if (wbTag) list = list.filter((m) => (m.tags || []).includes(wbTag));
  if (key === 'dispatch') return list.filter((m) => m.sourcePoolId === 'p_company' && m.status === 'p_company').length;
  if (key === 'todo') return list.filter((m) => flowStatus(m, me) === 'todo').length;
  if (key === 'done') return list.filter((m) => flowStatus(m, me) === 'done').length;
  if (key === 'ended') return list.filter((m) => flowStatus(m, me) === 'ended').length;
  if (key === 'overdue') return list.filter((m) => isMessageOverdue(m)).length;
  if (key === 'mine') return list.filter((m) => m.createdBy === me.id).length;
  return list.length;
}

function wbList() {
  const me = curUser();
  const tab = effectiveWbTab();
  let list = visibleMessages();
  /* 待分发区：仅投向公司总池、待分发的消息 */
  if (tab === 'dispatch') list = list.filter((m) => m.sourcePoolId === 'p_company' && m.status === 'p_company');
  /* 主流程状态（相对当前身份）：待办 / 已办 / 已结束 */
  else if (tab === 'todo') list = list.filter((m) => flowStatus(m, me) === 'todo');
  else if (tab === 'done') list = list.filter((m) => flowStatus(m, me) === 'done');
  else if (tab === 'ended') list = list.filter((m) => flowStatus(m, me) === 'ended');
  else if (tab === 'overdue') list = list.filter((m) => isMessageOverdue(m));
  else if (tab === 'mine') list = list.filter((m) => m.createdBy === me.id);
  if (wbPool !== 'all') list = list.filter((m) => msgInPool(m, wbPool));
  if (wbStatus === 'overdue') list = list.filter((m) => isMessageOverdue(m));
  else if (wbStatus) list = list.filter((m) => flowStatus(m, me) === wbStatus);
  if (wbTag) list = list.filter((m) => (m.tags || []).includes(wbTag));
  if (wbKw) list = list.filter((m) => (m.no + m.title).toLowerCase().includes(wbKw.toLowerCase()));
  return list.sort((a, b) => b.updatedAt - a.updatedAt);
}

window.setWbPool = (id) => { wbPool = id; render(); };
window.setWbTab = (k) => { wbTab = k; render(); };
window.setWbStatus = (v) => { wbStatus = v; render(); };
window.setWbTag = (v) => { wbTag = v; render(); };
window.setWbKw = (v) => { wbKw = v; renderListOnly(); };
window.openMessage = (id) => { location.hash = '#/message/' + id; };

function renderListOnly() {
  const el = document.getElementById('msgList');
  if (el) el.innerHTML = wbListHtml();
}

/* 工作台与池管理共用的标准信息卡片 */
function messageListCardHtml(m, me) {
  const handlers = [...new Set(linksOf(m.id).filter(linkActive).map((l) => handlerOfLink(l)).filter(Boolean))]
    .map(userName).join('、');
  const handler = handlers || '—';
  const src = (m.sources && m.sources.length ? m.sources.join('、') : '') +
    (m.sourceOther ? (m.sources && m.sources.length ? '、' : '') + m.sourceOther : '');

  return '<div class="msg-row" onclick="openMessage(\'' + m.id + '\')">' +
    '<div class="msg-row-top">' +
      '<span class="msg-no">' + esc(m.no) + '</span>' +
      flowBadge(m, me) +
      (isEnded(m) ? '' : '<span class="msg-meta msg-handler">当前处理人：' + esc(handler) + '</span>') +
    '</div>' +
    messageTagLineHtml(m) +
    '<div class="msg-info"><span class="msg-info-label">信息来源：</span>' + esc(src || '—') + '</div>' +
    '<div class="msg-desc"><span class="msg-info-label">详细描述：</span>' + esc(m.content) + '</div>' +
    '<div class="msg-foot">' +
      '<span class="msg-meta">发起人：' + esc(userName(m.createdBy)) + '</span>' +
      '<span class="msg-time">' + fmtTime(m.updatedAt) + '</span>' +
    '</div>' +
  '</div>';
}

function wbListHtml() {
  const me = curUser();
  const list = wbList();
  if (!list.length) return empty('暂无符合条件的消息');
  return list.map((m) => messageListCardHtml(m, me)).join('');
}

function renderWorkbench() {
  const tab = effectiveWbTab();
  const statusList = [
    ['dispatch', '待分发'], ['todo', '待办'], ['done', '已办'],
    ['ended', '已解决'], ['overdue', '超时']
  ];
  const statusOpts = statusList.map((item) =>
    '<option value="' + item[0] + '"' + (wbStatus === item[0] ? ' selected' : '') + '>' + item[1] + '</option>').join('');
  const poolOpts = '<option value="all">全部池</option>' + S.pools.map((p) =>
    '<option value="' + p.id + '"' + (wbPool === p.id ? ' selected' : '') + '>' + esc(p.name) + '</option>').join('');
  const tagNames = [...new Set(MESSAGE_TAGS.concat(S.messages.flatMap((m) => m.tags || [])))];
  const tagOpts = '<option value="">全部标签</option>' + tagNames.map((tag) =>
    '<option value="' + esc(tag) + '"' + (wbTag === tag ? ' selected' : '') + '>' + esc(tag) + '</option>').join('');
  return '<div class="wb-main">' +
    '<div class="tabs">' + wbTabs().map((t) =>
      '<div class="tab' + (tab === t.key ? ' on' : '') + '" onclick="setWbTab(\'' + t.key + '\')">' +
        t.name + '<span class="stat-count-pill">' + wbTabCount(t.key) + '</span></div>').join('') +
    '</div>' +
    '<div class="filters">' +
      '<input placeholder="搜索编号 / 标题" value="' + esc(wbKw) + '" oninput="setWbKw(this.value)">' +
      '<select onchange="setWbPool(this.value)">' + poolOpts + '</select>' +
      '<select onchange="setWbStatus(this.value)"><option value="">全部状态</option>' + statusOpts + '</select>' +
      '<select onchange="setWbTag(this.value)">' + tagOpts + '</select>' +
    '</div>' +
    '<div id="msgList">' + wbListHtml() + '</div>' +
  '</div>';
}

/* ==========================================================================
 * 1.5. 信息池（全景信息中心与全池记录浏览）
 * ========================================================================== */
let ipTab = 'all';     /* all, p_company, processing, confirming, closed, overdue */
let ipPool = 'all';    /* all or specific poolId */
let ipSource = 'all';  /* all or specific source */
let ipKw = '';         /* 搜索关键词 */
let ipSort = 'updated';/* updated, created */

function ipTabs() {
  return [
    { key: 'all', name: '全部信息' },
    { key: 'p_company', name: '待总池分发' },
    { key: 'processing', name: '在办流转中' },
    { key: 'confirming', name: '待双确认' },
    { key: 'closed', name: '已办结' },
    { key: 'overdue', name: '超时预警' }
  ];
}

function ipList() {
  let list = visibleMessages();

  if (ipTab === 'p_company') {
    list = list.filter((m) => m.sourcePoolId === 'p_company' && m.status === 'p_company');
  } else if (ipTab === 'processing') {
    list = list.filter((m) => m.status === 'processing' || m.status === 'p_group' || m.status === 'p_dept' || m.status === 'p_exec');
  } else if (ipTab === 'confirming') {
    list = list.filter((m) => m.status === 'confirming');
  } else if (ipTab === 'closed') {
    list = list.filter((m) => m.status === 'closed');
  } else if (ipTab === 'overdue') {
    list = list.filter((m) => isMessageOverdue(m));
  }

  if (ipPool !== 'all') {
    list = list.filter((m) => msgInPool(m, ipPool));
  }

  if (ipSource !== 'all') {
    list = list.filter((m) => (m.sources && m.sources.includes(ipSource)) || m.sourceOther === ipSource);
  }

  if (ipKw) {
    const kw = ipKw.trim().toLowerCase();
    list = list.filter((m) =>
      (m.no && m.no.toLowerCase().includes(kw)) ||
      (m.title && m.title.toLowerCase().includes(kw)) ||
      (m.customerName && m.customerName.toLowerCase().includes(kw)) ||
      (m.content && m.content.toLowerCase().includes(kw))
    );
  }

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
    const poolTag = poolNames.length ? poolNames.join('、') : (m.sourcePoolId === 'p_company' && m.status === 'p_company' ? '公司总池（待分发）' : poolName(m.sourcePoolId));

    const handlers = [...new Set(activeLinks.map((l) => handlerOfLink(l)).filter(Boolean))].map(userName).join('、');
    const isOverdue = isMessageOverdue(m);
    const overdueDays = m.overdueDays || (isOverdue ? 1 : 0);

    const src = (m.sources && m.sources.length ? m.sources.join('、') : '') +
      (m.sourceOther ? (m.sources && m.sources.length ? '、' : '') + m.sourceOther : '');

    return '<div class="msg-row" onclick="openMessage(\'' + m.id + '\')">' +
      '<div class="msg-row-top">' +
        '<span class="msg-no">' + esc(m.no) + '</span>' +
        badge(m.status) +
        (isOverdue ? '<span class="badge b-unresolved">超时 ' + overdueDays + ' 天</span>' : '') +
        '<span class="badge b-p_exec" style="max-width:260px; overflow:hidden; text-overflow:ellipsis;" title="当前归属池：' + esc(poolTag) + '">归属池：' + esc(poolTag) + '</span>' +
        (isEnded(m) ? '' : '<span class="msg-meta msg-handler">当前处理人：' + esc(handlers || '—') + '</span>') +
      '</div>' +
      '<div class="msg-title" style="font-size:14px; font-weight:600; color:#1f2430; margin:2px 0;">' + esc(m.title) + '</div>' +
      (src ? '<div class="msg-info"><span class="msg-info-label">信息来源：</span>' + esc(src) + '</div>' : '') +
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
  const allMsgs = visibleMessages();
  const totalCount = allMsgs.length;
  const dispatchCount = allMsgs.filter((m) => m.sourcePoolId === 'p_company' && m.status === 'p_company').length;
  const processingCount = allMsgs.filter((m) => m.status === 'processing' || m.status === 'p_group' || m.status === 'p_dept' || m.status === 'p_exec').length;
  const confirmingCount = allMsgs.filter((m) => m.status === 'confirming').length;
  const closedCount = allMsgs.filter((m) => m.status === 'closed').length;
  const overdueCount = allMsgs.filter(isMessageOverdue).length;

  const poolOpts = '<option value="all">全部池</option>' + S.pools.map((p) =>
    '<option value="' + p.id + '"' + (ipPool === p.id ? ' selected' : '') + '>' + esc(p.name) + '</option>').join('');

  const sourceOpts = '<option value="all">全部来源</option>' + SOURCE_OPTIONS.map((s) =>
    '<option value="' + esc(s) + '"' + (ipSource === s ? ' selected' : '') + '>' + esc(s) + '</option>').join('');

  return '<div class="wb-main">' +
    '<div class="card" style="margin-bottom:14px; padding:18px 20px;">' +
      '<div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">' +
        '<div>' +
          '<div class="card-title" style="margin-bottom:4px; font-size:17px; display:flex; align-items:center; gap:8px;">' +
            '信息池 · 全景信息中心' +
            '<span class="badge b-p_exec">当前身份：' + esc(me.name) + '</span>' +
          '</div>' +
          '<div style="font-size:12px; color:#5b6579;">' +
            '集中汇聚全公司各级池（公司总池 / 分管池 / 部门池 / 小组池）流转信息，实时掌握跨组织协同动态' +
          '</div>' +
        '</div>' +
        '<div style="display:flex; gap:8px;">' +
          '<a href="#/new" class="btn btn-sm btn-primary">+ 我要填报</a>' +
          (canAccessPoolManage(me) ? '<a href="#/pools" class="btn btn-sm btn-ghost">池架构管理 →</a>' : '') +
        '</div>' +
      '</div>' +
      '<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(130px, 1fr)); gap:10px; margin-top:14px; padding-top:12px; border-top:1px solid #f0f2f7;">' +
        '<div style="background:#f8f9fc; border-radius:8px; padding:10px 14px; border:1px solid #eef1f7;">' +
          '<div style="font-size:18px; font-weight:700; color:#1f2430;">' + totalCount + ' <span style="font-size:11px; font-weight:400; color:#9aa3b5;">条</span></div>' +
          '<div style="font-size:11px; color:#5b6579; margin-top:2px;">池内总信息量</div>' +
        '</div>' +
        '<div style="background:#f8f9fc; border-radius:8px; padding:10px 14px; border:1px solid #eef1f7;">' +
          '<div style="font-size:18px; font-weight:700; color:#fa8c16;">' + dispatchCount + ' <span style="font-size:11px; font-weight:400; color:#9aa3b5;">条</span></div>' +
          '<div style="font-size:11px; color:#5b6579; margin-top:2px;">待总池分发</div>' +
        '</div>' +
        '<div style="background:#f8f9fc; border-radius:8px; padding:10px 14px; border:1px solid #eef1f7;">' +
          '<div style="font-size:18px; font-weight:700; color:#2f6bff;">' + processingCount + ' <span style="font-size:11px; font-weight:400; color:#9aa3b5;">条</span></div>' +
          '<div style="font-size:11px; color:#5b6579; margin-top:2px;">各级池在办</div>' +
        '</div>' +
        '<div style="background:#f8f9fc; border-radius:8px; padding:10px 14px; border:1px solid #eef1f7;">' +
          '<div style="font-size:18px; font-weight:700; color:#d48806;">' + confirmingCount + ' <span style="font-size:11px; font-weight:400; color:#9aa3b5;">条</span></div>' +
          '<div style="font-size:11px; color:#5b6579; margin-top:2px;">待双确认</div>' +
        '</div>' +
        '<div style="background:#f8f9fc; border-radius:8px; padding:10px 14px; border:1px solid #eef1f7;">' +
          '<div style="font-size:18px; font-weight:700; color:#1faa5c;">' + closedCount + ' <span style="font-size:11px; font-weight:400; color:#9aa3b5;">条</span></div>' +
          '<div style="font-size:11px; color:#5b6579; margin-top:2px;">已办结归档</div>' +
        '</div>' +
        '<div style="background:#f8f9fc; border-radius:8px; padding:10px 14px; border:1px solid #eef1f7;">' +
          '<div style="font-size:18px; font-weight:700; color:' + (overdueCount > 0 ? '#f0524d' : '#9aa3b5') + ';">' + overdueCount + ' <span style="font-size:11px; font-weight:400; color:#9aa3b5;">条</span></div>' +
          '<div style="font-size:11px; color:#5b6579; margin-top:2px;">超时未结预警</div>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div class="tabs">' + ipTabs().map((t) =>
      '<div class="tab' + (ipTab === t.key ? ' on' : '') + '" onclick="setIpTab(\'' + t.key + '\')">' + t.name + '</div>').join('') +
    '</div>' +
    '<div class="filters">' +
      '<input placeholder="搜索编号 / 标题 / 客户 / 内容..." value="' + esc(ipKw) + '" oninput="setIpKw(this.value)">' +
      '<select onchange="setIpPool(this.value)">' + poolOpts + '</select>' +
      '<select onchange="setIpSource(this.value)">' + sourceOpts + '</select>' +
      '<select onchange="setIpSort(this.value)"><option value="updated"' + (ipSort === 'updated' ? ' selected' : '') + '>按最近更新</option><option value="created"' + (ipSort === 'created' ? ' selected' : '') + '>按创建时间</option></select>' +
    '</div>' +
    '<div id="ipListContainer">' + ipListHtml() + '</div>' +
  '</div>';
}

/* ==========================================================================
 * 2. 我要填报（投递）
 * ========================================================================== */
let newMsgAtts = [];
let newSources = [];
let newTargetPool = 'p_company';
let newDraft = { content: '', customerName: '', sourceOther: '' };
let newCustomerQuery = '';

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

window.setNewTargetPool = (poolId) => {
  captureNewDraft();
  newTargetPool = poolId;
  renderNewPools();
};
function renderNewPools() {
  const el = document.getElementById('newPoolChips');
  if (!el) return;
  const company = poolById('p_company');
  const execs = S.pools.filter((p) => p.type === 'exec').sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
  const items = [{ id: 'p_company', name: company ? company.name : '公司总池' }].concat(execs);
  el.innerHTML = items.map((p) =>
    '<span class="chip' + (newTargetPool === p.id ? ' on' : '') + '" onclick="setNewTargetPool(\'' + p.id + '\')">' + esc(p.name) + '</span>').join('');
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

window.submitNew = () => {
  captureNewDraft();
  const content = newDraft.content.trim();
  if (!newSources.length) { toast('请选择信息来源'); return; }
  if (newSources.includes('客户反馈') && !newDraft.customerName) { toast('选择客户反馈时必须填写客户名称'); return; }
  if (newSources.includes('其他') && !newDraft.sourceOther.trim()) { toast('选择其他时必须填写信息来源'); return; }
  if (!content) { toast('请填写问题描述'); return; }
  const m = createMessage({
    poolId: newTargetPool, content,
    sources: newSources.slice(),
    customerName: newSources.includes('客户反馈') ? newDraft.customerName : '',
    sourceOther: newSources.includes('其他') ? newDraft.sourceOther.trim() : '',
    attachments: newMsgAtts.slice()
  });
  newMsgAtts = [];
  newSources = [];
  newTargetPool = 'p_company';
  newDraft = { content: '', customerName: '', sourceOther: '' };
  newCustomerQuery = '';
  toast(m.direct ? '已直投到分管池' : '已投递到公司总池，待分发');
  location.hash = '#/message/' + m.id;
};

function renderNew() {
  const needCustomer = newSources.includes('客户反馈');
  const needOther = newSources.includes('其他');
  return '<div class="card" style="max-width:720px;margin:0 auto 14px">' +
    '<div class="form-row"><div class="form-label">信息来源<span class="req">*</span></div>' +
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
      '<div class="form-row"><div class="form-label">来源说明<span class="req">*</span></div>' +
        '<input type="text" id="newSourceOther" placeholder="请填写具体信息来源" value="' + esc(newDraft.sourceOther) + '"></div>' : '') +
    '<div class="form-row"><div class="form-label">目标池<span class="req">*</span></div>' +
      '<div class="chip-group" id="newPoolChips"></div></div>' +
    '<div class="form-row"><div class="form-label">详细描述<span class="req">*</span></div>' +
      '<textarea id="newContent" placeholder="背景、诉求、涉及的客户或业务线等">' + esc(newDraft.content) + '</textarea></div>' +
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
    const link = linksOf(msgId).find((item) => canConfirmHandler(curUser(), m, item));
    closeModal();
    const state = tag === '已解决' ? 'resolved' : 'unresolved';
    if (tag === '已解决' && canResolveMessage(curUser(), m)) {
      const result = resolveMessage(msgId);
      if (!result.ok) { toast(result.msg); return; }
      toast('已标记为已解决');
      render();
    } else if (canConfirmCreator(curUser(), m)) creatorConfirm(msgId, state);
    else if (link) handlerConfirm(msgId, link.id, state);
    else toast('当前无权标记为' + tag);
    return;
  }
  const r = toggleMessageTag(msgId, tag);
  if (!r.ok) { toast(r.msg); return; }
  closeModal();
  toast(r.active ? '已添加“' + tag + '”标签' : '已取消“' + tag + '”标签');
  render();
};

window.openDispatchModal = (id) => {
  modalState = { mode: 'dispatch', msgId: id, selected: [], kw: '', collapsed: [] };
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
  document.getElementById('modalMask').classList.remove('show');
  document.getElementById('modal').classList.remove('show');
  modalState = null;
};

/* 池成员（负责人 + 成员，去重） */
function membersOf(p) { return [...new Set(p.ownerIds.concat(p.memberIds))]; }
/* 由池 id 递归构建子树节点 {pool, children} */
function poolNodeOf(poolId) {
  const pool = poolById(poolId);
  if (!pool) return null;
  return { pool: pool, children: childPools(poolId).map((c) => poolNodeOf(c.id)).filter(Boolean) };
}

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

/* 选中整个池：追加 pool: 键，并清理该池内单点的人员键（整池已覆盖） */
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
/* 选中某个人员：目标 = 该人员所在池，落实人 = 该人员；整池已选时忽略 */
window.toggleSelPerson = (pid, uid) => {
  if (!modalState) return;
  if (modalState.selected.indexOf('pool:' + pid) > -1) { toast('该池已整体选中'); return; }
  const key = 'pers:' + pid + '|' + uid;
  const i = modalState.selected.indexOf(key);
  if (i > -1) modalState.selected.splice(i, 1);
  else modalState.selected.push(key);
  renderModal();
  restoreKwFocus();
};

/* 解析实际流转目标：显式选中的池 + 选中人员所在池（去重，整池优先于单点人员） */
function resolveSelTargets() {
  const sel = modalState.selected;
  const poolExp = [];
  const personPool = {};
  sel.forEach((k) => {
    if (k.indexOf('pool:') === 0) poolExp.push(k.slice(5));
    else if (k.indexOf('pers:') === 0) {
      const rest = k.slice(5);
      const i = rest.indexOf('|');
      const pid = rest.slice(0, i), uid = rest.slice(i + 1);
      (personPool[pid] = personPool[pid] || []).push(uid);
    }
  });
  const out = [];
  const done = {};
  poolExp.forEach((pid) => { if (!done[pid]) { out.push({ poolId: pid, handlerId: null }); done[pid] = 1; } });
  Object.keys(personPool).forEach((pid) => {
    if (done[pid]) return;
    out.push({ poolId: pid, handlerId: personPool[pid][0] });
    done[pid] = 1;
  });
  return out;
}

window.confirmModal = () => {
  if (!modalState) return;
  const targets = resolveSelTargets();
  if (!targets.length) { toast('请至少选择一个目标池或人员'); return; }
  const r = modalState.mode === 'dispatch'
    ? dispatchMessage(modalState.msgId, targets, '')
    : forwardMessage(modalState.msgId, modalState.fromLinkId, targets, '');
  if (!r.ok) { toast(r.msg); return; }
  const isDsp = modalState.mode === 'dispatch';
  closeModal();
  toast(isDsp ? '已分发到 ' + r.count + ' 个池' : '已流转到 ' + r.count + ' 个池');
  render();
};

/* 池人员评论提交后二选一：标记为已解决 / 流转（内容来自底部评论面板） */
window.submitEnd = () => {
  if (!modalState) return;
  const st = modalState;
  const m = findMsg(st.msgId);
  const link = linkById(st.linkId);
  if (!canConfirmHandler(curUser(), m, link)) { toast('当前无权标记为已解决'); return; }
  const r = addReply(st.msgId, st.poolId, st.content, st.atts || []);
  if (!r.ok) { toast(r.msg); return; }
  const result = setHandlerConfirm(st.msgId, st.linkId, 'resolved', '');
  if (!result.ok) { toast(result.msg); return; }
  closeModal();
  toast(m.status === 'confirming' ? '已提交，本池标记已办，等待提交人确认'
    : m.status === 'closed' ? '双方均确认，消息已解决' : '已提交，本池标记已办');
  render();
};
window.submitForward = () => {
  if (!modalState) return;
  const st = modalState;
  const r = addReply(st.msgId, st.poolId, st.content, st.atts || []);
  if (!r.ok) { toast(r.msg); return; }
  render();
  modalState = { mode: 'forward', msgId: st.msgId, fromLinkId: st.linkId, selected: [], kw: '', collapsed: [] };
  renderModal();
};

/* 统一选择树节点渲染：池为分支节点，其成员为叶子；返回 {html, hit, keep}
 * hit = 子树内是否有显式选中（含本池整选或任一人员选中）；下级被选中时上级呈半选态；
 * keep = 搜索时该节点是否可见。 */
function selNode(n, ctx, isRoot, kw) {
  const p = n.pool;
  const k = (kw || '').trim().toLowerCase();
  const sel = modalState.selected;
  const poolSel = sel.indexOf('pool:' + p.id) > -1;
  const mem = membersOf(p);
  const personSelSet = mem.filter((uid) => sel.indexOf('pers:' + p.id + '|' + uid) > -1);
  const hasPersonSel = personSelSet.length > 0;

  const kids = n.children.map((c) => selNode(c, ctx, false, kw));
  const childHtml = kids.map((x) => x.html).join('');
  const childHit = kids.some((x) => x.hit);
  const childKept = kids.some((x) => x.keep);

  let personHtml = '';
  let personKept = 0;
  if (!isRoot) {
    mem.forEach((uid) => {
      const name = userName(uid);
      const u = userById(uid) || {};
      const pSel = sel.indexOf('pers:' + p.id + '|' + uid) > -1;
      const visible = !k || name.toLowerCase().includes(k) || hasPersonSel || poolSel ||
        (k && p.name.toLowerCase().includes(k));
      if (!visible) return;
      personKept++;
      const pPath = poolSel && !pSel;
      const checked = pSel || pPath;
      const cls = pSel ? ' sel' : (pPath ? ' path' : '');
      const pSelectable = ctx.canSelect(p) && !ctx.linkedIds.includes(p.id);
      personHtml += '<div class="mt-person' + cls + (pSelectable ? '' : ' dis') + '"' +
        (pSelectable ? ' onclick="toggleSelPerson(\'' + p.id + '\',\'' + uid + '\')"' : '') + '>' +
        '<span class="mt-check' + (pSel ? ' on' : (pPath ? ' path' : (!pSelectable ? ' dis' : ''))) + '">' + (checked ? '✓' : '') + '</span>' +
        '<span class="mt-avatar">' + esc((name || '?').slice(0, 1)) + '</span>' +
        '<span class="mt-pname">' + esc(name) + '</span>' +
        '<span class="mt-prole">' + esc(ROLES[u.role] || '') + '</span>' +
      '</div>';
    });
  }

  const hit = poolSel || hasPersonSel || childHit;
  const poolNameMatch = k ? p.name.toLowerCase().includes(k) : true;
  const keep = !k || poolNameMatch || poolSel || hasPersonSel || personKept > 0 || childKept;
  if (!keep) return { html: '', hit: hit, keep: false };

  const pathChecked = hit && !poolSel;
  const linked = ctx.linkedIds.indexOf(p.id) > -1;
  const selectable = !isRoot && ctx.canSelect(p) && !linked;
  const collapsed = !k && (modalState.collapsed || []).indexOf(p.id) > -1;
  const expandable = n.children.length > 0 || (!isRoot && mem.length > 0);

  const rowCls = (poolSel ? ' sel' : (pathChecked ? ' path' : '')) + (selectable ? '' : ' dis');
  const showCheck = selectable || poolSel || pathChecked;
  let html = '<div class="mt-node">' +
    '<div class="mt-row' + rowCls + '"' + (selectable ? ' onclick="toggleSelPool(\'' + p.id + '\')"' : '') + '>' +
      '<span class="mt-caret" onclick="event.stopPropagation();toggleMtNode(\'' + p.id + '\')">' + (expandable ? (collapsed ? '▸' : '▾') : '') + '</span>' +
      '<span class="mt-check' + (poolSel ? ' on' : (pathChecked ? ' half' : (showCheck ? '' : ' dis'))) + '">' + (poolSel ? '✓' : '') + '</span>' +
      '<span class="mt-name">' + esc(p.name) + '</span>' +
      '<span class="mt-type">' + esc(POOL_TYPES[p.type] || '') + '</span>' +
      (linked ? '<span class="mt-tag">已在处理</span>' : '') +
    '</div>';
  html += (collapsed && !isRoot ? '' : '<div class="mt-children">' + personHtml + childHtml + '</div>');
  html += '</div>';
  return { html: html, hit: hit, keep: true };
}

function renderModal() {
  if (!modalState) return;
  const m = findMsg(modalState.msgId);

  if (modalState.mode === 'tag') {
    const hasReply = repliesOf(m.id).length > 0;
    const canResolve = hasReply && (canResolveMessage(curUser(), m) || canConfirmCreator(curUser(), m) || linksOf(m.id).some((link) => canConfirmHandler(curUser(), m, link)));
    const current = m.tags || [];
    const labels = (canResolve ? ['已解决', '未解决'] : []).concat(MESSAGE_TAGS);
    document.getElementById('modal').innerHTML =
      '<div class="tag-modal-head"><b>标记为</b><span>选择业务标签</span></div>' +
      '<div class="tag-choice-list">' + labels.map((tag) =>
        '<button type="button" class="tag-choice' + (current.includes(tag) ? ' on' : '') + '" onclick="applyMessageTag(\'' + m.id + '\',\'' + tag + '\')">' +
          '<span>' + esc(tag) + '</span>' + (current.includes(tag) ? '<i>已标记</i>' : '') +
        '</button>').join('') + '</div>';
    return;
  }

  /* 评论提交二选一：标记已解决 / 流转 */
  if (modalState.mode === 'submitChoice') {
    const link = linkById(modalState.linkId);
    const canResolve = canConfirmHandler(curUser(), m, link);
    const canFwd = canForward(curUser(), m, link);
    document.getElementById('modal').innerHTML =
      '<div class="choice-list">' +
        '<div class="choice-row' + (canResolve ? '' : ' dis') + '"' + (canResolve ? ' onclick="submitEnd()"' : '') + '><span class="choice-radio"></span><span class="choice-text">评论并标记为已解决</span></div>' +
        '<div class="choice-row' + (canFwd ? '' : ' dis') + '"' + (canFwd ? ' onclick="submitForward()"' : '') + '><span class="choice-radio"></span><span class="choice-text">评论并流转</span></div>' +
      '</div>' +
      (canResolve || canFwd ? '' : '<div class="form-hint" style="margin-top:8px">当前信息暂无可执行的处理操作</div>');
    return;
  }

  const kw = (modalState.kw || '').trim();
  const linkedIds = linksOf(m.id).map((l) => l.poolId);
  let title, rootNode, ctx;
  if (modalState.mode === 'dispatch') {
    title = '分发到目标池';
    const roots = poolTree();
    rootNode = roots.find((x) => x.pool.type === 'company') || roots[0];
    ctx = { linkedIds: linkedIds, canSelect: (p) => p.type !== 'company' };
  } else {
    const fromLink = linkById(modalState.fromLinkId);
    const fromPool = poolById(fromLink.poolId);
    title = '从 ' + fromPool.name + ' 流转';
    rootNode = poolNodeOf(fromPool.id);
    const line = execLinePoolIds(fromPool.id);
    ctx = {
      linkedIds: linkedIds,
      canSelect: (p) => {
        if (fromPool.type === 'exec') {
          return line.includes(p.id) && p.id !== fromPool.id && (p.type === 'dept' || p.type === 'group');
        }
        if (fromPool.type === 'dept') return p.type === 'group' && p.parentId === fromPool.id;
        return false;
      }
    };
  }
  const built = selNode(rootNode, ctx, true, kw);
  const listHtml = '<div class="modal-list">' +
    (built.html || '<div class="lock-tip">没有匹配的可选池或人员</div>') + '</div>';
  const nSel = resolveSelTargets().length;
  document.getElementById('modal').innerHTML =
    '<h3>' + esc(title) + '<span style="font-size:12px;color:#9aa3b5;font-weight:400;margin-left:8px">' + m.no + '（编号不变，可同时进入多个池）</span></h3>' +
    '<div class="form-row" style="margin-bottom:10px"><input type="text" id="modalKw" placeholder="搜索池名称 / 人员" value="' + esc(kw) + '" oninput="modalKwInput(this.value)"></div>' +
    listHtml +
    '<div class="modal-actions">' +
      '<span class="mt-sel-count">已选 ' + nSel + ' 个目标</span>' +
      '<button class="btn btn-ghost" onclick="closeModal()">取消</button>' +
      '<button class="btn" onclick="confirmModal()">确定</button>' +
    '</div>';
}

/* ==========================================================================
 * 4. 消息详情
 * ========================================================================== */
window.handlerConfirm = (msgId, linkId, state) => {
  if (state === 'unresolved' && !confirm('标记为「未解决」后，总消息将重新打开，确定吗？')) return;
  const r = setHandlerConfirm(msgId, linkId, state, '');
  if (!r.ok) { toast(r.msg); return; }
  const m = findMsg(msgId);
  toast(m.status === 'closed' ? '落实人与提出人均确认，消息已解决'
    : state === 'resolved' ? '落实人确认已记录' : '已标记未解决，消息重新打开');
  render();
};
window.creatorConfirm = (msgId, state) => {
  const r = setCreatorConfirm(msgId, state);
  if (!r.ok) { toast(r.msg); return; }
  toast(state === 'resolved' ? '已确认，消息已解决' : '已标记为未解决');
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

/* ---------- 固定底栏（小红书式互动栏）：评论框 + 消息级点赞 + 评论数；确认/分发等主动作并入右侧 ---------- */
function actionBarHtml(me, m) {
  if (!canSeeMessage(me, m)) return '';
  const forwardLink = linksOf(m.id).find((link) => canForward(me, m, link));
  const comment = '<div class="bar-comment">' +
    '<input class="bar-comment-input" readonly placeholder="说点什么..." onclick="openCommentPanel(\'' + m.id + '\')">' +
  '</div>';
  const acts = [];
  const tagIcon = '<svg class="bar-action-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 13l-7 7L4 11V4h7l9 9z"></path><circle cx="8.5" cy="8.5" r="1.5"></circle></svg>';
  const flowIcon = '<svg class="bar-action-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h10"></path><path d="M12 4l3 3-3 3"></path><path d="M19 17H9"></path><path d="M12 14l-3 3 3 3"></path></svg>';
  acts.push('<button class="btn btn-sm bar-action-btn" onclick="openTagModal(\'' + m.id + '\')">' + tagIcon + '<span>标记为</span></button>');
  if (canDispatch(me, m)) {
    acts.push('<button class="btn btn-sm bar-action-btn" onclick="openDispatchModal(\'' + m.id + '\')">' + flowIcon + '<span>流转</span></button>');
  } else if (forwardLink) {
    acts.push('<button class="btn btn-sm bar-action-btn" onclick="openForwardModal(\'' + m.id + '\', \'' + forwardLink.id + '\')">' + flowIcon + '<span>流转</span></button>');
  } else {
    acts.push('<button class="btn btn-sm btn-disabled bar-action-btn" disabled title="当前信息暂无可流转的下级池">' + flowIcon + '<span>流转</span></button>');
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
    case 'dispatched': return l.note || '进行了分发';
    case 'forwarded': return l.note || '进行了流转';
    case 'reply': return '在 ' + poolName(l.poolId) + ' 回复：' + (l.note || '');
    case 'handler_confirm': {
      const n = l.note || '';
      if (n.indexOf('未解决') > -1) return '已标记未解决';
      if (n.indexOf('已解决') > -1) return '已解决';
      return n || '落实人确认';
    }
    case 'creator_confirm': return l.note || '提出人确认';
    case 'auto':
      if (l.note && l.note.indexOf('进入待确认') > -1) return '所有落实人已回复，提交人确认';
      return l.note || '状态变更';
    case 'closed': return l.note || '消息关闭';
    case 'cancelled': return l.note || '消息取消';
    default: return l.note || l.action;
  }
}

/* ---------- 评论流卡片：一条评论 + 其所有回复放在同一张卡片内 ----------
 * 一级评论作为卡片主体，嵌套回复紧跟在卡片内部的嵌套区域；
 * 每条回复（含主体）都有赞 / 回复按钮；落实人确认按钮在落实人回复上直接展示。 */
let replyBoxFor = null;

function singleReplyRowHtml(me, m, r) {
  const au = userById(r.authorId) || {};
  const link = linkOf(m.id, r.poolId);
  const liked = (r.likedByUserIds || []).includes(me.id);
  const isHandlerReply = !!(link && link.isFinal && handlerOfLink(link) === r.authorId);
  const hc = isHandlerReply ? (link.handlerConfirm || { state: 'none' }) : null;
  const canOp = isHandlerReply && canConfirmHandler(me, m, link);
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
        (isHandlerReply ? '<span class="cmt-confirm-tag">落实人确认 ' + confirmBadge(hc.state) + '</span>' : '') +
      '</div>' +
      '<div class="reply-content">' + esc(r.content) + '</div>' +
      attsHtml(r.attachments) +
      '<div class="cmt-foot">' +
        '<button class="like-btn' + (liked ? ' on' : '') + '" id="like_' + r.id + '" onclick="toggleLike(\'' + r.id + '\')">' + (liked ? '已赞 ' : '赞 ') + (r.likeCount || 0) + '</button>' +
        '<button class="like-btn" onclick="toggleCommentBox(\'' + m.id + '\',\'' + r.id + '\')">回复' + (childCount ? ' ' + childCount : '') + '</button>' +
        (canOp ?
          '<button class="btn btn-sm' + (hc.state === 'resolved' ? '' : ' btn-ghost') + '" onclick="handlerConfirm(\'' + m.id + '\',\'' + link.id + '\',\'resolved\')">已解决</button>' +
          '<button class="btn btn-sm' + (hc.state === 'unresolved' ? ' btn-danger' : ' btn-ghost') + '" onclick="handlerConfirm(\'' + m.id + '\',\'' + link.id + '\',\'unresolved\')">未解决</button>' : '') +
      '</div>' +
      box +
    '</div>' +
  '</div>';
}

function commentCardHtml(me, m, r) {
  const replies = repliesOf(m.id);
  const byParent = {};
  replies.forEach((x) => {
    const k = x.parentReplyId || '';
    (byParent[k] = byParent[k] || []).push(x);
  });
  Object.keys(byParent).forEach((k) => byParent[k].sort((a, b) => a.at - b.at));
  let nestedHtml = '';
  const walk = (parentKey) => {
    (byParent[parentKey] || []).forEach((child) => {
      nestedHtml += singleReplyRowHtml(me, m, child);
      walk(child.id);
    });
  };
  walk(r.id);
  return '<div class="card cmt">' +
    singleReplyRowHtml(me, m, r) +
    (nestedHtml ? '<div class="cmt-nested">' + nestedHtml + '</div>' : '') +
  '</div>';
}

function commentThreadHtml(me, m, replies) {
  const roots = replies.filter((r) => !r.parentReplyId).sort((a, b) => a.at - b.at);
  return roots.map((r) => commentCardHtml(me, m, r)).join('');
}

/* 通用评论归属池：优先本人在其中的池，其次任一在办池，最后来源池 */
function pickCommentPool(m, me) {
  const links = linksOf(m.id);
  const mine = myPoolIds(me);
  const lk = links.find((l) => mine.includes(l.poolId));
  if (lk) return lk.poolId;
  if (links.length) return links[0].poolId;
  return m.sourcePoolId || 'p_company';
}

function commentAreaHtml(me, m) {
  const replies = repliesOf(m.id);
  return '<div class="card"><div class="card-title">回复评论<span class="sub">' + replies.length + ' 条 · 按处理时间排序 · 所有参与方可见</span></div>' +
    (replies.length ? '' : empty('暂无回复')) + '</div>' +
    commentThreadHtml(me, m, replies);
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
    const h = handlerOfLink(l);
    if (h) ids.push(h);
    if (l.dispatchedBy) ids.push(l.dispatchedBy);
  });
  repliesOf(m.id).forEach((r) => ids.push(r.authorId));
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

/* 提交：当前用户是处理人且消息未结束 → 弹「结束处理 / 流转」；否则直接生成评论 */
window.submitCommentPanel = () => {
  if (!cmtPanel) return;
  const st = cmtPanel;
  const content = (st.content || '').trim();
  if (!content && !st.atts.length) { toast('请输入评论内容'); return; }
  const me = curUser();
  const m = findMsg(st.msgId);
  const link = !isEnded(m) ? myActiveUnsubmittedLink(me, m) : null;
  if (link) {
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

function renderDetail(id) {
  const me = curUser();
  const m = findMsg(id);
  if (!m) return '<div class="card no-perm">消息不存在</div>';
  if (!canSeeMessage(me, m)) {
    return '<div class="card no-perm">您无权查看该消息<br>分池成员只能查看本池消息，不同分管线互不可见</div>';
  }
  const links = linksOf(m.id);
  const srcPool = poolById(m.sourcePoolId);

  /* 头部（客户信息标签融合在主卡片内：仅池处理人员可见，提出人不可见，点击跳客户信息页） */
  const pools = linksOf(m.id).map((l) => poolName(l.poolId)).join('、');
  const head = '<div class="card detail-head">' +
    '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">' +
      '<span class="detail-no">' + m.no + '</span>' + flowBadge(m, me) + messageTagsHtml(m) +
      (m.closedAt ? '<span class="msg-meta">关闭于 ' + fmtTime(m.closedAt) + '</span>' : '') +
    '</div>' +
    '<h2>' + esc(m.title) + '</h2>' +
    '<div class="detail-meta">' +
      '<span>提出人：' + esc(userName(m.createdBy)) + '（' + esc((userById(m.createdBy) || {}).dept || '') + '）</span>' +
      '<span>投递：' + (m.direct ? '直投 ' + esc(srcPool ? srcPool.name : '') : '公司总池') + '</span>' +
      '<span>创建于 ' + fmtTime(m.createdAt) + '</span>' +
    '</div>' +
    (m.sources && m.sources.length ? '<div class="detail-info-line"><span class="detail-info-label">信息来源：</span><span>' + esc(m.sources.join('、')) + '</span></div>' : '') +
    (m.customerName ? '<div class="detail-info-line"><span class="detail-info-label">客户：</span><span>' + esc(m.customerName) + '</span></div>' : '') +
    (m.sourceOther ? '<div class="detail-info-line"><span class="detail-info-label">其他来源：</span><span>' + esc(m.sourceOther) + '</span></div>' : '') +
    (pools ? '<div class="detail-info-line"><span class="detail-info-label">涉及池：</span><span>' + esc(pools) + '</span></div>' : '') +
    '<div class="content-box">' + esc(m.content) + '</div>' +
    attsHtml(m.attachments) +
    (m.customerName && me.id !== m.createdBy
      ? '<div class="cust-line"><button class="btn btn-ghost btn-sm" onclick="openCustomer(\'' + esc(m.customerName) + '\')">客户信息</button>' +
        '<span class="msg-meta">' + esc(m.customerName) + '</span></div>'
      : '') +
  '</div>';

  /* 评论流：一级评论按时间正序，嵌套评论紧跟父评论；所有可见者看全部回复 */
  const comments = '<div id="cmtArea">' + commentAreaHtml(me, m) + '</div>';

  /* 全局时间线（每个可见者都展示） */
  let globalSections = '';
  const logs = logsOf(m.id);
  globalSections += '<div class="card"><div class="card-title">全局汇总时间线<span class="sub">所有分池回复与操作自动挂回本消息</span></div>' +
    (logs.length ? logs.map((l) => {
      const key = ['created', 'dispatched', 'forwarded', 'closed', 'cancelled'].includes(l.action);
      return '<div class="tl-item' + (key ? ' tl-key' : '') + '">' +
        '<div class="tl-text"><b>' + esc(userName(l.actorId)) + '</b> ' + esc(logText(l)) + '</div>' +
        '<div class="tl-time">' + fmtTime(l.at) + '</div></div>';
    }).join('') : empty('暂无记录')) + '</div>';

  return head + comments + globalSections + actionBarHtml(me, m);
}

/* ==========================================================================
 * 5. 池管理（按身份裁剪视图）
 * ========================================================================== */
var pmState = {
  mainTab: 'messages',     // 'messages' (分管池在办信息) | 'tree' (池架构管理)
  selectedPoolId: null,
  filterPoolId: 'all',     // 'all' 或具体 poolId
  collapsedMap: {},
  includeSub: true,
  statusFilter: 'all',
  keyword: '',
  sortOrder: 'updated',
  activeTab: 'members',    // in tree detail panel: 'members' | 'settings' | 'logs'
  modal: null
};
window.pmState = pmState;

function pmGetLevelName(level) {
  if (level === 0) return '公司总池';
  if (level === 1) return '分管池';
  if (level === 2) return '部门池';
  if (level === 3) return '小组池';
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
  // 树节点左侧空间紧凑，显示主负责人，多位时带上人数徽标，悬停可看全部
  const shortText = count > 1 ? userName(pool.ownerIds[0]) + ' 等' + count + '人' : userName(pool.ownerIds[0]);
  return '<span class="pm-node-owner" title="共同负责人(' + count + '人)：' + esc(names) + '">' + esc(shortText) + '</span>';
}

/* 渲染单棵树的递归节点 */
function pmRenderNodeHtml(pool, depth, me) {
  if (!pool || pool.status === 'DELETED') return '';
  const allSubpools = S.pools || [];
  const children = allSubpools.filter((p) => p.parentId === pool.id && p.status !== 'DELETED');
  const hasChildren = children.length > 0;
  const isCollapsed = !!pmState.collapsedMap[pool.id];

  const metrics = poolMetrics(pool.id, pmState.includeSub);
  const count = metrics.total;
  const hasOverdue = metrics.hasOverdue;

  // 展开折叠图标
  let caret = '<span class="pm-node-dot"></span>';
  if (hasChildren) {
    caret = '<button type="button" class="pm-toggle-btn" onclick="event.stopPropagation(); pmToggleCollapse(\'' + pool.id + '\')">' +
      (isCollapsed ? '▶' : '▼') + '</button>';
  }

  // 身份与层级判断
  const levelTag = pmGetLevelTag(pool.level);
  const ownerHtml = pmFormatOwner(pool);
  const countClass = 'pm-count-pill' + (hasOverdue ? ' has-overdue' : '');

  // 行缩进（每一级微调为 14px，避免深层级浪费过多宽度）
  const paddingLeft = depth * 14;

  let html = '<div class="pm-node-wrap">';
  html += '<div class="pm-node-row" style="margin-left: ' + paddingLeft + 'px;">';
  html += caret;
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

  // 子节点；新建小组池统一收进部门池右侧“更多操作”菜单
  if (hasChildren && !isCollapsed) {
    children.forEach((cp) => {
      html += pmRenderNodeHtml(cp, depth + 1, me);
    });
  }

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
  const canCreate = canCreateSubPool(me, pool);

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
  if (canCreate) {
    html += '<button type="button" class="btn btn-sm btn-ghost" onclick="pmOpenCreateSub(\'' + pool.id + '\')">+ 子池</button>';
  }
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

  html += '<div class="pm-detail-meta-grid" style="margin-bottom: 16px;">';
  html += '<div class="pm-meta-item wide"><div class="lbl">共同负责人 (' + ownerIds.length + '人)</div><div class="val">' + ownerValHtml + '</div></div>';
  html += '<div class="pm-meta-item"><div class="lbl">成员规模</div><div class="val">' + memberList.length + ' 人</div></div>';
  html += '<div class="pm-meta-item"><div class="lbl">办结时限</div><div class="val">' + (pool.timeoutDays || 2) + ' 天</div></div>';
  html += '<div class="pm-meta-item"><div class="lbl">允许直投</div><div class="val">' + (pool.allowDirect ? '是' : '否') + '</div></div>';
  html += '<div class="pm-meta-item"><div class="lbl">自动分配</div><div class="val">' + (pool.autoAssign ? '开启' : '关闭') + '</div></div>';
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

    html += '<div class="form-row"><div class="form-label">直投与分发规则</div>' +
      '<label style="display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer; margin-bottom: 6px;">' +
        '<input type="checkbox" id="inlinePoolAllowDirect"' + (pool.allowDirect ? ' checked' : '') + ' ' + (!canEdit ? 'disabled' : '') + '> 允许填报时直接投递此池' +
      '</label>' +
      '<label style="display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer;">' +
        '<input type="checkbox" id="inlinePoolAutoAssign"' + (pool.autoAssign ? ' checked' : '') + ' ' + (!canEdit ? 'disabled' : '') + '> 进池新事项自动分配到池负责人' +
      '</label></div>';

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
    const canCreate = canCreateSubPool(me, pool);
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
            (canCreate ? '<button type="button" class="pm-sheet-item" onclick="pmOpenCreateSub(\'' + pool.id + '\');">新建小组池</button>' : '') +
            (canSetOwner ? '<button type="button" class="pm-sheet-item" onclick="pmOpenSetOwner(\'' + pool.id + '\');">共同负责人</button>' : '') +
            (canManageMem ? '<button type="button" class="pm-sheet-item" onclick="pmOpenAddMember(\'' + pool.id + '\');">池成员</button>' : '') +
            (canEdit ? '<button type="button" class="pm-sheet-item" onclick="pmOpenSettings(\'' + pool.id + '\');">规则设置</button>' : '') +
            (canDisable ? '<button type="button" class="pm-sheet-item danger" onclick="pmToggleDisablePool(\'' + pool.id + '\');">' + (pool.status === 'DISABLED' ? '启用本池' : '停用本池') + '</button>' : '') +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  // 2. 新建子池弹窗（支持同时指定多位负责人）
  if (m.type === 'createSub') {
    const parentPool = poolById(m.parentPoolId);
    const parentName = parentPool ? parentPool.name : '公司总池';
    const nextLevelName = parentPool ? (parentPool.level === 0 ? '分管池' : (parentPool.level === 1 ? '部门池' : '小组池')) : '子池';

    return '<div class="pm-modal-overlay" onclick="pmCloseModal()">' +
      '<div class="pm-modal-box" onclick="event.stopPropagation()">' +
        '<div class="pm-modal-head">' +
          '<h3>新建' + nextLevelName + '</h3>' +
          '<button type="button" class="pm-modal-close" onclick="pmCloseModal()">✕</button>' +
        '</div>' +
        '<form onsubmit="event.preventDefault(); pmSubmitCreateSub()">' +
          '<div class="pm-modal-body">' +
            '<div class="pm-form-row">' +
              '<label>所属上级池</label>' +
              '<input type="text" value="' + esc(parentName) + '" disabled />' +
              '<input type="hidden" id="newPoolParentId" value="' + (parentPool ? parentPool.id : '') + '" />' +
            '</div>' +
            '<div class="pm-form-row">' +
              '<label>池名称 <span style="color:#d92d20;">*</span></label>' +
              '<input type="text" id="newPoolName" placeholder="例如：新材料研究部池、华南组池" required />' +
            '</div>' +
            '<div class="pm-form-row">' +
              '<label>初始负责人（支持多选）</label>' +
              '<div class="pm-multi-select-list compact">' +
                USERS.map((u) => {
                  return '<label class="pm-multi-select-item">' +
                    '<input type="checkbox" name="newPoolOwnerSelect" value="' + u.id + '" onchange="this.closest(\'.pm-multi-select-item\').classList.toggle(\'checked\', this.checked);" />' +
                    '<span class="pm-member-avatar">' + esc(u.name.slice(0, 1)) + '</span>' +
                    '<div class="pm-ms-info">' +
                      '<span class="pm-ms-name">' + esc(u.name) + '</span>' +
                      '<span class="pm-ms-dept">' + esc(u.dept || u.role) + '</span>' +
                    '</div>' +
                  '</label>';
                }).join('') +
              '</div>' +
              '<div class="hint">可勾选一位或多位共同负责人（创建后可随时增减）</div>' +
            '</div>' +
            '<div class="pm-form-row">' +
              '<label>办理时限要求（天）</label>' +
              '<input type="number" id="newPoolTimeout" value="2" min="1" max="30" />' +
              '<div class="hint">超出该时限未办结时将在池监控中标记为超时</div>' +
            '</div>' +
            '<div class="pm-form-row">' +
              '<label class="pm-switch-label">' +
                '<span>允许直投建单</span>' +
                '<input type="checkbox" id="newPoolAllowDirect" checked />' +
              '</label>' +
            '</div>' +
            '<div class="pm-form-row">' +
              '<label class="pm-switch-label">' +
                '<span>进池自动分配到负责人</span>' +
                '<input type="checkbox" id="newPoolAutoAssign" />' +
              '</label>' +
            '</div>' +
          '</div>' +
          '<div class="pm-modal-foot">' +
            '<button type="button" class="btn btn-ghost" onclick="pmCloseModal()">取消</button>' +
            '<button type="submit" class="btn btn-primary">确认创建</button>' +
          '</div>' +
        '</form>' +
      '</div>' +
    '</div>';
  }

  // 3. 池设置弹窗
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
            '<div class="pm-form-row">' +
              '<label class="pm-switch-label">' +
                '<span>允许直接投递建单</span>' +
                '<input type="checkbox" id="editPoolAllowDirect"' + (pool.allowDirect ? ' checked' : '') + ' />' +
              '</label>' +
            '</div>' +
            '<div class="pm-form-row">' +
              '<label class="pm-switch-label">' +
                '<span>新消息自动分配</span>' +
                '<input type="checkbox" id="editPoolAutoAssign"' + (pool.autoAssign ? ' checked' : '') + ' />' +
              '</label>' +
            '</div>' +
          '</div>' +
          '<div class="pm-modal-foot">' +
            '<button type="button" class="btn btn-ghost" onclick="pmCloseModal()">取消</button>' +
            '<button type="submit" class="btn btn-primary">保存设置</button>' +
          '</div>' +
        '</form>' +
      '</div>' +
    '</div>';
  }

  // 4. 配置/增减池负责人弹窗（支持多选、共同负责）
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

  // 5. 添加成员弹窗
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

  // 6. 催办弹窗
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

  // 7. 转派弹窗
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

/* 架构树与配置治理 Tab 渲染 */
function pmRenderTreeManagementHtml(me, root) {
  let html = '<div class="pm-split">';

  // 左侧：管辖池架构树
  html += '<div class="pm-split-left">';
  html += '<div class="card pm-tree-card">';
  html += '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">';
  html += '<div class="card-title" style="font-size: 15px; margin: 0;">信息池架构与配置</div>';
  html += '</div>';

  // 树筛选栏 (统一采用标准 filters 样式)
  html += '<div class="filters" style="margin-bottom: 12px; gap: 8px;">';
  html += '<input type="text" id="pmSearchInput" placeholder="搜池名称 / 负责人..." value="' + esc(pmState.keyword || '') + '" oninput="pmSetKeyword(this.value)" style="font-size: 12px;" />';
  html += '</div>';

  html += '<div class="pm-tree-body" style="max-height: 640px; overflow-y: auto; padding-right: 2px;">';
  html += pmRenderNodeHtml(root, 0, me);
  html += '</div>';

  html += '</div>'; // .card
  html += '</div>'; // .pm-split-left

  html += '</div>'; // .pm-split
  return html;
}

/* 主入口函数：renderPools() */
function renderPools() {
  const me = curUser();
  const root = userRootPool(me);

  // 如果普通员工没有所属管理根节点
  if (!root) {
    return '<div class="card empty" style="max-width: 640px; margin: 40px auto; padding: 32px 24px;">' +
      '<div style="font-size: 16px; font-weight: 600; margin-bottom: 8px; color: #1f2430;">您当前身份为普通员工，暂无池管理权限</div>' +
      '<div style="font-size: 13px; color: #667085; max-width: 480px; margin: 0 auto 20px; line-height: 1.6;">' +
        '当前身份（<b>' + esc(me.name) + ' · ' + (me.title || ROLES[me.role]) + '</b>）属于基层员工。请在右上角切换为<b>总池分发人、分管高管或部门/小组负责人</b>，以体验按职级授权裁剪的池管理架构树。' +
      '</div>' +
      '<div style="display: flex; gap: 8px; justify-content: center; flex-wrap: wrap;">' +
        '<button type="button" class="btn btn-primary" onclick="changeIdentity(\'u_qy\')">切为 李倩影 · 总池分发人 (全树)</button>' +
        '<button type="button" class="btn btn-ghost" onclick="changeIdentity(\'u_wjx\')">切为 王冀湘 · 分管人</button>' +
        '<button type="button" class="btn btn-ghost" onclick="changeIdentity(\'u_zm\')">切为 周明 · 部门负责人</button>' +
      '</div>' +
    '</div>';
  }

  let html = '<div class="pm-container">';

  // 池管理页专注信息池架构与配置
  html += pmRenderTreeManagementHtml(me, root);

  html += '</div>'; // .pm-container

  // 3. 模态弹窗渲染
  html += pmRenderModalHtml(me);

  return html;
}

/* ---------- 页面事件绑定函数 ---------- */
window.pmOnIdentityChange = function() {
  pmState.modal = null;
  const me = curUser();
  const root = userRootPool(me);
  pmState.selectedPoolId = root ? root.id : null;
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

window.pmToggleCollapse = function(poolId) {
  pmState.collapsedMap[poolId] = !pmState.collapsedMap[poolId];
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

window.pmOpenCreateSub = function(parentPoolId) {
  const parentPool = poolById(parentPoolId);
  if (!canCreateSubPool(curUser(), parentPool)) {
    toast('部门池和分管池由组织架构确定，只能新建小组池');
    return;
  }
  pmState.modal = { type: 'createSub', parentPoolId };
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

window.pmSubmitCreateSub = function() {
  const parentId = document.getElementById('newPoolParentId').value;
  const name = document.getElementById('newPoolName').value;
  const timeoutDays = document.getElementById('newPoolTimeout').value;
  const allowDirect = document.getElementById('newPoolAllowDirect').checked;
  const autoAssign = document.getElementById('newPoolAutoAssign').checked;

  const cbs = document.querySelectorAll('input[name="newPoolOwnerSelect"]:checked');
  const ownerIds = Array.from(cbs).map((cb) => cb.value);

  if (!name.trim()) {
    toast('请输入池名称');
    return;
  }
  const res = createPool({
    name, parentId, ownerIds, timeoutDays, allowDirect, autoAssign
  });
  if (res.ok) {
    toast('子池「' + res.pool.name + '」已成功创建');
    pmState.selectedPoolId = res.pool.id;
    pmState.modal = null;
    render();
  } else {
    toast(res.msg || '新建小组池失败');
  }
};

window.pmSubmitSettings = function(poolId) {
  const name = document.getElementById('editPoolName').value;
  const timeoutDays = document.getElementById('editPoolTimeout').value;
  const allowDirect = document.getElementById('editPoolAllowDirect').checked;
  const autoAssign = document.getElementById('editPoolAutoAssign').checked;

  const res = updatePool(poolId, { name, timeoutDays, allowDirect, autoAssign });
  if (res.ok) {
    toast('池设置已成功更新');
    pmState.modal = null;
    render();
  }
};

window.pmSubmitInlineSettings = function(poolId) {
  const nameEl = document.getElementById('inlinePoolName');
  const timeoutEl = document.getElementById('inlinePoolTimeout');
  const directEl = document.getElementById('inlinePoolAllowDirect');
  const assignEl = document.getElementById('inlinePoolAutoAssign');

  const name = nameEl ? nameEl.value.trim() : '';
  const timeoutDays = timeoutEl ? timeoutEl.value : 2;
  const allowDirect = directEl ? directEl.checked : false;
  const autoAssign = assignEl ? assignEl.checked : false;

  const res = updatePool(poolId, { name, timeoutDays, allowDirect, autoAssign });
  if (res.ok) {
    toast('已保存池参数与规则配置');
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
