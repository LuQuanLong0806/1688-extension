// sync.test.js — 多电脑数据合并逻辑测试
// 模拟两台电脑各自有本地数据库，通过云端同步后验证数据完整性
const initSqlJs = require('sql.js');

let SQL;
let localDb; // 本地数据库（模拟电脑A）
let cloudDb; // 云端数据库（模拟 Turso）

// 表结构 DDL
const TABLE_DDLS = [
  `CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY AUTOINCREMENT, uid TEXT DEFAULT '', source_url TEXT NOT NULL, title TEXT, main_images TEXT DEFAULT '', desc_images TEXT DEFAULT '', detail_images TEXT DEFAULT '', attrs TEXT DEFAULT '', skus TEXT DEFAULT '', status INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, category TEXT DEFAULT '', custom_category TEXT DEFAULT '', dxm_category TEXT DEFAULT '', manual_category TEXT DEFAULT '', deleted INTEGER DEFAULT 0, automation_stage TEXT DEFAULT 'none', automation_log TEXT DEFAULT '', automation_issues TEXT DEFAULT '', automation_started_at DATETIME, automation_finished_at DATETIME)`,
  `CREATE TABLE IF NOT EXISTS category_mappings (id INTEGER PRIMARY KEY AUTOINCREMENT, category_name TEXT NOT NULL, custom_category TEXT NOT NULL, count INTEGER DEFAULT 1, source TEXT DEFAULT 'auto', UNIQUE(category_name, custom_category))`,
  `CREATE TABLE IF NOT EXISTS keyword_category_rel (id INTEGER PRIMARY KEY AUTOINCREMENT, keyword TEXT NOT NULL, category_name TEXT NOT NULL, weight REAL DEFAULT 1.0, match_count INTEGER DEFAULT 1, valid INTEGER DEFAULT 1, source TEXT DEFAULT 'auto', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE(keyword, category_name))`,
  `CREATE TABLE IF NOT EXISTS keyword_synonyms (id INTEGER PRIMARY KEY AUTOINCREMENT, word_a TEXT NOT NULL, word_b TEXT NOT NULL, UNIQUE(word_a, word_b))`,
  `CREATE TABLE IF NOT EXISTS keyword_blacklist (id INTEGER PRIMARY KEY AUTOINCREMENT, keyword TEXT NOT NULL, category_name TEXT NOT NULL, reason TEXT DEFAULT '', count INTEGER DEFAULT 1, updated_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(keyword, category_name))`,
  `CREATE TABLE IF NOT EXISTS category_config (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, value TEXT NOT NULL, group_name TEXT DEFAULT '', description TEXT DEFAULT '', sort_order INTEGER DEFAULT 0, deleted INTEGER DEFAULT 0, UNIQUE(type, value, group_name))`,
  `CREATE TABLE IF NOT EXISTS dxm_category_tree (cat_id INTEGER PRIMARY KEY, cat_name TEXT NOT NULL, parent_cat_id INTEGER DEFAULT 0, cat_level INTEGER DEFAULT 1, is_leaf INTEGER DEFAULT 0, path TEXT DEFAULT '', sync_at DATETIME DEFAULT CURRENT_TIMESTAMP)`
];

// ===== 数据库操作封装 =====
function dbGetAll(database, sql, params) {
  const stmt = database.prepare(sql);
  if (params) stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}
function dbGetOne(database, sql, params) {
  const stmt = database.prepare(sql);
  if (params) stmt.bind(params);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
}
function dbRun(database, sql, params) {
  database.run(sql, params);
}

// 测试用 uid 生成
var uidCounter = 1;
function generateTestUid() {
  return 'uid_' + (uidCounter++) + '_' + Date.now().toString(36);
}

// 创建模拟的 cloud 对象（使用内存 SQLite 模拟云端数据库）
function createMockCloud() {
  const cloud = {
    connected: true,
    lastSyncTime: null,
    client: {
      batch: null, // 稍后设置
      execute: null
    },
    run: function (sql, params) {
      dbRun(cloudDb, sql, params);
      return Promise.resolve();
    },
    getOne: function (sql, params) {
      return Promise.resolve(dbGetOne(cloudDb, sql, params));
    },
    getAll: function (sql, params) {
      return Promise.resolve(dbGetAll(cloudDb, sql, params));
    }
  };
  cloud.client.batch = async function (stmts) {
    for (const s of stmts) {
      dbRun(cloudDb, s.sql, s.args);
    }
  };
  cloud.client.execute = async function (opts) {
    dbRun(cloudDb, opts.sql, opts.args);
  };
  return cloud;
}

// 创建模拟的 db 对象（本地数据库）
function createMockDb() {
  return {
    getAll: function (sql, params) { return dbGetAll(localDb, sql, params); },
    getOne: function (sql, params) { return dbGetOne(localDb, sql, params); },
    run: function (sql, params) { dbRun(localDb, sql, params); },
    scheduleSave: function () {},
    saveNow: function () {},
    treeGetAll: function (sql, params) { return dbGetAll(localDb, sql, params); },
    treeGetOne: function (sql, params) { return dbGetOne(localDb, sql, params); },
    treeRun: function (sql, params) { dbRun(localDb, sql, params); },
    scheduleTreeSave: function () {}
  };
}

// 加载 sync 模块
let syncModule;
function getSync() {
  if (!syncModule) {
    const cloud = createMockCloud();
    const db = createMockDb();
    syncModule = require('../../cloud/sync')(cloud, db);
  }
  return syncModule;
}

beforeAll(async () => {
  SQL = await initSqlJs();
});

