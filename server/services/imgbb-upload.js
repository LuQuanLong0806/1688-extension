/**
 * 图片上传服务（统一入口）
 * 优先级: 阿里云 OSS > ImgBB
 */
var ossUpload = require('./oss-upload');

function uploadImage(imageData, opts) {
  if (ossUpload.isConfigured()) {
    return ossUpload.uploadToOSS(imageData, opts);
  }
  return _uploadToImgBB(imageData, opts);
}

// ========== ImgBB 兜底 ==========

const https = require('https');
const path = require('path');
const fs = require('fs');
const sec = require('../crypto');

var UPLOADS_DIR = path.join(__dirname, '..', 'public', 'uploads');

function getImgbbKey() {
  try {
    var row = require('../db').getOne("SELECT value FROM settings WHERE key = 'imgbb_api_key'");
    return row ? sec.decrypt(row.value) : '';
  } catch (e) {
    return '';
  }
}

function _uploadToImgBB(imageData, opts) {
  var apiKey = getImgbbKey();
  if (!apiKey) return Promise.reject(new Error('未配置图片上传服务（OSS 或 ImgBB）'));

  var base64Str;
  if (Buffer.isBuffer(imageData)) {
    base64Str = imageData.toString('base64');
  } else {
    base64Str = imageData;
  }
  base64Str = base64Str.replace(/^data:image\/\w+;base64,/, '');

  var nameParam = (opts && opts.name) || '';
  if (!nameParam) {
    var rand = Math.random().toString(36).substring(2, 8);
    nameParam = Date.now() + '_' + rand + '.png';
  }

  var postData = 'key=' + encodeURIComponent(apiKey) +
    '&image=' + encodeURIComponent(base64Str) +
    '&name=' + encodeURIComponent(nameParam);

  var httpOpts = {
    hostname: 'api.imgbb.com',
    port: 443,
    path: '/1/upload',
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  return new Promise(function (resolve, reject) {
    var req = https.request(httpOpts, function (res) {
      var chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () {
        var raw = Buffer.concat(chunks).toString();
        try {
          var json = JSON.parse(raw);
          if (json.success && json.data) {
            var imgUrl = json.data.url || '';
            var dispUrl = json.data.display_url || '';
            var imgUrlObj = (json.data.image && json.data.image.url) || '';
            console.log('[ImgBB] Response:', JSON.stringify({
              url: imgUrl, display_url: dispUrl, image_url: imgUrlObj,
              width: json.data.width, height: json.data.height
            }));
            if (!imgUrl && !dispUrl && !imgUrlObj) {
              reject(new Error('ImgBB response has no image URL'));
              return;
            }
            var buf = Buffer.from(base64Str, 'base64');
            var localName = 'imgbb_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8) + '.png';
            fs.writeFile(path.join(UPLOADS_DIR, localName), buf, function () {});
            var originalUrl = imgUrlObj || imgUrl || dispUrl;
            console.log('[ImgBB] Upload success:', originalUrl);
            resolve({ ok: true, url: originalUrl, delete: json.data.delete_url });
          } else {
            var errMsg = (json.error && json.error.message) || JSON.stringify(json);
            reject(new Error('ImgBB upload failed: ' + errMsg));
          }
        } catch (e) {
          reject(new Error('ImgBB response parse failed'));
        }
      });
    });
    req.on('error', function (e) {
      reject(new Error('ImgBB request error: ' + e.message));
    });
    req.write(postData);
    req.end();
  });
}

module.exports = { uploadToImgBB: uploadImage, getImgbbKey };
