(function () {
  if (window.__dxmConfigUI) return;
  window.__dxmConfigUI = true;

  var Config = window.BeeConfig;

  // ========== Config UI Styles ==========
  var s = document.createElement('style');
  s.textContent =
    // --- Context menu ---
    '#__dxm_bee_menu{display:none;position:fixed;z-index:2147483646;background:#fff;border-radius:10px;box-shadow:0 4px 20px rgba(0,0,0,.18);padding:0 0 8px;font:12px/1.4 "Microsoft YaHei",Arial,sans-serif;color:#333;min-width:260px;max-width:320px;overflow:hidden}' +
    '#__dxm_bee_menu.show{display:block}' +
    '#__dxm_bee_menu .menu-item{display:flex;align-items:center;justify-content:space-between;padding:6px 12px;transition:background .15s;flex-wrap:wrap}' +
    '#__dxm_bee_menu .menu-item:hover{background:#FFF8E1}' +
    '#__dxm_bee_menu .menu-label{display:flex;align-items:center;gap:6px;font-size:12px}' +
    '#__dxm_bee_menu .menu-item.clickable{cursor:pointer}' +
    '#__dxm_bee_menu .menu-label.clickable{cursor:pointer}' +
    '#__dxm_bee_menu .menu-desc{width:100%;font-size:10px;color:#aaa;padding-left:0;margin-top:1px;pointer-events:none;line-height:1.3}' +
    // --- Switch ---
    '#__dxm_bee_menu .switch{position:relative;width:36px;height:20px;background:#ccc;border-radius:10px;cursor:pointer;transition:background .25s;flex-shrink:0}' +
    '#__dxm_bee_menu .switch.on{background:#FFA000}' +
    '#__dxm_bee_menu .switch::after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;background:#fff;border-radius:50%;transition:transform .25s;box-shadow:0 1px 3px rgba(0,0,0,.2)}' +
    '#__dxm_bee_menu .switch.on::after{transform:translateX(16px)}' +
    // --- Menu value & arrow ---
    '#__dxm_bee_menu .menu-value{font-size:12px;color:#999;max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '#__dxm_bee_menu .menu-arrow{font-size:14px;color:#999;margin-left:4px}' +
    '#__dxm_bee_menu .menu-input{width:80px;padding:3px 8px;border:1px solid #e0e0e0;border-radius:5px;font-size:12px;outline:none;text-align:right;transition:border-color .2s}' +
    '#__dxm_bee_menu .menu-input:focus{border-color:#FFA000;box-shadow:0 0 0 2px rgba(255,160,0,.12)}' +
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
    '#__dxm_bee_settings_hint{font-size:11px;color:#aaa;align-self:center;margin-left:auto;white-space:nowrap}' +
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
    '@keyframes __dxm_toast{from{opacity:0;transform:translate(-50%,-50%) scale(.9)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}}' +
    // --- Sync popup ---
    '#__dxm_bee_sync_overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:2147483647;align-items:center;justify-content:center}' +
    '#__dxm_bee_sync_overlay.show{display:flex}' +
    '#__dxm_bee_sync_panel{background:#fff;border-radius:14px;box-shadow:0 8px 40px rgba(0,0,0,.2);width:520px;max-height:80vh;display:flex;flex-direction:column;font:13px/1.6 "Microsoft YaHei",Arial,sans-serif;color:#333;overflow:hidden}' +
    '#__dxm_bee_sync_header{display:flex;align-items:center;justify-content:space-between;padding:16px 22px;border-bottom:1px solid #f0f0f0;background:linear-gradient(135deg,#FFFDE7,#FFF8E1)}' +
    '#__dxm_bee_sync_header h3{margin:0;font-size:15px;color:#5D4037;font-weight:600}' +
    '#__dxm_bee_sync_toolbar{display:flex;align-items:center;gap:10px;padding:14px 22px;border-bottom:1px solid #f0f0f0}' +
    '#__dxm_bee_sync_toolbar input{flex:1;padding:7px 12px;border:1px solid #e0e0e0;border-radius:8px;font-size:13px;outline:none}' +
    '#__dxm_bee_sync_toolbar input:focus{border-color:#FFA000;box-shadow:0 0 0 2px rgba(255,160,0,.12)}' +
    '#__dxm_bee_sync_list{flex:1;overflow-y:auto;padding:0}' +
    '.sync-row{display:flex;align-items:center;justify-content:space-between;padding:10px 22px;border-bottom:1px solid #f5f5f5;transition:background .15s}' +
    '.sync-row:hover{background:#FFF8E1}' +
    '.sync-row-name{font-size:13px;flex:1;display:flex;align-items:center}' +
    '.sync-row-btn{padding:4px 14px;border:1px solid #FFA000;border-radius:6px;background:#fff;color:#E65100;font-size:12px;cursor:pointer;transition:all .2s;white-space:nowrap}' +
    '.sync-row-btn:hover{background:#FFA000;color:#fff}' +
    '.sync-row-btn:disabled{opacity:.5;cursor:not-allowed;background:#f5f5f0;color:#999;border-color:#e0e0e0}' +
    '#__dxm_bee_sync_footer{padding:12px 22px;border-top:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center}' +
    '#__dxm_bee_sync_status{font-size:12px;color:#888}' +
    // --- Button visibility sub-panel ---
    '#__dxm_bee_btn_vis_panel{display:none;position:fixed;z-index:2147483647;background:#fff;border-radius:10px;box-shadow:0 4px 20px rgba(0,0,0,.18);padding:6px 6px 8px;min-width:130px;font:12px/1.4 "Microsoft YaHei",Arial,sans-serif;color:#333}' +
    '#__dxm_bee_btn_vis_panel.show{display:block}' +
    '#__dxm_bee_btn_vis_panel .cfg-title{font-size:11px;color:#aaa;padding:2px 8px 6px;letter-spacing:.3px;font-weight:500}' +
    '#__dxm_bee_btn_vis_panel label{display:flex;align-items:center;gap:8px;padding:6px 8px;margin-bottom:2px;border-radius:6px;font-size:12px;color:#333;cursor:pointer;transition:background .12s}' +
    '#__dxm_bee_btn_vis_panel label:last-child{margin-bottom:0}' +
    '#__dxm_bee_btn_vis_panel label:hover{background:#FFF8E1}' +
    '#__dxm_bee_btn_vis_panel input{display:none}' +
    '#__dxm_bee_btn_vis_panel .cfg-ck{width:14px;height:14px;border:1.5px solid #ccc;border-radius:3px;display:flex;align-items:center;justify-content:center;transition:all .15s;flex-shrink:0}' +
    '#__dxm_bee_btn_vis_panel label:hover .cfg-ck{border-color:#FFA000}' +
    '#__dxm_bee_btn_vis_panel input:checked+.cfg-ck{background:#FFA000;border-color:#FFA000}' +
    '#__dxm_bee_btn_vis_panel input:checked+.cfg-ck::after{content:\'\';width:3px;height:6px;border:solid #fff;border-width:0 1.5px 1.5px 0;transform:rotate(45deg);margin-top:-1px}' +
    // --- 顶部用户信息区 ---
    '#__dxm_bee_menu .m-menu-user{display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid #f0f0f0}' +
    '#__dxm_bee_menu .m-avatar{width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,#FFA000,#FF8F00);color:#fff;font-size:15px;font-weight:600;display:flex;align-items:center;justify-content:center;flex-shrink:0}' +
    '#__dxm_bee_menu .m-avatar.unlogged{background:linear-gradient(135deg,#bbb,#999)}' +
    '#__dxm_bee_menu .m-user-info{flex:1;min-width:0}' +
    '#__dxm_bee_menu .m-user-name{font-size:13px;font-weight:600;color:#333;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '#__dxm_bee_menu .m-user-name.unlogged{color:#ff4d4f}' +
    // --- 手风琴分组 ---
    '#__dxm_bee_menu .m-group{border-top:1px solid #f5f5f5}' +
    '#__dxm_bee_menu .m-group:first-of-type{border-top:none}' +
    '#__dxm_bee_menu .m-group-header{display:flex;align-items:center;justify-content:space-between;padding:9px 14px 9px 12px;cursor:pointer;font-size:12px;color:#666;font-weight:600;background:transparent;border-left:3px solid transparent;transition:background .2s,color .2s,border-color .2s;user-select:none;position:relative}' +
    '#__dxm_bee_menu .m-group-header:hover{background:linear-gradient(90deg,#FFF8E1 0%,rgba(255,248,225,0) 100%);color:#E65100;border-left-color:#FFD54F}' +
    '#__dxm_bee_menu .m-group.expanded .m-group-header{background:linear-gradient(90deg,#FFF3E0 0%,rgba(255,243,224,0) 100%);color:#E65100;border-left-color:#FFA000}' +
    '#__dxm_bee_menu .m-group-arrow{display:inline-block;width:7px;height:7px;border-right:1.5px solid #bbb;border-bottom:1.5px solid #bbb;transform:rotate(-45deg);transition:transform .25s cubic-bezier(.4,0,.2,1),border-color .2s;margin-right:3px;flex-shrink:0}' +
    '#__dxm_bee_menu .m-group-header:hover .m-group-arrow{border-color:#FFA000}' +
    '#__dxm_bee_menu .m-group.expanded .m-group-arrow{transform:rotate(45deg);border-color:#FFA000}' +
    '#__dxm_bee_menu .m-group-body{height:0;overflow:hidden;transition:height .26s cubic-bezier(.4,0,.2,1)}' +
    // --- 服务器地址 icon 编辑/保存/测试 ---
    '#__dxm_bee_menu .m-server-input{flex:1;padding:6px 8px;border:1px solid #e0e0e0;border-radius:5px;font-size:12px;font-family:inherit;outline:none;background:#f9f9f9;color:#667;transition:all .2s}' +
    '#__dxm_bee_menu .m-server-input.editable{background:#fff;color:#333;border-color:#FFA000;box-shadow:0 0 0 2px rgba(255,160,0,.12)}' +
    '#__dxm_bee_menu .m-input-row{display:flex;align-items:center;gap:6px;width:100%;margin-top:4px}' +
    '#__dxm_bee_menu .m-icon-btn{width:26px;height:26px;flex-shrink:0;border:1px solid #e0e0e0;background:#fff;border-radius:5px;font-size:12px;color:#666;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .2s}' +
    '#__dxm_bee_menu .m-icon-btn:hover{border-color:#FFA000;color:#E65100;background:#FFF8E1}' +
    '#__dxm_bee_menu .m-icon-btn.m-save{border-color:#FFA000;background:#FFA000;color:#fff}' +
    '#__dxm_bee_menu .m-icon-btn.m-save:hover{background:#FF8F00}' +
    '#__dxm_bee_menu .m-icon-btn.m-save.saved{background:#52c41a;border-color:#52c41a}' +
    '#__dxm_bee_menu .m-feedback{font-size:11px;margin-top:4px;min-height:14px;opacity:0;transition:opacity .2s}' +
    '#__dxm_bee_menu .m-feedback.show{opacity:1}' +
    '#__dxm_bee_menu .m-feedback.ok{color:#52c41a}' +
    '#__dxm_bee_menu .m-feedback.err{color:#ff4d4f}';
  document.head.appendChild(s);

  // ========== Context Menu ==========
  var menu = document.createElement('div');
  menu.id = '__dxm_bee_menu';
  var currentStore = Config.loadSelectedStore();
  var filterEnabled = Config.loadFilterEnabled();
  var skuFilterEnabled = Config.loadSkuFilterEnabled();
  var province = Config.loadProvince();
  var autoSkuNo = Config.loadAutoSkuNo();
  var autoResize = Config.loadAutoResize();
  var shopId = Config.loadShopId();
  menu.innerHTML =
    '<div class="m-menu-user">' +
      '<div class="m-avatar" id="__dxm_bee_menu_avatar">?</div>' +
      '<div class="m-user-info">' +
        '<div class="m-user-name" id="__dxm_bee_menu_user_name">检测中...</div>' +
      '</div>' +
    '</div>' +
    '<div class="m-group" data-group="filter">' +
      '<div class="m-group-header"><span>内容过滤</span><span class="m-group-arrow"></span></div>' +
      '<div class="m-group-body">' +
        '<div class="menu-item clickable" id="__dxm_bee_menu_filter"><span class="menu-label clickable" id="__dxm_bee_menu_filter_text">📝 标题过滤</span><div class="switch ' + (filterEnabled ? 'on' : '') + '" id="__dxm_bee_menu_filter_switch"></div><div class="menu-desc">点击文字打开配置弹窗，开启后自动过滤标题违规文字</div></div>' +
        '<div class="menu-item clickable" id="__dxm_bee_menu_sku_filter"><span class="menu-label clickable" id="__dxm_bee_menu_sku_filter_text">🏷️ SKU变种属性过滤</span><div class="switch ' + (skuFilterEnabled ? 'on' : '') + '" id="__dxm_bee_menu_sku_filter_switch"></div><div class="menu-desc">点击文字打开配置弹窗，开启后自动过滤SKU变种属性违规文字</div></div>' +
      '</div>' +
    '</div>' +
    '<div class="m-group" data-group="auto">' +
      '<div class="m-group-header"><span>自动化</span><span class="m-group-arrow"></span></div>' +
      '<div class="m-group-body">' +
        '<div class="menu-item"><span class="menu-label">🔢 自动SKU高级</span><div class="switch ' + (autoSkuNo ? 'on' : '') + '" id="__dxm_bee_menu_sku_no_switch"></div><div class="menu-desc">开启后SKU工作流自动执行高级SKU货号生成</div></div>' +
        '<div class="menu-item"><span class="menu-label">📐 自动批量修改图片尺寸</span><div class="switch ' + (autoResize ? 'on' : '') + '" id="__dxm_bee_menu_auto_resize_switch"></div><div class="menu-desc">开启后自动填充和贴图完成后自动批量修改图片尺寸</div></div>' +
      '</div>' +
    '</div>' +
    '<div class="m-group" data-group="business">' +
      '<div class="m-group-header"><span>业务配置</span><span class="m-group-arrow"></span></div>' +
      '<div class="m-group-body">' +
        '<div class="menu-item clickable" id="__dxm_bee_menu_store"><span class="menu-label">🏪 选择店铺</span><span class="menu-value" id="__dxm_bee_menu_store_name">' + (currentStore || '未选择') + '</span><span class="menu-arrow">▸</span><div class="menu-desc">选择工作流自动填写的店铺名称</div></div>' +
        '<div class="menu-item"><span class="menu-label">📍 省份选择</span><input type="text" class="menu-input" id="__dxm_bee_menu_province_input" value="' + province + '" maxlength="10" placeholder="广东省"><div class="menu-desc">工作流填写的省份，须以省/市/自治区结尾</div></div>' +
        '<div class="menu-item"><span class="menu-label">🔑 店铺ID</span><input type="text" class="menu-input" id="__dxm_bee_menu_shopid_input" value="' + shopId + '" maxlength="20" placeholder="输入店铺ID"><div class="menu-desc">同步类目所需的店铺ID</div></div>' +
      '</div>' +
    '</div>' +
    '<div class="m-group expanded" data-group="system">' +
      '<div class="m-group-header"><span>系统</span><span class="m-group-arrow"></span></div>' +
      '<div class="m-group-body">' +
        '<div class="menu-item clickable" id="__dxm_bee_menu_sync_cat" style="display:none"><span class="menu-label clickable">🌳 同步类目树</span><span class="menu-arrow">▸</span><div class="menu-desc">从店小秘递归采集全部分类，保存到独立数据库</div></div>' +
        '<div class="menu-item m-server-row"><span class="menu-label">🔗 服务器地址</span><div class="m-input-row"><input type="text" class="m-server-input" id="__dxm_bee_menu_server_input" value="' + (Config.getServerUrl() || 'http://localhost:3000') + '" placeholder="http://localhost:3000" readonly><button class="m-icon-btn" id="__dxm_bee_menu_server_edit" title="编辑">✎</button><button class="m-icon-btn m-save" id="__dxm_bee_menu_server_save" title="保存" style="display:none">✓</button><button class="m-icon-btn" id="__dxm_bee_menu_server_test" title="测试连接">🔌</button></div><div class="m-feedback" id="__dxm_bee_menu_server_feedback"></div><div class="menu-desc">管理端服务器地址，局域网内可填写IP地址</div></div>' +
        '<div class="menu-item clickable" id="__dxm_bee_menu_btn_vis"><span class="menu-label">🎛️ 按钮显示方案</span><span class="menu-arrow">▸</span><div class="menu-desc">配置工具栏中显示哪些按钮</div></div>' +
      '</div>' +
    '</div>';
  document.body.appendChild(menu);

  var menuStoreName = document.getElementById('__dxm_bee_menu_store_name');
  var syncCatItem = document.getElementById('__dxm_bee_menu_sync_cat');
  var cachedRole = null;  // 缓存当前用户角色，避免每次右击都 fetch

  function showMenu() {
    // 先在屏幕外显示以测量尺寸
    menu.style.left = '-9999px';
    menu.style.top = '-9999px';
    menu.style.right = 'auto';
    menu.classList.add('show');
    repositionMenu();
    syncServerInput();
    refreshMenuUserInfo();
    refreshAdminItems();
  }

  function repositionMenu() {
    if (!menu.classList.contains('show')) return;
    var mw = menu.offsetWidth;
    var mh = menu.offsetHeight;
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var gap = 8;

    // 基于小蜜蜂位置定位（避免被小蜜蜂本体遮挡）
    var ir = icon.getBoundingClientRect();
    var rightSpace = vw - ir.right;
    var leftSpace = ir.left;

    var left;
    if (rightSpace >= mw + gap) {
      left = ir.right + gap;
    } else if (leftSpace >= mw + gap) {
      left = ir.left - mw - gap;
    } else if (rightSpace >= leftSpace) {
      left = vw - mw - gap;
    } else {
      left = gap;
    }
    if (left < gap) left = gap;
    if (left + mw > vw - gap) left = vw - mw - gap;

    var iconCenterY = ir.top + ir.height / 2;
    var top = iconCenterY - mh / 2;
    if (top < gap) top = gap;
    if (top + mh > vh - gap) top = vh - mh - gap;

    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
  }

  function refreshMenuUserInfo() {
    var nameEl = document.getElementById('__dxm_bee_menu_user_name');
    var avatarEl = document.getElementById('__dxm_bee_menu_avatar');
    nameEl.textContent = '检测中...';
    nameEl.className = 'm-user-name';
    avatarEl.textContent = '?';
    avatarEl.className = 'm-avatar';
    Config.getCurrentUser(function (user) {
      if (!user) {
        nameEl.textContent = '未登录';
        nameEl.className = 'm-user-name unlogged';
        avatarEl.textContent = '!';
        avatarEl.className = 'm-avatar unlogged';
        return;
      }
      var displayName = user.display_name || user.username;
      nameEl.textContent = displayName;
      avatarEl.textContent = (displayName.charAt(0) || '?').toUpperCase();
      cachedRole = user.role;
    });
  }

  function refreshAdminItems() {
    if (cachedRole === 'admin') {
      syncCatItem.style.display = '';
      return;
    }
    // 未知或非 admin，先隐藏，等 fetch 回来再决定（保守策略）
    syncCatItem.style.display = 'none';
    Config.getCurrentUser(function (user) {
      cachedRole = user ? user.role : null;
      syncCatItem.style.display = (cachedRole === 'admin') ? '' : 'none';
    });
  }

  function hideMenu() {
    menu.classList.remove('show');
    exitEditMode(true);
    if (typeof hideBtnVisPanel === 'function') hideBtnVisPanel();
  }

  // Attach to bee icon (created by float-bee.js which loads before this file)
  var icon = document.getElementById('__dxm_bee_icon');
  if (icon) {
    icon.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      e.stopPropagation();
      showMenu();
    });
  }

  // 手风琴分组点击展开/收起（用 height + scrollHeight 测量，丝滑过渡）
  function setGroupHeight(body, auto) {
    if (auto) {
      body.style.height = 'auto';
    } else {
      body.style.height = body.scrollHeight + 'px';
    }
  }

  // 动画期间逐帧重新定位菜单（防止动画过程中菜单整体跳动）
  function animateReposition(duration) {
    var start = performance.now();
    function tick(now) {
      repositionMenu();
      if (now - start < duration) {
        requestAnimationFrame(tick);
      }
    }
    requestAnimationFrame(tick);
  }

  // 初始化：对默认展开的"系统"组直接设 auto（无动画）
  menu.querySelectorAll('.m-group.expanded .m-group-body').forEach(function (body) {
    body.style.height = 'auto';
  });

  menu.querySelectorAll('.m-group-header').forEach(function (header) {
    header.addEventListener('click', function (e) {
      e.stopPropagation();
      var group = header.closest('.m-group');
      var body = group.querySelector('.m-group-body');
      if (group.classList.contains('expanded')) {
        // 收起：先把 auto 转成具体 px，下一帧再设为 0
        setGroupHeight(body, false);
        body.offsetHeight;  // 强制重排，确保 transition 生效
        body.style.height = '0';
        group.classList.remove('expanded');
      } else {
        // 展开：先设具体 px 触发动画，结束后转 auto 自适应
        group.classList.add('expanded');
        setGroupHeight(body, false);
        body.offsetHeight;
        // 动画结束后释放为 auto（防止后续菜单项内容变化导致裁剪）
        setTimeout(function () {
          if (group.classList.contains('expanded')) {
            body.style.height = 'auto';
          }
        }, 280);
      }
      // 动画期间逐帧重新定位（避免 280ms 后才调整导致的跳跃）
      animateReposition(300);
    });
  });

  document.addEventListener('click', function (e) {
    if (!menu.contains(e.target)) hideMenu();
  });

  // Esc 键：编辑态时取消编辑，非编辑态时关闭菜单
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (!menu.classList.contains('show')) return;
    if (isEditing) {
      exitEditMode(true);
      syncServerInput();
    } else if (btnVisOpen) {
      hideBtnVisPanel();
    } else {
      hideMenu();
    }
  });

  document.getElementById('__dxm_bee_menu_filter_text').addEventListener('click', function () {
    hideMenu();
    openFilterSettings('title');
  });

  var filterSwitch = document.getElementById('__dxm_bee_menu_filter_switch');
  filterSwitch.addEventListener('click', function (e) {
    e.stopPropagation();
    var on = !this.classList.contains('on');
    this.classList.toggle('on', on);
    Config.saveFilterEnabled(on);
    console.log('%c[小蜜蜂] 标题过滤: ' + (on ? '开启' : '关闭'), 'color:#FFA000;font-weight:bold');
  });

  document.getElementById('__dxm_bee_menu_sku_filter_text').addEventListener('click', function () {
    hideMenu();
    openFilterSettings('sku');
  });

  var skuFilterSwitch = document.getElementById('__dxm_bee_menu_sku_filter_switch');
  skuFilterSwitch.addEventListener('click', function (e) {
    e.stopPropagation();
    var on = !this.classList.contains('on');
    this.classList.toggle('on', on);
    Config.saveSkuFilterEnabled(on);
    console.log('%c[小蜜蜂] SKU 过滤: ' + (on ? '开启' : '关闭'), 'color:#FFA000;font-weight:bold');
  });

  var skuNoSwitch = document.getElementById('__dxm_bee_menu_sku_no_switch');
  skuNoSwitch.addEventListener('click', function (e) {
    e.stopPropagation();
    var on = !this.classList.contains('on');
    this.classList.toggle('on', on);
    Config.saveAutoSkuNo(on);
    console.log('%c[小蜜蜂] 自动SKU高级: ' + (on ? '开启' : '关闭'), 'color:#FFA000;font-weight:bold');
  });

  var autoResizeSwitch = document.getElementById('__dxm_bee_menu_auto_resize_switch');
  autoResizeSwitch.addEventListener('click', function (e) {
    e.stopPropagation();
    var on = !this.classList.contains('on');
    this.classList.toggle('on', on);
    Config.saveAutoResize(on);
    console.log('%c[小蜜蜂] 自动批量修改图片尺寸: ' + (on ? '开启' : '关闭'), 'color:#FFA000;font-weight:bold');
  });

  var provinceInput = document.getElementById('__dxm_bee_menu_province_input');
  var provinceTimer = null;
  provinceInput.addEventListener('input', function () {
    var self = this;
    clearTimeout(provinceTimer);
    provinceTimer = setTimeout(function () {
      var val = self.value.trim();
      if (val) Config.saveProvince(val);
    }, 500);
  });
  provinceInput.addEventListener('blur', function () {
    var val = this.value.trim();
    if (!val || !/省$|市$|自治区$|特别行政区$/.test(val)) {
      val = '广东省';
      this.value = val;
    }
    Config.saveProvince(val);
    console.log('%c[小蜜蜂] 省份已保存: ' + val, 'color:#FFA000;font-weight:bold');
  });
  provinceInput.addEventListener('click', function (e) {
    e.stopPropagation();
  });


  // ========== ShopId Input ==========
  var shopIdInput = document.getElementById('__dxm_bee_menu_shopid_input');
  var shopIdTimer = null;
  shopIdInput.addEventListener('input', function () {
    var self = this;
    clearTimeout(shopIdTimer);
    shopIdTimer = setTimeout(function () {
      Config.saveShopId(self.value.trim());
    }, 500);
  });
  shopIdInput.addEventListener('blur', function () {
    Config.saveShopId(this.value.trim());
    console.log('%c[小蜜蜂] 店铺ID已保存: ' + this.value.trim(), 'color:#FFA000;font-weight:bold');
  });
  shopIdInput.addEventListener('click', function (e) {
    e.stopPropagation();
  });

  // 服务器地址配置（icon 编辑/保存/测试连接模式）
  var serverInput = document.getElementById('__dxm_bee_menu_server_input');
  var serverEditBtn = document.getElementById('__dxm_bee_menu_server_edit');
  var serverSaveBtn = document.getElementById('__dxm_bee_menu_server_save');
  var serverTestBtn = document.getElementById('__dxm_bee_menu_server_test');
  var serverFeedback = document.getElementById('__dxm_bee_menu_server_feedback');
  var isEditing = false;

  function syncServerInput() {
    serverInput.value = Config.getServerUrl() || 'http://localhost:3000';
  }

  function enterEditMode() {
    isEditing = true;
    serverInput.classList.add('editable');
    serverInput.removeAttribute('readonly');
    serverEditBtn.style.display = 'none';
    serverSaveBtn.style.display = 'flex';
    serverSaveBtn.classList.remove('saved');
    serverTestBtn.style.display = 'none';
    setTimeout(function () { serverInput.focus(); serverInput.select(); }, 50);
  }

  function exitEditMode(clearFeedback) {
    isEditing = false;
    serverInput.classList.remove('editable');
    serverInput.setAttribute('readonly', '');
    serverEditBtn.style.display = 'flex';
    serverSaveBtn.style.display = 'none';
    serverTestBtn.style.display = 'flex';
    if (clearFeedback) {
      serverFeedback.classList.remove('show', 'ok', 'err');
      serverFeedback.textContent = '';
    }
  }

  function showFeedback(text, type) {
    serverFeedback.textContent = text;
    serverFeedback.className = 'm-feedback show ' + type;
    if (type === 'ok') {
      setTimeout(function () { serverFeedback.classList.remove('show'); }, 2000);
    }
  }

  function doSaveUrl() {
    var url = serverInput.value.trim().replace(/\/+$/, '');
    if (!url) { showFeedback('地址不能为空', 'err'); return; }
    if (!/^https?:\/\//i.test(url)) { showFeedback('地址必须以 http:// 或 https:// 开头', 'err'); return; }
    serverInput.value = url;
    if (Config.setServerUrl) {
      Config.setServerUrl(url);
    } else {
      localStorage.setItem('1688_server_url', url);
    }
    serverSaveBtn.classList.add('saved');
    showFeedback('已保存', 'ok');
    console.log('%c[小蜜蜂] 服务器地址已保存: ' + url, 'color:#FFA000;font-weight:bold');
    setTimeout(function () {
      exitEditMode(false);
      refreshMenuUserInfo();
    }, 800);
  }

  function doTestConnection() {
    var url = Config.getServerUrl();
    showFeedback('测试中...', 'ok');
    Config.getCurrentUser(function (user) {
      if (user) {
        showFeedback('已连接：' + (user.display_name || user.username), 'ok');
      } else {
        // 区分：能连上服务器但未登录 vs 完全连不上
        fetch(url + '/api/me')
          .then(function () { showFeedback('服务器可达，但未登录或 token 失效', 'err'); })
          .catch(function () { showFeedback('无法连接到服务器', 'err'); });
      }
    });
  }

  serverEditBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    enterEditMode();
  });
  serverSaveBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    doSaveUrl();
  });
  serverTestBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    doTestConnection();
  });
  serverInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); doSaveUrl(); }
    if (e.key === 'Escape') { exitEditMode(true); syncServerInput(); }
  });
  serverInput.addEventListener('click', function (e) {
    if (isEditing) e.stopPropagation();
  });

  // ========== Button Visibility Sub-Panel ==========
  var btnVisPanel = document.createElement('div');
  btnVisPanel.id = '__dxm_bee_btn_vis_panel';
  document.body.appendChild(btnVisPanel);

  var btnVisOpen = false;

  function buildBtnVisPanel() {
    var labels = Config.BEE_BTN_LABELS || {};
    var vis = Config.getBtnVis ? Config.getBtnVis() : null;
    var html = '<div class="cfg-title">显示按钮</div>';
    var keys = Object.keys(labels);
    keys.forEach(function (id) {
      var checked = vis ? !!vis[id] : true;
      html += '<label><input type="checkbox" data-btn="' + id + '"' + (checked ? ' checked' : '') + '><span class="cfg-ck"></span>' + labels[id] + '</label>';
    });
    btnVisPanel.innerHTML = html;
    btnVisPanel.querySelectorAll('input[type="checkbox"]').forEach(function (cb) {
      cb.addEventListener('change', function () {
        var newVis = {};
        btnVisPanel.querySelectorAll('input[type="checkbox"]').forEach(function (c) {
          newVis[c.getAttribute('data-btn')] = c.checked;
        });
        if (Config.applyBtnVis) Config.applyBtnVis(newVis);
      });
    });
  }

  function showBtnVisPanel(menuItem) {
    buildBtnVisPanel();
    // 先在屏幕外显示以测量尺寸
    btnVisPanel.style.left = '-9999px';
    btnVisPanel.style.top = '-9999px';
    btnVisPanel.classList.add('show');

    var pw = btnVisPanel.offsetWidth;
    var ph = btnVisPanel.offsetHeight;
    var mr = menuItem.getBoundingClientRect();
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var gap = 6;

    // 水平方向：优先右侧，放不下则左侧
    var left;
    if (mr.right + pw + gap <= vw) {
      left = mr.right + gap;
    } else {
      left = mr.left - pw - gap;
    }
    if (left < gap) left = gap;

    // 垂直方向：与菜单项顶部对齐，超出则上移
    var top = mr.top;
    if (top + ph > vh - gap) top = vh - gap - ph;
    if (top < gap) top = gap;

    btnVisPanel.style.left = left + 'px';
    btnVisPanel.style.top = top + 'px';
    btnVisOpen = true;
  }

  function hideBtnVisPanel() {
    btnVisPanel.classList.remove('show');
    btnVisOpen = false;
  }

  document.getElementById('__dxm_bee_menu_btn_vis').addEventListener('click', function (e) {
    e.stopPropagation();
    if (btnVisOpen) {
      hideBtnVisPanel();
    } else {
      showBtnVisPanel(this);
    }
  });

  // 点击子面板内 checkbox 不关闭
  btnVisPanel.addEventListener('click', function (e) {
    e.stopPropagation();
  });

  // 点击外部关闭子面板
  document.addEventListener('mousedown', function (e) {
    if (btnVisOpen && !btnVisPanel.contains(e.target) && !document.getElementById('__dxm_bee_menu_btn_vis').contains(e.target)) {
      hideBtnVisPanel();
    }
  });

  // ========== Sync Categories Popup ==========
  var syncOverlay = document.createElement('div');
  syncOverlay.id = '__dxm_bee_sync_overlay';
  syncOverlay.innerHTML =
    '<div id="__dxm_bee_sync_panel">' +
    '<div id="__dxm_bee_sync_header"><h3>同步店小秘分类树</h3><button class="close-btn" id="__dxm_bee_sync_close" style="width:28px;height:28px;border:none;background:none;font-size:17px;cursor:pointer;color:#999;border-radius:50%;display:flex;align-items:center;justify-content:center">&#x2715;</button></div>' +
    '<div id="__dxm_bee_sync_toolbar">' +
      '<input type="text" id="__dxm_sync_shopid" placeholder="店铺ID" maxlength="20">' +
      '<button id="__dxm_sync_all_btn" style="padding:7px 16px;background:#FFA000;color:#fff;border:none;border-radius:8px;font-size:12px;cursor:pointer;white-space:nowrap">同步全部</button>' +
      '<button id="__dxm_sync_refresh_btn" style="padding:7px 12px;border:1px solid #e0e0e0;border-radius:8px;background:#fff;font-size:12px;cursor:pointer">刷新</button>' +
    '</div>' +
    '<div id="__dxm_bee_sync_list"><div style="padding:20px;text-align:center;color:#999">点击刷新获取分类列表</div></div>' +
    '<div id="__dxm_bee_sync_footer"><span id="__dxm_bee_sync_status">就绪</span></div>' +
    '</div>';
  document.body.appendChild(syncOverlay);

  var syncShopIdInput = document.getElementById('__dxm_sync_shopid');
  var syncListEl = document.getElementById('__dxm_bee_sync_list');
  var syncStatusEl = document.getElementById('__dxm_bee_sync_status');
  var syncAllBtn = document.getElementById('__dxm_sync_all_btn');
  var syncRefreshBtn = document.getElementById('__dxm_sync_refresh_btn');

  syncShopIdInput.value = Config.loadShopId();
  syncShopIdInput.addEventListener('input', function () {
    Config.saveShopId(this.value.trim());
  });
  syncShopIdInput.addEventListener('click', function (e) { e.stopPropagation(); });

  function openSyncPopup() {
    hideMenu();
    syncShopIdInput.value = Config.loadShopId();
    syncOverlay.classList.add('show');
    if (!syncListEl.querySelector('.sync-row')) loadSyncList();
  }

  function closeSyncPopup() {
    syncOverlay.classList.remove('show');
  }

  document.getElementById('__dxm_bee_menu_sync_cat').addEventListener('click', function (e) {
    e.stopPropagation();
    // 运行时再次校验（防止右击后到点击期间被踢出 admin）
    Config.getCurrentUser(function (user) {
      if (!user) {
        alert('请先登录管理平台'); return;
      }
      if (user.role !== 'admin') {
        alert('仅管理员可同步类目树，当前角色：' + (user.role || '未知'));
        cachedRole = user.role;
        syncCatItem.style.display = 'none';
        hideMenu();
        return;
      }
      cachedRole = 'admin';
      openSyncPopup();
    });
  });
  syncOverlay.addEventListener('click', function (e) { if (e.target === syncOverlay) closeSyncPopup(); });
  document.getElementById('__dxm_bee_sync_close').addEventListener('click', closeSyncPopup);

  function loadSyncList() {
    syncListEl.innerHTML = '<div style="padding:20px;text-align:center;color:#999">加载中...</div>';
    var serverUrl = (Config && Config.getServerUrl ? Config.getServerUrl() : localStorage.getItem('1688_server_url')) || 'http://localhost:3000';

    // 并行获取 DXM 一级分类 + 服务端已有同步状态
    var rootList = null;
    var syncStatus = null;

    function tryRender() {
      if (!rootList || !syncStatus) return;
      if (!rootList.length) {
        syncListEl.innerHTML = '<div style="padding:20px;text-align:center;color:#999">无分类数据</div>';
        return;
      }

      // 构建 catId → status 映射
      var statusMap = {};
      syncStatus.forEach(function (s) { statusMap[s.catId] = s; });

      syncListEl.innerHTML = '';
      rootList.forEach(function (cat) {
        var st = statusMap[cat.catId];
        var syncTime = st && st.lastSync ? st.lastSync.replace(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}).*$/, '$1 $2') : '';
        var countStr = st && st.count ? st.count + ' 个' : '';
        var infoHtml = '';
        if (syncTime) {
          infoHtml = '<span style="font-size:11px;color:#52c41a;margin-left:8px">' + syncTime + (countStr ? ' (' + countStr + ')' : '') + '</span>';
        }

        var row = document.createElement('div');
        row.className = 'sync-row';
        row.innerHTML = '<span class="sync-row-name">' + cat.catName + infoHtml + '</span>' +
          '<button class="sync-row-btn" data-cat-id="' + cat.catId + '" data-cat-name="' + cat.catName + '">同步</button>';
        syncListEl.appendChild(row);
      });
      syncStatusEl.textContent = '共 ' + rootList.length + ' 个一级分类';
    }

    Config.fetchRootCategories(function (roots, err) {
      if (err) {
        syncListEl.innerHTML = '<div style="padding:20px;text-align:center;color:#ff4d4f">' + err + '</div>';
        return;
      }
      rootList = roots || [];
      tryRender();
    });

    fetch(serverUrl + '/api/dxm-tree/root-status', { headers: Config.authHeaders() })
      .then(function (r) { return r.json(); })
      .then(function (data) { syncStatus = data || []; tryRender(); })
      .catch(function () { syncStatus = []; tryRender(); });
  }

  syncRefreshBtn.addEventListener('click', loadSyncList);

  // 单个大类同步
  // 单个大类同步（可同时点击多个）
  syncListEl.addEventListener('click', function (e) {
    var btn = e.target.closest('.sync-row-btn');
    if (!btn || btn.disabled) return;
    var catId = parseInt(btn.getAttribute('data-cat-id'));
    var catName = btn.getAttribute('data-cat-name');
    btn.disabled = true;
    btn.textContent = '同步中...';
    syncStatusEl.textContent = '正在同步 ' + catName + '...';
    Config.syncSingleCategory(catId, catName, function (cnt) {
      btn.textContent = '完成 (' + cnt + ')';
      btn.disabled = false;
      syncStatusEl.textContent = catName + ' 完成，共 ' + cnt + ' 个';
      loadSyncList();
    });
  });

  // 同步全部（并行启动所有大类）
  syncAllBtn.addEventListener('click', function () {
    if (this.disabled) return;
    var rows = syncListEl.querySelectorAll('.sync-row-btn');
    var allRows = Array.prototype.slice.call(rows).filter(function (b) { return !b.disabled; });
    if (!allRows.length) return;

    this.disabled = true;
    this.textContent = '同步中...';
    var doneCount = 0;

    allRows.forEach(function (btn) {
      var catId = parseInt(btn.getAttribute('data-cat-id'));
      var catName = btn.getAttribute('data-cat-name');
      btn.disabled = true;
      btn.textContent = '同步中...';

      Config.syncSingleCategory(catId, catName, function (cnt) {
        btn.textContent = '完成 (' + cnt + ')';
        btn.disabled = false;
        doneCount++;
        syncStatusEl.textContent = '已完成 ' + doneCount + '/' + allRows.length;
        if (doneCount >= allRows.length) {
          syncAllBtn.disabled = false;
          syncAllBtn.textContent = '同步全部';
          loadSyncList();
        }
      });
    });
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

  // ========== Filter Settings Panel (shared for title & SKU) ==========
  var currentFilterType = '';
  var overlay = document.createElement('div');
  overlay.id = '__dxm_bee_overlay';
  overlay.innerHTML =
    '<div id="__dxm_bee_settings">' +
    '<div class="toast" id="__dxm_bee_settings_toast">已保存</div>' +
    '<div id="__dxm_bee_settings_header">' +
      '<h3 id="__dxm_bee_settings_title">过滤配置</h3>' +
      '<button id="__dxm_bee_settings_close">✕</button>' +
    '</div>' +
    '<div id="__dxm_bee_settings_toolbar">' +
      '<button class="btn-primary" id="__dxm_bee_settings_add">+ 新增</button>' +
      '<button class="btn-primary" id="__dxm_bee_settings_save">保存</button>' +
      '<span id="__dxm_bee_settings_hint">用 / 分隔多个关键词，如：黄金/金色/金 → 金色调</span>' +
    '</div>' +
    '<div id="__dxm_bee_settings_body">' +
      '<table><thead><tr><th style="width:35%">被过滤文字</th><th style="width:35%">填充文字 <span style="font-weight:400;color:#bbb">（默认空格）</span></th><th>操作</th></tr></thead>' +
      '<tbody id="__dxm_bee_settings_tbody"></tbody></table>' +
    '</div></div>';
  document.body.appendChild(overlay);

  var tbody = document.getElementById('__dxm_bee_settings_tbody');
  var toastEl = document.getElementById('__dxm_bee_settings_toast');
  var settingsTitle = document.getElementById('__dxm_bee_settings_title');

  function renderFilterRow(f) {
    var tr = document.createElement('tr');
    var toggleClass = f.enabled ? 'btn-toggle on' : 'btn-toggle off';
    var toggleText = f.enabled ? '启用' : '禁用';
    var isSku = currentFilterType === 'sku';
    var fromPlaceholder = isSku ? '如：(' : '如：黄金';
    var toPlaceholder = isSku ? '默认空格' : '如：金色调';
    tr.innerHTML =
      '<td><input type="text" maxlength="20" class="f-from" value="' + (f.from || '') + '" placeholder="' + fromPlaceholder + '"></td>' +
      '<td><input type="text" maxlength="20" class="f-to" value="' + (f.to || '') + '" placeholder="' + toPlaceholder + '"></td>' +
      '<td><button class="' + toggleClass + '">' + toggleText + '</button> <button class="btn-del">删除</button></td>';
    return tr;
  }

  function getFilterData() {
    return currentFilterType === 'sku' ? Config.loadSkuFilters() : Config.loadFilters();
  }

  function saveFilterData(data) {
    if (currentFilterType === 'sku') Config.saveSkuFilters(data);
    else Config.saveFilters(data);
  }

  function renderFilterSettings() {
    tbody.innerHTML = '';
    var filters = getFilterData();
    for (var i = 0; i < filters.length; i++) {
      tbody.appendChild(renderFilterRow(filters[i]));
    }
  }

  function openFilterSettings(type) {
    currentFilterType = type;
    settingsTitle.textContent = type === 'sku' ? 'SKU变种属性过滤配置' : '标题过滤配置';
    renderFilterSettings();
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
    var defaultTo = currentFilterType === 'sku' ? ' ' : '';
    tbody.appendChild(renderFilterRow({ from: '', to: defaultTo, enabled: true }));
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
    saveFilterData(data);
    toastEl.classList.add('show');
    setTimeout(function () { toastEl.classList.remove('show'); }, 1500);
    console.log('%c[小蜜蜂] ' + (currentFilterType === 'sku' ? 'SKU' : '标题') + '过滤配置已保存', 'color:#52c41a;font-weight:bold', data);
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
