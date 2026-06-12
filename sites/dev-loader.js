// Hybrid loader: all scripts succeed from server → atomic cache update; any fail → cache → bundle
(async function () {
  var DEV = 'http://localhost:3000/dev';
  var CP = 'dev_cache:';
  var url = location.href;
  var host = location.hostname;

  var scripts = [];

  if (/1688\.com$/.test(host)) {
    scripts = [
      'sites/1688/grab-core.js',
      'sites/1688/collect-data.js',
      'sites/1688/float-btn.js'
    ];
  } else if (/dianxiaomi\.com\/imageEditor/.test(url)) {
    scripts = ['sites/dianxiaomi/dxm-image-editor.js'];
  } else if (/dianxiaomi\.com/.test(host)) {
    scripts = [
      'sites/dianxiaomi/dxm-config.js',
      'sites/dianxiaomi/dxm-float-bee.js',
      'sites/dianxiaomi/dxm-config-ui.js',
      'sites/dianxiaomi/dxm-auto-clean.js',
      'sites/dianxiaomi/dxm-auto-fill.js',
      'sites/dianxiaomi/dxm-edit-desc.js',
      'sites/dianxiaomi/dxm-paste-img.js',
      'sites/dianxiaomi/dxm-sku.js',
      'sites/dianxiaomi/dxm-sku-table.js'
    ];
  }

  if (!scripts.length) return;

  // Check if dev server is available (1s timeout)
  var useServer = false;
  try {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, 1000);
    var check = await fetch(DEV + '/manifest.json?t=' + Date.now(), { signal: ctrl.signal });
    clearTimeout(timer);
    useServer = check.ok;
  } catch (e) {}

  // Try fetch all scripts from server, return null if any fails
  async function fetchFromServer() {
    var results = [];
    for (var i = 0; i < scripts.length; i++) {
      try {
        var resp = await fetch(DEV + '/' + scripts[i] + '?t=' + Date.now());
        if (!resp.ok) return null;
        results.push(await resp.text());
      } catch (e) {
        return null;
      }
    }
    return results;
  }

  // Load all from cache, return null if any missing
  async function loadFromCache() {
    var keys = scripts.map(function (s) { return CP + s; });
    return new Promise(function (resolve) {
      chrome.storage.local.get(keys, function (r) {
        for (var i = 0; i < keys.length; i++) {
          if (!r[keys[i]]) { resolve(null); return; }
        }
        resolve(keys.map(function (k) { return r[k]; }));
      });
    });
  }

  // Load all from extension bundle
  async function loadFromBundle() {
    var results = [];
    for (var i = 0; i < scripts.length; i++) {
      var resp = await fetch(chrome.runtime.getURL(scripts[i]));
      results.push(await resp.text());
    }
    return results;
  }

  // Atomic: only save cache when ALL scripts fetched successfully
  function saveCache(codes) {
    var items = {};
    for (var i = 0; i < scripts.length; i++) {
      items[CP + scripts[i]] = codes[i];
    }
    chrome.storage.local.set(items);
  }

  var codes = null;
  var source = 'bundle';

  if (useServer) {
    codes = await fetchFromServer();
    if (codes) {
      saveCache(codes);
      source = 'server';
    } else {
      codes = await loadFromCache();
      if (codes) source = 'cache';
    }
  } else {
    codes = await loadFromCache();
    if (codes) {
      source = 'cache';
    }
  }

  if (!codes) {
    codes = await loadFromBundle();
    source = 'bundle';
  }

  for (var i = 0; i < codes.length; i++) {
    (0, eval)(codes[i]);
  }
  console.log('[loader] ' + scripts.length + ' scripts (' + source + ')');
})();
