const { Router } = require('express');
const { run, getOne, getAll, treeGetOne } = require('../db');
const cloudDb = require('../cloud-db');

const router = Router();

// 1688类目列表（带搜索、分页）
router.get('/categories', (req, res) => {
  const keyword = (req.query.keyword || '').trim();
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize) || 20));
  let where = '';
  let params = [];
  if (keyword) {
    where = 'WHERE name LIKE ?';
    params.push('%' + keyword + '%');
  }
  const countRow = getOne('SELECT COUNT(*) as cnt FROM categories ' + where, params);
  const total = countRow ? countRow.cnt : 0;
  const offset = (page - 1) * pageSize;
  const rows = getAll('SELECT name, cat_id, count FROM categories ' + where + ' ORDER BY count DESC, name LIMIT ? OFFSET ?', [...params, pageSize, offset]);
  res.json({ total, page, pageSize, list: rows.map(r => ({ name: r.name, catId: r.cat_id || '', count: r.count || 0 })) });
});

// 搜索映射（带商品数量统计）
router.get('/category-mappings', (req, res) => {
  const keyword = (req.query.keyword || '').trim();
  let rows;
  if (keyword) {
    rows = getAll('SELECT id, category_name, custom_category FROM category_mappings WHERE category_name LIKE ? OR custom_category LIKE ? ORDER BY category_name', ['%' + keyword + '%', '%' + keyword + '%']);
  } else {
    rows = getAll('SELECT id, category_name, custom_category FROM category_mappings ORDER BY category_name');
  }
  const result = rows.map(r => {
    const cnt = getOne(
      "SELECT COUNT(*) as cnt FROM products WHERE JSON_EXTRACT(category, '$.leafCategoryName') = ? AND custom_category = ?",
      [r.category_name, r.custom_category]
    );
    return { id: r.id, categoryName: r.category_name, customCategory: r.custom_category, productCount: cnt ? cnt.cnt : 0 };
  });
  res.json(result);
});

// 按1688类目查映射
router.get('/category-mappings/by-name', (req, res) => {
  const categoryName = (req.query.name || '').trim();
  if (!categoryName) return res.json([]);
  const rows = getAll('SELECT id, custom_category FROM category_mappings WHERE category_name = ? ORDER BY id', [categoryName]);
  res.json(rows.map(r => ({ id: r.id, customCategory: r.custom_category })));
});

// 按DXM类目查映射（带商品数量）
router.get('/category-mappings/by-dxm', (req, res) => {
  const dxmName = (req.query.name || '').trim();
  if (!dxmName) return res.json([]);
  const rows = getAll('SELECT id, category_name FROM category_mappings WHERE custom_category = ? ORDER BY id', [dxmName]);
  const result = rows.map(r => {
    const cnt = getOne(
      "SELECT COUNT(*) as cnt FROM products WHERE JSON_EXTRACT(category, '$.leafCategoryName') = ? AND custom_category = ?",
      [r.category_name, dxmName]
    );
    return { id: r.id, categoryName: r.category_name, productCount: cnt ? cnt.cnt : 0 };
  });
  res.json(result);
});

// 分组列表（带商品数量统计）
router.get('/category-mappings/grouped', (req, res) => {
  const keyword = (req.query.keyword || '').trim();
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
    const cnt = getOne(
      "SELECT COUNT(*) as cnt FROM products WHERE JSON_EXTRACT(category, '$.leafCategoryName') = ? AND custom_category = ?",
      [r.category_name, r.custom_category]
    );
    const count = cnt ? cnt.cnt : 0;
    groups[key].aliCategories.push({ id: r.id, categoryName: r.category_name, productCount: count });
    groups[key].productCount += count;
  });
  const result = Object.values(groups);
  result.forEach(g => {
    const treeRow = treeGetOne('SELECT path FROM dxm_category_tree WHERE cat_name = ? AND is_leaf = 1 LIMIT 1', [g.customCategory]);
    g.path = treeRow ? treeRow.path : g.customCategory;
  });
  res.json(result);
});

