const { Router } = require('express');
const dbModule = require('../db');
const { run, getOne, getAll, scheduleSave, saveNow, sseBroadcast, parseRow, treeGetOne } = dbModule;
const cloudDb = require('../cloud/index');
const auth = require('../middleware/auth');
const opOnly = auth.requireRole('operator', 'admin');

function localNow() {
  var d = new Date();
  var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
}

const router = Router();

// 公共：插入商品到数据库
function insertProduct(sourceUrl, title, category, customCategory, dxmCategory, manualCategory, mainImages, descImages, detailImages, attrs, skus, owner) {
  var now = localNow();
  var uid = dbModule.generateUid();
  var productOwner = owner || '';
  var claimAt = productOwner ? now : '';
  dbModule.db.run(
    `INSERT INTO products (uid, source_url, title, category, custom_category, dxm_category, manual_category, main_images, desc_images, detail_images, attrs, skus, owner, claim_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      uid, sourceUrl || '', title || '', JSON.stringify(category || {}),
      customCategory || '', dxmCategory || '', manualCategory || '',
      JSON.stringify(mainImages || []), JSON.stringify(descImages || []),
      JSON.stringify(detailImages || []), JSON.stringify(attrs || []), JSON.stringify(skus || []),
      productOwner, claimAt, now, now
    ]
  );
  // 异步同步到云端
  cloudDb.saveProductToLocalAndCloud(
    uid, sourceUrl, title, JSON.stringify(category || {}), customCategory || '', dxmCategory || '',
    manualCategory || '', now,
    JSON.stringify(mainImages || []), JSON.stringify(descImages || []),
    JSON.stringify(detailImages || []), JSON.stringify(attrs || []), JSON.stringify(skus || []),
    productOwner || ''
  );
  return getOne('SELECT last_insert_rowid() as id');
}

// 公共：更新类目统计和映射
function updateCategoryStats(category, customCategory) {
  if (!category) return;
  const catName = category.leafCategoryName || category.categoryPath;
  if (!catName) return;
  const existing = getOne('SELECT id, count FROM categories WHERE name = ?', [catName]);
  if (existing) {
    run('UPDATE categories SET count = count + 1 WHERE name = ?', [catName]);
  } else {
    run('INSERT INTO categories (name, cat_id, leaf_category_id, top_category_id, post_category_id) VALUES (?, ?, ?, ?, ?)',
      [catName, category.catId || '', category.leafCategoryId || '', category.topCategoryId || '', category.postCategoryId || '']);
  }
  if (customCategory) {
    run(`INSERT OR IGNORE INTO category_mappings (category_name, custom_category, created_at, updated_at) VALUES (?, ?, datetime('now', '+8 hours'), datetime('now', '+8 hours'))`, [catName, customCategory]);
    if (cloudDb.connected) {
      cloudDb.cloudRun(`INSERT OR IGNORE INTO category_mappings (category_name, custom_category, count, source, created_at, updated_at) VALUES (?, ?, 1, ?, datetime('now', '+8 hours'), datetime('now', '+8 hours'))`, [catName, customCategory, 'auto']).catch(function () {});
    }
  }
}

// 采集趋势
router.get('/product/trend', (req, res) => {
  const days = Math.min(90, Math.max(1, parseInt(req.query.days) || 7));
  const rows = getAll(
    `SELECT DATE(created_at) as date, COUNT(*) as count FROM products WHERE deleted = 0 AND created_at >= DATE('now', '-' || ? || ' days') GROUP BY DATE(created_at) ORDER BY date`,
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
  // 显式传 scope=mine → 仅当前用户的商品；不传或 scope=all → 全部（保持向后兼容）
  var scope = req.query.scope;
  var ownerClause = '';
  var params = [];
  if (scope === 'mine') {
    ownerClause = 'AND owner = ?';
    params.push(req.user ? req.user.username : '');
  }
  const row = getOne('SELECT COUNT(*) as total, SUM(CASE WHEN status=0 THEN 1 ELSE 0 END) as unused, SUM(CASE WHEN status=1 THEN 1 ELSE 0 END) as used FROM products WHERE deleted = 0 ' + ownerClause, params);
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
  const rows = getAll("SELECT DISTINCT custom_category FROM category_mappings WHERE deleted = 0 AND custom_category IS NOT NULL AND custom_category != '' ORDER BY custom_category");
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
       WHERE cm.custom_category IS NOT NULL AND cm.custom_category != '' AND p.deleted = 0
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
router.post('/product', opOnly, (req, res) => {
  const { sourceUrl, title, category, mainImages, descImages, detailImages, attrs, skus } = req.body;
  const owner = (req.user && req.user.username) || '';

  let customCategory = '';
  let dxmCategoryVal = '';
  let manualCategoryFromExisting = '';
  if (category) {
    const catName = category.leafCategoryName || category.categoryPath;
    if (catName) {
      const mappingRow = getOne('SELECT custom_category FROM category_mappings WHERE category_name = ? AND deleted = 0 ORDER BY id DESC LIMIT 1', [catName]);
      if (mappingRow && mappingRow.custom_category) {
        customCategory = mappingRow.custom_category;
      } else {
        const catRow = getOne('SELECT custom_name FROM categories WHERE name = ?', [catName]);
        if (catRow && catRow.custom_name) {
          customCategory = catRow.custom_name;
        }
      }
      // 优先从已有商品复用路径
      const existing = getOne(
        "SELECT dxm_category, manual_category FROM products WHERE category LIKE ? AND dxm_category IS NOT NULL AND dxm_category != '' LIMIT 1",
        ['%"' + catName + '"%']
      );
      if (existing && existing.dxm_category) {
        dxmCategoryVal = existing.dxm_category;
        manualCategoryFromExisting = existing.manual_category || '';
      }
      // 如果没有复用到路径，从分类树查找
      if (customCategory && !manualCategoryFromExisting) {
        const treeRow = treeGetOne('SELECT path FROM dxm_category_tree WHERE cat_name = ? AND is_leaf = 1 LIMIT 1', [customCategory]);
        if (treeRow && treeRow.path) {
          dxmCategoryVal = JSON.stringify({ path: treeRow.path, leafName: customCategory });
          manualCategoryFromExisting = treeRow.path;
        }
      }
    }
  }

  var aliCat = category ? (category.leafCategoryName || category.categoryPath || '') : '';
  var needRecommend = !customCategory && !dxmCategoryVal && title;

  var recommendPromise = needRecommend
    ? doRecommendAndGetResult(title, aliCat, attrs, mainImages && mainImages[0] ? mainImages[0] : '')
    : Promise.resolve(null);

  var manualCategoryVal = manualCategoryFromExisting;

  recommendPromise.then(function (recResult) {
    if (recResult && recResult.category && recResult.confidence >= 0.5) {
      customCategory = recResult.category;
      if (recResult.path) {
        dxmCategoryVal = JSON.stringify({ path: recResult.path, leafName: recResult.category });
        manualCategoryVal = recResult.path;
      }
    }

    const row = insertProduct(sourceUrl, title, category, customCategory, dxmCategoryVal, manualCategoryVal, mainImages, descImages, detailImages, attrs, skus, owner);
    updateCategoryStats(category, customCategory);

    // 自动保存映射
    if (aliCat && customCategory && recResult && recResult.confidence >= 0.7) {
      cloudDb.saveMapping(aliCat, customCategory, 'auto');
    }

    scheduleSave();
    sseBroadcast('product-added', { id: row.id, title: title || '', customCategory: customCategory });

    console.log('[采集] 产品#' + row.id + ' 入库完成, 分类: ' + (customCategory || '无') + ', 来源: ' + (recResult ? recResult.source : '映射'));
    res.json({ ok: true, id: row.id, recommendation: recResult, customCategory: customCategory });
  }).catch(function (err) {
    console.error('[采集] 推荐失败，不带分类入库:', err.message);
    const row = insertProduct(sourceUrl, title, category, '', '', '', mainImages, descImages, detailImages, attrs, skus, owner);
    updateCategoryStats(category, '');
    scheduleSave();
    sseBroadcast('product-added', { id: row.id, title: title || '' });
    res.json({ ok: true, id: row.id, recommendation: null });
  });
});

// 公共：本地 HTTP POST 请求（Promise 包装）
// 注入 x-internal-call: 1 头，配合 authMiddleware 旁路（仅本机回环可触发）
function localPost(path, body, timeoutMs) {
  return new Promise(function (resolve) {
    var httpMod = require('http');
    var postData = JSON.stringify(body);
    var reqOpts = {
      hostname: 'localhost', port: 3000, path: path,
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData), 'X-Internal-Call': '1' }
    };
    var timer = setTimeout(function () { req.destroy(); resolve(null); }, timeoutMs || 60000);
    var req = httpMod.request(reqOpts, function (res) {
      var data = '';
      res.on('data', function (c) { data += c; });
      res.on('end', function () { clearTimeout(timer); resolve(data); });
    });
    req.on('error', function (e) { clearTimeout(timer); resolve(null); });
    req.write(postData);
    req.end();
  });
}

// 调用推荐API，只返回结果不写数据库
async function doRecommendAndGetResult(title, aliCat, attrs, imageUrl) {
  console.log('[采集推荐] 标题:', title, '1688类目:', aliCat, imageUrl ? '含主图' : '');
  var body = await localPost('/api/ai/suggest-category', { title: title, ali_category: aliCat, attrs: attrs || [], image_url: imageUrl || '' });
  if (!body) return null;
  try {
    var result = JSON.parse(body);
    if (!result.ok || !result.category || result.confidence < 0.5) {
      console.log('[采集推荐] 无结果 confidence=' + (result.confidence || 0) + ' source=' + (result.source || ''));
      return null;
    }
    console.log('[采集推荐] ✅ ' + result.category + ' 置信度:' + result.confidence.toFixed(2) + ' 来源:' + result.source);
    return { category: result.category, path: result.path, confidence: result.confidence, source: result.source };
  } catch (e) {
    console.error('[采集推荐] 解析失败:', e.message);
    return null;
  }
}

// 同步推荐 + 保存结果 + 自动映射（手动触发时使用）
async function doRecommendAndSave(title, aliCat, attrs, productId, imageUrl) {
  console.log('[采集推荐] ========== 产品#' + productId + ' 开始推荐 ==========');
  console.log('[采集推荐] 产品#' + productId + ' 标题: ' + title);
  console.log('[采集推荐] 产品#' + productId + ' 1688类目: ' + aliCat);
  console.log('[采集推荐] 产品#' + productId + ' 发送推荐请求...');

  var body = await localPost('/api/ai/suggest-category', { title: title, ali_category: aliCat, attrs: attrs || [], image_url: imageUrl || '' });
  if (!body) {
    console.log('[采集推荐] 产品#' + productId + ' ❌ 超时(60s)');
    return null;
  }

  console.log('[采集推荐] 产品#' + productId + ' 响应体:', body.substring(0, 300));
  try {
    var result = JSON.parse(body);
    if (!result.ok || !result.category || result.confidence < 0.5) {
      console.log('[采集推荐] 产品#' + productId + ' ⚠️ 推荐无结果 ok=' + result.ok + ' category=' + (result.category || '空') + ' confidence=' + (result.confidence || 0) + ' source=' + (result.source || ''));
      return null;
    }

    var updates = [];
    var params = [];
    if (result.category) { updates.push('custom_category = ?'); params.push(result.category); }
    if (result.path) {
      updates.push('dxm_category = ?');
      params.push(JSON.stringify({ path: result.path, leafName: result.category }));
      updates.push('manual_category = ?');
      params.push(result.path);
    }
    if (updates.length) {
      updates.push("updated_at = datetime('now', '+8 hours')");
      params.push(productId);
      try {
        dbModule.db.run('UPDATE products SET ' + updates.join(', ') + ' WHERE id = ?', params);
      } catch (dbErr) {
        console.error('[采集推荐] 产品#' + productId + ' ❌ UPDATE失败:', dbErr.message);
      }
      var verifyRow = getOne('SELECT custom_category FROM products WHERE id = ?', [productId]);
      if (verifyRow && verifyRow.custom_category === result.category) {
        console.log('[采集推荐] 产品#' + productId + ' ✅ 推荐分类: ' + result.category + ' | 置信度: ' + result.confidence.toFixed(2) + ' | 来源: ' + result.source);
      } else {
        console.error('[采集推荐] 产品#' + productId + ' ❌ 验证失败! 期望=' + result.category + ' 实际=' + (verifyRow ? verifyRow.custom_category : 'NULL'));
      }
      scheduleSave();
      sseBroadcast('product-category-updated', { id: productId, category: result.category, path: result.path, source: result.source });

      if (aliCat && result.category && result.confidence >= 0.7) {
        var existingMap = getOne('SELECT id, count FROM category_mappings WHERE category_name = ? AND custom_category = ? AND deleted = 0', [aliCat, result.category]);
        if (existingMap) {
          run(`UPDATE category_mappings SET count = count + 1, updated_at = datetime('now', '+8 hours') WHERE id = ?`, [existingMap.id]);
        } else {
          run(`INSERT INTO category_mappings (category_name, custom_category, count, source, created_at, updated_at) VALUES (?, ?, 1, 'auto', datetime('now', '+8 hours'), datetime('now', '+8 hours'))`, [aliCat, result.category]);
        }
        console.log('[采集推荐] 产品#' + productId + ' 映射已固化: ' + aliCat + ' → ' + result.category + ' (置信度:' + result.confidence.toFixed(2) + ')');
      } else if (aliCat && result.category) {
        console.log('[采集推荐] 产品#' + productId + ' 低置信(' + result.confidence.toFixed(2) + ')不固化映射: ' + result.category);
      }
    }
    return { category: result.category, path: result.path, confidence: result.confidence, source: result.source };
  } catch (e) {
    console.error('[采集推荐] 产品#' + productId + ' ❌ 解析响应失败:', e.message, '| 原始响应:', body.substring(0, 200));
    return null;
  }
}

// 检查是否已采集
router.get('/product/check', (req, res) => {
  const offerId = (req.query.offerId || '').trim();
  if (!offerId) return res.json({ exists: false });
  const escaped = offerId.replace(/[%_\\]/g, '\\$&');
  // 多用户隔离：admin 看全部；非 admin 只看"自己的 + 无主的"
  // 跟商品列表 (line 397-411) 的默认 scope 保持一致，避免换用户后还能查到别人的商品
  var ownerClause;
  var ownerParams = ['%' + escaped + '%'];
  if (req.user && req.user.role === 'admin') {
    ownerClause = '';
  } else if (req.user && req.user.username) {
    ownerClause = " AND (owner = ? OR owner IS NULL OR owner = '')";
    ownerParams.push(req.user.username);
  } else {
    // 未登录（理论上 authMiddleware 已拦截，这里兜底）
    ownerClause = " AND (owner IS NULL OR owner = '')";
  }
  const row = getOne(
    "SELECT id, uid, title, status FROM products WHERE deleted = 0 AND source_url LIKE ? ESCAPE '\\'" + ownerClause + " LIMIT 1",
    ownerParams
  );
  if (row) {
    res.json({ exists: true, id: row.id, title: row.title, status: row.status });
  } else {
    res.json({ exists: false });
  }
});

// 商品列表（分页 + 搜索 + 筛选）
var pipeline = require('../services/automation-pipeline');
pipeline.setSseBroadcast(sseBroadcast);

var VALID_STAGES_IN_ROUTE = pipeline.VALID_STAGES;
router.get('/product', (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize) || 20));
  const keyword = (req.query.keyword || '').trim();
  const status = req.query.status;
  const category = (req.query.category || '').trim();
  const dxmCategory = (req.query.dxmCategory || '').trim();
  const deleted = req.query.deleted;
  const scope = (req.query.scope || '').trim();

  let where = [];
  let params = [];

  if (deleted === '1') {
    where.push('deleted = 1');
  } else if (deleted === 'all') {
    // 不加 deleted 条件
  } else {
    where.push('deleted = 0');
  }

  if (keyword) {
    var escapedKw = keyword.replace(/[%_\\]/g, '\\$&');
    where.push("title LIKE ? ESCAPE '\\'");
    params.push('%' + escapedKw + '%');
  }
  if (status !== undefined && status !== '' && status !== 'all') {
    where.push('status = ?');
    params.push(parseInt(status));
  }
  if (category) {
    var escapedCat = category.replace(/[%_\\]/g, '\\$&');
    where.push("category LIKE ? ESCAPE '\\'");
    params.push('%' + escapedCat + '%');
  }
  if (dxmCategory === '_none') {
    where.push("(custom_category IS NULL OR custom_category = '')");
  } else if (dxmCategory) {
    var escapedDxm = dxmCategory.replace(/[%_\\]/g, '\\$&');
    where.push("custom_category LIKE ? ESCAPE '\\'");
    params.push('%' + escapedDxm + '%');
  }

  // 按自动化阶段筛选
  if (req.query.stage && VALID_STAGES_IN_ROUTE.indexOf(req.query.stage) >= 0) {
    where.push('automation_stage = ?');
    params.push(req.query.stage);
  }

  // scope 过滤（多用户数据隔离）
  if (req.user) {
    if (scope === 'mine') {
      where.push('owner = ?');
      params.push(req.user.username);
    } else if (scope === 'inbox') {
      where.push("(owner IS NULL OR owner = '')");
    } else if (scope === 'all') {
      if (req.user.role !== 'admin') {
        where.push("(owner = ? OR owner IS NULL OR owner = '')");
        params.push(req.user.username);
      }
    } else {
      where.push("(owner = ? OR owner IS NULL OR owner = '')");
      params.push(req.user.username);
    }
  }

  const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const countRow = getOne(`SELECT COUNT(*) as count FROM products ${whereClause}`, params);
  const total = countRow ? countRow.count : 0;
  const offset = (page - 1) * pageSize;
  const list = getAll(
    `SELECT id, uid, source_url, title, category, custom_category, manual_category, dxm_category, attrs, skus, main_images, status, owner, claim_at, created_at, updated_at, automation_stage
     FROM products ${whereClause}
     ORDER BY created_at DESC, id DESC
     LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );

  const parsedList = list.map(row => ({
    ...row,
    category: row.category ? JSON.parse(row.category) : {},
    owner: row.owner || '',
    claimAt: row.claim_at || '',
    customCategory: row.custom_category || '',
    manualCategory: row.manual_category || '',
    dxmCategory: row.dxm_category ? JSON.parse(row.dxm_category) : null,
    attrs: JSON.parse(row.attrs || '[]'),
    skuCount: JSON.parse(row.skus || '[]').length,
    storeName: row.store_name || '',
    variantAttrName: row.variant_attr_name || '',
    variantAttrName2: row.variant_attr_name2 || '',
    variantAttrName3: row.variant_attr_name3 || '',
    variantAttrImages: row.variant_attr_images || '',
    productNo: row.product_no || ''
  }));

  res.json({ total, page, pageSize, list: parsedList });
});

