// keyword-blacklist.test.js — 黑名单逻辑测试

// ===== 模拟黑名单核心逻辑 =====
function createMockBlacklistDb() {
  var rows = [];
  var nextId = 1;
  return {
    rows: rows,
    getOne: function (sql, params) {
      return rows.find(function (r) { return r.keyword === params[0] && r.category_name === params[1]; }) || null;
    },
    getAll: function (sql, params) {
      if (!params || !params.length) return rows;
      return rows.filter(function (r) { return params.indexOf(r.keyword) >= 0; });
    },
    upsertBlacklist: function (keyword, categoryName) {
      if (!keyword || !categoryName) return;
      var existing = rows.find(function (r) { return r.keyword === keyword && r.category_name === categoryName; });
      if (existing) {
        existing.count += 1;
      } else {
        rows.push({ id: nextId++, keyword: keyword, category_name: categoryName, reason: 'auto', count: 1 });
      }
    },
    reduceBlacklist: function (keyword, categoryName) {
      if (!keyword || !categoryName) return;
      var idx = -1;
      for (var i = 0; i < rows.length; i++) {
        if (rows[i].keyword === keyword && rows[i].category_name === categoryName) { idx = i; break; }
      }
      if (idx < 0) return;
      if (rows[idx].count <= 1) {
        rows.splice(idx, 1);
      } else {
        rows[idx].count -= 1;
      }
    }
  };
}

// ===== 模拟 scoreCategory 黑名单惩罚逻辑 =====
function calcBlacklistPenalty(candidate, blacklistEntries) {
  if (!blacklistEntries || !blacklistEntries.length) return 0;
  var candName = (candidate.name || '').toLowerCase();
  var blCount = 0;
  for (var i = 0; i < blacklistEntries.length; i++) {
    if (blacklistEntries[i].category_name.toLowerCase() === candName) {
      blCount += (blacklistEntries[i].count || 1);
    }
  }
  if (blCount > 0) {
    return Math.min(0.15, blCount * 0.03);
  }
  return 0;
}

// ===== 测试 =====

describe('upsertBlacklist — 黑名单写入', () => {
  test('新增黑名单 count=1 reason=auto', () => {
    var db = createMockBlacklistDb();
    db.upsertBlacklist('厨房', '厨房用品');
    expect(db.rows.length).toBe(1);
    expect(db.rows[0].count).toBe(1);
    expect(db.rows[0].reason).toBe('auto');
  });

  test('重复写入 count+1', () => {
    var db = createMockBlacklistDb();
    db.upsertBlacklist('厨房', '厨房用品');
    db.upsertBlacklist('厨房', '厨房用品');
    expect(db.rows.length).toBe(1);
    expect(db.rows[0].count).toBe(2);
  });

  test('多次写入 count 递增', () => {
    var db = createMockBlacklistDb();
    for (var i = 0; i < 6; i++) db.upsertBlacklist('厨房', '厨房用品');
    expect(db.rows[0].count).toBe(6);
  });

  test('不同关键词-类目 各自独立', () => {
    var db = createMockBlacklistDb();
    db.upsertBlacklist('厨房', '厨房用品');
    db.upsertBlacklist('餐具', '厨房用品');
    expect(db.rows.length).toBe(2);
  });

  test('空参数不操作', () => {
    var db = createMockBlacklistDb();
    db.upsertBlacklist('', '厨房用品');
    db.upsertBlacklist('厨房', '');
    db.upsertBlacklist('', '');
    expect(db.rows.length).toBe(0);
  });
});

describe('reduceBlacklist — 黑名单减权', () => {
  test('count > 1 时减 1', () => {
    var db = createMockBlacklistDb();
    db.upsertBlacklist('厨房', '厨房用品');
    db.upsertBlacklist('厨房', '厨房用品');
    expect(db.rows[0].count).toBe(2);
    db.reduceBlacklist('厨房', '厨房用品');
    expect(db.rows[0].count).toBe(1);
  });

  test('count=1 时删除', () => {
    var db = createMockBlacklistDb();
    db.upsertBlacklist('厨房', '厨房用品');
    expect(db.rows.length).toBe(1);
    db.reduceBlacklist('厨房', '厨房用品');
    expect(db.rows.length).toBe(0);
  });

  test('不存在时无操作', () => {
    var db = createMockBlacklistDb();
    db.reduceBlacklist('厨房', '厨房用品');
    expect(db.rows.length).toBe(0);
  });

  test('多次减权后删除', () => {
    var db = createMockBlacklistDb();
    db.upsertBlacklist('厨房', '厨房用品');
    db.upsertBlacklist('厨房', '厨房用品');
    db.upsertBlacklist('厨房', '厨房用品');
    expect(db.rows[0].count).toBe(3);
    db.reduceBlacklist('厨房', '厨房用品');
    expect(db.rows[0].count).toBe(2);
    db.reduceBlacklist('厨房', '厨房用品');
    expect(db.rows[0].count).toBe(1);
    db.reduceBlacklist('厨房', '厨房用品');
    expect(db.rows.length).toBe(0);
  });
});

