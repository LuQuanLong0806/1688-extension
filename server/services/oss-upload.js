/**
 * 阿里云 OSS 上传服务
 */
var OSS = require('ali-oss');
var path = require('path');
var fs = require('fs');
var sec = require('../crypto');

var UPLOADS_DIR = path.join(__dirname, '..', 'public', 'uploads');

function getOssConfig() {
  try {
    var db = require('../db');
    var keys = ['oss_access_key_id', 'oss_access_key_secret', 'oss_bucket', 'oss_region', 'oss_endpoint'];
    var config = {};
    keys.forEach(function (k) {
      var row = db.getOne('SELECT value FROM settings WHERE key = ?', [k]);
      if (row && row.value) {
        config[k] = sec.decrypt(row.value);
      }
    });
    var labelRow = db.getOne('SELECT value FROM settings WHERE key = ?', ['oss_config_label']);
    if (labelRow && labelRow.value) config.label = labelRow.value;
    if (config.oss_access_key_id && config.oss_access_key_secret && config.oss_bucket && config.oss_region) {
      return {
        accessKeyId: config.oss_access_key_id,
        accessKeySecret: config.oss_access_key_secret,
        bucket: config.oss_bucket,
        region: config.oss_region,
        endpoint: config.oss_endpoint || '',
        label: config.label || ''
      };
    }
  } catch (e) {
    console.error('[OSS] Config error:', e.message);
  }
  return null;
}

function isConfigured() {
  return !!getOssConfig();
}

function uploadToOSS(imageData, opts) {
  var config = getOssConfig();
  if (!config) return Promise.reject(new Error('未配置阿里云 OSS'));

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
  var now = new Date();
  var dateDir = now.getFullYear() + '-' +
    String(now.getMonth() + 1).padStart(2, '0') + '-' +
    String(now.getDate()).padStart(2, '0');
  var ossPath = 'products/' + dateDir + '/' + nameParam;

  var clientOpts = {
    accessKeyId: config.accessKeyId,
    accessKeySecret: config.accessKeySecret,
    bucket: config.bucket,
    region: config.region
  };
  if (config.endpoint) clientOpts.endpoint = config.endpoint;

  var client = new OSS(clientOpts);
  var buf = Buffer.from(base64Str, 'base64');

  // 根据 extension 设置 Content-Type，确保浏览器预览而非下载
  var mimeTypes = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' };
  var ext = path.extname(nameParam).toLowerCase();
  var mime = mimeTypes[ext] || 'image/png';

  // 本地备份
  var localName = 'oss_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8) + '.png';
  fs.writeFile(path.join(UPLOADS_DIR, localName), buf, function () {});

  return client.put(ossPath, buf, { headers: { 'Content-Type': mime } }).then(function (result) {
    var url = result.url;
    // 如果没有绑定自定义域名，用标准格式确保可访问
    if (!url || url.indexOf('aliyuncs.com') === -1 && url.indexOf(config.bucket) === -1) {
      url = 'https://' + config.bucket + '.' + config.region + '.aliyuncs.com/' + ossPath;
    }
    console.log('[OSS] Upload success:', url);
    return { ok: true, url: url };
  });
}

module.exports = { uploadToOSS, getOssConfig, isConfigured };
