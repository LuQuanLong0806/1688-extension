(function () {
  if (window.__dxmPasteImg) return;
  window.__dxmPasteImg = true;

  var C = window.BeeConfig;
  var pasteEl = document.getElementById('__dxm_bee_paste');
  var deleteEl = document.getElementById('__dxm_bee_delete');
  if (!pasteEl && !deleteEl) return;

  if (pasteEl) {
    pasteEl.addEventListener('click', function () {
      var mainImg = document.querySelector('#productProductInfo .mainImage');
      if (mainImg) mainImg.scrollIntoView({ behavior: 'smooth', block: 'center' });
      doPasteImg();
    });
  }

  if (deleteEl) {
    deleteEl.addEventListener('click', function () {
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

  // ========== Ant Select helpers ==========
  function waitForAntSelect(labelText, cb) {
    var start = Date.now();
    (function check() {
      var labels = document.querySelectorAll('#packageInfo .ant-form-item-label label');
      for (var i = 0; i < labels.length; i++) {
        if (labels[i].textContent.indexOf(labelText) !== -1) {
          var formItem = labels[i].closest('.ant-form-item');
          if (formItem) {
            var sel = formItem.querySelector('.ant-select-selector');
            if (sel) return cb(sel);
          }
        }
      }
      if (Date.now() - start > 5000) return cb(null);
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

  // ========== Main flow ==========
  function doPasteImg() {
    pasteStep = 0;
    pasteTotal = 7;
    console.log('%c[小蜜蜂-粘] 一键粘贴图片URL 开始', 'color:#AB47BC;font-weight:bold;font-size:14px');

    pasteLog('读取剪贴板...');
    navigator.clipboard.readText().then(function (clipText) {
      if (!clipText || !clipText.trim()) {
        C.showBubble('❌ 剪贴板为空', 'err');
        setTimeout(C.hideBubble, 2000);
        return;
      }

      pasteLog('打开选择图片菜单');
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

        pasteLog('点击网络图片');
        webImgItem.click();

        var start = Date.now();
        (function checkModal() {
          var modal = C.findVisibleModal('从网络地址');
          if (modal) {
            fillAndAdd(modal, clipText, function () {
              setTimeout(selectPackageOptions, 500);
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
    pasteLog('填入图片地址');
    var textarea = modal.querySelector('textarea.ant-input');
    if (!textarea) {
      C.showBubble('❌ 未找到输入框', 'err');
      setTimeout(C.hideBubble, 2000);
      return;
    }

    C.setInputValue(textarea, urlText);

    setTimeout(function () {
      pasteLog('添加图片');
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

  // ========== Auto-select package shape and type ==========
  function selectPackageOptions() {
    // Step 6: Select package shape
    pasteLog('选择外包装形状...');
    waitForAntSelect('外包装形状', function (sel) {
      if (!sel) {
        C.showBubble('❌ 未找到外包装形状', 'err');
        setTimeout(C.hideBubble, 2000);
        return;
      }
      sel.scrollIntoView({ block: 'center' });
      setTimeout(function () {
        forceOpenAntSelect(sel);

        C.waitForElement('.ant-select-item-option[title="不规则"]', 3000, function (opt) {
          if (!opt) {
            C.showBubble('❌ 未找到不规则选项', 'err');
            setTimeout(C.hideBubble, 2000);
            return;
          }
          opt.click();
          console.log('%c[小蜜蜂-粘] 已选择外包装形状: 不规则', 'color:#AB47BC;font-weight:bold');

          // Step 7: Select package type
          setTimeout(function () {
            pasteLog('选择外包装类型...');
            waitForAntSelect('外包装类型', function (sel2) {
              if (!sel2) {
                C.showBubble('❌ 未找到外包装类型', 'err');
                setTimeout(C.hideBubble, 2000);
                return;
              }
              forceOpenAntSelect(sel2);

              C.waitForElement('.ant-select-item-option[title="软包装+硬物"]', 3000, function (opt2) {
                if (!opt2) {
                  C.showBubble('❌ 未找到软包装+硬物选项', 'err');
                  setTimeout(C.hideBubble, 2000);
                  return;
                }
                opt2.click();
                console.log('%c[小蜜蜂-粘] ✅ 全部完成', 'color:#AB47BC;font-weight:bold;font-size:14px');
                C.showBubble('✅ 粘图+外包装选项已完成', 'ok');
                setTimeout(C.hideBubble, 2000);
              });
            });
          }, 300);
        });
      }, 300);
    });
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
