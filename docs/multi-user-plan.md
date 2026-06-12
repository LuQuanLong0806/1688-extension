# 公网访问 + 多用户系统方案

## Context
当前系统是**单用户多设备**架构：数据通过 Turso 云端全量共享，没有用户概念。
需求：
1. 公网暴露服务（Cloudflare Tunnel）
2. 多人协作，数据隔离
3. 采集 → 认领 → 各自管理的流水线
4. 浏览器插件回调支持

### 设计原则
- **采集箱机制**：插件采集的商品先进公共池（owner为空），operator 认领后变自己的，admin 可分配
- **最小改动**：products 只加 `owner` 和 `claim_at` 两个字段，分类映射/词库等知识库保持全局共享不按用户隔离

---

## 〇、现有项目功能清单

> 当前系统为**单用户多设备**架构，前后端一体，无任何鉴权机制。

### 技术栈
| 层 | 技术 |
|---|---|
| 前端 | Vue 2.7.16 SPA + iView UI，动态组件切换（无 Vue Router） |
| 后端 | Express.js，端口 3000 |
| 本地数据库 | SQLite（`server/data.db` + `server/dxm_tree.db`） |
| 云端数据库 | Turso（libSQL 云），双向同步 |
| 采集端 | Chrome 浏览器扩展（1688 商品页注入） |
| 加密 | AES-256-GCM（`server/crypto.js`），敏感配置加密存储 |
| OCR 微服务 | Python FastAPI + PaddleOCR，端口 3001 |
| AI 服务 | 智谱/通义/混元/ComfyUI 多 vendor 调度 |

### 核心功能模块

| 模块 | 路由文件 | 功能说明 |
|---|---|---|
| **商品采集** | `sites/1688/` 扩展 | 1688 商品页一键采集图片/标题/SKU/属性，POST 到服务器 |
| **商品管理** | `server/routes/products.js` | 商品列表、详情、编辑、软删除、批量操作、分类推荐 |
| **自动化流水线** | 同上 | 去中文(OCR) → 抠图(Rembg) → AI文生背景(ComfyUI) → 上传图床 → 添加到主图 |
| **分类映射** | `server/routes/categories.js` | 1688 分类 → DXM 分类映射，AI 智能推荐分类 |
| **词库管理** | 同上 | 关键词关联、同义词、黑名单、分类配置 |
| **DXM 分类树** | `server/routes/dxm-tree.js` | DXM 分类树采集、搜索、路径解析 |
| **云同步** | `server/routes/sync.js` | Turso 双向同步：products + 知识库表，按 updated_at 冲突解决 |
| **AI 模型配置** | `server/routes/ai/index.js` | 多 vendor API Key 管理、模型选择、调度优先级 |
| **AI 图像处理** | `server/routes/ai/image-edit.js` | 图片生成、图片编辑（ComfyUI img2img/inpaint） |
| **系统设置** | `server/routes/settings.js` | 配置管理、导入导出、SSE 实时推送 |
| **美图编辑器** | 前端组件 `meitu-editor-tools.js` | 在线图片标注、裁剪、批量替换 |
| **仪表盘** | 前端组件 `dashboard.js` | 采集趋势、分类统计 |
| **OCR 服务** | `server/services/ocr_service.py` | PaddleOCR 文字检测，中文区域定位 |
| **抠图服务** | `server/services/remove-bg.js` | ISNet/Rembg 模型抠图 |
| **修复服务** | `server/services/inpaint.js` | LaMa 模型图片修复（去文字后补背景） |

### 现有 API 路由清单（全部无鉴权）

| 挂载路径 | 路由文件 | 端点数 |
|---|---|---|
| `/api` | `routes/settings.js` | 8（设置 CRUD + 导入导出 + SSE + clear-signal） |
| `/api` | `routes/products.js` | 15（商品 CRUD + 统计 + 批量 + 推荐） |
| `/api` | `routes/categories.js` | 20（映射 CRUD + 关键词 + 同义词 + 黑名单 + 配置） |
| `/api` | `routes/dxm-tree.js` | 8（分类树采集/搜索/同步） |
| `/api/ai` | `routes/ai/index.js` | 20+（API Key 管理 + 模型配置 + ComfyUI 配置） |
| `/api/ai` | `routes/ai/image-edit.js` | 3（图片生成/编辑/场景图） |
| `/api/sync` | `routes/sync.js` | 16（云同步配置/测试/推送/拉取/双向同步） |

### 现有前端组件

| 文件 | 视图 |
|---|---|
| `product-list.js` | 商品列表（筛选、搜索、批量操作） |
| `detail-modal.js` | 商品详情弹窗（编辑、图片管理、自动化流水线） |
| `page-drafts.js` | 草稿箱 |
| `page-publish-queue.js` | 待发布队列 |
| `category-page.js` | 分类映射管理 |
| `page-word-library.js` | 词库管理 |
| `page-api-keys.js` | AI 模型配置 |
| `page-cloud-sync.js` | 云同步管理 |
| `page-meitu.js` | 美图编辑器 |
| `page-dashboard.js` | 仪表盘统计 |
| `page-editor.js` | 产品编辑器 |
| `category-picker.js` | 分类选择器 |
| `thumb-preview.js` | 图片预览 |
| `meitu-editor-tools.js` | 图片编辑工具箱 |

### 现有扩展文件

| 文件 | 功能 |
|---|---|
| `content.js` | 内容脚本注入 |
| `float-btn.js` | 1688 页面浮动按钮 + 设置面板 |
| `grab-core.js` | 图片扫描与分类（主图/详情图/SKU图） |
| `collect-data.js` | 数据采集与提交（fetch POST /api/product） |
| `popup.js` | 扩展弹出面板 |

---

## 一、现状分析

### 当前数据流
```
1688浏览器插件 → 采集到服务器 → 所有设备同步看到 → 单人操作
```

### 核心问题
- 所有商品全局共享，任何人都能改
- 没有"谁采集的"、"谁在处理"的概念
- `from_machine` 字段云端有但未使用（预留给多用户，从未填充）
- 分类映射、词库等知识库也是全局共享

