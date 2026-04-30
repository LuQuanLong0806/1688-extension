# 管理端功能逻辑文档

> 生成日期: 2026-04-30

---

## 一、系统概览

管理端是一个基于 **Vue 2.7 + iView 4.7** 的单页应用，用于管理 1688 采集的商品数据。服务端使用 **Express + sql.js (WASM SQLite)**，双数据库架构。

| 组件 | 技术 |
|------|------|
| 前端框架 | Vue 2.7.16 |
| UI 组件库 | View Design (iView) 4.7.0 |
| 图表 | ECharts 5.5.1 |
| 后端 | Express.js |
| 数据库 | sql.js (SQLite WASM) — `data.db` + `dxm_tree.db` |
| 端口 | 3000 |

---

## 二、页面结构

### 2.1 布局

```
┌─────────────────────────────────────────────┐
│  Header: 采集系统标题 + 统计信息            │
├──────┬──────────────────────────────────────┤
│      │                                      │
│ 侧栏 │        内容区域                       │
│      │  (根据菜单切换显示不同页面组件)         │
│ 仪表盘│                                      │
│ 采集   │                                      │
│ 类目   │                                      │
│      │                                      │
└──────┴──────────────────────────────────────┘
```

### 2.2 页面组件

| 组件 | 文件 | 说明 |
|------|------|------|
| `page-dashboard` | `dashboard.js` | 仪表盘首页 |
| `page-products` | `product-list.js` | 商品列表（主页面） |
| `page-categories` | `category-page.js` | 类目映射管理 |
| `detail-modal` | `detail-modal.js` | 商品详情弹窗（全屏） |
| `category-picker` | `category-picker.js` | 分类搜索选择器（共享组件） |
| `thumb-preview` | `thumb-preview.js` | 图片悬浮预览（全局） |

### 2.3 脚本加载顺序

```
Vue.js 2.7.16 (CDN)
View Design 4.7.0 (CDN)
ECharts 5.5.1 (CDN)
thumb-preview.js       → 图片悬浮预览（全局组件）
category-picker.js     → 分类搜索选择器（共享组件）
detail-modal.js        → 商品详情弹窗
dashboard.js           → 仪表盘
product-list.js        → 商品列表
category-page.js       → 类目映射
app.js                 → 主应用入口（路由、统计、全局方法）
```

---

## 三、数据库设计

### 3.1 主数据库 `data.db`

#### products 表（商品）

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `id` | INTEGER PK | 自增 | 商品ID |
| `source_url` | TEXT NOT NULL | - | 1688来源URL |
| `title` | TEXT | NULL | 商品标题 |
| `main_images` | TEXT | NULL | 主图JSON数组 `["url1","url2"]` |
| `desc_images` | TEXT | NULL | 描述图JSON数组 |
| `attrs` | TEXT | NULL | 属性JSON数组 `["attr1","attr2"]` |
| `skus` | TEXT | NULL | SKU JSON数组（含image/name/price/dimensions/weight等） |
| `status` | INTEGER | 0 | 使用状态：0=未使用, 1=已使用 |
| `category` | TEXT | NULL | 1688类目JSON `{catId,leafCategoryName,categoryPath,...}` |
| `detail_images` | TEXT | NULL | 详情图JSON数组 |
| `custom_category` | TEXT | NULL | 自定义类目（category-picker选择的叶子名） |
| `dxm_category` | TEXT | '' | 店小秘类目JSON `{path,leafName}` |
| `manual_category` | TEXT | NULL | 手动填写的分类（降级方案） |
| `created_at` | DATETIME | CURRENT_TIMESTAMP | 采集时间 |
| `updated_at` | DATETIME | CURRENT_TIMESTAMP | 更新时间 |

**parseRow 映射**:

| 数据库字段 | API返回字段 | 转换 |
|-----------|------------|------|
| `category` | `category` | JSON.parse → 对象 |
| `custom_category` | `customCategory` | 空值→`''` |
| `manual_category` | `manualCategory` | 空值→`''` |
| `dxm_category` | `dxmCategory` | JSON.parse → 对象或null |
| `main_images` | `main_images` | JSON.parse → 数组 |
| `desc_images` | `desc_images` | JSON.parse → 数组 |
| `detail_images` | `detail_images` | JSON.parse → 数组 |
| `attrs` | `attrs` | JSON.parse → 数组 |
| `skus` | `skus` | JSON.parse → 数组 |

#### categories 表（1688类目统计）

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `id` | INTEGER PK | 自增 | |
| `name` | TEXT UNIQUE | - | 1688类目名 |
| `custom_name` | TEXT | '' | 自定义类目名（旧逻辑，已被category_mappings替代） |
| `cat_id` | TEXT | NULL | 类目ID |
| `leaf_category_id` | TEXT | NULL | 叶子类目ID |
| `top_category_id` | TEXT | NULL | 顶级类目ID |
| `post_category_id` | TEXT | NULL | 发布类目ID |
| `count` | INTEGER | 1 | 该类目下商品数 |
| `created_at` | DATETIME | CURRENT_TIMESTAMP | |

#### settings 表（配置项）

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `key` | TEXT PK | - | 配置键名（与DXM页面localStorage键对应） |
| `value` | TEXT NOT NULL | - | 配置值 |
| `updated_at` | DATETIME | CURRENT_TIMESTAMP | |

**存储的配置键**: `__dxm_bee_filters`, `__dxm_bee_auto_publish`, `__dxm_bee_stores`, `__dxm_bee_selected_store`, `__dxm_bee_use_web_image`, `__dxm_bee_filter_enabled`, `__dxm_bee_auto_category`, `__dxm_bee_province`, `__dxm_bee_auto_translate`, `__dxm_bee_sku_filters`, `__dxm_bee_sku_filter_enabled`, `__dxm_bee_auto_sku_no`, `__dxm_bee_del_video`, `__dxm_bee_auto_fill`, `__dxm_bee_shop_id`, `1688_server_url`

#### dxm_categories 表（店小秘分类库）

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `id` | INTEGER PK | 自增 | |
| `path` | TEXT UNIQUE | - | 完整路径 |
| `leaf_name` | TEXT | - | 叶子名 |
| `count` | INTEGER | 1 | 出现次数 |
| `created_at` | DATETIME | CURRENT_TIMESTAMP | |

#### category_mappings 表（类目映射）

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `id` | INTEGER PK | 自增 | |
| `category_name` | TEXT NOT NULL | - | 1688类目名 |
| `custom_category` | TEXT NOT NULL | - | 自定义类目（category-picker选择的叶子名） |
| UNIQUE约束 | - | - | `(category_name, custom_category)` |

### 3.2 分类树数据库 `dxm_tree.db`

#### dxm_category_tree 表

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `cat_id` | INTEGER PK | - | 分类ID |
| `cat_name` | TEXT NOT NULL | - | 分类名称 |
| `parent_cat_id` | INTEGER | 0 | 父分类ID（0=顶级） |
| `cat_level` | INTEGER | 1 | 层级深度 |
| `is_leaf` | INTEGER | 0 | 是否叶子节点 |
| `path` | TEXT | '' | 完整路径（如"家居/厨房/模具"） |
| `sync_at` | DATETIME | CURRENT_TIMESTAMP | 同步时间 |

---

## 四、API 接口

### 4.1 商品 CRUD

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/product` | POST | 新增商品（1688采集时调用） |
| `/api/product` | GET | 商品列表（分页/搜索/筛选） |
| `/api/product/:id` | GET | 商品详情 |
| `/api/product/:id` | PUT | 更新商品（支持部分字段） |
| `/api/product/:id` | DELETE | 删除商品 |
| `/api/product/check` | GET | 检查是否已采集（`?offerId=`） |
| `/api/product/latest` | GET | 获取最新一条 |
| `/api/product/batch-delete` | POST | 批量删除 `{ids:[]}` |
| `/api/product/stats` | GET | 统计信息 |
| `/api/product/trend` | GET | 趋势数据 `?days=7` |
| `/api/product/categories` | GET | 所有1688类目名列表 |
| `/api/product/dxm-categories` | GET | 所有店小秘类目列表 |
| `/api/product/category-top` | GET | Top10类目统计 |
| `/api/product/clear-custom-category` | POST | 清空所有自定义类目（迁移映射后清空） |
| `/api/product/dxm-category` | POST | 保存店小秘分类 `{collectId,dxmCategory}` |

### 4.2 类目映射

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/category-mappings` | GET | 映射列表（支持keyword搜索） |
| `/api/category-mappings/:id` | DELETE | 删除映射 |

