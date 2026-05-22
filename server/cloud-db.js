// Turso 云端 SQLite — 共享知识库
const { createClient } = require('@libsql/client');
const dbModule = require('./db');

let client = null;
let connected = false;
let lastSyncTime = null;

// 知识表列表
const KNOWLEDGE_TABLES = [
  'category_mappings',
  'keyword_category_rel',
  'keyword_synonyms',
  'keyword_blacklist',
  'dxm_category_tree',
  'products'
];

// 从 settings 读取 Turso 配置
function getConfig() {
  try {
    var row = dbModule.getOne("SELECT value FROM settings WHERE key = 'turso_config'");
    if (row && row.value) return JSON.parse(row.value);
  } catch (e) {}
  return null;
}

function saveConfig(config) {
  dbModule.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('turso_config', ?)", [JSON.stringify(config)]);
  dbModule.scheduleSave();
}

// 初始化 Turso 连接
async function connect() {
  var config = getConfig();
  if (!config || !config.url || !config.token) {
    console.log('[云同步] 未配置 Turso，使用本地模式');
    connected = false;
    return false;
  }
  try {
    client = createClient({ url: config.url, authToken: config.token });
    // 测试连接
    var result = await client.execute('SELECT 1 as ok');
    if (result.rows && result.rows.length > 0) {
      connected = true;
      console.log('[云同步] Turso 连接成功');
      // 自动补列（对比 DDL 定义，缺什么补什么）
      migrateCloudSchema().catch(function () {});
      return true;
    }
  } catch (e) {
    console.log('[云同步] Turso 连接失败:', e.message);
    connected = false;
    client = null;
  }
  return false;
}

// 云端表结构定义（建表 + 自动补列）
// 【重要】新增字段只需在对应表的 DDL 里加列即可，连接时 migrateCloudSchema() 会自动 ALTER TABLE ADD COLUMN
// 规则：只增不删不改，不要删除已有列，不要修改已有列的类型
// 注意：云端表和本地表结构独立，新增字段需在 db.js 和 cloud-db.js 两处 DDL 都加上
var CLOUD_TABLE_DEFS = [
  { name: 'category_mappings', ddl: 'CREATE TABLE IF NOT EXISTS category_mappings (id INTEGER PRIMARY KEY AUTOINCREMENT, category_name TEXT NOT NULL, custom_category TEXT NOT NULL, count INTEGER DEFAULT 1, source TEXT DEFAULT \'auto\', UNIQUE(category_name, custom_category))' },
  { name: 'keyword_category_rel', ddl: 'CREATE TABLE IF NOT EXISTS keyword_category_rel (id INTEGER PRIMARY KEY AUTOINCREMENT, keyword TEXT NOT NULL, category_name TEXT NOT NULL, weight REAL DEFAULT 1.0, match_count INTEGER DEFAULT 1, valid INTEGER DEFAULT 1, source TEXT DEFAULT \'auto\', created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(keyword, category_name))' },
  { name: 'keyword_synonyms', ddl: 'CREATE TABLE IF NOT EXISTS keyword_synonyms (id INTEGER PRIMARY KEY AUTOINCREMENT, word_a TEXT NOT NULL, word_b TEXT NOT NULL, UNIQUE(word_a, word_b))' },
  { name: 'keyword_blacklist', ddl: 'CREATE TABLE IF NOT EXISTS keyword_blacklist (id INTEGER PRIMARY KEY AUTOINCREMENT, keyword TEXT NOT NULL, category_name TEXT NOT NULL, reason TEXT DEFAULT \'\', UNIQUE(keyword, category_name))' },
  { name: 'dxm_category_tree', ddl: 'CREATE TABLE IF NOT EXISTS dxm_category_tree (cat_id INTEGER PRIMARY KEY, cat_name TEXT NOT NULL, parent_cat_id INTEGER DEFAULT 0, cat_level INTEGER DEFAULT 1, is_leaf INTEGER DEFAULT 0, path TEXT DEFAULT \'\', sync_at TEXT DEFAULT CURRENT_TIMESTAMP)' },
  { name: 'products', ddl: 'CREATE TABLE IF NOT EXISTS products (source_url TEXT PRIMARY KEY, title TEXT, main_images TEXT, desc_images TEXT, detail_images TEXT, attrs TEXT, skus TEXT, category TEXT, custom_category TEXT, dxm_category TEXT, manual_category TEXT, status INTEGER DEFAULT 0, deleted INTEGER DEFAULT 0, from_machine TEXT DEFAULT \'\', created_at TEXT, updated_at TEXT)' }
];