### 现有数据库表
| 表 | 说明 | 是否需要用户关联 |
|---|---|---|
| products | 商品数据 | ✅ 需要 owner |
| category_mappings | 分类映射 | 共享（知识库） |
| keyword_category_rel | 关键词关联 | 共享（知识库） |
| keyword_synonyms | 同义词 | 共享（知识库） |
| keyword_blacklist | 黑名单 | 共享（知识库） |
| category_config | 词库配置 | 共享（知识库） |
| dxm_category_tree | DXM分类树 | 共享（只读） |
| settings | 系统配置 | 仅管理员 |

---

## 二、多用户方案设计

### 用户角色
| 角色 | 权限 |
|---|---|
| admin | 用户管理 + 所有操作 + 系统设置 |
| operator | 采集 + 认领 + 编辑自己的商品 + 查看知识库 |
| viewer | 只能查看，不能修改 |

### 数据流改造
```
1688插件 → 采集箱（公共池）→ operator认领 → 我的商品列表 → 编辑发布
```

### 采集箱概念
- 采集的商品先进「采集箱」（`products.owner = ''`）
- 任何 operator 可以浏览采集箱，点击「认领」变为自己的
- 认领后 `products.owner = username`，`products.claim_at = 当前时间`
- 管理员可以分配商品给指定 operator
- 采集箱中的商品超时未认领可自动清理

### 采集插件登录流程
```
┌──────────────────────────────────────────────────────┐
│ 1688 浏览器插件                                        │
│                                                      │
│  设置页: 填写服务器地址 + 用户名/密码                      │
│     ↓                                                │
│  点击「登录」→ POST /api/plugin-login                  │
│     ↓                                                │
│  成功 → 存储 JWT token 到 chrome.storage.local        │
│  失败 → 提示错误，仍可采集（进采集箱）                     │
│                                                      │
│  采集商品时:                                            │
│     ↓                                                │
│  有 token? → POST /api/product (Authorization: Bearer)│
│    ✅ 有 → owner = 当前用户（直接进「我的商品」）           │
│    ❌ 无 → owner = ''（进采集箱）                        │
└──────────────────────────────────────────────────────┘
```

- 插件端增加一个简洁的登录设置面板（服务器地址 + 用户名 + 密码）
- 登录成功后保存 token，后续采集请求自动带上 `Authorization: Bearer <token>` 头
- 未登录的插件仍可采集，商品进采集箱（owner=''）
- token 过期后提示重新登录

### 数据隔离策略
| 数据 | 隔离方式 |
|---|---|
| 我的商品 | `WHERE owner = currentUser` |
| 采集箱 | `WHERE owner = '' AND deleted = 0` |
| 全部商品 | 仅 admin 可见：`WHERE deleted = 0` |
| 知识库（映射/词库） | 全局共享，所有人可见可改 |
| 系统设置 | 仅 admin |
| DXM 分类树 | 全局共享只读 |

---

## 三、数据库改动

### 3.1 新增表：users（本地 + 云端）

**本地 DDL**（加到 `server/db.js` 的 LOCAL_TABLE_DEFS）：
```sql
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT DEFAULT '',
  role TEXT DEFAULT 'operator',
  last_login TEXT DEFAULT '',
  created_at TEXT DEFAULT '',
  updated_at TEXT DEFAULT ''
)
```

**云端 DDL**（加到 `server/cloud/index.js` 的 CLOUD_TABLE_DEFS）：
```sql
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT DEFAULT '',
  role TEXT DEFAULT 'operator',
  last_login TEXT DEFAULT '',
  created_at TEXT DEFAULT '',
  updated_at TEXT DEFAULT ''
)
```

### 3.2 products 表新增字段（本地 + 云端）

**本地**（`server/db.js` ALTER TABLE 迁移）：
```sql
ALTER TABLE products ADD COLUMN owner TEXT DEFAULT '';
ALTER TABLE products ADD COLUMN claim_at TEXT DEFAULT '';
```

**本地 DDL 也要同步更新**（新安装时直接建表）：
```sql
-- products DDL 新增这两行：
owner TEXT DEFAULT '',
claim_at TEXT DEFAULT '',
```

**云端 DDL**（`server/cloud/index.js` 的 products 定义新增）：
```sql
-- 云端 products DDL 新增：
owner TEXT DEFAULT '',
claim_at TEXT DEFAULT '',
```

`migrateCloudSchema()` 会自动 ALTER TABLE 补列，无需额外处理。

### 3.3 现有本地 products DDL（改动前）
```sql
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT DEFAULT '',
  source_url TEXT NOT NULL,
  title TEXT,
  main_images TEXT DEFAULT '',
  desc_images TEXT DEFAULT '',
  detail_images TEXT DEFAULT '',
  attrs TEXT DEFAULT '',
  skus TEXT DEFAULT '',
  status INTEGER DEFAULT 0,
  created_at TEXT DEFAULT '',
  updated_at TEXT DEFAULT '',
  category TEXT DEFAULT '',
  custom_category TEXT DEFAULT '',
  dxm_category TEXT DEFAULT '',
  manual_category TEXT DEFAULT '',
  deleted INTEGER DEFAULT 0,
  store_name TEXT DEFAULT '',
  variant_attr_name TEXT DEFAULT '',
  product_no TEXT DEFAULT '',
  variant_attr_name2 TEXT DEFAULT '',
  variant_attr_name3 TEXT DEFAULT '',
  variant_attr_images TEXT DEFAULT '',
  original_images TEXT DEFAULT '',
  automation_stage TEXT DEFAULT 'none',
  automation_log TEXT DEFAULT '',
  automation_issues TEXT DEFAULT '',
  automation_started_at TEXT,
  automation_finished_at TEXT
)
```

### 3.4 现有云端 products DDL（改动前）
```sql
CREATE TABLE IF NOT EXISTS products (
  uid TEXT PRIMARY KEY,
  source_url TEXT DEFAULT '',
  title TEXT,
  main_images TEXT,
  desc_images TEXT,
  detail_images TEXT,
  attrs TEXT,
  skus TEXT,
  category TEXT,
  custom_category TEXT,
  dxm_category TEXT,
  manual_category TEXT,
  status INTEGER DEFAULT 0,
  deleted INTEGER DEFAULT 0,
  from_machine TEXT DEFAULT '',
  store_name TEXT DEFAULT '',
  variant_attr_name TEXT DEFAULT '',
  product_no TEXT DEFAULT '',
  variant_attr_name2 TEXT DEFAULT '',
  variant_attr_name3 TEXT DEFAULT '',
  variant_attr_images TEXT DEFAULT '',
  original_images TEXT DEFAULT '',
  created_at TEXT,
  updated_at TEXT,
  automation_stage TEXT DEFAULT 'none',
  automation_log TEXT DEFAULT '',
  automation_issues TEXT DEFAULT '',
  automation_started_at TEXT,
  automation_finished_at TEXT
)
```