beforeEach(() => {
  uidCounter = 1;
  localDb = new SQL.Database();
  cloudDb = new SQL.Database();
  for (const ddl of TABLE_DDLS) {
    localDb.run(ddl);
    cloudDb.run(ddl);
  }
  localDb.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_products_uid ON products(uid)');
  cloudDb.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_products_uid ON products(uid)');
  // 每次重新创建 sync 模块以使用新数据库
  const cloud = createMockCloud();
  const db = createMockDb();
  syncModule = require('../../cloud/sync')(cloud, db);
});

afterEach(() => {
  localDb.close();
  cloudDb.close();
});

// ===== 辅助函数 =====
function localCount(table) {
  const row = dbGetOne(localDb, 'SELECT COUNT(*) as cnt FROM ' + table);
  return row ? row.cnt : 0;
}
function cloudCount(table) {
  const row = dbGetOne(cloudDb, 'SELECT COUNT(*) as cnt FROM ' + table);
  return row ? row.cnt : 0;
}

// ============================================================
// 1. category_mappings 同步测试
// ============================================================
describe('category_mappings 同步', () => {
  test('本地新增映射 → 上传到云端', async () => {
    dbRun(localDb, "INSERT INTO category_mappings (category_name, custom_category, count, source) VALUES ('毛巾', '家居日用/毛巾', 5, 'auto')");
    const result = await syncModule.uploadLocalToCloud();
    expect(result.ok).toBe(true);
    expect(cloudCount('category_mappings')).toBe(1);
    const cloudRow = dbGetOne(cloudDb, "SELECT count FROM category_mappings WHERE category_name = '毛巾'");
    expect(cloudRow.count).toBe(5);
  });

  test('云端有更高count → 下载时本地count更新为较大值', async () => {
    dbRun(localDb, "INSERT INTO category_mappings (category_name, custom_category, count, source) VALUES ('毛巾', '家居日用/毛巾', 3, 'auto')");
    dbRun(cloudDb, "INSERT INTO category_mappings (category_name, custom_category, count, source) VALUES ('毛巾', '家居日用/毛巾', 10, 'auto')");
    await syncModule.downloadCloudToLocal();
    const localRow = dbGetOne(localDb, "SELECT count FROM category_mappings WHERE category_name = '毛巾'");
    expect(localRow.count).toBe(10);
  });

  test('本地count更高 → 上传时云端更新为较大值', async () => {
    dbRun(localDb, "INSERT INTO category_mappings (category_name, custom_category, count, source) VALUES ('毛巾', '家居日用/毛巾', 15, 'auto')");
    dbRun(cloudDb, "INSERT INTO category_mappings (category_name, custom_category, count, source) VALUES ('毛巾', '家居日用/毛巾', 5, 'auto')");
    await syncModule.uploadLocalToCloud();
    const cloudRow = dbGetOne(cloudDb, "SELECT count FROM category_mappings WHERE category_name = '毛巾'");
    expect(cloudRow.count).toBe(15);
  });

  test('双方各有独有映射 → 双向同步后两边数据完整', async () => {
    // 电脑A独有
    dbRun(localDb, "INSERT INTO category_mappings (category_name, custom_category, count, source) VALUES ('毛巾', '家居日用/毛巾', 3, 'auto')");
    // 云端(电脑B)独有
    dbRun(cloudDb, "INSERT INTO category_mappings (category_name, custom_category, count, source) VALUES ('牙刷', '家居日用/牙刷', 7, 'auto')");
    await syncModule.bidirectionalSync();
    // 本地应该有两个映射
    expect(localCount('category_mappings')).toBe(2);
    // 云端应该有两个映射
    expect(cloudCount('category_mappings')).toBe(2);
    const localTowel = dbGetOne(localDb, "SELECT count FROM category_mappings WHERE category_name = '毛巾'");
    expect(localTowel.count).toBe(3);
    const localBrush = dbGetOne(localDb, "SELECT count FROM category_mappings WHERE category_name = '牙刷'");
    expect(localBrush.count).toBe(7);
  });

  test('双方同一映射 count 不同 → Math.max 合并不丢数据', async () => {
    dbRun(localDb, "INSERT INTO category_mappings (category_name, custom_category, count, source) VALUES ('毛巾', '家居日用/毛巾', 8, 'auto')");
    dbRun(cloudDb, "INSERT INTO category_mappings (category_name, custom_category, count, source) VALUES ('毛巾', '家居日用/毛巾', 20, 'auto')");
    await syncModule.bidirectionalSync();
    const localRow = dbGetOne(localDb, "SELECT count FROM category_mappings WHERE category_name = '毛巾'");
    expect(localRow.count).toBe(20);
    const cloudRow = dbGetOne(cloudDb, "SELECT count FROM category_mappings WHERE category_name = '毛巾'");
    expect(cloudRow.count).toBe(20);
  });

  test('pullTable 正确合并映射 count', async () => {
    dbRun(cloudDb, "INSERT INTO category_mappings (category_name, custom_category, count, source) VALUES ('杯子', '家居日用/杯子', 50, 'manual')");
    dbRun(localDb, "INSERT INTO category_mappings (category_name, custom_category, count, source) VALUES ('杯子', '家居日用/杯子', 10, 'auto')");
    const result = await syncModule.pullTable('mappings');
    expect(result.ok).toBe(true);
    expect(result.updated).toBe(1);
    const localRow = dbGetOne(localDb, "SELECT count FROM category_mappings WHERE category_name = '杯子'");
    expect(localRow.count).toBe(50);
  });

  test('pushTable 推送本地新映射到云端', async () => {
    dbRun(localDb, "INSERT INTO category_mappings (category_name, custom_category, count, source) VALUES ('毛巾', '家居日用/毛巾', 5, 'auto')");
    const result = await syncModule.pushTable('mappings');
    expect(result.ok).toBe(true);
    expect(result.pushed).toBe(1);
    expect(cloudCount('category_mappings')).toBe(1);
  });

  test('pushTable 云端count更高时不降级', async () => {
    dbRun(localDb, "INSERT INTO category_mappings (category_name, custom_category, count, source) VALUES ('毛巾', '家居日用/毛巾', 3, 'auto')");
    dbRun(cloudDb, "INSERT INTO category_mappings (category_name, custom_category, count, source) VALUES ('毛巾', '家居日用/毛巾', 10, 'auto')");
    const result = await syncModule.pushTable('mappings');
    expect(result.skipped).toBe(1);
    const cloudRow = dbGetOne(cloudDb, "SELECT count FROM category_mappings WHERE category_name = '毛巾'");
    expect(cloudRow.count).toBe(10);
  });
});

