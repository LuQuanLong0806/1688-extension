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
| 读取剪贴板内容 | `navigator.clipboard.readText()` | 浏览器 Clipboard API |

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
**文件位置**: `dxm-float-bee.js` 内部函数

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
**适用**: `.ant-dropdown-trigger` class 的触发器、选择图片按钮等。
**关键**: 目标元素通常有 `.ant-dropdown-trigger` class，如果按钮本身没有该 class，需向上查找祖先元素。
**文件位置**: `dxm-float-bee.js`，暴露到 `BeeConfig.hoverElement`

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
**文件位置**: `dxm-edit-desc.js` 内部函数

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
**文件位置**: `dxm-config.js`，暴露到 `BeeConfig.setInputValue`

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
**局限**: 只按 CSS 选择器查找，不检查文本内容或可见性。如果元素不存在会等满超时时间。
**文件位置**: `dxm-float-bee.js`，暴露到 `BeeConfig.waitForElement`

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
**文件位置**: `dxm-edit-desc.js` / `dxm-paste-img.js` 各自内部函数

---

### 7. findVisibleModal — 双重判断定位弹窗（推荐）

```javascript
function findVisibleModal(titleText) {
  var titles = document.querySelectorAll('.ant-modal-title');
  for (var t = 0; t < titles.length; t++) {
    if ((titles[t].textContent || '').indexOf(titleText) !== -1) {
      var wrap = titles[t];
      while (wrap && !wrap.classList.contains('ant-modal-wrap')) { wrap = wrap.parentElement; }
      if (wrap && getComputedStyle(wrap).display !== 'none') {
        return wrap;  // 返回 .ant-modal-wrap 容器
      }
    }
  }
  return null;
}
```

**双重判断逻辑**:
1. **标题文字匹配** — 通过 `.ant-modal-title` 的 `textContent` 匹配目标弹窗
2. **可见性验证** — 使用 `getComputedStyle(wrap).display !== 'none'` 检查最终渲染样式，无论 `display: none` 来自行内样式、CSS class 还是祖先元素，都能正确检测

**为什么不用动态 ID**:
- Ant Design Vue 弹窗标题有动态 ID（如 `#vcDialogTitle10`），**所有弹窗**每次打开数字递增
- 旧 ID 对应的 DOM 元素会变为 null
- 使用标题文字 + 可见性判断完全不受动态 ID 影响

**`getComputedStyle` vs `element.style.display`**:
- `element.style.display` 只检查元素**自身**的行内样式，不检测祖先的 `display: none`
- `getComputedStyle(el).display` 计算最终渲染样式，无论隐藏来自哪个层级都能检测到
- 当前使用 `getComputedStyle` 更安全严谨

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

**返回值**: `.ant-modal-wrap` DOM 元素，可直接在容器内用 `querySelector` 查找子元素。
**文件位置**: `dxm-config.js`，暴露到 `BeeConfig.findVisibleModal`

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
**文件位置**: `dxm-float-bee.js` 内部函数

---

### 9. waitForProvinceSelect — 等待省份 Select 出现

```javascript
function waitForProvinceSelect(cb) {
  var start = Date.now();
  (function check() {
    var labels = document.querySelectorAll('#productProductInfo .ant-form-item-label label');
    for (var i = 0; i < labels.length; i++) {
      if (labels[i].textContent.includes('产地')) {
        var formItem = labels[i].closest('.ant-form-item');
        if (formItem) {
          var origin = formItem.querySelector('.productOrigin');
          if (origin) {
            var selects = origin.querySelectorAll('.ant-select-selector');
            if (selects.length >= 2) return cb(selects[1]); // 第二个即省份下拉
          }
        }
      }
    }
    if (Date.now() - start > 5000) return cb(null);
    requestAnimationFrame(check);
  })();
}
```

**原理**: 通过"产地"标签定位 `.productOrigin` 容器，取其中第二个 `.ant-select-selector`（第一个是国家，第二个是省份）。
**为什么不用文字匹配**: 直辖市（北京市、上海市）不含"省"字，自治区（内蒙古自治区）不含"省"字，已选省份时无法通过文字匹配。改用固定位置定位更可靠。
**适用**: Step 6 定位省份下拉框。
**文件位置**: `dxm-float-bee.js` 内部函数