**注意**：云端有 `from_machine` 字段（从未使用），本地没有。新增的 `owner` / `claim_at` 可以直接替代 `from_machine` 的设计意图。

---

## 四、云同步改动

### 4.1 uploadProducts（本地 → 云端）

**改动前** SELECT（27个字段）：
```sql
SELECT uid, source_url, title, main_images, desc_images, detail_images, attrs, skus,
  category, custom_category, dxm_category, manual_category, status, deleted,
  store_name, variant_attr_name, product_no, variant_attr_name2, variant_attr_name3,
  variant_attr_images, original_images, created_at, updated_at,
  automation_stage, automation_log, automation_issues, automation_started_at, automation_finished_at
FROM products
```

**改动后** SELECT（29个字段，加 owner, claim_at）：
```sql
SELECT uid, source_url, title, main_images, desc_images, detail_images, attrs, skus,
  category, custom_category, dxm_category, manual_category, status, deleted,
  store_name, variant_attr_name, product_no, variant_attr_name2, variant_attr_name3,
  variant_attr_images, original_images, owner, claim_at,
  created_at, updated_at,
  automation_stage, automation_log, automation_issues, automation_started_at, automation_finished_at
FROM products
```

INSERT 和 ON CONFLICT UPDATE 的字段列表同步加上 `owner` 和 `claim_at`。

### 4.2 downloadProducts（云端 → 本地）

**改动前** SELECT（27个字段）：
```sql
SELECT uid, source_url, title, main_images, ... 同上 27 个
FROM products
```

**改动后** SELECT（29个字段，加 owner, claim_at）：
```sql
SELECT uid, source_url, title, main_images, ... , owner, claim_at, created_at, updated_at, ...
FROM products
```

INSERT 新增行和 UPDATE 已有行都要加上 `owner` 和 `claim_at`。

### 4.3 saveProductToLocalAndCloud

**改动**：INSERT 字段列表加 `owner` 和 `claim_at`，ON CONFLICT UPDATE 的 CASE WHEN 也要包含这两个字段。

### 4.4 uploadLocalToCloud / downloadCloudToLocal（知识库）

**不变**。知识库表（category_mappings, keyword_category_rel, keyword_synonyms, keyword_blacklist, category_config）保持全局共享，不涉及用户隔离。

### 4.5 users 表同步

新增 users 表的同步逻辑（新增到 SINGLE_TABLE_DEFS）：
```javascript
users: {
  localGet: function () { return db.getAll('SELECT username, password_hash, display_name, role, last_login, created_at, updated_at FROM users'); },
  cloudCols: 'username, password_hash, display_name, role, last_login, created_at, updated_at',
  cloudKey: ['username'],
  localKeyMatch: function (r) { return 'SELECT id FROM users WHERE username = ?'; },
  localKeyParams: function (r) { return [r.username]; },
  localInsert: `INSERT OR IGNORE INTO users (username, password_hash, display_name, role, last_login, created_at, updated_at) VALUES (?, ?, ?, ?, ?, datetime('now', '+8 hours'), ?)`,
  localInsertParams: function (r) { return [r.username, r.password_hash, r.display_name, r.role, r.last_login, r.updated_at]; },
  localUpdate: `UPDATE users SET display_name = ?, role = ?, updated_at = ? WHERE id = ?`,
  cloudTable: 'users',
  cloudInsert: `INSERT OR IGNORE INTO users (username, password_hash, display_name, role, last_login, created_at, updated_at) VALUES (?, ?, ?, ?, ?, datetime('now', '+8 hours'), ?)`,
  cloudInsertParams: function (r) { return [r.username, r.password_hash, r.display_name, r.role, r.last_login, r.updated_at]; },
  cloudUpdate: `UPDATE users SET display_name = ?, role = ?, updated_at = ? WHERE id = ?`,
  label: '用户'
}
```

**注意**：users 同步只同步账户信息（角色、昵称），不同步密码（每台机器独立管理密码更安全）。
或者：users 同步时用 updated_at 比较，云端更新的覆盖本地。

---

## 五、API 改动

### 认证相关
| 接口 | 说明 |
|---|---|
| `POST /api/login` | 登录，返回 JWT token |
| `POST /api/logout` | 登出 |
| `GET /api/me` | 当前用户信息 |
| `POST /api/change-password` | 修改密码 |

### 用户管理（admin only）
| 接口 | 说明 |
|---|---|
| `GET /api/users` | 用户列表 |
| `POST /api/users` | 创建用户 |
| `PUT /api/users/:id` | 编辑用户（角色、昵称） |
| `DELETE /api/users/:id` | 禁用用户（逻辑删除） |

### 商品改动
| 接口 | 改动 |
|---|---|
| `GET /api/products` | 加 `scope` 参数：`mine` / `inbox` / `all`(admin) |
| `POST /api/product` | 自动设置 `owner` 为当前用户（或留空进采集箱） |
| `POST /api/products/claim` | 认领商品：`UPDATE products SET owner=?, claim_at=datetime('now','+8 hours'), updated_at=datetime('now','+8 hours') WHERE uid=? AND owner=''` |
| `POST /api/products/assign` | admin 分配商品给指定用户（批量） |

### 采集插件改动
| 改动点 | 说明 |
|---|---|
| 插件设置页 | 增加服务器地址、用户名、密码、登录按钮 |
| 登录接口 | `POST /api/plugin-login` → 返回 JWT token，存 `chrome.storage.local` |
| 采集请求（已登录） | 带 `Authorization: Bearer` 头，商品进 `owner=username` |
| 采集请求（未登录） | 不带头，商品进采集箱 `owner=''` |
| token 刷新 | 401 响应 → 清除本地 token，提示重新登录 |

---

## 六、前端改动

### 登录页
- 新建 `login.html`，简洁密码登录
- 存 JWT token 到 localStorage

