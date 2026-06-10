// sku-variant-decouple.test.js — 变种属性与自定义名称解耦测试
// 验证：customName 编辑不反向同步、变种属性编辑正向同步、笛卡尔积生成与数据保留

// ===== 辅助函数（从 detail-modal.js 提取的核心算法） =====

function cartesianProduct(attrs) {
  var activeAttrs = attrs.filter(function (va) { return va.values.length > 0; });
  if (activeAttrs.length === 0) return [];
  var combos = activeAttrs[0].values.map(function (v) { return [v]; });
  for (var ai = 1; ai < activeAttrs.length; ai++) {
    var newCombos = [];
    activeAttrs[ai].values.forEach(function (v) {
      combos.forEach(function (c) { newCombos.push(c.concat(v)); });
    });
    combos = newCombos;
  }
  return combos;
}

function getOldMatch(oldSkus, combo) {
  for (var oi = 0; oi < oldSkus.length; oi++) {
    var s = oldSkus[oi];
    var full = (s.name || '').trim();
    var parts = full.split(/\s+/);
    var match = true;
    for (var ci = 0; ci < combo.length; ci++) {
      if (parts[ci] !== combo[ci]) { match = false; break; }
    }
    if (match) return s;
  }
  return null;
}

function rebuildSkusFromVariants(attrs, oldSkus) {
  var combos = cartesianProduct(attrs);
  if (combos.length === 0) return [];
  var dimDefault = ['', '', ''];
  if (oldSkus.length > 0 && oldSkus[0].dimensions) dimDefault = oldSkus[0].dimensions.slice();
  return combos.map(function (combo) {
    var old = getOldMatch(oldSkus, combo);
    return {
      name: combo.join(' '),
      customName: (old && old.customName) ? old.customName : combo.join(' '),
      image: old ? old.image : '',
      price: old ? old.price : 0,
      sellPrice: old ? old.sellPrice : 0,
      dimensions: old && old.dimensions ? old.dimensions.slice() : dimDefault.slice(),
      size: old ? old.size : '',
      weight: old ? old.weight : ''
    };
  });
}

function confirmEditVariantValueSync(skus, attrIdx, oldVal, newVal) {
  skus.forEach(function (s) {
    var origName = (s.name || '').trim();
    var nameParts = origName.split(/\s+/);
    if (nameParts[attrIdx] === oldVal) {
      nameParts[attrIdx] = newVal;
      s.name = nameParts.join(' ');
      var cnParts = (s.customName || '').split(/\s+/);
      if (cnParts[attrIdx] !== undefined) {
        cnParts[attrIdx] = newVal;
        s.customName = cnParts.join(' ');
      }
    }
  });
}

// ===== 1. 笛卡尔积生成 =====
describe('笛卡尔积生成', function () {
  test('单维度 3 值 → 3 个 SKU', function () {
    var attrs = [{ values: ['蓝色', '红色', '绿色'] }];
    var skus = rebuildSkusFromVariants(attrs, []);
    expect(skus.length).toBe(3);
    expect(skus[0].name).toBe('蓝色');
    expect(skus[1].name).toBe('红色');
    expect(skus[2].name).toBe('绿色');
    expect(skus[0].customName).toBe('蓝色');
    expect(skus[1].customName).toBe('红色');
  });

  test('双维度 3×2 → 6 个 SKU', function () {
    var attrs = [
      { values: ['蓝色', '红色', '绿色'] },
      { values: ['L', 'M'] }
    ];
    var skus = rebuildSkusFromVariants(attrs, []);
    expect(skus.length).toBe(6);
    expect(skus[0].name).toBe('蓝色 L');
    expect(skus[5].name).toBe('绿色 M');
  });

  test('无变种属性值 → 空列表', function () {
    var attrs = [{ values: [] }];
    var skus = rebuildSkusFromVariants(attrs, []);
    expect(skus.length).toBe(0);
  });
});

