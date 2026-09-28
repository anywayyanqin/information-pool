/* ==========================================================================
 * app.js — 路由 / 顶栏 / 启动
 * ========================================================================== */

let detailReturnHash = '#/workbench';

window.goBackFromDetail = () => {
  location.hash = detailReturnHash && detailReturnHash.indexOf('#/message/') !== 0
    ? detailReturnHash
    : '#/workbench';
};

function renderTopbar() {
  const me = curUser();
  document.getElementById('topbar').innerHTML =
    '<a class="brand" href="#/home">有求必应</a>' +
    '<div class="topbar-spacer"></div>' +
    (canAccessPoolManage(me) ? '<a href="#/pools" class="pool-manage-link" aria-label="进入池管理">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12.2 3h-.4a1.8 1.8 0 0 0-1.8 1.8v.1a1.8 1.8 0 0 1-.9 1.6l-.4.2a1.8 1.8 0 0 1-1.8 0l-.1-.1a1.8 1.8 0 0 0-2.5.7l-.2.3a1.8 1.8 0 0 0 .7 2.5l.1.1a1.8 1.8 0 0 1 .9 1.6v.4a1.8 1.8 0 0 1-.9 1.6l-.1.1a1.8 1.8 0 0 0-.7 2.5l.2.3a1.8 1.8 0 0 0 2.5.7l.1-.1a1.8 1.8 0 0 1 1.8 0l.4.2a1.8 1.8 0 0 1 .9 1.6v.1a1.8 1.8 0 0 0 1.8 1.8h.4a1.8 1.8 0 0 0 1.8-1.8v-.1a1.8 1.8 0 0 1 .9-1.6l.4-.2a1.8 1.8 0 0 1 1.8 0l.1.1a1.8 1.8 0 0 0 2.5-.7l.2-.3a1.8 1.8 0 0 0-.7-2.5l-.1-.1a1.8 1.8 0 0 1-.9-1.6v-.4a1.8 1.8 0 0 1 .9-1.6l.1-.1a1.8 1.8 0 0 0 .7-2.5l-.2-.3a1.8 1.8 0 0 0-2.5-.7l-.1.1a1.8 1.8 0 0 1-1.8 0l-.4-.2a1.8 1.8 0 0 1-.9-1.6v-.1A1.8 1.8 0 0 0 12.2 3z"/><circle cx="12" cy="12" r="3"/></svg>池管理</a>' : '') +
    '<div class="idbox">当前身份' +
      '<select onchange="changeIdentity(this.value)">' +
        IDENTITY_CHOICES.map((c) => '<option value="' + c.id + '"' + (c.id === me.id ? ' selected' : '') + '>' +
          esc(c.label) + '</option>').join('') +
      '</select>' +
      '<button class="reset-btn" onclick="resetAll()">重置 Mock 数据</button>' +
    '</div>';
}

function syncTopbarHeight() {
  const topbar = document.getElementById('topbar');
  if (topbar) document.documentElement.style.setProperty('--topbar-height', topbar.offsetHeight + 'px');
}

function bottomNavIcon(name) {
  const paths = {
    home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9h13v-9"/><path d="M9.5 19v-5h5v5"/>',
    work: '<rect x="4" y="6" width="16" height="13" rx="2"/><path d="M9 6V4h6v2M4 11h16M10 11v2h4v-2"/>',
    bell: '<path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 8h18c0-1-3-1-3-8"/><path d="M10 20h4"/>',
    user: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c.7-4 3-6 7-6s6.3 2 7 6"/>'
  };
  return '<svg viewBox="0 0 24 24" aria-hidden="true">' + paths[name] + '</svg>';
}

function renderBottomNav() {
  const hash = location.hash || '#/workbench';
  const unread = typeof unreadNotificationCount === 'function' ? unreadNotificationCount() : 0;
  const items = [
    { path: '#/workbench', label: '工作台', icon: 'work' },
    { path: '#/new', label: '填报', action: true },
    { path: '#/notifications', label: '消息', icon: 'bell', badge: unread }
  ];
  document.getElementById('bottomNav').innerHTML = '<div class="bottom-nav-inner">' + items.map((item) => {
    const on = hash.indexOf(item.path) === 0;
    if (item.action) {
      return '<a class="bottom-nav-item bottom-nav-create' + (on ? ' on' : '') + '" href="' + item.path + '" aria-label="发起填报">' +
        '<span class="create-circle">+</span><span>' + item.label + '</span></a>';
    }
    return '<a class="bottom-nav-item' + (on ? ' on' : '') + '" href="' + item.path + '">' +
      '<span class="bottom-nav-icon">' + bottomNavIcon(item.icon) + (item.badge ? '<i>' + (item.badge > 99 ? '99+' : item.badge) + '</i>' : '') + '</span>' +
      '<span>' + item.label + '</span></a>';
  }).join('') + '</div>';
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
  location.hash = '#/home';
  render();
};

function render() {
  const hash = location.hash || '#/home';
  if (hash.indexOf('#/infopool') === 0) {
    location.replace('#/home');
    return;
  }
  const isMessageDetail = hash.indexOf('#/message/') === 0;
  if (!isMessageDetail) detailReturnHash = hash;
  document.body.classList.toggle('detail-route', isMessageDetail);
  renderTopbar();
  syncTopbarHeight();
  const bottomNav = document.getElementById('bottomNav');
  bottomNav.hidden = isMessageDetail;
  if (isMessageDetail) bottomNav.innerHTML = '';
  else renderBottomNav();
  const app = document.getElementById('app');
  let html;
  if (hash.indexOf('#/message/') === 0) html = renderDetail(hash.slice('#/message/'.length));
  else if (hash.indexOf('#/customer/') === 0) html = renderCustomer(decodeURIComponent(hash.slice('#/customer/'.length)));
  else if (hash === '#/new') html = renderNew();
  else if (hash.indexOf('#/pools') === 0) html = renderPools();
  else if (hash === '#/notifications/replies') html = renderNotificationInteractions('reply');
  else if (hash === '#/notifications/likes') html = renderNotificationInteractions('like');
  else if (hash === '#/notifications') html = renderNotifications();
  else if (hash === '#/mine') html = renderMyInteractions();
  else if (hash === '#/workbench') html = renderWorkbench();
  else html = renderInfoPool();
  app.innerHTML = html;
  if (hash === '#/new') afterRenderNew();
  if (hash.indexOf('#/pools') === 0 && window.afterRenderPools) afterRenderPools();
}

window.addEventListener('hashchange', render);
window.addEventListener('resize', syncTopbarHeight);

loadState();
if (!location.hash) location.hash = '#/home';
render();
