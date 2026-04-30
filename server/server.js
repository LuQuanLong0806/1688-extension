const express = require('express');
const initSqlJs = require('sql.js');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

// SSE 客户端管理
const sseClients = [];
function sseBroadcast(event, data) {
  const msg = 'event: ' + event + '\ndata: ' + JSON.stringify(data) + '\n\n';
  for (let i = sseClients.length - 1; i >= 0; i--) {
    try { sseClients[i].write(msg); } catch (e) { sseClients.splice(i, 1); }
  }
}

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Database
const DB_FILE = path.join(__dirname, 'data.db');
let db;
let saveTimer = null;

function saveDb() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_FILE, buffer);
}

// DXM 分类树独立数据库
const TREE_DB_FILE = path.join(__dirname, 'dxm_tree.db');
let treeDb;
let treeSaveTimer = null;

function saveTreeDb() {
  if (!treeDb) return;
  const data = treeDb.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(TREE_DB_FILE, buffer);
  try { fs.writeFileSync(TREE_DB_FILE + '.bak', buffer); } catch (e) {}
}

function scheduleTreeSave() {
  if (treeSaveTimer) clearTimeout(treeSaveTimer);
  treeSaveTimer = setTimeout(saveTreeDb, 500);
}

function treeRun(sql, params) {
  treeDb.run(sql, params);
  scheduleTreeSave();
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

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(saveDb, 500);
}

