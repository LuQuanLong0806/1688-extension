// collage.test.js — 拼图工具核心逻辑单元测试
// 测试自动布局算法和选中逻辑

// ===== 自动布局计算（从 meitu-collage.js 提取的核心算法） =====
function calcAutoLayout(n, boardW, boardH, selCols, selRows, gap) {
  if (!n) return [];
  gap = gap || 4;

  var cols, rows;
  if (selCols > 0 && selRows > 0) {
    cols = selCols;
    rows = selRows;
  } else {
    var ratio = boardW / boardH;
    cols = Math.ceil(Math.sqrt(n * ratio));
    rows = Math.ceil(n / cols);
  }

  var cellW = (boardW - gap * (cols + 1)) / cols;
  var cellH = (boardH - gap * (rows + 1)) / rows;

  var result = [];
  var count = Math.min(n, cols * rows);
  for (var idx = 0; idx < count; idx++) {
    var col = idx % cols;
    var row = Math.floor(idx / cols);
    result.push({
      x: Math.round(gap + col * (cellW + gap)),
      y: Math.round(gap + row * (cellH + gap)),
      w: Math.round(cellW),
      h: Math.round(cellH),
      col: col,
      row: row
    });
  }
  return result;
}

// ===== 图片来源优先级（模拟一键拼图的选择逻辑） =====
function selectImagesForLayout(checkedItems, canvasPoolItems, allPoolItems) {
  if (checkedItems.length > 0) return checkedItems;
  if (canvasPoolItems.length > 0) return canvasPoolItems;
  return allPoolItems;
}

// ===== 选中图片获取（画布选中优先，其次勾选图片池） =====
function getSelectedImage(selectedCanvasItem, checkedPoolIds, poolItems) {
  if (selectedCanvasItem && selectedCanvasItem.src) return selectedCanvasItem.src;
  if (checkedPoolIds.length > 0) {
    var p = poolItems.find(function (p) { return p.id === checkedPoolIds[0]; });
    if (p) return p.src;
  }
  return null;
}

