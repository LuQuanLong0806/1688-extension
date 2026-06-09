// 测试基础设施 — 内存数据库 + Express app 构造 + mock cloudDb
const initSqlJs = require('sql.js');
const express = require('express');
const cors = require('cors');

let db;
let treeDb;

// 本地表结构（与 db.js 保持一致）
const LOCAL_TABLE_DEFS = [
  { name: 'products', ddl: `CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY AUTOINCREMENT, source_url TEXT NOT NULL, title TEXT, main_images TEXT, desc_images TEXT, attrs TEXT, skus TEXT, status INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, category TEXT, detail_images TEXT, custom_category TEXT, dxm_category TEXT DEFAULT '', manual_category TEXT, deleted INTEGER DEFAULT 0, uid TEXT, automation_stage TEXT DEFAULT 'none', automation_log TEXT DEFAULT '', automation_issues TEXT DEFAULT '', automation_started_at DATETIME, automation_finished_at DATETIME)` },
  { name: 'settings', ddl: `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)` },
  { name: 'categories', ddl: `CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, custom_name TEXT DEFAULT '', cat_id TEXT, leaf_category_id TEXT, top_category_id TEXT, post_category_id TEXT, count INTEGER DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)` },
  { name: 'dxm_categories', ddl: `CREATE TABLE IF NOT EXISTS dxm_categories (id INTEGER PRIMARY KEY AUTOINCREMENT, path TEXT NOT NULL UNIQUE, leaf_name TEXT NOT NULL, count INTEGER DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)` },
  { name: 'category_mappings', ddl: `CREATE TABLE IF NOT EXISTS category_mappings (id INTEGER PRIMARY KEY AUTOINCREMENT, category_name TEXT NOT NULL, custom_category TEXT NOT NULL, count INTEGER DEFAULT 1, source TEXT DEFAULT 'auto', created_at TEXT DEFAULT '', updated_at TEXT DEFAULT '', UNIQUE(category_name, custom_category))` },
  { name: 'keyword_category_rel', ddl: `CREATE TABLE IF NOT EXISTS keyword_category_rel (id INTEGER PRIMARY KEY AUTOINCREMENT, keyword TEXT NOT NULL, category_name TEXT NOT NULL, weight REAL DEFAULT 1.0, match_count INTEGER DEFAULT 1, valid INTEGER DEFAULT 1, source TEXT DEFAULT 'auto', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE(keyword, category_name))` },
  { name: 'keyword_synonyms', ddl: `CREATE TABLE IF NOT EXISTS keyword_synonyms (id INTEGER PRIMARY KEY AUTOINCREMENT, word_a TEXT NOT NULL, word_b TEXT NOT NULL, created_at TEXT DEFAULT '', updated_at TEXT DEFAULT '', UNIQUE(word_a, word_b))` },
  { name: 'keyword_blacklist', ddl: `CREATE TABLE IF NOT EXISTS keyword_blacklist (id INTEGER PRIMARY KEY AUTOINCREMENT, keyword TEXT NOT NULL, category_name TEXT NOT NULL, reason TEXT DEFAULT '', count INTEGER DEFAULT 1, created_at TEXT DEFAULT '', updated_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(keyword, category_name))` },
  { name: 'category_config', ddl: `CREATE TABLE IF NOT EXISTS category_config (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, value TEXT NOT NULL, group_name TEXT DEFAULT '', description TEXT DEFAULT '', sort_order INTEGER DEFAULT 0, deleted INTEGER DEFAULT 0, created_at TEXT DEFAULT '', updated_at TEXT DEFAULT '', UNIQUE(type, value, group_name))` }
];

const TREE_DDL = `CREATE TABLE IF NOT EXISTS dxm_category_tree (cat_id INTEGER PRIMARY KEY, cat_name TEXT NOT NULL, parent_cat_id INTEGER DEFAULT 0, cat_level INTEGER DEFAULT 1, is_leaf INTEGER DEFAULT 0, path TEXT DEFAULT '', sync_at DATETIME DEFAULT CURRENT_TIMESTAMP, created_at TEXT DEFAULT '', updated_at TEXT DEFAULT '')`;

