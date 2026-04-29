#!/usr/bin/env node
/**
 * 数据库合并工具 — 将其他电脑的采集数据合并到当前数据库
 *
 * 用法:
 *   node merge-db.js                    # 交互式选择源数据库文件
 *   node merge-db.js path/to/data.db    # 直接指定源数据库路径
 *
 * 合并策略:
 *   - products: 按 source_url 去重，已存在则跳过
 *   - categories: 按 name 去重，已存在则累加 count
 *   - settings: 按 key 去重，已存在则跳过（保留本地）
 */

const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

const DB_PATH = path.join(__dirname, 'data.db');

async function main() {
  const sourcePath = process.argv[2];
  if (!sourcePath) {
    console.log('用法: node merge-db.js <源数据库路径>');
    console.log('示例: node merge-db.js ..\\other-pc\\data.db');
    console.log('');
    console.log('将其他电脑的 data.db 复制到本机后指定路径即可。');
    process.exit(1);
  }

  const absSource = path.resolve(sourcePath);
  if (!fs.existsSync(absSource)) {
    console.error('❌ 源数据库不存在: ' + absSource);
    process.exit(1);
  }
  if (!fs.existsSync(DB_PATH)) {
    console.error('❌ 本地数据库不存在: ' + DB_PATH);
    console.error('请先启动服务一次以创建数据库。');
    process.exit(1);
  }

  const SQL = await initSqlJs();

  // 打开目标数据库
  const targetBuf = fs.readFileSync(DB_PATH);
  const target = new SQL.Database(targetBuf);

  // 打开源数据库（只读）
  const sourceBuf = fs.readFileSync(absSource);
  const source = new SQL.Database(sourceBuf);

  console.log('');
  console.log('源数据库: ' + absSource);
  console.log('目标数据库: ' + DB_PATH);
  console.log('');

  // ========== 合并 products ==========
  const sourceProducts = source.exec('SELECT * FROM products');
  let imported = 0;
  let skipped = 0;

  if (sourceProducts.length > 0 && sourceProducts[0].values.length > 0) {
    const cols = sourceProducts[0].columns;
    console.log('源商品数: ' + sourceProducts[0].values.length);

    // 获取目标已有的 source_url
    const existing = target.exec('SELECT source_url FROM products');
    const existingUrls = new Set();
    if (existing.length > 0) {
      existing[0].values.forEach(function (row) { existingUrls.add(row[0]); });
    }

    // 构建 INSERT 列（去掉 id，让目标自增）
    const insertCols = cols.filter(function (c) { return c !== 'id'; });
    const placeholders = insertCols.map(function () { return '?' }).join(',');

    sourceProducts[0].values.forEach(function (row) {
      var rowObj = {};
      cols.forEach(function (c, i) { rowObj[c] = row[i]; });

      if (existingUrls.has(rowObj.source_url)) {
        skipped++;
        return;
      }

      var vals = insertCols.map(function (c) { return rowObj[c] !== undefined ? rowObj[c] : null; });
      try {
        target.run(
          'INSERT INTO products (' + insertCols.join(',') + ') VALUES (' + placeholders + ')',
          vals
        );
        imported++;
      } catch (e) {
        console.error('  插入失败: ' + rowObj.title + ' - ' + e.message);
      }
    });
  }

  console.log('商品合并: 导入 ' + imported + ' 条, 跳过 ' + skipped + ' 条(已存在)');

  // ========== 合并 categories ==========
  const sourceCats = source.exec('SELECT * FROM categories');
  let catImported = 0;

  if (sourceCats.length > 0 && sourceCats[0].values.length > 0) {
    const catCols = sourceCats[0].columns;
    const nameIdx = catCols.indexOf('name');
    const countIdx = catCols.indexOf('count');

    sourceCats[0].values.forEach(function (row) {
      var name = row[nameIdx];
      var count = row[countIdx] || 1;
      if (!name) return;

      var existing = target.exec('SELECT count FROM categories WHERE name = ?', [name]);
      if (existing.length > 0 && existing[0].values.length > 0) {
        // 已存在，累加 count
        var oldCount = existing[0].values[0][0] || 0;
        target.run('UPDATE categories SET count = ? WHERE name = ?', [oldCount + count, name]);
      } else {
        try {
          target.run('INSERT INTO categories (name, cat_id, leaf_category_id, top_category_id, post_category_id, count) VALUES (?,?,?,?,?,?)',
            [name, row[catCols.indexOf('cat_id')] || '', row[catCols.indexOf('leaf_category_id')] || '',
             row[catCols.indexOf('top_category_id')] || '', row[catCols.indexOf('post_category_id')] || '', count]);
          catImported++;
        } catch (e) {}
      }
    });
  }

  console.log('类目合并: 新增 ' + catImported + ' 个');

  // ========== 合并 settings ==========
  const sourceSettings = source.exec('SELECT * FROM settings');
  let setImported = 0;

  if (sourceSettings.length > 0 && sourceSettings[0].values.length > 0) {
    sourceSettings[0].values.forEach(function (row) {
      var key = row[0];
      var value = row[1];
      if (!key) return;

      var existing = target.exec('SELECT key FROM settings WHERE key = ?', [key]);
      if (existing.length > 0 && existing[0].values.length > 0) return; // 跳过已存在

      try {
        target.run('INSERT INTO settings (key, value) VALUES (?, ?)', [key, value]);
        setImported++;
      } catch (e) {}
    });
  }

  console.log('配置合并: 新增 ' + setImported + ' 项');

  // ========== 保存 ==========
  var data = target.export();
  var buf = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buf);

  target.close();
  source.close();

  console.log('');
  console.log('✅ 合并完成！数据库已保存。');
  console.log('  商品: +' + imported + ' (总计 ' + (imported + (targetBuf.length > 0 ? 0 : 0)) + ')');
  console.log('');
}

main().catch(function (err) {
  console.error('❌ 合并失败:', err);
  process.exit(1);
});
