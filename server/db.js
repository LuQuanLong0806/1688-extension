const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const DB_FILE = path.join(__dirname, 'data.db');
const TREE_DB_FILE = path.join(__dirname, 'dxm_tree.db');

let db;
let saveTimer = null;
let treeDb;
let treeSaveTimer = null;

// SSE 客户端管理
const sseClients = [];
function sseBroadcast(event, data) {
  const msg = 'event: ' + event + '\ndata: ' + JSON.stringify(data) + '\n\n';
  for (let i = sseClients.length - 1; i >= 0; i--) {
    try { sseClients[i].write(msg); } catch (e) { sseClients.splice(i, 1); }
  }
}

// ========== 主库操作 ==========

const MAX_BACKUP = 3;

function rotateBackup(filePath) {
  // .bak.3 → 删除, .bak.2 → .bak.3, .bak.1 → .bak.2, .bak → .bak.1
  try {
    const oldest = filePath + '.bak.' + MAX_BACKUP;
    if (fs.existsSync(oldest)) fs.unlinkSync(oldest);
  } catch (e) {}
  // 从最老的开始往高编号移，避免覆盖
  for (let i = MAX_BACKUP; i >= 2; i--) {
    const src = filePath + '.bak.' + (i - 1);
    const dst = filePath + '.bak.' + i;
    try {
      if (fs.existsSync(src)) fs.renameSync(src, dst);
    } catch (e) {}
  }
  try {
    if (fs.existsSync(filePath + '.bak')) fs.renameSync(filePath + '.bak', filePath + '.bak.1');
  } catch (e) {}
}

function writeWithBackup(filePath, buffer) {
  if (!buffer || buffer.length === 0) return; // 不写入空数据
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, buffer);
  // 校验临时文件大小
  if (fs.statSync(tmp).size === 0) {
    fs.unlinkSync(tmp);
    return;
  }
  // 轮转备份（基于旧主文件）
  try {
    if (fs.existsSync(filePath) && fs.statSync(filePath).size > 0) {
      rotateBackup(filePath);
      fs.copyFileSync(filePath, filePath + '.bak');
    }
  } catch (e) {}
  fs.renameSync(tmp, filePath);
}

function saveDb() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  writeWithBackup(DB_FILE, buffer);
}

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(saveDb, 500);
}

function run(sql, params) {
  db.run(sql, params);
  scheduleSave();
}

function getOne(sql, params) {
  const stmt = db.prepare(sql);
  if (params) stmt.bind(params);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
}

