// category-score.test.js — 分类计分算法测试
const crModule = require('../../routes/ai/category-recommend');
const { scoreCategory, calcHitDetail, splitAliCategoryWords } = crModule._test;

describe('scoreCategory 计分算法', () => {
  test('精确名称匹配得分高于路径匹配', () => {
    const titleKws = [];
    const aliKws = ['搓澡刷'];
    const exact = scoreCategory(titleKws, aliKws, { name: '搓澡刷', path: '家居/浴室/搓澡刷' });
    const pathOnly = scoreCategory(titleKws, aliKws, { name: '其他', path: '清洁/搓澡刷' });
    expect(exact).toBeGreaterThan(pathOnly);
  });

  test('双方重合词得分 > 仅1688词 > 仅标题词', () => {
    const titleKws = ['垃圾袋'];
    const aliKws = ['垃圾袋'];
    const bothHit = scoreCategory(titleKws, aliKws, { name: '垃圾袋', path: '包装/垃圾袋' });

    const titleOnly = scoreCategory(titleKws, [], { name: '垃圾袋', path: '包装/垃圾袋' });
    const aliOnly = scoreCategory([], aliKws, { name: '垃圾袋', path: '包装/垃圾袋' });

    expect(bothHit).toBeGreaterThan(titleOnly);
    expect(bothHit).toBeGreaterThanOrEqual(aliOnly);
  });

  test('叶子节点深度加分', () => {
    const titleKws = ['工具'];
    const aliKws = [];
    const deep = scoreCategory(titleKws, aliKws, { name: '工具', path: '五金/手动/工具' });
    const shallow = scoreCategory(titleKws, aliKws, { name: '工具', path: '工具' });
    expect(deep).toBeGreaterThan(shallow);
  });

  test('关联库 fromRel 加权', () => {
    const titleKws = ['灯'];
    const aliKws = [];
    const withRel = scoreCategory(titleKws, aliKws, { name: '台灯', path: '照明/台灯', fromRel: true, weight: 5.0 });
    const withoutRel = scoreCategory(titleKws, aliKws, { name: '台灯', path: '照明/台灯' });
    expect(withRel).toBeGreaterThan(withoutRel);
  });

  test('"其他/杂项"类目惩罚', () => {
    const titleKws = ['工具'];
    const aliKws = [];
    const normal = scoreCategory(titleKws, aliKws, { name: '工具', path: '五金/工具' });
    const other = scoreCategory(titleKws, aliKws, { name: '其他工具', path: '五金/其他工具' });
    expect(normal).toBeGreaterThan(other);
  });

  test('空关键词返回最低分', () => {
    const score = scoreCategory([], [], { name: '测试', path: '分类/测试' });
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  test('空候选信息', () => {
    const score = scoreCategory(['关键词'], ['关键词'], { name: '', path: '' });
    expect(score).toBeGreaterThanOrEqual(0);
  });

  test('分数范围在 [0, 1]', () => {
    const score = scoreCategory(['长关键词测试'], ['类目词'], { name: '长关键词测试', path: '分类/子类/长关键词测试', fromRel: true, weight: 10.0 });
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });
});

describe('calcHitDetail 命中详情', () => {
  test('精确名称命中', () => {
    const result = calcHitDetail(['搓澡刷'], '', '搓澡刷', '');
    expect(result.nameHit).toBe(true);
    expect(result.hitWords).toContain('搓澡刷');
    expect(result.ratio).toBe(1);
  });

  test('名称包含关键词', () => {
    const result = calcHitDetail(['搓澡'], '', '搓澡刷', '');
    expect(result.nameHit).toBe(true);
  });

  test('关键词包含名称', () => {
    const result = calcHitDetail(['搓澡刷子'], '', '搓澡', '');
    expect(result.nameHit).toBe(true);
  });

  test('路径命中', () => {
    const result = calcHitDetail(['浴室'], '', '其他', '家居/浴室/其他');
    expect(result.pathHit).toBe(true);
    expect(result.hitWords).toContain('浴室');
  });

  test('无命中', () => {
    const result = calcHitDetail(['完全不相关'], '', '分类名', '路径/其他');
    expect(result.hitWords.length).toBe(0);
    expect(result.ratio).toBe(0);
  });

  test('空关键词', () => {
    const result = calcHitDetail([], '', '分类名', '路径');
    expect(result.ratio).toBe(0);
    expect(result.hitWords.length).toBe(0);
  });

  test('多个关键词部分命中', () => {
    const result = calcHitDetail(['工具', '不相关'], '', '工具', '');
    expect(result.hitWords.length).toBe(1);
    expect(result.ratio).toBeCloseTo(0.5);
  });
});

describe('splitAliCategoryWords', () => {
  test('按斜杠拆分', () => {
    const result = splitAliCategoryWords('家居/厨房/餐具');
    expect(result).toEqual(['家居', '厨房', '餐具']);
  });

  test('按空格拆分', () => {
    const result = splitAliCategoryWords('家居 厨房 餐具');
    expect(result).toEqual(['家居', '厨房', '餐具']);
  });

  test('过滤短词', () => {
    const result = splitAliCategoryWords('A/家居/厨房');
    expect(result).not.toContain('A');
  });

  test('空输入返回空数组', () => {
    expect(splitAliCategoryWords('')).toEqual([]);
    expect(splitAliCategoryWords(null)).toEqual([]);
    expect(splitAliCategoryWords(undefined)).toEqual([]);
  });

  test('按>拆分', () => {
    const result = splitAliCategoryWords('家居>厨房>餐具');
    expect(result).toEqual(['家居', '厨房', '餐具']);
  });
});
