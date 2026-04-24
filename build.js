const fs = require('fs');
const path = require('path');

const OUT = '1688-extension';
const rootFiles = ['manifest.json', 'background.js', 'icon.svg'];

if (fs.existsSync(OUT)) fs.rmSync(OUT, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

rootFiles.forEach(f => fs.copyFileSync(f, path.join(OUT, f)));

function copyDir(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  fs.readdirSync(src).forEach(entry => {
    const srcPath = path.join(src, entry);
    const destPath = path.join(dest, entry);
    if (fs.statSync(srcPath).isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  });
}

copyDir('sites', path.join(OUT, 'sites'));

console.log('\n✅ 已生成: ' + OUT + '/');
console.log('   在 Chrome 中加载此文件夹即可使用\n');
