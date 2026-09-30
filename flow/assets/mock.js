/* ==========================================================================
 * mock.js — Mock 用户 / 组织架构 / 池树 / 客户主数据 / 种子数据
 * 扩展点：正式环境中，用户与组织架构来自企业微信通讯录 API，
 *         池树来自后端池管理服务，客户主数据来自工商信息/客户主数据接口。
 * ========================================================================== */

/* ---------- 角色 ---------- */
const ROLES = {
  staff: '员工',
  dispatcher: '总池分发人',
  poolAdmin: '业务池负责人',
  deptAdmin: '部门负责人',
  secretary: '秘书',
  admin: '系统管理员'
};

/* ---------- Mock 用户 ----------
 * 扩展点：USERS 由企业微信通讯录接口返回 */
const USERS = [
  { id: 'u_zs',  name: '张三',     wecom: 'zhangsan', dept: '信息技术部',     role: 'staff',      title: '普通员工' },
  { id: 'u_qy',  name: '李倩影',   wecom: 'qianying', dept: '总裁办',         role: 'dispatcher', title: '总池分发人' },
  /* 8 个业务池负责人（中后台与其他由总池分发人李倩影兼管） */
  { id: 'u_zjj', name: '张晶晶',   wecom: 'zhangjj',  dept: '零售条线',       role: 'poolAdmin',  title: '零售池负责人' },
  { id: 'u_wyx', name: '闻勇翔',   wecom: 'wenyx',    dept: '产业条线',       role: 'poolAdmin',  title: '产业池负责人' },
  { id: 'u_swm', name: '邵嵬敏',   wecom: 'shaowm',   dept: '产业条线',       role: 'poolAdmin',  title: '产业·财富池负责人' },
  { id: 'u_wjx', name: '王冀湘',   wecom: 'wangjx',   dept: '机构条线',       role: 'poolAdmin',  title: '机构·买方池负责人' },
  { id: 'u_fdk', name: '房迪恺',   wecom: 'fangdk',   dept: '买方条线',       role: 'poolAdmin',  title: '买方池负责人' },
  { id: 'u_nty', name: '倪韬雍',   wecom: 'nity',     dept: '国际条线',       role: 'poolAdmin',  title: '国际池负责人' },
  /* 条线资深员工（原业务池负责人，现归入条线经办） */
  { id: 'u_qx',  name: '齐旭',     wecom: 'qixu',     dept: '买方条线',       role: 'staff',      title: '买方条线资深经理' },
  { id: 'u_zyy', name: '张烨烨',   wecom: 'zhangyy',  dept: '财富条线',       role: 'staff',      title: '财富条线资深经理' },
  { id: 'u_dyw', name: '丁彦文',   wecom: 'dingyw',   dept: '中后台条线',     role: 'staff',      title: '中后台条线资深经理' },
  { id: 'u_lj',  name: '刘军',     wecom: 'liujun',   dept: '综合条线',       role: 'staff',      title: '综合条线资深经理' },
  /* 部门负责人 */
  { id: 'u_cc',  name: '陈晨',     wecom: 'chenchen', dept: '零售客户服务部', role: 'deptAdmin',  title: '零售客户服务部经理' },
  { id: 'u_zm',  name: '周明',     wecom: 'zhouming', dept: '产业服务部',     role: 'deptAdmin',  title: '产业服务部经理' },
  { id: 'u_wd',  name: '吴迪',     wecom: 'wudi',     dept: '机构业务一部',   role: 'deptAdmin',  title: '机构业务一部经理' },
  { id: 'u_s7',  name: '孙七',     wecom: 'sunqi',    dept: '量化私募部',     role: 'deptAdmin',  title: '量化私募部经理' },
  { id: 'u_ly',  name: '李研',     wecom: 'liyan',    dept: '财富管理部',     role: 'deptAdmin',  title: '财富管理部经理' },
  { id: 'u_cl',  name: '陈立',     wecom: 'chenli',   dept: '国际业务部',     role: 'deptAdmin',  title: '国际业务部经理' },
  { id: 'u_mxf', name: '牟小凡',   wecom: 'mouxf',    dept: '综合事务部',     role: 'deptAdmin',  title: '综合事务部经理' },
  /* 秘书（节点分发时与负责人同时收到） */
  { id: 'u_gy',  name: '高燕',     wecom: 'gaoyan',   dept: '零售条线',       role: 'secretary',  title: '零售池秘书' },
  { id: 'u_xl',  name: '徐蕾',     wecom: 'xulei',    dept: '产业服务部',     role: 'secretary',  title: '产业服务部秘书' },
  { id: 'u_hj',  name: '何静',     wecom: 'hejing',   dept: '机构业务一部',   role: 'secretary',  title: '机构业务一部秘书' },
  { id: 'u_gw',  name: '顾文',     wecom: 'guwen',    dept: '中后台条线',     role: 'secretary',  title: '中后台池秘书' },
  { id: 'u_yf',  name: '于芳',     wecom: 'yufang',   dept: '零售客户服务部', role: 'secretary',  title: '零售客户服务部秘书' },
  /* 小组负责人与经办员工 */
  { id: 'u_ls',  name: '李四',     wecom: 'lisi',     dept: '华东零售组',     role: 'staff',      title: '华东零售组组长' },
  { id: 'u_z6',  name: '赵六',     wecom: 'zhaoliu',  dept: '华北零售组',     role: 'staff',      title: '华北零售组组长' },
  { id: 'u_hw',  name: '黄维',     wecom: 'huangwei', dept: '黑色产业组',     role: 'staff',      title: '黑色产业组组长' },
  { id: 'u_z8',  name: '周八',     wecom: 'zhouba',   dept: '化工产业组',     role: 'staff',      title: '化工产业组组长' },
  { id: 'u_xu',  name: '许岚',     wecom: 'xulan',    dept: '银行保险组',     role: 'staff',      title: '银行保险组组长' },
  { id: 'u_ty',  name: '谭雨',     wecom: 'tanyu',    dept: '量化私募部',     role: 'staff',      title: '私募服务岗' },
  { id: 'u_fc',  name: '冯超',     wecom: 'fengchao', dept: '财富管理部',     role: 'staff',      title: '高净值服务岗' },
  { id: 'u_hx',  name: '韩雪',     wecom: 'hanxue',   dept: '国际业务部',     role: 'staff',      title: '跨境服务岗' },
  { id: 'u_ch',  name: '曹航',     wecom: 'caohang',  dept: '信息技术部',     role: 'staff',      title: '运维岗' },
  { id: 'u_adm', name: '系统管理员', wecom: 'sysadmin', dept: '信息技术部',   role: 'admin',      title: '管理员' }
];