### 4.3 分类树

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/dxm-tree/sync` | POST | 同步分类数据 |
| `/api/dxm-tree/children` | GET | 获取子分类 `?parentId=0` |
| `/api/dxm-tree/search` | GET | 搜索叶子分类 `?keyword=` |
| `/api/dxm-tree/resolve-path` | GET | 名称反查路径 `?name=` |
| `/api/dxm-tree/status` | GET | 同步状态统计 |
| `/api/dxm-tree/root-status` | GET | 各大类同步状态 |
| `/api/dxm-tree/all-leaf-paths` | GET | 所有叶子分类路径 |
| `/api/dxm-tree/tree` | GET | 完整树结构（Cascader格式） |

### 4.4 配置与事件

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/settings` | GET/PUT | 配置读写 |
| `/api/events` | GET | SSE实时推送 |
| `/api/clear-signal` | GET/POST | 跨标签页信号 |

---

## 五、页面功能详情

### 5.1 仪表盘 (`page-dashboard`)

**展示内容**:
- 4个统计卡片：总采集数、未使用、已使用、类目数
- 采集趋势折线图（近7天）
- 类目分布柱状图（Top10）
- 最近采集列表（最新5条）
- 使用率仪表盘

**API调用**: `/api/product/stats`, `/api/product/trend`, `/api/product/category-top`, `/api/product?pageSize=5`

### 5.2 商品列表 (`page-products`)

#### 筛选栏
- 关键词搜索（标题）
- 状态筛选（全部/未使用/已使用）
- 1688类目筛选（下拉）
- 店小秘类目筛选（下拉，含"未映射"选项）

#### 操作栏
- 统计信息：共采集 N 条数据
- 店小秘引用产品ID（localStorage存储）
- 批量删除
- 批量设置类目
- 刷新按钮

#### 列表列

| 列名 | 宽度 | 说明 |
|------|------|------|
| 选择框 | 40 | 多选checkbox |
| 预览 | 80 | SKU首图缩略图（悬浮放大） |
| 标题 | 220 | 商品标题文本 |
| 1688类目 | 160 | 居中显示，来自product.category |
| 选择分类 | 300 | category-picker组件（搜索dxm_tree.db） |
| 手动分类 | 200 | i-input输入框（回车保存，降级方案） |
| 推荐类目 | 自适应 | 同1688类目下的其他自定义类目（category_mappings查询） |
| 来源地址 | 120 | 超链接到1688 |
| SKU | 200 | SKU名称列表 |
| 使用状态 | 100 | 标签（未使用/已使用） |
| 采集时间 | 200 | created_at |
| 操作 | 240 | 查看/编辑、新建打开、引用打开、删除 |

#### 实时更新
- 通过 `EventSource('/api/events')` 监听 `product-added` 事件
- 收到事件后自动刷新列表和统计

#### 外部跳转
- **新建打开**: `https://www.dianxiaomi.com/web/temu/add?collectId={id}`
- **引用打开**: `https://www.dianxiaomi.com/web/temu/quoteEdit?id={pid}&collectId={id}`

### 5.3 商品详情弹窗 (`detail-modal`)

全屏Modal，展示/编辑单个商品的完整数据。

#### 信息区域（从上到下）

