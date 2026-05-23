const { Router } = require('express');
const dbModule = require('../db');
const { run, getOne, getAll, scheduleSave, saveNow, sseBroadcast, parseRow, treeGetOne } = dbModule;
const cloudDb = require('../cloud/index');

const router = Router();

// 公共：插入商品到数据库
function insertProduct(sourceUrl, title, category, customCategory, dxmCategory, manualCategory, mainImages, descImages, detailImages, attrs, skus) {
  dbModule.db.run(
    `INSERT INTO products (source_url, title, category, custom_category, dxm_category, manual_category, main_images, desc_images, detail_images, attrs, skus)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      sourceUrl || '', title || '', JSON.stringify(category || {}),
      customCategory || '', dxmCategory || '', manualCategory || '',
      JSON.stringify(mainImages || []), JSON.stringify(descImages || []),
      JSON.stringify(detailImages || []), JSON.stringify(attrs || []), JSON.stringify(skus || [])
    ]
  );
  // 异步同步到云端
  cloudDb.saveProductToLocalAndCloud(
    sourceUrl, title, JSON.stringify(category || {}), customCategory || '', dxmCategory || '',
    JSON.stringify(mainImages || []), JSON.stringify(descImages || []),
    JSON.stringify(detailImages || []), JSON.stringify(attrs || []), JSON.stringify(skus || [])
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
    run('INSERT OR IGNORE INTO category_mappings (category_name, custom_category) VALUES (?, ?)', [catName, customCategory]);
    if (cloudDb.connected) {
      cloudDb.cloudRun('INSERT OR IGNORE INTO category_mappings (category_name, custom_category, count, source) VALUES (?, ?, 1, ?)', [catName, customCategory, 'auto']).catch(function () {});
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
  const row = getOne('SELECT COUNT(*) as total, SUM(CASE WHEN status=0 THEN 1 ELSE 0 END) as unused, SUM(CASE WHEN status=1 THEN 1 ELSE 0 END) as used FROM products WHERE deleted = 0');
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

  var aliCat = category ? (category.leafCategoryName || category.categoryPath || '') : '';
  var needRecommend = !customCategory && !dxmCategoryVal && title;

  var recommendPromise = needRecommend
    ? doRecommendAndGetResult(title, aliCat, attrs)
    : Promise.resolve(null);

  var manualCategoryVal = '';

  recommendPromise.then(function (recResult) {
    if (recResult && recResult.category && recResult.confidence >= 0.5) {
      customCategory = recResult.category;
      if (recResult.path) {
        dxmCategoryVal = JSON.stringify({ path: recResult.path, leafName: recResult.category });
        manualCategoryVal = recResult.path;
      }
    }

    const row = insertProduct(sourceUrl, title, category, customCategory, dxmCategoryVal, manualCategoryVal, mainImages, descImages, detailImages, attrs, skus);
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
    const row = insertProduct(sourceUrl, title, category, '', '', '', mainImages, descImages, detailImages, attrs, skus);
    updateCategoryStats(category, '');
    scheduleSave();
    sseBroadcast('product-added', { id: row.id, title: title || '' });
    res.json({ ok: true, id: row.id, recommendation: null });
  });
});

// 公共：本地 HTTP POST 请求（Promise 包装）
function localPost(path, body, timeoutMs) {
  return new Promise(function (resolve) {
    var httpMod = require('http');
    var postData = JSON.stringify(body);
    var reqOpts = {
      hostname: 'localhost', port: 3000, path: path,
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) }
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
async function doRecommendAndGetResult(title, aliCat, attrs) {
  console.log('[采集推荐] 标题:', title, '1688类目:', aliCat);
  var body = await localPost('/api/ai/suggest-category', { title: title, ali_category: aliCat, attrs: attrs || [] });
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
async function doRecommendAndSave(title, aliCat, attrs, productId) {
  console.log('[采集推荐] ========== 产品#' + productId + ' 开始推荐 ==========');
  console.log('[采集推荐] 产品#' + productId + ' 标题: ' + title);
  console.log('[采集推荐] 产品#' + productId + ' 1688类目: ' + aliCat);
  console.log('[采集推荐] 产品#' + productId + ' 发送推荐请求...');

  var body = await localPost('/api/ai/suggest-category', { title: title, ali_category: aliCat, attrs: attrs || [] });
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
    }
    if (updates.length) {
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
        var existingMap = getOne('SELECT id, count FROM category_mappings WHERE category_name = ? AND custom_category = ?', [aliCat, result.category]);
        if (existingMap) {
          run('UPDATE category_mappings SET count = count + 1 WHERE id = ?', [existingMap.id]);
        } else {
          run('INSERT INTO category_mappings (category_name, custom_category, count, source) VALUES (?, ?, 1, \'auto\')', [aliCat, result.category]);
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
  // 转义 LIKE 通配符，防止 offerId 中的 %/_ 被误解析
  const escaped = offerId.replace(/[%_]/g, '\\$&');
  const row = getOne('SELECT id, title, status FROM products WHERE deleted = 0 AND source_url LIKE ? ESCAPE "\\\\" LIMIT 1', ['%' + escaped + '%']);
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

  let where = ['deleted = 0'];
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
    `SELECT id, source_url, title, category, custom_category, dxm_category, attrs, skus, main_images, status, created_at, updated_at
     FROM products ${whereClause}
     ORDER BY created_at DESC, id DESC
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
      if (col === 'dxm_category' && val === '') {
        // 清空时直接存空字符串，不做JSON.stringify
      } else if (['main_images', 'desc_images', 'detail_images', 'attrs', 'skus', 'dxm_category'].includes(col) || Array.isArray(val)) {
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

  // 保存映射关系（手动设置 → source='manual'，已存在则递增count）
  const product = getOne('SELECT category, title FROM products WHERE id = ?', [parseInt(req.params.id)]);
  if (req.body.customCategory && product && product.category) {
    try {
      const cat = JSON.parse(product.category);
      const catName = cat.leafCategoryName || cat.categoryPath;
      if (catName) {
        cloudDb.saveMapping(catName, req.body.customCategory, 'manual');
      }
    } catch (e) {}
  }
  // 更新云端商品分类
  if (cloudDb.connected && (req.body.customCategory || req.body.dxmCategory || req.body.status !== undefined)) {
    var srcRow = getOne('SELECT source_url FROM products WHERE id = ?', [parseInt(req.params.id)]);
    if (srcRow && srcRow.source_url) {
      var cloudUpdates = [];
      var cloudParams = [];
      if (req.body.customCategory !== undefined) { cloudUpdates.push('custom_category = ?'); cloudParams.push(req.body.customCategory || ''); }
      if (req.body.dxmCategory !== undefined) { cloudUpdates.push('dxm_category = ?'); cloudParams.push(typeof req.body.dxmCategory === 'object' ? JSON.stringify(req.body.dxmCategory) : req.body.dxmCategory); }
      if (req.body.status !== undefined) { cloudUpdates.push('status = ?'); cloudParams.push(req.body.status); }
      if (cloudUpdates.length) {
        cloudUpdates.push('updated_at = CURRENT_TIMESTAMP');
        cloudParams.push(srcRow.source_url);
        cloudDb.cloudRun('UPDATE products SET ' + cloudUpdates.join(', ') + ' WHERE source_url = ?', cloudParams).catch(function () {});
      }
    }
  }

  res.json({ ok: true });
});

// 删除商品
router.delete('/product/:id', (req, res) => {
  run('UPDATE products SET deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [parseInt(req.params.id)]);
  if (cloudDb.connected) {
    var srcRow = getOne('SELECT source_url FROM products WHERE id = ?', [parseInt(req.params.id)]);
    if (srcRow && srcRow.source_url) {
      cloudDb.cloudRun('UPDATE products SET deleted = 1 WHERE source_url = ?', [srcRow.source_url]).catch(function () {});
    }
  }
  res.json({ ok: true });
});

// 手动触发分类推荐
router.post('/product/:id/recommend-category', (req, res) => {
  var product = getOne('SELECT * FROM products WHERE id = ?', [parseInt(req.params.id)]);
  if (!product) return res.status(404).json({ error: '产品不存在' });

  var parsed = parseRow(product);
  var title = parsed.title || '';
  var category = parsed.category || {};
  var aliCat = category.leafCategoryName || category.categoryPath || '';
  var attrs = parsed.attrs || [];

  var http = require('http');
  var postData = JSON.stringify({ title: title, ali_category: aliCat, attrs: attrs });
  var reqOpts = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/ai/suggest-category',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) }
  };

  res.json({ ok: true, message: '推荐已触发' });

  var aiReq = http.request(reqOpts, function (aiRes) {
    var body = '';
    aiRes.on('data', function (chunk) { body += chunk; });
    aiRes.on('end', function () {
      try {
        var result = JSON.parse(body);
        if (result.ok && result.category && result.confidence >= 0.6) {
          // 如果已有手动分类，不覆盖
          if (parsed.manualCategory) {
            console.log('[AI分类推荐] 产品#' + parsed.id + ' 已有手动分类，跳过覆盖');
            sseBroadcast('product-category-updated', { id: parsed.id, category: null, skipped: true });
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
            params.push(parsed.id);
            dbModule.db.run('UPDATE products SET ' + updates.join(', ') + ' WHERE id = ?', params);
            scheduleSave();
            console.log('[AI分类推荐] 产品#' + parsed.id + ' 手动推荐: ' + result.category + ' (置信度:' + result.confidence.toFixed(2) + ', 来源:' + result.source + ')');
            sseBroadcast('product-category-updated', { id: parsed.id, category: result.category, path: result.path, source: result.source, confidence: result.confidence });

            // 自动保存映射
            if (aliCat && result.category) {
              cloudDb.saveMapping(aliCat, result.category, 'auto');
              console.log('[AI分类推荐] 自动保存映射:', aliCat, '→', result.category);
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
            id: parsed.id,
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
    sseBroadcast('product-category-updated', { id: parsed.id, category: '', source: 'error' });
  });
  aiReq.write(postData);
  aiReq.end();
});

// 批量删除（逻辑删）
router.post('/product/batch-delete', (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || !ids.length) return res.json({ ok: true, deleted: 0 });
  if (ids.length > 500) return res.status(400).json({ error: '单次最多操作 500 条' });
  // 校验并转为有效整数
  const validIds = ids.map(id => parseInt(id)).filter(id => !isNaN(id) && id > 0);
  if (!validIds.length) return res.json({ ok: true, deleted: 0 });
  const placeholders = validIds.map(() => '?').join(',');
  const before = getOne(`SELECT COUNT(*) as count FROM products WHERE id IN (${placeholders})`, validIds);
  run(`UPDATE products SET deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE id IN (${placeholders})`, validIds);
  saveNow();
  if (cloudDb.connected) {
    var srcRows = getAll(`SELECT source_url FROM products WHERE id IN (${placeholders}) AND source_url != ''`, validIds);
    srcRows.forEach(function (r) {
      cloudDb.cloudRun('UPDATE products SET deleted = 1 WHERE source_url = ?', [r.source_url]).catch(function () {});
    });
  }
  res.json({ ok: true, deleted: before ? before.count : 0 });
});

router.post('/product/batch-status', (req, res) => {
  const { ids, status } = req.body;
  if (!Array.isArray(ids) || !ids.length) return res.json({ ok: true, updated: 0 });
  if (ids.length > 500) return res.status(400).json({ error: '单次最多操作 500 条' });
  // 校验并转为有效整数
  const validIds = ids.map(id => parseInt(id)).filter(id => !isNaN(id) && id > 0);
  if (!validIds.length) return res.json({ ok: true, updated: 0 });
  if (status === -1) {
    const placeholders = validIds.map(() => '?').join(',');
    run(`UPDATE products SET status = CASE WHEN status = 1 THEN 0 ELSE 1 END, updated_at = CURRENT_TIMESTAMP WHERE id IN (${placeholders})`, validIds);
  } else {
    const placeholders = validIds.map(() => '?').join(',');
    run(`UPDATE products SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id IN (${placeholders})`, [status, ...validIds]);
  }
  res.json({ ok: true, updated: ids.length });
});

module.exports = router;