function getAll(sql, params) {
  const stmt = db.prepare(sql);
  if (params) stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

// ========== 分类树库操作 ==========

function saveTreeDb() {
  if (!treeDb) return;
  const data = treeDb.export();
  const buffer = Buffer.from(data);
  writeWithBackup(TREE_DB_FILE, buffer);
}

function scheduleTreeSave() {
  if (treeSaveTimer) clearTimeout(treeSaveTimer);
  treeSaveTimer = setTimeout(saveTreeDb, 500);
}

function treeRun(sql, params) {
  treeDb.run(sql, params);
  scheduleTreeSave();
}

function treeGetOne(sql, params) {
  const stmt = treeDb.prepare(sql);
  if (params) stmt.bind(params);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
}

function treeGetAll(sql, params) {
  const stmt = treeDb.prepare(sql);
  if (params) stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

// ========== 初始化 ==========

async function initDb() {
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_FILE)) {
    db = new SQL.Database(fs.readFileSync(DB_FILE));
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_url TEXT NOT NULL,
      title TEXT,
      main_images TEXT,
      desc_images TEXT,
      attrs TEXT,
      skus TEXT,
      status INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  try { db.run('ALTER TABLE products ADD COLUMN category TEXT'); } catch (e) {}
  try { db.run('ALTER TABLE products ADD COLUMN detail_images TEXT'); } catch (e) {}
  try { db.run('ALTER TABLE products ADD COLUMN custom_category TEXT'); } catch (e) {}
  try { db.run("ALTER TABLE products ADD COLUMN dxm_category TEXT DEFAULT ''"); } catch (e) {}
  try { db.run('ALTER TABLE products ADD COLUMN manual_category TEXT'); } catch (e) {}

  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      custom_name TEXT DEFAULT '',
      cat_id TEXT,
      leaf_category_id TEXT,
      top_category_id TEXT,
      post_category_id TEXT,
      count INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  try { db.run("ALTER TABLE categories ADD COLUMN custom_name TEXT DEFAULT ''"); } catch (e) {}

  // 迁移：将已有商品的类目数据补录到 categories 表
  try {
    const existingCats = getOne('SELECT COUNT(*) as cnt FROM categories');
    if (!existingCats || existingCats.cnt === 0) {
      const products = getAll('SELECT category FROM products');
      products.forEach(r => {
        try {
          const cat = JSON.parse(r.category || '{}');
          const name = cat.leafCategoryName || cat.categoryPath;
          if (name) {
            const existing = getOne('SELECT id FROM categories WHERE name = ?', [name]);
            if (!existing) {
              run('INSERT INTO categories (name, cat_id, leaf_category_id, top_category_id, post_category_id, count) VALUES (?, ?, ?, ?, ?, ?)',
                [name, cat.catId || '', cat.leafCategoryId || '', cat.topCategoryId || '', cat.postCategoryId || '', 0]);
            }
          }
        } catch (e) {}
      });
      const allProducts = getAll('SELECT category FROM products');
      const catCount = {};
      allProducts.forEach(r => {
        try {
          const cat = JSON.parse(r.category || '{}');
          const name = cat.leafCategoryName || cat.categoryPath;
          if (name) catCount[name] = (catCount[name] || 0) + 1;
        } catch (e) {}
      });
      for (const [name, count] of Object.entries(catCount)) {
        run('UPDATE categories SET count = ? WHERE name = ?', [count, name]);
      }
    }
  } catch (e) {}

  db.run(`
    CREATE TABLE IF NOT EXISTS dxm_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT NOT NULL UNIQUE,
      leaf_name TEXT NOT NULL,
      count INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS category_mappings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_name TEXT NOT NULL,
      custom_category TEXT NOT NULL,
      UNIQUE(category_name, custom_category)
    )
  `);

  // 迁移：categories.custom_name → category_mappings
  try {
    const migrationCheck = getOne("SELECT value FROM settings WHERE key = 'migration_custom_name_to_mappings'");
    if (!migrationCheck) {
      const oldMappings = getAll("SELECT name, custom_name FROM categories WHERE custom_name IS NOT NULL AND custom_name != ''");
      oldMappings.forEach(function (r) {
        run('INSERT OR IGNORE INTO category_mappings (category_name, custom_category) VALUES (?, ?)', [r.name, r.custom_name]);
      });
      run("INSERT OR REPLACE INTO settings (key, value) VALUES ('migration_custom_name_to_mappings', '1')");
    }
  } catch (e) {}

  saveDb();
}

async function initTreeDb() {
  const SQL = await initSqlJs();
  const bakFile = TREE_DB_FILE + '.bak';
  if (fs.existsSync(TREE_DB_FILE)) {
    treeDb = new SQL.Database(fs.readFileSync(TREE_DB_FILE));
  } else if (fs.existsSync(bakFile) && fs.statSync(bakFile).size > 0) {
    console.log('[tree] dxm_tree.db 丢失，从备份恢复...');
    const bakData = fs.readFileSync(bakFile);
    fs.writeFileSync(TREE_DB_FILE, bakData);
    treeDb = new SQL.Database(bakData);
  } else {
    treeDb = new SQL.Database();
  }
  treeDb.run(`CREATE TABLE IF NOT EXISTS dxm_category_tree (
    cat_id INTEGER PRIMARY KEY,
    cat_name TEXT NOT NULL,
    parent_cat_id INTEGER DEFAULT 0,
    cat_level INTEGER DEFAULT 1,
    is_leaf INTEGER DEFAULT 0,
    path TEXT DEFAULT '',
    sync_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  scheduleTreeSave();
}

function parseRow(row) {
  return {
    ...row,
    category: row.category ? JSON.parse(row.category) : {},
    customCategory: row.custom_category || '',
    manualCategory: row.manual_category || '',
    dxmCategory: row.dxm_category ? JSON.parse(row.dxm_category) : null,
    main_images: JSON.parse(row.main_images || '[]'),
    desc_images: JSON.parse(row.desc_images || '[]'),
    detail_images: JSON.parse(row.detail_images || '[]'),
    attrs: JSON.parse(row.attrs || '[]'),
    skus: JSON.parse(row.skus || '[]')
  };
}

module.exports = {
  DB_FILE, TREE_DB_FILE,
  initDb, initTreeDb,
  run, getOne, getAll,
  treeRun, treeGetOne, treeGetAll,
  scheduleSave,
  parseRow,
  sseClients, sseBroadcast,
  // 暴露 db 用于直接操作（如 db.run 不触发自动保存的场景）
  get db() { return db; }
};