// ============================================================
// 2. keyword_category_rel 同步测试
// ============================================================
describe('keyword_category_rel 同步', () => {
  test('本地新增关联 → 上传到云端', async () => {
    dbRun(localDb, "INSERT INTO keyword_category_rel (keyword, category_name, weight, match_count, valid, source) VALUES ('柔软', '毛巾', 2.5, 10, 1, 'auto')");
    await syncModule.uploadLocalToCloud();
    expect(cloudCount('keyword_category_rel')).toBe(1);
    const cloudRow = dbGetOne(cloudDb, "SELECT weight, match_count FROM keyword_category_rel WHERE keyword = '柔软'");
    expect(cloudRow.weight).toBe(2.5);
    expect(cloudRow.match_count).toBe(10);
  });

  test('双方 weight/match_count 不同 → Math.max 合并', async () => {
    dbRun(localDb, "INSERT INTO keyword_category_rel (keyword, category_name, weight, match_count, valid, source) VALUES ('柔软', '毛巾', 3.0, 5, 1, 'auto')");
    dbRun(cloudDb, "INSERT INTO keyword_category_rel (keyword, category_name, weight, match_count, valid, source) VALUES ('柔软', '毛巾', 1.5, 20, 1, 'auto')");
    await syncModule.bidirectionalSync();
    const localRow = dbGetOne(localDb, "SELECT weight, match_count FROM keyword_category_rel WHERE keyword = '柔软'");
    expect(localRow.weight).toBe(3.0);
    expect(localRow.match_count).toBe(20);
    const cloudRow = dbGetOne(cloudDb, "SELECT weight, match_count FROM keyword_category_rel WHERE keyword = '柔软'");
    expect(cloudRow.weight).toBe(3.0);
    expect(cloudRow.match_count).toBe(20);
  });

  test('pullTable 合并 keyword-rels weight 和 match_count', async () => {
    dbRun(cloudDb, "INSERT INTO keyword_category_rel (keyword, category_name, weight, match_count, valid, source) VALUES ('吸水', '毛巾', 5.0, 100, 1, 'manual')");
    dbRun(localDb, "INSERT INTO keyword_category_rel (keyword, category_name, weight, match_count, valid, source) VALUES ('吸水', '毛巾', 2.0, 30, 1, 'auto')");
    const result = await syncModule.pullTable('keyword-rels');
    expect(result.updated).toBe(1);
    const localRow = dbGetOne(localDb, "SELECT weight, match_count FROM keyword_category_rel WHERE keyword = '吸水'");
    expect(localRow.weight).toBe(5.0);
    expect(localRow.match_count).toBe(100);
  });

  test('valid 字段变更不被同步 — 数据丢失风险场景', async () => {
    // 电脑A标记某关键词为无效
    dbRun(localDb, "INSERT INTO keyword_category_rel (keyword, category_name, weight, match_count, valid, source) VALUES ('爆款', '毛巾', 1.0, 5, 0, 'manual')");
    // 云端（电脑B）该关键词仍有效
    dbRun(cloudDb, "INSERT INTO keyword_category_rel (keyword, category_name, weight, match_count, valid, source) VALUES ('爆款', '毛巾', 1.0, 5, 1, 'auto')");
    // 上传：只更新 weight/match_count，不更新 valid
    await syncModule.uploadLocalToCloud();
    const cloudRow = dbGetOne(cloudDb, "SELECT valid FROM keyword_category_rel WHERE keyword = '爆款'");
    // ISSUE: valid 仍然是 1，电脑A标记的 valid=0 丢失
    expect(cloudRow.valid).toBe(1); // 当前行为：valid 未同步
  });
});

// ============================================================
// 3. keyword_synonyms / keyword_blacklist 同步测试
// ============================================================
describe('keyword_synonyms 同步', () => {
  test('双方各有不同同义词 → 合并后完整', async () => {
    dbRun(localDb, "INSERT INTO keyword_synonyms (word_a, word_b) VALUES ('毛巾', '面巾')");
    dbRun(cloudDb, "INSERT INTO keyword_synonyms (word_a, word_b) VALUES ('牙刷', ' toothbrush')");
    await syncModule.bidirectionalSync();
    expect(localCount('keyword_synonyms')).toBe(2);
    expect(cloudCount('keyword_synonyms')).toBe(2);
  });

  test('重复同义词不会重复插入', async () => {
    dbRun(localDb, "INSERT INTO keyword_synonyms (word_a, word_b) VALUES ('毛巾', '面巾')");
    dbRun(cloudDb, "INSERT INTO keyword_synonyms (word_a, word_b) VALUES ('毛巾', '面巾')");
    await syncModule.uploadLocalToCloud();
    expect(cloudCount('keyword_synonyms')).toBe(1);
  });
});

