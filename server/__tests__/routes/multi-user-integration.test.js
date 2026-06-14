// multi-user-integration.test.js — 多用户功能集成测试
// 覆盖：用户 CRUD / owner 隔离 / 认领分配 / 密码修改 / scope 过滤 / viewer 只读
const express = require('express');
const request = require('supertest');
const { initTestDb, run, getOne, getAll, scheduleSave } = require('../helpers/setup');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const TEST_SECRET = 'test-secret-multi-user-integration';

// ===== helpers =====

function insertTestUser(overrides) {
  var defaults = {
    username: 'user-' + Math.random().toString(36).slice(2, 8),
    password_hash: crypto.createHash('sha256').update('testsalt' + 'password123').digest('hex'),
    password_salt: 'testsalt',
    display_name: 'Test User',
    role: 'operator',
    must_change_password: 0,
    disabled: 0
  };
  var data = Object.assign(defaults, overrides);
  run("INSERT INTO users (username, password_hash, password_salt, display_name, role, must_change_password, disabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now','+8 hours'), datetime('now','+8 hours'))",
    [data.username, data.password_hash, data.password_salt, data.display_name, data.role, data.must_change_password, data.disabled]);
  return data;
}

function insertTestProduct(overrides) {
  var defaults = {
    uid: 'uid-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
    source_url: 'https://detail.1688.com/offer/' + Math.floor(Math.random() * 999999) + '.html',
    title: '测试商品',
    main_images: '[]',
    desc_images: '[]',
    detail_images: '[]',
    attrs: '[]',
    skus: '[]',
    status: 0,
    deleted: 0,
    owner: '',
    claim_at: '',
    category: '',
    custom_category: '',
    dxm_category: '',
    manual_category: ''
  };
  var data = Object.assign(defaults, overrides);
  run("INSERT INTO products (uid, source_url, title, main_images, desc_images, detail_images, attrs, skus, status, deleted, owner, claim_at, category, custom_category, dxm_category, manual_category, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now','+8 hours'), datetime('now','+8 hours'))",
    [data.uid, data.source_url, data.title, data.main_images, data.desc_images, data.detail_images,
     data.attrs, data.skus, data.status, data.deleted, data.owner, data.claim_at,
     data.category, data.custom_category, data.dxm_category, data.manual_category]);
  return data;
}

// Inline requireRole to avoid module cache issues
function requireRole() {
  var roles = Array.prototype.slice.call(arguments);
  return function (req, res, next) {
    if (!req.user) return res.status(401).json({ error: '未登录' });
    if (roles.indexOf(req.user.role) < 0) return res.status(403).json({ error: '权限不足' });
    next();
  };
}

