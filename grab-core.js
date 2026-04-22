(function () {
  var SKIP_PATTERNS = [
    '/icon/', '/logo/', '/sprite/', '/emoji/', '/avatar/', '/badge/', '/flag/',
    '/arrow', '/btn', '/button', '/loading', '/placeholder', '/empty', '/default/',
    '/search/', '/share/', '/star', '/rank', '/score', '/header/', '/footer/',
    '/nav-', '/sidebar', 'lazy.gif', 'blank.gif', 'spacer.gif', 'pixel.gif',
    'spinner', '.svg', 'captcha', 'verify', '/tfs/', '/tb/', 'tingyun',
    'alicdn.com/t/', 'alicdn.com/tps/', 'alicdn.com/L1/', 'alicdn.com/s/',
    '.gif/', 'alipay'
  ];

  var GALLERY_SELECTORS = [
    '.offer-detail img', '.nav-slide img', '.slider-wrap img', '.main-visual img',
    '.image-nav img', '.offer-detail-show img', '.detail-gallery img', '#detail-gallery img',
    '.swipe-wrap img', '.slider-slide img', '.offer-detail-img img', '.mod-detail-gallery img',
    '.gallery-wrap img', '.main-image-wrap img', '.vertical-view img', '.horizontal-view img',
    '.offer-detail-left img', '.detail-left img', '.detail-img img', '.photo-panel img'
  ];

  var IFRAME_SELECTORS = [
    'iframe[src*="desc"]', 'iframe[src*="offer"]', 'iframe[src*="detail"]',
    '#detailDescIframe', '.desc-iframe iframe', '#desc-lazyload-container iframe',
    '.mod-detail-description iframe'
  ];

  var DESC_SELECTORS = [
    '.desc-content img', '.desc-lazyload-container img', '.mod-detail-description img',
    '#mod-detail-description img', '.content-detail img', '.detail-content img',
    '.detail-desc img', '.offer-detail-content img', '.description-content img',
    '.text-area img', '.widget-text img', '.detail-text img', '.detail-property img',
    '.offer-attr img', '.sku-area img', '.offer-sku img', '.mod-detail-props img'
  ];

  var IMG_ATTRS = [
    'src', 'data-src', 'data-lazy-src', 'data-lazyload-src', 'data-original',
    'data-lazy', 'data-srcset', 'data-image-src', 'data-big', 'data-large',
    'data-zoom-image', 'data-zoom-url', 'data-real-src'
  ];

  var JS_GLOBALS = ['__INIT_DATA__', '__pageData__', 'pageConfig', 'g_config', 'offerData'];

  function createCollector() {
    var urlMap = new Map();

    function addImage(rawUrl) {
      if (!rawUrl || rawUrl.indexOf('data:') === 0) return;
      var url = rawUrl;
      if (url.indexOf('//') === 0) url = 'https:' + url;

      var fetchUrl = url.replace(/\?x-oss-process=.*$/i, '');

      var normalized = fetchUrl;
      normalized = normalized.replace(/_\d+x\d+\.\w+$/i, '');
      normalized = normalized.replace(/\.jpg_\.\w+$/i, '.jpg');
      normalized = normalized.replace(/\.png_\.\w+$/i, '.png');

      try { new URL(normalized); } catch (e) { return; }
      if (/\.(html?|php|asp|jsp|js|css)(\?|$)/i.test(normalized)) return;
      if (/\/offer\//i.test(normalized)) return;
      var lower = normalized.toLowerCase();
      if (SKIP_PATTERNS.some(function (p) { return lower.indexOf(p) !== -1; })) return;
      if (/\d+x\d+/.test(normalized) && !/\d{3,}x\d+|\d+x\d{3,}/.test(normalized)) return;
      if (/\.gif(\?|$)/i.test(normalized)) return;

      if (urlMap.has(normalized)) {
        var existing = urlMap.get(normalized);
        if (isBetterQuality(fetchUrl, existing)) {
          urlMap.set(normalized, fetchUrl);
        }
      } else {
        urlMap.set(normalized, fetchUrl);
      }
    }

    function isBetterQuality(newUrl, oldUrl) {
      var ns = newUrl.match(/_(\d+)x\d+\.\w+$/i);
      var os = oldUrl.match(/_(\d+)x\d+\.\w+$/i);
      if (!ns && os) return true;
      if (ns && !os) return false;
      if (ns && os) return parseInt(ns[1]) > parseInt(os[1]);
      return false;
    }

    function getAttrs(el) {
      IMG_ATTRS.forEach(function (a) {
        var v = el.getAttribute(a);
        if (v) addImage(v);
      });
      if (el.srcset) el.srcset.split(',').forEach(function (p) {
        var s = p.trim().split(/\s+/)[0];
        if (s) addImage(s);
      });
    }

    function queryAll(selectors, fn) {
      selectors.forEach(function (sel) {
        try { document.querySelectorAll(sel).forEach(fn); } catch (e) { }
      });
    }

    function isFooter(el) {
      var node = el;
      while (node) {
        if (node.id === "bottom" || (node.tagName && node.tagName.toLowerCase() === "ali-footer")) return true;
        node = node.parentElement;
      }
      return false;
    }

    function scan() {
      queryAll(GALLERY_SELECTORS, getAttrs);

      IFRAME_SELECTORS.forEach(function (sel) {
        try {
          document.querySelectorAll(sel).forEach(function (f) {
            try {
              (f.contentDocument || f.contentWindow.document)
                .querySelectorAll('img').forEach(getAttrs);
            } catch (e) { }
          });
        } catch (e) { }
      });

      queryAll(DESC_SELECTORS, getAttrs);

      // Shadow DOM scan
      document.querySelectorAll('*').forEach(function (el) {
        if (el.shadowRoot && !isFooter(el)) {
          try {
            el.shadowRoot.querySelectorAll('img').forEach(function (img) {
              var s = img.src;
              if (s && (s.indexOf('alicdn') !== -1 || s.indexOf('1688') !== -1 || s.indexOf('taobaocdn') !== -1))
                addImage(s);
              getAttrs(img);
            });
            el.shadowRoot.querySelectorAll('[style*="url("]').forEach(function (e) {
              var st = e.getAttribute('style') || '';
              try { var bg = getComputedStyle(e).backgroundImage; if (bg && bg !== 'none') st += ' ' + bg; } catch (ex) { }
              var m = st.match(/url\(['"]?([^'")\s]+)['"]?\)/g);
              if (m) m.forEach(function (x) {
                var u = x.replace(/url\(['"]?|['"]?\)/g, '');
                if (u && (u.indexOf('alicdn') !== -1 || u.indexOf('1688') !== -1)) addImage(u);
              });
            });
          } catch (e) { }
        }
      });

      document.querySelectorAll('img').forEach(function (img) {
        if (isFooter(img)) return;
        var s = img.src;
        if (s && (s.indexOf('alicdn') !== -1 || s.indexOf('1688') !== -1 || s.indexOf('taobaocdn') !== -1))
          addImage(s);
        getAttrs(img);
      });

      document.querySelectorAll('[style*="url("]').forEach(function (el) {
        if (isFooter(el)) return;
        var st = el.getAttribute('style') || '';
        try {
          var bg = getComputedStyle(el).backgroundImage;
          if (bg && bg !== 'none') st += ' ' + bg;
        } catch (e) { }
        var m = st.match(/url\(['"]?([^'")\s]+)['"]?\)/g);
        if (m) m.forEach(function (x) {
          var u = x.replace(/url\(['"]?|['"]?\)/g, '');
          if (u && (u.indexOf('alicdn') !== -1 || u.indexOf('1688') !== -1)) addImage(u);
        });
      });

      document.querySelectorAll('video').forEach(function (v) {
        if (v.poster) addImage(v.poster);
      });
      document.querySelectorAll('[data-poster],[data-video-poster]').forEach(function (el) {
        var p = el.getAttribute('data-poster') || el.getAttribute('data-video-poster');
        if (p) addImage(p);
      });

      try {
        document.querySelectorAll('script').forEach(function (sc) {
          var t = sc.textContent || '',
            m = t.match(/https?:\/\/[^\s"'<>]+?\.(jpg|png|jpeg|gif|webp)/gi);
          if (m) m.forEach(function (u) {
            if (u.indexOf('alicdn') !== -1 || u.indexOf('1688') !== -1) addImage(u);
          });
        });
      } catch (e) { }

      try {
        JS_GLOBALS.forEach(function (k) {
          if (window[k]) {
            var j = JSON.stringify(window[k]),
              m = j.match(/https?:\/\/[^\s"'<>"]+?\.(jpg|png|jpeg|gif|webp)/gi);
            if (m) m.forEach(function (u) { addImage(u.replace(/\\u002F/g, '/')); });
          }
        });
      } catch (e) { }

      return Array.from(urlMap.values());
    }

    return { scan: scan };
  }

  function classify(images) {
    var mainImgs = [], detailImgs = [], otherImgs = [];
    images.forEach(function (u) {
      var l = u.toLowerCase();
      if (l.indexOf('/imgextra/') !== -1 || l.indexOf('/bao/uploaded/') !== -1 || l.indexOf('/img/') !== -1) {
        if (l.indexOf('desc') !== -1 || l.indexOf('detail') !== -1) detailImgs.push(u);
        else mainImgs.push(u);
      } else otherImgs.push(u);
    });
    return { main: mainImgs, detail: detailImgs, other: otherImgs };
  }

  function generateResultPage(images, groups, productInfo) {
    var urlsJson = JSON.stringify(images);
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>1688图片 - ${images.length}张</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:"Microsoft YaHei",Arial,sans-serif;background:#f0f2f5;padding:20px}
.logo{display:inline-flex;align-items:center;gap:8px;margin-right:14px;font-size:22px;font-weight:600;letter-spacing:1px;color:#ff6a00;filter:drop-shadow(1px 2px 4px rgba(255,68,68,.2));animation:logoIn .8s cubic-bezier(.34,1.56,.64,1) both,logoFloat 3s ease-in-out .8s infinite}
.logo svg{width:36px;height:36px;flex-shrink:0}
@keyframes logoIn{0%{opacity:0;transform:translateX(-30px) scale(.8)}100%{opacity:1;transform:translateX(0) scale(1)}}
@keyframes logoFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-2px)}}
.pinfo{background:#fff;border-radius:10px;padding:18px 25px;margin-bottom:16px;box-shadow:0 1px 6px rgba(0,0,0,.05)}
.pinfo h3{font-size:16px;font-weight:bold;color:#333;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid #f0f0f0}
.pinfo table{width:100%;border-collapse:collapse;font-size:14px;table-layout:fixed}
.pinfo td,.pinfo th{padding:6px 12px;border:1px solid #f0f0f0;text-align:left}
.pinfo th{background:#fafafa;color:#999;font-weight:normal;white-space:nowrap;width:15%}
.pinfo td{color:#333;word-wrap:break-word;overflow:hidden;text-overflow:ellipsis}
.pcopy{display:inline-flex;width:18px;height:18px;border-radius:3px;background:none;border:none;cursor:pointer;align-items:center;justify-content:center;vertical-align:text-bottom;margin-left:4px;font-size:15px;color:#ccc;transition:color .2s,transform .15s}
.pcopy:hover{color:#1890ff;transform:scale(1.15)}
.tb{background:#fff;padding:14px 20px;border-radius:14px;margin-bottom:16px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;position:sticky;top:0;z-index:100;box-shadow:0 2px 12px rgba(0,0,0,.06)}
.tb button{color:#fff;border:none;padding:9px 20px;border-radius:20px;cursor:pointer;font-size:13px;font-weight:600;letter-spacing:.5px;transition:all .25s;box-shadow:0 2px 6px rgba(0,0,0,.1)}
.tb button:hover{transform:translateY(-1px);box-shadow:0 4px 12px rgba(0,0,0,.15)}
.tb button:active{transform:translateY(0);box-shadow:0 1px 4px rgba(0,0,0,.1)}
.tb button.s1{background:linear-gradient(135deg,#ff6a00,#ff8533)}
.tb button.s1:hover{background:linear-gradient(135deg,#ff8533,#ffa366)}
.tb button.s2{background:linear-gradient(135deg,#8c8c8c,#bfbfbf)}
.tb button.s2:hover{background:linear-gradient(135deg,#a6a6a6,#d9d9d9)}
.tb button.s3{background:linear-gradient(135deg,#1890ff,#69c0ff)}
.tb button.s3:hover{background:linear-gradient(135deg,#40a9ff,#91d5ff)}
.tb button.s5{background:linear-gradient(135deg,#ff4444,#ff7875)}
.tb button.s5:hover{background:linear-gradient(135deg,#ff6666,#ffa39e)}
.cnt{color:#999;font-size:14px;margin-left:auto;white-space:nowrap}
.cnt b{font-size:20px;font-weight:bold}
.cnt .cg{color:#52c41a}
.cnt .cf{color:#ff4d4f}
.cnt .cs{color:#1890ff}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px}
.card{background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.06);border:2px solid transparent;cursor:pointer;transition:all .25s}
.card:hover{box-shadow:0 6px 24px rgba(0,0,0,.12);transform:translateY(-2px)}
.card.on{border-color:#1890ff;box-shadow:0 2px 8px rgba(24,144,255,.15)}
.card .iw{width:100%;height:250px;background:#fafafa;display:flex;align-items:center;justify-content:center;overflow:hidden;pointer-events:none;position:relative}
.card .iw img{max-width:100%;max-height:100%;object-fit:contain;transition:transform .2s}
.card:hover .iw img{transform:scale(1.2)}
.card.big .iw::after{content:"HD";position:absolute;top:4px;right:8px;background:linear-gradient(135deg,#ff4d4f,#cf1322);color:#fff;font-size:14px;font-weight:bold;letter-spacing:1px;padding:4px 12px;border-radius:12px;box-shadow:0 2px 8px rgba(207,19,34,.4)}
.card .sz{position:absolute;bottom:4px;left:8px;background:rgba(0,0,0,.7);color:#fff;font-size:12px;font-weight:bold;padding:3px 8px;border-radius:8px;pointer-events:none}
.card .ck{padding:10px 15px;display:flex;align-items:center;gap:8px;position:relative}
.card .ck input{display:none}
.card .ck label{font-size:12px;color:#999;pointer-events:none}
.card .ck::before{content:"";width:20px;height:20px;border-radius:50%;border:2px solid #d9d9d9;background:#fff;flex-shrink:0;transition:all .2s}
.card.on .ck::before{content:"✓";border-color:#1890ff;background:#1890ff;color:#fff;font-size:12px;font-weight:bold;text-align:center;line-height:16px}
.card.on .ck label{color:#1890ff;font-weight:bold}
.card .ua{padding:10px 15px;border-top:1px solid #f0f0f0}
.card .url{display:none}
.card .ac{margin-top:8px;display:flex;gap:8px}
.card .ac a,.card .ac button{font-size:14px;color:#ff6a00;border:1px solid #ff6a00;border-radius:3px;background:none;cursor:pointer;padding:2px 8px;text-decoration:none;pointer-events:auto}
.card .ac a:hover,.card .ac button:hover{background:#ff6a00;color:#fff}
.toast{position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#333;color:#fff;padding:12px 28px;border-radius:8px;font-size:14px;z-index:99999;opacity:0;transition:opacity .3s;pointer-events:none}
.toast.show{opacity:1}
.preview{display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.85);z-index:99998;justify-content:center;align-items:center;cursor:pointer}
.preview.show{display:flex}
.preview img{max-width:90%;max-height:90%;border-radius:8px;cursor:grab;transform-origin:center center}
.preview .close{position:fixed;top:16px;right:16px;width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,.2);color:#fff;font-size:22px;display:flex;align-items:center;justify-content:center;cursor:pointer}
.preview .close:hover{background:rgba(255,255,255,.4)}
.preview .toolbar{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);display:flex;gap:10px;background:rgba(0,0,0,.6);padding:10px 20px;border-radius:28px;z-index:99999;align-items:center}
.preview .toolbar button{width:46px;height:46px;border-radius:50%;border:none;background:rgba(255,255,255,.2);color:#fff;font-size:20px;cursor:pointer;display:flex;align-items:center;justify-content:center}
.preview .toolbar button:hover{background:rgba(255,255,255,.4)}
.preview .toolbar button.active{background:rgba(24,144,255,.7)}
.preview .nav{position:fixed;top:50%;transform:translateY(-50%);width:50px;height:50px;border-radius:50%;border:none;background:rgba(255,255,255,.15);color:#fff;font-size:28px;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:99999}
.preview .nav:hover{background:rgba(255,255,255,.35)}
.preview .nav-l{left:20px}
.preview .nav-r{right:20px}
.gotop{position:fixed;right:24px;bottom:40%;width:44px;height:44px;border-radius:50%;border:none;background:linear-gradient(135deg,#ff6a00,#ff4444);color:#fff;font-size:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 16px rgba(255,68,68,.3);z-index:9990;opacity:0;transition:opacity .3s,transform .2s}
.gotop:hover{transform:scale(1.1);box-shadow:0 6px 20px rgba(255,68,68,.5)}
.gotop.show{opacity:1}
.sf{display:flex;align-items:center;gap:12px;margin-left:8px;font-size:14px;color:#999}
.sf input[type=range]{-webkit-appearance:none;width:420px;height:6px;border-radius:3px;outline:none;cursor:pointer}
.sf input[type=range]::-webkit-slider-runnable-track{height:6px;border-radius:3px;background:transparent}
.sf input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:20px;height:20px;border-radius:50%;background:#fff;border:2px solid #ff6a00;cursor:pointer;margin-top:-7px;transition:box-shadow .2s}
.sf input[type=range]::-webkit-slider-thumb:hover{box-shadow:0 0 0 5px rgba(255,106,0,.2)}
.sf input[type=range]:active::-webkit-slider-thumb{box-shadow:0 0 0 6px rgba(255,106,0,.25)}
.sf .sv{color:#ff6a00;font-weight:bold;font-size:15px;min-width:46px}
.sf .wrap{position:relative;width:420px}
.sf .ticks{position:absolute;top:14px;left:0;width:420px;height:22px}
.sf .ticks span{position:absolute;bottom:0;font-size:10px;color:#c5c8ce;transform:translateX(-50%);white-space:nowrap}
.sf .ticks span::before{content:"";position:absolute;top:-6px;left:50%;width:1px;height:5px;background:#dcdee2}
.ksrow{font-size:12px;color:#bbb;padding:4px 20px 0;margin-bottom:12px;display:flex;gap:16px;flex-wrap:wrap}
.ksrow b{color:#ff6a00;margin-right:2px}
</style>
</head>
<body>
<div class="toast" id="toast"></div>
<div class="tb">
  <span class="logo"><svg viewBox="0 0 36 36" fill="none"><defs><linearGradient id="pg" x1="4" y1="4" x2="32" y2="32" gradientUnits="userSpaceOnUse"><stop stop-color="#ff6a00"/><stop offset="1" stop-color="#ff4444"/></linearGradient></defs><path d="M15 3c-1 2 0 4 1 5" stroke="#ff6a00" stroke-width="2" stroke-linecap="round"/><path d="M17 2c0 2 0 4 1 5" stroke="#ff8533" stroke-width="2" stroke-linecap="round"/><path d="M19 3c1 1.5 0 3.5-1 4.5" stroke="#ff4444" stroke-width="1.5" stroke-linecap="round"/><path d="M21 7c-5 0-9 4.5-9 10 0 3.5 1.5 6.5 4 8.5L11 31l5-3.5c1.5.5 3 .7 4.5.4 5-1 8.5-5.5 8.5-11C29 11 25.5 7 21 7z" fill="url(#pg)"/><path d="M13 15c-2 3-2.5 6-1 9.5 1.5-3 4-5 7-6" fill="#e85600" opacity=".5"/><circle cx="23" cy="13" r="2.2" fill="#fff"/><circle cx="23.5" cy="12.4" r="1" fill="#333"/><circle cx="23.1" cy="12" r=".35" fill="#fff"/><path d="M25.5 15l4-2-2 4.5z" fill="#ff4444"/><path d="M26 16.5l2 1.5-2.5-.5z" fill="#cc3333"/><path d="M13 25l-3 6 4-3z" fill="url(#pg)" opacity=".45"/><path d="M15 26l-1 6 3-4z" fill="url(#pg)" opacity=".35"/></svg>Parrot</span>
  <button id="btnAll" class="s1">✅ 全选</button>
  <button id="btnNone" class="s2">⬜ 取消全选</button>
  <button id="btnCopy" class="s3">📋 复制选中地址</button>
  <button id="btnZip" class="s5">📦 打包下载</button>
  <div class="sf"><span>最小展示尺寸:</span><div class="wrap"><input type="range" id="sizeFilter" min="0" max="1000" value="" step="10"><div class="ticks" id="sliderTicks"></div></div><span id="sizeLabel" class="sv"></span></div>
  <div class="cnt" id="statLine">共 <b class="cg">${images.length}</b> 张 | 已选 <b class="cs">0</b> 张</div>
</div>
<div class="ksrow"><span><b>Ctrl+X</b> 复制选中地址</span><span>预览: <b>←→ A D</b> 切换, <b>空格</b> 选中, <b>ESC</b> 关闭</span></div>
${productInfo || ''}
<div class="grid" id="grid"></div>
<div class="preview" id="preview">
  <div class="close" id="previewClose">✕</div>
  <button class="nav nav-l" id="pvPrev">‹</button>
  <button class="nav nav-r" id="pvNext">›</button>
  <img id="previewImg">
  <div class="toolbar" id="pvToolbar">
    <button id="pvZoomIn" title="放大">+</button>
    <button id="pvZoomOut" title="缩小">-</button>
    <button id="pvRotL" title="左旋">↺</button>
    <button id="pvRotR" title="右旋">↻</button>
    <button id="pvReset" title="重置">↺↻</button>
    <button id="pvToggle" title="选中/取消">✓</button>
    <button id="pvCopyAll" title="复制全部选中地址">📋</button>
  </div>
</div>
<button class="gotop" id="goTop" title="回到顶部">↑</button>
<script src="https://cdn.bootcdn.net/ajax/libs/jszip/3.10.1/jszip.min.js"></script>
<script>
var urls=${urlsJson};
var grid=document.getElementById("grid");
var toastEl=document.getElementById("toast");
function showToast(msg){toastEl.textContent=msg;toastEl.classList.add("show");setTimeout(function(){toastEl.classList.remove("show");},2000);}
function getCheckedUrls(){var arr=[];document.querySelectorAll(".ci:checked").forEach(function(c){arr.push(c.closest(".card").querySelector(".url").textContent);});return arr;}
urls.forEach(function(u,i){var d=document.createElement("div");d.className="card";d.dataset.idx=i;
var ck=document.createElement("div");ck.className="ck";
var inp=document.createElement("input");inp.type="checkbox";inp.className="ci";inp.id="c"+i;
var lbl=document.createElement("label");lbl.textContent="#"+(i+1);
ck.appendChild(inp);ck.appendChild(lbl);d.appendChild(ck);
var iw=document.createElement("div");iw.className="iw";
var img=document.createElement("img");img.src=u;img.onerror=function(){this.style.opacity=0.3;fImg(this)};img.onload=function(){fImg(this)};
iw.appendChild(img);d.appendChild(iw);
var ua=document.createElement("div");ua.className="ua";
var urlDiv=document.createElement("div");urlDiv.className="url";urlDiv.textContent=u;
var ac=document.createElement("div");ac.className="ac";
var openLink=document.createElement("button");openLink.className="openbtn";openLink.textContent="查看图片";openLink.dataset.u=u;
var cpBtn=document.createElement("button");cpBtn.className="cpbtn";cpBtn.textContent="复制图片地址";cpBtn.dataset.u=u;
ac.appendChild(openLink);ac.appendChild(cpBtn);
ua.appendChild(urlDiv);ua.appendChild(ac);d.appendChild(ua);
grid.appendChild(d);});
var _sf=document.getElementById("sizeFilter"),_sl=document.getElementById("sizeLabel");
var _sv=parseInt(localStorage.getItem("1688_sizeFilter"));
if(isNaN(_sv))_sv=200;
_sf.value=_sv;_sl.textContent=_sv?_sv+"px":"0px";
function _sfFill(){var p=(parseInt(_sf.value)/1000*100).toFixed(1);_sf.style.background='linear-gradient(to right,#ff6a00 '+p+'%,#e8e8e8 '+p+'%)';}
_sfFill();
var _tk=document.getElementById("sliderTicks");for(var t=0;t<=1000;t+=100){var sp=document.createElement("span");sp.textContent=t;sp.style.left=(t/1000*100)+"%";_tk.appendChild(sp);}
var _fd=0,_ft=urls.length,_sn=0;
function fImg(el){_fd++;var w=el.naturalWidth,h=el.naturalHeight;var c=el.closest(".card");
c.dataset.w=w;c.dataset.h=h;
if(w>0&&h>0){var s=document.createElement("span");s.className="sz";s.textContent=w+"×"+h;el.closest(".iw").appendChild(s);
if(w>=400&&h>=400){c.classList.add("big");}}
var fv=parseInt(_sf.value)||0;
if(fv>0&&(w<fv||h<fv)){c.style.display="none";_sn++;}
if(_fd===_ft){var n=grid.querySelectorAll(".card").length;document.getElementById("statLine").innerHTML="有效 <b class='cg'>"+(n-_sn)+"</b> 张 | 过滤 <b class='cf'>"+_sn+"</b> 张 | 已选 <b class='cs'>"+getCheckedUrls().length+"</b> 张";}}
_sf.addEventListener("input",function(){var v=parseInt(this.value);_sl.textContent=v?v+"px":"0px";
localStorage.setItem("1688_sizeFilter",v);_sfFill();
var hidden=0;grid.querySelectorAll(".card").forEach(function(c){
if(v>0&&c.dataset.w&&c.dataset.h&&(parseInt(c.dataset.w)<v||parseInt(c.dataset.h)<v)){c.style.display="none";hidden++;}
else{c.style.display="";}});
var n=grid.querySelectorAll(".card").length;document.getElementById("statLine").innerHTML="有效 <b class='cg'>"+(n-hidden)+"</b> 张 | 过滤 <b class='cf'>"+hidden+"</b> 张 | 已选 <b class='cs'>"+getCheckedUrls().length+"</b> 张";
updateCount();});
var pvEl=document.getElementById("preview");var pvImg=document.getElementById("previewImg");
var _pz=1,_px=0,_py=0,_pr=0,_pd=false,_psx=0,_psy=0,_pvi=0;
function pvApply(){pvImg.style.transform="translate("+_px+"px,"+_py+"px) scale("+_pz+") rotate("+_pr+"deg)";}
function pvReset(){_pz=1;_px=0;_py=0;_pr=0;pvApply();pvImg.style.cursor="grab";}
function visibleCards(){return Array.from(grid.children).filter(function(c){return c.style.display!=="none"});}
function pvUpdateToggle(){var vc=visibleCards();var card=vc[_pvi];var cb=card?card.querySelector(".ci"):null;
var btn=document.getElementById("pvToggle");var on=cb&&cb.checked;btn.classList.toggle("active",on);btn.textContent=on?"✓":"✓";btn.style.opacity=on?"1":"0.35"}
function openPreview(u){pvImg.src=u;pvReset();var vc=visibleCards();
_pvi=vc.findIndex(function(c){return c.querySelector(".url").textContent===u;});if(_pvi<0)_pvi=0;
pvUpdateToggle();pvEl.classList.add("show");}
function pvNavigate(dir){var vc=visibleCards();var ni=_pvi+dir;if(ni<0||ni>=vc.length)return;
_pvi=ni;var u=vc[_pvi].querySelector(".url").textContent;pvImg.src=u;pvReset();pvUpdateToggle();}
pvImg.addEventListener("wheel",function(e){e.preventDefault();e.stopPropagation();
_pz=Math.max(0.1,Math.min(20,_pz*(e.deltaY>0?0.9:1.1)));pvApply();},{passive:false});
pvImg.addEventListener("mousedown",function(e){e.preventDefault();e.stopPropagation();_pd=true;_psx=e.clientX-_px;_psy=e.clientY-_py;pvImg.style.cursor="grabbing";});
document.addEventListener("mousemove",function(e){if(!_pd)return;_px=e.clientX-_psx;_py=e.clientY-_psy;pvApply();});
document.addEventListener("mouseup",function(){if(_pd){_pd=false;pvImg.style.cursor="grab";}});
function pvToolbarClick(e){e.stopPropagation();}
document.getElementById("pvToolbar").addEventListener("click",pvToolbarClick);
document.getElementById("pvZoomIn").addEventListener("click",function(e){e.stopPropagation();_pz=Math.min(20,_pz*1.2);pvApply();});
document.getElementById("pvZoomOut").addEventListener("click",function(e){e.stopPropagation();_pz=Math.max(0.1,_pz*0.8);pvApply();});
document.getElementById("pvRotL").addEventListener("click",function(e){e.stopPropagation();_pr-=90;pvApply();});
document.getElementById("pvRotR").addEventListener("click",function(e){e.stopPropagation();_pr+=90;pvApply();});
document.getElementById("pvReset").addEventListener("click",function(e){e.stopPropagation();pvReset();});
document.getElementById("pvToggle").addEventListener("click",function(e){e.stopPropagation();
var vc=visibleCards();var card=vc[_pvi];if(!card)return;var cb=card.querySelector(".ci");
toggleCard(card,cb);pvUpdateToggle();});
document.getElementById("pvCopyAll").addEventListener("click",function(e){e.stopPropagation();
var arr=getCheckedUrls();
if(!arr.length){showToast("请先选择图片");return;}doCopy(arr.join("\\n"),arr.length);});
document.addEventListener("keydown",function(e){if((e.ctrlKey||e.metaKey)&&e.key=="x"){e.preventDefault();
var arr=getCheckedUrls();
if(!arr.length){showToast("请先选择图片");return;}doCopy(arr.join("\\n"),arr.length);}});
document.getElementById("pvPrev").addEventListener("click",function(e){e.stopPropagation();pvNavigate(-1);});
document.getElementById("pvNext").addEventListener("click",function(e){e.stopPropagation();pvNavigate(1);});
document.addEventListener("keydown",function(e){
if(!pvEl.classList.contains("show"))return;
if(e.key==="ArrowLeft"||e.key==="a"||e.key==="A")pvNavigate(-1);
else if(e.key==="ArrowRight"||e.key==="d"||e.key==="D")pvNavigate(1);
else if(e.key===" "){e.preventDefault();var vc=visibleCards();var card=vc[_pvi];if(card){var cb=card.querySelector(".ci");toggleCard(card,cb);pvUpdateToggle();}}
else if(e.key==="Escape"){pvEl.classList.remove("show");}});
pvEl.addEventListener("click",function(e){if(e.target===pvImg)return;pvEl.classList.remove("show");});
document.getElementById("previewClose").addEventListener("click",function(e){e.stopPropagation();pvEl.classList.remove("show");});
grid.addEventListener("click",function(e){
var cpBtn=e.target.closest(".cpbtn");if(cpBtn){e.stopPropagation();copyOne(cpBtn.dataset.u);return;}
var openBtn=e.target.closest(".openbtn");if(openBtn){e.stopPropagation();openPreview(openBtn.dataset.u);return;}
var card=e.target.closest(".card");if(!card)return;
toggleCard(card,card.querySelector(".ci"));});
function toggleCard(card,cb){cb.checked=!cb.checked;card.classList.toggle("on",cb.checked);updateCount();}
function updateCount(){var hidden=0;grid.querySelectorAll(".card").forEach(function(c){if(c.style.display==="none")hidden++;});
var n=grid.querySelectorAll(".card").length;
document.getElementById("statLine").innerHTML="有效 <b class='cg'>"+(n-hidden)+"</b> 张 | 过滤 <b class='cf'>"+hidden+"</b> 张 | 已选 <b class='cs'>"+getCheckedUrls().length+"</b> 张";}
document.getElementById("btnAll").addEventListener("click",function(){
document.querySelectorAll(".card").forEach(function(c){if(c.style.display==="none")return;var cb=c.querySelector(".ci");cb.checked=true;c.classList.add("on");});updateCount();});
document.getElementById("btnNone").addEventListener("click",function(){
document.querySelectorAll(".ci").forEach(function(c){c.checked=false;c.closest(".card").classList.remove("on");});updateCount();});
function doCopy(t,n){navigator.clipboard.writeText(t).then(function(){showToast("已复制"+n+"个地址");}).catch(function(){
var ta=document.createElement("textarea");ta.value=t;document.body.appendChild(ta);ta.select();document.execCommand("copy");document.body.removeChild(ta);showToast("已复制"+n+"个地址");});}
document.getElementById("btnCopy").addEventListener("click",function(){
var arr=getCheckedUrls();
if(!arr.length){showToast("请先选择图片");return;}doCopy(arr.join("\\n"),arr.length);});
function copyOne(u){doCopy(u,1);}
document.getElementById("btnZip").addEventListener("click",async function(){if(typeof JSZip==="undefined"){showToast("JSZip 库加载失败，请检查网络");return;}
var arr=getCheckedUrls();
if(!arr.length){showToast("请先选择图片");return;}
var btn=this;btn.disabled=true;var orig=btn.textContent;
var zip=new JSZip();var done=0,failed=0;
for(var i=0;i<arr.length;i++){try{var resp=await fetch(arr[i]);var blob=await resp.blob();
var ext=arr[i].match(/\.(jpg|png|jpeg|webp)/i);zip.file("image_"+String(i+1).padStart(3,"0")+"."+(ext?ext[1]:"jpg"),blob);
}catch(e){failed++;}
done++;btn.textContent="⏳ "+done+"/"+arr.length;}
var content=await zip.generateAsync({type:"blob"});
var a=document.createElement("a");a.href=URL.createObjectURL(content);a.download="1688_images_"+Date.now()+".zip";a.click();
btn.disabled=false;btn.textContent=orig;
showToast("下载完成！"+arr.length+"张"+(failed?"，"+failed+"张失败":""));});
document.addEventListener("click",function(e){var b=e.target.closest(".pcopy");if(!b)return;e.stopPropagation();var t=b.getAttribute("data-copy");if(t){navigator.clipboard.writeText(t).then(function(){showToast("已复制到粘贴板");}).catch(function(){var ta=document.createElement("textarea");ta.value=t;document.body.appendChild(ta);ta.select();document.execCommand("copy");document.body.removeChild(ta);showToast("已复制到粘贴板");});}});
document.addEventListener("scroll",function(){document.getElementById("goTop").classList.toggle("show",window.scrollY>300);});
document.getElementById("goTop").addEventListener("click",function(){window.scrollTo({top:0,behavior:"smooth"});});
</script>
</body>
</html>`;
  }

  function extractProductInfo() {
    var parts = [];
    var ids = [
      { id: "productAttributes", title: "商品属性" },
      { id: "productPackInfo", title: "包装信息" }
    ];
    ids.forEach(function (item) {
      var el = document.getElementById(item.id);
      if (!el) return;
      var tables = el.querySelectorAll("table");
      if (!tables.length) return;
      var html = "";
      tables.forEach(function (t) {
        var clone = t.cloneNode(true);
        clone.querySelectorAll("td, th").forEach(function (cell) {
          var btn = document.createElement("button");
          btn.className = "pcopy";
          btn.title = "复制文本";
          btn.textContent = "📋";
          btn.setAttribute("data-copy", cell.textContent.trim());
          cell.appendChild(btn);
        });
        html += clone.outerHTML;
      });
      parts.push('<div class="pinfo"><h3>' + item.title + '</h3>' + html + '</div>');
    });
    return parts.length > 0 ? parts.join("") : null;
  }

  function showResult(images, groups, productInfo) {
    var html = generateResultPage(images, groups, productInfo);
    var blob = new Blob([html], { type: 'text/html' });
    var blobUrl = URL.createObjectURL(blob);
    var w = window.open(blobUrl, '_blank');
    if (!w) {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        var reader = new FileReader();
        reader.onload = function () {
          chrome.runtime.sendMessage({ action: 'openTab', url: reader.result });
        };
        reader.readAsDataURL(blob);
      } else {
        alert('弹出窗口被阻止！请允许弹出窗口。');
      }
    }
  }

  window.GrabCore = {
    scanImages: function () {
      var collector = createCollector();
      var images = collector.scan();
      if (images.length === 0) return null;
      var groups = classify(images);
      var productInfo = extractProductInfo();
      showResult(images, groups, productInfo);
      return images.length;
    },
    getImageCount: function () {
      var collector = createCollector();
      return collector.scan().length;
    }
  };
})();