### 商品列表页
- 顶部增加切换：「我的商品」/「采集箱」/「全部」（admin）
- 采集箱商品显示「认领」按钮
- admin 可多选后「分配给...」

### 管理页（admin）
- 新增「用户管理」选项卡
- 创建/编辑/禁用用户

### 导航栏
- 右上角显示当前用户名 + 退出按钮
- admin 多一个「管理」菜单

---

## 七、关键文件清单

### 新建文件
| 文件 | 说明 |
|---|---|
| `server/middleware/auth.js` | JWT 鉴权中间件（白名单路由匹配 + 角色校验 + token 解析） |
| `server/public/login.html` | 登录页（用户名 + 密码，存 JWT 到 localStorage） |
| `server/routes/users.js` | 用户 CRUD + `/api/login` + `/api/plugin-login` + `/api/me` + `/api/change-password` |
| `server/public/js/components/page-users.js` | 用户管理页（admin 专用，创建/编辑/禁用用户） |

### 需修改文件 — 后端
| 文件 | 改动内容 |
|---|---|
| `server/server.js` | 挂载 auth 中间件 + CORS 限制 + 首次启动创建 admin 账户 |
| `server/db.js` | users 表 DDL + products 补 `owner`/`claim_at` 列（ALTER TABLE 迁移） |
| `server/cloud/index.js` | 云端 users 表 DDL + products 补 `owner`/`claim_at` 列 |
| `server/cloud/sync.js` | uploadProducts/downloadProducts/saveProductToLocalAndCloud 加 `owner`/`claim_at` + users 表同步 |
| `server/routes/products.js` | `GET /api/product` 加 scope/owner 过滤 + 认领/分配接口 + operator 编辑权限检查 |
| `server/routes/categories.js` | 全部接口加 token 验证（知识库共享不按用户隔离） |
| `server/routes/settings.js` | 修改/导出/导入接口限 admin，SSE 加 query token 验证 |
| `server/routes/sync.js` | 全部接口限 admin（云同步是高危操作） |
| `server/routes/dxm-tree.js` | 全部接口加 token 验证 |
| `server/routes/ai/index.js` | global-key 限 admin，其余 operator+ |
| `server/routes/ai/image-edit.js` | 加 token 验证，限 operator+ |

### 需修改文件 — 前端
| 文件 | 改动内容 |
|---|---|
| `server/public/index.html` | 启动时检查 localStorage token → 无则跳 login.html + 右上角用户名/退出 |
| `server/public/js/components/product-list.js` | 我的/采集箱/全部切换 + 认领按钮 + 所有 fetch 加 Authorization 头 |
| `server/public/js/components/detail-modal.js` | 编辑时检查 owner 权限 + fetch 加 token |
| `server/public/js/components/page-dashboard.js` | fetch 加 token |
| `server/public/js/components/page-cloud-sync.js` | fetch 加 token |
| `server/public/js/components/category-page.js` | fetch 加 token |
| `server/public/js/components/page-word-library.js` | fetch 加 token |
| `server/public/js/components/page-api-keys.js` | fetch 加 token |
| `server/public/js/components/page-meitu.js` | fetch 加 token |
| `server/public/js/components/page-editor.js` | fetch 加 token |
| `server/public/js/components/page-drafts.js` | fetch 加 token |
| `server/public/js/components/page-publish-queue.js` | fetch 加 token |

### 需修改文件 — 浏览器扩展
| 文件 | 改动内容 |
|---|---|
| `sites/1688/float-btn.js` | 设置面板加用户名/密码/登录按钮 + 采集时带 token |
| `sites/1688/collect-data.js` | fetch POST 加 `Authorization: Bearer` 头（有 token 时） |
| `sites/1688/popup.js` | 显示登录状态 + 快捷登录入口 |

---

## 八、完整 API 鉴权矩阵

> 基于实际路由文件梳理，当前所有 90+ 个端点均无鉴权。

### 无需登录（白名单）
| 端点 | 方法 | 说明 |
|---|---|---|
| `GET /` | GET | 首页（未登录 → login.html，已登录 → index.html） |
| `GET /login.html` | GET | 登录页 |
| `POST /api/login` | POST | Web 端登录 |
| `POST /api/plugin-login` | POST | 插件端登录 |
| `POST /api/product` | POST | 保存商品（插件采集入口，有 token 设 owner，无 token 进采集箱） |
| `GET /api/product/check` | GET | 检查商品是否已存在（插件采集前校验） |
| `GET /uploads/*` | GET | 上传文件访问 |
| `GET /api/events` | GET | SSE 推送（query ?token=xxx 验证） |
| 静态资源 | GET | `.css` `.js` `.png` `.jpg` `.ico` 等 |

### 需要登录 — 商品相关（routes/products.js）
| 端点 | 方法 | 说明 | 权限 |
|---|---|---|---|
| `/api/product` | GET | 商品列表（加 `scope`: mine/inbox/all） | any（all 仅 admin） |
| `/api/product/trend` | GET | 采集趋势统计 | any |
| `/api/product/stats` | GET | 商品统计概览 | any |
| `/api/product/categories` | GET | 1688 分类列表 | any |
| `/api/product/dxm-categories` | GET | 已映射 DXM 分类 | any |
| `/api/product/category-top` | GET | 分类排行 | any |
| `/api/product/dxm-category-top` | GET | DXM 分类排行 | any |
| `/api/product/:id` | GET | 商品详情 | any |
| `/api/product/:id` | PUT | 更新商品（仅 owner 或 admin） | operator 仅自己的 |
| `/api/product/:id` | DELETE | 删除商品（仅 owner 或 admin） | operator 仅自己的 |
| `/api/product/batch-delete` | POST | 批量删除 | operator 仅自己的 |
| `/api/product/batch-status` | POST | 批量改状态 | operator 仅自己的 |
| `/api/product/:id/recommend-category` | POST | AI 分类推荐 | any |
| `/api/products/claim` | POST | 认领商品（inbox → mine） | operator+ |
| `/api/products/assign` | POST | 分配商品给用户（批量） | admin |
| `PATCH /api/products/backfill-path` | PATCH | 补全分类路径 | admin |

