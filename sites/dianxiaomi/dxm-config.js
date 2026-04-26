(function () {
  if (window.BeeConfig) return;

  var FILTER_KEY = '__dxm_bee_filters';
  var AUTO_PUBLISH_KEY = '__dxm_bee_auto_publish';
  var STORE_KEY = '__dxm_bee_stores';
  var SELECTED_STORE_KEY = '__dxm_bee_selected_store';
  var WEB_IMAGE_KEY = '__dxm_bee_use_web_image';
  var FILTER_ENABLED_KEY = '__dxm_bee_filter_enabled';
  var AUTO_CATEGORY_KEY = '__dxm_bee_auto_category';

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


  function setInputValue(input, val) {
    var proto = input.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    var nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    nativeSetter.call(input, val);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
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
    setInputValue: setInputValue,
    findVisibleModal: findVisibleModal
  };
})();
