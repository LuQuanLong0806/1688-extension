const jwt = require('jsonwebtoken');
const { initTestDb, run, getOne } = require('../helpers/setup');

let auth;
let testDb;

beforeAll(async () => {
  testDb = await initTestDb();
  run("INSERT OR REPLACE INTO settings (key, value) VALUES ('jwt_secret', 'test-secret-key-for-jest')");
  // authMiddleware 现在会查 users 表的 token_invalid_at/disabled 字段，需要存在 user 行
  run("INSERT OR REPLACE INTO users (id, username, password_hash, password_salt, display_name, role, must_change_password, disabled, token_invalid_at) VALUES (1, 'admin', 'x', 'y', '管理员', 'admin', 0, 0, '')");
  auth = require('../../middleware/auth');
  auth._setDb({ getOne: getOne, run: run, scheduleSave: function () {} });
  auth._resetSecret();
});

afterEach(() => {
  auth._resetSecret();
});

afterAll(() => {
  auth._setDb(null);
});

describe('auth middleware', () => {
  test('getSecret returns stored secret from settings', () => {
    const secret = auth.getSecret();
    expect(secret).toBe('test-secret-key-for-jest');
  });

  test('getSecret auto-generates if not stored', () => {
    run("DELETE FROM settings WHERE key = 'jwt_secret'");
    auth._resetSecret();
    const secret = auth.getSecret();
    expect(secret).toBeTruthy();
    expect(secret.length).toBeGreaterThan(10);
    const row = getOne("SELECT value FROM settings WHERE key = 'jwt_secret'");
    expect(row.value).toBe(secret);
  });

  test('isWhitelisted allows whitelisted routes', () => {
    expect(auth.isWhitelisted('POST', '/api/login')).toBe(true);
    expect(auth.isWhitelisted('POST', '/api/plugin-login')).toBe(true);
    expect(auth.isWhitelisted('POST', '/api/product')).toBe(true);
    expect(auth.isWhitelisted('GET', '/api/product/check')).toBe(true);
    expect(auth.isWhitelisted('GET', '/api/events')).toBe(true);
    expect(auth.isWhitelisted('GET', '/')).toBe(true);
  });

  test('isWhitelisted allows static assets', () => {
    expect(auth.isWhitelisted('GET', '/js/app.js')).toBe(true);
    expect(auth.isWhitelisted('GET', '/css/app.css')).toBe(true);
    expect(auth.isWhitelisted('GET', '/login.html')).toBe(true);
    expect(auth.isWhitelisted('GET', '/favicon.ico')).toBe(true);
  });

  test('isWhitelisted blocks non-whitelisted routes', () => {
    expect(auth.isWhitelisted('GET', '/api/product')).toBe(false);
    expect(auth.isWhitelisted('GET', '/api/settings')).toBe(false);
    expect(auth.isWhitelisted('GET', '/api/users')).toBe(false);
    expect(auth.isWhitelisted('DELETE', '/api/users/1')).toBe(false);
  });

  test('authMiddleware passes through for whitelisted routes', () => {
    const req = { method: 'POST', path: '/api/login', query: {}, headers: {} };
    const res = {};
    let called = false;
    auth.authMiddleware(req, res, () => { called = true; });
    expect(called).toBe(true);
  });

  test('authMiddleware returns 401 without token', () => {
    const req = { method: 'GET', path: '/api/product', query: {}, headers: {} };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    auth.authMiddleware(req, res, () => {});
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: '未登录' });
  });

  test('authMiddleware sets req.user with valid token', () => {
    const token = jwt.sign({ id: 1, username: 'admin', role: 'admin' }, auth.getSecret(), { expiresIn: '1h' });
    const req = { method: 'GET', path: '/api/product', query: {}, headers: { authorization: 'Bearer ' + token } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    let called = false;
    auth.authMiddleware(req, res, () => { called = true; });
    expect(called).toBe(true);
    expect(req.user).toMatchObject({ id: 1, username: 'admin', role: 'admin' });
  });

  test('authMiddleware reads token from query param', () => {
    const token = jwt.sign({ id: 1, username: 'admin', role: 'admin' }, auth.getSecret(), { expiresIn: '1h' });
    const req = { method: 'GET', path: '/api/product', query: { token: token }, headers: {} };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    let called = false;
    auth.authMiddleware(req, res, () => { called = true; });
    expect(called).toBe(true);
    expect(req.user).toBeDefined();
    expect(req.user.username).toBe('admin');
  });

  test('authMiddleware returns 401 with expired token', () => {
    const token = jwt.sign({ id: 1, username: 'admin', role: 'admin' }, auth.getSecret(), { expiresIn: '-1s' });
    const req = { method: 'GET', path: '/api/product', query: {}, headers: { authorization: 'Bearer ' + token } };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    auth.authMiddleware(req, res, () => {});
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('requireRole blocks unauthorized role', () => {
    const middleware = auth.requireRole('admin');
    const req = { user: { id: 2, username: 'op', role: 'operator' } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    middleware(req, res, () => {});
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('requireRole allows authorized role', () => {
    const middleware = auth.requireRole('admin');
    const req = { user: { id: 1, username: 'admin', role: 'admin' } };
    let called = false;
    middleware(req, {}, () => { called = true; });
    expect(called).toBe(true);
  });

  test('requireRole allows multiple roles', () => {
    const middleware = auth.requireRole('admin', 'operator');
    const req = { user: { id: 2, username: 'op', role: 'operator' } };
    let called = false;
    middleware(req, {}, () => { called = true; });
    expect(called).toBe(true);
  });

  test('requireRole returns 401 when no user', () => {
    const middleware = auth.requireRole('admin');
    const req = {};
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    middleware(req, res, () => {});
    expect(res.status).toHaveBeenCalledWith(401);
  });
});
