// Watch sites/ for changes, auto-copy to 1688-extension/
// Combined with background.js auto-reload polling → hot reload
var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');
var OUT = path.join(ROOT, '1688-extension');
var sitesDir = __dirname;
var rootFiles = ['manifest.json', 'background.js', 'icon.svg'];

// Initial build
if (fs.existsSync(OUT)) fs.rmSync(OUT, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

rootFiles.forEach(function (f) {
  var src = path.join(sitesDir, f);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(OUT, f));
});

function copyDir(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  fs.readdirSync(src).forEach(function (entry) {
    var srcPath = path.join(src, entry);
    var destPath = path.join(dest, entry);
    if (fs.statSync(srcPath).isDirectory()) {
      copyDir(srcPath, destPath);
    } else if (!rootFiles.includes(entry)) {
      fs.copyFileSync(srcPath, destPath);
    }
  });
}

copyDir(sitesDir, path.join(OUT, 'sites'));
console.log('Initial build done. Watching for changes...');

// Watch for file changes
fs.watch(sitesDir, { recursive: true }, function (event, filename) {
  if (!filename) return;
  var ext = path.extname(filename);
  if (ext !== '.js' && ext !== '.json' && ext !== '.html' && ext !== '.svg') return;

  var src = path.join(sitesDir, filename);
  var dest = path.join(OUT, filename);

  if (!fs.existsSync(src) || fs.statSync(src).isDirectory()) return;

  var destDir = path.dirname(dest);
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

  try {
    fs.copyFileSync(src, dest);
    console.log('  ' + new Date().toLocaleTimeString() + ' updated: ' + filename);
  } catch (e) {
    console.error('  Error: ' + filename + ' - ' + e.message);
  }
});