describe('keyword_blacklist 同步', () => {
  test('双方各有不同黑名单 → 合并后完整', async () => {
    dbRun(localDb, "INSERT INTO keyword_blacklist (keyword, category_name, reason) VALUES ('爆款', '毛巾', '噪词')");
    dbRun(cloudDb, "INSERT INTO keyword_blacklist (keyword, category_name, reason) VALUES ('促销', '牙刷', '噪词')");
    await syncModule.bidirectionalSync();
    expect(localCount('keyword_blacklist')).toBe(2);
    expect(cloudCount('keyword_blacklist')).toBe(2);
  });

  test('重复黑名单不会重复插入', async () => {
    dbRun(localDb, "INSERT INTO keyword_blacklist (keyword, category_name, reason) VALUES ('爆款', '毛巾', '噪词')");
    dbRun(cloudDb, "INSERT INTO keyword_blacklist (keyword, category_name, reason) VALUES ('爆款', '毛巾', '其他')");
    await syncModule.downloadCloudToLocal();
    // INSERT OR IGNORE 不会更新 reason
    const rows = dbGetAll(localDb, 'SELECT reason FROM keyword_blacklist');
    expect(rows.length).toBe(1);
    expect(rows[0].reason).toBe('噪词'); // 本地原值保留，云端 reason 丢失
  });
});

// ============================================================
// 4. category_config 同步测试
// ============================================================
describe('category_config 同步', () => {
  test('本地配置上传到云端', async () => {
    dbRun(localDb, "INSERT INTO category_config (type, value, group_name, description, sort_order) VALUES ('mutex', '家居', '家居日用', '', 0)");
    await syncModule.uploadLocalToCloud();
    expect(cloudCount('category_config')).toBe(1);
  });

  test('INSERT OR REPLACE 下载时可能覆盖本地修改 — 数据丢失风险', async () => {
    // 电脑A修改了 sort_order
    dbRun(localDb, "INSERT INTO category_config (type, value, group_name, description, sort_order) VALUES ('mutex', '家居', '家居日用', '电脑A修改', 5)");
    // 云端（电脑B推送的旧版本）sort_order 不同
    dbRun(cloudDb, "INSERT INTO category_config (type, value, group_name, description, sort_order) VALUES ('mutex', '家居', '家居日用', '旧描述', 0)");
    await syncModule.downloadCloudToLocal();
    const localRow = dbGetOne(localDb, "SELECT description, sort_order FROM category_config WHERE value = '家居'");
    // ISSUE: downloadCloudToLocal 用 INSERT OR REPLACE 直接覆盖
    // 电脑A的 description='电脑A修改', sort_order=5 被云端旧版覆盖
    expect(localRow.description).toBe('旧描述');
    expect(localRow.sort_order).toBe(0);
  });

  test('pullTable 对 category_config 使用 INSERT OR REPLACE', async () => {
    dbRun(cloudDb, "INSERT INTO category_config (type, value, group_name, description, sort_order) VALUES ('noise', '爆款', '', '噪词', 1)");
    const result = await syncModule.pullTable('category-config');
    expect(result.ok).toBe(true);
    expect(result.added).toBe(1);
    expect(localCount('category_config')).toBe(1);
  });
});

