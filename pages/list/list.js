const store = require('../../utils/store');

Page({
  data: {
    statusBarHeight: 44,
    user: { dept: '', name: '' },
    filter: 'all',
    records: []
  },

  onLoad() {
    let statusBarHeight = 44;
    try {
      statusBarHeight = (wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()).statusBarHeight || 44;
    } catch (e) {}
    this.setData({ user: getApp().globalData.user, statusBarHeight });
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 });
    }
    this.reload();
  },

  reload() {
    const filter = this.data.filter;
    const records = store.all()
      .filter((r) => filter === 'all' || r.status === filter)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((r) => {
        const attCount = (r.attachments || []).length;
        const footText = [
          r.customerName ? '客户：' + r.customerName : '',
          r.sourceOther ? '其他来源：' + r.sourceOther : '',
          attCount ? '附件 ' + attCount + ' 个' : ''
        ].filter(Boolean).join(' · ');
        return Object.assign({}, r, {
          sources: r.sources || [],
          customerName: r.customerName || '',
          timeText: store.fmtTime(r.updatedAt),
          attCount,
          footText
        });
      });
    this.setData({ records });
  },

  onFilter(e) {
    this.setData({ filter: e.currentTarget.dataset.f }, () => this.reload());
  },

  onOpen(e) {
    const { id, status } = e.currentTarget.dataset;
    if (status === 'draft') {
      getApp().globalData.editDraftId = id;
      wx.switchTab({ url: '/pages/report/report' });
    } else {
      wx.navigateTo({ url: '/pages/detail/detail?id=' + id });
    }
  }
});
