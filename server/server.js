const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const { DB_FILE, TREE_DB_FILE, initDb, initTreeDb, getOne, getAll, run, treeRun, treeGetOne, scheduleSave } = require('./db');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// 路由
app.use('/api', require('./routes/settings'));
app.use('/api', require('./routes/products'));
app.use('/api', require('./routes/categories'));
app.use('/api', require('./routes/dxm-tree'));

// Start
initDb().then(() => initTreeDb()).then(() => {
  // 迁移 dxm_categories → dxm_category_tree（仅首次）
  try {
    const migrationCheck = getOne("SELECT value FROM settings WHERE key = 'migration_dxm_categories_to_tree'");
    if (!migrationCheck) {
      const oldCats = getAll("SELECT path, leaf_name FROM dxm_categories");
      if (oldCats.length) {
        console.log('[migration] 迁移 dxm_categories → dxm_category_tree (' + oldCats.length + ' 条)');
        oldCats.forEach(function (r) {
          const cleanPath = (r.path || '').replace(/\s+/g, '');
          const parts = cleanPath.split('/');
          if (!cleanPath) return;
          const existing = treeGetOne('SELECT cat_id FROM dxm_category_tree WHERE path = ?', [cleanPath]);
          if (!existing) {
            treeRun('INSERT INTO dxm_category_tree (cat_id, cat_name, parent_cat_id, cat_level, is_leaf, path) VALUES (?, ?, ?, ?, ?, ?)',
              [Date.now() + Math.random() * 10000 | 0, r.leaf_name || parts[parts.length - 1], 0, parts.length, 1, cleanPath]);
          }
        });
      }
      run("INSERT OR REPLACE INTO settings (key, value) VALUES ('migration_dxm_categories_to_tree', '1')");
    }
  } catch (e) { console.error('[migration] dxm_categories 迁移失败:', e.message); }

  // 迁移：清理 category_mappings 中 custom_category 存了完整路径的脏数据
  try {
    const m2 = getOne("SELECT value FROM settings WHERE key = 'migration_cleanup_path_mappings'");
    if (!m2) {
      const pathMappings = getAll("SELECT id, category_name, custom_category FROM category_mappings WHERE custom_category LIKE '%/%'");
      let cleaned = 0;
      pathMappings.forEach(function (r) {
        const leafName = r.custom_category.split('/').pop();
        // 检查是否已存在叶子名映射
        const existing = getOne('SELECT id FROM category_mappings WHERE category_name = ? AND custom_category = ?', [r.category_name, leafName]);
        if (existing) {
          // 已有叶子名映射，删除路径版
          run('DELETE FROM category_mappings WHERE id = ?', [r.id]);
        } else {
          // 无叶子名映射，更新为叶子名
          run('UPDATE category_mappings SET custom_category = ? WHERE id = ?', [leafName, r.id]);
        }
        cleaned++;
      });
      if (cleaned > 0) console.log('[migration] 清理路径映射 ' + cleaned + ' 条');
      run("INSERT OR REPLACE INTO settings (key, value) VALUES ('migration_cleanup_path_mappings', '1')");
    }
  } catch (e) { console.error('[migration] 路径映射清理失败:', e.message); }

  app.listen(PORT, () => {
    console.log(`\n  商品采集服务已启动`);
    console.log(`  管理页面: http://localhost:${PORT}`);
    console.log(`  API 地址: http://localhost:${PORT}/api`);
    console.log(`  数据库: ${DB_FILE}\n`);
    // 自动打开管理页面
    var openUrl = 'http://localhost:' + PORT;
    var chromeExe = '';
    if (process.platform === 'win32') {
      var candidates = [
        (process.env.ProgramFiles || '') + '\\Google\\Chrome\\Application\\chrome.exe',
        (process.env['ProgramFiles(x86)'] || '') + '\\Google\\Chrome\\Application\\chrome.exe',
        (process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe'
      ];
      for (var ci = 0; ci < candidates.length; ci++) {
        if (candidates[ci] && fs.existsSync(candidates[ci])) { chromeExe = candidates[ci]; break; }
      }
    }
    if (chromeExe) {
      require('child_process').exec('"' + chromeExe + '" ' + openUrl);
    } else {
      var cmd = process.platform === 'win32' ? 'start' : process.platform === 'darwin' ? 'open' : 'xdg-open';
      require('child_process').exec(cmd + ' ' + openUrl);
    }
  });
});
