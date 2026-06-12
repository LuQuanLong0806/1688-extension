const express = require('express');
const request = require('supertest');
const { initTestDb, run, getOne, getAll, scheduleSave } = require('../helpers/setup');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

let app;
let auth;
let usersModule;
const TEST_SECRET = 'test-secret-for-login-tests';

function insertTestUser(overrides) {
  var defaults = {
    username: 'admin',
    password_hash: crypto.createHash('sha256').update('testsalt' + 'admin123').digest('hex'),
    password_salt: 'testsalt',
    display_name: '管理员',
    role: 'admin',
    must_change_password: 0,
    disabled: 0
  };
  var data = Object.assign(defaults, overrides);
  run("INSERT INTO users (username, password_hash, password_salt, display_name, role, must_change_password, disabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now','+8 hours'), datetime('now','+8 hours'))",
    [data.username, data.password_hash, data.password_salt, data.display_name, data.role, data.must_change_password, data.disabled]);
  return data;
}

beforeAll(async () => {
  await initTestDb();
  run("INSERT OR REPLACE INTO settings (key, value) VALUES ('jwt_secret', '" + TEST_SECRET + "')");

  auth = require('../../middleware/auth');
  auth._setDb({ getOne: getOne, run: run, scheduleSave: function () {} });
  auth._resetSecret();

  usersModule = require('../../routes/users');
  usersModule._setDb({ getOne: getOne, run: run, getAll: getAll, scheduleSave: function () {} });

  app = express();
  app.use(express.json());

  // Mock auth middleware for route tests
  app.use(function (req, res, next) {
    if (req.headers.authorization) {
      var token = req.headers.authorization.replace('Bearer ', '');
      try {
        var decoded = jwt.verify(token, TEST_SECRET);
        req.user = decoded;
      } catch (e) {}
    }
    next();
  });

  app.use('/api', usersModule);
});

beforeEach(() => {
  try { run('DELETE FROM users'); } catch (e) {}
  auth._resetSecret();
});

afterAll(() => {
  auth._setDb(null);
  usersModule._setDb(null);
});