function run(sql, params) {
  db.run(sql, params);
  scheduleSave();
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
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

async function initDb() {
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_FILE)) {
    const fileBuffer = fs.readFileSync(DB_FILE);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_url TEXT NOT NULL,
      title TEXT,
      main_images TEXT,
      desc_images TEXT,
      attrs TEXT,
      skus TEXT,
      status INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  // 增量添加 category 列（已存在则忽略）
  try { db.run('ALTER TABLE products ADD COLUMN category TEXT'); } catch (e) {}
  try { db.run('ALTER TABLE products ADD COLUMN detail_images TEXT'); } catch (e) {}
  try { db.run('ALTER TABLE products ADD COLUMN custom_category TEXT'); } catch (e) {}
  try { db.run('ALTER TABLE products ADD COLUMN dxm_category TEXT DEFAULT \'\''); } catch (e) {}
  try { db.run('ALTER TABLE products ADD COLUMN manual_category TEXT'); } catch (e) {}

  // 配置项表
  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 类目表（含自定义名称，作为类目数据字典）
  db.run(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      custom_name TEXT DEFAULT '',
      cat_id TEXT,
      leaf_category_id TEXT,
      top_category_id TEXT,
      post_category_id TEXT,
      count INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  try { db.run('ALTER TABLE categories ADD COLUMN custom_name TEXT DEFAULT \'\''); } catch (e) {}

  // 迁移：将已有商品的类目数据补录到 categories 表
  try {
    const existingCats = getOne('SELECT COUNT(*) as cnt FROM categories');
    if (!existingCats || existingCats.cnt === 0) {
      const products = getAll('SELECT category FROM products');
      products.forEach(r => {
        try {
          const cat = JSON.parse(r.category || '{}');
          const name = cat.leafCategoryName || cat.categoryPath;
          if (name) {
            const existing = getOne('SELECT id FROM categories WHERE name = ?', [name]);
            if (!existing) {
              run('INSERT INTO categories (name, cat_id, leaf_category_id, top_category_id, post_category_id, count) VALUES (?, ?, ?, ?, ?, ?)',
                [name, cat.catId || '', cat.leafCategoryId || '', cat.topCategoryId || '', cat.postCategoryId || '', 0]);
            }
          }
        } catch (e) {}
      });
      // 重新统计每个类目的商品数量
      const allProducts = getAll('SELECT category FROM products');
      const catCount = {};
      allProducts.forEach(r => {
        try {
          const cat = JSON.parse(r.category || '{}');
          const name = cat.leafCategoryName || cat.categoryPath;
          if (name) catCount[name] = (catCount[name] || 0) + 1;
        } catch (e) {}
      });
      for (const [name, count] of Object.entries(catCount)) {
        run('UPDATE categories SET count = ? WHERE name = ?', [count, name]);
      }
    }
  } catch (e) {}

  // 店小秘类目库（收集所有在店小秘选过的分类）
  db.run(`
    CREATE TABLE IF NOT EXISTS dxm_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT NOT NULL UNIQUE,
      leaf_name TEXT NOT NULL,
      count INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 1688类目 → 自定义类目映射（独立于商品，删除商品不影响）
  db.run(`
    CREATE TABLE IF NOT EXISTS category_mappings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_name TEXT NOT NULL,
      custom_category TEXT NOT NULL,
      UNIQUE(category_name, custom_category)
    )
  `);

  // 迁移：将 categories.custom_name 导入 category_mappings（仅首次）
  try {
    const migrationCheck = getOne("SELECT value FROM settings WHERE key = 'migration_custom_name_to_mappings'");
    if (!migrationCheck) {
      const oldMappings = getAll("SELECT name, custom_name FROM categories WHERE custom_name IS NOT NULL AND custom_name != ''");
      oldMappings.forEach(function (r) {
        run('INSERT OR IGNORE INTO category_mappings (category_name, custom_category) VALUES (?, ?)', [r.name, r.custom_name]);
      });
      run("INSERT OR REPLACE INTO settings (key, value) VALUES ('migration_custom_name_to_mappings', '1')");
    }
  } catch (e) {}

  saveDb();
}

async function initTreeDb() {
  const SQL = await initSqlJs();
  const bakFile = TREE_DB_FILE + '.bak';
  if (fs.existsSync(TREE_DB_FILE)) {
    treeDb = new SQL.Database(fs.readFileSync(TREE_DB_FILE));
  } else if (fs.existsSync(bakFile) && fs.statSync(bakFile).size > 0) {
    // db 文件丢失但备份存在，从备份恢复
    console.log('[tree] dxm_tree.db 丢失，从备份恢复...');
    const bakData = fs.readFileSync(bakFile);
    fs.writeFileSync(TREE_DB_FILE, bakData);
    treeDb = new SQL.Database(bakData);
  } else {
    treeDb = new SQL.Database();
  }
  treeDb.run(`CREATE TABLE IF NOT EXISTS dxm_category_tree (
    cat_id INTEGER PRIMARY KEY,
    cat_name TEXT NOT NULL,
    parent_cat_id INTEGER DEFAULT 0,
    cat_level INTEGER DEFAULT 1,
    is_leaf INTEGER DEFAULT 0,
    path TEXT DEFAULT '',
    sync_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  scheduleTreeSave();
}

// ========== API ==========

// Clear-signal for cross-tab communication (1688 result page ← server ← dianxiaomi)
let _clearSignals = {};
app.get('/api/clear-signal', (req, res) => {
  const clientId = req.query.clientId || '';
  const signal = clientId ? _clearSignals[clientId] : 0;
  res.json({ clearAt: signal || 0 });
});
app.post('/api/clear-signal', (req, res) => {
  const clientId = req.body.clientId || '';
  if (clientId) _clearSignals[clientId] = Date.now();
  res.json({ ok: true });
});

// 获取所有配置
app.get('/api/settings', (req, res) => {
  const rows = getAll('SELECT key, value FROM settings');
  const result = {};
  rows.forEach(r => { result[r.key] = r.value; });
  res.json(result);
});

// 批量更新配置
app.put('/api/settings', (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items) || !items.length) return res.json({ ok: true });
  for (const item of items) {
    run('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)', [item.key, item.value]);
  }
  res.json({ ok: true });
});

