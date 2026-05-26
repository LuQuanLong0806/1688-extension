// keyword-rel-correction.test.js — 关联库纠错 + fromRel 候选注入测试

// ===== 模拟 invalidateAutoRels 核心逻辑 =====
function createMockRelDb() {
  var rows = [];
  var nextId = 1;
  return {
    rows: rows,
    addRel: function (keyword, categoryName, weight, source, valid) {
      rows.push({ id: nextId++, keyword: keyword, category_name: categoryName, weight: weight, source: source, valid: valid !== undefined ? valid : 1 });
    },
    invalidateAutoRels: function (keywords, categoryName) {
      if (!keywords || !keywords.length || !categoryName) return;
      rows.forEach(function (r) {
        if (r.category_name === categoryName && r.source === 'auto' && keywords.indexOf(r.keyword) >= 0) {
          r.valid = 0;
        }
      });
    },
    getValidRels: function (keywords) {
      return rows.filter(function (r) {
        return r.valid === 1 && keywords.indexOf(r.keyword) >= 0;
      });
    },
    findRel: function (keyword, categoryName) {
      return rows.find(function (r) { return r.keyword === keyword && r.category_name === categoryName; });
    }
  };
}

// ===== 模拟 Step 4.5 关联库候选注入逻辑 =====
function simulateRelInjection(searchKeywords, relRows, treeRows, existingCandidates) {
  var candidates = existingCandidates.slice();
  var seenPaths = {};
  candidates.forEach(function (c) { seenPaths[c.path] = true; });
  var MAX_CANDIDATES = 50;

  var relCategoryNames = [];
  relRows.forEach(function (rr) {
    if (relCategoryNames.indexOf(rr.category_name) < 0) relCategoryNames.push(rr.category_name);
  });

  var relTreeMap = {};
  treeRows.forEach(function (tr) {
    if (!relTreeMap[tr.cat_name]) relTreeMap[tr.cat_name] = [];
    relTreeMap[tr.cat_name].push(tr);
  });

  var relBestWeight = {};
  relRows.forEach(function (rr) {
    if (!relBestWeight[rr.category_name] || rr.weight > relBestWeight[rr.category_name]) {
      relBestWeight[rr.category_name] = rr.weight;
    }
  });

  relCategoryNames.forEach(function (catName) {
    var trees = relTreeMap[catName];
    if (!trees) return;
    trees.forEach(function (tr) {
      if (!seenPaths[tr.path] && candidates.length < MAX_CANDIDATES) {
        seenPaths[tr.path] = true;
        candidates.push({
          name: tr.cat_name,
          path: tr.path,
          fromRel: true,
          weight: relBestWeight[catName] || 1.0
        });
      }
    });
  });

  return candidates;
}

// ===== 模拟 products.js 关键词提取逻辑 =====
function extractKeywords(titleText, aliCatText) {
  var kws = (titleText + ' ' + aliCatText).split(/[\s\/>,，、：:·\-—\(\)（）\[\]【】]+/).filter(function (w) {
    var cn = w.replace(/[a-zA-Z0-9]/g, '');
    return cn.length >= 2 && cn.length <= 6;
  });
  return kws.filter(function (w, i, arr) { return arr.indexOf(w) === i; }).slice(0, 8);
}

// ===== 测试 =====