// 删除整个DXM类目映射（必须在 :id 之前）
router.delete('/category-mappings/dxm/:name', (req, res) => {
  const dxmName = decodeURIComponent(req.params.name);
  const bound = getAll("SELECT category_name FROM category_mappings WHERE custom_category = ?", [dxmName]);
  run("DELETE FROM category_mappings WHERE custom_category = ?", [dxmName]);
  bound.forEach(r => {
    run("UPDATE products SET custom_category = '' WHERE category LIKE ?", ['%"' + r.category_name + '"%']);
  });
  if (cloudDb.connected) {
    cloudDb.cloudRun("DELETE FROM category_mappings WHERE custom_category = ?", [dxmName]).catch(function () {});
  }
  res.json({ ok: true });
});

// 删除单条映射
router.delete('/category-mappings/:id', (req, res) => {
  run('DELETE FROM category_mappings WHERE id = ?', [parseInt(req.params.id)]);
  if (cloudDb.connected) {
    cloudDb.cloudRun('DELETE FROM category_mappings WHERE id = ?', [parseInt(req.params.id)]).catch(function () {});
  }
  res.json({ ok: true });
});

// 新增映射（已存在则跳过）
router.post('/category-mappings', (req, res) => {
  const { categoryName, customCategory } = req.body;
  if (!categoryName || !customCategory) return res.status(400).json({ error: '参数不完整' });
  try {
    const existing = getOne('SELECT id FROM category_mappings WHERE category_name = ? AND custom_category = ?', [categoryName, customCategory]);
    if (!existing) {
      run('INSERT INTO category_mappings (category_name, custom_category, count, source) VALUES (?, ?, 1, \'manual\')', [categoryName, customCategory]);
      if (cloudDb.connected) {
        cloudDb.cloudRun('INSERT OR IGNORE INTO category_mappings (category_name, custom_category, count, source) VALUES (?, ?, 1, ?)', [categoryName, customCategory, 'manual']).catch(function () {});
      }
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== 已有数据回填关键词关联库 =====
router.post('/keyword-rels/rebuild', (req, res) => {
  console.log('[关联库回填] 开始从已有商品学习...');
  var products = getAll("SELECT title, category, custom_category FROM products WHERE custom_category IS NOT NULL AND custom_category != ''");
  if (!products.length) return res.json({ ok: true, learned: 0, message: '无可回填商品' });

  var aiModule = require('./ai');
  var learned = 0;
  var errors = 0;
  products.forEach(function (p) {
    try {
      var cat = JSON.parse(p.category || '{}');
      var aliCat = cat.leafCategoryName || cat.categoryPath || '';
      var keywords = aiModule.extractSearchKeywordsPublic(p.title || '', aliCat);
      if (keywords.length && p.custom_category) {
        aiModule.learnKeywordCategoryRelPublic(keywords, p.custom_category, 'rebuild', 0.8);
        learned++;
      }
    } catch (e) {
      errors++;
    }
  });

  // 同时从映射表学习
  var mappings = getAll("SELECT category_name FROM category_mappings WHERE source = 'manual'");
  mappings.forEach(function (m) {
    try {
      var keywords = aiModule.extractSearchKeywordsPublic('', m.category_name);
      // 映射表的手动映射关联权重高
    } catch (e) {}
  });

  console.log('[关联库回填] 完成, 学习:', learned, '条, 失败:', errors);
  res.json({ ok: true, learned: learned, errors: errors, total: products.length });
});

// ===== 关键词-类目关联库管理 =====

// 查看关联库（带搜索、分页）
router.get('/keyword-rels', (req, res) => {
  const keyword = (req.query.keyword || '').trim();
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize) || 20));
  let where = 'WHERE valid = 1';
  let params = [];
  if (keyword) {
    where += ' AND (keyword LIKE ? OR category_name LIKE ?)';
    params.push('%' + keyword + '%', '%' + keyword + '%');
  }
  const countRow = getOne('SELECT COUNT(*) as cnt FROM keyword_category_rel ' + where, params);
  const total = countRow ? countRow.cnt : 0;
  const offset = (page - 1) * pageSize;
  const rows = getAll(
    'SELECT id, keyword, category_name, weight, match_count, source, updated_at FROM keyword_category_rel ' + where + ' ORDER BY weight DESC, match_count DESC LIMIT ? OFFSET ?',
    [...params, pageSize, offset]
  );
  res.json({ total, page, pageSize, list: rows });
});

// 标记关联为无效
router.delete('/keyword-rels/:id', (req, res) => {
  run('UPDATE keyword_category_rel SET valid = 0 WHERE id = ?', [parseInt(req.params.id)]);
  if (cloudDb.connected) {
    cloudDb.cloudRun('UPDATE keyword_category_rel SET valid = 0 WHERE id = ?', [parseInt(req.params.id)]).catch(function () {});
  }
  res.json({ ok: true });
});

// 批量删除（标记无效）关联
router.post('/keyword-rels/batch-invalidate', (req, res) => {
  const ids = req.body.ids;
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: '请提供ids数组' });
  ids.forEach(id => {
    run('UPDATE keyword_category_rel SET valid = 0 WHERE id = ?', [parseInt(id)]);
    if (cloudDb.connected) {
      cloudDb.cloudRun('UPDATE keyword_category_rel SET valid = 0 WHERE id = ?', [parseInt(id)]).catch(function () {});
    }
  });
  res.json({ ok: true });
});