// 采集趋势（按天统计）
app.get('/api/product/trend', (req, res) => {
  const days = Math.min(90, Math.max(1, parseInt(req.query.days) || 7));
  const rows = getAll(
    `SELECT DATE(created_at) as date, COUNT(*) as count FROM products WHERE created_at >= DATE('now', '-' || ? || ' days') GROUP BY DATE(created_at) ORDER BY date`,
    [days]
  );
  // 补齐空白天
  const map = {};
  rows.forEach(r => { map[r.date] = r.count; });
  const result = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    result.push({ date: key, count: map[key] || 0 });
  }
  res.json(result);
});

// 统计概览
app.get('/api/product/stats', (req, res) => {
  const row = getOne('SELECT COUNT(*) as total, SUM(CASE WHEN status=0 THEN 1 ELSE 0 END) as unused, SUM(CASE WHEN status=1 THEN 1 ELSE 0 END) as used FROM products');
  const catRow = getOne('SELECT COUNT(*) as cnt FROM categories');
  res.json({
    total: row ? row.total : 0,
    unused: row ? row.unused || 0 : 0,
    used: row ? row.used || 0 : 0,
    totalCategories: catRow ? catRow.cnt : 0
  });
});

// 获取类目列表
app.get('/api/product/categories', (req, res) => {
  const rows = getAll('SELECT name FROM categories ORDER BY name');
  res.json(rows.map(r => r.name));
});

// 获取店小秘类目列表（去重）
app.get('/api/product/dxm-categories', (req, res) => {
  const rows = getAll("SELECT DISTINCT dxm_category FROM products WHERE dxm_category IS NOT NULL AND dxm_category != '' ORDER BY dxm_category");
  const list = rows.map(r => {
    try { return JSON.parse(r.dxm_category); } catch (e) { return null; }
  }).filter(Boolean);
  res.json(list);
});

// 类目偏好 Top20
app.get('/api/product/category-top', (req, res) => {
  const rows = getAll('SELECT name, count FROM categories ORDER BY count DESC LIMIT 10');
  res.json(rows);
});

