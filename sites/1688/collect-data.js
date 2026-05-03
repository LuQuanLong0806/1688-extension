(function () {
  if (window.__1688CollectData) return;
  window.__1688CollectData = true;

  var STORAGE_KEY = '1688_server_url';

  function getServerUrl() {
    return localStorage.getItem(STORAGE_KEY) || 'http://localhost:3000';
  }

  function getOfferId() {
    var m = location.href.match(/offer\/(\d+)\.html/i);
    return m ? m[1] : '';
  }

  function checkExists(callback) {
    var offerId = getOfferId();
    if (!offerId) { callback({ exists: false }); return; }
    var serverUrl = getServerUrl();
    fetch(serverUrl + '/api/product/check?offerId=' + offerId)
      .then(function (r) { return r.json(); })
      .then(function (res) { callback(res); })
      .catch(function () { callback({ exists: false }); });
  }

  // ========== 数据采集 ==========

  // 预加载主图：逐个悬浮缩略图，触发懒加载
  function preloadGalleryImages(callback) {
    var items = document.querySelectorAll('#gallery .od-scroller-module .od-scroller-item');
    var validItems = [];
    items.forEach(function (item) {
      var cover = item.querySelector('.v-image-cover');
      if (!cover) return;
      var bg = cover.style.backgroundImage || '';
      // 跳过"参数"等非图片项
      if (bg.indexOf('undefined') !== -1 || bg.indexOf('url') === -1) return;
      validItems.push(item);
    });

    if (validItems.length <= 1) { callback(); return; }

    var idx = 0;
    (function hoverNext() {
      if (idx >= validItems.length) {
        callback();
        return;
      }
      var item = validItems[idx];
      item.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      item.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      idx++;
      setTimeout(hoverNext, 100);
    })();
  }

  function collectTitle() {
    var el = document.querySelector('#productTitle h1') || document.querySelector('.title-content h1') ||
      document.querySelector('.d-title') || document.querySelector('.title-text');
    return el ? el.textContent.trim() : '';
  }

  function collectImages() {
    var mainImages = [];
    var descImages = [];
    var detailImages = [];

    // 排除 icon/svg 图片
    function isIcon(src) { return /\.svg(\?|$)/i.test(src); }

    // 排除推荐/搭配商品区域的图片
    var excludeSelectors = ['#shopProductRecommend', '#shopProductCombine'];
    function isExcluded(el) {
      for (var i = 0; i < excludeSelectors.length; i++) {
        if (el.closest(excludeSelectors[i])) return true;
      }
      return false;
    }

    // 主图：从 od-gallery-list 内的 img 采集
    var galleryList = document.querySelector('#gallery .od-gallery-preview .od-gallery-list');
    if (galleryList) {
      galleryList.querySelectorAll('li img').forEach(function (img) {
        var src = img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || '';
        if (!src || src.indexOf('data:') === 0) return;
        if (src.indexOf('//') === 0) src = 'https:' + src;
        src = src.replace(/\?x-oss-process=.*$/i, '');
        if (src.indexOf('alicdn') !== -1 && !isIcon(src) && mainImages.indexOf(src) === -1) {
          mainImages.push(src);
        }
      });
    }

    // 描述图：从 #description 下所有 img 提取
    var descArea = document.getElementById('description');
    if (descArea) {
      descArea.querySelectorAll('img').forEach(function (img) {
        if (isExcluded(img)) return;
        var src = img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || '';
        if (!src || src.indexOf('data:') === 0) return;
        if (src.indexOf('//') === 0) src = 'https:' + src;
        src = src.replace(/\?x-oss-process=.*$/i, '');
        if (src.indexOf('alicdn') !== -1 && !isIcon(src) && descImages.indexOf(src) === -1) {
          descImages.push(src);
        }
      });
    }

    // iframe 内的描述图
    document.querySelectorAll('#description iframe, .desc-lazyload-container iframe').forEach(function (f) {
      try {
        var doc = f.contentDocument || f.contentWindow.document;
        doc.querySelectorAll('img').forEach(function (img) {
          var src = img.src || img.getAttribute('data-src') || '';
          if (!src || src.indexOf('data:') === 0) return;
          if (src.indexOf('//') === 0) src = 'https:' + src;
          src = src.replace(/\?x-oss-process=.*$/i, '');
          if (src.indexOf('alicdn') !== -1 && descImages.indexOf(src) === -1) {
            descImages.push(src);
          }
        });
      } catch (e) {}
    });

    // 详情图：从 .collapse-body 下所有 Shadow DOM 提取
    var collapseBody = document.querySelector('#description .od-collapse-module .collapse-body');
    if (collapseBody) {
      collapseBody.querySelectorAll('*').forEach(function (el) {
        if (!el.shadowRoot) return;
        el.shadowRoot.querySelectorAll('img').forEach(function (img) {
          var src = img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || '';
          if (!src || src.indexOf('data:') === 0) return;
          if (src.indexOf('//') === 0) src = 'https:' + src;
          src = src.replace(/\?x-oss-process=.*$/i, '');
          if (src.indexOf('alicdn') !== -1 && !isIcon(src) && detailImages.indexOf(src) === -1) {
            detailImages.push(src);
          }
        });
      });
    }

    return { mainImages: mainImages.slice(0, 8), descImages: descImages, detailImages: detailImages };
  }

  function collectAttrs() {
    var attrs = [];
    // 尝试多种选择器
    var items = document.querySelectorAll('.sku-item-name');
    if (!items.length) items = document.querySelectorAll('#skuSelection .sku-item-name');
    if (!items.length) items = document.querySelectorAll('.obj-attr-item .name, .obj-header .name');

    items.forEach(function (item) {
      var text = item.textContent.trim();
      if (text && attrs.indexOf(text) === -1) attrs.push(text);
    });
    return attrs;
  }

  function collectCategory() {
    var html = document.documentElement.innerHTML;
    var cat = {};
    var fields = ['catId','leafCategoryId','topCategoryId','postCategoryId','leafCategoryName','categoryPath'];
    fields.forEach(function (f) {
      var m = html.match(new RegExp('"?' + f + '"?\\s*:\\s*"?([^",}\\s]+)"?'));
      if (m) cat[f] = m[1];
    });
    return cat;
  }

  // 通过打开 SKU 列表弹窗提取数据（异步）
  function collectSkusAsync(callback) {
    var packInfo = collectPackInfo();

    // 1. 点击"SKU列表"按钮打开弹窗（带5s重试）
    var findStart = Date.now();
    (function tryFindBtn() {
      var skuListBtn = null;
      var toolbarItems = document.querySelectorAll('.ap-pdptoolbar__item-text');
      for (var i = 0; i < toolbarItems.length; i++) {
        if (toolbarItems[i].textContent.trim() === 'SKU列表') {
          skuListBtn = toolbarItems[i];
          break;
        }
      }

      if (!skuListBtn) {
        if (Date.now() - findStart > 5000) {
          callback(collectSkusFallback(packInfo));
          return;
        }
        requestAnimationFrame(tryFindBtn);
        return;
      }

      skuListBtn.click();

      // 2. 等待弹窗表格出现
      var tableStart = Date.now();
      (function waitForTable() {
        var modal = document.querySelector('.ap-sub-checkPlatformSku-modal');
        var table = modal ? modal.querySelector('.ap-platformSKUs-table tbody') : null;
        if (table && table.querySelectorAll('tr').length > 0) {
          // 3. 解析表格
          var skus = parseSkuTable(table, packInfo);

          // 4. 关闭弹窗
          var closeBtn = modal.querySelector('.ap-pop-prompt-modal__close');
          if (closeBtn) closeBtn.click();
          var footerCloseBtn = modal.querySelector('.ap-pop-prompt-modal__footer button');
          if (!closeBtn && footerCloseBtn) footerCloseBtn.click();

          callback(skus);
          return;
        }
        if (Date.now() - tableStart > 5000) {
          callback(collectSkusFallback(packInfo));
          return;
        }
        requestAnimationFrame(waitForTable);
      })();
    })();
  }

  function parseSkuTable(tbody, packInfo) {
    // 解析表头，建立列名 → 列下标映射
    var table = tbody.closest('table') || tbody.parentElement;
    var headerMap = {};
    var ths = table.querySelectorAll('thead th');
    ths.forEach(function (th, i) {
      var titleEl = th.querySelector('.ap-platformSKUs-table-th-title') || th.querySelector('span');
      var title = titleEl ? titleEl.textContent.trim() : '';
      if (title) headerMap[title] = i;
    });

    var colImg = headerMap['SKU图片'] !== undefined ? headerMap['SKU图片'] : 2;
    var colName = headerMap['SKU名称'] !== undefined ? headerMap['SKU名称'] : 3;
    var colSkuId = headerMap['SKU ID'] !== undefined ? headerMap['SKU ID'] : 4;
    var colPrice = headerMap['原价'] !== undefined ? headerMap['原价'] : 5;

    var skus = [];
    var rows = tbody.querySelectorAll('tr');
    rows.forEach(function (tr) {
      var tds = tr.querySelectorAll('td');
      if (tds.length < 6) return;

      var imgEl = tds[colImg] ? tds[colImg].querySelector('img.ap-platformSKUs-table-img') : null;
      var image = '';
      if (imgEl) {
        image = imgEl.getAttribute('data-src') || imgEl.src || '';
        if (image.indexOf('//') === 0) image = 'https:' + image;
      }

      var name = getTdTitle(tds, colName);
      var skuId = getTdTitle(tds, colSkuId);
      var price = '';
      var priceText = getTdTitle(tds, colPrice);
      var pm = priceText.match(/[\d.]+/);
      if (pm) price = pm[0];

      var pack = matchPackInfo(name, packInfo);

      skus.push({
        image: image,
        sku: skuId,
        price: price,
        name: name,
        dimensions: pack.dimensions,
        weight: pack.weight
      });
    });
    return skus;
  }

  function getTdTitle(tds, col) {
    if (!tds[col]) return '';
    var span = tds[col].querySelector('span[title]');
    return span ? span.getAttribute('title') || '' : tds[col].textContent.trim();
  }

  // 按 SKU 名称匹配包装信息（支持模糊匹配）
  function matchPackInfo(skuName, packInfo) {
    if (!skuName || !packInfo) return packInfo._default || { dimensions: [], weight: '' };

    // 精确匹配
    if (packInfo.map[skuName]) return packInfo.map[skuName];

    // 模糊匹配：SKU名称包含包装表名称，或反过来
    for (var key in packInfo.map) {
      if (skuName.indexOf(key) !== -1 || key.indexOf(skuName) !== -1) {
        return packInfo.map[key];
      }
    }

    return packInfo._default || { dimensions: [], weight: '' };
  }

  function collectSkusFallback(packInfo) {
    var skus = [];
    var attrs = collectAttrs();
    attrs.forEach(function (attr) {
      var pack = matchPackInfo(attr, packInfo);
      skus.push({
        image: '',
        sku: '',
        price: '',
        name: attr,
        dimensions: pack.dimensions,
        weight: pack.weight
      });
    });
    return skus;
  }

  // 返回 { name: { dimensions: [], weight: '' }, ... }，按SKU名称索引
  // 第一列 = SKU名称，其余按表头匹配 长/宽/高/重量
  function collectPackInfo() {
    var packMap = {};
    var defaultInfo = { dimensions: [], weight: '' };
    var packEl = document.getElementById('productPackInfo');
    if (!packEl) return { _default: defaultInfo, map: packMap };

    var table = packEl.querySelector('table');
    if (!table) return { _default: defaultInfo, map: packMap };

    // 解析表头
    var headers = [];
    table.querySelectorAll('thead th').forEach(function (th) {
      var t = th.querySelector('.ap-platformSKUs-table-th-title');
      var text = t ? t.textContent.trim().replace(/\s+/g, '') : th.textContent.trim().replace(/\s+/g, '');
      headers.push(text);
    });

    // 第一列固定为 SKU名称，其余按关键字匹配 长/宽/高/重量
    var colLen = -1, colWid = -1, colHei = -1, colWeight = -1, combinedDimCol = -1;
    headers.forEach(function (h, i) {
      if (i === 0) return; // 跳过第一列（名称）
      var hl = h.toLowerCase();
      if (hl.indexOf('长') !== -1 && hl.indexOf('宽') === -1 && hl.indexOf('高') === -1) colLen = i;
      if (hl.indexOf('宽') !== -1 && hl.indexOf('长') === -1 && hl.indexOf('高') === -1) colWid = i;
      if (hl.indexOf('高') !== -1 && hl.indexOf('长') === -1 && hl.indexOf('宽') === -1) colHei = i;
      if (hl.indexOf('长') !== -1 && (hl.indexOf('宽') !== -1 || hl.indexOf('高') !== -1)) combinedDimCol = i;
      if (hl.indexOf('尺寸') !== -1) combinedDimCol = i;
      if (hl.indexOf('重量') !== -1 || hl.indexOf('毛重') !== -1) colWeight = i;
    });

    // 遍历数据行
    table.querySelectorAll('tbody tr').forEach(function (tr) {
      var cells = tr.querySelectorAll('td');
      if (cells.length < 2) return;

      var name = getCellText(cells[0]); // 第一列 = SKU名称
      if (!name) return;

      var info = { dimensions: [], weight: '' };

      // 独立列：长/宽/高
      if (colLen !== -1 && colWid !== -1 && colHei !== -1) {
        var l = parseFloat(getCellText(cells[colLen])) || 0;
        var w = parseFloat(getCellText(cells[colWid])) || 0;
        var h = parseFloat(getCellText(cells[colHei])) || 0;
        if (l && w && h) {
          info.dimensions = [l, w, h].sort(function (a, b) { return b - a; });
        }
      }

      // 合并列：解析 "10×8×5" 或 "10*8*5"
      if (combinedDimCol !== -1 && info.dimensions.length === 0) {
        var dimText = getCellText(cells[combinedDimCol]);
        var nums = dimText.match(/[\d.]+/g);
        if (nums && nums.length >= 3) {
          info.dimensions = nums.slice(0, 3).map(Number).sort(function (a, b) { return b - a; });
        }
      }

      // 重量
      if (colWeight !== -1) {
        var wt = getCellText(cells[colWeight]);
        var wm = wt.match(/[\d.]+/);
        if (wm) info.weight = wm[0];
      }

      packMap[name] = info;
      // 第一条作为默认值
      if (!defaultInfo.weight && info.weight) defaultInfo = info;
      if (!defaultInfo.dimensions.length && info.dimensions.length) defaultInfo = info;
    });

    return { _default: defaultInfo, map: packMap };
  }

  // 提取 td 文本，排除复制图标
  function getCellText(td) {
    var clone = td.cloneNode(true);
    var icons = clone.querySelectorAll('.__1688_copy_icon');
    icons.forEach(function (ic) { ic.remove(); });
    return clone.textContent.trim();
  }

  // 等待页面关键元素就绪
  function waitForPageReady(callback) {
    if (document.querySelector('#gallery .od-gallery-preview')) {
      callback();
      return;
    }
    var tries = 0;
    (function poll() {
      if (document.querySelector('#gallery .od-gallery-preview')) {
        callback();
        return;
      }
      tries++;
      if (tries > 30) { // 最多等 6 秒
        callback();
        return;
      }
      setTimeout(poll, 200);
    })();
  }

  function collectProductData(callback) {
    waitForPageReady(function () {
    preloadGalleryImages(function () {
      var imgs = collectImages();
      var attrs = collectAttrs();
      var cat = collectCategory();
      collectSkusAsync(function (skus) {
        callback({
          sourceUrl: location.href,
          title: collectTitle(),
          category: cat,
          mainImages: imgs.mainImages,
          descImages: imgs.descImages,
          detailImages: imgs.detailImages,
          attrs: attrs,
          skus: skus
        });
      });
    });
    });
  }

  // ========== 保存到服务器 ==========

  function saveToServer(data, callback) {
    var serverUrl = getServerUrl();
    fetch(serverUrl + '/api/product', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    .then(function (r) { return r.json(); })
    .then(function (res) {
      if (callback) callback(null, res);
    })
    .catch(function (err) {
      if (callback) callback(err);
    });
  }

  // ========== 暴露到全局 ==========

  window.CollectData = {
    collect: collectProductData,
    save: saveToServer,
    checkExists: checkExists,
    getOfferId: getOfferId,
    getServerUrl: getServerUrl,
    collectAttrs: collectAttrs
  };
  // 暴露给小鹦鹉抓图使用
  window.waitForPageReady = waitForPageReady;
  window.preloadGalleryImages = preloadGalleryImages;
})();
