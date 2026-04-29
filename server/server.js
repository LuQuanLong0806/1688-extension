const express = require('express');
const initSqlJs = require('sql.js');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

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

  // 配置项表
  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 类目表
  db.run(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      cat_id TEXT,
      leaf_category_id TEXT,
      top_category_id TEXT,
      post_category_id TEXT,
      count INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

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

  saveDb();
}

// ========== API ==========

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

// 类目偏好 Top20
app.get('/api/product/category-top', (req, res) => {
  const rows = getAll('SELECT name, count FROM categories ORDER BY count DESC LIMIT 10');
  res.json(rows);
});

// 保存采集数据
app.post('/api/product', (req, res) => {
  const { sourceUrl, title, category, mainImages, descImages, detailImages, attrs, skus } = req.body;
  db.run(
    `INSERT INTO products (source_url, title, category, main_images, desc_images, detail_images, attrs, skus)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      sourceUrl || '',
      title || '',
      JSON.stringify(category || {}),
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
    }
  }

  const row = getOne('SELECT last_insert_rowid() as id');
  scheduleSave();
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

// 获取商品列表（分页 + 搜索 + 状态筛选 + 类目筛选）
app.get('/api/product', (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize) || 20));
  const keyword = (req.query.keyword || '').trim();
  const status = req.query.status;
  const category = (req.query.category || '').trim();

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

  const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';

  const countRow = getOne(`SELECT COUNT(*) as count FROM products ${whereClause}`, params);
  const total = countRow ? countRow.count : 0;

  const offset = (page - 1) * pageSize;
  const list = getAll(
    `SELECT id, source_url, title, category, attrs, skus, status, created_at, updated_at
     FROM products ${whereClause}
     ORDER BY id DESC
     LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );

  const parsedList = list.map(row => ({
    ...row,
    category: row.category ? JSON.parse(row.category) : {},
    attrs: JSON.parse(row.attrs || '[]'),
    skuCount: JSON.parse(row.skus || '[]').length
  }));

  res.json({ total, page, pageSize, list: parsedList });
});

// 获取最新一条
app.get('/api/product/latest', (req, res) => {
  const row = getOne('SELECT * FROM products ORDER BY id DESC LIMIT 1');
  if (!row) return res.json(null);
  res.json(parseRow(row));
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
    status: 'status'
  };

  for (const [key, col] of Object.entries(allowedFields)) {
    if (req.body[key] !== undefined) {
      let val = req.body[key];
      if (['main_images', 'desc_images', 'detail_images', 'attrs', 'skus'].includes(col) || Array.isArray(val)) {
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
  res.json({ ok: true });
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
    main_images: JSON.parse(row.main_images || '[]'),
    desc_images: JSON.parse(row.desc_images || '[]'),
    detail_images: JSON.parse(row.detail_images || '[]'),
    attrs: JSON.parse(row.attrs || '[]'),
    skus: JSON.parse(row.skus || '[]')
  };
}

// Start
initDb().then(() => {
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