### 需要登录 — 分类映射/词库（routes/categories.js）
| 端点 | 方法 | 说明 | 权限 |
|---|---|---|---|
| `/api/categories` | GET | 1688 分类 | any |
| `/api/category-mappings` | GET | 映射列表 | any |
| `/api/category-mappings/by-name` | GET | 按名称查映射 | any |
| `/api/category-mappings/by-dxm` | GET | 按 DXM 查映射 | any |
| `/api/category-mappings/grouped` | GET | 分组映射 | any |
| `/api/category-mappings` | POST | 新增映射 | operator+ |
| `/api/category-mappings/:id` | DELETE | 删除映射（逻辑删） | operator+ |
| `/api/category-mappings/dxm/:name` | DELETE | 按 DXM 名批量删 | operator+ |
| `/api/keyword-rels` | GET | 关键词关联列表 | any |
| `/api/keyword-rels/rebuild` | POST | 重建关键词关联 | operator+ |
| `/api/keyword-rels/:id` | DELETE | 标记无效 | operator+ |
| `/api/keyword-rels/batch-invalidate` | POST | 批量标记无效 | operator+ |
| `/api/keyword-synonyms` | GET/POST | 同义词 | any / operator+ |
| `/api/keyword-synonyms/:id` | DELETE | 删除同义词 | operator+ |
| `/api/keyword-blacklist` | GET/POST | 黑名单 | any / operator+ |
| `/api/keyword-blacklist/:id` | DELETE | 移出黑名单 | operator+ |
| `/api/category-config` | GET/POST | 分类配置 | any / operator+ |
| `/api/category-config/:id` | DELETE | 删除配置 | operator+ |
| `/api/category-config/batch-delete` | POST | 批量删除配置 | operator+ |

### 需要登录 — DXM 分类树（routes/dxm-tree.js）
| 端点 | 方法 | 说明 | 权限 |
|---|---|---|---|
| `/api/dxm-category/collect` | POST | 采集分类 | any |
| `/api/dxm-tree/sync` | POST | 同步分类节点 | any |
| `/api/dxm-tree/children` | GET | 子分类列表 | any |
| `/api/dxm-tree/status` | GET | 同步状态 | any |
| `/api/dxm-tree/root-status` | GET | 根分类状态 | any |
| `/api/dxm-tree/search` | GET | 搜索分类 | any |
| `/api/dxm-tree/resolve-path` | GET | 解析分类路径 | any |

### 需要登录 — AI 模型配置（routes/ai/index.js）
| 端点 | 方法 | 说明 | 权限 |
|---|---|---|---|
| `/api/ai/check-key` | GET | 检查 API Key | any |
| `/api/ai/get-key` | GET | 获取 Key（脱敏） | any |
| `/api/ai/save-key` | POST | 保存 Key | operator+ |
| `/api/ai/delete-key` | POST | 删除 Key | operator+ |
| `/api/ai/configs` | GET | 获取 AI 配置 | any |
| `/api/ai/configs` | POST | 保存 AI 配置 | operator+ |
| `/api/ai/global-key` | POST | 全局 Key | admin |
| `/api/ai/zhipu-keys` | POST | 智谱 Key 管理 | operator+ |
| `/api/ai/qwen-keys` | POST | 通义 Key 管理 | operator+ |
| `/api/ai/hunyuan-keys` | POST | 混元 Key 管理 | operator+ |
| `/api/ai/comfyui-status` | GET | ComfyUI 状态 | any |
| `/api/ai/comfyui-config` | GET/POST | ComfyUI 配置 | any / operator+ |
| `/api/ai/comfyui-models` | GET | ComfyUI 模型列表 | any |
| `/api/ai/qwen-vl-config` | GET | 通义 VL 配置 | any |
| `/api/ai/qwen-vl-config` | POST | 保存通义 VL | operator+ |
| `/api/ai/qwen-vl-config/delete` | POST | 删除通义 VL | operator+ |
| `/api/ai/vendor-configs` | GET | Vendor 配置 | any |
| `/api/ai/vendor-model` | POST | 更新模型选择 | operator+ |
| `/api/ai/dispatch-order` | GET/POST | 调度优先级 | any / operator+ |

### 需要登录 — AI 图像处理（routes/ai/image-edit.js）
| 端点 | 方法 | 说明 | 权限 |
|---|---|---|---|
| `/api/ai/image-gen` | POST | 图片生成 | operator+ |
| `/api/ai/image-edit` | POST | 图片编辑 | operator+ |
| `/api/ai/category-recommend` | POST | AI 分类推荐 | any |

### 需要登录 — 系统设置（routes/settings.js）
| 端点 | 方法 | 说明 | 权限 |
|---|---|---|---|
| `/api/settings` | GET | 获取所有设置（敏感值脱敏） | any |
| `/api/settings/:key` | GET | 获取单个设置 | any |
| `/api/settings/:key` | POST | 修改单个设置 | admin |
| `/api/settings` | PUT | 批量修改设置 | admin |
| `/api/settings-export` | GET | 导出配置（含解密敏感值） | admin |
| `/api/settings-import` | POST | 导入配置 | admin |
| `/api/clear-signal` | GET/POST | 清除信号 | any |

### 仅 admin — 云同步（routes/sync.js）
| 端点 | 方法 | 说明 |
|---|---|---|
| `/api/sync/config` | GET/POST | 同步配置 |
| `/api/sync/test` | POST | 测试连接 |
| `/api/sync/disconnect` | POST | 断开云端 |
| `/api/sync/init` | POST | 初始化云端数据库 |
| `/api/sync/sync` | POST | 双向同步 |
| `/api/sync/pull` | POST | 拉取 |
| `/api/sync/push` | POST | 推送 |
| `/api/sync/status` | GET | 同步状态 |
| `/api/sync/table-push/:key` | POST | 推送指定表 |
| `/api/sync/table-pull/:key` | POST | 拉取指定表 |
| `/api/sync/table-sync/:key` | POST | 同步指定表 |
| `/api/sync/tree-push/pull/sync` | POST | 分类树同步 |
| `/api/sync/product-push/pull/sync` | POST | 商品同步 |

### 仅 admin — 用户管理（routes/users.js 新建）
| 端点 | 方法 | 说明 |
|---|---|---|
| `/api/users` | GET | 用户列表 |
| `/api/users` | POST | 创建用户 |
| `/api/users/:id` | PUT | 编辑用户（角色、昵称） |
| `/api/users/:id` | DELETE | 禁用用户 |
| `/api/me` | GET | 当前用户信息 |
| `/api/change-password` | POST | 修改密码 |
| `/api/logout` | POST | 登出 |

