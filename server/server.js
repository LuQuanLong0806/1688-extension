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

  saveDb();
}

// ========== API ==========

// Clear-signal for cross-tab communication (1688 result page ← server ← dianxiaomi)
let _clearSignalTime = 0;
app.get('/api/clear-signal', (req, res) => {
  res.json({ clearAt: _clearSignalTime });
});
app.post('/api/clear-signal', (req, res) => {
  _clearSignalTime = Date.now();
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
      const catRow = getOne('SELECT id, count, custom_name FROM categories WHERE name = ?', [catName]);
      if (catRow && catRow.custom_name) {
        customCategory = catRow.custom_name;
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

  const parsedList = list.map(row => ({
    ...row,
    category: row.category ? JSON.parse(row.category) : {},
    customCategory: row.custom_category || '',
    dxmCategory: row.dxm_category ? JSON.parse(row.dxm_category) : null,
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
    status: 'status',
    customCategory: 'custom_category',
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

  // 修改自定义类目时，批量同步同原类目的所有商品 + 更新类目字典
  if (req.body.customCategory !== undefined) {
    const product = getOne('SELECT category FROM products WHERE id = ?', [parseInt(req.params.id)]);
    if (product && product.category) {
      try {
        const cat = JSON.parse(product.category);
        const catName = cat.leafCategoryName || cat.categoryPath;
        if (catName) {
          const newCustomName = req.body.customCategory;
          // 更新类目字典
          run('UPDATE categories SET custom_name = ? WHERE name = ?', [newCustomName, catName]);
          // 如果字典中没有该类目，先插入
          const existCat = getOne('SELECT id FROM categories WHERE name = ?', [catName]);
          if (!existCat) {
            run('INSERT INTO categories (name, custom_name, cat_id, leaf_category_id, top_category_id, post_category_id) VALUES (?, ?, ?, ?, ?, ?)',
              [catName, newCustomName, cat.catId || '', cat.leafCategoryId || '', cat.topCategoryId || '', cat.postCategoryId || '']);
          }
          // 批量更新同原类目的所有商品
          run("UPDATE products SET custom_category = ?, updated_at = CURRENT_TIMESTAMP WHERE category LIKE ?",
            [newCustomName, '%"' + catName + '"%']);
        }
      } catch (e) {}
    }
  }

  res.json({ ok: true });
});

// 回传店小秘类目
app.post('/api/product/dxm-category', (req, res) => {
  const { collectId, dxmCategory } = req.body;
  if (!collectId || !dxmCategory) return res.status(400).json({ error: 'Missing collectId or dxmCategory' });
  run('UPDATE products SET dxm_category = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [JSON.stringify(dxmCategory), parseInt(collectId)]);

  // 同步填充：同1688类目且dxm_category为空的商品，自动填入相同的店小秘类目
  try {
    const product = getOne('SELECT category FROM products WHERE id = ?', [parseInt(collectId)]);
    if (product && product.category) {
      const cat = JSON.parse(product.category);
      const catName = cat.leafCategoryName || cat.categoryPath;
      if (catName) {
        const dxmVal = JSON.stringify(dxmCategory);
        run("UPDATE products SET dxm_category = ?, updated_at = CURRENT_TIMESTAMP WHERE category LIKE ? AND (dxm_category IS NULL OR dxm_category = '')",
          [dxmVal, '%"' + catName + '"%']);
      }
    }
  } catch (e) {}

  res.json({ ok: true });
});

// ========== 店小秘类目库 ==========

// 收集店小秘类目
app.post('/api/dxm-category/collect', (req, res) => {
  const { path, leafName } = req.body;
  if (!path || !leafName) return res.status(400).json({ error: 'Missing path or leafName' });
  const existing = getOne('SELECT id, count FROM dxm_categories WHERE path = ?', [path]);
  if (existing) {
    run('UPDATE dxm_categories SET count = count + 1 WHERE id = ?', [existing.id]);
  } else {
    run('INSERT INTO dxm_categories (path, leaf_name) VALUES (?, ?)', [path, leafName]);
  }
  res.json({ ok: true });
});

// 获取类目库列表
app.get('/api/dxm-category/library', (req, res) => {
  const rows = getAll('SELECT id, path, leaf_name, count, created_at FROM dxm_categories ORDER BY count DESC, id DESC');
  res.json(rows);
});

// 获取未映射的1688类目（有商品但 dxm_category 为空）
app.get('/api/dxm-category/unmapped', (req, res) => {
  const rows = getAll(`
    SELECT
      c.name,
      c.count as product_count,
      c.custom_name
    FROM categories c
    WHERE c.name != ''
    ORDER BY c.count DESC
  `);
  // 检查每个类目有多少商品缺 dxm_category
  const result = rows.map(r => {
    const unmapped = getOne(
      "SELECT COUNT(*) as cnt FROM products WHERE category LIKE ? AND (dxm_category IS NULL OR dxm_category = '')",
      ['%"' + r.name + '"%']
    );
    const total = getOne(
      "SELECT COUNT(*) as cnt FROM products WHERE category LIKE ?",
      ['%"' + r.name + '"%']
    );
    return {
      name: r.name,
      customName: r.custom_name || '',
      totalProducts: total ? total.cnt : 0,
      unmappedProducts: unmapped ? unmapped.cnt : 0
    };
  }).filter(r => r.unmappedProducts > 0);
  res.json(result);
});

// 搜索所有1688类目（含已映射），返回类目名+当前映射的店小秘类目
app.get('/api/dxm-category/search', (req, res) => {
  const keyword = (req.query.keyword || '').trim();
  let rows;
  if (keyword) {
    rows = getAll(
      "SELECT c.name, c.count as product_count FROM categories c WHERE c.name != '' AND c.name LIKE ? ORDER BY c.count DESC",
      ['%' + keyword + '%']
    );
  } else {
    rows = getAll(
      "SELECT c.name, c.count as product_count FROM categories c WHERE c.name != '' ORDER BY c.count DESC"
    );
  }
  const result = rows.map(r => {
    // 取该类目下第一个有 dxm_category 的商品的映射值
    const mapped = getOne(
      "SELECT dxm_category FROM products WHERE category LIKE ? AND dxm_category IS NOT NULL AND dxm_category != '' LIMIT 1",
      ['%"' + r.name + '"%']
    );
    const total = getOne(
      "SELECT COUNT(*) as cnt FROM products WHERE category LIKE ?",
      ['%"' + r.name + '"%']
    );
    const unmapped = getOne(
      "SELECT COUNT(*) as cnt FROM products WHERE category LIKE ? AND (dxm_category IS NULL OR dxm_category = '')",
      ['%"' + r.name + '"%']
    );
    let dxmCategory = null;
    if (mapped && mapped.dxm_category) {
      try { dxmCategory = JSON.parse(mapped.dxm_category); } catch (e) {}
    }
    return {
      name: r.name,
      totalProducts: total ? total.cnt : 0,
      unmappedProducts: unmapped ? unmapped.cnt : 0,
      dxmCategory: dxmCategory
    };
  });
  res.json(result);
});

// 重新映射：更新该类目下所有商品（包括已映射的）
app.post('/api/dxm-category/remap', (req, res) => {
  let { categoryName, dxmCategory } = req.body;
  if (!categoryName || !dxmCategory) return res.status(400).json({ error: 'Missing params' });
  categoryName = categoryName.trim();
  const cleanPath = (dxmCategory.path || '').replace(/\s+/g, '');
  const parts = cleanPath.split('/');
  const leafName = parts[parts.length - 1] || cleanPath;
  const dxmVal = JSON.stringify({ path: cleanPath, leafName: leafName });
  run("UPDATE products SET dxm_category = ?, updated_at = CURRENT_TIMESTAMP WHERE category LIKE ?",
    [dxmVal, '%"' + categoryName + '"%']);
  res.json({ ok: true });
});

// 智能匹配：对指定1688类目名，返回候选DXM类目
app.get('/api/dxm-category/match', (req, res) => {
  const categoryName = (req.query.name || '').trim();
  if (!categoryName) return res.json([]);

  const dxmRows = getAll('SELECT path, leaf_name, count FROM dxm_categories ORDER BY count DESC');
  const results = dxmRows.map(dxm => {
    // 提取倒数1-2级类目名用于匹配
    const pathParts = (dxm.path || '').split('/').filter(Boolean);
    const candidates = [];
    if (pathParts.length >= 1) candidates.push(pathParts[pathParts.length - 1]); // 倒数第1级
    if (pathParts.length >= 2) candidates.push(pathParts[pathParts.length - 2]); // 倒数第2级
    // 取最高分
    let bestScore = 0;
    for (const cand of candidates) {
      const s = calcMatchScore(categoryName, cand);
      if (s > bestScore) bestScore = s;
    }
    return { ...dxm, score: Math.round(bestScore * 100) / 100 };
  }).filter(r => r.score >= 30)
    .sort((a, b) => b.score - a.score);

  res.json(results);
});

// 确认映射
app.post('/api/dxm-category/confirm', (req, res) => {
  let { categoryName, dxmCategory } = req.body;
  if (!categoryName || !dxmCategory) return res.status(400).json({ error: 'Missing categoryName or dxmCategory' });
  categoryName = categoryName.trim();
  // 自动去空格
  const cleanPath = (dxmCategory.path || '').replace(/\s+/g, '');
  const parts = cleanPath.split('/');
  const leafName = parts[parts.length - 1] || cleanPath;
  const dxmVal = JSON.stringify({ path: cleanPath, leafName: leafName });
  run("UPDATE products SET dxm_category = ?, updated_at = CURRENT_TIMESTAMP WHERE category LIKE ? AND (dxm_category IS NULL OR dxm_category = '')",
    [dxmVal, '%"' + categoryName + '"%']);
  res.json({ ok: true });
});

// 匹配算法
function calcMatchScore(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 100;

  var charsA = a.split('');
  var charsB = b.split('');

  // 正向命中率：a 中有多少字符出现在 b 中
  var forwardHits = 0;
  for (var i = 0; i < charsA.length; i++) {
    if (charsB.indexOf(charsA[i]) !== -1) forwardHits++;
  }
  var forward = forwardHits / charsA.length;

  // 反向命中率：b 中有多少字符出现在 a 中
  var reverseHits = 0;
  for (var j = 0; j < charsB.length; j++) {
    if (charsA.indexOf(charsB[j]) !== -1) reverseHits++;
  }
  var reverse = reverseHits / charsB.length;

  // 最长公共子串占比
  var lcs = longestCommonSubstring(a, b);
  var lcsRatio = lcs / Math.max(charsA.length, charsB.length);

  // 综合得分
  return forward * 40 + reverse * 20 + lcsRatio * 40;
}

function longestCommonSubstring(a, b) {
  if (!a || !b) return 0;
  var maxLen = 0;
  for (var i = 0; i < a.length; i++) {
    for (var j = i + 1; j <= a.length; j++) {
      var sub = a.substring(i, j);
      if (b.indexOf(sub) !== -1 && sub.length > maxLen) {
        maxLen = sub.length;
      }
    }
  }
  return maxLen;
}

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
    dxmCategory: row.dxm_category ? JSON.parse(row.dxm_category) : null,
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
