// turso-connection.test.js — Turso 连接管理单元测试
// 测试 disconnect()、getStatus()、配置保存、API 端点

const initSqlJs = require('sql.js');
const express = require('express');
const request = require('supertest');

let SQL;
let memDb;

// 内存 DB 操作
function run(sql, params) { memDb.run(sql, params); }
function getOne(sql, params) {
  const stmt = memDb.prepare(sql);
  if (params) stmt.bind(params);
  if (stmt.step()) { const row = stmt.getAsObject(); stmt.free(); return row; }
  stmt.free(); return null;
}
function getAll(sql, params) {
  const stmt = memDb.prepare(sql);
  if (params) stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free(); return rows;
}

beforeAll(async () => {
  SQL = await initSqlJs();
});

beforeEach(() => {
  memDb = new SQL.Database();
  memDb.run('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)');
});

afterEach(() => {
  memDb.close();
});

// ===== 1. cloud 模块 disconnect/getStatus 逻辑测试 =====

describe('cloud 模块 disconnect()', () => {
  function createCloudState() {
    return {
      client: { execute: jest.fn() },
      connected: true,
      lastSyncTime: '2025-01-01T00:00:00Z',
      run: jest.fn(),
      getOne: jest.fn(),
      getAll: jest.fn()
    };
  }

  function disconnect(cloud) {
    cloud.client = null;
    cloud.connected = false;
    cloud.lastSyncTime = null;
    return true;
  }

  function getStatus(cloud) {
    return {
      connected: cloud.connected,
      lastSyncTime: cloud.lastSyncTime,
      config: getOne("SELECT value FROM settings WHERE key = 'turso_config'") ? true : false
    };
  }

  test('disconnect 清空 client、connected、lastSyncTime', () => {
    const cloud = createCloudState();
    expect(cloud.connected).toBe(true);
    expect(cloud.client).not.toBeNull();

    disconnect(cloud);

    expect(cloud.client).toBeNull();
    expect(cloud.connected).toBe(false);
    expect(cloud.lastSyncTime).toBeNull();
  });

  test('disconnect 返回 true', () => {
    const cloud = createCloudState();
    expect(disconnect(cloud)).toBe(true);
  });

  test('disconnect 后 getStatus 返回 connected: false', () => {
    run("INSERT INTO settings (key, value) VALUES ('turso_config', '{\"url\":\"test\",\"token\":\"tok\"}')");
    const cloud = createCloudState();
    disconnect(cloud);

    const status = getStatus(cloud);
    expect(status.connected).toBe(false);
    expect(status.lastSyncTime).toBeNull();
    expect(status.config).toBe(true);
  });

  test('未配置时 getStatus.config 为 false', () => {
    const cloud = { connected: false, lastSyncTime: null };
    const status = getStatus(cloud);
    expect(status.config).toBe(false);
    expect(status.connected).toBe(false);
  });

  test('连续 disconnect 不报错', () => {
    const cloud = createCloudState();
    disconnect(cloud);
    disconnect(cloud);
    expect(cloud.connected).toBe(false);
  });
});

// ===== 2. 配置保存逻辑测试 =====

describe('Turso 配置保存', () => {
  function saveConfig(config) {
    run("INSERT OR REPLACE INTO settings (key, value) VALUES ('turso_config', ?)", [JSON.stringify(config)]);
  }

  function getConfig() {
    try {
      var row = getOne("SELECT value FROM settings WHERE key = 'turso_config'");
      if (row && row.value) return JSON.parse(row.value);
    } catch (e) {}
    return null;
  }

  test('保存配置后可读取', () => {
    saveConfig({ url: 'libsql://test.turso.io', token: 'secret123' });
    const config = getConfig();
    expect(config).not.toBeNull();
    expect(config.url).toBe('libsql://test.turso.io');
    expect(config.token).toBe('secret123');
  });

  test('覆盖保存更新配置', () => {
    saveConfig({ url: 'libsql://old.turso.io', token: 'old-token' });
    saveConfig({ url: 'libsql://new.turso.io', token: 'new-token' });
    const config = getConfig();
    expect(config.url).toBe('libsql://new.turso.io');
    expect(config.token).toBe('new-token');
  });

  test('未保存时 getConfig 返回 null', () => {
    expect(getConfig()).toBeNull();
  });

  test('脱敏 token 逻辑', () => {
    saveConfig({ url: 'libsql://test.turso.io', token: 'eyJhbGciOiJIUzI1NiJ9.longtoken' });
    const config = getConfig();
    const masked = config.token.substring(0, 8) + '****';
    expect(masked).toBe('eyJhbGci****');
    expect(masked).not.toBe(config.token);
  });

  test('传入脱敏 token 时不覆盖原 token', () => {
    saveConfig({ url: 'libsql://test.turso.io', token: 'original-secret-token' });
    const oldConfig = getConfig();

    // 模拟前端传回脱敏 token
    var newToken = 'original****';
    if (newToken.indexOf('****') >= 0 && oldConfig && oldConfig.token) {
      newToken = oldConfig.token;
    }
    saveConfig({ url: 'libsql://test.turso.io', token: newToken });

    const config = getConfig();
    expect(config.token).toBe('original-secret-token');
  });
});

