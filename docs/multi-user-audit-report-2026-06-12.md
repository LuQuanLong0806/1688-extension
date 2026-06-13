# 多用户改造查漏补缺报告

> 基于 `docs/multi-user-plan.md` 逐项对照检查，日期：2026-06-12

---

## 一、改造完成总览

| 阶段 | 状态 | 完成度 | 说明 |
|------|------|--------|------|
| 1. 登录鉴权 | ⚠️ 部分完成 | 85% | 核心流程已通，CORS/SSE 有漏洞 |
| 2. 用户表 + 用户管理 | ✅ 完成 | 100% | DDL/CRUD/页面/自动建admin 全部就绪 |
| 3. 采集箱 + 数据隔离 | ⚠️ 部分完成 | 75% | scope/claim/assign 已有，owner权限检查缺失 |
| 4. 插件改造 | ✅ 完成 | 100% | 登录面板/token/Authorization 头全部就绪 |
| 5. 云同步改造 | ✅ 完成 | 100% | owner/claim_at 同步 + users 表同步 |
| 6. 公网部署 | 🔲 未开始 | 0% | Cloudflare Tunnel 未配置 |

### 新建文件：全部已创建 ✅

| 文件 | 状态 |
|------|------|
| `server/middleware/auth.js` | ✅ |
| `server/routes/users.js` | ✅ |
| `server/public/login.html` | ✅ |
| `server/public/js/api.js` | ✅ |
| `server/public/js/components/page-users.js` | ✅ |

---

## 二、已完成项 ✅

### 2.1 第一阶段 — 登录鉴权

| # | 计划项 | 状态 | 验证 |
|---|--------|------|------|
| 1.1 | JWT 鉴权中间件（白名单+token解析） | ✅ | auth.js 导出 authMiddleware/requireRole/getSecret/isWhitelisted |
| 1.2 | 登录页 login.html | ✅ | 6477 字节，用户名+密码表单 |
| 1.3 | 登录/登出/改密码 API | ✅ | users.js 包含 /login /logout /me /change-password |
| 1.4 | 插件登录 API | ✅ | /api/plugin-login 端点 |
| 1.5 | server.js 挂载中间件 | ✅ | app.use(auth.authMiddleware) 在第153行 |
| 1.6 | Helmet + 限流 | ✅ | helmet + 全局120次/分钟 + 登录5次/分钟 |
| 1.7 | 前端 apiFetch 封装 | ✅ | api.js 已创建，11个前端组件已使用 |
| — | app.js 登录检查 | ✅ | 启动时读 jwt_token，无则跳 login.html |
| — | index.html 加载 api.js | ✅ | script 标签已加入 |
| — | 右上角用户名+退出 | ✅ | index.html 中有 logout 逻辑 |

### 2.2 第二阶段 — 用户表

| # | 计划项 | 状态 | 验证 |
|---|--------|------|------|
| 2.1 | 本地 users 表 DDL | ✅ | 含 password_salt/must_change_password/disabled 补充字段 |
| 2.2 | 云端 users 表 DDL | ✅ | cloud/index.js 已创建 |
| 2.3 | 用户 CRUD API (admin) | ✅ | GET/POST/PUT/DELETE /api/users 全部有 requireRole('admin') |
| 2.4 | 用户管理前端页面 | ✅ | page-users.js 已创建 |
| — | 首次启动创建 admin | ✅ | usersRoute.ensureAdmin() 在 server.js 第168行 |
| — | 首次改密码标记 | ✅ | must_change_password=1，改密码后自动归0 |

### 2.3 第三阶段 — 采集箱

| # | 计划项 | 状态 | 验证 |
|---|--------|------|------|
| 3.1 | products 加 owner/claim_at | ✅ | 本地+云端DDL + 迁移 |
| 3.2 | 商品列表 scope 参数 | ✅ | mine/inbox/all |
| 3.3 | 认领 API | ✅ | /api/products/claim |
| 3.4 | admin 分配 API | ✅ | /api/products/assign 带 requireRole('admin') |
| 3.5 | 前端 我的/采集箱/全部 切换 | ✅ | product-list.js |
| 3.6 | 前端认领按钮 | ✅ | product-list.js |
| 3.7 | 前端分配按钮 | ✅ | product-list.js |

### 2.4 第四阶段 — 插件改造

| # | 计划项 | 状态 | 验证 |
|---|--------|------|------|
| 4.1 | 插件设置页加登录面板 | ✅ | float-btn.js 含登录表单 |
| 4.2 | 采集时带 Authorization | ✅ | collect-data.js |
| 4.3 | 未登录采集进采集箱 | ✅ | owner='' 逻辑 |
| 4.4 | token 过期处理 | ✅ | popup.js 显示登录状态 |

### 2.5 第五阶段 — 云同步

| # | 计划项 | 状态 | 验证 |
|---|--------|------|------|
| 5.1 | products 同步加 owner/claim_at | ✅ | uploadProducts/downloadProducts |
| 5.2 | users 表同步 | ✅ | sync.js 中已定义 |
| 5.3 | saveProductToLocalAndCloud 加 owner | ✅ | 签名含 owner 参数 |

---

## 三、查漏补缺 ❌

### 🔴 P0 — 安全漏洞（公网暴露后可被利用）

#### 漏洞 1：CORS 仍允许所有来源

**文件**：`server/server.js` 第 15-21 行

```javascript
app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (origin.indexOf('localhost') >= 0) return callback(null, true);
    callback(null, true);  // ❌ 最后一个 callback 仍然是 true！
  },
  credentials: true
}));
```

**风险**：公网部署后任何域名都能跨域调用 API，JWT 鉴权形同虚设
**修复**：最后一个 `callback(null, true)` → `callback(new Error('Not allowed by CORS'))`，添加实际域名白名单