// Build a test app that mirrors the real routes closely
function createApp() {
  var auth = require('../../middleware/auth');
  auth._setDb({ getOne: getOne, run: run, scheduleSave: function () {} });
  auth._resetSecret();
  run("INSERT OR REPLACE INTO settings (key, value) VALUES ('jwt_secret', '" + TEST_SECRET + "')");

  var usersModule = require('../../routes/users');
  usersModule._setDb({ getOne: getOne, run: run, getAll: getAll, scheduleSave: function () {} });

  var app = express();
  app.use(express.json());

  // JWT auth middleware
  app.use(function (req, res, next) {
    var token = null;
    var authHeader = req.headers.authorization;
    if (authHeader && authHeader.indexOf('Bearer ') === 0) token = authHeader.slice(7);
    if (token) {
      try {
        var decoded = jwt.verify(token, TEST_SECRET);
        req.user = { id: decoded.id, username: decoded.username, role: decoded.role };
      } catch (e) {}
    }
    next();
  });

  // ===== Users routes (actual module) =====
  app.use('/api', usersModule);

  // ===== Product routes with owner-aware logic (mirrors real products.js) =====
  var router = express.Router();

  // POST /product — 采集商品（owner 取决于登录状态）
  router.post('/product', function (req, res) {
    var title = (req.body.title || '').trim();
    var sourceUrl = (req.body.sourceUrl || '').trim();
    if (!title || !sourceUrl) return res.status(400).json({ error: 'title 和 sourceUrl 必填' });
    var uid = 'uid-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    var owner = req.user ? req.user.username : '';
    run("INSERT INTO products (uid, source_url, title, main_images, desc_images, detail_images, attrs, skus, status, deleted, owner, claim_at, category, custom_category, dxm_category, manual_category, created_at, updated_at) VALUES (?, ?, ?, '[]', '[]', '[]', '[]', '[]', 0, 0, ?, '', '', '', '', '', datetime('now','+8 hours'), datetime('now','+8 hours'))",
      [uid, sourceUrl, title, owner]);
    res.json({ ok: true, uid: uid });
  });

  // GET /product — scope filtering
  router.get('/product', function (req, res) {
    var page = Math.max(1, parseInt(req.query.page) || 1);
    var pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize) || 20));
    var scope = (req.query.scope || '').trim();
    var where = ['deleted = 0'];
    var params = [];
    if (req.user) {
      if (scope === 'mine') {
        where.push('owner = ?');
        params.push(req.user.username);
      } else if (scope === 'inbox') {
        where.push("(owner IS NULL OR owner = '')");
      } else if (scope === 'all') {
        if (req.user.role !== 'admin') {
          where.push("(owner = ? OR owner IS NULL OR owner = '')");
          params.push(req.user.username);
        }
      } else {
        where.push("(owner = ? OR owner IS NULL OR owner = '')");
        params.push(req.user.username);
      }
    }
    var whereClause = 'WHERE ' + where.join(' AND ');
    var countRow = getOne('SELECT COUNT(*) as count FROM products ' + whereClause, params);
    var total = countRow ? countRow.count : 0;
    var offset = (page - 1) * pageSize;
    var list = getAll('SELECT uid, title, owner FROM products ' + whereClause + ' ORDER BY id DESC LIMIT ? OFFSET ?', [...params, pageSize, offset]);
    res.json({ total: total, list: list });
  });

  // PUT /product/:uid — owner check
  router.put('/product/:uid', function (req, res) {
    var uid = req.params.uid;
    if (req.user && req.user.role !== 'admin') {
      var product = getOne('SELECT owner FROM products WHERE uid = ? AND deleted = 0', [uid]);
      if (!product) return res.status(404).json({ error: '商品不存在' });
      if (product.owner && product.owner !== req.user.username) {
        return res.status(403).json({ error: '无权编辑他人的商品' });
      }
    }
    var fields = [];
    var params = [];
    if (req.body.title !== undefined) { fields.push('title = ?'); params.push(req.body.title); }
    if (req.body.customCategory !== undefined) { fields.push('custom_category = ?'); params.push(req.body.customCategory); }
    if (fields.length === 0) return res.json({ ok: true });
    fields.push("updated_at = datetime('now','+8 hours')");
    params.push(uid);
    run('UPDATE products SET ' + fields.join(', ') + ' WHERE uid = ?', params);
    res.json({ ok: true });
  });

  // DELETE /product/:uid — owner check
  router.delete('/product/:uid', function (req, res) {
    var uid = req.params.uid;
    if (req.user && req.user.role !== 'admin') {
      var product = getOne('SELECT owner FROM products WHERE uid = ? AND deleted = 0', [uid]);
      if (!product) return res.status(404).json({ error: '商品不存在' });
      if (product.owner && product.owner !== req.user.username) {
        return res.status(403).json({ error: '无权删除他人的商品' });
      }
    }
    run("UPDATE products SET deleted = 1, updated_at = datetime('now','+8 hours') WHERE uid = ?", [uid]);
    res.json({ ok: true });
  });

  // POST /products/claim
  router.post('/products/claim', function (req, res) {
    if (!req.user) return res.status(401).json({ error: '未登录' });
    var uids = req.body.uids || [];
    if (!Array.isArray(uids) || !uids.length) return res.status(400).json({ error: '请选择商品' });
    var claimed = 0;
    uids.forEach(function (uid) {
      run("UPDATE products SET owner = ?, claim_at = datetime('now','+8 hours'), updated_at = datetime('now','+8 hours') WHERE uid = ? AND (owner IS NULL OR owner = '')",
        [req.user.username, uid]);
      claimed++;
    });
    res.json({ ok: true, claimed: claimed });
  });

  // POST /products/assign (admin only)
  router.post('/products/assign', function (req, res) {
    if (!req.user || req.user.role !== 'admin') return res.status(403).json({ error: '权限不足' });
    var uids = req.body.uids || [];
    var assignTo = (req.body.username || '').trim();
    if (!assignTo) return res.status(400).json({ error: '请指定目标用户' });
    uids.forEach(function (uid) {
      run("UPDATE products SET owner = ?, claim_at = datetime('now','+8 hours'), updated_at = datetime('now','+8 hours') WHERE uid = ?", [assignTo, uid]);
    });
    res.json({ ok: true, assigned: uids.length });
  });

  // POST /product/batch-status — owner isolation
  router.post('/product/batch-status', function (req, res) {
    var ids = req.body.ids || [];
    var status = req.body.status;
    if (!Array.isArray(ids) || !ids.length) return res.json({ ok: true, updated: 0 });
    if (req.user && req.user.role !== 'admin') {
      var updated = 0;
      ids.forEach(function (uid) {
        var p = getOne('SELECT owner FROM products WHERE uid = ?', [uid]);
        if (p && (!p.owner || p.owner === req.user.username)) {
          run("UPDATE products SET status = ?, updated_at = datetime('now','+8 hours') WHERE uid = ?", [status, uid]);
          updated++;
        }
      });
      res.json({ ok: true, updated: updated });
    } else {
      var placeholders = ids.map(function () { return '?'; }).join(',');
      run("UPDATE products SET status = ?, updated_at = datetime('now','+8 hours') WHERE uid IN (" + placeholders + ")", [status].concat(ids));
      res.json({ ok: true, updated: ids.length });
    }
  });

  // ===== Category routes with role-based access =====
  var catRouter = express.Router();
  var opOnly = requireRole('operator', 'admin');

  catRouter.get('/category-mappings', function (req, res) {
    if (!req.user) return res.status(401).json({ error: '未登录' });
    var rows = getAll('SELECT id, category_name, custom_category FROM category_mappings ORDER BY category_name');
    res.json(rows.map(function (r) { return { id: r.id, categoryName: r.category_name, customCategory: r.custom_category }; }));
  });

  catRouter.post('/category-mappings', opOnly, function (req, res) {
    var categoryName = (req.body.categoryName || '').trim();
    var customCategory = (req.body.customCategory || '').trim();
    if (!categoryName || !customCategory) return res.status(400).json({ error: '参数不完整' });
    run("INSERT OR IGNORE INTO category_mappings (category_name, custom_category, count, source, created_at, updated_at) VALUES (?, ?, 1, 'manual', datetime('now','+8 hours'), datetime('now','+8 hours'))",
      [categoryName, customCategory]);
    res.json({ ok: true });
  });

  catRouter.delete('/category-mappings/:id', opOnly, function (req, res) {
    run('DELETE FROM category_mappings WHERE id = ?', [parseInt(req.params.id)]);
    res.json({ ok: true });
  });

  catRouter.get('/keyword-synonyms', function (req, res) {
    if (!req.user) return res.status(401).json({ error: '未登录' });
    var rows = getAll('SELECT id, word_a, word_b FROM keyword_synonyms ORDER BY id');
    res.json(rows);
  });

  catRouter.post('/keyword-synonyms', opOnly, function (req, res) {
    var wordA = (req.body.wordA || '').trim();
    var wordB = (req.body.wordB || '').trim();
    if (!wordA || !wordB) return res.status(400).json({ error: '参数不完整' });
    run("INSERT OR IGNORE INTO keyword_synonyms (word_a, word_b, created_at, updated_at) VALUES (?, ?, datetime('now','+8 hours'), datetime('now','+8 hours'))", [wordA, wordB]);
    res.json({ ok: true });
  });

  catRouter.delete('/keyword-synonyms/:id', opOnly, function (req, res) {
    run('DELETE FROM keyword_synonyms WHERE id = ?', [parseInt(req.params.id)]);
    res.json({ ok: true });
  });

  // ===== Settings routes with admin-only write =====
  var settingsRouter = express.Router();

  settingsRouter.get('/settings', function (req, res) {
    var rows = getAll('SELECT key, value, updated_at FROM settings');
    var result = {};
    rows.forEach(function (r) { result[r.key] = { value: r.value, updated_at: r.updated_at }; });
    res.json(result);
  });

  settingsRouter.put('/settings', requireRole('admin'), function (req, res) {
    var items = req.body.items;
    if (!Array.isArray(items) || !items.length) return res.json({ ok: true });
    items.forEach(function (item) {
      run("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now','+8 hours'))", [item.key, item.value]);
    });
    res.json({ ok: true });
  });

  settingsRouter.get('/settings-export', requireRole('admin'), function (req, res) {
    var rows = getAll('SELECT key, value FROM settings');
    var data = {};
    rows.forEach(function (r) { data[r.key] = r.value; });
    res.json(data);
  });

  settingsRouter.post('/settings-import', requireRole('admin'), function (req, res) {
    var data = req.body;
    if (!data || typeof data !== 'object') return res.status(400).json({ error: '无效数据' });
    var count = 0;
    Object.keys(data).forEach(function (key) {
      run("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now','+8 hours'))", [key, String(data[key])]);
      count++;
    });
    res.json({ ok: true, imported: count });
  });

  // ===== Sync routes (admin only) =====
  var syncRouter = express.Router();
  syncRouter.use(requireRole('admin'));
  syncRouter.get('/config', function (req, res) { res.json({ configured: false }); });
  syncRouter.post('/test', function (req, res) { res.json({ ok: true }); });

  app.use('/api', router);
  app.use('/api', catRouter);
  app.use('/api', settingsRouter);
  app.use('/api/sync', syncRouter);

  return app;
}

