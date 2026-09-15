/* ==========================================================================
 * mock.js — Mock 用户 / 组织架构 / 池树 / 客户主数据 / 种子数据
 * 扩展点：正式环境中，用户与组织架构来自企业微信通讯录 API，
 *         池树来自后端池管理服务，客户主数据来自工商信息/客户主数据接口。
 * ========================================================================== */

/* ---------- 角色 ---------- */
const ROLES = {
  staff: '员工',
  dispatcher: '总池分发人',
  exec: '分管池负责人',
  deptAdmin: '部门管理员',
  admin: '系统管理员'
};

/* ---------- Mock 用户 ----------
 * 扩展点：USERS 由企业微信通讯录接口返回 */
const USERS = [
  { id: 'u_zs',  name: '张三',     wecom: 'zhangsan', dept: '信息技术部', role: 'staff' },
  { id: 'u_qy',  name: '李倩影',   wecom: 'qianying', dept: '总裁办',     role: 'dispatcher' },
  { id: 'u_zm',  name: '周敏',     wecom: 'zhoumin',  dept: '总裁办',     role: 'dispatcher' },
  { id: 'u_wjx', name: '王冀湘',   wecom: 'wangjx',   dept: '研究所',     role: 'exec' },
  { id: 'u_wyx', name: '闻勇翔',   wecom: 'wenyx',    dept: '机构业务',   role: 'exec' },
  { id: 'u_dyw', name: '丁彦文',   wecom: 'dingyw',   dept: '财务部',     role: 'exec' },
  { id: 'u_lj',  name: '刘军',     wecom: 'liujun',   dept: '纪检',       role: 'exec' },
  { id: 'u_qx',  name: '齐旭',     wecom: 'qixu',     dept: '合规风控',   role: 'exec' },
  { id: 'u_nty', name: '倪韬雍',   wecom: 'nity',     dept: '国际业务',   role: 'exec' },
  { id: 'u_swm', name: '邵嵬敏',   wecom: 'shaowm',   dept: '战略客户',   role: 'exec' },
  { id: 'u_fdk', name: '房迪恺',   wecom: 'fangdk',   dept: '投资部',     role: 'exec' },
  { id: 'u_mxf', name: '牟小凡',   wecom: 'mouxf',    dept: '人力资源',   role: 'exec' },
  { id: 'u_cl',  name: '陈立',     wecom: 'chenli',   dept: '宏观研究部', role: 'deptAdmin' },
  { id: 'u_ly',  name: '李研',     wecom: 'liyan',    dept: '宏观研究部', role: 'staff' },
  { id: 'u_adm', name: '系统管理员', wecom: 'sysadmin', dept: '信息技术部', role: 'admin' }
];

/* ---------- Mock 组织架构 ----------
 * 扩展点：ORGS 由企业微信组织架构接口返回 */
const ORGS = [
  { id: 'd_root',  name: '公司总部',   parentId: null },
  { id: 'd_yjs',   name: '研究所',     parentId: 'd_root' },
  { id: 'd_hgyj',  name: '宏观研究部', parentId: 'd_yjs' },
  { id: 'd_jgc',   name: '金融工程部', parentId: 'd_yjs' },
  { id: 'd_jgyw',  name: '机构业务',   parentId: 'd_root' },
  { id: 'd_jg1',   name: '机构业务一部', parentId: 'd_jgyw' },
  { id: 'd_zcb',   name: '总裁办',     parentId: 'd_root' },
  { id: 'd_it',    name: '信息技术部', parentId: 'd_root' }
];

/* ---------- 池类型 / 状态文案 ---------- */
const POOL_TYPES = { company: '公司总池', exec: '分管池', dept: '部门池', group: '小组池' };

/* 总消息状态机：按当前最深在办层级呈现 */
const MSG_STATUS = {
  p_company: '待总池分发',
  p_exec: '待分管池处理',
  p_dept: '待部门处理',
  p_group: '待小组处理',
  confirming: '待确认',
  closed: '已关闭',
  reopened: '重新打开',
  cancelled: '已取消'
};

