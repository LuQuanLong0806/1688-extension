const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');

const { DB_FILE, TREE_DB_FILE, initDb, initTreeDb, getOne, getAll, run, treeRun, treeGetOne, scheduleSave } = require('./db');

const app = express();
const PORT = 3000;

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (origin.indexOf('localhost') >= 0) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(cookieParser());

// Rate limiting
var limiter = rateLimit({ windowMs: 60 * 1000, max: 120, standardHeaders: true, legacyHeaders: false });
app.use(limiter);
var loginLimiter = rateLimit({ windowMs: 60 * 1000, max: 5, standardHeaders: true, legacyHeaders: false });
app.use('/api/login', loginLimiter);
app.use('/api/plugin-login', loginLimiter);

app.use(express.static(path.join(__dirname, 'public'), { etag: false, maxAge: 0 }));

// Dev mode: serve sites/ files with no-cache for dynamic extension loading
app.use('/dev/sites', express.static(path.join(__dirname, '..', 'sites'), { etag: false, maxAge: 0, setHeaders: function (res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
}}));

// Extension auto-reload: return hash of sites/ file modification times
app.get('/api/extension-version', function (req, res) {
  var crypto = require('crypto');
  var hash = crypto.createHash('md5');
  function walk(dir) {
    fs.readdirSync(dir).forEach(function (entry) {
      var p = path.join(dir, entry);
      if (fs.statSync(p).isDirectory()) { walk(p); return; }
      if (/\.js$/.test(entry)) hash.update(entry + fs.statSync(p).mtimeMs);
    });
  }
  walk(path.join(__dirname, '..', 'sites'));
  res.send(hash.digest('hex'));
});

// Uploads directory
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// 拼图页面 — 直接通过 http://localhost:3000/collage 访问，可收藏到浏览器
const COLLAGE_DIR = path.join(__dirname, '..', 'sites', 'dianxiaomi');
app.get('/collage', function (req, res) {
  res.sendFile(path.join(COLLAGE_DIR, 'dxm-collage.html'));
});
app.get('/collage/dxm-collage.js', function (req, res) {
  res.sendFile(path.join(COLLAGE_DIR, 'dxm-collage.js'));
});
app.get('/dxm-collage.js', function (req, res) {
  res.sendFile(path.join(COLLAGE_DIR, 'dxm-collage.js'));
});

// 去中文页面 — 直接通过 http://localhost:3000/text-cleaner 访问
app.get('/text-cleaner', function (req, res) {
  res.sendFile(path.join(COLLAGE_DIR, 'dxm-text-cleaner.html'));
});
app.get('/text-cleaner/dxm-text-cleaner.js', function (req, res) {
  res.sendFile(path.join(COLLAGE_DIR, 'dxm-text-cleaner.js'));
});
app.get('/dxm-text-cleaner.js', function (req, res) {
  res.sendFile(path.join(COLLAGE_DIR, 'dxm-text-cleaner.js'));
});

// Image proxy (solve CORS for external images)
// SSRF 防护：禁止内网地址
var PROXY_BLOCKED_HOSTS = ['127.0.0.1', 'localhost', '0.0.0.0', '[::1]', '0:0:0:0:0:0:0:1'];
function isBlockedProxyUrl(urlStr) {
  if (!urlStr) return true;
  if (!/^https?:\/\//i.test(urlStr)) return true;
  try {
    var parsed = new URL(urlStr);
    var host = parsed.hostname.toLowerCase();
    for (var i = 0; i < PROXY_BLOCKED_HOSTS.length; i++) {
      if (host === PROXY_BLOCKED_HOSTS[i]) return true;
    }
    // 禁止私有 IP 段
    if (/^10\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host) || /^192\.168\./.test(host)) return true;
    if (/^169\.254\./.test(host) || /^fc00:/i.test(host) || /^fe80:/i.test(host)) return true;
    if (/^0\./.test(host)) return true;
    return false;
  } catch (e) { return true; }
}

app.get('/api/proxy-image', function (req, res) {
  var url = req.query.url;
  if (!url) return res.status(400).send('Missing url');
  if (isBlockedProxyUrl(url)) return res.status(403).send('Blocked: private/internal URL');
  var http = url.startsWith('https') ? require('https') : require('http');
  http.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Referer': 'https://detail.1688.com/' } }, function (upstream) {
    if (upstream.statusCode >= 300 && upstream.statusCode < 400 && upstream.headers.location) {
      return res.redirect('/api/proxy-image?url=' + encodeURIComponent(upstream.headers.location));
    }
    res.setHeader('Content-Type', upstream.headers['content-type'] || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    upstream.pipe(res);
  }).on('error', function (err) {
    res.status(502).send('Proxy error: ' + err.message);
  });
});