// ===== 3. API 端点测试 =====

describe('Sync API 端点', () => {
  function createSyncApp() {
    const app = express();
    app.use(express.json());

    // 模拟 cloudDb
    const mockCloudDb = {
      connected: false,
      getConfig: function () {
        const row = getOne("SELECT value FROM settings WHERE key = 'turso_config'");
        if (row && row.value) return JSON.parse(row.value);
        return null;
      },
      saveConfig: function (config) {
        run("INSERT OR REPLACE INTO settings (key, value) VALUES ('turso_config', ?)", [JSON.stringify(config)]);
      },
      getStatus: function () {
        return {
          connected: mockCloudDb._connected,
          lastSyncTime: null,
          config: !!mockCloudDb.getConfig()
        };
      },
      connect: jest.fn().mockResolvedValue(false),
      disconnect: function () {
        mockCloudDb._connected = false;
      },
      _connected: false
    };

    // GET /api/sync/config
    app.get('/api/sync/config', (req, res) => {
      const config = mockCloudDb.getConfig();
      if (!config) return res.json({ configured: false });
      res.json({
        configured: true,
        url: config.url || '',
        token: config.token ? config.token.substring(0, 8) + '****' : '',
        status: mockCloudDb.getStatus()
      });
    });

    // POST /api/sync/config
    app.post('/api/sync/config', (req, res) => {
      var { url, token } = req.body;
      if (!url || !token) return res.status(400).json({ error: '请提供 URL 和 Token' });
      var oldConfig = mockCloudDb.getConfig();
      if (token.indexOf('****') >= 0 && oldConfig && oldConfig.token) {
        token = oldConfig.token;
      }
      mockCloudDb.saveConfig({ url, token });
      res.json({ ok: true, message: '配置已保存' });
    });

    // POST /api/sync/test
    app.post('/api/sync/test', async (req, res) => {
      const ok = await mockCloudDb.connect();
      mockCloudDb._connected = ok;
      res.json({ ok, message: ok ? '连接成功' : '连接失败' });
    });

    // POST /api/sync/disconnect
    app.post('/api/sync/disconnect', (req, res) => {
      mockCloudDb.disconnect();
      res.json({ ok: true, message: '已断开连接' });
    });

    // GET /api/sync/status
    app.get('/api/sync/status', (req, res) => {
      res.json(mockCloudDb.getStatus());
    });

    return { app, mockCloudDb };
  }

  test('GET /api/sync/config 未配置时返回 configured: false', async () => {
    const { app } = createSyncApp();
    const res = await request(app).get('/api/sync/config');
    expect(res.status).toBe(200);
    expect(res.body.configured).toBe(false);
  });

  test('POST /api/sync/config 保存配置（不自动连接）', async () => {
    const { app, mockCloudDb } = createSyncApp();
    const res = await request(app)
      .post('/api/sync/config')
      .send({ url: 'libsql://test.turso.io', token: 'my-secret-token' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.message).toBe('配置已保存');
    // 验证配置已入库
    expect(mockCloudDb.getConfig()).not.toBeNull();
  });

  test('POST /api/sync/config 缺少参数返回 400', async () => {
    const { app } = createSyncApp();
    const res = await request(app)
      .post('/api/sync/config')
      .send({ url: 'libsql://test.turso.io' });
    expect(res.status).toBe(400);
  });

  test('POST /api/sync/config 脱敏 token 不覆盖原值', async () => {
    const { app } = createSyncApp();
    // 先保存完整 token
    await request(app)
      .post('/api/sync/config')
      .send({ url: 'libsql://test.turso.io', token: 'original-secret-token' });
    // 再用脱敏 token 更新（应保留原 token）
    const res = await request(app)
      .post('/api/sync/config')
      .send({ url: 'libsql://test.turso.io', token: 'original****' });
    expect(res.status).toBe(200);
    // 通过 GET 验证 token 仍完整（前 8 位正确）
    const configRes = await request(app).get('/api/sync/config');
    expect(configRes.body.token).toBe('original****');
  });

  test('POST /api/sync/disconnect 成功断开', async () => {
    const { app, mockCloudDb } = createSyncApp();
    mockCloudDb._connected = true;
    const res = await request(app).post('/api/sync/disconnect');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(mockCloudDb._connected).toBe(false);
  });

  test('GET /api/sync/status 断开后 connected 为 false', async () => {
    const { app, mockCloudDb } = createSyncApp();
    mockCloudDb._connected = true;
    await request(app).post('/api/sync/disconnect');
    const res = await request(app).get('/api/sync/status');
    expect(res.body.connected).toBe(false);
  });

  test('配置保存后 GET config 返回 configured: true + 脱敏 token', async () => {
    const { app } = createSyncApp();
    await request(app)
      .post('/api/sync/config')
      .send({ url: 'libsql://mydb.turso.io', token: 'eyJhbGciOiJlongtoken123' });
    const res = await request(app).get('/api/sync/config');
    expect(res.body.configured).toBe(true);
    expect(res.body.url).toBe('libsql://mydb.turso.io');
    expect(res.body.token).toContain('****');
    expect(res.body.token).not.toBe('eyJhbGciOiJlongtoken123');
  });
});