// 解析 DDL 提取列定义 { name, type, default }
function parseColumnsFromDDL(ddl) {
  var m = ddl.match(/\((.+)\)/s);
  if (!m) return [];
  var body = m[1];
  var cols = [];
  // 按逗号分割，但跳过括号内的逗号（如 UNIQUE(a, b)）
  var depth = 0;
  var start = 0;
  for (var i = 0; i < body.length; i++) {
    if (body[i] === '(') depth++;
    else if (body[i] === ')') depth--;
    else if (body[i] === ',' && depth === 0) {
      var part = body.substring(start, i).trim();
      start = i + 1;
      if (part && !/^(UNIQUE|PRIMARY|CHECK|FOREIGN)/i.test(part)) {
        var tokens = part.split(/\s+/);
        var colName = tokens[0];
        var colType = tokens.length > 1 ? tokens.slice(1).join(' ') : '';
        var defMatch = colType.match(/DEFAULT\s+(\S+)/i);
        cols.push({ name: colName, full: part, hasDefault: !!defMatch });
      }
    }
  }
  // 最后一个
  var last = body.substring(start).trim();
  if (last && !/^(UNIQUE|PRIMARY|CHECK|FOREIGN)/i.test(last)) {
    var tokens = last.split(/\s+/);
    var defMatch = last.match(/DEFAULT\s+(\S+)/i);
    cols.push({ name: tokens[0], full: last, hasDefault: !!defMatch });
  }
  return cols;
}

// 自动补列：对比 DDL 定义和云端实际表，补齐缺失的列
async function migrateCloudSchema() {
  if (!client) return;
  for (var t = 0; t < CLOUD_TABLE_DEFS.length; t++) {
    var def = CLOUD_TABLE_DEFS[t];
    var expected = parseColumnsFromDDL(def.ddl);
    if (!expected.length) continue;
    // 查云端表实际有哪些列
    var actual = [];
    try {
      var info = await client.execute('PRAGMA table_info(' + def.name + ')');
      actual = (info.rows || []).map(function (r) { return r.name; });
    } catch (e) { continue; }
    // 补缺失的列
    for (var c = 0; c < expected.length; c++) {
      if (actual.indexOf(expected[c].name) < 0) {
        try {
          await client.execute('ALTER TABLE ' + def.name + ' ADD COLUMN ' + expected[c].full);
          console.log('[云同步] 补列: ' + def.name + '.' + expected[c].name);
        } catch (e) {}
      }
    }
  }
}

// 在云端建表
async function createTables() {
  if (!client) return false;
  try {
    for (var i = 0; i < CLOUD_TABLE_DEFS.length; i++) {
      await client.execute(CLOUD_TABLE_DEFS[i].ddl);
    }
    console.log('[云同步] 建表完成');
    await migrateCloudSchema();
    return true;
  } catch (e) {
    console.error('[云同步] 建表失败:', e.message);
    return false;
  }
}

// 通用云端操作 — run (INSERT/UPDATE/DELETE)
async function cloudRun(sql, params) {
  if (!connected || !client) return null;
  try {
    var result = await client.execute({ sql: sql, args: params || [] });
    return result;
  } catch (e) {
    console.error('[云同步] run 失败:', e.message);
    return null;
  }
}

// 通用云端操作 — getOne
async function cloudGetOne(sql, params) {
  if (!connected || !client) return null;
  try {
    var result = await client.execute({ sql: sql, args: params || [] });
    if (result.rows && result.rows.length > 0) {
      // libsql 返回对象数组，转为普通对象
      return result.rows[0];
    }
    return null;
  } catch (e) {
    console.error('[云同步] getOne 失败:', e.message);
    return null;
  }
}

// 通用云端操作 — getAll
async function cloudGetAll(sql, params) {
  if (!connected || !client) return [];
  try {
    var result = await client.execute({ sql: sql, args: params || [] });
    return result.rows || [];
  } catch (e) {
    console.error('[云同步] getAll 失败:', e.message);
    return [];
  }
}

// ===== 双写：云端 + 本地 =====
// 写操作同时写本地和云端，读操作优先云端，降级本地

// category_mappings
async function getMappings(categoryName) {
  if (connected) {
    var rows = await cloudGetAll('SELECT custom_category, count, source FROM category_mappings WHERE category_name = ? ORDER BY count DESC, id', [categoryName]);
    if (rows && rows.length > 0) return rows;
  }
  // 降级本地
  return dbModule.getAll('SELECT custom_category, count, source FROM category_mappings WHERE category_name = ? ORDER BY count DESC, id', [categoryName]);
}

async function saveMapping(aliCat, customCat, source) {
  // 先写本地（保证离线可用）
  var existing = dbModule.getOne('SELECT id, count FROM category_mappings WHERE category_name = ? AND custom_category = ?', [aliCat, customCat]);
  if (existing) {
    dbModule.run('UPDATE category_mappings SET count = count + 1, source = ? WHERE id = ?', [source || 'auto', existing.id]);
  } else {
    dbModule.run('INSERT INTO category_mappings (category_name, custom_category, count, source) VALUES (?, ?, 1, ?)', [aliCat, customCat, source || 'auto']);
  }
  // 异步写云端
  if (connected) {
    cloudRun('SELECT id, count FROM category_mappings WHERE category_name = ? AND custom_category = ?', [aliCat, customCat]).then(function (existing) {
      if (existing && existing.rows && existing.rows.length > 0) {
        var row = existing.rows[0];
        cloudRun('UPDATE category_mappings SET count = count + 1, source = ? WHERE id = ?', [source || 'auto', row.id]);
      } else {
        cloudRun('INSERT OR IGNORE INTO category_mappings (category_name, custom_category, count, source) VALUES (?, ?, 1, ?)', [aliCat, customCat, source || 'auto']);
      }
    }).catch(function () {});
  }
}

