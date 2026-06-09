// category-recommend-fallback.test.js — 相似映射查找 + 降级逻辑测试
const crModule = require('../../routes/ai/category-recommend');
const { findSimilarMappings, scoreCategory, splitAliCategoryWords } = crModule._test;

// Mock dbModule
jest.mock('../../db', () => {
  var mappings = [];
  var tree = [];
  return {
    getAll: jest.fn(function (sql, params) {
      if (sql.indexOf('category_mappings') >= 0) {
        // 提取所有 LIKE 参数（%keyword%）和排除参数
        var likeParams = [];
        var excludeName = null;
        for (var i = 0; i < params.length; i++) {
          if (typeof params[i] === 'string' && params[i].indexOf('%') >= 0) {
            likeParams.push(params[i].replace(/%/g, ''));
          } else if (typeof params[i] === 'string' && params[i].indexOf('%') < 0) {
            excludeName = params[i];
          }
        }
        return mappings.filter(function (m) {
          if (excludeName && m.category_name === excludeName) return false;
          for (var j = 0; j < likeParams.length; j++) {
            if (m.category_name.indexOf(likeParams[j]) >= 0) return true;
          }
          return false;
        });
      }
      return [];
    }),
    treeGetOne: jest.fn(function (sql, params) {
      var name = params[0];
      var found = tree.find(function (t) { return t.cat_name === name; });
      return found || null;
    }),
    _setMappings: function (m) { mappings = m; },
    _setTree: function (t) { tree = t; }
  };
});

var dbMock = require('../../db');

describe('findSimilarMappings 相似类目映射查找', () => {
  beforeEach(() => {
    dbMock._setMappings([
      { category_name: '连体雨衣', custom_category: '雨衣', count: 5 },
      { category_name: '一次性雨衣', custom_category: '雨衣', count: 3 },
      { category_name: '雨衣雨裤套装', custom_category: '雨具', count: 2 },
      { category_name: '厨房抹布', custom_category: '清洁用品', count: 4 }
    ]);
    dbMock._setTree([
      { cat_name: '雨衣', path: '服装/雨具/雨衣', is_leaf: 1 },
      { cat_name: '雨具', path: '服装/雨具', is_leaf: 1 },
      { cat_name: '清洁用品', path: '家居/清洁/清洁用品', is_leaf: 1 }
    ]);
  });

  test('通过子词找到相似映射', () => {
    // 当前类目 "长袖T恤"，搜子词找到 "一次性雨衣" 和 "雨衣雨裤套装" 的映射
    var result = findSimilarMappings('长袖T恤', ['长袖', 'T恤'], {});
    // T恤 不匹配任何映射，返回空
    expect(result).toEqual([]);
  });

  test('能找到包含子词的映射并排除当前类目', () => {
    // 当前类目 "连体雨衣"，子词 ['连体', '雨衣']
    // 排除 category_name == '连体雨衣' 的行，剩下 "一次性雨衣" 和 "雨衣雨裤套装"
    var result = findSimilarMappings('连体雨衣', ['连体', '雨衣'], {});
    expect(result.length).toBeGreaterThan(0);
    // 应包含 "雨具"（来自 "雨衣雨裤套装" 的映射）
    var names = result.map(function (r) { return r.name; });
    expect(names).toContain('雨具');
    // "雨衣" 映射来自 "一次性雨衣"，也应该出现
    expect(names).toContain('雨衣');
    // 不应包含 "连体雨衣" 本身的映射
    result.forEach(function (r) {
      expect(r.similarCategoryName).not.toBe('连体雨衣');
    });
  });

  test('排除已在候选池中的路径', () => {
    var existingPaths = { '服装/雨具/雨衣': true };
    var result = findSimilarMappings('连体雨衣', ['连体', '雨衣'], existingPaths);
    var paths = result.map(function (r) { return r.path; });
    expect(paths).not.toContain('服装/雨具/雨衣');
  });

  test('候选带 fromSimilarMapping 标记', () => {
    var result = findSimilarMappings('连体雨衣', ['连体', '雨衣'], {});
    result.forEach(function (r) {
      expect(r.fromSimilarMapping).toBe(true);
      expect(r.similarCategoryName).toBeTruthy();
      expect(r.mappingCount).toBeGreaterThan(0);
    });
  });

  test('无 aliCategory 返回空', () => {
    var result = findSimilarMappings('', [], {});
    expect(result).toEqual([]);
  });

  test('无匹配返回空', () => {
    dbMock._setMappings([
      { category_name: '电子数码', custom_category: '数码配件', count: 1 }
    ]);
    var result = findSimilarMappings('完全不存在的类目xyz', ['不存在', 'xyz'], {});
    expect(result).toEqual([]);
  });

  test('去重：同一个 custom_category 只出现一次', () => {
    var result = findSimilarMappings('连体雨衣', ['连体', '雨衣'], {});
    var names = result.map(function (r) { return r.name; });
    var uniqueNames = names.filter(function (n, i, arr) { return arr.indexOf(n) === i; });
    expect(names.length).toBe(uniqueNames.length);
  });
});

describe('scoreCategory 对相似映射候选的计分', () => {
  test('fromSimilarMapping 候选能获得合理分数', () => {
    var titleKws = ['雨衣', '连体'];
    var aliKws = ['连体', '雨衣'];
    var candidate = {
      name: '雨具',
      path: '服装/雨具',
      fromSimilarMapping: true,
      similarCategoryName: '雨衣雨裤套装',
      mappingCount: 2
    };
    var score = scoreCategory(titleKws, aliKws, candidate, []);
    expect(score).toBeGreaterThan(0);
  });
});

describe('splitAliCategoryWords 子词拆分', () => {
  test('复合词拆出子串', () => {
    var words = splitAliCategoryWords('连体雨衣');
    expect(words).toContain('连体雨衣');
    expect(words).toContain('雨衣');
  });

  test('路径分隔', () => {
    var words = splitAliCategoryWords('家居/厨房/餐具');
    expect(words).toContain('家居');
    expect(words).toContain('厨房');
    expect(words).toContain('餐具');
  });
});