// 保存采集数据
app.post('/api/product', (req, res) => {
  const { sourceUrl, title, category, mainImages, descImages, detailImages, attrs, skus } = req.body;

  // 匹配类目字典，获取自定义类目名
  let customCategory = '';
  let dxmCategoryVal = '';
  if (category) {
    const catName = category.leafCategoryName || category.categoryPath;
    if (catName) {
      // 优先查 category_mappings，fallback 到 categories.custom_name
      const mappingRow = getOne('SELECT custom_category FROM category_mappings WHERE category_name = ? LIMIT 1', [catName]);
      if (mappingRow && mappingRow.custom_category) {
        customCategory = mappingRow.custom_category;
      } else {
        const catRow = getOne('SELECT custom_name FROM categories WHERE name = ?', [catName]);
        if (catRow && catRow.custom_name) {
          customCategory = catRow.custom_name;
        }
      }
      // 从同类目已有商品中获取店小秘类目
      const existing = getOne(
        "SELECT dxm_category FROM products WHERE category LIKE ? AND dxm_category IS NOT NULL AND dxm_category != '' LIMIT 1",
        ['%"' + catName + '"%']
      );
      if (existing && existing.dxm_category) {
        dxmCategoryVal = existing.dxm_category;
      }
    }
  }

  db.run(
    `INSERT INTO products (source_url, title, category, custom_category, dxm_category, main_images, desc_images, detail_images, attrs, skus)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      sourceUrl || '',
      title || '',
      JSON.stringify(category || {}),
      customCategory,
      dxmCategoryVal,
      JSON.stringify(mainImages || []),
      JSON.stringify(descImages || []),
      JSON.stringify(detailImages || []),
      JSON.stringify(attrs || []),
      JSON.stringify(skus || [])
    ]
  );

  // 同步更新类目表
  if (category) {
    const catName = category.leafCategoryName || category.categoryPath;
    if (catName) {
      const existing = getOne('SELECT id, count FROM categories WHERE name = ?', [catName]);
      if (existing) {
        run('UPDATE categories SET count = count + 1 WHERE name = ?', [catName]);
      } else {
        run('INSERT INTO categories (name, cat_id, leaf_category_id, top_category_id, post_category_id) VALUES (?, ?, ?, ?, ?)',
          [catName, category.catId || '', category.leafCategoryId || '', category.topCategoryId || '', category.postCategoryId || '']);
      }
      // 自动匹配到自定义类目时写入映射
      if (customCategory) {
        run('INSERT OR IGNORE INTO category_mappings (category_name, custom_category) VALUES (?, ?)', [catName, customCategory]);
      }
    }
  }

  const row = getOne('SELECT last_insert_rowid() as id');
  scheduleSave();
  sseBroadcast('product-added', { id: row.id, title: title || '' });
  res.json({ ok: true, id: row.id });
});

// 检查是否已采集
app.get('/api/product/check', (req, res) => {
  const offerId = (req.query.offerId || '').trim();
  if (!offerId) return res.json({ exists: false });
  const row = getOne('SELECT id, title, status FROM products WHERE source_url LIKE ? LIMIT 1', ['%' + offerId + '%']);
  if (row) {
    res.json({ exists: true, id: row.id, title: row.title, status: row.status });
  } else {
    res.json({ exists: false });
  }
});

// SSE 实时推送
app.get('/api/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  });
  res.write('event: connected\ndata: {}\n\n');
  sseClients.push(res);
  req.on('close', () => {
    const idx = sseClients.indexOf(res);
    if (idx >= 0) sseClients.splice(idx, 1);
  });
});

// 获取商品列表（分页 + 搜索 + 状态筛选 + 类目筛选）
app.get('/api/product', (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize) || 20));
  const keyword = (req.query.keyword || '').trim();
  const status = req.query.status;
  const category = (req.query.category || '').trim();
  const dxmCategory = (req.query.dxmCategory || '').trim();

  let where = [];
  let params = [];

  if (keyword) {
    where.push('title LIKE ?');
    params.push(`%${keyword}%`);
  }
  if (status !== undefined && status !== '' && status !== 'all') {
    where.push('status = ?');
    params.push(parseInt(status));
  }
  if (category) {
    where.push('category LIKE ?');
    params.push(`%${category}%`);
  }
  if (dxmCategory === '_none') {
    where.push('(dxm_category IS NULL OR dxm_category = \'\')');
  } else if (dxmCategory) {
    where.push('dxm_category LIKE ?');
    params.push(`%${dxmCategory}%`);
  }

  const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';

  const countRow = getOne(`SELECT COUNT(*) as count FROM products ${whereClause}`, params);
  const total = countRow ? countRow.count : 0;

  const offset = (page - 1) * pageSize;
  const list = getAll(
    `SELECT id, source_url, title, category, custom_category, dxm_category, attrs, skus, status, created_at, updated_at
     FROM products ${whereClause}
     ORDER BY status ASC, created_at DESC, id DESC
     LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );

  // 一次性加载所有映射，避免每条商品单独查询
  const allMappings = getAll("SELECT category_name, custom_category FROM category_mappings");
  const mappingMap = {};
  allMappings.forEach(function (r) {
    if (!r.category_name || !r.custom_category) return;
    if (!mappingMap[r.category_name]) mappingMap[r.category_name] = [];
    if (mappingMap[r.category_name].indexOf(r.custom_category) === -1) {
      mappingMap[r.category_name].push(r.custom_category);
    }
  });

  const parsedList = list.map(row => {
    var catObj = row.category ? JSON.parse(row.category) : {};
    var catName = catObj.leafCategoryName || catObj.categoryPath || '';
    var recommendedCats = mappingMap[catName] || [];
    return {
      ...row,
      category: catObj,
      customCategory: row.custom_category || '',
      dxmCategory: row.dxm_category ? JSON.parse(row.dxm_category) : null,
      recommendedCustomCategories: recommendedCats,
      attrs: JSON.parse(row.attrs || '[]'),
      skuCount: JSON.parse(row.skus || '[]').length
    };
  });

  res.json({ total, page, pageSize, list: parsedList });
});

