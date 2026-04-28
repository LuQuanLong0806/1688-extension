const fs = require('fs');
const path = require('path');
const { minify } = require('terser');
const { minify: htmlMinify } = require('html-minifier-terser');

const DIST = path.join(__dirname, '1688-server');
const SRC = __dirname;

// 清空 1688-server
if (fs.existsSync(DIST)) fs.rmSync(DIST, { recursive: true });
fs.mkdirSync(DIST, { recursive: true });

async function build() {
  console.log('📦 开始打包...\n');

  // 1. 压缩 server.js
  console.log('  压缩 server.js...');
  const serverCode = fs.readFileSync(path.join(SRC, 'server.js'), 'utf8');
  const serverMin = await minify(serverCode, { compress: true, mangle: false });
  fs.writeFileSync(path.join(DIST, 'server.js'), serverMin.code);

  // 2. 压缩 public/app.js
  console.log('  压缩 public/app.js...');
  const appCode = fs.readFileSync(path.join(SRC, 'public', 'app.js'), 'utf8');
  const appMin = await minify(appCode, { compress: true, mangle: false });
  fs.mkdirSync(path.join(DIST, 'public'), { recursive: true });
  fs.writeFileSync(path.join(DIST, 'public', 'app.js'), appMin.code);

  // 3. 压缩 public/index.html（内联 CSS）
  console.log('  压缩 public/index.html...');
  const css = fs.readFileSync(path.join(SRC, 'public', 'style.css'), 'utf8');
  let html = fs.readFileSync(path.join(SRC, 'public', 'index.html'), 'utf8');
  html = html.replace(
    '<link rel="stylesheet" href="style.css">',
    '<style>' + css + '</style>'
  );
  const htmlMin = await htmlMinify(html, {
    collapseWhitespace: true,
    removeComments: true,
    minifyCSS: true,
    minifyJS: true
  });
  fs.writeFileSync(path.join(DIST, 'public', 'index.html'), htmlMin);

  // 4. 复制 package.json（去掉 devDependencies）
  console.log('  生成 package.json...');
  const pkg = JSON.parse(
    fs.readFileSync(path.join(SRC, 'package.json'), 'utf8')
  );
  delete pkg.devDependencies;
  delete pkg.scripts.build;
  pkg.scripts.start = 'node server.js';
  fs.writeFileSync(
    path.join(DIST, 'package.json'),
    JSON.stringify(pkg, null, 2)
  );

  // 5. 复制启动脚本
  console.log('  复制启动脚本...');
  fs.copyFileSync(path.join(SRC, 'start.bat'), path.join(DIST, 'start.bat'));
  fs.copyFileSync(path.join(SRC, 'start.sh'), path.join(DIST, 'start.sh'));
  fs.copyFileSync(
    path.join(SRC, 'start-silent.vbs'),
    path.join(DIST, 'start-silent.vbs')
  );
  fs.copyFileSync(
    path.join(SRC, 'create-shortcut.bat'),
    path.join(DIST, 'create-shortcut.bat')
  );

  // 6. 安装生产依赖
  console.log('  安装生产依赖...');
  const { execSync } = require('child_process');
  execSync('npm install --production', { cwd: DIST, stdio: 'inherit' });

  // 7. 统计
  const origSize =
    getFileSize(path.join(SRC, 'server.js')) +
    getFileSize(path.join(SRC, 'public', 'app.js')) +
    getFileSize(path.join(SRC, 'public', 'index.html')) +
    getFileSize(path.join(SRC, 'public', 'style.css'));
  const distSize =
    getFileSize(path.join(DIST, 'server.js')) +
    getFileSize(path.join(DIST, 'public', 'app.js')) +
    getFileSize(path.join(DIST, 'public', 'index.html'));

  console.log('\n  ✅ 打包完成！');
  console.log(
    '  源码: ' + formatSize(origSize) + ' → 压缩后: ' + formatSize(distSize)
  );
  console.log('  输出目录: ' + DIST);
  console.log('  分发方式: 将 1688-server/ 文件夹打包为 zip\n');
}

function getFileSize(fp) {
  try {
    return fs.statSync(fp).size;
  } catch {
    return 0;
  }
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  return (bytes / 1024).toFixed(1) + ' KB';
}

build().catch(function (err) {
  console.error('❌ 打包失败:', err);
  process.exit(1);
});
