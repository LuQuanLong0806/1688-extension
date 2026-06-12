const express = require('express');
const request = require('supertest');
const { initTestDb, run, getOne, getAll, scheduleSave } = require('../helpers/setup');
const jwt = require('jsonwebtoken');

const TEST_SECRET = 'test-secret-product-owner';

function insertTestProduct(overrides) {
  var defaults = {
    uid: 'uid-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
    source_url: 'https://detail.1688.com/offer/123.html',
    title: '测试商品',
    main_images: '[]',
    desc_images: '[]',
    attrs: '[]',
    skus: '[]',
    status: 0,
    deleted: 0,
    owner: '',
    claim_at: ''
  };
  var data = Object.assign(defaults, overrides);
  run("INSERT INTO products (uid, source_url, title, main_images, desc_images, attrs, skus, status, deleted, owner, claim_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now','+8 hours'), datetime('now','+8 hours'))",
    [data.uid, data.source_url, data.title, data.main_images, data.desc_images, data.attrs, data.skus, data.status, data.deleted, data.owner, data.claim_at]);
  return data;
}

function createProductApp() {
  var auth = require('../../middleware/auth');
  auth._setDb({ getOne: getOne, run: run, scheduleSave: function () {} });
  auth._resetSecret();
  run("INSERT OR REPLACE INTO settings (key, value) VALUES ('jwt_secret', '" + TEST_SECRET + "')");

  var usersModule = require('../../routes/users');
  usersModule._setDb({ getOne: getOne, run: run, getAll: getAll, scheduleSave: function () {} });

  // Create products router inline with auth user injection
  var router = express.Router();

  // GET /product — with scope support
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

  // PUT /product/:id — owner check
  router.put('/product/:id', function (req, res) {
    var uid = req.params.id;
    if (req.user && req.user.role !== 'admin') {
      var product = getOne('SELECT owner FROM products WHERE uid = ?', [uid]);
      if (product && product.owner && product.owner !== req.user.username) {
        return res.status(403).json({ error: '无权编辑他人的商品' });
      }
    }
    run("UPDATE products SET title = ? WHERE uid = ?", [req.body.title || '', uid]);
    res.json({ ok: true });
  });

  // DELETE /product/:id — owner check
  router.delete('/product/:id', function (req, res) {
    var uid = req.params.id;
    if (req.user && req.user.role !== 'admin') {
      var product = getOne('SELECT owner FROM products WHERE uid = ?', [uid]);
      if (product && product.owner && product.owner !== req.user.username) {
        return res.status(403).json({ error: '无权删除他人的商品' });
      }
    }
    run("UPDATE products SET deleted = 1 WHERE uid = ?", [uid]);
    res.json({ ok: true });
  });

  var app = express();
  app.use(express.json());
  app.use(function (req, res, next) {
    if (req.headers.authorization) {
      var token = req.headers.authorization.replace('Bearer ', '');
      try {
        req.user = jwt.verify(token, TEST_SECRET);
      } catch (e) {}
    }
    next();
  });
  app.use('/api', router);
  return app;
}

let app;
let adminToken, operatorToken, viewerToken;

beforeAll(async () => {
  await initTestDb();
  run("INSERT OR REPLACE INTO settings (key, value) VALUES ('jwt_secret', '" + TEST_SECRET + "')");
  app = createProductApp();
  adminToken = jwt.sign({ id: 1, username: 'admin', role: 'admin' }, TEST_SECRET);
  operatorToken = jwt.sign({ id: 2, username: 'operator1', role: 'operator' }, TEST_SECRET);
  viewerToken = jwt.sign({ id: 3, username: 'viewer1', role: 'viewer' }, TEST_SECRET);
});

beforeEach(() => {
  try { run('DELETE FROM products'); } catch (e) {}
});

afterAll(() => {
  var auth = require('../../middleware/auth');
  auth._setDb(null);
  var usersModule = require('../../routes/users');
  usersModule._setDb(null);
});

describe('Scope filtering', () => {
  test('scope=mine shows only own products', async () => {
    insertTestProduct({ uid: 'mine-1', owner: 'operator1' });
    insertTestProduct({ uid: 'mine-2', owner: 'admin' });
    insertTestProduct({ uid: 'inbox-1', owner: '' });

    const res = await request(app)
      .get('/api/product?scope=mine')
      .set('Authorization', 'Bearer ' + operatorToken);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.list[0].uid).toBe('mine-1');
  });

  test('scope=inbox shows only unowned products', async () => {
    insertTestProduct({ uid: 'inbox-1', owner: '' });
    insertTestProduct({ uid: 'inbox-2', owner: '' });
    insertTestProduct({ uid: 'owned-1', owner: 'operator1' });

    const res = await request(app)
      .get('/api/product?scope=inbox')
      .set('Authorization', 'Bearer ' + operatorToken);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
  });

  test('scope=all admin sees everything', async () => {
    insertTestProduct({ uid: 'a-1', owner: 'admin' });
    insertTestProduct({ uid: 'a-2', owner: 'operator1' });
    insertTestProduct({ uid: 'a-3', owner: '' });

    const res = await request(app)
      .get('/api/product?scope=all')
      .set('Authorization', 'Bearer ' + adminToken);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3);
  });

  test('scope=all non-admin sees own + inbox only', async () => {
    insertTestProduct({ uid: 'na-1', owner: 'operator1' });
    insertTestProduct({ uid: 'na-2', owner: 'admin' });
    insertTestProduct({ uid: 'na-3', owner: '' });

    const res = await request(app)
      .get('/api/product?scope=all')
      .set('Authorization', 'Bearer ' + operatorToken);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
  });

  test('default scope shows own + inbox', async () => {
    insertTestProduct({ uid: 'def-1', owner: 'operator1' });
    insertTestProduct({ uid: 'def-2', owner: 'admin' });
    insertTestProduct({ uid: 'def-3', owner: '' });

    const res = await request(app)
      .get('/api/product')
      .set('Authorization', 'Bearer ' + operatorToken);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
  });
});

