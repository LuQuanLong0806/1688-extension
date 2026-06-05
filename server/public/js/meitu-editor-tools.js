/**
 * meitu-editor-tools.js — 编辑器内集成去中文 + 尺寸标注
 * 在图片编辑弹窗的左侧新增两个折叠面板
 */
function initMeituEditorTools() {
  if (initMeituEditorTools._init) return;
  initMeituEditorTools._init = true;

  var serverBase = '';
  function getServerBase() {
    if (serverBase) return serverBase;
    return '';
  }

  // Toast — 复用编辑器的 toast
  function showToast(msg, type) {
    var el = document.getElementById('toast');
    if (!el) return;
    var t = setTimeout(function () { el.classList.remove('show'); }, 2500);
    el.textContent = msg;
    el.className = 'toast ' + (type || 'ok') + ' show';
  }

  // ========== State ==========
  var cleanerSlots = []; // 每张图对应的 slot 信息
  var annotatedSizes = []; // OCR 检测到的尺寸组
  var cleanerProcessing = false;
  var annotateProcessing = false;

  // ========== Editor refs — 延迟获取（Vue template 渲染后才存在）==========
  var editorModal = null;
  var editorImgCanvas = null;
  var editorProcessing = null;
  var editorProcessText = null;

  function ensureEditorRefs() {
    if (editorImgCanvas) return;
    editorModal = document.getElementById('editorModal');
    editorImgCanvas = document.getElementById('editorImgCanvas');
    editorProcessing = document.getElementById('editorProcessing');
    editorProcessText = document.getElementById('editorProcessText');
  }

  // ========== 去中文功能 ==========
  async function editorCleanCurrentImage() {
    ensureEditorRefs();
    if (!window.editorImages || !window.editorImages.length) { showToast('没有图片', 'err'); return; }
    if (cleanerProcessing) return;

    var imgData = window.editorImages[window.editorCurrentIdx];
    if (!imgData) return;

    cleanerProcessing = true;
    showEditorLoading('OCR 检测中...');

    try {
      // 获取当前图片 base64
      var imgBase64 = window.editorSrc || imgData.src;
      if (imgBase64.indexOf('data:') !== 0) {
        // URL → 通过代理获取
        var proxyUrl = getServerBase() + '/api/proxy-image?url=' + encodeURIComponent(imgBase64);
        var res = await fetch(proxyUrl);
        var blob = await res.blob();
        var reader = new FileReader();
        imgBase64 = await new Promise(function (resolve) {
          reader.onload = function () { resolve(reader.result); };
          reader.readAsDataURL(blob);
        });
      }

      // 调用批量去中文 API（自动 OCR + 修复）
      showEditorLoading('AI 去中文处理中...');
      var payload;
      if (imgBase64.indexOf('data:') === 0) {
        payload = { images: [{ base64: imgBase64 }], skip_upload: true };
      } else {
        payload = { images: [{ url: imgBase64 }], skip_upload: true };
      }
      var cleanRes = await fetch(getServerBase() + '/api/ai/batch-clean', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      var cleanData = await cleanRes.json();

      if (cleanData.results && cleanData.results[0] && cleanData.results[0].cleaned && cleanData.results[0].url) {
        // 将清理后的图片应用到编辑器画布
        var cleanedSrc = cleanData.results[0].url;
        if (cleanedSrc.indexOf('http') === 0) {
          cleanedSrc = getServerBase() + cleanedSrc;
        }
        window.editorSrc = cleanedSrc;
        window.editorImages[window.editorCurrentIdx].src = cleanedSrc;
        var img = new Image();
        img.onload = function () {
          var ctx = editorImgCanvas.getContext('2d');
          ctx.clearRect(0, 0, editorImgCanvas.width, editorImgCanvas.height);
          ctx.drawImage(img, 0, 0, editorImgCanvas.width, editorImgCanvas.height);
          updateEditorModifiedDot();
          hideEditorLoading();
          showToast('去中文完成', 'ok');
        };
        img.src = cleanedSrc;
      } else {
        hideEditorLoading();
        showToast('未检测到中文文字或处理失败', 'err');
      }
    } catch (e) {
      hideEditorLoading();
      showToast('去中文失败: ' + e.message, 'err');
    }
    cleanerProcessing = false;
  }

  async function editorBatchCleanAll() {
    ensureEditorRefs();
    if (!window.editorImages || !window.editorImages.length) { showToast('没有图片', 'err'); return; }
    if (cleanerProcessing) return;
    cleanerProcessing = true;

    showEditorLoading('批量去中文...');

    try {
      var images = [];
      for (var i = 0; i < window.editorImages.length; i++) {
        var imgData = window.editorImages[i];
        var src = imgData.src;
        if (src.indexOf('data:') !== 0) {
          // 需要代理获取
          var proxyUrl = getServerBase() + '/api/proxy-image?url=' + encodeURIComponent(src);
          var res = await fetch(proxyUrl);
          var blob = await res.blob();
          var reader = new FileReader();
          src = await new Promise(function (resolve) {
            reader.onload = function () { resolve(reader.result); };
            reader.readAsDataURL(blob);
          });
        }
        images.push(src.indexOf('data:') === 0 ? { base64: src } : { url: src });
      }

      editorProcessText.textContent = '批量处理 ' + images.length + ' 张图片...';
      var cleanRes = await fetch(getServerBase() + '/api/ai/batch-clean', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images: images, skip_upload: true })
      });
      var cleanData = await cleanRes.json();

      var count = 0;
      if (cleanData.results) {
        cleanData.results.forEach(function (r, i) {
          if (r && r.cleaned && r.url) {
            var cleanedSrc = r.url;
            if (cleanedSrc.indexOf('http') === 0) cleanedSrc = getServerBase() + cleanedSrc;
            window.editorImages[i].src = cleanedSrc;
            count++;
          }
        });
        // 刷新当前显示
        window.editorSrc = window.editorImages[window.editorCurrentIdx].src;
        var img = new Image();
        img.onload = function () {
          var ctx = editorImgCanvas.getContext('2d');
          ctx.clearRect(0, 0, editorImgCanvas.width, editorImgCanvas.height);
          ctx.drawImage(img, 0, 0, editorImgCanvas.width, editorImgCanvas.height);
          updateEditorModifiedDot();
          if (typeof buildEditorImageList === 'function') buildEditorImageList();
          hideEditorLoading();
          showToast('已处理 ' + count + ' / ' + images.length + ' 张', count > 0 ? 'ok' : 'err');
        };
        img.src = window.editorSrc;
      } else {
        hideEditorLoading();
        showToast('批量处理失败', 'err');
      }
    } catch (e) {
      hideEditorLoading();
      showToast('批量去中文失败: ' + e.message, 'err');
    }
    cleanerProcessing = false;
  }

  // ========== 替换回商品（编辑器版本）==========
  async function editorReplaceToProduct() {
    ensureEditorRefs();
    if (!window.editorImages || !window.editorImages.length) { showToast('没有图片', 'err'); return; }

    // 找出已修改且有 slot 信息的图片
    var items = [];
    window.editorImages.forEach(function (imgData, i) {
      if (imgData.src !== imgData.originalSrc && cleanerSlots[i]) {
        items.push({ idx: i, slot: cleanerSlots[i], src: imgData.src });
      }
    });

    if (!items.length) { showToast('没有已修改且有位置信息的图片', 'err'); return; }

    showEditorLoading('上传中...');

    var results = [];
    var uploaded = 0;

    for (var k = 0; k < items.length; k++) {
      var item = items[k];
      try {
        var b64 = item.src;
        if (b64.indexOf('http') === 0) {
          // URL → 需要先下载再上传
          var proxyUrl = getServerBase() + '/api/proxy-image?url=' + encodeURIComponent(b64);
          var res = await fetch(proxyUrl);
          var blob = await res.blob();
          var reader = new FileReader();
          b64 = await new Promise(function (resolve) {
            reader.onload = function () { resolve(reader.result); };
            reader.readAsDataURL(blob);
          });
        }
        var upRes = await fetch(getServerBase() + '/api/ai/smms-upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image_base64: b64 })
        });
        var upData = await upRes.json();
        if (upData.url) {
          results.push({ slot: item.slot, newUrl: upData.url });
        }
      } catch (e) {}
      uploaded++;
    }

    hideEditorLoading();

    if (!results.length) { showToast('全部上传失败', 'err'); return; }

    // 替换到 detailModal
    var app = document.querySelector('#app');
    if (!app || !app.__vue__) { showToast('Vue app not found', 'err'); return; }
    var detailModal = app.__vue__.$root.$refs.detailModal;
    if (!detailModal || !detailModal.editable) { showToast('请先打开商品详情', 'err'); return; }

    var replaced = 0;
    results.forEach(function (r) {
      if (!r.newUrl || !r.slot) return;
      var s = r.slot;
      if (s.field === 'main_images') {
        var imgs = detailModal.editable.main_images;
        if (imgs && s.index < imgs.length) {
          detailModal.$set(detailModal.editable.main_images, s.index, r.newUrl);
          replaced++;
        }
      } else if (s.field === 'detail_images') {
        var imgs = detailModal.editable.detail_images;
        if (imgs && s.index < imgs.length) {
          detailModal.$set(detailModal.editable.detail_images, s.index, r.newUrl);
          replaced++;
        }
      } else if (s.field === 'sku') {
        var skus = detailModal.editable.skus || [];
        for (var si = 0; si < skus.length; si++) {
          if (skus[si].image === s.url) {
            detailModal.$set(skus[si], 'image', r.newUrl);
            replaced++;
            break;
          }
        }
      }
    });

    if (replaced) {
      // 标记已替换
      results.forEach(function (r) {
        var imgData = window.editorImages.find(function (im) {
          return cleanerSlots[window.editorImages.indexOf(im)] === r.slot;
        });
        if (imgData) imgData.originalSrc = imgData.src; // 标记为已同步
      });
      if (typeof buildEditorImageList === 'function') buildEditorImageList();
      showToast('已替换 ' + replaced + ' 张，请保存商品', 'ok');
    } else {
      showToast('未找到替换位置', 'err');
    }
  }

  // ========== 尺寸标注功能 ==========
  async function editorDetectSizes() {
    ensureEditorRefs();
    if (!window.editorImages || !window.editorImages.length) { showToast('没有图片', 'err'); return; }
    if (annotateProcessing) return;
    annotateProcessing = true;

    showEditorLoading('批量 OCR 检测尺寸...');

    try {
      var allSizeGroups = [];
      for (var i = 0; i < window.editorImages.length; i++) {
        var imgData = window.editorImages[i];
        editorProcessText.textContent = 'OCR 检测 ' + (i + 1) + '/' + window.editorImages.length;

        var src = imgData.src;
        if (src.indexOf('data:') !== 0) {
          var proxyUrl = getServerBase() + '/api/proxy-image?url=' + encodeURIComponent(src);
          var res = await fetch(proxyUrl);
          var blob = await res.blob();
          var reader = new FileReader();
          src = await new Promise(function (resolve) {
            reader.onload = function () { resolve(reader.result); };
            reader.readAsDataURL(blob);
          });
        }

        try {
          var ocrRes = await fetch(getServerBase() + '/api/ai/detect-sizes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image_base64: src })
          });
          var ocrData = await ocrRes.json();
          if (ocrData.ok && ocrData.sizeGroups) {
            ocrData.sizeGroups.forEach(function (g) {
              g.imageId = i;
              allSizeGroups.push(g);
            });
          }
        } catch (e) {}
      }

      annotatedSizes = allSizeGroups;
      hideEditorLoading();

      if (allSizeGroups.length > 0) {
        fillSizeInputs(0);
        showToast('检测到 ' + allSizeGroups.length + ' 组尺寸', 'ok');
      } else {
        showToast('未检测到尺寸，请手动输入', 'err');
      }
    } catch (e) {
      hideEditorLoading();
      showToast('检测失败: ' + e.message, 'err');
    }
    annotateProcessing = false;
  }

  function fillSizeInputs(groupIdx) {
    var g = annotatedSizes[groupIdx];
    if (!g) return;
    var wInput = document.getElementById('edAnnWidth');
    var hInput = document.getElementById('edAnnHeight');
    if (wInput) wInput.value = g.width || '';
    if (hInput) hInput.value = g.height || '';

    // 高亮当前选中的尺寸组
    var items = document.querySelectorAll('.ed-sg-item');
    items.forEach(function (el, i) {
      el.classList.toggle('active', i === groupIdx);
    });

    // 如果有来源图片，跳转过去
    if (g.imageId !== undefined && typeof switchEditorImage === 'function') {
      switchEditorImage(g.imageId);
    }
  }

  async function editorAnnotateCurrent() {
    ensureEditorRefs();
    if (!window.editorImages || !window.editorImages.length) { showToast('没有图片', 'err'); return; }
    if (annotateProcessing) return;

    var wInput = document.getElementById('edAnnWidth');
    var hInput = document.getElementById('edAnnHeight');
    var widthCm = parseFloat(wInput ? wInput.value : '');
    var heightCm = hInput ? parseFloat(hInput.value) : null;

    if (!widthCm || widthCm <= 0) { showToast('请输入有效宽度', 'err'); return; }

    annotateProcessing = true;
    showEditorLoading('生成标注图...');

    try {
      var imgData = window.editorImages[window.editorCurrentIdx];
      var src = imgData.src;
      if (src.indexOf('data:') !== 0) {
        var proxyUrl = getServerBase() + '/api/proxy-image?url=' + encodeURIComponent(src);
        var res = await fetch(proxyUrl);
        var blob = await res.blob();
        var reader = new FileReader();
        src = await new Promise(function (resolve) {
          reader.onload = function () { resolve(reader.result); };
          reader.readAsDataURL(blob);
        });
      }

      var annRes = await fetch(getServerBase() + '/api/ai/annotate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_base64: src, width_cm: widthCm, height_cm: heightCm, unit: 'cm' })
      });
      var annData = await annRes.json();

      if (annData.ok) {
        var annotatedSrc = annData.base64;
        window.editorSrc = annotatedSrc;
        window.editorImages[window.editorCurrentIdx].src = annotatedSrc;
        var img = new Image();
        img.onload = function () {
          var ctx = editorImgCanvas.getContext('2d');
          ctx.clearRect(0, 0, editorImgCanvas.width, editorImgCanvas.height);
          ctx.drawImage(img, 0, 0, editorImgCanvas.width, editorImgCanvas.height);
          updateEditorModifiedDot();
          hideEditorLoading();
          showToast('标注完成', 'ok');
        };
        img.src = annotatedSrc;
      } else {
        hideEditorLoading();
        showToast('标注失败', 'err');
      }
    } catch (e) {
      hideEditorLoading();
      showToast('标注失败: ' + e.message, 'err');
    }
    annotateProcessing = false;
  }

  // ========== Helpers ==========
  function showEditorLoading(text) {
    ensureEditorRefs();
    if (editorProcessing) editorProcessing.classList.add('show');
    if (editorProcessText) editorProcessText.textContent = text || '处理中...';
  }

  function hideEditorLoading() {
    if (editorProcessing) editorProcessing.classList.remove('show');
  }

  function updateEditorModifiedDot() {
    if (typeof buildEditorImageList === 'function') {
      buildEditorImageList();
    }
  }

  function updateSizeGroupsUI() {
    var container = document.getElementById('edAnnGroups');
    if (!container) return;
    if (!annotatedSizes.length) {
      container.innerHTML = '<div style="font-size:11px;color:var(--text-muted)">暂无检测结果</div>';
      return;
    }
    var html = '';
    annotatedSizes.forEach(function (g, i) {
      var label = g.label || (g.width + '\u00d7' + (g.height || '?'));
      var srcIdx = (g.imageId !== undefined) ? (g.imageId + 1) : '?';
      html += '<div class="ed-sg-item' + (i === 0 ? ' active' : '') + '" data-idx="' + i + '">' +
        '<span>\u{1F4CF} ' + label + '</span>' +
        '<span style="font-size:10px;color:var(--text-muted)">图' + srcIdx + '</span>' +
        '</div>';
    });
    container.innerHTML = html;
    container.querySelectorAll('.ed-sg-item').forEach(function (el) {
      el.onclick = function () { fillSizeInputs(parseInt(el.dataset.idx)); };
    });
  }

  // ========== 从外部打开编辑器（带 slot）==========
  // 由 page-meitu.js 的 goToMeituCleaner/goToMeituAnnotate 调用
  window._meituEditorOpenWithSlots = function (urls, slots, mode) {
    // 设置 slots 映射
    cleanerSlots = [];
    if (slots) {
      urls.forEach(function (url, i) {
        cleanerSlots[i] = slots[i] || null;
      });
    }

    // 存储到 sessionStorage 供 openEditor 读取
    try {
      sessionStorage.setItem('__editor_pending_import', JSON.stringify(urls));
      if (slots) sessionStorage.setItem('__editor_import_slots', JSON.stringify(slots));
      sessionStorage.setItem('__editor_mode', mode || '');
    } catch (e) {}

    // 触发打开编辑器
    if (typeof openEditor === 'function') {
      openEditor(urls[0]);
    }
  };

  // 编辑器打开后的初始化钩子
  window._meituEditorPostOpen = function (mode) {
    bindEditorEvents();
    updateSizeGroupsUI();

    if (mode === 'cleaner') {
      // 展开去中文面板
      var sec = document.querySelector('.acc-section[data-mode="editor-clean"]');
      if (sec) sec.classList.add('open');

      // 如果有自动检测标记，自动开始批量处理
      try {
        if (sessionStorage.getItem('__meitu_auto_clean') === '1') {
          sessionStorage.removeItem('__meitu_auto_clean');
          editorBatchCleanAll();
        }
      } catch (e) {}
    } else if (mode === 'annotate') {
      // 展开标注面板
      var sec = document.querySelector('.acc-section[data-mode="editor-annotate"]');
      if (sec) sec.classList.add('open');

      // 自动检测尺寸
      try {
        if (sessionStorage.getItem('__meitu_annotate_auto_detect') === '1') {
          sessionStorage.removeItem('__meitu_annotate_auto_detect');
          editorDetectSizes();
        }
      } catch (e) {}
    }
  };

  // ========== 绑定事件（编辑器打开后调用）==========
  var _eventsBound = false;
  window._bindEditorEvents = function bindEditorEvents() {
    ensureEditorRefs();
    var btnCleanOne = document.getElementById('edBtnCleanOne');
    var btnCleanAll = document.getElementById('edBtnCleanAll');
    var btnReplace = document.getElementById('edBtnReplaceToProduct');
    var btnDetectSizes = document.getElementById('edBtnDetectSizes');
    var btnAnnotate = document.getElementById('edBtnAnnotate');
    var btnBatchAnnotate = document.getElementById('edBtnBatchAnnotate');
    if (!btnCleanOne && !btnDetectSizes) return; // 编辑器未渲染
    if (_eventsBound) return;
    _eventsBound = true;
    if (btnCleanOne) btnCleanOne.addEventListener('click', editorCleanCurrentImage);
    if (btnCleanAll) btnCleanAll.addEventListener('click', editorBatchCleanAll);
    if (btnReplace) btnReplace.addEventListener('click', editorReplaceToProduct);
    if (btnDetectSizes) btnDetectSizes.addEventListener('click', editorDetectSizes);
    if (btnAnnotate) btnAnnotate.addEventListener('click', editorAnnotateCurrent);
    if (btnBatchAnnotate) btnBatchAnnotate.addEventListener('click', function () {
      if (!annotatedSizes.length) { showToast('请先检测尺寸', 'err'); return; }
      showToast('请逐张选择尺寸后点击"标注"', 'err');
    });
    // 绑定完成后检查自动操作标记
    triggerAutoActions();
  }

  function triggerAutoActions() {
    // 自动批量去中文
    try {
      if (sessionStorage.getItem('__meitu_auto_clean') === '1') {
        sessionStorage.removeItem('__meitu_auto_clean');
        editorBatchCleanAll();
      }
    } catch (e) {}
    // 自动检测尺寸
    try {
      if (sessionStorage.getItem('__meitu_annotate_auto_detect') === '1') {
        sessionStorage.removeItem('__meitu_annotate_auto_detect');
        editorDetectSizes();
      }
    } catch (e) {}
  }
}

// Auto-init
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initMeituEditorTools);
} else {
  initMeituEditorTools();
}

// 监听编辑器弹窗打开，确保事件绑定
var _editorObserver = new MutationObserver(function () {
  var modal = document.getElementById('editorModal');
  if (modal && modal.classList.contains('show')) {
    // 每次 modal 打开时重置绑定标记，允许重新绑定
    _eventsBound = false;
    ensureEditorRefs();
    if (typeof window._bindEditorEvents === 'function') window._bindEditorEvents();
  }
});
(function observeEditor() {
  var modal = document.getElementById('editorModal');
  if (!modal) { setTimeout(observeEditor, 500); return; }
  _editorObserver.observe(modal, { attributes: true, attributeFilter: ['class'] });
})();