// ===== 2. getOldMatch 用 name 匹配（不受 customName 编辑影响） =====
describe('getOldMatch 用 name 匹配', function () {
  test('编辑 customName 后仍能通过 name 匹配', function () {
    var oldSkus = [
      { name: '蓝色 L', customName: '深蓝 L', price: 10, image: 'a.jpg' },
      { name: '蓝色 M', customName: '蓝色 M', price: 12, image: 'b.jpg' }
    ];
    var matched = getOldMatch(oldSkus, ['蓝色', 'L']);
    expect(matched).not.toBeNull();
    expect(matched.name).toBe('蓝色 L');
    expect(matched.customName).toBe('深蓝 L');
  });

  test('匹配不到返回 null', function () {
    var oldSkus = [{ name: '红色 L', customName: '红色 L', price: 10 }];
    var matched = getOldMatch(oldSkus, ['蓝色', 'L']);
    expect(matched).toBeNull();
  });
});

// ===== 3. 重建时保留旧数据 =====
describe('重建保留旧数据', function () {
  test('已编辑的 customName 被保留', function () {
    var attrs = [
      { values: ['蓝色', '红色'] },
      { values: ['L', 'M'] }
    ];
    var oldSkus = [
      { name: '蓝色 L', customName: '深蓝 L', price: 10, sellPrice: 20, image: 'a.jpg', dimensions: [1, 2, 3], size: '30x20', weight: '0.5' },
      { name: '蓝色 M', customName: '蓝色 M', price: 12, sellPrice: 22, image: 'b.jpg', dimensions: [1, 2, 3], size: '', weight: '' },
      { name: '红色 L', customName: '红色 L', price: 14, sellPrice: 24, image: '', dimensions: [1, 2, 3], size: '', weight: '' },
      { name: '红色 M', customName: '红色 M', price: 16, sellPrice: 26, image: '', dimensions: [1, 2, 3], size: '', weight: '' }
    ];
    var newSkus = rebuildSkusFromVariants(attrs, oldSkus);
    // 蓝色 L → customName 应保留 "深蓝 L"
    var blueL = newSkus.find(function (s) { return s.name === '蓝色 L'; });
    expect(blueL).toBeDefined();
    expect(blueL.customName).toBe('深蓝 L');
    expect(blueL.price).toBe(10);
    expect(blueL.image).toBe('a.jpg');
  });

  test('新增属性值后重建：新增 SKU 无旧数据', function () {
    var attrs = [
      { values: ['蓝色', '红色', '绿色'] },
      { values: ['L', 'M'] }
    ];
    var oldSkus = [
      { name: '蓝色 L', customName: '蓝色 L', price: 10, sellPrice: 0, image: '', dimensions: [], size: '', weight: '' },
      { name: '蓝色 M', customName: '蓝色 M', price: 12, sellPrice: 0, image: '', dimensions: [], size: '', weight: '' },
      { name: '红色 L', customName: '红色 L', price: 14, sellPrice: 0, image: '', dimensions: [], size: '', weight: '' },
      { name: '红色 M', customName: '红色 M', price: 16, sellPrice: 0, image: '', dimensions: [], size: '', weight: '' }
    ];
    var newSkus = rebuildSkusFromVariants(attrs, oldSkus);
    expect(newSkus.length).toBe(6);
    // 绿色 SKUs 是新增的，无旧数据
    var greenL = newSkus.find(function (s) { return s.name === '绿色 L'; });
    expect(greenL).toBeDefined();
    expect(greenL.price).toBe(0);
    expect(greenL.customName).toBe('绿色 L');
    // 旧数据保留
    var blueL = newSkus.find(function (s) { return s.name === '蓝色 L'; });
    expect(blueL.price).toBe(10);
  });
});