// 创建 mock cloudDb
function createMockCloudDb() {
  return {
    connected: false,
    cloudRun: jest.fn().mockResolvedValue(null),
    cloudGetOne: jest.fn().mockResolvedValue(null),
    cloudGetAll: jest.fn().mockResolvedValue([]),
    getMappings: jest.fn().mockResolvedValue([]),
    saveMapping: jest.fn().mockResolvedValue(null),
    getKeywordRels: jest.fn().mockResolvedValue([]),
    saveKeywordRel: jest.fn().mockResolvedValue(null),
    invalidateAutoRels: jest.fn().mockResolvedValue(null),
    getSynonyms: jest.fn().mockResolvedValue([]),
    getBlacklisted: jest.fn().mockResolvedValue([]),
    getBlacklistCounts: jest.fn().mockReturnValue([]),
    upsertBlacklist: jest.fn(),
    reduceBlacklist: jest.fn(),
    getTreePath: jest.fn().mockResolvedValue(null),
    getCategoryConfig: jest.fn().mockResolvedValue([]),
    getAllCategoryConfig: jest.fn().mockResolvedValue([]),
    saveCategoryConfig: jest.fn().mockResolvedValue(null),
    deleteCategoryConfig: jest.fn().mockResolvedValue(null),
    seedCategoryConfig: jest.fn().mockResolvedValue(null),
    saveProductToLocalAndCloud: jest.fn().mockResolvedValue(null),
    uploadLocalToCloud: jest.fn().mockResolvedValue({}),
    downloadCloudToLocal: jest.fn().mockResolvedValue({}),
    bidirectionalSync: jest.fn().mockResolvedValue({ ok: true }),
    uploadTree: jest.fn().mockResolvedValue({}),
    downloadTree: jest.fn().mockResolvedValue({}),
    uploadProducts: jest.fn().mockResolvedValue({}),
    downloadProducts: jest.fn().mockResolvedValue({ added: 0, skipped: 0 }),
    pushTable: jest.fn().mockResolvedValue({}),
    pullTable: jest.fn().mockResolvedValue({}),
    getConfig: jest.fn().mockReturnValue(null),
    saveConfig: jest.fn(),
    getStatus: jest.fn().mockReturnValue({ connected: false, lastSyncTime: null, config: false }),
    connect: jest.fn().mockResolvedValue(false),
    createTables: jest.fn().mockResolvedValue(true)
  };
}

// 初始化内存数据库
async function initTestDb() {
  const SQL = await initSqlJs();
  db = new SQL.Database();
  treeDb = new SQL.Database();

  for (const def of LOCAL_TABLE_DEFS) {
    db.run(def.ddl);
  }
  treeDb.run(TREE_DDL);

  return { db, treeDb };
}

// DB 操作函数（基于内存数据库）
function run(sql, params) {
  db.run(sql, params);
}
function getOne(sql, params) {
  const stmt = db.prepare(sql);
  if (params) stmt.bind(params);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
}
function getAll(sql, params) {
  const stmt = db.prepare(sql);
  if (params) stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}
function treeRun(sql, params) {
  treeDb.run(sql, params);
}
function treeGetOne(sql, params) {
  const stmt = treeDb.prepare(sql);
  if (params) stmt.bind(params);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
}
function treeGetAll(sql, params) {
  const stmt = treeDb.prepare(sql);
  if (params) stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function scheduleSave() {}
function scheduleTreeSave() {}
function parseRow(row) {
  return {
    ...row,
    category: row.category ? JSON.parse(row.category) : {},
    customCategory: row.custom_category || '',
    manualCategory: row.manual_category || '',
    dxmCategory: row.dxm_category ? JSON.parse(row.dxm_category) : null,
    main_images: JSON.parse(row.main_images || '[]'),
    desc_images: JSON.parse(row.desc_images || '[]'),
    detail_images: JSON.parse(row.detail_images || '[]'),
    attrs: JSON.parse(row.attrs || '[]'),
    skus: JSON.parse(row.skus || '[]')
  };
}

const sseClients = [];
function sseBroadcast(event, data) {}

// 构造测试用 Express app
function createTestApp(mockCloudDb) {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '50mb' }));

  // 注入 mock cloudDb 到路由模块
  const cloudDb = mockCloudDb || createMockCloudDb();

  // 挂载路由（使用 mock db）
  app.use('/api', createSettingsRouter());
  app.use('/api', createCategoriesRouter(cloudDb));
  app.use('/api', createProductsRouter(cloudDb));
  app.use('/api', createDxmTreeRouter());
  app.use('/api/ai', createAiRouter(cloudDb));

  return { app, cloudDb };
}

function createSettingsRouter() {
  const { Router } = require('express');
  const router = Router();
  let _clearSignals = {};

  router.get('/clear-signal', (req, res) => {
    const clientId = req.query.clientId || '';
    const signal = clientId ? _clearSignals[clientId] || 0 : 0;
    res.json({ clearAt: signal });
  });
  router.post('/clear-signal', (req, res) => {
    const clientId = req.body.clientId || '';
    if (clientId) _clearSignals[clientId] = Date.now();
    res.json({ ok: true });
  });
  router.get('/settings', (req, res) => {
    const rows = getAll('SELECT key, value, updated_at FROM settings');
    const result = {};
    rows.forEach(r => { result[r.key] = { value: r.value, updated_at: r.updated_at }; });
    res.json(result);
  });
  router.put('/settings', (req, res) => {
    const { items } = req.body;
    if (!Array.isArray(items) || !items.length) return res.json({ ok: true });
    for (const item of items) {
      run('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)', [item.key, item.value]);
    }
    res.json({ ok: true });
  });
  router.get('/settings/:key', (req, res) => {
    const row = getOne('SELECT value FROM settings WHERE key = ?', [req.params.key]);
    res.json(row ? { value: row.value } : {});
  });
  router.post('/settings/:key', (req, res) => {
    const { value } = req.body;
    run('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)', [req.params.key, value || '']);
    res.json({ ok: true });
  });
  router.get('/settings-export', (req, res) => {
    const rows = getAll('SELECT key, value FROM settings');
    const data = {};
    rows.forEach(r => { data[r.key] = r.value; });
    res.json(data);
  });
  router.post('/settings-import', (req, res) => {
    const data = req.body;
    if (!data || typeof data !== 'object') return res.status(400).json({ error: '无效数据' });
    let count = 0;
    for (const [key, value] of Object.entries(data)) {
      run('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)', [key, String(value)]);
      count++;
    }
    res.json({ ok: true, imported: count });
  });
  router.get('/events', (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write('event: connected\ndata: {}\n\n');
    res.end();
  });
  return router;
}