// ===== Setup =====
var app;
var adminToken, operatorToken, viewerToken;

beforeAll(async function () {
  await initTestDb();
  run("INSERT OR REPLACE INTO settings (key, value) VALUES ('jwt_secret', '" + TEST_SECRET + "')");
  app = createApp();

  // Create users for tokens
  var adminUser = insertTestUser({ username: 'admin', role: 'admin' });
  var adminRow = getOne('SELECT id FROM users WHERE username = ?', ['admin']);
  adminToken = jwt.sign({ id: adminRow.id, username: 'admin', role: 'admin' }, TEST_SECRET);

  var opUser = insertTestUser({ username: 'operator1', role: 'operator' });
  var opRow = getOne('SELECT id FROM users WHERE username = ?', ['operator1']);
  operatorToken = jwt.sign({ id: opRow.id, username: 'operator1', role: 'operator' }, TEST_SECRET);

  var viewerUser = insertTestUser({ username: 'viewer1', role: 'viewer' });
  var viewerRow = getOne('SELECT id FROM users WHERE username = ?', ['viewer1']);
  viewerToken = jwt.sign({ id: viewerRow.id, username: 'viewer1', role: 'viewer' }, TEST_SECRET);
});

beforeEach(function () {
  try { run('DELETE FROM products'); } catch (e) {}
  try { run('DELETE FROM category_mappings'); } catch (e) {}
  try { run('DELETE FROM keyword_synonyms'); } catch (e) {}
  try { run('DELETE FROM settings'); } catch (e) {}
  // Re-insert jwt_secret
  run("INSERT OR REPLACE INTO settings (key, value) VALUES ('jwt_secret', '" + TEST_SECRET + "')");
  // Re-insert the 3 users in case they were deleted
  try {
    run("INSERT OR IGNORE INTO users (username, password_hash, password_salt, display_name, role, created_at, updated_at) VALUES ('admin', ?, ?, '管理员', 'admin', datetime('now','+8 hours'), datetime('now','+8 hours'))",
      [crypto.createHash('sha256').update('testsalt' + 'password123').digest('hex'), 'testsalt']);
    run("INSERT OR IGNORE INTO users (username, password_hash, password_salt, display_name, role, created_at, updated_at) VALUES ('operator1', ?, ?, '操作员', 'operator', datetime('now','+8 hours'), datetime('now','+8 hours'))",
      [crypto.createHash('sha256').update('testsalt' + 'password123').digest('hex'), 'testsalt']);
    run("INSERT OR IGNORE INTO users (username, password_hash, password_salt, display_name, role, created_at, updated_at) VALUES ('viewer1', ?, ?, '查看者', 'viewer', datetime('now','+8 hours'), datetime('now','+8 hours'))",
      [crypto.createHash('sha256').update('testsalt' + 'password123').digest('hex'), 'testsalt']);
  } catch (e) {}
});

