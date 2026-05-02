(function () {
  if (window.__dxmPasteImg) return;
  window.__dxmPasteImg = true;

  var C = window.BeeConfig;
  var _serverUrl = function () { return (C && C.getServerUrl ? C.getServerUrl() : localStorage.getItem('1688_server_url')) || 'http://localhost:3000'; };
  var _clientId = function () { return window.__sharedClientId || ''; };
  var pasteEl = document.getElementById('__dxm_bee_paste');
  var deleteEl = document.getElementById('__dxm_bee_delete');
  if (!pasteEl && !deleteEl) return;

  if (pasteEl) {
    pasteEl.addEventListener('click', function () {
      try { chrome.runtime.sendMessage({ action: 'clearResultSelections' }); } catch (e) {}
      try { fetch(_serverUrl() + '/api/clear-signal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId: _clientId() }) }).catch(function () {}); } catch (e) {}
      var mainImg = document.querySelector('#productProductInfo .mainImage');
      if (mainImg) mainImg.scrollIntoView({ behavior: 'smooth', block: 'center' });
      doPasteImg();
    });
  }

  if (deleteEl) {
    deleteEl.addEventListener('click', function () {
      try { chrome.runtime.sendMessage({ action: 'clearResultSelections' }); } catch (e) {}
      try { fetch(_serverUrl() + '/api/clear-signal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId: _clientId() }) }).catch(function () {}); } catch (e) {}
      var mainImg = document.querySelector('#productProductInfo .mainImage');
      if (mainImg) mainImg.scrollIntoView({ behavior: 'smooth', block: 'center' });
      doDeleteImages();
    });
  }

  // ========== Step log ==========
  var pasteStep = 0;
  var pasteTotal = 7;
  function pasteLog(msg) {
    pasteStep++;
    var tag = '[小蜜蜂-粘] ' + pasteStep + '/' + pasteTotal + ' ' + msg;
    console.log('%c' + tag, 'color:#AB47BC;font-weight:bold');
    C.showBubble(pasteStep + '/' + pasteTotal + ' ' + msg, 'loading');
  }

  // ========== Main flow ==========
  function doPasteImg() {
    pasteStep = 0;
    pasteTotal = 7;
    console.log('%c[小蜜蜂-粘] 一键粘贴图片URL 开始', 'color:#AB47BC;font-weight:bold;font-size:14px');

    var initialImgCount = document.querySelectorAll('#productProductInfo .mainImage .img-list .img-item').length;

    pasteLog('读取剪贴板...');
    navigator.clipboard.readText().then(function (clipText) {
      if (!clipText || !clipText.trim()) {
        C.showBubble('❌ 剪贴板为空', 'err');
        setTimeout(C.hideBubble, 2000);
        return;
      }

      pasteLog('打开网络图片弹窗');
      var labels = document.querySelectorAll('#productProductInfo .ant-form-item-label label');
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

      var formItem = mainImageLabel.closest('.ant-form-item');
      var selectBtn = null;
      var btns = formItem.querySelectorAll('.img-module .header button');
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

      C.waitForVisibleLi('网络图片', 3000, function (webImgItem) {
        if (!webImgItem) {
          C.showBubble('❌ 未找到网络图片选项', 'err');
          setTimeout(C.hideBubble, 2000);
          return;
        }

        webImgItem.click();

        var start = Date.now();
        (function checkModal() {
          var modal = C.findVisibleModal('从网络地址');
          if (modal) {
            fillAndAdd(modal, clipText, function () {
              waitForImagesUploaded(initialImgCount);
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

  // ========== Fill textarea + click add ==========
  function fillAndAdd(modal, urlText, callback) {
    pasteLog('添加图片');
    var textarea = modal.querySelector('textarea.ant-input');
    if (!textarea) {
      C.showBubble('❌ 未找到输入框', 'err');
      setTimeout(C.hideBubble, 2000);
      return;
    }

    C.setInputValue(textarea, urlText);

    setTimeout(function () {
      var addBtn = modal.querySelector('.ant-modal-footer .ant-btn-primary');
      if (!addBtn) {
        C.showBubble('❌ 未找到添加按钮', 'err');
        setTimeout(C.hideBubble, 2000);
        return;
      }
      addBtn.click();
      if (callback) callback();
    }, 250);
  }

  // ========== Batch resize after paste ==========
  function waitForImagesUploaded(initialCount) {
    pasteLog('等待图片上传...');
    var start = Date.now();
    (function check() {
      var currentCount = document.querySelectorAll('#productProductInfo .mainImage .img-list .img-item').length;
      if (currentCount > initialCount) {
        doBatchResize();
        return;
      }
      if (Date.now() - start > 15000) {
        console.log('%c[小蜜蜂-粘] ⚠️ 等待图片上传超时，跳过批量修改', 'color:#AB47BC;font-weight:bold');
        C.showBubble('✅ 粘图完成（未检测到新图片）', 'ok');
        setTimeout(C.hideBubble, 2000);
        return;
      }
      setTimeout(check, 300);
    })();
  }

  function doBatchResize() {
    pasteLog('打开批量编辑...');
    var actionItems = document.querySelectorAll('#productProductInfo .mainImage .img-options .action-item');
    var editBtn = null;
    for (var i = 0; i < actionItems.length; i++) {
      var link = actionItems[i].querySelector('a.img-options-action-btn');
      if (link && (link.textContent || '').indexOf('编辑图片') !== -1) {
        editBtn = link;
        break;
      }
    }
    if (!editBtn) {
      console.log('%c[小蜜蜂-粘] ⚠️ 未找到编辑图片按钮，跳过批量修改', 'color:#AB47BC;font-weight:bold');
      C.showBubble('✅ 粘图完成', 'ok');
      setTimeout(C.hideBubble, 2000);
      return;
    }
    C.hoverElement(editBtn);

    var start = Date.now();
    (function checkDropdown() {
      var items = document.querySelectorAll('li.ant-dropdown-menu-item');
      var resizeItem = null;
      for (var i = 0; i < items.length; i++) {
        if ((items[i].textContent || '').indexOf('批量改图片尺寸') !== -1 && items[i].offsetParent !== null) {
          resizeItem = items[i];
          break;
        }
      }
      if (resizeItem) {
        resizeItem.click();
        waitForResizeModal();
        return;
      }
      if (Date.now() - start > 3000) {
        console.log('%c[小蜜蜂-粘] ⚠️ 未找到批量改图片尺寸选项', 'color:#AB47BC;font-weight:bold');
        C.showBubble('✅ 粘图完成', 'ok');
        setTimeout(C.hideBubble, 2000);
        return;
      }
      requestAnimationFrame(checkDropdown);
    })();
  }

  function waitForResizeModal() {
    pasteLog('设置图片尺寸...');
    var start = Date.now();
    (function check() {
      var modal = C.findVisibleModal('批量改图片尺寸');
      if (modal) {
        doSetResizeAndGenerate(modal);
        return;
      }
      if (Date.now() - start > 5000) {
        console.log('%c[小蜜蜂-粘] ⚠️ 未找到批量改图片尺寸弹窗', 'color:#AB47BC;font-weight:bold');
        C.showBubble('✅ 粘图完成', 'ok');
        setTimeout(C.hideBubble, 2000);
        return;
      }
      requestAnimationFrame(check);
    })();
  }

  function doSetResizeAndGenerate(modal) {
    var widthInput = modal.querySelector('input[name="valueW"]');
    if (widthInput && !widthInput.value) {
      C.setInputValue(widthInput, '800');
    }

    setTimeout(function () {
      pasteLog('生成JPG图片...');
      var btns = modal.querySelectorAll('button');
      var jpgBtn = null;
      for (var i = 0; i < btns.length; i++) {
        if ((btns[i].textContent || '').indexOf('生成JPG图片') !== -1) {
          jpgBtn = btns[i];
          break;
        }
      }
      if (jpgBtn) {
        jpgBtn.click();
        console.log('%c[小蜜蜂-粘] ✅ 粘图+批量修改完成', 'color:#AB47BC;font-weight:bold;font-size:14px');
        C.showBubble('✅ 粘图+批量修改完成', 'ok');
        setTimeout(C.hideBubble, 2000);
      } else {
        console.log('%c[小蜜蜂-粘] ⚠️ 未找到生成JPG图片按钮', 'color:#AB47BC;font-weight:bold');
        C.showBubble('✅ 粘图完成', 'ok');
        setTimeout(C.hideBubble, 2000);
      }
    }, 300);
  }

  // ========== Delete workflow ==========
  var delStep = 0;
  var delTotal = 3;
  function delLog(msg) {
    delStep++;
    console.log('%c[小蜜蜂-删] ' + delStep + '/' + delTotal + ' ' + msg, 'color:#C62828;font-weight:bold');
    C.showBubble(delStep + '/' + delTotal + ' ' + msg, 'loading');
  }

  function doDeleteImages() {
    delStep = 0;
    console.log('%c[小蜜蜂-删] 一键清空 开始', 'color:#C62828;font-weight:bold;font-size:14px');
    deleteMainImages();
  }

  function deleteMainImages() {
    delLog('清空产品轮播图...');
    var imgItems = document.querySelectorAll('#productProductInfo .mainImage .img-list .img-item');
    var total = imgItems.length;
    if (total === 0) {
      console.log('%c[小蜜蜂-删] 产品轮播图无图片，跳过', 'color:#C62828;font-weight:bold');
      deleteProductVideos();
      return;
    }

    var deleted = 0;
    function deleteNext() {
      var btn = document.querySelector('#productProductInfo .mainImage .img-list .img-item a.icon_delete');
      if (!btn) {
        console.log('%c[小蜜蜂-删] ✅ 已清空 ' + deleted + ' 张轮播图', 'color:#C62828;font-weight:bold');
        deleteProductVideos();
        return;
      }
      deleted++;
      C.showBubble('1/' + delTotal + ' ⏳ 删除轮播图 ' + deleted + '/' + total, 'loading');
      btn.click();
      setTimeout(deleteNext, 50);
    }
    deleteNext();
  }

  function deleteProductVideos() {
    delLog('检查产品视频...');
    var labels = document.querySelectorAll('#productProductInfo .ant-form-item-label label');
    var videoLabel = null;
    for (var vi = 0; vi < labels.length; vi++) {
      if ((labels[vi].textContent || '').indexOf('产品视频') !== -1) {
        videoLabel = labels[vi];
        break;
      }
    }

    if (!videoLabel) {
      console.log('%c[小蜜蜂-删] 无产品视频区域，跳过', 'color:#C62828;font-weight:bold');
      deletePackageImages();
      return;
    }

    var videoFormItem = videoLabel.closest('.ant-form-item');
    deleteNextVideo(videoFormItem, 0);
  }

  function deleteNextVideo(formItem, count) {
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
        console.log('%c[小蜜蜂-删] ✅ 已删除 ' + count + ' 个产品视频', 'color:#C62828;font-weight:bold');
      } else {
        console.log('%c[小蜜蜂-删] 无产品视频，跳过', 'color:#C62828;font-weight:bold');
      }
      deletePackageImages();
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
      deletePackageImages();
      return;
    }

    count++;
    C.showBubble('2/' + delTotal + ' ⏳ 删除产品视频 ' + count, 'loading');
    delBtn.click();

    setTimeout(function () {
      var confirmBtn = document.querySelector('.ant-popconfirm-buttons .ant-btn-primary');
      if (confirmBtn) confirmBtn.click();
      setTimeout(function () { deleteNextVideo(formItem, count); }, 200);
    }, 150);
  }

  function deletePackageImages() {
    delLog('清空外包装图片...');
    var pkgImgs = document.querySelectorAll('#packageInfo .img-list .img-item a.icon_delete');
    if (pkgImgs.length === 0) {
      console.log('%c[小蜜蜂-删] 外包装无图片，跳过', 'color:#C62828;font-weight:bold');
      finishDelete();
      return;
    }

    var deleted = 0;
    var total = pkgImgs.length;
    function deleteNext() {
      var btn = document.querySelector('#packageInfo .img-list .img-item a.icon_delete');
      if (!btn) {
        console.log('%c[小蜜蜂-删] ✅ 已清空 ' + deleted + ' 张外包装图片', 'color:#C62828;font-weight:bold');
        finishDelete();
        return;
      }
      deleted++;
      C.showBubble('3/' + delTotal + ' ⏳ 删除外包装 ' + deleted + '/' + total, 'loading');
      btn.click();
      setTimeout(deleteNext, 50);
    }
    deleteNext();
  }

  function finishDelete() {
    console.log('%c[小蜜蜂-删] ✅ 全部清空完成', 'color:#C62828;font-weight:bold;font-size:14px');
    C.showBubble('✅ 轮播图+视频+外包装已清空', 'ok');
    setTimeout(C.hideBubble, 2000);
  }
})();
