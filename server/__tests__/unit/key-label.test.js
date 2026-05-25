// key-label.test.js — API Key 备注功能单元测试
// 测试 normalizeKeyEntry 向后兼容、CRUD 操作、导入迁移

const initSqlJs = require('sql.js');
const express = require('express');
const request = require('supertest');

let SQL;
let memDb;

function run(sql, params) { memDb.run(sql, params); }
function getOne(sql, params) {
  const stmt = memDb.prepare(sql);
  if (params) stmt.bind(params);
  if (stmt.step()) { const row = stmt.getAsObject(); stmt.free(); return row; }
  stmt.free(); return null;
}

beforeAll(async () => { SQL = await initSqlJs(); });
beforeEach(() => {
  memDb = new SQL.Database();
  memDb.run('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)');
});
afterEach(() => { memDb.close(); });

// ===== 1. normalizeKeyEntry 向后兼容 =====

describe('normalizeKeyEntry 向后兼容', () => {
  function normalizeKeyEntry(entry) {
    if (typeof entry === 'string') return { key: entry, label: '' };
    return entry;
  }

  test('纯字符串 → {key, label:""}', () => {
    expect(normalizeKeyEntry('abc123')).toEqual({ key: 'abc123', label: '' });
  });

  test('{key, label} 对象不变', () => {
    var obj = { key: 'abc123', label: '工作账号' };
    expect(normalizeKeyEntry(obj)).toBe(obj);
  });

  test('{key, label:""} 空备注不变', () => {
    expect(normalizeKeyEntry({ key: 'abc', label: '' })).toEqual({ key: 'abc', label: '' });
  });

  test('字符串数组批量归一化', () => {
    var arr = ['k1', 'k2', 'k3'];
    var result = arr.map(normalizeKeyEntry);
    expect(result).toEqual([
      { key: 'k1', label: '' },
      { key: 'k2', label: '' },
      { key: 'k3', label: '' }
    ]);
  });

  test('混合数组归一化', () => {
    var arr = ['k1', { key: 'k2', label: '测试' }];
    var result = arr.map(normalizeKeyEntry);
    expect(result).toEqual([
      { key: 'k1', label: '' },
      { key: 'k2', label: '测试' }
    ]);
  });
});

// ===== 2. 智谱 Key 存储 + 读取 + label CRUD =====

