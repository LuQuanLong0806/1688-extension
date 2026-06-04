// 店小秘变种属性下拉自动匹配 v6 (已验证通过)
// 用法: await setVariantAttrs('颜色', '数量')
// 关键: ant-select 用 mousedown 触发, 每次操作重新查询 DOM 避免引用过期
async function setVariantAttrs(name1, name2) {
  var targets = [name1 || '', name2 || ''];

  function delay(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function getSelects() {
    var s = document.querySelectorAll('#skuAttrsInfo [popupclassname="custom-theme-select-dropdown"]');
    return s.length >= 2 ? [s[0], s[1]] : null;
  }

  function getCurrent(sel) {
    var item = sel.querySelector('.ant-select-selection-item');
    return item ? (item.getAttribute('title') || item.innerText.trim()) : '';
  }

  async function closeAllDropdowns() {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
    await delay(400);
  }

  async function openAndGetOptions(selIndex) {
    await closeAllDropdowns();
    await delay(200);

    var sels = getSelects();
    if (!sels) return [];
    var sel = sels[selIndex];

    var trigger = sel.querySelector('.ant-select-selector');
    trigger.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    await delay(600);

    var input = sel.querySelector('.ant-select-selection-search-input');
    var listId = input ? input.getAttribute('aria-controls') : '';
    var listEl = listId ? document.getElementById(listId) : null;

    if (!listEl) {
      var dropdowns = document.querySelectorAll('.ant-select-dropdown.custom-theme-select-dropdown');
      for (var i = 0; i < dropdowns.length; i++) {
        var d = dropdowns[i];
        if (d.style.display === 'none') continue;
        var items = d.querySelectorAll('.ant-select-item');
        if (items.length > 0) {
          var options = [];
          items.forEach(function (it) {
            var text = it.getAttribute('title') || it.innerText.trim();
            if (text) options.push({ text: text, el: it });
          });
          return options;
        }
      }
      console.warn('[变种属性] 未找到list, listId:', listId);
      return [];
    }

    var dropdown = listEl.closest('.ant-select-dropdown');
    if (!dropdown) return [];

    var options = [];
    dropdown.querySelectorAll('.ant-select-item').forEach(function (it) {
      var text = it.getAttribute('title') || it.innerText.trim();
      if (text) options.push({ text: text, el: it });
    });
    return options;
  }

  async function doSelect(selIndex, value) {
    var options = await openAndGetOptions(selIndex);
    console.log('[变种属性] sels[' + selIndex + '] 可选:', options.map(function (o) { return o.text; }));
    var clicked = false;
    for (var j = 0; j < options.length; j++) {
      if (options[j].text === value) {
        options[j].el.click();
        clicked = true;
        console.log('[变种属性] sels[' + selIndex + '] 选中:', value);
        break;
      }
    }
    await delay(400);
    return clicked;
  }

  var sels = getSelects();
  if (!sels) { console.error('[变种属性] 下拉未找到'); return; }
  var currents = [getCurrent(sels[0]), getCurrent(sels[1])];
  console.log('[变种属性] 当前:', currents[0], '|', currents[1]);
  console.log('[变种属性] 目标:', targets[0], '|', targets[1]);

  var needChange = targets.map(function (t, i) { return t && t !== currents[i]; });
  if (!needChange[0] && !needChange[1]) {
    console.log('[变种属性] 已一致，无需操作');
    return;
  }

  var isSwap = needChange[0] && needChange[1] &&
    targets[0] === currents[1] && targets[1] === currents[0];

  if (isSwap) {
    console.log('[变种属性] 检测到交换场景，使用临时值策略');
    var opts = await openAndGetOptions(0);
    var tempValue = '';
    for (var i = 0; i < opts.length; i++) {
      if (opts[i].text !== targets[0] && opts[i].text !== targets[1]) {
        tempValue = opts[i].text;
        break;
      }
    }
    if (!tempValue) { console.error('[变种属性] 找不到临时值'); return; }
    console.log('[变种属性] 临时值:', tempValue);
    await doSelect(0, tempValue);
    await doSelect(1, targets[1]);
    await doSelect(0, targets[0]);
  } else {
    for (var k = 0; k < 2; k++) {
      if (!needChange[k]) continue;
      var ok = await doSelect(k, targets[k]);
      if (!ok) console.error('[变种属性] 选择失败:', targets[k]);
    }
  }

  sels = getSelects();
  var finalC = sels ? [getCurrent(sels[0]), getCurrent(sels[1])] : ['?', '?'];
  console.log('[变种属性] 完成:', finalC[0], '|', finalC[1]);
  var success = (finalC[0] === targets[0] || !targets[0]) && (finalC[1] === targets[1] || !targets[1]);
  console.log('[变种属性] 结果:', success ? '成功' : '失败');
}
