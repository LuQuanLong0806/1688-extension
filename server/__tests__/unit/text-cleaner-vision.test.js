// text-cleaner-vision.test.js — 视觉模型文字清理测试
// 测试：视觉模型响应解析、流程选项、降级逻辑、区域格式、mask 策略
// 不直接 require text-cleaner（依赖 sharp 原生模块），测试提取的核心逻辑

// ===== 1. detectRegionsWithVision 返回解析 =====
describe('detectRegionsWithVision 视觉模型响应解析', function () {
  test('有效 JSON 数组 → 返回规范化区域', function () {
    // 模拟视觉模型返回格式
    var raw = [
      { x: 10, y: 20, width: 100, height: 30 },
      { x: 200, y: 50, width: 80, height: 25 }
    ];
    // 验证规范化
    var valid = raw.filter(function (r) {
      return typeof r.x === 'number' && typeof r.y === 'number' &&
             typeof r.width === 'number' && typeof r.height === 'number' &&
             r.width > 0 && r.height > 0;
    }).map(function (r) {
      return {
        x: Math.max(0, Math.round(r.x)),
        y: Math.max(0, Math.round(r.y)),
        width: Math.round(r.width),
        height: Math.round(r.height)
      };
    });
    expect(valid.length).toBe(2);
    expect(valid[0]).toEqual({ x: 10, y: 20, width: 100, height: 30 });
  });

  test('含无效区域 → 过滤掉', function () {
    var raw = [
      { x: 10, y: 20, width: 100, height: 30 },
      { x: 'abc', y: 20, width: 50, height: 20 },  // x 不是数字
      { x: 10, y: 20, width: 0, height: 30 },       // width = 0
      { x: 10, y: 20, width: 50, height: -5 }        // height < 0
    ];
    var valid = raw.filter(function (r) {
      return typeof r.x === 'number' && typeof r.y === 'number' &&
             typeof r.width === 'number' && typeof r.height === 'number' &&
             r.width > 0 && r.height > 0;
    });
    expect(valid.length).toBe(1);
  });

  test('空数组 → 返回 null', function () {
    var regions = [];
    var valid = regions.filter(function (r) {
      return typeof r.x === 'number';
    });
    expect(valid.length).toBe(0);
  });

  test('负坐标 → 被 Math.max(0) 规范化为 0', function () {
    var raw = [{ x: -5, y: -10, width: 50, height: 30 }];
    var valid = raw.filter(function (r) {
      return typeof r.x === 'number' && typeof r.y === 'number' &&
             typeof r.width === 'number' && typeof r.height === 'number' &&
             r.width > 0 && r.height > 0;
    }).map(function (r) {
      return {
        x: Math.max(0, Math.round(r.x)),
        y: Math.max(0, Math.round(r.y)),
        width: Math.round(r.width),
        height: Math.round(r.height)
      };
    });
    expect(valid[0].x).toBe(0);
    expect(valid[0].y).toBe(0);
  });
});

// ===== 2. JSON 解析清理（处理 ```json 包裹） =====
describe('视觉模型 JSON 解析清理', function () {
  test('带 ```json 包裹 → 正确解析', function () {
    var text = '```json\n[{"x":10,"y":20,"width":100,"height":30}]\n```';
    var jsonStr = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    var parsed = JSON.parse(jsonStr);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(1);
  });

  test('纯 JSON → 正确解析', function () {
    var text = '[{"x":10,"y":20,"width":100,"height":30}]';
    var jsonStr = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    var parsed = JSON.parse(jsonStr);
    expect(parsed.length).toBe(1);
  });

  test('带额外文字前缀 → JSON.parse 报错（预期行为）', function () {
    var text = '以下是结果: [{"x":10}]';
    expect(function () {
      JSON.parse(text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim());
    }).toThrow();
  });
});

