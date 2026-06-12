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
| 插件配置 | 增加 token 字段 |
| 采集请求 | 带 token，商品进采集箱（owner=''） |

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

| 文件 | 操作 | 说明 |
|---|---|---|
| `server/middleware/auth.js` | 新建 | JWT 鉴权中间件 |
| `server/public/login.html` | 新建 | 登录页 |
| `server/routes/users.js` | 新建 | 用户 CRUD + 登录接口 |
| `server/db.js` | 修改 | users 表 DDL + products 补 owner/claim_at 列 |
| `server/cloud/index.js` | 修改 | 云端 users 表 DDL + products 补 owner/claim_at 列 |
| `server/cloud/sync.js` | 修改 | uploadProducts/downloadProducts 加 owner/claim_at + users 表同步 |
| `server/server.js` | 修改 | 挂载 auth 中间件 + 首次启动创建 admin 账户 |
| `server/routes/products.js` | 修改 | 加 scope/claim/assign + owner 过滤 |
| `server/routes/categories.js` | 修改 | 知识库保持共享，仅加 token 验证 |
| `server/public/index.html` | 修改 | 前端 token 处理 + 用户名显示 |
| `server/public/js/components/product-list.js` | 修改 | 我的/采集箱/全部切换 + 认领按钮 |
| `server/public/js/components/page-users.js` | 新建 | 用户管理页（admin） |
| `sites/1688/float-btn.js` | 修改 | 插件带 token |

---

## 八、Cloudflare Tunnel 配置

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

## 九、白名单路由（不需要登录）
- `POST /api/login`
- `GET /api/proxy-image`
- `GET /uploads/*`
- 静态资源（.css/.js/.png 等）
- `GET /events`（SSE，通过 query token 验证）

---

## 十、实施顺序

1. **登录鉴权** — 中间件 + 登录页 + JWT，单用户也能用
2. **用户表** — DDL + 用户 CRUD + 首次启动自动创建 admin
3. **采集箱** — products 加 owner/claim_at + scope 查询 + 认领按钮
4. **用户管理** — admin 页面
5. **插件改造** — 带 token
6. **云同步改造** — users 表同步 + products 同步带 owner/claim_at
7. **Cloudflare Tunnel** — 最后配置公网访问

---

## 十一、风险和注意事项

1. **向后兼容**：已有 products 的 owner 为空，启动时自动归类为采集箱；已登录 admin 可一键全部认领
2. **知识库共享**：分类映射、词库等保持全局共享，不按用户隔离
3. **并发冲突**：两人同时认领同一商品 → `UPDATE WHERE owner = ''` 保证原子性，只有一个人能成功
4. **密码安全**：SHA-256 + salt 哈希存储，不明文
5. **token 安全**：JWT 有效期 7 天，修改密码后旧 token 失效
6. **users 同步**：用户数据通过 Turso 同步，所有机器共享同一套用户账户；密码哈希同步后各机器均可验证
7. **from_machine 字段**：云端已有的 `from_machine` 字段不再使用，保留不删（避免迁移风险），`owner` 替代其设计意图