// 单条商品（支持 id 和 uid 两种查找方式）
router.get('/product/:id', (req, res) => {
  var param = req.params.id || '';
  var row;
  if (param && !/^\d+$/.test(param)) {
    // 非纯数字 → 按 uid 查找
    row = getOne('SELECT * FROM products WHERE uid = ?', [param]);
  } else {
    // 纯数字 → 按 id 查找
    row = getOne('SELECT * FROM products WHERE id = ?', [parseInt(param)]);
  }
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(parseRow(row));
});

// 更新商品
router.put('/product/:id', (req, res) => {
  var uid = req.params.id || '';
  // owner 权限检查
  if (req.user && req.user.role !== 'admin') {
    var product = getOne('SELECT owner FROM products WHERE uid = ?', [uid]);
    if (product && product.owner && product.owner !== req.user.username) {
      return res.status(403).json({ error: '无权编辑他人的商品' });
    }
  }
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
    dxmCategory: 'dxm_category',
    storeName: 'store_name',
    variantAttrName: 'variant_attr_name',
    variantAttrName2: 'variant_attr_name2',
    variantAttrName3: 'variant_attr_name3',
    variantAttrImages: 'variant_attr_images',
    productNo: 'product_no',
    automationStage: 'automation_stage',
    automationLog: 'automation_log',
    automationIssues: 'automation_issues',
    automationStartedAt: 'automation_started_at',
    automationFinishedAt: 'automation_finished_at'
  };

  for (const [key, col] of Object.entries(allowedFields)) {
    if (req.body[key] !== undefined) {
      let val = req.body[key];
      if (col === 'dxm_category' && val === '') {
        // 清空时直接存空字符串，不做JSON.stringify
      } else if (['main_images', 'desc_images', 'detail_images', 'attrs', 'skus', 'dxm_category', 'variant_attr_images'].includes(col) || Array.isArray(val)) {
        val = JSON.stringify(val);
      }
      fields.push(`${col} = ?`);
      params.push(val);
    }
  }

  if (fields.length === 0) return res.json({ ok: true });

  // 在更新前记录旧分类，用于关联纠错和黑名单
  var previousCategory = getOne('SELECT custom_category FROM products WHERE uid = ?', [uid]);

  fields.push(`updated_at = datetime('now', '+8 hours')`);
  params.push(uid);
  run(`UPDATE products SET ${fields.join(', ')} WHERE uid = ?`, params);

  // 保存映射关系（手动设置 → source='manual'，已存在则递增count）
  const prodInfo = getOne('SELECT category, title, custom_category FROM products WHERE uid = ?', [uid]);
  if (req.body.customCategory && prodInfo && prodInfo.category) {
    try {
      const cat = JSON.parse(prodInfo.category);
      const catName = cat.leafCategoryName || cat.categoryPath;
      if (catName) {
        cloudDb.saveMapping(catName, req.body.customCategory, 'manual');
      }
      // 关联库纠错：用户手动改分类 → 作废错误关联 + 积累正确关联
      var oldCategory = previousCategory ? previousCategory.custom_category : null;
      var titleText = product.title || '';
      var aliCatText = catName || '';
      var kws = (titleText + ' ' + aliCatText).split(/[\s\/>,，、：:·\-—\(\)（）\[\]【】]+/).filter(function (w) {
        var cn = w.replace(/[a-zA-Z0-9]/g, '');
        return cn.length >= 2 && cn.length <= 6;
      });
      kws = kws.filter(function (w, i, arr) { return arr.indexOf(w) === i; }).slice(0, 8);

      if (oldCategory && oldCategory !== req.body.customCategory) {
        if (kws.length > 0) {
          // 作废关键词→旧类目的自动关联
          cloudDb.invalidateAutoRels(kws, oldCategory);
          // 积累关键词→新类目的关联（手动来源，权重更高）
          kws.forEach(function (kw) {
            cloudDb.saveKeywordRel(kw, req.body.customCategory, 0.8, 'manual');
          });
          console.log('[关联纠错]', uid, ':', oldCategory, '->', req.body.customCategory, '关键词:', kws.join(','));
	          // 黑名单：旧类目被否定，关键词→旧类目进黑名单
	          kws.forEach(function (kw) {
	            cloudDb.upsertBlacklist(kw, oldCategory);
	          });
	          // 黑名单减权：新类目如果之前被黑过，给一次"平反"
	          kws.forEach(function (kw) {
	            cloudDb.reduceBlacklist(kw, req.body.customCategory);
	          });
        }
      } else if (!oldCategory && req.body.customCategory && kws.length > 0) {
        // 场景A补充：从空分类→新分类（清空后重选），只积累关联不做黑名单
        kws.forEach(function (kw) {
          cloudDb.saveKeywordRel(kw, req.body.customCategory, 0.8, 'manual');
        });
        console.log('[关联积累]', uid, ':', '->', req.body.customCategory, '关键词:', kws.join(','));
      }
    } catch (e) {
      console.error('[关联纠错] 失败:', e.message);
    }
  }
  // 同步更新到云端（保持本地和云端数据一致）
  if (cloudDb.connected) {
    if (uid) {
      var cloudSyncFields = {
        title: 'title',
        skus: 'skus',
        mainImages: 'main_images',
        descImages: 'desc_images',
        detailImages: 'detail_images',
        customCategory: 'custom_category',
        manualCategory: 'manual_category',
        dxmCategory: 'dxm_category',
        storeName: 'store_name',
        variantAttrName: 'variant_attr_name',
        variantAttrName2: 'variant_attr_name2',
        variantAttrImages: 'variant_attr_images',
        productNo: 'product_no',
        status: 'status'
      };
      var cloudUpdates = [];
      var cloudParams = [];
      for (const [key, col] of Object.entries(cloudSyncFields)) {
        if (req.body[key] !== undefined) {
          let val = req.body[key];
          if (['main_images', 'desc_images', 'detail_images', 'skus', 'variant_attr_images', 'dxm_category'].includes(col) || Array.isArray(val)) {
            val = JSON.stringify(val);
          }
          cloudUpdates.push(col + ' = ?');
          cloudParams.push(val);
        }
      }
      if (cloudUpdates.length) {
        cloudUpdates.push(`updated_at = datetime('now', '+8 hours')`);
        cloudParams.push(uid);
        cloudDb.cloudRun('UPDATE products SET ' + cloudUpdates.join(', ') + ' WHERE uid = ?', cloudParams).catch(function () {});
      }
    }
  }

  res.json({ ok: true });
});

