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
| 设置 Input/Textarea 值 | `setInputValue` | Vue 受控 Input & Textarea |
| 等待元素出现 | `waitForElement` | 通用 DOM 查询 |
| 等待可见 li 出现 | `waitForVisibleLi` | Dropdown 菜单项 |
| 等待特定弹窗出现 | `findVisibleModal` | Ant Modal (双重判断) |
| 等待 Select 出现 | `waitForAntSelect` | 带标签的 Select |
| 精确定位弹窗内元素 | `findVisibleModal` → 容器内查询 | Modal 内部操作 |

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
**适用**: `.ant-dropdown-trigger` class 的触发器。
**关键**: 目标元素通常有 `.ant-dropdown-trigger` class，如果按钮本身没有该 class，需向上查找祖先元素。

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

### 4. setInputValue — 设置 Vue 受控 Input/Textarea 值

```javascript
function setInputValue(input, val) {
  var proto = input.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  var nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value').set;
  nativeSetter.call(input, val);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}
```

**原理**: 根据 `tagName` 自动选择对应的原生 prototype setter 绕过 Vue 拦截，然后手动触发 input + change 事件通知 Vue。
**适用**: 标题过滤、图片 URL 输入等 Vue v-model 绑定的 input 和 textarea。
**注意**:
- 直接 `input.value = xxx` 不会触发 Vue 响应式，必须用此方法。
- Textarea 必须用 `HTMLTextAreaElement.prototype`，否则报 `Illegal invocation` 错误。

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
**局限**: 只按 CSS 选择器查找，不检查文本内容或可见性。

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

**原理**: 遍历所有 `<li>` 元素，过滤隐藏元素（`offsetParent === null`），按文本内容匹配。
**适用**: Dropdown 菜单项（「清空描述」「批量传图」「网络图片」等）。
**注意**: Dropdown 的弹出菜单通常是 `<li>` 元素。

---

### 7. findVisibleModal — 双重判断定位弹窗（推荐）

```javascript
function findVisibleModal(titleText) {
  var titles = document.querySelectorAll('.ant-modal-title');
  for (var t = 0; t < titles.length; t++) {
    if ((titles[t].textContent || '').indexOf(titleText) !== -1) {
      var wrap = titles[t];
      while (wrap && !wrap.classList.contains('ant-modal-wrap')) { wrap = wrap.parentElement; }
      if (wrap && wrap.style.display !== 'none') {
        return wrap;  // 返回 .ant-modal-wrap 容器
      }
    }
  }
  return null;
}
```

**双重判断逻辑**:
1. **标题文字匹配** — 通过 `.ant-modal-title` 的 `textContent` 匹配目标弹窗
2. **可见性验证** — 检查 `.ant-modal-wrap` 的 `display` 不是 `none`，排除已关闭的残留弹窗

**为什么不用动态 ID**:
- Ant Design Vue 弹窗标题有动态 ID（如 `#vcDialogTitle10`），每次打开数字递增
- 旧 ID 对应的 DOM 元素会变为 null
- 使用标题文字 + 可见性判断完全不受动态 ID 影响

**使用方式**:
```javascript
// 轮询等待弹窗出现
var start = Date.now();
(function check() {
  var modal = C.findVisibleModal('从网络地址');
  if (modal) { onModalReady(modal); return; }
  if (Date.now() - start > 5000) { /* 超时 */ return; }
  requestAnimationFrame(check);
})();

// 拿到 modal 后直接在容器内查询元素
function onModalReady(modal) {
  var textarea = modal.querySelector('textarea.ant-input');
  var addBtn = modal.querySelector('.ant-modal-footer .ant-btn-primary');
}
```

**与旧方法的区别**: 旧方法先找 `.ant-modal-title`，再向上遍历找 `.ant-modal-wrap`，分两步。新方法一步返回 `.ant-modal-wrap`，调用方直接在容器内操作。

---

### 8. waitForAntSelect — 等待带标签的 Select 出现

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

## 三、元素选择器索引

> 按工作流程/页面区域分类，列出所有用到的 CSS 选择器及其对应含义。

### 3.1 产品基本信息区域 `#productBasicInfo`