---

## 三、元素选择器索引

> 按页面区域分类，列出所有用到的 CSS 选择器及其对应含义。

### 3.1 产品基本信息区域 `#productBasicInfo`

| 选择器 | 含义 | 使用场景 |
|--------|------|---------|
| `#productBasicInfo .ant-form-item-label label` (文字含"店铺名称") | 店铺名称表单标签 | 蜜蜂 Step 1: 查找店铺标签 |
| label → `.closest('.ant-form-item')` | 标签所在的表单行 | 获取店铺表单项容器 |
| 容器 → `.ant-select-selection-item` | Select 当前已选中值 | 读取当前店铺名 (`title` 属性或 `textContent`) |
| 容器 → `.ant-select-selector` | Select 触发区域 | 点击打开店铺下拉 |
| 容器 → `.ant-select-selection-search-input` | Select 可搜索输入框 | 店铺搜索时聚焦 |
| `.ant-select-item-option[title="店铺名"]` | 下拉菜单中匹配店铺名的选项 | 选择配置的店铺 |
| `#productBasicInfo .category-item .ant-form-item-control button` | 确认分类按钮 | 蜜蜂 Step 2: 点击分类 |
| `.ant-modal-wrap:not([style*="display: none"]) .ant-modal-content .ant-modal-footer button.ant-btn-primary` | 确认分类弹窗的确认按钮 | 蜜蜂 Step 3: 确认分类 |

### 3.2 产品信息区域 `#productProductInfo`

| 选择器 | 含义 | 使用场景 |
|--------|------|---------|
| `#productProductInfo form .ant-form-item input` | 标题输入框（表单第一个 input） | 蜜蜂 Step 4/17: 过滤标题/检查长度 |
| input → `.closest('.inputContainer')` | 标题输入框外层容器 | 获取字数限制元素 |
| 容器 → `.color-gray` | 标题字数限制提示（如 `/200`） | 蜜蜂 Step 17: 获取字数上限 |
| `#productProductInfo .ant-form-item-label label` (文字含"产品轮播图") | 产品轮播图 label | 粘字/删字: 定位轮播图区域 |
| label → `.closest('.ant-form-item')` | 轮播图所在表单行 | 获取轮播图容器 |
| 容器 → `.img-module .header button` (文字含"选择图片") | 选择图片下拉按钮 | 粘字: 打开选择图片下拉 |
| `#productProductInfo .mainImage .img-list .img-item` | 产品轮播图列表项（不区分勾选） | 编字: 获取图片 URL（最多8张）; 删字: 统计图片总数 |
| `.img-item img.img-css` | 产品图片元素，`src` 即为图片 URL | 编字: 读取图片地址; 粘字: 获取首图更新外包装 |
| `.img-item a.icon_delete` | 图片删除按钮（每个图片容器内） | 删字: 点击删除单张图片 |
| `#productProductInfo .ant-form-item-label label` (文字含"产品视频") | 产品视频表单标签 | 蜜蜂 Step 8: 删除产品视频 |
| label → `.closest('.ant-form-item')` | 视频所在表单行 | 获取视频表单项容器 |
| 容器 → `.video-operate-img` | 视频可见容器（`offsetParent !== null` 表示有视频） | 蜜蜂 Step 8: 判断是否有视频 |
| 容器 → `.video-operate-img-box` | 视频缩略图+操作区域 | 蜜蜂 Step 8 |
| 容器 → `.video-operate-box a.link` (文字含"删除") | 视频删除按钮 | 蜜蜂 Step 8: 点击删除视频 |
| `#productProductInfo .ant-form-item-label label` (文字含"产地") | 产地表单标签 | 蜜蜂 Step 6: 定位省份下拉 |
| label → `.closest('.ant-form-item')` → `.productOrigin` | 产地 Select 容器（含国家+省份两个下拉） | 蜜蜂 Step 6 |
| 容器 → `.ant-select-selector` (第2个) | 省份下拉框 | 蜜蜂 Step 6: 打开省份下拉 |

### 3.3 SKU 变种属性区域 `#skuAttrsInfo`