function createCategoriesRouter(cloudDb) {
  const { Router } = require('express');
  const router = Router();

  router.get('/categories', (req, res) => {
    const keyword = (req.query.keyword || '').trim();
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize) || 20));
    let where = '';
    let params = [];
    if (keyword) { where = 'WHERE name LIKE ?'; params.push('%' + keyword + '%'); }
    const countRow = getOne('SELECT COUNT(*) as cnt FROM categories ' + where, params);
    const total = countRow ? countRow.cnt : 0;
    const offset = (page - 1) * pageSize;
    const rows = getAll('SELECT name, cat_id, count FROM categories ' + where + ' ORDER BY count DESC, name LIMIT ? OFFSET ?', [...params, pageSize, offset]);
    res.json({ total, page, pageSize, list: rows.map(r => ({ name: r.name, catId: r.cat_id || '', count: r.count || 0 })) });
  });

  router.get('/category-mappings', (req, res) => {
    const keyword = (req.query.keyword || '').trim();
    let rows;
    if (keyword) {
      rows = getAll('SELECT id, category_name, custom_category FROM category_mappings WHERE category_name LIKE ? OR custom_category LIKE ? ORDER BY category_name', ['%' + keyword + '%', '%' + keyword + '%']);
    } else {
      rows = getAll('SELECT id, category_name, custom_category FROM category_mappings ORDER BY category_name');
    }
    res.json(rows.map(r => ({ id: r.id, categoryName: r.category_name, customCategory: r.custom_category, productCount: 0 })));
  });

  router.get('/category-mappings/by-name', (req, res) => {
    const categoryName = (req.query.name || '').trim();
    if (!categoryName) return res.json([]);
    const rows = getAll('SELECT id, custom_category FROM category_mappings WHERE category_name = ? ORDER BY id', [categoryName]);
    res.json(rows.map(r => ({ id: r.id, customCategory: r.custom_category })));
  });

  router.get('/category-mappings/by-dxm', (req, res) => {
    const dxmName = (req.query.name || '').trim();
    if (!dxmName) return res.json([]);
    const rows = getAll('SELECT id, category_name FROM category_mappings WHERE custom_category = ? ORDER BY id', [dxmName]);
    res.json(rows.map(r => ({ id: r.id, categoryName: r.category_name, productCount: 0 })));
  });

  router.get('/category-mappings/grouped', (req, res) => {
    const keyword = (req.query.keyword || '').trim();
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.max(1, Math.min(200, parseInt(req.query.pageSize) || 20));
    const offset = (page - 1) * pageSize;
    let rows;
    if (keyword) {
      rows = getAll('SELECT id, category_name, custom_category FROM category_mappings WHERE custom_category LIKE ? ORDER BY custom_category, category_name', ['%' + keyword + '%']);
    } else {
      rows = getAll('SELECT id, category_name, custom_category FROM category_mappings ORDER BY custom_category, category_name');
    }
    const groups = {};
    rows.forEach(r => {
      const key = r.custom_category;
      if (!groups[key]) groups[key] = { customCategory: key, path: '', aliCategories: [], productCount: 0 };
      groups[key].aliCategories.push({ id: r.id, categoryName: r.category_name, productCount: 0 });
    });
    const result = Object.values(groups);
    const total = result.length;
    const paged = result.slice(offset, offset + pageSize);
    res.json({ list: paged, total, page, pageSize });
  });

  router.delete('/category-mappings/dxm/:name', (req, res) => {
    const dxmName = decodeURIComponent(req.params.name);
    const bound = getAll("SELECT category_name FROM category_mappings WHERE custom_category = ?", [dxmName]);
    run("DELETE FROM category_mappings WHERE custom_category = ?", [dxmName]);
    res.json({ ok: true, cleared: 0 });
  });

  router.delete('/category-mappings/:id', (req, res) => {
    const id = parseInt(req.params.id);
    run('DELETE FROM category_mappings WHERE id = ?', [id]);
    res.json({ ok: true, cleared: 0 });
  });

  router.post('/category-mappings', (req, res) => {
    const { categoryName, customCategory } = req.body;
    if (!categoryName || !customCategory) return res.status(400).json({ error: '参数不完整' });
    const existing = getOne('SELECT id FROM category_mappings WHERE category_name = ? AND custom_category = ?', [categoryName, customCategory]);
    if (!existing) {
      run('INSERT INTO category_mappings (category_name, custom_category, count, source, created_at, updated_at) VALUES (?, ?, 1, \'manual\', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)', [categoryName, customCategory]);
    }
    res.json({ ok: true });
  });

  router.get('/keyword-rels', (req, res) => {
    const keyword = (req.query.keyword || '').trim();
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize) || 20));
    let where = 'WHERE valid = 1';
    let params = [];
    if (keyword) { where += ' AND (keyword LIKE ? OR category_name LIKE ?)'; params.push('%' + keyword + '%', '%' + keyword + '%'); }
    const countRow = getOne('SELECT COUNT(*) as cnt FROM keyword_category_rel ' + where, params);
    const total = countRow ? countRow.cnt : 0;
    const offset = (page - 1) * pageSize;
    const rows = getAll('SELECT id, keyword, category_name, weight, match_count, source, updated_at FROM keyword_category_rel ' + where + ' ORDER BY weight DESC, match_count DESC LIMIT ? OFFSET ?', [...params, pageSize, offset]);
    res.json({ total, page, pageSize, list: rows });
  });

  router.delete('/keyword-rels/:id', (req, res) => {
    run('UPDATE keyword_category_rel SET valid = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [parseInt(req.params.id)]);
    res.json({ ok: true });
  });

  router.post('/keyword-rels/batch-invalidate', (req, res) => {
    const ids = req.body.ids;
    if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: '请提供ids数组' });
    ids.forEach(id => { run('UPDATE keyword_category_rel SET valid = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [parseInt(id)]); });
    res.json({ ok: true });
  });

  router.get('/keyword-synonyms', (req, res) => {
    const keyword = (req.query.keyword || '').trim();
    let rows;
    if (keyword) {
      rows = getAll('SELECT id, word_a, word_b FROM keyword_synonyms WHERE word_a LIKE ? OR word_b LIKE ? ORDER BY id', ['%' + keyword + '%', '%' + keyword + '%']);
    } else {
      rows = getAll('SELECT id, word_a, word_b FROM keyword_synonyms ORDER BY id');
    }
    res.json(rows);
  });

  router.post('/keyword-synonyms', (req, res) => {
    const { wordA, wordB } = req.body;
    if (!wordA || !wordB) return res.status(400).json({ error: '请提供wordA和wordB' });
    run('INSERT OR IGNORE INTO keyword_synonyms (word_a, word_b, created_at, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)', [wordA, wordB]);
    res.json({ ok: true });
  });

  router.delete('/keyword-synonyms/:id', (req, res) => {
    run('DELETE FROM keyword_synonyms WHERE id = ?', [parseInt(req.params.id)]);
    res.json({ ok: true });
  });

  router.get('/keyword-blacklist', (req, res) => {
    const keyword = (req.query.keyword || '').trim();
    let rows;
    if (keyword) {
      rows = getAll('SELECT id, keyword, category_name, reason FROM keyword_blacklist WHERE keyword LIKE ? ORDER BY id', ['%' + keyword + '%']);
    } else {
      rows = getAll('SELECT id, keyword, category_name, reason FROM keyword_blacklist ORDER BY id');
    }
    res.json(rows);
  });

  router.post('/keyword-blacklist', (req, res) => {
    const { keyword, categoryName, reason } = req.body;
    if (!keyword || !categoryName) return res.status(400).json({ error: '请提供keyword和categoryName' });
    run('INSERT OR IGNORE INTO keyword_blacklist (keyword, category_name, reason, created_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)', [keyword, categoryName, reason || '']);
    res.json({ ok: true });
  });

  router.delete('/keyword-blacklist/:id', (req, res) => {
    run('DELETE FROM keyword_blacklist WHERE id = ?', [parseInt(req.params.id)]);
    res.json({ ok: true });
  });

  // 分类配置 — 委托 cloudDb（测试中 mock）
  router.get('/category-config', function (req, res) {
    var type = (req.query.type || '').trim();
    var promise = type ? cloudDb.getCategoryConfig(type) : cloudDb.getAllCategoryConfig();
    promise.then(function (rows) { res.json({ ok: true, list: rows || [] }); })
      .catch(function (e) { res.status(500).json({ error: e.message }); });
  });
  router.post('/category-config', function (req, res) {
    var type = (req.body.type || '').trim();
    var value = (req.body.value || '').trim();
    var groupName = (req.body.group_name || '').trim();
    var description = (req.body.description || '').trim();
    var sortOrder = parseInt(req.body.sort_order) || 0;
    if (!type || !value) return res.status(400).json({ error: 'type 和 value 必填' });
    cloudDb.saveCategoryConfig(type, value, groupName, description, sortOrder)
      .then(function () { res.json({ ok: true, type: type, value: value }); })
      .catch(function (e) { res.status(500).json({ error: e.message }); });
  });
  router.delete('/category-config/:id', function (req, res) {
    var id = parseInt(req.params.id);
    if (!id) return res.status(400).json({ error: '无效 ID' });
    cloudDb.deleteCategoryConfig(id)
      .then(function () { res.json({ ok: true }); })
      .catch(function (e) { res.status(500).json({ error: e.message }); });
  });
  router.post('/category-config/batch-delete', function (req, res) {
    var ids = req.body.ids;
    if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: '请提供ids数组' });
    Promise.all(ids.map(function (id) { return cloudDb.deleteCategoryConfig(parseInt(id)); }))
      .then(function () { res.json({ ok: true }); })
      .catch(function (e) { res.status(500).json({ error: e.message }); });
  });

  return router;
}

