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
      if (/\/offer\//i.test(url)) return;
      var lower = url.toLowerCase();
      if (SKIP_PATTERNS.some(function (p) { return lower.indexOf(p) !== -1; })) return;
      if (/\d+x\d+/.test(url) && !/\d{3,}x\d+|\d+x\d{3,}/.test(url)) return;
      if (/\.gif(\?|$)/i.test(url)) return;
      if (!urlSet.has(url)) { urlSet.add(url); images.push(url); }
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
        if (el.shadowRoot) {
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
        var s = img.src;
        if (s && (s.indexOf('alicdn') !== -1 || s.indexOf('1688') !== -1 || s.indexOf('taobaocdn') !== -1))
          addImage(s);
        getAttrs(img);
      });

      document.querySelectorAll('[style*="url("]').forEach(function (el) {
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

      return images;
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

  function generateResultPage(images, groups) {
    var urlsJson = JSON.stringify(images);
    var h = '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8">';
    h += '<title>1688\u56FE\u7247 - ' + images.length + '\u5F20</title>';
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
    h += '.card.on{border-color:#1890ff;box-shadow:0 4px 16px rgba(24,144,255,.3)}';
    h += '.card .iw{width:100%;height:250px;background:#fafafa;display:flex;align-items:center;justify-content:center;overflow:hidden;pointer-events:none;position:relative}';
    h += '.card .iw img{max-width:100%;max-height:100%;object-fit:contain;transition:transform .2s}';
    h += '.card:hover .iw img{transform:scale(1.2)}';
    h += '.card.big .iw::after{content:"HD";position:absolute;top:4px;right:8px;background:linear-gradient(135deg,#ff4d4f,#cf1322);color:#fff;font-size:14px;font-weight:bold;letter-spacing:1px;padding:4px 12px;border-radius:12px;box-shadow:0 2px 8px rgba(207,19,34,.4)}';
    h += '.card .sz{position:absolute;bottom:4px;left:8px;background:rgba(0,0,0,.7);color:#fff;font-size:12px;font-weight:bold;padding:3px 8px;border-radius:8px;pointer-events:none}';
    h += '.card .ck{padding:10px 15px;display:flex;align-items:center;gap:8px}';
    h += '.card .ck input{width:18px;height:18px;accent-color:#1890ff;cursor:pointer;pointer-events:auto}';
    h += '.card .ck label{font-size:12px;color:#999;cursor:pointer;pointer-events:auto}';
    h += '.card .ua{padding:10px 15px;border-top:1px solid #f0f0f0}';
    h += '.card .url{display:none}';
    h += '.card .ac{margin-top:8px;display:flex;gap:8px}';
    h += '.card .ac a,.card .ac button{font-size:14px;color:#ff6a00;border:1px solid #ff6a00;border-radius:3px;background:none;cursor:pointer;padding:2px 8px;text-decoration:none;pointer-events:auto}';
    h += '.card .ac a:hover,.card .ac button:hover{background:#ff6a00;color:#fff}';
    h += '.toast{position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#333;color:#fff;padding:12px 28px;border-radius:8px;font-size:14px;z-index:99999;opacity:0;transition:opacity .3s;pointer-events:none}';
    h += '.toast.show{opacity:1}';
    h += '.preview{display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.85);z-index:99998;justify-content:center;align-items:center;cursor:pointer}';
    h += '.preview.show{display:flex}';
    h += '.preview img{max-width:90%;max-height:90%;border-radius:8px;cursor:grab;transform-origin:center center}';
    h += '.preview .close{position:fixed;top:16px;right:16px;width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,.2);color:#fff;font-size:22px;display:flex;align-items:center;justify-content:center;cursor:pointer}';
    h += '.preview .close:hover{background:rgba(255,255,255,.4)}';
    h += '.preview .toolbar{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);display:flex;gap:10px;background:rgba(0,0,0,.6);padding:10px 20px;border-radius:28px;z-index:99999;align-items:center}';
    h += '.preview .toolbar button{width:46px;height:46px;border-radius:50%;border:none;background:rgba(255,255,255,.2);color:#fff;font-size:20px;cursor:pointer;display:flex;align-items:center;justify-content:center}';
    h += '.preview .toolbar button:hover{background:rgba(255,255,255,.4)}';
    h += '.preview .toolbar button.active{background:rgba(24,144,255,.7)}';
    h += '.preview .nav{position:fixed;top:50%;transform:translateY(-50%);width:50px;height:50px;border-radius:50%;border:none;background:rgba(255,255,255,.15);color:#fff;font-size:28px;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:99999}';
    h += '.preview .nav:hover{background:rgba(255,255,255,.35)}';
    h += '.preview .nav-l{left:20px}.preview .nav-r{right:20px}';
    h += '</style></head><body>';
    h += '<div class="toast" id="toast"></div>';
    h += '<div class="hd"><h1>1688\u56FE\u7247\u62B1\u53D6\u7ED3\u679C</h1>';
    h += '<p>\u5171 <b>' + images.length + '</b> \u5F20 | \u4E3B\u56FE <b>' + groups.main.length + '</b> | \u8BE6\u60C5 <b>' + groups.detail.length + '</b> | \u5176\u4ED6 <b>' + groups.other.length + '</b></p></div>';
    h += '<div class="tb"><button id="btnAll">\u2705 \u5168\u9009</button><button id="btnNone" class="s2">\u2B1C \u53D6\u6D88\u5168\u9009</button>';
    h += '<button id="btnCopy">\uD83D\uDCCB \u590D\u5236\u9009\u4E2D\u5730\u5740</button><button id="btnDl" class="s3">\uD83D\uDCBE \u4E0B\u8F7D\u5217\u8868</button>';
h += '<button id="btnSmall" class="s4">\uD83D\uDD0D \u663E\u793A\u5C0F\u56FE</button>';
    h += '<div class="cnt">\u5DF2\u9009 <b id="sc">0</b> \u5F20</div></div>';
    h += '<div class="grid" id="grid"></div><div class="preview" id="preview"><div class="close" id="previewClose">\u2715</div><button class="nav nav-l" id="pvPrev">\u2039</button><button class="nav nav-r" id="pvNext">\u203A</button><img id="previewImg"><div class="toolbar" id="pvToolbar"><button id="pvZoomIn" title="\u653E\u5927">+</button><button id="pvZoomOut" title="\u7F29\u5C0F">-</button><button id="pvRotL" title="\u5DE6\u65CB">\u21BA</button><button id="pvRotR" title="\u53F3\u65CB">\u21BB</button><button id="pvReset" title="\u91CD\u7F6E">\u21BA\u21BB</button><button id="pvToggle" title="\u9009\u4E2D/\u53D6\u6D88">\u2713</button><button id="pvCopyAll" title="\u590D\u5236\u5168\u90E8\u9009\u4E2D\u5730\u5740">\uD83D\uDCCB</button></div></div>';
    h += '<scr' + 'ipt>';
    h += 'var urls=' + urlsJson + ';var grid=document.getElementById("grid");';
    h += 'var scEl=document.getElementById("sc");';
    h += 'var toastEl=document.getElementById("toast");';
    h += 'function showToast(msg){toastEl.textContent=msg;toastEl.classList.add("show");setTimeout(function(){toastEl.classList.remove("show");},2000);}';
    h += 'urls.forEach(function(u,i){var d=document.createElement("div");d.className="card";d.dataset.idx=i;';
    h += 'var ck=document.createElement("div");ck.className="ck";';
    h += 'var inp=document.createElement("input");inp.type="checkbox";inp.className="ci";inp.id="c"+i;';
    h += 'var lbl=document.createElement("label");lbl.htmlFor="c"+i;lbl.textContent="#"+(i+1);';
    h += 'ck.appendChild(inp);ck.appendChild(lbl);d.appendChild(ck);';
    h += 'var iw=document.createElement("div");iw.className="iw";';
    h += 'var img=document.createElement("img");img.src=u;img.onerror=function(){this.style.opacity=0.3;fImg(this)};img.onload=function(){fImg(this)};';
    h += 'iw.appendChild(img);d.appendChild(iw);';
    h += 'var ua=document.createElement("div");ua.className="ua";';
    h += 'var urlDiv=document.createElement("div");urlDiv.className="url";urlDiv.textContent=u;';
    h += 'var ac=document.createElement("div");ac.className="ac";';
    h += 'var openLink=document.createElement("button");openLink.className="openbtn";openLink.textContent="\u67E5\u770B\u56FE\u7247";openLink.dataset.u=u;';
    h += 'var cpBtn=document.createElement("button");cpBtn.className="cpbtn";cpBtn.textContent="\u590D\u5236\u56FE\u7247\u5730\u5740";cpBtn.dataset.u=u;';
    h += 'ac.appendChild(openLink);ac.appendChild(cpBtn);';
    h += 'ua.appendChild(urlDiv);ua.appendChild(ac);d.appendChild(ua);';
    h += 'grid.appendChild(d);});';
    h += 'var _fd=0,_ft=urls.length,_sn=0;';
    h += 'function fImg(el){_fd++;var w=el.naturalWidth,h=el.naturalHeight;';
    h += 'if(w<200&&h<200){var c=el.closest(".card");c.classList.add("small");c.style.display="none";_sn++;}';
h += 'else{var s=document.createElement("span");s.className="sz";s.textContent=w+"\u00D7"+h;el.closest(".iw").appendChild(s);';
    h += 'if(w>=400&&h>=400){el.closest(".card").classList.add("big");}}';
    h += 'if(_fd===_ft){var n=grid.querySelectorAll(".card").length;var p=document.querySelector(".hd p");if(p)p.innerHTML="\u6709\u6548\u56FE\u7247 <b>"+(n-_sn)+"</b> \u5F20 | \u5C0F\u56FE <b>"+_sn+"</b> \u5F20";}}';
    h += 'document.getElementById("btnSmall").addEventListener("click",function(){';
    h += 'var show=this.textContent.indexOf("\u663E\u793A")!==-1;this.textContent=show?"\uD83D\uDD0D \u9690\u85CF\u5C0F\u56FE":"\uD83D\uDD0D \u663E\u793A\u5C0F\u56FE";';
    h += 'grid.querySelectorAll(".card.small").forEach(function(c){c.style.display=show?"block":"none";});});';
h += 'var pvEl=document.getElementById("preview");var pvImg=document.getElementById("previewImg");';
    h += 'var _pz=1,_px=0,_py=0,_pr=0,_pd=false,_psx=0,_psy=0,_pvi=0;';
    h += 'function pvApply(){pvImg.style.transform="translate("+_px+"px,"+_py+"px) scale("+_pz+") rotate("+_pr+"deg)";}';
    h += 'function pvReset(){_pz=1;_px=0;_py=0;_pr=0;pvApply();pvImg.style.cursor="grab";}';
    h += 'function visibleCards(){return Array.from(grid.children).filter(function(c){return c.style.display!=="none"});}';
    h += 'function pvUpdateToggle(){var vc=visibleCards();var card=vc[_pvi];var cb=card?card.querySelector(".ci"):null;';
    h += 'var btn=document.getElementById("pvToggle");var on=cb&&cb.checked;btn.classList.toggle("active",on);btn.textContent=on?"\u2713":" "}';
    h += 'function openPreview(u){pvImg.src=u;pvReset();var vc=visibleCards();';
    h += '_pvi=vc.findIndex(function(c){return c.querySelector(".url").textContent===u;});if(_pvi<0)_pvi=0;';
    h += 'pvUpdateToggle();pvEl.classList.add("show");}';
    h += 'function pvNavigate(dir){var vc=visibleCards();var ni=_pvi+dir;if(ni<0||ni>=vc.length)return;';
    h += '_pvi=ni;var u=vc[_pvi].querySelector(".url").textContent;pvImg.src=u;pvReset();pvUpdateToggle();}';
    h += 'pvImg.addEventListener("wheel",function(e){e.preventDefault();e.stopPropagation();';
    h += '_pz=Math.max(0.1,Math.min(20,_pz*(e.deltaY>0?0.9:1.1)));pvApply();},{passive:false});';
    h += 'pvImg.addEventListener("mousedown",function(e){e.preventDefault();e.stopPropagation();_pd=true;_psx=e.clientX-_px;_psy=e.clientY-_py;pvImg.style.cursor="grabbing";});';
    h += 'document.addEventListener("mousemove",function(e){if(!_pd)return;_px=e.clientX-_psx;_py=e.clientY-_psy;pvApply();});';
    h += 'document.addEventListener("mouseup",function(){if(_pd){_pd=false;pvImg.style.cursor="grab";}});';
    h += 'function pvToolbarClick(e){e.stopPropagation();}';
    h += 'document.getElementById("pvToolbar").addEventListener("click",pvToolbarClick);';
    h += 'document.getElementById("pvZoomIn").addEventListener("click",function(e){e.stopPropagation();_pz=Math.min(20,_pz*1.2);pvApply();});';
    h += 'document.getElementById("pvZoomOut").addEventListener("click",function(e){e.stopPropagation();_pz=Math.max(0.1,_pz*0.8);pvApply();});';
    h += 'document.getElementById("pvRotL").addEventListener("click",function(e){e.stopPropagation();_pr-=90;pvApply();});';
    h += 'document.getElementById("pvRotR").addEventListener("click",function(e){e.stopPropagation();_pr+=90;pvApply();});';
    h += 'document.getElementById("pvReset").addEventListener("click",function(e){e.stopPropagation();pvReset();});';
    h += 'document.getElementById("pvToggle").addEventListener("click",function(e){e.stopPropagation();';
    h += 'var vc=visibleCards();var card=vc[_pvi];if(!card)return;var cb=card.querySelector(".ci");';
    h += 'toggleCard(card,cb);pvUpdateToggle();});';
    h += 'document.getElementById("pvCopyAll").addEventListener("click",function(e){e.stopPropagation();';
    h += 'var arr=[];document.querySelectorAll(".ci:checked").forEach(function(c){arr.push(c.closest(".card").querySelector(".url").textContent);});';
    h += 'if(!arr.length){showToast("\u8BF7\u5148\u9009\u62E9\u56FE\u7247");return;}doCopy(arr.join("\\n"),arr.length);});';
    h += 'document.getElementById("pvPrev").addEventListener("click",function(e){e.stopPropagation();pvNavigate(-1);});';
    h += 'document.getElementById("pvNext").addEventListener("click",function(e){e.stopPropagation();pvNavigate(1);});';
    h += 'document.addEventListener("keydown",function(e){';
    h += 'if(!pvEl.classList.contains("show"))return;';
    h += 'if(e.key==="ArrowLeft"||e.key==="a"||e.key==="A")pvNavigate(-1);';
    h += 'else if(e.key==="ArrowRight"||e.key==="d"||e.key==="D")pvNavigate(1);';
    h += 'else if(e.key===" "){e.preventDefault();var vc=visibleCards();var card=vc[_pvi];if(card){var cb=card.querySelector(".ci");toggleCard(card,cb);pvUpdateToggle();}}';
	    h += 'else if(e.key==="Escape"){pvEl.classList.remove("show");}});';
    h += 'pvEl.addEventListener("click",function(e){if(e.target===pvImg)return;pvEl.classList.remove("show");});';
    h += 'document.getElementById("previewClose").addEventListener("click",function(e){e.stopPropagation();pvEl.classList.remove("show");});';
    h += 'grid.addEventListener("click",function(e){';
    h += 'var cpBtn=e.target.closest(".cpbtn");if(cpBtn){e.stopPropagation();copyOne(cpBtn.dataset.u);return;}';
    h += 'var openBtn=e.target.closest(".openbtn");if(openBtn){e.stopPropagation();openPreview(openBtn.dataset.u);return;}';
    h += 'var card=e.target.closest(".card");if(!card)return;';
    h += 'var cb=card.querySelector(".ci");';
    h += 'if(e.target===cb){toggleCard(card,cb);return;}';
    h += 'toggleCard(card,cb);});';
    h += 'function toggleCard(card,cb){cb.checked=!cb.checked;card.classList.toggle("on",cb.checked);updateCount();}';
    h += 'function updateCount(){scEl.textContent=document.querySelectorAll(".ci:checked").length;}';
    h += 'document.getElementById("btnAll").addEventListener("click",function(){';
    h += 'document.querySelectorAll(".card").forEach(function(c){if(c.style.display==="none")return;var cb=c.querySelector(".ci");cb.checked=true;c.classList.add("on");});updateCount();});';
    h += 'document.getElementById("btnNone").addEventListener("click",function(){';
    h += 'document.querySelectorAll(".ci").forEach(function(c){c.checked=false;c.closest(".card").classList.remove("on");});updateCount();});';
    h += 'function doCopy(t,n){navigator.clipboard.writeText(t).then(function(){showToast("\u5DF2\u590D\u5236"+n+"\u4E2A\u5730\u5740");}).catch(function(){';
    h += 'var ta=document.createElement("textarea");ta.value=t;document.body.appendChild(ta);ta.select();document.execCommand("copy");document.body.removeChild(ta);showToast("\u5DF2\u590D\u5236"+n+"\u4E2A\u5730\u5740");});}';
    h += 'document.getElementById("btnCopy").addEventListener("click",function(){';
    h += 'var arr=[];document.querySelectorAll(".ci:checked").forEach(function(c){arr.push(c.closest(".card").querySelector(".url").textContent);});';
    h += 'if(!arr.length){showToast("\u8BF7\u5148\u9009\u62E9\u56FE\u7247");return;}doCopy(arr.join("\\n"),arr.length);});';
    h += 'document.getElementById("btnDl").addEventListener("click",function(){';
    h += 'var arr=[];document.querySelectorAll(".ci:checked").forEach(function(c){arr.push(c.closest(".card").querySelector(".url").textContent);});';
    h += 'if(!arr.length){showToast("\u8BF7\u5148\u9009\u62E9\u56FE\u7247");return;}var b=new Blob([arr.join("\\n")],{type:"text/plain"});';
    h += 'var a=document.createElement("a");a.href=URL.createObjectURL(b);a.download="1688_"+Date.now()+".txt";a.click();});';
    h += 'function copyOne(u){doCopy(u,"");}';
    h += '</' + 'script></body></html>';
    return h;
  }

  function showResult(images, groups) {
    var html = generateResultPage(images, groups);
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
        alert('\u5F39\u51FA\u7A97\u53E3\u88AB\u963B\u6B62\uFF01\u8BF7\u5141\u8BB8\u5F39\u51FA\u7A97\u53E3\u3002');
      }
    }
  }

  window.GrabCore = {
    scanImages: function () {
      var collector = createCollector();
      var images = collector.scan();
      if (images.length === 0) return null;
      var groups = classify(images);
      showResult(images, groups);
      return images.length;
    },
    getImageCount: function () {
      var collector = createCollector();
      return collector.scan().length;
    }
  };
})();
