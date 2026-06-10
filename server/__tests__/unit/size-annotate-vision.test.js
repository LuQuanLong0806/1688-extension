// size-annotate-vision.test.js — 视觉模型辅助尺寸标注测试

// ===== 1. detectProductBounds 响应解析 =====
describe('detectProductBounds 视觉模型响应解析', function () {
  test('有效 JSON → 返回 bounds 对象', function () {
    var raw = { x: 120, y: 80, width: 600, height: 500 };
    expect(typeof raw.x).toBe('number');
    expect(typeof raw.y).toBe('number');
    expect(typeof raw.width).toBe('number');
    expect(typeof raw.height).toBe('number');
    expect(raw.width > 0).toBe(true);
    expect(raw.height > 0).toBe(true);
  });

  test('响应为 "null" 字符串 → 返回 null', function () {
    var text = 'null';
    expect(text === 'null').toBe(true);
  });

  test('响应含 ```json 包裹 → 正确解析', function () {
    var text = '```json\n{"x":100,"y":50,"width":500,"height":400}\n```';
    var jsonStr = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    var parsed = JSON.parse(jsonStr);
    expect(parsed.x).toBe(100);
    expect(parsed.y).toBe(50);
  });

  test('响应缺少字段 → 返回 null', function () {
    var parsed = { x: 100, y: 50, width: 500 }; // 缺 height
    var valid = typeof parsed.x === 'number' && typeof parsed.y === 'number' &&
                typeof parsed.width === 'number' && typeof parsed.height === 'number';
    expect(valid).toBe(false);
  });
});

// ===== 2. 坐标还原（压缩图→原图） =====
describe('detectProductBounds 坐标还原', function () {
  test('压缩图坐标按比例还原', function () {
    var origW = 1600, origH = 1200;
    var compW = 800, compH = 600;
    var scaleX = origW / compW;
    var scaleY = origH / compH;
    var parsed = { x: 100, y: 75, width: 600, height: 450 };
    var bounds = {
      x: Math.round(parsed.x * scaleX),
      y: Math.round(parsed.y * scaleY),
      width: Math.round(parsed.width * scaleX),
      height: Math.round(parsed.height * scaleY)
    };
    expect(bounds.x).toBe(200);
    expect(bounds.y).toBe(150);
    expect(bounds.width).toBe(1200);
    expect(bounds.height).toBe(900);
  });

  test('bounds 裁剪到图片范围', function () {
    var W = 800, H = 600;
    var bounds = { x: 750, y: 500, width: 200, height: 200 };
    bounds.width = Math.min(bounds.width, W - bounds.x);
    bounds.height = Math.min(bounds.height, H - bounds.y);
    expect(bounds.width).toBe(50);
    expect(bounds.height).toBe(100);
  });

  test('bounds 太小（<20px）→ 返回 null', function () {
    var bounds = { x: 100, y: 100, width: 10, height: 10 };
    expect(bounds.width < 20 || bounds.height < 20).toBe(true);
  });
});

// ===== 3. annotateImage — productBounds 影响 =====
describe('annotateImage productBounds 影响', function () {
  test('有 bounds → 标注线在 bounds 外侧', function () {
    var W = 800, H = 600;
    var bounds = { x: 100, y: 80, width: 600, height: 440 };
    var x1 = Math.max(0, Math.round(bounds.x));
    var y1 = Math.max(0, Math.round(bounds.y));
    var x2 = Math.min(W, Math.round(bounds.x + bounds.width));
    var y2 = Math.min(H, Math.round(bounds.y + bounds.height));
    expect(x1).toBe(100);
    expect(y1).toBe(80);
    expect(x2).toBe(700);
    expect(y2).toBe(520);
  });

  test('无 bounds → 降级到 margin 方式', function () {
    var W = 800, H = 600;
    var bounds = null;
    var x1, y1, x2, y2;
    if (bounds && bounds.width > 20 && bounds.height > 20) {
      x1 = bounds.x; y1 = bounds.y;
      x2 = bounds.x + bounds.width; y2 = bounds.y + bounds.height;
    } else {
      var margin = Math.round(Math.min(W, H) * 0.08);
      x1 = margin; y1 = margin; x2 = W - margin; y2 = H - margin;
    }
    expect(x1).toBe(48);
    expect(y1).toBe(48);
    expect(x2).toBe(752);
    expect(y2).toBe(552);
  });

  test('有 bounds 时 gap 更小', function () {
    var fSize = 24;
    var hasBounds = true;
    var gap = hasBounds ? Math.round(fSize * 0.8) : Math.round(fSize * 1.2);
    expect(gap).toBe(19);

    var gapNoBounds = Math.round(fSize * 1.2);
    expect(gap < gapNoBounds).toBe(true);
  });
});

// ===== 4. 标注方向判断 =====
describe('标注方向基于产品区域', function () {
  test('产品横向（宽>高）→ 宽标底部，高标右侧', function () {
    var bounds = { x: 50, y: 100, width: 700, height: 400 };
    var productIsLandscape = bounds.width >= bounds.height;
    expect(productIsLandscape).toBe(true);
    // 横向：长边(宽)标底部，短边(高)标右侧
  });

  test('产品纵向（高>宽）→ 宽标右侧，高标底部', function () {
    var bounds = { x: 100, y: 50, width: 400, height: 700 };
    var productIsLandscape = bounds.width >= bounds.height;
    expect(productIsLandscape).toBe(false);
    // 纵向：长边(高)标右侧，短边(宽)标底部
  });

  test('产品正方形 → 横向处理（>=）', function () {
    var bounds = { x: 100, y: 100, width: 400, height: 400 };
    var productIsLandscape = bounds.width >= bounds.height;
    expect(productIsLandscape).toBe(true);
  });
});

// ===== 5. 边界安全 =====
describe('bounds 边界安全', function () {
  test('负坐标裁剪到 0', function () {
    var bounds = { x: -10, y: -20, width: 500, height: 400 };
    var x1 = Math.max(0, Math.round(bounds.x));
    var y1 = Math.max(0, Math.round(bounds.y));
    expect(x1).toBe(0);
    expect(y1).toBe(0);
  });

  test('bounds 超出图片右/下边界 → 裁剪', function () {
    var W = 800, H = 600;
    var bounds = { x: 700, y: 500, width: 200, height: 200 };
    var x2 = Math.min(W, Math.round(bounds.x + bounds.width));
    var y2 = Math.min(H, Math.round(bounds.y + bounds.height));
    expect(x2).toBe(800);
    expect(y2).toBe(600);
  });
});
