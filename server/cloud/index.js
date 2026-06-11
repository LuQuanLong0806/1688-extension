// Turso 云端 SQLite — 连接管理 + 配置 + 云操作基础 + 统一导出
const { createClient } = require('@libsql/client');
const dbModule = require('../db');

// 共享状态对象（传给子模块）
var cloud = {
  client: null,
  connected: false,
  lastSyncTime: null,

  // 云端操作辅助函数
  run: async function (sql, params) {
    if (!cloud.connected || !cloud.client) return null;
    try {
      var result = await cloud.client.execute({ sql: sql, args: params || [] });
      return result;
    } catch (e) {
      console.error('[云同步] run 失败:', e.message);
      return null;
    }
  },
  getOne: async function (sql, params) {
    if (!cloud.connected || !cloud.client) return null;
    try {
      var result = await cloud.client.execute({ sql: sql, args: params || [] });
      if (result.rows && result.rows.length > 0) return result.rows[0];
      return null;
    } catch (e) {
      console.error('[云同步] getOne 失败:', e.message);
      return null;
    }
  },
  getAll: async function (sql, params) {
    if (!cloud.connected || !cloud.client) return [];
    try {
      var result = await cloud.client.execute({ sql: sql, args: params || [] });
      return result.rows || [];
    } catch (e) {
      console.error('[云同步] getAll 失败:', e.message);
      return [];
    }
  }
};