// 删除商品
router.delete('/product/:id', (req, res) => {
  var uid = req.params.id || '';
  // owner 权限检查
  if (req.user && req.user.role !== 'admin') {
    var product = getOne('SELECT owner FROM products WHERE uid = ?', [uid]);
    if (product && product.owner && product.owner !== req.user.username) {
      return res.status(403).json({ error: '无权删除他人的商品' });
    }
  }
  run(`UPDATE products SET deleted = 1, updated_at = datetime('now', '+8 hours') WHERE uid = ?`, [uid]);
  if (cloudDb.connected && uid) {
    cloudDb.cloudRun('UPDATE products SET deleted = 1 WHERE uid = ?', [uid]).catch(function () {});
  }
  res.json({ ok: true });
});

// 手动触发分类推荐
router.post('/product/:id/recommend-category', opOnly, (req, res) => {
  var uid = req.params.id || '';
  var product = getOne('SELECT * FROM products WHERE uid = ?', [uid]);
  if (!product) return res.status(404).json({ error: '产品不存在' });

  var parsed = parseRow(product);
  var title = parsed.title || '';
  var category = parsed.category || {};
  var aliCat = category.leafCategoryName || category.categoryPath || '';
  var attrs = parsed.attrs || [];

  var http = require('http');
  var mainImg = parsed.main_images && parsed.main_images[0] ? parsed.main_images[0] : '';
  var postData = JSON.stringify({ title: title, ali_category: aliCat, attrs: attrs, image_url: mainImg });
  var reqOpts = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/ai/suggest-category',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData), 'X-Internal-Call': '1' }
  };

  res.json({ ok: true, message: '推荐已触发' });

  var aiReq = http.request(reqOpts, function (aiRes) {
    var body = '';
    aiRes.on('data', function (chunk) { body += chunk; });
    aiRes.on('end', function () {
      // 非 200 直接报错（含 401/500 等）—— 避免被当成"低置信度"误导用户
      if (aiRes.statusCode !== 200) {
        console.error('[AI分类推荐] 产品#' + parsed.id + ' AI 调用失败: HTTP ' + aiRes.statusCode + ' body=' + body.substring(0, 200));
        sseBroadcast('product-category-updated', { uid: parsed.uid, category: '', source: 'error', error: true, message: 'AI 调用失败 (HTTP ' + aiRes.statusCode + ')' });
        return;
      }
      try {
        var result = JSON.parse(body);
        if (result.ok && result.category && result.confidence >= 0.25) {
          // 如果已有手动分类，不覆盖
          if (parsed.manualCategory) {
            console.log('[AI分类推荐] 产品#' + parsed.id + ' 已有手动分类，跳过覆盖');
            sseBroadcast('product-category-updated', { uid: parsed.uid, category: null, skipped: true });
            return;
          }
          var updates = [];
          var params = [];
          if (result.category) {
            updates.push('custom_category = ?');
            params.push(result.category);
          }
          if (result.path) {
            var dxmCat = JSON.stringify({ path: result.path, leafName: result.category });
            updates.push('dxm_category = ?');
            params.push(dxmCat);
            updates.push('manual_category = ?');
            params.push(result.path);
          }
          if (updates.length) {
            updates.push("updated_at = datetime('now', '+8 hours')");
            params.push(parsed.uid);
            dbModule.db.run('UPDATE products SET ' + updates.join(', ') + ' WHERE uid = ?', params);
            scheduleSave();
            console.log('[AI分类推荐] 产品#' + parsed.uid + ' 手动推荐: ' + result.category + ' (置信度:' + result.confidence.toFixed(2) + ', 来源:' + result.source + ')');
            sseBroadcast('product-category-updated', { uid: parsed.uid, category: result.category, path: result.path, source: result.source, confidence: result.confidence });

            // 自动保存映射
            if (aliCat && result.category) {
              cloudDb.saveMapping(aliCat, result.category, 'auto');
              console.log('[AI分类推荐] 自动保存映射:', aliCat, '→', result.category);
            }

            // 关联库纠错：AI推荐覆盖旧分类 → 作废旧关联
            if (parsed.customCategory && parsed.customCategory !== result.category && result.keywords && result.keywords.length > 0) {
              cloudDb.invalidateAutoRels(result.keywords.slice(0, 5), parsed.customCategory);
              console.log('[AI分类推荐] 关联纠错:', parsed.customCategory, '→', result.category);
            }

            // 自动积累关联库
            if (result.category && result.keywords && result.keywords.length > 0) {
              var relCategory = result.category;
              result.keywords.slice(0, 5).forEach(function (kw) {
                if (kw.length >= 2) {
                  cloudDb.saveKeywordRel(kw, relCategory, 0.5, 'auto');
                }
              });
              console.log('[AI分类推荐] 自动积累关联:', result.keywords.slice(0, 5).join(','), '→', relCategory);
            }
          }
        } else {
          // 低置信度或人工审核 — 把详细结果传给前端
          var source = result.source || 'none';
          var confidence = result.confidence || 0;
          var alternatives = result.alternatives || [];
          console.log('[AI分类推荐] 产品#' + parsed.id + ' 推荐结果: source=' + source + ' confidence=' + confidence.toFixed(2));
          // score_low 保留最佳候选名称，前端用来提示用户
          sseBroadcast('product-category-updated', {
            uid: parsed.uid,
            category: source === 'score_low' ? (result.category || '') : '',
            source: source,
            confidence: confidence,
            alternatives: alternatives
          });
        }
      } catch (e) {
        console.error('[AI分类推荐] 产品#' + parsed.id + ' 推荐失败:', e.message);
      }
    });
  });
  aiReq.on('error', function (e) {
    console.error('[AI分类推荐] 产品#' + parsed.id + ' 请求失败:', e.message);
    sseBroadcast('product-category-updated', { uid: parsed.uid, category: '', source: 'error', error: true, message: '网络请求失败: ' + e.message });
  });
  aiReq.write(postData);
  aiReq.end();
});

