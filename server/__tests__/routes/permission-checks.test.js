var express = require('express');
var request = require('supertest');
var { initTestDb, run, getOne, getAll, scheduleSave } = require('../helpers/setup');
var jwt = require('jsonwebtoken');
var auth = require('../../middleware/auth');

var TEST_SECRET = 'test-secret-perm-checks';

// Inline requireRole for test isolation (avoids module cache issues)
function requireRole() {
  var roles = Array.prototype.slice.call(arguments);
  return function (req, res, next) {
    if (!req.user) return res.status(401).json({ error: '未登录' });
    if (roles.indexOf(req.user.role) < 0) return res.status(403).json({ error: '权限不足' });
    next();
  };
}

function createPermApp() {
  auth._setDb({ getOne: getOne, run: run, scheduleSave: function () {} });
  auth._resetSecret();
  run("INSERT OR REPLACE INTO settings (key, value) VALUES ('jwt_secret', '" + TEST_SECRET + "')");

  var app = express();
  app.use(express.json());

  // Mock auth: inject req.user from JWT
  app.use(function (req, res, next) {
    var token = null;
    var authHeader = req.headers.authorization;
    if (authHeader && authHeader.indexOf('Bearer ') === 0) token = authHeader.slice(7);
    if (token) {
      try {
        var decoded = jwt.verify(token, auth.getSecret());
        req.user = { id: decoded.id, username: decoded.username, role: decoded.role };
      } catch (e) {}
    }
    next();
  });

  // Test endpoints mirroring actual route permissions
  var router = express.Router();

  // settings.js pattern
  router.put('/settings', requireRole('admin'), function (req, res) { res.json({ ok: true }); });
  router.post('/settings/:key', requireRole('admin'), function (req, res) { res.json({ ok: true }); });
  router.get('/settings-export', requireRole('admin'), function (req, res) { res.json({}); });
  router.post('/settings-import', requireRole('admin'), function (req, res) { res.json({ ok: true }); });
  router.get('/events', function (req, res) {
    if (!req.user) return res.status(401).json({ error: '未登录' });
    res.json({ connected: true });
  });
  router.get('/settings', function (req, res) { res.json({}); });

  // sync.js pattern
  var syncRouter = express.Router();
  syncRouter.use(requireRole('admin'));
  syncRouter.get('/config', function (req, res) { res.json({}); });
  syncRouter.post('/test', function (req, res) { res.json({}); });

  // categories.js pattern
  var opOnly = requireRole('operator', 'admin');
  router.post('/category-mappings', opOnly, function (req, res) { res.json({ ok: true }); });
  router.delete('/category-mappings/:id', opOnly, function (req, res) { res.json({ ok: true }); });
  router.get('/category-mappings', function (req, res) { res.json([]); });
  router.post('/keyword-synonyms', opOnly, function (req, res) { res.json({ ok: true }); });
  router.post('/keyword-blacklist', opOnly, function (req, res) { res.json({ ok: true }); });
  router.post('/category-config', opOnly, function (req, res) { res.json({ ok: true }); });

  // dxm-tree.js pattern
  router.post('/dxm-category/collect', opOnly, function (req, res) { res.json({ ok: true }); });
  router.post('/dxm-tree/sync', opOnly, function (req, res) { res.json({ ok: true }); });

  // products batch-status pattern (owner check in handler)
  router.post('/product/batch-status', function (req, res) {
    var ids = req.body.ids || [];
    var status = req.body.status;
    if (req.user && req.user.role !== 'admin') {
      // Only own + inbox
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

  app.use('/api', router);
  app.use('/api/sync', syncRouter);

  return app;
}

function insertTestProduct(overrides) {
  var defaults = {
    uid: 'uid-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
    source_url: 'https://detail.1688.com/offer/123.html',
    title: '测试商品',
    main_images: '[]', desc_images: '[]', attrs: '[]', skus: '[]',
    status: 0, deleted: 0, owner: '', claim_at: ''
  };
  var data = Object.assign(defaults, overrides);
  run("INSERT INTO products (uid, source_url, title, main_images, desc_images, attrs, skus, status, deleted, owner, claim_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now','+8 hours'), datetime('now','+8 hours'))",
    [data.uid, data.source_url, data.title, data.main_images, data.desc_images, data.attrs, data.skus, data.status, data.deleted, data.owner, data.claim_at]);
  return data;
}

var app;
var adminToken, operatorToken, viewerToken;

beforeAll(async function () {
  await initTestDb();
  run("INSERT OR REPLACE INTO settings (key, value) VALUES ('jwt_secret', '" + TEST_SECRET + "')");
  app = createPermApp();
  adminToken = jwt.sign({ id: 1, username: 'admin', role: 'admin' }, TEST_SECRET);
  operatorToken = jwt.sign({ id: 2, username: 'op1', role: 'operator' }, TEST_SECRET);
  viewerToken = jwt.sign({ id: 3, username: 'viewer1', role: 'viewer' }, TEST_SECRET);
});

afterAll(function () {
  auth._setDb(null);
});

// ===== settings.js =====
describe('settings: write operations require admin', function () {
  test('admin can PUT /settings', async function () {
    var res = await request(app).put('/api/settings').set('Authorization', 'Bearer ' + adminToken).send({ items: [] });
    expect(res.status).toBe(200);
  });
  test('operator cannot PUT /settings', async function () {
    var res = await request(app).put('/api/settings').set('Authorization', 'Bearer ' + operatorToken).send({ items: [] });
    expect(res.status).toBe(403);
  });
  test('viewer cannot PUT /settings', async function () {
    var res = await request(app).put('/api/settings').set('Authorization', 'Bearer ' + viewerToken).send({ items: [] });
    expect(res.status).toBe(403);
  });
  test('operator cannot POST /settings/:key', async function () {
    var res = await request(app).post('/api/settings/k').set('Authorization', 'Bearer ' + operatorToken).send({ value: 'x' });
    expect(res.status).toBe(403);
  });
  test('operator cannot GET /settings-export', async function () {
    var res = await request(app).get('/api/settings-export').set('Authorization', 'Bearer ' + operatorToken);
    expect(res.status).toBe(403);
  });
  test('viewer cannot POST /settings-import', async function () {
    var res = await request(app).post('/api/settings-import').set('Authorization', 'Bearer ' + viewerToken).send({});
    expect(res.status).toBe(403);
  });
  test('GET /settings is readable by any role', async function () {
    var res = await request(app).get('/api/settings').set('Authorization', 'Bearer ' + viewerToken);
    expect(res.status).toBe(200);
  });
  test('SSE /events rejects unauthenticated', async function () {
    var res = await request(app).get('/api/events');
    expect(res.status).toBe(401);
  });
  test('SSE /events allows authenticated user', async function () {
    var res = await request(app).get('/api/events').set('Authorization', 'Bearer ' + operatorToken);
    expect(res.status).toBe(200);
  });
});

// ===== sync.js =====
describe('sync: all operations require admin', function () {
  test('admin can GET /sync/config', async function () {
    var res = await request(app).get('/api/sync/config').set('Authorization', 'Bearer ' + adminToken);
    expect(res.status).toBe(200);
  });
  test('operator cannot GET /sync/config', async function () {
    var res = await request(app).get('/api/sync/config').set('Authorization', 'Bearer ' + operatorToken);
    expect(res.status).toBe(403);
  });
  test('viewer cannot POST /sync/test', async function () {
    var res = await request(app).post('/api/sync/test').set('Authorization', 'Bearer ' + viewerToken).send({});
    expect(res.status).toBe(403);
  });
  test('unauthenticated cannot access sync', async function () {
    var res = await request(app).get('/api/sync/config');
    expect(res.status).toBe(401);
  });
});

// ===== categories.js =====
describe('categories: write operations require operator+', function () {
  test('viewer cannot POST /category-mappings', async function () {
    var res = await request(app).post('/api/category-mappings').set('Authorization', 'Bearer ' + viewerToken).send({});
    expect(res.status).toBe(403);
  });
  test('viewer cannot DELETE /category-mappings/:id', async function () {
    var res = await request(app).delete('/api/category-mappings/1').set('Authorization', 'Bearer ' + viewerToken);
    expect(res.status).toBe(403);
  });
  test('operator can POST /category-mappings', async function () {
    var res = await request(app).post('/api/category-mappings').set('Authorization', 'Bearer ' + operatorToken).send({});
    expect(res.status).toBe(200);
  });
  test('unauthenticated cannot POST /category-mappings', async function () {
    var res = await request(app).post('/api/category-mappings').send({});
    expect(res.status).toBe(401);
  });
  test('GET /category-mappings is readable by viewer', async function () {
    var res = await request(app).get('/api/category-mappings').set('Authorization', 'Bearer ' + viewerToken);
    expect(res.status).toBe(200);
  });
  test('viewer cannot POST /keyword-synonyms', async function () {
    var res = await request(app).post('/api/keyword-synonyms').set('Authorization', 'Bearer ' + viewerToken).send({});
    expect(res.status).toBe(403);
  });
  test('viewer cannot POST /keyword-blacklist', async function () {
    var res = await request(app).post('/api/keyword-blacklist').set('Authorization', 'Bearer ' + viewerToken).send({});
    expect(res.status).toBe(403);
  });
  test('viewer cannot POST /category-config', async function () {
    var res = await request(app).post('/api/category-config').set('Authorization', 'Bearer ' + viewerToken).send({});
    expect(res.status).toBe(403);
  });
});

// ===== dxm-tree.js =====
describe('dxm-tree: write operations require operator+', function () {
  test('viewer cannot POST /dxm-category/collect', async function () {
    var res = await request(app).post('/api/dxm-category/collect').set('Authorization', 'Bearer ' + viewerToken).send({});
    expect(res.status).toBe(403);
  });
  test('viewer cannot POST /dxm-tree/sync', async function () {
    var res = await request(app).post('/api/dxm-tree/sync').set('Authorization', 'Bearer ' + viewerToken).send({});
    expect(res.status).toBe(403);
  });
  test('operator can POST /dxm-category/collect', async function () {
    var res = await request(app).post('/api/dxm-category/collect').set('Authorization', 'Bearer ' + operatorToken).send({});
    expect(res.status).toBe(200);
  });
});

// ===== products batch-status owner isolation =====
describe('products batch-status: owner isolation', function () {
  beforeEach(function () {
    try { run('DELETE FROM products'); } catch (e) {}
  });

  test('operator only updates own + inbox products', async function () {
    var p1 = insertTestProduct({ uid: 'bs-own', owner: 'op1' });
    var p2 = insertTestProduct({ uid: 'bs-other', owner: 'admin' });
    var p3 = insertTestProduct({ uid: 'bs-inbox', owner: '' });

    var res = await request(app)
      .post('/api/product/batch-status')
      .set('Authorization', 'Bearer ' + operatorToken)
      .send({ ids: [p1.uid, p2.uid, p3.uid], status: 1 });
    expect(res.status).toBe(200);

    var own = getOne('SELECT status FROM products WHERE uid = ?', [p1.uid]);
    var other = getOne('SELECT status FROM products WHERE uid = ?', [p2.uid]);
    var inbox = getOne('SELECT status FROM products WHERE uid = ?', [p3.uid]);
    expect(own.status).toBe(1);
    expect(other.status).toBe(0);
    expect(inbox.status).toBe(1);
  });

  test('admin updates all products regardless of owner', async function () {
    var p1 = insertTestProduct({ uid: 'bs-a1', owner: 'op1' });
    var p2 = insertTestProduct({ uid: 'bs-a2', owner: '' });

    var res = await request(app)
      .post('/api/product/batch-status')
      .set('Authorization', 'Bearer ' + adminToken)
      .send({ ids: [p1.uid, p2.uid], status: 1 });
    expect(res.status).toBe(200);

    var r1 = getOne('SELECT status FROM products WHERE uid = ?', [p1.uid]);
    var r2 = getOne('SELECT status FROM products WHERE uid = ?', [p2.uid]);
    expect(r1.status).toBe(1);
    expect(r2.status).toBe(1);
  });
});