/* ---------- Mock 组织架构 ----------
 * 扩展点：ORGS 由企业微信组织架构接口返回 */
const ORGS = [
  { id: 'd_root',  name: '公司总部',       parentId: null },
  { id: 'd_zcb',   name: '总裁办',         parentId: 'd_root' },
  { id: 'd_retail', name: '零售客户服务部', parentId: 'd_root' },
  { id: 'd_ind',   name: '产业服务部',     parentId: 'd_root' },
  { id: 'd_inst',  name: '机构业务一部',   parentId: 'd_root' },
  { id: 'd_buy',   name: '量化私募部',     parentId: 'd_root' },
  { id: 'd_wealth', name: '财富管理部',    parentId: 'd_root' },
  { id: 'd_intl',  name: '国际业务部',     parentId: 'd_root' },
  { id: 'd_it',    name: '信息技术部',     parentId: 'd_root' },
  { id: 'd_general', name: '综合事务部',   parentId: 'd_root' }
];

/* ---------- 池类型 / 状态文案 ---------- */
const POOL_TYPES = { biz: '业务池', dept: '部门池', group: '小组池' };

/* 总消息状态机：待分发 → 处理中 → 待汇总 → 已解决 */
const MSG_STATUS = {
  dispatch: '待分发',
  handling: '处理中',
  summarize: '待汇总',
  closed: '已解决',
  cancelled: '已取消'
};

/* 分发目标处理状态 */
const LINK_STATUS = {
  pending: '待处理', processing: '处理中', replied: '已回复',
  resolved: '已办结', rejected: '被驳回', forwarded: '已流转'
};

/* 面向当前身份的主流程状态：待分发 / 待办 / 已办 / 已解决 */
const FLOW_STATUS = { dispatch: '待分发', todo: '待办', done: '已办', ended: '已解决' };

/* 提议类型选项 */
const SOURCE_OPTIONS = ['客需', '行业信息', '投诉与建议', '其他'];

/* ---------- Mock 客户主数据 ----------
 * 扩展点：正式环境替换为客户工商信息 / 客户主数据接口 */
const CUSTOMERS = [
  '宏远钢铁贸易有限公司', '中瑞农业发展集团有限公司', '金泰有色金属有限公司', '东海石化能源有限公司',
  '天合油脂有限公司', '恒利纺织原料有限公司', '盛世私募基金管理有限公司', '明德资产管理有限公司',
  '广源物流仓储有限公司', '瑞丰农产品贸易有限公司', '星辰量化投资管理有限公司', '泰山矿业集团有限公司'
];

/* ---------- 客户360 mock（与 preview.html / 小程序端同一套逻辑） ---------- */
function pHash(str) { let h = 0; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0; return h; }
function pRng(seed) { let s = seed || 1; return () => { s = (s * 1103515245 + 12345) >>> 0; return s / 4294967296; }; }
const P_DEPTS = ['IB业务服务部', '国际业务部', '产业服务部', '机构业务部', '财富管理部'];
const P_TAGS = ['产业', '产业', 'V2', '已落地', '国企', '行情路演', '套期保值', '交易策略', '交割库申请', '高频交易'];
const P_POSITIONS = ['螺纹钢', '铁矿石', '尿素', '豆粕', '棕榈油', 'PTA', '甲醇', '沪铜', '黄金', '原油'];
const P_DEMAND_TYPES = ['资料提供', '线上路演', '交易策略', '实地调研', '产业培训'];
const P_DEMAND_DESCS = ['根据客户需求提供综合套保方案', '提供品种研报与行情解读', '线上路演讲解场外期权应用场景', '制定交割库、交割品牌申请操作流程', '季度投资策略交流会', '基差贸易模式介绍与对接'];
const P_STAFF = ['罗德东', '董丹璐', '杨鈊汉', '张伟', '李娜', '王强'];
const P_TARGETS = ['赵总(副总经理)', '钱部长(采购部)', '孙经理(期现部)', '周处长(风控部)'];
const pPick = (r, arr) => arr[Math.floor(r() * arr.length)];
const pNum = (r, min, max) => (min + r() * (max - min)).toFixed(2);