| 选择器 | 含义 | 使用场景 |
|--------|------|---------|
| `#productBasicInfo .ant-form-item-label label` | 表单项标签（店铺名称等） | Step 1: 查找"店铺名称"标签 |
| `label` → `.closest('.ant-form-item')` | 标签所在的表单行 | 获取店铺表单项容器 |
| 容器 → `.ant-select-selection-item` | Select 当前已选中值 | 读取当前店铺名 |
| 容器 → `.ant-select-selector` | Select 触发区域 | 点击打开店铺下拉 |
| 容器 → `.ant-select-selection-search-input` | Select 可搜索输入框 | 店铺搜索时聚焦 |
| `.ant-select-item-option[title="店铺名"]` | 下拉菜单中匹配店铺名的选项 | 选择配置的店铺 |
| `#productBasicInfo .category-item .ant-form-item-control button` | 确认分类按钮 | Step 2: 点击分类 |
| `.ant-modal-wrap:not([style*="display: none"]) .ant-modal-footer button.ant-btn-primary` | 确认分类弹窗的确认按钮 | Step 3: 确认分类 |

### 3.2 产品信息区域 `#productProductInfo`

| 选择器 | 含义 | 使用场景 |
|--------|------|---------|
| `#productProductInfo form .ant-form-item input` | 标题输入框 | Step 4/16: 过滤标题/检查长度 |
| `.inputContainer .color-gray` | 标题字数限制提示（如 `/200`） | Step 16: 获取字数上限 |
| `#productProductInfo .ant-form-item-label label` (文字="产品轮播图") | 产品轮播图 label | 粘字流程: 定位轮播图区域 |
| label → `.closest('.ant-form-item')` | 轮播图所在表单行 | 获取轮播图容器 |
| 容器 → `.img-module .header button` (文字="选择图片") | 选择图片下拉按钮 | 粘字流程: 打开选择图片下拉 |
| `#productProductInfo .mainImage .img-list .img-item` | 产品图片列表项（不区分是否勾选） | 编字流程: 获取图片 URL |
| `.img-item img.img-css` | 产品图片元素，`src` 即为图片 URL | 编字流程: 读取图片地址 |
| `#productProductInfo .ant-select-selector` | 省份等 Select 组件 | Step 6: 打开省份下拉 |

### 3.3 翻译区域

| 选择器 | 含义 | 使用场景 |
|--------|------|---------|
| `#app .product-add-layout .header .btn-box button.translation-btn` | 页面顶部"一键翻译"按钮 | Step 5/译按钮: 悬浮触发翻译下拉 |
| `.ant-dropdown:not(.ant-dropdown-hidden) li.menu-item` (文字含"中文"+"英文") | 翻译下拉菜单项"中文→英文" | Step 5: 点击翻译菜单项 |

### 3.4 包裹信息区域 `#packageInfo`

| 选择器 | 含义 | 使用场景 |
|--------|------|---------|
| `#packageInfo .ant-form-item-label label` | 包裹信息表单标签 | Step 8/10: 查找"外包装形状/类型" |
| label → `.closest('.ant-form-item')` → `.ant-select-selector` | 对应的 Select 组件 | Step 8/10: 打开下拉 |
| `.ant-select-item-option[title="福建省"]` | 省份下拉"福建省"选项 | Step 7 |
| `.ant-select-item-option[title="不规则"]` | 外包装形状"不规则"选项 | Step 9 |
| `.ant-select-item-option[title="软包装+硬物"]` | 外包装类型"软包装+硬物"选项 | Step 11 |
| `#packageInfo .header button` (文字="选择图片") | 包裹信息"选择图片"按钮 | Step 12: 悬浮触发下拉 |
| `.ant-dropdown-menu-item[data-menu-id="crawl"]` | 下拉菜单"引用采集图片"选项 | Step 13 |

### 3.5 引用采集图片弹窗

| 选择器 | 含义 | 使用场景 |
|--------|------|---------|
| `findVisibleModal('引用采集图片')` | 弹窗 `.ant-modal-wrap` 容器 | Step 14/15: 定位弹窗 |
| 容器 → `.img-box .ant-checkbox-wrapper .ant-checkbox-input` | 图片复选框 | Step 14: 勾选图片 |
| 容器 → `.ant-modal-footer button.ant-btn-primary` | 弹窗底部确认按钮 | Step 15: 确认选择 |

### 3.6 发布区域

| 选择器 | 含义 | 使用场景 |
|--------|------|---------|
| `.footer .btn-box button.btn-green` (文字="发布") | 页面底部绿色"发布"按钮 | Step 17: 悬浮触发发布下拉 |
| `.ant-dropdown-menu-item[data-menu-id="2"]` (文字="立即发布") | 发布下拉"立即发布"选项 | Step 18 |

### 3.7 TEMU 产品描述编辑器 `.smt-new-editor`

