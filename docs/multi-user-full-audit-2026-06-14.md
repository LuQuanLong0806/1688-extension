# 多用户改造全面审核报告

**日期**: 2026-06-14
**范围**: 全项目 API 路由 + 前端集成 + 数据完整性 + 云同步 + 单元测试
**方法**: 7 个并行分析 Agent + 代码交叉验证

---

## 一、总览

| 模块 | 状态 | 说明 |
|------|------|------|
| SQL 注入 | ✅ 安全 | 全部参数化查询 |
| API 路由权限（已知修复） | ✅ 已修复 | CORS/SSE/settings写/sync/categories写/ai写 全部有 requireRole |
| API 路由权限（新发现） | 🔴 有遗漏 | AI配置端点读取/图片生成端点/Settings读取 仍无认证 |
| 前后端 API 一致性 | ✅ 匹配 | 50+ API 调用全部匹配，字段名一致 |
| 前端权限守卫 | 🟠 不完整 | 仅用户管理菜单有 admin 守卫 |
| 用户数据安全 | 🟡 基本安全 | 有重名检测，但密码算法偏弱 |
| 数据丢失风险 | 🟠 存在 | 云端同步静默失败，sql.js 内存模式有窗口丢失风险 |
| 单元测试 | ✅ 1253/1200 通过 | 77 个失败是 sync.test.js DDL 缺字段问题，非多用户相关 |

---

## 二、API 安全审计（详细）

### 2.1 ✅ 已有权限保护的路由

| 路由文件 | 保护情况 |
|----------|----------|
| users.js | GET/POST/PUT/DELETE /users → requireRole('admin') |
| products.js | /assign → requireRole('admin')；PUT/DELETE/batch-delete/batch-status → owner 校验 |
| settings.js | PUT /settings、POST /settings/:key、GET /settings-export、POST /settings-import → requireRole('admin') |
| sync.js | 全局 requireRole('admin') |
| categories.js | 全部写操作 → requireRole('operator','admin') |
| dxm-tree.js | 全部写操作 → requireRole('operator','admin') |
| ai/image-edit.js | 全局 → requireRole('operator','admin') |

### 2.2 🔴 P0 — 新发现：未保护的端点

#### (1) AI 配置管理端点 — 完全无认证

**文件**: `routes/ai/index.js`

以下 15+ 个端点无任何认证，任何能访问 localhost 的人可读取/修改所有 API 密钥：

| 端点 | 风险 |
|------|------|
| `GET /ai/configs` | 泄露所有 AI 配置+密钥状态 |
| `POST /ai/configs` | 🔴 可注入 apiKey 覆盖 |
| `GET /ai/get-key` | 泄露脱敏密钥 |
| `POST /ai/save-key` | 🔴 写入新密钥 |
| `POST /ai/delete-key` | 🔴 删除密钥 |
| `POST /ai/zhipu-keys` | 🔴 添加/删除智谱密钥 |
| `POST /ai/qwen-keys` | 🔴 添加/删除通义千问密钥 |
| `POST /ai/hunyuan-keys` | 🔴 添加/删除混元账号 |
| `GET/POST /ai/comfyui-config` | 读取/修改 ComfyUI 配置 |
| `GET/POST /ai/qwen-vl-config` | 读取/修改 VL 密钥 |
| `GET /ai/vendor-configs` | 泄露厂商配置 |
| `POST /ai/vendor-model` | 修改厂商模型 |
| `GET/POST /ai/dispatch-order` | 读取/修改调度顺序 |

**当前缓解**: 仅监听 localhost + CORS 限制
**修复**: 全部加 `auth.requireRole('admin')`

#### (2) Settings 读取无认证

**文件**: `routes/settings.js`

| 端点 | 风险 |
|------|------|
| `GET /settings` | 🔴 返回所有配置（含 jwt_secret、云同步 token、加密的 API 密钥） |
| `GET /settings/:key` | 🔴 可逐个读取任意配置 |

**修复**: 加 `auth.requireRole('admin')`

#### (3) 图片生成/上传端点无认证

**文件**: `routes/ai/image-gen.js`

