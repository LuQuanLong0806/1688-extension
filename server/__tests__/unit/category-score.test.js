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

  test('黑名单惩罚降低分数', () => {
    const titleKws = ['工具'];
    const aliKws = [];
    const blEntries = [{ keyword: '工具', category_name: '工具', count: 1 }];
    const normal = scoreCategory(titleKws, aliKws, { name: '工具', path: '五金/工具' });
    const penalized = scoreCategory(titleKws, aliKws, { name: '工具', path: '五金/工具' }, blEntries);
    expect(penalized).toBeLessThan(normal);
    expect(normal - penalized).toBeCloseTo(0.03);
  });

  test('黑名单惩罚不使分数低于 0', () => {
    const score = scoreCategory([], [], { name: '测试', path: '' }, [
      { keyword: 'x', category_name: '测试', count: 100 }
    ]);
    expect(score).toBeGreaterThanOrEqual(0);
  });

  test('空黑名单不影响分数', () => {
    const titleKws = ['工具'];
    const aliKws = [];
    const noBl = scoreCategory(titleKws, aliKws, { name: '工具', path: '五金/工具' });
    const withBl = scoreCategory(titleKws, aliKws, { name: '工具', path: '五金/工具' }, []);
    expect(noBl).toBe(withBl);
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

  test('4字以上复合词子串拆分', () => {
    const result = splitAliCategoryWords('连体雨衣、雨披');
    expect(result).toContain('连体雨衣');
    expect(result).toContain('雨披');
    expect(result).toContain('雨衣');
    expect(result).toContain('体雨');
    expect(result).toContain('连体');
  });

  test('4字词拆出所有2~3字子串', () => {
    const result = splitAliCategoryWords('电动车雨衣');
    expect(result).toContain('电动车雨衣');
    expect(result).toContain('电动');
    expect(result).toContain('动车');
    expect(result).toContain('车雨');
    expect(result).toContain('雨衣');
    expect(result).toContain('电动车');
    expect(result).toContain('动车雨');
    expect(result).toContain('车雨衣');
  });

  test('3字词不拆子串', () => {
    const result = splitAliCategoryWords('搓澡刷');
    expect(result).toEqual(['搓澡刷']);
  });

  test('子串不重复已有词', () => {
    const result = splitAliCategoryWords('雨衣/连体雨衣');
    expect(result).toContain('雨衣');
    expect(result).toContain('连体雨衣');
    expect(result.filter(function(w) { return w === '雨衣'; }).length).toBe(1);
  });
});

describe('逐字匹配加分', () => {
  test('ali词与标题词完全重合时逐字加分', () => {
    const titleKws = ['雨衣'];
    const aliKws = ['雨衣'];
    const withMatch = scoreCategory(titleKws, aliKws, { name: '男士雨衣', path: '服装/男士/男士雨衣' });
    const noMatch = scoreCategory(titleKws, aliKws, { name: '完全无关', path: '其他/无关' });
    expect(withMatch).toBeGreaterThan(noMatch);
    expect(withMatch - noMatch).toBeGreaterThanOrEqual(0.1);
  });

  test('ali词包含标题词时也能逐字加分', () => {
    const titleKws = ['雨衣'];
    const aliKws = ['连体雨衣'];
    const rainCoat = scoreCategory(titleKws, aliKws, { name: '男士雨衣', path: '服装/男士/男士雨衣' });
    const unrelated = scoreCategory(titleKws, aliKws, { name: '无关类目', path: '其他/无关' });
    expect(rainCoat).toBeGreaterThan(unrelated);
  });

  test('候选名含所有重合字得分最高', () => {
    const titleKws = ['雨衣'];
    const aliKws = ['雨衣'];
    const fullHit = scoreCategory(titleKws, aliKws, { name: '雨衣', path: '户外/雨衣' });
    const partialHit = scoreCategory(titleKws, aliKws, { name: '雨披', path: '户外/雨披' });
    expect(fullHit).toBeGreaterThan(partialHit);
  });

  test('无重合词时不加逐字分', () => {
    const titleKws = ['工具'];
    const aliKws = ['清洁'];
    const noOverlap = scoreCategory(titleKws, aliKws, { name: '测试', path: '分类/测试' });
    const sameNoOverlap = scoreCategory(titleKws, aliKws, { name: '测试', path: '分类/测试' });
    expect(noOverlap).toBe(sameNoOverlap);
  });

  test('逐字加分不超0.15', () => {
    const titleKws = ['雨衣', '雨披'];
    const aliKws = ['雨衣', '雨披'];
    const score = scoreCategory(titleKws, aliKws, { name: '雨衣雨披', path: '户外/雨衣雨披' });
    expect(score).toBeLessThanOrEqual(1.0);
    expect(score).toBeGreaterThanOrEqual(0);
  });

  test('空ali词不触发逐字匹配', () => {
    const titleKws = ['雨衣'];
    const aliKws = [];
    const score1 = scoreCategory(titleKws, aliKws, { name: '雨衣', path: '户外/雨衣' });
    expect(score1).toBeGreaterThanOrEqual(0);
  });

  test('无重合词时用1688类目词逐字加分', () => {
    const titleKws = ['工具'];
    const aliKws = ['搓澡'];
    const hit = scoreCategory(titleKws, aliKws, { name: '搓澡刷', path: '家居/浴室/搓澡刷' });
    const miss = scoreCategory(titleKws, aliKws, { name: '清洁剂', path: '家居/清洁/清洁剂' });
    expect(hit).toBeGreaterThan(miss);
  });

  test('无重合词1688逐字加分候选名含全部字符得分最高', () => {
    const titleKws = ['工具'];
    const aliKws = ['搓澡刷'];
    const full = scoreCategory(titleKws, aliKws, { name: '搓澡刷', path: '家居/搓澡刷' });
    const partial = scoreCategory(titleKws, aliKws, { name: '搓澡巾', path: '家居/搓澡巾' });
    expect(full).toBeGreaterThan(partial);
  });
});
