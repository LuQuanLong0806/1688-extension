# 1688-extension 完整 API 目录

**日期**: 2026-06-14
**项目**: F:\00_project\1688-extension\server
**端点总数**: ~120+

---

## 目录

- [0. 认证与白名单](#0-认证与白名单)
- [1. 内嵌路由 (server.js)](#1-内嵌路由-serverjs)
- [2. 用户管理 (users.js)](#2-用户管理-usersjs)
- [3. 商品管理 (products.js)](#3-商品管理-productsjs)
- [4. 设置管理 (settings.js)](#4-设置管理-settingsjs)
- [5. 分类管理 (categories.js)](#5-分类管理-categoriesjs)
- [6. 店小秘分类树 (dxm-tree.js)](#6-店小秘分类树-dxm-treejs)
- [7. 云同步 (sync.js)](#7-云同步-syncjs)
- [8. AI 配置管理 (ai/index.js)](#8-ai-配置管理-aiindexjs)
- [9. AI 图片编辑 (ai/image-edit.js)](#9-ai-图片编辑-aiimage-editjs)
- [10. AI 图片生成 (ai/image-gen.js)](#10-ai-图片生成-aiimage-genjs)
- [11. AI 分类推荐 (ai/category-recommend.js)](#11-ai-分类推荐-aicategory-recommendjs)
- [12. AI 内部工具 (ai/providers.js)](#12-ai-内部工具-aiprovidersjs)
- [13. 前端调用点汇总](#13-前端调用点汇总)
- [14. 扩展调用点汇总](#14-扩展调用点汇总)

---

## 0. 认证与白名单

### 认证机制

| 方式 | 说明 |
|------|------|
| Bearer Token | `Authorization: Bearer <jwt>` |
| Query Token | `?token=<jwt>`（SSE 用） |
| JWT 签名密钥 | 存 DB `settings.jwt_secret`，首次自动生成 |
| 未认证 | `401 { error: '未登录' }` |
| 权限不足 | `403 { error: '权限不足' }` |

### 角色层级

| 角色 | 权限 |
|------|------|
| admin | 全部操作 |
| operator | 读 + 大部分写（不可管理用户/同步/分配） |
| viewer | 只读 |

### WHITELIST（精确匹配，免认证）

| # | Method | Path | 用途 |
|---|--------|------|------|
| 1 | POST | `/api/login` | 登录 |
| 2 | POST | `/api/plugin-login` | 扩展登录 |
| 3 | POST | `/api/product` | 扩展采集上报 |
| 4 | GET | `/api/product/check` | 商品重复检测 |
| 5 | GET | `/api/events` | SSE 事件流 |
| 6 | GET | `/api/extension-version` | 扩展版本哈希 |
| 7 | POST | `/api/collage-import` | 拼图暂存 |
| 8 | GET | `/api/collage-import` | 拼图读取 |
| 9 | GET | `/api/proxy-image` | 图片代理 |
| 10 | POST | `/api/upload-image` | 图片上传 |

### STATIC_PREFIXES（前缀通配）

`/login.html`, `/js/`, `/css/`, `/uploads/`, `/images/`, `/fonts/`, `/favicon.ico`, `/manifest.json`, `/sw.js`, `/dev/sites`

### 后缀通配

`.html`, `.css`, `.js`, `.png`, `.jpg`, `.jpeg`, `.gif`, `.ico`, `.svg`, `.woff`, `.woff2`, `.ttf`, `.eot`, `.map`

---

## 1. 内嵌路由 (server.js)

### GET /api/extension-version
- **行号**: server.js:53
- **功能**: 返回 sites/ 下所有 .js 文件修改时间的 MD5 哈希（扩展热更新检测）
- **参数**: 无
- **认证**: ❌ 白名单
- **响应**: MD5 hex 字符串（纯文本）
- **前端**: 未发现 | **扩展**: 未发现

### GET /collage
- **行号**: server.js:69
- **功能**: 返回拼图编辑器 HTML 页面
- **参数**: 无
- **认证**: 无（auth 之前注册的静态页面）
- **响应**: HTML 页面

### GET /api/proxy-image
- **行号**: server.js:104
- **功能**: 图片代理（解决 CORS），含 SSRF 防护（禁止内网 IP）
- **参数**: query `url`
- **认证**: ❌ 白名单
- **响应**: 图片二进制流 | 失败 400/403/502
- **前端**: 未发现 | **扩展**: 未发现

### POST /api/upload-image
- **行号**: server.js:124
- **功能**: 上传 base64 图片到 uploads 目录
- **参数**: body `{ dataUrl, productId?, field?, index? }`
- **认证**: ❌ 白名单
- **响应**: 成功 `{ url: '/uploads/xxx.jpg' }` | 失败 400/500
- **前端**: page-editor.js:88

### POST /api/collage-import
- **行号**: server.js:140
- **功能**: 暂存拼图待导入图片到内存
- **参数**: body `{ images: Array }`
- **认证**: ❌ 白名单
- **响应**: `{ ok: true, count: N }`

### GET /api/collage-import
- **行号**: server.js:143
- **功能**: 一次性读取并清空拼图暂存图片
- **参数**: 无
- **认证**: ❌ 白名单
- **响应**: `{ images: Array }`

---

## 2. 用户管理 (users.js)

### POST /api/login
- **行号**: users.js:19
- **功能**: 用户名密码登录
- **参数**: body `{ username, password }`
- **认证**: ❌ 白名单
- **响应**: 成功 Set-Cookie `auth_token` + `{ id, username, display_name, role, must_change_password }` | 失败 401
- **前端**: login.html | **扩展**: 未发现

### POST /api/plugin-login
- **行号**: users.js:55
- **功能**: 扩展通过 cookie token 登录
- **参数**: body `{ token }`（cookie 中的 auth_token）
- **认证**: ❌ 白名单
- **响应**: 同 login（含 must_change_password 字段）
- **前端**: 未发现 | **扩展**: popup.js

### POST /api/logout
- **行号**: users.js:82
- **功能**: 登出
- **参数**: 无
- **认证**: Bearer token
- **响应**: 成功 Clear-Cookie + `{ ok: true }`
- **前端**: app.js

### GET /api/me
- **行号**: users.js:94
- **功能**: 获取当前用户信息
- **参数**: 无
- **认证**: Bearer token
- **响应**: `{ id, username, display_name, role, must_change_password }`
- **前端**: app.js:30

### POST /api/change-password
- **行号**: users.js:106
- **功能**: 修改当前用户密码
- **参数**: body `{ oldPassword, newPassword }`
- **认证**: Bearer token
- **响应**: 成功 `{ ok: true }` | 失败 400/401
- **前端**: 未发现

### GET /api/users
- **行号**: users.js:107
- **功能**: 获取用户列表
- **参数**: 无
- **认证**: 🔒 admin
- **响应**: 用户数组（不含 password_hash/salt）
- **SQL**: SELECT users（排除敏感字段）
- **前端**: page-users.js:45, 82

### POST /api/users
- **行号**: users.js:113
- **功能**: 创建新用户
- **参数**: body `{ username, password, display_name?, role? }`
- **认证**: 🔒 admin
- **响应**: 成功 `{ id, username, ... }` | 失败 400（重名）/ 500
- **SQL**: SELECT 检查重名 → INSERT users
- **前端**: page-users.js

### PUT /api/users/:id
- **行号**: users.js:131
- **功能**: 更新用户信息
- **参数**: body `{ display_name?, role?, disabled?, password? }`
- **认证**: 🔒 admin
- **响应**: 成功 `{ ok: true }` | 失败 400/500
- **SQL**: UPDATE users（动态拼接字段）
- **云同步**: ✅ 无
- **前端**: page-users.js:68

### DELETE /api/users/:id
- **行号**: users.js:156
- **功能**: 禁用用户（软删除，设 disabled=1）
- **参数**: params `id`
- **认证**: 🔒 admin
- **响应**: 成功 `{ ok: true }` | 失败 400（不能禁用自己）
- **SQL**: `UPDATE users SET disabled = 1`
- **前端**: page-users.js:102

---

## 3. 商品管理 (products.js)

### POST /api/product
- **行号**: products.js:140
- **功能**: 新增商品（扩展采集上报）
- **参数**: body `{ sourceUrl, title, category?, mainImages?, descImages?, detailImages?, attrs?, skus? }`
- **认证**: ❌ 白名单（扩展免认证）
- **响应**: 成功 `{ ok: true, uid }` | 失败 400/409/500
- **SQL**: SELECT 检查重复 → INSERT products（含 owner 字段）
- **云同步**: ✅ 异步 saveProductToLocalAndCloud
- **SSE**: ✅ 触发 product-added 事件
- **前端**: 未发现 | **扩展**: collect-data.js, grab-core.js

### GET /api/product/check
- **行号**: products.js:323
- **功能**: 通过 offerId 检查商品是否已存在
- **参数**: query `offerId`
- **认证**: ❌ 白名单
- **响应**: `{ exists: boolean, id?, title?, status? }`
- **SQL**: SELECT products WHERE source_url LIKE
- **前端**: 未发现 | **扩展**: collect-data.js

### GET /api/product
- **行号**: products.js:348
- **功能**: 商品列表（分页 + 筛选 + scope 多用户隔离）
- **参数**: query `page, pageSize, keyword, status, deleted, category, dxmCategory, scope(all/mine/inbox)`
- **认证**: Bearer token
- **响应**: `{ total, page, pageSize, list: [{ id, uid, title, ... }] }`
- **SQL**: SELECT products（动态 WHERE 拼接 + scope 过滤）
- **前端**: app.js:66, product-list.js:413, page-drafts.js:72, page-publish-queue.js:72

### GET /api/product/stats
- **行号**: products.js（统计端点）
- **功能**: 商品统计（总数、各状态数量）
- **参数**: 无
- **认证**: Bearer token
- **响应**: `{ total, status0, status1, status2, ... }`
- **SQL**: SELECT COUNT GROUP BY
- **前端**: app.js:66

### GET /api/product/trend
- **功能**: 商品采集趋势（按日期统计）
- **参数**: query `days`
- **认证**: Bearer token
- **响应**: `{ dates: [], counts: [] }`
- **前端**: dashboard.js:58

### GET /api/product/dxm-category-top
- **功能**: DXM 分类 TOP 统计
- **参数**: 无
- **认证**: Bearer token
- **前端**: dashboard.js:86

### GET /api/product/categories
- **行号**: products.js:95
- **功能**: 获取商品自定义分类列表
- **参数**: 无
- **认证**: Bearer token
- **响应**: 分类字符串数组
- **SQL**: SELECT DISTINCT custom_category
- **前端**: category-page.js:66, product-list.js:352

### GET /api/product/dxm-categories
- **行号**: products.js:101
- **功能**: 获取商品 DXM 分类列表
- **认证**: Bearer token
- **前端**: product-list.js:363

### GET /api/product/:uid
- **功能**: 获取单个商品详情
- **参数**: params `uid`
- **认证**: Bearer token
- **响应**: 商品完整对象
- **前端**: app.js:76, dashboard.js:33

### PUT /api/product/:uid
- **行号**: products.js:461
- **功能**: 更新商品信息
- **参数**: body 全量商品字段（动态更新传入的字段）
- **认证**: Bearer token + owner 校验（admin 可改所有，operator 只能改自己+inbox）
- **响应**: 成功 `{ ok: true }` | 失败 403
- **SQL**: 动态 UPDATE products
- **云同步**: ✅ 异步 saveProductToLocalAndCloud（.catch 吞错误）
- **SSE**: ✅ 触发 products-changed 事件
- **前端**: product-list.js:621, detail-modal.js:938, 994, 1585

### DELETE /api/product/:uid
- **行号**: products.js:611
- **功能**: 删除商品（软删除 deleted=1）
- **参数**: params `uid`
- **认证**: Bearer token + owner 校验
- **响应**: 成功 `{ ok: true }` | 失败 403
- **SQL**: `UPDATE products SET deleted = 1`
- **云同步**: ✅ 异步（.catch 吞错误）
- **前端**: product-list.js:237, 255, 511

### POST /api/product/:uid/recommend-category
- **行号**: products.js:628
- **功能**: 触发 AI 分类推荐
- **参数**: 无
- **认证**: Bearer token
- **响应**: `{ ok: true }`（实际通过 SSE 推送结果）
- **前端**: product-list.js:268

### POST /api/product/batch-delete
- **行号**: products.js:738
- **功能**: 批量软删除（最多 500 条）
- **参数**: body `{ ids: string[] }`
- **认证**: Bearer token + owner 校验（operator 只能删自己的）
- **响应**: 成功 `{ ok: true, deleted: N }`
- **SQL**: 逐条 UPDATE products SET deleted=1
- **云同步**: ✅ 逐条异步
- **前端**: product-list.js:582

### POST /api/product/batch-status
- **行号**: products.js:761
- **功能**: 批量修改状态
- **参数**: body `{ ids: string[], status: number }`
- **认证**: Bearer token + owner 校验
- **响应**: 成功 `{ ok: true }`
- **SQL**: 逐条 UPDATE products SET status
- **前端**: product-list.js:528, 559

### POST /api/products/claim
- **行号**: products.js:787
- **功能**: 认领商品（owner 为空时设置当前用户）
- **参数**: body `{ uids: string[] }`
- **认证**: Bearer token
- **响应**: 成功 `{ ok: true, claimed: N }`
- **SQL**: 逐条 UPDATE products SET owner, claim_at
- **前端**: product-list.js:435, 448

### POST /api/products/assign
- **行号**: products.js:808
- **功能**: 分配商品给指定用户（admin 专属）
- **参数**: body `{ uids: string[], username: string }`
- **认证**: 🔒 admin
- **响应**: 成功 `{ ok: true, assigned: N }`
- **SQL**: 逐条 UPDATE products SET owner, claim_at
- **前端**: product-list.js:467

### POST /api/product/batch-automate
- **行号**: products.js:872
- **功能**: 批量触发自动化流水线
- **参数**: body `{ uids: string[] }`
- **认证**: Bearer token
- **前端**: product-list.js:648

### POST /api/product/batch-stage
- **功能**: 批量修改阶段
- **参数**: body `{ ids, stage }`
- **认证**: Bearer token
- **前端**: page-drafts.js:117, page-publish-queue.js:117

### PUT /api/product/:uid/stage
- **功能**: 修改单个商品阶段
- **参数**: body `{ stage }`
- **认证**: Bearer token
- **前端**: page-drafts.js:136, page-publish-queue.js:136

### POST /api/products/backfill-path
- **功能**: 回填分类路径
- **参数**: body `{ mappings }`
- **认证**: Bearer token
- **前端**: category-page.js:171, 242

### SSE /api/events
- **功能**: 服务端推送事件
- **事件类型**: product-added, product-category-updated, products-changed
- **参数**: query `token=<jwt>`
- **认证**: ❌ 白名单（query token）
- **前端**: product-list.js（EventSource）

---

## 4. 设置管理 (settings.js)

### GET /api/settings
- **功能**: 获取所有设置（⚠️ 无认证）
- **认证**: ❌ 无（P0 漏洞）
- **响应**: 全部 key-value 对（含加密密钥、jwt_secret）
- **SQL**: SELECT settings

### PUT /api/settings
- **功能**: 批量更新设置
- **参数**: body `{ key1: value1, key2: value2, ... }`
- **认证**: 🔒 admin
- **响应**: `{ ok: true }`
- **SQL**: 逐条 UPSERT settings

### GET /api/settings/:key
- **功能**: 获取单个设置值（⚠️ 无认证）
- **参数**: params `key`
- **认证**: ❌ 无（P0 漏洞）
- **响应**: `{ key, value }`

### POST /api/settings/:key
- **功能**: 设置单个配置值
- **参数**: params `key`; body `{ value }`
- **认证**: 🔒 admin
- **响应**: `{ ok: true }`

### GET /api/settings/price_formulas
- **功能**: 获取价格公式
- **认证**: Bearer token
- **前端**: detail-modal.js:83

### POST /api/settings/price_formulas
- **功能**: 保存价格公式
- **认证**: Bearer token
- **前端**: detail-modal.js:1497

### POST /api/settings/auto_clean_badge
- **功能**: 更新自动清洁徽章状态
- **前端**: detail-modal.js:101

### POST /api/settings-export
- **功能**: 导出所有设置
- **认证**: 🔒 admin
- **前端**: page-api-keys.js:377

### POST /api/settings-import
- **功能**: 导入设置（覆盖）
- **参数**: body `{ settings: {...} }`
- **认证**: 🔒 admin
- **前端**: page-api-keys.js:377

---

## 5. 分类管理 (categories.js)

### GET /api/categories
- **行号**: categories.js:7
- **功能**: 1688 类目列表（搜索 + 分页）
- **参数**: query `keyword?, page, pageSize`
- **认证**: Bearer token
- **响应**: `{ total, page, pageSize, list: [{ name, catId, count }] }`
- **前端**: category-page.js:139

### GET /api/category-mappings
- **行号**: categories.js:24
- **功能**: 搜索映射（带商品数量）
- **参数**: query `keyword?`
- **认证**: Bearer token
- **响应**: `[{ id, categoryName, customCategory, productCount }]`
- **前端**: category-page.js:208

### GET /api/category-mappings/by-name
- **行号**: categories.js:45
- **功能**: 按 1688 类目查映射
- **参数**: query `name`（必填）
- **认证**: Bearer token

### GET /api/category-mappings/by-dxm
- **行号**: categories.js:54
- **功能**: 按 DXM 类目查映射
- **参数**: query `name`
- **认证**: Bearer token
- **前端**: category-page.js:107

### GET /api/category-mappings/grouped
- **行号**: categories.js:70
- **功能**: 分组列表（按 DXM 类目分组 + 商品数量 + 分页）
- **参数**: query `keyword?, page, pageSize`
- **认证**: Bearer token
- **前端**: category-page.js:47, 224

### DELETE /api/category-mappings/dxm/:name
- **行号**: categories.js:121
- **功能**: 删除整个 DXM 类目映射（软删）+ 清空关联商品分类
- **参数**: params `name`
- **认证**: 🔒 operator/admin
- **云同步**: ✅
- **前端**: category-page.js:77

### DELETE /api/category-mappings/:id
- **行号**: categories.js:132
- **功能**: 删除单条映射（软删）+ 清空关联商品分类
- **参数**: params `id`
- **认证**: 🔒 operator/admin
- **云同步**: ✅
- **前端**: category-page.js:122

### POST /api/category-mappings
- **行号**: categories.js:148
- **功能**: 新增映射（已存在跳过）
- **参数**: body `{ categoryName, customCategory }`
- **认证**: 🔒 operator/admin
- **云同步**: ✅
- **前端**: category-page.js:149

### POST /api/keyword-rels/rebuild
- **行号**: categories.js:167
- **功能**: 回填关键词关联库
- **认证**: 🔒 operator/admin

### GET /api/keyword-rels
- **行号**: categories.js:192
- **功能**: 查看关键词关联库（分页）
- **参数**: query `keyword?, page, pageSize`
- **认证**: Bearer token
- **前端**: page-word-library.js:162

### DELETE /api/keyword-rels/:id
- **行号**: categories.js:210
- **功能**: 标记关联无效
- **认证**: 🔒 operator/admin
- **云同步**: ✅
- **前端**: page-word-library.js:273

### POST /api/keyword-rels/batch-invalidate
- **行号**: categories.js:221
- **功能**: 批量标记关联无效
- **参数**: body `{ ids: number[] }`
- **认证**: 🔒 operator/admin
- **云同步**: ✅

### GET /api/keyword-synonyms
- **行号**: categories.js:240
- **功能**: 查看同义词列表
- **认证**: Bearer token

### POST /api/keyword-synonyms
- **行号**: categories.js:252
- **功能**: 新增同义词对
- **参数**: body `{ wordA, wordB }`
- **认证**: 🔒 operator/admin
- **云同步**: ✅

### DELETE /api/keyword-synonyms/:id
- **行号**: categories.js:267
- **功能**: 删除同义词（硬删）
- **认证**: 🔒 operator/admin
- **云同步**: ✅

### GET /api/keyword-blacklist
- **行号**: categories.js:280
- **功能**: 查看关键词黑名单（分页）
- **认证**: Bearer token
- **前端**: page-word-library.js:161

### POST /api/keyword-blacklist
- **行号**: categories.js:298
- **功能**: 新增黑名单（upsert）
- **参数**: body `{ keyword, categoryName, reason? }`
- **认证**: 🔒 operator/admin
- **云同步**: ✅
- **前端**: page-word-library.js

### DELETE /api/keyword-blacklist/:id
- **行号**: categories.js:310
- **功能**: 删除黑名单（硬删）
- **认证**: 🔒 operator/admin
- **云同步**: ✅
- **前端**: page-word-library.js:260

### GET /api/category-config
- **行号**: categories.js:324
- **功能**: 获取分类配置（过滤词/互斥组等）
- **参数**: query `type?`
- **认证**: Bearer token
- **前端**: page-word-library.js:137

### POST /api/category-config
- **行号**: categories.js:340
- **功能**: 保存分类配置项
- **参数**: body `{ type, value, group_name?, description?, sort_order? }`
- **认证**: 🔒 operator/admin
- **前端**: page-word-library.js:183, 229

### DELETE /api/category-config/:id
- **行号**: categories.js:365
- **功能**: 删除分类配置（软删）
- **认证**: 🔒 operator/admin
- **前端**: page-word-library.js:285

### POST /api/category-config/batch-delete
- **行号**: categories.js:375
- **功能**: 批量删除分类配置
- **参数**: body `{ ids: number[] }`
- **认证**: 🔒 operator/admin
- **前端**: page-word-library.js:307

---

## 6. 店小秘分类树 (dxm-tree.js)

### POST /api/dxm-category/collect
- **行号**: dxm-tree.js:6
- **功能**: 收集单个类目（upsert）
- **参数**: body `{ path, leafName }`
- **认证**: 🔒 operator/admin
- **SQL**: treeDB upsert

### POST /api/dxm-tree/sync
- **行号**: dxm-tree.js:18
- **功能**: 批量同步分类节点（upsert）
- **参数**: body `{ categories: Array }`
- **认证**: 🔒 operator/admin
- **扩展**: dxm-float-bee.js:1391

### GET /api/dxm-tree/children
- **行号**: dxm-tree.js:35
- **功能**: 查询子级分类
- **参数**: query `parentId`

### GET /api/dxm-tree/status
- **行号**: dxm-tree.js:43
- **功能**: 分类树同步状态
- **前端**: category-page.js:60

### GET /api/dxm-tree/root-status
- **行号**: dxm-tree.js:51
- **功能**: 各大类根节点同步状态
- **扩展**: dxm-config-ui.js:487

### GET /api/dxm-tree/search
- **行号**: dxm-tree.js:61
- **功能**: 搜索分类（叶子节点）
- **参数**: query `keyword`
- **前端**: category-picker.js:71

### GET /api/dxm-tree/resolve-path
- **行号**: dxm-tree.js:69
- **功能**: 根据类目名查找完整路径
- **参数**: query `name`

---

## 7. 云同步 (sync.js)

> **全局**: `router.use(auth.requireRole('admin'))` — 全部端点需 admin

### GET /api/sync/config
- **行号**: sync.js:15
- **功能**: 获取同步配置（Turso URL + 脱敏 Token）
- **前端**: page-cloud-sync.js:74, page-api-keys.js:345

### POST /api/sync/config
- **行号**: sync.js:26
- **功能**: 保存 Turso 配置
- **参数**: body `{ url, token }`
- **前端**: page-api-keys.js:358

### POST /api/sync/test
- **行号**: sync.js:39
- **功能**: 测试 Turso 连接
- **前端**: page-cloud-sync.js:86

### POST /api/sync/disconnect
- **行号**: sync.js:45
- **功能**: 断开连接
- **前端**: page-cloud-sync.js:105

### POST /api/sync/init
- **行号**: sync.js:51
- **功能**: 初始化云端（建表 + 全量上传）
- **前端**: page-cloud-sync.js:124

### POST /api/sync/sync
- **行号**: sync.js:62
- **功能**: 双向同步（pull + push）
- **前端**: page-cloud-sync.js:138

### POST /api/sync/pull
- **行号**: sync.js:72
- **功能**: 仅拉取（云端→本地）

### POST /api/sync/push
- **行号**: sync.js:82
- **功能**: 仅推送（本地→云端）

### GET /api/sync/status
- **行号**: sync.js:92
- **功能**: 同步状态

### POST /api/sync/table-push/:key
- **行号**: sync.js:97
- **功能**: 单表推送
- **参数**: params `key`; body `{ since? }`

### POST /api/sync/table-pull/:key
- **行号**: sync.js:106
- **功能**: 单表拉取

### POST /api/sync/table-sync/:key
- **行号**: sync.js:115
- **功能**: 单表双向同步

### POST /api/sync/tree-push / tree-pull / tree-sync
- **行号**: sync.js:128, 137, 146
- **功能**: 分类树推送/拉取/双向同步

### POST /api/sync/product-push
- **行号**: sync.js:156
- **功能**: 商品上传
- **前端**: page-cloud-sync.js:155

### POST /api/sync/product-pull
- **行号**: sync.js:165
- **功能**: 商品拉取
- **前端**: product-list.js:376, page-cloud-sync.js:155

### POST /api/sync/product-sync
- **行号**: sync.js:174
- **功能**: 商品双向同步

---

## 8. AI 配置管理 (ai/index.js)

> ⚠️ **大部分端点无认证（P0 漏洞）**，仅 `/ai/global-key` 有 admin 限制

### GET /api/ai/check-key
- **行号**: ai/index.js:17
- **功能**: 检查智谱 Key 是否已配置
- **认证**: ❌ 无

### GET /api/ai/get-key
- **行号**: ai/index.js:24
- **功能**: 获取脱敏 Key

### POST /api/ai/save-key
- **行号**: ai/index.js:33
- **功能**: 保存智谱 Key（加密存储）
- **参数**: body `{ key }`

### POST /api/ai/delete-key
- **行号**: ai/index.js:46
- **功能**: 删除智谱 Key

### GET /api/ai/configs
- **行号**: ai/index.js:55
- **功能**: 获取所有 AI 配置（含密钥状态）
- **前端**: page-api-keys.js

### POST /api/ai/configs
- **行号**: ai/index.js:89
- **功能**: 保存 AI 配置（per-useCase + ollama）
- **参数**: body `{ [useCase]: { model?, label?, apiKey? }, providers? }`
- **前端**: page-api-keys.js

### POST /api/ai/global-key
- **行号**: ai/index.js:110
- **功能**: 保存全局 Key（追加到多 Key 池）
- **认证**: 🔒 admin
- **参数**: body `{ apiKey }`

### POST /api/ai/zhipu-keys
- **行号**: ai/index.js:126
- **功能**: 智谱 Key 增删改
- **参数**: body `{ action: 'add'|'delete'|'update-label', key?, label?, index? }`
- **前端**: page-api-keys.js:151, 158

### POST /api/ai/qwen-keys
- **行号**: ai/index.js:156
- **功能**: 通义千问 Key 增删改
- **前端**: page-api-keys.js:170, 177

### POST /api/ai/hunyuan-keys
- **行号**: ai/index.js:192
- **功能**: 混元账号增删改
- **参数**: body `{ action, secretId?, secretKey?, label?, index? }`
- **前端**: page-api-keys.js:190, 197

### GET /api/ai/comfyui-status
- **行号**: ai/index.js:232
- **功能**: ComfyUI 健康检查

### GET /api/ai/comfyui-config
- **行号**: ai/index.js:245
- **功能**: 获取 ComfyUI 配置
- **前端**: page-api-keys.js:312

### POST /api/ai/comfyui-config
- **行号**: ai/index.js:259
- **功能**: 保存 ComfyUI 配置
- **前端**: page-api-keys.js:330

### GET /api/ai/comfyui-models
- **行号**: ai/index.js:288
- **功能**: 获取 ComfyUI 可用模型

### GET /api/ai/qwen-vl-config
- **行号**: ai/index.js:299
- **功能**: 获取 VL Key 配置

### POST /api/ai/qwen-vl-config
- **行号**: ai/index.js:307
- **功能**: 保存 VL Key

### POST /api/ai/qwen-vl-config/delete
- **行号**: ai/index.js:316
- **功能**: 删除 VL Key

### GET /api/ai/vendor-configs
- **行号**: ai/index.js:347
- **功能**: 获取厂商分组配置
- **前端**: page-api-keys.js:47

### POST /api/ai/vendor-model
- **行号**: ai/index.js:369
- **功能**: 更新厂商模型选择
- **参数**: body `{ vendor, modelType, modelId }`

### GET /api/ai/dispatch-order
- **行号**: ai/index.js:378
- **功能**: 获取调度优先级
- **前端**: page-api-keys.js:64

### POST /api/ai/dispatch-order
- **行号**: ai/index.js:397
- **功能**: 保存调度优先级
- **前端**: page-api-keys.js:98

---

## 9. AI 图片编辑 (ai/image-edit.js)

> **全局中间件**: `router.use(auth.requireRole('operator','admin'))`

### POST /api/ai/inpaint
- **行号**: ai/image-edit.js:42
- **功能**: AI 消除修复（LaMa）
- **参数**: body `{ image_base64, mask_base64 }`

### POST /api/ai/smart-detect
- **行号**: ai/image-edit.js:71
- **功能**: 智能检测（GLM 多模态）
- **参数**: body `{ image_base64, type? }`

### GET /api/ai/model-status
- **行号**: ai/image-edit.js:115
- **功能**: LaMa/ComfyUI 模型状态

### POST /api/ai/recognize-image
- **行号**: ai/image-edit.js:124
- **功能**: AI 图片识别（通义千问 VL）
- **参数**: body `{ image_base64?, image_url?, prompt?, model? }`

### POST /api/ai/remove-bg
- **行号**: ai/image-edit.js:164
- **功能**: AI 抠图（CDN @imgly）
- **参数**: body `{ image_base64 }`

### POST /api/ai/remove-bg-local
- **行号**: ai/image-edit.js:190
- **功能**: AI 抠图（ComfyUI + ISNet 本地兜底）
- **扩展**: dxm-collage.js

### POST /api/ai/replace-bg
- **行号**: ai/image-edit.js:213
- **功能**: 换背景（抠图+合成）
- **参数**: body `{ product_base64, bg_base64, scale?, position?, padding?, shadow?, skip_cutout? }`
- **前端**: detail-modal.js

### POST /api/ai/detect-text
- **行号**: ai/image-edit.js:230
- **功能**: PaddleOCR 文字检测
- **参数**: body `{ image_base64?, image_url?, chinese_only? }`
- **扩展**: dxm-auto-clean.js, dxm-text-cleaner.js

### POST /api/ai/auto-clean-chinese
- **行号**: ai/image-edit.js:255
- **功能**: 自动清理中文（OCR + AI 消除）
- **参数**: body `{ image_base64?, image_url?, chinese_only?, min_confidence?, dilate_px?, enable_vision?, enable_badge_vision?, upload? }`
- **前端**: detail-modal.js, dxm-auto-clean.js, dxm-text-cleaner.js, dxm-paste-img.js

### POST /api/ai/batch-clean-chinese
- **行号**: ai/image-edit.js:321
- **功能**: 批量清理中文
- **参数**: body `{ images: [{ base64?, url? }], enable_vision? }`
- **扩展**: dxm-auto-clean.js, dxm-text-cleaner.js

### POST /api/ai/batch-clean
- **行号**: ai/image-edit.js:361
- **功能**: 批量消除水印+中文

### POST /api/ai/detect-sizes
- **行号**: ai/image-edit.js:454
- **功能**: OCR 提取尺寸标注

### POST /api/ai/annotate-image
- **行号**: ai/image-edit.js:502
- **功能**: 生成尺寸标注图
- **参数**: body `{ image_base64?, image_url?, width_cm, height_cm?, unit?, enable_vision? }`

### GET /api/ai/ocr-status
- **行号**: ai/image-edit.js:558
- **功能**: OCR + AI 服务综合状态
- **扩展**: dxm-auto-clean.js, dxm-text-cleaner.js

### POST /api/ai/prepare-main-image
- **行号**: ai/image-edit.js:585
- **功能**: 处理主图（去中文 + resize 800×800 + 上传图床）

### POST /api/ai/img2img-auto
- **行号**: ai/image-edit.js:610
- **功能**: 自动场景图（视觉→文生背景→合成）

### POST /api/ai/scene-inpaint
- **行号**: ai/image-edit.js:665
- **功能**: 场景图方案 B（ComfyUI Inpainting）

### POST /api/ai/img2img
- **行号**: ai/image-edit.js:712
- **功能**: 图生图（ComfyUI + CogView 降级）

---

## 10. AI 图片生成 (ai/image-gen.js)

> ⚠️ **全部端点无认证（P0 漏洞）**

### POST /api/ai/text-to-image
- **行号**: ai/image-gen.js:35
- **功能**: 文生图（CogView-3-Flash）
- **参数**: body `{ prompt, size?, model? }`
- **扩展**: dxm-collage.js

### POST /api/ai/image-to-image
- **行号**: ai/image-gen.js:55
- **功能**: 图生图（CogView-4）
- **参数**: body `{ prompt, image_base64, size? }`

### POST /api/ai/white-bg
- **行号**: ai/image-gen.js:76
- **功能**: AI 白底图（CogView-4）
- **参数**: body `{ image_base64 }`
- **扩展**: dxm-collage.js

### POST /api/ai/enhance
- **行号**: ai/image-gen.js:100
- **功能**: AI 画质增强（CogView-4）
- **参数**: body `{ image_base64 }`
- **扩展**: dxm-collage.js

### POST /api/ai/image-upload
- **行号**: ai/image-gen.js:124
- **功能**: 图片上传（OSS > ImgBB 兜底）
- **参数**: body `{ image_base64, name? }`
- **前端**: detail-modal.js, dxm-collage.js, dxm-paste-img.js

### POST /api/ai/smms-upload
- **行号**: ai/image-gen.js:132
- **功能**: 图片上传（旧接口兼容）

### GET /api/ai/smms-token
- **行号**: ai/image-gen.js:141
- **功能**: 获取 ImgBB Token（脱敏）
- **前端**: page-api-keys.js:268, dxm-collage.js

### POST /api/ai/smms-token
- **行号**: ai/image-gen.js:150
- **功能**: 保存 ImgBB Token
- **前端**: page-api-keys.js:207, 217

### POST /api/ai/smms-token-delete
- **行号**: ai/image-gen.js:168
- **功能**: 删除 ImgBB Token
- **前端**: page-api-keys.js:245

### GET /api/ai/oss-config
- **行号**: ai/image-gen.js:178
- **功能**: 获取 OSS 配置（脱敏）
- **前端**: page-api-keys.js:275

### POST /api/ai/oss-config
- **行号**: ai/image-gen.js:190
- **功能**: 保存 OSS 配置（加密存储）
- **参数**: body `{ accessKeyId, accessKeySecret, bucket, region, endpoint?, label? }`
- **前端**: page-api-keys.js:290

### POST /api/ai/oss-config-delete
- **行号**: ai/image-gen.js:210
- **功能**: 删除 OSS 配置
- **前端**: page-api-keys.js:302

---

## 11. AI 分类推荐 (ai/category-recommend.js)

### POST /api/ai/suggest-category
- **功能**: AI 分类推荐
- **参数**: body `{ uid?, title?, category?, mainImages? }`
- **认证**: ❌ 白名单（供扩展使用）

### POST /api/ai/save-category-mapping
- **功能**: 保存分类映射
- **认证**: ❌ 无（⚠️ 应加认证）

---

## 12. AI 内部工具 (ai/providers.js)

> **无 router 定义**，纯工具模块。

### 核心导出

| 函数 | 功能 |
|------|------|
| getApiKey / getZhipuKeys / saveZhipuKeys | 智谱 Key 管理 |
| getQwenKeys / getQwenVlKey / saveQwenVlKey | 通义千问 Key 管理 |
| getHunyuanAccounts | 混元账号 |
| getAIConfigs / saveAIConfigs / getAIConfig | AI 配置读写 |
| getProviderConfig / saveVendorModels | 厂商配置 |
| getDispatchOrder / saveDispatchOrder | 调度顺序 |
| dispatchByCategory | 按分类调度 |

### 降级链

| 链 | 顺序 |
|----|------|
| CATEGORY_LLM_CHAIN | GLM-4.7-Flash → 混元 → 通义千问 → GLM-4-Flash |
| EXTRACTION_LLM_CHAIN | 通义千问 → 混元 → GLM-4-Flash → GLM-4.7-Flash |
| VISION_LLM_CHAIN | GLM-4.6V-Flash → GLM-4V-Flash |
| IMAGE_GEN_LLM_CHAIN | CogView-3-Flash → CogView-4 |

### Key 轮换
- 限流检测 → 2 分钟冷却
- 连续失败 3 次 → 2 分钟屏蔽
- 限流关键词: `访问量过大`/`限流`/`429`/`Rate limit`

---

## 13. 前端调用点汇总

### app.js
| 端点 | 说明 |
|------|------|
| GET /api/me | 登录验证 |
| GET /api/product + /stats | 首页数据 |

### product-list.js
| 端点 | 说明 |
|------|------|
| GET /api/product | 商品列表 |
| GET /api/product/categories | 分类列表 |
| GET /api/product/dxm-categories | DXM 分类 |
| POST /api/product/batch-status | 批量改状态 |
| POST /api/product/batch-delete | 批量删除 |
| POST /api/product/batch-automate | 批量自动化 |
| POST /api/products/claim | 认领 |
| POST /api/products/assign | 分配 |
| DELETE /api/product/:uid | 删除 |
| PUT /api/product/:uid | 编辑分类 |
| POST /api/product/:uid/recommend-category | AI 推荐 |
| POST /api/sync/product-pull | 同步拉取 |
| EventSource /api/events | SSE |

### detail-modal.js
| 端点 | 说明 |
|------|------|
| GET /api/settings/price_formulas | 价格公式 |
| PUT /api/product/:uid | 保存商品 |
| POST /api/ai/replace-bg | 换背景 |
| POST /api/ai/auto-clean-chinese | 清理中文 |
| POST /api/ai/image-upload | 上传图片 |

### page-users.js
| GET/POST/PUT/DELETE /api/users | 用户 CRUD |

### page-api-keys.js
| 端点 | 说明 |
|------|------|
| GET /api/ai/vendor-configs | 厂商配置 |
| GET/POST /api/ai/dispatch-order | 调度 |
| POST /api/ai/zhipu-keys / qwen-keys / hunyuan-keys | Key 管理 |
| GET/POST/DELETE /api/ai/smms-token | 图床 |
| GET/POST/DELETE /api/ai/oss-config | OSS |
| GET/POST /api/ai/comfyui-config | ComfyUI |
| POST /api/ai/configs | AI 模型配置 |
| GET/POST /api/sync/config | 同步配置 |
| POST /api/settings-import | 导入设置 |

### page-cloud-sync.js
| GET/POST /api/sync/config, test, disconnect, init, sync, pull, push | 云同步全流程 |

### page-word-library.js
| GET/POST/DELETE /api/category-config | 分类配置 |
| DELETE /api/keyword-rels/:id | 关联删除 |
| DELETE /api/keyword-blacklist/:id | 黑名单删除 |

### category-page.js
| GET /api/category-mappings/grouped, /by-dxm, /categories | 分类映射 |

### category-picker.js
| GET /api/dxm-tree/search | 搜索类目 |

### page-meitu.js
| POST /api/ai/image-upload | 图片上传 |

### dashboard.js
| GET /api/product, /trend, /dxm-category-top | 仪表盘（⚠️ 用 fetch 未用 apiFetch） |

---

## 14. 扩展调用点汇总

### 1688 扩展

| 端点 | 文件 | 认证方式 |
|------|------|---------|
| POST /api/product | collect-data.js, grab-core.js | 白名单（免认证） |
| GET /api/product/check | collect-data.js | 白名单 |
| POST /api/login | popup.js | 白名单 |
| POST /api/plugin-login | popup.js | 白名单 |
| GET /api/extension-version | — | 白名单 |

### 店小蜜扩展

| 端点 | 文件 | 认证方式 |
|------|------|---------|
| POST /api/dxm-tree/sync | dxm-float-bee.js:1391 | 🔒 operator/admin（Bearer token） |
| POST /api/ai/* (图片操作) | dxm-collage.js, dxm-auto-clean.js, dxm-text-cleaner.js, dxm-paste-img.js | 🔒 operator/admin |
| GET /api/dxm-tree/root-status | dxm-config-ui.js:487 | Bearer token |
| POST /api/ai/text-to-image | dxm-collage.js | ❌ 无认证 |
| POST /api/ai/white-bg | dxm-collage.js | ❌ 无认证 |
| POST /api/ai/enhance | dxm-collage.js | ❌ 无认证 |
| GET/POST/DELETE /api/ai/smms-token | dxm-collage.js | ❌ 无认证 |

> 扩展 Token 获取链路: content script → `chrome.runtime.sendMessage({action:'getToken'})` → background.js → `chrome.cookies.get` → 回传
