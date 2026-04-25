# 店小蜜站点 - Ant Design 组件交互方法手册

> 本文档总结了在店小蜜 TEMU 页面中，通过合成事件与 Ant Design Vue 组件交互的所有方法。
> 遇到新的下拉框、菜单、弹窗等交互需求时，按以下优先级依次尝试。

---

## 一、方法速查表

| 场景 | 推荐方法 | 适用组件 |
|------|---------|---------|
| 打开 Select 下拉框 | `forceOpenAntSelect` | Ant Select (点击触发) |
| 打开 Dropdown 菜单 | `hoverElement` | Ant Dropdown (悬浮触发) |
| 打开 Dropdown 子菜单 | `hoverWithCoords` | 嵌套 Dropdown (需坐标) |
| 设置 Input 值 | `setInputValue` | Vue 受控 Input |
| 等待元素出现 | `waitForElement` | 通用 DOM 查询 |
| 等待可见 li 出现 | `waitForVisibleLi` | Dropdown 菜单项 |
| 等待特定弹窗出现 | `waitForModalTitle` | Ant Modal |
| 等待 Select 出现 | `waitForAntSelect` | 带标签的 Select |
| 精确定位弹窗内元素 | 通过标题向上找 `.ant-modal-wrap` | Modal 内部操作 |

---

## 二、方法详解

### 1. forceOpenAntSelect — 强制打开 Select 下拉框

```javascript
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
```

**原理**: 模拟完整点击流程 (pointerdown → mousedown → pointerup → mouseup → click)，带坐标信息。
**适用**: 省份选择、包裹形状、包裹类型等 Ant Select 组件。
**注意**: 目标元素是 `.ant-select-selector`，不是外层容器。

---

### 2. hoverElement / unhoverElement — 悬浮触发 Dropdown

```javascript
function hoverElement(el) {
  el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
  el.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
}

function unhoverElement(el) {
  el.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
  el.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false }));
}
```

**原理**: 模拟鼠标进入/离开，`mouseenter` 必须设 `bubbles: false`（原生行为）。
**适用**: 「批量操作」等带 `.ant-dropdown-trigger` class 的触发器。
**关键**: 目标元素必须有 `.ant-dropdown-trigger` class，通常是按钮的**父元素/包装元素**，而非按钮本身。

**已验证可用场景**:
- `.smt-new-editor .menu-button.ant-dropdown-trigger` — 批量操作菜单
- `.batch-smt-image` 内的 `ant-dropdown-trigger` 祖先 — 选择图片下拉

---

### 3. hoverWithCoords — 带坐标的悬浮（用于子菜单）

```javascript
function hoverWithCoords(el) {
  var rect = el.getBoundingClientRect();
  var cx = rect.left + rect.width / 2;
  var cy = rect.top + rect.height / 2;
  var pOpts = { bubbles: true, cancelable: true, clientX: cx, clientY: cy,
                pointerId: 1, pointerType: 'mouse', isPrimary: true };
  var mOpts = { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy };
  el.dispatchEvent(new PointerEvent('pointerover', pOpts));
  el.dispatchEvent(new PointerEvent('pointerenter', { bubbles: false, clientX: cx, clientY: cy, pointerId: 1, pointerType: 'mouse' }));
  el.dispatchEvent(new PointerEvent('pointermove', pOpts));
  el.dispatchEvent(new MouseEvent('mouseover', mOpts));
  el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false, clientX: cx, clientY: cy }));
  el.dispatchEvent(new MouseEvent('mousemove', mOpts));
}
```

**原理**: 在 `hoverElement` 基础上增加 PointerEvent 和坐标信息。
**适用**: Dropdown 内的子菜单项（如「清空描述」li），需要坐标让 Ant Design 正确定位子菜单。
**与 hoverElement 的区别**: hoverElement 不带坐标，适用于顶层 trigger；hoverWithCoords 带坐标，适用于菜单内的子项。

---

### 4. setInputValue — 设置 Vue 受控 Input 值

```javascript
function setInputValue(input, val) {
  var nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  nativeSetter.call(input, val);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}
```

**原理**: 直接调用 HTMLInputElement 原生的 value setter 绕过 Vue 的拦截，然后手动触发 input + change 事件通知 Vue。
**适用**: 标题过滤等 Vue v-model 绑定的 input。
**注意**: 直接 `input.value = xxx` 不会触发 Vue 响应式，必须用此方法。

---

### 5. waitForElement — 等待 CSS 选择器匹配的元素

```javascript
function waitForElement(selector, timeout, cb) {
  var start = Date.now();
  (function check() {
    var el = document.querySelector(selector);
    if (el) return cb(el);
    if (Date.now() - start > timeout) return cb(null);
    requestAnimationFrame(check);
  })();
}
```

**适用**: 等待弹窗、按钮等 DOM 元素出现。
**局限**: 只按 CSS 选择器查找，不检查文本内容或可见性。页面已有多个同选择器元素时会返回第一个。

---

