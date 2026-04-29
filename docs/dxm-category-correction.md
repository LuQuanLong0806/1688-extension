# 店小秘类目修正功能 - 需求文档

> 状态：方案已确认，待开发
> 创建时间：2026-04-29

---

## 1. 背景与现有类目体系

当前系统已有三种类目概念，新增后共四个：

| 字段 | 来源 | 性质 | 是否字典同步 | 说明 |
|------|------|------|-------------|------|
| `category` | 1688采集 | 只读 | 否 | 原始抓取类目JSON（含 leafCategoryName、categoryPath 等） |
| `custom_category` | 用户手动 | 别名 | **是** | 同原类目下所有商品统一修改，本质是显示别名（1:1） |
| `dxm_category`（新增） | 店小秘选择 | 映射 | **否** | 每条商品独立存储，同一1688类目可对应不同店小秘类目（1:N） |

**为什么 dxm_category 不能用字典同步？**
同一个1688类目在不同商品上可能对应不同的店小秘分类，例如"连衣裙"在店小秘可能归入"女装>裙装"或"女装>连衣裙"，取决于具体商品。

---

## 2. 核心流程

```
1688采集商品 → 商品带自定义类目 → 引用到店小秘编辑页 →
店小秘自动填充类目（如有历史 dxm_category） → 用户发现类目不对 →
手动选择正确类目 → 监听 input 变化 → 回传服务器（采集id + 店小秘类目）→
保存到该商品的 dxm_category
```

### 2.1 类目回传

- **触发方式**：监听店小秘页面的类目 input 值变化
- **回传接口**：`POST http://localhost:3000/api/product/dxm-category`
- **回传数据**：采集id + 店小秘类目信息
- **可行性**：高。用户选择分类后 input 值必然变化，通过 MutationObserver 或轮询监听即可

### 2.2 不影响原有功能

- 使用 `addEventListener` 追加监听，不覆盖原有事件
- 仅读取 DOM 值并回传，不修改页面原有逻辑

---

## 3. 数据结构设计

### 3.1 dxm_category 存储结构

```json
{
  "path": "女装/裙装/连衣裙",
  "leafName": "连衣裙",
  "leafId": "xxx"
}
```

- `path`：完整类目路径，用于二次匹配
- `leafName`：叶子类目名称，用于快速搜索
- `leafId`：叶子类目ID（如有）

### 3.2 自动填充匹配策略

```
1. 取叶子类目名 leafName 搜索
2. 搜索结果 = 1条 → 直接选中
3. 搜索结果 > 1条 → 用完整路径 path 匹配 → 选中正确的
4. 搜索结果 = 0条 → 不填充，提示用户手动选择
```

**优势**：
- 大部分场景叶子类目名唯一，搜索一次即命中
- 少数重名场景通过完整路径精确匹配
- 效率高，容错好

---

## 4. 数据库变更

### products 表新增字段

```sql
ALTER TABLE products ADD COLUMN dxm_category TEXT DEFAULT '';
```

存储格式：上述 JSON 字符串

### API 变更

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/product/dxm-category` | POST | 回传店小秘类目 `{ collectId, dxmCategory: { path, leafName, leafId } }` |
| `/api/product/:id` | PUT | allowedFields 新增 `dxmCategory: 'dxm_category'` |
| `/api/product/:id` | GET | parseRow 返回 `dxmCategory` |

---

## 5. 类目选择方案

> 店小秘提供两种分类选择方式，均需支持

### 5.0 公共元素

| 元素 | 选择器 | 说明 |
|------|--------|------|
| 分类区域 | `#productBasicInfo .category-item` | 产品分类表单项 |
| 分类输入框 | `.category-item .ant-select-selector` | Ant Select 组件 |
| 当前分类值 | `.category-item .ant-select-selection-item` | 已选分类显示文字（title 属性） |
| 清除按钮 | `.category-item .ant-select-clear` | 清除当前分类 |
| "选择分类"按钮 | `.category-item button.ant-btn-primary` | 打开分类选择弹窗 |
| 已选分类路径 | `.category-list` | 选择后显示完整路径（如 `艺术品、工艺品和缝纫用品 > 礼品包装用品 > 礼品包装袋`） |