| 选择器 | 含义 | 使用场景 |
|--------|------|---------|
| `#skuAttrsInfo form` | SKU变种属性表单 | SKU Step 1: 过滤变种属性 |
| 表单 → `.options-module` | 每个属性名下的选项列表容器 | SKU Step 1: 遍历所有属性 |
| 容器 → `label` | 单个 SKU 变种属性选项（如颜色值、数量值） | SKU Step 1: 检查/替换文本 |
| label → `.theme-value-text` | SKU 属性值的显示文本（`title` 属性或 `textContent`） | SKU Step 1: 读取当前文本 |
| label → `.btn-edit` | 编辑图标按钮 | SKU Step 1: 点击进入编辑模式 |
| label → `.edit-inp` | 编辑输入框（点击编辑后出现） | SKU Step 1: 设置新值 |
| label → `.btn-save` | 保存图标按钮 | SKU Step 1: 保存修改 |

### 3.4 SKU 货号表格 `#skuDataInfo`

| 选择器 | 含义 | 使用场景 |
|--------|------|---------|
| `#skuDataInfo table` | SKU 数据表格 | SKU Step 2: 高级SKU货号 |
| 表格 → `th` (文字含"SKU货号") | SKU货号列头 | SKU Step 2: 定位高级链接 |
| 列头 → `span.link` (文字含"高级") | 高级SKU货号链接（注意：需遍历所有 span.link 跳过"一键生成"） | SKU Step 2: 点击打开高级生成 |
| `findVisibleModal('SKU高级生成规则')` | SKU高级生成规则弹窗 | SKU Step 2: 定位弹窗 |
| 弹窗 → `.ant-modal-footer .ant-btn-primary` | "生成"按钮 | SKU Step 2: 点击生成 |

### 3.5 翻译区域

| 选择器 | 含义 | 使用场景 |
|--------|------|---------|
| `#app .product-add-layout .header .btn-box button.translation-btn` | 页面顶部"一键翻译"按钮 | 蜜蜂 Step 5/译按钮: 悬浮触发翻译下拉 |
| `.ant-dropdown:not(.ant-dropdown-hidden) li.menu-item` (文字含"中文"+"英文") | 翻译下拉菜单项"中文→英文" | 蜜蜂 Step 5: 点击翻译菜单项 |

### 3.6 包裹信息区域 `#packageInfo`

| 选择器 | 含义 | 使用场景 |
|--------|------|---------|
| `#packageInfo .ant-form-item-label label` | 包裹信息表单标签 | 蜜蜂 Step 9/11: 查找"外包装形状/类型" |
| label → `.closest('.ant-form-item')` → `.ant-select-selector` | 对应的 Select 组件 | 蜜蜂 Step 9/11: 打开下拉 |
| `.ant-select-item-option[title="省份名"]` | 省份下拉选项（动态读取配置） | 蜜蜂 Step 7 |
| `.ant-select-item-option[title="不规则"]` | 外包装形状"不规则"选项 | 蜜蜂 Step 10 |
| `.ant-select-item-option[title="软包装+硬物"]` | 外包装类型"软包装+硬物"选项 | 蜜蜂 Step 12 |
| `#packageInfo .header button` (文字含"选择图片") | 包裹信息"选择图片"按钮 | 蜜蜂 Step 14: 悬浮触发下拉; 粘字: 打开外包装选择图片 |
| `#packageInfo .img-list .img-item` | 外包装图片列表项 | 粘字: 删除旧外包装图片 |
| `#packageInfo .img-list .img-item a.icon_delete` | 外包装图片删除按钮 | 粘字: 清空旧图片 |

### 3.7 外包装图片更新（网络图片路径）

| 选择器 | 含义 | 使用场景 |
|--------|------|---------|
| `#productProductInfo .mainImage .img-list .img-item img.img-css` | 产品轮播图列表第一张图片 | 蜜蜂 Step 13: 获取首图 URL |
| `#packageInfo .header button` (文字含"选择图片") | 外包装选择图片按钮 | 蜜蜂 Step 14: 悬浮触发下拉 |
| `waitForVisibleLi('网络图片')` | 外包装下拉"网络图片"菜单项 | 蜜蜂 Step 14: 点击打开网络图片 |
| `findVisibleModal('从网络地址')` | 网络图片弹窗 `.ant-modal-wrap` 容器 | 蜜蜂 Step 15: 定位弹窗 |
| 容器 → `textarea.ant-input` | 图片 URL 输入框 | 蜜蜂 Step 15: 填入首图 URL |
| 容器 → `.ant-modal-footer .ant-btn-primary` | 弹窗底部"添加"按钮 | 蜜蜂 Step 16: 确认更新外包装 |

