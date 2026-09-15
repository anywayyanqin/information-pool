const store = require('../../utils/store');
const { getProfile } = require('../../utils/profile');

Page({
  data: {
    name: '',
    profile: null,
    tradingRows: [],
    priceRows: [],
    onlineCount: 0,
    offlineCount: 0,
    reports: []
  },

  onLoad(options) {
    const name = decodeURIComponent(options.name || '');
    const p = getProfile(name);

    const tradingRows = [
      { label: '客户权益', value: p.trading.equity },
      { label: '当年经纪业务净收入', value: p.trading.monthIncome },
      { label: '净留存', value: p.trading.yearIncome },
      { label: '净减收', value: p.trading.pnl },
      { label: '净利息', value: p.price.interest }
    ];
    const priceRows = [
      { label: '手续费模版', value: p.price.feeTemplate },
      { label: '保证金比例', value: p.price.marginTemplate },
      { label: '结息比例', value: p.price.interest },
      { label: '近一年采购金额（万元）', value: p.price.yearPurchase },
      { label: '历史采购金额（万元）', value: p.price.totalPurchase }
    ];

    let onlineCount = 0;
    let offlineCount = 0;
    (p.serviceRecords || []).forEach((s) => {
      onlineCount += s.online;
      offlineCount += s.offline;
    });

    const reports = (store.all() || [])
      .filter((r) => r.status === 'submitted' && r.customerName === name)
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      .map((r) => ({
        id: r.id,
        content: r.content || '',
        reporter: (r.reporter && r.reporter.name) || '员工',
        timeText: store.fmtTime(r.updatedAt)
      }));

    this.setData({
      name,
      profile: p,
      tradingRows,
      priceRows,
      onlineCount,
      offlineCount,
      reports
    });
  },

  onBack() {
    wx.navigateBack({ delta: 1 });
  },

  onOpenReport(e) {
    wx.navigateTo({ url: '/pages/detail/detail?id=' + e.currentTarget.dataset.id });
  }
});