// 云端表结构定义
var CLOUD_TABLE_DEFS = [
  { name: 'category_mappings', ddl: 'CREATE TABLE IF NOT EXISTS category_mappings (id INTEGER PRIMARY KEY AUTOINCREMENT, category_name TEXT NOT NULL, custom_category TEXT NOT NULL, count INTEGER DEFAULT 1, source TEXT DEFAULT \'auto\', deleted INTEGER DEFAULT 0, created_at TEXT DEFAULT \'\', updated_at TEXT DEFAULT \'\', UNIQUE(category_name, custom_category))' },
  { name: 'keyword_category_rel', ddl: 'CREATE TABLE IF NOT EXISTS keyword_category_rel (id INTEGER PRIMARY KEY AUTOINCREMENT, keyword TEXT NOT NULL, category_name TEXT NOT NULL, weight REAL DEFAULT 1.0, match_count INTEGER DEFAULT 1, valid INTEGER DEFAULT 1, source TEXT DEFAULT \'auto\', created_at TEXT DEFAULT \'\', updated_at TEXT DEFAULT \'\', UNIQUE(keyword, category_name))' },
  { name: 'keyword_synonyms', ddl: 'CREATE TABLE IF NOT EXISTS keyword_synonyms (id INTEGER PRIMARY KEY AUTOINCREMENT, word_a TEXT NOT NULL, word_b TEXT NOT NULL, created_at TEXT DEFAULT \'\', updated_at TEXT DEFAULT \'\', UNIQUE(word_a, word_b))' },
  { name: 'keyword_blacklist', ddl: 'CREATE TABLE IF NOT EXISTS keyword_blacklist (id INTEGER PRIMARY KEY AUTOINCREMENT, keyword TEXT NOT NULL, category_name TEXT NOT NULL, reason TEXT DEFAULT \'\', count INTEGER DEFAULT 1, created_at TEXT DEFAULT \'\', updated_at TEXT DEFAULT \'\', UNIQUE(keyword, category_name))' },
  { name: 'category_config', ddl: 'CREATE TABLE IF NOT EXISTS category_config (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, value TEXT NOT NULL, group_name TEXT DEFAULT \'\', description TEXT DEFAULT \'\', sort_order INTEGER DEFAULT 0, deleted INTEGER DEFAULT 0, created_at TEXT DEFAULT \'\', updated_at TEXT DEFAULT \'\', UNIQUE(type, value, group_name))' },
  { name: 'dxm_category_tree', ddl: 'CREATE TABLE IF NOT EXISTS dxm_category_tree (cat_id INTEGER PRIMARY KEY, cat_name TEXT NOT NULL, parent_cat_id INTEGER DEFAULT 0, cat_level INTEGER DEFAULT 1, is_leaf INTEGER DEFAULT 0, path TEXT DEFAULT \'\', sync_at TEXT DEFAULT \'\', created_at TEXT DEFAULT \'\', updated_at TEXT DEFAULT \'\')' },
  { name: 'products', ddl: 'CREATE TABLE IF NOT EXISTS products (uid TEXT PRIMARY KEY, source_url TEXT DEFAULT \'\', title TEXT, main_images TEXT, desc_images TEXT, detail_images TEXT, attrs TEXT, skus TEXT, category TEXT, custom_category TEXT, dxm_category TEXT, manual_category TEXT, status INTEGER DEFAULT 0, deleted INTEGER DEFAULT 0, from_machine TEXT DEFAULT \'\', store_name TEXT DEFAULT \'\', variant_attr_name TEXT DEFAULT \'\', product_no TEXT DEFAULT \'\', variant_attr_name2 TEXT DEFAULT \'\', variant_attr_name3 TEXT DEFAULT \'\', variant_attr_images TEXT DEFAULT \'\', original_images TEXT DEFAULT \'\', created_at TEXT, updated_at TEXT, automation_stage TEXT DEFAULT \'none\', automation_log TEXT DEFAULT \'\', automation_issues TEXT DEFAULT \'\', automation_started_at TEXT, automation_finished_at TEXT)' }
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

// 解析 DDL 提取列定义
function parseColumnsFromDDL(ddl) {
  var m = ddl.match(/\((.+)\)/s);
  if (!m) return [];
  var body = m[1];
  var cols = [];
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
  var last = body.substring(start).trim();
  if (last && !/^(UNIQUE|PRIMARY|CHECK|FOREIGN)/i.test(last)) {
    var tokens = last.split(/\s+/);
    var defMatch = last.match(/DEFAULT\s+(\S+)/i);
    cols.push({ name: tokens[0], full: last, hasDefault: !!defMatch });
  }
  return cols;
}

// 自动补列
async function migrateCloudSchema() {
  if (!cloud.client) return;
  for (var t = 0; t < CLOUD_TABLE_DEFS.length; t++) {
    var def = CLOUD_TABLE_DEFS[t];
    var expected = parseColumnsFromDDL(def.ddl);
    if (!expected.length) continue;
    var actual = [];
    try {
      var info = await cloud.client.execute('PRAGMA table_info(' + def.name + ')');
      actual = (info.rows || []).map(function (r) { return r.name; });
    } catch (e) { continue; }
    for (var c = 0; c < expected.length; c++) {
      // products.uid 由 migrateProductsUid 单独处理（旧表不能 ADD PRIMARY KEY 列）
      if (def.name === 'products' && expected[c].name === 'uid') continue;
      if (actual.indexOf(expected[c].name) < 0) {
        try {
          await cloud.client.execute('ALTER TABLE ' + def.name + ' ADD COLUMN ' + expected[c].full);
          console.log('[云同步] 补列: ' + def.name + '.' + expected[c].name);
        } catch (e) {
          console.error('[云同步] 补列失败: ' + def.name + '.' + expected[c].name + ':', e.message);
        }
      }
    }
  }
}

// 回填云表已有行的 updated_at（一次性行为）
async function backfillTimestamps() {
  if (!cloud.client) return;
  var tables = ['category_mappings', 'keyword_synonyms', 'keyword_blacklist', 'category_config', 'dxm_category_tree'];
  for (var t = 0; t < tables.length; t++) {
    try {
      await cloud.client.execute("UPDATE " + tables[t] + " SET updated_at = datetime('now', '+8 hours') WHERE updated_at = '' OR updated_at IS NULL");
    } catch (e) {}
  }
}

// 在云端建表
async function createTables() {
  if (!cloud.client) return false;
  for (var i = 0; i < CLOUD_TABLE_DEFS.length; i++) {
    try {
      await cloud.client.execute(CLOUD_TABLE_DEFS[i].ddl);
    } catch (e) {
      console.error('[云同步] 建表 ' + CLOUD_TABLE_DEFS[i].name + ' 失败:', e.message);
    }
  }
  console.log('[云同步] 建表完成');
  await migrateCloudSchema();
  await migrateProductsUid();
  await backfillTimestamps();
  return true;
}

// 旧云端 products 表 uid 迁移
async function migrateProductsUid() {
  if (!cloud.client) return;
  try {
    // 检查是否需要重建表（source_url 是旧 PK）
    var needRebuild = false;
    try {
      var pkInfo = await cloud.client.execute('PRAGMA table_info(products)');
      var pkCols = (pkInfo.rows || []).filter(function (r) { return r.pk > 0; });
      if (pkCols.length === 1 && pkCols[0].name === 'source_url') {
        needRebuild = true;
        console.log('[云同步] 检测到旧 products 表 PK=source_url，需要重建');
      }
    } catch (e) {}

    if (needRebuild) {
      // 重建表：uid 做 PK，source_url 变普通列
      await cloud.client.execute('CREATE TABLE IF NOT EXISTS products_new (uid TEXT PRIMARY KEY, source_url TEXT DEFAULT \'\', title TEXT, main_images TEXT, desc_images TEXT, detail_images TEXT, attrs TEXT, skus TEXT, category TEXT, custom_category TEXT, dxm_category TEXT, manual_category TEXT, status INTEGER DEFAULT 0, deleted INTEGER DEFAULT 0, from_machine TEXT DEFAULT \'\', created_at TEXT, updated_at TEXT, automation_stage TEXT DEFAULT \'none\', automation_log TEXT DEFAULT \'\', automation_issues TEXT DEFAULT \'\', automation_started_at TEXT, automation_finished_at TEXT)');
      // 复制数据（uid 为空的先生成）
      var rows = await cloud.client.execute("SELECT rowid, uid, source_url, title, main_images, desc_images, detail_images, attrs, skus, category, custom_category, dxm_category, manual_category, status, deleted, from_machine, created_at, updated_at FROM products");
      var count = 0;
      for (var i = 0; i < rows.rows.length; i++) {
        var r = rows.rows[i];
        var uid = r.uid;
        if (!uid) { uid = dbModule.generateUid(); }
        try {
          await cloud.client.execute(
            'INSERT OR IGNORE INTO products_new (uid, source_url, title, main_images, desc_images, detail_images, attrs, skus, category, custom_category, dxm_category, manual_category, status, deleted, from_machine, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [uid, r.source_url || '', r.title, r.main_images, r.desc_images, r.detail_images, r.attrs, r.skus, r.category, r.custom_category, r.dxm_category, r.manual_category, r.status, r.deleted, r.from_machine, r.created_at, r.updated_at]
          );
          count++;
        } catch (rowErr) {
          console.error('[云同步] 迁移行失败:', rowErr.message);
        }
      }
      // 验证新表行数 >= 旧表
      var oldCount = rows.rows.length;
      var newCount = (await cloud.client.execute('SELECT COUNT(*) as cnt FROM products_new')).rows[0].cnt;
      if (newCount < oldCount) {
        console.error('[云同步] 迁移数据丢失: 旧 ' + oldCount + ' 条, 新 ' + newCount + ' 条, 中止重建');
        await cloud.client.execute('DROP TABLE products_new');
        return;
      }
      console.log('[云同步] 重建 products 表: 迁移 ' + count + '/' + oldCount + ' 条, 验证通过');
      // 安全切换：先保留旧表做备份，确认新表OK后再删
      await cloud.client.execute('ALTER TABLE products RENAME TO products_old');
      await cloud.client.execute('ALTER TABLE products_new RENAME TO products');
      // 保留旧表作为备份，不删除
      console.log('[云同步] products 表重建完成');
      return;
    }

    // 非重建场景：确保 uid 列存在 + 回填
    var info = await cloud.client.execute('PRAGMA table_info(products)');
    var cols = (info.rows || []).map(function (r) { return r.name; });
    if (cols.indexOf('uid') < 0) {
      try {
        await cloud.client.execute("ALTER TABLE products ADD COLUMN uid TEXT DEFAULT ''");
        console.log('[云同步] 补列: products.uid');
      } catch (alterErr) {
        console.error('[云同步] ALTER TABLE products ADD uid 失败:', alterErr.message);
        return;
      }
    }
    var info2 = await cloud.client.execute('PRAGMA table_info(products)');
    var cols2 = (info2.rows || []).map(function (r) { return r.name; });
    if (cols2.indexOf('uid') < 0) {
      console.error('[云同步] uid 列仍不存在，跳过回填');
      return;
    }
    // 为空 uid 的行回填
    var emptyRows = await cloud.client.execute("SELECT rowid FROM products WHERE uid IS NULL OR uid = ''");
    if (emptyRows.rows && emptyRows.rows.length > 0) {
      console.log('[云同步] 回填 products uid: ' + emptyRows.rows.length + ' 条...');
      for (var i = 0; i < emptyRows.rows.length; i++) {
        var uid = dbModule.generateUid();
        await cloud.client.execute('UPDATE products SET uid = ? WHERE rowid = ?', [uid, emptyRows.rows[i].rowid]);
      }
      console.log('[云同步] products uid 回填完成');
    }
  } catch (e) {
    console.error('[云同步] products uid 迁移失败:', e.message);
  }
}

// 初始化连接
async function connect() {
  var config = getConfig();
  if (!config || !config.url || !config.token) {
    console.log('[云同步] 未配置 Turso，使用本地模式');
    cloud.connected = false;
    return false;
  }
  try {
    cloud.client = createClient({ url: config.url, authToken: config.token });
    var result = await cloud.client.execute('SELECT 1 as ok');
    if (result.rows && result.rows.length > 0) {
      cloud.connected = true;
      console.log('[云同步] Turso 连接成功');
      await createTables();
      return true;
    }
  } catch (e) {
    console.log('[云同步] Turso 连接失败:', e.message);
    cloud.connected = false;
    cloud.client = null;
  }
  return false;
}

// 兼容旧接口：cloudRun/cloudGetOne/cloudGetAll
async function cloudRun(sql, params) { return cloud.run(sql, params); }
async function cloudGetOne(sql, params) { return cloud.getOne(sql, params); }
async function cloudGetAll(sql, params) { return cloud.getAll(sql, params); }

function disconnect() {
  cloud.client = null;
  cloud.connected = false;
  cloud.lastSyncTime = null;
  console.log('[云同步] 已主动断开 Turso 连接');
  return true;
}

function getStatus() {
  return {
    connected: cloud.connected,
    lastSyncTime: cloud.lastSyncTime,
    config: getConfig() ? true : false
  };
}

// 初始化子模块
var knowledge = require('./knowledge')(cloud, dbModule);
var sync = require('./sync')(cloud, dbModule);

module.exports = {
  connect: connect,
  disconnect: disconnect,
  createTables: createTables,
  cloudRun: cloudRun,
  cloudGetOne: cloudGetOne,
  cloudGetAll: cloudGetAll,
  getConfig: getConfig,
  saveConfig: saveConfig,
  getStatus: getStatus,
  // knowledge
  getMappings: knowledge.getMappings,
  saveMapping: knowledge.saveMapping,
  getKeywordRels: knowledge.getKeywordRels,
  saveKeywordRel: knowledge.saveKeywordRel,
  invalidateAutoRels: knowledge.invalidateAutoRels,
  getSynonyms: knowledge.getSynonyms,
  getBlacklisted: knowledge.getBlacklisted,
  getBlacklistCounts: knowledge.getBlacklistCounts,
  upsertBlacklist: knowledge.upsertBlacklist,
  reduceBlacklist: knowledge.reduceBlacklist,
  getTreePath: knowledge.getTreePath,
  getCategoryConfig: knowledge.getCategoryConfig,
  getAllCategoryConfig: knowledge.getAllCategoryConfig,
  saveCategoryConfig: knowledge.saveCategoryConfig,
  deleteCategoryConfig: knowledge.deleteCategoryConfig,
  seedCategoryConfig: knowledge.seedCategoryConfig,
  // sync
  saveProductToLocalAndCloud: sync.saveProductToLocalAndCloud,
  uploadLocalToCloud: sync.uploadLocalToCloud,
  downloadCloudToLocal: sync.downloadCloudToLocal,
  bidirectionalSync: sync.bidirectionalSync,
  uploadTree: sync.uploadTree,
  downloadTree: sync.downloadTree,
  uploadProducts: sync.uploadProducts,
  downloadProducts: sync.downloadProducts,
  pushTable: sync.pushTable,
  pullTable: sync.pullTable,
  // 状态
  get connected() { return cloud.connected; }
};