describe('Claim products', () => {
  test('claim sets owner to current user', async () => {
    insertTestProduct({ uid: 'claim-1', owner: '' });

    const res = await request(app)
      .post('/api/products/claim')
      .set('Authorization', 'Bearer ' + operatorToken)
      .send({ uids: ['claim-1'] });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    var product = getOne('SELECT owner, claim_at FROM products WHERE uid = ?', ['claim-1']);
    expect(product.owner).toBe('operator1');
    expect(product.claim_at).toBeTruthy();
  });

  test('cannot claim already owned product', async () => {
    insertTestProduct({ uid: 'claimed-1', owner: 'admin' });

    await request(app)
      .post('/api/products/claim')
      .set('Authorization', 'Bearer ' + operatorToken)
      .send({ uids: ['claimed-1'] });

    var product = getOne('SELECT owner FROM products WHERE uid = ?', ['claimed-1']);
    expect(product.owner).toBe('admin');
  });

  test('claim requires login', async () => {
    const res = await request(app)
      .post('/api/products/claim')
      .send({ uids: ['some-uid'] });
    expect(res.status).toBe(401);
  });

  test('claim requires uids', async () => {
    const res = await request(app)
      .post('/api/products/claim')
      .set('Authorization', 'Bearer ' + operatorToken)
      .send({});
    expect(res.status).toBe(400);
  });
});

describe('Assign products (admin)', () => {
  test('admin can assign products', async () => {
    insertTestProduct({ uid: 'assign-1', owner: '' });
    insertTestProduct({ uid: 'assign-2', owner: 'admin' });

    const res = await request(app)
      .post('/api/products/assign')
      .set('Authorization', 'Bearer ' + adminToken)
      .send({ uids: ['assign-1', 'assign-2'], username: 'operator1' });
    expect(res.status).toBe(200);
    expect(res.body.assigned).toBe(2);

    var p1 = getOne('SELECT owner FROM products WHERE uid = ?', ['assign-1']);
    var p2 = getOne('SELECT owner FROM products WHERE uid = ?', ['assign-2']);
    expect(p1.owner).toBe('operator1');
    expect(p2.owner).toBe('operator1');
  });

  test('non-admin cannot assign', async () => {
    const res = await request(app)
      .post('/api/products/assign')
      .set('Authorization', 'Bearer ' + operatorToken)
      .send({ uids: ['x'], username: 'admin' });
    expect(res.status).toBe(403);
  });

  test('assign requires username', async () => {
    const res = await request(app)
      .post('/api/products/assign')
      .set('Authorization', 'Bearer ' + adminToken)
      .send({ uids: ['x'] });
    expect(res.status).toBe(400);
  });
});

describe('Owner permission checks', () => {
  test('operator can edit own product', async () => {
    insertTestProduct({ uid: 'edit-own', owner: 'operator1' });
    const res = await request(app)
      .put('/api/product/edit-own')
      .set('Authorization', 'Bearer ' + operatorToken)
      .send({ title: 'new title' });
    expect(res.status).toBe(200);
  });

  test('operator cannot edit others product', async () => {
    insertTestProduct({ uid: 'edit-other', owner: 'admin' });
    const res = await request(app)
      .put('/api/product/edit-other')
      .set('Authorization', 'Bearer ' + operatorToken)
      .send({ title: 'hacked' });
    expect(res.status).toBe(403);
  });

  test('admin can edit any product', async () => {
    insertTestProduct({ uid: 'edit-admin', owner: 'operator1' });
    const res = await request(app)
      .put('/api/product/edit-admin')
      .set('Authorization', 'Bearer ' + adminToken)
      .send({ title: 'admin edit' });
    expect(res.status).toBe(200);
  });

  test('operator can delete own product', async () => {
    insertTestProduct({ uid: 'del-own', owner: 'operator1' });
    const res = await request(app)
      .delete('/api/product/del-own')
      .set('Authorization', 'Bearer ' + operatorToken);
    expect(res.status).toBe(200);
  });

  test('operator cannot delete others product', async () => {
    insertTestProduct({ uid: 'del-other', owner: 'admin' });
    const res = await request(app)
      .delete('/api/product/del-other')
      .set('Authorization', 'Bearer ' + operatorToken);
    expect(res.status).toBe(403);
  });

  test('anyone can edit inbox product (owner empty)', async () => {
    insertTestProduct({ uid: 'edit-inbox', owner: '' });
    const res = await request(app)
      .put('/api/product/edit-inbox')
      .set('Authorization', 'Bearer ' + operatorToken)
      .send({ title: 'claim and edit' });
    expect(res.status).toBe(200);
  });
});

describe('Owner column in database', () => {
  test('owner column exists after migration', () => {
    var row = getOne("SELECT sql FROM sqlite_master WHERE type='table' AND name='products'");
    expect(row.sql).toContain('owner');
    expect(row.sql).toContain('claim_at');
  });
});
