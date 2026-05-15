// AI抠图 — onnxruntime-node + ISNet model (server-side)
var ort = require('onnxruntime-node');
var sharp = require('sharp');
var fs = require('fs');
var path = require('path');
var https = require('https');

var MODEL_DIR = path.join(__dirname, '..', '.models');
var MODEL_FILE = path.join(MODEL_DIR, 'isnet_fp16.onnx');
var RES_BASE = 'https://staticimgly.com/@imgly/background-removal-data/1.7.0/dist/';
var RESOURCES_URL = RES_BASE + 'resources.json';

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
  if (fs.existsSync(MODEL_FILE)) {
    var stat = fs.statSync(MODEL_FILE);
    if (stat.size > 1000000) return Promise.resolve();
    console.log('[remove-bg] Model file too small, re-downloading...');
    fs.unlinkSync(MODEL_FILE);
  }
  if (!fs.existsSync(MODEL_DIR)) fs.mkdirSync(MODEL_DIR, { recursive: true });

  return fetchJSON(RESOURCES_URL).then(function (resources) {
    var entry = resources['/models/isnet_fp16'];
    if (!entry) throw new Error('ISNet fp16 model not found in resources');
    console.log('[remove-bg] Downloading ISNet fp16 model (~' + Math.round(entry.size / 1024 / 1024) + 'MB)...');
    var chunks = [];
    var chain = Promise.resolve();
    entry.chunks.forEach(function (chunk) {
      chain = chain.then(function () {
        return fetchBuffer(RES_BASE + chunk.name).then(function (buf) {
          chunks.push(buf);
          console.log('[remove-bg] Chunk ' + chunks.length + '/' + entry.chunks.length);
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
    console.log('[remove-bg] Model loaded. inputs:', s.inputNames, 'outputs:', s.outputNames);
    session = s;
    return s;
  });
}

function removeBackground(imageBuffer) {
  var origMeta, sess, inputName, outputName;

  return getSession().then(function (s) {
    sess = s;
    inputName = sess.inputNames[0];
    outputName = sess.outputNames[0];
    return sharp(imageBuffer).metadata();
  }).then(function (meta) {
    origMeta = meta;
    return sharp(imageBuffer)
      .resize(1024, 1024, { fit: 'fill' })
      .removeAlpha()
      .raw()
      .toBuffer();
  }).then(function (raw) {
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
    var feeds = {};
    feeds[inputName] = tensor;
    return sess.run(feeds);
  }).then(function (results) {
    var maskData = results[outputName].data;

    var maskBuf = Buffer.alloc(1024 * 1024);
    for (var j = 0; j < 1024 * 1024; j++) {
      maskBuf[j] = Math.round(Math.min(1, Math.max(0, maskData[j])) * 255);
    }

    var w = origMeta.width;
    var h = origMeta.height;
    return Promise.all([
      sharp(imageBuffer).removeAlpha().raw().toBuffer(),
      sharp(maskBuf, { raw: { width: 1024, height: 1024, channels: 1 } })
        .resize(w, h, { fit: 'fill' })
        .grayscale()
        .raw()
        .toBuffer()
    ]);
  }).then(function (pair) {
    var orig = pair[0];
    var mask = pair[1];
    var w = origMeta.width;
    var h = origMeta.height;

    var result = Buffer.alloc(w * h * 4);
    for (var i = 0; i < w * h; i++) {
      result[i * 4] = orig[i * 3];
      result[i * 4 + 1] = orig[i * 3 + 1];
      result[i * 4 + 2] = orig[i * 3 + 2];
      result[i * 4 + 3] = mask[i];
    }
    return sharp(result, { raw: { width: w, height: h, channels: 4 } })
      .png()
      .toBuffer();
  });
}

module.exports = { removeBackground: removeBackground, ensureModel: ensureModel };
