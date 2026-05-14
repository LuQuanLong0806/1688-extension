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
  if (fs.existsSync(MODEL_FILE)) return Promise.resolve();
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
    // Log model input/output names for debugging
    console.log('[remove-bg] Model inputs:', s.inputNames);
    console.log('[remove-bg] Model outputs:', s.outputNames);
    session = s;
    return s;
  });
}

function removeBackground(imageBuffer) {
  var origMeta, sess;

  return getSession().then(function (s) {
    sess = s;
    // Use actual model input name
    var inputName = sess.inputNames[0];
    var outputName = sess.outputNames[0];
    return sharp(imageBuffer).metadata().then(function (meta) {
      origMeta = meta;
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
      var feeds = {};
      feeds[inputName] = tensor;
      return sess.run(feeds);
    }).then(function (results) {
      var output = results[outputName];
      var maskData = output.data;

      // Sample mask values for debugging
      var sampleVals = [];
      for (var si = 0; si < Math.min(10, maskData.length); si++) {
        sampleVals.push(maskData[si].toFixed(4));
      }
      console.log('[remove-bg] Output shape:', output.dims, 'sample values:', sampleVals.join(', '));

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
      // Get original raw pixels (ensure RGB)
      return sharp(imageBuffer).ensureAlpha(0).raw().toBuffer().then(function (orig) {
        var channels = origMeta.channels || 3;
        var result = Buffer.alloc(origMeta.width * origMeta.height * 4);
        for (var i = 0; i < origMeta.width * origMeta.height; i++) {
          result[i * 4] = orig[i * channels];
          result[i * 4 + 1] = orig[i * channels + 1];
          result[i * 4 + 2] = orig[i * channels + 2];
          result[i * 4 + 3] = resizedMask[i];
        }
        return sharp(result, { raw: { width: origMeta.width, height: origMeta.height, channels: 4 } })
          .png()
          .toBuffer();
      });
    });
  });
}

module.exports = { removeBackground: removeBackground, ensureModel: ensureModel };