### 权限逻辑总结
- **viewer**：所有 GET 可访问，任何 POST/PUT/DELETE → 403
- **operator**：可编辑自己的商品（`owner = 自己`），操作别人的商品 → 403；知识库可读写
- **admin**：无限制，可访问 `scope=all`、用户管理、云同步、系统设置
- **未登录**：仅白名单端点可访问，其余 → 401

---

## 九、老数据兼容方案

### 9.1 现有 products 无 owner 字段
- ALTER TABLE 迁移加 `owner TEXT DEFAULT ''` 和 `claim_at TEXT DEFAULT ''`
- 迁移后所有老商品 `owner = ''`（空字符串），自动归入采集箱
- 首次登录后 admin 可看到采集箱有大量老数据，可：
  - 一键「全部认领」将老数据归到自己名下
  - 或分配给其他 operator

### 9.2 现有插件无 token
- 插件不带 token 采集 → 服务端正常接收，商品进采集箱（owner=''）
- 完全向后兼容，老版本插件无需升级即可继续采集
- 升级后登录 → 新采集的商品直接进自己的列表

### 9.3 本地数据库迁移
```javascript
// server/db.js 迁移逻辑（启动时自动执行）
const migrations = [
  // 已有的迁移...
  { table: 'products', column: 'owner', type: 'TEXT DEFAULT \'\'' },
  { table: 'products', column: 'claim_at', type: 'TEXT DEFAULT \'\'' },
];
```

### 9.4 云端数据库迁移
- `migrateCloudSchema()` 自动检测缺失列并 ALTER TABLE
- 云端 products 已有 `from_machine` 字段（废弃不用），新增 `owner` / `claim_at`
- 云端新增 users 表，DDL 自动建表

### 9.5 云同步兼容
- products 同步字段列表加 `owner` / `claim_at`
- 老数据同步时 owner 为空字符串，两端一致
- users 表加入 SINGLE_TABLE_DEFS 同步
- 知识库同步不变，保持全局共享

### 9.6 前端兼容
- 未登录用户访问 → 重定向到 login.html
- 首次启动自动创建 admin 账户（默认密码 admin123，强制首次修改）
- 老数据的 owner='' 在前端显示为「采集箱」标签

---

## 十、云同步改造详解

### 10.1 products 同步加 owner/claim_at

**uploadProducts（本地 → 云端）SELECT 改动**：
```sql
-- 加 owner, claim_at 到 SELECT（放在 original_images 之后、created_at 之前）
SELECT uid, source_url, title, main_images, desc_images, detail_images, attrs, skus,
  category, custom_category, dxm_category, manual_category, status, deleted,
  store_name, variant_attr_name, product_no, variant_attr_name2, variant_attr_name3,
  variant_attr_images, original_images, owner, claim_at,
  created_at, updated_at,
  automation_stage, automation_log, automation_issues, automation_started_at, automation_finished_at
FROM products
```

INSERT / ON CONFLICT UPDATE 字段列表同步加上 `owner` 和 `claim_at`。

**downloadProducts（云端 → 本地）同理**：SELECT 加 owner, claim_at，INSERT/UPDATE 加上。

### 10.2 users 表同步

新增到 `SINGLE_TABLE_DEFS`：
```javascript
users: {
  localGet: function () { return db.getAll('SELECT username, password_hash, display_name, role, last_login, created_at, updated_at FROM users'); },
  cloudCols: 'username, password_hash, display_name, role, last_login, created_at, updated_at',
  cloudKey: ['username'],
  localKeyMatch: function (r) { return 'SELECT id FROM users WHERE username = ?'; },
  localKeyParams: function (r) { return [r.username]; },
  localInsert: 'INSERT OR IGNORE INTO users (username, password_hash, display_name, role, last_login, created_at, updated_at) VALUES (?, ?, ?, ?, datetime(\'now\', \'+8 hours\'), ?)',
  localInsertParams: function (r) { return [r.username, r.password_hash, r.display_name, r.role, r.updated_at]; },
  localUpdate: 'UPDATE users SET display_name = ?, role = ?, updated_at = ? WHERE username = ?',
  localUpdateParams: function (r) { return [r.display_name, r.role, r.updated_at, r.username]; },
  cloudTable: 'users',
  cloudInsert: 'INSERT OR IGNORE INTO users (username, password_hash, display_name, role, last_login, created_at, updated_at) VALUES (?, ?, ?, ?, datetime(\'now\', \'+8 hours\'), ?)',
  cloudInsertParams: function (r) { return [r.username, r.password_hash, r.display_name, r.role, r.updated_at]; },
  cloudUpdate: 'UPDATE users SET display_name = ?, role = ?, updated_at = ? WHERE username = ?',
  cloudUpdateParams: function (r) { return [r.display_name, r.role, r.updated_at, r.username]; },
  label: '用户'
}
```

**注意**：密码哈希同步（各机器均可验证），updated_at 比较决定覆盖方向。

### 10.3 知识库同步
不变。知识库表保持全局共享，不按用户隔离。

---

## 十一、公网安全加固

> 当前 `server.js` 使用 `app.use(cors())` 允许所有来源，公网暴露后必须限制。

### 11.1 CORS 限制
```javascript
// 改动前
app.use(cors());

// 改动后
app.use(cors({
  origin: function (origin, callback) {
    // 允许无 origin 的请求（SSE、服务器间调用）
    if (!origin) return callback(null, true);
    // 允许本地访问
    if (origin.startsWith('http://localhost:')) return callback(null, true);
    // 允许自己的域名
    if (origin.endsWith('你的域名.com')) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));
```

### 11.2 请求频率限制
```javascript
// 安装 express-rate-limit
const rateLimit = require('express-rate-limit');

// 全局限流：每 IP 每分钟 120 次
app.use(rateLimit({ windowMs: 60 * 1000, max: 120 }));

// 登录接口严格限流：每 IP 每分钟 5 次
const loginLimiter = rateLimit({ windowMs: 60 * 1000, max: 5 });
app.use('/api/login', loginLimiter);
app.use('/api/plugin-login', loginLimiter);
```

