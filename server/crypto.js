// 敏感设置加密模块 — AES-256-GCM
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const KEY_FILE = path.join(__dirname, '.crypto_key');
const ALGORITHM = 'aes-256-gcm';
const SENSITIVE_KEYS = ['zhipu_api_key', 'zhipu_api_keys', 'ai_configs', 'ai_vendor_configs', 'imgbb_api_key'];

var _key = null;

function getKey() {
  if (_key) return _key;
  if (fs.existsSync(KEY_FILE)) {
    _key = fs.readFileSync(KEY_FILE, 'utf8').trim();
    return _key;
  }
  _key = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(KEY_FILE, _key, { encoding: 'utf8', mode: 0o600 });
  return _key;
}

function isSensitive(settingKey) {
  return SENSITIVE_KEYS.indexOf(settingKey) >= 0;
}

function encrypt(text) {
  if (!text) return text;
  var key = Buffer.from(getKey(), 'hex');
  var iv = crypto.randomBytes(12);
  var cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  var encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  var tag = cipher.getAuthTag();
  return 'ENC:' + iv.toString('hex') + ':' + tag.toString('hex') + ':' + encrypted;
}

function decrypt(text) {
  if (!text || typeof text !== 'string' || text.indexOf('ENC:') !== 0) return text;
  try {
    var parts = text.split(':');
    var key = Buffer.from(getKey(), 'hex');
    var iv = Buffer.from(parts[1], 'hex');
    var tag = Buffer.from(parts[2], 'hex');
    var decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    var decrypted = decipher.update(parts[3], 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (e) {
    console.log('[Crypto] 解密失败，返回原文:', e.message);
    return text;
  }
}

module.exports = { encrypt, decrypt, isSensitive, SENSITIVE_KEYS };
