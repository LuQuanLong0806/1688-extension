(function () {
  if (window.__dxmPasteImg) return;
  window.__dxmPasteImg = true;

  var C = window.BeeConfig;
  var pasteEl = document.getElementById('__dxm_bee_paste');
  var deleteEl = document.getElementById('__dxm_bee_delete');
  if (!pasteEl && !deleteEl) return;

  if (pasteEl) {
    pasteEl.addEventListener('click', function () {
      doPasteImg();
    });
  }

  if (deleteEl) {
    deleteEl.addEventListener('click', function () {
      doDeleteImages();
    });
  }

  // ========== Step log ==========
  var pasteStep = 0;
  var pasteTotal = 8;
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

      // Step 2: 打开产品轮播图-选择图片下拉菜单
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

      C.waitForVisibleLi('网络图片', 3000, function (webImgItem) { // 选择图片下拉菜单中的"网络图片"菜单项
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
          var modal = C.findVisibleModal('从网络地址'); // 通过标题文字+可见性双重判断定位弹窗
          if (modal) {
            fillAndAdd(modal, clipText, function () {
              // 产品轮播图添加完成，继续更新外包装图片
              setTimeout(updatePackageImage, 500);
            });
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

  // ========== Fill textarea + click add (shared) ==========
  function fillAndAdd(modal, urlText, callback) {
    pasteLog('填入图片地址');

    var textarea = modal.querySelector('textarea.ant-input'); // 网络图片弹窗中的图片 URL 输入框
    if (!textarea) {
      C.showBubble('❌ 未找到输入框', 'err');
      setTimeout(C.hideBubble, 2000);
      return;
    }

    C.setInputValue(textarea, urlText);

    setTimeout(function () {
      pasteLog('添加图片');
      var addBtn = modal.querySelector('.ant-modal-footer .ant-btn-primary'); // 网络图片弹窗底部的"添加"按钮
      if (!addBtn) {
        C.showBubble('❌ 未找到添加按钮', 'err');
        setTimeout(C.hideBubble, 2000);
        return;
      }
      addBtn.click();
      if (callback) callback();
    }, 250);
  }

  // ========== Update package image ==========
  function updatePackageImage() {
    // Step 5: 获取产品轮播图第一张图片地址
    pasteLog('获取产品轮播图首图');

    var firstImg = document.querySelector('#productProductInfo .mainImage .img-list .img-item img.img-css'); // 产品轮播图列表中的第一张图片
    if (!firstImg || !firstImg.src) {
      C.showBubble('❌ 未找到产品轮播图图片', 'err');
      setTimeout(C.hideBubble, 2000);
      return;
    }
    var imgUrl = firstImg.src;
    console.log('%c[小蜜蜂-粘] 外包装图片URL: ' + imgUrl, 'color:#AB47BC;font-weight:bold');

    // 先检查外包装是否已有图片，有则先删除
    var pkgImgs = document.querySelectorAll('#packageInfo .img-list .img-item a.icon_delete');
    if (pkgImgs.length > 0) {
      pasteLog('清空外包装旧图片');
      var delIdx = 0;
      (function deleteNext() {
        var btn = document.querySelector('#packageInfo .img-list .img-item a.icon_delete');
        if (!btn) {
          openPkgSelect(imgUrl);
          return;
        }
        delIdx++;
        btn.click();
        setTimeout(deleteNext, 50);
      })();
      return;
    }

    openPkgSelect(imgUrl);
  }

  function openPkgSelect(imgUrl) {
    // Step 6: 打开外包装选择图片下拉菜单
    pasteLog('打开外包装选择图片');

    var pkgBtn = document.querySelector('#packageInfo .header button'); // #packageInfo .header button: 包裹信息区域顶部的"选择图片"按钮
    if (!pkgBtn || (pkgBtn.textContent || '').indexOf('选择图片') === -1) {
      C.showBubble('❌ 未找到外包装选择图片按钮', 'err');
      setTimeout(C.hideBubble, 2000);
      return;
    }
    C.hoverElement(pkgBtn);

    C.waitForVisibleLi('网络图片', 3000, function (webImgItem) { // 外包装选择图片下拉菜单中的"网络图片"菜单项
      if (!webImgItem) {
        C.showBubble('❌ 未找到网络图片选项', 'err');
        setTimeout(C.hideBubble, 2000);
        return;
      }

      // Step 7: 点击网络图片，等待弹窗
      pasteLog('点击外包装网络图片');
      webImgItem.click();

      var start = Date.now();
      (function checkModal() {
        var modal = C.findVisibleModal('从网络地址'); // 通过标题文字+可见性双重判断定位弹窗
        if (modal) {
          fillPackageModal(modal, imgUrl);
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
  }

  // ========== Fill package image modal + finish ==========
  function fillPackageModal(modal, imgUrl) {
    pasteLog('填入外包装图片地址');

    var textarea = modal.querySelector('textarea.ant-input'); // 网络图片弹窗中的图片 URL 输入框
    if (!textarea) {
      C.showBubble('❌ 未找到输入框', 'err');
      setTimeout(C.hideBubble, 2000);
      return;
    }

    C.setInputValue(textarea, imgUrl);

    setTimeout(function () {
      pasteLog('更新外包装图片');
      var addBtn = modal.querySelector('.ant-modal-footer .ant-btn-primary'); // 网络图片弹窗底部的"添加"按钮
      if (!addBtn) {
        C.showBubble('❌ 未找到添加按钮', 'err');
        setTimeout(C.hideBubble, 2000);
        return;
      }
      addBtn.click();
      console.log('%c[小蜜蜂-粘] ✅ 全部完成', 'color:#AB47BC;font-weight:bold;font-size:14px');
      C.showBubble('✅ 产品轮播图+外包装已更新', 'ok');
      setTimeout(C.hideBubble, 2000);
    }, 250);
  }

  // ========== Delete workflow ==========
  function doDeleteImages() {
    console.log('%c[小蜜蜂-删] 一键清空产品轮播图 开始', 'color:#C62828;font-weight:bold;font-size:14px');

    var imgItems = document.querySelectorAll('#productProductInfo .mainImage .img-list .img-item'); // 产品轮播图列表中的所有图片容器
    var total = imgItems.length;
    if (total === 0) {
      C.showBubble('无需清空，没有图片', 'ok');
      setTimeout(C.hideBubble, 2000);
      return;
    }

    var deleted = 0;
    function deleteNext() {
      var btn = document.querySelector('#productProductInfo .mainImage .img-list .img-item a.icon_delete'); // 每个图片容器内的删除按钮
      if (!btn) {
        console.log('%c[小蜜蜂-删] ✅ 已清空 ' + deleted + ' 张图片', 'color:#C62828;font-weight:bold;font-size:14px');
        C.showBubble('✅ 已清空 ' + deleted + ' 张图片', 'ok');
        setTimeout(C.hideBubble, 2000);
        return;
      }
      deleted++;
      console.log('%c[小蜜蜂-删] 删除 ' + deleted + '/' + total, 'color:#C62828;font-weight:bold');
      C.showBubble('⏳ 删除 ' + deleted + '/' + total, 'loading');
      btn.click();
      setTimeout(deleteNext, 50);
    }
    deleteNext();
  }
})();