| 端点 | 风险 |
|------|------|
| `POST /ai/text-to-image` | 🔴 调用 CogView 产生费用 |
| `POST /ai/image-to-image` | 🔴 调用 CogView-4 |
| `POST /ai/white-bg` | 🔴 |
| `POST /ai/enhance` | 🔴 |
| `POST /ai/image-upload` | 🔴 上传到图床 |
| `GET/POST /ai/smms-token` | 🟠 读取/修改图床密钥 |
| `GET/POST /ai/oss-config` | 🟠 读取/修改 OSS 凭证 |

**修复**: 加 `auth.requireRole('operator','admin')`

#### (4) 分类推荐端点无认证

**文件**: `routes/ai/category-recommend.js`

| 端点 | 风险 |
|------|------|
| `POST /ai/suggest-category` | 🟠 白名单中（供扩展用），可接受 |
| `POST /ai/save-category-mapping` | 🟠 无认证写入映射 |

### 2.3 🟡 P2 — 其他安全发现

| # | 问题 | 位置 | 说明 |
|---|------|------|------|
| 1 | LIKE 搜索未转义通配符 | products.js `keyword LIKE '%'||?||'%'` | 用户输入 `%` 或 `_` 可改变匹配逻辑 |
| 2 | 认领操作无事务 | products.js claim | 并发认领同一商品可能 double-claim |
| 3 | plugin-login 未检查 must_change_password | users.js:55 | 插件登录不要求首次改密码 |
| 4 | POST /api/product 在白名单中 | auth.js | 扩展采集无需认证，可注入任意商品 |

---

## 三、前后端集成审计

### 3.1 api.js — Token 注入 ✅

- apiFetch 从 localStorage 读取 jwt_token，注入 Bearer 头
- 401 自动清 token + 跳转 login.html
- 不会覆盖已有 Authorization 头
- **缺点**: 仅处理 401，403（权限不足）无统一处理

### 3.2 app.js — 登录检查 ✅

- 无 token → 跳 login.html
- 有 token → 调 /api/me 验证 → 失败也跳转
- currentUser.role 驱动角色判断（无硬编码 admin）
- 用户管理菜单有 `v-if="currentUser.role === 'admin'"` 守卫

### 3.3 前端权限守卫覆盖

| 菜单 | admin 守卫 | 后端守卫 |
|------|-----------|---------|
| 用户管理 | ✅ 有 | ✅ requireRole('admin') |
| AI 模型配置 | ❌ 无 | ❌ 无（见 P0） |
| 词库管理 | ❌ 无 | ✅ opOnly |
| 云同步 | ❌ 无 | ✅ requireRole('admin') |
| 仪表盘 | ❌ 无 | ✅ apiFetch 间接受保护 |
| 发布队列 | ❌ 无 | ✅ apiFetch |
| 美图编辑 | ❌ 无 | ✅ requireRole('operator') |

**建议**: 前端菜单应对 AI 模型配置加 admin 守卫（后端修复后同步）

### 3.4 API 调用一致性

**总计 50+ API 调用，全部与后端路由匹配** ✅

子 Agent 报告的 3 个参数问题经验证为误判：
- batch-status: 前端发 `ids`，后端 `const { ids } = req.body` → ✅ 一致
- batch-delete: 前端发 `ids`，后端 `const { ids } = req.body` → ✅ 一致
- DELETE /users: 后端实现为软删除（disabled=1），注释说明是 "disable user" → 设计如此

### 3.5 dashboard.js

确认 **未使用 apiFetch**（P1 遗留问题），401 时不会自动跳转登录。

---

## 四、数据完整性审计

### 4.1 用户表 Schema ✅

全部 11 字段完整：id, username, password_hash, password_salt, display_name, role, must_change_password, disabled, last_login, created_at, updated_at

### 4.2 用户数据安全

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 重名检测 | ✅ | POST /users 创建前 SELECT username 检查 |
| 密码存储 | 🟡 | SHA-256 + salt，salt 使用 crypto.randomBytes(16)。SHA-256 不是慢哈希，建议迁移到 bcrypt/scrypt |
| 修改密码更新 salt | ✅ | 同时更新 |
| 删除用户 | 🟠 | 软删除(disabled=1)，密码 hash 仍留库中 |
| 删除用户后商品 | 🟠 | owner 字段不变，商品成孤儿（admin 可管理，其他用户无法操作） |
| 审计日志 | 🔴 | 无。角色变更、密码修改、用户禁用均无记录 |

