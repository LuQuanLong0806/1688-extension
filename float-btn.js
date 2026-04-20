(function () {
  if (window.__1688FloatBtn) return;
  window.__1688FloatBtn = true;

  var panel = document.createElement('div');
  panel.id = '__1688_grab_panel';
  panel.innerHTML =
    '<div id="__1688_grab_body">' +
    '<div id="__1688_grab_title">1688 图片抓取</div>' +
    '<button id="__1688_grab_btn">🚀 抓取图片</button>' +
    '<div id="__1688_grab_status"></div>' +
    '</div>' +
    '<div id="__1688_grab_toggle" title="拖动 / 悬浮展开">G</div>';

  var s = document.createElement('style');
  s.textContent =
    '#__1688_grab_panel{position:fixed;z-index:2147483647;font-family:"Microsoft YaHei",Arial,sans-serif;' +
    'left:0;top:50%;transform:translateY(-50%);user-select:none;font-size:14px;line-height:1.5;' +
    'display:flex;align-items:center}' +
    '#__1688_grab_panel *{margin:0;padding:0;box-sizing:border-box}' +
    '#__1688_grab_body{background:#fff;border-radius:12px;padding:16px;width:180px;' +
    'box-shadow:0 4px 24px rgba(0,0,0,.15);border:1px solid #f0f0f0;' +
    'transition:width .25s,padding .25s,opacity .25s,margin .25s;overflow:hidden}' +
    '#__1688_grab_panel:not(:hover) #__1688_grab_body{width:0;padding:0;opacity:0;margin:0;border:0}' +
    '#__1688_grab_toggle{width:42px;height:42px;flex-shrink:0;border-radius:50%;' +
    'background:linear-gradient(135deg,#ff6a00,#ff4444);color:#fff;font-size:20px;font-weight:bold;' +
    'display:flex;align-items:center;justify-content:center;cursor:grab;' +
    'box-shadow:0 4px 16px rgba(255,68,68,.4);transition:transform .2s,box-shadow .2s}' +
    '#__1688_grab_toggle:hover{transform:scale(1.1);box-shadow:0 6px 20px rgba(255,68,68,.5)}' +
    '#__1688_grab_title{font-size:15px;font-weight:bold;color:#333;margin-bottom:10px;text-align:center;white-space:nowrap}' +
    '#__1688_grab_btn{width:100%;padding:10px;border:none;border-radius:8px;' +
    'background:linear-gradient(135deg,#ff6a00,#ff4444);color:#fff;font-size:15px;font-weight:bold;' +
    'cursor:pointer;transition:opacity .2s;white-space:nowrap}' +
    '#__1688_grab_btn:hover{opacity:.9}' +
    '#__1688_grab_btn:disabled{background:#ccc;cursor:not-allowed}' +
    '#__1688_grab_status{margin-top:8px;font-size:13px;text-align:center;min-height:20px;white-space:nowrap}';

  document.head.appendChild(s);
  document.body.appendChild(panel);

  var toggle = document.getElementById('__1688_grab_toggle');
  var btn = document.getElementById('__1688_grab_btn');
  var statusEl = document.getElementById('__1688_grab_status');

  // --- Drag ---
  var dragging = false;
  var dragMoved = false;
  var startX, startY, origX, origY;

  function getEdgeX(px) {
    return px < window.innerWidth / 2 ? 0 : window.innerWidth - 42;
  }

  function setPosition(x, y) {
    panel.style.left = x + 'px';
    panel.style.right = 'auto';
    panel.style.top = y + 'px';
    panel.style.transform = 'none';
    panel.style.flexDirection = 'row';
  }

  function snapToEdge() {
    var rect = panel.getBoundingClientRect();
    var nearLeft = rect.left < window.innerWidth / 2;
    var topY = parseInt(panel.style.top) || 0;
    panel.style.transition = 'left .25s ease, right .25s ease';
    panel.style.flexDirection = 'row';
    if (nearLeft) {
      panel.style.left = '0';
      panel.style.right = 'auto';
    } else {
      panel.style.left = 'auto';
      panel.style.right = '0';
    }
    panel.style.top = topY + 'px';
    panel.style.transform = 'none';
    setTimeout(function () { panel.style.transition = ''; }, 260);
  }

  toggle.addEventListener('mousedown', function (e) {
    e.preventDefault();
    dragging = true;
    dragMoved = false;
    startX = e.clientX;
    startY = e.clientY;
    var rect = panel.getBoundingClientRect();
    origX = rect.left;
    origY = rect.top;
    toggle.style.cursor = 'grabbing';
  });

  document.addEventListener('mousemove', function (e) {
    if (!dragging) return;
    var dx = e.clientX - startX;
    var dy = e.clientY - startY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) dragMoved = true;
    if (!dragMoved) return;
    var nx = origX + dx;
    var ny = origY + dy;
    ny = Math.max(0, Math.min(window.innerHeight - 42, ny));
    nx = Math.max(0, Math.min(window.innerWidth - 42, nx));
    setPosition(nx, ny);
  });

  document.addEventListener('mouseup', function () {
    if (!dragging) return;
    dragging = false;
    toggle.style.cursor = 'grab';
    if (dragMoved) {
      snapToEdge();
      setTimeout(function () { dragMoved = false; }, 300);
    }
  });

  // --- Grab logic (auto-scroll then grab) ---
  btn.addEventListener('click', function () {
    if (dragMoved) return;
    btn.disabled = true;
    btn.textContent = '⏳ 滚动加载中...';
    statusEl.className = '';
    statusEl.textContent = '';

    autoScroll(function () {
      btn.textContent = '⏳ 抓取中...';
      setTimeout(function () {
        var count = doGrab();
        btn.disabled = false;
        btn.textContent = '🚀 抓取图片';
        if (count > 0) {
          statusEl.className = 'ok';
          statusEl.textContent = '✅ 抓取 ' + count + ' 张图片！';
        } else {
          statusEl.className = 'err';
          statusEl.textContent = '❌ 未找到图片';
        }
      }, 200);
    });
  });

  function autoScroll(cb) {
    var attempt = 0;
    var maxAttempts = 3;
    function doAttempt() {
      attempt++;
      if (attempt < maxAttempts) {
        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
        setTimeout(doAttempt, 400);
      } else {
        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
        setTimeout(cb, 400);
      }
    }
    doAttempt();
  }

  // ---- Core grab (from content.js) ----
  function doGrab() {
    var images = [];
    var urlSet = new Set();

    function addImage(url) {
      if (!url || url.indexOf('data:') === 0) return;
      if (url.indexOf('//') === 0) url = 'https:' + url;
      url = url.replace(/_\d+x\d+\.\w+$/i, '');
      url = url.replace(/\.jpg_\.\w+$/i, '.jpg');
      url = url.replace(/\.png_\.\w+$/i, '.png');
      url = url.replace(/\?x-oss-process=.*$/i, '');
      try { new URL(url); } catch (e) { return; }
      if (/\.(html?|php|asp|jsp|js|css)(\?|$)/i.test(url)) return;
      if (/\/offer\/\d/i.test(url)) return;
      var lower = url.toLowerCase();
      var skip = [
        '/icon/', '/logo/', '/sprite/', '/emoji/', '/avatar/', '/badge/', '/flag/',
        '/arrow', '/btn', '/button', '/loading', '/placeholder', '/empty', '/default/',
        '/search/', '/share/', '/star', '/rank', '/score', '/header/', '/footer/',
        '/nav-', '/sidebar', 'lazy.gif', 'blank.gif', 'spacer.gif', 'pixel.gif',
        'spinner', '.svg', 'captcha', 'verify', '/tfs/', '/tb/', 'tingyun',
        'alicdn.com/t/', 'alicdn.com/tps/', 'alicdn.com/L1/', 'alicdn.com/s/',
        '.gif/', 'alipay'
      ];
      if (skip.some(function (p) { return lower.indexOf(p) !== -1; })) return;
      if (/\d+x\d+/.test(url) && !/\d{3,}x\d{3,}/.test(url)) return;
      if (/\.gif(\?|$)/i.test(url)) return;
      if (!urlSet.has(url)) { urlSet.add(url); images.push(url); }
    }

    function getAttrs(el) {
      ['src', 'data-src', 'data-lazy-src', 'data-lazyload-src', 'data-original',
        'data-lazy', 'data-srcset', 'data-image-src', 'data-big', 'data-large',
        'data-zoom-image', 'data-zoom-url', 'data-real-src'
      ].forEach(function (a) {
        var v = el.getAttribute(a);
        if (v) addImage(v);
      });
      if (el.srcset) el.srcset.split(',').forEach(function (p) {
        var s = p.trim().split(/\s+/)[0];
        if (s) addImage(s);
      });
    }

    // Main gallery images
    ['.offer-detail img', '.nav-slide img', '.slider-wrap img', '.main-visual img',
      '.image-nav img', '.offer-detail-show img', '.detail-gallery img', '#detail-gallery img',
      '.swipe-wrap img', '.slider-slide img', '.offer-detail-img img', '.mod-detail-gallery img',
      '.gallery-wrap img', '.main-image-wrap img', '.vertical-view img', '.horizontal-view img',
      '.offer-detail-left img', '.detail-left img', '.detail-img img', '.photo-panel img'
    ].forEach(function (sel) {
      try { document.querySelectorAll(sel).forEach(getAttrs); } catch (e) { }
    });

    // Iframe detail images
    ['iframe[src*="desc"]', 'iframe[src*="offer"]', 'iframe[src*="detail"]',
      '#detailDescIframe', '.desc-iframe iframe', '#desc-lazyload-container iframe',
      '.mod-detail-description iframe'
    ].forEach(function (sel) {
      try {
        document.querySelectorAll(sel).forEach(function (f) {
          try { (f.contentDocument || f.contentWindow.document).querySelectorAll('img').forEach(getAttrs); } catch (e) { }
        });
      } catch (e) { }
    });

    // Description content images
    ['.desc-content img', '.desc-lazyload-container img', '.mod-detail-description img',
      '#mod-detail-description img', '.content-detail img', '.detail-content img',
      '.detail-desc img', '.offer-detail-content img', '.description-content img',
      '.text-area img', '.widget-text img', '.detail-text img', '.detail-property img',
      '.offer-attr img', '.sku-area img', '.offer-sku img', '.mod-detail-props img'
    ].forEach(function (sel) {
      try { document.querySelectorAll(sel).forEach(getAttrs); } catch (e) { }
    });

    // All relevant images
    document.querySelectorAll('img').forEach(function (img) {
      var s = img.src;
      if (s && (s.indexOf('alicdn') !== -1 || s.indexOf('1688') !== -1 || s.indexOf('taobaocdn') !== -1))
        addImage(s);
      getAttrs(img);
    });

    // Background images
    document.querySelectorAll('[style*="url("]').forEach(function (el) {
      var st = el.getAttribute('style') || '';
      try { var bg = getComputedStyle(el).backgroundImage; if (bg && bg !== 'none') st += ' ' + bg; } catch (e) { }
      var m = st.match(/url\(['"]?([^'")\s]+)['"]?\)/g);
      if (m) m.forEach(function (x) {
        var u = x.replace(/url\(['"]?|['"]?\)/g, '');
        if (u && (u.indexOf('alicdn') !== -1 || u.indexOf('1688') !== -1)) addImage(u);
      });
    });

    // Video posters
    document.querySelectorAll('video').forEach(function (v) { if (v.poster) addImage(v.poster); });
    document.querySelectorAll('[data-poster],[data-video-poster]').forEach(function (el) {
      var p = el.getAttribute('data-poster') || el.getAttribute('data-video-poster');
      if (p) addImage(p);
    });

    // Script embedded URLs
    try {
      document.querySelectorAll('script').forEach(function (sc) {
        var t = sc.textContent || '',
          m = t.match(/https?:\/\/[^\s"'<>]+?\.(jpg|png|jpeg|gif|webp)/gi);
        if (m) m.forEach(function (u) {
          if (u.indexOf('alicdn') !== -1 || u.indexOf('1688') !== -1) addImage(u);
        });
      });
    } catch (e) { }

    // Global JS variables
    try {
      ['__INIT_DATA__', '__pageData__', 'pageConfig', 'g_config', 'offerData'].forEach(function (k) {
        if (window[k]) {
          var j = JSON.stringify(window[k]),
            m = j.match(/https?:\/\/[^\s"'<>"]+?\.(jpg|png|jpeg|gif|webp)/gi);
          if (m) m.forEach(function (u) { addImage(u.replace(/\\u002F/g, '/')); });
        }
      });
    } catch (e) { }

    if (images.length === 0) return 0;

    // Classify
    var mainImgs = [], detailImgs = [], otherImgs = [];
    images.forEach(function (u) {
      var l = u.toLowerCase();
      if (l.indexOf('/imgextra/') !== -1 || l.indexOf('/bao/uploaded/') !== -1 || l.indexOf('/img/') !== -1) {
        if (l.indexOf('desc') !== -1 || l.indexOf('detail') !== -1) detailImgs.push(u);
        else mainImgs.push(u);
      } else otherImgs.push(u);
    });

    // Build result page
    var urlsJson = JSON.stringify(images);
    var h = '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8">';
    h += '<title>1688图片 - ' + images.length + '张</title>';
    h += '<style>*{margin:0;padding:0;box-sizing:border-box}';
    h += 'body{font-family:"Microsoft YaHei",Arial,sans-serif;background:#f0f2f5;padding:20px}';
    h += '.hd{background:linear-gradient(135deg,#ff6a00,#ff4444);color:#fff;padding:25px 30px;border-radius:12px;margin-bottom:20px}';
    h += '.hd h1{font-size:24px;margin-bottom:8px}.hd p{opacity:.9;font-size:14px}';
    h += '.tb{background:#fff;padding:18px 25px;border-radius:12px;margin-bottom:20px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;position:sticky;top:10px;z-index:100;box-shadow:0 2px 12px rgba(0,0,0,.08)}';
    h += '.tb button{background:#ff6a00;color:#fff;border:none;padding:10px 22px;border-radius:6px;cursor:pointer;font-size:14px;font-weight:bold}';
    h += '.tb button:hover{background:#ff8533}.tb button.s2{background:#666}.tb button.s2:hover{background:#888}';
    h += '.tb button.s3{background:#ff4444}.tb button.s3:hover{background:#ff6666}';
    h += '.tb button.s4{background:#888}.tb button.s4:hover{background:#aaa}';
    h += '.cnt{color:#666;font-size:14px;margin-left:auto}.cnt b{color:#ff6a00;font-size:18px}';
    h += '.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px}';
    h += '.card{background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.06);border:2px solid transparent;cursor:pointer;transition:all .2s}';
    h += '.card:hover{box-shadow:0 6px 24px rgba(0,0,0,.12);transform:translateY(-2px)}';
    h += '.card.on{border-color:#ff6a00;box-shadow:0 0 0 3px rgba(255,106,0,.2)}';
    h += '.card .iw{width:100%;height:200px;background:#fafafa;display:flex;align-items:center;justify-content:center;overflow:hidden;pointer-events:none}';
    h += '.card .iw img{max-width:100%;max-height:100%;object-fit:contain}';
    h += '.card .ck{padding:10px 15px;display:flex;align-items:center;gap:8px}';
    h += '.card .ck input{width:18px;height:18px;accent-color:#ff6a00;cursor:pointer;pointer-events:auto}';
    h += '.card .ck label{font-size:12px;color:#999;cursor:pointer;pointer-events:auto}';
    h += '.card .ua{padding:10px 15px;border-top:1px solid #f0f0f0}';
    h += '.card .url{word-break:break-all;font-size:11px;color:#666;max-height:48px;overflow:hidden}';
    h += '.card .ac{margin-top:8px;display:flex;gap:8px}';
    h += '.card .ac a,.card .ac button{font-size:12px;color:#ff6a00;border:1px solid #ff6a00;border-radius:3px;background:none;cursor:pointer;padding:2px 8px;text-decoration:none;pointer-events:auto}';
    h += '.card .ac a:hover,.card .ac button:hover{background:#ff6a00;color:#fff}';
    h += '.po{display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.85);z-index:9999;justify-content:center;align-items:center;cursor:pointer}';
    h += '.po.show{display:flex}.po img{max-width:90%;max-height:90%;border-radius:8px}';
    h += '.toast{position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#333;color:#fff;padding:12px 28px;border-radius:8px;font-size:14px;z-index:99999;opacity:0;transition:opacity .3s;pointer-events:none}';
    h += '.toast.show{opacity:1}';
    h += '</style></head><body>';
    h += '<div class="toast" id="toast"></div>';
    h += '<div class="hd"><h1>1688图片抓取结果</h1>';
    h += '<p>共 <b>' + images.length + '</b> 张 | 主图 <b>' + mainImgs.length + '</b> | 详情 <b>' + detailImgs.length + '</b> | 其他 <b>' + otherImgs.length + '</b></p></div>';
    h += '<div class="tb"><button id="btnAll">✅ 全选</button><button id="btnNone" class="s2">⬜ 取消全选</button>';
    h += '<button id="btnCopy">📋 复制选中地址</button><button id="btnDl" class="s3">💾 下载列表</button>';
    h += '<button id="btnSmall" class="s4">🔍 显示小图</button>';
    h += '<div class="cnt">已选 <b id="sc">0</b> 张</div></div>';
    h += '<div class="grid" id="grid"></div><div class="po" id="po"><img id="pi"></div>';
    h += '<scr' + 'ipt>';
    h += 'var urls=' + urlsJson + ';var grid=document.getElementById("grid");';
    h += 'var scEl=document.getElementById("sc");var poEl=document.getElementById("po");var piEl=document.getElementById("pi");';
    h += 'var toastEl=document.getElementById("toast");';
    h += 'function esc(s){return s.replace(/&/g,"\\x26amp;").replace(/</g,"\\x26lt;").replace(/>/g,"\\x26gt;").replace(/"/g,"\\x26quot;");}';
    h += 'function showToast(msg){toastEl.textContent=msg;toastEl.classList.add("show");setTimeout(function(){toastEl.classList.remove("show");},2000);}';
    h += 'urls.forEach(function(u,i){var d=document.createElement("div");d.className="card";d.dataset.idx=i;';
    h += 'd.innerHTML=\'<div class="ck"><input type="checkbox" class="ci" id="c\'+i+\'"><label for="c\'+i+\'">#\'+(i+1)+\'</label></div>\';';
    h += 'd.innerHTML+=\'<div class="iw"><img src="\'+esc(u)+\'" onerror="this.style.opacity=0.3" onload="fImg(this)"></div>\';';
    h += 'd.innerHTML+=\'<div class="ua"><div class="url">\'+esc(u)+\'</div><div class="ac"><a href="\'+esc(u)+\'" target="_blank">打开</a><button class="cpbtn" data-u="\'+esc(u)+\'">复制</button></div></div>\';';
    h += 'grid.appendChild(d);});';
    h += 'var _fd=0,_ft=urls.length,_sn=0;';
    h += 'function fImg(el){_fd++;';
    h += 'if(el.naturalWidth<200&&el.naturalHeight<200){var c=el.closest(".card");c.classList.add("small");c.style.display="none";_sn++;}';
    h += 'if(_fd===_ft){var n=grid.querySelectorAll(".card").length;var p=document.querySelector(".hd p");if(p)p.innerHTML="有效图片 <b>"+(n-_sn)+"</b> 张 | 小图 <b>"+_sn+"</b> 张";}}';
    h += 'document.getElementById("btnSmall").addEventListener("click",function(){';
    h += 'var show=this.textContent.indexOf("显示")!==-1;this.textContent=show?"🔍 隐藏小图":"🔍 显示小图";';
    h += 'grid.querySelectorAll(".card.small").forEach(function(c){c.style.display=show?"block":"none";});});';
    h += 'grid.addEventListener("click",function(e){';
    h += 'var cpBtn=e.target.closest(".cpbtn");if(cpBtn){e.stopPropagation();copyOne(cpBtn.dataset.u);return;}';
    h += 'var link=e.target.closest("a");if(link)return;';
    h += 'var card=e.target.closest(".card");if(!card)return;';
    h += 'var cb=card.querySelector(".ci");';
    h += 'if(e.target===cb){toggleCard(card,cb);return;}';
    h += 'if(e.target.tagName==="IMG"&&e.target.closest(".iw")){piEl.src=e.target.src;poEl.classList.add("show");return;}';
    h += 'toggleCard(card,cb);});';
    h += 'function toggleCard(card,cb){cb.checked=!cb.checked;card.classList.toggle("on",cb.checked);updateCount();}';
    h += 'function updateCount(){scEl.textContent=document.querySelectorAll(".ci:checked").length;}';
    h += 'document.getElementById("btnAll").addEventListener("click",function(){';
    h += 'document.querySelectorAll(".ci").forEach(function(c){c.checked=true;c.closest(".card").classList.add("on");});updateCount();});';
    h += 'document.getElementById("btnNone").addEventListener("click",function(){';
    h += 'document.querySelectorAll(".ci").forEach(function(c){c.checked=false;c.closest(".card").classList.remove("on");});updateCount();});';
    h += 'function doCopy(t,n){navigator.clipboard.writeText(t).then(function(){showToast("已复制"+n+"个地址");}).catch(function(){';
    h += 'var ta=document.createElement("textarea");ta.value=t;document.body.appendChild(ta);ta.select();document.execCommand("copy");document.body.removeChild(ta);showToast("已复制"+n+"个地址");});}';
    h += 'document.getElementById("btnCopy").addEventListener("click",function(){';
    h += 'var arr=[];document.querySelectorAll(".ci:checked").forEach(function(c){arr.push(c.closest(".card").querySelector(".url").textContent);});';
    h += 'if(!arr.length){showToast("请先选择图片");return;}doCopy(arr.join("\\n"),arr.length);});';
    h += 'document.getElementById("btnDl").addEventListener("click",function(){';
    h += 'var arr=[];document.querySelectorAll(".ci:checked").forEach(function(c){arr.push(c.closest(".card").querySelector(".url").textContent);});';
    h += 'if(!arr.length){showToast("请先选择图片");return;}var b=new Blob([arr.join("\\n")],{type:"text/plain"});';
    h += 'var a=document.createElement("a");a.href=URL.createObjectURL(b);a.download="1688_"+Date.now()+".txt";a.click();});';
    h += 'poEl.addEventListener("click",function(){poEl.classList.remove("show");});';
    h += 'function copyOne(u){doCopy(u,"");}';
    h += '</' + 'script></body></html>';

    var blob = new Blob([h], { type: 'text/html' });
    var blobUrl = URL.createObjectURL(blob);
    var w = window.open(blobUrl, '_blank');
    if (!w) alert('弹出窗口被阻止！请允许弹出窗口。');
    return images.length;
  }
})();
