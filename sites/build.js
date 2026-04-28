const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, '1688-extension');
const sitesDir = __dirname;
const rootFiles = ['manifest.json', 'background.js', 'icon.svg'];

if (fs.existsSync(OUT)) fs.rmSync(OUT, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

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

console.log('\n✅ 已生成: 1688-extension/');
console.log('   在 Chrome 中加载此文件夹即可使用\n');