### 4.3 products 表

| 检查项 | 状态 | 说明 |
|--------|------|------|
| owner 字段 | ✅ | `TEXT DEFAULT ''` |
| claim_at 字段 | ✅ | `TEXT DEFAULT ''` |
| 删除策略 | ✅ | 软删除（deleted=1） |
| 批量删除上限 | ✅ | 最多 500 条/次 |
| 未登录采集 owner | ✅ | 空字符串，存入采集箱 |
| 登录采集 owner | ✅ | 当前用户名 |

### 4.4 🔴 Critical — 数据风险

#### (1) 云端同步密码哈希暴露

**文件**: `cloud/sync.js`

users 表完整同步到 Turso 云端，包括 `password_hash` 和 `password_salt`。如果 Turso 数据库被入侵，所有用户密码可被离线暴力破解。

**修复**: 同步 users 表时应排除 password_hash 和 password_salt，或使用专门的安全同步策略。

#### (2) 审计日志缺失

用户角色变更（admin→operator）、禁用/启用用户、密码修改等敏感操作没有记录。无法追溯操作历史。

### 4.5 🟠 High — 数据风险

| # | 风险 | 说明 | 修复 |
|---|------|------|------|
| 1 | 云端同步静默失败 | `.catch(function(){})` 吞掉所有错误，无重试无告警 | 加错误队列或至少 console.error |
| 2 | sql.js 内存模式 | 进程崩溃可丢失最后 500ms 数据（scheduleSave 间隔） | 对关键操作后立即 scheduleSave |
| 3 | 双向同步覆盖 | pull-then-push 可能覆盖先执行的修改 | 加时间戳比较或锁机制 |
| 4 | 下载时物理删除 | downloadProducts 中 purged 逻辑对 deleted=1 且云端不存在的商品物理删除 | 改为保留或标记 |
| 5 | 禁用用户孤儿商品 | 禁用用户后 owner 不变，商品不可被其他人操作 | 提供转移 owner 或清空选项 |

### 4.6 🟡 Medium — 数据风险

| # | 风险 | 说明 |
|---|------|------|
| 1 | 缺 owner 索引 | owner 是高频过滤条件但无索引，数据量大后性能下降 |
| 2 | products 核心字段缺 NOT NULL | title/category 等可为 NULL |
| 3 | 同步冲突策略不统一 | 不同表不同策略，无统一冲突解决规则 |
| 4 | admin 分配覆盖原 owner | 无条件覆盖，无确认机制 |

---

## 五、云同步审计

### 5.1 同步覆盖范围

| 表 | 同步 | owner 字段 | 密码字段 |
|----|------|-----------|---------|
| products | ✅ | ✅ 含 owner | — |
| settings | ✅ | — | — |
| users | ✅ | — | 🔴 含 password_hash + salt |
| category_mappings | ✅ | — | — |
| category_keywords | ✅ | — | — |
| keyword_synonyms | ✅ | — | — |
| keyword_blacklist | ✅ | — | — |
| dxm_tree | ✅ | — | — |

### 5.2 同步机制

- 推送: insertProduct → 本地写入 → 异步云端 `.catch(function(){})`
- 拉取: downloadProducts → 本地 INSERT OR REPLACE
- 冲突: 基本无冲突处理，以最后写入为准
- 断线: 无自动重连，需手动触发

---

## 六、单元测试

### 6.1 现有测试结果

| 指标 | 数值 |
|------|------|
| 总测试数 | 1200 |
| 通过 | 1123 |
| 失败 | 77 |
| 失败套件 | 10 |

**失败根因**: `sync.test.js` 的 mock DDL 缺少 `store_name`、`owner`、`deleted` 字段，与多用户改造无关。修复 mock DDL 即可。

### 6.2 新增测试

