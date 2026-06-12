var express = require('express');
var request = require('supertest');
var { initTestDb, run, getOne, getAll, scheduleSave } = require('../helpers/setup');
var jwt = require('jsonwebtoken');

var TEST_SECRET = 'test-secret-plugin-auth';

function insertTestUser(overrides) {
  var salt = require('crypto').randomBytes(8).toString('hex');
  var defaults = {
    username: 'testuser',
    password_hash: require('crypto').createHash('sha256').update(salt + 'pass123').digest('hex'),
    password_salt: salt,
    display_name: 'Test User',
    role: 'operator',
    last_login: '',
    must_change_password: 0,
    disabled: 0
  };
  var data = Object.assign(defaults, overrides);
  run("INSERT INTO users (username, password_hash, password_salt, display_name, role, last_login, must_change_password, disabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now','+8 hours'), datetime('now','+8 hours'))",
    [data.username, data.password_hash, data.password_salt, data.display_name, data.role, data.last_login, data.must_change_password, data.disabled]);
  return data;
}

function createPluginApp() {
  var auth = require('../../middleware/auth');
  auth._setDb({ getOne: getOne, run: run, scheduleSave: function () {} });
  auth._resetSecret();
  run("INSERT OR REPLACE INTO settings (key, value) VALUES ('jwt_secret', '" + TEST_SECRET + "')");

  var usersModule = require('../../routes/users');
  usersModule._setDb({ getOne: getOne, run: run, getAll: getAll, scheduleSave: function () {} });

  var app = express();
  app.use(express.json());
  app.use(auth.authMiddleware);
  app.use('/api', usersModule);

  // Simulate POST /api/product with owner handling
  app.post('/api/product', function (req, res) {
    var owner = '';
    if (req.user) {
      owner = req.user.username;
    }
    var uid = 'uid-' + Date.now();
    run("INSERT INTO products (uid, source_url, title, main_images, desc_images, attrs, skus, status, deleted, owner, claim_at, created_at, updated_at) VALUES (?, ?, ?, '[]', '[]', '[]', '[]', 0, 0, ?, ?, datetime('now','+8 hours'), datetime('now','+8 hours'))",
      [uid, req.body.sourceUrl || '', req.body.title || '', owner, owner ? "datetime('now','+8 hours')" : '']);
    res.json({ ok: true, uid: uid, owner: owner });
  });

  return app;
}

var app;
var testUser;

beforeAll(async function () {
  await initTestDb();
  run("INSERT OR REPLACE INTO settings (key, value) VALUES ('jwt_secret', '" + TEST_SECRET + "')");
  app = createPluginApp();
  testUser = insertTestUser({ username: 'pluginuser', role: 'operator' });
});

beforeEach(function () {
  try { run('DELETE FROM products'); } catch (e) {}
});

afterAll(function () {
  var auth = require('../../middleware/auth');
  auth._setDb(null);
  var usersModule = require('../../routes/users');
  usersModule._setDb(null);
});

describe('Plugin auth: POST /api/plugin-login', function () {
  test('plugin-login returns token with correct credentials', async function () {
    var res = await request(app)
      .post('/api/plugin-login')
      .send({ username: 'pluginuser', password: 'pass123' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.username).toBe('pluginuser');
    expect(res.body.user.role).toBe('operator');
  });

  test('plugin-login fails with wrong password', async function () {
    var res = await request(app)
      .post('/api/plugin-login')
      .send({ username: 'pluginuser', password: 'wrongpass' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBeTruthy();
  });

  test('plugin-login fails with nonexistent user', async function () {
    var res = await request(app)
      .post('/api/plugin-login')
      .send({ username: 'nosuchuser', password: 'whatever' });
    expect(res.status).toBe(401);
  });

  test('plugin-login fails for disabled user', async function () {
    insertTestUser({ username: 'disabled_user', disabled: 1 });
    var res = await request(app)
      .post('/api/plugin-login')
      .send({ username: 'disabled_user', password: 'pass123' });
    expect(res.status).toBe(401);
  });
});

describe('Plugin collection with/without token', function () {
  test('POST /api/product with token sets owner', async function () {
    // Login to get token
    var loginRes = await request(app)
      .post('/api/plugin-login')
      .send({ username: 'pluginuser', password: 'pass123' });
    var token = loginRes.body.token;

    var res = await request(app)
      .post('/api/product')
      .set('Authorization', 'Bearer ' + token)
      .send({ sourceUrl: 'https://1688.com/offer/999.html', title: 'Plugin Product' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.owner).toBe('pluginuser');

    var product = getOne('SELECT owner FROM products WHERE uid = ?', [res.body.uid]);
    expect(product.owner).toBe('pluginuser');
  });

  test('POST /api/product without token sets owner empty', async function () {
    var res = await request(app)
      .post('/api/product')
      .send({ sourceUrl: 'https://1688.com/offer/888.html', title: 'Anon Product' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.owner).toBe('');

    var product = getOne('SELECT owner FROM products WHERE uid = ?', [res.body.uid]);
    expect(product.owner).toBe('');
  });

  test('POST /api/product with expired token still succeeds (into inbox)', async function () {
    var expiredToken = jwt.sign(
      { id: 99, username: 'expired', role: 'operator' },
      TEST_SECRET,
      { expiresIn: '-1s' }
    );

    var res = await request(app)
      .post('/api/product')
      .set('Authorization', 'Bearer ' + expiredToken)
      .send({ sourceUrl: 'https://1688.com/offer/777.html', title: 'Expired Token Product' });
    // POST /api/product is whitelisted, so even with expired token it should work
    expect(res.status).toBe(200);
    expect(res.body.owner).toBe('');
  });

  test('POST /api/product with valid token returns owner in response', async function () {
    var token = jwt.sign({ id: 1, username: 'pluginuser', role: 'operator' }, TEST_SECRET);
    var res = await request(app)
      .post('/api/product')
      .set('Authorization', 'Bearer ' + token)
      .send({ sourceUrl: 'https://1688.com/offer/666.html', title: 'Token Product' });
    expect(res.status).toBe(200);
    expect(res.body.owner).toBe('pluginuser');
  });
});