// ============================================================
// 5. 商品同步测试
// ============================================================
describe('商品同步', () => {
  test('本地新商品上传到云端', async () => {
    dbRun(localDb, "INSERT INTO products (uid, source_url, title, category, custom_category) VALUES ('u1', 'https://detail.1688.com/offer1.html', '纯棉毛巾', '{\"leafCategoryName\":\"毛巾\"}', '家居/毛巾')");
    const result = await syncModule.uploadProducts();
    expect(result.ok).toBe(true);
    expect(result.uploaded).toBe(1);
    expect(cloudCount('products')).toBe(1);
  });

  test('云端新商品下载到本地', async () => {
    dbRun(cloudDb, "INSERT INTO products (uid, source_url, title, category, custom_category) VALUES ('u1', 'https://detail.1688.com/offer1.html', '纯棉毛巾', '', '')");
    const result = await syncModule.downloadProducts();
    expect(result.ok).toBe(true);
    expect(result.added).toBe(1);
    expect(localCount('products')).toBe(1);
  });

  test('双方各有不同商品 → 双向同步后完整', async () => {
    dbRun(localDb, "INSERT INTO products (uid, source_url, title) VALUES ('u1', 'https://detail.1688.com/offer1.html', '毛巾')");
    dbRun(cloudDb, "INSERT INTO products (uid, source_url, title) VALUES ('u2', 'https://detail.1688.com/offer2.html', '牙刷')");
    await syncModule.uploadProducts();
    await syncModule.downloadProducts();
    expect(localCount('products')).toBe(2);
    expect(cloudCount('products')).toBe(2);
  });

  test('云端已删除商品 → 下载时同步删除状态', async () => {
    dbRun(localDb, "INSERT INTO products (uid, source_url, title, deleted) VALUES ('u1', 'https://detail.1688.com/offer1.html', '毛巾', 0)");
    dbRun(cloudDb, "INSERT INTO products (uid, source_url, title, deleted) VALUES ('u1', 'https://detail.1688.com/offer1.html', '毛巾', 1)");
    const result = await syncModule.downloadProducts();
    expect(result.deletedSynced).toBe(1);
    const localRow = dbGetOne(localDb, "SELECT deleted FROM products WHERE uid = 'u1'");
    expect(localRow.deleted).toBe(1);
  });

  test('云端已删除商品不在本地时 → 跳过不插入', async () => {
    dbRun(cloudDb, "INSERT INTO products (uid, source_url, title, deleted) VALUES ('u1', 'https://detail.1688.com/offer1.html', '毛巾', 1)");
    const result = await syncModule.downloadProducts();
    expect(result.skipped).toBe(1);
    expect(result.added).toBe(0);
    expect(localCount('products')).toBe(0);
  });

  test('uploadProducts 本地更新后再次上传 → 云端字段同步更新', async () => {
    dbRun(localDb, "INSERT INTO products (uid, source_url, title, custom_category, updated_at) VALUES ('u1', 'https://detail.1688.com/offer1.html', '毛巾', '', '2025-05-25 10:00:00')");
    await syncModule.uploadProducts();
    dbRun(localDb, "UPDATE products SET custom_category = '家居/毛巾', updated_at = '2025-05-25 12:00:00' WHERE uid = 'u1'");
    await syncModule.uploadProducts();
    const cloudRow = dbGetOne(cloudDb, "SELECT custom_category, updated_at FROM products WHERE uid = 'u1'");
    expect(cloudRow.custom_category).toBe('家居/毛巾');
    expect(cloudRow.updated_at).toBe('2025-05-25 12:00:00');
  });

  test('uploadProducts 云端更新时 → 本地旧数据不覆盖云端', async () => {
    dbRun(cloudDb, "INSERT INTO products (uid, source_url, title, custom_category, updated_at) VALUES ('u1', 'https://detail.1688.com/offer1.html', '毛巾（修改）', '新分类', '2025-05-25 14:00:00')");
    dbRun(localDb, "INSERT INTO products (uid, source_url, title, custom_category, updated_at) VALUES ('u1', 'https://detail.1688.com/offer1.html', '毛巾', '旧分类', '2025-05-25 10:00:00')");
    await syncModule.uploadProducts();
    const cloudRow = dbGetOne(cloudDb, "SELECT title, custom_category FROM products WHERE uid = 'u1'");
    expect(cloudRow.title).toBe('毛巾（修改）');
    expect(cloudRow.custom_category).toBe('新分类');
  });

  test('downloadProducts 云端更新时 → 同步字段到本地', async () => {
    dbRun(localDb, "INSERT INTO products (uid, source_url, title, custom_category, updated_at) VALUES ('u1', 'https://detail.1688.com/offer1.html', '毛巾', '旧分类', '2025-05-25 10:00:00')");
    dbRun(cloudDb, "INSERT INTO products (uid, source_url, title, custom_category, updated_at) VALUES ('u1', 'https://detail.1688.com/offer1.html', '毛巾（修改）', '新分类', '2025-05-25 14:00:00')");
    await syncModule.downloadProducts();
    const localRow = dbGetOne(localDb, "SELECT title, custom_category, updated_at FROM products WHERE uid = 'u1'");
    expect(localRow.title).toBe('毛巾（修改）');
    expect(localRow.custom_category).toBe('新分类');
    expect(localRow.updated_at).toBe('2025-05-25 14:00:00');
  });

  test('downloadProducts 本地更新时 → 云端旧数据不覆盖本地', async () => {
    dbRun(localDb, "INSERT INTO products (uid, source_url, title, custom_category, updated_at) VALUES ('u1', 'https://detail.1688.com/offer1.html', '毛巾（最新）', '最新分类', '2025-05-25 14:00:00')");
    dbRun(cloudDb, "INSERT INTO products (uid, source_url, title, custom_category, updated_at) VALUES ('u1', 'https://detail.1688.com/offer1.html', '毛巾（旧）', '旧分类', '2025-05-25 10:00:00')");
    await syncModule.downloadProducts();
    const localRow = dbGetOne(localDb, "SELECT title, custom_category FROM products WHERE uid = 'u1'");
    expect(localRow.title).toBe('毛巾（最新）');
    expect(localRow.custom_category).toBe('最新分类');
  });

  test('同一 source_url 不同 uid → 两台电脑各采一次，互不覆盖', async () => {
    // 电脑A采集了 offer1
    dbRun(localDb, "INSERT INTO products (uid, source_url, title, custom_category, updated_at) VALUES ('uA', 'https://detail.1688.com/offer1.html', '毛巾A', '分类A', '2025-05-25 10:00:00')");
    await syncModule.uploadProducts();
    // 电脑B也采集了 offer1（不同 uid）
    dbRun(cloudDb, "INSERT INTO products (uid, source_url, title, custom_category, updated_at) VALUES ('uB', 'https://detail.1688.com/offer1.html', '毛巾B', '分类B', '2025-05-25 11:00:00')");
    // 电脑A下载 → 应该两条都在
    await syncModule.downloadProducts();
    expect(localCount('products')).toBe(2);
    expect(cloudCount('products')).toBe(2);
    var localA = dbGetOne(localDb, "SELECT title FROM products WHERE uid = 'uA'");
    var localB = dbGetOne(localDb, "SELECT title FROM products WHERE uid = 'uB'");
    expect(localA.title).toBe('毛巾A');
    expect(localB.title).toBe('毛巾B');
  });

  test('无 uid 的旧记录 → uploadProducts 跳过', async () => {
    dbRun(localDb, "INSERT INTO products (source_url, title) VALUES ('https://detail.1688.com/offer1.html', '旧记录')");
    const result = await syncModule.uploadProducts();
    expect(result.ok).toBe(true);
    // 旧记录 uid 为空，被跳过，uploaded 应为 1 但实际被 filter 掉
    expect(cloudCount('products')).toBe(0);
  });

  test('无 uid 的旧记录 → downloadProducts 跳过', async () => {
    dbRun(cloudDb, "INSERT INTO products (source_url, title) VALUES ('https://detail.1688.com/offer1.html', '旧记录')");
    const result = await syncModule.downloadProducts();
    expect(result.skipped).toBe(1);
    expect(result.added).toBe(0);
  });
});

