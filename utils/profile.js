// 客户360画像 mock 生成器：以客户名为种子生成确定性的演示数据
// 正式上线时替换为客户主数据/CRM/柜台系统接口
function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

function rng(seed) {
  let s = seed || 1;
  return () => {
    s = (s * 1103515245 + 12345) >>> 0;
    return s / 4294967296;
  };
}

const DEPTS = ['IB业务服务部', '国际业务部', '产业服务部', '机构业务部', '财富管理部'];
const TAG_POOL = ['产业', '产业', 'V2', '已落地', '国企', '行情路演', '套期保值', '交易策略', '交割库申请', '高频交易'];
const POSITIONS = ['螺纹钢', '铁矿石', '尿素', '豆粕', '棕榈油', 'PTA', '甲醇', '沪铜', '黄金', '原油'];
const DEMAND_TYPES = ['资料提供', '线上路演', '交易策略', '实地调研', '产业培训'];
const DEMAND_DESCS = [
  '根据客户需求提供综合套保方案',
  '提供品种研报与行情解读',
  '线上路演讲解场外期权应用场景',
  '制定交割库、交割品牌申请操作流程',
  '季度投资策略交流会',
  '基差贸易模式介绍与对接'
];
const STAFF = ['罗德东', '董丹璐', '杨鈊汉', '张伟', '李娜', '王强'];
const TARGETS = ['赵总(副总经理)', '钱部长(采购部)', '孙经理(期现部)', '周处长(风控部)'];

function pick(r, arr) {
  return arr[Math.floor(r() * arr.length)];
}

function num(r, min, max) {
  return (min + r() * (max - min)).toFixed(2);
}

function getProfile(name) {
  const r = rng(hash(name));
  const account = '8' + String(1000000 + Math.floor(r() * 9000000));

  const tags = [];
  const tagCount = 3 + Math.floor(r() * 3);
  while (tags.length < tagCount) {
    const t = pick(r, TAG_POOL);
    if (tags.indexOf(t) === -1) tags.push(t);
  }

  const positions = [];
  const posCount = 2 + Math.floor(r() * 2);
  while (positions.length < posCount) {
    const p = pick(r, POSITIONS);
    if (positions.indexOf(p) === -1) positions.push(p);
  }

  const serviceRecords = DEPTS.slice(0, 2 + Math.floor(r() * 3)).map((d) => ({
    dept: d,
    online: 1 + Math.floor(r() * 8),
    offline: Math.floor(r() * 5)
  }));

  const demands = [];
  const demandCount = 2 + Math.floor(r() * 2);
  for (let i = 0; i < demandCount; i++) {
    const month = 1 + Math.floor(r() * 8);
    const day = 1 + Math.floor(r() * 28);
    const staff = [];
    const staffCount = 2 + Math.floor(r() * 2);
    while (staff.length < staffCount) {
      const s = pick(r, STAFF);
      if (staff.indexOf(s) === -1) staff.push(s);
    }
    demands.push({
      date: '2026-' + (month < 10 ? '0' : '') + month + '-' + (day < 10 ? '0' : '') + day,
      owner: pick(r, STAFF) + '-' + pick(r, DEPTS),
      type: pick(r, DEMAND_TYPES),
      staff: staff.join(','),
      target: pick(r, TARGETS),
      desc: pick(r, DEMAND_DESCS)
    });
  }
  demands.sort((a, b) => (a.date < b.date ? 1 : -1));

  return {
    name,
    account,
    tags,
    base: {
      dept: pick(r, DEPTS),
      openDate: '202' + (3 + Math.floor(r() * 4)) + '-0' + (1 + Math.floor(r() * 9)) + '-1' + Math.floor(r() * 9),
      status: '正常',
      phone: '13' + Math.floor(r() * 9) + '****' + String(1000 + Math.floor(r() * 9000))
    },
    trading: {
      equity: num(r, 500, 500000),
      realtimeInOut: '0.00',
      riskRatio: num(r, 20, 90) + '%',
      monthIncome: num(r, 1, 200),
      yearIncome: num(r, 50, 2000),
      pnl: (r() > 0.4 ? '' : '-') + num(r, 10, 5000)
    },
    price: {
      feeTemplate: '交易所1.0' + (1 + Math.floor(r() * 3)) + '倍',
      marginTemplate: '同交易所标准（+' + Math.floor(r() * 3) + '%）',
      interest: '无结息',
      yearPurchase: num(r, 50, 2000),
      totalPurchase: num(r, 500, 8000)
    },
    positions,
    serviceRecords,
    demands
  };
}

module.exports = { getProfile };