describe('invalidateAutoRels — 作废错误关联', () => {
  test('作废指定关键词的自动关联', () => {
    var db = createMockRelDb();
    db.addRel('厨房', '厨房用品', 0.5, 'auto');
    db.addRel('餐具', '厨房用品', 0.5, 'auto');
    db.addRel('厨房', '家居日用', 0.3, 'auto');

    db.invalidateAutoRels(['厨房', '餐具'], '厨房用品');

    expect(db.findRel('厨房', '厨房用品').valid).toBe(0);
    expect(db.findRel('餐具', '厨房用品').valid).toBe(0);
    expect(db.findRel('厨房', '家居日用').valid).toBe(1); // 不同类目不受影响
  });

  test('不影动手动关联', () => {
    var db = createMockRelDb();
    db.addRel('厨房', '厨房用品', 0.8, 'manual');
    db.addRel('厨房', '厨房用品', 0.5, 'auto');

    db.invalidateAutoRels(['厨房'], '厨房用品');

    // 只作废 auto，manual 不受影响
    var rels = db.rows.filter(function (r) { return r.keyword === '厨房' && r.category_name === '厨房用品'; });
    expect(rels.length).toBe(2);
    expect(rels.find(function (r) { return r.source === 'manual'; }).valid).toBe(1);
    expect(rels.find(function (r) { return r.source === 'auto'; }).valid).toBe(0);
  });

  test('空关键词不报错', () => {
    var db = createMockRelDb();
    db.addRel('厨房', '厨房用品', 0.5, 'auto');
    expect(function () { db.invalidateAutoRels([], '厨房用品'); }).not.toThrow();
    expect(db.findRel('厨房', '厨房用品').valid).toBe(1);
  });

  test('空类目名不报错', () => {
    var db = createMockRelDb();
    expect(function () { db.invalidateAutoRels(['厨房'], ''); }).not.toThrow();
  });

  test('无匹配行时不报错', () => {
    var db = createMockRelDb();
    db.addRel('厨房', '厨房用品', 0.5, 'auto');
    expect(function () { db.invalidateAutoRels(['电子'], '电子产品'); }).not.toThrow();
  });
});

describe('Step 4.5 关联库候选注入', () => {
  test('从关联库注入候选并设置 fromRel', () => {
    var relRows = [
      { keyword: '厨房', category_name: '厨房用品', weight: 2.0 },
      { keyword: '餐具', category_name: '厨房用品', weight: 1.5 }
    ];
    var treeRows = [
      { cat_name: '厨房用品', path: '家居/厨房/厨房用品' }
    ];

    var result = simulateRelInjection(['厨房', '餐具'], relRows, treeRows, []);

    expect(result.length).toBe(1);
    expect(result[0].name).toBe('厨房用品');
    expect(result[0].fromRel).toBe(true);
    expect(result[0].weight).toBe(2.0); // 取最大 weight
  });

  test('不重复注入已有候选', () => {
    var existing = [{ name: '厨房用品', path: '家居/厨房/厨房用品' }];
    var relRows = [
      { keyword: '厨房', category_name: '厨房用品', weight: 1.0 }
    ];
    var treeRows = [
      { cat_name: '厨房用品', path: '家居/厨房/厨房用品' }
    ];

    var result = simulateRelInjection(['厨房'], relRows, treeRows, existing);

    expect(result.length).toBe(1);
    expect(result[0].fromRel).toBeUndefined();
  });

  test('关联类目不在树中则不注入', () => {
    var relRows = [
      { keyword: '厨房', category_name: '不存在的类目', weight: 1.0 }
    ];
    var treeRows = [];

    var result = simulateRelInjection(['厨房'], relRows, treeRows, []);
    expect(result.length).toBe(0);
  });

  test('多个关联类目映射到多棵树节点', () => {
    var relRows = [
      { keyword: '厨房', category_name: '厨房用品', weight: 1.0 },
      { keyword: '杯子', category_name: '杯子', weight: 2.5 }
    ];
    var treeRows = [
      { cat_name: '厨房用品', path: '家居/厨房/厨房用品' },
      { cat_name: '杯子', path: '家居/餐饮/杯子' }
    ];

    var result = simulateRelInjection(['厨房', '杯子'], relRows, treeRows, []);

    expect(result.length).toBe(2);
    expect(result.filter(function (c) { return c.fromRel; }).length).toBe(2);
  });

  test('同一类目名多棵树节点', () => {
    var relRows = [
      { keyword: '厨房', category_name: '刀', weight: 3.0 }
    ];
    var treeRows = [
      { cat_name: '刀', path: '厨房/刀具/刀' },
      { cat_name: '刀', path: '五金/工具/刀' }
    ];

    var result = simulateRelInjection(['厨房'], relRows, treeRows, []);

    expect(result.length).toBe(2);
    result.forEach(function (c) {
      expect(c.fromRel).toBe(true);
      expect(c.weight).toBe(3.0);
    });
  });

  test('取多个关联词的最大 weight', () => {
    var relRows = [
      { keyword: '厨房', category_name: '厨房用品', weight: 1.0 },
      { keyword: '餐具', category_name: '厨房用品', weight: 3.0 }
    ];
    var treeRows = [
      { cat_name: '厨房用品', path: '家居/厨房/厨房用品' }
    ];

    var result = simulateRelInjection(['厨房', '餐具'], relRows, treeRows, []);

    expect(result[0].weight).toBe(3.0);
  });

  test('空关联行不注入', () => {
    var result = simulateRelInjection(['厨房'], [], [], []);
    expect(result.length).toBe(0);
  });

  test('达到上限不再注入', () => {
    var existing = [];
    for (var i = 0; i < 49; i++) {
      existing.push({ name: '候选' + i, path: '路径/候选' + i });
    }
    var relRows = [
      { keyword: '厨房', category_name: '厨房用品', weight: 1.0 },
      { keyword: '家居', category_name: '家居日用', weight: 1.0 }
    ];
    var treeRows = [
      { cat_name: '厨房用品', path: '家居/厨房/厨房用品' },
      { cat_name: '家居日用', path: '家居/家居日用' }
    ];

    var result = simulateRelInjection(['厨房', '家居'], relRows, treeRows, existing);

    // 49 existing + max 1 more = 50
    expect(result.length).toBe(50);
    var relCandidates = result.filter(function (c) { return c.fromRel; });
    expect(relCandidates.length).toBeLessThanOrEqual(1);
  });
});