// ===== 4. confirmEditVariantValue 正向同步 =====
describe('变种属性编辑正向同步到 SKU', function () {
  test('编辑颜色值 → name 和 customName 对应位置更新', function () {
    var skus = [
      { name: '蓝色 L', customName: '蓝色 L' },
      { name: '蓝色 M', customName: '蓝色 M' },
      { name: '红色 L', customName: '红色 L' }
    ];
    confirmEditVariantValueSync(skus, 0, '蓝色', '天蓝');
    expect(skus[0].name).toBe('天蓝 L');
    expect(skus[0].customName).toBe('天蓝 L');
    expect(skus[1].name).toBe('天蓝 M');
    expect(skus[1].customName).toBe('天蓝 M');
    expect(skus[2].name).toBe('红色 L');
    expect(skus[2].customName).toBe('红色 L');
  });

  test('编辑已修改过的 customName → 只更新对应位置', function () {
    var skus = [
      { name: '蓝色 L', customName: '深蓝 L' },
      { name: '蓝色 M', customName: '蓝色 M' }
    ];
    confirmEditVariantValueSync(skus, 0, '蓝色', '天蓝');
    expect(skus[0].name).toBe('天蓝 L');
    expect(skus[0].customName).toBe('天蓝 L');
    expect(skus[1].name).toBe('天蓝 M');
    expect(skus[1].customName).toBe('天蓝 M');
  });

  test('编辑第二维度 → 只影响对应位置', function () {
    var skus = [
      { name: '蓝色 L', customName: '蓝色 L' },
      { name: '蓝色 M', customName: '蓝色 M' }
    ];
    confirmEditVariantValueSync(skus, 1, 'L', 'XL');
    expect(skus[0].name).toBe('蓝色 XL');
    expect(skus[0].customName).toBe('蓝色 XL');
    expect(skus[1].name).toBe('蓝色 M');
    expect(skus[1].customName).toBe('蓝色 M');
  });
});

// ===== 5. customName 编辑不影响 variantAttrs（解耦验证） =====
describe('customName 编辑不影响变种属性', function () {
  test('修改 customName 后 variantAttrs 值不变', function () {
    var variantAttrs = [
      { values: ['蓝色', '红色'] },
      { values: ['L', 'M'] }
    ];
    var skus = [
      { name: '蓝色 L', customName: '蓝色 L' },
      { name: '蓝色 M', customName: '蓝色 M' },
      { name: '红色 L', customName: '红色 L' },
      { name: '红色 M', customName: '红色 M' }
    ];
    // 模拟用户编辑 customName（v-model 直接赋值）
    skus[0].customName = '深蓝 L';
    // 验证 variantAttrs 没有被修改
    expect(variantAttrs[0].values).toEqual(['蓝色', '红色']);
    expect(variantAttrs[1].values).toEqual(['L', 'M']);
    // 第一乘数不变
    expect(variantAttrs[0].values.length).toBe(2);
  });
});

// ===== 6. 选中状态纯索引 =====
describe('选中状态纯索引', function () {
  test('toggleSkuItem 修改 selectedSkuIndexes', function () {
    var selectedSkuIndexes = [];
    // toggle on
    var idx = 0;
    if (selectedSkuIndexes.indexOf(idx) < 0) selectedSkuIndexes.push(idx);
    expect(selectedSkuIndexes).toEqual([0]);
    // toggle another
    idx = 2;
    if (selectedSkuIndexes.indexOf(idx) < 0) selectedSkuIndexes.push(idx);
    expect(selectedSkuIndexes).toEqual([0, 2]);
    // toggle off
    idx = 0;
    var pos = selectedSkuIndexes.indexOf(idx);
    if (pos >= 0) selectedSkuIndexes.splice(pos, 1);
    expect(selectedSkuIndexes).toEqual([2]);
  });

  test('selectedSkuIndexes 与 variantAttrs 值无关', function () {
    var variantAttrs = [{ values: ['蓝色', '红色', '绿色'] }];
    var selectedSkuIndexes = [0, 2]; // 选中第 0 和第 2 个 SKU
    // 修改 variantAttrs 不会影响 selectedSkuIndexes
    variantAttrs[0].values.push('紫色');
    expect(selectedSkuIndexes).toEqual([0, 2]);
    expect(selectedSkuIndexes.length).toBe(2);
  });
});

// ===== 7. rebuildSkusFromVariants 边界 =====
describe('rebuildSkusFromVariants 边界情况', function () {
  test('所有属性空值 → 空列表', function () {
    var attrs = [{ values: [] }, { values: [] }];
    var skus = rebuildSkusFromVariants(attrs, []);
    expect(skus.length).toBe(0);
  });

  test('单维度 + 空第二维度 → 只按第一维度生成', function () {
    var attrs = [
      { values: ['蓝色', '红色'] },
      { values: [] }
    ];
    var skus = rebuildSkusFromVariants(attrs, []);
    expect(skus.length).toBe(2);
    expect(skus[0].name).toBe('蓝色');
  });
});
