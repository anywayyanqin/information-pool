const MAIN_POOL_ADMIN = '倩影总';

const EXECUTIVES = [
  { name: '王冀湘', title: '党委副书记、副总裁（兼任研究所所长）', dept: '研究所' },
  { name: '闻勇翔', title: '副总裁', dept: '机构业务' },
  { name: '丁彦文', title: '财务总监', dept: '财务' },
  { name: '刘军', title: '纪委书记', dept: '纪检' },
  { name: '齐旭', title: '首席风险官（兼合规与风险管理部总经理）', dept: '合规风控' },
  { name: '倪韬雍', title: '总经理助理（兼国际业务部总经理）', dept: '国际业务' },
  { name: '邵嵬敏', title: '总经理助理（兼综合管理部、战略客户部总经理）', dept: '战略客户' },
  { name: '房迪恺', title: '总经理助理（兼投资部总经理）', dept: '投资' },
  { name: '牟小凡', title: '人力资源总监', dept: '人力资源' }
];

const POOLS = [
  ...EXECUTIVES.map((e) => ({ key: e.name, name: `${e.dept}分池（${e.name}）`, exec: e.name, dept: e.dept })),
  { key: 'main', name: '人工流转', admin: MAIN_POOL_ADMIN }
];

module.exports = { MAIN_POOL_ADMIN, EXECUTIVES, POOLS };