| 区域 | 说明 |
|------|------|
| 主图 | 网格展示，可删除，点击预览 |
| 详情图 | 网格展示，可勾选/删除，支持全选 |
| SKU图 | 按图片分组，勾选关联SKU列表 |
| 基本信息 | 选择分类(category-picker)、手动分类(i-input)、标题(textarea)、来源、1688类目、采集时间、状态 |
| 描述图 | 网格展示，点击预览 |
| 属性 | 标签列表展示 |
| SKU列表 | 可编辑表格：checkbox、图片、名称、自定义名称、价格、长/宽/高、重量 |

#### 底部操作栏（固定定位）
- 保存按钮
- 标记已使用/未使用
- 关闭

#### 保存逻辑
`PUT /api/product/:id` 发送：
```json
{
  "title": "标题",
  "customCategory": "category-picker值",
  "manualCategory": "手动分类值",
  "mainImages": ["url"],
  "descImages": ["url"],
  "detailImages": [{"url":"url","_selected":true}],
  "skus": [{...,"_selected":true}],
  "status": 0
}
```

### 5.4 类目映射管理 (`page-categories`)

#### 分类树同步状态栏
- 显示总分类数、最后同步时间、层级数
- 无数据时显示"前往同步"按钮（提示去店小秘页面同步）

#### 映射列表
- 搜索框：按1688类目或店小秘类目过滤
- 统计：1688类目数、总映射数
- 表格：1688类目 | 店小秘类目 | 删除按钮

**数据来源**: `category_mappings` 表，通过 `PUT /api/product/:id` 更新 customCategory 时自动写入

### 5.5 分类搜索选择器 (`category-picker`)

共享组件，用于列表页内联编辑、详情弹窗、批量设置弹窗。

**交互**: 输入文字 → 防抖300ms搜索 → 显示下拉 → 点击选中 → 显示完整路径

**数据来源**: `dxm_tree.db` 的 `dxm_category_tree` 表（叶子节点搜索）

**降级**: 当 `dxm_tree.db` 无数据时，搜索无结果，此时使用"手动分类"列

---

## 六、店小秘自动填充流程

触发条件: URL含 `collectId` 参数

| 步骤 | 操作 | 数据来源 |
|------|------|---------|
| 0 | 自动选择店铺 | `BeeConfig.loadSelectedStore()` |
| 等待 | 页面loading消失（最多3秒） | `#dPageLoading.hidden` |
| 1 | 填入标题 | `data.title` |
| 1.5 | 填入来源URL | `data.source_url` |
| 1.6 | 自动选择类目 | `resolveCategory(data)` → 搜索弹窗 |
| 2 | 贴主图（主图+已选SKU图，最多10张） | `data.main_images` + `data.skus` |
| 2.5 | 删除产品视频 | DOM操作 |
| 3 | 选择省份 | `BeeConfig.loadProvince()` |
| 4 | 选择外包装形状"不规则" | DOM操作 |
| 4b | 选择外包装类型"软包装+硬物" | DOM操作 |
| 5 | 更新外包装图片 | 轮播图首图 |
| 6 | SKU填充（智能复用属性） | `data.skus` |

### 类目优先级
```
manualCategory → customCategory → dxmCategory → 1688原始类目
```

---

## 七、分析：不合理情况与优化建议

### 7.1 数据冗余/重复

| 问题 | 详情 | 建议 |
|------|------|------|
| `categories` 表的 `custom_name` 字段 | 已被 `category_mappings` 表替代，`custom_name` 字段不再使用 | 可废弃 `categories` 表的 `custom_name`，或迁移到 `category_mappings` |
| `dxm_categories` 表 | 店小秘分类库，与 `dxm_category_tree` 功能重叠 | 可考虑合并或废弃其一 |
| `custom_category` vs `manual_category` vs `dxm_category` | 三个类目字段并存，语义不清晰 | 见下方 7.2 |

### 7.2 分类字段混乱

当前商品有三个分类相关字段：

| 字段 | 来源 | 依赖 |
|------|------|------|
| `custom_category` | category-picker 选择 | 依赖 `dxm_tree.db` 有数据 |
| `manual_category` | 手动输入 | 无依赖（降级方案） |
| `dxm_category` | 店小秘页面自动收集 | 依赖店小秘页面操作 |

