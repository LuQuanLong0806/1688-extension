// Temu 卖家后台 — 「编辑合规信息」抽屉自动填写
// 固定填写: 警示类型 / 欧盟负责人 / 制造商信息 / 土耳其负责人 / 包装材料信息
// 组件为 Ant Design 同构 (rocket- 前缀), 下拉定位优先用 role=option / aria-controls, 与 class 命名解耦
(function () {
  'use strict';

  if (window.__TEMU_COMPLIANCE_LOADED__) return;
  window.__TEMU_COMPLIANCE_LOADED__ = true;

  // ============ 固定配置（按需修改） ============

  var CONFIG = {
    drawerTitle: '编辑合规信息',
    // #4 加州65号提案 → 警示类型
    warningType: 'No Warning Applicable/无需警示',
    // 韩国公示信息 / 其他合规信息 → 组内所有下拉: 有「该项目不适用该产品」选项就选它, 没有则保持原样
    notApplicable: '该项目不适用该产品',
    // 其他合规信息 → 商品识别码固定填写
    productIdCode: 'H20260309',
    // #25 欧盟负责人 / #60 制造商信息 / #84 土耳其负责人 → 固定选下拉的第一个选项 (target 传 null)
    // #166 包装材料信息收集（商品规格下拉点「全选」; 第一行规格填好后点「一键填充其他规格」传播）
    pack: {
      skuSelectAll: true,             // 商品规格下拉直接选「全选」
      materialCategory: '塑料',       // 材质分类
      materialName: '其他塑料',       // 材料名称
      singleUsePlastic: '是',         // 它是否含有一次性塑料
      packType: '软包装',             // 包装类型
      weight: '0.5'                   // 包装材料重量 (g)
    }
  };

  // ============ 基础工具 ============

  function sleep(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  }

  // 轮询等待 fn() 返回真值, 超时返回 null (50ms 粒度, 减少检测延迟)
  function waitFor(fn, timeout) {
    var start = Date.now();
    return new Promise(function (resolve) {
      (function check() {
        var v = fn();
        if (v) return resolve(v);
        if (Date.now() - start > (timeout || 3000)) return resolve(null);
        setTimeout(check, 50);
      })();
    });
  }

  // React 兼容赋值
  function setInputValue(input, val) {
    var proto = input.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    var nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    nativeSetter.call(input, val);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // 带坐标的完整点击序列 (打开 AntD 系 Select 必须用 mousedown 而非 click)
  function fireClick(el) {
    var rect = el.getBoundingClientRect();
    var opts = { bubbles: true, cancelable: true, view: window, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
    el.dispatchEvent(new PointerEvent('pointerdown', opts));
    el.dispatchEvent(new MouseEvent('mousedown', opts));
    el.dispatchEvent(new PointerEvent('pointerup', opts));
    el.dispatchEvent(new MouseEvent('mouseup', opts));
    el.dispatchEvent(new MouseEvent('click', opts));
  }

  // 排查日志: [Temu合规 +耗时ms]
  var T0 = Date.now();
  function log(msg) {
    console.log('%c[Temu合规 +' + (Date.now() - T0) + 'ms] ' + msg, 'color:#E65100;font-weight:bold');
  }

  // 点击抽屉内空白处(标题栏)收起下拉
  // 注意: 不用 ESC(会冒泡到 document, AntD 抽屉监听 ESC 会误关抽屉), 不点遮罩(会关抽屉)
  function closeDropdownByBlank() {
    var drawer = findDrawer();
    var blank = null;
    if (drawer) {
      blank = drawer.querySelector('.rocket-drawer-title') || drawer.querySelector('.rocket-drawer-header');
    }
    if (!blank) blank = document.querySelector('.rocket-drawer-title');
    if (blank) {
      log('点击抽屉标题空白处收起下拉');
      fireClick(blank);
      return true;
    }
    log('⚠️ 未找到抽屉标题(空白处), 无法收起下拉');
    return false;
  }

  function toast(text, ms) {
    if (window.TemuHelper) TemuHelper.showToast(text, ms || 1800);
  }

  // 步骤气泡: 显示在如意按钮上方, 跟随按钮 (无 TemuHelper 时退化为顶部 toast)
  // ms=0/不传 → 常驻, 直到下一次 bubble 调用覆盖
  function bubble(text, ms) {
    if (window.TemuHelper && TemuHelper.showBubble) TemuHelper.showBubble(text, ms || 0);
    else toast(text, ms);
  }

  function txt(el) {
    return ((el && el.textContent) || '').trim();
  }

  // 元素是否已在可视区 (在则跳过滚动定位, 省去滚动等待)
  function inViewport(el) {
    var r = el.getBoundingClientRect();
    return r.top >= 0 && r.bottom <= window.innerHeight && r.left >= 0 && r.right <= window.innerWidth;
  }

  // 步骤开始时滚动到模块顶部 (便于人工跟随查看)
  async function scrollToModule(el) {
    if (!el) return;
    el.scrollIntoView({ block: 'start' });
    await sleep(120);
  }

  // ============ 抽屉/区块定位 ============

  // 找到打开中的「编辑合规信息」抽屉
  function findDrawer() {
    var drawers = document.querySelectorAll('.rocket-drawer-open');
    for (var i = 0; i < drawers.length; i++) {
      var title = drawers[i].querySelector('.rocket-drawer-title');
      if (title && txt(title).indexOf(CONFIG.drawerTitle) !== -1) return drawers[i];
    }
    return null;
  }

  // 按区块 id 定位 (#4/#25/#60/#84/#166) — 纯数字 id 可能与页面其他元素冲突, 命中后需校验含下拉
  function findSectionById(drawer, sectionId) {
    return drawer.querySelector('[id="' + sectionId + '"]');
  }

  // 按蓝色标题文本定位: 从标题向上找最近的带 id 容器
  function findSectionByTitle(drawer, titleText) {
    var heads = drawer.querySelectorAll('.rocket-drawer-body div');
    for (var i = 0; i < heads.length; i++) {
      if (txt(heads[i]) === titleText && heads[i].style.borderLeft) {
        var node = heads[i];
        while (node && node !== drawer) {
          if (node.id) return node;
          node = node.parentElement;
        }
      }
    }
    return null;
  }

  // 按蓝色标题定位模块组根容器: 标题 → 头部行 → 组根节点 (要求组内含下拉, 防定位到共享外层)
  function findGroupByTitle(drawer, titleText) {
    var heads = drawer.querySelectorAll('.rocket-drawer-body div');
    for (var i = 0; i < heads.length; i++) {
      if (txt(heads[i]) === titleText && heads[i].style.borderLeft) {
        var row = heads[i].parentElement;      // 头部行
        var root = row && row.parentElement;   // 组根节点
        if (root && root.querySelector('.rocket-select')) return root;
      }
    }
    return null;
  }

  // ============ 下拉选择通用逻辑 ============

  // 读取多选/单选当前已选值 (selection-item 与 tag 两种形态)
  function getSelectedValues(selectorEl) {
    var vals = [];
    var items = selectorEl.querySelectorAll('.rocket-select-selection-item');
    for (var i = 0; i < items.length; i++) {
      var t = items[i].getAttribute('title') || txt(items[i]);
      if (t) vals.push(t);
    }
    var tags = selectorEl.querySelectorAll('.rocket-tag');
    for (var j = 0; j < tags.length; j++) {
      if (txt(tags[j])) vals.push(txt(tags[j]));
    }
    return vals;
  }

  function hasValue(vals, target) {
    for (var i = 0; i < vals.length; i++) {
      if (vals[i] === target || vals[i].indexOf(target) !== -1 || target.indexOf(vals[i]) !== -1) return true;
    }
    return false;
  }

  // 查找当前已展开的下拉容器 (.rocket-select-dropdown), 未展开返回 null
  // 注意: 下拉内有两套选项 — 隐藏无障碍 listbox #[inputId]_list > [role=option] (不可点) 和
  //       可见虚拟列表 .rocket-virtual-list > .rocket-select-item-option (可点, title=显示文本)
  function findOpenedList(input) {
    var listId = input.getAttribute('aria-controls') || input.getAttribute('aria-owns');
    var list = listId ? document.getElementById(listId) : null;
    var drop = list ? list.closest('.rocket-select-dropdown') : null;
    if (drop && !drop.classList.contains('rocket-select-dropdown-hidden')) return drop;
    // 兜底: 找任意未隐藏且有选项的下拉容器
    var drops = document.querySelectorAll('.rocket-select-dropdown');
    for (var i = 0; i < drops.length; i++) {
      if (!drops[i].classList.contains('rocket-select-dropdown-hidden') &&
          drops[i].querySelector('.rocket-select-item-option, [role="option"]')) {
        return drops[i];
      }
    }
    return null;
  }

  // 打开下拉 (最多重试 3 次): 点击 selector → 等待选项列表出现
  async function openSelect(input) {
    var selectEl = input.closest('.rocket-select');
    if (!selectEl) { log('⚠️ input 不在 .rocket-select 内: #' + input.id); return null; }
    var selector = selectEl.querySelector('.rocket-select-selector');
    if (!selector) { log('⚠️ 未找到 .rocket-select-selector: #' + input.id); return null; }

    for (var attempt = 1; attempt <= 3; attempt++) {
      fireClick(selector);
      var list = await waitFor(function () { return findOpenedList(input); }, 1500);
      if (list) {
        var optsNow = getOptions(list);
        var first = optsNow[0];
        log('下拉已打开 (第' + attempt + '次尝试, #' + input.id + '), 可见选项数=' + optsNow.length +
          (first ? ', 首项=' + optionLabel(first) : ''));
        return list;
      }
      log('第' + attempt + '次打开下拉失败 (#' + input.id + '), 重试...');
      await sleep(300);
    }
    log('⚠️ 下拉 3 次均未打开: #' + input.id);
    return null;
  }

  // 获取下拉当前真实可见的选项 (可见项 .rocket-select-item-option 优先; 兜底隐藏 [role=option])
  function getOptions(dropEl) {
    var vis = dropEl.querySelectorAll('.rocket-select-item-option');
    if (vis.length) return vis;
    return dropEl.querySelectorAll('[role="option"]');
  }

  // 解析选项显示文本: 可见项取 title/内容; 无障碍项取 aria-label
  function optionLabel(opt) {
    if (opt.classList.contains('rocket-select-item-option')) {
      return opt.getAttribute('title') || txt(opt.querySelector('.rocket-select-item-option-content')) || txt(opt);
    }
    return opt.getAttribute('aria-label') || opt.getAttribute('title') || txt(opt);
  }

  function isOptDisabled(opt) {
    return opt.getAttribute('aria-disabled') === 'true' ||
      opt.className.indexOf('option-disabled') !== -1;
  }

  // 在可见选项中点击匹配项: 先精确, 后包含 (原生 .click(), React 委托事件可响应)
  function clickOption(dropEl, target) {
    var opts = getOptions(dropEl);
    var fallback = null;
    var names = [];
    for (var i = 0; i < opts.length; i++) {
      if (isOptDisabled(opts[i])) continue;
      var label = optionLabel(opts[i]);
      names.push(label);
      if (label === target || txt(opts[i]) === target) {
        opts[i].click();
        log('→ 已点击选项「' + label + '」');
        return true;
      }
      if (!fallback && label && (label.indexOf(target) !== -1 || target.indexOf(label) !== -1)) fallback = opts[i];
    }
    if (fallback) {
      fallback.click();
      log('→ 模糊匹配, 已点击选项「' + optionLabel(fallback) + '」');
      return true;
    }
    log('→ 未匹配到「' + target + '」, 当前选项=' + JSON.stringify(names));
    return false;
  }

  // 多选下拉点「全选」选项 (已全选则跳过, 防止再次点击变成取消全选)
  async function selectAllInSelect(input) {
    log('商品规格下拉 → 点「全选」(#' + input.id + ')');
    var selectEl = input.closest('.rocket-select');
    var selector = selectEl.querySelector('.rocket-select-selector');
    if (!inViewport(selector)) {
      selector.scrollIntoView({ block: 'center' });
      await sleep(80);
    }

    var list = await openSelect(input);
    if (!list) return 'no-dropdown';

    function scanAll(dropEl) {
      var opts = getOptions(dropEl);
      var names = [];
      for (var i = 0; i < opts.length; i++) {
        var label = optionLabel(opts[i]);
        names.push(label);
        if ((label && label.indexOf('全选') !== -1) ||
            opts[i].getAttribute('title') === 'SELECT_ALL_KEY' ||
            txt(opts[i]) === 'SELECT_ALL_KEY') return opts[i];
      }
      log('→ 本次扫描无「全选」, 选项=' + JSON.stringify(names));
      return null;
    }
    var allOpt = scanAll(list);
    if (!allOpt) {
      // 虚拟列表可能未渲染首项, 滚回顶部再扫一次
      var holder = list.querySelector('[class*="virtual-list-holder"]');
      if (holder) {
        log('→ 滚动下拉列表到顶部后重扫');
        holder.scrollTop = 0;
        await sleep(300);
        allOpt = scanAll(list);
      }
    }
    if (!allOpt) {
      closeDropdownByBlank();
      return 'no-select-all';
    }
    // 选项已勾选 = 已是全选状态, 跳过
    if (allOpt.getAttribute('aria-selected') === 'true') {
      log('→ 「全选」已勾选, 跳过');
      closeDropdownByBlank();
      return 'skip';
    }
    fireClick(allOpt);
    await sleep(150);
    closeDropdownByBlank();
    log('→ 已点击「全选」');
    return 'ok';
  }

  /**
   * 填充一个 rocket-select
   * @param input select 的搜索 input (rocket-select-selection-search-input)
   * @param target 目标值文本
   */
  // 点击下拉的第一个可用选项
  function clickFirstOption(dropEl) {
    var opts = getOptions(dropEl);
    for (var i = 0; i < opts.length; i++) {
      if (isOptDisabled(opts[i])) continue;
      opts[i].click();
      log('→ 已点击第一个选项「' + optionLabel(opts[i]) + '」');
      return true;
    }
    log('→ 下拉无可用选项');
    return false;
  }

  // 填充下拉: target 传 null 表示固定选第一个选项
  async function fillSelect(input, target) {
    var selectEl = input.closest('.rocket-select');
    var selector = selectEl.querySelector('.rocket-select-selector');
    var cur = getSelectedValues(selector);
    log('填写下拉(#' + input.id + ') 目标=' + (target ? '「' + target + '」' : '[第一个选项]') + ', 当前已选=' + JSON.stringify(cur));

    // 已选则跳过 (多选重复点击会反选, 必须先检查; 第一个选项模式下已有任意选中值即视为完成)
    if (target ? hasValue(cur, target) : cur.length > 0) {
      log('→ 已有选中值, 跳过');
      return 'skip';
    }

    if (!inViewport(selector)) {
      selector.scrollIntoView({ block: 'center' });
      await sleep(80);
    }

    var list = await openSelect(input);
    if (!list) return 'no-dropdown';

    var ok;
    if (target) {
      // 第一次尝试: 直接匹配
      ok = clickOption(list, target);
      // 第二次尝试: 输入搜索过滤后轮询匹配 (远程搜索型下拉选项异步加载)
      if (!ok && !input.readOnly) {
        log('→ 直接匹配失败, 输入搜索关键字「' + target + '」');
        setInputValue(input, target);
        await sleep(300);
        for (var tries = 0; tries < 4 && !ok; tries++) {
          list = findOpenedList(input) || await openSelect(input);
          if (list) ok = clickOption(list, target);
          if (!ok) await sleep(300);
        }
        log(ok ? '→ 搜索后匹配成功' : '→ 搜索后仍未匹配到「' + target + '」');
      } else if (!ok) {
        log('→ 搜索框只读, 无法输入过滤');
      }
    } else {
      // 固定选第一个选项
      ok = clickFirstOption(list);
    }

    // 多选模式点完不自动收起 → 点抽屉空白处收起; 单选自动关闭
    await sleep(60);
    if (selectEl.classList.contains('rocket-select-multiple')) closeDropdownByBlank();

    // 校验 (轮询 600ms 等待选中标签渲染)
    var vals = await waitFor(function () {
      var v = getSelectedValues(selector);
      return v.length > 0 ? v : null;
    }, 600);
    vals = vals || [];
    var pass = target ? hasValue(vals, target) : vals.length > 0;
    if (pass) {
      log('→ 校验通过, 已选=' + JSON.stringify(vals));
      return 'ok';
    }
    log('⚠️ 校验未通过, 点击过选项=' + ok + ', selector内容=' +
      selector.innerHTML.replace(/\s+/g, ' ').slice(0, 250));
    return ok ? 'unverified' : 'not-found';
  }

  // ============ 各区块填写 ============

  async function fillSectionSelect(drawer, sectionId, titleText, target, label) {
    // 区块和控件都带重试等待; id 命中的容器若没有下拉控件, 再按标题文本兜底重找 (纯数字 id 可能撞上无关元素)
    function findInput(secEl) {
      return secEl.querySelector('.rocket-select-selection-search-input') || secEl.querySelector('input[role="combobox"]');
    }
    var sec = await waitFor(function () { return findSectionById(drawer, sectionId); }, 2500);
    var input = sec ? await waitFor(function () { return findInput(sec); }, 2500) : null;
    if (!input) {
      var alt = await waitFor(function () { return findSectionByTitle(drawer, titleText); }, 2500);
      if (alt) {
        log(label + ': id#' + sectionId + ' 内无下拉, 按标题「' + titleText + '」兜底 → #' + (alt.id || '(无id)'));
        sec = alt;
        input = await waitFor(function () { return findInput(sec); }, 2500);
      }
    }
    if (!input) {
      if (sec) {
        log('⚠️ ' + label + ': 区块#' + sec.id + ' 内无下拉控件 (rocket-select数=' + sec.querySelectorAll('.rocket-select').length + ')');
        return { ok: false, msg: label + ': 控件缺失' };
      }
      log('⚠️ ' + label + ': 未找到区块[' + titleText + '] (id=' + sectionId + ')');
      return { ok: false, msg: label + ': 区块缺失' };
    }
    log('── ' + label + ': 定位到区块#' + sec.id + ', 控件#' + input.id);
    await scrollToModule(sec);
    var r = await fillSelect(input, target);
    if (r === 'ok') return { ok: true, msg: label + ' ✓' };
    if (r === 'skip') return { ok: true, msg: label + ' 已选 ✓' };
    if (r === 'unverified') return { ok: true, msg: label + ' 已点选(未验证) ~' };
    return { ok: false, msg: label + ': ' + (r === 'no-dropdown' ? '下拉打不开' : '未找到选项「' + target + '」') };
  }

  // 有指定选项就选, 没有则保持原样 (选项列表短, 不走搜索过滤)
  async function fillSelectIfPresent(input, target) {
    var selectEl = input.closest('.rocket-select');
    var selector = selectEl.querySelector('.rocket-select-selector');
    var cur = getSelectedValues(selector);
    log('检查下拉(#' + input.id + ') 当前已选=' + JSON.stringify(cur));
    if (hasValue(cur, target)) {
      log('→ 已选「' + target + '」, 跳过');
      return 'skip';
    }
    if (!inViewport(selector)) {
      selector.scrollIntoView({ block: 'center' });
      await sleep(80);
    }
    var list = await openSelect(input);
    if (!list) return 'no-dropdown';
    var opts = getOptions(list);
    var hit = null;
    for (var i = 0; i < opts.length; i++) {
      if (isOptDisabled(opts[i])) continue;
      if (optionLabel(opts[i]) === target) { hit = opts[i]; break; }
    }
    if (!hit) {
      log('→ 无「' + target + '」选项(共' + opts.length + '个), 保持原样');
      closeDropdownByBlank();
      return 'absent';
    }
    hit.click();
    log('→ 已点击选项「' + target + '」');
    await sleep(60);
    if (selectEl.classList.contains('rocket-select-multiple')) closeDropdownByBlank();
    var vals = await waitFor(function () {
      var v = getSelectedValues(selector);
      return v.length > 0 ? v : null;
    }, 600);
    return (vals && hasValue(vals, target)) ? 'ok' : 'unverified';
  }

  // 模块组(韩国公示信息/其他合规信息): 组内所有下拉, 有「不适用」选项就选, 没有保持原样
  // 字段动态、个数不固定 → 不按字段名定位, 直接枚举组内全部 .rocket-select
  async function fillGroupNotApplicable(drawer, titleText, label) {
    var group = await waitFor(function () { return findGroupByTitle(drawer, titleText); }, 2000);
    if (!group) {
      log('⚠️ ' + label + ': 未找到模块(可能该商品不显示), 跳过');
      return { ok: true, msg: label + ' 未显示(跳过)' };
    }
    await scrollToModule(group);
    var inputs = group.querySelectorAll('.rocket-select-selection-search-input');
    log(label + ': 组内下拉数=' + inputs.length);
    if (!inputs.length) return { ok: false, msg: label + ': 无下拉控件' };
    var selected = 0, absent = 0;
    for (var i = 0; i < inputs.length; i++) {
      var r = await fillSelectIfPresent(inputs[i], CONFIG.notApplicable);
      if (r === 'ok' || r === 'skip' || r === 'unverified') selected++;
      else if (r === 'absent') absent++;
      else return { ok: false, msg: label + ': 下拉#' + inputs[i].id + ' 打不开' };
      await sleep(150);
    }
    return {
      ok: true,
      msg: label + ' ✓(下拉' + inputs.length + '个: 选「' + CONFIG.notApplicable + '」×' + selected +
        (absent ? ', 无该选项×' + absent + '(保持原样)' : '') + ')'
    };
  }

  // 商品识别码: 按 label 文本定位输入框(不依赖动态 id), 固定填写
  async function fillProductIdCode(drawer) {
    var labels = drawer.querySelectorAll('.rocket-form-field-item-label label');
    var field = null;
    for (var i = 0; i < labels.length; i++) {
      if (txt(labels[i]).indexOf('商品识别码') !== -1) {
        field = labels[i].closest('.rocket-form-field-item');
        break;
      }
    }
    var input = field && field.querySelector('input.rocket-input');
    if (!input) {
      log('⚠️ 商品识别码: 输入框未找到');
      return { ok: false, msg: '识别码: 控件缺失' };
    }
    if (input.value === CONFIG.productIdCode) {
      log('→ 识别码已是 ' + CONFIG.productIdCode + ', 跳过');
      return { ok: true, msg: '识别码 已填 ✓' };
    }
    if (!inViewport(input)) {
      input.scrollIntoView({ block: 'center' });
      await sleep(80);
    }
    input.focus();
    setInputValue(input, CONFIG.productIdCode);
    await sleep(80);
    input.dispatchEvent(new Event('blur', { bubbles: true }));
    var ok = input.value === CONFIG.productIdCode;
    log('→ 识别码填写 ' + CONFIG.productIdCode + (ok ? ' ✓' : ' 失败(当前=' + input.value + ')'));
    return { ok: ok, msg: ok ? '识别码 ✓' : '识别码: 填写失败' };
  }

  // 其他合规信息: 组内下拉处理完成后, 追加填写商品识别码
  async function fillOtherCompliance(drawer) {
    var r = await fillGroupNotApplicable(drawer, '其他合规信息', '其他合规信息');
    if (r.msg.indexOf('未显示') !== -1) return r;   // 模块不存在, 识别码一并跳过
    var c = await fillProductIdCode(drawer);
    return { ok: r.ok && c.ok, msg: r.msg + ' | ' + c.msg };
  }

  // 包装材料信息收集: 填第一行规格 → 点「一键填充其他规格」
  async function fillPackaging(drawer) {
    var label = '包装材料';
    var sec = await waitFor(function () {
      return findSectionById(drawer, '166') || findSectionByTitle(drawer, '包装材料信息收集');
    }, 3000);
    if (!sec) return { ok: false, msg: label + ': 区块缺失' };
    await scrollToModule(sec);

    // 最外层表格的规格行 (排除内嵌材料表格的行)
    var outerWrapper = sec.querySelector('.rocket-table-wrapper');
    if (!outerWrapper) return { ok: false, msg: label + ': 表格缺失' };
    var allRows = sec.querySelectorAll('tr.rocket-table-row');
    var specRows = [];
    for (var i = 0; i < allRows.length; i++) {
      if (allRows[i].closest('.rocket-table-wrapper') === outerWrapper) specRows.push(allRows[i]);
    }
    log('包装表格: 规格行数=' + specRows.length);
    if (!specRows.length) return { ok: false, msg: label + ': 无规格行' };

    var row = specRows[0];
    var cells = row.children;
    if (cells.length < 3) return { ok: false, msg: label + ': 行结构异常' };

    // 商品规格列 (第一列) 下拉 → 点「全选」
    var skuOk = true;
    var skuNote = '';
    if (CONFIG.pack.skuSelectAll) {
      var skuInput = cells[0].querySelector('.rocket-select-selection-search-input');
      if (skuInput) {
        var sr = await selectAllInSelect(skuInput);
        if (sr === 'ok') skuNote = '规格全选 ✓';
        else if (sr === 'skip') skuNote = '规格已全选 ✓';
        else {
          skuOk = false;
          skuNote = sr === 'no-select-all' ? '规格「全选」选项未找到!' : '规格下拉打不开!';
        }
      } else {
        skuOk = false;
        skuNote = '规格下拉控件缺失!';
      }
      log('规格全选结果: ' + skuNote);
      await sleep(150);
    }

    // 需填写信息列 = 第二列, 内含材料表格
    var innerWrapper = cells[1].querySelector('.rocket-table-wrapper');
    var innerTable = innerWrapper && innerWrapper.querySelector('table');
    if (!innerTable) return { ok: false, msg: label + ': 材料表格缺失' };

    // 表头 → 列索引
    var headMap = {};
    var ths = innerTable.querySelectorAll('thead th');
    for (var h = 0; h < ths.length; h++) {
      var name = txt(ths[h]).replace(/\s*\?\?$/,'').trim();
      if (name.indexOf('材质分类') !== -1) headMap.category = h;
      else if (name.indexOf('材料名称') !== -1) headMap.material = h;
      else if (name.indexOf('一次性塑料') !== -1) headMap.plastic = h;
      else if (name.indexOf('包装类型') !== -1) headMap.packType = h;
      else if (name.indexOf('包装材料重量') !== -1) headMap.weight = h;
    }

    // 第一条材料行
    var innerRows = innerTable.querySelectorAll('tr.rocket-table-row');
    var matRow = null;
    for (var m = 0; m < innerRows.length; m++) {
      if (innerRows[m].closest('.rocket-table-wrapper') === innerWrapper) { matRow = innerRows[m]; break; }
    }
    if (!matRow) return { ok: false, msg: label + ': 无材料行' };

    // 依次填四个下拉 (材质分类 → 材料名称 有级联, 必须按序)
    var pre = skuNote ? skuNote + ' | ' : '';
    var tasks = [
      { col: 'category', target: CONFIG.pack.materialCategory, label: '材质分类' },
      { col: 'material', target: CONFIG.pack.materialName, label: '材料名称' },
      { col: 'plastic', target: CONFIG.pack.singleUsePlastic, label: '一次性塑料' },
      { col: 'packType', target: CONFIG.pack.packType, label: '包装类型' }
    ];
    for (var t = 0; t < tasks.length; t++) {
      var idx = headMap[tasks[t].col];
      if (idx === undefined) return { ok: false, msg: pre + label + ': 缺列「' + tasks[t].label + '」' };
      var cell = matRow.children[idx];
      if (!cell) return { ok: false, msg: pre + label + ': 「' + tasks[t].label + '」单元格缺失' };
      var input = cell.querySelector('.rocket-select-selection-search-input');
      if (!input) return { ok: false, msg: pre + label + ': 「' + tasks[t].label + '」控件缺失' };
      var r = await fillSelect(input, tasks[t].target);
      if (r === 'not-found' || r === 'no-dropdown') {
        return { ok: false, msg: pre + label + ': 「' + tasks[t].label + '」' + (r === 'no-dropdown' ? '下拉打不开' : '未找到「' + tasks[t].target + '」') };
      }
      await sleep(150);
    }

    // 包装材料重量 (g)
    if (headMap.weight !== undefined) {
      var wCell = matRow.children[headMap.weight];
      var wInput = wCell && wCell.querySelector('input.rocket-input-number-input');
      if (wInput && !wInput.disabled) {
        var cur = parseFloat(wInput.value);
        var want = parseFloat(CONFIG.pack.weight);
        if (isNaN(cur) || Math.abs(cur - want) > 0.0001) {
          wInput.focus();
          setInputValue(wInput, CONFIG.pack.weight);
          await sleep(80);
          wInput.dispatchEvent(new Event('blur', { bubbles: true }));
        }
      }
    }

    // 一键填充其他规格
    await sleep(200);
    var btns = cells[2].querySelectorAll('button');
    for (var b = 0; b < btns.length; b++) {
      if (txt(btns[b]).indexOf('一键填充其他规格') !== -1) {
        log('→ 点击「一键填充其他规格」按钮');
        fireClick(btns[b]);
        await sleep(250);
        return { ok: skuOk, msg: pre + label + ' ✓(已传播其他规格)' };
      }
    }
    log('⚠️ 未找到「一键填充其他规格」按钮');
    return { ok: skuOk, msg: pre + label + ' ✓(未找到传播按钮,仅填首行)' };
  }

  // ============ 总入口 ============

  async function run() {
    log('========== 开始: 检测「' + CONFIG.drawerTitle + '」抽屉 ==========');
    bubble('🔍 检测「' + CONFIG.drawerTitle + '」抽屉...');
    var drawer = await waitFor(findDrawer, 4000);
    if (!drawer) {
      log('❌ 未检测到抽屉 (等了4秒)');
      bubble('❌ 未检测到「' + CONFIG.drawerTitle + '」抽屉\n请先打开', 3000);
      return false;
    }
    log('✓ 抽屉已定位');

    var steps = [
      ['警示类型', function () { return fillSectionSelect(drawer, '4', '加州 65 号提案', CONFIG.warningType, '警示类型'); }],
      ['欧盟负责人', function () { return fillSectionSelect(drawer, '25', '欧盟负责人', null, '欧盟负责人'); }],
      ['制造商信息', function () { return fillSectionSelect(drawer, '60', '制造商信息', null, '制造商信息'); }],
      ['土耳其负责人', function () { return fillSectionSelect(drawer, '84', '土耳其负责人', null, '土耳其负责人'); }],
      ['包装材料', function () { return fillPackaging(drawer); }],
      ['韩国公示信息', function () { return fillGroupNotApplicable(drawer, '韩国公示信息', '韩国公示信息'); }],
      ['其他合规信息', function () { return fillOtherCompliance(drawer); }]
    ];

    var results = [];
    for (var i = 0; i < steps.length; i++) {
      log('═══ 步骤 ' + (i + 1) + '/' + steps.length + ': ' + steps[i][0] + ' ═══');
      bubble('【' + (i + 1) + '/' + steps.length + '】' + steps[i][0] + ' 填写中...');
      await sleep(120);
      var r;
      try {
        r = await steps[i][1]();
      } catch (e) {
        r = { ok: false, msg: steps[i][0] + ' 异常: ' + e.message };
      }
      results.push(r);
      log((r.ok ? '步骤完成: ' : '步骤失败: ') + r.msg);
      bubble((r.ok ? '✅ ' : '❌ ') + r.msg);   // 常驻, 下一步开始时覆盖
      await sleep(180);
    }

    var okCount = 0;
    var msgs = [];
    results.forEach(function (r) {
      if (r.ok) okCount++;
      msgs.push(r.msg);
    });
    var allOk = okCount === results.length;
    bubble((allOk ? '🎉 合规信息填写完成\n' : '⚠️ 完成 ' + okCount + '/' + results.length + '\n') + msgs.join('\n'), 5000);
    log('========== 结束: ' + okCount + '/' + results.length + ' 成功 ==========');
    log(JSON.stringify(results));
    return allOk;
  }

  window.TemuCompliance = { run: run, CONFIG: CONFIG };
})();
