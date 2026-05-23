// category-keywords.test.js — 关键词提取测试
const crModule = require('../../routes/ai/category-recommend');
const { cleanTitleKeywords, splitAliCategoryWords } = crModule._test;
const extractSearchKeywords = crModule.extractSearchKeywordsPublic;

describe('cleanTitleKeywords', () => {
  test('去除噪词', () => {
    const result = cleanTitleKeywords('爆款热销新款搓澡刷');
    expect(result).not.toContain('爆款');
    expect(result).not.toContain('热销');
    expect(result).not.toContain('新款');
    expect(result).toContain('搓澡刷');
  });

  test('去除规格数字', () => {
    const result = cleanTitleKeywords('500ml大容量水杯');
    expect(result.some(w => w.includes('500ml'))).toBe(false);
  });

  test('过滤单个字符', () => {
    const result = cleanTitleKeywords('A款搓澡刷');
    expect(result).not.toContain('A');
  });

  test('过滤纯数字', () => {
    const result = cleanTitleKeywords('123搓澡刷456');
    expect(result).not.toContain('123');
    expect(result).not.toContain('456');
  });

  test('按分隔符拆分', () => {
    const result = cleanTitleKeywords('搓澡刷/洗澡刷/沐浴刷');
    expect(result).toContain('搓澡刷');
    expect(result).toContain('洗澡刷');
    expect(result).toContain('沐浴刷');
  });

  test('空输入返回空数组', () => {
    expect(cleanTitleKeywords('')).toEqual([]);
    expect(cleanTitleKeywords(null)).toEqual([]);
  });

  test('只含噪词返回空数组', () => {
    const result = cleanTitleKeywords('爆款 热销 新款');
    expect(result.length).toBe(0);
  });

  test('保留有效中文词', () => {
    const result = cleanTitleKeywords('加厚垃圾袋大号');
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('extractSearchKeywords', () => {
  test('合并标题和类目关键词', () => {
    const result = extractSearchKeywords('搓澡刷洗澡神器', '家居/浴室用品');
    expect(result.length).toBeGreaterThan(0);
  });

  test('去重', () => {
    const result = extractSearchKeywords('搓澡刷搓澡刷', '搓澡刷');
    const count = result.filter(w => w === '搓澡刷').length;
    expect(count).toBeLessThanOrEqual(1);
  });

  test('过滤2字以下和7字以上', () => {
    const result = extractSearchKeywords('A大容量加厚搓澡刷子工具', '家居');
    result.forEach(w => {
      const cn = w.replace(/[a-zA-Z0-9]/g, '');
      expect(cn.length).toBeGreaterThanOrEqual(2);
      expect(cn.length).toBeLessThanOrEqual(6);
    });
  });

  test('空输入返回空数组', () => {
    expect(extractSearchKeywords('', '')).toEqual([]);
  });
});

describe('splitAliCategoryWords (via _test)', () => {
  test('多级路径拆分', () => {
    expect(splitAliCategoryWords('服饰/女装/连衣裙')).toEqual(['服饰', '女装', '连衣裙']);
  });

  test('单级类目', () => {
    expect(splitAliCategoryWords('工具')).toEqual(['工具']);
  });
});