describe('智谱 Key label CRUD', () => {
  function saveZhipuKeys(keys) {
    run("INSERT OR REPLACE INTO settings (key, value) VALUES ('zhipu_api_keys', ?)", [JSON.stringify(keys)]);
  }

  function getZhipuKeys() {
    try {
      var row = getOne("SELECT value FROM settings WHERE key = 'zhipu_api_keys'");
      if (row && row.value) {
        var arr = JSON.parse(row.value);
        return arr.filter(function (e) { var k = typeof e === 'string' ? e : (e && e.key); return k && k.trim(); }).map(function (e) {
          return typeof e === 'string' ? { key: e, label: '' } : e;
        });
      }
    } catch (e) {}
    // 兼容旧格式
    try {
      var row2 = getOne("SELECT value FROM settings WHERE key = 'zhipu_api_key'");
      if (row2 && row2.value) { var v = row2.value.trim(); if (v) return [{ key: v, label: '' }]; }
    } catch (e) {}
    return [];
  }

  test('保存并读取新格式 {key, label}', () => {
    saveZhipuKeys([{ key: 'abc123', label: '工作账号' }, { key: 'def456', label: '' }]);
    var keys = getZhipuKeys();
    expect(keys.length).toBe(2);
    expect(keys[0]).toEqual({ key: 'abc123', label: '工作账号' });
    expect(keys[1]).toEqual({ key: 'def456', label: '' });
  });

  test('读取旧格式纯字符串数组', () => {
    run("INSERT INTO settings (key, value) VALUES ('zhipu_api_keys', ?)", [JSON.stringify(['old1', 'old2'])]);
    var keys = getZhipuKeys();
    expect(keys.length).toBe(2);
    expect(keys[0]).toEqual({ key: 'old1', label: '' });
    expect(keys[1]).toEqual({ key: 'old2', label: '' });
  });

  test('读取旧格式单个 zhipu_api_key', () => {
    run("INSERT INTO settings (key, value) VALUES ('zhipu_api_key', ?)", ['single_key_value']);
    var keys = getZhipuKeys();
    expect(keys.length).toBe(1);
    expect(keys[0]).toEqual({ key: 'single_key_value', label: '' });
  });

  test('优先读取 zhipu_api_keys 而非 zhipu_api_key', () => {
    run("INSERT INTO settings (key, value) VALUES ('zhipu_api_key', ?)", ['old_single']);
    run("INSERT INTO settings (key, value) VALUES ('zhipu_api_keys', ?)", [JSON.stringify([{ key: 'new_multi', label: '' }])]);
    var keys = getZhipuKeys();
    expect(keys.length).toBe(1);
    expect(keys[0].key).toBe('new_multi');
  });

  test('添加 key 时携带 label', () => {
    saveZhipuKeys([]);
    var keys = getZhipuKeys();
    keys.push({ key: 'new_key', label: '个人测试' });
    saveZhipuKeys(keys);
    keys = getZhipuKeys();
    expect(keys.length).toBe(1);
    expect(keys[0].label).toBe('个人测试');
  });

  test('更新 label', () => {
    saveZhipuKeys([{ key: 'k1', label: '' }, { key: 'k2', label: '旧备注' }]);
    var keys = getZhipuKeys();
    keys[0].label = '新备注';
    saveZhipuKeys(keys);
    keys = getZhipuKeys();
    expect(keys[0].label).toBe('新备注');
    expect(keys[1].label).toBe('旧备注');
  });

  test('按索引删除', () => {
    saveZhipuKeys([{ key: 'k1', label: 'a' }, { key: 'k2', label: 'b' }, { key: 'k3', label: 'c' }]);
    var keys = getZhipuKeys();
    keys.splice(1, 1);
    saveZhipuKeys(keys);
    keys = getZhipuKeys();
    expect(keys.length).toBe(2);
    expect(keys[0].key).toBe('k1');
    expect(keys[1].key).toBe('k3');
  });

  test('空 key 过滤', () => {
    saveZhipuKeys([{ key: 'valid', label: '' }, { key: '', label: '' }, { key: '  ', label: '' }]);
    var keys = getZhipuKeys();
    expect(keys.length).toBe(1);
    expect(keys[0].key).toBe('valid');
  });
});

// ===== 3. 通义千问 Key label =====

describe('通义千问 Key label', () => {
  function saveQwenKeys(keys) {
    var cfg = { providers: { qwen: { apiKeys: keys } } };
    run("INSERT OR REPLACE INTO settings (key, value) VALUES ('ai_configs', ?)", [JSON.stringify(cfg)]);
  }

  function getQwenKeys() {
    var cfg;
    try { cfg = JSON.parse(getOne("SELECT value FROM settings WHERE key = 'ai_configs'").value); } catch (e) { return []; }
    var arr = (cfg.providers && cfg.providers.qwen && cfg.providers.qwen.apiKeys) || [];
    return arr.filter(function (e) { var k = typeof e === 'string' ? e : (e && e.key); return k && k.trim(); }).map(function (e) {
      return typeof e === 'string' ? { key: e, label: '' } : e;
    });
  }

  test('新格式保存和读取', () => {
    saveQwenKeys([{ key: 'qk1', label: '阿里云主号' }]);
    var keys = getQwenKeys();
    expect(keys.length).toBe(1);
    expect(keys[0].label).toBe('阿里云主号');
  });

  test('旧格式字符串数组兼容', () => {
    var cfg = { providers: { qwen: { apiKeys: ['qk1', 'qk2'] } } };
    run("INSERT OR REPLACE INTO settings (key, value) VALUES ('ai_configs', ?)", [JSON.stringify(cfg)]);
    var keys = getQwenKeys();
    expect(keys).toEqual([{ key: 'qk1', label: '' }, { key: 'qk2', label: '' }]);
  });

  test('更新 label', () => {
    saveQwenKeys([{ key: 'qk1', label: '' }]);
    var keys = getQwenKeys();
    keys[0].label = '新备注';
    saveQwenKeys(keys);
    keys = getQwenKeys();
    expect(keys[0].label).toBe('新备注');
  });
});

// ===== 4. 腾讯混元账号 label =====

