// Uploads 定期清理服务 — 按日期归档 + 过期删除
var fs = require('fs');
var path = require('path');

var UPLOADS_DIR = path.join(__dirname, '..', 'public', 'uploads');

function formatDate(d) {
  var y = d.getFullYear();
  var m = String(d.getMonth() + 1).padStart(2, '0');
  var day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

function archiveByDate() {
  if (!fs.existsSync(UPLOADS_DIR)) return;
  var entries = fs.readdirSync(UPLOADS_DIR);
  var moved = 0;
  entries.forEach(function (name) {
    var full = path.join(UPLOADS_DIR, name);
    try {
      var stat = fs.statSync(full);
      if (!stat.isFile()) return;
      // Skip debug/diagnostic files with fixed names
      if (name.startsWith('debug_')) return;
      var dateStr = formatDate(stat.mtime);
      var dateDir = path.join(UPLOADS_DIR, dateStr);
      if (!fs.existsSync(dateDir)) fs.mkdirSync(dateDir, { recursive: true });
      var dest = path.join(dateDir, name);
      // Avoid overwrite: skip if destination exists
      if (fs.existsSync(dest)) return;
      fs.renameSync(full, dest);
      moved++;
    } catch (e) { /* skip problematic files */ }
  });
  if (moved > 0) console.log('[cleanup] Archived', moved, 'files to date folders');
}

function cleanExpired(maxDays) {
  if (!fs.existsSync(UPLOADS_DIR)) return;
  var cutoff = Date.now() - maxDays * 24 * 60 * 60 * 1000;
  var removed = 0;

  function cleanDir(dir) {
    if (!fs.existsSync(dir)) return;
    var entries = fs.readdirSync(dir);
    entries.forEach(function (name) {
      var full = path.join(dir, name);
      try {
        var stat = fs.statSync(full);
        if (stat.isDirectory()) {
          cleanDir(full);
          // Remove empty date folders
          if (fs.readdirSync(full).length === 0) {
            fs.rmdirSync(full);
          }
        } else {
          if (stat.mtimeMs < cutoff) {
            fs.unlinkSync(full);
            removed++;
          }
        }
      } catch (e) { /* skip */ }
    });
  }

  cleanDir(UPLOADS_DIR);
  if (removed > 0) console.log('[cleanup] Removed', removed, 'files older than', maxDays, 'days');
}

function runCleanup(maxDays) {
  try {
    archiveByDate();
    cleanExpired(maxDays || 30);
  } catch (e) {
    console.error('[cleanup] Error:', e.message);
  }
}

function startCleanupScheduler(intervalMs, maxDays) {
  var days = maxDays || 30;
  var ms = intervalMs || 24 * 60 * 60 * 1000;
  console.log('[cleanup] Scheduler started — interval:', Math.round(ms / 3600000) + 'h,', 'max age:', days + 'd');
  setInterval(function () { runCleanup(days); }, ms);
}

module.exports = { runCleanup: runCleanup, startCleanupScheduler: startCleanupScheduler };