// 批量删除（逻辑删）
router.post('/product/batch-delete', (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || !ids.length) return res.json({ ok: true, deleted: 0 });
  if (ids.length > 500) return res.status(400).json({ error: '单次最多操作 500 条' });
  const validUids = ids.filter(function (id) { return id && typeof id === 'string' && id.trim(); });
  if (!validUids.length) return res.json({ ok: true, deleted: 0 });
  // operator 只能删自己的
  if (req.user && req.user.role !== 'admin') {
    const placeholders = validUids.map(() => '?').join(',');
    run(`UPDATE products SET deleted = 1, updated_at = datetime('now', '+8 hours') WHERE uid IN (${placeholders}) AND owner = ?`, [...validUids, req.user.username]);
  } else {
    const placeholders = validUids.map(() => '?').join(',');
    run(`UPDATE products SET deleted = 1, updated_at = datetime('now', '+8 hours') WHERE uid IN (${placeholders})`, validUids);
  }
  saveNow();
  if (cloudDb.connected) {
    validUids.forEach(function (uid) {
      cloudDb.cloudRun('UPDATE products SET deleted = 1 WHERE uid = ?', [uid]).catch(function () {});
    });
  }
  res.json({ ok: true });
});

router.post('/product/batch-status', (req, res) => {
  const { ids, status } = req.body;
  if (!Array.isArray(ids) || !ids.length) return res.json({ ok: true, updated: 0 });
  if (ids.length > 500) return res.status(400).json({ error: '单次最多操作 500 条' });
  const validUids = ids.filter(function (id) { return id && typeof id === 'string' && id.trim(); });
  if (!validUids.length) return res.json({ ok: true, updated: 0 });
  if (req.user && req.user.role !== 'admin') {
    const placeholders = validUids.map(() => '?').join(',');
    if (status === -1) {
      run(`UPDATE products SET status = CASE WHEN status = 1 THEN 0 ELSE 1 END, updated_at = datetime('now', '+8 hours') WHERE uid IN (${placeholders}) AND (owner = ? OR owner IS NULL OR owner = '')`, [...validUids, req.user.username]);
    } else {
      run(`UPDATE products SET status = ?, updated_at = datetime('now', '+8 hours') WHERE uid IN (${placeholders}) AND (owner = ? OR owner IS NULL OR owner = '')`, [status, ...validUids, req.user.username]);
    }
  } else {
    if (status === -1) {
      const placeholders = validUids.map(() => '?').join(',');
      run(`UPDATE products SET status = CASE WHEN status = 1 THEN 0 ELSE 1 END, updated_at = datetime('now', '+8 hours') WHERE uid IN (${placeholders})`, validUids);
    } else {
      const placeholders = validUids.map(() => '?').join(',');
      run(`UPDATE products SET status = ?, updated_at = datetime('now', '+8 hours') WHERE uid IN (${placeholders})`, [status, ...validUids]);
    }
  }
  res.json({ ok: true, updated: ids.length });
});