**问题**: 自动填充优先级是 `manualCategory → customCategory → dxmCategory`，但用户可能不清楚该填哪个。

**建议**: 考虑统一为一个分类字段，或明确文档说明各字段的使用场景。

### 7.3 `clear-custom-category` 接口

**问题**: 这个接口会清空所有商品的自定义类目，是一个危险操作，但没有二次确认机制（虽然前端有弹窗，但API本身无保护）。

**建议**: 增加操作日志或限制调用频率。

### 7.4 推荐类目查询

**当前逻辑**: 列表页每条商品的推荐类目都通过 `category_mappings` 表查询同1688类目下的其他自定义类目。

**问题**: 如果列表有20条商品，就是20次额外查询（在服务端列表API内完成）。当映射数量大时可能有性能影响。

### 7.5 category_mappings 写入时机

**当前**: 只在 `PUT /api/product/:id` 更新 `customCategory` 时写入。

**缺失场景**:
- 商品创建时如果有 `customCategory`，不会写入映射
- `clear-custom-category` 会迁移，但之后的新建商品不会自动映射

### 7.6 dxm_tree.db 无备份机制

**问题**: 数据库文件可被 `/api/dxm-tree/clear`（已移除）或意外清空，恢复需要重新同步（耗时长）。

**建议**: 考虑定期自动备份 `dxm_tree.db`。

### 7.7 SKU 数据中的 `_selected` 字段

**问题**: `_selected` 字段存在 SKU JSON 内部（`data.skus[i]._selected`），表示是否被勾选。这是运行时状态，和数据混在一起存储。

**影响**: 不同操作（详情弹窗保存、自动填充）都依赖这个字段来筛选SKU，但如果用户没保存过，所有SKU的 `_selected` 为 undefined（等同于 false）。

### 7.8 列表页 dxmCategory 筛选

**当前**: 通过 `GET /api/product/dxm-categories` 获取所有商品的 `dxm_category` 列表作为筛选选项。

**问题**: `dxm_category` 存储为 JSON 字符串，提取唯一值需要遍历所有商品。商品量大时有性能开销。

### 7.9 前端状态管理

**问题**: 没有使用 Vuex 或集中状态管理。`detail-modal` 通过 `$root.openDetail()` 调用，统计通过 `$root.loadStats()` 刷新，组件间通过 `$root` 和 `$refs` 通信。

**建议**: 对当前规模可接受，但如果继续扩展功能，建议引入简单的状态管理。

### 7.10 SSE 实时推送

**当前**: 使用 `EventSource('/api/events')` 监听新采集数据。

**问题**: 服务端重启后 SSE 连接断开，前端不会自动重连。

**建议**: 添加 SSE 断线重连逻辑。

---

## 八、优化方案与旧数据兼容策略

> 核心原则：**只加不改、启动迁移、兜底读取**。改代码不影响运行中的服务，重启后自动完成升级。

### 8.1 分类字段统一

**目标**: 将 `custom_category` 和 `manual_category` 合并为一个字段 `category`，简化自动填充优先级判断。

**兼容方案**:
```
旧字段(custom_category, manual_category) → 保留不删不改名
新字段(category) → ALTER TABLE ADD COLUMN，启动时自动创建
启动迁移 → UPDATE products SET category = COALESCE(custom_category, manual_category, '')
兜底读取 → 代码读数据时: new_category || custom_category || manual_category || ''
```

**自动填充优先级简化为**: `category → dxmCategory → 1688原始类目`

**UI 改动**: 列表页"选择分类"和"手动分类"两列合并为一列，category-picker 在上方，下方保留自由文本输入，两个输入共享同一个字段值。

**涉及的 `dxm-auto-fill.js` 改动**: `resolveCategory` 优先读 `data.category`，fallback 到 `data.customCategory` → `data.manualCategory`。

### 8.2 废弃 `categories` 表的 `custom_name`

**目标**: 映射关系统一走 `category_mappings` 表。

