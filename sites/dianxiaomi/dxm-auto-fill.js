(function () {
  if (window.__dxmAutoFill) return;
  window.__dxmAutoFill = true;

  // ========== 检测 collectId ==========
  var params = new URLSearchParams(location.search);
  var collectId = params.get('collectId');
  if (!collectId) return;

  var SERVER_KEY = '1688_server_url';
  var C = window.BeeConfig;

  // ========== Step log ==========
  var autoStep = 0;
  var autoTotal = 0;
  function autoLog(msg) {
    autoStep++;
    var tag = '[自动填表] ' + autoStep + '/' + autoTotal + ' ' + msg;
    console.log('%c' + tag, 'color:#E65100;font-weight:bold');
    if (C && C.showBubble) {
      C.showBubble(autoStep + '/' + autoTotal + ' ' + msg, 'loading');
    }
  }

  function autoFinish(msg) {
    console.log('%c[自动填表] ✅ ' + msg, 'color:#52c41a;font-weight:bold;font-size:14px');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (C && C.showBubble) {
      C.showBubble('✅ ' + msg, 'ok');
      setTimeout(C.hideBubble, 3000);
    }
  }

  function autoError(msg) {
    console.log('%c[自动填表] ❌ ' + msg, 'color:#ff4444;font-weight:bold;font-size:14px');
    if (C && C.showBubble) {
      C.showBubble('❌ ' + msg, 'err');
      setTimeout(C.hideBubble, 3000);
    }
  }

  // ========== DOM Helpers ==========
  function setInputValue(input, val) {
    if (C && C.setInputValue) {
      C.setInputValue(input, val);
      return;
    }
    var proto = input.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    var nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    nativeSetter.call(input, val);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function hoverElement(el) {
    if (C && C.hoverElement) { C.hoverElement(el); return; }
    el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
    el.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
  }

  function waitForElement(selector, timeout, cb) {
    if (C && C.waitForElement) { C.waitForElement(selector, timeout, cb); return; }
    var start = Date.now();
    (function check() {
      var el = document.querySelector(selector);
      if (el) return cb(el);
      if (Date.now() - start > timeout) return cb(null);
      requestAnimationFrame(check);
    })();
  }

  function waitForVisibleLi(textFragment, timeout, cb) {
    if (C && C.waitForVisibleLi) { C.waitForVisibleLi(textFragment, timeout, cb); return; }
    var start = Date.now();
    (function check() {
      var allLi = document.querySelectorAll('li');
      for (var i = 0; i < allLi.length; i++) {
        if (allLi[i].offsetParent === null) continue;
        if ((allLi[i].textContent || '').indexOf(textFragment) !== -1) return cb(allLi[i]);
      }
      if (Date.now() - start > timeout) return cb(null);
      requestAnimationFrame(check);
    })();
  }

  function findVisibleModal(titleText) {
    if (C && C.findVisibleModal) return C.findVisibleModal(titleText);
    var titles = document.querySelectorAll('.ant-modal-title');
    for (var t = 0; t < titles.length; t++) {
      if ((titles[t].textContent || '').indexOf(titleText) !== -1) {
        var wrap = titles[t];
        while (wrap && !wrap.classList.contains('ant-modal-wrap')) { wrap = wrap.parentElement; }
        if (wrap && getComputedStyle(wrap).display !== 'none') return wrap;
      }
    }
    return null;
  }

  function focusSetBlur(input, val) {
    input.focus();
    setInputValue(input, val);
    input.blur();
  }

  // ========== 获取采集数据 ==========
  function fetchCollectedData(cb) {
    var serverUrl = localStorage.getItem(SERVER_KEY) || 'http://localhost:3000';

    console.log('%c[自动填表] 检测到 collectId=' + collectId + '，正在获取数据...', 'color:#E65100;font-weight:bold;font-size:14px');

    fetch(serverUrl + '/api/product/' + collectId)
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        window.__collectedProduct = data;
        console.log('%c[自动填表] 数据获取成功: ' + (data.title || '无标题'), 'color:#52c41a;font-weight:bold');
        console.log('%c[自动填表] 主图: ' + (data.main_images || []).length + '张, 描述图: ' + (data.desc_images || []).length + '张, SKU: ' + (data.skus || []).length + '个', 'color:#52c41a;font-weight:bold');
        cb(data);
      })
      .catch(function (err) {
        autoError('获取采集数据失败: ' + err.message);
      });
  }

  // ========== 组合轮播图：主图 + 已选SKU图片，最多10张 ==========
  function buildCarouselImages(data) {
    var images = [];
    var seen = {};
    var limit = 10;

    // 主图
    if (data.main_images) {
      for (var i = 0; i < data.main_images.length && images.length < limit; i++) {
        var url = data.main_images[i];
        if (url && !seen[url]) {
          images.push(url);
          seen[url] = true;
        }
      }
    }

    // 已选SKU图片
    if (data.skus) {
      var selected = data.skus.filter(function (s) { return s._selected !== false; });
      for (var j = 0; j < selected.length && images.length < limit; j++) {
        var skuImg = selected[j].image;
        if (skuImg && !seen[skuImg]) {
          images.push(skuImg);
          seen[skuImg] = true;
        }
      }
    }

    console.log('%c[自动填表] 轮播图: ' + images.length + '张 (主图' + (data.main_images || []).length + ' + SKU图' + (images.length - Math.min((data.main_images || []).length, limit)) + ')', 'color:#E65100;font-weight:bold');
    return images;
  }

  // ========== 自动填表主流程 ==========
  function startAutoFill(data) {
    // 计算总步骤
    autoTotal = 1; // 填标题
    if (data.source_url) autoTotal += 1; // 填来源URL
    // 自动选择类目（只要有可用的类目名就尝试）
    var catInfo = resolveCategory(data);
    if (catInfo) autoTotal += 1;
    if (data.main_images && data.main_images.length) autoTotal += 3; // 贴主图（打开菜单+网络图片+填入添加）
    autoTotal += 1; // 删除产品视频
    if (data.desc_images && data.desc_images.length) autoTotal += 1; // 描述图（仅存储到全局）
    if (data.skus && data.skus.length) autoTotal += 2; // SKU表格填充
    autoTotal += 1; // 外包装图片

    autoStep = 0;
    console.log('%c[自动填表] ===== 开始自动填表 =====', 'color:#E65100;font-weight:bold;font-size:14px');

    // Step 1: 填入标题
    fillTitle(data, function () {
      // Step 1.5: 填入来源URL
      if (data.source_url) {
        fillSourceUrl(data.source_url, function () {
          doCategorySelect(data);
        });
      } else {
        doCategorySelect(data);
      }
    });

    function doCategorySelect(data) {
      // Step 1.6: 自动选择类目
      var catInfo = resolveCategory(data);
      if (catInfo) {
        autoSelectCategory(catInfo, collectId, function () {
          doPasteMainImages(data);
        });
      } else {
        doPasteMainImages(data);
      }
    }

    function doPasteMainImages(data) {
      // Step 2: 贴主图（主图 + 已选SKU图片，最多10张）
      var allImages = buildCarouselImages(data);
      if (allImages.length) {
        pasteMainImages(allImages, function () {
          // Step 2.5: 删除产品视频
          deleteProductVideos(function () {
            // Step 3: 外包装图片
            updatePackageImage(data, function () {
              // Step 4: 描述图（存储到全局，供描述按钮使用）
              if (data.desc_images && data.desc_images.length) {
                autoLog('描述图已加载 (' + data.desc_images.length + '张)');
              }
              // Step 5: SKU 填充
              if (data.skus && data.skus.length) {
                fillSkuTable(data.skus, function () {
                  autoFinish('自动填表完成');
                });
              } else {
                autoFinish('自动填表完成（无SKU数据）');
              }
            });
          });
        });
      } else {
        autoFinish('自动填表完成（无主图数据）');
      }
    }
  }

  // ========== Step 2.5: 删除产品视频 ==========
  function deleteProductVideos(cb) {
    autoLog('检查产品视频...');
    var labels = document.querySelectorAll('#productProductInfo .ant-form-item-label label');
    var videoLabel = null;
    for (var vi = 0; vi < labels.length; vi++) {
      if ((labels[vi].textContent || '').indexOf('产品视频') !== -1) {
        videoLabel = labels[vi];
        break;
      }
    }

    if (!videoLabel) {
      console.log('%c[自动填表] 无产品视频区域，跳过', 'color:#E65100;font-weight:bold');
      cb();
      return;
    }

    var videoFormItem = videoLabel.closest('.ant-form-item');
    deleteNextVideo(videoFormItem, 0, cb);
  }

  function deleteNextVideo(formItem, count, cb) {
    var videoImgs = formItem.querySelectorAll('.video-operate-img');
    var visibleBox = null;
    for (var v = 0; v < videoImgs.length; v++) {
      if (videoImgs[v].offsetParent !== null && videoImgs[v].querySelector('.video-operate-img-box')) {
        visibleBox = videoImgs[v];
        break;
      }
    }

    if (!visibleBox) {
      if (count > 0) {
        console.log('%c[自动填表] 已删除 ' + count + ' 个产品视频', 'color:#E65100;font-weight:bold');
      } else {
        console.log('%c[自动填表] 无产品视频，跳过', 'color:#E65100;font-weight:bold');
      }
      cb();
      return;
    }

    var delLinks = visibleBox.querySelectorAll('.video-operate-box a.link');
    var delBtn = null;
    for (var d = 0; d < delLinks.length; d++) {
      if ((delLinks[d].textContent || '').indexOf('删除') !== -1) {
        delBtn = delLinks[d];
        break;
      }
    }

    if (!delBtn) {
      cb();
      return;
    }

    count++;
    delBtn.click();

    setTimeout(function () {
      var confirmBtn = document.querySelector('.ant-popconfirm-buttons .ant-btn-primary');
      if (confirmBtn) confirmBtn.click();
      setTimeout(function () { deleteNextVideo(formItem, count, cb); }, 200);
    }, 150);
  }

  // ========== Step 1.5: 填入来源URL ==========
  function fillSourceUrl(url, cb) {
    autoLog('填入来源URL...');
    waitForElement('#dxmInfo input[name="sourceUrl"]', 5000, function (input) {
      if (!input) { autoError('未找到来源URL输入框'); cb(); return; }

      input.focus();
      C.setInputValue(input, url);
      input.blur();
      autoLog('来源URL已填入');
      setTimeout(cb, 200);
    });
  }

  // ========== Step 1.6: 自动选择类目 ==========

  // 类目回退优先级：dxmCategory → customCategory → 1688原始类目
  function resolveCategory(data) {
    // 1. 优先用已保存的店小秘类目
    if (data.dxmCategory && data.dxmCategory.leafName) {
      return data.dxmCategory;
    }
    // 2. 用自定义类目
    if (data.customCategory) {
      return { path: data.customCategory, leafName: data.customCategory };
    }
    // 3. 用1688原始类目
    var cat = data.category;
    if (cat) {
      var name = cat.leafCategoryName || cat.categoryPath || '';
      if (name) {
        return { path: name, leafName: name.split('/').pop() || name };
      }
    }
    return null;
  }

  function autoSelectCategory(catInfo, cId, cb) {
    var leafName = catInfo.leafName;
    var path = catInfo.path || '';

    autoLog('选择类目: ' + leafName + '...');

    // 先检查当前类目是否已经正确
    var catList = document.querySelector('.category-list');
    if (catList && catList.textContent.trim()) {
      var currentPath = catList.textContent.trim().replace(/\s*>\s*/g, '/');
      if (currentPath === path || currentPath.indexOf(leafName) !== -1) {
        autoLog('类目已正确，跳过');
        cb();
        return;
      }
    }

    // 方法A: 尝试下拉快选
    tryQuickSelect(leafName, function (ok) {
      if (ok) {
        onCategorySet(catList, cId, function () { cb(); });
        return;
      }
      // 方法B: 弹窗搜索
      trySearchCategory(catInfo, function (ok2) {
        if (ok2) {
          onCategorySet(catList, cId, function () { cb(); });
          return;
        }
        autoLog('自动选择类目失败，请手动选择');
        cb();
      });
    });
  }

  // 类目设置成功后，读取实际值并回传服务器
  function onCategorySet(catListEl, cId, done) {
    setTimeout(function () {
      var el = document.querySelector('.category-list') || catListEl;
      if (!el || !cId) { if (done) done(); return; }
      var text = el.textContent.trim();
      if (!text) { if (done) done(); return; }
      var parts = text.split(/\s*>\s*/);
      var leafName = parts[parts.length - 1];
      console.log('%c[自动填表] 回传店小秘类目: collectId=' + cId + ', path=' + parts.join('/') + ', leafName=' + leafName, 'color:#AB47BC;font-weight:bold');
      fetch('http://localhost:3000/api/product/dxm-category', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          collectId: cId,
          dxmCategory: { path: parts.join('/'), leafName: leafName }
        })
      }).then(function () {
        console.log('%c[自动填表] 店小秘类目已回传: ' + parts.join('/'), 'color:#52c41a;font-weight:bold');
      }).catch(function () {}).finally(function () {
        if (done) done();
      });
    }, 1000);
  }

  // 方法A: 下拉快选
  function tryQuickSelect(leafName, cb) {
    var selector = document.querySelector('#productBasicInfo .category-item .ant-select-selector');
    if (!selector) { cb(false); return; }

    forceOpenAntSelect(selector);

    waitForElement('#productBasicInfo .category-item .ant-select-item-option[title="' + leafName + '"]', 2000, function (opt) {
      if (opt) {
        opt.click();
        cb(true);
      } else {
        // 关闭下拉
        selector.click();
        cb(false);
      }
    });
  }

  // 方法B: 弹窗搜索选择
  function trySearchCategory(catInfo, cb) {
    var leafName = catInfo.leafName;
    var path = catInfo.path || '';

    // 点击"选择分类"按钮
    var btn = document.querySelector('#productBasicInfo .category-item button.ant-btn-primary');
    if (!btn) { cb(false); return; }
    btn.click();

    // 等待弹窗
    waitForCategoryModal(function (modal) {
      if (!modal) { cb(false); return; }

      // 找到搜索输入框
      var searchInput = modal.querySelector('input[name="searchCategory"]');
      if (!searchInput) { cb(false); return; }

      // 输入叶子类目名搜索
      searchInput.focus();
      setInputValue(searchInput, leafName);

      // 点击搜索按钮
      var searchBtn = modal.querySelector('.ant-input-search-button');
      if (!searchBtn) { cb(false); return; }
      searchBtn.click();

      // 等待搜索结果
      var start = Date.now();
      (function checkResults() {
        var results = modal.querySelectorAll('.search-result-item');
        if (results.length > 0) {
          // 有结果，匹配
          var target = null;
          if (results.length === 1) {
            target = results[0];
          } else {
            // 多条结果，用路径匹配
            for (var i = 0; i < results.length; i++) {
              var resultPath = (results[i].textContent || '').replace(/\s+/g, '');
              if (resultPath.indexOf(path.replace(/\s+/g, '')) !== -1 || resultPath.indexOf(leafName) !== -1) {
                target = results[i];
                break;
              }
            }
            if (!target) target = results[0];
          }
          target.click();

          // 点击"选择"按钮确认
          setTimeout(function () {
            var confirmBtn = modal.querySelector('.ant-modal-footer .ant-btn-primary');
            if (confirmBtn) confirmBtn.click();
            cb(true);
          }, 300);
          return;
        }
        if (Date.now() - start > 3000) {
          // 搜索超时，关闭弹窗
          var closeBtn = modal.querySelector('.ant-modal-footer .ant-btn-default');
          if (closeBtn) closeBtn.click();
          else {
            var closeX = modal.querySelector('.ant-modal-close');
            if (closeX) closeX.click();
          }
          cb(false);
          return;
        }
        requestAnimationFrame(checkResults);
      })();
    });
  }

  function waitForCategoryModal(cb) {
    var start = Date.now();
    (function check() {
      var modal = findVisibleModal('选择类目');
      if (modal) { cb(modal); return; }
      if (Date.now() - start > 5000) { cb(null); return; }
      requestAnimationFrame(check);
    })();
  }

  function forceOpenAntSelect(selector) {
    var rect = selector.getBoundingClientRect();
    var cx = rect.left + rect.width / 2;
    var cy = rect.top + rect.height / 2;
    var opts = { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy };
    selector.dispatchEvent(new PointerEvent('pointerdown', opts));
    selector.dispatchEvent(new MouseEvent('mousedown', opts));
    selector.dispatchEvent(new PointerEvent('pointerup', opts));
    selector.dispatchEvent(new MouseEvent('mouseup', opts));
    selector.dispatchEvent(new MouseEvent('click', opts));
  }

  // ========== Step 1: 填入标题 ==========
  function fillTitle(data, cb) {
    if (!data.title) { cb(); return; }

    autoLog('填入标题...');
    waitForElement('#productProductInfo form .ant-form-item input', 5000, function (input) {
      if (!input) { autoError('未找到标题输入框'); cb(); return; }

      // 标题为空时才填入，有内容则覆盖
      if (!input.value.trim()) {
        setInputValue(input, data.title);
        autoLog('标题已填入');
      } else {
        setInputValue(input, data.title);
        autoLog('标题已更新');
      }
      setTimeout(cb, 200);
    });
  }

  // ========== Step 2: 贴主图 ==========
  function pasteMainImages(urls, cb) {
    // 先删除已有轮播图
    var existingImgs = document.querySelectorAll('#productProductInfo .mainImage .img-list .img-item a.icon_delete');
    if (existingImgs.length > 0) {
      autoLog('删除已有轮播图...');
      (function deleteNext() {
        var btn = document.querySelector('#productProductInfo .mainImage .img-list .img-item a.icon_delete');
        if (!btn) { setTimeout(function () { doPasteMainImages(urls, cb); }, 300); return; }
        btn.click();
        setTimeout(deleteNext, 50);
      })();
      return;
    }
    doPasteMainImages(urls, cb);
  }

  function doPasteMainImages(urls, cb) {
    autoLog('打开选择图片菜单...');

    var labels = document.querySelectorAll('#productProductInfo .ant-form-item-label label');
    var mainImageLabel = null;
    for (var i = 0; i < labels.length; i++) {
      if ((labels[i].textContent || '').indexOf('产品轮播图') !== -1) {
        mainImageLabel = labels[i];
        break;
      }
    }
    if (!mainImageLabel) { autoError('未找到产品轮播图'); cb(); return; }

    var formItem = mainImageLabel.closest('.ant-form-item');
    var selectBtn = null;
    var btns = formItem.querySelectorAll('.img-module .header button');
    for (var j = 0; j < btns.length; j++) {
      if ((btns[j].textContent || '').indexOf('选择图片') !== -1) {
        selectBtn = btns[j];
        break;
      }
    }
    if (!selectBtn) { autoError('未找到选择图片按钮'); cb(); return; }

    hoverElement(selectBtn);

    waitForVisibleLi('网络图片', 3000, function (webImgItem) {
      if (!webImgItem) { autoError('未找到网络图片选项'); cb(); return; }

      autoLog('点击网络图片');
      webImgItem.click();

      var start = Date.now();
      (function checkModal() {
        var modal = findVisibleModal('从网络地址');
        if (modal) {
          fillImageModal(modal, urls.join('\n'), cb);
          return;
        }
        if (Date.now() - start > 5000) { autoError('未找到网络图片弹窗'); cb(); return; }
        requestAnimationFrame(checkModal);
      })();
    });
  }

  function fillImageModal(modal, urlText, cb) {
    autoLog('填入图片地址');

    var textarea = modal.querySelector('textarea.ant-input');
    if (!textarea) { autoError('未找到图片输入框'); cb(); return; }

    setInputValue(textarea, urlText);

    setTimeout(function () {
      autoLog('添加图片');
      var addBtn = modal.querySelector('.ant-modal-footer .ant-btn-primary');
      if (!addBtn) { autoError('未找到添加按钮'); cb(); return; }
      addBtn.click();
      setTimeout(cb, 500);
    }, 250);
  }

  // ========== Step 3: 外包装图片 ==========
  function updatePackageImage(data, cb) {
    // 使用主图第一张作为外包装图片
    var imgUrl = (data.main_images && data.main_images.length) ? data.main_images[0] : null;
    if (!imgUrl) { autoLog('无主图，跳过外包装'); cb(); return; }

    autoLog('打开外包装选择图片...');

    // 先删除外包装旧图片
    var pkgImgs = document.querySelectorAll('#packageInfo .img-list .img-item a.icon_delete');
    if (pkgImgs.length > 0) {
      (function deleteNext() {
        var btn = document.querySelector('#packageInfo .img-list .img-item a.icon_delete');
        if (!btn) { openPkgSelect(imgUrl, cb); return; }
        btn.click();
        setTimeout(deleteNext, 50);
      })();
      return;
    }

    openPkgSelect(imgUrl, cb);
  }

  function openPkgSelect(imgUrl, cb) {
    var pkgBtn = document.querySelector('#packageInfo .header button');
    if (!pkgBtn || (pkgBtn.textContent || '').indexOf('选择图片') === -1) {
      autoLog('未找到外包装选择图片按钮，跳过');
      cb();
      return;
    }
    hoverElement(pkgBtn);

    waitForVisibleLi('网络图片', 3000, function (webImgItem) {
      if (!webImgItem) { autoLog('未找到外包装网络图片选项'); cb(); return; }

      webImgItem.click();

      var start = Date.now();
      (function checkModal() {
        var modal = findVisibleModal('从网络地址');
        if (modal) {
          fillPkgImageModal(modal, imgUrl, cb);
          return;
        }
        if (Date.now() - start > 5000) { autoLog('外包装图片弹窗超时'); cb(); return; }
        requestAnimationFrame(checkModal);
      })();
    });
  }

  function fillPkgImageModal(modal, imgUrl, cb) {
    autoLog('填入外包装图片地址');

    var textarea = modal.querySelector('textarea.ant-input');
    if (!textarea) { cb(); return; }

    setInputValue(textarea, imgUrl);

    setTimeout(function () {
      var addBtn = modal.querySelector('.ant-modal-footer .ant-btn-primary');
      if (addBtn) addBtn.click();
      autoLog('外包装图片已更新');
      setTimeout(cb, 300);
    }, 250);
  }

  // ========== Step 5: SKU 填充（智能复用已有属性 + 动态添加） ==========
  function fillSkuTable(skus, cb) {
    // 筛选已勾选的 SKU
    var selectedSkus = skus.filter(function (s) { return s._selected !== false; });
    if (!selectedSkus.length) { autoLog('无已选SKU，跳过'); cb(); return; }

    // 提取自定义名称作为变种属性值，并清洗
    var attrValues = [];
    var changeLogs = [];
    selectedSkus.forEach(function (s) {
      var name = s.customName || s.name || s.sku || '';
      if (name) {
        var result = sanitizeAttrValue(name);
        if (result.changed || result.value !== name) {
          changeLogs.push('"' + name + '" → "' + result.value + '" (' + result.reasons.join(', ') + ')');
        }
        attrValues.push(result.value);
      }
    });

    // 有清洗变更时提醒
    if (changeLogs.length > 0) {
      console.log('%c[自动填表] ⚠️ 属性值被自动修改:\n' + changeLogs.join('\n'), 'color:#FF9800;font-weight:bold');
      C.showBubble('⚠️ ' + changeLogs.length + '个属性值被自动过滤，请检查', 'warn');
    }

    autoLog('检查已有变种属性...');
    setTimeout(function () {
      smartFillAttrs(attrValues, function () {
        // 等待表格重新渲染后填充数据
        setTimeout(function () {
          fillSkuTableRows(selectedSkus, cb);
        }, 500);
      });
    }, changeLogs.length > 0 ? 3000 : 300);
  }

  // 智能复用已有属性：编辑现有 → 补充添加 → 取消多余
  function smartFillAttrs(targetValues, cb) {
    var form = document.querySelector('#skuAttrsInfo form');
    if (!form) { cb(); return; }

    // 获取所有现有属性标签
    var allLabels = form.querySelectorAll('.options-module label.d-checkbox');
    var existingCount = allLabels.length;
    var targetCount = targetValues.length;

    autoLog('已有属性 ' + existingCount + ' 个，需 ' + targetCount + ' 个');

    if (existingCount === 0) {
      // 无已有属性，直接添加
      if (targetCount > 0) {
        autoLog('添加 ' + targetCount + ' 个变种属性...');
        doAddAttrValues(targetValues, function () { cb(); });
      } else {
        cb();
      }
      return;
    }

    // 先取消所有勾选
    uncheckAllAttrs(function () {
      // 复用已有属性：编辑前 N 个（N = min(已有, 需求)）
      var reuseCount = Math.min(existingCount, targetCount);
      var reuseValues = targetValues.slice(0, reuseCount);

      autoLog('复用 ' + reuseCount + ' 个已有属性...');
      renameAndCheckAttrs(allLabels, reuseValues, 0, function () {

        if (existingCount >= targetCount) {
          // 已有 >= 需要：取消多余的勾选（已经全部取消过了，只重新勾了 reuseCount 个）
          autoLog('已复用 ' + reuseCount + ' 个属性，跳过 ' + (existingCount - targetCount) + ' 个多余属性');
          cb();
        } else {
          // 已有 < 需要：添加剩余属性
          var remainValues = targetValues.slice(reuseCount);
          autoLog('添加 ' + remainValues.length + ' 个剩余属性...');
          doAddAttrValues(remainValues, function () { cb(); });
        }
      });
    });
  }

  // 逐个编辑已有属性值并勾选
  function renameAndCheckAttrs(labels, values, idx, cb) {
    if (idx >= values.length) { cb(); return; }

    var label = labels[idx];
    var targetText = values[idx];

    // 读取当前文本
    var textEl = label.querySelector('.theme-value-text');
    var currentText = textEl ? (textEl.getAttribute('title') || textEl.textContent || '') : '';

    function afterEdit() {
      // 勾选此属性
      var checkbox = label.querySelector('input[type="checkbox"]');
      if (checkbox && !checkbox.checked) checkbox.click();
      setTimeout(function () {
        renameAndCheckAttrs(labels, values, idx + 1, cb);
      }, 80);
    }

    if (currentText === targetText) {
      // 文本一致，只需勾选
      afterEdit();
    } else {
      // 需要编辑文本：点击编辑按钮 → 修改输入框 → 保存
      var editBtn = label.querySelector('.btn-edit');
      if (!editBtn) { afterEdit(); return; }

      editBtn.click();
      setTimeout(function () {
        var input = label.querySelector('.edit-inp');
        if (!input) { afterEdit(); return; }

        C.setInputValue(input, targetText);

        setTimeout(function () {
          var saveBtn = label.querySelector('.btn-save');
          if (saveBtn) saveBtn.click();
          console.log('%c[自动填表] 属性编辑: "' + currentText + '" → "' + targetText + '"', 'color:#E65100;font-weight:bold');
          setTimeout(afterEdit, 65);
        }, 65);
      }, 65);
    }
  }

  // 取消所有变种属性勾选
  function uncheckAllAttrs(cb) {
    var form = document.querySelector('#skuAttrsInfo form');
    if (!form) { cb(); return; }

    var labels = form.querySelectorAll('.options-module label.d-checkbox');
    var toUncheck = [];
    for (var i = 0; i < labels.length; i++) {
      var checkbox = labels[i].querySelector('input[type="checkbox"]');
      if (checkbox && checkbox.checked) toUncheck.push(checkbox);
    }

    if (!toUncheck.length) { cb(); return; }

    autoLog('取消 ' + toUncheck.length + ' 个现有属性勾选');
    var idx = 0;
    (function next() {
      if (idx >= toUncheck.length) { setTimeout(cb, 200); return; }
      toUncheck[idx].click();
      idx++;
      setTimeout(next, 50);
    })();
  }

  // 清洗变种属性值：去特殊符号，返回 { value, changed, reason }
  function sanitizeAttrValue(raw) {
    var val = raw;
    var reasons = [];

    // 去除常见特殊符号（保留中文、英文、数字、空格、括号、横杠、斜杠、小数点）
    var cleaned = val.replace(/[^一-龥a-zA-Z0-9\s()（）\-\/\\.·]/g, '');
    if (cleaned !== val) {
      reasons.push('已过滤特殊符号');
      val = cleaned;
    }

    // 去除首尾空白
    val = val.trim();

    return { value: val, changed: reasons.length > 0, reasons: reasons };
  }

  // 动态添加新的变种属性值（通过输入框添加）
  function doAddAttrValues(values, cb) {
    if (!values.length) { cb(); return; }

    var addBox = document.querySelector('#skuAttrsInfo form .theme-value-add');
    if (!addBox) { cb(); return; }

    var input = addBox.querySelector('input[type="text"]');
    var addBtn = addBox.querySelector('button');
    if (!input || !addBtn) { cb(); return; }

    var idx = 0;
    (function next() {
      if (idx >= values.length) {
        autoLog('已添加 ' + values.length + ' 个变种属性');
        setTimeout(cb, 300);
        return;
      }

      var val = values[idx];
      idx++;

      input.focus();
      C.setInputValue(input, val);

      setTimeout(function () {
        var btn = addBox.querySelector('button');
        if (btn && !btn.disabled) btn.click();
        setTimeout(next, 100);
      }, 80);
    })();
  }

  // 填充 SKU 表格行数据
  function fillSkuTableRows(selectedSkus, cb) {
    autoLog('定位SKU表格...');

    var table = document.querySelector('#skuDataInfo table');
    if (!table) { autoError('未找到SKU表格'); cb(); return; }

    var rows = table.querySelectorAll('tbody tr');
    if (!rows.length) { autoError('SKU表格无数据行'); cb(); return; }

    var total = Math.min(rows.length, selectedSkus.length);
    var idx = 0;

    function processNext() {
      if (idx >= total) {
        autoLog('SKU表格已填充 ' + total + ' 行');
        cb();
        return;
      }

      idx++;
      autoLog('填充SKU第 ' + idx + '/' + total + ' 行...');

      var tr = rows[idx - 1];
      var sku = selectedSkus[idx - 1];

      fillSkuRow(tr, sku, function () {
        setTimeout(processNext, 150);
      });
    }

    processNext();
  }

  function fillSkuRow(tr, skuData, cb) {
    // 1. 预览图
    if (skuData.image) {
      fillSkuImage(tr, skuData.image, function () {
        fillSkuFields(tr, skuData);
        setTimeout(cb, 200);
      });
      return;
    }

    fillSkuFields(tr, skuData);
    setTimeout(cb, 100);
  }

  function fillSkuImage(tr, imgUrl, cb) {
    var hasImage = !!tr.querySelector('.sku-image-box');
    var triggerEl = hasImage
      ? tr.querySelector('.sku-image-box')
      : tr.querySelector('td.min-w-70 .img-box');
    if (!triggerEl) { cb(); return; }

    triggerEl.scrollIntoView({ behavior: 'instant', block: 'center' });

    setTimeout(function () {
      hoverElement(triggerEl);

      var start = Date.now();
      (function checkDropdown() {
        var netItem = null;
        var dropdowns = document.querySelectorAll('.ant-dropdown');
        for (var d = 0; d < dropdowns.length; d++) {
          var style = getComputedStyle(dropdowns[d]);
          if (style.display === 'none') continue;
          var item = dropdowns[d].querySelector('li[data-menu-id="net"]');
          if (item) { netItem = item; break; }
        }

        if (netItem) {
          netItem.click();

          var modalStart = Date.now();
          (function checkModal() {
            var modal = findVisibleModal('从网络地址');
            if (modal) {
              var textarea = modal.querySelector('textarea.ant-input');
              if (textarea) setInputValue(textarea, imgUrl);
              setTimeout(function () {
                var addBtn = modal.querySelector('.ant-modal-footer .ant-btn-primary');
                if (addBtn) addBtn.click();
                setTimeout(cb, 300);
              }, 200);
              return;
            }
            if (Date.now() - modalStart > 5000) { cb(); return; }
            requestAnimationFrame(checkModal);
          })();
          return;
        }

        if (Date.now() - start > 3000) { cb(); return; }
        requestAnimationFrame(checkDropdown);
      })();
    }, 300);
  }

  function fillSkuFields(tr, skuData) {
    // SKU货号
    if (skuData.customName || skuData.name || skuData.sku) {
      var skuInput = tr.querySelector('input[name="variationSku"]');
      var skuVal = skuData.customName || skuData.name || skuData.sku || '';
      if (skuInput && !skuInput.value.trim()) focusSetBlur(skuInput, skuVal);
    }

    // 申报价格
    if (skuData.price) {
      var priceInput = tr.querySelector('input[name="price"]');
      if (priceInput && !priceInput.value.trim()) focusSetBlur(priceInput, String(skuData.price));
    }

    // 尺寸
    if (skuData.dimensions && skuData.dimensions.length === 3) {
      var sorted = skuData.dimensions.slice().sort(function (a, b) { return b - a; });
      var lenInput = tr.querySelector('input[name="skuLength"]');
      var widInput = tr.querySelector('input[name="skuWidth"]');
      var heiInput = tr.querySelector('input[name="skuHeight"]');
      if (lenInput && !lenInput.value.trim()) focusSetBlur(lenInput, String(sorted[0]));
      if (widInput && !widInput.value.trim()) focusSetBlur(widInput, String(sorted[1]));
      if (heiInput && !heiInput.value.trim()) focusSetBlur(heiInput, String(sorted[2]));
    }

    // 重量
    if (skuData.weight) {
      var weightInput = tr.querySelector('input[name="weight"]');
      if (weightInput && !weightInput.value.trim()) focusSetBlur(weightInput, String(skuData.weight));
    }
  }

  // ========== 启动 ==========
  // 等待页面加载完成后开始
  waitForElement('#productProductInfo', 10000, function (el) {
    if (!el) {
      console.log('%c[自动填表] 页面未就绪，放弃自动填表', 'color:#ff4444;font-weight:bold');
      return;
    }

    fetchCollectedData(function (data) {
      if (!data) return;
      // 延迟一秒确保页面完全渲染
      setTimeout(function () {
        startAutoFill(data);
      }, 1000);
    });
  });

})();
