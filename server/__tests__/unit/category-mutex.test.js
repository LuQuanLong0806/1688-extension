// category-mutex.test.js — 互斥组测试
const crModule = require('../../routes/ai/category-recommend');
const { isMutexConflict, getMutexGroupIndex, loadMutexGroups } = crModule._test;

describe('getMutexGroupIndex', () => {
  test('家居类匹配', () => {
    expect(getMutexGroupIndex('家居')).toBeGreaterThanOrEqual(0);
    expect(getMutexGroupIndex('家居用品')).toBeGreaterThanOrEqual(0);
    expect(getMutexGroupIndex('居家')).toBeGreaterThanOrEqual(0);
  });

  test('厨房类匹配', () => {
    expect(getMutexGroupIndex('厨房')).toBeGreaterThanOrEqual(0);
    expect(getMutexGroupIndex('厨房用品')).toBeGreaterThanOrEqual(0);
  });

  test('服饰类匹配', () => {
    expect(getMutexGroupIndex('服饰')).toBeGreaterThanOrEqual(0);
    expect(getMutexGroupIndex('女装')).toBeGreaterThanOrEqual(0);
  });

  test('电子类匹配', () => {
    expect(getMutexGroupIndex('电子')).toBeGreaterThanOrEqual(0);
    expect(getMutexGroupIndex('数码')).toBeGreaterThanOrEqual(0);
  });

  test('不匹配返回 -1', () => {
    expect(getMutexGroupIndex('完全无关的词')).toBe(-1);
    expect(getMutexGroupIndex('')).toBe(-1);
  });

  test('路径中包含互斥词也能匹配', () => {
    const idx = getMutexGroupIndex('家居/厨房/餐具');
    expect(idx).toBeGreaterThanOrEqual(0);
  });

  test('大小写不敏感', () => {
    expect(getMutexGroupIndex('INS')).toBe(-1); // 'ins' 不是互斥词
  });
});

describe('isMutexConflict', () => {
  test('跨大类候选被拦截', () => {
    // 标题含 "厨房" (厨房组), 候选含 "服饰" (服饰组)
    const result = isMutexConflict(['厨房'], [], '服饰/女装/T恤');
    expect(result).toBe(true);
  });

  test('同大类候选不拦截', () => {
    // 标题含 "厨房" (厨房组), 候选含 "餐具" (厨房组)
    const result = isMutexConflict(['厨房'], [], '厨房用品/餐具');
    expect(result).toBe(false);
  });

  test('无法判定大类时不拦截', () => {
    const result = isMutexConflict(['不相关的词'], [], '任何类目');
    expect(result).toBe(false);
  });

  test('标题和类目词共同判定产品大类', () => {
    // 标题无明确大类，但1688类目词有
    const result = isMutexConflict([], ['厨房'], '服饰/女装');
    expect(result).toBe(true);
  });

  test('候选不在任何互斥组不拦截', () => {
    const result = isMutexConflict(['厨房'], [], '未知类目/其他');
    expect(result).toBe(false);
  });

  test('空输入不拦截', () => {
    expect(isMutexConflict([], [], '')).toBe(false);
    expect(isMutexConflict(null, null, null)).toBe(false);
  });
});

describe('loadMutexGroups 默认互斥组', () => {
  test('至少有 10 个默认互斥组', () => {
    const groups = loadMutexGroups();
    expect(groups.length).toBeGreaterThanOrEqual(10);
  });

  test('每个组有 names 和 label', () => {
    const groups = loadMutexGroups();
    groups.forEach(g => {
      expect(g.names).toBeDefined();
      expect(Array.isArray(g.names)).toBe(true);
      expect(g.names.length).toBeGreaterThan(0);
      expect(g.label).toBeDefined();
      expect(typeof g.label).toBe('string');
    });
  });

  test('覆盖预期类目大类', () => {
    const groups = loadMutexGroups();
    const allNames = groups.flatMap(g => g.names);
    const expected = ['家居', '厨房', '清洁', '办公', '服饰', '美妆', '电子', '玩具', '运动', '汽车', '宠物', '食品', '包装', '五金', '珠宝'];
    expected.forEach(name => {
      expect(allNames).toContain(name);
    });
  });
});