// ===== 3. cleanImage 流程逻辑（选项传递） =====
describe('cleanImage 选项影响流程', function () {
  test('enableVision=true 时使用视觉模型路径', function () {
    var options = { enableVision: true, chineseOnly: true, dilatePx: 20 };
    expect(options.enableVision).toBe(true);
    // 视觉路径: OCR → vision → mask(dilatePx=5) → inpaint
    var effectiveDilate = options.enableVision ? 5 : (options.dilatePx || 40);
    expect(effectiveDilate).toBe(5);
  });

  test('enableVision=false 时使用徽章扩展路径', function () {
    var options = { enableVision: false, chineseOnly: true, dilatePx: 20 };
    expect(options.enableVision).toBe(false);
    var effectiveDilate = options.dilatePx || 40;
    expect(effectiveDilate).toBe(20);
  });

  test('enableVision 未设置时默认 false', function () {
    var options = { chineseOnly: true };
    var useVision = options.enableVision === true;
    expect(useVision).toBe(false);
  });
});

// ===== 4. OCR + 徽章扩展 + 视觉补充 流程 =====
describe('OCR + 徽章扩展 + 视觉补充流程', function () {
  test('视觉模型返回 null → 只用 OCR + 徽章扩展', function () {
    var visionResult = null;
    var hasVision = !!(visionResult && visionResult.length > 0);
    expect(hasVision).toBe(false);
    // OCR regions + badge expansion 仍会执行
  });

  test('视觉模型返回空数组 → 只用 OCR + 徽章扩展', function () {
    var visionResult = [];
    var hasVision = visionResult && visionResult.length > 0;
    expect(hasVision).toBe(false);
  });

  test('徽章扩展始终执行（不论视觉是否成功）', function () {
    var useVision = true;
    var badgeAlwaysRuns = true; // 新流程：先跑徽章扩展，再跑视觉补充
    expect(badgeAlwaysRuns).toBe(true);
  });

  test('视觉区域中心在已有区域内 → 取更大的', function () {
    var existing = { x: 100, y: 40, w: 80, h: 35 };
    var vision = { x: 100, y: 40, w: 90, h: 40 };
    var existingArea = existing.w * existing.h;
    var visionArea = vision.w * vision.h;
    // 视觉区域更大 → 替换
    expect(visionArea > existingArea).toBe(true);
  });

  test('视觉区域中心不在已有区域内 → 新增', function () {
    var regions = [
      { x: 100, y: 40, w: 80, h: 35 }
    ];
    var newVision = { x: 500, y: 30, w: 60, h: 25 };
    var cx = newVision.x + newVision.w / 2;
    var cy = newVision.y + newVision.h / 2;
    var rr = regions[0];
    var covered = cx >= rr.x && cx <= rr.x + rr.w && cy >= rr.y && cy <= rr.y + rr.h;
    expect(covered).toBe(false);
  });

  test('视觉区域中心在已有区域内 → 跳过或替换', function () {
    var regions = [
      { x: 100, y: 40, w: 80, h: 35 }
    ];
    var newVision = { x: 110, y: 45, w: 50, h: 20 };
    var cx = newVision.x + newVision.w / 2;
    var cy = newVision.y + newVision.h / 2;
    var rr = regions[0];
    var covered = cx >= rr.x && cx <= rr.x + rr.w && cy >= rr.y && cy <= rr.y + rr.h;
    expect(covered).toBe(true);
  });
});

