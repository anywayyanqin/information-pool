const store = require('../../utils/store');
const customers = require('../../utils/customers');
const { POOLS } = require('../../utils/pools');

let siPlugin = null;
try {
  siPlugin = requirePlugin('WechatSI');
} catch (e) {
  siPlugin = null;
}

const emptyForm = () => ({
  sources: [],
  customerName: '',
  sourceOther: '',
  content: '',
  attachments: [],
  pool: 'main'
});

Page({
  data: {
    statusBarHeight: 44,
    user: { dept: '', name: '' },
    groups: [
      { key: 'sources', title: '信息来源', required: true, open: true, options: ['客户反馈', '同业交流', '行业会议', '监管与交易所', '网络媒体', '其他'] }
    ],
    pools: POOLS,
    form: emptyForm(),
    picked: [],
    counts: {},
    draftId: '',
    recording: false,
    voiceTmp: '',
    customerFocus: false,
    customerOptions: []
  },

  onLoad() {
    const app = getApp();
    let statusBarHeight = 44;
    try {
      statusBarHeight = (wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()).statusBarHeight || 44;
    } catch (e) {}
    this.setData({ user: app.globalData.user, statusBarHeight });
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 });
    }
    const app = getApp();
    const draftId = app.globalData.editDraftId;
    if (draftId) {
      app.globalData.editDraftId = '';
      const rec = store.get(draftId);
      if (rec) this.loadRecord(rec);
    }
  },

  loadRecord(rec) {
    const form = {
      sources: rec.sources || [],
      customerName: rec.customerName || '',
      sourceOther: rec.sourceOther || '',
      content: rec.content || '',
      attachments: rec.attachments || [],
      pool: (rec.pools && rec.pools[0]) || 'main'
    };
    this.setData({ form, draftId: rec.id }, () => this.refreshMeta());
  },

  refreshMeta() {
    const { form, groups } = this.data;
    const picked = [];
    const counts = {};
    groups.forEach((g) => {
      const arr = form[g.key] || [];
      counts[g.key] = arr.length;
      arr.forEach((label) => picked.push({ key: g.key + ':' + label, group: g.key, label }));
    });
    this.setData({ picked, counts });
  },

  onToggleGroup(e) {
    const index = e.currentTarget.dataset.index;
    this.setData({ [`groups[${index}].open`]: !this.data.groups[index].open });
  },

  onToggleChip(e) {
    const { group, label } = e.currentTarget.dataset;
    const arr = (this.data.form[group] || []).slice();
    const idx = arr.indexOf(label);
    if (idx > -1) {
      arr.splice(idx, 1);
    } else {
      arr.push(label);
    }
    this.setData({ [`form.${group}`]: arr }, () => this.refreshMeta());
  },

  onSetPool(e) {
    this.setData({ 'form.pool': e.currentTarget.dataset.key });
  },

  onContentInput(e) {
    this.setData({ 'form.content': e.detail.value });
  },

  onCustomerInput(e) {
    this.setData({ 'form.customerName': e.detail.value });
    this.filterCustomers(e.detail.value);
  },

  onCustomerFocus() {
    this.filterCustomers(this.data.form.customerName);
    this.setData({ customerFocus: true });
  },

  onCustomerBlur() {
    setTimeout(() => this.setData({ customerFocus: false }), 150);
  },

  onPickCustomer(e) {
    this.setData({
      'form.customerName': e.currentTarget.dataset.name,
      customerFocus: false
    });
  },

  filterCustomers(kw) {
    kw = (kw || '').trim();
    const list = kw ? customers.filter((c) => c.name.indexOf(kw) > -1) : customers;
    this.setData({ customerOptions: list.slice(0, 50) });
  },

  onSourceOtherInput(e) {
    this.setData({ 'form.sourceOther': e.detail.value });
  },

  onMicTap() {
    if (!this.recManager) {
      if (!siPlugin) {
        wx.showModal({
          title: '语音输入未启用',
          content: '当前体验环境未接入「微信同声传译」插件。正式上线时在小程序管理后台添加该插件后，即可使用语音转文字。',
          showCancel: false,
          confirmText: '知道了'
        });
        return;
      }
      this.recManager = siPlugin.getRecordRecognitionManager();
      this.recManager.onRecognize = (res) => {
        this.setData({ voiceTmp: res.result });
      };
      this.recManager.onStop = (res) => {
        const text = ((res && res.result) || '').trim();
        const content = (this.data.form.content + text).slice(0, 2000);
        this.setData({ recording: false, voiceTmp: '', 'form.content': content });
      };
      this.recManager.onError = () => {
        this.setData({ recording: false, voiceTmp: '' });
        wx.showToast({ title: '识别失败，请重试', icon: 'none' });
      };
    }
    if (this.data.recording) {
      this.recManager.stop();
    } else {
      this.recManager.start({ duration: 60000, lang: 'zh_CN' });
      this.setData({ recording: true, voiceTmp: '' });
    }
  },

  onAddImage() {
    const left = 9 - this.data.form.attachments.length;
    if (left <= 0) {
      wx.showToast({ title: '最多上传9个附件', icon: 'none' });
      return;
    }
    if (wx.chooseMedia) {
      wx.chooseMedia({
        count: left,
        mediaType: ['image'],
        success: (res) => {
          const files = res.tempFiles.map((f, i) => ({
            kind: 'image',
            path: f.tempFilePath,
            size: f.size || 0,
            sizeText: store.fmtSize(f.size || 0),
            name: '照片' + (i + 1),
            ext: 'IMG'
          }));
          this.pushFiles(files);
        }
      });
    } else {
      wx.chooseImage({
        count: left,
        success: (res) => {
          const files = (res.tempFilePaths || []).map((p, i) => ({
            kind: 'image',
            path: p,
            size: 0,
            sizeText: '',
            name: '照片' + (i + 1),
            ext: 'IMG'
          }));
          this.pushFiles(files);
        }
      });
    }
  },

  onAddFile() {
    const left = 9 - this.data.form.attachments.length;
    if (left <= 0) {
      wx.showToast({ title: '最多上传9个附件', icon: 'none' });
      return;
    }
    wx.chooseMessageFile({
      count: Math.min(left, 5),
      type: 'file',
      success: (res) => {
        const files = res.tempFiles.map((f) => {
          const ext = (f.name.split('.').pop() || 'FILE').toUpperCase().slice(0, 4);
          return {
            kind: 'file',
            path: f.path,
            size: f.size || 0,
            sizeText: store.fmtSize(f.size || 0),
            name: f.name,
            ext
          };
        });
        this.pushFiles(files);
      }
    });
  },

  pushFiles(files) {
    const attachments = this.data.form.attachments.concat(files).slice(0, 9);
    this.setData({ 'form.attachments': attachments });
  },

  onDelAttachment(e) {
    const index = e.currentTarget.dataset.index;
    const attachments = this.data.form.attachments.slice();
    attachments.splice(index, 1);
    this.setData({ 'form.attachments': attachments });
  },

  onPreviewImage(e) {
    const path = e.currentTarget.dataset.path;
    const urls = this.data.form.attachments.filter((a) => a.kind === 'image').map((a) => a.path);
    wx.previewImage({ current: path, urls });
  },

  onOpenFile(e) {
    const item = this.data.form.attachments[e.currentTarget.dataset.index];
    if (!item) return;
    wx.openDocument({
      filePath: item.path,
      showMenu: true,
      fail: () => wx.showToast({ title: '文件已失效（临时文件）', icon: 'none' })
    });
  },

  buildRecord(status) {
    const now = Date.now();
    const old = this.data.draftId ? store.get(this.data.draftId) : null;
    let timeline = old && old.timeline
      ? old.timeline
      : [{ type: 'submit', by: this.data.user.name || '张三', at: now, pool: this.data.form.pool }];
    if (status === 'submitted' && timeline.length === 1 && timeline[0].type === 'submit') {
      timeline = [{ type: 'submit', by: timeline[0].by, at: timeline[0].at, pool: this.data.form.pool }];
    }
    return {
      id: this.data.draftId || 'r_' + now + '_' + Math.floor(Math.random() * 1000),
      seq: old && old.seq ? old.seq : store.nextSeq(),
      status,
      sources: this.data.form.sources,
      customerName: this.data.form.customerName.trim(),
      sourceOther: this.data.form.sourceOther.trim(),
      content: this.data.form.content.trim(),
      attachments: this.data.form.attachments,
      pools: [this.data.form.pool],
      replies: old ? old.replies || {} : {},
      closed: false,
      timeline,
      reporter: this.data.user,
      createdAt: old ? old.createdAt : now,
      updatedAt: now
    };
  },

  onSaveDraft() {
    const f = this.data.form;
    const hasAny =
      f.sources.length || f.customerName.trim() || f.sourceOther.trim() || f.content.trim() || f.attachments.length;
    if (!hasAny) {
      wx.showToast({ title: '表单为空，无需保存', icon: 'none' });
      return;
    }
    const rec = this.buildRecord('draft');
    store.upsert(rec);
    this.setData({ draftId: rec.id });
    wx.showToast({ title: '草稿已保存', icon: 'success' });
  },

  onSubmit() {
    const f = this.data.form;
    if (!f.sources.length) {
      wx.showToast({ title: '请选择信息来源', icon: 'none' });
      return;
    }
    if (f.sources.indexOf('客户反馈') > -1 && !f.customerName.trim()) {
      wx.showToast({ title: '请输入客户名称', icon: 'none' });
      return;
    }
    if (f.sources.indexOf('其他') > -1 && !f.sourceOther.trim()) {
      wx.showToast({ title: '请填写其他来源说明', icon: 'none' });
      return;
    }
    if (!f.content.trim()) {
      wx.showToast({ title: '请填写信息描述', icon: 'none' });
      return;
    }
    store.upsert(this.buildRecord('submitted'));
    this.setData({ form: emptyForm(), draftId: '', picked: [], counts: {}, voiceTmp: '' });
    wx.showToast({ title: '提交成功', icon: 'success' });
    setTimeout(() => {
      wx.switchTab({ url: '/pages/list/list' });
    }, 600);
  }
});
