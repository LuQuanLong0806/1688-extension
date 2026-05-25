// sync-delete-cleanup.test.js — 同步删除 & 云端清理逻辑测试
// 模拟 pullTable 的物理清理逻辑和各表删除时用业务主键而非 id 的正确性

const initSqlJs = require('sql.js');

let SQL;
let localDb;
let cloudDb;

function dbRun(db, sql, params) { db.run(sql, params); }
function dbGetOne(db, sql, params) {
  var stmt = db.prepare(sql);
  if (params) stmt.bind(params);
  if (stmt.step()) { var row = stmt.getAsObject(); stmt.free(); return row; }
  stmt.free(); return null;
}
function dbGetAll(db, sql, params) {
  var stmt = db.prepare(sql);
  if (params) stmt.bind(params);
  var rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free(); return rows;
}

// 表定义 DDL
var TABLE_DDLS = {
  category_mappings: `CREATE TABLE IF NOT EXISTS category_mappings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_name TEXT NOT NULL,
    custom_category TEXT NOT NULL,
    count INTEGER DEFAULT 1,
    source TEXT DEFAULT 'auto',
    UNIQUE(category_name, custom_category)
  )`,
  keyword_category_rel: `CREATE TABLE IF NOT EXISTS keyword_category_rel (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    keyword TEXT NOT NULL,
    category_name TEXT NOT NULL,
    weight REAL DEFAULT 1.0,
    match_count INTEGER DEFAULT 1,
    valid INTEGER DEFAULT 1,
    source TEXT DEFAULT 'auto',
    UNIQUE(keyword, category_name)
  )`,
  keyword_synonyms: `CREATE TABLE IF NOT EXISTS keyword_synonyms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    word_a TEXT NOT NULL,
    word_b TEXT NOT NULL,
    UNIQUE(word_a, word_b)
  )`,
  keyword_blacklist: `CREATE TABLE IF NOT EXISTS keyword_blacklist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    keyword TEXT NOT NULL,
    category_name TEXT NOT NULL,
    reason TEXT DEFAULT '',
    UNIQUE(keyword, category_name)
  )`,
  category_config: `CREATE TABLE IF NOT EXISTS category_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    value TEXT NOT NULL,
    group_name TEXT DEFAULT '',
    description TEXT DEFAULT '',
    sort_order INTEGER DEFAULT 0,
    UNIQUE(type, value, group_name)
  )`,
  products: `CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uid TEXT DEFAULT '',
    source_url TEXT NOT NULL,
    title TEXT,
    status INTEGER DEFAULT 0,
    deleted INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`
};

// 模拟 pullTable 的物理清理逻辑
function simulatePullCleanup(localDb, cloudDb, cloudKey, tableName, localGet) {
  var cloudRows = dbGetAll(cloudDb, 'SELECT * FROM ' + tableName);
  var cloudKeys = {};
  for (var i = 0; i < cloudRows.length; i++) {
    var keyVals = cloudKey.map(function (k) { return cloudRows[i][k]; });
    cloudKeys[keyVals.join('\x00')] = true;
  }
  var localAll = localGet ? localGet() : dbGetAll(localDb, 'SELECT * FROM ' + tableName);
  var purged = 0;
  for (var j = 0; j < localAll.length; j++) {
    var localKeyVals = cloudKey.map(function (k) { return localAll[j][k]; });
    var localKey = localKeyVals.join('\x00');
    if (!cloudKeys[localKey]) {
      var delWhere = cloudKey.map(function (k) { return k + ' = ?'; }).join(' AND ');
      localDb.run('DELETE FROM ' + tableName + ' WHERE ' + delWhere, localKeyVals);
      purged++;
    }
  }
  return purged;
}

beforeAll(async () => { SQL = await initSqlJs(); });
beforeEach(() => {
  localDb = new SQL.Database();
  cloudDb = new SQL.Database();
  for (var table in TABLE_DDLS) {
    localDb.run(TABLE_DDLS[table]);
    cloudDb.run(TABLE_DDLS[table]);
  }
});
afterEach(() => { localDb.close(); cloudDb.close(); });