function getProfile(name) {
  const r = pRng(pHash(name));
  const account = '8' + String(1000000 + Math.floor(r() * 9000000));
  const tags = [];
  const tagCount = 3 + Math.floor(r() * 3);
  while (tags.length < tagCount) { const t = pPick(r, P_TAGS); if (!tags.includes(t)) tags.push(t); }
  const positions = [];
  const posCount = 2 + Math.floor(r() * 2);
  while (positions.length < posCount) { const p = pPick(r, P_POSITIONS); if (!positions.includes(p)) positions.push(p); }
  const serviceRecords = P_DEPTS.slice(0, 2 + Math.floor(r() * 3)).map((d) => ({ dept: d, online: 1 + Math.floor(r() * 8), offline: Math.floor(r() * 5) }));
  const demands = [];
  const demandCount = 2 + Math.floor(r() * 2);
  for (let i = 0; i < demandCount; i++) {
    const month = 1 + Math.floor(r() * 8);
    const day = 1 + Math.floor(r() * 28);
    const staff = [];
    const staffCount = 2 + Math.floor(r() * 2);
    while (staff.length < staffCount) { const s = pPick(r, P_STAFF); if (!staff.includes(s)) staff.push(s); }
    demands.push({
      date: '2026-' + (month < 10 ? '0' : '') + month + '-' + (day < 10 ? '0' : '') + day,
      owner: pPick(r, P_STAFF) + '-' + pPick(r, P_DEPTS),
      type: pPick(r, P_DEMAND_TYPES),
      staff: staff.join(','),
      target: pPick(r, P_TARGETS),
      desc: pPick(r, P_DEMAND_DESCS)
    });
  }
  demands.sort((a, b) => (a.date < b.date ? 1 : -1));
  return {
    name, account, tags,
    base: {
      dept: pPick(r, P_DEPTS),
      openDate: '202' + (3 + Math.floor(r() * 4)) + '-0' + (1 + Math.floor(r() * 9)) + '-1' + Math.floor(r() * 9),
      status: '正常',
      phone: '13' + Math.floor(r() * 9) + '****' + String(1000 + Math.floor(r() * 9000))
    },
    trading: {
      equity: pNum(r, 500, 500000), realtimeInOut: '0.00', riskRatio: pNum(r, 20, 90) + '%',
      monthIncome: pNum(r, 1, 200), yearIncome: pNum(r, 50, 2000), pnl: (r() > 0.4 ? '' : '-') + pNum(r, 10, 5000)
    },
    price: {
      feeTemplate: '交易所1.0' + (1 + Math.floor(r() * 3)) + '倍',
      marginTemplate: '同交易所标准（+' + Math.floor(r() * 3) + '%）',
      interest: '无结息',
      yearPurchase: pNum(r, 50, 2000), totalPurchase: pNum(r, 500, 8000)
    },
    positions, serviceRecords, demands
  };
}

/* ---------- 池树：8 个业务池（填报入口）→ 部门 → 小组 ----------
 * 每个节点带负责人（ownerIds）与秘书（secretaryIds，如有），小组挂经办人员。
 * 池本身不设分发人；填报选池即直投该池负责人+秘书，总池分发人李倩影同步跟进并可继续分发。 */