describe('腾讯混元账号 label', () => {
  function saveHunyuanAccounts(accounts) {
    var cfg = { providers: { hunyuan: { accounts: accounts } } };
    run("INSERT OR REPLACE INTO settings (key, value) VALUES ('ai_configs', ?)", [JSON.stringify(cfg)]);
  }

  function getHunyuanAccounts() {
    var cfg;
    try { cfg = JSON.parse(getOne("SELECT value FROM settings WHERE key = 'ai_configs'").value); } catch (e) { return []; }
    var arr = (cfg.providers && cfg.providers.hunyuan && cfg.providers.hunyuan.accounts) || [];
    return arr.filter(function (a) { return a.secretId && a.secretKey; });
  }

  test('新格式保存和读取', () => {
    saveHunyuanAccounts([{ secretId: 'sid1', secretKey: 'sk1', label: '腾讯云A' }]);
    var accs = getHunyuanAccounts();
    expect(accs.length).toBe(1);
    expect(accs[0].label).toBe('腾讯云A');
  });

  test('无 label 的账号', () => {
    saveHunyuanAccounts([{ secretId: 'sid1', secretKey: 'sk1', label: '' }]);
    var accs = getHunyuanAccounts();
    expect(accs.length).toBe(1);
    expect(accs[0].label).toBe('');
  });

  test('更新 label', () => {
    saveHunyuanAccounts([{ secretId: 'sid1', secretKey: 'sk1', label: '' }]);
    var accs = getHunyuanAccounts();
    accs[0].label = '新备注';
    saveHunyuanAccounts(accs);
    accs = getHunyuanAccounts();
    expect(accs[0].label).toBe('新备注');
  });
});

// ===== 5. 导入迁移测试 =====

