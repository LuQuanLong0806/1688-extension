(function () {
  if (window.__dxmConfigUI) return;
  window.__dxmConfigUI = true;

  var Config = window.BeeConfig;

  // ========== Config UI Styles ==========
  var s = document.createElement('style');
  s.textContent =
    // --- Context menu ---
    '#__dxm_bee_menu{display:none;position:fixed;z-index:2147483646;background:#fff;border-radius:10px;box-shadow:0 4px 20px rgba(0,0,0,.18);padding:6px 0;min-width:200px;font:13px/1.5 "Microsoft YaHei",Arial,sans-serif;color:#333}' +
    '#__dxm_bee_menu.show{display:block}' +
    '#__dxm_bee_menu .menu-item{display:flex;align-items:center;justify-content:space-between;padding:10px 18px;cursor:pointer;transition:background .15s}' +
    '#__dxm_bee_menu .menu-item:hover{background:#FFF8E1}' +
    '#__dxm_bee_menu .menu-label{display:flex;align-items:center;gap:8px}' +
    // --- Switch ---
    '#__dxm_bee_menu .switch{position:relative;width:36px;height:20px;background:#ccc;border-radius:10px;cursor:pointer;transition:background .25s;flex-shrink:0}' +
    '#__dxm_bee_menu .switch.on{background:#FFA000}' +
    '#__dxm_bee_menu .switch::after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;background:#fff;border-radius:50%;transition:transform .25s;box-shadow:0 1px 3px rgba(0,0,0,.2)}' +
    '#__dxm_bee_menu .switch.on::after{transform:translateX(16px)}' +
    // --- Menu value & arrow ---
    '#__dxm_bee_menu .menu-value{font-size:12px;color:#999;max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '#__dxm_bee_menu .menu-arrow{font-size:14px;color:#999;margin-left:4px}' +
    // --- Store popup ---
    '#__dxm_bee_store_overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:2147483647;align-items:center;justify-content:center}' +
    '#__dxm_bee_store_overlay.show{display:flex}' +
    '#__dxm_bee_store_panel{background:#fff;border-radius:14px;box-shadow:0 8px 40px rgba(0,0,0,.2);width:420px;font:13px/1.6 "Microsoft YaHei",Arial,sans-serif;color:#333;overflow:hidden}' +
    '#__dxm_bee_store_header{display:flex;align-items:center;justify-content:space-between;padding:16px 22px;border-bottom:1px solid #f0f0f0;background:linear-gradient(135deg,#FFFDE7,#FFF8E1)}' +
    '#__dxm_bee_store_header h3{margin:0;font-size:15px;color:#5D4037;font-weight:600}' +
    '#__dxm_bee_store_panel .close-btn{width:28px;height:28px;border:none;background:none;font-size:17px;cursor:pointer;color:#999;border-radius:50%;display:flex;align-items:center;justify-content:center;transition:background .2s}' +
    '#__dxm_bee_store_panel .close-btn:hover{background:rgba(0,0,0,.06);color:#333}' +
    '#__dxm_bee_store_body{padding:18px 22px}' +
    '#__dxm_bee_store_body .section-label{font-size:12px;color:#888;margin-bottom:10px;font-weight:500}' +
    '#__dxm_bee_store_tags{display:flex;flex-wrap:wrap;gap:8px;min-height:32px}' +
    '#__dxm_bee_store_tags .store-tag{display:inline-flex;align-items:center;gap:4px;padding:5px 12px;border:1px solid #e0e0e0;border-radius:16px;font-size:12px;cursor:pointer;transition:all .2s;user-select:none}' +
    '#__dxm_bee_store_tags .store-tag:hover{border-color:#FFA000}' +
    '#__dxm_bee_store_tags .store-tag.selected{background:#FFF3E0;border-color:#FFA000;color:#E65100;font-weight:500}' +
    '#__dxm_bee_store_tags .store-tag .tag-x{font-size:11px;color:#ccc;cursor:pointer;margin-left:2px;transition:color .15s}' +
    '#__dxm_bee_store_tags .store-tag .tag-x:hover{color:#ff4d4f}' +
    '#__dxm_bee_store_add{display:flex;gap:8px;margin-top:18px;padding-top:16px;border-top:1px solid #f5f5f5}' +
    '#__dxm_bee_store_add input{flex:1;padding:7px 12px;border:1px solid #e0e0e0;border-radius:8px;font-size:13px;outline:none;transition:border-color .2s}' +
    '#__dxm_bee_store_add input:focus{border-color:#FFA000;box-shadow:0 0 0 2px rgba(255,160,0,.12)}' +
    '#__dxm_bee_store_add button{padding:7px 16px;background:#FFA000;color:#fff;border:none;border-radius:8px;font-size:12px;cursor:pointer;transition:background .2s;white-space:nowrap}' +
    '#__dxm_bee_store_add button:hover{background:#FF8F00}' +
    // --- Filter settings overlay ---
    '#__dxm_bee_overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:2147483645;align-items:center;justify-content:center}' +
    '#__dxm_bee_overlay.show{display:flex}' +
    // --- Filter settings panel ---
    '#__dxm_bee_settings{background:#fff;border-radius:14px;box-shadow:0 8px 40px rgba(0,0,0,.2);width:560px;max-height:80vh;display:flex;flex-direction:column;font:13px/1.6 "Microsoft YaHei",Arial,sans-serif;color:#333;overflow:hidden;position:relative}' +
    '#__dxm_bee_settings_header{display:flex;align-items:center;justify-content:space-between;padding:16px 24px;border-bottom:1px solid #f0f0f0;background:linear-gradient(135deg,#FFFDE7,#FFF8E1)}' +
    '#__dxm_bee_settings_header h3{margin:0;font-size:15px;color:#5D4037;font-weight:600}' +
    '#__dxm_bee_settings_close{width:30px;height:30px;border:none;background:none;font-size:18px;cursor:pointer;color:#999;border-radius:50%;display:flex;align-items:center;justify-content:center;transition:background .2s}' +
    '#__dxm_bee_settings_close:hover{background:rgba(0,0,0,.06);color:#333}' +
    '#__dxm_bee_settings_toolbar{display:flex;gap:10px;padding:14px 24px;border-bottom:1px solid #f0f0f0}' +
    '#__dxm_bee_settings_toolbar button{padding:6px 16px;border:1px solid #d9d9d9;border-radius:6px;background:#fff;cursor:pointer;font-size:12px;transition:all .2s}' +
    '#__dxm_bee_settings_toolbar button:hover{border-color:#FFA000;color:#E65100}' +
    '#__dxm_bee_settings_toolbar .btn-primary{background:#FFA000;color:#fff;border-color:#FFA000}' +
    '#__dxm_bee_settings_toolbar .btn-primary:hover{background:#FF8F00}' +
    '#__dxm_bee_settings_body{flex:1;overflow-y:auto;padding:0 24px 20px}' +
    '#__dxm_bee_settings table{width:100%;border-collapse:collapse;margin-top:14px}' +
    '#__dxm_bee_settings th{text-align:left;padding:10px 8px;color:#888;font-weight:500;border-bottom:2px solid #FFA000;font-size:12px}' +
    '#__dxm_bee_settings td{padding:8px;border-bottom:1px solid #f5f5f5}' +
    '#__dxm_bee_settings td input{width:100%;padding:6px 10px;border:1px solid #e0e0e0;border-radius:6px;font-size:13px;outline:none;transition:border-color .2s}' +
    '#__dxm_bee_settings td input:focus{border-color:#FFA000;box-shadow:0 0 0 2px rgba(255,160,0,.12)}' +
    '#__dxm_bee_settings .btn-toggle{padding:4px 10px;border:1px solid #d9d9d9;border-radius:5px;background:#fff;cursor:pointer;font-size:11px;transition:all .2s}' +
    '#__dxm_bee_settings .btn-toggle.off{color:#999;border-color:#eee}' +
    '#__dxm_bee_settings .btn-toggle.on{color:#52c41a;border-color:#b7eb8f;background:#f6ffed}' +
    '#__dxm_bee_settings .btn-del{padding:4px 10px;border:1px solid #ffccc7;border-radius:5px;background:#fff;color:#ff4d4f;cursor:pointer;font-size:11px;transition:all .2s}' +
    '#__dxm_bee_settings .btn-del:hover{background:#fff1f0}' +
    '#__dxm_bee_settings .toast{display:none;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(82,196,26,.92);color:#fff;padding:8px 24px;border-radius:8px;font-size:13px;pointer-events:none}' +
    '#__dxm_bee_settings .toast.show{display:block;animation:__dxm_toast .3s ease}' +
    '@keyframes __dxm_toast{from{opacity:0;transform:translate(-50%,-50%) scale(.9)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}}';
  document.head.appendChild(s);

  // ========== Context Menu ==========
  var menu = document.createElement('div');
  menu.id = '__dxm_bee_menu';
  var autoPublishOn = Config.loadAutoPublish();
  var currentStore = Config.loadSelectedStore();
  var useWebImage = Config.loadUseWebImage();
  var filterEnabled = Config.loadFilterEnabled();
  menu.innerHTML =
    '<div class="menu-item" id="__dxm_bee_menu_filter"><span class="menu-label" id="__dxm_bee_menu_filter_text">📝 文字过滤配置</span><div class="switch ' + (filterEnabled ? 'on' : '') + '" id="__dxm_bee_menu_filter_switch"></div></div>' +
    '<div class="menu-item" id="__dxm_bee_menu_store"><span class="menu-label">🏪 选择店铺</span><span class="menu-value" id="__dxm_bee_menu_store_name">' + (currentStore || '未选择') + '</span><span class="menu-arrow">▸</span></div>' +
    '<div class="menu-item"><span class="menu-label">🌐 网络图片</span><div class="switch ' + (useWebImage ? 'on' : '') + '" id="__dxm_bee_menu_webimg_switch"></div></div>' +
    '<div class="menu-item"><span class="menu-label">🚀 自动发布</span><div class="switch ' + (autoPublishOn ? 'on' : '') + '" id="__dxm_bee_menu_publish_switch"></div></div>';
  document.body.appendChild(menu);

  var publishSwitch = document.getElementById('__dxm_bee_menu_publish_switch');
  var menuStoreName = document.getElementById('__dxm_bee_menu_store_name');

  function showMenu(x, y) {
    menu.style.left = Math.min(x, window.innerWidth - 220) + 'px';
    menu.style.top = Math.min(y, window.innerHeight - 100) + 'px';
    menu.classList.add('show');
  }

  function hideMenu() {
    menu.classList.remove('show');
  }

  // Attach to bee icon (created by float-bee.js which loads before this file)
  var icon = document.getElementById('__dxm_bee_icon');
  if (icon) {
    icon.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      e.stopPropagation();
      showMenu(e.clientX, e.clientY);
    });
  }

  document.addEventListener('click', function (e) {
    if (!menu.contains(e.target)) hideMenu();
  });

  document.getElementById('__dxm_bee_menu_filter_text').addEventListener('click', function () {
    hideMenu();
    openSettings();
  });

  var filterSwitch = document.getElementById('__dxm_bee_menu_filter_switch');
  filterSwitch.addEventListener('click', function (e) {
    e.stopPropagation();
    var on = !this.classList.contains('on');
    this.classList.toggle('on', on);
    Config.saveFilterEnabled(on);
    console.log('%c[小蜜蜂] 文字过滤: ' + (on ? '开启' : '关闭'), 'color:#FFA000;font-weight:bold');
  });

  publishSwitch.addEventListener('click', function () {
    var on = !this.classList.contains('on');
    this.classList.toggle('on', on);
    Config.saveAutoPublish(on);
    console.log('%c[小蜜蜂] 自动发布: ' + (on ? '开启' : '关闭'), 'color:#FFA000;font-weight:bold');
  });

  var webimgSwitch = document.getElementById('__dxm_bee_menu_webimg_switch');
  webimgSwitch.addEventListener('click', function () {
    var on = !this.classList.contains('on');
    this.classList.toggle('on', on);
    Config.saveUseWebImage(on);
    console.log('%c[小蜜蜂] 网络图片: ' + (on ? '开启' : '关闭'), 'color:#FFA000;font-weight:bold');
  });

  // ========== Store Popup ==========
  var storeOverlay = document.createElement('div');
  storeOverlay.id = '__dxm_bee_store_overlay';
  storeOverlay.innerHTML =
    '<div id="__dxm_bee_store_panel">' +
    '<div id="__dxm_bee_store_header"><h3>店铺管理</h3><button class="close-btn" id="__dxm_bee_store_close">✕</button></div>' +
    '<div id="__dxm_bee_store_body">' +
      '<div class="section-label">所有店铺（点击选择）</div>' +
      '<div id="__dxm_bee_store_tags"></div>' +
      '<div id="__dxm_bee_store_add">' +
        '<input type="text" id="__dxm_bee_store_input" placeholder="输入店铺名称" maxlength="30">' +
        '<button id="__dxm_bee_store_add_btn">+ 添加</button>' +
      '</div>' +
    '</div></div>';
  document.body.appendChild(storeOverlay);

  var storeTags = document.getElementById('__dxm_bee_store_tags');
  var storeInput = document.getElementById('__dxm_bee_store_input');

  function renderStores() {
    storeTags.innerHTML = '';
    var stores = Config.loadStores();
    var selected = Config.loadSelectedStore();
    if (!stores.length) {
      storeTags.innerHTML = '<div style="color:#ccc;font-size:12px;padding:6px 0">暂无店铺，请添加</div>';
      return;
    }
    for (var i = 0; i < stores.length; i++) {
      var tag = document.createElement('span');
      tag.className = 'store-tag' + (stores[i] === selected ? ' selected' : '');
      tag.innerHTML = stores[i] + '<span class="tag-x" data-store="' + stores[i] + '">×</span>';
      tag.setAttribute('data-store', stores[i]);
      storeTags.appendChild(tag);
    }
  }

  function refreshMenuStoreName() {
    menuStoreName.textContent = Config.loadSelectedStore() || '未选择';
  }

  function openStorePopup() {
    renderStores();
    storeInput.value = '';
    storeOverlay.classList.add('show');
    setTimeout(function () { storeInput.focus(); }, 100);
  }

  function closeStorePopup() {
    storeOverlay.classList.remove('show');
  }

  document.getElementById('__dxm_bee_menu_store').addEventListener('click', function () {
    hideMenu();
    openStorePopup();
  });

  storeOverlay.addEventListener('click', function (e) {
    if (e.target === storeOverlay) closeStorePopup();
  });
  document.getElementById('__dxm_bee_store_close').addEventListener('click', closeStorePopup);

  storeTags.addEventListener('click', function (e) {
    var tagX = e.target.closest('.tag-x');
    if (tagX) {
      var name = tagX.getAttribute('data-store');
      var stores = Config.loadStores().filter(function (s) { return s !== name; });
      Config.saveStores(stores);
      if (Config.loadSelectedStore() === name) {
        Config.saveSelectedStore(stores.length ? stores[0] : '');
        refreshMenuStoreName();
      }
      renderStores();
      return;
    }
    var tag = e.target.closest('.store-tag');
    if (tag) {
      Config.saveSelectedStore(tag.getAttribute('data-store'));
      refreshMenuStoreName();
      renderStores();
    }
  });

  function addStore() {
    var name = storeInput.value.trim();
    if (!name) return;
    var stores = Config.loadStores();
    if (stores.indexOf(name) !== -1) { storeInput.value = ''; return; }
    stores.push(name);
    Config.saveStores(stores);
    if (!Config.loadSelectedStore()) {
      Config.saveSelectedStore(name);
      refreshMenuStoreName();
    }
    storeInput.value = '';
    renderStores();
  }

  document.getElementById('__dxm_bee_store_add_btn').addEventListener('click', addStore);
  storeInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') addStore();
  });

  // ========== Filter Settings Panel ==========
  var overlay = document.createElement('div');
  overlay.id = '__dxm_bee_overlay';
  overlay.innerHTML =
    '<div id="__dxm_bee_settings">' +
    '<div class="toast" id="__dxm_bee_settings_toast">已保存</div>' +
    '<div id="__dxm_bee_settings_header">' +
      '<h3>文字过滤配置</h3>' +
      '<button id="__dxm_bee_settings_close">✕</button>' +
    '</div>' +
    '<div id="__dxm_bee_settings_toolbar">' +
      '<button class="btn-primary" id="__dxm_bee_settings_add">+ 新增</button>' +
      '<button class="btn-primary" id="__dxm_bee_settings_save">保存</button>' +
    '</div>' +
    '<div id="__dxm_bee_settings_body">' +
      '<table><thead><tr><th style="width:35%">被过滤文字</th><th style="width:35%">填充文字</th><th>操作</th></tr></thead>' +
      '<tbody id="__dxm_bee_settings_tbody"></tbody></table>' +
    '</div></div>';
  document.body.appendChild(overlay);

  var tbody = document.getElementById('__dxm_bee_settings_tbody');
  var toastEl = document.getElementById('__dxm_bee_settings_toast');

  function renderFilterRow(f) {
    var tr = document.createElement('tr');
    var toggleClass = f.enabled ? 'btn-toggle on' : 'btn-toggle off';
    var toggleText = f.enabled ? '启用' : '禁用';
    tr.innerHTML =
      '<td><input type="text" maxlength="20" class="f-from" value="' + (f.from || '') + '"></td>' +
      '<td><input type="text" maxlength="20" class="f-to" value="' + (f.to || '') + '"></td>' +
      '<td><button class="' + toggleClass + '">' + toggleText + '</button> <button class="btn-del">删除</button></td>';
    return tr;
  }

  function renderSettings() {
    tbody.innerHTML = '';
    var filters = Config.loadFilters();
    for (var i = 0; i < filters.length; i++) {
      tbody.appendChild(renderFilterRow(filters[i]));
    }
  }

  function openSettings() {
    renderSettings();
    overlay.classList.add('show');
  }

  function closeSettings() {
    overlay.classList.remove('show');
  }

  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) closeSettings();
  });
  document.getElementById('__dxm_bee_settings_close').addEventListener('click', closeSettings);

  document.getElementById('__dxm_bee_settings_add').addEventListener('click', function () {
    tbody.appendChild(renderFilterRow({ from: '', to: '', enabled: true }));
    var body = document.getElementById('__dxm_bee_settings_body');
    body.scrollTop = body.scrollHeight;
  });

  document.getElementById('__dxm_bee_settings_save').addEventListener('click', function () {
    var rows = tbody.querySelectorAll('tr');
    var data = [];
    for (var i = 0; i < rows.length; i++) {
      var fromInput = rows[i].querySelector('.f-from');
      var toInput = rows[i].querySelector('.f-to');
      var toggleBtn = rows[i].querySelector('.btn-toggle');
      if (!fromInput) continue;
      var from = fromInput.value.trim();
      if (!from) continue;
      data.push({
        from: from,
        to: toInput ? toInput.value : '',
        enabled: toggleBtn ? toggleBtn.classList.contains('on') : true
      });
    }
    Config.saveFilters(data);
    toastEl.classList.add('show');
    setTimeout(function () { toastEl.classList.remove('show'); }, 1500);
    console.log('%c[小蜜蜂] 过滤配置已保存', 'color:#52c41a;font-weight:bold', data);
  });

  tbody.addEventListener('click', function (e) {
    if (e.target.classList.contains('btn-toggle')) {
      var on = !e.target.classList.contains('on');
      e.target.classList.toggle('on', on);
      e.target.classList.toggle('off', !on);
      e.target.textContent = on ? '启用' : '禁用';
    }
    if (e.target.classList.contains('btn-del')) {
      var tr = e.target.closest('tr');
      if (tr) tr.remove();
    }
  });
})();