// ============================================================
// 6. 分类树同步测试
// ============================================================
describe('分类树同步', () => {
  test('本地树上传到云端', async () => {
    dbRun(localDb, "INSERT INTO dxm_category_tree (cat_id, cat_name, parent_cat_id, cat_level, is_leaf, path) VALUES (1001, '毛巾', 100, 3, 1, '家居/卫浴/毛巾')");
    const result = await syncModule.uploadTree();
    expect(result.ok).toBe(true);
    expect(result.uploaded).toBe(1);
  });

  test('云端树下载到本地（新增）', async () => {
    dbRun(cloudDb, "INSERT INTO dxm_category_tree (cat_id, cat_name, parent_cat_id, cat_level, is_leaf, path) VALUES (1001, '毛巾', 100, 3, 1, '家居/卫浴/毛巾')");
    const result = await syncModule.downloadTree();
    expect(result.ok).toBe(true);
    expect(result.added).toBe(1);
    expect(localCount('dxm_category_tree')).toBe(1);
  });

  test('已存在的树节点不会被覆盖', async () => {
    dbRun(localDb, "INSERT INTO dxm_category_tree (cat_id, cat_name, path) VALUES (1001, '毛巾旧名', '家居/毛巾')");
    dbRun(cloudDb, "INSERT INTO dxm_category_tree (cat_id, cat_name, path) VALUES (1001, '毛巾新名', '家居/毛巾')");
    await syncModule.downloadTree();
    // cat_id 已存在，INSERT OR IGNORE 不覆盖
    const localRow = dbGetOne(localDb, "SELECT cat_name FROM dxm_category_tree WHERE cat_id = 1001");
    expect(localRow.cat_name).toBe('毛巾旧名');
  });

  test('双方各有不同树节点 → 双向同步后完整', async () => {
    dbRun(localDb, "INSERT INTO dxm_category_tree (cat_id, cat_name, path) VALUES (1001, '毛巾', '家居/毛巾')");
    dbRun(cloudDb, "INSERT INTO dxm_category_tree (cat_id, cat_name, path) VALUES (2001, '牙刷', '家居/牙刷')");
    await syncModule.uploadTree();
    await syncModule.downloadTree();
    expect(localCount('dxm_category_tree')).toBe(2);
    expect(cloudCount('dxm_category_tree')).toBe(2);
  });
});

// ============================================================
// 7. 断网场景
// ============================================================
describe('断网场景', () => {
  test('cloud 未连接时 uploadLocalToCloud 返回错误', async () => {
    const cloud = createMockCloud();
    cloud.connected = false;
    const db = createMockDb();
    const sync = require('../../cloud/sync')(cloud, db);
    const result = await sync.uploadLocalToCloud();
    expect(result.ok).toBe(false);
    expect(result.error).toBe('未连接');
  });

  test('cloud 未连接时 downloadCloudToLocal 返回错误', async () => {
    const cloud = createMockCloud();
    cloud.connected = false;
    const db = createMockDb();
    const sync = require('../../cloud/sync')(cloud, db);
    const result = await sync.downloadCloudToLocal();
    expect(result.ok).toBe(false);
  });

  test('cloud 未连接时 bidirectionalSync 返回错误', async () => {
    const cloud = createMockCloud();
    cloud.connected = false;
    const db = createMockDb();
    const sync = require('../../cloud/sync')(cloud, db);
    const result = await sync.bidirectionalSync();
    expect(result.ok).toBe(false);
  });
});

// ============================================================
// 8. 空数据边界情况
// ============================================================
describe('空数据同步', () => {
  test('本地无数据时上传不报错', async () => {
    const result = await syncModule.uploadLocalToCloud();
    expect(result.ok).toBe(true);
    expect(result.counts.category_mappings).toBe(0);
    expect(result.counts.keyword_category_rel).toBe(0);
  });

  test('云端无数据时下载不报错', async () => {
    const result = await syncModule.downloadCloudToLocal();
    expect(result.ok).toBe(true);
    expect(result.counts.category_mappings).toBe(0);
  });

  test('空数据双向同步不报错', async () => {
    const result = await syncModule.bidirectionalSync();
    expect(result.ok).toBe(true);
  });
});