// 获取单条商品
app.get('/api/product/:id', (req, res) => {
  const row = getOne('SELECT * FROM products WHERE id = ?', [parseInt(req.params.id)]);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(parseRow(row));
});

// 更新商品
app.put('/api/product/:id', (req, res) => {
  const fields = [];
  const params = [];

  const allowedFields = {
    title: 'title',
    sourceUrl: 'source_url',
    mainImages: 'main_images',
    descImages: 'desc_images',
    detailImages: 'detail_images',
    attrs: 'attrs',
    skus: 'skus',
    status: 'status',
    customCategory: 'custom_category',
    manualCategory: 'manual_category',
    dxmCategory: 'dxm_category'
  };

  for (const [key, col] of Object.entries(allowedFields)) {
    if (req.body[key] !== undefined) {
      let val = req.body[key];
      if (['main_images', 'desc_images', 'detail_images', 'attrs', 'skus', 'dxm_category'].includes(col) || Array.isArray(val)) {
        val = JSON.stringify(val);
      }
      fields.push(`${col} = ?`);
      params.push(val);
    }
  }

  if (fields.length === 0) return res.json({ ok: true });

  fields.push('updated_at = CURRENT_TIMESTAMP');
  params.push(parseInt(req.params.id));

  run(`UPDATE products SET ${fields.join(', ')} WHERE id = ?`, params);

  // 修改自定义类目时，保存映射关系到独立表
  const product = getOne('SELECT category FROM products WHERE id = ?', [parseInt(req.params.id)]);
  ['customCategory', 'manualCategory'].forEach(function (field) {
    if (req.body[field] !== undefined && req.body[field]) {
      if (product && product.category) {
        try {
          const cat = JSON.parse(product.category);
          const catName = cat.leafCategoryName || cat.categoryPath;
          if (catName) {
            run('INSERT OR IGNORE INTO category_mappings (category_name, custom_category) VALUES (?, ?)', [catName, req.body[field]]);
          }
        } catch (e) {}
      }
    }
  });

  res.json({ ok: true });
});

// ========== 店小秘类目库 ==========

// 收集店小秘类目（写入 dxm_category_tree）
app.post('/api/dxm-category/collect', (req, res) => {
  const { path, leafName } = req.body;
  if (!path || !leafName) return res.status(400).json({ error: 'Missing path or leafName' });
  const cleanPath = path.replace(/\s+/g, '');
  const existing = treeGetOne('SELECT cat_id FROM dxm_category_tree WHERE path = ?', [cleanPath]);
  if (existing) {
    treeRun('UPDATE dxm_category_tree SET sync_at = CURRENT_TIMESTAMP WHERE cat_id = ?', [existing.cat_id]);
  } else {
    const parts = cleanPath.split('/');
    treeRun('INSERT INTO dxm_category_tree (cat_id, cat_name, parent_cat_id, cat_level, is_leaf, path) VALUES (?, ?, ?, ?, ?, ?)',
      [Date.now(), leafName, 0, parts.length, 1, cleanPath]);
  }
  res.json({ ok: true });
});

// ========== DXM 分类树 API ==========

