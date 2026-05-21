/**
 * dxm-auto-clean.js — 自动检测并清理图片中的中文文字
 * 嵌入到店小秘编辑页，在贴图前自动处理
 * 
 * 流程：贴图/引用采集图片 → 批量检测中文 → 自动消除 → 替换URL
 */
(function () {
  if (window.__dxmAutoClean) return;
  window.__dxmAutoClean = true;

  var Config = window.BeeConfig;
  var SERVER_URL_KEY = '1688_server_url';
  var AUTO_CLEAN_KEY = '__dxm_bee_auto_clean';

  function getServerUrl() {
    return localStorage.getItem(SERVER_URL_KEY) || 'http://localhost:3000';
  }

  function isAutoCleanEnabled() {
    return localStorage.getItem(AUTO_CLEAN_KEY) === 'true';
  }

  function setAutoCleanEnabled(val) {
    localStorage.setItem(AUTO_CLEAN_KEY, val ? 'true' : 'false');
  }

  // ========== 检测单张图片中的中文 ==========
  function detectChineseInImage(imageUrl) {
    return fetch(getServerUrl() + '/api/ai/detect-text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_url: imageUrl,
        chinese_only: true,
        min_confidence: 0.5
      })
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  // ========== 自动清理单张图片 ==========
  function cleanChineseInImage(imageUrl) {
    return fetch(getServerUrl() + '/api/ai/auto-clean-chinese', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_url: imageUrl })
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  // ========== 批量清理多张图片 ==========
  function batchCleanChinese(imageUrls) {
    var images = imageUrls.map(function (url) {
      return { url: url };
    });

    return fetch(getServerUrl() + '/api/ai/batch-clean-chinese', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ images: images })
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  // ========== 检查OCR服务状态 ==========
  function checkOcrStatus() {
    return fetch(getServerUrl() + '/api/ai/ocr-status')
      .then(function (r) { return r.json(); })
      .catch(function () { return { ocr: { status: 'offline' }, lama: { available: false } }; });
  }

  // ========== 智能贴图：检测中文 → 清理 → 贴入 ==========
  function smartPasteImages(urls, callback) {
    if (!isAutoCleanEnabled()) {
      // 未开启自动清理，直接贴原图
      callback(urls);
      return;
    }

    if (Config && Config.showBubble) {
      Config.showBubble('🔍 检测图片中文...', 'loading');
    }

    // 先检查OCR服务状态
    checkOcrStatus().then(function (status) {
      var ocrReady = status.ocr && status.ocr.status === 'ok';
      var lamaReady = status.lama && status.lama.available;

      if (!ocrReady) {
        console.log('%c[自动去中文] OCR服务未就绪，跳过', 'color:#FF9800;font-weight:bold');
        if (Config && Config.showBubble) {
          Config.showBubble('⚠️ OCR服务未启动，跳过去中文', 'warn');
          setTimeout(Config.hideBubble, 2000);
        }
        callback(urls);
        return;
      }

      if (!lamaReady) {
        console.log('%c[自动去中文] LaMa模型未就绪，仅检测不清理', 'color:#FF9800;font-weight:bold');
      }

      // 批量清理
      console.log('%c[自动去中文] 开始处理 ' + urls.length + ' 张图片', 'color:#E65100;font-weight:bold');

      batchCleanChinese(urls).then(function (result) {
        if (!result.ok) {
          console.log('%c[自动去中文] 批量清理失败，使用原图', 'color:#ff4444;font-weight:bold');
          callback(urls);
          return;
        }

        // 替换被清理的图片URL
        var cleanedUrls = [];
        var cleanCount = 0;
        for (var i = 0; i < result.results.length; i++) {
          var r = result.results[i];
          if (r.ok && r.cleaned && r.url) {
            var fullUrl = getServerUrl() + r.url;
            cleanedUrls.push(fullUrl);
            cleanCount++;
          } else {
            cleanedUrls.push(urls[i]);
          }
        }

        var msg = '✅ 处理完成：' + cleanCount + '/' + urls.length + ' 张图片已去中文';
        console.log('%c[自动去中文] ' + msg, 'color:#52c41a;font-weight:bold');

        if (Config && Config.showBubble) {
          Config.showBubble(msg, 'ok');
          setTimeout(Config.hideBubble, 3000);
        }

        callback(cleanedUrls);
      }).catch(function (err) {
        console.log('%c[自动去中文] 处理失败: ' + err.message, 'color:#ff4444;font-weight:bold');
        if (Config && Config.showBubble) {
          Config.showBubble('❌ 去中文失败: ' + err.message, 'err');
          setTimeout(Config.hideBubble, 3000);
        }
        callback(urls);
      });
    });
  }

  // ========== 导出 ==========
  window.DxmAutoClean = {
    detectChineseInImage: detectChineseInImage,
    cleanChineseInImage: cleanChineseInImage,
    batchCleanChinese: batchCleanChinese,
    smartPasteImages: smartPasteImages,
    checkOcrStatus: checkOcrStatus,
    isAutoCleanEnabled: isAutoCleanEnabled,
    setAutoCleanEnabled: setAutoCleanEnabled
  };
})();