| 选择器 | 含义 | 使用场景 |
|--------|------|---------|
| `#baiduStatisticsSmtNewEditorEditClickNum > button` | "编辑描述"按钮（产品描述区域） | 编字流程: 打开编辑器 |
| `.smt-new-editor .menu-button.ant-dropdown-trigger` | 编辑器内"批量操作"下拉触发器 | 编字流程: 展开批量操作 |
| `.smt-new-editor .smt-desc-content` | 编辑器已有描述内容模块 | 编字流程: 等待编辑器加载 |
| `.smt-new-editor .desc-img-box img` | 编辑器描述图片 | 编字流程: 检测是否有图片模块 |
| `.smt-new-editor .desc-content` | 编辑器描述文字内容 | 编字流程: 检测是否有文字模块 |
| `.smt-new-editor .btn-orange` | 编辑器"保存"按钮（橙色） | 编字流程: 保存描述 |
| `.ant-modal-confirm .ant-modal-confirm-btns .ant-btn-primary` | 清空确认弹窗的"确定"按钮 | 编字流程: 确认清空模块 |
| `.batch-smt-image` | 批量传图弹窗面板 | 编字流程: 等待面板出现 |
| `.batch-smt-image button` (文字="选择图片") → `.ant-dropdown-trigger` 祖先 | "选择图片"下拉触发器 | 编字流程: 展开选择图片菜单 |

### 3.8 网络图片弹窗

| 选择器 | 含义 | 使用场景 |
|--------|------|---------|
| `findVisibleModal('从网络地址')` | 弹窗 `.ant-modal-wrap` 容器 | 编字/粘字流程: 定位弹窗 |
| 容器 → `textarea.ant-input` | 图片 URL 输入框 | 编字/粘字流程: 填入 URL |
| 容器 → `.ant-modal-footer .ant-btn-primary` | 弹窗底部"添加"按钮 | 编字/粘字流程: 确认添加 |

### 3.9 引用产品图片弹窗

| 选择器 | 含义 | 使用场景 |
|--------|------|---------|
| `findVisibleModal('引用产品图片')` | 弹窗 `.ant-modal-wrap` 容器 | 编字流程(轮播图路径): 定位弹窗 |
| 容器 → `label.ant-checkbox-wrapper` (子 span 文字="全部") | 全选 Checkbox | 编字流程: 全选图片 |
| 容器 → `.ant-checkbox` | Checkbox 状态元素 | 编字流程: 检查是否已勾选 |
| 容器 → `.ant-modal-footer .ant-btn-primary` | 弹窗底部"确认"按钮 | 编字流程: 确认选择 |

### 3.10 批量传图弹窗

| 选择器 | 含义 | 使用场景 |
|--------|------|---------|
| `findVisibleModal('批量传图')` | 弹窗 `.ant-modal-wrap` 容器 | 编字流程: 定位弹窗 |
| 容器 → `.ant-modal-footer .ant-btn-primary` | 弹窗底部"确定"按钮 | 编字流程: 确认批量传图 |

---

## 四、Dropdown 菜单项查找

Dropdown 菜单项统一通过 `waitForVisibleLi(文字片段)` 查找，以下列出所有用到的菜单项：

| 菜单文字 | 所属下拉 | 使用场景 |
|----------|---------|---------|
| 清空描述 | 批量操作菜单 | 编字流程: 展开清空子菜单 |
| 清空文字模块 | 清空描述子菜单 | 编字流程: 清空文字 |
| 清空图片模块 | 清空描述子菜单 | 编字流程: 清空图片 |
| 批量传图 | 批量操作菜单 | 编字流程: 打开批量传图 |
| 引用产品轮播图 | 选择图片菜单 | 编字流程(轮播图路径) |
| 网络上传 | 选择图片菜单 | 编字流程(网络图片路径) |
| 网络图片 | 产品轮播图-选择图片菜单 | 粘字流程 |

---

## 五、常见问题与解决

### Q: hover 触发下拉没反应？
1. 检查目标元素是否是 `.ant-dropdown-trigger` 祖先，而非内层按钮
2. 向上遍历 parentElement 查找 `.ant-dropdown-trigger` class
3. 加 `setTimeout` 延迟 300ms 再触发，等 Vue 挂载完成
4. 依次尝试: `hoverElement` → `hoverWithCoords` → 两者组合

### Q: Select 打开但选不中选项？
使用 `waitForVisibleLi` 等待选项出现后再点击 `<li>` 元素。

### Q: 页面有多个弹窗，找错弹窗？
使用 `findVisibleModal(标题文字)` 双重判断定位，不使用动态 ID。