function seedPools() {
  return [
    { id: 'p_retail', name: '零售', type: 'biz', level: 0, parentId: null,
      ownerIds: ['u_zjj'], secretaryIds: ['u_gy'], memberIds: ['u_zjj', 'u_gy', 'u_cc', 'u_yf', 'u_ls', 'u_z6'],
      timeoutDays: 2, allowDirect: false, autoAssign: false, status: 'ACTIVE' },
    { id: 'p_retail_cs', name: '零售客户服务部', type: 'dept', level: 1, parentId: 'p_retail',
      ownerIds: ['u_cc'], secretaryIds: ['u_yf'], memberIds: ['u_cc', 'u_yf', 'u_ls', 'u_z6'],
      timeoutDays: 2, allowDirect: false, autoAssign: false, status: 'ACTIVE' },
    { id: 'p_retail_east', name: '华东零售组', type: 'group', level: 2, parentId: 'p_retail_cs',
      ownerIds: ['u_ls'], secretaryIds: [], memberIds: ['u_ls', 'u_ty'],
      timeoutDays: 2, allowDirect: false, autoAssign: false, status: 'ACTIVE' },
    { id: 'p_retail_north', name: '华北零售组', type: 'group', level: 2, parentId: 'p_retail_cs',
      ownerIds: ['u_z6'], secretaryIds: [], memberIds: ['u_z6'],
      timeoutDays: 2, allowDirect: false, autoAssign: false, status: 'ACTIVE' },

    { id: 'p_industry', name: '产业', type: 'biz', level: 0, parentId: null,
      ownerIds: ['u_wyx', 'u_swm'], secretaryIds: [], memberIds: ['u_wyx', 'u_swm', 'u_zm', 'u_xl', 'u_hw', 'u_z8'],
      timeoutDays: 2, allowDirect: false, autoAssign: false, status: 'ACTIVE' },
    { id: 'p_ind_serve', name: '产业服务部', type: 'dept', level: 1, parentId: 'p_industry',
      ownerIds: ['u_zm'], secretaryIds: ['u_xl'], memberIds: ['u_zm', 'u_xl', 'u_hw', 'u_z8'],
      timeoutDays: 2, allowDirect: false, autoAssign: false, status: 'ACTIVE' },
    { id: 'p_ind_black', name: '黑色产业组', type: 'group', level: 2, parentId: 'p_ind_serve',
      ownerIds: ['u_hw'], secretaryIds: [], memberIds: ['u_hw'],
      timeoutDays: 2, allowDirect: false, autoAssign: false, status: 'ACTIVE' },
    { id: 'p_ind_chem', name: '化工产业组', type: 'group', level: 2, parentId: 'p_ind_serve',
      ownerIds: ['u_z8'], secretaryIds: [], memberIds: ['u_z8'],
      timeoutDays: 2, allowDirect: false, autoAssign: false, status: 'ACTIVE' },

    { id: 'p_inst', name: '机构', type: 'biz', level: 0, parentId: null,
      ownerIds: ['u_wjx'], secretaryIds: [], memberIds: ['u_wjx', 'u_wd', 'u_hj', 'u_xu'],
      timeoutDays: 2, allowDirect: false, autoAssign: false, status: 'ACTIVE' },
    { id: 'p_inst_1', name: '机构业务一部', type: 'dept', level: 1, parentId: 'p_inst',
      ownerIds: ['u_wd'], secretaryIds: ['u_hj'], memberIds: ['u_wd', 'u_hj', 'u_xu'],
      timeoutDays: 2, allowDirect: false, autoAssign: false, status: 'ACTIVE' },
    { id: 'p_inst_bank', name: '银行保险组', type: 'group', level: 2, parentId: 'p_inst_1',
      ownerIds: ['u_xu'], secretaryIds: [], memberIds: ['u_xu'],
      timeoutDays: 2, allowDirect: false, autoAssign: false, status: 'ACTIVE' },

    { id: 'p_buy', name: '买方', type: 'biz', level: 0, parentId: null,
      ownerIds: ['u_wjx', 'u_fdk'], secretaryIds: [], memberIds: ['u_wjx', 'u_fdk', 'u_qx', 'u_s7', 'u_ty'],
      timeoutDays: 2, allowDirect: false, autoAssign: false, status: 'ACTIVE' },
    { id: 'p_buy_quant', name: '量化私募部', type: 'dept', level: 1, parentId: 'p_buy',
      ownerIds: ['u_s7'], secretaryIds: [], memberIds: ['u_s7', 'u_ty'],
      timeoutDays: 2, allowDirect: false, autoAssign: false, status: 'ACTIVE' },
    { id: 'p_buy_pe', name: '私募服务组', type: 'group', level: 2, parentId: 'p_buy_quant',
      ownerIds: ['u_ty'], secretaryIds: [], memberIds: ['u_ty'],
      timeoutDays: 2, allowDirect: false, autoAssign: false, status: 'ACTIVE' },

    { id: 'p_wealth', name: '财富', type: 'biz', level: 0, parentId: null,
      ownerIds: ['u_swm'], secretaryIds: [], memberIds: ['u_swm', 'u_zyy', 'u_ly', 'u_fc'],
      timeoutDays: 2, allowDirect: false, autoAssign: false, status: 'ACTIVE' },
    { id: 'p_wealth_dept', name: '财富管理部', type: 'dept', level: 1, parentId: 'p_wealth',
      ownerIds: ['u_ly'], secretaryIds: [], memberIds: ['u_ly', 'u_fc'],
      timeoutDays: 2, allowDirect: false, autoAssign: false, status: 'ACTIVE' },
    { id: 'p_wealth_hn', name: '高净值组', type: 'group', level: 2, parentId: 'p_wealth_dept',
      ownerIds: ['u_fc'], secretaryIds: [], memberIds: ['u_fc'],
      timeoutDays: 2, allowDirect: false, autoAssign: false, status: 'ACTIVE' },

    { id: 'p_intl', name: '国际', type: 'biz', level: 0, parentId: null,
      ownerIds: ['u_nty'], secretaryIds: [], memberIds: ['u_nty', 'u_cl', 'u_hx'],
      timeoutDays: 2, allowDirect: false, autoAssign: false, status: 'ACTIVE' },
    { id: 'p_intl_dept', name: '国际业务部', type: 'dept', level: 1, parentId: 'p_intl',
      ownerIds: ['u_cl'], secretaryIds: [], memberIds: ['u_cl', 'u_hx'],
      timeoutDays: 2, allowDirect: false, autoAssign: false, status: 'ACTIVE' },
    { id: 'p_intl_sg', name: '新加坡组', type: 'group', level: 2, parentId: 'p_intl_dept',
      ownerIds: ['u_hx'], secretaryIds: [], memberIds: ['u_hx'],
      timeoutDays: 2, allowDirect: false, autoAssign: false, status: 'ACTIVE' },

    { id: 'p_midback', name: '中后台', type: 'biz', level: 0, parentId: null,
      ownerIds: ['u_qy'], secretaryIds: ['u_gw'], memberIds: ['u_qy', 'u_dyw', 'u_gw', 'u_zs', 'u_ch', 'u_adm'],
      timeoutDays: 2, allowDirect: false, autoAssign: false, status: 'ACTIVE' },
    { id: 'p_mid_it', name: '信息技术部', type: 'dept', level: 1, parentId: 'p_midback',
      ownerIds: ['u_adm'], secretaryIds: [], memberIds: ['u_adm', 'u_zs', 'u_ch'],
      timeoutDays: 2, allowDirect: false, autoAssign: false, status: 'ACTIVE' },
    { id: 'p_mid_ops', name: '运维保障组', type: 'group', level: 2, parentId: 'p_mid_it',
      ownerIds: ['u_ch'], secretaryIds: [], memberIds: ['u_ch', 'u_zs'],
      timeoutDays: 2, allowDirect: false, autoAssign: false, status: 'ACTIVE' },

    { id: 'p_other', name: '其他', type: 'biz', level: 0, parentId: null,
      ownerIds: ['u_qy'], secretaryIds: [], memberIds: ['u_qy', 'u_lj', 'u_mxf'],
      timeoutDays: 2, allowDirect: false, autoAssign: false, status: 'ACTIVE' },
    { id: 'p_other_general', name: '综合事务部', type: 'dept', level: 1, parentId: 'p_other',
      ownerIds: ['u_mxf'], secretaryIds: [], memberIds: ['u_mxf'],
      timeoutDays: 2, allowDirect: false, autoAssign: false, status: 'ACTIVE' }
  ];
}

