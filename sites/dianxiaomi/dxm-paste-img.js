(function () {
  if (window.__dxmPasteImg) return;
  window.__dxmPasteImg = true;

  var C = window.BeeConfig;
  var pasteEl = document.getElementById('__dxm_bee_paste');
  if (!pasteEl) return;

  pasteEl.addEventListener('click', function () {
    doPasteImg();
  });

  // ========== Helper: find visible li ==========
  function findVisibleLi(textFragment) {
    var allLi = document.querySelectorAll('li');
    for (var i = 0; i < allLi.length; i++) {
      if (allLi[i].offsetParent === null) continue;
      if ((allLi[i].textContent || '').indexOf(textFragment) !== -1) return allLi[i];
    }
    return null;
  }

  // ========== Helper: poll for visible li ==========
  function waitForVisibleLi(textFragment, timeout, cb) {
    var start = Date.now();
    (function check() {
      var el = findVisibleLi(textFragment);
      if (el) return cb(el);
      if (Date.now() - start > timeout) return cb(null);
      requestAnimationFrame(check);
    })();
  }

  // ========== Step log ==========
  var pasteStep = 0;
  var pasteTotal = 4;
  function pasteLog(msg) {
    pasteStep++;
    var tag = '[小蜜蜂-粘] ' + pasteStep + '/' + pasteTotal + ' ' + msg;
    console.log('%c' + tag, 'color:#AB47BC;font-weight:bold');
    C.showBubble(pasteStep + '/' + pasteTotal + ' ' + msg, 'loading');
  }

  // ========== Main flow ==========
  function doPasteImg() {
    pasteStep = 0;
    console.log('%c[小蜜蜂-粘] 一键粘贴图片URL 开始', 'color:#AB47BC;font-weight:bold;font-size:14px');

    // Step 1: 读取剪贴板
    pasteLog('读取剪贴板...');
    navigator.clipboard.readText().then(function (clipText) {
      if (!clipText || !clipText.trim()) {
        C.showBubble('❌ 剪贴板为空', 'err');
        setTimeout(C.hideBubble, 2000);
        return;
      }
      console.log('%c[小蜜蜂-粘] 剪贴板内容: ' + clipText.substring(0, 100), 'color:#AB47BC;font-weight:bold');

      // Step 2: 打开选择图片下拉菜单
      pasteLog('打开选择图片菜单');

      var labels = document.querySelectorAll('#productProductInfo .ant-form-item-label label'); // #productProductInfo: 产品信息区域; 通过 label 文字定位"产品轮播图"表单项
      var mainImageLabel = null;
      for (var i = 0; i < labels.length; i++) {
        if ((labels[i].textContent || '').indexOf('产品轮播图') !== -1) {
          mainImageLabel = labels[i];
          break;
        }
      }
      if (!mainImageLabel) {
        C.showBubble('❌ 未找到产品轮播图', 'err');
        setTimeout(C.hideBubble, 2000);
        return;
      }

      var formItem = mainImageLabel.closest('.ant-form-item'); // 产品轮播图所在的 .ant-form-item 行
      var selectBtn = null;
      var btns = formItem.querySelectorAll('.img-module .header button'); // .img-module .header button: 产品轮播图模块中的"选择图片"下拉按钮
      for (var j = 0; j < btns.length; j++) {
        if ((btns[j].textContent || '').indexOf('选择图片') !== -1) {
          selectBtn = btns[j];
          break;
        }
      }
      if (!selectBtn) {
        C.showBubble('❌ 未找到选择图片按钮', 'err');
        setTimeout(C.hideBubble, 2000);
        return;
      }

      C.hoverElement(selectBtn);

      waitForVisibleLi('网络图片', 3000, function (webImgItem) { // 选择图片下拉菜单中的"网络图片"菜单项
        if (!webImgItem) {
          C.showBubble('❌ 未找到网络图片选项', 'err');
          setTimeout(C.hideBubble, 2000);
          return;
        }

        // Step 3: 点击网络图片，等待弹窗
        pasteLog('点击网络图片');
        webImgItem.click();

        var start = Date.now();
        (function checkModal() {
          var modal = C.findVisibleModal('从网络地址'); // 通过标题文字+可见性双重判断定位"从网络地址(URL)选择图片"弹窗
          if (modal) {
            onModalReady(modal, clipText);
            return;
          }
          if (Date.now() - start > 5000) {
            C.showBubble('❌ 未找到网络图片弹窗', 'err');
            setTimeout(C.hideBubble, 2000);
            return;
          }
          requestAnimationFrame(checkModal);
        })();
      });
    }).catch(function (err) {
      console.log('%c[小蜜蜂-粘] ❌ 剪贴板读取失败: ' + err, 'color:#ff4444;font-weight:bold');
      C.showBubble('❌ 无法读取剪贴板', 'err');
      setTimeout(C.hideBubble, 2000);
    });
  }

  // ========== Modal ready: fill textarea + click add ==========
  function onModalReady(modal, clipText) {
    pasteLog('填入图片地址');

    var textarea = modal.querySelector('textarea.ant-input'); // 网络图片弹窗中的图片 URL 输入框
    if (!textarea) {
      C.showBubble('❌ 未找到输入框', 'err');
      setTimeout(C.hideBubble, 2000);
      return;
    }

    C.setInputValue(textarea, clipText);

    setTimeout(function () {
      pasteLog('添加图片');
      var addBtn = modal.querySelector('.ant-modal-footer .ant-btn-primary'); // 网络图片弹窗底部的"添加"按钮
      if (!addBtn) {
        C.showBubble('❌ 未找到添加按钮', 'err');
        setTimeout(C.hideBubble, 2000);
        return;
      }
      addBtn.click();
      console.log('%c[小蜜蜂-粘] ✅ 图片已添加', 'color:#AB47BC;font-weight:bold;font-size:14px');
      C.showBubble('✅ 图片已添加', 'ok');
      setTimeout(C.hideBubble, 2000);
    }, 250);
  }
})();
