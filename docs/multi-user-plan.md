# 公网访问 + 多用户系统方案

## Context
当前系统是**单用户多设备**架构：数据通过 Turso 云端全量共享，没有用户概念。
需求：
1. 公网暴露服务（Cloudflare Tunnel）
2. 多人协作，数据隔离
3. 采集 → 认领 → 各自管理的流水线
4. 浏览器插件回调支持

---

## 一、现状分析

### 当前数据流
```
1688浏览器插件 → 采集到服务器 → 所有设备同步看到 → 单人操作
```

### 核心问题
- 所有商品全局共享，任何人都能改
- 没有"谁采集的"、"谁在处理"的概念
- `from_machine` 字段云端有但未使用
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
- 认领后 `products.owner = userId`
- 管理员可以分配商品给指定 operator
- 采集箱中的商品超时未认领可自动清理

### 数据隔离策略
| 数据 | 隔离方式 |
|---|---|
| 我的商品 | `WHERE owner = currentUser` |
| 采集箱 | `WHERE owner = '' AND deleted = 0` |
| 知识库（映射/词库） | 全局共享，所有人可见可改 |
| 系统设置 | 仅 admin |
| DXM 分类树 | 全局共享只读 |

---

## 三、数据库改动

### 新增表：users
```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT DEFAULT '',
  role TEXT DEFAULT 'operator',  -- admin / operator / viewer
  last_login TEXT,
  created_at TEXT,
  updated_at TEXT
);
```

### products 表新增字段
```sql
ALTER TABLE products ADD COLUMN owner TEXT DEFAULT '';      -- 认领用户 username
ALTER TABLE products ADD COLUMN claim_at TEXT DEFAULT '';    -- 认领时间
```

- `owner = ''` → 采集箱（未认领）
- `owner = 'zhangsan'` → 张三的商品

### 云端 users 表
```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT DEFAULT '',
  role TEXT DEFAULT 'operator',
  last_login TEXT,
  created_at TEXT,
  updated_at TEXT
);
```

---

## 四、API 改动

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
| `DELETE /api/users/:id` | 禁用用户 |

### 商品改动
| 接口 | 改动 |
|---|---|
| `GET /api/products` | 加 `scope` 参数：`mine`/`inbox`/`all`(admin) |
| `POST /api/product` | 自动设置 `owner` 为当前用户（或留空进采集箱） |
| `POST /api/products/claim` | 认领商品（inbox → mine） |
| `POST /api/products/assign` | admin 分配商品给指定用户 |

### 采集插件改动
| 改动点 | 说明 |
|---|---|
| 插件配置 | 增加 token 字段 |
| 采集请求 | 带 token，商品进采集箱（owner=''） |

---

## 五、前端改动

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

## 六、关键文件清单

| 文件 | 操作 | 说明 |
|---|---|---|
| `server/middleware/auth.js` | 新建 | JWT 鉴权中间件 |
| `server/public/login.html` | 新建 | 登录页 |
| `server/routes/users.js` | 新建 | 用户 CRUD + 登录接口 |
| `server/db.js` | 修改 | users 表 DDL + products 补列 |
| `server/cloud/index.js` | 修改 | 云端 users 表 DDL |
| `server/cloud/sync.js` | 修改 | users 表同步 |
| `server/server.js` | 修改 | 挂载 auth 中间件 |
| `server/routes/products.js` | 修改 | 加 scope/claim/assign |
| `server/routes/categories.js` | 修改 | 知识库保持共享 |
| `server/public/index.html` | 修改 | 前端 token + 用户显示 |
| `server/public/js/components/product-list.js` | 修改 | 我的/采集箱/全部切换 |
| `server/public/js/components/page-users.js` | 新建 | 用户管理页（admin） |
| `sites/1688/float-btn.js` | 修改 | 插件带 token |

---

## 七、Cloudflare Tunnel 配置

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

## 八、白名单路由（不需要登录）
- `POST /api/login`
- `GET /api/proxy-image`
- `GET /uploads/*`
- 静态资源（.css/.js/.png 等）
- `GET /events`（SSE，通过 query token 验证）

---

## 九、实施顺序

1. **登录鉴权** — 中间件 + 登录页 + JWT，单用户也能用
2. **用户表** — DDL + 用户 CRUD
3. **采集箱** — products 加 owner + scope 查询 + 认领按钮
4. **用户管理** — admin 页面
5. **插件改造** — 带 token
6. **Cloudflare Tunnel** — 最后配置公网访问
7. **云同步改造** — users 表同步 + products 同步带 owner

---

## 十、风险和注意事项

1. **向后兼容**：已有 products 的 owner 为空，启动时自动归类为采集箱
2. **知识库共享**：分类映射、词库等保持全局共享，不按用户隔离
3. **并发冲突**：两人同时认领同一商品 → 用 `UPDATE WHERE owner = ''` 保证原子性
4. **密码安全**：SHA-256 + salt 哈希存储，不明文
5. **token 安全**：JWT 有效期 7 天，修改密码后旧 token 失效