### 5.1 方法A：下拉快选

**适用场景**：目标类目之前选过，下拉历史中有。

**步骤**：
1. `forceOpenAntSelect(.category-item .ant-select-selector)` 打开下拉
2. 等待选项出现 → 查找 `.ant-select-item-option[title="类目名"]`
3. 点击匹配项

**注意**：下拉中只有历史选过的类目，不是全部类目。

### 5.2 方法B：弹窗搜索选择

**适用场景**：通用方式，通过搜索定位类目。

**步骤**：
1. 点击"选择分类"按钮 → `findVisibleModal('选择类目')` 等待弹窗
2. 定位搜索输入框：`input[name="searchCategory"]`
3. `setInputValue(input, 叶子类目名)` 输入搜索词
4. 点击搜索按钮：弹窗 `.ant-input-search-button`（文字"搜索"）
5. 等待搜索结果 `.search-result-item` 出现
6. 匹配策略：
   - 1条结果 → 直接点击
   - 多条结果 → 遍历 `.search-result-item`，用 `textContent` 与完整路径匹配
7. 点击弹窗底部"选择"按钮：`.ant-modal-footer .ant-btn-primary`

**搜索结果 DOM 结构**：
```html
<div class="search-result">
  <div class="search-result-item">
    健康和家居用品/文具和礼品包装用品/办公礼品包装/<span class="f-red">礼品包装袋</span>
  </div>
  <div class="search-result-item">
    艺术品、工艺品和缝纫用品/礼品包装用品/<span class="f-red">礼品包装袋</span>
  </div>
</div>
```
- 完整路径在 `textContent` 中，用 `/` 分隔
- 匹配关键词用 `.f-red` 高亮
- 多条结果时，用 `textContent` 与存储的 `path` 做路径匹配

### 5.3 方法C：弹窗三级浏览选择

**适用场景**：搜索无结果时的回退方案，或按层级精确选择。

**步骤**：
1. 点击"选择分类"按钮 → `findVisibleModal('选择类目')` 等待弹窗
2. 三列 `.categories-box` 逐级选择：
   - **第1列**（顶级）：点击 `.categories-item`，匹配 `.categories-item-name` 的 `title` 属性
   - **第2列**（二级）：自动加载，同样方式选择
   - **第3列**（叶子）：没有 `icon_right` icon 的项是叶子类目
3. 叶子类目被选中（`.active`）后，点击弹窗底部"选择"按钮

**类目浏览器 DOM 结构**：
```html
<div class="categories-box">  <!-- 第1列：顶级 -->
  <div class="categories-item">
    <span class="categories-item-name" title="艺术品、工艺品和缝纫用品">...</span>
    <i class="iconfont icon_right"></i>  <!-- 有子级 -->
  </div>
  ...
</div>
<div class="categories-box">  <!-- 第2列：二级 -->
  ...
</div>
<div class="categories-box">  <!-- 第3列：叶子 -->
  <div class="categories-item">
    <span class="categories-item-name" title="礼品包装袋">...</span>
    <!-- 无 icon_right = 叶子类目 -->
  </div>
  ...
</div>
```

**判断叶子节点**：`.categories-item` 内**没有** `i.icon_right` 的就是叶子类目。
**当前选中**：`.categories-item.active`

### 5.4 自动填充策略（推荐执行顺序）

```
1. 尝试方法A（下拉快选）— 检查下拉中是否有目标类目
2. 若无 → 方法B（搜索模式）— 用叶子类目名搜索
   - 1条结果 → 直接选中
   - 多条 → 用完整路径匹配
   - 0条 → 方法C（浏览模式）— 逐级选择
3. 回传选中的类目到服务器
```