### 3.8 发布区域

| 选择器 | 含义 | 使用场景 |
|--------|------|---------|
| `.footer .btn-box button.btn-green` (文字含"发布") | 页面底部绿色"发布"按钮 | 蜜蜂 Step 18: 悬浮触发发布下拉 |
| `.ant-dropdown-menu-item[data-menu-id="2"]` (文字含"立即发布") | 发布下拉"立即发布"选项 | 蜜蜂 Step 19 |

### 3.9 TEMU 产品描述编辑器 `.smt-new-editor`

| 选择器 | 含义 | 使用场景 |
|--------|------|---------|
| `#baiduStatisticsSmtNewEditorEditClickNum > button` | "编辑描述"按钮（产品描述区域） | 编字: 打开编辑器 |
| `.smt-new-editor .menu-button.ant-dropdown-trigger` | 编辑器内"批量操作"下拉触发器 | 编字: 展开批量操作 |
| `.smt-new-editor .desc-img-box img` | 编辑器描述图片 | 编字: 检测是否有图片模块 |
| `.smt-new-editor .desc-content` | 编辑器描述文字内容 | 编字: 检测是否有文字模块 |
| `.smt-new-editor .btn-orange` | 编辑器"保存"按钮（橙色） | 编字: 保存描述 |
| `.ant-modal-confirm .ant-modal-confirm-btns .ant-btn-primary` | 清空确认弹窗的"确定"按钮 | 编字: 确认清空模块 |
| `.batch-smt-image` | 批量传图弹窗面板 | 编字: 等待面板出现 |
| `.batch-smt-image button` (文字含"选择图片") | 批量传图弹窗内"选择图片"按钮 | 编字: 找到选择图片入口 |
| button → 向上查找 `.ant-dropdown-trigger` 祖先 | "选择图片"下拉触发器 | 编字: 展开选择图片菜单 |

### 3.10 网络图片弹窗（多场景共用）

| 选择器 | 含义 | 使用场景 |
|--------|------|---------|
| `findVisibleModal('从网络地址')` | 弹窗 `.ant-modal-wrap` 容器 | 编字/粘字: 定位弹窗 |
| 容器 → `textarea.ant-input` | 图片 URL 输入框 | 编字/粘字: 填入 URL |
| 容器 → `.ant-modal-footer .ant-btn-primary` | 弹窗底部"添加"按钮 | 编字/粘字: 确认添加 |

**弹窗标题**: "从网络地址(URL)选择图片"
**触发方式**: 通过"选择图片"下拉菜单中的"网络图片"/"网络上传"菜单项打开

### 3.11 引用产品图片弹窗

| 选择器 | 含义 | 使用场景 |
|--------|------|---------|
| `findVisibleModal('引用产品图片')` | 弹窗 `.ant-modal-wrap` 容器 | 编字(轮播图路径): 定位弹窗 |
| 容器 → `label.ant-checkbox-wrapper` → `:scope > span` (文字="全部") | 全选 Checkbox | 编字: 全选图片 |
| 容器 → `.ant-checkbox` | Checkbox 状态元素（`.ant-checkbox-checked` 表示已勾选） | 编字: 检查是否已勾选 |
| 容器 → `.ant-modal-footer .ant-btn-primary` | 弹窗底部"确认"按钮 | 编字: 确认选择 |

### 3.12 批量传图弹窗

| 选择器 | 含义 | 使用场景 |
|--------|------|---------|
| `findVisibleModal('批量传图')` | 弹窗 `.ant-modal-wrap` 容器 | 编字: 定位弹窗 |
| 容器 → `.ant-modal-footer .ant-btn-primary` | 弹窗底部"确定"按钮 | 编字: 确认批量传图 |

---

## 四、Dropdown 菜单项查找

Dropdown 菜单项统一通过 `waitForVisibleLi(文字片段)` 查找：

