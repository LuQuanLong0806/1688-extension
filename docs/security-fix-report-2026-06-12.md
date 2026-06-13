# 安全漏洞修复报告

**日期**: 2026-06-12
**分支**: feature/multi-user-system
**修复范围**: 8 个确认漏洞 + 1 个部分缺失（审计报告 P0-P3）

---

## 修复清单

### 1. CORS 兜底策略修复 — `server/server.js`

**漏洞**: CORS origin 兜底返回 `callback(null, true)` 放行所有来源，未配置的白名单域名可跨域访问。
**修复**: 兜底改为 `callback(new Error('Not allowed by CORS'))` 拒绝未授权来源。

### 2. SSE 身份校验 — `server/routes/settings.js`

**漏洞**: `GET /events` SSE 端点在 auth 白名单中（允许无 token 连接），未认证用户可接收实时事件推送。
**修复**: 在 handler 内增加身份检查，无 `req.user` 且无 `token` query 参数时返回 401。

### 3. settings 写操作权限 — `server/routes/settings.js`

**漏洞**: 4 个 settings 写端点无角色限制，任何登录用户可修改系统配置。
**修复**: 增加 `auth.requireRole('admin')` 中间件到 PUT /settings、POST /settings/:key、GET /settings-export、POST /settings-import。

### 4. sync 全局权限 — `server/routes/sync.js`

**漏洞**: 所有 sync 端点无权限检查，任何登录用户可操作同步功能。
**修复**: `router.use(auth.requireRole('admin'))` 全局拦截，仅 admin 可访问。

### 5. products batch-status owner 隔离 — `server/routes/products.js`

**漏洞**: `POST /product/batch-status` 无 owner 检查，非 admin 用户可修改他人商品状态。
**修复**: 非 admin 用户 WHERE 条件增加 `(owner = ? OR owner IS NULL OR owner = '')`，仅允许修改自己和无主商品。

### 6. categories 写操作权限 — `server/routes/categories.js`

**漏洞**: 13 个 POST/DELETE 端点无权限检查，任何登录用户可修改分类配置。
**修复**: 统一增加 `auth.requireRole('operator', 'admin')` 中间件（operator 及以上可写）。

### 7. dxm-tree 写操作权限 — `server/routes/dxm-tree.js`

**漏洞**: 2 个 POST 端点无权限检查。
**修复**: 增加 `auth.requireRole('operator', 'admin')` 中间件。

### 8. AI global-key 权限 — `server/routes/ai/index.js`

**漏洞**: `POST /global-key` 无角色限制，任何登录用户可添加全局 API Key。
**修复**: 增加 `auth.requireRole('admin')` 中间件。

### 9. AI image-edit 权限 — `server/routes/ai/image-edit.js`

**漏洞**: 所有 AI 图片编辑端点无权限检查。
**修复**: `router.use(auth.requireRole('operator', 'admin'))` 全局拦截。

---

## 附带修复

### products.js 变量名冲突

`PUT /products/:uid` handler 中 `var product`（line 465）与 `const product`（line 521）在同一作用域重复声明导致 SyntaxError。将后者重命名为 `prodInfo`。

---

## 修改文件清单

| 文件 | 改动类型 |
|---|---|
| `server/server.js` | CORS 兜底拒绝 |
| `server/routes/settings.js` | import auth + SSE 校验 + 4 个 requireRole |
| `server/routes/sync.js` | router.use(requireRole('admin')) |
| `server/routes/products.js` | batch-status owner WHERE + 变量名修复 |
| `server/routes/categories.js` | import auth + 13 个 requireRole |
| `server/routes/dxm-tree.js` | import auth + 2 个 requireRole |
| `server/routes/ai/index.js` | import auth + global-key requireRole |
| `server/routes/ai/image-edit.js` | router.use(requireRole) |
| `package.json` | 添加 test 脚本 |

## 测试覆盖

新增 `server/__tests__/routes/permission-checks.test.js`，26 个测试用例覆盖：

| 模块 | 测试数 | 覆盖内容 |
|---|---|---|
| settings | 10 | admin 写 / 非 admin 拒绝 / 只读 / SSE 认证 |
| sync | 4 | admin 访问 / 非 admin 拒绝 / 未认证拒绝 |
| categories | 8 | viewer 写拒绝 / operator 可写 / 未认证拒绝 / 只读 |
| dxm-tree | 3 | viewer 拒绝 / operator 可写 |
| products batch-status | 2 | operator owner 隔离 / admin 全量更新 |

**全量测试**: 94 个 auth 相关测试全部通过，无回归。
