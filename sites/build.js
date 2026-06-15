const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, '1688-extension');
const sitesDir = __dirname;
const rootFiles = ['manifest.json', 'background.js', 'icon.svg'];

if (fs.existsSync(OUT)) fs.rmSync(OUT, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

// 写入打包时间戳（北京时间），供扩展端打印
var buildTime = new Date(Date.now() + 8 * 3600000).toISOString().replace('T', ' ').substring(0, 19);
var buildInfoContent =
  '// 自动生成，请勿手动修改。打包时间：' + buildTime + ' (UTC+8)\n' +
  'window.__EXT_BUILD_TIME__ = "' + buildTime + '";\n' +
  'console.log("%c[扩展] 打包时间: ' + buildTime + ' (UTC+8)", "color:#E65100;font-weight:bold;font-size:13px;");\n';
fs.writeFileSync(path.join(sitesDir, 'build-info.js'), buildInfoContent);

rootFiles.forEach(f => {
  const src = path.join(sitesDir, f);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(OUT, f));
});

function copyDir(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  fs.readdirSync(src).forEach(entry => {
    const srcPath = path.join(src, entry);
    const destPath = path.join(dest, entry);
    if (fs.statSync(srcPath).isDirectory()) {
      copyDir(srcPath, destPath);
    } else if (!rootFiles.includes(entry)) {
      fs.copyFileSync(srcPath, destPath);
    }
  });
}

copyDir(sitesDir, path.join(OUT, 'sites'));

console.log('\n✅ 已生成: 1688-extension/  (打包时间: ' + buildTime + ')');
console.log('   在 Chrome 中加载此文件夹即可使用\n');