// ===== 1. category_mappings 清理 =====
describe('category_mappings 同步删除清理', () => {
  test('云端删除后，pull 清理本地多余记录', () => {
    // 两边都有 A→B 和 C→D
    localDb.run("INSERT INTO category_mappings (category_name, custom_category, count) VALUES ('1688类目A', '店小秘B', 3)");
    localDb.run("INSERT INTO category_mappings (category_name, custom_category, count) VALUES ('1688类目C', '店小秘D', 1)");
    cloudDb.run("INSERT INTO category_mappings (category_name, custom_category, count) VALUES ('1688类目A', '店小秘B', 3)");
    // 云端只有 A→B，C→D 已被删
    var purged = simulatePullCleanup(localDb, cloudDb, ['category_name', 'custom_category'], 'category_mappings');
    expect(purged).toBe(1);
    var remaining = dbGetAll(localDb, 'SELECT * FROM category_mappings');
    expect(remaining.length).toBe(1);
    expect(remaining[0].category_name).toBe('1688类目A');
  });

  test('按业务主键删云端（不用 id）', () => {
    localDb.run("INSERT INTO category_mappings (category_name, custom_category) VALUES ('猫', '宠物')");
    // 本地 id=1, 云端 id=99
    cloudDb.run("INSERT INTO category_mappings (category_name, custom_category) VALUES ('猫', '宠物')");
    // 模拟按业务主键删
    cloudDb.run("DELETE FROM category_mappings WHERE category_name = ? AND custom_category = ?", ['猫', '宠物']);
    var row = dbGetOne(cloudDb, "SELECT * FROM category_mappings WHERE category_name = '猫'");
    expect(row).toBeNull();
  });

  test('云端和本地完全一致时不清理', () => {
    localDb.run("INSERT INTO category_mappings (category_name, custom_category) VALUES ('A', 'B')");
    cloudDb.run("INSERT INTO category_mappings (category_name, custom_category) VALUES ('A', 'B')");
    var purged = simulatePullCleanup(localDb, cloudDb, ['category_name', 'custom_category'], 'category_mappings');
    expect(purged).toBe(0);
  });
});

// ===== 2. keyword_synonyms 清理 =====
describe('keyword_synonyms 同步删除清理', () => {
  test('云端删除同义词后，本地清理', () => {
    localDb.run("INSERT INTO keyword_synonyms (word_a, word_b) VALUES ('毛巾', '浴巾')");
    localDb.run("INSERT INTO keyword_synonyms (word_a, word_b) VALUES ('杯子', '水杯')");
    cloudDb.run("INSERT INTO keyword_synonyms (word_a, word_b) VALUES ('毛巾', '浴巾')");
    var purged = simulatePullCleanup(localDb, cloudDb, ['word_a', 'word_b'], 'keyword_synonyms');
    expect(purged).toBe(1);
    var remaining = dbGetAll(localDb, 'SELECT * FROM keyword_synonyms');
    expect(remaining.length).toBe(1);
    expect(remaining[0].word_a).toBe('毛巾');
  });

  test('按业务主键删云端', () => {
    cloudDb.run("INSERT INTO keyword_synonyms (word_a, word_b) VALUES ('大', '大号')");
    cloudDb.run("DELETE FROM keyword_synonyms WHERE word_a = ? AND word_b = ?", ['大', '大号']);
    expect(dbGetOne(cloudDb, "SELECT * FROM keyword_synonyms")).toBeNull();
  });
});

// ===== 3. keyword_blacklist 清理 =====
describe('keyword_blacklist 同步删除清理', () => {
  test('云端删除黑名单后，本地清理', () => {
    localDb.run("INSERT INTO keyword_blacklist (keyword, category_name, reason) VALUES ('通用', '家居', '太泛')");
    localDb.run("INSERT INTO keyword_blacklist (keyword, category_name, reason) VALUES ('配件', '电子', '不准')");
    cloudDb.run("INSERT INTO keyword_blacklist (keyword, category_name, reason) VALUES ('通用', '家居', '太泛')");
    var purged = simulatePullCleanup(localDb, cloudDb, ['keyword', 'category_name'], 'keyword_blacklist');
    expect(purged).toBe(1);
    var remaining = dbGetAll(localDb, 'SELECT * FROM keyword_blacklist');
    expect(remaining.length).toBe(1);
    expect(remaining[0].keyword).toBe('通用');
  });

  test('按业务主键删云端', () => {
    cloudDb.run("INSERT INTO keyword_blacklist (keyword, category_name) VALUES ('杂', '其他')");
    cloudDb.run("DELETE FROM keyword_blacklist WHERE keyword = ? AND category_name = ?", ['杂', '其他']);
    expect(dbGetOne(cloudDb, "SELECT * FROM keyword_blacklist")).toBeNull();
  });
});