// Upload edited image
app.post('/api/upload-image', express.json({ limit: '50mb' }), function (req, res) {
  var dataUrl = req.body.dataUrl;
  var productId = req.body.productId;
  var field = req.body.field || 'main_images';
  var index = req.body.index || 0;
  if (!dataUrl) return res.status(400).json({ error: 'Missing dataUrl' });
  if (!/^data:image\//i.test(dataUrl)) return res.status(400).json({ error: 'Invalid image format' });

  var matches = dataUrl.match(/^data:image\/(\w+);base64,/);
  var ext = matches ? matches[1] : 'jpg';
  if (ext === 'jpeg') ext = 'jpg';
  var base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, '');
  var filename = (productId || 'img') + '_' + field + '_' + index + '_' + Date.now() + '.' + ext;
  var filepath = path.join(UPLOADS_DIR, filename);

  fs.writeFile(filepath, Buffer.from(base64Data, 'base64'), function (err) {
    if (err) return res.status(500).json({ error: 'Save failed' });
    res.json({ url: '/uploads/' + filename });
  });
});

// 拼图页待导入图片暂存（单用户内存）
var collagePendingImages = null;
app.post('/api/collage-import', function (req, res) {
  collagePendingImages = req.body.images || [];
  res.json({ ok: true, count: collagePendingImages.length });
});
app.get('/api/collage-import', function (req, res) {
  res.json({ images: collagePendingImages || [] });
  collagePendingImages = null;
});

// Auth middleware
var auth = require('./middleware/auth');
app.use(auth.authMiddleware);

// 路由
var usersRoute = require('./routes/users');
app.use('/api', require('./routes/settings'));
app.use('/api', require('./routes/products'));
app.use('/api', require('./routes/categories'));
app.use('/api', require('./routes/dxm-tree'));
app.use('/api/ai', require('./routes/ai/index'));
app.use('/api/sync', require('./routes/sync'));
app.use('/api', usersRoute);

// Start
initDb().then(() => initTreeDb()).then(() => {
  // 首次启动自动创建管理员账户
  usersRoute.ensureAdmin();

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

    // 尝试连接 Turso 云端（静默失败，不影响本地功能）
    var cloudDb = require('./cloud/index');
    // 初始化分类配置种子数据（首次运行）
    try { cloudDb.seedCategoryConfig(); } catch (e) {}
    cloudDb.connect().then(function (ok) {
      if (ok) {
        console.log('[云同步] Turso 已连接，知识库云端模式');
        // 启动时自动同步：仅拉取最近3天的商品，知识库全量
        var recentDate = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString().replace('T', ' ').substring(0, 19);
        cloudDb.downloadProducts({ since: recentDate }).then(function (r) {
          console.log('[云同步] 启动同步-拉取商品(最近3天): 新增', r.added, '跳过', r.skipped, '删除同步', r.deletedSynced || 0);
          return cloudDb.bidirectionalSync();
        }).then(function (r) {
          if (r && r.ok) console.log('[云同步] 启动同步-知识库: 拉取', JSON.stringify(r.pull), '推送', JSON.stringify(r.push));
        }).catch(function (e) {
          console.error('[云同步] 启动同步失败:', e.message);
        });
      }
    });

    // Uploads 定期清理（7天过期，每6小时扫描）
    var cleanup = require('./services/cleanup');
    cleanup.startCleanupScheduler(6 * 60 * 60 * 1000, 7);
    setTimeout(function () { cleanup.runCleanup(7); }, 10000);

    // 自动启动 PaddleOCR 微服务
    startOcrService();

    // 静默预加载本地 ONNX 模型（LaMa + ISNet），避免首次请求等待
    setTimeout(function () {
      try {
        var lamaService = require('./services/inpaint');
        if (lamaService.isModelAvailable()) {
          lamaService.getSession().then(function () {
            console.log('[预加载] LaMa 模型已就绪');
          }).catch(function (e) {
            console.log('[预加载] LaMa 模型加载失败:', e.message);
          });
        }
      } catch (e) {}
      try {
        var removeBg = require('./services/remove-bg');
        removeBg.getSession().then(function () {
          console.log('[预加载] ISNet 抠图模型已就绪');
        }).catch(function (e) {
          console.log('[预加载] ISNet 模型加载失败:', e.message);
        });
      } catch (e) {}
    }, 3000);
  });
});

// ========== PaddleOCR 微服务管理 ==========
var ocrProcess = null;
var ocrRestartCount = 0;
var OCR_MAX_RESTARTS = 5;