### Q: 设置 input/textarea.value 后 Vue 没更新？
必须使用 `setInputValue` 方法。该方法自动检测 tagName 选择正确的 prototype setter。

### Q: mouseenter 事件无效？
确保 `bubbles: false`。原生 `mouseenter` 不冒泡，设为 `bubbles: true` 会导致 Ant Design 状态混乱。

### Q: 动态 ID 弹窗定位失败？
Ant Design Vue 弹窗标题有递增 ID（`#vcDialogTitle0`, `#vcDialogTitle1`...），不要用 ID 选择器。统一使用 `findVisibleModal(标题文字)` 方法。

### Q: 网络图片弹窗 textarea 设值报 `Illegal invocation`？
textarea 不能用 `HTMLInputElement.prototype` 的 setter。`setInputValue` 已自动根据 `tagName` 区分处理。

---

## 六、方法文件位置

| 方法 | 文件 | 暴露方式 |
|------|------|---------|
| `hoverElement` / `unhoverElement` | dxm-float-bee.js | `BeeConfig.hoverElement` |
| `waitForElement` | dxm-float-bee.js | `BeeConfig.waitForElement` |
| `showBubble` / `hideBubble` | dxm-float-bee.js | `BeeConfig.showBubble` |
| `forceOpenAntSelect` | dxm-float-bee.js | 内部函数 |
| `waitForAntSelect` | dxm-float-bee.js | 内部函数 |
| `waitForProvinceSelect` | dxm-float-bee.js | 内部函数 |
| `setInputValue` | dxm-config.js | `BeeConfig.setInputValue` |
| `findVisibleModal` | dxm-config.js | `BeeConfig.findVisibleModal` |
| `hoverWithCoords` | dxm-edit-desc.js | 内部函数 |
| `findVisibleLi` / `waitForVisibleLi` | dxm-edit-desc.js / dxm-paste-img.js | 各自内部函数 |

---

## 七、工作流程概览

### 7.1 点击小蜜蜂 — 自动填表 (18步)

| 步骤 | 操作 | 关键选择器 |
|------|------|-----------|
| 1 | 检查/选择店铺 | `#productBasicInfo .ant-form-item-label label` |
| 2 | 点击分类按钮 | `#productBasicInfo .category-item button` (可跳过) |
| 3 | 确认分类弹窗 | `.ant-modal-footer button.ant-btn-primary` |
| 4 | 过滤标题违规词 | `#productProductInfo form .ant-form-item input` |
| 5 | 一键翻译 | `button.translation-btn` → `li.menu-item` |
| 6 | 打开省份下拉 | `#productProductInfo .ant-select-selector` |
| 7 | 选择福建省 | `.ant-select-item-option[title="福建省"]` |
| 8 | 打开外包装形状 | `waitForAntSelect('外包装形状')` |
| 9 | 选择不规则 | `.ant-select-item-option[title="不规则"]` |
| 10 | 打开外包装类型 | `waitForAntSelect('外包装类型')` |
| 11 | 选择软包装+硬物 | `.ant-select-item-option[title="软包装+硬物"]` |
| 12 | 悬浮选择图片 | `#packageInfo .header button` |
| 13 | 引用采集图片 | `.ant-dropdown-menu-item[data-menu-id="crawl"]` |
| 14 | 勾选第一张图片 | `findVisibleModal` → `.ant-checkbox-input` |
| 15 | 确认选择 | 容器 → `.ant-modal-footer .ant-btn-primary` |
| 16 | 检查标题长度 | `.inputContainer .color-gray` |
| 17 | 悬浮发布按钮 | `.footer button.btn-green` (可跳过) |
| 18 | 立即发布 | `.ant-dropdown-menu-item[data-menu-id="2"]` |

### 7.2 点击"编" — 一键编辑描述

1. 打开编辑描述 → 批量操作 → 检测已有内容（文字/图片）
2. 如有内容 → 清空文字模块 / 清空图片模块（链式执行）
3. 批量传图 → 选择图片下拉 → 两条路径：
   - **网络上传**: 填入产品图片 URL（最多8张）→ 添加
   - **引用产品轮播图**: 全选 → 确认
4. 确认批量传图 → 保存描述

### 7.3 点击"粘" — 一键粘贴图片URL

1. 读取剪贴板 (`navigator.clipboard.readText()`)
2. 定位产品轮播图的"选择图片"按钮 → hover 展开下拉
3. 点击"网络图片" → 等待"从网络地址(URL)选择图片"弹窗
4. 填入剪贴板内容 → 点击"添加"