// 批量保存分类节点
app.post('/api/dxm-tree/sync', (req, res) => {
  const { categories } = req.body;
  if (!Array.isArray(categories) || !categories.length) return res.json({ ok: true, saved: 0 });
  let saved = 0;
  categories.forEach(c => {
    const existing = treeGetOne('SELECT cat_id FROM dxm_category_tree WHERE cat_id = ?', [c.catId]);
    if (existing) {
      treeRun('UPDATE dxm_category_tree SET cat_name=?, parent_cat_id=?, cat_level=?, is_leaf=?, path=?, sync_at=CURRENT_TIMESTAMP WHERE cat_id=?',
        [c.catName, c.parentCatId, c.catLevel, c.isLeaf ? 1 : 0, c.path || '', c.catId]);
    } else {
      treeRun('INSERT INTO dxm_category_tree (cat_id, cat_name, parent_cat_id, cat_level, is_leaf, path) VALUES (?, ?, ?, ?, ?, ?)',
        [c.catId, c.catName, c.parentCatId, c.catLevel, c.isLeaf ? 1 : 0, c.path || '']);
    }
    saved++;
  });
  res.json({ ok: true, saved });
});

// 获取子级分类
app.get('/api/dxm-tree/children', (req, res) => {
  const parentId = parseInt(req.query.parentId) || 0;
  const rows = treeGetAll('SELECT cat_id, cat_name, parent_cat_id, cat_level, is_leaf, path FROM dxm_category_tree WHERE parent_cat_id = ? GROUP BY cat_name ORDER BY cat_name', [parentId]);
  res.json(rows.map(r => ({
    catId: r.cat_id, catName: r.cat_name, parentCatId: r.parent_cat_id,
    catLevel: r.cat_level, isLeaf: r.is_leaf, path: r.path
  })));
});

// 同步状态
app.get('/api/dxm-tree/status', (req, res) => {
  const total = treeGetOne('SELECT COUNT(*) as cnt FROM dxm_category_tree');
  const lastSync = treeGetOne('SELECT MAX(sync_at) as last FROM dxm_category_tree');
  const levels = treeGetOne('SELECT MAX(cat_level) as lv FROM dxm_category_tree');
  res.json({
    total: total ? total.cnt : 0,
    lastSync: lastSync ? lastSync.last : null,
    levels: levels ? levels.lv : 0
  });
});

// 各大类同步状态
app.get('/api/dxm-tree/root-status', (req, res) => {
  const roots = treeGetAll('SELECT cat_id, cat_name, path, sync_at FROM dxm_category_tree WHERE parent_cat_id = 0 ORDER BY cat_name');
  const result = roots.map(r => {
    const cnt = treeGetOne('SELECT COUNT(*) as c FROM dxm_category_tree WHERE path LIKE ?', [r.path + '%']);
    return { catId: r.cat_id, catName: r.cat_name, count: cnt ? cnt.c : 0, lastSync: r.sync_at };
  });
  res.json(result);
});

// 搜索分类（只返回叶子分类）
app.get('/api/dxm-tree/search', (req, res) => {
  const keyword = (req.query.keyword || '').trim();
  if (!keyword) return res.json([]);
  const rows = treeGetAll('SELECT cat_id, cat_name, path, is_leaf FROM dxm_category_tree WHERE is_leaf = 1 AND cat_name LIKE ? ORDER BY cat_level, cat_name', ['%' + keyword + '%']);
  res.json(rows.map(r => ({ catId: r.cat_id, catName: r.cat_name, path: r.path, isLeaf: r.is_leaf })));
});

// 根据叶子名称精确查找路径
app.get('/api/dxm-tree/resolve-path', (req, res) => {
  const name = (req.query.name || '').trim();
  if (!name) return res.json({ path: '' });
  const row = treeGetOne('SELECT path FROM dxm_category_tree WHERE cat_name = ? AND is_leaf = 1 LIMIT 1', [name]);
  res.json({ path: row ? row.path : '' });
});

// 删除商品
app.delete('/api/product/:id', (req, res) => {
  run('DELETE FROM products WHERE id = ?', [parseInt(req.params.id)]);
  res.json({ ok: true });
});

