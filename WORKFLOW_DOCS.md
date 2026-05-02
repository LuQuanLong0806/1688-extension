# 店小秘小蜜蜂 — 功能流程详细文档

## 目录

1. [自动填表（dxm-auto-fill.js）](#1-自动填表)
2. [小蜜蜂工作流（点击蜜蜂图标）](#2-小蜜蜂工作流)
3. [翻译按钮](#3-翻译按钮)
4. [删图按钮](#4-删图按钮)
5. [贴图按钮](#5-贴图按钮)
6. [SKU按钮](#6-sku按钮)
7. [填表按钮](#7-填表按钮)
8. [包装按钮](#8-包装按钮)
9. [描述按钮](#9-描述按钮)
10. [同步类目树](#10-同步类目树)
11. [跨标签页清除选中](#11-跨标签页清除选中)

---

## 1. 自动填表

**触发条件**：页面 URL 包含 `collectId=xxx` 参数时自动启动
**脚本**：`dxm-auto-fill.js`
**前置**：等待 `#productProductInfo` 元素出现（最长 10s），然后延迟 1s 确保页面渲染完成

### 步骤链

#### Step 0: 自动选择店铺

- **读取配置**：`BeeConfig.loadSelectedStore()` 获取店铺名
- **定位元素**：遍历 `#productBasicInfo label` 找到文本包含"店铺名称"的 label → `.closest('.ant-form-item')` → `.querySelector('.ant-select-selector')`
- **跳过条件**：未配置店铺名 / 未找到店铺选择器 / 当前已选中正确店铺（对比 `.ant-select-selection-item` 的 textContent）
- **操作**：
  1. 聚焦搜索输入框 `.ant-select-selection-search-input`
  2. `forceOpenAntSelect(selector)` 打开下拉
  3. 等待下拉出现（轮询 `.ant-select-dropdown`，display 不为 none）
  4. 通过 `title` 属性精确匹配店铺名 `.ant-select-item-option[title="店铺名"]`
  5. 找到后 `.click()` 选中
- **完成**：选中后等 300ms，触发 `waitPageReady`

#### waitPageReady: 等待页面 loading 消失

- 检查 `#dPageLoading` 元素是否存在且不含 `hidden` 类
- 轮询间隔 200ms，最长等 3s

#### Step 1: 填入标题

- **定位**：`#productProductInfo form .ant-form-item input`（第一个 input）
- **操作**：`setInputValue(input, data.title)` 设置标题（无论是否已有内容都覆盖）
- **等 200ms**

#### Step 1.5: 填入来源URL（有 source_url 时）

- **定位**：`#dxmInfo input[name="sourceUrl"]`
- **操作**：`input.focus()` → `setInputValue(input, url)` → `input.blur()`

#### Step 1.6: 自动选择类目

- **类目优先级**：`manualCategory` → `customCategory` → `dxmCategory.leafName` → `category.leafCategoryName`
- **检查当前**：读取 `.category-list` 文本，如果包含目标 leafName 则跳过
- **等待**：`waitForElement('#productBasicInfo .category-item button', 5s)` 等待类目按钮渲染
- **选择方式**（弹窗搜索）：
  1. 点击 `#productBasicInfo .category-item button.ant-btn-primary`（"选择分类"按钮）
  2. 等待弹窗出现：`findVisibleModal('选择类目')`
  3. 找到搜索输入框 `input[name="searchCategory"]`
  4. 输入 leafName → 点击搜索按钮 `.ant-input-search-button`
  5. 等待搜索结果 `.search-result-item`
  6. 匹配规则：多条结果时优先用完整路径匹配，其次用 leafName 匹配，都无则取第一条
  7. 点击匹配结果 → 等待 300ms → 点击弹窗确认按钮 `.ant-modal-footer .ant-btn-primary`

#### Step 2: 贴主图（主图+详情图+SKU图，最多10张）

- **组合图片** `buildCarouselImages`：
  1. 已选主图（`_selected !== false`）
  2. 已选详情图（`_selected !== false`）
  3. 已选 SKU 的 image 字段
  4. 总数限制 10 张，URL 去重

- **删除已有轮播图**：
  1. 查找 `#productProductInfo .mainImage .img-list .img-item a.icon_delete`
  2. 逐个 `.click()` 删除，间隔 50ms
  3. 删完后等 300ms

- **粘贴新图**：
  1. 遍历 `#productProductInfo label` 找"产品轮播图" → `.closest('.ant-form-item')`
  2. 找 `.img-module .header button` 文本包含"选择图片"
  3. `hoverElement(selectBtn)` 悬浮触发下拉菜单
  4. `waitForVisibleLi('网络图片', 3s)` 等待"网络图片"选项出现
  5. `.click()` 点击"网络图片"
  6. 等待弹窗 `findVisibleModal('从网络地址')`
  7. 找到 `textarea.ant-input`，`setInputValue(textarea, urls.join('\n'))`
  8. 等 250ms → 点击 `.ant-modal-footer .ant-btn-primary`（添加按钮）
  9. 等 500ms 回调

#### Step 2.5: 删除产品视频

- **定位**：遍历 `#productProductInfo label` 找"产品视频"
- **查找视频**：`.video-operate-img` 中 `offsetParent !== null` 且含 `.video-operate-img-box`
- **删除流程**：
  1. 找 `.video-operate-box a.link` 文本包含"删除"
  2. `.click()` 点击
  3. 等 150ms → 找 `.ant-popconfirm-buttons .ant-btn-primary`（确认按钮）→ `.click()`
  4. 递归删除下一个视频，间隔 200ms

#### Step 3: 选择省份

- **读取配置**：`BeeConfig.loadProvince()`
- **定位**：遍历 `#productProductInfo label` 找"产地" → `.productOrigin` → 第二个 `.ant-select-selector`（第一个是国家，第二个是省份）
- **操作**：
  1. 检查已选省份是否正确（对比 `.ant-select-selection-item`）
  2. 聚焦输入框 → `forceOpenAntSelect(provSel)`
  3. 等 500ms → 找 `.ant-select-item-option[title="省份名"]` → `.click()`

#### Step 4a: 选择外包装形状（不规则）

- **定位**：`waitForAntSelect('外包装形状')` — 在 `#packageInfo` 中找 label 含"外包装形状" → `.ant-select-selector`
- **操作**：滚动到可视区 → 等 200ms → `forceOpenAntSelect` → 等 300ms → 找 `[title="不规则"]` → `.click()`

#### Step 4b: 选择外包装类型（软包装+硬物）

- **定位**：`waitForAntSelect('外包装类型')` — 同上方式找"外包装类型"
- **操作**：`forceOpenAntSelect` → 找 `[title="软包装+硬物"]` → `.click()`

#### Step 4c: 外包装图片

- **图片来源**：主图第一张（`data.main_images[0]`）
- **删除旧图**：找 `#packageInfo .img-list .img-item a.icon_delete` 逐个点击删除
- **粘贴新图**：
  1. 找 `#packageInfo .header button` 文本含"选择图片"
  2. `hoverElement` → `waitForVisibleLi('网络图片')` → `.click()`
  3. 等待弹窗 `findVisibleModal('从网络地址')`
  4. `setInputValue(textarea, imgUrl)` → 等 250ms → 点击添加按钮

#### Step 5: 描述图（仅存储到全局）

- 不执行 DOM 操作，仅记录日志 `描述图已加载 (N张)`
- 描述图数据已通过 `window.__collectedProduct = data` 存储到全局

#### Step 6: SKU 填充

- **筛选**：只处理 `_selected !== false` 的 SKU
- **提取属性值**：`sku.customName || sku.name || sku.sku`
- **清洗属性值** `sanitizeAttrValue`：去特殊符号（只保留中英文、数字、空格、括号、横杠、斜杠、小数点）
- **智能复用** `smartFillAttrs`：
  1. 获取已有属性标签 `#skuAttrsInfo form .options-module label.d-checkbox`
  2. 复用前 N 个已有属性：逐个点击 `.btn-edit` → 修改 `.edit-inp` → `.btn-save`，同时勾选 checkbox
  3. 多余的已有属性：取消勾选
  4. 不足的：通过 `.theme-value-add input + button` 添加新属性值
- **填充 SKU 表格行** `fillSkuTableRows`：
  - 定位 `#skuDataInfo table tbody tr`
  - 逐行填充：
    - **图片**：hover `.sku-image-box` 或 `.img-box` → 找下拉中 `li[data-menu-id="net"]`（网络图片）→ 等待弹窗 → 填入 URL → 点击添加
    - **申报价格**：`input[name="price"]`
    - **尺寸**：`input[name="skuLength/Width/Height"]`，先排序（大到小）
    - **重量**：`input[name="weight"]`

---

## 2. 小蜜蜂工作流

**触发**：在**工作页面**（add/edit/quoteEdit）点击小蜜蜂图标
**脚本**：`dxm-float-bee.js` 中 `icon.addEventListener('click', ...)`
**总步骤**：最多 19 步（显示进度条 `stepNum/19`）

### 步骤链

| 步骤 | 函数 | 操作 | DOM 元素/选择器 |
|------|------|------|----------------|
| Step 1 | `doStep1` | 检查/选择店铺 | `#productBasicInfo` label "店铺名称" → `.ant-select-selector` → `.ant-select-item-option[title="店铺名"]` |
| Step 2 | `doStep2` | 点击分类按钮（可配置 `loadAutoCategory` 跳过） | `#productBasicInfo .category-item button`（文本为"选择"或含"分类"） → `.click()` |
| Step 3 | doStep2 内 | 点击分类弹窗确认 | `.ant-modal-wrap:not([style*="display: none"]) .ant-modal-footer button.ant-btn-primary` → `.click()` |
| Step 4 | `doStep4` | 过滤标题违规字样 | `#productProductInfo form .ant-form-item input` → `applyFilters()` → `setInputValue()`；显示标题气泡 |
| Step 5 | `doStep5` | 触发一键翻译（可配置 `loadAutoTranslate` 跳过） | `.header .btn-box button.translation-btn` → hover → 找 `li.menu-item` 含"中文"和"英文" → `.click()` |
| Step 6 | `doStep6` | 打开省份下拉 | `#productProductInfo label "产地"` → `.productOrigin .ant-select-selector` (第2个) → `forceOpenAntSelect` |
| Step 7 | `doStep7` | 选择配置的省份 | `.ant-select-item-option[title="省份名"]` → `.click()` |
| Step 8 | `doStepDelVideo` | 删除产品视频（可配置 `loadDelVideo` 跳过） | 同自动填表的视频删除流程 |
| Step 9 | `doStep8` | 选择外包装形状"不规则" | `#packageInfo` label "外包装形状" → `.ant-select-selector` → `[title="不规则"]` |
| Step 10 | `doStep9` | 选择外包装类型"软包装+硬物" | `#packageInfo` label "外包装类型" → `.ant-select-selector` → `[title="软包装+硬物"]` |
| Step 11-14 | `doStep10` | 获取产品首图 → 清空外包装旧图 → 打开选择图片 → 填入外包装图片 | `#productProductInfo .mainImage .img-list .img-item img.img-css` 获取 src → 同粘贴图片流程 |
| Step 15 | `doStep11` | 检查标题长度并截取 | 读取 `.color-gray` 中的限制数字 → 超长时按标点断句截取 → `setInputValue` |
| Step 16 | `doStep12` | 悬浮发布按钮（可配置 `loadAutoPublish` 跳过） | `.footer .btn-box button.btn-green`（文本含"发布"）→ `hoverElement` |
| Step 17 | `doStep13` | 点击"立即发布" | `.ant-dropdown-menu-item[data-menu-id="2"]`（文本含"立即发布"）→ `.click()` |

### 特殊跳过逻辑

- **Step 1 选店铺后**：如果之前店铺为空且本次成功选择，跳过 Step 2/3（分类步骤），直接到 Step 4
- **Step 2**：如果 `loadAutoCategory()` 返回 false，跳过分类步骤
- **Step 5**：如果 `loadAutoTranslate()` 返回 false，跳过翻译
- **Step 8**：如果 `loadDelVideo()` 返回 false，跳过删除视频
- **Step 16**：如果 `loadAutoPublish()` 返回 false，跳过发布步骤，滚动到顶部后结束

---

## 3. 翻译按钮

**按钮ID**：`#__dxm_bee_translate`
**脚本**：`dxm-float-bee.js` → `doTranslateOnly()`

### 步骤

1. **获取标题**：`#productProductInfo form .ant-form-item input`
2. **过滤标题**（如果过滤开关开启）：`applyFilters(currentTitle, filters)` → 如有变更则 `setInputValue`
3. **显示标题气泡** `showTitleBubble`：在标题输入框上方显示"原标题"/"过滤后标题"
4. **找翻译按钮**：`#app .product-add-layout .header .btn-box button.translation-btn`
5. **悬浮触发下拉**：`hoverElement(translateBtn)`
6. **找翻译菜单项**：`.ant-dropdown:not(.ant-dropdown-hidden) li.menu-item`，文本同时含"中文"和"英文"
7. **点击翻译**：`item.click()` → `unhoverElement(translateBtn)`
8. **监听标题变化** `watchTitleChange`：每 300ms 检查 input.value 是否变化，记录到 `data-bee-translated-title` 属性
9. **重试逻辑**：如果 3s 内没找到菜单项 → `translateBtn.click()` 直接点击 → 再等 3s → 仍找不到则报错

---

## 4. 删图按钮

**按钮ID**：`#__dxm_bee_delete`
**脚本**：`dxm-paste-img.js`
**功能**：清空产品轮播图 + 产品视频 + 外包装图片

### 步骤

| 步骤 | 操作 | DOM 元素 |
|------|------|---------|
| 1/3 | 清空产品轮播图 | `#productProductInfo .mainImage .img-list .img-item a.icon_delete` 逐个 `.click()`，间隔 50ms |
| 2/3 | 清空产品视频 | 遍历 `#productProductInfo label` 找"产品视频" → `.video-operate-img` → `.video-operate-box a.link` 含"删除" → `.click()` → `.ant-popconfirm-buttons .ant-btn-primary` 确认 |
| 3/3 | 清空外包装图片 | `#packageInfo .img-list .img-item a.icon_delete` 逐个 `.click()` |

### 触发前操作

- 发送 `chrome.runtime.sendMessage({ action: 'clearResultSelections' })` 清除 1688 抓取结果页选中
- POST `/api/clear-signal` 通知服务端
- 滚动到 `#productProductInfo .mainImage` 可见区域

---

## 5. 贴图按钮

**按钮ID**：`#__dxm_bee_paste`
**脚本**：`dxm-paste-img.js`
**功能**：从剪贴板读取图片 URL，通过"网络图片"弹窗粘贴到产品轮播图

### 步骤

| 步骤 | 操作 |
|------|------|
| 1/3 | 读取剪贴板 `navigator.clipboard.readText()` |
| 2/3 | 打开网络图片弹窗：找"产品轮播图" label → `.img-module .header button` 含"选择图片" → `hoverElement` → `waitForVisibleLi('网络图片')` → `.click()` → 等待 `findVisibleModal('从网络地址')` |
| 3/3 | 填入 URL：`textarea.ant-input` → `setInputValue(textarea, clipText)` → 等 250ms → `.ant-modal-footer .ant-btn-primary`（添加按钮）→ `.click()` |

### 触发前操作

- 同删图按钮：清除选中 + 通知服务端 + 滚动到主图区域

---

## 6. SKU按钮

**按钮ID**：`#__dxm_bee_sku`
**脚本**：`dxm-sku.js`
**功能**：对 SKU 变种属性值执行文字过滤替换

### 步骤

1. **检查开关**：`BeeConfig.loadSkuFilterEnabled()` → 未开启则提示退出
2. **加载过滤规则**：`BeeConfig.loadSkuFilters()` → 筛选 `enabled && from`
3. **定位属性**：`#skuAttrsInfo form .options-module label`
4. **逐个检查**：
   - 读取 `.theme-value-text` 的 `title` 或 `textContent`
   - `applyFilters(text, filters)` 执行替换
   - 如有变更：
     - 点击 `.btn-edit`（编辑按钮）
     - 等 65ms → `.edit-inp`（输入框）→ `setInputValue(input, finalText)`
     - 等 65ms → `.btn-save`（保存按钮）→ `.click()`
5. **完成后**：如果 `loadAutoSkuNo()` 开启 → 自动执行高级 SKU 货号生成
   - 找 `#skuDataInfo table th` 含"SKU货号" → `span.link` 含"高级" → `.click()`
   - 等弹窗 `findVisibleModal('SKU高级生成规则')` → `.ant-modal-footer .ant-btn-primary`（生成按钮）→ `.click()`

### 数字单位补全 `addUnits`

- 纯英文+数字的属性值中，独立数字后自动追加 " PCS"（排除已有单位、小数部分）

---

## 7. 填表按钮

**按钮ID**：`#__dxm_bee_sku_table`
**脚本**：`dxm-sku-table.js`（通过 `Config.doSkuTableFill` 调用）
**功能**：填充 SKU 表格行数据（当前使用模拟数据）

### 步骤

1. 滚动到 `#skuDataInfo`
2. 调用 `Config.doSkuTableFill()`（无参数，使用 mock 数据）

> 注：当前实现使用硬编码 mock 数据，待接入实际数据源

---

## 8. 包装按钮

**按钮ID**：`#__dxm_bee_package`
**脚本**：`dxm-float-bee.js` → `doPackage()`
**功能**：自动设置外包装形状、类型、图片（3 步）

### 步骤

| 步骤 | 操作 | DOM 元素 |
|------|------|---------|
| 1/3 | 选择外包装形状"不规则" | `#packageInfo` label "外包装形状" → `.ant-select-selector` → `forceOpenAntSelect` → `[title="不规则"]` → `.click()` |
| 2/3 | 选择外包装类型"软包装+硬物" | 同上找"外包装类型" → `[title="软包装+硬物"]` → `.click()` |
| 3/3 | 更新外包装图片 | 取产品轮播图首图 `#productProductInfo .mainImage .img-list .img-item img.img-css` 的 src → 删除旧包装图 → hover `#packageInfo .header button` → "网络图片" → 弹窗填入 URL → 添加 |

### 图片去重检查

- 对比已有包装图片 URL 与首图 URL，相同则跳过更新

---

## 9. 描述按钮

**按钮ID**：`#__dxm_bee_edit`
**脚本**：`dxm-edit-desc.js`
**功能**：编辑产品描述 — 清空旧内容 + 批量传图 + 保存

### 步骤链

#### Step 1: 打开编辑描述

- **元素**：`#baiduStatisticsSmtNewEditorEditClickNum > button`（"编辑描述"按钮）
- **操作**：`.click()`
- **等待**：`waitForElement('.smt-new-editor .menu-button.ant-dropdown-trigger', 5s)` — 编辑器中的"批量操作"下拉触发器

#### Step 2: 检测已有内容

- **文字检测**：`.smt-new-editor .desc-content` 是否有非空 textContent
- **图片检测**：`.smt-new-editor .desc-img-box img` 是否存在
- **构建清空步骤**：有文字 → 加入"清空文字模块"；有图片 → 加入"清空图片模块"

#### Step 3: 清空模块（链式执行）

对每个需要清空的模块：

1. `hoverElement(trigger)` — 悬浮"批量操作"按钮
2. `waitForVisibleLi('清空描述', 3s)` — 等待"清空描述"菜单项出现
3. `hoverWithCoords(clearDescItem)` — 悬浮"清空描述"展开子菜单
4. `findVisibleLi(moduleName)` — 找到"清空文字模块"或"清空图片模块"
5. `.click()` 点击
6. `unhoverElement(trigger)` — 取消悬浮
7. `waitForElement('.ant-modal-confirm .ant-modal-confirm-btns .ant-btn-primary', 3s)` — 等待确认弹窗
8. `.click()` 确认清空

#### Step 4: 批量传图

1. `hoverElement(trigger)` — 悬浮"批量操作"
2. `waitForVisibleLi('批量传图', 3s)` — 等待菜单项
3. `.click()` 点击
4. `waitForElement('.batch-smt-image', 5s)` — 等待批量传图面板

#### Step 5: 选择图片来源

根据 `BeeConfig.loadDescWebUpload()` 配置：

**方式A：引用产品轮播图**（默认）
1. `waitForVisibleLi('引用产品轮播图', 5s)` → `.click()`
2. 等待弹窗 `findVisibleModal('引用产品图片')`
3. 找 `label.ant-checkbox-wrapper` 中文本为"全部"的 → `.click()` 全选
4. `.ant-modal-footer .ant-btn-primary`（选择按钮）→ `.click()`

**方式B：网络上传**
1. `waitForVisibleLi('网络上传', 5s)` → `.click()`
2. 等待弹窗 `findVisibleModal('从网络地址')`
3. 抓取产品主图：`#productProductInfo .mainImage .img-list .img-item img.img-css` 前 8 张的 src
4. `textarea.ant-input` → `setInputValue(textarea, urls.join('\n'))`
5. `.ant-modal-footer .ant-btn-primary`（添加按钮）→ `.click()`

#### Step 6: 确认 + 保存

1. `findVisibleModal('批量传图')` → `.ant-modal-footer .ant-btn-primary`（确定）→ `.click()`
2. 等 300ms
3. `.smt-new-editor .btn-orange`（保存按钮）→ `.click()`
4. 如果 URL 有 `collectId`，PUT `/api/product/:collectId` 更新 `status: 1`（标记已使用）

---

## 10. 同步类目树

**触发方式**：通过配置 UI 或右键菜单触发
**脚本**：`dxm-float-bee.js` → `syncDxmCategories()` / `syncSingleCategory()`
**功能**：采集店小秘全部分类树，保存到服务端 `dxm_category_tree` 表

### 流程

1. **获取店铺ID**：`Config.loadShopId()`
2. **获取一级分类**：POST `https://www.dianxiaomi.com/api/pddkjCategory/list.json`，body `shopId=xxx`
3. **逐个同步大类** `doSyncTree`：
   - 使用共享请求队列 `_syncQueue`，串行执行，避免并发被封
   - 每 20 次请求冷却 3-5 秒（`randomDelay(3000, 2000)`）
   - 请求间隔 1-2 秒
   - 每个节点解析：`catId, catName, parentCatId, catLevel, isLeaf, path`
   - 过滤隐藏/已删除节点（`isHidden || deleted`）
   - 缓存到 `batchBuffer`，每 50 条 flush 到服务端 POST `/api/dxm-tree/sync`
4. **递归子分类**：非叶子节点入队继续请求子分类

---

## 11. 跨标签页清除选中

**触发**：DXM 页面变为可见时（`visibilitychange` 事件，`!document.hidden`）
**脚本**：`dxm-float-bee.js` → `notifyClearResult()`

### 三级方案

| 方案 | 机制 | 延迟 | 依赖 |
|------|------|------|------|
| 方案1（主） | `chrome.runtime.sendMessage` → `background.js` 中继 → `chrome.tabs.sendMessage` 转发到所有 1688 标签页 | 即时 | 扩展 background.js |
| 方案2（备用） | POST `/api/clear-signal` → 1688 结果页每 2s 轮询 GET `/api/clear-signal` 对比时间戳 | ~2s | 服务器 |
| 方案3（备用） | `window.postMessage` + `localStorage` storage 事件 | 即时 | 同源页面 |

### 1688 结果页接收端

- **方案1**：`chrome.runtime.onMessage.addListener` → 清空 `_resultWindows` 中的选中状态
- **方案2**：`setInterval` 每 2s 查询 `/api/clear-signal?clientId=xxx`，时间戳变化时清空
- **方案3**：`window.addEventListener('message')` + `window.addEventListener('storage')` 监听

### 共享 clientId

- 使用 `chrome.storage.local.get/set('__shared_client_id')` 跨域共享
- 1688 和 DXM 内容脚本共享同一个 clientId
- 首次生成格式：`'c' + Date.now() + Math.random().toString(36).slice(2, 8)`

---

## 附录：共享 DOM 操作方法

通过 `BeeConfig`（`dxm-config.js`）暴露给所有脚本：

| 方法 | 功能 |
|------|------|
| `setInputValue(input, value)` | 设置 input/textarea 值并触发 React/Vue 的 input/change 事件 |
| `hoverElement(el)` | 模拟鼠标悬浮（mouseenter + mouseover） |
| `unhoverElement(el)` | 模拟鼠标离开（mouseleave + mouseout） |
| `hoverWithCoords(el)` | 带坐标信息的悬浮（某些菜单需要 mousemove 事件） |
| `waitForElement(selector, timeout, cb)` | 轮询等待 DOM 元素出现 |
| `waitForVisibleLi(text, timeout, cb)` | 等待可见的下拉菜单项（文本匹配） |
| `findVisibleModal(titleText)` | 找到标题包含指定文本且可见的弹窗 |
| `findVisibleLi(text)` | 找到包含指定文本且可见的 li 菜单项 |
| `forceOpenAntSelect(selector)` | 强制打开 Ant Design Select 下拉 |
| `showBubble(text, type)` | 显示小蜜蜂气泡提示 |
| `hideBubble()` | 隐藏气泡 |
| `applyFilters(text, filters)` | 执行文字过滤替换 |
| `loadSelectedStore()` | 读取配置的店铺名 |
| `loadProvince()` | 读取配置的省份 |
| `loadAutoCategory()` | 是否自动点击分类 |
| `loadAutoTranslate()` | 是否自动翻译 |
| `loadAutoPublish()` | 是否自动发布 |
| `loadDelVideo()` | 是否删除视频 |
| `loadFilterEnabled()` | 标题过滤开关 |
| `loadFilters()` | 标题过滤规则列表 |
| `loadSkuFilterEnabled()` | SKU 过滤开关 |
| `loadSkuFilters()` | SKU 过滤规则列表 |
| `loadAutoSkuNo()` | 是否自动高级 SKU 货号 |
| `loadDescWebUpload()` | 描述图使用网络上传（true）还是引用轮播图（false） |
| `getServerUrl()` | 获取服务端地址 |
| `loadShopId()` | 获取店铺 ID |
| `syncDxmCategories(onDone)` | 同步全部分类树 |
| `syncSingleCategory(catId, catName, onDone)` | 同步单个大类 |
| `fetchRootCategories(cb)` | 获取一级分类列表 |
| `doSkuTableFill(data)` | SKU 表格填充 |