function createProductsRouter(cloudDb) {
  const { Router } = require('express');
  const router = Router();

  router.get('/product/trend', (req, res) => {
    const days = Math.min(90, Math.max(1, parseInt(req.query.days) || 7));
    const rows = getAll('SELECT DATE(created_at) as date, COUNT(*) as count FROM products WHERE deleted = 0 AND created_at >= DATE(\'now\', \'-\' || ? || \' days\') GROUP BY DATE(created_at) ORDER BY date', [days]);
    res.json(rows);
  });

  router.get('/product/stats', (req, res) => {
    const row = getOne('SELECT COUNT(*) as total, SUM(CASE WHEN status=0 THEN 1 ELSE 0 END) as unused, SUM(CASE WHEN status=1 THEN 1 ELSE 0 END) as used FROM products WHERE deleted = 0');
    const catRow = getOne('SELECT COUNT(*) as cnt FROM categories');
    res.json({ total: row ? row.total : 0, unused: row ? row.unused || 0 : 0, used: row ? row.used || 0 : 0, totalCategories: catRow ? catRow.cnt : 0 });
  });

  router.get('/product/categories', (req, res) => {
    const rows = getAll('SELECT name FROM categories ORDER BY name');
    res.json(rows.map(r => r.name));
  });

  router.get('/product/dxm-categories', (req, res) => {
    const rows = getAll("SELECT DISTINCT custom_category FROM category_mappings WHERE custom_category IS NOT NULL AND custom_category != '' ORDER BY custom_category");
    res.json(rows.map(r => r.custom_category));
  });

  router.get('/product/category-top', (req, res) => {
    const rows = getAll('SELECT name, count FROM categories ORDER BY count DESC LIMIT 10');
    res.json(rows);
  });

  router.get('/product/dxm-category-top', (req, res) => {
    try {
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 10));
      const rows = getAll('SELECT cm.custom_category as name, COUNT(*) as count FROM products p INNER JOIN category_mappings cm ON JSON_EXTRACT(p.category, \'$.leafCategoryName\') = cm.category_name WHERE cm.custom_category IS NOT NULL AND cm.custom_category != \'\' AND p.deleted = 0 GROUP BY cm.custom_category ORDER BY count DESC', []);
      const merged = {};
      rows.forEach(r => {
        const treeRow = treeGetOne('SELECT cat_name FROM dxm_category_tree WHERE (cat_name = ? OR path = ?) AND is_leaf = 1 LIMIT 1', [r.name, r.name]);
        const leafName = treeRow ? treeRow.cat_name : r.name.split('/').pop();
        if (merged[leafName]) merged[leafName].count += r.count;
        else merged[leafName] = { name: leafName, count: r.count };
      });
      res.json(Object.values(merged).sort((a, b) => b.count - a.count).slice(0, limit));
    } catch (e) { res.json([]); }
  });

  router.get('/product/check', (req, res) => {
    const offerId = (req.query.offerId || '').trim();
    if (!offerId) return res.json({ exists: false });
    const row = getOne('SELECT id, title, status FROM products WHERE deleted = 0 AND source_url LIKE ? LIMIT 1', ['%' + offerId + '%']);
    if (row) res.json({ exists: true, id: row.id, title: row.title, status: row.status });
    else res.json({ exists: false });
  });

  router.get('/product', (req, res) => {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize) || 20));
    const keyword = (req.query.keyword || '').trim();
    const status = req.query.status;
    const category = (req.query.category || '').trim();
    const dxmCategory = (req.query.dxmCategory || '').trim();
    let where = ['deleted = 0'];
    let params = [];
    if (keyword) { where.push('title LIKE ?'); params.push('%' + keyword + '%'); }
    if (status !== undefined && status !== '' && status !== 'all') { where.push('status = ?'); params.push(parseInt(status)); }
    if (category) { where.push('category LIKE ?'); params.push('%' + category + '%'); }
    if (dxmCategory === '_none') { where.push("(custom_category IS NULL OR custom_category = '')"); }
    else if (dxmCategory) { where.push('custom_category = ?'); params.push(dxmCategory); }
    const whereClause = 'WHERE ' + where.join(' AND ');
    const countRow = getOne('SELECT COUNT(*) as count FROM products ' + whereClause, params);
    const total = countRow ? countRow.count : 0;
    const offset = (page - 1) * pageSize;
    const list = getAll('SELECT id, source_url, title, category, custom_category, dxm_category, attrs, skus, main_images, status, created_at, updated_at FROM products ' + whereClause + ' ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?', [...params, pageSize, offset]);
    const parsedList = list.map(row => ({
      ...row, category: row.category ? JSON.parse(row.category) : {},
      customCategory: row.custom_category || '',
      dxmCategory: row.dxm_category ? JSON.parse(row.dxm_category) : null,
      attrs: JSON.parse(row.attrs || '[]'), skuCount: JSON.parse(row.skus || '[]').length
    }));
    res.json({ total, page, pageSize, list: parsedList });
  });

  router.get('/product/:id', (req, res) => {
    const row = getOne('SELECT * FROM products WHERE id = ?', [parseInt(req.params.id)]);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(parseRow(row));
  });

  router.put('/product/:id', (req, res) => {
    const fields = [];
    const params = [];
    const allowedFields = { title: 'title', sourceUrl: 'source_url', mainImages: 'main_images', descImages: 'desc_images', detailImages: 'detail_images', attrs: 'attrs', skus: 'skus', status: 'status', customCategory: 'custom_category', manualCategory: 'manual_category', dxmCategory: 'dxm_category' };
    for (const [key, col] of Object.entries(allowedFields)) {
      if (req.body[key] !== undefined) {
        let val = req.body[key];
        if (['main_images', 'desc_images', 'detail_images', 'attrs', 'skus', 'dxm_category'].includes(col) || Array.isArray(val)) val = JSON.stringify(val);
        fields.push(col + ' = ?');
        params.push(val);
      }
    }
    if (fields.length === 0) return res.json({ ok: true });
    fields.push('updated_at = CURRENT_TIMESTAMP');
    params.push(parseInt(req.params.id));
    run('UPDATE products SET ' + fields.join(', ') + ' WHERE id = ?', params);
    res.json({ ok: true });
  });

  router.delete('/product/:id', (req, res) => {
    run('UPDATE products SET deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [parseInt(req.params.id)]);
    res.json({ ok: true });
  });

  router.post('/product/batch-delete', (req, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids) || !ids.length) return res.json({ ok: true, deleted: 0 });
    if (ids.length > 500) return res.status(400).json({ error: '单次最多操作 500 条' });
    const placeholders = ids.map(() => '?').join(',');
    const before = getOne('SELECT COUNT(*) as count FROM products WHERE id IN (' + placeholders + ')', ids);
    run('UPDATE products SET deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE id IN (' + placeholders + ')', ids);
    res.json({ ok: true, deleted: before ? before.count : 0 });
  });

  router.post('/product/batch-status', (req, res) => {
    const { ids, status } = req.body;
    if (!Array.isArray(ids) || !ids.length) return res.json({ ok: true, updated: 0 });
    if (ids.length > 500) return res.status(400).json({ error: '单次最多操作 500 条' });
    const placeholders = ids.map(() => '?').join(',');
    if (status === -1) {
      run('UPDATE products SET status = CASE WHEN status = 1 THEN 0 ELSE 1 END, updated_at = CURRENT_TIMESTAMP WHERE id IN (' + placeholders + ')', ids);
    } else {
      run('UPDATE products SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id IN (' + placeholders + ')', [status, ...ids]);
    }
    res.json({ ok: true, updated: ids.length });
  });

  // 补全指定类目下商品的完整路径
  router.patch('/products/backfill-path', (req, res) => {
    const { customCategory } = req.body;
    if (!customCategory) return res.status(400).json({ error: '缺少 customCategory' });

    // 1. 先从已有 dxm_category 提取路径
    const products = getAll(
      `SELECT id, dxm_category FROM products WHERE custom_category = ? AND (manual_category IS NULL OR manual_category = '') AND dxm_category IS NOT NULL AND dxm_category != '' AND deleted = 0`,
      [customCategory]
    );
    let updated = 0;
    (products || []).forEach(function (p) {
      try {
        var dxm = JSON.parse(p.dxm_category);
        if (dxm && dxm.path) {
          run('UPDATE products SET manual_category = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [dxm.path, p.id]);
          updated++;
        }
      } catch (e) {}
    });

    // 2. 再用分类树路径补全剩余的
    const treeRow = treeGetOne('SELECT path FROM dxm_category_tree WHERE cat_name = ? AND is_leaf = 1 LIMIT 1', [customCategory]);
    if (treeRow && treeRow.path) {
      const remaining = getOne(
        "SELECT COUNT(*) as cnt FROM products WHERE custom_category = ? AND (manual_category IS NULL OR manual_category = '') AND deleted = 0",
        [customCategory]
      );
      if (remaining && remaining.cnt > 0) {
        run(
          `UPDATE products SET manual_category = ?, dxm_category = ?, updated_at = CURRENT_TIMESTAMP
           WHERE custom_category = ? AND (manual_category IS NULL OR manual_category = '')
             AND deleted = 0`,
          [treeRow.path, JSON.stringify({ path: treeRow.path, leafName: customCategory }), customCategory]
        );
        updated += remaining.cnt;
      }
    }

    res.json({ ok: true, updated: updated, path: treeRow ? treeRow.path : '' });
  });

  return router;
}