/* ---------- 种子数据：覆盖各状态与流转层级的演示消息 ---------- */
function buildSeed() {
  const H = 3600e3;
  const T = (h) => Date.now() - Math.round(h * H);
  const pools = seedPools();

  const messages = [
    {
      id: 'm1', seq: 1, no: 'M-0001', title: '宏远钢铁贸易有限公司',
      content: '宏远钢铁咨询场外期权报价流程与所需材料，希望尽快对接。',
      sources: ['客需'], customerName: '宏远钢铁贸易有限公司', sourceOther: '',
      attachments: [], createdBy: 'u_zs', sourcePoolId: 'p_retail',
      likeCount: 1, likedByUserIds: ['u_ls'], status: 'closed',
      createdAt: T(50), updatedAt: T(44), closedAt: T(44)
    },
    {
      id: 'm2', seq: 2, no: 'M-0002', title: '金泰有色金属有限公司',
      content: '销售日报中工业品库存数据与上期口径不一致，请核对并给出统一口径。',
      sources: ['客需'], customerName: '金泰有色金属有限公司', sourceOther: '',
      attachments: [{ name: '销售日报-库存对比.xlsx', size: 48200 }],
      createdBy: 'u_zs', sourcePoolId: 'p_industry',
      status: 'summarize',
      createdAt: T(30), updatedAt: T(25)
    },
    {
      id: 'm3', seq: 3, no: 'M-0003', title: '客户投诉：场外期权结算单出具延迟',
      content: '客户反馈结算单超过约定时间仍未出具，涉及合规与运营多条线，请协调处理。',
      sources: ['投诉与建议'], customerName: '', sourceOther: '',
      attachments: [], createdBy: 'u_zs', sourcePoolId: 'p_midback',
      status: 'dispatch',
      createdAt: T(3), updatedAt: T(3)
    },
    {
      id: 'm4', seq: 4, no: 'M-0004', title: '多家同业反馈策略报告延迟发布',
      content: '多家同业反馈策略报告延迟发布，请确认更新排期并尽快处理。',
      sources: ['行业信息'], customerName: '', sourceOther: '',
      attachments: [], createdBy: 'u_ly', sourcePoolId: 'p_retail',
      status: 'dispatch', overdue: true, overdueDays: 1,
      createdAt: T(58), updatedAt: T(58)
    },
    {
      id: 'm5', seq: 5, no: 'M-0005', title: '交易系统早盘登录异常',
      content: '今日早盘多名客户反映 APP 登录验证码延迟，疑似短信通道抖动。',
      sources: ['行业信息'], customerName: '', sourceOther: '',
      attachments: [{ name: '登录异常截图.png', size: 91300 }],
      createdBy: 'u_ly', sourcePoolId: 'p_intl',
      status: 'handling',
      createdAt: T(8), updatedAt: T(7)
    },
    {
      id: 'm6', seq: 6, no: 'M-0006', title: '二季度宏观解读路演安排',
      content: '机构客户希望安排二季度宏观解读路演，需要产业服务部出解读材料、机构业务一部对接客户。',
      sources: ['投诉与建议'], customerName: '', sourceOther: '',
      attachments: [], createdBy: 'u_zs', sourcePoolId: 'p_inst',
      status: 'handling',
      createdAt: T(52), updatedAt: T(49)
    },
    {
      id: 'm7', seq: 7, no: 'M-0007', title: '华东区域重点客户结算核对',
      content: '客户反馈结算单超过约定时间仍未出具，请尽快联系客户核对账单。',
      sources: ['客需'], customerName: '上海东方能源发展有限公司', sourceOther: '',
      attachments: [], createdBy: 'u_zs', sourcePoolId: 'p_buy',
      status: 'closed',
      createdAt: T(70), updatedAt: T(60), closedAt: T(60)
    },
    {
      id: 'm8', seq: 8, no: 'M-0008', title: '重点机构准入补充资料说明',
      content: '机构客户关于最新准入政策需要补齐资信材料，请经办人尽快跟进。',
      sources: ['行业信息'], customerName: '', sourceOther: '',
      attachments: [], createdBy: 'u_zs', sourcePoolId: 'p_wealth',
      status: 'dispatch',
      createdAt: T(20), updatedAt: T(20)
    },
    {
      id: 'm9', seq: 9, no: 'M-0009', title: '高净值客户资产配置咨询',
      content: '客户询问资产配置与套保组合方案，需财富管理部出具建议并反馈沟通结论。',
      sources: ['客需'], customerName: '华夏联合资产管理公司', sourceOther: '',
      attachments: [], createdBy: 'u_zs', sourcePoolId: 'p_other',
      status: 'handling',
      createdAt: T(4), updatedAt: T(2)
    }
  ];

  /* 分发链路：mode='node' 收件人为该节点负责人+秘书；mode='person' 收件人为指定落实人、抄送其所属业务池负责人 */
  const links = [
    /* m1：零售 → 华东零售组（整节点，组长李四）→ 已办结，并已汇总 */
    { id: 'lk1', messageId: 'm1', poolId: 'p_retail_east', poolType: 'group', mode: 'node',
      parentLinkId: null, parentPoolId: 'p_retail', recipientIds: ['u_ls'], ccIds: [],
      status: 'resolved', isFinal: true,
      dispatchedBy: 'u_qy', dispatchedAt: T(49), resolvedAt: T(45), note: '请华东零售组对接客户' },

    /* m2：产业 → 产业服务部（负责人周明 + 秘书徐蕾）→ 黑色产业组（黄维）已办结，等待汇总 */
    { id: 'lk2', messageId: 'm2', poolId: 'p_ind_serve', poolType: 'dept', mode: 'node',
      parentLinkId: null, parentPoolId: 'p_industry', recipientIds: ['u_zm', 'u_xl'], ccIds: [],
      status: 'forwarded', isFinal: false,
      dispatchedBy: 'u_qy', dispatchedAt: T(29), note: '请产业服务部核对数据口径' },
    { id: 'lk3', messageId: 'm2', poolId: 'p_ind_black', poolType: 'group', mode: 'person',
      parentLinkId: 'lk2', parentPoolId: 'p_ind_serve', recipientIds: ['u_hw'], ccIds: ['u_wyx', 'u_swm'],
      status: 'resolved', isFinal: true,
      dispatchedBy: 'u_zm', dispatchedAt: T(27), resolvedAt: T(25), note: '落实到黑色产业组' },

    /* m5：国际 → 国际业务部（负责人陈立，无秘书）处理中 */
    { id: 'lk4', messageId: 'm5', poolId: 'p_intl_dept', poolType: 'dept', mode: 'node',
      parentLinkId: null, parentPoolId: 'p_intl', recipientIds: ['u_cl'], ccIds: [],
      status: 'processing', isFinal: true,
      dispatchedBy: 'u_qy', dispatchedAt: T(7), note: '请国际业务部排查跨境通道' },

    /* m6：机构 → 机构业务一部（负责人吴迪 + 秘书何静）已回复；→ 银行保险组 许岚 处理中 */
    { id: 'lk5', messageId: 'm6', poolId: 'p_inst_1', poolType: 'dept', mode: 'node',
      parentLinkId: null, parentPoolId: 'p_inst', recipientIds: ['u_wd', 'u_hj'], ccIds: [],
      status: 'replied', isFinal: true,
      dispatchedBy: 'u_qy', dispatchedAt: T(51), resolvedAt: null, note: '机构业务一部对接客户时间' },
    { id: 'lk6', messageId: 'm6', poolId: 'p_inst_bank', poolType: 'group', mode: 'person',
      parentLinkId: 'lk5', parentPoolId: 'p_inst_1', recipientIds: ['u_xu'], ccIds: ['u_wjx'],
      status: 'pending', isFinal: true,
      dispatchedBy: 'u_wd', dispatchedAt: T(50), note: '许岚落实路演排期' },

    /* m7：买方 → 量化私募部（负责人孙七）已办结并汇总 */
    { id: 'lk7', messageId: 'm7', poolId: 'p_buy_quant', poolType: 'dept', mode: 'node',
      parentLinkId: null, parentPoolId: 'p_buy', recipientIds: ['u_s7'], ccIds: [],
      status: 'resolved', isFinal: true,
      dispatchedBy: 'u_qy', dispatchedAt: T(69), resolvedAt: T(62), note: '请量化私募部核对结算账单' },

    /* m9：其他 → 综合事务部（负责人牟小凡）处理中 */
    { id: 'lk8', messageId: 'm9', poolId: 'p_other_general', poolType: 'dept', mode: 'node',
      parentLinkId: null, parentPoolId: 'p_other', recipientIds: ['u_mxf'], ccIds: [],
      status: 'processing', isFinal: true,
      dispatchedBy: 'u_qy', dispatchedAt: T(3), note: '综合事务部出具配置建议' }
  ];

  const replies = [
    { id: 'rp1', messageId: 'm1', poolId: 'p_retail_east', linkId: 'lk1', authorId: 'u_ls', parentReplyId: null, content: '已与客户确认场外期权报价所需材料，可安排报价。客户诉求已闭环。', attachments: [], at: T(47), updatedAt: T(44), lastEditorId: 'u_qy', likeCount: 1, likedByUserIds: ['u_zs'] },
    { id: 'rp2', messageId: 'm2', poolId: 'p_ind_black', linkId: 'lk3', authorId: 'u_hw', parentReplyId: null, content: '已核对，统一按交易所口径更新，详见附件。', attachments: [{ name: '口径说明.docx', size: 12400 }], at: T(26), likeCount: 2, likedByUserIds: ['u_zs', 'u_zm'] },
    { id: 'rp3', messageId: 'm5', poolId: 'p_intl_dept', linkId: 'lk4', authorId: 'u_cl', parentReplyId: null, content: '已定位到跨境短信通道抖动，正在与供应商确认。', attachments: [], at: T(6), likeCount: 0, likedByUserIds: [] },
    { id: 'rp4', messageId: 'm6', poolId: 'p_inst_1', linkId: 'lk5', authorId: 'u_wd', parentReplyId: null, content: '已安排客户经理对接路演时间。', attachments: [], at: T(50), likeCount: 0, likedByUserIds: [] },
    { id: 'rp5', messageId: 'm7', poolId: 'p_buy_quant', linkId: 'lk7', authorId: 'u_s7', parentReplyId: null, content: '账单差异为交割月调整，已与客户财务确认无误。', attachments: [], at: T(63), likeCount: 1, likedByUserIds: ['u_qy'] },
    { id: 'rp6', messageId: 'm9', poolId: 'p_other_general', linkId: 'lk8', authorId: 'u_mxf', parentReplyId: null, content: '资产配置建议初稿已成型，明日补充套保比例测算。', attachments: [], at: T(2), likeCount: 0, likedByUserIds: [] }
  ];

  const summaries = [];

  const logs = [
    { id: 'lg1',  messageId: 'm1', at: T(50), actorId: 'u_zs',  action: 'created',         note: '创建消息，投递到零售池' },
    { id: 'lg2',  messageId: 'm1', at: T(49), actorId: 'u_qy',  action: 'dispatched',      note: '分发到 华东零售组（负责人 李四），抄送 零售客户服务部（陈晨、于芳）' },
    { id: 'lg3',  messageId: 'm1', at: T(47), actorId: 'u_ls',  action: 'reply',           poolId: 'p_retail_east', note: '已与客户确认场外期权报价所需材料，可安排报价。' },
    { id: 'lg4',  messageId: 'm1', at: T(44), actorId: 'u_qy',  action: 'reply_edit',      poolId: 'p_retail_east', note: '已与客户确认场外期权报价所需材料，可安排报价。客户诉求已闭环。' },

    { id: 'lg7',  messageId: 'm2', at: T(30), actorId: 'u_zs',  action: 'created',         note: '创建消息，投递到产业池' },
    { id: 'lg8',  messageId: 'm2', at: T(29), actorId: 'u_qy',  action: 'dispatched',      note: '分发到 产业服务部（负责人 周明），抄送 产业池（闻勇翔、邵嵬敏）' },
    { id: 'lg9',  messageId: 'm2', at: T(27), actorId: 'u_zm',  action: 'forwarded',       poolId: 'p_ind_serve', note: '流转到 黑色产业组：落实到黄维，抄送 产业池负责人（闻勇翔、邵嵬敏）' },
    { id: 'lg10', messageId: 'm2', at: T(26), actorId: 'u_hw',  action: 'reply',           poolId: 'p_ind_black', note: '已核对，统一按交易所口径更新，详见附件。' },

    { id: 'lg12', messageId: 'm3', at: T(3),  actorId: 'u_zs',  action: 'created',         note: '创建消息，投递到中后台池' },
    { id: 'lg13', messageId: 'm4', at: T(58), actorId: 'u_ly',  action: 'created',         note: '创建消息，投递到零售池' },

    { id: 'lg14', messageId: 'm5', at: T(8),  actorId: 'u_ly',  action: 'created',         note: '创建消息，投递到国际池' },
    { id: 'lg15', messageId: 'm5', at: T(7),  actorId: 'u_qy',  action: 'dispatched',      note: '分发到 国际业务部（负责人 陈立），抄送 国际池（倪韬雍）' },
    { id: 'lg16', messageId: 'm5', at: T(6),  actorId: 'u_cl',  action: 'reply',           poolId: 'p_intl_dept', note: '已定位到跨境短信通道抖动，正在与供应商确认。' },

    { id: 'lg17', messageId: 'm6', at: T(52), actorId: 'u_zs',  action: 'created',         note: '创建消息，投递到机构池' },
    { id: 'lg18', messageId: 'm6', at: T(51), actorId: 'u_qy',  action: 'dispatched',      note: '分发到 机构业务一部（负责人 吴迪），抄送 机构池（王冀湘）' },
    { id: 'lg19', messageId: 'm6', at: T(50), actorId: 'u_wd',  action: 'forwarded',       poolId: 'p_inst_1', note: '流转到 银行保险组：落实到许岚，抄送 机构业务一部经理吴迪' },
    { id: 'lg20', messageId: 'm6', at: T(50), actorId: 'u_wd',  action: 'reply',           poolId: 'p_inst_1', note: '已安排客户经理对接路演时间。' },

    { id: 'lg21', messageId: 'm7', at: T(70), actorId: 'u_zs',  action: 'created',         note: '创建消息，投递到买方池' },
    { id: 'lg22', messageId: 'm7', at: T(69), actorId: 'u_qy',  action: 'dispatched',      note: '分发到 量化私募部（负责人 孙七），抄送 买方池（王冀湘、房迪恺）' },
    { id: 'lg23', messageId: 'm7', at: T(63), actorId: 'u_s7',  action: 'reply',           poolId: 'p_buy_quant', note: '账单差异为交割月调整，已与客户财务确认无误。' },

    { id: 'lg27', messageId: 'm8', at: T(20), actorId: 'u_zs',  action: 'created',         note: '创建消息，投递到财富池' },
    { id: 'lg28', messageId: 'm9', at: T(4),  actorId: 'u_zs',  action: 'created',         note: '创建消息，投递到其他池' },
    { id: 'lg29', messageId: 'm9', at: T(3),  actorId: 'u_qy',  action: 'dispatched',      note: '分发到 综合事务部（负责人 牟小凡），抄送 其他池（李倩影）' },
    { id: 'lg30', messageId: 'm9', at: T(2),  actorId: 'u_mxf', action: 'reply',           poolId: 'p_other_general', note: '资产配置建议初稿已成型，明日补充套保比例测算。' }
  ];

  const notifications = [
    { id: 'n1',  at: T(50), to: 'u_qy',  actorId: 'u_zs',  type: 'assign', messageId: 'm1', content: '张三提交的新消息 M-0001《宏远钢铁贸易有限公司》已进入零售池，待分发', channel: '企业微信', status: '模拟发送' },
    { id: 'n2',  at: T(49), to: 'u_ls',  actorId: 'u_qy',  type: 'assign', messageId: 'm1', content: '李倩影将消息 M-0001《宏远钢铁贸易有限公司》分发给华东零售组处理', channel: '企业微信', status: '模拟发送' },
    { id: 'n3',  at: T(49), to: 'u_cc',  actorId: 'u_qy',  type: 'cc',     messageId: 'm1', content: '消息 M-0001《宏远钢铁贸易有限公司》分发到华东零售组，抄送你（部门负责人）', channel: '企业微信', status: '模拟发送' },
    { id: 'n4',  at: T(45), to: 'u_zs',  actorId: 'u_qy',  type: 'summary', messageId: 'm1', content: '李倩影已发布 M-0001 的汇总回复', channel: '企业微信', status: '模拟发送' },
    { id: 'n5',  at: T(30), to: 'u_qy',  actorId: 'u_zs',  type: 'assign', messageId: 'm2', content: '张三提交的新消息 M-0002《金泰有色金属有限公司》已进入产业池，待分发', channel: '企业微信', status: '模拟发送' },
    { id: 'n6',  at: T(29), to: 'u_zm',  actorId: 'u_qy',  type: 'assign', messageId: 'm2', content: '李倩影将消息 M-0002《金泰有色金属有限公司》分发给产业服务部处理', channel: '企业微信', status: '模拟发送' },
    { id: 'n7',  at: T(27), to: 'u_hw',  actorId: 'u_zm',  type: 'assign', messageId: 'm2', content: '周明将消息 M-0002《金泰有色金属有限公司》流转给你落实', channel: '企业微信', status: '模拟发送' },
    { id: 'n8',  at: T(3),  to: 'u_qy',  actorId: 'u_zs',  type: 'assign', messageId: 'm3', content: '张三提交的新消息 M-0003《客户投诉：场外期权结算单出具延迟》已进入中后台池，待分发', channel: '企业微信', status: '模拟发送' },
    { id: 'n9',  at: T(58), to: 'u_qy',  actorId: 'u_ly',  type: 'assign', messageId: 'm4', content: '李研提交的新消息 M-0004《多家同业反馈策略报告延迟发布》已进入零售池，待分发', channel: '企业微信', status: '模拟发送' },
    { id: 'n10', at: T(7),  to: 'u_cl',  actorId: 'u_qy',  type: 'assign', messageId: 'm5', content: '李倩影将消息 M-0005《交易系统早盘登录异常》分发给国际业务部处理', channel: '企业微信', status: '模拟发送' },
    { id: 'n11', at: T(51), to: 'u_wd',  actorId: 'u_qy',  type: 'assign', messageId: 'm6', content: '李倩影将消息 M-0006《二季度宏观解读路演安排》分发给机构业务一部处理', channel: '企业微信', status: '模拟发送' },
    { id: 'n12', at: T(51), to: 'u_hj',  actorId: 'u_qy',  type: 'cc',     messageId: 'm6', content: '消息 M-0006《二季度宏观解读路演安排》分发到机构业务一部，抄送你（秘书）', channel: '企业微信', status: '模拟发送' },
    { id: 'n13', at: T(69), to: 'u_s7',  actorId: 'u_qy',  type: 'assign', messageId: 'm7', content: '李倩影将消息 M-0007《华东区域重点客户结算核对》分发给量化私募部处理', channel: '企业微信', status: '模拟发送' },
    { id: 'n14', at: T(60), to: 'u_zs',  actorId: 'u_qy',  type: 'summary', messageId: 'm7', content: '李倩影已发布 M-0007 的汇总回复，信息已完成', channel: '企业微信', status: '模拟发送' },
    { id: 'n15', at: T(20), to: 'u_qy',  actorId: 'u_zs',  type: 'assign', messageId: 'm8', content: '张三提交的新消息 M-0008《重点机构准入补充资料说明》已进入财富池，待分发', channel: '企业微信', status: '模拟发送' },
    { id: 'n16', at: T(3),  to: 'u_mxf', actorId: 'u_qy',  type: 'assign', messageId: 'm9', content: '李倩影将消息 M-0009《高净值客户资产配置咨询》分发给综合事务部处理', channel: '企业微信', status: '模拟发送' }
  ];

  const poolApps = [
    { id: 'pa1', at: T(10), poolName: '衍生品服务组', poolType: 'group', parentId: 'p_buy_quant', reason: '衍生品服务独立承接询价分流', applicantId: 'u_s7', status: 'pending', reviewBy: null, reviewAt: null }
  ];

  return {
    v: 4, seq: 6,
    pools, messages, links, replies, summaries, logs, notifications, poolApps
  };
}