// 批量删除
app.post('/api/product/batch-delete', (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || !ids.length) return res.json({ ok: true, deleted: 0 });
  const placeholders = ids.map(() => '?').join(',');
  // sql.js doesn't return changes count easily, so we count before
  const before = getOne(`SELECT COUNT(*) as count FROM products WHERE id IN (${placeholders})`, ids);
  run(`DELETE FROM products WHERE id IN (${placeholders})`, ids);
  res.json({ ok: true, deleted: before ? before.count : 0 });
});

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

// ========== 类目映射 CRUD ==========

app.get('/api/category-mappings', (req, res) => {
  const keyword = (req.query.keyword || '').trim();
  let rows;
  if (keyword) {
    rows = getAll('SELECT id, category_name, custom_category FROM category_mappings WHERE category_name LIKE ? OR custom_category LIKE ? ORDER BY category_name', ['%' + keyword + '%', '%' + keyword + '%']);
  } else {
    rows = getAll('SELECT id, category_name, custom_category FROM category_mappings ORDER BY category_name');
  }
  res.json(rows.map(r => ({ id: r.id, categoryName: r.category_name, customCategory: r.custom_category })));
});

app.delete('/api/category-mappings/:id', (req, res) => {
  run('DELETE FROM category_mappings WHERE id = ?', [parseInt(req.params.id)]);
  res.json({ ok: true });
});

// Start
initDb().then(() => initTreeDb()).then(() => {
  // 迁移 dxm_categories → dxm_category_tree（仅首次）
  try {
    const migrationCheck = getOne("SELECT value FROM settings WHERE key = 'migration_dxm_categories_to_tree'");
    if (!migrationCheck) {
      const oldCats = getAll("SELECT path, leaf_name FROM dxm_categories");
      if (oldCats.length) {
        console.log('[migration] 迁移 dxm_categories → dxm_category_tree (' + oldCats.length + ' 条)');
        oldCats.forEach(function (r) {
          const cleanPath = (r.path || '').replace(/\s+/g, '');
          const parts = cleanPath.split('/');
          if (!cleanPath) return;
          const existing = treeGetOne('SELECT cat_id FROM dxm_category_tree WHERE path = ?', [cleanPath]);
          if (!existing) {
            treeRun('INSERT INTO dxm_category_tree (cat_id, cat_name, parent_cat_id, cat_level, is_leaf, path) VALUES (?, ?, ?, ?, ?, ?)',
              [Date.now() + Math.random() * 10000 | 0, r.leaf_name || parts[parts.length - 1], 0, parts.length, 1, cleanPath]);
          }
        });
      }
      run("INSERT OR REPLACE INTO settings (key, value) VALUES ('migration_dxm_categories_to_tree', '1')");
    }
  } catch (e) { console.error('[migration] dxm_categories 迁移失败:', e.message); }
  app.listen(PORT, () => {
    console.log(`\n  商品采集服务已启动`);
    console.log(`  管理页面: http://localhost:${PORT}`);
    console.log(`  API 地址: http://localhost:${PORT}/api/product`);
    console.log(`  数据库: ${DB_FILE}\n`);
    // 自动打开管理页面（优先 Chrome）
    var openUrl = 'http://localhost:' + PORT;
    var chromeExe = '';
    if (process.platform === 'win32') {
      var candidates = [
        (process.env.ProgramFiles || '') + '\\Google\\Chrome\\Application\\chrome.exe',
        (process.env['ProgramFiles(x86)'] || '') + '\\Google\\Chrome\\Application\\chrome.exe',
        (process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe'
      ];
      for (var ci = 0; ci < candidates.length; ci++) {
        if (candidates[ci] && fs.existsSync(candidates[ci])) { chromeExe = candidates[ci]; break; }
      }
    }
    if (chromeExe) {
      require('child_process').exec('"' + chromeExe + '" ' + openUrl);
    } else {
      var cmd = process.platform === 'win32' ? 'start' : process.platform === 'darwin' ? 'open' : 'xdg-open';
      require('child_process').exec(cmd + ' ' + openUrl);
    }
  });
});