/* 分池处理状态 */
const LINK_STATUS = {
  pending: '待接收', processing: '处理中', replied: '已回复',
  resolved: '已解决', rejected: '被驳回', forwarded: '已流转'
};

/* 解决确认状态（落实人 / 提出人通用） */
const CONFIRM_STATE = { none: '未确认', resolved: '已解决', unresolved: '未解决' };

/* 面向当前身份的主流程状态：待分发 / 待办 / 已办 / 完成 */
const FLOW_STATUS = { dispatch: '待分发', todo: '待办', done: '已办', ended: '完成' };

/* 信息来源选项 */
const SOURCE_OPTIONS = ['客户反馈', '同业交流', '行业会议', '监管与交易所', '网络媒体', '其他'];

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

/* ---------- 初始池树：公司总池 -> 分管池 -> 部门池 -> 小组池 ---------- */
function seedPools() {
  return [
    { id: 'p_company',  name: '公司总池',             type: 'company', parentId: null,          ownerIds: ['u_qy', 'u_zm'], memberIds: [] },
    { id: 'p_exec_wjx', name: '研究所分管池（王冀湘）',   type: 'exec',    parentId: 'p_company',   ownerIds: ['u_wjx'], memberIds: ['u_wjx'] },
    { id: 'p_dept_hg',  name: '宏观研究部池',           type: 'dept',    parentId: 'p_exec_wjx',  ownerIds: ['u_cl'],  memberIds: ['u_cl', 'u_ly'] },
    { id: 'p_grp_hg1',  name: '宏观组池',               type: 'group',   parentId: 'p_dept_hg',   ownerIds: ['u_ly'],  memberIds: ['u_ly'] },
    { id: 'p_grp_hg2',  name: '策略组池',               type: 'group',   parentId: 'p_dept_hg',   ownerIds: [],        memberIds: [] },
    { id: 'p_dept_jgc', name: '金融工程部池',           type: 'dept',    parentId: 'p_exec_wjx',  ownerIds: [],        memberIds: [] },
    { id: 'p_exec_wyx', name: '机构业务分管池（闻勇翔）', type: 'exec',    parentId: 'p_company',   ownerIds: ['u_wyx'], memberIds: ['u_wyx'] },
    { id: 'p_dept_jg1', name: '机构业务一部池',         type: 'dept',    parentId: 'p_exec_wyx',  ownerIds: ['u_wyx'], memberIds: ['u_wyx'] },
    { id: 'p_grp_hd',   name: '华东组池',               type: 'group',   parentId: 'p_dept_jg1',  ownerIds: [],        memberIds: [] },
    { id: 'p_exec_dyw', name: '财务分管池（丁彦文）',     type: 'exec',    parentId: 'p_company',   ownerIds: ['u_dyw'], memberIds: ['u_dyw'] },
    { id: 'p_exec_lj',  name: '纪检分管池（刘军）',       type: 'exec',    parentId: 'p_company',   ownerIds: ['u_lj'],  memberIds: ['u_lj'] },
    { id: 'p_exec_qx',  name: '合规风控分管池（齐旭）',   type: 'exec',    parentId: 'p_company',   ownerIds: ['u_qx'],  memberIds: ['u_qx'] },
    { id: 'p_exec_nty', name: '国际业务分管池（倪韬雍）', type: 'exec',    parentId: 'p_company',   ownerIds: ['u_nty'], memberIds: ['u_nty'] },
    { id: 'p_exec_swm', name: '战略客户分管池（邵嵬敏）', type: 'exec',    parentId: 'p_company',   ownerIds: ['u_swm'], memberIds: ['u_swm'] },
    { id: 'p_exec_fdk', name: '投资分管池（房迪恺）',     type: 'exec',    parentId: 'p_company',   ownerIds: ['u_fdk'], memberIds: ['u_fdk'] },
    { id: 'p_exec_mxf', name: '人力资源分管池（牟小凡）', type: 'exec',    parentId: 'p_company',   ownerIds: ['u_mxf'], memberIds: ['u_mxf'] }
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
      sources: ['客户反馈'], customerName: '宏远钢铁贸易有限公司', sourceOther: '',
      attachments: [], createdBy: 'u_zs', sourcePoolId: 'p_company', direct: false,
      status: 'closed',
      creatorConfirm: { state: 'resolved', by: 'u_zs', at: T(44) },
      createdAt: T(50), updatedAt: T(44), closedAt: T(44)
    },
    {
      id: 'm2', seq: 2, no: 'M-0002', title: '金泰有色金属有限公司',
      content: '销售日报中工业品库存数据与上期口径不一致，请宏观组核对并给出统一口径。',
      sources: ['客户反馈'], customerName: '金泰有色金属有限公司', sourceOther: '',
      attachments: [{ name: '销售日报-库存对比.xlsx', size: 48200 }],
      createdBy: 'u_zs', sourcePoolId: 'p_company', direct: false,
      status: 'confirming',
      creatorConfirm: { state: 'none' },
      createdAt: T(30), updatedAt: T(25)
    },
    {
      id: 'm3', seq: 3, no: 'M-0003', title: '客户投诉：场外期权结算单出具延迟',
      content: '客户反馈结算单超过约定时间仍未出具，涉及合规与运营多条线，请总池协调。',
      sources: ['监管与交易所'], customerName: '', sourceOther: '',
      attachments: [], createdBy: 'u_zs', sourcePoolId: 'p_company', direct: false,
      status: 'p_company',
      creatorConfirm: { state: 'none' },
      createdAt: T(3), updatedAt: T(3)
    },
    {
      id: 'm4', seq: 4, no: 'M-0004', title: '东海石化能源有限公司',
      content: '东海石化准入还缺最新一期审计报告，请战略客户线跟进。',
      sources: ['客户反馈'], customerName: '东海石化能源有限公司', sourceOther: '',
      attachments: [], createdBy: 'u_zs', sourcePoolId: 'p_exec_swm', direct: true,
      status: 'p_exec',
      creatorConfirm: { state: 'none' },
      createdAt: T(26), updatedAt: T(25)
    },
    {
      id: 'm5', seq: 5, no: 'M-0005', title: '交易系统早盘登录异常',
      content: '今日早盘多名客户反映 APP 登录验证码延迟，疑似短信通道抖动。',
      sources: ['同业交流'], customerName: '', sourceOther: '',
      attachments: [{ name: '登录异常截图.png', size: 91300 }],
      createdBy: 'u_ly', sourcePoolId: 'p_company', direct: false,
      status: 'p_company',
      creatorConfirm: { state: 'none' },
      createdAt: T(8), updatedAt: T(7)
    },
    {
      id: 'm6', seq: 6, no: 'M-0006', title: '二季度宏观解读路演安排',
      content: '机构客户希望安排二季度宏观解读路演，需要研究所出解读报告、宏观组补数据。',
      sources: ['行业会议'], customerName: '', sourceOther: '',
      attachments: [], createdBy: 'u_zs', sourcePoolId: 'p_company', direct: false,
      status: 'p_dept',
      creatorConfirm: { state: 'none' },
      createdAt: T(52), updatedAt: T(49)
    }
  ];

  const links = [
    /* m1：公司总池 -> 研究所分管池（已流转） -> 宏观研究部池（最终，落实人陈立）；合规风控分管池直接办结 */
    { id: 'lk1', messageId: 'm1', poolId: 'p_exec_wjx', poolType: 'exec', parentLinkId: null, parentPoolId: 'p_company',
      status: 'forwarded', handlerId: 'u_wjx', isFinal: false, handlerConfirm: { state: 'none' },
      dispatchedBy: 'u_qy', dispatchedAt: T(49), note: '研究所确认产品要素' },
    { id: 'lk2', messageId: 'm1', poolId: 'p_exec_qx', poolType: 'exec', parentLinkId: null, parentPoolId: 'p_company',
      status: 'resolved', handlerId: 'u_qx', isFinal: true,
      handlerConfirm: { state: 'resolved', by: 'u_qx', at: T(46), note: '适当性材料齐全，合规无异议' },
      dispatchedBy: 'u_qy', dispatchedAt: T(49), resolvedAt: T(46), note: '合规确认适当性' },
    { id: 'lk3', messageId: 'm1', poolId: 'p_dept_hg', poolType: 'dept', parentLinkId: 'lk1', parentPoolId: 'p_exec_wjx',
      status: 'resolved', handlerId: 'u_cl', isFinal: true,
      handlerConfirm: { state: 'resolved', by: 'u_cl', at: T(45), note: '产品要素已确认，可安排报价' },
      dispatchedBy: 'u_wjx', dispatchedAt: T(48), resolvedAt: T(45), note: '落实到宏观研究部' },

    /* m2：公司总池 -> 研究所分管池 -> 宏观研究部池 -> 宏观组池（最终，落实人李研已确认，待提出人确认） */
    { id: 'lk4', messageId: 'm2', poolId: 'p_exec_wjx', poolType: 'exec', parentLinkId: null, parentPoolId: 'p_company',
      status: 'forwarded', handlerId: 'u_wjx', isFinal: false, handlerConfirm: { state: 'none' },
      dispatchedBy: 'u_qy', dispatchedAt: T(29), note: '请研究所核对数据口径' },
    { id: 'lk5', messageId: 'm2', poolId: 'p_dept_hg', poolType: 'dept', parentLinkId: 'lk4', parentPoolId: 'p_exec_wjx',
      status: 'forwarded', handlerId: 'u_cl', isFinal: false, handlerConfirm: { state: 'none' },
      dispatchedBy: 'u_wjx', dispatchedAt: T(28), note: '落实到宏观组' },
    { id: 'lk6', messageId: 'm2', poolId: 'p_grp_hg1', poolType: 'group', parentLinkId: 'lk5', parentPoolId: 'p_dept_hg',
      status: 'resolved', handlerId: 'u_ly', isFinal: true,
      handlerConfirm: { state: 'resolved', by: 'u_ly', at: T(25), note: '已按交易所口径统一更新' },
      dispatchedBy: 'u_cl', dispatchedAt: T(27), resolvedAt: T(25), note: '' },

    /* m4：直投战略客户分管池（最终池，落实人邵嵬敏） */
    { id: 'lk7', messageId: 'm4', poolId: 'p_exec_swm', poolType: 'exec', parentLinkId: null, parentPoolId: null,
      status: 'replied', handlerId: 'u_swm', isFinal: true, handlerConfirm: { state: 'none' },
      dispatchedBy: 'u_zs', dispatchedAt: T(26), note: '直投分管池' },

    /* m6：公司总池 -> 研究所分管池（已流转到宏观研究部池，处理中） + 机构业务分管池（已回复，最终） */
    { id: 'lk8', messageId: 'm6', poolId: 'p_exec_wjx', poolType: 'exec', parentLinkId: null, parentPoolId: 'p_company',
      status: 'forwarded', handlerId: 'u_wjx', isFinal: false, handlerConfirm: { state: 'none' },
      dispatchedBy: 'u_qy', dispatchedAt: T(51), note: '研究所出解读' },
    { id: 'lk9', messageId: 'm6', poolId: 'p_exec_wyx', poolType: 'exec', parentLinkId: null, parentPoolId: 'p_company',
      status: 'replied', handlerId: 'u_wyx', isFinal: true, handlerConfirm: { state: 'none' },
      dispatchedBy: 'u_qy', dispatchedAt: T(51), note: '机构业务对接客户时间' },
    { id: 'lk10', messageId: 'm6', poolId: 'p_dept_hg', poolType: 'dept', parentLinkId: 'lk8', parentPoolId: 'p_exec_wjx',
      status: 'processing', handlerId: 'u_cl', isFinal: true, handlerConfirm: { state: 'none' },
      dispatchedBy: 'u_wjx', dispatchedAt: T(50), note: '宏观组补数据' }
  ];

  const replies = [
    { id: 'rp1', messageId: 'm1', poolId: 'p_dept_hg', authorId: 'u_cl', parentReplyId: null, content: '产品要素已与客户确认，可安排报价。', attachments: [], at: T(47), likeCount: 1, likedByUserIds: ['u_zs'] },
    { id: 'rp2', messageId: 'm1', poolId: 'p_exec_qx', authorId: 'u_qx', parentReplyId: null, content: '适当性材料齐全，合规无异议。', attachments: [], at: T(46), likeCount: 0, likedByUserIds: [] },
    { id: 'rp3', messageId: 'm2', poolId: 'p_grp_hg1', authorId: 'u_ly', parentReplyId: null, content: '已核对，统一按交易所口径更新，详见附件。', attachments: [{ name: '口径说明.docx', size: 12400 }], at: T(26), likeCount: 2, likedByUserIds: ['u_zs', 'u_cl'] },
    { id: 'rp4', messageId: 'm4', poolId: 'p_exec_swm', authorId: 'u_swm', parentReplyId: null, content: '已联系客户，审计报告明天上午提供。', attachments: [], at: T(25), likeCount: 0, likedByUserIds: [] },
    { id: 'rp5', messageId: 'm6', poolId: 'p_exec_wyx', authorId: 'u_wyx', parentReplyId: null, content: '已安排客户经理对接路演时间。', attachments: [], at: T(50), likeCount: 0, likedByUserIds: [] },
    { id: 'rp6', messageId: 'm6', poolId: 'p_dept_hg', authorId: 'u_cl', parentReplyId: null, content: '宏观组数据补充中，预计明天完成。', attachments: [], at: T(49), likeCount: 0, likedByUserIds: [] }
  ];

  const logs = [
    { id: 'lg1',  messageId: 'm1', at: T(50), actorId: 'u_zs',  action: 'created',         note: '创建消息，投递到公司总池' },
    { id: 'lg3',  messageId: 'm1', at: T(49), actorId: 'u_qy',  action: 'dispatched',      note: '分发到 研究所分管池（王冀湘）、合规风控分管池（齐旭）' },
    { id: 'lg4',  messageId: 'm1', at: T(48), actorId: 'u_wjx', action: 'forwarded',       poolId: 'p_exec_wjx', note: '流转到 宏观研究部池：落实到宏观研究部' },
    { id: 'lg5',  messageId: 'm1', at: T(47), actorId: 'u_cl',  action: 'reply',           poolId: 'p_dept_hg', note: '产品要素已与客户确认，可安排报价。' },
    { id: 'lg6',  messageId: 'm1', at: T(46), actorId: 'u_qx',  action: 'reply',           poolId: 'p_exec_qx', note: '适当性材料齐全，合规无异议。' },
    { id: 'lg7',  messageId: 'm1', at: T(46), actorId: 'u_qx',  action: 'handler_confirm', poolId: 'p_exec_qx', note: '落实人确认：已解决（适当性材料齐全，合规无异议）' },
    { id: 'lg8',  messageId: 'm1', at: T(45), actorId: 'u_cl',  action: 'handler_confirm', poolId: 'p_dept_hg', note: '落实人确认：已解决（产品要素已确认，可安排报价）' },
    { id: 'lg9',  messageId: 'm1', at: T(45), actorId: null,    action: 'auto',            note: '所有最终落实人已确认，进入待确认' },
    { id: 'lg10', messageId: 'm1', at: T(44), actorId: 'u_zs',  action: 'creator_confirm', note: '提出人确认：已解决' },
    { id: 'lg11', messageId: 'm1', at: T(44), actorId: null,    action: 'closed',          note: '落实人与提出人均确认已解决，消息关闭' },

    { id: 'lg12', messageId: 'm2', at: T(30), actorId: 'u_zs',  action: 'created',         note: '创建消息，投递到公司总池' },
    { id: 'lg14', messageId: 'm2', at: T(29), actorId: 'u_qy',  action: 'dispatched',      note: '分发到 研究所分管池（王冀湘）：请研究所核对数据口径' },
    { id: 'lg15', messageId: 'm2', at: T(28), actorId: 'u_wjx', action: 'forwarded',       poolId: 'p_exec_wjx', note: '流转到 宏观研究部池：落实到宏观组' },
    { id: 'lg16', messageId: 'm2', at: T(27), actorId: 'u_cl',  action: 'forwarded',       poolId: 'p_dept_hg', note: '流转到 宏观组池' },
    { id: 'lg17', messageId: 'm2', at: T(26), actorId: 'u_ly',  action: 'reply',           poolId: 'p_grp_hg1', note: '已核对，统一按交易所口径更新，详见附件。' },
    { id: 'lg18', messageId: 'm2', at: T(25), actorId: 'u_ly',  action: 'handler_confirm', poolId: 'p_grp_hg1', note: '落实人确认：已解决（已按交易所口径统一更新）' },
    { id: 'lg19', messageId: 'm2', at: T(25), actorId: null,    action: 'auto',            note: '所有最终落实人已确认，进入待确认' },

    { id: 'lg20', messageId: 'm3', at: T(3),  actorId: 'u_zs',  action: 'created',         note: '创建消息，投递到公司总池' },

    { id: 'lg21', messageId: 'm4', at: T(26), actorId: 'u_zs',  action: 'created',         note: '创建消息，直投 战略客户分管池（邵嵬敏）' },
    { id: 'lg22', messageId: 'm4', at: T(25), actorId: 'u_swm', action: 'reply',           poolId: 'p_exec_swm', note: '已联系客户，审计报告明天上午提供。' },

    { id: 'lg23', messageId: 'm5', at: T(8),  actorId: 'u_ly',  action: 'created',         note: '创建消息，投递到公司总池' },

    { id: 'lg25', messageId: 'm6', at: T(52), actorId: 'u_zs',  action: 'created',         note: '创建消息，投递到公司总池' },
    { id: 'lg27', messageId: 'm6', at: T(51), actorId: 'u_qy',  action: 'dispatched',      note: '分发到 研究所分管池（王冀湘）、机构业务分管池（闻勇翔）' },
    { id: 'lg28', messageId: 'm6', at: T(50), actorId: 'u_wjx', action: 'forwarded',       poolId: 'p_exec_wjx', note: '流转到 宏观研究部池：宏观组补数据' },
    { id: 'lg29', messageId: 'm6', at: T(50), actorId: 'u_wyx', action: 'reply',           poolId: 'p_exec_wyx', note: '已安排客户经理对接路演时间。' },
    { id: 'lg30', messageId: 'm6', at: T(49), actorId: 'u_cl',  action: 'reply',           poolId: 'p_dept_hg', note: '宏观组数据补充中，预计明天完成。' }
  ];

  const notifications = [
    { id: 'n1',  at: T(50), to: 'u_qy',  messageId: 'm1', content: '新消息 M-0001《宏远钢铁贸易有限公司》已进入公司总池，待分发', channel: '企业微信', status: '模拟发送' },
    { id: 'n2',  at: T(50), to: 'u_zm',  messageId: 'm1', content: '新消息 M-0001《宏远钢铁贸易有限公司》已进入公司总池，待分发', channel: '企业微信', status: '模拟发送' },
    { id: 'n4',  at: T(49), to: 'u_wjx', messageId: 'm1', content: '消息 M-0001《宏远钢铁贸易有限公司》已分发到 研究所分管池（王冀湘）', channel: '企业微信', status: '模拟发送' },
    { id: 'n5',  at: T(49), to: 'u_qx',  messageId: 'm1', content: '消息 M-0001《宏远钢铁贸易有限公司》已分发到 合规风控分管池（齐旭）', channel: '企业微信', status: '模拟发送' },
    { id: 'n6',  at: T(48), to: 'u_cl',  messageId: 'm1', content: '消息 M-0001《宏远钢铁贸易有限公司》已流转到 宏观研究部池', channel: '企业微信', status: '模拟发送' },
    { id: 'n7',  at: T(48), to: 'u_ly',  messageId: 'm1', content: '消息 M-0001《宏远钢铁贸易有限公司》已流转到 宏观研究部池', channel: '企业微信', status: '模拟发送' },
    { id: 'n8',  at: T(45), to: 'u_zs',  messageId: 'm1', content: 'M-0001 所有最终落实人已确认已解决，请您进行提出人确认', channel: '企业微信', status: '模拟发送' },
    { id: 'n9',  at: T(44), to: 'u_zs',  messageId: 'm1', content: 'M-0001 落实人与提出人均确认已解决，消息已关闭', channel: '企业微信', status: '模拟发送' },
    { id: 'n10', at: T(44), to: 'u_qy',  messageId: 'm1', content: 'M-0001 落实人与提出人均确认已解决，消息已关闭', channel: '企业微信', status: '模拟发送' },
    { id: 'n11', at: T(30), to: 'u_qy',  messageId: 'm2', content: '新消息 M-0002《金泰有色金属有限公司》已进入公司总池，待分发', channel: '企业微信', status: '模拟发送' },
    { id: 'n12', at: T(27), to: 'u_ly',  messageId: 'm2', content: '消息 M-0002《金泰有色金属有限公司》已流转到 宏观组池', channel: '企业微信', status: '模拟发送' },
    { id: 'n13', at: T(25), to: 'u_zs',  messageId: 'm2', content: 'M-0002 所有最终落实人已确认已解决，请您进行提出人确认', channel: '企业微信', status: '模拟发送' },
    { id: 'n14', at: T(3),  to: 'u_qy',  messageId: 'm3', content: '新消息 M-0003《客户投诉：场外期权结算单出具延迟》已进入公司总池，待分发', channel: '企业微信', status: '模拟发送' },
    { id: 'n15', at: T(3),  to: 'u_zm',  messageId: 'm3', content: '新消息 M-0003《客户投诉：场外期权结算单出具延迟》已进入公司总池，待分发', channel: '企业微信', status: '模拟发送' },
    { id: 'n16', at: T(26), to: 'u_swm', messageId: 'm4', content: '新消息 M-0004《东海石化能源有限公司》直投到 战略客户分管池（邵嵬敏）', channel: '企业微信', status: '模拟发送' },
    { id: 'n17', at: T(8),  to: 'u_qy',  messageId: 'm5', content: '新消息 M-0005《交易系统早盘登录异常》已进入公司总池，待分发', channel: '企业微信', status: '模拟发送' },
    { id: 'n18', at: T(51), to: 'u_wjx', messageId: 'm6', content: '消息 M-0006《二季度宏观解读路演安排》已分发到 研究所分管池（王冀湘）', channel: '企业微信', status: '模拟发送' },
    { id: 'n19', at: T(51), to: 'u_wyx', messageId: 'm6', content: '消息 M-0006《二季度宏观解读路演安排》已分发到 机构业务分管池（闻勇翔）', channel: '企业微信', status: '模拟发送' },
    { id: 'n20', at: T(50), to: 'u_cl',  messageId: 'm6', content: '消息 M-0006《二季度宏观解读路演安排》已流转到 宏观研究部池', channel: '企业微信', status: '模拟发送' },
    { id: 'n21', at: T(10), to: 'u_adm', messageId: null, content: '陈立 申请新建小组池「衍生品研究组池」（上级：宏观研究部池）', channel: '企业微信', status: '模拟发送' }
  ];

  const poolApps = [
    { id: 'pa1', at: T(10), poolName: '衍生品研究组池', poolType: 'group', parentId: 'p_dept_hg', reason: '衍生品研究组独立承接询价分流', applicantId: 'u_cl', status: 'pending', reviewBy: null, reviewAt: null }
  ];

  return {
    v: 3, seq: 6,
    pools, messages, links, replies, logs, notifications, poolApps
  };
}