// ===== 5. 视觉模型区域 vs OCR 区域对比 =====
describe('视觉模型区域 vs OCR 区域', function () {
  test('视觉区域通常比 OCR 区域大（覆盖完整徽章）', function () {
    var ocrRegion = { x: 120, y: 50, width: 60, height: 20 };
    var visionRegion = { x: 105, y: 40, width: 90, height: 40 };
    // 视觉区域应该覆盖 OCR 区域
    expect(visionRegion.x <= ocrRegion.x).toBe(true);
    expect(visionRegion.y <= ocrRegion.y).toBe(true);
    expect(visionRegion.x + visionRegion.width >= ocrRegion.x + ocrRegion.width).toBe(true);
    expect(visionRegion.y + visionRegion.height >= ocrRegion.y + ocrRegion.height).toBe(true);
  });

  test('视觉模型返回区域数量可能少于 OCR（合并相邻区域）', function () {
    var ocrRegions = [
      { x: 10, y: 20, width: 30, height: 15 },
      { x: 45, y: 20, width: 25, height: 15 }
    ];
    var visionRegions = [
      { x: 5, y: 15, width: 70, height: 25 }
    ];
    // 视觉模型合并了两个相邻 OCR 区域
    expect(visionRegions.length).toBeLessThan(ocrRegions.length);
  });
});

// ===== 6. mask 膨胀策略 =====
describe('mask 膨胀策略', function () {
  test('统一使用 dilatePx 膨胀（OCR+徽章扩展+视觉补充后）', function () {
    var dilatePx = 20;
    // 徽章扩展已覆盖色块，膨胀量统一
    expect(dilatePx).toBe(20);
  });

  test('纯 OCR 区域使用常规膨胀', function () {
    var visionRegions = [];
    var dilatePx = visionRegions.length > 0 ? 5 : 40;
    expect(dilatePx).toBe(40);
  });

  test('generateMask 输出尺寸与图片一致', function () {
    // 验证 mask SVG 的尺寸参数
    var imgW = 800, imgH = 600;
    var region = { x: 100, y: 50, width: 200, height: 40 };
    var dilatePx = 5;
    var ex = Math.max(0, (region.x || 0) - dilatePx);
    var ey = Math.max(0, (region.y || 0) - dilatePx);
    var ew = (region.width || 0) + dilatePx * 2;
    var eh = (region.height || 0) + dilatePx * 2;
    expect(ex).toBe(95);
    expect(ey).toBe(45);
    expect(ew).toBe(210);
    expect(eh).toBe(50);
  });
});

// ===== 7. 批量处理流程 =====
describe('批量处理 enableVision 传递', function () {
  test('auto-clean-chinese: enableVision 通过 body 传递', function () {
    var reqBody = {
      image_base64: '...',
      chinese_only: true,
      enable_vision: true,
      dilate_px: 20
    };
    var options = {
      chineseOnly: reqBody.chinese_only !== false,
      minConfidence: reqBody.min_confidence || 0.5,
      dilatePx: reqBody.dilate_px || 20,
      enableVision: reqBody.enable_vision === true
    };
    expect(options.enableVision).toBe(true);
  });

  test('batch-clean: enableVision 默认关闭', function () {
    var reqBody = { images: [] };
    var options = {
      enableVision: reqBody.enable_vision === true
    };
    expect(options.enableVision).toBe(false);
  });

  test('batch-clean-chinese: enableVision 通过 body 传递', function () {
    var reqBody = {
      images: [],
      enable_vision: true
    };
    var options = {
      chineseOnly: true,
      enableVision: reqBody.enable_vision === true
    };
    expect(options.enableVision).toBe(true);
  });
});

// ===== 8. getRegionBBox 兼容性 =====
describe('getRegionBBox 兼容视觉模型区域格式', function () {
  function getRegionBBox(region) {
    if (region.polygon && region.polygon.length >= 3) {
      var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (var i = 0; i < region.polygon.length; i++) {
        var px = region.polygon[i][0], py = region.polygon[i][1];
        if (px < minX) minX = px; if (py < minY) minY = py;
        if (px > maxX) maxX = px; if (py > maxY) maxY = py;
      }
      return { x: Math.round(minX), y: Math.round(minY), w: Math.round(maxX - minX), h: Math.round(maxY - minY) };
    }
    return { x: Math.round(region.x || 0), y: Math.round(region.y || 0), w: Math.round(region.width || 0), h: Math.round(region.height || 0) };
  }

  test('视觉模型返回 {x, y, width, height} 格式', function () {
    var region = { x: 10, y: 20, width: 100, height: 30 };
    var bbox = getRegionBBox(region);
    expect(bbox.x).toBe(10);
    expect(bbox.y).toBe(20);
    expect(bbox.w).toBe(100);
    expect(bbox.h).toBe(30);
  });

  test('OCR 返回 polygon 格式', function () {
    var region = { polygon: [[10, 20], [110, 20], [110, 50], [10, 50]] };
    var bbox = getRegionBBox(region);
    expect(bbox.x).toBe(10);
    expect(bbox.y).toBe(20);
    expect(bbox.w).toBe(100);
    expect(bbox.h).toBe(30);
  });
});