// ============================================================
// 9. saveProductToLocalAndCloud 测试
// ============================================================
describe('saveProductToLocalAndCloud', () => {
  test('同时保存到云端', async () => {
    const cloud = createMockCloud();
    const db = createMockDb();
    const sync = require('../../cloud/sync')(cloud, db);
    dbRun(localDb, "INSERT INTO products (uid, source_url, title) VALUES ('u1', 'https://detail.1688.com/offer1.html', '毛巾')");
    sync.saveProductToLocalAndCloud(
      'u1', 'https://detail.1688.com/offer1.html',
      '毛巾', '{}', '', '', '', '2025-05-25 03:00:00', '[]', '[]', '[]', '[]', '[]'
    );
    await new Promise(r => setTimeout(r, 50));
    expect(cloudCount('products')).toBe(1);
  });

  test('云端已存在时 saveProductToLocalAndCloud 全字段更新', async () => {
    dbRun(cloudDb, "INSERT INTO products (uid, source_url, title, custom_category, updated_at) VALUES ('u1', 'https://detail.1688.com/offer1.html', '旧标题', '旧分类', '2025-05-25 10:00:00')");
    syncModule.saveProductToLocalAndCloud(
      'u1', 'https://detail.1688.com/offer1.html',
      '新标题', '{}', '新自定义分类', '', '手动分类', '2025-05-25 03:00:00',
      '["img1"]', '["desc1"]', '["detail1"]', '["attr1"]', '["sku1"]'
    );
    await new Promise(r => setTimeout(r, 50));
    const cloudRow = dbGetOne(cloudDb, "SELECT title, custom_category, manual_category, main_images, attrs, skus FROM products WHERE uid = 'u1'");
    expect(cloudRow.title).toBe('新标题');
    expect(cloudRow.custom_category).toBe('新自定义分类');
    expect(cloudRow.manual_category).toBe('手动分类');
    expect(cloudRow.main_images).toBe('["img1"]');
    expect(cloudRow.attrs).toBe('["attr1"]');
    expect(cloudRow.skus).toBe('["sku1"]');
  });

  test('云端更新时 saveProductToLocalAndCloud 不覆盖云端较新数据', async () => {
    dbRun(cloudDb, "INSERT INTO products (uid, source_url, title, updated_at) VALUES ('u1', 'https://detail.1688.com/offer1.html', '云端新标题', '2099-12-31 23:59:59')");
    syncModule.saveProductToLocalAndCloud(
      'u1', 'https://detail.1688.com/offer1.html',
      '本地旧标题', '{}', '', '', '', '2025-05-25 03:00:00', '[]', '[]', '[]', '[]', '[]'
    );
    await new Promise(r => setTimeout(r, 50));
    const cloudRow = dbGetOne(cloudDb, "SELECT title FROM products WHERE uid = 'u1'");
    expect(cloudRow.title).toBe('云端新标题');
  });

  test('saveProductToLocalAndCloud 包含 created_at 和 manual_category', async () => {
    const cloud = createMockCloud();
    const db = createMockDb();
    const sync = require('../../cloud/sync')(cloud, db);
    sync.saveProductToLocalAndCloud(
      'uNew', 'https://detail.1688.com/offer-new.html',
      '新产品', '{}', '', '', '家居/毛巾', '2025-05-25 03:00:00',
      '[]', '[]', '[]', '[]', '[]'
    );
    await new Promise(r => setTimeout(r, 50));
    const cloudRow = dbGetOne(cloudDb, "SELECT created_at, manual_category, source_url FROM products WHERE uid = 'uNew'");
    expect(cloudRow.created_at).toBe('2025-05-25 03:00:00');
    expect(cloudRow.manual_category).toBe('家居/毛巾');
    expect(cloudRow.source_url).toBe('https://detail.1688.com/offer-new.html');
  });

  test('uploadProducts 补全云端 NULL created_at', async () => {
    dbRun(cloudDb, "INSERT INTO products (uid, source_url, title, created_at) VALUES ('u1', 'https://detail.1688.com/offer1.html', '毛巾', NULL)");
    dbRun(localDb, "INSERT INTO products (uid, source_url, title, created_at) VALUES ('u1', 'https://detail.1688.com/offer1.html', '毛巾', '2025-01-15 10:30:00')");
    await syncModule.uploadProducts();
    const cloudRow = dbGetOne(cloudDb, "SELECT created_at FROM products WHERE uid = 'u1'");
    expect(cloudRow.created_at).toBe('2025-01-15 10:30:00');
  });

  test('downloadProducts 补全本地空 created_at', async () => {
    dbRun(localDb, "INSERT INTO products (uid, source_url, title, created_at) VALUES ('u1', 'https://detail.1688.com/offer1.html', '毛巾', NULL)");
    dbRun(cloudDb, "INSERT INTO products (uid, source_url, title, created_at) VALUES ('u1', 'https://detail.1688.com/offer1.html', '毛巾', '2025-03-20 14:00:00')");
    await syncModule.downloadProducts();
    const localRow = dbGetOne(localDb, "SELECT created_at FROM products WHERE uid = 'u1'");
    expect(localRow.created_at).toBe('2025-03-20 14:00:00');
  });

  test('uid 为空时不保存到云端', async () => {
    const cloud = createMockCloud();
    const db = createMockDb();
    const sync = require('../../cloud/sync')(cloud, db);
    sync.saveProductToLocalAndCloud(
      '', 'https://detail.1688.com/offer1.html',
      '毛巾', '{}', '', '', '', '2025-05-25 03:00:00', '[]', '[]', '[]', '[]', '[]'
    );
    await new Promise(r => setTimeout(r, 50));
    expect(cloudCount('products')).toBe(0);
  });
});

// ============================================================
// 10. 大数据量场景
// ============================================================
describe('大数据量同步', () => {
  test('100条映射批量上传不丢数据', async () => {
    for (let i = 0; i < 100; i++) {
      dbRun(localDb, "INSERT INTO category_mappings (category_name, custom_category, count, source) VALUES (?, ?, ?, 'auto')",
        ['类目' + i, '分类/子类/' + i, i + 1]);
    }
    const result = await syncModule.uploadLocalToCloud();
    expect(result.ok).toBe(true);
    expect(result.counts.category_mappings).toBe(100);
    expect(cloudCount('category_mappings')).toBe(100);
    // 验证最后一条
    const lastRow = dbGetOne(cloudDb, "SELECT count FROM category_mappings WHERE category_name = '类目99'");
    expect(lastRow.count).toBe(100);
  });

  test('100条映射批量下载不丢数据', async () => {
    for (let i = 0; i < 100; i++) {
      dbRun(cloudDb, "INSERT INTO category_mappings (category_name, custom_category, count, source) VALUES (?, ?, ?, 'auto')",
        ['类目' + i, '分类/子类/' + i, i + 1]);
    }
    const result = await syncModule.downloadCloudToLocal();
    expect(result.ok).toBe(true);
    expect(result.counts.category_mappings).toBe(100);
    expect(localCount('category_mappings')).toBe(100);
  });
});