| 菜单文字 | 所属下拉 | 使用场景 |
|----------|---------|---------|
| 清空描述 | 批量操作菜单（编辑器内） | 编字: 展开清空子菜单（需 `hoverWithCoords`） |
| 清空文字模块 | 清空描述子菜单 | 编字: 清空文字 |
| 清空图片模块 | 清空描述子菜单 | 编字: 清空图片 |
| 批量传图 | 批量操作菜单（编辑器内） | 编字: 打开批量传图 |
| 引用产品轮播图 | 选择图片菜单（编辑器内） | 编字(轮播图路径) |
| 网络上传 | 选择图片菜单（编辑器内） | 编字(网络图片路径) |
| 网络图片 | 产品轮播图-选择图片下拉 | 粘字 Step 3: 添加轮播图 |
| 网络图片 | 外包装-选择图片下拉 | 粘字 / 蜜蜂 Step 14: 更新外包装 |
| 中文→英文 (`li.menu-item`) | 一键翻译下拉 | 蜜蜂 Step 5 / 译按钮 |
| 立即发布 (`data-menu-id="2"`) | 发布下拉 | 蜜蜂 Step 19 |

---

## 五、配置系统

### 5.1 localStorage 键名

| 键名 | 类型 | 默认值 | 含义 |
|------|------|--------|------|
| `__dxm_bee_filters` | JSON 数组 | 12 条默认规则 | 标题过滤规则列表 |
| `__dxm_bee_filter_enabled` | `'true'`/`'false'` | `'true'` | 标题过滤是否启用 |
| `__dxm_bee_sku_filters` | JSON 数组 | 18 条默认规则（括号/标点→空格） | SKU变种属性过滤规则列表 |
| `__dxm_bee_sku_filter_enabled` | `'true'`/`'false'` | `'true'` | SKU变种属性过滤是否启用 |
| `__dxm_bee_auto_sku_no` | `'true'`/`'false'` | `'true'` | 是否自动执行高级SKU货号生成 |
| `__dxm_bee_del_video` | `'true'`/`'false'` | `'true'` | 是否自动删除产品视频 |
| `__dxm_bee_auto_publish` | `'true'`/`'false'` | `'true'` | 是否自动发布（控制 Step 18/19） |
| `__dxm_bee_stores` | JSON 数组 | `[]` | 店铺名称列表 |
| `__dxm_bee_selected_store` | 字符串 | `''` | 当前选中的店铺名称 |
| `__dxm_bee_use_web_image` | `'true'`/`'false'` | `'false'` | 编字流程是否使用网络图片 |
| `__dxm_bee_auto_category` | `'true'`/`'false'` | `'false'` | 是否自动点击分类（控制 Step 2/3） |
| `__dxm_bee_province` | 字符串 | `'广东省'` | 省份选择（校验必须以省/市/自治区/特别行政区结尾） |
| `__dxm_bee_auto_translate` | `'true'`/`'false'` | `'true'` | 是否自动翻译（控制 Step 5） |

### 5.2 BeeConfig API

| 方法 | 说明 |
|------|------|
| `loadFilters()` / `saveFilters(data)` | 加载/保存标题过滤规则 |
| `loadFilterEnabled()` / `saveFilterEnabled(val)` | 标题过滤开关 |
| `loadSkuFilters()` / `saveSkuFilters(data)` | 加载/保存SKU变种属性过滤规则 |
| `loadSkuFilterEnabled()` / `saveSkuFilterEnabled(val)` | SKU变种属性过滤开关 |
| `loadAutoSkuNo()` / `saveAutoSkuNo(val)` | 自动SKU高级开关 |
| `loadDelVideo()` / `saveDelVideo(val)` | 删除产品视频开关 |
| `loadAutoPublish()` / `saveAutoPublish(val)` | 自动发布开关 |
| `loadStores()` / `saveStores(data)` | 店铺列表 |
| `loadSelectedStore()` / `saveSelectedStore(val)` | 当前店铺 |
| `loadUseWebImage()` / `saveUseWebImage(val)` | 网络图片开关 |
| `loadAutoCategory()` / `saveAutoCategory(val)` | 自动分类开关 |
| `loadProvince()` / `saveProvince(val)` | 省份选择（带校验，不合法回退默认值） |
| `loadAutoTranslate()` / `saveAutoTranslate(val)` | 自动翻译开关 |
| `setInputValue(input, val)` | 设置 Vue 受控 Input/Textarea 值 |
| `findVisibleModal(titleText)` | 双重判断定位弹窗（返回 `.ant-modal-wrap`） |
| `hoverElement(el)` / `unhoverElement(el)` | 悬浮触发/取消 Dropdown |
| `waitForElement(selector, timeout, cb)` | 等待元素出现 |
| `showBubble(text, type)` / `hideBubble()` | 气泡通知 |