function createDxmTreeRouter() {
  const { Router } = require('express');
  const router = Router();

  router.post('/dxm-category/collect', (req, res) => {
    const { path, leafName } = req.body;
    if (!path || !leafName) return res.status(400).json({ error: 'Missing path or leafName' });
    const cleanPath = path.replace(/\s+/g, '');
    const existing = treeGetOne('SELECT cat_id FROM dxm_category_tree WHERE path = ?', [cleanPath]);
    if (existing) { treeRun('UPDATE dxm_category_tree SET sync_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE cat_id = ?', [existing.cat_id]); }
    else {
      const parts = cleanPath.split('/');
      treeRun('INSERT INTO dxm_category_tree (cat_id, cat_name, parent_cat_id, cat_level, is_leaf, path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)', [Date.now(), leafName, 0, parts.length, 1, cleanPath]);
    }
    res.json({ ok: true });
  });

  router.post('/dxm-tree/sync', (req, res) => {
    const { categories } = req.body;
    if (!Array.isArray(categories) || !categories.length) return res.json({ ok: true, saved: 0 });
    let saved = 0;
    categories.forEach(c => {
      const existing = treeGetOne('SELECT cat_id FROM dxm_category_tree WHERE cat_id = ?', [c.catId]);
      if (existing) { treeRun('UPDATE dxm_category_tree SET cat_name=?, parent_cat_id=?, cat_level=?, is_leaf=?, path=?, sync_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE cat_id=?', [c.catName, c.parentCatId, c.catLevel, c.isLeaf ? 1 : 0, c.path || '', c.catId]); }
      else { treeRun('INSERT INTO dxm_category_tree (cat_id, cat_name, parent_cat_id, cat_level, is_leaf, path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)', [c.catId, c.catName, c.parentCatId, c.catLevel, c.isLeaf ? 1 : 0, c.path || '']); }
      saved++;
    });
    res.json({ ok: true, saved });
  });

  router.get('/dxm-tree/children', (req, res) => {
    const parentId = parseInt(req.query.parentId) || 0;
    const rows = treeGetAll('SELECT cat_id, cat_name, parent_cat_id, cat_level, is_leaf, path FROM dxm_category_tree WHERE parent_cat_id = ? GROUP BY cat_name ORDER BY cat_name', [parentId]);
    res.json(rows.map(r => ({ catId: r.cat_id, catName: r.cat_name, parentCatId: r.parent_cat_id, catLevel: r.cat_level, isLeaf: r.is_leaf, path: r.path })));
  });

  router.get('/dxm-tree/status', (req, res) => {
    const total = treeGetOne('SELECT COUNT(*) as cnt FROM dxm_category_tree');
    const lastSync = treeGetOne('SELECT MAX(sync_at) as last FROM dxm_category_tree');
    const levels = treeGetOne('SELECT MAX(cat_level) as lv FROM dxm_category_tree');
    res.json({ total: total ? total.cnt : 0, lastSync: lastSync ? lastSync.last : null, levels: levels ? levels.lv : 0 });
  });

  router.get('/dxm-tree/root-status', (req, res) => {
    const roots = treeGetAll('SELECT cat_id, cat_name, path, sync_at FROM dxm_category_tree WHERE parent_cat_id = 0 ORDER BY cat_name');
    const result = roots.map(r => {
      const cnt = treeGetOne('SELECT COUNT(*) as c FROM dxm_category_tree WHERE path LIKE ?', [r.path + '%']);
      return { catId: r.cat_id, catName: r.cat_name, count: cnt ? cnt.c : 0, lastSync: r.sync_at };
    });
    res.json(result);
  });

  router.get('/dxm-tree/search', (req, res) => {
    const keyword = (req.query.keyword || '').trim();
    if (!keyword) return res.json([]);
    const rows = treeGetAll('SELECT cat_id, cat_name, path, is_leaf FROM dxm_category_tree WHERE is_leaf = 1 AND cat_name LIKE ? ORDER BY cat_level, cat_name', ['%' + keyword + '%']);
    res.json(rows.map(r => ({ catId: r.cat_id, catName: r.cat_name, path: r.path, isLeaf: r.is_leaf })));
  });

  router.get('/dxm-tree/resolve-path', (req, res) => {
    const name = (req.query.name || '').trim();
    if (!name) return res.json({ path: '' });
    const row = treeGetOne('SELECT path FROM dxm_category_tree WHERE cat_name = ? AND is_leaf = 1 LIMIT 1', [name]);
    res.json({ path: row ? row.path : '' });
  });

  return router;
}