describe('黑名单计分惩罚', () => {
  test('1 条黑名单 → 惩罚 0.03', () => {
    var penalty = calcBlacklistPenalty(
      { name: '厨房用品' },
      [{ keyword: '厨房', category_name: '厨房用品', count: 1 }]
    );
    expect(penalty).toBeCloseTo(0.03);
  });

  test('3 条黑名单 → 惩罚 0.09', () => {
    var penalty = calcBlacklistPenalty(
      { name: '厨房用品' },
      [{ keyword: '厨房', category_name: '厨房用品', count: 3 }]
    );
    expect(penalty).toBeCloseTo(0.09);
  });

  test('5+ 条黑名单 → 上限 0.15', () => {
    var penalty = calcBlacklistPenalty(
      { name: '厨房用品' },
      [{ keyword: '厨房', category_name: '厨房用品', count: 10 }]
    );
    expect(penalty).toBeCloseTo(0.15);
  });

  test('不在黑名单的候选 → 惩罚 0', () => {
    var penalty = calcBlacklistPenalty(
      { name: '厨房用品' },
      [{ keyword: '厨房', category_name: '服装', count: 3 }]
    );
    expect(penalty).toBe(0);
  });

  test('空黑名单 → 惩罚 0', () => {
    var penalty = calcBlacklistPenalty({ name: '厨房用品' }, []);
    expect(penalty).toBe(0);
  });

  test('多个黑名单条目累加', () => {
    var penalty = calcBlacklistPenalty(
      { name: '厨房用品' },
      [
        { keyword: '厨房', category_name: '厨房用品', count: 2 },
        { keyword: '餐具', category_name: '厨房用品', count: 3 }
      ]
    );
    expect(penalty).toBeCloseTo(0.15); // (2+3)*0.03 = 0.15, 刚好达到上限
  });

  test('多个条目未达上限', () => {
    var penalty = calcBlacklistPenalty(
      { name: '厨房用品' },
      [
        { keyword: '厨房', category_name: '厨房用品', count: 1 },
        { keyword: '餐具', category_name: '厨房用品', count: 2 }
      ]
    );
    expect(penalty).toBeCloseTo(0.09); // (1+2)*0.03 = 0.09
  });
});

describe('黑名单纠错闭环', () => {
  test('手动改分类 → 写黑名单 + 减权新类目', () => {
    var db = createMockBlacklistDb();
    var kws = ['厨房', '餐具'];
    var oldCategory = '厨房用品';
    var newCategory = '餐饮器具';

    // 旧类目进黑名单
    kws.forEach(function (kw) { db.upsertBlacklist(kw, oldCategory); });
    // 新类目如果被黑过则减权
    kws.forEach(function (kw) { db.reduceBlacklist(kw, newCategory); });

    expect(db.rows.length).toBe(2);
    db.rows.forEach(function (r) {
      expect(r.category_name).toBe(oldCategory);
      expect(r.count).toBe(1);
    });
  });

  test('改回被黑的类目 → 黑名单减权', () => {
    var db = createMockBlacklistDb();
    // 第一次改：厨房用品→餐饮器具
    db.upsertBlacklist('厨房', '厨房用品');
    db.reduceBlacklist('厨房', '餐饮器具');

    // 后来改回：餐饮器具→厨房用品（平反）
    db.upsertBlacklist('厨房', '餐饮器具');
    db.reduceBlacklist('厨房', '厨房用品');

    // 厨房用品的黑名单被减权（count=1→删除）
    var kitchenEntry = db.rows.find(function (r) { return r.category_name === '厨房用品'; });
    expect(kitchenEntry).toBeUndefined();
    // 餐饮器具新增了黑名单
    var diningEntry = db.rows.find(function (r) { return r.category_name === '餐饮器具'; });
    expect(diningEntry.count).toBe(1);
  });
});