// 检测端口是否已被占用
function isPortInUse(port) {
  var net = require('net');
  return new Promise(function (resolve) {
    var tester = net.createServer()
      .once('error', function () { resolve(true); })
      .once('listening', function () { tester.once('close', function () { resolve(false); }).close(); })
      .listen(port);
  });
}

// 杀掉占用端口的进程（Windows）
function killPortProcess(port) {
  try {
    var result = require('child_process').execSync(
      'netstat -ano | findstr ":' + port + '.*LISTENING"',
      { encoding: 'utf8', timeout: 5000 }
    );
    var match = result.match(/(\d+)\s*$/m);
    if (match && match[1]) {
      var pid = match[1].trim();
      console.log('[OCR] Killing old process on port ' + port + ' (PID: ' + pid + ')');
      try {
        process.kill(pid);
      } catch (e) {
        require('child_process').execSync('taskkill /F /PID ' + pid, { stdio: 'ignore' });
      }
      return true;
    }
  } catch (e) {}
  return false;
}

function startOcrService() {
  var ocrScript = path.join(__dirname, 'services', 'ocr_service.py');
  if (!fs.existsSync(ocrScript)) {
    console.log('[OCR] ocr_service.py not found, skipping');
    return;
  }

  // 检查 Python 可用性
  var pythonCmd = 'python';
  var { execSync } = require('child_process');
  try {
    execSync('python --version', { stdio: 'pipe', timeout: 5000 });
  } catch (e) {
    try {
      execSync('python3 --version', { stdio: 'pipe', timeout: 5000 });
      pythonCmd = 'python3';
    } catch (e2) {
      console.log('[OCR] Python not found, OCR service not started');
      return;
    }
  }

  // 检查 PaddleOCR 是否安装
  try {
    execSync(pythonCmd + ' -c "import paddleocr"', { stdio: 'pipe', timeout: 10000 });
  } catch (e) {
    console.log('[OCR] PaddleOCR not installed, run: pip install paddleocr paddlepaddle fastapi');
    return;
  }

  // 启动前检查端口
  isPortInUse(3001).then(function (inUse) {
    if (inUse) {
      console.log('[OCR] Port 3001 already in use, attempting to kill old process...');
      if (killPortProcess(3001)) {
        // 等端口释放
        setTimeout(function () { doStartOcr(pythonCmd, ocrScript); }, 2000);
      } else {
        console.log('[OCR] Could not free port 3001, skipping OCR service');
      }
    } else {
      doStartOcr(pythonCmd, ocrScript);
    }
  });
}

function doStartOcr(pythonCmd, ocrScript) {
  console.log('[OCR] Starting PaddleOCR service on port 3001...');
  var spawn = require('child_process').spawn;
  ocrProcess = spawn(pythonCmd, [ocrScript, '--port', '3001'], {
    stdio: 'pipe',
    detached: false,
    windowsHide: true
  });

  ocrProcess.stdout.on('data', function (data) {
    var msg = data.toString().trim();
    if (msg) {
      console.log('[OCR]', msg);
      if (msg.indexOf('Uvicorn running') >= 0 || msg.indexOf('Application startup complete') >= 0) {
        ocrRestartCount = 0;
      }
    }
  });

  ocrProcess.stderr.on('data', function (data) {
    var msg = data.toString().trim();
    if (msg && msg.indexOf('INFO') === -1) console.error('[OCR]', msg);
  });

  ocrProcess.on('exit', function (code) {
    console.log('[OCR] Service exited with code:', code);
    ocrProcess = null;
    if (code !== 0) {
      ocrRestartCount++;
      if (ocrRestartCount <= OCR_MAX_RESTARTS) {
        console.log('[OCR] Restarting in 5s... (attempt ' + ocrRestartCount + '/' + OCR_MAX_RESTARTS + ')');
        setTimeout(startOcrService, 5000);
      } else {
        console.log('[OCR] Max restart attempts reached (' + OCR_MAX_RESTARTS + '). Giving up.');
      }
    }
  });
}

// 退出时清理 OCR 进程（SIGINT + SIGTERM）
function cleanupOcr() {
  if (ocrProcess) {
    console.log('[OCR] Stopping OCR service...');
    ocrProcess.kill();
    ocrProcess = null;
  }
}
process.on('SIGINT', function () { cleanupOcr(); process.exit(0); });
process.on('SIGTERM', function () { cleanupOcr(); process.exit(0); });
// nodemon 用 SIGTERM 有时不够，也监听 exit
process.on('exit', function () { cleanupOcr(); });
