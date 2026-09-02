// Temu 卖家后台 (agentseller.temu.com) 辅助脚本 — 一键重复操作
// 悬浮苹果按钮 + 步骤气泡提示 (风格对齐店小秘小蜜蜂)
(function () {
  'use strict';

  // 防重复注入
  if (window.__TEMU_HELPER_LOADED__) return;
  window.__TEMU_HELPER_LOADED__ = true;

  // ============ 配置 ============

  // 与 1688/店小秘端共用同一套本地服务地址
  var SERVER_URL_KEY = '1688_server_url';
  var DEFAULT_SERVER = 'http://localhost:3000';
  var POS_KEY = '__temu_btn_pos';

  function getServerUrl() {
    try {
      return localStorage.getItem(SERVER_URL_KEY) || DEFAULT_SERVER;
    } catch (e) {
      return DEFAULT_SERVER;
    }
  }

  function setServerUrl(url) {
    try {
      localStorage.setItem(SERVER_URL_KEY, url);
      if (window.chrome && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ '1688_server_url': url });
      }
    } catch (e) {}
  }

  // ============ 气泡 + 按钮样式 ============

  var STYLE_CSS = [
    '#__temu_wrap { position: fixed; z-index: 2147483647; }',
    '#__temu_bubble {',
    '  position: absolute; right: 0; bottom: calc(100% + 12px);',
    '  min-width: 110px; max-width: 300px; padding: 8px 12px;',
    '  background: #fff; color: #C62828; font-size: 12px; line-height: 1.6;',
    '  border: 1px solid #FF8A80; border-radius: 10px;',
    '  box-shadow: 0 3px 14px rgba(229, 57, 53, 0.22);',
    '  white-space: pre-wrap; word-break: break-all; text-align: left;',
    '  opacity: 0; transform: translateY(6px); transition: opacity .18s, transform .18s;',
    '  pointer-events: none;',
    '}',
    '#__temu_bubble.show { opacity: 1; transform: none; }',
    '#__temu_bubble::before {',
    '  content: ""; position: absolute; right: 15px; top: 100%;',
    '  border: 7px solid transparent; border-top-color: #FF8A80;',
    '}',
    '#__temu_bubble::after {',
    '  content: ""; position: absolute; right: 15px; top: 100%; margin-top: -1px;',
    '  border: 7px solid transparent; border-top-color: #fff;',
    '}',
    '#__temu_btn {',
    '  width: 50px; height: 50px; display: flex; align-items: center; justify-content: center;',
    '  cursor: pointer; user-select: none;',
    '  filter: drop-shadow(0 3px 7px rgba(198, 40, 40, 0.35));',
    '  transition: transform .15s;',
    '}',
    '#__temu_btn:hover { transform: scale(1.1); }',
    '#__temu_btn:active { transform: scale(0.95); }',
    '#__temu_btn svg { animation: __temu_float 3.2s ease-in-out infinite; }',
    '@keyframes __temu_float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-2px); } }'
  ].join('\n');

  // 苹果 SVG: 果身(双瓣顶部凹陷) + 果梗 + 叶子 + 光泽高光, 红色渐变
  var APPLE_SVG =
    '<svg viewBox="0 0 64 64" width="48" height="48" xmlns="http://www.w3.org/2000/svg">' +
    '<defs>' +
    '<linearGradient id="__temu_apple" x1="0" y1="0" x2=".5" y2="1">' +
    '<stop offset="0" stop-color="#FF8A80"/><stop offset=".4" stop-color="#EF5350"/>' +
    '<stop offset="1" stop-color="#C62828"/>' +
    '</linearGradient>' +
    '<linearGradient id="__temu_leaf" x1="0" y1="0" x2="1" y2="1">' +
    '<stop offset="0" stop-color="#A5D6A7"/><stop offset="1" stop-color="#43A047"/>' +
    '</linearGradient>' +
    '</defs>' +
    // 果梗
    '<path d="M 32 21 C 31 15, 33 10, 37 7" fill="none" stroke="#8D6E63" stroke-width="3" stroke-linecap="round"/>' +
    // 叶子
    '<path d="M 34 15 C 36 8, 44 6, 48 8 C 47 15, 40 18, 34 15 Z" fill="url(#__temu_leaf)"/>' +
    // 果身: 顶部双瓣凹陷, 底部微沟
    '<path fill="url(#__temu_apple)" d="M 32 21 C 27 14, 17 14, 13 22' +
    ' C 9 30, 12 44, 20 51 C 25 55, 29 53, 32 51' +
    ' C 35 53, 39 55, 44 51 C 52 44, 55 30, 51 22' +
    ' C 47 14, 37 14, 32 21 Z"/>' +
    // 光泽高光
    '<ellipse cx="22" cy="28" rx="5.5" ry="9" fill="#fff" opacity=".35" transform="rotate(-18 22 28)"/>' +
    '</svg>';

  // ============ 核心: 一键重复操作 ============

  // 当前实现 = 编辑合规信息抽屉自动填写（固定值见 temu-compliance.js CONFIG）
  function doRepeatAction() {
    if (window.TemuCompliance && window.TemuCompliance.run) {
      TemuCompliance.run();
    } else {
      showBubble('一键重复操作：功能开发中', 2000);
    }
  }

  // ============ 气泡提示 (按钮上方, 跟随按钮) ============

  var bubbleTimer = null;

  function showBubble(text, ms) {
    var b = document.getElementById('__temu_bubble');
    if (!b) return;
    b.textContent = text;
    b.classList.add('show');
    if (bubbleTimer) clearTimeout(bubbleTimer);
    if (ms) bubbleTimer = setTimeout(function () { b.classList.remove('show'); }, ms);
  }

  function hideBubble() {
    var b = document.getElementById('__temu_bubble');
    if (b) b.classList.remove('show');
    if (bubbleTimer) clearTimeout(bubbleTimer);
  }

  // ============ 顶部轻提示 (兜底) ============

  var toastTimer = null;

  function showToast(text, ms) {
    var toastEl = document.getElementById('__temu_toast');
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.id = '__temu_toast';
      toastEl.style.cssText = 'position:fixed;top:40px;left:50%;transform:translateX(-50%);' +
        'background:#EF5350;color:#fff;padding:8px 18px;border-radius:20px;font-size:13px;' +
        'z-index:2147483647;box-shadow:0 2px 8px rgba(0,0,0,.2);transition:opacity .3s;opacity:0;';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = text;
    toastEl.style.opacity = '1';
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.style.opacity = '0';
    }, ms || 2000);
  }

  // ============ 悬浮按钮 ============

  function createFloatBtn() {
    if (document.getElementById('__temu_wrap')) return;

    // 样式
    var style = document.createElement('style');
    style.id = '__temu_style';
    style.textContent = STYLE_CSS;
    document.head.appendChild(style);

    // 容器: 气泡 + 按钮 (拖动时整体移动)
    var wrap = document.createElement('div');
    wrap.id = '__temu_wrap';
    wrap.style.bottom = '120px';
    wrap.style.right = '24px';

    var bubbleEl = document.createElement('div');
    bubbleEl.id = '__temu_bubble';

    var btn = document.createElement('div');
    btn.id = '__temu_btn';
    btn.title = 'Temu 辅助 - 一键填写合规信息';
    btn.innerHTML = APPLE_SVG;

    wrap.appendChild(bubbleEl);
    wrap.appendChild(btn);

    // 恢复上次位置
    try {
      var saved = JSON.parse(localStorage.getItem(POS_KEY) || 'null');
      if (saved && saved.bottom !== undefined && saved.right !== undefined) {
        wrap.style.bottom = saved.bottom + 'px';
        wrap.style.right = saved.right + 'px';
      }
    } catch (e) {}

    // 拖动支持 (位移 >4px 判定为拖动, 不触发点击)
    var startX = 0, startY = 0, startBottom = 0, startRight = 0, moved = false, dragging = false;

    btn.addEventListener('mousedown', function (e) {
      dragging = true;
      moved = false;
      startX = e.clientX;
      startY = e.clientY;
      startBottom = parseInt(wrap.style.bottom, 10) || 0;
      startRight = parseInt(wrap.style.right, 10) || 0;
      e.preventDefault();
    });

    document.addEventListener('mousemove', function (e) {
      if (!dragging) return;
      var dx = e.clientX - startX;
      var dy = e.clientY - startY;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) moved = true;
      wrap.style.bottom = Math.max(0, startBottom - dy) + 'px';
      wrap.style.right = Math.max(0, startRight - dx) + 'px';
    });

    document.addEventListener('mouseup', function () {
      if (!dragging) return;
      dragging = false;
      if (moved) {
        try {
          localStorage.setItem(POS_KEY, JSON.stringify({
            bottom: parseInt(wrap.style.bottom, 10) || 0,
            right: parseInt(wrap.style.right, 10) || 0
          }));
        } catch (e) {}
      }
    });

    // 点击: 未拖动时触发功能
    btn.addEventListener('click', function () {
      if (moved) return;
      doRepeatAction();
    });

    document.body.appendChild(wrap);
    console.log('[Temu助手] 苹果按钮已加载, server:', getServerUrl());
  }

  // ============ 入口 ============

  function init() {
    if (document.body) {
      createFloatBtn();
    } else {
      document.addEventListener('DOMContentLoaded', createFloatBtn);
    }
  }

  init();

  // 暴露给控制台调试, 后续模块可扩展到 window.TemuHelper
  window.TemuHelper = {
    getServerUrl: getServerUrl,
    setServerUrl: setServerUrl,
    showToast: showToast,
    showBubble: showBubble,
    hideBubble: hideBubble
  };
})();