function createAiRouter(cloudDb) {
  const { Router } = require('express');
  const router = Router();

  router.get('/check-key', function (req, res) { res.json({ configured: false }); });
  router.get('/get-key', function (req, res) { res.json({ configured: false, masked: '' }); });
  router.post('/save-key', function (req, res) {
    var key = (req.body.key || '').trim();
    if (!key) return res.status(400).json({ error: '密钥不能为空' });
    run("INSERT OR REPLACE INTO settings (key, value) VALUES ('zhipu_api_key', ?)", [key]);
    res.json({ ok: true });
  });
  router.post('/delete-key', function (req, res) {
    run("DELETE FROM settings WHERE key = 'zhipu_api_key'");
    res.json({ ok: true });
  });
  router.get('/configs', function (req, res) {
    var result = {};
    ['category', 'vision', 'image'].forEach(function (uc) {
      var labelRow = getOne('SELECT value FROM settings WHERE key = ?', ['ai_label_' + uc]);
      result[uc] = { configured: false, customLabel: labelRow ? labelRow.value : '' };
    });
    result._global = { configured: false };
    result.providers = { qwen: { configured: false }, hunyuan: { configured: false }, ollama: {} };
    res.json(result);
  });
  router.post('/configs', function (req, res) {
    var updates = req.body;
    Object.keys(updates).forEach(function (uc) {
      if (uc === 'providers') return;
      if (updates[uc].label !== undefined) {
        run("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)", ['ai_label_' + uc, updates[uc].label]);
      }
    });
    res.json({ ok: true });
  });
  router.post('/global-key', function (req, res) {
    var key = (req.body.apiKey || '').trim();
    if (!key) return res.status(400).json({ error: 'API Key 不能为空' });
    if (key.indexOf('****') !== -1) return res.status(400).json({ error: '请输入完整API Key' });
    res.json({ ok: true });
  });
  router.post('/zhipu-keys', function (req, res) { res.json({ ok: true }); });
  router.post('/qwen-keys', function (req, res) { res.json({ ok: true }); });
  router.post('/hunyuan-keys', function (req, res) { res.json({ ok: true }); });
  router.get('/smms-token', function (req, res) {
    var row = getOne('SELECT value FROM settings WHERE key = ?', ['imgbb_api_key']);
    var labelRow = getOne('SELECT value FROM settings WHERE key = ?', ['imgbb_api_key_label']);
    if (!row) return res.json({ configured: false, masked: '', label: '' });
    res.json({ configured: true, masked: '****', label: labelRow ? labelRow.value : '' });
  });
  router.post('/smms-token', function (req, res) {
    var key = (req.body.token || '').trim();
    var label = req.body.label;
    var labelOnly = req.body.labelOnly === true;
    if (!key && !labelOnly) return res.status(400).json({ error: 'API Key 不能为空' });
    if (key && !labelOnly) {
      run("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('imgbb_api_key', ?, CURRENT_TIMESTAMP)", [key]);
    }
    if (label !== undefined) {
      run("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('imgbb_api_key_label', ?, CURRENT_TIMESTAMP)", [label]);
    }
    res.json({ ok: true });
  });
  router.post('/smms-token-delete', function (req, res) {
    run("DELETE FROM settings WHERE key = 'imgbb_api_key'");
    run("DELETE FROM settings WHERE key = 'imgbb_api_key_label'");
    res.json({ ok: true });
  });
  router.post('/text-to-image', function (req, res) {
    var prompt = req.body.prompt;
    if (!prompt || !prompt.trim()) return res.status(400).json({ error: '请输入图片描述' });
    res.status(502).json({ error: '未配置API' });
  });
  router.post('/image-to-image', function (req, res) {
    var prompt = req.body.prompt;
    if (!prompt || !prompt.trim()) return res.status(400).json({ error: '请输入图片描述' });
    if (!req.body.image_base64) return res.status(400).json({ error: '请先上传参考图' });
    res.status(502).json({ error: '未配置API' });
  });
  router.post('/white-bg', function (req, res) {
    if (!req.body.image_base64) return res.status(400).json({ error: '请先加载图片' });
    res.status(502).json({ error: '未配置API' });
  });
  router.post('/enhance', function (req, res) {
    if (!req.body.image_base64) return res.status(400).json({ error: '请先加载图片' });
    res.status(502).json({ error: '未配置API' });
  });
  router.post('/smms-upload', function (req, res) {
    if (!req.body.image_base64) return res.status(400).json({ error: '请先加载图片' });
    res.status(400).json({ error: '未配置 ImgBB API Key' });
  });
  router.post('/inpaint', function (req, res) {
    if (!req.body.image_base64) return res.status(400).json({ error: '请先加载图片' });
    if (!req.body.mask_base64) return res.status(400).json({ error: '请先用画笔/框选标记要消除的区域' });
    res.status(503).json({ error: '修复模型未安装' });
  });
  router.post('/smart-detect', function (req, res) {
    if (!req.body.image_base64) return res.status(400).json({ error: '请先加载图片' });
    res.status(502).json({ error: '未配置API' });
  });
  router.get('/model-status', function (req, res) { res.json({ available: false, model: 'LaMa (Local ONNX)' }); });
  router.post('/detect-text', function (req, res) {
    if (!req.body.image_base64 && !req.body.image_url) return res.status(400).json({ error: '请提供 image_base64 或 image_url' });
    res.status(502).json({ error: 'OCR服务不可用' });
  });
  router.post('/auto-clean-chinese', function (req, res) {
    if (!req.body.image_base64 && !req.body.image_url) return res.status(400).json({ error: '请提供 image_base64 或 image_url' });
    res.status(502).json({ error: 'OCR服务不可用' });
  });
  router.get('/ocr-status', function (req, res) { res.json({ ocr: { status: 'offline' }, lama: { available: false }, pipeline: 'offline' }); });

  return router;
}

module.exports = { initTestDb, createTestApp, createMockCloudDb, run, getOne, getAll, treeRun, treeGetOne, treeGetAll, scheduleSave, parseRow, sseClients, sseBroadcast };