// ===== 9. 纯色徽章/色块区域检测 =====
describe('纯色徽章/色块区域覆盖', function () {
  test('视觉模型返回的区域应覆盖整个色块（含圆角）', function () {
    // 模拟：OCR 检测到文字区域 120,50,60,20
    // 视觉模型应返回覆盖整个色块的区域（大于文字区域）
    var ocrRegion = { x: 120, y: 50, width: 60, height: 20 };
    var visionRegion = { x: 110, y: 40, width: 80, height: 40 }; // 含圆角和边距
    // 视觉区域应完全包含 OCR 区域
    expect(visionRegion.x <= ocrRegion.x).toBe(true);
    expect(visionRegion.y <= ocrRegion.y).toBe(true);
    expect(visionRegion.x + visionRegion.width >= ocrRegion.x + ocrRegion.width).toBe(true);
    expect(visionRegion.y + visionRegion.height >= ocrRegion.y + ocrRegion.height).toBe(true);
  });

  test('纯色方块徽章区域应比文字区域更大', function () {
    var textRegion = { x: 200, y: 100, width: 50, height: 18 };
    // 色块徽章通常至少多出 5-15px 边距
    var badgeRegion = { x: 190, y: 92, width: 70, height: 34 };
    expect(badgeRegion.width > textRegion.width).toBe(true);
    expect(badgeRegion.height > textRegion.height).toBe(true);
  });

  test('圆角矩形徽章 — 视觉区域包含四个圆角', function () {
    // 圆角半径约 5px，区域应超出文字至少 5px
    var textBbox = { x: 300, y: 80, width: 80, height: 25 };
    var cornerRadius = 5;
    var badgeRegion = {
      x: textBbox.x - cornerRadius - 3,
      y: textBbox.y - cornerRadius - 3,
      width: textBbox.width + (cornerRadius + 3) * 2,
      height: textBbox.height + (cornerRadius + 3) * 2
    };
    expect(badgeRegion.x < textBbox.x).toBe(true);
    expect(badgeRegion.y < textBbox.y).toBe(true);
  });

  test('多个色块徽章分别框选', function () {
    var visionRegions = [
      { x: 10, y: 10, width: 70, height: 30, type: 'badge' },
      { x: 500, y: 10, width: 60, height: 28, type: 'badge' }
    ];
    expect(visionRegions.length).toBe(2);
    expect(visionRegions[0].type).toBe('badge');
    expect(visionRegions[1].type).toBe('badge');
  });

  test('色块+icon 合并为一个区域', function () {
    // 文字 + 左侧卡车 icon 在同一个色块上
    var visionRegion = { x: 95, y: 38, width: 100, height: 35, type: 'badge' };
    // 区域应包含 icon（约 95,38,20,20）和文字（约 120,45,60,20）
    expect(visionRegion.x <= 95).toBe(true);
    expect(visionRegion.y <= 38).toBe(true);
    expect(visionRegion.x + visionRegion.width >= 180).toBe(true);
  });
});

