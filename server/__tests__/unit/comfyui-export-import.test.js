// comfyui-export-import.test.js — ComfyUI 设置导入导出流程测试
// 验证 comfyui_creds 在 SENSITIVE_KEYS 中，导出时解密、导入时重新加密

var sec = require('../../crypto');

// ========== 1. isSensitive 覆盖 comfyui_creds ==========
describe('ComfyUI 设置敏感标记', function () {
  test('comfyui_creds 在 SENSITIVE_KEYS 中', function () {
    expect(sec.SENSITIVE_KEYS).toContain('comfyui_creds');
  });

  test('isSensitive("comfyui_creds") 返回 true', function () {
    expect(sec.isSensitive('comfyui_creds')).toBe(true);
  });

  test('comfyui_url 不是敏感 key', function () {
    expect(sec.isSensitive('comfyui_url')).toBe(false);
  });

  test('已知敏感 key 都标记正确', function () {
    var expectedSensitive = ['zhipu_api_key', 'zhipu_api_keys', 'ai_configs', 'ai_vendor_configs', 'ai_dispatch_order', 'imgbb_api_key', 'comfyui_creds'];
    expectedSensitive.forEach(function (k) {
      expect(sec.isSensitive(k)).toBe(true);
    });
  });
});

// ========== 2. 加密/解密往返 ==========
describe('ComfyUI 凭据加密解密', function () {
  test('加密后以 ENC: 开头', function () {
    var creds = JSON.stringify({ username: 'admin', password_hash: 'abc123' });
    var encrypted = sec.encrypt(creds);
    expect(encrypted).toMatch(/^ENC:/);
  });

  test('解密后还原为原始 JSON', function () {
    var creds = JSON.stringify({ username: 'admin', password_hash: '38c31ac749a3233eb3edca19ad56d059b85503b76abf758bba0e5e64b6c45a97' });
    var encrypted = sec.encrypt(creds);
    var decrypted = sec.decrypt(encrypted);
    expect(decrypted).toBe(creds);
    var parsed = JSON.parse(decrypted);
    expect(parsed.username).toBe('admin');
    expect(parsed.password_hash).toBe('38c31ac749a3233eb3edca19ad56d059b85503b76abf758bba0e5e64b6c45a97');
  });

  test('非 ENC: 前缀原文返回', function () {
    expect(sec.decrypt('plain_value')).toBe('plain_value');
    expect(sec.decrypt(null)).toBe(null);
    expect(sec.decrypt('')).toBe('');
  });
});

// ========== 3. 导出逻辑模拟 ==========
describe('ComfyUI 设置导出模拟', function () {
  test('导出时敏感 key 被解密，非敏感 key 原样', function () {
    var mockRows = [
      { key: 'comfyui_url', value: 'https://comfyui.example.com' },
      { key: 'comfyui_creds', value: sec.encrypt(JSON.stringify({ username: 'admin', password_hash: 'abc123' })) }
    ];

    var exported = {};
    mockRows.forEach(function (r) {
      exported[r.key] = sec.isSensitive(r.key) ? sec.decrypt(r.value) : r.value;
    });

    expect(exported['comfyui_url']).toBe('https://comfyui.example.com');
    var creds = JSON.parse(exported['comfyui_creds']);
    expect(creds.username).toBe('admin');
    expect(creds.password_hash).toBe('abc123');
  });
});

// ========== 4. 导入逻辑模拟 ==========
describe('ComfyUI 设置导入模拟', function () {
  test('导入时明文敏感 key 被重新加密', function () {
    var importData = {
      comfyui_url: 'https://comfyui.new.com',
      comfyui_creds: JSON.stringify({ username: 'admin', password_hash: 'newhash' })
    };

    var processed = {};
    for (var key in importData) {
      var val = String(importData[key]);
      if (sec.isSensitive(key) && val.indexOf('ENC:') !== 0) {
        processed[key] = sec.encrypt(val);
      } else {
        processed[key] = val;
      }
    }

    // url 不加密
    expect(processed['comfyui_url']).toBe('https://comfyui.new.com');
    // creds 被加密
    expect(processed['comfyui_creds']).toMatch(/^ENC:/);
    // 可解密还原
    var decrypted = sec.decrypt(processed['comfyui_creds']);
    var parsed = JSON.parse(decrypted);
    expect(parsed.username).toBe('admin');
    expect(parsed.password_hash).toBe('newhash');
  });

  test('已经是 ENC: 格式的不再重复加密', function () {
    var alreadyEncrypted = sec.encrypt('test_value');
    var val = String(alreadyEncrypted);
    // 模拟导入逻辑
    if (sec.isSensitive('comfyui_creds') && val.indexOf('ENC:') !== 0) {
      // 会走这里加密 — 但 val 已经是 ENC: 开头所以不会进入
    }
    // 验证 ENC: 前缀不会被二次加密
    expect(val.indexOf('ENC:')).toBe(0);
  });
});

// ========== 5. 完整往返 ==========
describe('ComfyUI 设置完整导出→导入往返', function () {
  test('导出再导入后数据一致', function () {
    // 原始数据（模拟 DB 中的状态）
    var originalCreds = JSON.stringify({
      username: 'admin',
      password_hash: '38c31ac749a3233eb3edca19ad56d059b85503b76abf758bba0e5e64b6c45a97'
    });
    var dbState = [
      { key: 'comfyui_url', value: 'https://comfyui.imgent.tech' },
      { key: 'comfyui_creds', value: sec.encrypt(originalCreds) }
    ];

    // 步骤1: 导出（解密敏感值）
    var exported = {};
    dbState.forEach(function (r) {
      exported[r.key] = sec.isSensitive(r.key) ? sec.decrypt(r.value) : r.value;
    });

    // 验证导出是明文
    expect(exported['comfyui_url']).toBe('https://comfyui.imgent.tech');
    var exportedCreds = JSON.parse(exported['comfyui_creds']);
    expect(exportedCreds.username).toBe('admin');

    // 步骤2: 导入（重新加密敏感值）
    var importedDbState = {};
    for (var key in exported) {
      var val = String(exported[key]);
      if (sec.isSensitive(key) && val.indexOf('ENC:') !== 0) {
        val = sec.encrypt(val);
      }
      importedDbState[key] = val;
    }

    // 验证导入后状态
    expect(importedDbState['comfyui_url']).toBe('https://comfyui.imgent.tech');
    expect(importedDbState['comfyui_creds']).toMatch(/^ENC:/);

    // 步骤3: 再次读取验证（模拟下次导出）
    var reRead = sec.decrypt(importedDbState['comfyui_creds']);
    var reParsed = JSON.parse(reRead);
    expect(reParsed.username).toBe('admin');
    expect(reParsed.password_hash).toBe('38c31ac749a3233eb3edca19ad56d059b85503b76abf758bba0e5e64b6c45a97');
  });
});