**兼容方案**:
```
categories 表 → 保留不删，custom_name 字段保留不删
启动迁移 → INSERT OR IGNORE INTO category_mappings (category_name, custom_category)
           SELECT name, custom_name FROM categories WHERE custom_name IS NOT NULL AND custom_name != ''
代码改动 → 商品创建时不再查 categories.custom_name，改为查 category_mappings
兜底读取 → 查询映射时先查 category_mappings，查不到再 fallback 到 categories.custom_name
```

### 8.3 合并 `dxm_categories` → `dxm_category_tree`

**目标**: 废弃 `dxm_categories` 表，统一使用 `dxm_category_tree`。

**兼容方案**:
```
dxm_categories 表 → 保留不删
启动迁移 → INSERT OR IGNORE INTO dxm_category_tree (cat_id, cat_name, path, is_leaf)
           从 dxm_categories 迁移已有数据
代码改动 → /api/dxm-category/library 等接口改为查 dxm_category_tree
兜底读取 → dxm_category_tree 查不到时 fallback 查 dxm_categories
```

### 8.4 category_mappings 写入补全

**目标**: 确保所有设置分类的场景都写入映射。

**需补充的场景**:
| 场景 | 当前 | 优化后 |
|------|------|--------|
| 商品创建时 | 不写映射 | 有 customCategory 时自动写映射 |
| 手动分类保存时 | 不写映射 | 保存 manual_category 时也写映射 |
| category-picker 选择时 | 写映射 | 不变（已有） |
| 批量设置类目时 | 不写映射 | 批量保存时也写映射 |

**实现**: 在 `PUT /api/product/:id` 中，`manualCategory` 变更时也触发映射写入，与 `customCategory` 逻辑一致。

### 8.5 dxm_tree.db 自动备份

**目标**: 防止分类树数据再次丢失。

**方案**:
- 每次 `/api/dxm-tree/sync` 写入后，复制 `dxm_tree.db` → `dxm_tree.db.bak`
- 服务启动时检查：如果 `dxm_tree.db` 为空但 `.bak` 有数据，自动从备份恢复
- 不提供 API 清空接口（已移除），只能手动删除文件

**实现**:
```js
function backupTreeDb() {
  try {
    const data = fs.readFileSync('dxm_tree.db');
    fs.writeFileSync('dxm_tree.db.bak', data);
  } catch (e) {}
}
```

### 8.6 SSE 断线重连

**方案**:
```js
// product-list.js startPoll
var es = new EventSource('/api/events');
es.onerror = function () {
  // 连接断开，3秒后重连
  es.close();
  setTimeout(function () { vm.startPoll(); }, 3000);
};
```

### 8.7 优化执行顺序建议

| 优先级 | 优化项 | 原因 |
|--------|--------|------|
| P0 | 8.4 category_mappings 写入补全 | 影响推荐类目准确性，改动小 |
| P0 | 8.5 dxm_tree.db 自动备份 | 防止数据丢失，改动小 |
| P0 | 8.6 SSE 断线重连 | 改动极小，提升体验 |
| P1 | 8.2 废弃 categories.custom_name | 减少数据冗余，需验证迁移 |
| P1 | 8.3 合并 dxm_categories | 减少表数量，需验证迁移 |
| P2 | 8.1 分类字段统一 | 涉及面最广，UI 改动大，建议最后做 |

### 8.8 通用兼容原则（适用于所有优化）

1. **只加不改**: 新增字段用 `ALTER TABLE ADD COLUMN`，新增表用 `CREATE TABLE IF NOT EXISTS`，不修改/删除已有列
2. **启动迁移**: 服务端 `initDb()` 中添加数据迁移逻辑，只在首次运行时执行（通过条件判断避免重复迁移）
3. **兜底读取**: 代码中读取数据时按优先级 fallback：新字段 → 旧字段 → 空值
4. **不影响运行中的服务**: 改代码文件不会生效，必须重启服务端才加载新代码
5. **不删旧表旧列**: 保留旧结构，新代码只读新字段，旧字段作为 fallback 兜底
