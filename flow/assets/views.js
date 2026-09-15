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
    '<span class="att-chip">' + (a.type === 'voice' ? '🎤 ' : a.type === 'image' ? '🖼 ' : '') + esc(a.name) +
    (a.size ? '（' + fmtSize(a.size) + '）' : '') + '</span>').join('') + '</div>';
}
function toast(msg) {
  const el = document.getElementById('toast');
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
let wbKw = '';

function wbTabs() {
  if (isDispatcher(curUser())) {
    return [
      { key: 'all', name: '全部' },
      { key: 'dispatch', name: '待分发' },
      { key: 'todo', name: '待办' },
      { key: 'done', name: '已办' },
      { key: 'ended', name: '完成' },
      { key: 'mine', name: '我发起的' }
    ];
  }
  return [
    { key: 'all', name: '全部' },
    { key: 'todo', name: '待办' },
    { key: 'done', name: '已办' },
    { key: 'ended', name: '完成' },
    { key: 'mine', name: '我发起的' }
  ];
}
function effectiveWbTab() {
  const keys = wbTabs().map((t) => t.key);
  if (wbTab && keys.includes(wbTab)) return wbTab;
  return isDispatcher(curUser()) ? 'dispatch' : 'all';
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
  else if (tab === 'mine') list = list.filter((m) => m.createdBy === me.id);
  if (wbPool !== 'all') list = list.filter((m) => msgInPool(m, wbPool));
  if (wbStatus) list = list.filter((m) => flowStatus(m, me) === wbStatus);
  if (wbKw) list = list.filter((m) => (m.no + m.title).toLowerCase().includes(wbKw.toLowerCase()));
  return list.sort((a, b) => b.updatedAt - a.updatedAt);
}

window.setWbPool = (id) => { wbPool = id; render(); };
window.setWbTab = (k) => { wbTab = k; render(); };
window.setWbStatus = (v) => { wbStatus = v; render(); };
window.setWbKw = (v) => { wbKw = v; renderListOnly(); };
window.openMessage = (id) => { location.hash = '#/message/' + id; };

function renderListOnly() {
  const el = document.getElementById('msgList');
  if (el) el.innerHTML = wbListHtml();
}
function wbListHtml() {
  const me = curUser();
  const list = wbList();
  if (!list.length) return empty('暂无符合条件的消息');
  return list.map((m) => {
    const handlers = [...new Set(linksOf(m.id).filter(linkActive).map((l) => handlerOfLink(l)).filter(Boolean))]
      .map(userName).join('、');
    const handler = handlers || '—';
    const src = (m.sources && m.sources.length ? m.sources.join('、') : '') +
      (m.sourceOther ? (m.sources && m.sources.length ? '、' : '') + m.sourceOther : '');
    return '<div class="msg-row" onclick="openMessage(\'' + m.id + '\')">' +
      '<div class="msg-row-top">' +
        '<span class="msg-no">' + m.no + '</span>' +
        flowBadge(m, me) +
        (isEnded(m) ? '' : '<span class="msg-meta msg-handler">当前处理人：' + esc(handler) + '</span>') +
      '</div>' +
      '<div class="msg-info"><span class="msg-info-label">信息来源：</span>' + esc(src || '—') + '</div>' +
      '<div class="msg-desc"><span class="msg-info-label">详细描述：</span>' + esc(m.content) + '</div>' +
      '<div class="msg-foot">' +
        '<span class="msg-meta">发起人：' + esc(userName(m.createdBy)) + '</span>' +
        '<span class="msg-time">' + fmtTime(m.updatedAt) + '</span>' +
      '</div>' +
    '</div>';
  }).join('');
}

function renderWorkbench() {
  const tab = effectiveWbTab();
  const statusOpts = Object.keys(FLOW_STATUS).map((k) =>
    '<option value="' + k + '"' + (wbStatus === k ? ' selected' : '') + '>' + FLOW_STATUS[k] + '</option>').join('');
  const poolOpts = '<option value="all">全部池</option>' + S.pools.map((p) =>
    '<option value="' + p.id + '"' + (wbPool === p.id ? ' selected' : '') + '>' + esc(p.name) + '</option>').join('');
  return '<div class="wb-main">' +
    '<div class="tabs">' + wbTabs().map((t) =>
      '<div class="tab' + (tab === t.key ? ' on' : '') + '" onclick="setWbTab(\'' + t.key + '\')">' + t.name + '</div>').join('') +
    '</div>' +
    '<div class="filters">' +
      '<input placeholder="搜索编号 / 标题" value="' + esc(wbKw) + '" oninput="setWbKw(this.value)">' +
      '<select onchange="setWbPool(this.value)">' + poolOpts + '</select>' +
      '<select onchange="setWbStatus(this.value)"><option value="">全部状态</option>' + statusOpts + '</select>' +
    '</div>' +
    '<div id="msgList">' + wbListHtml() + '</div>' +
  '</div>';
}

/* ==========================================================================
 * 2. 我要填报（投递）
 * ========================================================================== */
let newMsgAtts = [];
let newSources = [];
let newTargetPool = 'p_company';
let newDraft = { content: '', customerName: '', sourceOther: '' };

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
        '<select id="newCustomer"><option value="">请选择客户</option>' +
          CUSTOMERS.map((c) => '<option value="' + esc(c) + '"' + (newDraft.customerName === c ? ' selected' : '') + '>' + esc(c) + '</option>').join('') +
        '</select></div>' : '') +
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

