const { Router } = require('express');
const { run, getOne, getAll, treeGetOne, scheduleSave } = require('../db');
const cloudDb = require('../cloud/index');

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

// 搜索映射（带商品数量统计）— 批量聚合查询避免 N+1
router.get('/category-mappings', (req, res) => {
  const keyword = (req.query.keyword || '').trim();
  let rows;
  if (keyword) {
    rows = getAll('SELECT id, category_name, custom_category FROM category_mappings WHERE category_name LIKE ? OR custom_category LIKE ? ORDER BY category_name', ['%' + keyword + '%', '%' + keyword + '%']);
  } else {
    rows = getAll('SELECT id, category_name, custom_category FROM category_mappings ORDER BY category_name');
  }
  // 批量聚合：一次查询获取所有映射的商品数量（兼容 leafCategoryName 和 categoryPath）
  const countRows = getAll("SELECT COALESCE(JSON_EXTRACT(category, '$.leafCategoryName'), JSON_EXTRACT(category, '$.categoryPath')) as cat_name, custom_category, COUNT(*) as cnt FROM products WHERE deleted = 0 AND custom_category IS NOT NULL AND custom_category != '' GROUP BY cat_name, custom_category");
  const countMap = {};
  countRows.forEach(r => {
    if (r.cat_name && r.custom_category) {
      countMap[r.cat_name + '|' + r.custom_category] = r.cnt;
    }
  });
  const result = rows.map(r => {
    const count = countMap[r.category_name + '|' + r.custom_category] || 0;
    return { id: r.id, categoryName: r.category_name, customCategory: r.custom_category, productCount: count };
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

// 按DXM类目查映射（带商品数量）— 批量聚合
router.get('/category-mappings/by-dxm', (req, res) => {
  const dxmName = (req.query.name || '').trim();
  if (!dxmName) return res.json([]);
  const rows = getAll('SELECT id, category_name FROM category_mappings WHERE custom_category = ? ORDER BY id', [dxmName]);
  // 批量聚合该 DXM 类目下的商品数量
  const countRows = getAll("SELECT JSON_EXTRACT(category, '$.leafCategoryName') as cat_name, COUNT(*) as cnt FROM products WHERE deleted = 0 AND custom_category = ? GROUP BY cat_name", [dxmName]);
  const countMap = {};
  countRows.forEach(r => { if (r.cat_name) countMap[r.cat_name] = r.cnt; });
  const result = rows.map(r => {
    return { id: r.id, categoryName: r.category_name, productCount: countMap[r.category_name] || 0 };
  });
  res.json(result);
});

// 分组列表（带商品数量统计、分页）
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
  // 批量聚合：避免 N+1 查询（兼容 leafCategoryName 和 categoryPath）
  const countRows = getAll("SELECT COALESCE(JSON_EXTRACT(category, '$.leafCategoryName'), JSON_EXTRACT(category, '$.categoryPath')) as cat_name, custom_category, COUNT(*) as cnt FROM products WHERE deleted = 0 AND custom_category IS NOT NULL AND custom_category != '' GROUP BY cat_name, custom_category");
  const countMap = {};
  countRows.forEach(r => {
    if (r.cat_name && r.custom_category) {
      countMap[r.cat_name + '|' + r.custom_category] = r.cnt;
    }
  });
  const groups = {};
  rows.forEach(r => {
    const key = r.custom_category;
    if (!groups[key]) groups[key] = { customCategory: key, path: '', aliCategories: [], productCount: 0 };
    const count = countMap[r.category_name + '|' + r.custom_category] || 0;
    groups[key].aliCategories.push({ id: r.id, categoryName: r.category_name, productCount: count });
    groups[key].productCount += count;
  });
  const result = Object.values(groups);
  result.forEach(g => {
    const treeRow = treeGetOne('SELECT path FROM dxm_category_tree WHERE cat_name = ? AND is_leaf = 1 LIMIT 1', [g.customCategory]);
    g.path = treeRow ? treeRow.path : g.customCategory;
    // 统计该类目下缺少路径的商品数
    const missRow = getOne("SELECT COUNT(*) as cnt FROM products WHERE custom_category = ? AND (manual_category IS NULL OR manual_category = '') AND deleted = 0", [g.customCategory]);
    g.missingPathCount = missRow ? missRow.cnt : 0;
  });
  const total = result.length;
  const paged = result.slice(offset, offset + pageSize);
  res.json({ list: paged, total: total, page: page, pageSize: pageSize });
});

// 清空通过映射分类的产品（同时清 custom_category, manual_category, dxm_category）
function clearProductsByMapping(categoryName, customCategory) {
  if (!categoryName || !customCategory) return 0;
  // 使用 JSON_EXTRACT 精确匹配，避免 LIKE 模式依赖 JSON 格式假设
  var rows = getAll(
    "SELECT id FROM products WHERE COALESCE(JSON_EXTRACT(category, '$.leafCategoryName'), JSON_EXTRACT(category, '$.categoryPath')) = ? AND custom_category = ?",
    [categoryName, customCategory]
  );
  if (!rows.length) return 0;
  run(
    "UPDATE products SET custom_category = '', manual_category = '', dxm_category = '' WHERE COALESCE(JSON_EXTRACT(category, '$.leafCategoryName'), JSON_EXTRACT(category, '$.categoryPath')) = ? AND custom_category = ?",
    [categoryName, customCategory]
  );
  scheduleSave();
  return rows.length;
}

// 删除整个DXM类目映射（必须在 :id 之前）
router.delete('/category-mappings/dxm/:name', (req, res) => {
  const dxmName = decodeURIComponent(req.params.name);
  const bound = getAll("SELECT category_name FROM category_mappings WHERE custom_category = ?", [dxmName]);
  run("DELETE FROM category_mappings WHERE custom_category = ?", [dxmName]);
  var cleared = 0;
  bound.forEach(r => {
    cleared += clearProductsByMapping(r.category_name, dxmName);
  });
  if (cloudDb.connected) {
    bound.forEach(r => {
      cloudDb.cloudRun("DELETE FROM category_mappings WHERE category_name = ? AND custom_category = ?", [r.category_name, dxmName]).catch(function () {});
    });
  }
  res.json({ ok: true, cleared: cleared });
});

// 删除单条映射
router.delete('/category-mappings/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const mapping = getOne('SELECT category_name, custom_category FROM category_mappings WHERE id = ?', [id]);
  var cleared = 0;
  if (mapping) {
    cleared = clearProductsByMapping(mapping.category_name, mapping.custom_category);
  }
  run('DELETE FROM category_mappings WHERE id = ?', [id]);
  if (cloudDb.connected && mapping) {
    cloudDb.cloudRun('DELETE FROM category_mappings WHERE category_name = ? AND custom_category = ?', [mapping.category_name, mapping.custom_category]).catch(function () {});
  }
  res.json({ ok: true, cleared: cleared });
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

  var learned = 0;
  var errors = 0;
  products.forEach(function (p) {
    try {
      var cat = JSON.parse(p.category || '{}');
      var aliCat = cat.leafCategoryName || cat.categoryPath || '';
      if (aliCat && p.custom_category) {
        learned++;
      }
    } catch (e) {
      errors++;
    }
  });

  // 同时统计映射表
  var mappings = getAll("SELECT category_name FROM category_mappings WHERE source = 'manual'");
  learned += mappings.length;

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
  const id = parseInt(req.params.id);
  const rel = getOne('SELECT keyword, category_name FROM keyword_category_rel WHERE id = ?', [id]);
  run('UPDATE keyword_category_rel SET valid = 0 WHERE id = ?', [id]);
  if (cloudDb.connected && rel) {
    cloudDb.cloudRun('UPDATE keyword_category_rel SET valid = 0 WHERE keyword = ? AND category_name = ?', [rel.keyword, rel.category_name]).catch(function () {});
  }
  res.json({ ok: true });
});

// 批量删除（标记无效）关联
router.post('/keyword-rels/batch-invalidate', (req, res) => {
  const ids = req.body.ids;
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: '请提供ids数组' });
  ids.forEach(id => {
    var rel = getOne('SELECT keyword, category_name FROM keyword_category_rel WHERE id = ?', [parseInt(id)]);
    run('UPDATE keyword_category_rel SET valid = 0 WHERE id = ?', [parseInt(id)]);
    if (cloudDb.connected && rel) {
      cloudDb.cloudRun('UPDATE keyword_category_rel SET valid = 0 WHERE keyword = ? AND category_name = ?', [rel.keyword, rel.category_name]).catch(function () {});
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
  const id = parseInt(req.params.id);
  const syn = getOne('SELECT word_a, word_b FROM keyword_synonyms WHERE id = ?', [id]);
  run('DELETE FROM keyword_synonyms WHERE id = ?', [id]);
  if (cloudDb.connected && syn) {
    cloudDb.cloudRun('DELETE FROM keyword_synonyms WHERE word_a = ? AND word_b = ?', [syn.word_a, syn.word_b]).catch(function () {});
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
  const id = parseInt(req.params.id);
  const bl = getOne('SELECT keyword, category_name FROM keyword_blacklist WHERE id = ?', [id]);
  run('DELETE FROM keyword_blacklist WHERE id = ?', [id]);
  if (cloudDb.connected && bl) {
    cloudDb.cloudRun('DELETE FROM keyword_blacklist WHERE keyword = ? AND category_name = ?', [bl.keyword, bl.category_name]).catch(function () {});
  }
  res.json({ ok: true });
});

// ===== 分类配置管理（过滤词/互斥组/泛词）=====
var categoryRecommend = require('./ai/index');

// 获取分类配置（按类型）
router.get('/category-config', function (req, res) {
  var type = (req.query.type || '').trim();
  if (type) {
    cloudDb.getCategoryConfig(type).then(function (rows) {
      res.json({ ok: true, list: rows || [] });
    }).catch(function (e) {
      res.status(500).json({ error: e.message });
    });
  } else {
    cloudDb.getAllCategoryConfig().then(function (rows) {
      res.json({ ok: true, list: rows || [] });
    }).catch(function (e) {
      res.status(500).json({ error: e.message });
    });
  }
});

// 保存分类配置项
router.post('/category-config', function (req, res) {
  var type = (req.body.type || '').trim();
  var value = (req.body.value || '').trim();
  var groupName = (req.body.group_name || '').trim();
  var description = (req.body.description || '').trim();
  var sortOrder = parseInt(req.body.sort_order) || 0;

  if (!type || !value) return res.status(400).json({ error: 'type 和 value 必填' });

  cloudDb.saveCategoryConfig(type, value, groupName, description, sortOrder).catch(function (e) {
    console.log('[分类配置] 保存失败:', e.message);
  });
  categoryRecommend.clearConfigCache();

  res.json({ ok: true, type: type, value: value });
});

// 删除分类配置项
router.delete('/category-config/:id', function (req, res) {
  var id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ error: '无效 ID' });

  cloudDb.deleteCategoryConfig(id).catch(function (e) {
    console.log('[分类配置] 删除失败:', e.message);
  });
  categoryRecommend.clearConfigCache();

  res.json({ ok: true });
});

module.exports = router;