// 认领商品（inbox → mine）
router.post('/products/claim', (req, res) => {
  if (!req.user) return res.status(401).json({ error: '未登录' });
  var uids = req.body.uids || [];
  if (!Array.isArray(uids) || !uids.length) return res.status(400).json({ error: '请选择商品' });
  var claimed = 0;
  uids.forEach(function (uid) {
    try {
      dbModule.db.run(
        "UPDATE products SET owner = ?, claim_at = datetime('now','+8 hours'), updated_at = datetime('now','+8 hours') WHERE uid = ? AND (owner IS NULL OR owner = '')",
        [req.user.username, uid]
      );
      claimed++;
    } catch (e) {}
  });
  scheduleSave();
  sseBroadcast('products-changed', {});
  res.json({ ok: true, claimed: claimed });
});

// admin 分配商品给指定用户
router.post('/products/assign', auth.requireRole('admin'), (req, res) => {
  var uids = req.body.uids || [];
  var assignTo = (req.body.username || '').trim();
  if (!assignTo) return res.status(400).json({ error: '请指定目标用户' });
  if (!Array.isArray(uids) || !uids.length) return res.status(400).json({ error: '请选择商品' });
  uids.forEach(function (uid) {
    run(
      "UPDATE products SET owner = ?, claim_at = datetime('now','+8 hours'), updated_at = datetime('now','+8 hours') WHERE uid = ?",
      [assignTo, uid]
    );
  });
  scheduleSave();
  sseBroadcast('products-changed', {});
  res.json({ ok: true, assigned: uids.length });
});

