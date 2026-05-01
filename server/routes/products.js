const { Router } = require('express');
const dbModule = require('../db');
const { run, getOne, getAll, scheduleSave, sseBroadcast, parseRow, treeGetOne } = dbModule;

const router = Router();

// 采集趋势
router.get('/product/trend', (req, res) => {
  const days = Math.min(90, Math.max(1, parseInt(req.query.days) || 7));
  const rows = getAll(
    `SELECT DATE(created_at) as date, COUNT(*) as count FROM products WHERE created_at >= DATE('now', '-' || ? || ' days') GROUP BY DATE(created_at) ORDER BY date`,
    [days]
  );
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
router.get('/product/stats', (req, res) => {
  const row = getOne('SELECT COUNT(*) as total, SUM(CASE WHEN status=0 THEN 1 ELSE 0 END) as unused, SUM(CASE WHEN status=1 THEN 1 ELSE 0 END) as used FROM products');
  const catRow = getOne('SELECT COUNT(*) as cnt FROM categories');
  res.json({
    total: row ? row.total : 0,
    unused: row ? row.unused || 0 : 0,
    used: row ? row.used || 0 : 0,
    totalCategories: catRow ? catRow.cnt : 0
  });
});

// 1688类目列表
router.get('/product/categories', (req, res) => {
  const rows = getAll('SELECT name FROM categories ORDER BY name');
  res.json(rows.map(r => r.name));
});

// 已映射的店小秘类目列表
router.get('/product/dxm-categories', (req, res) => {
  const rows = getAll("SELECT DISTINCT custom_category FROM category_mappings WHERE custom_category IS NOT NULL AND custom_category != '' ORDER BY custom_category");
  res.json(rows.map(r => r.custom_category));
});

// 类目偏好 Top10
router.get('/product/category-top', (req, res) => {
  const rows = getAll('SELECT name, count FROM categories ORDER BY count DESC LIMIT 10');
  res.json(rows);
});

// DXM类目统计 Top N（通过 category_mappings JOIN products + tree 取叶子名）
router.get('/product/dxm-category-top', (req, res) => {
  try {
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 10));
    const rows = getAll(
      `SELECT cm.custom_category as name, COUNT(*) as count
       FROM products p
       INNER JOIN category_mappings cm ON JSON_EXTRACT(p.category, '$.leafCategoryName') = cm.category_name
       WHERE cm.custom_category IS NOT NULL AND cm.custom_category != ''
       GROUP BY cm.custom_category ORDER BY count DESC`,
      []
    );
    // 解析叶子名并合并同名项（防止路径/名称重复）
    const merged = {};
    rows.forEach(r => {
      const treeRow = treeGetOne('SELECT cat_name FROM dxm_category_tree WHERE (cat_name = ? OR path = ?) AND is_leaf = 1 LIMIT 1', [r.name, r.name]);
      const leafName = treeRow ? treeRow.cat_name : r.name.split('/').pop();
      if (merged[leafName]) {
        merged[leafName].count += r.count;
      } else {
        merged[leafName] = { name: leafName, count: r.count };
      }
    });
    const result = Object.values(merged).sort((a, b) => b.count - a.count).slice(0, limit);
    res.json(result);
  } catch (e) {
    res.json([]);
  }
});

// 保存采集数据
router.post('/product', (req, res) => {
  const { sourceUrl, title, category, mainImages, descImages, detailImages, attrs, skus } = req.body;

  let customCategory = '';
  let dxmCategoryVal = '';
  if (category) {
    const catName = category.leafCategoryName || category.categoryPath;
    if (catName) {
      const mappingRow = getOne('SELECT custom_category FROM category_mappings WHERE category_name = ? ORDER BY id DESC LIMIT 1', [catName]);
      if (mappingRow && mappingRow.custom_category) {
        customCategory = mappingRow.custom_category;
      } else {
        const catRow = getOne('SELECT custom_name FROM categories WHERE name = ?', [catName]);
        if (catRow && catRow.custom_name) {
          customCategory = catRow.custom_name;
        }
      }
      const existing = getOne(
        "SELECT dxm_category FROM products WHERE category LIKE ? AND dxm_category IS NOT NULL AND dxm_category != '' LIMIT 1",
        ['%"' + catName + '"%']
      );
      if (existing && existing.dxm_category) {
        dxmCategoryVal = existing.dxm_category;
      }
    }
  }

  dbModule.db.run(
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
router.get('/product/check', (req, res) => {
  const offerId = (req.query.offerId || '').trim();
  if (!offerId) return res.json({ exists: false });
  const row = getOne('SELECT id, title, status FROM products WHERE source_url LIKE ? LIMIT 1', ['%' + offerId + '%']);
  if (row) {
    res.json({ exists: true, id: row.id, title: row.title, status: row.status });
  } else {
    res.json({ exists: false });
  }
});

// 商品列表（分页 + 搜索 + 筛选）
router.get('/product', (req, res) => {
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
    where.push("(custom_category IS NULL OR custom_category = '')");
  } else if (dxmCategory) {
    where.push('custom_category = ?');
    params.push(dxmCategory);
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

// 单条商品
router.get('/product/:id', (req, res) => {
  const row = getOne('SELECT * FROM products WHERE id = ?', [parseInt(req.params.id)]);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(parseRow(row));
});

// 更新商品
router.put('/product/:id', (req, res) => {
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

  // 保存映射关系（仅 customCategory，manualCategory 不进映射表）
  const product = getOne('SELECT category FROM products WHERE id = ?', [parseInt(req.params.id)]);
  if (req.body.customCategory && product && product.category) {
    try {
      const cat = JSON.parse(product.category);
      const catName = cat.leafCategoryName || cat.categoryPath;
      if (catName) {
        run('INSERT OR IGNORE INTO category_mappings (category_name, custom_category) VALUES (?, ?)', [catName, req.body.customCategory]);
      }
    } catch (e) {}
  }

  res.json({ ok: true });
});

// 删除商品
router.delete('/product/:id', (req, res) => {
  run('DELETE FROM products WHERE id = ?', [parseInt(req.params.id)]);
  res.json({ ok: true });
});

// 批量删除
router.post('/product/batch-delete', (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || !ids.length) return res.json({ ok: true, deleted: 0 });
  const placeholders = ids.map(() => '?').join(',');
  const before = getOne(`SELECT COUNT(*) as count FROM products WHERE id IN (${placeholders})`, ids);
  run(`DELETE FROM products WHERE id IN (${placeholders})`, ids);
  res.json({ ok: true, deleted: before ? before.count : 0 });
});

module.exports = router;
