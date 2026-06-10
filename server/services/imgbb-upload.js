/**
 * ImgBB 图床上传服务（统一入口）
 * - 自动按日期创建相册
 * - 所有需要 ImgBB 上传的地方都走这里
 */
const https = require('https');
const path = require('path');
const fs = require('fs');
const sec = require('../crypto');

var UPLOADS_DIR = path.join(__dirname, '..', 'public', 'uploads');

// 日期 → album ID 缓存，避免重复创建
var _albumCache = {}; // { '2026-06-08': 'abc123' }

function getImgbbKey() {
  try {
    var row = require('../db').getOne("SELECT value FROM settings WHERE key = 'imgbb_api_key'");
    return row ? sec.decrypt(row.value) : '';
  } catch (e) {
    return '';
  }
}

/**
 * 获取或创建日期相册，返回 album ID
 */
function ensureDateAlbum(apiKey, dateStr) {
  if (_albumCache[dateStr]) {
    return Promise.resolve(_albumCache[dateStr]);
  }
  var postData = 'key=' + encodeURIComponent(apiKey) + '&title=' + encodeURIComponent(dateStr);
  var opts = {
    hostname: 'api.imgbb.com',
    port: 443,
    path: '/1/album',
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(postData)
    }
  };
  return new Promise(function (resolve, reject) {
    var req = https.request(opts, function (res) {
      var chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () {
        var raw = Buffer.concat(chunks).toString();
        try {
          var json = JSON.parse(raw);
          if (json.success && json.data && json.data.id) {
            _albumCache[dateStr] = json.data.id;
            console.log('[ImgBB] Album created:', dateStr, '→', json.data.id);
            resolve(json.data.id);
          } else {
            var errMsg = (json.error && json.error.message) || raw;
            console.warn('[ImgBB] Album create failed:', errMsg, '- upload without album');
            resolve(null);
          }
        } catch (e) {
          console.warn('[ImgBB] Album response parse error:', e.message);
          resolve(null);
        }
      });
    });
    req.on('error', function (e) {
      console.warn('[ImgBB] Album request error:', e.message, '- upload without album');
      resolve(null);
    });
    req.write(postData);
    req.end();
  });
}

/**
 * 上传图片到 ImgBB（自动创建日期相册）
 * @param {Buffer|string} imageData - 图片 Buffer 或 base64 字符串（可含 data: 前缀）
 * @param {object} [opts] - 可选参数
 * @param {string} [opts.name] - 自定义文件名（不含路径）
 * @param {string} [opts.dateStr] - 自定义日期字符串，默认今天
 * @returns {Promise<{ok: boolean, url: string, delete: string, album: string}>}
 */
function uploadToImgBB(imageData, opts) {
  var apiKey = getImgbbKey();
  if (!apiKey) return Promise.reject(new Error('未配置 ImgBB API Key'));

  var base64Str;
  if (Buffer.isBuffer(imageData)) {
    base64Str = imageData.toString('base64');
  } else {
    base64Str = imageData;
  }
  base64Str = base64Str.replace(/^data:image\/\w+;base64,/, '');

  var now = new Date();
  var nameParam = (opts && opts.name) || '';
  if (!nameParam) {
    var rand = Math.random().toString(36).substring(2, 8);
    nameParam = Date.now() + '_' + rand + '.png';
  }

  var dateStr = (opts && opts.dateStr) || (now.getFullYear() + '-' +
    String(now.getMonth() + 1).padStart(2, '0') + '-' +
    String(now.getDate()).padStart(2, '0'));

  return ensureDateAlbum(apiKey, dateStr).then(function (albumId) {
    var postData = 'key=' + encodeURIComponent(apiKey) +
      '&image=' + encodeURIComponent(base64Str) +
      '&name=' + encodeURIComponent(nameParam);
    if (albumId) {
      postData += '&album=' + encodeURIComponent(albumId);
    }

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
              var thumbUrl = (json.data.thumb && json.data.thumb.url) || '';
              var medUrl = (json.data.medium && json.data.medium.url) || '';
              console.log('[ImgBB] Response URLs:', JSON.stringify({
                url: imgUrl, display_url: dispUrl, image_url: imgUrlObj,
                thumb_url: thumbUrl, medium_url: medUrl,
                width: json.data.width, height: json.data.height, size: json.data.size
              }));
              if (!imgUrl && !dispUrl && !imgUrlObj) {
                reject(new Error('ImgBB response has no image URL'));
                return;
              }
              // 本地备份
              var buf = Buffer.from(base64Str, 'base64');
              var localName = 'imgbb_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8) + '.png';
              fs.writeFile(path.join(UPLOADS_DIR, localName), buf, function () {});
              // 优先级: image.url(原图) > data.url(原图) > display_url(中图)
              var originalUrl = imgUrlObj || imgUrl || dispUrl;
              console.log('[ImgBB] Upload success:', originalUrl, 'album:', albumId || 'none', 'date:', dateStr);
              resolve({ ok: true, url: originalUrl, delete: json.data.delete_url, album: dateStr });
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
  });
}

module.exports = { uploadToImgBB, getImgbbKey, ensureDateAlbum };