### 11.3 Cloudflare Tunnel 自带的安全能力
- **HTTPS**：自动提供 SSL 证书，无需本地配置
- **DDoS 防护**：Cloudflare 基础防护
- **访问控制**：可配合 Cloudflare Access 做邮箱白名单（可选，本方案用 JWT 鉴权替代）

### 11.4 Helmet 安全头
```javascript
const helmet = require('helmet');
app.use(helmet()); // 自动加 X-Content-Type-Options, X-Frame-Options 等
```

---

## 十二、多用户新增功能清单

> 按实施顺序排列，每项可独立验证。

### 第一阶段：登录鉴权（单用户也能用）
| # | 新增功能 | 涉及文件 | 验证方式 |
|---|---|---|---|
| 1.1 | JWT 鉴权中间件：白名单路由跳过，其余验证 Bearer token | `server/middleware/auth.js` 新建 | 无 token 访问受保护端点 → 401 |
| 1.2 | 登录页：用户名 + 密码，返回 JWT，存 localStorage | `server/public/login.html` 新建 | 打开首页 → 跳转到登录页 |
| 1.3 | 登录/登出 API | `server/routes/users.js` 新建 | POST /api/login 成功返回 token |
| 1.4 | 插件登录 API（返回 JWT） | `server/routes/users.js` | 插件 POST → 返回 token |
| 1.5 | server.js 挂载中间件 + 首次启动创建 admin | `server/server.js` | 首次启动自动创建 admin 账户 |
| 1.6 | CORS 限制 + Helmet + 限流 | `server/server.js` | 非 allowed origin → CORS 拒绝 |
| 1.7 | 前端所有 fetch 加 Authorization 头 | 所有前端组件 | 登录后所有操作正常 |

### 第二阶段：用户表 + 用户管理
| # | 新增功能 | 涉及文件 | 验证方式 |
|---|---|---|---|
| 2.1 | 本地 users 表 DDL + 迁移 | `server/db.js` | 启动后 users 表存在 |
| 2.2 | 云端 users 表 DDL | `server/cloud/index.js` | 云端建表成功 |
| 2.3 | 用户 CRUD API（admin） | `server/routes/users.js` | admin 创建/编辑/禁用用户 |
| 2.4 | 用户管理前端页面（admin） | `server/public/js/components/page-users.js` 新建 | admin 看到用户管理菜单 |

### 第三阶段：采集箱 + 数据隔离
| # | 新增功能 | 涉及文件 | 验证方式 |
|---|---|---|---|
| 3.1 | products 加 owner/claim_at 列（本地 + 云端） | `server/db.js` + `server/cloud/index.js` | 迁移成功 |
| 3.2 | 商品列表 scope 参数（mine/inbox/all） | `server/routes/products.js` | mine 只看自己的，inbox 看采集箱 |
| 3.3 | 认领商品 API | `server/routes/products.js` | operator 认领 → owner 变自己 |
| 3.4 | admin 分配商品 API | `server/routes/products.js` | admin 批量分配给 operator |
| 3.5 | 前端 我的/采集箱/全部 切换 | `product-list.js` | 切换看到不同列表 |
| 3.6 | 前端 认领按钮 | `product-list.js` | 点击认领 → 商品移到「我的」 |
| 3.7 | operator 编辑权限检查 | `server/routes/products.js` | operator 编辑别人商品 → 403 |

### 第四阶段：插件改造
| # | 新增功能 | 涉及文件 | 验证方式 |
|---|---|---|---|
| 4.1 | 插件设置页加登录面板 | `sites/1688/float-btn.js` | 输入用户名密码 → 登录成功 |
| 4.2 | 采集时带 Authorization 头 | `sites/1688/collect-data.js` | 已登录采集 → owner 为自己 |
| 4.3 | 未登录采集进采集箱 | `sites/1688/collect-data.js` | 无 token → owner='' |
| 4.4 | token 过期提示重新登录 | `sites/1688/collect-data.js` | 401 响应 → 清除 token |

### 第五阶段：云同步改造
| # | 新增功能 | 涉及文件 | 验证方式 |
|---|---|---|---|
| 5.1 | products 同步加 owner/claim_at | `server/cloud/sync.js` | 双向同步后 owner 一致 |
| 5.2 | users 表同步 | `server/cloud/sync.js` | 多机器用户列表一致 |
| 5.3 | saveProductToLocalAndCloud 加 owner | `server/cloud/sync.js` | 新采集商品云端也有 owner |

### 第六阶段：公网部署
| # | 新增功能 | 涉及文件 | 验证方式 |
|---|---|---|---|
| 6.1 | Cloudflare Tunnel 配置 | `~/.cloudflared/config.yml` | 公网域名可访问登录页 |
| 6.2 | HTTPS 自动证书 | Cloudflare | 浏览器显示 HTTPS |
| 6.3 | 插件配置公网服务器地址 | `sites/1688/float-btn.js` | 外网插件可采集 |

---

## 十三、Cloudflare Tunnel 配置

复用之前的 tunnel，加一条路由：
```yaml
# ~/.cloudflared/config.yml
ingress:
  - hostname: app.你的域名.com
    service: http://localhost:3000
  - hostname: comfyui.你的域名.com
    service: http://localhost:8188
  - service: http_status:404
```

```bash
cloudflared tunnel route dns <tunnel-id> app.你的域名.com
cloudflared tunnel run <tunnel-id>
```

---

## 十四、实施顺序

1. **登录鉴权** — 中间件 + 登录页 + JWT，单用户也能用
2. **用户表** — DDL + 用户 CRUD + 首次启动创建 admin
3. **采集箱** — products 加 owner/claim_at + scope 查询 + 认领按钮
4. **用户管理** — admin 页面
5. **插件改造** — 登录面板 + token 传递
6. **云同步改造** — users 表同步 + products 同步带 owner/claim_at
7. **Cloudflare Tunnel** — 最后配置公网访问

---

## 十五、风险和注意事项

