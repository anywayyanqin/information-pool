const KEY = 'reports';
const SEQ_KEY = 'reports_seq';

function all() {
  return wx.getStorageSync(KEY) || [];
}

function saveAll(list) {
  wx.setStorageSync(KEY, list);
}

function get(id) {
  return all().find((r) => r.id === id) || null;
}

function nextSeq() {
  const n = (wx.getStorageSync(SEQ_KEY) || 0) + 1;
  wx.setStorageSync(SEQ_KEY, n);
  return n;
}

function upsert(rec) {
  const list = all();
  const idx = list.findIndex((r) => r.id === rec.id);
  if (idx > -1) {
    list[idx] = rec;
  } else {
    list.unshift(rec);
  }
  saveAll(list);
  return rec;
}

function remove(id) {
  saveAll(all().filter((r) => r.id !== id));
}

function synthTimeline(rec) {
  const tl = [{
    type: 'submit',
    by: (rec.reporter && rec.reporter.name) || '张三',
    at: rec.createdAt || rec.updatedAt || Date.now(),
    pool: (rec.pools && rec.pools[0]) || 'main'
  }];
  if (rec.pools && rec.pools.length && rec.pools.indexOf('main') === -1) {
    tl.push({ type: 'route', by: '倩影总', at: rec.updatedAt || Date.now(), pools: rec.pools.slice() });
  }
  Object.keys(rec.replies || {}).forEach((k) => {
    const v = rec.replies[k];
    tl.push({ type: 'reply', by: v.by || k, pool: k, content: v.content, at: v.at });
  });
  if (rec.closed) {
    tl.push({ type: 'close', by: rec.closedBy || '倩影总', at: rec.closedAt || rec.updatedAt || Date.now() });
  }
  return tl.sort((a, b) => a.at - b.at);
}

function migrate(rec) {
  if (!rec.pools) rec.pools = ['main'];
  if (!rec.replies) rec.replies = {};
  if (rec.closed === undefined) rec.closed = false;
  if (!rec.timeline) rec.timeline = synthTimeline(rec);
  return rec;
}

function migrateAll() {
  const list = all();
  list.slice()
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
    .forEach((r) => { if (!r.seq) r.seq = nextSeq(); });
  saveAll(list.map(migrate));
  return all();
}

function fmtTime(ts) {
  const d = new Date(ts);
  const p = (n) => (n < 10 ? '0' + n : '' + n);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function fmtSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + 'KB';
  return (bytes / 1024 / 1024).toFixed(1) + 'MB';
}

module.exports = { all, get, upsert, remove, saveAll, nextSeq, migrateAll, fmtTime, fmtSize };