describe('导入迁移：旧格式 → 新格式', () => {
  function importSettings(data) {
    // 模拟导入逻辑中的迁移
    for (var k in data) {
      run('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)', [k, String(data[k])]);
    }

    // 智谱旧单 key 迁移
    if (data['zhipu_api_key'] && !data['zhipu_api_keys']) {
      var oldKey = String(data['zhipu_api_key']).trim();
      if (oldKey) {
        run("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('zhipu_api_keys', ?, CURRENT_TIMESTAMP)",
          [JSON.stringify([{ key: oldKey, label: '' }])]);
      }
      run("DELETE FROM settings WHERE key = 'zhipu_api_key'");
    }

    // 智谱旧字符串数组迁移
    if (data['zhipu_api_keys']) {
      var arr;
      try { arr = JSON.parse(data['zhipu_api_keys']); } catch (e) { arr = null; }
      if (Array.isArray(arr) && arr.length && typeof arr[0] === 'string') {
        run("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('zhipu_api_keys', ?, CURRENT_TIMESTAMP)",
          [JSON.stringify(arr.map(function (k) { return { key: k, label: '' }; }))]);
      }
    }

    // ai_configs 内部迁移
    if (data['ai_configs']) {
      var cfg;
      try { cfg = JSON.parse(data['ai_configs']); } catch (e) { cfg = null; }
      if (cfg && cfg.providers) {
        var changed = false;
        // 通义千问 apiKey 字符串 → apiKeys 数组
        if (cfg.providers.qwen && cfg.providers.qwen.apiKey && !cfg.providers.qwen.apiKeys) {
          cfg.providers.qwen.apiKeys = [{ key: cfg.providers.qwen.apiKey, label: '' }];
          delete cfg.providers.qwen.apiKey;
          changed = true;
        }
        // 通义千问字符串数组 → {key, label}
        if (cfg.providers.qwen && cfg.providers.qwen.apiKeys && Array.isArray(cfg.providers.qwen.apiKeys)) {
          cfg.providers.qwen.apiKeys = cfg.providers.qwen.apiKeys.map(function (e) {
            if (typeof e === 'string') { changed = true; return { key: e, label: '' }; }
            return e;
          });
        }
        // 混元 secretId/secretKey → accounts
        if (cfg.providers.hunyuan && cfg.providers.hunyuan.secretId && !cfg.providers.hunyuan.accounts) {
          cfg.providers.hunyuan.accounts = [{ secretId: cfg.providers.hunyuan.secretId, secretKey: cfg.providers.hunyuan.secretKey, label: '' }];
          delete cfg.providers.hunyuan.secretId;
          delete cfg.providers.hunyuan.secretKey;
          changed = true;
        }
        if (changed) {
          run("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('ai_configs', ?, CURRENT_TIMESTAMP)", [JSON.stringify(cfg)]);
        }
      }
    }
  }

  test('智谱旧单 key 迁移为 {key, label}', () => {
    importSettings({ 'zhipu_api_key': 'old_single_key' });
    var row = getOne("SELECT value FROM settings WHERE key = 'zhipu_api_keys'");
    expect(row).not.toBeNull();
    var keys = JSON.parse(row.value);
    expect(keys).toEqual([{ key: 'old_single_key', label: '' }]);
    // 旧 key 已删除
    var oldRow = getOne("SELECT value FROM settings WHERE key = 'zhipu_api_key'");
    expect(oldRow).toBeNull();
  });

  test('智谱旧字符串数组迁移为 {key, label}', () => {
    importSettings({ 'zhipu_api_keys': JSON.stringify(['k1', 'k2', 'k3']) });
    var row = getOne("SELECT value FROM settings WHERE key = 'zhipu_api_keys'");
    var keys = JSON.parse(row.value);
    expect(keys).toEqual([
      { key: 'k1', label: '' },
      { key: 'k2', label: '' },
      { key: 'k3', label: '' }
    ]);
  });

  test('智谱已是新格式时不迁移', () => {
    importSettings({ 'zhipu_api_keys': JSON.stringify([{ key: 'k1', label: '已有备注' }]) });
    var row = getOne("SELECT value FROM settings WHERE key = 'zhipu_api_keys'");
    var keys = JSON.parse(row.value);
    expect(keys).toEqual([{ key: 'k1', label: '已有备注' }]);
  });

  test('通义千问旧 apiKey 字符串迁移', () => {
    importSettings({ 'ai_configs': JSON.stringify({ providers: { qwen: { apiKey: 'single_qwen_key' } } }) });
    var row = getOne("SELECT value FROM settings WHERE key = 'ai_configs'");
    var cfg = JSON.parse(row.value);
    expect(cfg.providers.qwen.apiKey).toBeUndefined();
    expect(cfg.providers.qwen.apiKeys).toEqual([{ key: 'single_qwen_key', label: '' }]);
  });

  test('通义千问旧字符串数组迁移', () => {
    importSettings({ 'ai_configs': JSON.stringify({ providers: { qwen: { apiKeys: ['q1', 'q2'] } } }) });
    var row = getOne("SELECT value FROM settings WHERE key = 'ai_configs'");
    var cfg = JSON.parse(row.value);
    expect(cfg.providers.qwen.apiKeys).toEqual([{ key: 'q1', label: '' }, { key: 'q2', label: '' }]);
  });

  test('混元旧 secretId/secretKey 迁移', () => {
    importSettings({ 'ai_configs': JSON.stringify({ providers: { hunyuan: { secretId: 'sid1', secretKey: 'sk1' } } }) });
    var row = getOne("SELECT value FROM settings WHERE key = 'ai_configs'");
    var cfg = JSON.parse(row.value);
    expect(cfg.providers.hunyuan.secretId).toBeUndefined();
    expect(cfg.providers.hunyuan.accounts).toEqual([{ secretId: 'sid1', secretKey: 'sk1', label: '' }]);
  });

  test('已是新格式不重复迁移', () => {
    importSettings({ 'ai_configs': JSON.stringify({
      providers: {
        qwen: { apiKeys: [{ key: 'q1', label: '已有' }] },
        hunyuan: { accounts: [{ secretId: 'sid1', secretKey: 'sk1', label: '已有' }] }
      }
    }) });
    var row = getOne("SELECT value FROM settings WHERE key = 'ai_configs'");
    var cfg = JSON.parse(row.value);
    expect(cfg.providers.qwen.apiKeys).toEqual([{ key: 'q1', label: '已有' }]);
    expect(cfg.providers.hunyuan.accounts).toEqual([{ secretId: 'sid1', secretKey: 'sk1', label: '已有' }]);
  });
});

// ===== 6. API 脱敏测试 =====

describe('API Key 脱敏', () => {
  function maskApiKey(key) {
    if (!key) return '';
    if (key.length <= 8) return '****';
    return key.substring(0, 4) + '****' + key.substring(key.length - 4);
  }

  test('长 key 脱敏', () => {
    expect(maskApiKey('abcdef1234567890')).toBe('abcd****7890');
  });

  test('短 key 返回 ****', () => {
    expect(maskApiKey('abc')).toBe('****');
  });

  test('空值返回空字符串', () => {
    expect(maskApiKey('')).toBe('');
    expect(maskApiKey(null)).toBe('');
  });

  test('恰好 8 位', () => {
    expect(maskApiKey('12345678')).toBe('****');
  });
});
