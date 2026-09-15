Component({
  data: {
    selected: 0
  },
  methods: {
    onTap(e) {
      const index = e.currentTarget.dataset.index;
      const urls = ['/pages/report/report', '/pages/list/list', '/pages/admin/admin'];
      wx.switchTab({ url: urls[index] });
    }
  }
});