### 5.3 配置 UI 入口

右键小蜜蜂图标弹出菜单，包含：
- 📝 标题过滤 — 点击文字打开配置面板，点击 switch 切换开关
- 🏷️ SKU变种属性过滤 — 点击文字打开配置面板，点击 switch 切换开关
- 🔢 自动SKU高级 — switch 开关，默认开启，控制SKU工作流自动执行高级SKU货号
- 🏪 选择店铺 — 点击打开店铺管理弹窗（添加/删除/选择）
- 📂 自动点击分类 — switch 开关，默认关闭
- 🎬 删除产品视频 — switch 开关，默认开启，控制蜜蜂 Step 8
- 🔊 自动翻译 — switch 开关，默认开启，控制蜜蜂 Step 5 翻译步骤
- 📍 省份选择 — 输入框，防抖 500ms 自动保存，为空或格式不合法自动回退默认值 `广东省`
- 🌐 网络图片 — switch 开关，控制编字流程图片来源
- 🚀 自动发布 — switch 开关，控制蜜蜂 Step 18/19

**菜单定位**: 自动检测空间，右侧不够显示在左侧，下方不够向上弹出。

---

## 六、UI 组件结构

### 6.1 小蜜蜂浮动面板 `#__dxm_bee`

```
#__dxm_bee (fixed 定位, 可拖动)
├── #__dxm_bee_bubble        气泡通知 (absolute, bottom:100%)
├── #__dxm_bee_icon          蜜蜂 SVG 图标 (56×56, 可拖动/可点击)
├── #__dxm_bee_translate     译 (34×34, 橙黄色圆形按钮)
├── #__dxm_bee_edit          编 (34×34, 绿色圆形按钮)
├── #__dxm_bee_paste         粘 (34×34, 紫色圆形按钮)
├── #__dxm_bee_sku           S  (34×34, 青蓝色圆形按钮)
└── #__dxm_bee_delete        删 (34×34, 红色圆形按钮)
```

**气泡定位**: `position: absolute; bottom: 100%` 在图标上方显示。通过 `.at-right` class 判断图标在屏幕左/右侧，调整气泡左右对齐避免超出屏幕。

**标题气泡**: 工作流 Step 4 时在标题输入框上方显示气泡框，展示原标题/过滤后标题/违禁字符。白色背景 + 蓝色边框阴影 + 底部小箭头指向标题。工作结束后气泡持续显示。

**拖动逻辑**: mousedown → mousemove(>4px 判定为拖动) → mouseup。拖动后如果在左右边距 <100px 范围内，自动吸附到屏幕边缘。

**按钮功能**:
| 按钮 | 颜色 | 功能 | 文件 |
|------|------|------|------|
| 译 | 橙黄 `#FFCA28→#FFA000` | 一键翻译（含标题气泡+翻译） | dxm-float-bee.js |
| 编 | 绿 `#66BB6A→#43A047` | 一键编辑描述 | dxm-edit-desc.js |
| 粘 | 紫 `#AB47BC→#8E24AA` | 粘贴图片URL + 清空旧外包装 + 更新外包装 | dxm-paste-img.js |
| S  | 青 `#26C6DA→#00838F` | SKU变种属性过滤 + 高级SKU货号 | dxm-sku.js |
| 删 | 红 `#EF5350→#C62828` | 清空产品轮播图 | dxm-paste-img.js |

---

## 七、工作流程概览

### 7.1 点击小蜜蜂 — 自动填表 (19步)