/* 池人员评论提交后二选一：结束处理 / 流转（内容来自底部评论面板） */
window.submitEnd = () => {
  if (!modalState) return;
  const st = modalState;
  const r = addReply(st.msgId, st.poolId, st.content, st.atts || []);
  if (!r.ok) { toast(r.msg); return; }
  setHandlerConfirm(st.msgId, st.linkId, 'resolved', '');
  closeModal();
  const m = findMsg(st.msgId);
  toast(m.status === 'confirming' ? '已提交，本池标记已办，等待提交人确认'
    : m.status === 'closed' ? '双方均确认已解决，消息已完成' : '已提交，本池标记已办');
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

  /* 「提交」二选一：结束处理 / 流转 */
  if (modalState.mode === 'submitChoice') {
    const link = linkById(modalState.linkId);
    const canFwd = canForward(curUser(), m, link);
    document.getElementById('modal').innerHTML =
      '<div class="choice-list">' +
        '<div class="choice-row" onclick="submitEnd()"><span class="choice-radio"></span><span class="choice-text">结束处理</span></div>' +
        '<div class="choice-row' + (canFwd ? '' : ' dis') + '"' + (canFwd ? ' onclick="submitForward()"' : '') + '><span class="choice-radio"></span><span class="choice-text">流转</span></div>' +
      '</div>' +
      (canFwd ? '' : '<div class="form-hint" style="margin-top:8px">本池没有可流转的下级池</div>');
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
  toast(m.status === 'closed' ? '落实人与提出人均确认已解决，消息已完成'
    : state === 'resolved' ? '落实人确认已记录' : '已标记未解决，消息重新打开');
  render();
};
window.creatorConfirm = (msgId, state) => {
  const r = setCreatorConfirm(msgId, state);
  if (!r.ok) { toast(r.msg); return; }
  toast(state === 'resolved' ? '已确认解决，消息已完成' : '已标记为未解决');
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
  const liked = (m.likedByUserIds || []).includes(me.id);
  const cmtCount = repliesOf(m.id).length;
  const comment = '<div class="bar-comment">' +
    '<input class="bar-comment-input" readonly placeholder="说点什么..." onclick="openCommentPanel(\'' + m.id + '\')">' +
  '</div>';
  const likeBtn = '<button class="bar-ic' + (liked ? ' on' : '') + '" title="点赞" onclick="toggleMsgLikeUI(\'' + m.id + '\')">👍<i>' + (m.likeCount || 0) + '</i></button>';
  const cmtBtn = '<button class="bar-ic" title="评论" onclick="openCommentPanel(\'' + m.id + '\')">💬<i>' + cmtCount + '</i></button>';
  const acts = [];
  if (canConfirmCreator(me, m)) {
    acts.push('<button class="btn btn-sm" onclick="creatorConfirm(\'' + m.id + '\',\'resolved\')">确认已解决</button>');
    acts.push('<button class="btn btn-sm btn-ghost" onclick="creatorConfirm(\'' + m.id + '\',\'unresolved\')">标记未解决</button>');
  }
  if (canDispatch(me, m)) {
    acts.push('<button class="btn btn-sm" onclick="openDispatchModal(\'' + m.id + '\')">分发到目标池</button>');
  }
  const actions = acts.length ? '<div class="bar-actions">' + acts.join('') + '</div>' : '';
  return '<div class="action-bar-spacer"></div>' +
    '<div class="action-bar"><div class="action-bar-inner">' +
      comment + likeBtn + cmtBtn + actions +
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
      if (n.indexOf('已解决') > -1) return '已完成';
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
 * 每条回复（含主体）都有 👍 / 💬 按钮；落实人确认按钮在落实人回复上直接展示。 */
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
        '<button class="like-btn' + (liked ? ' on' : '') + '" id="like_' + r.id + '" onclick="toggleLike(\'' + r.id + '\')">👍 ' + (r.likeCount || 0) + '</button>' +
        '<button class="like-btn" onclick="toggleCommentBox(\'' + m.id + '\',\'' + r.id + '\')">💬' + (childCount ? ' ' + childCount : '') + '</button>' +
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
    '<span class="att-chip">' + (a.type === 'voice' ? '🎤 ' : a.type === 'image' ? '🖼 ' : '') + esc(a.name) +
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
      '<div class="img-pick-row" onclick="cmtImagePick(true)">📷 拍照</div>' +
      '<div class="img-pick-row" onclick="cmtImagePick(false)">🖼 从相册选择</div>' +
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
      '<button type="button" class="tl-btn' + (cmtPanel.recording ? ' on' : '') + '" title="语音" onclick="cmtVoice()">🎤</button>' +
      '<button type="button" class="tl-btn' + (cmtPanel.showImg ? ' on' : '') + '" title="图片" onclick="cmtImage()">🖼</button>' +
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
    btn.textContent = '👍 ' + (r.likeCount || 0);
  }
};

/* 💬：在该评论下方展开 / 收起嵌套回复输入框（只重渲染评论区） */
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
      '<span class="detail-no">' + m.no + '</span>' + flowBadge(m, me) +
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
 * 5. 池管理
 * ========================================================================== */
function renderPools() {
  if (!isDispatcher(curUser())) {
    return '<div class="card no-perm">池管理仅总池分发人可见</div>';
  }
  return '<div class="wb">' +
    '<div class="wb-main"><div class="card"><div class="card-title">池树</div>' +
      treeHtml(poolTree(), {}) +
    '</div></div>' +
  '</div>';
}
