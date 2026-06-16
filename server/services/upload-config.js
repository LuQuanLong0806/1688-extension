// 上传限制配置 — 集中读写 settings 表
// 所有 key 均以 upload_ 前缀，非敏感，明文存储

var DEFAULTS = {
  upload_max_bytes: 10485760,              // 单图最大字节（10M）
  upload_max_pixels: 64000000,             // 单图最大像素（8000×8000 = 6400万）
  upload_format_convert: 'auto',           // off / auto / webp / jpeg
  upload_convert_threshold_bytes: 1048576, // 触发转码的最小字节（1M）
  upload_convert_threshold_pixels: 4000000,// 触发转码的最小像素（400万）
  upload_webp_quality: 85,                 // webp/jpeg 质量
  upload_mime_whitelist: 'png,jpeg,webp,gif,bmp', // 允许的 MIME 列表（不带 image/ 前缀）
  upload_strip_exif: 'off'                 // 是否剥除 EXIF（off=保留拍摄信息）
};

var _cache = null;
var _customDb = null;

function _getDb() { return _customDb || require('../db'); }

function _coerce(key, raw) {
  if (typeof DEFAULTS[key] === 'number') {
    var n = parseInt(raw, 10);
    return isNaN(n) ? DEFAULTS[key] : n;
  }
  return raw;
}

function load() {
  var db = _getDb();
  var cfg = Object.assign({}, DEFAULTS);
  Object.keys(DEFAULTS).forEach(function (key) {
    try {
      var row = db.getOne('SELECT value FROM settings WHERE key = ?', [key]);
      if (row && row.value != null && row.value !== '') {
        cfg[key] = _coerce(key, row.value);
      }
    } catch (e) {
      // db 不可用时退回默认值
    }
  });
  _cache = cfg;
  return cfg;
}

function get() {
  if (!_cache) load();
  return _cache;
}

function save(updates) {
  var db = _getDb();
  Object.keys(updates).forEach(function (key) {
    if (!(key in DEFAULTS)) return;
    var v = updates[key];
    if (typeof DEFAULTS[key] === 'number') {
      var n = parseInt(v, 10);
      if (isNaN(n)) return;
      v = n;
    } else if (typeof v !== 'string') {
      v = String(v);
    }
    db.run("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now', '+8 hours'))", [key, String(v)]);
  });
  if (db.scheduleSave) db.scheduleSave();
  return load();
}

function defaults() {
  return Object.assign({}, DEFAULTS);
}

module.exports = {
  DEFAULTS: DEFAULTS,
  load: load,
  get: get,
  save: save,
  defaults: defaults,
  _setDb: function (d) { _customDb = d; _cache = null; },
  _resetCache: function () { _cache = null; }
};
