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

  function collectTitle() {
    var el = document.querySelector('#productTitle h1') || document.querySelector('.title-content h1') ||
      document.querySelector('.d-title') || document.querySelector('.title-text');
    return el ? el.textContent.trim() : '';
  }

  function collectImages() {
    var mainImages = [];
    var descImages = [];

    // 主图：从 #gallery 下所有 img 提取
    var gallery = document.getElementById('gallery');
    if (gallery) {
      gallery.querySelectorAll('img').forEach(function (img) {
        var src = img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || '';
        if (!src || src.indexOf('data:') === 0) return;
        if (src.indexOf('//') === 0) src = 'https:' + src;
        src = src.replace(/\?x-oss-process=.*$/i, '');
        if (src.indexOf('alicdn') !== -1 && mainImages.indexOf(src) === -1) {
          mainImages.push(src);
        }
      });
    }

    // 描述图：从 #description 下所有 img 提取
    var descArea = document.getElementById('description');
    if (descArea) {
      descArea.querySelectorAll('img').forEach(function (img) {
        var src = img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || '';
        if (!src || src.indexOf('data:') === 0) return;
        if (src.indexOf('//') === 0) src = 'https:' + src;
        src = src.replace(/\?x-oss-process=.*$/i, '');
        if (src.indexOf('alicdn') !== -1 && descImages.indexOf(src) === -1) {
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

    return { mainImages: mainImages.slice(0, 8), descImages: descImages };
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

  // 通过打开 SKU 列表弹窗提取数据（异步）
  function collectSkusAsync(callback) {
    var packInfo = collectPackInfo();

    // 1. 点击"SKU列表"按钮打开弹窗
    var skuListBtn = null;
    var toolbarItems = document.querySelectorAll('.ap-pdptoolbar__item-text');
    for (var i = 0; i < toolbarItems.length; i++) {
      if (toolbarItems[i].textContent.trim() === 'SKU列表') {
        skuListBtn = toolbarItems[i];
        break;
      }
    }

    if (!skuListBtn) {
      // 没有工具栏，回退到 DOM 直接提取
      callback(collectSkusFallback(packInfo));
      return;
    }

    skuListBtn.click();

    // 2. 等待弹窗表格出现
    var startTime = Date.now();
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
      if (Date.now() - startTime > 5000) {
        // 超时，回退
        callback(collectSkusFallback(packInfo));
        return;
      }
      requestAnimationFrame(waitForTable);
    })();
  }

  function parseSkuTable(tbody, packInfo) {
    var skus = [];
    var rows = tbody.querySelectorAll('tr');
    rows.forEach(function (tr) {
      var imgEl = tr.querySelector('img.ap-platformSKUs-table-img');
      var image = '';
      if (imgEl) {
        image = imgEl.getAttribute('data-src') || imgEl.src || '';
        if (image.indexOf('//') === 0) image = 'https:' + image;
      }

      // 第4列: SKU名称, 第5列: SKU ID, 第6列: 原价
      var spans = tr.querySelectorAll('td span[title]');
      var name = spans.length >= 4 ? (spans[3].getAttribute('title') || '') : '';
      var skuId = spans.length >= 5 ? (spans[4].getAttribute('title') || '') : '';
      var price = '';
      if (spans.length >= 6) {
        var priceText = spans[5].getAttribute('title') || '';
        var pm = priceText.match(/[\d.]+/);
        if (pm) price = pm[0];
      }

      // 按 SKU 名称匹配包装信息
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
  function collectPackInfo() {
    var packMap = {};
    var defaultInfo = { dimensions: [], weight: '' };
    var packEl = document.getElementById('productPackInfo');
    if (!packEl) return { _default: defaultInfo, map: packMap };

    var table = packEl.querySelector('table');
    if (!table) return { _default: defaultInfo, map: packMap };

    // 解析表头，建立列索引
    var headers = [];
    table.querySelectorAll('thead th').forEach(function (th) {
      headers.push(th.textContent.trim());
    });
    // 也兼容没有 thead 的情况，从第一行 th 取
    if (headers.length === 0) {
      var firstRowThs = table.querySelectorAll('tr:first-child th');
      firstRowThs.forEach(function (th) { headers.push(th.textContent.trim()); });
    }

    var colName = -1, colLen = -1, colWid = -1, colHei = -1, colWeight = -1;
    headers.forEach(function (h, i) {
      var hl = h.toLowerCase();
      if (hl.indexOf('颜色') !== -1 || hl.indexOf('规格') !== -1 || hl === '尺寸' || hl === '属性') colName = i;
      if (hl.indexOf('长') !== -1 && hl.indexOf('cm') !== -1) colLen = i;
      if (hl.indexOf('宽') !== -1 && hl.indexOf('cm') !== -1) colWid = i;
      if (hl.indexOf('高') !== -1 && hl.indexOf('cm') !== -1) colHei = i;
      if (hl.indexOf('重量') !== -1 || hl.indexOf('毛重') !== -1) colWeight = i;
    });

    // 如果没有独立的 长/宽/高 列，尝试匹配"长×宽×高"合并列
    var combinedDimCol = -1;
    if (colLen === -1 || colWid === -1 || colHei === -1) {
      headers.forEach(function (h, i) {
        if (h.indexOf('长') !== -1 && h.indexOf('宽') !== -1 && h.indexOf('高') !== -1) combinedDimCol = i;
        if (h.indexOf('尺寸') !== -1 || h.indexOf('规格') !== -1) {
          if (colName === -1) colName = i;
        }
      });
    }

    // 遍历数据行
    var nameCol = colName !== -1 ? colName : 0;
    table.querySelectorAll('tbody tr').forEach(function (tr) {
      var cells = tr.querySelectorAll('td');
      if (cells.length < 2) return;

      var name = getCellText(cells[nameCol]);
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

  function collectProductData(callback) {
    var imgs = collectImages();
    var attrs = collectAttrs();
    collectSkusAsync(function (skus) {
      callback({
        sourceUrl: location.href,
        title: collectTitle(),
        mainImages: imgs.mainImages,
        descImages: imgs.descImages,
        attrs: attrs,
        skus: skus
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
})();
