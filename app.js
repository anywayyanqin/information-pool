const store = require('./utils/store');

App({
  onLaunch() {
    store.migrateAll();
  },
  globalData: {
    // Demo 使用模拟填报人；正式上线时通过 wx.qy.login 换取企业微信真实身份
    user: { dept: '信息技术部', name: '张三' },
    editDraftId: ''
  }
});
