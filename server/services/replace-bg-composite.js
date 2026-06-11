// 换背景服务 — 抠图 + 合成，一步到位
// 流程：原图 → 抠前景（ISNet/ComfyUI Rembg）→ 缩放适配 → 合成到新背景
const sharp = require('sharp');
const removeBgService = require('./remove-bg');

var comfyuiInpaint = null;
try { comfyuiInpaint = require('./comfyui-inpaint'); } catch (e) {}

/**
 * 替换商品图背景
 * @param {Buffer} productBuf - 商品图（任意格式）
 * @param {Buffer} backgroundBuf - 新背景图
 * @param {Object} options
 * @param {number} options.scale - 商品在背景中的占比 0.1-1.0，默认 0.7
 * @param {string} options.position - 商品位置 center/top/bottom/left/right，默认 center
 * @param {number} options.padding - 商品离边缘的像素比例 0-0.3，默认 0.05
 * @param {boolean} options.shadow - 是否加投影，默认 true
 * @returns {Promise<Buffer>} 换背景后的 PNG
 */
async function replaceBackground(productBuf, backgroundBuf, options) {
  options = options || {};
  var scale = Math.max(0.1, Math.min(1.0, options.scale || 0.7));
  var position = options.position || 'center';
  var padding = Math.max(0, Math.min(0.3, options.padding !== undefined ? options.padding : 0.05));
  var addShadow = options.shadow !== false;

  console.log('[replace-bg] 开始, scale=' + scale + ', position=' + position + ', shadow=' + addShadow + ', skipCutout=' + !!options.skipCutout);
  var t0 = Date.now();

  // Step 1: 抠出前景（或跳过）
  var foregroundBuf;
  if (options.skipCutout) {
    console.log('[replace-bg] 跳过抠图，直接使用输入图作为前景');
    foregroundBuf = productBuf;
  } else if (comfyuiInpaint && comfyuiInpaint.isAvailable()) {
    console.log('[replace-bg] 使用 ComfyUI Rembg 抠图');
    foregroundBuf = await comfyuiInpaint.removeBackground(productBuf);
  } else {
    console.log('[replace-bg] 使用 ISNet 本地抠图');
    foregroundBuf = await removeBgService.removeBackground(productBuf);
  }

  // Step 2: 获取尺寸信息
  var fgMeta = await sharp(foregroundBuf).metadata();
  var bgMeta = await sharp(backgroundBuf).metadata();
  var bgW = bgMeta.width;
  var bgH = bgMeta.height;
  var fgW = fgMeta.width;
  var fgH = fgMeta.height;

  // Step 3: 计算商品在背景中的缩放
  // scale=1.0 时商品填满背景（减去padding），scale=0.5 时商品占一半
  var maxW = bgW * (1 - padding * 2);
  var maxH = bgH * (1 - padding * 2);
  var fitScale = Math.min(maxW / fgW, maxH / fgH) * scale;
  var newW = Math.round(fgW * fitScale);
  var newH = Math.round(fgH * fitScale);

  // Step 4: 缩放前景
  var resized = await sharp(foregroundBuf)
    .resize(newW, newH, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  // Step 5: 计算位置（居中偏移）
  var offsetX, offsetY;
  var padPx_x = Math.round(bgW * padding);
  var padPx_y = Math.round(bgH * padding);
  switch (position) {
    case 'top':
      offsetX = Math.round((bgW - newW) / 2);
      offsetY = padPx_y;
      break;
    case 'bottom':
      offsetX = Math.round((bgW - newW) / 2);
      offsetY = bgH - newH - padPx_y;
      break;
    case 'left':
      offsetX = padPx_x;
      offsetY = Math.round((bgH - newH) / 2);
      break;
    case 'right':
      offsetX = bgW - newW - padPx_x;
      offsetY = Math.round((bgH - newH) / 2);
      break;
    default: // center
      offsetX = Math.round((bgW - newW) / 2);
      offsetY = Math.round((bgH - newH) / 2);
  }

  // Step 6: 合成
  var compositeBuf;
  if (addShadow) {
    // 投影：alpha 通道 → 灰度图 → 偏移叠加
    var shadowGray = await sharp(resized)
      .extractChannel(3)
      .blur(10)
      .toBuffer();
    var shadowRgba = await sharp(shadowGray)
      .joinChannel(shadowGray)
      .joinChannel(shadowGray)
      .joinChannel(shadowGray)
      .raw()
      .toBuffer()
      .then(function(raw) {
        // 降低 alpha（50%透明度投影）
        var result = Buffer.alloc(raw.length);
        var px = raw.length / 4;
        for (var i = 0; i < px; i++) {
          result[i * 4] = 0;
          result[i * 4 + 1] = 0;
          result[i * 4 + 2] = 0;
          result[i * 4 + 3] = Math.round(raw[i * 4 + 3] * 0.4);
        }
        return sharp(result, { raw: { width: newW, height: newH, channels: 4 } }).png().toBuffer();
      });

    compositeBuf = await sharp(backgroundBuf)
      .composite([
        { input: shadowRgba, blend: 'over', left: offsetX + 5, top: offsetY + 5 },
        { input: resized, blend: 'over', left: offsetX, top: offsetY }
      ])
      .png()
      .toBuffer();
  } else {
    compositeBuf = await sharp(backgroundBuf)
      .composite([
        { input: resized, blend: 'over', left: offsetX, top: offsetY }
      ])
      .png()
      .toBuffer();
  }

  console.log('[replace-bg] 完成, 耗时:', Date.now() - t0, 'ms');
  return compositeBuf;
}

module.exports = { replaceBackground: replaceBackground };
