// Static build: no dev-loader, scripts loaded directly from extension bundle
var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');
var OUT = path.join(ROOT, '1688-extension-static');

if (fs.existsSync(OUT)) fs.rmSync(OUT, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

// Use static manifest (no dev-loader)
fs.copyFileSync(path.join(__dirname, 'static-manifest.json'), path.join(OUT, 'manifest.json'));
fs.copyFileSync(path.join(__dirname, 'background.js'), path.join(OUT, 'background.js'));
fs.copyFileSync(path.join(__dirname, 'icon.svg'), path.join(OUT, 'icon.svg'));

// Copy all site scripts
function copyDir(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  fs.readdirSync(src).forEach(function (entry) {
    var srcPath = path.join(src, entry);
    var destPath = path.join(dest, entry);
    if (fs.statSync(srcPath).isDirectory()) {
      copyDir(srcPath, destPath);
    } else if (entry !== 'dev-loader.js' && entry !== 'static-manifest.json' && entry !== 'manifest.json' && entry !== 'build.js' && entry !== 'static-build.js') {
      fs.copyFileSync(srcPath, destPath);
    }
  });
}

copyDir(__dirname, path.join(OUT, 'sites'));

console.log('\n  Static build: 1688-extension-static/');
console.log('  No auto-update, scripts loaded directly from bundle');
console.log('  Safe to share with others\n');
