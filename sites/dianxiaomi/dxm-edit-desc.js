(function () {
  if (window.__dxmEditDesc) return;
  window.__dxmEditDesc = true;

  var C = window.BeeConfig;
  var editEl = document.getElementById('__dxm_bee_edit');
  if (!editEl) return;

  editEl.addEventListener('click', function () {
    doEditDesc();
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

  // ========== Helper: hover with coords ==========
  function hoverWithCoords(el) {
    var rect = el.getBoundingClientRect();
    var cx = rect.left + rect.width / 2;
    var cy = rect.top + rect.height / 2;
    var pOpts = { bubbles: true, cancelable: true, clientX: cx, clientY: cy, pointerId: 1, pointerType: 'mouse', isPrimary: true };
    var mOpts = { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy };
    el.dispatchEvent(new PointerEvent('pointerover', pOpts));
    el.dispatchEvent(new PointerEvent('pointerenter', { bubbles: false, clientX: cx, clientY: cy, pointerId: 1, pointerType: 'mouse' }));
    el.dispatchEvent(new PointerEvent('pointermove', pOpts));
    el.dispatchEvent(new MouseEvent('mouseover', mOpts));
    el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false, clientX: cx, clientY: cy }));
    el.dispatchEvent(new MouseEvent('mousemove', mOpts));
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
  var editStep = 0;
  var editTotal = 13;
  function editLog(msg) {
    editStep++;
    var tag = '[小蜜蜂] ' + editStep + '/' + editTotal + ' ' + msg;
    console.log('%c' + tag, 'color:#43A047;font-weight:bold');
    C.showBubble(editStep + '/' + editTotal + ' ' + msg, 'loading');
  }

  // ========== Helper: check if editor has image/text content ==========
  function editorHasImage() {
    return document.querySelectorAll('.smt-new-editor .desc-img-box img').length > 0; // .desc-img-box img: 编辑器预览区中的描述图片
  }

  function editorHasText() {
    var els = document.querySelectorAll('.smt-new-editor .desc-content'); // .desc-content: 编辑器预览区中的描述文字内容
    for (var i = 0; i < els.length; i++) {
      if ((els[i].textContent || '').trim()) return true;
    }
    return false;
  }

  // ========== Helper: generic clear module flow ==========
  function clearModule(trigger, moduleName, callback) {
    editLog('展开批量操作菜单');
    C.hoverElement(trigger);

    waitForVisibleLi('清空描述', 3000, function (clearDescItem) { // 批量操作下拉中的“清空描述”菜单项(悬浮展开子菜单)
      if (!clearDescItem) {
        C.showBubble('❌ 未找到清空描述', 'err');
        setTimeout(C.hideBubble, 2000);
        return;
      }
      editLog('展开清空描述子菜单');
      hoverWithCoords(clearDescItem);

      setTimeout(function () {
        var item = findVisibleLi(moduleName);
        if (!item) {
          C.showBubble('❌ 未找到' + moduleName, 'err');
          setTimeout(C.hideBubble, 2000);
          return;
        }
        editLog(moduleName);
        item.click();
        C.unhoverElement(trigger);

        C.waitForElement('.ant-modal-confirm .ant-modal-confirm-btns .ant-btn-primary', 3000, function (confirmBtn) { // 清空确认弹窗中的“确定”按钮
          if (!confirmBtn) {
            C.showBubble('❌ 未找到确定按钮', 'err');
            setTimeout(C.hideBubble, 2000);
            return;
          }
          editLog('确认清空');
          confirmBtn.click();
          setTimeout(callback, 300);
        });
      }, 300);
    });
  }

  // ========== Helper: chain clear operations ==========
  function runClearChain(trigger, steps, index) {
    if (index >= steps.length) {
      doBatchUpload(trigger);
      return;
    }
    clearModule(trigger, steps[index], function () {
      runClearChain(trigger, steps, index + 1);
    });
  }

  // ========== Main flow ==========
  function doEditDesc() {
    editStep = 0;
    console.log('%c[小蜜蜂] 一键编辑描述 开始', 'color:#43A047;font-weight:bold;font-size:14px');

    editLog('打开编辑描述...');
    var editBtn = document.querySelector('#baiduStatisticsSmtNewEditorEditClickNum > button'); // “编辑描述”按钮(在产品描述区域)
    if (!editBtn) {
      console.log('%c[小蜜蜂] ❌ 未找到编辑描述按钮', 'color:#ff4444;font-weight:bold');
      C.showBubble('❌ 未找到编辑描述按钮', 'err');
      setTimeout(C.hideBubble, 2000);
      return;
    }
    editBtn.click();

    C.waitForElement('.smt-new-editor .menu-button.ant-dropdown-trigger', 5000, function (trigger) { // .smt-new-editor: TEMU产品描述编辑器弹窗; .menu-button.ant-dropdown-trigger: “批量操作”下拉触发器
      if (!trigger) {
        C.showBubble('❌ 未找到批量操作', 'err');
        setTimeout(C.hideBubble, 2000);
        return;
      }

      C.waitForElement('.smt-new-editor .smt-desc-content', 5000, function () { // .smt-desc-content: 编辑器中已有的描述内容模块(文字/图片)
        var hasText = editorHasText();
        var hasImage = editorHasImage();
        console.log('%c[小蜜蜂] 内容检测: 文字=' + hasText + ', 图片=' + hasImage, 'color:#2196F3;font-weight:bold');
        var clearSteps = [];
        if (hasText) clearSteps.push('清空文字模块');
        if (hasImage) clearSteps.push('清空图片模块');

        editTotal = 1 + clearSteps.length * 4 + 8;

        if (clearSteps.length === 0) {
          console.log('%c[小蜜蜂] 无需清空模块，直接传图', 'color:#FF9800;font-weight:bold');
          C.showBubble('无需清空，直接传图', 'loading');
          setTimeout(function () { doBatchUpload(trigger); }, 200);
        } else {
          console.log('%c[小蜜蜂] 需清空: ' + clearSteps.join(', '), 'color:#2196F3;font-weight:bold');
          runClearChain(trigger, clearSteps, 0);
        }
      });
    });
  }

  // ========== Batch upload flow ==========
  function doBatchUpload(trigger) {
    editLog('展开批量操作菜单');
    C.hoverElement(trigger);

    waitForVisibleLi('批量传图', 3000, function (batchImgItem) { // 批量操作下拉中的“批量传图”菜单项
      if (!batchImgItem) {
        C.showBubble('❌ 未找到批量传图', 'err');
        setTimeout(C.hideBubble, 2000);
        return;
      }
      editLog('打开批量传图');
      batchImgItem.click();
      C.unhoverElement(trigger);

      C.waitForElement('.batch-smt-image', 5000, function (batchPanel) { // .batch-smt-image: 批量传图弹窗面板
        if (!batchPanel) {
          C.showBubble('❌ 未找到批量传图弹窗', 'err');
          setTimeout(C.hideBubble, 2000);
          return;
        }
        var selectBtn = null;
        var btns = batchPanel.querySelectorAll('button');
        for (var bi = 0; bi < btns.length; bi++) {
          if ((btns[bi].textContent || '').indexOf('选择图片') !== -1) { // 批量传图弹窗内的“选择图片”按钮(带 Dropdown 下拉)
            selectBtn = btns[bi];
            break;
          }
        }
        if (!selectBtn) {
          C.showBubble('❌ 未找到选择图片按钮', 'err');
          setTimeout(C.hideBubble, 2000);
          return;
        }
        editLog('展开选择图片菜单');
        var ddTrigger = selectBtn;
        var p = selectBtn.parentElement;
        while (p && p !== document.body) {
          if (p.classList.contains('ant-dropdown-trigger')) { ddTrigger = p; break; } // 向上查找“选择图片”按钮的 .ant-dropdown-trigger 祖先元素(用于触发下拉)
          p = p.parentElement;
        }
        setTimeout(function () {
          C.hoverElement(ddTrigger);
          hoverWithCoords(ddTrigger);
          if (ddTrigger !== selectBtn) {
            C.hoverElement(selectBtn);
          }
        }, 300);

        if (C.loadUseWebImage()) {
          doWebImageUpload();
        } else {
          doProductCarouselUpload();
        }
      });
    });
  }

  // ========== Shared: confirm batch upload + save ==========
  function doFinishUpload() {
    setTimeout(function () {
      editLog('确认批量传图');
      var batchModal = null;
      var titles2 = document.querySelectorAll('.ant-modal-title');
      for (var bt = 0; bt < titles2.length; bt++) {
        if ((titles2[bt].textContent || '').indexOf('批量传图') !== -1) {
          var bEl = titles2[bt];
          while (bEl && !bEl.classList.contains('ant-modal-wrap')) { bEl = bEl.parentElement; } // 通过标题文字找到批量传图弹窗的 .ant-modal-wrap 容器
          if (bEl) { batchModal = bEl; break; }
        }
      }
      if (!batchModal) {
        C.showBubble('❌ 未找到批量传图弹窗', 'err');
        setTimeout(C.hideBubble, 2000);
        return;
      }
      var confirmBatchBtn = batchModal.querySelector('.ant-modal-footer .ant-btn-primary'); // 批量传图弹窗底部的“确定”主按钮
      if (!confirmBatchBtn) {
        C.showBubble('❌ 未找到批量传图确定按钮', 'err');
        setTimeout(C.hideBubble, 2000);
        return;
      }
      confirmBatchBtn.click();

      setTimeout(function () {
        editLog('保存描述');
        var saveBtn = document.querySelector('.smt-new-editor .btn-orange'); // 编辑器弹窗右上角的“保存”按钮(橙色)
        if (!saveBtn) {
          C.showBubble('❌ 未找到保存按钮', 'err');
          setTimeout(C.hideBubble, 2000);
          return;
        }
        saveBtn.click();
        console.log('%c[小蜜蜂] ✅ 编辑描述完成', 'color:#43A047;font-weight:bold;font-size:14px');
        C.showBubble('✅ 编辑描述完成', 'ok');
        setTimeout(C.hideBubble, 2000);
      }, 800);
    }, 250);
  }

  // ========== Product carousel upload (original logic) ==========
  function doProductCarouselUpload() {
    waitForVisibleLi('引用产品轮播图', 5000, function (carouselItem) { // 选择图片下拉中的“引用产品轮播图”菜单项
      if (!carouselItem) {
        C.showBubble('❌ 未找到引用产品轮播图', 'err');
        setTimeout(C.hideBubble, 2000);
        return;
      }
      editLog('引用产品轮播图');
      carouselItem.click();

      (function () {
        var start = Date.now();
        (function check() {
          var titles = document.querySelectorAll('.ant-modal-title');
          for (var t = 0; t < titles.length; t++) {
            if ((titles[t].textContent || '').indexOf('引用产品图片') !== -1) { // 轮询等待“引用产品图片”弹窗出现
              onImageModalReady();
              return;
            }
          }
          if (Date.now() - start > 5000) {
            C.showBubble('❌ 未找到引用产品图片弹窗', 'err');
            setTimeout(C.hideBubble, 2000);
            return;
          }
          requestAnimationFrame(check);
        })();
      })();

      function onImageModalReady() {
        editLog('全选产品图片');
        var imgModal = null;
        var titles = document.querySelectorAll('.ant-modal-title');
        for (var t = 0; t < titles.length; t++) {
          if ((titles[t].textContent || '').indexOf('引用产品图片') !== -1) {
            var el = titles[t];
            while (el && !el.classList.contains('ant-modal-wrap')) { el = el.parentElement; }
            if (el) { imgModal = el; break; }
          }
        }
        if (!imgModal) {
          C.showBubble('❌ 未找到引用产品图片弹窗', 'err');
          setTimeout(C.hideBubble, 2000);
          return;
        }

        setTimeout(function () {
          var allLabel = null;
          var labels = imgModal.querySelectorAll('label.ant-checkbox-wrapper'); // 引用产囁图片弹窗内的 Checkbox 选项(全部/单张)
          for (var k = 0; k < labels.length; k++) {
            var spans = labels[k].querySelectorAll(':scope > span');
            for (var s = 0; s < spans.length; s++) {
              if (spans[s].textContent === '全部') {
                allLabel = labels[k];
                break;
              }
            }
            if (allLabel) break;
          }
          if (!allLabel) {
            C.showBubble('❌ 未找到全选', 'err');
            setTimeout(C.hideBubble, 2000);
            return;
          }
          var cb = allLabel.querySelector('.ant-checkbox');
          if (cb && !cb.classList.contains('ant-checkbox-checked')) {
            allLabel.click();
          }

          setTimeout(function () {
            editLog('确认选择图片');
            var selectBtn2 = imgModal.querySelector('.ant-modal-footer .ant-btn-primary');
            if (!selectBtn2) {
              C.showBubble('❌ 未找到选择按钮', 'err');
              setTimeout(C.hideBubble, 2000);
              return;
            }
            selectBtn2.click();
            doFinishUpload();
          }, 250);
        }, 250);
      }
    });
  }

  // ========== Web image upload (network URLs) ==========
  function doWebImageUpload() {
    waitForVisibleLi('网络上传', 5000, function (webUploadItem) { // 选择图片下拉中的“网络上传”菜单项
      if (!webUploadItem) {
        C.showBubble('❌ 未找到网络上传', 'err');
        setTimeout(C.hideBubble, 2000);
        return;
      }
      editLog('网络上传');
      webUploadItem.click();

      (function () {
        var start = Date.now();
        (function check() {
          var titles = document.querySelectorAll('.ant-modal-title');
          for (var t = 0; t < titles.length; t++) {
            if ((titles[t].textContent || '').indexOf('从网络地址') !== -1) { // 轮询等待“从网络地址(URL)选择图片”弹窗出现
              onWebImageModalReady();
              return;
            }
          }
          if (Date.now() - start > 5000) {
            C.showBubble('❌ 未找到网络图片弹窗', 'err');
            setTimeout(C.hideBubble, 2000);
            return;
          }
          requestAnimationFrame(check);
        })();
      })();

      function onWebImageModalReady() {
        editLog('填入图片地址');
        var webModal = null;
        var titles = document.querySelectorAll('.ant-modal-title');
        for (var t = 0; t < titles.length; t++) {
          if ((titles[t].textContent || '').indexOf('从网络地址') !== -1) {
            var el = titles[t];
            while (el && !el.classList.contains('ant-modal-wrap')) { el = el.parentElement; }
            if (el) { webModal = el; break; }
          }
        }
        if (!webModal) {
          C.showBubble('❌ 未找到网络图片弹窗', 'err');
          setTimeout(C.hideBubble, 2000);
          return;
        }

        var textarea = webModal.querySelector('textarea.ant-input'); // 网络图片弹窗中的图片 URL 输入框
        if (!textarea) {
          C.showBubble('❌ 未找到图片地址输入框', 'err');
          setTimeout(C.hideBubble, 2000);
          return;
        }
        // Scrape checked image URLs from product page (max 5)
        var urls = [];
        var imgItems = document.querySelectorAll('#productProductInfo .mainImage .img-list .img-item.checked'); // #productProductInfo .mainImage: 产品信息中的主图区域; .img-item.checked: 已勾选的产品图片
        for (var ii = 0; ii < imgItems.length && urls.length < 5; ii++) {
          var img = imgItems[ii].querySelector('img.img-css'); // 产品图片元素, src 即为图片 URL
          if (img && img.src) urls.push(img.src);
        }
        if (!urls.length) {
          C.showBubble('❌ 未找到已选的产品图片', 'err');
          setTimeout(C.hideBubble, 2000);
          return;
        }
        var urlStr = urls.join('\n');
        C.setInputValue(textarea, urlStr);

        setTimeout(function () {
          editLog('添加图片');
          var addBtn = webModal.querySelector('.ant-modal-footer .ant-btn-primary'); // 网络图片弹窗底部的“添加”按钮
          if (!addBtn) {
            C.showBubble('❌ 未找到添加按钮', 'err');
            setTimeout(C.hideBubble, 2000);
            return;
          }
          addBtn.click();
          doFinishUpload();
        }, 250);
      }
    });
  }
})();
