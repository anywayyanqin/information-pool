const store = require('../../utils/store');
const { POOLS, EXECUTIVES, MAIN_POOL_ADMIN } = require('../../utils/pools');

Page({
  data: {
    statusBarHeight: 44,
    records: [],
    pools: POOLS,
    executives: EXECUTIVES,
    mainPoolAdmin: MAIN_POOL_ADMIN,
    poolFilter: 'main'
  },

  onLoad() {
    let statusBarHeight = 44;
    try {
      statusBarHeight = (wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()).statusBarHeight || 44;
    } catch (e) {}
    this.setData({ statusBarHeight });
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 });
    }
    store.migrateAll();
    this.reload();
  },

  reload() {
    const list = store.all()
      .filter((r) => r.status === 'submitted')
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((r) => Object.assign({}, r, {
        timeText: store.fmtTime(r.updatedAt),
        attCount: (r.attachments || []).length,
        poolStatus: this.getPoolStatus(r),
        poolStatusText: this.getPoolStatusText(r),
        poolView: (r.pools || []).map((k) => ({
          key: k,
          name: k === 'main' ? '人工流转' : k,
          isMain: k === 'main',
          replied: !!(r.replies && r.replies[k])
        }))
      }));

    let filtered = list;
    const f = this.data.poolFilter;
    if (f === 'main') {
      filtered = list.filter((r) => !r.closed);
    } else if (f === 'all') {
      filtered = list;
    } else {
      filtered = list.filter((r) => r.pools && r.pools.indexOf(f) > -1);
    }

    this.setData({ records: filtered });
  },

  getPoolStatus(r) {
    if (r.closed) return 'closed';
    if (!r.pools || r.pools.indexOf('main') > -1) return 'pending';
    const allReplied = r.pools.every((k) => r.replies && r.replies[k]);
    return allReplied ? 'done' : 'processing';
  },

  getPoolStatusText(r) {
    const map = { pending: '待分发', processing: '处理中', done: '待关闭', closed: '已关闭' };
    return map[this.getPoolStatus(r)];
  },

  onSetPoolFilter(e) {
    this.setData({ poolFilter: e.currentTarget.dataset.key }, () => this.reload());
  },

  onOpen(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/adminDetail/adminDetail?id=' + id + '&pool=' + encodeURIComponent(this.data.poolFilter) });
  }
});