describe('拼图工具 — 自动布局计算', () => {
  test('1张图片：1×1布局', () => {
    var layout = calcAutoLayout(1, 800, 800, 0, 0);
    expect(layout.length).toBe(1);
    expect(layout[0].w).toBe(792); // 800 - 4*(1+1) = 792
    expect(layout[0].h).toBe(792);
    expect(layout[0].x).toBe(4);
    expect(layout[0].y).toBe(4);
  });

  test('4张图片：自动2×2布局', () => {
    var layout = calcAutoLayout(4, 800, 800, 0, 0);
    expect(layout.length).toBe(4);
    // 正方形画布 4张 → 2×2
    expect(layout[0].col).toBe(0); expect(layout[0].row).toBe(0);
    expect(layout[1].col).toBe(1); expect(layout[1].row).toBe(0);
    expect(layout[2].col).toBe(0); expect(layout[2].row).toBe(1);
    expect(layout[3].col).toBe(1); expect(layout[3].row).toBe(1);
    // 每格尺寸
    var cellW = (800 - 4 * 3) / 2;
    expect(layout[0].w).toBe(Math.round(cellW));
  });

  test('6张图片：自动布局', () => {
    var layout = calcAutoLayout(6, 800, 800, 0, 0);
    expect(layout.length).toBe(6);
    // 正方形画布 ratio=1, sqrt(6*1)=2.449, ceil=3 cols
    // rows = ceil(6/3) = 2
    // 所以 3×2 = 6 格
  });

  test('指定3×3布局，但只有5张图', () => {
    var layout = calcAutoLayout(5, 800, 800, 3, 3);
    expect(layout.length).toBe(5); // 只排5张，不填满9格
    // 每格尺寸
    var cellW = (800 - 4 * 4) / 3;
    expect(layout[0].w).toBe(Math.round(cellW));
  });

  test('指定2×3布局（2列3行）', () => {
    var layout = calcAutoLayout(6, 800, 800, 2, 3);
    expect(layout.length).toBe(6);
    expect(layout[0].col).toBe(0); expect(layout[0].row).toBe(0);
    expect(layout[1].col).toBe(1); expect(layout[1].row).toBe(0);
    expect(layout[2].col).toBe(0); expect(layout[2].row).toBe(1);
  });

  test('0张图片返回空数组', () => {
    var layout = calcAutoLayout(0, 800, 800, 0, 0);
    expect(layout).toEqual([]);
  });

  test('1张图片指定为2×2布局：只排1张', () => {
    var layout = calcAutoLayout(1, 800, 800, 2, 2);
    expect(layout.length).toBe(1);
  });

  test('长方形画布（1200×800）自动布局', () => {
    var layout = calcAutoLayout(6, 1200, 800, 0, 0);
    expect(layout.length).toBe(6);
    // ratio = 1.5, sqrt(6*1.5) = 3, ceil=3 cols
    // rows = ceil(6/3) = 2
    var cellW = (1200 - 4 * 4) / 3;
    expect(layout[0].w).toBe(Math.round(cellW));
  });

  test('所有图片不超出画布范围', () => {
    var layout = calcAutoLayout(12, 800, 800, 4, 3);
    layout.forEach(function (item) {
      expect(item.x + item.w).toBeLessThanOrEqual(800);
      expect(item.y + item.h).toBeLessThanOrEqual(800);
    });
  });

  test('图片间有间距（不重叠）', () => {
    var layout = calcAutoLayout(4, 800, 800, 2, 2);
    // 左上和右上不重叠
    expect(layout[1].x).toBeGreaterThan(layout[0].x + layout[0].w);
    // 左上和左下不重叠
    expect(layout[2].y).toBeGreaterThan(layout[0].y + layout[0].h);
  });

  test('指定布局优先于自动计算', () => {
    var auto = calcAutoLayout(6, 800, 800, 0, 0);
    var manual = calcAutoLayout(6, 800, 800, 2, 3);
    // 手动指定2列，自动可能是3列
    var autoMaxCol = Math.max(...auto.map(r => r.col));
    var manualMaxCol = Math.max(...manual.map(r => r.col));
    expect(manualMaxCol).toBe(1); // 0-indexed, 2 cols → max col=1
  });
});

describe('拼图工具 — 图片来源优先级', () => {
  var pool = [
    { id: 1, src: 'a.jpg' },
    { id: 2, src: 'b.jpg' },
    { id: 3, src: 'c.jpg' }
  ];

  test('勾选图片优先', () => {
    var checked = [pool[0], pool[2]];
    var result = selectImagesForLayout(checked, [pool[1]], pool);
    expect(result).toBe(checked);
  });

  test('无勾选时用画布已有图片', () => {
    var canvasItems = [pool[1]];
    var result = selectImagesForLayout([], canvasItems, pool);
    expect(result).toBe(canvasItems);
  });

  test('无勾选无画布图片时用全部', () => {
    var result = selectImagesForLayout([], [], pool);
    expect(result).toBe(pool);
  });
});

describe('拼图工具 — 选中图片获取', () => {
  var pool = [
    { id: 1, src: 'a.jpg' },
    { id: 2, src: 'b.jpg' }
  ];

  test('画布有选中时返回画布图片', () => {
    var result = getSelectedImage({ src: 'canvas.jpg' }, [1], pool);
    expect(result).toBe('canvas.jpg');
  });

  test('画布无选中时返回第一个勾选图片', () => {
    var result = getSelectedImage(null, [2], pool);
    expect(result).toBe('b.jpg');
  });

  test('画布无选中且无勾选返回null', () => {
    var result = getSelectedImage(null, [], pool);
    expect(result).toBe(null);
  });

  test('画布选中无src时回退到勾选图片', () => {
    var result = getSelectedImage({ src: null }, [1], pool);
    expect(result).toBe('a.jpg');
  });
});
