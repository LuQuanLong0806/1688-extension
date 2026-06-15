// product-check-owner.test.js — 验证 GET /api/product/check 的多用户隔离
// 场景：换用户后不应该看到别人的采集记录；只能看"自己的 + 无主的"
// 防止 regression：之前 SQL 是全局查询，任何用户都能看到任何商品
//
// 用 inline 路由镜像 server/routes/products.js 的真实 SQL（与 product-claim.test.js 同风格）

const express = require('express');
const request = require('supertest');
const { initTestDb, run, getOne, getAll, scheduleSave } = require('../helpers/setup');
const jwt = require('jsonwebtoken');
const auth = require('../../middleware/auth');

const TEST_SECRET = 'test-product-check-owner';

function signTokenFor(user) {
  return jwt.sign({ id: user.id, username: user.username, role: user.role }, TEST_SECRET);
}

function insertUser(overrides) {
  var defaults = {
    username: 'admin',
    password_hash: 'x',
    password_salt: 'y',
    display_name: '',
    role: 'admin',
    must_change_password: 0,
    disabled: 0,
    token_invalid_at: ''
  };
  var data = Object.assign(defaults, overrides);
  run("INSERT INTO users (username, password_hash, password_salt, display_name, role, must_change_password, disabled, token_invalid_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now','+8 hours'), datetime('now','+8 hours'))",
    [data.username, data.password_hash, data.password_salt, data.display_name, data.role, data.must_change_password, data.disabled, data.token_invalid_at]);
  return getOne('SELECT id, username, role FROM users WHERE username = ?', [data.username]);
}

function insertProduct(overrides) {
  var defaults = {
    uid: 'uid-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
    source_url: 'https://detail.1688.com/offer/999.html',
    title: '测试商品',
    main_images: '[]',
    desc_images: '[]',
    detail_images: '[]',
    attrs: '[]',
    skus: '[]',
    status: 0,
    deleted: 0,
    owner: ''
  };
  var data = Object.assign(defaults, overrides);
  run("INSERT INTO products (uid, source_url, title, main_images, desc_images, detail_images, attrs, skus, status, deleted, owner, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now','+8 hours'), datetime('now','+8 hours'))",
    [data.uid, data.source_url, data.title, data.main_images, data.desc_images, data.detail_images, data.attrs, data.skus, data.status, data.deleted, data.owner]);
  return data;
}

let app;

beforeAll(async () => {
  await initTestDb();
  run("INSERT OR REPLACE INTO settings (key, value) VALUES ('jwt_secret', '" + TEST_SECRET + "')");
  auth._setDb({ getOne: getOne, run: run, scheduleSave: function () {} });
  auth._resetSecret();

  // Inline 路由：镜像 server/routes/products.js 的 /api/product/check 真实 SQL（含 owner 过滤）
  var router = express.Router();
  router.get('/product/check', function (req, res) {
    try {
      var offerId = (req.query.offerId || '').trim();
      if (!offerId) return res.json({ exists: false });
      var escaped = offerId.replace(/[%_\\]/g, '\\$&');
      // 多用户隔离：admin 看全部；非 admin 只看"自己的 + 无主的"
      var ownerClause;
      var ownerParams = ['%' + escaped + '%'];
      if (req.user && req.user.role === 'admin') {
        ownerClause = '';
      } else if (req.user && req.user.username) {
        ownerClause = " AND (owner = ? OR owner IS NULL OR owner = '')";
        ownerParams.push(req.user.username);
      } else {
        ownerClause = " AND (owner IS NULL OR owner = '')";
      }
      var sql = "SELECT id, uid, title, status FROM products WHERE deleted = 0 AND source_url LIKE ? ESCAPE '\\'" + ownerClause + " LIMIT 1";
      var row = getOne(sql, ownerParams);
      if (row) res.json({ exists: true, id: row.id, title: row.title, status: row.status });
      else res.json({ exists: false });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app = express();
  app.use(express.json());
  app.use(auth.authMiddleware);
  app.use('/api', router);
});

beforeEach(() => {
  try { run('DELETE FROM users'); } catch (e) {}
  try { run('DELETE FROM products'); } catch (e) {}
});

afterAll(() => {
  auth._setDb(null);
});

describe('GET /api/product/check 多用户隔离', () => {
  test('admin 能看到所有商品（不管 owner 是谁）', async () => {
    var admin = insertUser({ username: 'admin', role: 'admin' });
    insertProduct({ source_url: 'https://detail.1688.com/offer/888.html', owner: 'suyu' });
    var res = await request(app)
      .get('/api/product/check?offerId=888')
      .set('Authorization', 'Bearer ' + signTokenFor(admin));
    expect(res.status).toBe(200);
    expect(res.body.exists).toBe(true);
  });

  test('非 admin 看不到别人的商品 → exists:false', async () => {
    var alice = insertUser({ username: 'alice', role: 'operator' });
    insertProduct({ source_url: 'https://detail.1688.com/offer/777.html', owner: 'bob' });
    var res = await request(app)
      .get('/api/product/check?offerId=777')
      .set('Authorization', 'Bearer ' + signTokenFor(alice));
    expect(res.status).toBe(200);
    expect(res.body.exists).toBe(false);
  });

  test('非 admin 能看到自己的商品 → exists:true', async () => {
    var alice = insertUser({ username: 'alice', role: 'operator' });
    insertProduct({ source_url: 'https://detail.1688.com/offer/666.html', owner: 'alice' });
    var res = await request(app)
      .get('/api/product/check?offerId=666')
      .set('Authorization', 'Bearer ' + signTokenFor(alice));
    expect(res.body.exists).toBe(true);
  });

  test('非 admin 能看到无主商品（inbox） → exists:true', async () => {
    var alice = insertUser({ username: 'alice', role: 'operator' });
    insertProduct({ source_url: 'https://detail.1688.com/offer/555.html', owner: '' });
    var res = await request(app)
      .get('/api/product/check?offerId=555')
      .set('Authorization', 'Bearer ' + signTokenFor(alice));
    expect(res.body.exists).toBe(true);
  });

  test('换用户后看不到前一个用户采集的同一商品', async () => {
    var alice = insertUser({ username: 'alice', role: 'operator' });
    var bob = insertUser({ username: 'bob', role: 'operator' });
    // alice 采集了商品
    insertProduct({ source_url: 'https://detail.1688.com/offer/444.html', owner: 'alice' });
    // alice 自己查 → exists
    var aliceRes = await request(app)
      .get('/api/product/check?offerId=444')
      .set('Authorization', 'Bearer ' + signTokenFor(alice));
    expect(aliceRes.body.exists).toBe(true);
    // bob 查同一个商品 → 不应看到（owner 是 alice）
    var bobRes = await request(app)
      .get('/api/product/check?offerId=444')
      .set('Authorization', 'Bearer ' + signTokenFor(bob));
    expect(bobRes.body.exists).toBe(false);
  });
});