// ============================================================
// 11. pushTable / pullTable 通用测试
// ============================================================
describe('pushTable / pullTable 通用', () => {
  test('pushTable 不存在的表返回错误', async () => {
    const result = await syncModule.pushTable('nonexistent');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('未知表');
  });

  test('pullTable 不存在的表返回错误', async () => {
    const result = await syncModule.pullTable('nonexistent');
    expect(result.ok).toBe(false);
  });

  test('pushTable synonyms 正确推送', async () => {
    dbRun(localDb, "INSERT INTO keyword_synonyms (word_a, word_b) VALUES ('毛巾', '面巾')");
    const result = await syncModule.pushTable('synonyms');
    expect(result.ok).toBe(true);
    expect(result.pushed).toBe(1);
  });

  test('pullTable blacklist 正确拉取', async () => {
    dbRun(cloudDb, "INSERT INTO keyword_blacklist (keyword, category_name, reason) VALUES ('爆款', '毛巾', '噪词')");
    const result = await syncModule.pullTable('blacklist');
    expect(result.ok).toBe(true);
    expect(result.added).toBe(1);
    expect(localCount('keyword_blacklist')).toBe(1);
  });

  test('pushTable 重复 synonyms 跳过不报错', async () => {
    dbRun(localDb, "INSERT INTO keyword_synonyms (word_a, word_b) VALUES ('毛巾', '面巾')");
    dbRun(cloudDb, "INSERT INTO keyword_synonyms (word_a, word_b) VALUES ('毛巾', '面巾')");
    const result = await syncModule.pushTable('synonyms');
    expect(result.ok).toBe(true);
    expect(result.skipped).toBe(1);
    expect(cloudCount('keyword_synonyms')).toBe(1);
  });
});

// ============================================================
// 12. 完整多电脑场景模拟
// ============================================================
describe('完整多电脑场景', () => {
  test('电脑A采集+分类 → 同步到云端 → 电脑B拉取 → 数据完整', async () => {
    // 电脑A操作：采集商品并分类
    dbRun(localDb, "INSERT INTO products (uid, source_url, title, category, custom_category) VALUES ('uA1', 'https://detail.1688.com/offer1.html', '纯棉毛巾', '{\"leafCategoryName\":\"毛巾\"}', '家居/毛巾')");
    dbRun(localDb, "INSERT INTO category_mappings (category_name, custom_category, count, source) VALUES ('毛巾', '家居/毛巾', 5, 'auto')");
    dbRun(localDb, "INSERT INTO keyword_category_rel (keyword, category_name, weight, match_count, valid, source) VALUES ('纯棉', '毛巾', 2.0, 8, 1, 'auto')");

    // 电脑A上传到云端（知识库 + 商品分开同步）
    await syncModule.uploadLocalToCloud();
    await syncModule.uploadProducts();
    expect(cloudCount('products')).toBe(1);
    expect(cloudCount('category_mappings')).toBe(1);
    expect(cloudCount('keyword_category_rel')).toBe(1);

    // 模拟电脑B拉取（重新创建 sync 模块，但保持云端数据）
    const cloud2 = createMockCloud();
    // 电脑B使用新的本地数据库
    const localDb2 = new SQL.Database();
    for (const ddl of TABLE_DDLS) localDb2.run(ddl);
    localDb2.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_products_uid ON products(uid)');
    const db2 = {
      getAll: (sql, params) => dbGetAll(localDb2, sql, params),
      getOne: (sql, params) => dbGetOne(localDb2, sql, params),
      run: (sql, params) => dbRun(localDb2, sql, params),
      scheduleSave: () => {},
      saveNow: () => {},
      treeGetAll: (sql, params) => dbGetAll(localDb2, sql, params),
      treeGetOne: (sql, params) => dbGetOne(localDb2, sql, params),
      treeRun: (sql, params) => dbRun(localDb2, sql, params),
      scheduleTreeSave: () => {}
    };
    const sync2 = require('../../cloud/sync')(cloud2, db2);
    const pullResult = await sync2.downloadCloudToLocal();
    await sync2.downloadProducts();

    // 验证电脑B拿到完整数据
    const mappings = dbGetAll(localDb2, 'SELECT * FROM category_mappings');
    expect(mappings.length).toBe(1);
    expect(mappings[0].category_name).toBe('毛巾');

    const products = dbGetAll(localDb2, "SELECT * FROM products WHERE source_url = 'https://detail.1688.com/offer1.html'");
    expect(products.length).toBe(1);
    expect(products[0].title).toBe('纯棉毛巾');

    localDb2.close();
  });

  test('电脑A和电脑B各自新增数据 → 双向同步 → 两边完整', async () => {
    // 电脑A新增
    dbRun(localDb, "INSERT INTO category_mappings (category_name, custom_category, count, source) VALUES ('毛巾', '家居/毛巾', 3, 'auto')");
    dbRun(localDb, "INSERT INTO keyword_synonyms (word_a, word_b) VALUES ('毛巾', '面巾')");

    // 电脑B新增（已推送到云端）
    dbRun(cloudDb, "INSERT INTO category_mappings (category_name, custom_category, count, source) VALUES ('牙刷', '家居/牙刷', 7, 'auto')");
    dbRun(cloudDb, "INSERT INTO keyword_synonyms (word_a, word_b) VALUES ('牙刷', ' toothbrush')");

    // 双向同步
    await syncModule.bidirectionalSync();

    // 验证本地完整
    expect(localCount('category_mappings')).toBe(2);
    expect(localCount('keyword_synonyms')).toBe(2);
    // 验证云端完整
    expect(cloudCount('category_mappings')).toBe(2);
    expect(cloudCount('keyword_synonyms')).toBe(2);
  });

  test('同一映射两边count累加 → 双向同步后取最大值', async () => {
    // 电脑A使用了"毛巾→家居/毛巾"映射 3 次
    dbRun(localDb, "INSERT INTO category_mappings (category_name, custom_category, count, source) VALUES ('毛巾', '家居/毛巾', 3, 'auto')");
    // 电脑B使用了同一映射 8 次
    dbRun(cloudDb, "INSERT INTO category_mappings (category_name, custom_category, count, source) VALUES ('毛巾', '家居/毛巾', 8, 'auto')");

    await syncModule.bidirectionalSync();

    const localRow = dbGetOne(localDb, "SELECT count FROM category_mappings WHERE category_name = '毛巾'");
    expect(localRow.count).toBe(8);
    const cloudRow = dbGetOne(cloudDb, "SELECT count FROM category_mappings WHERE category_name = '毛巾'");
    expect(cloudRow.count).toBe(8);
  });
});
