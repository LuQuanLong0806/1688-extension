// Hybrid loader: execute immediately from cache/bundle, background-update from server for next refresh
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
      if (!resp.ok) throw new Error('bundle: ' + scripts[i] + ' ' + resp.status);
      results.push(await resp.text());
    }
    return results;
  }

  // Fetch all from server, return null if any fails
  async function fetchFromServer() {
    var results = [];
    for (var i = 0; i < scripts.length; i++) {
      try {
        var ctrl = new AbortController();
        var timer = setTimeout(function () { ctrl.abort(); }, 10000);
        var resp = await fetch(DEV + '/' + scripts[i] + '?t=' + Date.now(), { signal: ctrl.signal });
        clearTimeout(timer);
        if (!resp.ok) return null;
        results.push(await resp.text());
      } catch (e) {
        return null;
      }
    }
    return results;
  }

  // Atomic cache save
  function saveCache(codes) {
    var items = {};
    for (var i = 0; i < scripts.length; i++) {
      items[CP + scripts[i]] = codes[i];
    }
    chrome.storage.local.set(items);
  }

  // ---- Step 1: Execute immediately (cache → bundle, no waiting) ----
  var codes = null;
  var source = 'bundle';

  try {
    codes = await loadFromCache();
    if (codes) {
      source = 'cache';
    } else {
      codes = await loadFromBundle();
      source = 'bundle';
    }
  } catch (e) {
    console.error('[loader] Fatal:', e);
    return;
  }

  var loaded = 0;
  for (var i = 0; i < codes.length; i++) {
    try {
      (0, eval)(codes[i]);
      loaded++;
    } catch (e) {
      console.error('[loader] ' + scripts[i] + ':', e);
    }
  }
  console.log('[loader] ' + loaded + '/' + scripts.length + ' (' + source + ')');

  // ---- Step 2: Background — fetch latest, update cache for next refresh ----
  (async function () {
    try {
      var fresh = await fetchFromServer();
      if (fresh) {
        saveCache(fresh);
        console.log('[loader] updated cache from server');
      }
    } catch (e) {}
  })();
})();