### 5.5 类目回传

**监听方式**：监听 `.category-list` 元素内容变化（MutationObserver）

```javascript
var catList = document.querySelector('.category-list');
var observer = new MutationObserver(function() {
  var path = catList.textContent.trim(); // "艺术品、工艺品和缝纫用品 > 礼品包装用品 > 礼品包装袋"
  // 解析路径，回传服务器
  var parts = path.split(' > ');
  var leafName = parts[parts.length - 1];
  fetch('http://localhost:3000/api/product/dxm-category', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      collectId: collectId,
      dxmCategory: { path: parts.join('/'), leafName: leafName }
    })
  });
});
observer.observe(catList, { childList: true, characterData: true, subtree: true });
```

**数据格式**：
- 存储路径用 `/` 分隔：`艺术品、工艺品和缝纫用品/礼品包装用品/礼品包装袋`
- 页面显示用 ` > ` 分隔（从 DOM 读取后转换）

---

## 6. 模块划分

> 每个按钮/功能独立文件，互不耦合，即使操作重叠也各自实现。

| 功能 | 文件 | 说明 |
|------|------|------|
| 蜜蜂（一键填表19步） | `dxm-float-bee.js` | 已有，含店铺/分类/过滤/翻译/省份/视频/形状/类型/外包装/标题/发布 |
| 贴图 | `dxm-paste-img.js` | 已有，粘贴图片URL |
| 填表 | `dxm-sku-table.js` | 已有，SKU表格填充 |
| SKU | `dxm-sku.js` | 已有，变种属性过滤 |
| 描述 | `dxm-edit-desc.js` | 已有，编辑描述 |
| 删图 | `dxm-paste-img.js` | 已有，清空图片 |
| **类目选择**（新增） | `dxm-category-select.js` | 独立文件，负责：从服务器读取 dxm_category → 自动选择类目 → 回传结果 |
| 自动填表 | `dxm-auto-fill.js` | 已有，collectId 触发全流程 |
| 配置系统 | `dxm-config.js` | 已有，BeeConfig 共享 API |
| 配置 UI | `dxm-config-ui.js` | 已有，右键菜单 |

**新增文件 `dxm-category-select.js` 职责**：
1. 从 URL 参数获取 collectId
2. 调用 `GET /api/product/:id` 获取 dxm_category
3. 执行自动选择类目（方法A → B → C 依次回退）
4. 监听 `.category-list` 变化，回传结果到服务器
5. 完全独立，不依赖蜜蜂/贴图等其他按钮的流程

**与现有功能的关系**：
- 自动填表（`dxm-auto-fill.js`）如需类目选择，调用 `dxm-category-select.js` 暴露的方法
- 蜜蜂 Step 2/3（点击分类+确认弹窗）保持原有逻辑不变
- 类目选择是独立按钮，可在蜜蜂流程之外单独使用

### manifest.json 加载顺序

```
dxm-config.js           → 配置系统
dxm-float-bee.js        → 蜜蜂图标 + 工作流
dxm-config-ui.js        → 右键菜单
dxm-auto-fill.js        → 自动填表
dxm-category-select.js  → 类目选择（新增）
dxm-edit-desc.js        → 描述
dxm-paste-img.js        → 贴图 + 删图
dxm-sku.js              → SKU
dxm-sku-table.js        → 填表
```

---

## 7. 涉及文件

| 文件 | 改动 |
|------|------|
| `server/server.js` | 新增 dxm_category 列迁移 + POST 回传接口 + parseRow 返回 |
| `sites/dianxiaomi/dxm-category-select.js` | **新建**，类目选择独立模块 |
| `sites/dianxiaomi/dxm-float-bee.js` | 新增类目选择按钮 UI |
| `manifest.json` | 新增 dxm-category-select.js |
| `server/public/js/components/product-list.js` | 列表展示 dxm_category（可选） |
| `server/public/js/components/detail-modal.js` | 详情展示 dxm_category（可选） |
