(function () {
  if (window.BeeConfig) return;

  var FILTER_KEY = '__dxm_bee_filters';
  var AUTO_PUBLISH_KEY = '__dxm_bee_auto_publish';
  var STORE_KEY = '__dxm_bee_stores';
  var SELECTED_STORE_KEY = '__dxm_bee_selected_store';
  var WEB_IMAGE_KEY = '__dxm_bee_use_web_image';
  var FILTER_ENABLED_KEY = '__dxm_bee_filter_enabled';
  var AUTO_CATEGORY_KEY = '__dxm_bee_auto_category';
  var PROVINCE_KEY = '__dxm_bee_province';
  var AUTO_TRANSLATE_KEY = '__dxm_bee_auto_translate';
  var SKU_FILTER_KEY = '__dxm_bee_sku_filters';
  var SKU_FILTER_ENABLED_KEY = '__dxm_bee_sku_filter_enabled';
  var AUTO_SKU_NO_KEY = '__dxm_bee_auto_sku_no';
  var DEL_VIDEO_KEY = '__dxm_bee_del_video';

  function getDefaultFilters() {
    return [
      { from: '黄金', to: '金色调', enabled: true },
      { from: '金子', to: '金色调', enabled: true },
      { from: '金色', to: '金色调', enabled: true },
      { from: '天然', to: '合成', enabled: true },
      { from: '原木', to: '合成', enabled: true },
      { from: '儿童', to: '', enabled: true },
      { from: '未成年', to: '', enabled: true },
      { from: '可爱的', to: '时尚美观的', enabled: true },
      { from: '可爱', to: '时尚美观', enabled: true },
      { from: '钻石', to: '', enabled: true },
      { from: '银子', to: '银色调', enabled: true },
      { from: '银色', to: '银色调', enabled: true }
    ];
  }

  function loadFilters() {
    try {
      var raw = localStorage.getItem(FILTER_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    var defaults = getDefaultFilters();
    saveFilters(defaults);
    return defaults;
  }

  function saveFilters(data) {
    localStorage.setItem(FILTER_KEY, JSON.stringify(data));
  }

  function loadAutoPublish() {
    var val = localStorage.getItem(AUTO_PUBLISH_KEY);
    return val !== 'false';
  }

  function saveAutoPublish(val) {
    localStorage.setItem(AUTO_PUBLISH_KEY, val ? 'true' : 'false');
  }

  function loadStores() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return [];
  }

  function saveStores(data) {
    localStorage.setItem(STORE_KEY, JSON.stringify(data));
  }

  function loadSelectedStore() {
    return localStorage.getItem(SELECTED_STORE_KEY) || '';
  }

  function saveSelectedStore(val) {
    localStorage.setItem(SELECTED_STORE_KEY, val);
  }

  function loadUseWebImage() {
    return localStorage.getItem(WEB_IMAGE_KEY) === 'true';
  }

  function saveUseWebImage(val) {
    localStorage.setItem(WEB_IMAGE_KEY, val ? 'true' : 'false');
  }

  function loadFilterEnabled() {
    var val = localStorage.getItem(FILTER_ENABLED_KEY);
    return val !== 'false';
  }

  function saveFilterEnabled(val) {
    localStorage.setItem(FILTER_ENABLED_KEY, val ? 'true' : 'false');
  }

  function loadAutoCategory() {
    return localStorage.getItem(AUTO_CATEGORY_KEY) === 'true';
  }

  function saveAutoCategory(val) {
    localStorage.setItem(AUTO_CATEGORY_KEY, val ? 'true' : 'false');
  }

  function isValidProvince(val) {
    if (!val) return false;
    return /省$|市$|自治区$|特别行政区$/.test(val);
  }

  function loadProvince() {
    var val = localStorage.getItem(PROVINCE_KEY);
    return isValidProvince(val) ? val : '广东省';
  }

  function saveProvince(val) {
    val = (val || '').trim();
    if (!isValidProvince(val)) val = '广东省';
    localStorage.setItem(PROVINCE_KEY, val);
  }

  function loadAutoTranslate() {
    var val = localStorage.getItem(AUTO_TRANSLATE_KEY);
    return val !== 'false';
  }

  function saveAutoTranslate(val) {
    localStorage.setItem(AUTO_TRANSLATE_KEY, val ? 'true' : 'false');
  }

  function getDefaultSkuFilters() {
    return [
      { from: '(', to: ' ', enabled: true },
      { from: ')', to: ' ', enabled: true },
      { from: '（', to: ' ', enabled: true },
      { from: '）', to: ' ', enabled: true },
      { from: '[', to: ' ', enabled: true },
      { from: ']', to: ' ', enabled: true },
      { from: '【', to: ' ', enabled: true },
      { from: '】', to: ' ', enabled: true },
      { from: '{', to: ' ', enabled: true },
      { from: '}', to: ' ', enabled: true },
      { from: ',', to: ' ', enabled: true },
      { from: '，', to: ' ', enabled: true },
      { from: '.', to: ' ', enabled: true },
      { from: '。', to: ' ', enabled: true },
      { from: ';', to: ' ', enabled: true },
      { from: '；', to: ' ', enabled: true },
      { from: '?', to: ' ', enabled: true },
      { from: '？', to: ' ', enabled: true }
    ];
  }

  function loadSkuFilters() {
    try {
      var raw = localStorage.getItem(SKU_FILTER_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    var defaults = getDefaultSkuFilters();
    saveSkuFilters(defaults);
    return defaults;
  }

  function saveSkuFilters(data) {
    localStorage.setItem(SKU_FILTER_KEY, JSON.stringify(data));
  }

  function loadSkuFilterEnabled() {
    var val = localStorage.getItem(SKU_FILTER_ENABLED_KEY);
    return val !== 'false';
  }

  function saveSkuFilterEnabled(val) {
    localStorage.setItem(SKU_FILTER_ENABLED_KEY, val ? 'true' : 'false');
  }

  function loadAutoSkuNo() {
    var val = localStorage.getItem(AUTO_SKU_NO_KEY);
    return val !== 'false';
  }

  function saveAutoSkuNo(val) {
    localStorage.setItem(AUTO_SKU_NO_KEY, val ? 'true' : 'false');
  }

  function loadDelVideo() {
    var val = localStorage.getItem(DEL_VIDEO_KEY);
    return val !== 'false';
  }

  function saveDelVideo(val) {
    localStorage.setItem(DEL_VIDEO_KEY, val ? 'true' : 'false');
  }


  // 分组一次性过滤：同替换目标归为一组，组内按匹配长度降序，最长优先，避免二次替换
  // 支持 / 分隔多个关键词，如 "黄金/金色/金" → 三个独立匹配
  function applyFilters(text, filters) {
    // 按 to 分组，同时记录 from→to 映射
    var groups = {};
    var fromToMap = {};
    for (var i = 0; i < filters.length; i++) {
      var f = filters[i];
      if (!f.enabled || !f.from) continue;
      var key = f.to === undefined ? '' : f.to;
      if (!groups[key]) groups[key] = { to: key, froms: [] };
      var parts = f.from.split('/');
      for (var p = 0; p < parts.length; p++) {
        var word = parts[p].trim();
        if (!word) continue;
        groups[key].froms.push(word);
        fromToMap[word] = key;
      }
    }

    // 在原始文本上标记所有匹配区域 [start, end)
    var marked = []; // [{ start, end, from }]
    var hitFroms = [];

    var keys = Object.keys(groups);
    for (var g = 0; g < keys.length; g++) {
      var grp = groups[keys[g]];
      grp.froms.sort(function (a, b) { return b.length - a.length; });

      for (var fi = 0; fi < grp.froms.length; fi++) {
        var from = grp.froms[fi];
        var pos = text.indexOf(from);
        while (pos !== -1) {
          var overlaps = false;
          for (var m = 0; m < marked.length; m++) {
            if (pos < marked[m].end && pos + from.length > marked[m].start) {
              overlaps = true;
              break;
            }
          }
          if (!overlaps) {
            marked.push({ start: pos, end: pos + from.length, from: from });
            hitFroms.push(from);
          }
          pos = text.indexOf(from, pos + 1);
        }
      }
    }

    if (marked.length === 0) return { text: text, hits: [], changed: false };

    marked.sort(function (a, b) { return a.start - b.start; });

    var result = '';
    var lastEnd = 0;
    for (var r = 0; r < marked.length; r++) {
      result += text.substring(lastEnd, marked[r].start) + fromToMap[marked[r].from];
      lastEnd = marked[r].end;
    }
    result += text.substring(lastEnd);

    // 去重 hits
    var uniqueHits = [];
    for (var h = 0; h < hitFroms.length; h++) {
      if (uniqueHits.indexOf(hitFroms[h]) === -1) uniqueHits.push(hitFroms[h]);
    }

    return { text: result, hits: uniqueHits, changed: result !== text };
  }

  function setInputValue(input, val) {
    var proto = input.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    var nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    nativeSetter.call(input, val);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function findVisibleLi(textFragment) {
    var allLi = document.querySelectorAll('li');
    for (var i = 0; i < allLi.length; i++) {
      if (allLi[i].offsetParent === null) continue;
      if ((allLi[i].textContent || '').indexOf(textFragment) !== -1) return allLi[i];
    }
    return null;
  }

  function waitForVisibleLi(textFragment, timeout, cb) {
    var start = Date.now();
    (function check() {
      var el = findVisibleLi(textFragment);
      if (el) return cb(el);
      if (Date.now() - start > timeout) return cb(null);
      requestAnimationFrame(check);
    })();
  }

  function findVisibleModal(titleText) {
    var titles = document.querySelectorAll('.ant-modal-title');
    for (var t = 0; t < titles.length; t++) {
      if ((titles[t].textContent || '').indexOf(titleText) !== -1) {
        var wrap = titles[t];
        while (wrap && !wrap.classList.contains('ant-modal-wrap')) { wrap = wrap.parentElement; }
        if (wrap && getComputedStyle(wrap).display !== 'none') {
          return wrap;
        }
      }
    }
    return null;
  }

  window.BeeConfig = {
    FILTER_KEY: FILTER_KEY,
    AUTO_PUBLISH_KEY: AUTO_PUBLISH_KEY,
    STORE_KEY: STORE_KEY,
    SELECTED_STORE_KEY: SELECTED_STORE_KEY,
    getDefaultFilters: getDefaultFilters,
    loadFilters: loadFilters,
    saveFilters: saveFilters,
    loadAutoPublish: loadAutoPublish,
    saveAutoPublish: saveAutoPublish,
    loadStores: loadStores,
    saveStores: saveStores,
    loadSelectedStore: loadSelectedStore,
    saveSelectedStore: saveSelectedStore,
    loadUseWebImage: loadUseWebImage,
    saveUseWebImage: saveUseWebImage,
    loadFilterEnabled: loadFilterEnabled,
    saveFilterEnabled: saveFilterEnabled,
    loadAutoCategory: loadAutoCategory,
    saveAutoCategory: saveAutoCategory,
    loadProvince: loadProvince,
    saveProvince: saveProvince,
    loadAutoTranslate: loadAutoTranslate,
    saveAutoTranslate: saveAutoTranslate,
    getDefaultSkuFilters: getDefaultSkuFilters,
    loadSkuFilters: loadSkuFilters,
    saveSkuFilters: saveSkuFilters,
    loadSkuFilterEnabled: loadSkuFilterEnabled,
    saveSkuFilterEnabled: saveSkuFilterEnabled,
    loadAutoSkuNo: loadAutoSkuNo,
    saveAutoSkuNo: saveAutoSkuNo,
    loadDelVideo: loadDelVideo,
    saveDelVideo: saveDelVideo,
    setInputValue: setInputValue,
    applyFilters: applyFilters,
    findVisibleModal: findVisibleModal,
    findVisibleLi: findVisibleLi,
    waitForVisibleLi: waitForVisibleLi
  };
})();
