(function () {
  if (window.__dxmEditDesc) return;
  window.__dxmEditDesc = true;

  var C = window.BeeConfig;
  var editEl = document.getElementById('__dxm_bee_edit');
  if (!editEl) return;

  editEl.addEventListener('click', function () {
    doEditDesc();
  });

  // ========== 辅助：查找可见 li ==========
  function findVisibleLi(textFragment) {
    var allLi = document.querySelectorAll('li');
    for (var i = 0; i < allLi.length; i++) {
      if (allLi[i].offsetParent === null) continue;
      if ((allLi[i].textContent || '').indexOf(textFragment) !== -1) return allLi[i];
    }
    return null;
  }

  // ========== 辅助：带坐标悬浮 ==========
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

  // ========== 辅助：轮询等待可见 li 出现 ==========
  function waitForVisibleLi(textFragment, timeout, cb) {
    var start = Date.now();
    (function check() {
      var el = findVisibleLi(textFragment);
      if (el) return cb(el);
      if (Date.now() - start > timeout) return cb(null);
      requestAnimationFrame(check);
    })();
  }

  // ========== 步骤日志 ==========
  var editStep = 0;
  var editTotal = 13;
  function editLog(msg) {
    editStep++;
    var tag = '[小蜜蜂] ' + editStep + '/' + editTotal + ' ' + msg;
    console.log('%c' + tag, 'color:#43A047;font-weight:bold');
    C.showBubble(editStep + '/' + editTotal + ' ' + msg, 'loading');
  }

  // ========== 主流程 ==========
  function doEditDesc() {
    editStep = 0;
    console.log('%c[小蜜蜂] 一键编辑描述 开始', 'color:#43A047;font-weight:bold;font-size:14px');

    // 1. 点击「编辑描述」按钮
    editLog('打开编辑描述...');
    var editBtn = document.querySelector('#baiduStatisticsSmtNewEditorEditClickNum > button');
    if (!editBtn) {
      console.log('%c[小蜜蜂] ❌ 未找到编辑描述按钮', 'color:#ff4444;font-weight:bold');
      C.showBubble('❌ 未找到编辑描述按钮', 'err');
      setTimeout(C.hideBubble, 2000);
      return;
    }
    editBtn.click();

    // 2. 悬浮「批量操作」
    C.waitForElement('.smt-new-editor .menu-button.ant-dropdown-trigger', 5000, function (trigger) {
      if (!trigger) {
        C.showBubble('❌ 未找到批量操作', 'err');
        setTimeout(C.hideBubble, 2000);
        return;
      }
      editLog('展开批量操作菜单');
      C.hoverElement(trigger);

      // 3. 悬浮「清空描述」
      waitForVisibleLi('清空描述', 3000, function (clearDescItem) {
        if (!clearDescItem) {
          C.showBubble('❌ 未找到清空描述', 'err');
          setTimeout(C.hideBubble, 2000);
          return;
        }
        editLog('展开清空描述子菜单');
        hoverWithCoords(clearDescItem);

        // 4. 点击「清空图片模块」
        setTimeout(function () {
          var clearImgItem = findVisibleLi('清空图片模块');
          if (!clearImgItem) {
            C.showBubble('❌ 未找到清空图片模块', 'err');
            setTimeout(C.hideBubble, 2000);
            return;
          }
          editLog('清空图片模块');
          clearImgItem.click();
          C.unhoverElement(trigger);

          // 5. 确认清空
          C.waitForElement('.ant-modal-confirm .ant-modal-confirm-btns .ant-btn-primary', 3000, function (confirmBtn) {
            if (!confirmBtn) {
              C.showBubble('❌ 未找到确定按钮', 'err');
              setTimeout(C.hideBubble, 2000);
              return;
            }
            editLog('确认清空');
            confirmBtn.click();

            // 6. 再次悬浮「批量操作」
            setTimeout(function () {
              editLog('展开批量操作菜单');
              C.hoverElement(trigger);

              // 7. 点击「批量传图」
              waitForVisibleLi('批量传图', 3000, function (batchImgItem) {
                if (!batchImgItem) {
                  C.showBubble('❌ 未找到批量传图', 'err');
                  setTimeout(C.hideBubble, 2000);
                  return;
                }
                editLog('打开批量传图');
                batchImgItem.click();
                C.unhoverElement(trigger);

                // 8. 等批量传图弹窗，悬浮「选择图片」
                C.waitForElement('.batch-smt-image', 5000, function (batchPanel) {
                  if (!batchPanel) {
                    C.showBubble('❌ 未找到批量传图弹窗', 'err');
                    setTimeout(C.hideBubble, 2000);
                    return;
                  }
                  var selectBtn = null;
                  var btns = batchPanel.querySelectorAll('button');
                  for (var bi = 0; bi < btns.length; bi++) {
                    if ((btns[bi].textContent || '').indexOf('选择图片') !== -1) {
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
                    if (p.classList.contains('ant-dropdown-trigger')) { ddTrigger = p; break; }
                    p = p.parentElement;
                  }
                  setTimeout(function () {
                    C.hoverElement(ddTrigger);
                    hoverWithCoords(ddTrigger);
                    if (ddTrigger !== selectBtn) {
                      C.hoverElement(selectBtn);
                    }
                  }, 800);

                  // 9. 点击「引用产品轮播图」
                  waitForVisibleLi('引用产品轮播图', 5000, function (carouselItem) {
                    if (!carouselItem) {
                      C.showBubble('❌ 未找到引用产品轮播图', 'err');
                      setTimeout(C.hideBubble, 2000);
                      return;
                    }
                    editLog('引用产品轮播图');
                    carouselItem.click();

                    // 10. 轮询等待「引用产品图片」弹窗出现
                    (function () {
                      var start = Date.now();
                      (function check() {
                        var titles = document.querySelectorAll('.ant-modal-title');
                        for (var t = 0; t < titles.length; t++) {
                          if ((titles[t].textContent || '').indexOf('引用产品图片') !== -1) {
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
                        var labels = imgModal.querySelectorAll('label.ant-checkbox-wrapper');
                        for (var k = 0; k < labels.length; k++) {
                          var spans = labels[k].querySelectorAll(':scope > span');
                          for (var s = 0; s < spans.length; s++) {
                            if (spans[s].textContent === '\u5168\u90e8') {
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

                        // 11. 点击「选择」按钮
                        setTimeout(function () {
                          editLog('确认选择图片');
                          var selectBtn2 = imgModal.querySelector('.ant-modal-footer .ant-btn-primary');
                          if (!selectBtn2) {
                            C.showBubble('❌ 未找到选择按钮', 'err');
                            setTimeout(C.hideBubble, 2000);
                            return;
                          }
                          selectBtn2.click();

                          // 12. 点击「批量传图」弹窗的「确定」
                          setTimeout(function () {
                            editLog('确认批量传图');
                            var batchModal = null;
                            var titles2 = document.querySelectorAll('.ant-modal-title');
                            for (var bt = 0; bt < titles2.length; bt++) {
                              if ((titles2[bt].textContent || '').indexOf('批量传图') !== -1) {
                                var bEl = titles2[bt];
                                while (bEl && !bEl.classList.contains('ant-modal-wrap')) { bEl = bEl.parentElement; }
                                if (bEl) { batchModal = bEl; break; }
                              }
                            }
                            if (!batchModal) {
                              C.showBubble('❌ 未找到批量传图弹窗', 'err');
                              setTimeout(C.hideBubble, 2000);
                              return;
                            }
                            var confirmBatchBtn = batchModal.querySelector('.ant-modal-footer .ant-btn-primary');
                            if (!confirmBatchBtn) {
                              C.showBubble('❌ 未找到批量传图确定按钮', 'err');
                              setTimeout(C.hideBubble, 2000);
                              return;
                            }
                            confirmBatchBtn.click();

                            // 13. 点击「保存」
                            setTimeout(function () {
                              editLog('保存描述');
                              var saveBtn = document.querySelector('.smt-new-editor .btn-orange');
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
                          }, 600);
                        }, 600);
                      }, 600);
                    }
                  });
                });
              });
            }, 800);
          });
        }, 800);
      });
    });
  }
})();