// ===== 4. category_config 清理 =====
describe('category_config 同步删除清理', () => {
  test('云端删除配置后，本地清理', () => {
    localDb.run("INSERT INTO category_config (type, value, group_name) VALUES ('mutex', '家居', 'A')");
    localDb.run("INSERT INTO category_config (type, value, group_name) VALUES ('generic', '通用', '')");
    cloudDb.run("INSERT INTO category_config (type, value, group_name) VALUES ('mutex', '家居', 'A')");
    var purged = simulatePullCleanup(localDb, cloudDb, ['type', 'value', 'group_name'], 'category_config');
    expect(purged).toBe(1);
    var remaining = dbGetAll(localDb, 'SELECT * FROM category_config');
    expect(remaining.length).toBe(1);
    expect(remaining[0].type).toBe('mutex');
  });

  test('按业务主键删云端', () => {
    cloudDb.run("INSERT INTO category_config (type, value, group_name) VALUES ('filter', '测试', 'G1')");
    cloudDb.run("DELETE FROM category_config WHERE type = ? AND value = ? AND group_name = ?", ['filter', '测试', 'G1']);
    expect(dbGetOne(cloudDb, "SELECT * FROM category_config")).toBeNull();
  });
});

// ===== 5. keyword_category_rel 清理 =====
describe('keyword_category_rel 同步删除清理', () => {
  test('云端删除关联后，本地清理', () => {
    localDb.run("INSERT INTO keyword_category_rel (keyword, category_name, weight, valid) VALUES ('毛巾', '家居', 2.0, 1)");
    localDb.run("INSERT INTO keyword_category_rel (keyword, category_name, weight, valid) VALUES ('杯子', '餐饮', 1.5, 1)");
    cloudDb.run("INSERT INTO keyword_category_rel (keyword, category_name, weight, valid) VALUES ('毛巾', '家居', 2.0, 1)");
    var purged = simulatePullCleanup(localDb, cloudDb, ['keyword', 'category_name'], 'keyword_category_rel');
    expect(purged).toBe(1);
    var remaining = dbGetAll(localDb, 'SELECT * FROM keyword_category_rel');
    expect(remaining.length).toBe(1);
    expect(remaining[0].keyword).toBe('毛巾');
  });

  test('按业务主键标记无效（不删除）', () => {
    cloudDb.run("INSERT INTO keyword_category_rel (keyword, category_name, valid) VALUES ('测试', '分类', 1)");
    cloudDb.run("UPDATE keyword_category_rel SET valid = 0 WHERE keyword = ? AND category_name = ?", ['测试', '分类']);
    var row = dbGetOne(cloudDb, "SELECT valid FROM keyword_category_rel WHERE keyword = '测试'");
    expect(row.valid).toBe(0);
  });
});