afterAll(function () {
  var auth = require('../../middleware/auth');
  auth._setDb(null);
  var usersModule = require('../../routes/users');
  usersModule._setDb(null);
});

// ===================================================================
// (a) 用户重名检测 — 创建同名用户应失败
// ===================================================================
describe('用户重名检测', function () {
  test('创建同名用户应返回 400', async function () {
    // Insert first user via the actual route
    var res1 = await request(app)
      .post('/api/users')
      .set('Authorization', 'Bearer ' + adminToken)
      .send({ username: 'dupuser', password: 'password123', role: 'operator' });
    expect(res1.status).toBe(200);
    expect(res1.body.ok).toBe(true);

    // Second create should fail
    var res2 = await request(app)
      .post('/api/users')
      .set('Authorization', 'Bearer ' + adminToken)
      .send({ username: 'dupuser', password: 'password456', role: 'operator' });
    expect(res2.status).toBe(400);
    expect(res2.body.error).toContain('已存在');
  });

  test('创建不同名用户应成功', async function () {
    var res = await request(app)
      .post('/api/users')
      .set('Authorization', 'Bearer ' + adminToken)
      .send({ username: 'uniqueuser1', password: 'password123', role: 'operator' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    var res2 = await request(app)
      .post('/api/users')
      .set('Authorization', 'Bearer ' + adminToken)
      .send({ username: 'uniqueuser2', password: 'password123', role: 'operator' });
    expect(res2.status).toBe(200);
    expect(res2.body.ok).toBe(true);
  });
});

// ===================================================================
// (b) 删除用户后其商品的 owner 应保持不变（不自动清空）
// ===================================================================
describe('删除用户后商品 owner 保持', function () {
  test('禁用用户后其商品的 owner 不变', async function () {
    var targetUser = insertTestUser({ username: 'targetuser', role: 'operator' });
    var targetRow = getOne('SELECT id FROM users WHERE username = ?', ['targetuser']);

    // Create products owned by targetuser
    var p1 = insertTestProduct({ uid: 'owned-1', owner: 'targetuser', title: 'Owned Product 1' });
    var p2 = insertTestProduct({ uid: 'owned-2', owner: 'targetuser', title: 'Owned Product 2' });

    // Verify ownership
    var check1 = getOne('SELECT owner FROM products WHERE uid = ?', ['owned-1']);
    expect(check1.owner).toBe('targetuser');

    // Disable the user (soft delete)
    var res = await request(app)
      .delete('/api/users/' + targetRow.id)
      .set('Authorization', 'Bearer ' + adminToken);
    expect(res.status).toBe(200);

    // Verify products still have the original owner
    var after1 = getOne('SELECT owner FROM products WHERE uid = ?', ['owned-1']);
    var after2 = getOne('SELECT owner FROM products WHERE uid = ?', ['owned-2']);
    expect(after1.owner).toBe('targetuser');
    expect(after2.owner).toBe('targetuser');
  });

  test('禁用用户后用户表 disabled=1', async function () {
    var targetUser = insertTestUser({ username: 'delme', role: 'operator' });
    var targetRow = getOne('SELECT id FROM users WHERE username = ?', ['delme']);

    var res = await request(app)
      .delete('/api/users/' + targetRow.id)
      .set('Authorization', 'Bearer ' + adminToken);
    expect(res.status).toBe(200);

    var user = getOne('SELECT disabled FROM users WHERE id = ?', [targetRow.id]);
    expect(user.disabled).toBe(1);
  });
});

// ===================================================================
// (c) operator 不能修改其他人的商品标题
// ===================================================================
describe('operator 编辑隔离', function () {
  test('operator 不能修改其他人的商品标题', async function () {
    insertTestProduct({ uid: 'edit-other-title', owner: 'admin', title: 'Admin Product' });

    var res = await request(app)
      .put('/api/product/edit-other-title')
      .set('Authorization', 'Bearer ' + operatorToken)
      .send({ title: 'Hacked Title' });
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('无权');

    // Title should remain unchanged
    var product = getOne('SELECT title FROM products WHERE uid = ?', ['edit-other-title']);
    expect(product.title).toBe('Admin Product');
  });

  test('operator 可以修改自己的商品标题', async function () {
    insertTestProduct({ uid: 'edit-own-title', owner: 'operator1', title: 'My Product' });

    var res = await request(app)
      .put('/api/product/edit-own-title')
      .set('Authorization', 'Bearer ' + operatorToken)
      .send({ title: 'Updated Title' });
    expect(res.status).toBe(200);

    var product = getOne('SELECT title FROM products WHERE uid = ?', ['edit-own-title']);
    expect(product.title).toBe('Updated Title');
  });

  test('operator 可以修改 inbox（owner 为空）的商品标题', async function () {
    insertTestProduct({ uid: 'edit-inbox-title', owner: '', title: 'Inbox Product' });

    var res = await request(app)
      .put('/api/product/edit-inbox-title')
      .set('Authorization', 'Bearer ' + operatorToken)
      .send({ title: 'Claimed and Edited' });
    expect(res.status).toBe(200);
  });
});

// ===================================================================
// (d) operator 不能删除其他人的商品
// ===================================================================
describe('operator 删除隔离', function () {
  test('operator 不能删除其他人的商品', async function () {
    insertTestProduct({ uid: 'del-other-prod', owner: 'admin', title: 'Admin Product' });

    var res = await request(app)
      .delete('/api/product/del-other-prod')
      .set('Authorization', 'Bearer ' + operatorToken);
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('无权');

    // Product should still exist and not be deleted
    var product = getOne('SELECT deleted FROM products WHERE uid = ?', ['del-other-prod']);
    expect(product.deleted).toBe(0);
  });

  test('operator 可以删除自己的商品', async function () {
    insertTestProduct({ uid: 'del-own-prod', owner: 'operator1', title: 'My Product' });

    var res = await request(app)
      .delete('/api/product/del-own-prod')
      .set('Authorization', 'Bearer ' + operatorToken);
    expect(res.status).toBe(200);

    var product = getOne('SELECT deleted FROM products WHERE uid = ?', ['del-own-prod']);
    expect(product.deleted).toBe(1);
  });

  test('admin 可以删除任意人的商品', async function () {
    insertTestProduct({ uid: 'del-admin-prod', owner: 'operator1', title: 'Operator Product' });

    var res = await request(app)
      .delete('/api/product/del-admin-prod')
      .set('Authorization', 'Bearer ' + adminToken);
    expect(res.status).toBe(200);

    var product = getOne('SELECT deleted FROM products WHERE uid = ?', ['del-admin-prod']);
    expect(product.deleted).toBe(1);
  });
});

// ===================================================================
// (e) 未登录采集商品 owner 为空，登录采集有 owner
// ===================================================================
describe('采集商品 owner', function () {
  test('未登录采集商品 owner 为空', async function () {
    var res = await request(app)
      .post('/api/product')
      .send({ title: 'Anonymous Product', sourceUrl: 'https://1688.com/offer/anon1.html' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    var product = getOne('SELECT owner FROM products WHERE uid = ?', [res.body.uid]);
    expect(product.owner).toBe('');
  });

  test('登录采集商品 owner 为当前用户名', async function () {
    var res = await request(app)
      .post('/api/product')
      .set('Authorization', 'Bearer ' + operatorToken)
      .send({ title: 'Operator Product', sourceUrl: 'https://1688.com/offer/op1.html' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    var product = getOne('SELECT owner FROM products WHERE uid = ?', [res.body.uid]);
    expect(product.owner).toBe('operator1');
  });

  test('admin 采集商品 owner 为 admin', async function () {
    var res = await request(app)
      .post('/api/product')
      .set('Authorization', 'Bearer ' + adminToken)
      .send({ title: 'Admin Product', sourceUrl: 'https://1688.com/offer/adm1.html' });
    expect(res.status).toBe(200);

    var product = getOne('SELECT owner FROM products WHERE uid = ?', [res.body.uid]);
    expect(product.owner).toBe('admin');
  });
});

// ===================================================================
// (f) 认领空商品后 owner 变为当前用户
// ===================================================================
describe('认领商品', function () {
  test('认领空商品后 owner 变为当前用户', async function () {
    insertTestProduct({ uid: 'claim-empty', owner: '' });

    var res = await request(app)
      .post('/api/products/claim')
      .set('Authorization', 'Bearer ' + operatorToken)
      .send({ uids: ['claim-empty'] });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    var product = getOne('SELECT owner, claim_at FROM products WHERE uid = ?', ['claim-empty']);
    expect(product.owner).toBe('operator1');
    expect(product.claim_at).toBeTruthy();
  });

  test('不能认领已有 owner 的商品', async function () {
    insertTestProduct({ uid: 'claim-owned', owner: 'admin' });

    await request(app)
      .post('/api/products/claim')
      .set('Authorization', 'Bearer ' + operatorToken)
      .send({ uids: ['claim-owned'] });

    var product = getOne('SELECT owner FROM products WHERE uid = ?', ['claim-owned']);
    expect(product.owner).toBe('admin'); // unchanged
  });

  test('批量认领只认领空商品', async function () {
    insertTestProduct({ uid: 'batch-claim-1', owner: '' });
    insertTestProduct({ uid: 'batch-claim-2', owner: '' });
    insertTestProduct({ uid: 'batch-claim-3', owner: 'admin' }); // already owned

    var res = await request(app)
      .post('/api/products/claim')
      .set('Authorization', 'Bearer ' + operatorToken)
      .send({ uids: ['batch-claim-1', 'batch-claim-2', 'batch-claim-3'] });
    expect(res.status).toBe(200);

    var p1 = getOne('SELECT owner FROM products WHERE uid = ?', ['batch-claim-1']);
    var p2 = getOne('SELECT owner FROM products WHERE uid = ?', ['batch-claim-2']);
    var p3 = getOne('SELECT owner FROM products WHERE uid = ?', ['batch-claim-3']);
    expect(p1.owner).toBe('operator1');
    expect(p2.owner).toBe('operator1');
    expect(p3.owner).toBe('admin'); // unchanged
  });

  test('未登录不能认领', async function () {
    var res = await request(app)
      .post('/api/products/claim')
      .send({ uids: ['some-uid'] });
    expect(res.status).toBe(401);
  });
});

// ===================================================================
// (g) admin 分配商品给指定用户
// ===================================================================
describe('分配商品 (admin)', function () {
  test('admin 分配商品给指定用户', async function () {
    insertTestProduct({ uid: 'assign-to-op', owner: '' });
    insertTestProduct({ uid: 'assign-to-op2', owner: 'admin' });

    var res = await request(app)
      .post('/api/products/assign')
      .set('Authorization', 'Bearer ' + adminToken)
      .send({ uids: ['assign-to-op', 'assign-to-op2'], username: 'operator1' });
    expect(res.status).toBe(200);
    expect(res.body.assigned).toBe(2);

    var p1 = getOne('SELECT owner FROM products WHERE uid = ?', ['assign-to-op']);
    var p2 = getOne('SELECT owner FROM products WHERE uid = ?', ['assign-to-op2']);
    expect(p1.owner).toBe('operator1');
    expect(p2.owner).toBe('operator1');
  });

  test('operator 不能分配商品', async function () {
    var res = await request(app)
      .post('/api/products/assign')
      .set('Authorization', 'Bearer ' + operatorToken)
      .send({ uids: ['x'], username: 'admin' });
    expect(res.status).toBe(403);
  });

  test('viewer 不能分配商品', async function () {
    var res = await request(app)
      .post('/api/products/assign')
      .set('Authorization', 'Bearer ' + viewerToken)
      .send({ uids: ['x'], username: 'admin' });
    expect(res.status).toBe(403);
  });

  test('分配需要指定 username', async function () {
    var res = await request(app)
      .post('/api/products/assign')
      .set('Authorization', 'Bearer ' + adminToken)
      .send({ uids: ['x'] });
    expect(res.status).toBe(400);
  });

  test('未登录不能分配', async function () {
    var res = await request(app)
      .post('/api/products/assign')
      .send({ uids: ['x'], username: 'admin' });
    expect(res.status).toBe(403);
  });
});

// ===================================================================
// (h) 修改密码后旧 token 失效
// ===================================================================
describe('修改密码', function () {
  test('修改密码后旧密码不能登录', async function () {
    var oldSalt = 'oldpw-salt-' + Date.now();
    var oldHash = crypto.createHash('sha256').update(oldSalt + 'oldpass123').digest('hex');
    insertTestUser({ username: 'changepw-user', password_hash: oldHash, password_salt: oldSalt });

    var row = getOne('SELECT id FROM users WHERE username = ?', ['changepw-user']);
    var token = jwt.sign({ id: row.id, username: 'changepw-user', role: 'operator' }, TEST_SECRET);

    // Change password
    var res = await request(app)
      .post('/api/change-password')
      .set('Authorization', 'Bearer ' + token)
      .send({ oldPassword: 'oldpass123', newPassword: 'newpass456' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    // Verify new hash is different
    var updated = getOne('SELECT password_hash, password_salt FROM users WHERE username = ?', ['changepw-user']);
    var newExpectedHash = crypto.createHash('sha256').update(updated.password_salt + 'newpass456').digest('hex');
    expect(updated.password_hash).toBe(newExpectedHash);

    // Verify old password no longer works
    var loginRes = await request(app)
      .post('/api/login')
      .send({ username: 'changepw-user', password: 'oldpass123' });
    expect(loginRes.status).toBe(401);
  });

  test('新密码可以正常登录', async function () {
    var oldSalt = 'login-salt-' + Date.now();
    var oldHash = crypto.createHash('sha256').update(oldSalt + 'oldpass').digest('hex');
    insertTestUser({ username: 'newlogin-user', password_hash: oldHash, password_salt: oldSalt });

    var row = getOne('SELECT id FROM users WHERE username = ?', ['newlogin-user']);
    var token = jwt.sign({ id: row.id, username: 'newlogin-user', role: 'operator' }, TEST_SECRET);

    // Change password
    await request(app)
      .post('/api/change-password')
      .set('Authorization', 'Bearer ' + token)
      .send({ oldPassword: 'oldpass', newPassword: 'brandnewpass' });

    // Login with new password
    var loginRes = await request(app)
      .post('/api/login')
      .send({ username: 'newlogin-user', password: 'brandnewpass' });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.ok).toBe(true);
    expect(loginRes.body.token).toBeTruthy();
  });

  test('修改密码需要验证旧密码', async function () {
    var oldSalt = 'verify-salt-' + Date.now();
    var oldHash = crypto.createHash('sha256').update(oldSalt + 'correctpass').digest('hex');
    insertTestUser({ username: 'verify-user', password_hash: oldHash, password_salt: oldSalt });

    var row = getOne('SELECT id FROM users WHERE username = ?', ['verify-user']);
    var token = jwt.sign({ id: row.id, username: 'verify-user', role: 'operator' }, TEST_SECRET);

    var res = await request(app)
      .post('/api/change-password')
      .set('Authorization', 'Bearer ' + token)
      .send({ oldPassword: 'wrongpass', newPassword: 'newpass123' });
    expect(res.status).toBe(401);
  });

  test('新密码过短应被拒绝', async function () {
    var oldSalt = 'short-salt-' + Date.now();
    var oldHash = crypto.createHash('sha256').update(oldSalt + 'validpass').digest('hex');
    insertTestUser({ username: 'shortpw-user', password_hash: oldHash, password_salt: oldSalt });

    var row = getOne('SELECT id FROM users WHERE username = ?', ['shortpw-user']);
    var token = jwt.sign({ id: row.id, username: 'shortpw-user', role: 'operator' }, TEST_SECRET);

    var res = await request(app)
      .post('/api/change-password')
      .set('Authorization', 'Bearer ' + token)
      .send({ oldPassword: 'validpass', newPassword: '123' });
    expect(res.status).toBe(400);
  });
});

// ===================================================================
// (i) scope=all 时 admin 看到所有商品，scope=mine 时只看到自己的
// ===================================================================
describe('scope 过滤', function () {
  beforeEach(function () {
    insertTestProduct({ uid: 'scope-admin', owner: 'admin', title: 'Admin Product' });
    insertTestProduct({ uid: 'scope-op', owner: 'operator1', title: 'Operator Product' });
    insertTestProduct({ uid: 'scope-inbox', owner: '', title: 'Inbox Product' });
  });

  test('scope=all 时 admin 看到所有商品（3条）', async function () {
    var res = await request(app)
      .get('/api/product?scope=all')
      .set('Authorization', 'Bearer ' + adminToken);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3);
  });

  test('scope=mine 时 admin 只看到自己的商品', async function () {
    var res = await request(app)
      .get('/api/product?scope=mine')
      .set('Authorization', 'Bearer ' + adminToken);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.list[0].uid).toBe('scope-admin');
  });

  test('scope=mine 时 operator 只看到自己的商品', async function () {
    var res = await request(app)
      .get('/api/product?scope=mine')
      .set('Authorization', 'Bearer ' + operatorToken);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.list[0].uid).toBe('scope-op');
  });

  test('scope=inbox 时看到所有空 owner 商品', async function () {
    var res = await request(app)
      .get('/api/product?scope=inbox')
      .set('Authorization', 'Bearer ' + operatorToken);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.list[0].uid).toBe('scope-inbox');
  });

  test('scope=all 时 operator 只看到自己 + inbox（2条）', async function () {
    var res = await request(app)
      .get('/api/product?scope=all')
      .set('Authorization', 'Bearer ' + operatorToken);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    var uids = res.body.list.map(function (p) { return p.uid; });
    expect(uids).toContain('scope-op');
    expect(uids).toContain('scope-inbox');
    expect(uids).not.toContain('scope-admin');
  });

  test('默认 scope（无参数）时 operator 看到自己 + inbox', async function () {
    var res = await request(app)
      .get('/api/product')
      .set('Authorization', 'Bearer ' + operatorToken);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
  });
});

// ===================================================================
// (j) viewer 只能读取不能写入分类
// ===================================================================
describe('viewer 分类权限', function () {
  test('viewer 可以读取 category-mappings', async function () {
    run("INSERT INTO category_mappings (category_name, custom_category, count, source, created_at, updated_at) VALUES ('1688分类A', 'DXM分类A', 1, 'auto', datetime('now','+8 hours'), datetime('now','+8 hours'))");

    var res = await request(app)
      .get('/api/category-mappings')
      .set('Authorization', 'Bearer ' + viewerToken);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
  });

  test('viewer 不能创建 category-mappings', async function () {
    var res = await request(app)
      .post('/api/category-mappings')
      .set('Authorization', 'Bearer ' + viewerToken)
      .send({ categoryName: 'test', customCategory: 'test' });
    expect(res.status).toBe(403);
  });

  test('viewer 不能删除 category-mappings', async function () {
    var id = run("INSERT INTO category_mappings (category_name, custom_category, count, source, created_at, updated_at) VALUES ('del', 'del', 1, 'auto', datetime('now','+8 hours'), datetime('now','+8 hours'))");
    var row = getOne('SELECT id FROM category_mappings WHERE category_name = ?', ['del']);

    var res = await request(app)
      .delete('/api/category-mappings/' + row.id)
      .set('Authorization', 'Bearer ' + viewerToken);
    expect(res.status).toBe(403);
  });

  test('viewer 可以读取 keyword-synonyms', async function () {
    run("INSERT INTO keyword_synonyms (word_a, word_b, created_at, updated_at) VALUES ('词A', '词B', datetime('now','+8 hours'), datetime('now','+8 hours'))");

    var res = await request(app)
      .get('/api/keyword-synonyms')
      .set('Authorization', 'Bearer ' + viewerToken);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
  });

  test('viewer 不能创建 keyword-synonyms', async function () {
    var res = await request(app)
      .post('/api/keyword-synonyms')
      .set('Authorization', 'Bearer ' + viewerToken)
      .send({ wordA: 'a', wordB: 'b' });
    expect(res.status).toBe(403);
  });

  test('viewer 不能删除 keyword-synonyms', async function () {
    run("INSERT INTO keyword_synonyms (word_a, word_b, created_at, updated_at) VALUES ('X', 'Y', datetime('now','+8 hours'), datetime('now','+8 hours'))");
    var row = getOne('SELECT id FROM keyword_synonyms WHERE word_a = ?', ['X']);

    var res = await request(app)
      .delete('/api/keyword-synonyms/' + row.id)
      .set('Authorization', 'Bearer ' + viewerToken);
    expect(res.status).toBe(403);
  });

  test('operator 可以创建和删除 category-mappings', async function () {
    var res1 = await request(app)
      .post('/api/category-mappings')
      .set('Authorization', 'Bearer ' + operatorToken)
      .send({ categoryName: 'op-cat', customCategory: 'op-dxm' });
    expect(res1.status).toBe(200);

    var row = getOne('SELECT id FROM category_mappings WHERE category_name = ?', ['op-cat']);
    var res2 = await request(app)
      .delete('/api/category-mappings/' + row.id)
      .set('Authorization', 'Bearer ' + operatorToken);
    expect(res2.status).toBe(200);
  });
});

// ===================================================================
// 额外: 设置导入导出权限
// ===================================================================
describe('设置导入导出权限', function () {
  test('admin 可以导出设置', async function () {
    run("INSERT INTO settings (key, value, updated_at) VALUES ('test_key', 'test_value', datetime('now','+8 hours'))");

    var res = await request(app)
      .get('/api/settings-export')
      .set('Authorization', 'Bearer ' + adminToken);
    expect(res.status).toBe(200);
    expect(res.body.test_key).toBe('test_value');
  });

  test('operator 不能导出设置', async function () {
    var res = await request(app)
      .get('/api/settings-export')
      .set('Authorization', 'Bearer ' + operatorToken);
    expect(res.status).toBe(403);
  });

  test('viewer 不能导入设置', async function () {
    var res = await request(app)
      .post('/api/settings-import')
      .set('Authorization', 'Bearer ' + viewerToken)
      .send({ key1: 'value1' });
    expect(res.status).toBe(403);
  });

  test('admin 可以导入设置', async function () {
    var res = await request(app)
      .post('/api/settings-import')
      .set('Authorization', 'Bearer ' + adminToken)
      .send({ import_key: 'import_value' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    var row = getOne("SELECT value FROM settings WHERE key = 'import_key'");
    expect(row.value).toBe('import_value');
  });
});

// ===================================================================
// 额外: 同步路由权限
// ===================================================================
describe('同步路由权限', function () {
  test('admin 可以访问 sync/config', async function () {
    var res = await request(app)
      .get('/api/sync/config')
      .set('Authorization', 'Bearer ' + adminToken);
    expect(res.status).toBe(200);
  });

  test('operator 不能访问 sync/config', async function () {
    var res = await request(app)
      .get('/api/sync/config')
      .set('Authorization', 'Bearer ' + operatorToken);
    expect(res.status).toBe(403);
  });

  test('viewer 不能访问 sync/config', async function () {
    var res = await request(app)
      .get('/api/sync/config')
      .set('Authorization', 'Bearer ' + viewerToken);
    expect(res.status).toBe(403);
  });
});

// ===================================================================
// 额外: 用户 CRUD 角色限制
// ===================================================================
describe('用户 CRUD 角色限制', function () {
  test('operator 不能创建用户', async function () {
    var res = await request(app)
      .post('/api/users')
      .set('Authorization', 'Bearer ' + operatorToken)
      .send({ username: 'newop', password: 'password123' });
    expect(res.status).toBe(403);
  });

  test('viewer 不能创建用户', async function () {
    var res = await request(app)
      .post('/api/users')
      .set('Authorization', 'Bearer ' + viewerToken)
      .send({ username: 'newview', password: 'password123' });
    expect(res.status).toBe(403);
  });

  test('operator 不能查看用户列表', async function () {
    var res = await request(app)
      .get('/api/users')
      .set('Authorization', 'Bearer ' + operatorToken);
    expect(res.status).toBe(403);
  });

  test('operator 不能禁用用户', async function () {
    var targetUser = insertTestUser({ username: 'disable-target', role: 'operator' });
    var targetRow = getOne('SELECT id FROM users WHERE username = ?', ['disable-target']);

    var res = await request(app)
      .delete('/api/users/' + targetRow.id)
      .set('Authorization', 'Bearer ' + operatorToken);
    expect(res.status).toBe(403);
  });

  test('admin 不能禁用自己', async function () {
    var adminRow = getOne('SELECT id FROM users WHERE username = ?', ['admin']);

    var res = await request(app)
      .delete('/api/users/' + adminRow.id)
      .set('Authorization', 'Bearer ' + adminToken);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('自己');
  });
});

// ===================================================================
// 额外: batch-status owner 隔离
// ===================================================================
describe('batch-status owner 隔离', function () {
  test('operator batch-status 只影响自己的和 inbox 商品', async function () {
    var p1 = insertTestProduct({ uid: 'batch-own', owner: 'operator1', status: 0 });
    var p2 = insertTestProduct({ uid: 'batch-other', owner: 'admin', status: 0 });
    var p3 = insertTestProduct({ uid: 'batch-inbox', owner: '', status: 0 });

    var res = await request(app)
      .post('/api/product/batch-status')
      .set('Authorization', 'Bearer ' + operatorToken)
      .send({ ids: ['batch-own', 'batch-other', 'batch-inbox'], status: 1 });
    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(2);

    var own = getOne('SELECT status FROM products WHERE uid = ?', ['batch-own']);
    var other = getOne('SELECT status FROM products WHERE uid = ?', ['batch-other']);
    var inbox = getOne('SELECT status FROM products WHERE uid = ?', ['batch-inbox']);
    expect(own.status).toBe(1);
    expect(other.status).toBe(0); // unaffected
    expect(inbox.status).toBe(1);
  });

  test('admin batch-status 影响所有商品', async function () {
    var p1 = insertTestProduct({ uid: 'batch-a-own', owner: 'admin', status: 0 });
    var p2 = insertTestProduct({ uid: 'batch-a-op', owner: 'operator1', status: 0 });
    var p3 = insertTestProduct({ uid: 'batch-a-inbox', owner: '', status: 0 });

    var res = await request(app)
      .post('/api/product/batch-status')
      .set('Authorization', 'Bearer ' + adminToken)
      .send({ ids: ['batch-a-own', 'batch-a-op', 'batch-a-inbox'], status: 1 });
    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(3);

    var r1 = getOne('SELECT status FROM products WHERE uid = ?', ['batch-a-own']);
    var r2 = getOne('SELECT status FROM products WHERE uid = ?', ['batch-a-op']);
    var r3 = getOne('SELECT status FROM products WHERE uid = ?', ['batch-a-inbox']);
    expect(r1.status).toBe(1);
    expect(r2.status).toBe(1);
    expect(r3.status).toBe(1);
  });
});
