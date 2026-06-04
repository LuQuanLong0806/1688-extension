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
      if (!C.startWorkflow('__dxm_bee_paste')) return;
      try { chrome.runtime.sendMessage({ action: 'clearResultSelections' }); } catch (e) {}
      try { fetch(_serverUrl() + '/api/clear-signal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId: _clientId() }) }).catch(function () {}); } catch (e) {}
      var mainImg = document.querySelector('#productProductInfo .mainImage');
      if (mainImg) mainImg.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // 先检测剪贴板是否有图片，有则上传后写回URL，再走正常流程
      checkClipboardImage(function () {
        doPasteImg();
      });
    });
  }

  if (deleteEl) {
    deleteEl.addEventListener('click', function () {
      if (!C.startWorkflow('__dxm_bee_delete')) return;
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

  function pasteDone(msg, type) {
    C.showBubble(msg, type);
    setTimeout(C.hideBubble, 2000);
    C.finishWorkflow(type === 'ok');
  }

  // ========== 前置：检测剪贴板图片，有则上传并写回URL ==========
  function checkClipboardImage(onDone) {
    pasteLog('读取剪贴板...');
    readClipboardType(function (result) {
      if (result && result.type === 'image' && result.base64) {
        // 剪贴板是图片：上传到 ImgBB，把 URL 写回剪贴板
        pasteLog('上传图片到图床...');
        fetch(_serverUrl() + '/api/ai/smms-upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image_base64: result.base64 })
        }).then(function (r) { return r.json(); }).then(function (data) {
          if (data.ok && data.url) {
            // 把图床 URL 写回剪贴板
            if (navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(data.url).then(function () {
                console.log('%c[小蜜蜂-粘] 图片已上传，URL已写入剪贴板: ' + data.url, 'color:#AB47BC;font-weight:bold');
                pasteLog('图床URL已就绪');
                onDone();
              }).catch(function () { onDone(); });
            } else {
              onDone();
            }
          } else {
            console.error('[小蜜蜂-粘] ImgBB 上传失败:', data.error);
            pasteDone('❌ 图床上传失败', 'err');
          }
        }).catch(function () {
          pasteDone('❌ 图床上传失败', 'err');
        });
      } else {
        // 不是图片（是文本URL或空），直接走正常流程
        onDone();
      }
    });
  }

  // 判断文本是否看起来像图片URL（支持多行，每行一个URL）
  function looksLikeUrls(text) {
    var lines = text.split(/[\n\r]+/).filter(function (l) { return l.trim(); });
    if (!lines.length) return false;
    return lines.every(function (line) {
      return /^https?:\/\/.+/i.test(line.trim());
    });
  }

  // 检测剪贴板是否有图片：先试 readText，无文本或非URL则弹出小提示等待 Ctrl+V
  function readClipboardType(cb) {
    if (!navigator.clipboard || !navigator.clipboard.readText) { cb(null); return; }
    navigator.clipboard.readText().then(function (text) {
      if (text && text.trim() && looksLikeUrls(text.trim())) {
        cb(null);
        return;
      }
      // 文本为空，可能是图片，取消工作流后弹出非阻塞提示
      C.finishWorkflow(false);
      if (document.getElementById('__dxm_bee_paste_hint')) return; // 已有提示条，不重复弹
      showPasteHint(function (result) {
        if (result && result.type === 'image' && result.base64) {
          // 拿到图片了，重新启动工作流上传
          if (!C.startWorkflow('__dxm_bee_paste')) return;
          pasteStep = 0;
          pasteTotal = 7;
          pasteLog('上传图片到图床...');
          fetch(_serverUrl() + '/api/ai/smms-upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image_base64: result.base64 })
          }).then(function (r) { return r.json(); }).then(function (data) {
            if (data.ok && data.url) {
              if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(data.url).then(function () {
                  pasteLog('图床URL已就绪');
                  doPasteImg();
                });
              } else {
                doPasteImg();
              }
            } else {
              pasteDone('❌ 图床上传失败', 'err');
            }
          }).catch(function () {
            pasteDone('❌ 图床上传失败', 'err');
          });
        } else {
          // 用户取消或超时，隐藏气泡
          C.hideBubble();
        }
      });
    }).catch(function () {
      C.finishWorkflow(false);
      cb(null);
    });
  }

  // 非阻塞提示条：监听 document 级 paste，不抢焦点不锁工作流
  function showPasteHint(cb) {
    var hint = document.createElement('div');
    hint.id = '__dxm_bee_paste_hint';
    hint.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:2147483646;' +
      'background:linear-gradient(135deg,#AB47BC,#8E24AA);color:#fff;padding:10px 24px;border-radius:24px;' +
      'font:bold 13px/1 "Microsoft YaHei",Arial,sans-serif;box-shadow:0 4px 16px rgba(142,36,170,.4);' +
      'display:flex;align-items:center;gap:8px;cursor:pointer';
    hint.innerHTML = '<span>如要粘贴图片，请按 Ctrl+V</span>' +
      '<span style="opacity:.6;font-size:11px">点击关闭</span>';
    document.body.appendChild(hint);

    var resolved = false;
    function finish(result) {
      if (resolved) return;
      resolved = true;
      hint.remove();
      document.removeEventListener('paste', onPaste, true);
      document.removeEventListener('keydown', onEsc, true);
      cb(result);
    }

    function onPaste(e) {
      var cd = e.clipboardData;
      if (!cd) return;
      for (var i = 0; i < cd.items.length; i++) {
        if (cd.items[i].type.indexOf('image/') === 0) {
          e.preventDefault();
          e.stopPropagation();
          var file = cd.items[i].getAsFile();
          var reader = new FileReader();
          reader.onload = function () {
            console.log('[小蜜蜂-粘] 捕获到粘贴图片');
            finish({ type: 'image', base64: reader.result.split(',')[1] });
          };
          reader.readAsDataURL(file);
          return;
        }
      }
      // 粘贴的是文本，不拦截，让用户正常粘贴到其他地方
    }

    function onEsc(e) {
      if (e.key === 'Escape') finish(null);
    }

    document.addEventListener('paste', onPaste, true);
    document.addEventListener('keydown', onEsc, true);

    hint.addEventListener('click', function () { finish(null); });

    // 60秒后自动消失
    setTimeout(function () { finish(null); }, 60000);
  }

  // ========== 原有贴图流程（不改动） ==========
  function doPasteImg() {
    pasteStep = 0;
    pasteTotal = 7;
    console.log('%c[小蜜蜂-粘] 一键粘贴图片URL 开始', 'color:#AB47BC;font-weight:bold;font-size:14px');

    var initialImgCount = document.querySelectorAll('#productProductInfo .mainImage .img-list .img-item').length;

    pasteLog('读取剪贴板...');
    navigator.clipboard.readText().then(function (clipText) {
      if (!clipText || !clipText.trim()) {
        pasteDone('❌ 剪贴板为空', 'err');
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
        pasteDone('❌ 未找到产品轮播图', 'err');
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
        pasteDone('❌ 未找到选择图片按钮', 'err');
        return;
      }

      C.hoverElement(selectBtn);

      C.waitForVisibleLi('网络图片', 3000, function (webImgItem) {
        if (!webImgItem) {
          pasteDone('❌ 未找到网络图片选项', 'err');
          return;
        }

        webImgItem.click();

        var start = Date.now();
        (function checkModal() {
          var modal = C.findVisibleModal('从网络地址');
          if (modal) {
            fillAndAdd(modal, clipText, function () {
              if (C.loadAutoResize()) {
                waitForImagesUploaded(initialImgCount);
              } else {
                console.log('%c[小蜜蜂-粘] ✅ 粘图完成', 'color:#AB47BC;font-weight:bold;font-size:14px');
                pasteDone('✅ 粘图完成', 'ok');
              }
            });
            return;
          }
          if (Date.now() - start > 5000) {
            pasteDone('❌ 未找到网络图片弹窗', 'err');
            return;
          }
          requestAnimationFrame(checkModal);
        })();
      });
    }).catch(function (err) {
      console.log('%c[小蜜蜂-粘] ❌ 剪贴板读取失败: ' + err, 'color:#ff4444;font-weight:bold');
      pasteDone('❌ 无法读取剪贴板', 'err');
    });
  }

  // ========== Fill textarea + click add ==========
  function fillAndAdd(modal, urlText, callback) {
    pasteLog('添加图片');
    var textarea = modal.querySelector('textarea.ant-input');
    if (!textarea) {
      pasteDone('❌ 未找到输入框', 'err');
      return;
    }

    C.setInputValue(textarea, urlText);

    setTimeout(function () {
      var addBtn = modal.querySelector('.ant-modal-footer .ant-btn-primary');
      if (!addBtn) {
        pasteDone('❌ 未找到添加按钮', 'err');
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
      if (Date.now() - start > 6000) {
        console.log('%c[小蜜蜂-粘] ⚠️ 等待图片上传超时，跳过批量修改', 'color:#AB47BC;font-weight:bold');
        pasteDone('✅ 粘图完成（未检测到新图片）', 'ok');
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
      pasteDone('✅ 粘图完成', 'ok');
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
        pasteDone('✅ 粘图完成', 'ok');
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
        pasteDone('✅ 粘图完成', 'ok');
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
        pasteDone('✅ 粘图+批量修改完成', 'ok');
      } else {
        console.log('%c[小蜜蜂-粘] ⚠️ 未找到生成JPG图片按钮', 'color:#AB47BC;font-weight:bold');
        pasteDone('✅ 粘图完成', 'ok');
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
    C.finishWorkflow(true);
  }
})();