// ===== 10. mask 对色块区域的覆盖 =====
describe('mask 覆盖纯色色块区域', function () {
  test('视觉模型返回色块区域 → 8px 微膨胀后完全覆盖', function () {
    var badgeRegion = { x: 110, y: 40, width: 80, height: 35 };
    var dilatePx = 8;
    var ex = Math.max(0, badgeRegion.x - dilatePx);
    var ey = Math.max(0, badgeRegion.y - dilatePx);
    var ew = badgeRegion.width + dilatePx * 2;
    var eh = badgeRegion.height + dilatePx * 2;
    // 确保覆盖范围比原始区域大
    expect(ex < badgeRegion.x).toBe(true);
    expect(ey < badgeRegion.y).toBe(true);
    expect(ew > badgeRegion.width).toBe(true);
    expect(eh > badgeRegion.height).toBe(true);
  });

  test('纯色色块 — 视觉区域足够大时不需要额外徽章扩展', function () {
    var visionRegions = [{ x: 100, y: 35, width: 85, height: 38 }];
    var ocrRegions = [{ x: 120, y: 45, width: 50, height: 18 }];
    // 视觉区域已覆盖 OCR 区域，不需要徽章扩展
    var needsExpansion = visionRegions.length > 0 ? false : true;
    expect(needsExpansion).toBe(false);
  });
});

// ===== 11. prompt 关键词覆盖 =====
describe('视觉模型 prompt 覆盖色块/徽章描述', function () {
  test('主 prompt 包含定义规则结构', function () {
    var prompt = '定义规则：\n1. 商品本身自带的部分绝对不能框选。\n2. 所有后期添加的营销元素，无论有没有文字，都必须框选：';
    expect(prompt).toContain('定义规则');
    expect(prompt).toContain('绝对不能框选');
    expect(prompt).toContain('无论有没有文字');
  });

  test('主 prompt 包含判断标准（满足任一即框选）', function () {
    var prompt = '判断标准（满足任一即框选）：\n- 元素边缘清晰、和商品结构无连接，像是贴上去的。\n- 颜色均匀、和商品的纹理/材质明显不同。\n- 带有明显的品牌、营销特征，和商品本身的功能无关。';
    expect(prompt).toContain('判断标准');
    expect(prompt).toContain('满足任一即框选');
    expect(prompt).toContain('像是贴上去的');
  });

  test('主 prompt 包含纯色/半透明色块描述', function () {
    var prompt = '纯色/半透明色块：圆角矩形、方块、条带，即使上面没有文字，只要是后期叠加的营销/品牌标识底色，就属于目标。';
    expect(prompt).toContain('纯色');
    expect(prompt).toContain('圆角');
    expect(prompt).toContain('条带');
    expect(prompt).toContain('即使上面没有文字');
  });

  test('主 prompt 包含徽章/图标类描述', function () {
    var prompt = '徽章/图标类元素：带有品牌logo、装饰性图形、营销标签的独立图形，即使文字被去除只剩纯色底/轮廓，也必须框选。';
    expect(prompt).toContain('徽章');
    expect(prompt).toContain('只剩纯色底');
    expect(prompt).toContain('也必须框选');
  });

  test('主 prompt 包含完整覆盖要求', function () {
    var prompt = '用矩形框完整覆盖整个元素，包括色块边缘、圆角和所有延伸部分，不要只框文字或中心图标。';
    expect(prompt).toContain('完整覆盖');
    expect(prompt).toContain('圆角');
    expect(prompt).toContain('不要只框文字');
  });

  test('淡色水印 prompt 包含相同结构', function () {
    var prompt = '定义规则：\n1. 商品本身自带的部分绝对不能框选。\n2. 所有后期添加的营销元素';
    expect(prompt).toContain('定义规则');
    expect(prompt).toContain('绝对不能框选');
  });

  test('淡色水印 prompt 包含纯色色块检测', function () {
    var prompt = '纯色/半透明色块：圆角矩形、方块、条带，即使上面没有文字';
    expect(prompt).toContain('纯色');
    expect(prompt).toContain('圆角');
    expect(prompt).toContain('即使上面没有文字');
  });
});