// ===== 同义词管理 =====

// 查看同义词列表
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

// 新增同义词
router.post('/keyword-synonyms', (req, res) => {
  const { wordA, wordB } = req.body;
  if (!wordA || !wordB) return res.status(400).json({ error: '请提供wordA和wordB' });
  try {
    run('INSERT OR IGNORE INTO keyword_synonyms (word_a, word_b) VALUES (?, ?)', [wordA, wordB]);
    if (cloudDb.connected) {
      cloudDb.cloudRun('INSERT OR IGNORE INTO keyword_synonyms (word_a, word_b) VALUES (?, ?)', [wordA, wordB]).catch(function () {});
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 删除同义词
router.delete('/keyword-synonyms/:id', (req, res) => {
  run('DELETE FROM keyword_synonyms WHERE id = ?', [parseInt(req.params.id)]);
  if (cloudDb.connected) {
    cloudDb.cloudRun('DELETE FROM keyword_synonyms WHERE id = ?', [parseInt(req.params.id)]).catch(function () {});
  }
  res.json({ ok: true });
});

// ===== 关键词违禁关联黑名单 =====

// 查看黑名单
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

// 新增黑名单
router.post('/keyword-blacklist', (req, res) => {
  const { keyword, categoryName, reason } = req.body;
  if (!keyword || !categoryName) return res.status(400).json({ error: '请提供keyword和categoryName' });
  try {
    run('INSERT OR IGNORE INTO keyword_blacklist (keyword, category_name, reason) VALUES (?, ?, ?)', [keyword, categoryName, reason || '']);
    if (cloudDb.connected) {
      cloudDb.cloudRun('INSERT OR IGNORE INTO keyword_blacklist (keyword, category_name, reason) VALUES (?, ?, ?)', [keyword, categoryName, reason || '']).catch(function () {});
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 删除黑名单
router.delete('/keyword-blacklist/:id', (req, res) => {
  run('DELETE FROM keyword_blacklist WHERE id = ?', [parseInt(req.params.id)]);
  if (cloudDb.connected) {
    cloudDb.cloudRun('DELETE FROM keyword_blacklist WHERE id = ?', [parseInt(req.params.id)]).catch(function () {});
  }
  res.json({ ok: true });
});

module.exports = router;
