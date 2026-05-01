const { Router } = require('express');
const { run, getOne, getAll, treeGetOne } = require('../db');

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

// 搜索映射
router.get('/category-mappings', (req, res) => {
  const keyword = (req.query.keyword || '').trim();
  let rows;
  if (keyword) {
    rows = getAll('SELECT id, category_name, custom_category FROM category_mappings WHERE category_name LIKE ? OR custom_category LIKE ? ORDER BY category_name', ['%' + keyword + '%', '%' + keyword + '%']);
  } else {
    rows = getAll('SELECT id, category_name, custom_category FROM category_mappings ORDER BY category_name');
  }
  res.json(rows.map(r => ({ id: r.id, categoryName: r.category_name, customCategory: r.custom_category })));
});

// 按1688类目查映射
router.get('/category-mappings/by-name', (req, res) => {
  const categoryName = (req.query.name || '').trim();
  if (!categoryName) return res.json([]);
  const rows = getAll('SELECT id, custom_category FROM category_mappings WHERE category_name = ? ORDER BY id', [categoryName]);
  res.json(rows.map(r => ({ id: r.id, customCategory: r.custom_category })));
});

// 按DXM类目查映射
router.get('/category-mappings/by-dxm', (req, res) => {
  const dxmName = (req.query.name || '').trim();
  if (!dxmName) return res.json([]);
  const rows = getAll('SELECT id, category_name FROM category_mappings WHERE custom_category = ? ORDER BY id', [dxmName]);
  res.json(rows.map(r => ({ id: r.id, categoryName: r.category_name })));
});

// 分组列表
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
    if (!groups[key]) groups[key] = { customCategory: key, path: '', aliCategories: [] };
    groups[key].aliCategories.push({ id: r.id, categoryName: r.category_name });
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
  res.json({ ok: true });
});

// 删除单条映射
router.delete('/category-mappings/:id', (req, res) => {
  run('DELETE FROM category_mappings WHERE id = ?', [parseInt(req.params.id)]);
  res.json({ ok: true });
});

// 新增映射
router.post('/category-mappings', (req, res) => {
  const { categoryName, customCategory } = req.body;
  if (!categoryName || !customCategory) return res.status(400).json({ error: '参数不完整' });
  try {
    run('INSERT OR IGNORE INTO category_mappings (category_name, custom_category) VALUES (?, ?)', [categoryName, customCategory]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