| 步骤 | 操作 | 关键选择器 | 备注 |
|------|------|-----------|------|
| 1 | 检查/选择店铺 | `#productBasicInfo .ant-form-item-label label` | 店铺变更后跳过 Step 2/3 |
| 2 | 点击分类按钮 | `#productBasicInfo .category-item button` | 可配置跳过 |
| 3 | 确认分类弹窗 | `.ant-modal-footer button.ant-btn-primary` | |
| 4 | 过滤标题违规词 | `#productProductInfo form .ant-form-item input` | 使用 `setInputValue`；在标题上方显示气泡窗 |
| 5 | 一键翻译 | `button.translation-btn` → `li.menu-item` | 可配置跳过；悬浮触发下拉 |
| 6 | 打开省份下拉 | `waitForProvinceSelect` | 通过"产地"标签定位 `.productOrigin` 第2个 Select |
| 7 | 选择配置省份 | `.ant-select-item-option[title="省份名"]` | 读取 `Config.loadProvince()` |
| 8 | 删除产品视频 | `.video-operate-img` → `.video-operate-box a.link` (删除) | 可配置跳过；仅删除可见视频 |
| 9 | 打开外包装形状 | `waitForAntSelect('外包装形状')` | 通过 label 文字定位 Select |
| 10 | 选择不规则 | `.ant-select-item-option[title="不规则"]` | |
| 11 | 打开外包装类型 | `waitForAntSelect('外包装类型')` | |
| 12 | 选择软包装+硬物 | `.ant-select-item-option[title="软包装+硬物"]` | |
| 13 | 获取产品轮播图首图URL | `#productProductInfo .mainImage .img-list .img-item img.img-css` | 无图则跳到 Step 17 |
| 14 | 悬浮外包装选择图片 | `#packageInfo .header button` → `waitForVisibleLi('网络图片')` | `hoverElement` 触发 |
| 15 | 点击网络图片 → 填入URL | `findVisibleModal('从网络地址')` → `textarea.ant-input` | 用 `setInputValue` 填入首图URL |
| 16 | 确认更新外包装 | 容器 → `.ant-modal-footer .ant-btn-primary` | |
| 17 | 检查标题长度 | `.inputContainer .color-gray` | 超限则智能截取 |
| 18 | 悬浮发布按钮 | `.footer button.btn-green` | 可配置跳过 |
| 19 | 立即发布 | `.ant-dropdown-menu-item[data-menu-id="2"]` | |

### 7.2 点击"S" — SKU变种属性过滤 + 高级SKU货号

| 步骤 | 操作 | 关键选择器 | 备注 |
|------|------|-----------|------|
| 1a | 检查开关/规则 | `Config.loadSkuFilterEnabled()` / `Config.loadSkuFilters()` | 未开启或无规则则跳过 |
| 1b | 遍历所有 SKU 属性 | `#skuAttrsInfo form` → `.options-module` → `label` | 逐个检查 `.theme-value-text` 文本 |
| 1c | 匹配过滤规则并替换 | `.btn-edit` → `.edit-inp` → `.btn-save` | 点击编辑→设值→保存，每步间隔 65ms |
| 2a | 检查自动SKU高级开关 | `Config.loadAutoSkuNo()` | 关闭则跳过 |
| 2b | 点击"高级"链接 | `#skuDataInfo table th` → `span.link` (文字"高级") | 需遍历跳过"一键生成"链接 |
| 2c | 等待弹窗 → 点击"生成" | `findVisibleModal('SKU高级生成规则')` → `.ant-btn-primary` | |

### 7.3 点击"译" — 一键翻译

**流程**: 先读取标题并展示标题气泡（执行过滤+显示气泡），然后触发翻译。

### 7.4 点击"编" — 一键编辑描述

**条件分支**: 根据 `BeeConfig.loadUseWebImage()` 决定图片来源

**流程**:
1. 打开编辑描述（`#baiduStatisticsSmtNewEditorEditClickNum > button`）
2. 等待编辑器加载（`.smt-new-editor .menu-button.ant-dropdown-trigger`），500ms 后检测内容
3. 检测已有内容：`.smt-new-editor .desc-content`（文字）、`.smt-new-editor .desc-img-box img`（图片）
4. 如有内容 → 链式清空（清空文字模块 / 清空图片模块）
5. 批量传图 → 选择图片下拉 → 两条路径：
   - **网络上传**（`useWebImage=true`）: 从产品页抓取前 8 张图片 URL → 填入 textarea → 添加
   - **引用产品轮播图**（`useWebImage=false`）: 全选 → 确认