---

#### 漏洞 2：SSE 端点无 token 验证

**文件**：`server/routes/settings.js` 第 197 行

```javascript
router.get('/events', (req, res) => {
  // ❌ 没有验证 req.user 或 query.token
  res.setHeader('Content-Type', 'text/event-stream');
  ...
});
```

**风险**：虽然 /api/events 在 auth 白名单中（允许无 token 连接），但没有验证已登录用户，未认证连接也能接收推送事件
**修复**：检查 `req.user` 或 `req.query.token`，无有效 token 则断开

---

#### 漏洞 3：settings.js 写操作无权限限制

**文件**：`server/routes/settings.js`

- `PUT /api/settings`（批量修改）— 任何登录用户可改系统配置
- `POST /api/settings/:key`（单个修改）— 同上
- `GET /api/settings-export`（导出含解密 API Key）— 同上
- `POST /api/settings-import`（导入配置）— 同上

**风险**：operator 能导出含明文 API Key 的配置
**修复**：写操作加 `auth.requireRole('admin')`

---

#### 漏洞 4：sync.js 全部操作无权限限制

**文件**：`server/routes/sync.js`

全部 18 个端点（push/pull/sync/init/disconnect）没有任何 requireRole 检查。

**风险**：operator 可以执行云同步推送/拉取/覆盖
**修复**：所有 sync 路由加 `auth.requireRole('admin')`

---

#### 漏洞 5：products.js PUT/DELETE 无 owner 权限检查

**文件**：`server/routes/products.js`

- `PUT /api/product/:id` — 未检查 owner
- `DELETE /api/product/:id` — 未检查 owner
- `POST /api/product/batch-delete` — 未检查 owner
- `POST /api/product/batch-status` — 未检查 owner

**风险**：operator A 可以编辑/删除 operator B 的商品
**修复**：在写操作 handler 开头加 owner 校验

---

#### 漏洞 6：categories.js 写操作无权限限制

**文件**：`server/routes/categories.js`

所有 POST/DELETE 端点没有 requireRole 检查。

**修复**：写操作加 `auth.requireRole('operator', 'admin')`

---

#### 漏洞 7：dxm-tree.js 写操作无权限限制

**文件**：`server/routes/dxm-tree.js`

POST 路由无权限检查。

**修复**：写操作加 `auth.requireRole('operator', 'admin')`

---

#### 漏洞 8：ai/index.js global-key 无 admin 限制

**文件**：`server/routes/ai/index.js`

`POST /api/ai/global-key` 未加 requireRole('admin')。

**修复**：1 行加 requireRole

---

#### 漏洞 9：ai/image-edit.js 无鉴权

**文件**：`server/routes/ai/image-edit.js`

仅有第92行一个 `role: 'user'` 引用（疑似死代码），无实际鉴权。

**修复**：加 `auth.requireRole('operator', 'admin')`

---

### 🟡 P1 — 功能缺陷

#### 缺陷 1：page-dashboard.js 未使用 apiFetch

Dashboard 组件的 fetch 调用未替换为 apiFetch，401 时不会自动跳转登录页。

---

#### 缺陷 2：无 npm test 运行脚本

`__tests__/` 目录下有 53 个测试文件，但 `package.json` 中没有配置 test 脚本。

---

### 🟢 P2 — 待启动

#### 待办 1：Cloudflare Tunnel 公网部署

完全未开始。涉及 tunnel 配置、域名解析。

---

## 四、修复优先级排序

| 优先级 | 漏洞 | 影响 | 修复工作量 |
|--------|------|------|----------|
| P0-1 | CORS 允许所有来源 | 公网后 JWT 鉴权失效 | 5行 |
| P0-2 | SSE 无 token 验证 | 未认证用户接收推送 | 3行 |
| P0-3 | settings 写操作无 admin 限制 | operator 可导出 API Key | 4行 |
| P0-4 | sync 全部无 admin 限制 | operator 可覆盖云端数据 | 2行 |
| P0-5 | products PUT/DELETE 无 owner 检查 | 越权编辑他人商品 | 20行 |
| P0-6 | categories 写操作无权限限制 | viewer 可改知识库 | 2行 |
| P0-7 | dxm-tree 写操作无权限限制 | 任何人可触发分类采集 | 2行 |
| P0-8 | ai global-key 无 admin 限制 | operator 可改全局 Key | 1行 |
| P0-9 | ai/image-edit 无鉴权 | operator 可随意调用 ComfyUI | 1行 |
| P1-1 | dashboard 未用 apiFetch | 401不跳转 | 改几处 |
| P1-2 | 无 npm test 脚本 | 测试不便 | 3行 |
| P2-1 | Cloudflare Tunnel | 公网访问 | 运维配置 |

**P0 总修复量**：约 40-50 行代码，可在 1-2 小时内完成

---

## 五、快速修复参考

### P0-1 CORS 修复（server.js）
```javascript
// 将 callback(null, true) 改为：
callback(new Error('Not allowed by CORS'));
// 并在 localhost 判断后添加自己的域名
```

### P0-4 sync 全局 admin（sync.js）
```javascript
var auth = require('../middleware/auth');
router.use(auth.requireRole('admin'));
```

### P0-6 categories 写操作（categories.js）
```javascript
router.post('/xxx', auth.requireRole('operator', 'admin'), ...);
```

### P0-5 products owner 检查（products.js）
```javascript
if (req.user.role !== 'admin') {
  var product = getOne('SELECT owner FROM products WHERE uid = ?', [uid]);
  if (!product || product.owner !== req.user.username) {
    return res.status(403).json({ error: '无权操作他人商品' });
  }
}
```
