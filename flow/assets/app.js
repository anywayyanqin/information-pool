/* ==========================================================================
 * app.js — 路由 / 顶栏 / 启动
 * ========================================================================== */

const ROUTES = [
  { path: '#/workbench', name: '工作台' },
  { path: '#/new', name: '我要填报' },
  { path: '#/pools', name: '池管理' }
];

function renderTopbar() {
  const hash = location.hash || '#/workbench';
  const me = curUser();
  document.getElementById('topbar').innerHTML =
    '<div class="brand">信息池</div>' +
    '<div class="topnav">' + ROUTES.filter((r) => !r.show || r.show()).map((r) =>
      '<a href="' + r.path + '" class="' + (hash.indexOf(r.path) === 0 ? 'on' : '') + '">' + r.name + '</a>').join('') +
    '</div>' +
    '<div class="idbox">当前身份' +
      '<select onchange="changeIdentity(this.value)">' +
        IDENTITY_CHOICES.map((c) => '<option value="' + c.id + '"' + (c.id === me.id ? ' selected' : '') + '>' +
          esc(c.label) + '</option>').join('') +
      '</select>' +
      '<button class="reset-btn" onclick="resetAll()">重置 Mock 数据</button>' +
    '</div>';
}

function changeIdentity(userId) {
  setIdentity(userId);
  if (typeof pmOnIdentityChange === 'function') {
    pmOnIdentityChange();
  }
  toast('已切换身份：' + userName(userId) + '（' + ROLES[curUser().role] + '）');
  render();
}
window.changeIdentity = changeIdentity;
window.resetAll = () => {
  if (!confirm('将清空本地全部演示数据并恢复种子数据，确定重置吗？')) return;
  resetState();
  toast('Mock 数据已重置');
  location.hash = '#/workbench';
  render();
};

function render() {
  const hash = location.hash || '#/workbench';
  if (hash.indexOf('#/infopool') === 0) {
    location.replace('#/workbench');
    return;
  }
  renderTopbar();
  const app = document.getElementById('app');
  let html;
  if (hash.indexOf('#/message/') === 0) html = renderDetail(hash.slice('#/message/'.length));
  else if (hash.indexOf('#/customer/') === 0) html = renderCustomer(decodeURIComponent(hash.slice('#/customer/'.length)));
  else if (hash === '#/new') html = renderNew();
  else if (hash.indexOf('#/pools') === 0) html = renderPools();
  else html = renderWorkbench();
  app.innerHTML = html;
  if (hash === '#/new') afterRenderNew();
  if (hash.indexOf('#/pools') === 0 && window.afterRenderPools) afterRenderPools();
}

window.addEventListener('hashchange', render);

loadState();
if (!location.hash) location.hash = '#/workbench';
render();
