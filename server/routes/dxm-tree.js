const { Router } = require('express');
const { treeRun, treeGetOne, treeGetAll } = require('../db');

const router = Router();

// 收集店小秘类目
router.post('/dxm-category/collect', (req, res) => {
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

// 批量同步分类节点
router.post('/dxm-tree/sync', (req, res) => {
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

// 子级分类
router.get('/dxm-tree/children', (req, res) => {
  const parentId = parseInt(req.query.parentId) || 0;
  const rows = treeGetAll('SELECT cat_id, cat_name, parent_cat_id, cat_level, is_leaf, path FROM dxm_category_tree WHERE parent_cat_id = ? GROUP BY cat_name ORDER BY cat_name', [parentId]);
  res.json(rows.map(r => ({
    catId: r.cat_id, catName: r.cat_name, parentCatId: r.parent_cat_id,
    catLevel: r.cat_level, isLeaf: r.is_leaf, path: r.path
  })));
});

// 同步状态
router.get('/dxm-tree/status', (req, res) => {
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
router.get('/dxm-tree/root-status', (req, res) => {
  const roots = treeGetAll('SELECT cat_id, cat_name, path, sync_at FROM dxm_category_tree WHERE parent_cat_id = 0 ORDER BY cat_name');
  const result = roots.map(r => {
    const cnt = treeGetOne('SELECT COUNT(*) as c FROM dxm_category_tree WHERE path LIKE ?', [r.path + '%']);
    return { catId: r.cat_id, catName: r.cat_name, count: cnt ? cnt.c : 0, lastSync: r.sync_at };
  });
  res.json(result);
});

// 搜索分类（只返回叶子）
router.get('/dxm-tree/search', (req, res) => {
  const keyword = (req.query.keyword || '').trim();
  if (!keyword) return res.json([]);
  const rows = treeGetAll('SELECT cat_id, cat_name, path, is_leaf FROM dxm_category_tree WHERE is_leaf = 1 AND cat_name LIKE ? ORDER BY cat_level, cat_name', ['%' + keyword + '%']);
  res.json(rows.map(r => ({ catId: r.cat_id, catName: r.cat_name, path: r.path, isLeaf: r.is_leaf })));
});

// 根据叶子名称查找路径
router.get('/dxm-tree/resolve-path', (req, res) => {
  const name = (req.query.name || '').trim();
  if (!name) return res.json({ path: '' });
  const row = treeGetOne('SELECT path FROM dxm_category_tree WHERE cat_name = ? AND is_leaf = 1 LIMIT 1', [name]);
  res.json({ path: row ? row.path : '' });
});

module.exports = router;
