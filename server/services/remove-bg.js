// AI抠图 — onnxruntime-node + ISNet model (server-side)
const ort = require('onnxruntime-node');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const https = require('https');

const MODEL_DIR = path.join(__dirname, '..', '.models');
const MODEL_FILE = path.join(MODEL_DIR, 'isnet_quint8.onnx');
const RES_BASE = 'https://staticimgly.com/@imgly/background-removal-data/1.7.0/dist/';
const RESOURCES_URL = RES_BASE + 'resources.json';

var session = null;

function fetchJSON(url) {
  return new Promise(function (resolve, reject) {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, function (res) {
      var data = '';
      res.on('data', function (c) { data += c; });
      res.on('end', function () {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

function fetchBuffer(url) {
  return new Promise(function (resolve, reject) {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, function (res) {
      var chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () { resolve(Buffer.concat(chunks)); });
    }).on('error', reject);
  });
}

function ensureModel() {
  if (fs.existsSync(MODEL_FILE)) return Promise.resolve();
  if (!fs.existsSync(MODEL_DIR)) fs.mkdirSync(MODEL_DIR, { recursive: true });

  return fetchJSON(RESOURCES_URL).then(function (resources) {
    var entry = resources['/models/isnet_quint8'];
    if (!entry) throw new Error('Model not found in resources');
    console.log('[remove-bg] Downloading ISNet quint8 model (~' + Math.round(entry.size / 1024 / 1024) + 'MB)...');
    var downloaded = 0;
    var chunks = [];
    var chain = Promise.resolve();
    entry.chunks.forEach(function (chunk) {
      chain = chain.then(function () {
        return fetchBuffer(RES_BASE + chunk.name).then(function (buf) {
          chunks.push(buf);
          downloaded += buf.length;
          console.log('[remove-bg] Chunk ' + chunks.length + '/' + entry.chunks.length + ' (' + Math.round(downloaded / 1024 / 1024) + '/' + Math.round(entry.size / 1024 / 1024) + 'MB)');
        });
      });
    });
    return chain.then(function () {
      var full = Buffer.concat(chunks);
      fs.writeFileSync(MODEL_FILE, full);
      console.log('[remove-bg] Model saved (' + Math.round(full.length / 1024 / 1024) + 'MB)');
    });
  });
}

function getSession() {
  if (session) return Promise.resolve(session);
  return ensureModel().then(function () {
    return ort.InferenceSession.create(MODEL_FILE, {
      executionProviders: ['cpu'],
      graphOptimizationLevel: 'all'
    });
  }).then(function (s) {
    session = s;
    return s;
  });
}

function removeBackground(imageBuffer) {
  var origMeta, origRaw, sess;

  return getSession().then(function (s) {
    sess = s;
    return sharp(imageBuffer).metadata();
  }).then(function (meta) {
    origMeta = meta;
    // Resize to 1024x1024 for model input
    return sharp(imageBuffer)
      .resize(1024, 1024, { fit: 'fill' })
      .removeAlpha()
      .raw()
      .toBuffer();
  }).then(function (raw) {
    // HWC → NCHW, normalize to [0,1]
    var input = new Float32Array(3 * 1024 * 1024);
    for (var y = 0; y < 1024; y++) {
      for (var x = 0; x < 1024; x++) {
        var srcIdx = (y * 1024 + x) * 3;
        input[0 * 1024 * 1024 + y * 1024 + x] = raw[srcIdx] / 255.0;
        input[1 * 1024 * 1024 + y * 1024 + x] = raw[srcIdx + 1] / 255.0;
        input[2 * 1024 * 1024 + y * 1024 + x] = raw[srcIdx + 2] / 255.0;
      }
    }
    var tensor = new ort.Tensor('float32', input, [1, 3, 1024, 1024]);
    return sess.run({ input: tensor });
  }).then(function (results) {
    var output = results.output;
    var maskData = output.data;
    // Convert mask to grayscale image buffer
    var maskBuf = Buffer.alloc(1024 * 1024);
    for (var i = 0; i < 1024 * 1024; i++) {
      var v = Math.min(1, Math.max(0, maskData[i]));
      maskBuf[i] = Math.round(v * 255);
    }
    // Resize mask to original dimensions
    return sharp(maskBuf, { raw: { width: 1024, height: 1024, channels: 1 } })
      .resize(origMeta.width, origMeta.height, { fit: 'fill' })
      .raw()
      .toBuffer();
  }).then(function (resizedMask) {
    // Get original raw pixels
    return sharp(imageBuffer).removeAlpha().raw().toBuffer().then(function (orig) {
      // Compose RGBA: original RGB + mask as alpha
      var result = Buffer.alloc(origMeta.width * origMeta.height * 4);
      for (var i = 0; i < origMeta.width * origMeta.height; i++) {
        result[i * 4] = orig[i * 3];
        result[i * 4 + 1] = orig[i * 3 + 1];
        result[i * 4 + 2] = orig[i * 3 + 2];
        result[i * 4 + 3] = resizedMask[i];
      }
      return sharp(result, { raw: { width: origMeta.width, height: origMeta.height, channels: 4 } })
        .png()
        .toBuffer();
    });
  });
}

module.exports = { removeBackground: removeBackground, ensureModel: ensureModel };