describe('关键词提取（products.js 纠错用）', () => {
  test('从标题和类目提取关键词', () => {
    var kws = extractKeywords('厨房 不锈钢 刀具 套装', '家居/厨房/刀具');
    expect(kws).toContain('厨房');
    expect(kws).toContain('不锈钢');
    expect(kws).toContain('刀具');
    expect(kws).toContain('套装');
    expect(kws).toContain('家居');
  });

  test('去重', () => {
    var kws = extractKeywords('厨房厨房', '厨房');
    var count = kws.filter(function (w) { return w === '厨房'; }).length;
    expect(count).toBe(1);
  });

  test('过滤短词', () => {
    var kws = extractKeywords('A 厨房', '');
    expect(kws).not.toContain('A');
    expect(kws).toContain('厨房');
  });

  test('最多返回8个', () => {
    var longTitle = '厨房 餐具 刀具 砧板 锅具 碗碟 杯子 餐椅 桌布 窗帘';
    var kws = extractKeywords(longTitle, '');
    expect(kws.length).toBeLessThanOrEqual(8);
  });

  test('空输入返回空', () => {
    var kws = extractKeywords('', '');
    expect(kws).toEqual([]);
  });
});

describe('纠错闭环流程', () => {
  test('AI推荐→积累→用户修正→作废+重新积累', () => {
    var db = createMockRelDb();

    // 1. AI 推荐成功，积累关联
    db.addRel('厨房', '厨房用品', 0.5, 'auto');
    db.addRel('餐具', '厨房用品', 0.5, 'auto');

    // 2. 验证关联有效
    var validBefore = db.getValidRels(['厨房', '餐具']);
    expect(validBefore.length).toBe(2);

    // 3. 用户手动修正为正确类目
    db.invalidateAutoRels(['厨房', '餐具'], '厨房用品');
    db.addRel('厨房', '餐饮器具', 0.8, 'manual');
    db.addRel('餐具', '餐饮器具', 0.8, 'manual');

    // 4. 验证旧关联已作废，新关联有效
    expect(db.findRel('厨房', '厨房用品').valid).toBe(0);
    expect(db.findRel('餐具', '厨房用品').valid).toBe(0);
    expect(db.findRel('厨房', '餐饮器具').valid).toBe(1);
    expect(db.findRel('餐具', '餐饮器具').valid).toBe(1);

    // 5. 查询有效关联时只返回新的
    var validAfter = db.getValidRels(['厨房', '餐具']);
    expect(validAfter.length).toBe(2);
    validAfter.forEach(function (r) {
      expect(r.category_name).toBe('餐饮器具');
    });
  });
});