describe('POST /api/login', () => {
  test('successful login returns token', async () => {
    insertTestUser({ username: 'admin' });
    const res = await request(app)
      .post('/api/login')
      .send({ username: 'admin', password: 'admin123' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.username).toBe('admin');
    expect(res.body.user.role).toBe('admin');
  });

  test('wrong password returns 401', async () => {
    insertTestUser();
    const res = await request(app)
      .post('/api/login')
      .send({ username: 'admin', password: 'wrongpassword' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBeTruthy();
  });

  test('nonexistent user returns 401', async () => {
    const res = await request(app)
      .post('/api/login')
      .send({ username: 'nobody', password: 'password' });
    expect(res.status).toBe(401);
  });

  test('empty fields return 400', async () => {
    const res = await request(app)
      .post('/api/login')
      .send({ username: '', password: '' });
    expect(res.status).toBe(400);
  });

  test('disabled user cannot login', async () => {
    insertTestUser({ username: 'disabled', disabled: 1 });
    const res = await request(app)
      .post('/api/login')
      .send({ username: 'disabled', password: 'admin123' });
    expect(res.status).toBe(401);
  });

  test('login updates last_login', async () => {
    insertTestUser({ username: 'timetest' });
    await request(app).post('/api/login').send({ username: 'timetest', password: 'admin123' });
    var user = getOne('SELECT last_login FROM users WHERE username = ?', ['timetest']);
    expect(user.last_login).toBeTruthy();
  });
});

describe('POST /api/plugin-login', () => {
  test('returns token for plugin', async () => {
    insertTestUser({ username: 'pluginuser', role: 'operator' });
    const res = await request(app)
      .post('/api/plugin-login')
      .send({ username: 'pluginuser', password: 'admin123' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.username).toBe('pluginuser');
  });

  test('wrong password fails', async () => {
    insertTestUser({ username: 'plugfail' });
    const res = await request(app)
      .post('/api/plugin-login')
      .send({ username: 'plugfail', password: 'wrong' });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/me', () => {
  test('returns user info with valid token', async () => {
    insertTestUser({ username: 'meuser', role: 'operator' });
    var row = getOne('SELECT id FROM users WHERE username = ?', ['meuser']);
    const token = jwt.sign({ id: row.id, username: 'meuser', role: 'operator' }, TEST_SECRET);
    const res = await request(app)
      .get('/api/me')
      .set('Authorization', 'Bearer ' + token);
    expect(res.status).toBe(200);
    expect(res.body.username).toBe('meuser');
    expect(res.body.role).toBe('operator');
  });

  test('returns 401 without token', async () => {
    const res = await request(app).get('/api/me');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/change-password', () => {
  test('changes password successfully', async () => {
    var oldSalt = 'oldsalt';
    var oldHash = crypto.createHash('sha256').update(oldSalt + 'oldpass').digest('hex');
    insertTestUser({ username: 'changepw', password_hash: oldHash, password_salt: oldSalt });
    var row = getOne('SELECT id FROM users WHERE username = ?', ['changepw']);

    const token = jwt.sign({ id: row.id, username: 'changepw', role: 'operator' }, TEST_SECRET);
    const res = await request(app)
      .post('/api/change-password')
      .set('Authorization', 'Bearer ' + token)
      .send({ oldPassword: 'oldpass', newPassword: 'newpass123' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.token).toBeTruthy();

    // Verify new password works
    var updated = getOne('SELECT password_hash, password_salt FROM users WHERE id = ?', [row.id]);
    var newHash = crypto.createHash('sha256').update(updated.password_salt + 'newpass123').digest('hex');
    expect(updated.password_hash).toBe(newHash);
  });

  test('wrong old password returns 401', async () => {
    insertTestUser({ username: 'changepw2' });
    var row = getOne('SELECT id FROM users WHERE username = ?', ['changepw2']);
    const token = jwt.sign({ id: row.id, username: 'changepw2', role: 'operator' }, TEST_SECRET);
    const res = await request(app)
      .post('/api/change-password')
      .set('Authorization', 'Bearer ' + token)
      .send({ oldPassword: 'wrong', newPassword: 'newpass123' });
    expect(res.status).toBe(401);
  });

  test('short new password returns 400', async () => {
    insertTestUser({ username: 'changepw3' });
    var row = getOne('SELECT id FROM users WHERE username = ?', ['changepw3']);
    const token = jwt.sign({ id: row.id, username: 'changepw3', role: 'operator' }, TEST_SECRET);
    const res = await request(app)
      .post('/api/change-password')
      .set('Authorization', 'Bearer ' + token)
      .send({ oldPassword: 'admin123', newPassword: '123' });
    expect(res.status).toBe(400);
  });
});

describe('User CRUD (admin only)', () => {
  let adminToken;
  let adminId;

  beforeEach(() => {
    insertTestUser({ username: 'admin', role: 'admin' });
    var row = getOne('SELECT id FROM users WHERE username = ?', ['admin']);
    adminId = row.id;
    adminToken = jwt.sign({ id: adminId, username: 'admin', role: 'admin' }, TEST_SECRET);
  });

  test('GET /api/users returns user list for admin', async () => {
    insertTestUser({ username: 'op1', role: 'operator' });
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', 'Bearer ' + adminToken);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(2);
  });

  test('GET /api/users blocks non-admin', async () => {
    insertTestUser({ username: 'viewer1', role: 'viewer' });
    var viewerRow = getOne('SELECT id FROM users WHERE username = ?', ['viewer1']);
    const viewerToken = jwt.sign({ id: viewerRow.id, username: 'viewer1', role: 'viewer' }, TEST_SECRET);
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', 'Bearer ' + viewerToken);
    expect(res.status).toBe(403);
  });

  test('POST /api/users creates user', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', 'Bearer ' + adminToken)
      .send({ username: 'newuser', password: 'password123', display_name: '新用户', role: 'operator' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    var user = getOne('SELECT * FROM users WHERE username = ?', ['newuser']);
    expect(user).toBeTruthy();
    expect(user.role).toBe('operator');
    expect(user.display_name).toBe('新用户');
    // Verify password was hashed
    expect(user.password_hash).not.toBe('password123');
    expect(user.password_salt).toBeTruthy();
  });

  test('POST /api/users rejects duplicate username', async () => {
    insertTestUser({ username: 'dup', role: 'operator' });
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', 'Bearer ' + adminToken)
      .send({ username: 'dup', password: 'password123' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('已存在');
  });

  test('POST /api/users rejects short password', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', 'Bearer ' + adminToken)
      .send({ username: 'shortpw', password: '123' });
    expect(res.status).toBe(400);
  });

  test('PUT /api/users/:id updates user', async () => {
    insertTestUser({ username: 'editme', role: 'operator', display_name: '旧名' });
    var user = getOne('SELECT id FROM users WHERE username = ?', ['editme']);
    const res = await request(app)
      .put('/api/users/' + user.id)
      .set('Authorization', 'Bearer ' + adminToken)
      .send({ display_name: '新名', role: 'viewer' });
    expect(res.status).toBe(200);
    var updated = getOne('SELECT display_name, role FROM users WHERE id = ?', [user.id]);
    expect(updated.display_name).toBe('新名');
    expect(updated.role).toBe('viewer');
  });

  test('PUT /api/users/:id resets password', async () => {
    insertTestUser({ username: 'resetpw' });
    var user = getOne('SELECT id, password_hash FROM users WHERE username = ?', ['resetpw']);
    const res = await request(app)
      .put('/api/users/' + user.id)
      .set('Authorization', 'Bearer ' + adminToken)
      .send({ password: 'newpassword123' });
    expect(res.status).toBe(200);
    var updated = getOne('SELECT password_hash, password_salt FROM users WHERE id = ?', [user.id]);
    expect(updated.password_hash).not.toBe(user.password_hash);
  });

  test('DELETE /api/users/:id disables user', async () => {
    insertTestUser({ username: 'deleteme', role: 'operator' });
    var user = getOne('SELECT id FROM users WHERE username = ?', ['deleteme']);
    const res = await request(app)
      .delete('/api/users/' + user.id)
      .set('Authorization', 'Bearer ' + adminToken);
    expect(res.status).toBe(200);
    var disabled = getOne('SELECT disabled FROM users WHERE id = ?', [user.id]);
    expect(disabled.disabled).toBe(1);
  });

  test('DELETE /api/users/:id cannot disable self', async () => {
    const res = await request(app)
      .delete('/api/users/' + adminId)
      .set('Authorization', 'Bearer ' + adminToken);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('自己');
  });

  test('POST /api/logout returns ok', async () => {
    const res = await request(app)
      .post('/api/logout')
      .set('Authorization', 'Bearer ' + adminToken);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

describe('Password hashing', () => {
  test('hashPassword produces consistent results', () => {
    const hash1 = usersModule.hashPassword('password123', 'salt1');
    const hash2 = usersModule.hashPassword('password123', 'salt1');
    expect(hash1).toBe(hash2);
  });

  test('hashPassword differs with different salt', () => {
    const hash1 = usersModule.hashPassword('password123', 'salt1');
    const hash2 = usersModule.hashPassword('password123', 'salt2');
    expect(hash1).not.toBe(hash2);
  });

  test('generateSalt produces unique salts', () => {
    const salt1 = usersModule.generateSalt();
    const salt2 = usersModule.generateSalt();
    expect(salt1).not.toBe(salt2);
    expect(salt1.length).toBe(32);
  });

  test('hashPassword produces correct SHA-256', () => {
    var hash = usersModule.hashPassword('test', 'salt');
    var expected = crypto.createHash('sha256').update('salttest').digest('hex');
    expect(hash).toBe(expected);
  });
});