// 补全指定类目下商品的完整路径
router.patch('/products/backfill-path', (req, res) => {
  const { customCategory } = req.body;
  if (!customCategory) return res.status(400).json({ error: '缺少 customCategory' });

  // 1. 先补全已有 dxm_category 但缺 manual_category 的商品
  const products = getAll(
    `SELECT uid, dxm_category FROM products WHERE custom_category = ? AND (manual_category IS NULL OR manual_category = '') AND dxm_category IS NOT NULL AND dxm_category != '' AND deleted = 0`,
    [customCategory]
  );
  let updated = 0;
  (products || []).forEach(function (p) {
    try {
      var dxm = JSON.parse(p.dxm_category);

      if (dxm && dxm.path) {
        run(`UPDATE products SET manual_category = ?, updated_at = datetime('now', '+8 hours') WHERE uid = ?`, [dxm.path, p.uid]);
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
        `UPDATE products SET manual_category = ?, dxm_category = ?, updated_at = datetime('now', '+8 hours')
         WHERE custom_category = ? AND (manual_category IS NULL OR manual_category = '')
           AND deleted = 0`,
        [treeRow.path, JSON.stringify({ path: treeRow.path, leafName: customCategory }), customCategory]
      );
      updated += remaining.cnt;
    }
  }

  scheduleSave();
  res.json({ ok: true, updated: updated, path: treeRow ? treeRow.path : '' });
});


// ===== 自动化流水线路由 =====

// 批量启动自动化处理
router.post('/product/batch-automate', (req, res) => {
  var uids = req.body.uids || [];
  if (!Array.isArray(uids) || uids.length === 0) {
    return res.json({ ok: false, error: 'uids 不能为空' });
  }

  var started = [];
  var skipped = [];

  uids.forEach(function (uid) {
    var product = dbModule.getOne('SELECT automation_stage, skus FROM products WHERE uid = ?', [uid]);
    if (!product) {
      skipped.push({ uid: uid, reason: '商品不存在' });
      return;
    }
    if (pipeline.skuCountExceeds(product, 6)) {
      skipped.push({ uid: uid, reason: 'SKU超过6个，跳过自动化' });
      return;
    }
    if (product.automation_stage !== 'none') {
      skipped.push({ uid: uid, reason: '已在处理中或已完成 (' + (product.automation_stage || 'none') + ')' });
      return;
    }
    started.push(uid);
  });

  // 通过 enqueue 启动队列（自动去重 + 串行处理）
  var added = pipeline.enqueue(started, dbModule);

  res.json({ ok: true, total: uids.length, started: added.length, skipped: skipped });
});

// 批量更新阶段
router.post('/product/batch-stage', (req, res) => {
  var uids = req.body.uids || [];
  var stage = req.body.stage || '';
  if (!Array.isArray(uids) || !pipeline.isValidStage(stage)) {
    return res.json({ ok: false, error: '参数无效' });
  }

  var updated = [];
  var skipped = [];

  uids.forEach(function (uid) {
    var product = dbModule.getOne('SELECT automation_stage FROM products WHERE uid = ?', [uid]);
    if (!product) {
      skipped.push({ uid: uid, reason: '商品不存在' });
      return;
    }
    if (!pipeline.isValidTransition(product.automation_stage, stage)) {
      skipped.push({ uid: uid, reason: '不允许从 ' + product.automation_stage + ' 转换到 ' + stage });
      return;
    }
    var now = new Date(Date.now() + 8 * 3600000).toISOString().replace('T', ' ').substring(0, 19);
    var updates = { automation_stage: stage, updated_at: now };
    if (stage === 'published') {
      updates.status = 1;
      updates.automation_finished_at = now;
    }
    var fields = [];
    var params = [];
    Object.keys(updates).forEach(function (col) {
      fields.push(col + ' = ?');
      params.push(updates[col]);
    });
    params.push(uid);
    dbModule.run('UPDATE products SET ' + fields.join(', ') + ' WHERE uid = ?', params);
    updated.push(uid);
  });

  res.json({ ok: true, updated: updated.length, skipped: skipped });
});

// 单个商品阶段更新
router.post('/product/:uid/stage', (req, res) => {
  var uid = req.params.uid || '';
  var stage = req.body.stage || '';
  if (!pipeline.isValidStage(stage)) {
    return res.json({ ok: false, error: '非法 stage: ' + stage });
  }

  var product = dbModule.getOne('SELECT automation_stage FROM products WHERE uid = ?', [uid]);
  if (!product) {
    return res.json({ ok: false, error: '商品不存在' });
  }
  if (!pipeline.isValidTransition(product.automation_stage, stage)) {
    return res.json({ ok: false, error: '不允许从 ' + product.automation_stage + ' 转换到 ' + stage });
  }

  var now = new Date(Date.now() + 8 * 3600000).toISOString().replace('T', ' ').substring(0, 19);
  var updates = { automation_stage: stage, updated_at: now };
  if (stage === 'published') {
    updates.status = 1;
    updates.automation_finished_at = now;
  }
  if (stage === 'failed' || stage === 'none') {
    updates.automation_finished_at = now;
  }
  var fields = [];
  var params = [];
  Object.keys(updates).forEach(function (col) {
    fields.push(col + ' = ?');
    params.push(updates[col]);
  });
  params.push(uid);
  dbModule.run('UPDATE products SET ' + fields.join(', ') + ' WHERE uid = ?', params);

  res.json({ ok: true, uid: uid, stage: stage });
});

// 查询自动化队列状态
router.get('/product/automate-status', (req, res) => {
  res.json({ ok: true, queue: pipeline.getQueueStatus() });
});

module.exports = router;
