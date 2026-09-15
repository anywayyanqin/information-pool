const store = require('../../utils/store');

Page({
  data: {
    rec: null,
    groups: []
  },

  onLoad(options) {
    const rec = store.get(options.id);
    if (!rec) {
      wx.showToast({ title: '记录不存在', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 600);
      return;
    }
    const groupDefs = [
      { title: '信息来源', items: rec.sources || [] }
    ];
    const poolTags = (rec.pools || []).map((k) => ({
      key: k,
      name: k === 'main' ? '人工流转' : k,
      replied: !!(rec.replies && rec.replies[k])
    }));
    const replyList = Object.keys(rec.replies || {}).map((k) => ({
      pool: k === 'main' ? '人工流转' : k,
      content: rec.replies[k].content,
      by: rec.replies[k].by,
      timeText: store.fmtTime(rec.replies[k].at)
    }));
    this.setData({
      rec: Object.assign({}, rec, { timeText: store.fmtTime(rec.updatedAt) }),
      groups: groupDefs.filter((g) => g.items.length),
      poolTags,
      replyList,
      closedText: rec.closed ? `已由 ${rec.closedBy || '管理员'} 关闭 · ${store.fmtTime(rec.closedAt)}` : ''
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
  }
});
