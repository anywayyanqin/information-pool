const store = require('../../utils/store');
const { CATALOG, colorFor } = require('../../utils/services');

Page({
  data: {
    statusBarHeight: 44,
    rec: null,
    catalogView: [],
    picked: [],
    assignees: [],
    assigneeObjs: [],
    sheetOpen: false,
    sheetService: null,
    sheetStaff: []
  },

  onLoad(options) {
    let statusBarHeight = 44;
    try {
      statusBarHeight = (wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()).statusBarHeight || 44;
    } catch (e) {}

    const rec = store.get(options.id);
    if (!rec) {
      wx.showToast({ title: '记录不存在', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 600);
      return;
    }
    const route = rec.route || null;
    this.setData({
      statusBarHeight,
      rec: Object.assign({}, rec, { timeText: store.fmtTime(rec.updatedAt) }),
      picked: route ? route.items.slice() : [],
      assignees: route ? route.assignees.slice() : []
    });
    this.refresh();
  },

  refresh() {
    const pickedNames = this.data.picked.map((p) => p.service);
    const catalogView = CATALOG.map((s) => ({
      name: s.name,
      isNew: s.isNew,
      hot: s.hot,
      itemCount: s.items.length,
      picked: pickedNames.indexOf(s.name) > -1
    }));

    let sheetService = null;
    let sheetStaff = [];
    if (this.data.sheetOpen && this.sheetServiceName) {
      const svc = CATALOG.find((s) => s.name === this.sheetServiceName);
      if (svc) {
        const sub = svc.items.find((i) => i.name === this.sheetSubName) || svc.items[0];
        this.sheetSubName = sub.name;
        sheetService = {
          name: svc.name,
          items: svc.items.map((i) => ({ name: i.name, active: i.name === sub.name })),
          subName: sub.name,
          subDesc: sub.desc
        };
        sheetStaff = sub.staff.map((n) => ({
          name: n,
          initial: n[0],
          color: colorFor(n),
          on: this.data.assignees.indexOf(n) > -1
        }));
      }
    }

    this.setData({
      catalogView,
      sheetService,
      sheetStaff,
      assigneeObjs: this.data.assignees.map((n) => ({ name: n, initial: n[0], color: colorFor(n) }))
    });
  },

  onBack() {
    wx.navigateBack({ delta: 1 });
  },

  onOpenService(e) {
    const name = e.currentTarget.dataset.name;
    const svc = CATALOG.find((s) => s.name === name);
    if (!svc) return;
    const exist = this.data.picked.find((p) => p.service === name);
    this.sheetServiceName = name;
    this.sheetSubName = exist ? exist.sub : svc.items[0].name;
    this.setData({ sheetOpen: true });
    this.refresh();
  },

  onCloseSheet() {
    this.setData({ sheetOpen: false, sheetService: null, sheetStaff: [] });
  },

  onPickSub(e) {
    this.sheetSubName = e.currentTarget.dataset.name;
    this.refresh();
  },

  onToggleStaff(e) {
    const name = e.currentTarget.dataset.name;
    const assignees = this.data.assignees.slice();
    const idx = assignees.indexOf(name);
    if (idx > -1) assignees.splice(idx, 1);
    else assignees.push(name);
    this.setData({ assignees });
    this.refresh();
  },

  onConfirmService() {
    if (!this.sheetServiceName || !this.sheetSubName) return;
    const picked = this.data.picked.filter((p) => p.service !== this.sheetServiceName);
    picked.push({ service: this.sheetServiceName, sub: this.sheetSubName });
    this.setData({ picked, sheetOpen: false, sheetService: null, sheetStaff: [] });
    this.refresh();
  },

  onRemovePick(e) {
    const service = e.currentTarget.dataset.service;
    this.setData({ picked: this.data.picked.filter((p) => p.service !== service) });
    this.refresh();
  },

  onSubmit() {
    if (!this.data.picked.length) {
      wx.showToast({ title: '请选择服务标签', icon: 'none' });
      return;
    }
    if (!this.data.assignees.length) {
      wx.showToast({ title: '请选择派发人员', icon: 'none' });
      return;
    }
    const rec = this.data.rec;
    store.upsert(Object.assign({}, rec, {
      route: {
        items: this.data.picked,
        assignees: this.data.assignees,
        by: (getApp().globalData.user || {}).name || '管理员',
        at: Date.now()
      }
    }));
    wx.showToast({ title: '已流转派发', icon: 'success' });
    setTimeout(() => wx.navigateBack(), 700);
  }
});