### 6. waitForVisibleLi — 等待可见的 li 元素

```javascript
function findVisibleLi(textFragment) {
  var allLi = document.querySelectorAll('li');
  for (var i = 0; i < allLi.length; i++) {
    if (allLi[i].offsetParent === null) continue;
    if ((allLi[i].textContent || '').indexOf(textFragment) !== -1) return allLi[i];
  }
  return null;
}

function waitForVisibleLi(textFragment, timeout, cb) {
  var start = Date.now();
  (function check() {
    var el = findVisibleLi(textFragment);
    if (el) return cb(el);
    if (Date.now() - start > timeout) return cb(null);
    requestAnimationFrame(check);
  })();
}
```

**原理**: 遍历所有 `<li>` 元素，过滤掉隐藏的（`offsetParent === null`），按文本内容匹配。
**适用**: Dropdown 菜单项（「清空描述」「批量传图」「引用产品轮播图」等）。
**注意**: Dropdown 的弹出菜单通常是 `<li>` 元素。

---

### 7. waitForModalTitle — 轮询等待特定弹窗出现

```javascript
// 轮询等待标题文本包含指定内容的弹窗
var start = Date.now();
(function check() {
  var titles = document.querySelectorAll('.ant-modal-title');
  for (var t = 0; t < titles.length; t++) {
    if ((titles[t].textContent || '').indexOf('目标弹窗标题') !== -1) {
      onModalReady();
      return;
    }
  }
  if (Date.now() - start > 5000) { /* 超时处理 */ return; }
  requestAnimationFrame(check);
})();
```

**适用**: 页面有多个弹窗时，需要等待特定标题的弹窗出现。
**与 waitForElement 的区别**: waitForElement 只按选择器查，会命中已有弹窗；此方法按文本内容匹配，确保是正确的弹窗。

---

### 8. 精确定位弹窗内元素 — 通过标题向上找 Modal 容器

```javascript
// 通过标题找到弹窗 DOM
var imgModal = null;
var titles = document.querySelectorAll('.ant-modal-title');
for (var t = 0; t < titles.length; t++) {
  if ((titles[t].textContent || '').indexOf('引用产品图片') !== -1) {
    var el = titles[t];
    while (el && !el.classList.contains('ant-modal-wrap')) { el = el.parentElement; }
    if (el) { imgModal = el; break; }
  }
}
// 之后在 imgModal 内部查找，不受其他弹窗干扰
var label = imgModal.querySelector('label.ant-checkbox-wrapper');
var btn = imgModal.querySelector('.ant-modal-footer .ant-btn-primary');
```

**原理**: 找到目标弹窗的 `.ant-modal-wrap` 容器后，所有后续查询都在容器内进行。
**适用**: 页面有多个弹窗叠加时，精确操作特定弹窗内的元素。

---

### 9. waitForAntSelect — 等待带标签的 Select 出现

```javascript
function waitForAntSelect(labelText, cb) {
  var start = Date.now();
  (function check() {
    var labels = document.querySelectorAll('#packageInfo .ant-form-item-label label');
    for (var i = 0; i < labels.length; i++) {
      if (labels[i].textContent.includes(labelText)) {
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
```

**适用**: 表单中的 Select 组件，通过左侧 label 文字定位对应的 Select 元素。

---

## 三、常见问题与解决

### Q: hover 触发下拉没反应？
1. 检查目标元素是否是 `.ant-dropdown-trigger` 祖先，而非内层按钮
2. 加 `setTimeout` 延迟 800ms 再触发，等 Vue 挂载完成
3. 依次尝试: `hoverElement` → `hoverWithCoords` → `hoverElement` + `hoverWithCoords` 组合

### Q: Select 打开但选不中选项？
使用 `waitForVisibleLi` 等待选项出现后再点击 `<li>` 元素。

### Q: 页面有多个弹窗，元素找错？
用「通过标题向上找 `.ant-modal-wrap`」方法定位到具体弹窗容器，再在容器内查找。

### Q: 设置 input.value 后 Vue 没更新？
必须使用 `setInputValue` 方法，直接赋值 `input.value = xxx` 不会触发 Vue 响应式。

### Q: mouseenter 事件无效？
确保 `bubbles: false`。原生 `mouseenter` 不冒泡，设为 `bubbles: true` 会导致 Ant Design 状态混乱。

---

## 四、方法文件位置

| 方法 | 文件 |
|------|------|
| hoverElement / unhoverElement | dxm-float-bee.js (暴露到 BeeConfig) |
| waitForElement | dxm-float-bee.js (暴露到 BeeConfig) |
| forceOpenAntSelect | dxm-float-bee.js |
| setInputValue | dxm-config.js (暴露到 BeeConfig) |
| hoverWithCoords | dxm-edit-desc.js |
| findVisibleLi / waitForVisibleLi | dxm-edit-desc.js |
| waitForAntSelect | dxm-float-bee.js |
| waitForProvinceSelect | dxm-float-bee.js |
