// LaMa ONNX 推理服务 — 图像修复（消除水印/文字/LOGO）
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

let session = null;
let sessionLoading = false;
const MODEL_PATH = path.join(__dirname, '..', 'models', 'lama.onnx');

// 延迟加载ONNX模型（首次调用时加载，约需2-3秒）
async function getSession() {
  if (session) return session;
  if (sessionLoading) {
    while (sessionLoading) await new Promise(r => setTimeout(r, 200));
    return session;
  }
  if (!fs.existsSync(MODEL_PATH)) throw new Error('LaMa模型文件不存在: ' + MODEL_PATH);
  sessionLoading = true;
  try {
    const ort = require('onnxruntime-node');
    session = await ort.InferenceSession.create(MODEL_PATH, {
      executionProviders: ['cpu'],
      graphOptimizationLevel: 'all'
    });
    console.log('[LaMa] ONNX模型加载完成, inputs:', session.inputNames, 'outputs:', session.outputNames);
    return session;
  } finally {
    sessionLoading = false;
  }
}

// 图像+mask → 修复后图像buffer (PNG)
async function inpaint(imageBuffer, maskBuffer) {
  const sess = await getSession();
  const ort = require('onnxruntime-node');

  // 1. 获取原图尺寸
  const meta = await sharp(imageBuffer).metadata();
  const origW = meta.width;
  const origH = meta.height;

  // 2. 缩放到512x512（LaMa标准输入）
  const TARGET = 512;
  const resizedImg = await sharp(imageBuffer)
    .resize(TARGET, TARGET, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer();

  const resizedMask = await sharp(maskBuffer)
    .resize(TARGET, TARGET, { fit: 'fill' })
    .grayscale()
    .threshold(128)
    .raw()
    .toBuffer();

  // 3. 构造两个独立输入tensor
  // image: [1, 3, H, W] - RGB归一化
  const imgData = new Float32Array(3 * TARGET * TARGET);
  for (let i = 0; i < TARGET * TARGET; i++) {
    imgData[i] = resizedImg[i * 3] / 255.0;
    imgData[i + TARGET * TARGET] = resizedImg[i * 3 + 1] / 255.0;
    imgData[i + TARGET * TARGET * 2] = resizedImg[i * 3 + 2] / 255.0;
  }

  // mask: [1, 1, H, W] - 白色=需修复区域
  const mskData = new Float32Array(TARGET * TARGET);
  for (let i = 0; i < TARGET * TARGET; i++) {
    mskData[i] = resizedMask[i] / 255.0;
  }

  const imageTensor = new ort.Tensor('float32', imgData, [1, 3, TARGET, TARGET]);
  const maskTensor = new ort.Tensor('float32', mskData, [1, 1, TARGET, TARGET]);

  // 4. 推理
  const feeds = {};
  feeds[sess.inputNames[0]] = imageTensor;  // 'image'
  feeds[sess.inputNames[1]] = maskTensor;   // 'mask'

  const results = await sess.run(feeds);
  const output = results[sess.outputNames[0]];  // 'output'

  // 5. 输出tensor → PNG buffer
  // 注意：该模型输出值已经在 0-255 范围，不需要再乘255
  const outData = output.data;
  const outShape = output.dims;
  const outH = outShape[2] || TARGET;
  const outW = outShape[3] || TARGET;
  const outChannels = outShape[1] || 3;

  let rgbBuf;
  if (outChannels === 1) {
    rgbBuf = Buffer.alloc(outH * outW * 3);
    for (let i = 0; i < outH * outW; i++) {
      const v = Math.max(0, Math.min(255, Math.round(outData[i])));
      rgbBuf[i * 3] = v;
      rgbBuf[i * 3 + 1] = v;
      rgbBuf[i * 3 + 2] = v;
    }
  } else {
    rgbBuf = Buffer.alloc(outH * outW * 3);
    for (let i = 0; i < outH * outW; i++) {
      rgbBuf[i * 3] = Math.max(0, Math.min(255, Math.round(outData[i])));
      rgbBuf[i * 3 + 1] = Math.max(0, Math.min(255, Math.round(outData[i + outH * outW])));
      rgbBuf[i * 3 + 2] = Math.max(0, Math.min(255, Math.round(outData[i + outH * outW * 2])));
    }
  }

  // 6. 缩放回原图尺寸
  const resultPng = await sharp(rgbBuf, { raw: { width: outW, height: outH, channels: 3 } })
    .resize(origW, origH, { fit: 'fill' })
    .png()
    .toBuffer();

  return resultPng;
}

function isModelAvailable() {
  return fs.existsSync(MODEL_PATH);
}

module.exports = { inpaint, isModelAvailable, getSession };