// keyword_category_rel
async function getKeywordRels(keywords) {
  if (!keywords || !keywords.length) return [];
  if (connected) {
    var placeholders = keywords.map(function () { return '?' }).join(',');
    var rows = await cloudGetAll(
      'SELECT keyword, category_name, weight, match_count, source FROM keyword_category_rel WHERE valid = 1 AND keyword IN (' + placeholders + ')',
      keywords
    );
    if (rows && rows.length > 0) return rows;
  }
  // 降级本地
  var placeholders2 = keywords.map(function () { return '?' }).join(',');
  return dbModule.getAll(
    'SELECT keyword, category_name, weight, match_count, source FROM keyword_category_rel WHERE valid = 1 AND keyword IN (' + placeholders2 + ')',
    keywords
  );
}

async function saveKeywordRel(keyword, categoryName, weight, source) {
  // 先写本地
  var existing = dbModule.getOne('SELECT id, weight, match_count FROM keyword_category_rel WHERE keyword = ? AND category_name = ?', [keyword, categoryName]);
  if (existing) {
    var newWeight = Math.max(existing.weight, weight);
    dbModule.run('UPDATE keyword_category_rel SET match_count = match_count + 1, weight = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newWeight, existing.id]);
  } else {
    dbModule.run('INSERT INTO keyword_category_rel (keyword, category_name, weight, match_count, source) VALUES (?, ?, ?, 1, ?)', [keyword, categoryName, weight, source || 'auto']);
  }
  // 异步写云端
  if (connected) {
    cloudRun('SELECT id, weight, match_count FROM keyword_category_rel WHERE keyword = ? AND category_name = ?', [keyword, categoryName]).then(function (res) {
      if (res && res.rows && res.rows.length > 0) {
        var row = res.rows[0];
        var newW = Math.max(row.weight, weight);
        cloudRun('UPDATE keyword_category_rel SET match_count = match_count + 1, weight = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newW, row.id]);
      } else {
        cloudRun('INSERT OR IGNORE INTO keyword_category_rel (keyword, category_name, weight, match_count, source) VALUES (?, ?, ?, 1, ?)', [keyword, categoryName, weight, source || 'auto']);
      }
    }).catch(function () {});
  }
}

// keyword_synonyms
async function getSynonyms(keyword) {
  if (connected) {
    var rows = await cloudGetAll('SELECT word_a, word_b FROM keyword_synonyms WHERE word_a = ? OR word_b = ?', [keyword, keyword]);
    if (rows && rows.length > 0) return rows;
  }
  return dbModule.getAll('SELECT word_a, word_b FROM keyword_synonyms WHERE word_a = ? OR word_b = ?', [keyword, keyword]);
}

// keyword_blacklist
async function getBlacklisted(keyword) {
  if (connected) {
    var rows = await cloudGetAll('SELECT category_name FROM keyword_blacklist WHERE keyword = ?', [keyword]);
    if (rows && rows.length > 0) return rows;
  }
  return dbModule.getAll('SELECT category_name FROM keyword_blacklist WHERE keyword = ?', [keyword]);
}

// dxm_category_tree — 查询路径
async function getTreePath(catName) {
  if (connected) {
    var row = await cloudGetOne('SELECT path FROM dxm_category_tree WHERE cat_name = ? AND is_leaf = 1 LIMIT 1', [catName]);
    if (row) return row;
  }
  return dbModule.treeGetOne('SELECT path FROM dxm_category_tree WHERE cat_name = ? AND is_leaf = 1 LIMIT 1', [catName]);
}

// ===== 批量同步：本地 → 云端（只增不改，count/weight 取 MAX） =====
async function uploadLocalToCloud() {
  if (!connected) return { ok: false, error: '未连接' };
  var counts = {};

  // category_mappings — 只增，count 取 MAX
  var mappings = dbModule.getAll('SELECT category_name, custom_category, count, source FROM category_mappings');
  for (var i = 0; i < mappings.length; i++) {
    var m = mappings[i];
    var existing = await cloudGetOne('SELECT id, count FROM category_mappings WHERE category_name = ? AND custom_category = ?', [m.category_name, m.custom_category]);
    if (existing) {
      var maxCount = Math.max(existing.count || 0, m.count);
      if (maxCount > existing.count) {
        await cloudRun('UPDATE category_mappings SET count = ? WHERE id = ?', [maxCount, existing.id]);
      }
    } else {
      await cloudRun('INSERT INTO category_mappings (category_name, custom_category, count, source) VALUES (?, ?, ?, ?)',
        [m.category_name, m.custom_category, m.count, m.source]);
    }
  }
  counts.category_mappings = mappings.length;

  // keyword_category_rel — 只增，weight/match_count 取 MAX
  var rels = dbModule.getAll('SELECT keyword, category_name, weight, match_count, valid, source FROM keyword_category_rel');
  for (var i = 0; i < rels.length; i++) {
    var r = rels[i];
    var existing = await cloudGetOne('SELECT id, weight, match_count FROM keyword_category_rel WHERE keyword = ? AND category_name = ?', [r.keyword, r.category_name]);
    if (existing) {
      var maxW = Math.max(existing.weight || 1.0, r.weight);
      var maxM = Math.max(existing.match_count || 1, r.match_count);
      if (maxW > existing.weight || maxM > existing.match_count) {
        await cloudRun('UPDATE keyword_category_rel SET weight = ?, match_count = ? WHERE id = ?', [maxW, maxM, existing.id]);
      }
    } else {
      await cloudRun('INSERT INTO keyword_category_rel (keyword, category_name, weight, match_count, valid, source) VALUES (?, ?, ?, ?, ?, ?)',
        [r.keyword, r.category_name, r.weight, r.match_count, r.valid, r.source]);
    }
  }
  counts.keyword_category_rel = rels.length;

  // keyword_synonyms — 批量写入
  var syns = dbModule.getAll('SELECT word_a, word_b FROM keyword_synonyms');
  if (syns.length > 0 && client.batch) {
    var batchSize = 200;
    for (var si = 0; si < syns.length; si += batchSize) {
      var chunk = syns.slice(si, si + batchSize);
      var stmts = chunk.map(function (s) {
        return { sql: 'INSERT OR IGNORE INTO keyword_synonyms (word_a, word_b) VALUES (?, ?)', args: [s.word_a, s.word_b] };
      });
      try { await client.batch(stmts); } catch (e) { console.error('[云同步] synonyms batch fail:', e.message); }
    }
  } else {
    for (var i = 0; i < syns.length; i++) {
      await cloudRun('INSERT OR IGNORE INTO keyword_synonyms (word_a, word_b) VALUES (?, ?)', [syns[i].word_a, syns[i].word_b]);
    }
  }
  counts.keyword_synonyms = syns.length;

  // keyword_blacklist — 批量写入
  var bl = dbModule.getAll('SELECT keyword, category_name, reason FROM keyword_blacklist');
  if (bl.length > 0 && client.batch) {
    var batchSize = 200;
    for (var bi = 0; bi < bl.length; bi += batchSize) {
      var chunk = bl.slice(bi, bi + batchSize);
      var stmts = chunk.map(function (b) {
        return { sql: 'INSERT OR IGNORE INTO keyword_blacklist (keyword, category_name, reason) VALUES (?, ?, ?)', args: [b.keyword, b.category_name, b.reason] };
      });
      try { await client.batch(stmts); } catch (e) { console.error('[云同步] blacklist batch fail:', e.message); }
    }
  } else {
    for (var i = 0; i < bl.length; i++) {
      await cloudRun('INSERT OR IGNORE INTO keyword_blacklist (keyword, category_name, reason) VALUES (?, ?, ?)', [bl[i].keyword, bl[i].category_name, bl[i].reason]);
    }
  }
  counts.keyword_blacklist = bl.length;

  // dxm_category_tree 不在此处上传，走单独的 syncTree 接口
  // products 不在此处上传，走单独的 syncProducts 接口

  console.log('[云同步] 知识库上传完成:', JSON.stringify(counts));
  lastSyncTime = new Date().toISOString();
  return { ok: true, counts: counts };
}

// ===== 批量同步：云端 → 本地（只增不改，count/weight 取 MAX） =====
async function downloadCloudToLocal() {
  if (!connected) return { ok: false, error: '未连接' };
  var counts = {};

  // category_mappings — 只增，count 取 MAX
  var cloudMappings = await cloudGetAll('SELECT category_name, custom_category, count, source FROM category_mappings');
  for (var i = 0; i < cloudMappings.length; i++) {
    var m = cloudMappings[i];
    var local = dbModule.getOne('SELECT id, count FROM category_mappings WHERE category_name = ? AND custom_category = ?', [m.category_name, m.custom_category]);
    if (local) {
      var maxCount = Math.max(local.count || 0, m.count);
      if (maxCount > local.count) {
        dbModule.run('UPDATE category_mappings SET count = ? WHERE id = ?', [maxCount, local.id]);
      }
    } else {
      dbModule.run('INSERT INTO category_mappings (category_name, custom_category, count, source) VALUES (?, ?, ?, ?)',
        [m.category_name, m.custom_category, m.count, m.source]);
    }
  }
  counts.category_mappings = cloudMappings.length;

  // keyword_category_rel — 只增，weight/match_count 取 MAX
  var cloudRels = await cloudGetAll('SELECT keyword, category_name, weight, match_count, valid, source FROM keyword_category_rel');
  for (var i = 0; i < cloudRels.length; i++) {
    var r = cloudRels[i];
    var local = dbModule.getOne('SELECT id, weight, match_count FROM keyword_category_rel WHERE keyword = ? AND category_name = ?', [r.keyword, r.category_name]);
    if (local) {
      var maxW = Math.max(local.weight || 1.0, r.weight);
      var maxM = Math.max(local.match_count || 1, r.match_count);
      if (maxW > local.weight || maxM > local.match_count) {
        dbModule.run('UPDATE keyword_category_rel SET weight = ?, match_count = ? WHERE id = ?', [maxW, maxM, local.id]);
      }
    } else {
      dbModule.run('INSERT INTO keyword_category_rel (keyword, category_name, weight, match_count, valid, source) VALUES (?, ?, ?, ?, ?, ?)',
        [r.keyword, r.category_name, r.weight, r.match_count, r.valid, r.source]);
    }
  }
  counts.keyword_category_rel = cloudRels.length;

  // keyword_synonyms — 本地批量写入（先收集，最后一次保存）
  var cloudSyns = await cloudGetAll('SELECT word_a, word_b FROM keyword_synonyms');
  for (var i = 0; i < cloudSyns.length; i++) {
    dbModule.run('INSERT OR IGNORE INTO keyword_synonyms (word_a, word_b) VALUES (?, ?)', [cloudSyns[i].word_a, cloudSyns[i].word_b]);
  }
  counts.keyword_synonyms = cloudSyns.length;

  // keyword_blacklist
  var cloudBl = await cloudGetAll('SELECT keyword, category_name, reason FROM keyword_blacklist');
  for (var i = 0; i < cloudBl.length; i++) {
    dbModule.run('INSERT OR IGNORE INTO keyword_blacklist (keyword, category_name, reason) VALUES (?, ?, ?)',
      [cloudBl[i].keyword, cloudBl[i].category_name, cloudBl[i].reason]);
  }
  counts.keyword_blacklist = cloudBl.length;

  // dxm_category_tree 不在此处拉取，走单独的 syncTree 接口

  console.log('[云同步] 知识库下载完成:', JSON.stringify(counts));
  lastSyncTime = new Date().toISOString();
  return { ok: true, counts: counts };
}

// 双向同步：先拉云端→本地，再推本地→云端（取各自的max）
async function bidirectionalSync() {
  if (!connected) return { ok: false, error: '未连接' };
  var pull = await downloadCloudToLocal();
  var push = await uploadLocalToCloud();
  return { ok: true, pull: pull.counts, push: push.counts };
}

// ===== 分类树单独同步（数据量大，批量处理） =====

// 上传分类树到云端
async function uploadTree() {
  if (!connected) return { ok: false, error: '未连接' };
  var trees = dbModule.treeGetAll('SELECT cat_id, cat_name, parent_cat_id, cat_level, is_leaf, path FROM dxm_category_tree');
  var total = trees.length;
  var batchSize = 500;
  var uploaded = 0;
  var errors = 0;

  for (var batch = 0; batch < trees.length; batch += batchSize) {
    var chunk = trees.slice(batch, batch + batchSize);
    var stmts = chunk.map(function (t) {
      return {
        sql: 'INSERT OR IGNORE INTO dxm_category_tree (cat_id, cat_name, parent_cat_id, cat_level, is_leaf, path) VALUES (?, ?, ?, ?, ?, ?)',
        args: [t.cat_id, t.cat_name, t.parent_cat_id, t.cat_level, t.is_leaf, t.path]
      };
    });
    try {
      if (client.batch) {
        await client.batch(stmts);
      } else {
        for (var j = 0; j < stmts.length; j++) {
          await client.execute({ sql: stmts[j].sql, args: stmts[j].args });
        }
      }
      uploaded += chunk.length;
      console.log('[云同步] 分类树上传进度:', uploaded + '/' + total);
    } catch (e) {
      errors += chunk.length;
      console.error('[云同步] 分类树批次上传失败:', e.message);
    }
  }

  console.log('[云同步] 分类树上传完成, 总数:', total, '成功:', uploaded, '失败:', errors);
  return { ok: true, total: total, uploaded: uploaded, errors: errors };
}

// 从云端拉取分类树到本地
async function downloadTree() {
  if (!connected) return { ok: false, error: '未连接' };
  var cloudTree = await cloudGetAll('SELECT cat_id, cat_name, parent_cat_id, cat_level, is_leaf, path FROM dxm_category_tree');
  var added = 0;
  for (var i = 0; i < cloudTree.length; i++) {
    var t = cloudTree[i];
    var local = dbModule.treeGetOne('SELECT cat_id FROM dxm_category_tree WHERE cat_id = ?', [t.cat_id]);
    if (!local) {
      dbModule.treeRun('INSERT OR IGNORE INTO dxm_category_tree (cat_id, cat_name, parent_cat_id, cat_level, is_leaf, path) VALUES (?, ?, ?, ?, ?, ?)',
        [t.cat_id, t.cat_name, t.parent_cat_id, t.cat_level, t.is_leaf, t.path]);
      added++;
    }
  }
  dbModule.scheduleTreeSave();
  console.log('[云同步] 分类树下载完成, 云端:', cloudTree.length, '新增:', added);
  return { ok: true, cloudTotal: cloudTree.length, added: added };
}

// ===== 商品单独同步（用 source_url 做唯一键，不用自增 ID） =====

// 上传商品到云端
async function uploadProducts() {
  if (!connected) return { ok: false, error: '未连接' };
  var products = dbModule.getAll("SELECT source_url, title, main_images, desc_images, detail_images, attrs, skus, category, custom_category, dxm_category, manual_category, status, deleted, created_at, updated_at FROM products");
  var total = products.length;
  var uploaded = 0;
  var skipped = 0;
  var batchSize = 100;

  for (var batch = 0; batch < products.length; batch += batchSize) {
    var chunk = products.slice(batch, batch + batchSize);
    var stmts = chunk.map(function (p) {
      return {
        sql: 'INSERT OR IGNORE INTO products (source_url, title, main_images, desc_images, detail_images, attrs, skus, category, custom_category, dxm_category, manual_category, status, deleted, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        args: [p.source_url, p.title, p.main_images || '', p.desc_images || '', p.detail_images || '', p.attrs || '', p.skus || '', p.category || '', p.custom_category || '', p.dxm_category || '', p.manual_category || '', p.status || 0, p.deleted || 0, p.created_at || '', p.updated_at || '']
      };
    });
    try {
      if (client.batch) {
        await client.batch(stmts);
      } else {
        for (var j = 0; j < stmts.length; j++) {
          await client.execute({ sql: stmts[j].sql, args: stmts[j].args });
        }
      }
      uploaded += chunk.length;
      console.log('[云同步] 商品上传进度:', uploaded + '/' + total);
    } catch (e) {
      console.error('[云同步] 商品批次上传失败:', e.message);
    }
  }

  console.log('[云同步] 商品上传完成, 总数:', total, '成功:', uploaded);
  return { ok: true, total: total, uploaded: uploaded };
}

// 从云端拉取商品到本地（只增不改）
async function downloadProducts() {
  if (!connected) return { ok: false, error: '未连接' };
  var cloudProducts = await cloudGetAll('SELECT source_url, title, main_images, desc_images, detail_images, attrs, skus, category, custom_category, dxm_category, manual_category, status, deleted, created_at, updated_at FROM products');
  var added = 0;
  var skipped = 0;
  var deletedSynced = 0;

  for (var i = 0; i < cloudProducts.length; i++) {
    var p = cloudProducts[i];
    var isDeleted = p.deleted && Number(p.deleted) === 1;
    var local = dbModule.getOne('SELECT id, deleted as local_deleted FROM products WHERE source_url = ?', [p.source_url]);
    if (!local) {
      // 云端有但本地没有：如果云端已删除，跳过不导入；否则正常导入
      if (isDeleted) { skipped++; continue; }
      dbModule.run('INSERT INTO products (source_url, title, main_images, desc_images, detail_images, attrs, skus, category, custom_category, dxm_category, manual_category, status, deleted, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [p.source_url, p.title, p.main_images, p.desc_images, p.detail_images, p.attrs, p.skus, p.category, p.custom_category, p.dxm_category, p.manual_category, p.status, 0, p.created_at, p.updated_at]);
      added++;
    } else {
      // 本地已有：如果云端标记删除，同步删除标记到本地
      if (isDeleted && !local.local_deleted) {
        dbModule.run('UPDATE products SET deleted = 1 WHERE id = ?', [local.id]);
        deletedSynced++;
      }
      skipped++;
    }
  }
  dbModule.scheduleSave();
  console.log('[云同步] 商品下载完成, 云端:', cloudProducts.length, '新增:', added, '跳过:', skipped, '删除同步:', deletedSynced);
  return { ok: true, cloudTotal: cloudProducts.length, added: added, skipped: skipped, deletedSynced: deletedSynced };
}

// 采集时单条商品自动同步到云端（异步，不阻塞采集流程）
function saveProductToLocalAndCloud(sourceUrl, title, category, customCategory, dxmCategory, mainImages, descImages, detailImages, attrs, skus) {
  if (!connected) return;
  cloudRun(
    'INSERT OR IGNORE INTO products (source_url, title, main_images, desc_images, detail_images, attrs, skus, category, custom_category, dxm_category, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)',
    [sourceUrl || '', title || '', mainImages || '', descImages || '', detailImages || '', attrs || '', skus || '', category || '', customCategory || '', dxmCategory || '']
  ).catch(function () {});
}

// ===== 单表同步 =====
var SINGLE_TABLE_DEFS = {
  mappings: {
    localGet: function () { return dbModule.getAll('SELECT category_name, custom_category, count, source FROM category_mappings'); },
    cloudCols: 'category_name, custom_category, count, source',
    cloudKey: ['category_name', 'custom_category'],
    localKeyMatch: function (r) { return 'SELECT id, count FROM category_mappings WHERE category_name = ? AND custom_category = ?'; },
    localKeyParams: function (r) { return [r.category_name, r.custom_category]; },
    localInsert: 'INSERT INTO category_mappings (category_name, custom_category, count, source) VALUES (?, ?, ?, ?)',
    localInsertParams: function (r) { return [r.category_name, r.custom_category, r.count, r.source]; },
    localUpdate: 'UPDATE category_mappings SET count = ?, source = ? WHERE id = ?',
    cloudTable: 'category_mappings',
    cloudInsert: 'INSERT INTO category_mappings (category_name, custom_category, count, source) VALUES (?, ?, ?, ?)',
    cloudInsertParams: function (r) { return [r.category_name, r.custom_category, r.count, r.source]; },
    cloudUpdate: 'UPDATE category_mappings SET count = ?, source = ? WHERE id = ?',
    label: '类目映射'
  },
  'keyword-rels': {
    localGet: function () { return dbModule.getAll('SELECT keyword, category_name, weight, match_count, valid, source FROM keyword_category_rel'); },
    cloudCols: 'keyword, category_name, weight, match_count, valid, source',
    cloudKey: ['keyword', 'category_name'],
    localKeyMatch: function (r) { return 'SELECT id, weight, match_count FROM keyword_category_rel WHERE keyword = ? AND category_name = ?'; },
    localKeyParams: function (r) { return [r.keyword, r.category_name]; },
    localInsert: 'INSERT INTO keyword_category_rel (keyword, category_name, weight, match_count, valid, source) VALUES (?, ?, ?, ?, ?, ?)',
    localInsertParams: function (r) { return [r.keyword, r.category_name, r.weight, r.match_count, r.valid, r.source]; },
    localUpdate: 'UPDATE keyword_category_rel SET weight = MAX(weight, ?), match_count = MAX(match_count, ?), valid = ?, source = ? WHERE id = ?',
    cloudTable: 'keyword_category_rel',
    cloudInsert: 'INSERT INTO keyword_category_rel (keyword, category_name, weight, match_count, valid, source) VALUES (?, ?, ?, ?, ?, ?)',
    cloudInsertParams: function (r) { return [r.keyword, r.category_name, r.weight, r.match_count, r.valid, r.source]; },
    cloudUpdate: 'UPDATE keyword_category_rel SET weight = ?, match_count = ?, valid = ?, source = ? WHERE id = ?',
    label: '关键词关联'
  },
  synonyms: {
    localGet: function () { return dbModule.getAll('SELECT word_a, word_b FROM keyword_synonyms'); },
    cloudCols: 'word_a, word_b',
    cloudKey: ['word_a', 'word_b'],
    localKeyMatch: function (r) { return 'SELECT id FROM keyword_synonyms WHERE word_a = ? AND word_b = ?'; },
    localKeyParams: function (r) { return [r.word_a, r.word_b]; },
    localInsert: 'INSERT OR IGNORE INTO keyword_synonyms (word_a, word_b) VALUES (?, ?)',
    localInsertParams: function (r) { return [r.word_a, r.word_b]; },
    localUpdate: null,
    cloudTable: 'keyword_synonyms',
    cloudInsert: 'INSERT OR IGNORE INTO keyword_synonyms (word_a, word_b) VALUES (?, ?)',
    cloudInsertParams: function (r) { return [r.word_a, r.word_b]; },
    cloudUpdate: null,
    label: '同义词'
  },
  blacklist: {
    localGet: function () { return dbModule.getAll('SELECT keyword, category_name, reason FROM keyword_blacklist'); },
    cloudCols: 'keyword, category_name, reason',
    cloudKey: ['keyword', 'category_name'],
    localKeyMatch: function (r) { return 'SELECT id FROM keyword_blacklist WHERE keyword = ? AND category_name = ?'; },
    localKeyParams: function (r) { return [r.keyword, r.category_name]; },
    localInsert: 'INSERT OR IGNORE INTO keyword_blacklist (keyword, category_name, reason) VALUES (?, ?, ?)',
    localInsertParams: function (r) { return [r.keyword, r.category_name, r.reason]; },
    localUpdate: null,
    cloudTable: 'keyword_blacklist',
    cloudInsert: 'INSERT OR IGNORE INTO keyword_blacklist (keyword, category_name, reason) VALUES (?, ?, ?)',
    cloudInsertParams: function (r) { return [r.keyword, r.category_name, r.reason]; },
    cloudUpdate: null,
    label: '黑名单'
  }
};

// 单表推送（本地→云端，只增不改，count/weight 取 MAX）
async function pushTable(tableKey) {
  if (!connected) return { ok: false, error: '未连接' };
  var def = SINGLE_TABLE_DEFS[tableKey];
  if (!def) return { ok: false, error: '未知表: ' + tableKey };

  var rows = def.localGet();
  var pushed = 0;
  var skipped = 0;
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var whereParts = def.cloudKey.map(function (k) { return k + ' = ?'; });
    var cloudExisting = await cloudGetOne('SELECT id FROM ' + def.cloudTable + ' WHERE ' + whereParts.join(' AND '), def.localKeyParams(r));
    if (!cloudExisting) {
      await cloudRun(def.cloudInsert, def.cloudInsertParams(r));
      pushed++;
    } else if (tableKey === 'mappings') {
      // count 取 MAX
      var localCount = r.count || 0;
      var cloudRow = await cloudGetOne('SELECT count FROM category_mappings WHERE id = ?', [cloudExisting.id]);
      if (cloudRow && localCount > (cloudRow.count || 0)) {
        await cloudRun('UPDATE category_mappings SET count = ? WHERE id = ?', [localCount, cloudExisting.id]);
        pushed++;
      } else { skipped++; }
    } else if (tableKey === 'keyword-rels') {
      // weight/match_count 取 MAX
      var cloudRow = await cloudGetOne('SELECT weight, match_count FROM keyword_category_rel WHERE id = ?', [cloudExisting.id]);
      if (cloudRow) {
        var maxW = Math.max(cloudRow.weight || 1.0, r.weight);
        var maxM = Math.max(cloudRow.match_count || 1, r.match_count);
        if (maxW > cloudRow.weight || maxM > cloudRow.match_count) {
          await cloudRun('UPDATE keyword_category_rel SET weight = ?, match_count = ? WHERE id = ?', [maxW, maxM, cloudExisting.id]);
          pushed++;
        } else { skipped++; }
      }
    } else {
      skipped++;
    }
  }
  console.log('[云同步] ' + def.label + '推送完成: 推送', pushed, '跳过', skipped);
  return { ok: true, table: def.label, pushed: pushed, skipped: skipped };
}

// 单表拉取（云端→本地，只增不改，count/weight 取 MAX）
async function pullTable(tableKey) {
  if (!connected) return { ok: false, error: '未连接' };
  var def = SINGLE_TABLE_DEFS[tableKey];
  if (!def) return { ok: false, error: '未知表: ' + tableKey };

  var cloudRows = await cloudGetAll('SELECT ' + def.cloudCols + ' FROM ' + def.cloudTable);
  var added = 0;
  var updated = 0;
  for (var i = 0; i < cloudRows.length; i++) {
    var r = cloudRows[i];
    var local = dbModule.getOne(def.localKeyMatch(r), def.localKeyParams(r));
    if (!local) {
      dbModule.run(def.localInsert, def.localInsertParams(r));
      added++;
    } else if (tableKey === 'mappings') {
      var maxCount = Math.max(local.count || 0, r.count || 0);
      if (maxCount > local.count) {
        dbModule.run('UPDATE category_mappings SET count = ? WHERE id = ?', [maxCount, local.id]);
        updated++;
      }
    } else if (tableKey === 'keyword-rels') {
      var maxW = Math.max(local.weight || 1.0, r.weight || 1.0);
      var maxM = Math.max(local.match_count || 1, r.match_count || 1);
      if (maxW > local.weight || maxM > local.match_count) {
        dbModule.run('UPDATE keyword_category_rel SET weight = ?, match_count = ? WHERE id = ?', [maxW, maxM, local.id]);
        updated++;
      }
    }
  }
  dbModule.scheduleSave();
  console.log('[云同步] ' + def.label + '拉取完成: 新增', added, '更新', updated);
  return { ok: true, table: def.label, cloudTotal: cloudRows.length, added: added, updated: updated };
}

// 获取状态
function getStatus() {
  return {
    connected: connected,
    lastSyncTime: lastSyncTime,
    config: getConfig() ? true : false
  };
}

module.exports = {
  connect,
  createTables,
  cloudRun,
  cloudGetOne,
  cloudGetAll,
  getMappings,
  saveMapping,
  getKeywordRels,
  saveKeywordRel,
  getSynonyms,
  getBlacklisted,
  getTreePath,
  saveProductToLocalAndCloud,
  uploadLocalToCloud,
  downloadCloudToLocal,
  bidirectionalSync,
  uploadTree,
  downloadTree,
  uploadProducts,
  downloadProducts,
  pushTable,
  pullTable,
  getStatus,
  getConfig,
  saveConfig,
  get connected() { return connected; }
};
