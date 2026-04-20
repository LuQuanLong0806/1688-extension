const fs = require('fs');
const path = require('path');

const OUT = '1688-extension';
const files = ['manifest.json', 'popup.html', 'popup.js', 'content.js', 'float-btn.js', 'grab-core.js', 'icon.svg'];

if (fs.existsSync(OUT)) fs.rmSync(OUT, { recursive: true });
fs.mkdirSync(OUT);

files.forEach(f => fs.copyFileSync(f, path.join(OUT, f)));

console.log('\n✅ 已生成: ' + OUT + '/');
console.log('   在 Chrome 中加载此文件夹即可使用\n');
