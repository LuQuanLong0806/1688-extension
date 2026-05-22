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

  // 先调AI推荐，拿到结果后一次性写入数据库
  var aliCat = category ? (category.leafCategoryName || category.categoryPath || '') : '';
  var needRecommend = !customCategory && !dxmCategoryVal && title;

  var recommendPromise = needRecommend
    ? doRecommendAndGetResult(title, aliCat, attrs)
    : Promise.resolve(null);

  recommendPromise.then(function (recResult) {
    // 推荐成功则覆盖分类
    if (recResult && recResult.category && recResult.confidence >= 0.5) {
      customCategory = recResult.category;
      if (recResult.path) {
        dxmCategoryVal = JSON.stringify({ path: recResult.path, leafName: recResult.category });
      }
    }

    // 一次性插入数据库（分类已确定）
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

    // 立即获取产品ID（必须在其他INSERT之前）
    const row = getOne('SELECT last_insert_rowid() as id');

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

    // 推荐成功后的学习逻辑
    if (recResult && recResult.category && recResult.confidence >= 0.6) {
      try {
        var aiModule = require('./ai');
        var learnKeywords = aiModule.extractSearchKeywordsPublic(title || '', aliCat);
        aiModule.learnKeywordCategoryRelPublic(learnKeywords, recResult.category, 'auto', recResult.confidence);
      } catch (learnErr) {}
    }
    if (aliCat && customCategory && recResult && recResult.confidence >= 0.7) {
      var existingMap = getOne('SELECT id, count FROM category_mappings WHERE category_name = ? AND custom_category = ?', [aliCat, customCategory]);
      if (existingMap) {
        run('UPDATE category_mappings SET count = count + 1 WHERE id = ?', [existingMap.id]);
      } else {
        run('INSERT INTO category_mappings (category_name, custom_category, count, source) VALUES (?, ?, 1, \'auto\')', [aliCat, customCategory]);
      }
    }

    scheduleSave();
    sseBroadcast('product-added', { id: row.id, title: title || '', customCategory: customCategory });

    console.log('[采集] 产品#' + row.id + ' 入库完成, 分类: ' + (customCategory || '无') + ', 来源: ' + (recResult ? recResult.source : '映射'));
    res.json({ ok: true, id: row.id, recommendation: recResult, customCategory: customCategory });
  }).catch(function (err) {
    // 推荐失败，不带分类直接入库
    console.error('[采集] 推荐失败，不带分类入库:', err.message);
    dbModule.db.run(
      `INSERT INTO products (source_url, title, category, custom_category, dxm_category, main_images, desc_images, detail_images, attrs, skus)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        sourceUrl || '', title || '', JSON.stringify(category || {}),
        '', '',
        JSON.stringify(mainImages || []), JSON.stringify(descImages || []),
        JSON.stringify(detailImages || []), JSON.stringify(attrs || []), JSON.stringify(skus || [])
      ]
    );
    const row = getOne('SELECT last_insert_rowid() as id');
    if (category) {
      const catName = category.leafCategoryName || category.categoryPath;
      if (catName) {
        const existing = getOne('SELECT id, count FROM categories WHERE name = ?', [catName]);
        if (existing) { run('UPDATE categories SET count = count + 1 WHERE name = ?', [catName]); }
        else { run('INSERT INTO categories (name, cat_id, leaf_category_id, top_category_id, post_category_id) VALUES (?, ?, ?, ?, ?)', [catName, category.catId || '', category.leafCategoryId || '', category.topCategoryId || '', category.postCategoryId || '']); }
      }
    }
    scheduleSave();
    sseBroadcast('product-added', { id: row.id, title: title || '' });
    res.json({ ok: true, id: row.id, recommendation: null });
  });
});

// 调用推荐API，只返回结果不写数据库
function doRecommendAndGetResult(title, aliCat, attrs) {
  console.log('[采集推荐] 标题:', title, '1688类目:', aliCat);
  return new Promise(function (resolve) {
    var httpMod = require('http');
    var postData = JSON.stringify({ title: title, ali_category: aliCat, attrs: attrs || [] });
    var reqOpts = {
      hostname: 'localhost', port: 3000, path: '/api/ai/suggest-category',
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) }
    };
    var timeout = setTimeout(function () {
      console.log('[采集推荐] 超时(60s)');
      aiReq.destroy();
      resolve(null);
    }, 60000);
    var aiReq = httpMod.request(reqOpts, function (aiRes) {
      var body = '';
      aiRes.on('data', function (chunk) { body += chunk; });
      aiRes.on('end', function () {
        clearTimeout(timeout);
        try {
          var result = JSON.parse(body);
          if (!result.ok || !result.category || result.confidence < 0.5) {
            console.log('[采集推荐] 无结果 confidence=' + (result.confidence || 0) + ' source=' + (result.source || ''));
            resolve(null);
            return;
          }
          console.log('[采集推荐] ✅ ' + result.category + ' 置信度:' + result.confidence.toFixed(2) + ' 来源:' + result.source);
          resolve({ category: result.category, path: result.path, confidence: result.confidence, source: result.source });
        } catch (e) {
          console.error('[采集推荐] 解析失败:', e.message);
          resolve(null);
        }
      });
    });
    aiReq.on('error', function (e) {
      clearTimeout(timeout);
      console.error('[采集推荐] 请求失败:', e.message);
      resolve(null);
    });
    aiReq.write(postData);
    aiReq.end();
  });
}

// 同步推荐 + 保存结果 + 自动映射（手动触发时使用）
function doRecommendAndSave(title, aliCat, attrs, productId) {
  console.log('[采集推荐] ========== 产品#' + productId + ' 开始推荐 ==========');
  console.log('[采集推荐] 产品#' + productId + ' 标题: ' + title);
  console.log('[采集推荐] 产品#' + productId + ' 1688类目: ' + aliCat);

  return new Promise(function (resolve) {
    var httpMod = require('http');
    var postData = JSON.stringify({ title: title, ali_category: aliCat, attrs: attrs || [] });
    var reqOpts = {
      hostname: 'localhost', port: 3000, path: '/api/ai/suggest-category',
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) }
    };
    console.log('[采集推荐] 产品#' + productId + ' 发送推荐请求...');
    var timeout = setTimeout(function () {
      console.log('[采集推荐] 产品#' + productId + ' ❌ 超时(60s)');
      aiReq.destroy();
      resolve(null);
    }, 60000);

    var aiReq = httpMod.request(reqOpts, function (aiRes) {
      console.log('[采集推荐] 产品#' + productId + ' 收到响应, HTTP状态:', aiRes.statusCode);
      var body = '';
      aiRes.on('data', function (chunk) { body += chunk; });
      aiRes.on('end', function () {
        clearTimeout(timeout);
        console.log('[采集推荐] 产品#' + productId + ' 响应体:', body.substring(0, 300));
        try {
          var result = JSON.parse(body);
          // 下调阈值至0.5：低于0.5不分类，0.5-0.7低置信仅绑定商品不固化映射，0.7以上高置信固化映射
          if (!result.ok || !result.category || result.confidence < 0.5) {
            console.log('[采集推荐] 产品#' + productId + ' ⚠️ 推荐无结果 ok=' + result.ok + ' category=' + (result.category || '空') + ' confidence=' + (result.confidence || 0) + ' source=' + (result.source || ''));
            resolve(null);
            return;
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
            var verifyOk = verifyRow && verifyRow.custom_category === result.category;
            if (verifyOk) {
              console.log('[采集推荐] 产品#' + productId + ' ✅ 推荐分类: ' + result.category + ' | 置信度: ' + result.confidence.toFixed(2) + ' | 来源: ' + result.source);
            } else {
              console.error('[采集推荐] 产品#' + productId + ' ❌ 验证失败! 期望=' + result.category + ' 实际=' + (verifyRow ? verifyRow.custom_category : 'NULL'));
            }
            scheduleSave();
            sseBroadcast('product-category-updated', { id: productId, category: result.category, path: result.path, source: result.source });
            // 映射固化规则：高置信(>=0.7)才保存映射并递增count，低置信仅绑定商品不固化
            // 同时学习关键词-类目关联
            if (result.category && result.confidence >= 0.6) {
              try {
                var aiModule = require('./ai');
                var learnKeywords = aiModule.extractSearchKeywordsPublic(title, aliCat);
                aiModule.learnKeywordCategoryRelPublic(learnKeywords, result.category, 'auto', result.confidence);
              } catch (learnErr) {
                console.log('[采集推荐] 关键词学习失败:', learnErr.message);
              }
            }
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
          resolve({ category: result.category, path: result.path, confidence: result.confidence, source: result.source });
        } catch (e) {
          console.error('[采集推荐] 产品#' + productId + ' ❌ 解析响应失败:', e.message, '| 原始响应:', body.substring(0, 200));
          resolve(null);
        }
      });
    });
    aiReq.on('error', function (e) {
      clearTimeout(timeout);
      console.error('[采集推荐] 产品#' + productId + ' ❌ 请求失败:', e.message);
      resolve(null);
    });
    aiReq.write(postData);
    aiReq.end();
  });
}

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

  // 保存映射关系（手动设置 → source='manual'，已存在则递增count）
  const product = getOne('SELECT category, title FROM products WHERE id = ?', [parseInt(req.params.id)]);
  if (req.body.customCategory && product && product.category) {
    try {
      const cat = JSON.parse(product.category);
      const catName = cat.leafCategoryName || cat.categoryPath;
      if (catName) {
        const existingMap = getOne('SELECT id, count FROM category_mappings WHERE category_name = ? AND custom_category = ?', [catName, req.body.customCategory]);
        if (existingMap) {
          run('UPDATE category_mappings SET count = count + 1, source = \'manual\' WHERE id = ?', [existingMap.id]);
        } else {
          run('INSERT INTO category_mappings (category_name, custom_category, count, source) VALUES (?, ?, 1, \'manual\')', [catName, req.body.customCategory]);
        }
        // 学习关键词-类目关联（手动设置权重高）
        var aiModule = require('./ai');
        var learnKws = aiModule.extractSearchKeywordsPublic(product.title || '', catName);
        aiModule.learnKeywordCategoryRelPublic(learnKws, req.body.customCategory, 'manual', 1.0);
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
          }
          if (updates.length) {
            params.push(parsed.id);
            dbModule.db.run('UPDATE products SET ' + updates.join(', ') + ' WHERE id = ?', params);
            scheduleSave();
            console.log('[AI分类推荐] 产品#' + parsed.id + ' 手动推荐: ' + result.category + ' (置信度:' + result.confidence.toFixed(2) + ', 来源:' + result.source + ')');
            sseBroadcast('product-category-updated', { id: parsed.id, category: result.category, path: result.path, source: result.source });

            // 自动保存映射（已存在则递增count，不存在则插入）
            if (aliCat && result.category) {
              var existingMap2 = getOne('SELECT id, count FROM category_mappings WHERE category_name = ? AND custom_category = ?', [aliCat, result.category]);
              if (existingMap2) {
                run('UPDATE category_mappings SET count = count + 1 WHERE id = ?', [existingMap2.id]);
              } else {
                run('INSERT INTO category_mappings (category_name, custom_category, count, source) VALUES (?, ?, 1, \'auto\')', [aliCat, result.category]);
              }
              console.log('[AI分类推荐] 自动保存映射:', aliCat, '→', result.category);
            }
            // 学习关键词-类目关联
            try {
              var aiModule = require('./ai');
              var learnKws = aiModule.extractSearchKeywordsPublic(title, aliCat);
              aiModule.learnKeywordCategoryRelPublic(learnKws, result.category, 'auto', result.confidence);
            } catch (learnErr) {}
          }
        } else {
          console.log('[AI分类推荐] 产品#' + parsed.id + ' 推荐无结果');
          sseBroadcast('product-category-updated', { id: parsed.id, category: '', source: 'none' });
        }
      } catch (e) {
        console.error('[AI分类推荐] 产品#' + parsed.id + ' 推荐失败:', e.message);
      }
    });
  });
  aiReq.on('error', function (e) {
    console.error('[AI分类推荐] 产品#' + parsed.id + ' 请求失败:', e.message);
  });
  aiReq.write(postData);
  aiReq.end();
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

router.post('/product/batch-status', (req, res) => {
  const { ids, status } = req.body;
  if (!Array.isArray(ids) || !ids.length) return res.json({ ok: true, updated: 0 });
  if (status === -1) {
    const placeholders = ids.map(() => '?').join(',');
    run(`UPDATE products SET status = CASE WHEN status = 1 THEN 0 ELSE 1 END, updated_at = CURRENT_TIMESTAMP WHERE id IN (${placeholders})`, ids);
  } else {
    const placeholders = ids.map(() => '?').join(',');
    run(`UPDATE products SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id IN (${placeholders})`, [status, ...ids]);
  }
  res.json({ ok: true, updated: ids.length });
});

module.exports = router;