1. **向后兼容**：已有 products 的 owner 为空，启动时自动归类为采集箱；已登录 admin 可一键全部认领
2. **知识库共享**：分类映射、词库等保持全局共享，不按用户隔离
3. **并发冲突**：两人同时认领同一商品 → `UPDATE WHERE owner = ''` 保证原子性，只有一个人能成功
4. **密码安全**：SHA-256 + salt 哈希存储，不明文
5. **token 安全**：JWT 有效期 7 天，修改密码后旧 token 失效
6. **users 同步**：用户数据通过 Turso 同步，所有机器共享同一套用户账户；密码哈希同步后各机器均可验证
7. **from_machine 字段**：云端已有的 `from_machine` 字段不再使用，保留不删（避免迁移风险），`owner` 替代其设计意图
8. **插件兼容**：老版本插件无 token 仍可采集，商品进采集箱，完全向后兼容
9. **SSE 鉴权**：`EventSource` 不支持自定义 Header，需通过 `?token=xxx` query 参数验证；前端 SSE 连接时拼 token 参数
10. **CORS 改动**：当前 `app.use(cors())` 允许所有来源，公网暴露后必须改为白名单域名 + localhost
11. **敏感配置导出**：`/api/settings-export` 含解密后的 API Key，必须限 admin
12. **云同步路由**：`/api/sync/*` 是高危操作（推送/拉取/覆盖），必须限 admin
13. **前端改造量**：所有组件文件中的 `fetch` 调用都需加 `Authorization` 头，建议封装统一的 `apiFetch()` 工具函数
14. **图片代理**：`/api/product/check` 和 `/api/product`（POST 保存）需加入白名单或允许匿名访问，否则老插件无法采集

---

## 十六、实施补充与修正

> 实际开发中发现以下需要补充或修正的内容。

### 16.1 users 表字段补充

文档中 users 表缺少以下字段，实际实现已补充：

```sql
-- 补充字段：
password_salt TEXT NOT NULL,        -- SHA-256 加盐所需
must_change_password INTEGER DEFAULT 0  -- 首次登录强制改密码
```

完整 DDL：
```sql
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  display_name TEXT DEFAULT '',
  role TEXT DEFAULT 'operator',
  last_login TEXT DEFAULT '',
  must_change_password INTEGER DEFAULT 0,
  disabled INTEGER DEFAULT 0,
  created_at TEXT DEFAULT '',
  updated_at TEXT DEFAULT ''
)
```

### 16.2 auth 中间件白名单行为修正

**原始设计**：白名单路由跳过中间件，不设置 `req.user`。

**实际实现**：白名单路由仍会尝试解析 token 并设置 `req.user`，只是不因无 token 而拒绝请求。

```javascript
// 修正后的行为：
// 1. 始终尝试从 Authorization 头或 ?token= 提取 JWT
// 2. 有效 token → 设置 req.user（包括白名单路由）
// 3. 无 token 或 token 无效 → 不设置 req.user
// 4. 白名单路由 → 放行（不管有没有 req.user）
// 5. 非白名单路由 → 无 req.user 则返回 401
```

**原因**：`POST /api/product` 是白名单路由（允许未登录插件采集），但已登录用户采集时应自动设置 `owner`。如果白名单跳过整个中间件，`req.user` 不会被设置，`owner` 始终为空。

### 16.3 saveProductToLocalAndCloud 签名变更

**改动前**：
```javascript
function saveProductToLocalAndCloud(uid, sourceUrl, title, category, customCategory, dxmCategory, manualCategory, createdAt, mainImages, descImages, detailImages, attrs, skus)
```

**改动后**：增加 `owner` 参数
```javascript
function saveProductToLocalAndCloud(uid, sourceUrl, title, category, customCategory, dxmCategory, manualCategory, createdAt, mainImages, descImages, detailImages, attrs, skus, owner)
```

### 16.4 密码哈希方案

使用 SHA-256 + salt（而非 bcrypt），避免 native 依赖编译问题：
```javascript
var salt = crypto.randomBytes(16).toString('hex');
var hash = crypto.createHash('sha256').update(salt + password).digest('hex');
```

### 16.5 CORS 白名单配置

实际实现中 CORS origin 检查需要配置实际域名：
```javascript
// server.js 中 CORS 配置
// 需要将 '你的域名.com' 替换为实际部署域名
var ALLOWED_ORIGINS = [
  'http://localhost:',
  // 在此添加实际域名，如 'https://app.example.com'
];
```

### 16.6 依赖注入模式

为支持测试（内存 SQLite），auth 中间件和 users 路由采用依赖注入模式：
```javascript
// auth.js
var _db = null;
function _getDb() { return _db || require('../db'); }
module.exports._setDb = function (db) { _db = db; };

// users.js
var _customDb = null;
function _getDb() { return _customDb || db; }
module.exports._setDb = function (d) { _customDb = d; };
```

### 16.7 前端 apiFetch 封装

统一封装 `apiFetch()` 替代所有 `fetch()` 调用：
```javascript
// server/public/js/api.js
function apiFetch(url, options) {
  options = options || {};
  var token = localStorage.getItem('jwt_token');
  if (token) {
    options.headers = options.headers || {};
    options.headers['Authorization'] = 'Bearer ' + token;
  }
  return fetch(url, options).then(function (r) {
    if (r.status === 401) {
      localStorage.removeItem('jwt_token');
      window.location.href = '/login.html';
      return Promise.reject(new Error('登录已过期'));
    }
    return r;
  });
}
```

### 16.8 测试文件清单

实际创建的测试文件：
| 文件 | 测试数量 | 覆盖内容 |
|---|---|---|
| `server/__tests__/unit/auth.test.js` | 17 | JWT 鉴权、白名单、token 提取、requireRole |
| `server/__tests__/routes/login.test.js` | 24 | 登录/登出、用户 CRUD、密码修改、权限检查 |
| `server/__tests__/routes/product-claim.test.js` | 19 | scope 过滤、认领/分配、owner 权限 |
| `server/__tests__/routes/plugin-auth.test.js` | 8 | 插件登录、带/不带 token 采集 |
| `server/__tests__/unit/sync-owner.test.js` | 7 | owner/claim_at 同步、users 表定义 |

### 16.9 插件设置面板改造

`float-btn.js` 中原来的 `prompt()` 设置改为浮动面板：
- 服务器地址输入框（保存时自动写入 localStorage + chrome.storage.local）
- 登录表单（用户名 + 密码）
- 登录状态显示（已登录显示用户名 + 退出按钮）
- 点击 ⚙ 按钮切换面板显示/隐藏