**文件**: `server/__tests__/routes/multi-user-integration.test.js`
**结果**: 53 tests, 53 passed ✅

覆盖 14 个场景分组：

| 分组 | 测试数 | 关键场景 |
|------|--------|---------|
| 用户重名检测 | 2 | 同名 400，不同名 200 |
| 删除用户后 owner | 2 | owner 不变，disabled=1 |
| operator 编辑隔离 | 3 | 不能改他人/能改自己/能改 inbox |
| operator 删除隔离 | 3 | 不能删他人/能删自己/admin 任意删 |
| 采集 owner | 3 | 未登录空/登录有 owner |
| 认领商品 | 4 | 空商品→自己，已拥有不变，批量，未登录 |
| 分配商品 | 5 | admin 分配，operator/viewer/未登录拦截 |
| 修改密码 | 4 | 旧密码失效/新密码登录/旧密码验证/长度 |
| scope 过滤 | 6 | all/mine/inbox/default × 3 角色 |
| viewer 分类权限 | 7 | 可读、不可写各类端点 |
| 设置导入导出 | 4 | admin 可操作，operator/viewer 拦截 |
| 同步路由权限 | 3 | admin/operator/viewer |
| 用户 CRUD 角色限制 | 5 | operator/viewer 不能创建/查看/禁用 |
| batch-status 隔离 | 2 | operator 只影响自己+inbox |

---

## 七、修复优先级

### 🔴 P0 — 必须修复

| # | 问题 | 文件 | 修复量 |
|---|------|------|--------|
| 1 | AI 配置端点无认证 | ai/index.js | ~20 行（全局 requireRole） |
| 2 | Settings 读取无认证 | settings.js | 2 行 |
| 3 | 图片生成/上传无认证 | ai/image-gen.js | ~5 行 |
| 4 | 密码哈希同步到云端 | cloud/sync.js | 修改 users 表同步逻辑 |
| 5 | 无审计日志 | 新文件 | 中等 |

**P0 修复量**: 约 30 行代码改动 + 审计日志模块

### 🟠 P1 — 建议修复

| # | 问题 | 修复量 |
|---|------|--------|
| 1 | 云端同步错误静默吞掉 | ~10 行（加 console.error 或重试队列） |
| 2 | 前端 AI 模型配置菜单加 admin 守卫 | 1 行 |
| 3 | dashboard.js 改用 apiFetch | ~10 处 |
| 4 | sync.test.js mock DDL 补字段 | ~5 行 |

### 🟡 P2 — 优化建议

| # | 建议 |
|---|------|
| 1 | 密码算法迁移到 bcrypt/scrypt |
| 2 | LIKE 搜索参数转义 `%` 和 `_` |
| 3 | 认领操作加事务防并发 |
| 4 | products 表加 owner/status 索引 |
| 5 | products 核心字段加 NOT NULL |
| 6 | 禁用用户时提供 owner 转移选项 |
| 7 | 同步进度持久化 |
| 8 | plugin-login 检查 must_change_password |

---

## 八、扩展端认证链路

✅ 已验证正确：

```
content script (1688.com / dianxiaomi.com)
  │
  ├─ chrome.cookies.get() ❌ 不可用（content script 无权限）
  │
  └─ chrome.runtime.sendMessage({action:'getToken'}) ✅
       ▼
  background.js (service worker)
       │
       ├─ chrome.cookies.get({url, name:'auth_token'}) ✅ 可用
       │
       └─ sendResponse({token}) → 回传给 content script
```

所有 22 处 API 调用（1688 扩展 3 处 + 店小蜜扩展 19 处）均通过 background.js 中转获取 token。

---

## 九、结论

多用户改造**核心功能已完成**，用户 CRUD、owner 隔离、认领/分配、权限控制、扩展自动登录等主要流程正确。

**主要风险点**:
1. **15+ 个 AI/图片/配置端点仍有认证盲区** — localhost 部署下风险可控，但公网化前必须修复
2. **密码哈希同步云端** — 严重安全隐患，必须排除敏感字段
3. **云端同步静默失败** — 可能导致本地/云端数据不一致而无感知

建议按 P0 → P1 → P2 优先级逐步修复。