6. 确认批量传图 → 保存描述

### 7.5 点击"粘" — 粘贴图片URL + 更新外包装

| 步骤 | 操作 | 关键选择器 |
|------|------|-----------|
| 1 | 读取剪贴板 | `navigator.clipboard.readText()` |
| 2 | 打开产品轮播图-选择图片下拉 | `#productProductInfo .mainImage .img-module .header button` → hover |
| 3 | 点击"网络图片"等待弹窗 | `waitForVisibleLi('网络图片')` → `findVisibleModal('从网络地址')` |
| 4 | 填入URL + 添加图片 | 弹窗内 `textarea.ant-input` → `.ant-modal-footer .ant-btn-primary` |
| 5 | 获取产品轮播图首图URL | `#productProductInfo .mainImage .img-list .img-item img.img-css` → `.src` |
| 6a | 检查外包装是否有旧图片 | `#packageInfo .img-list .img-item a.icon_delete` | 有则逐个删除 |
| 6b | 打开外包装-选择图片下拉 | `#packageInfo .header button` → hover |
| 7 | 点击"网络图片"等待弹窗 | `waitForVisibleLi('网络图片')` → `findVisibleModal('从网络地址')` |
| 8 | 填入首图URL + 更新外包装 | 弹窗内 `textarea.ant-input` → `.ant-modal-footer .ant-btn-primary` |

### 7.6 点击"删" — 清空产品轮播图

**流程**:
1. 查找所有图片容器 `#productProductInfo .mainImage .img-list .img-item`，统计总数
2. 逐个重查第一个删除按钮 `#productProductInfo .mainImage .img-list .img-item a.icon_delete`
3. 点击删除 → 间隔 50ms → 重复，直到没有图片
4. 显示 `✅ 已清空 N 张图片`

**策略**: 每次重新 `querySelector` 而非缓存元素引用，避免 DOM 变更后引用失效。

---

## 八、常见问题与解决

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
Ant Design Vue **所有弹窗**标题都有递增 ID（`#vcDialogTitle0`, `#vcDialogTitle1`...），不要用 ID 选择器。统一使用 `findVisibleModal(标题文字)` 方法。

### Q: 网络图片弹窗 textarea 设值报 `Illegal invocation`？
textarea 不能用 `HTMLInputElement.prototype` 的 setter。`setInputValue` 已自动根据 `tagName` 区分处理。

### Q: 编辑器内容检测后白等 5 秒？
不要用 `waitForElement('.smt-desc-content')` 等待内容元素——清空后该元素不存在会等超时。应改为 `setTimeout(500)` 后直接检测。

### Q: SKU货号列有多个 span.link？
"一键生成"和"高级"都是 `span.link`。需遍历找到文字含"高级"的那个。

### Q: 粘字工作流外包装图片重复？
粘字流程在添加外包装图片前会先检查并删除已有图片（`#packageInfo .img-list .img-item a.icon_delete`）。

---

## 九、方法文件位置

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
| 所有配置 load/save | dxm-config.js | `BeeConfig.loadXxx` / `BeeConfig.saveXxx` |
| `hoverWithCoords` | dxm-edit-desc.js | 内部函数 |
| `findVisibleLi` / `waitForVisibleLi` | dxm-edit-desc.js / dxm-paste-img.js / dxm-sku.js | 各自内部函数 |

---

## 十、文件加载顺序 (manifest.json)

```
dxm-config.js       → 配置系统（最先加载，其他文件依赖 BeeConfig）
dxm-float-bee.js    → 蜜蜂图标 + 拖动 + 气泡 + 19步工作流 + 译按钮
dxm-config-ui.js    → 右键菜单 + 店铺管理 + 过滤配置面板
dxm-edit-desc.js    → 编字工作流
dxm-paste-img.js    → 粘字工作流 + 删字工作流
dxm-sku.js          → SKU变种属性过滤 + 高级SKU货号
```

**适用页面**:
- `*://www.dianxiaomi.com/web/temu/choiceTemuList/draft*`
- `*://www.dianxiaomi.com/web/temu/add*`
- `*://www.dianxiaomi.com/web/temu/edit*`
- `*://www.dianxiaomi.com/web/temu/quoteEdit*`