// ===== 6. products 物理清理 =====
describe('products 同步删除清理', () => {
  beforeEach(() => {
    try { localDb.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_products_uid ON products(uid)'); } catch (e) {}
    try { cloudDb.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_products_uid ON products(uid)'); } catch (e) {}
  });

  test('本地deleted=1且云端不存在→物理删除', () => {
    localDb.run("INSERT INTO products (uid, source_url, title, deleted) VALUES ('u1', 'url1', '正常', 0)");
    localDb.run("INSERT INTO products (uid, source_url, title, deleted) VALUES ('u2', 'url2', '已删', 1)");
    localDb.run("INSERT INTO products (uid, source_url, title, deleted) VALUES ('u3', 'url3', '已删2', 1)");
    // 云端只有 u1
    cloudDb.run("INSERT INTO products (uid, source_url, title, deleted) VALUES ('u1', 'url1', '正常', 0)");

    // 模拟 downloadProducts 的物理清理逻辑
    var cloudProducts = dbGetAll(cloudDb, 'SELECT uid FROM products');
    var cloudUids = {};
    for (var i = 0; i < cloudProducts.length; i++) {
      if (cloudProducts[i].uid) cloudUids[cloudProducts[i].uid] = true;
    }
    var localDeleted = dbGetAll(localDb, "SELECT id, uid FROM products WHERE deleted = 1 AND uid IS NOT NULL AND uid != ''");
    var purged = 0;
    for (var j = 0; j < localDeleted.length; j++) {
      if (!cloudUids[localDeleted[j].uid]) {
        localDb.run('DELETE FROM products WHERE id = ?', [localDeleted[j].id]);
        purged++;
      }
    }
    expect(purged).toBe(2);
    var remaining = dbGetAll(localDb, 'SELECT * FROM products');
    expect(remaining.length).toBe(1);
    expect(remaining[0].uid).toBe('u1');
    expect(remaining[0].deleted).toBe(0);
  });

  test('本地deleted=1但云端还有→不删除（等云端物理删）', () => {
    localDb.run("INSERT INTO products (uid, source_url, title, deleted) VALUES ('u1', 'url1', '已删', 1)");
    cloudDb.run("INSERT INTO products (uid, source_url, title, deleted) VALUES ('u1', 'url1', '已删', 1)");

    var cloudProducts = dbGetAll(cloudDb, 'SELECT uid FROM products');
    var cloudUids = {};
    for (var i = 0; i < cloudProducts.length; i++) {
      if (cloudProducts[i].uid) cloudUids[cloudProducts[i].uid] = true;
    }
    var localDeleted = dbGetAll(localDb, "SELECT id, uid FROM products WHERE deleted = 1");
    var purged = 0;
    for (var j = 0; j < localDeleted.length; j++) {
      if (!cloudUids[localDeleted[j].uid]) {
        localDb.run('DELETE FROM products WHERE id = ?', [localDeleted[j].id]);
        purged++;
      }
    }
    expect(purged).toBe(0);
    var remaining = dbGetAll(localDb, 'SELECT * FROM products');
    expect(remaining.length).toBe(1);
  });

  test('本地deleted=0且云端不存在→不删除（保留，等上传）', () => {
    localDb.run("INSERT INTO products (uid, source_url, title, deleted) VALUES ('u1', 'url1', '正常', 0)");
    // 云端为空

    var cloudProducts = [];
    var cloudUids = {};
    var localDeleted = dbGetAll(localDb, "SELECT id, uid FROM products WHERE deleted = 1");
    var purged = 0;
    for (var j = 0; j < localDeleted.length; j++) {
      if (!cloudUids[localDeleted[j].uid]) {
        localDb.run('DELETE FROM products WHERE id = ?', [localDeleted[j].id]);
        purged++;
      }
    }
    expect(purged).toBe(0);
    var remaining = dbGetAll(localDb, 'SELECT * FROM products');
    expect(remaining.length).toBe(1);
  });
});

// ===== 7. 跨表综合：模拟完整同步流程 =====
describe('完整同步流程模拟', () => {
  test('A电脑删除→同步到云端→B电脑拉取清理', () => {
    // A电脑本地有两条同义词
    localDb.run("INSERT INTO keyword_synonyms (word_a, word_b) VALUES ('旧词', '新词')");
    localDb.run("INSERT INTO keyword_synonyms (word_a, word_b) VALUES ('保留词', '保留词2')");

    // A电脑 push 到云端
    cloudDb.run("INSERT INTO keyword_synonyms (word_a, word_b) VALUES ('旧词', '新词')");
    cloudDb.run("INSERT INTO keyword_synonyms (word_a, word_b) VALUES ('保留词', '保留词2')");

    // A电脑删除 '旧词'，同步按业务主键删云端
    localDb.run("DELETE FROM keyword_synonyms WHERE word_a = ? AND word_b = ?", ['旧词', '新词']);
    cloudDb.run("DELETE FROM keyword_synonyms WHERE word_a = ? AND word_b = ?", ['旧词', '新词']);

    // B电脑本地有两条（之前的同步写入的）
    var bDb = new SQL.Database();
    bDb.run(TABLE_DDLS.keyword_synonyms);
    bDb.run("INSERT INTO keyword_synonyms (word_a, word_b) VALUES ('旧词', '新词')");
    bDb.run("INSERT INTO keyword_synonyms (word_a, word_b) VALUES ('保留词', '保留词2')");

    // B电脑 pull，云端只有 '保留词'
    var purged = simulatePullCleanup(bDb, cloudDb, ['word_a', 'word_b'], 'keyword_synonyms');
    expect(purged).toBe(1);
    var remaining = dbGetAll(bDb, 'SELECT * FROM keyword_synonyms');
    expect(remaining.length).toBe(1);
    expect(remaining[0].word_a).toBe('保留词');
    bDb.close();
  });

  test('多表同时清理', () => {
    // 本地有数据，云端只有部分
    localDb.run("INSERT INTO category_mappings (category_name, custom_category) VALUES ('A', 'B')");
    localDb.run("INSERT INTO category_mappings (category_name, custom_category) VALUES ('C', 'D')");
    cloudDb.run("INSERT INTO category_mappings (category_name, custom_category) VALUES ('A', 'B')");

    localDb.run("INSERT INTO keyword_blacklist (keyword, category_name) VALUES ('X', 'Y')");
    localDb.run("INSERT INTO keyword_blacklist (keyword, category_name) VALUES ('Z', 'W')");
    cloudDb.run("INSERT INTO keyword_blacklist (keyword, category_name) VALUES ('X', 'Y')");

    var mPurged = simulatePullCleanup(localDb, cloudDb, ['category_name', 'custom_category'], 'category_mappings');
    var bPurged = simulatePullCleanup(localDb, cloudDb, ['keyword', 'category_name'], 'keyword_blacklist');

    expect(mPurged).toBe(1);
    expect(bPurged).toBe(1);
    expect(dbGetAll(localDb, 'SELECT * FROM category_mappings').length).toBe(1);
    expect(dbGetAll(localDb, 'SELECT * FROM keyword_blacklist').length).toBe(1);
  });
});
