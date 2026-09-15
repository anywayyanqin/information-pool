const store = require('../../utils/store');
const { POOLS, EXECUTIVES, MAIN_POOL_ADMIN } = require('../../utils/pools');

const POOL_MAP = {};
POOLS.forEach((p) => { POOL_MAP[p.key] = p; });

const S_COLORS = ['#2f6bff', '#7c5cff', '#00a6a6', '#e6781a', '#d6336c', '#3d9970'];
function pHash(str) { let h = 0; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0; return h; }
const colorFor = (name) => S_COLORS[pHash(name) % S_COLORS.length];

function poolName(key) {
  const p = POOL_MAP[key];
  return p ? p.name : key;
}

Page({
  data: {
    rec: null,
    statusText: '',
    statusClass: '',
    poolView: [],
    replyCount: 0,
    thread: [],
    currentPool: '',
    canReply: false,
    canRoute: false,
    replyDraft: '',
    executives: EXECUTIVES,
    forwardExecs: EXECUTIVES,
    sheet: { show: false, pools: [], mode: 'route' }
  },

  onLoad(options) {
    this.recId = options.id;
    this.poolCtx = options.pool || '';
    this.loadRecord();
  },

  getPoolStatus(r) {
    if (r.closed) return 'closed';
    if (!r.pools || r.pools.indexOf('main') > -1) return 'pending';
    const allReplied = r.pools.every((k) => r.replies && r.replies[k]);
    return allReplied ? 'done' : 'processing';
  },

  loadRecord() {
    const rec = store.get(this.recId);
    if (!rec) {
      wx.showToast({ title: '记录不存在', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 600);
      return;
    }
    const status = this.getPoolStatus(rec);
    const statusMap = { pending: '待分发', processing: '处理中', done: '待关闭', closed: '已关闭' };
    const currentPool = this.poolCtx && this.poolCtx !== 'main' && this.poolCtx !== 'all' ? this.poolCtx : '';

    const thread = (rec.timeline || [])
      .slice()
      .sort((a, b) => a.at - b.at)
      .filter((e) => e.type !== 'submit')
      .map((e) => {
        if (e.type === 'route') {
          return { kind: 'sys', text: e.by + ' 将本条分发到 ' + (e.pools || []).map(poolName).join('、'), timeText: store.fmtTime(e.at) };
        }
        if (e.type === 'forward') {
          return { kind: 'sys', text: e.by + ' 将本条流转给 ' + (e.pools || []).map(poolName).join('、'), timeText: store.fmtTime(e.at) };
        }
        if (e.type === 'close') {
          return { kind: 'sys', text: e.by + ' 核对回复，确认关闭', timeText: store.fmtTime(e.at) };
        }
        return {
          kind: 'reply',
          by: e.by || '',
          initial: (e.by || '?')[0],
          color: colorFor(e.by || '?'),
          badge: poolName(e.pool),
          badgeMain: e.pool === 'main',
          content: e.content || '',
          timeText: store.fmtTime(e.at)
        };
      });

    this.setData({
      rec: Object.assign({}, rec, { timeText: store.fmtTime(rec.createdAt || rec.updatedAt) }),
      statusText: statusMap[status],
      statusClass: status,
      poolView: (rec.pools || []).map((k) => ({
        key: k,
        name: poolName(k),
        isMain: k === 'main',
        replied: !!(rec.replies && rec.replies[k])
      })),
      replyCount: (rec.timeline || []).filter((e) => e.type === 'reply').length,
      thread,
      currentPool,
      canReply: !!(currentPool && !rec.closed && !(rec.replies && rec.replies[currentPool])),
      canRoute: !rec.closed && (rec.pools || []).indexOf('main') > -1,
      canForward: !rec.closed,
      forwardExecs: EXECUTIVES.filter((e) => (rec.pools || []).indexOf(e.name) === -1),
      replyDraft: ''
    });
  },

  onOpenCustomer() {
    const name = this.data.rec && this.data.rec.customerName;
    if (!name) return;
    wx.navigateTo({ url: '/pages/customer/customer?name=' + encodeURIComponent(name) });
  },

  onPreviewImage(e) {
    const path = e.currentTarget.dataset.path;
    const urls = this.data.rec.attachments.filter((a) => a.kind === 'image').map((a) => a.path);
    wx.previewImage({ current: path, urls });
  },

  onOpenFile(e) {
    const item = this.data.rec.attachments[e.currentTarget.dataset.index];
    if (!item) return;
    wx.openDocument({
      filePath: item.path,
      showMenu: true,
      fail: () => wx.showToast({ title: '文件已失效（临时文件）', icon: 'none' })
    });
  },

  onReplyInput(e) {
    this.setData({ replyDraft: e.detail.value });
  },

  onSendReply() {
    const content = this.data.replyDraft.trim();
    if (!content) {
      wx.showToast({ title: '请输入回复内容', icon: 'none' });
      return;
    }
    const pool = this.data.currentPool;
    const list = store.all();
    const rec = list.find((r) => r.id === this.recId);
    if (!rec) return;
    rec.replies = rec.replies || {};
    rec.replies[pool] = { content, by: pool, at: Date.now() };
    rec.timeline = rec.timeline || [];
    rec.timeline.push({ type: 'reply', by: pool, pool, content, at: Date.now() });
    rec.updatedAt = Date.now();
    store.saveAll(list);
    wx.showToast({ title: '回复已提交', icon: 'none' });
    this.loadRecord();
  },

  onOpenRouteSheet() {
    this.setData({ sheet: { show: true, pools: [], mode: 'route' } });
  },

  onOpenForwardSheet() {
    this.setData({ sheet: { show: true, pools: [], mode: 'forward' } });
  },

  onCloseRouteSheet() {
    this.setData({ 'sheet.show': false });
  },

  onToggleRoutePool(e) {
    const name = e.currentTarget.dataset.name;
    const pools = this.data.sheet.pools.slice();
    const idx = pools.indexOf(name);
    if (idx > -1) {
      pools.splice(idx, 1);
    } else {
      pools.push(name);
    }
    this.setData({ 'sheet.pools': pools });
  },

  onConfirmRouteSheet() {
    if (this.data.sheet.mode === 'forward') {
      this.onConfirmForwardSheet();
      return;
    }
    const pools = this.data.sheet.pools;
    if (!pools.length) {
      wx.showToast({ title: '请至少选择一个分池', icon: 'none' });
      return;
    }
    const list = store.all();
    const rec = list.find((r) => r.id === this.recId);
    if (!rec) return;
    rec.pools = pools.slice();
    rec.replies = rec.replies || {};
    rec.timeline = rec.timeline || [];
    rec.timeline.push({ type: 'route', by: MAIN_POOL_ADMIN, at: Date.now(), pools: pools.slice() });
    rec.updatedAt = Date.now();
    store.saveAll(list);
    this.setData({ 'sheet.show': false });
    wx.showToast({ title: '已分发到 ' + pools.length + ' 个分池', icon: 'none' });
    this.loadRecord();
  },

  onConfirmForwardSheet() {
    const pools = this.data.sheet.pools;
    if (!pools.length) {
      wx.showToast({ title: '请选择要流转的人员', icon: 'none' });
      return;
    }
    const list = store.all();
    const rec = list.find((r) => r.id === this.recId);
    if (!rec) return;
    const merged = (rec.pools || []).slice();
    pools.forEach((p) => { if (merged.indexOf(p) === -1) merged.push(p); });
    rec.pools = merged.filter((p) => p !== 'main');
    rec.timeline = rec.timeline || [];
    const by = this.data.currentPool || MAIN_POOL_ADMIN;
    rec.timeline.push({ type: 'forward', by, at: Date.now(), pools: pools.slice() });
    rec.updatedAt = Date.now();
    store.saveAll(list);
    this.setData({ 'sheet.show': false });
    wx.showToast({ title: '已流转给 ' + pools.length + ' 位人员', icon: 'none' });
    this.loadRecord();
  }
});
