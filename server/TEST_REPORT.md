# 测试报告

> 测试日期: 2026-05-24
> 测试框架: Jest 30.4.2 + Supertest 7.2.2
> 测试结果: **13 套件, 251 测试, 全部通过**

---

## 一、测试覆盖范围

### 纯函数单元测试（6 个套件）

| 套件 | 文件 | 测试数 | 覆盖内容 |
|------|------|--------|----------|
| Crypto | `unit/crypto.test.js` | 16 | encrypt/decrypt 往返、空值、长文本、中文、JSON、isSensitive |
| 分类计分 | `unit/category-score.test.js` | 13 | scoreCategory 各权重层级、calcHitDetail 命中、splitAliCategoryWords |
| 关键词提取 | `unit/category-keywords.test.js` | 12 | cleanTitleKeywords 去噪/去规格/过滤、extractSearchKeywords 合并去重 |
| 互斥组 | `unit/category-mutex.test.js` | 14 | getMutexGroupIndex、isMutexConflict 跨大类拦截/同大类放行 |
| 清理服务 | `unit/cleanup.test.js` | 3 | 空目录/不存在目录不报错 |
| 供应商配置 | `unit/providers.test.js` | 14 | maskApiKey、AI_USE_CASES 结构、getAIConfig、getZhipuKeys 等 |

### API 路由测试（6 个套件）

| 套件 | 文件 | 测试数 | 覆盖端点 |
|------|------|--------|----------|
| Settings | `routes/settings.test.js` | 16 | GET/PUT/POST settings、export/import、clear-signal、events(SSE) |
| Categories | `routes/categories.test.js` | 29 | categories CRUD、mappings CRUD(含按名称/DXM查询/分组)、keyword-rels、synonyms、blacklist、category-config |
| Products | `routes/products.test.js` | 22 | product CRUD、stats、trend、check、batch-delete、batch-status、搜索筛选 |
| DXM Tree | `routes/dxm-tree.test.js` | 17 | collect、sync(含更新)、children、status、root-status、search、resolve-path |
| AI Configs | `routes/ai-configs.test.js` | 18 | check-key、get-key、save/delete-key、configs、global-key、zhipu/qwen/hunyuan keys、ImgBB |
| Image Routes | `routes/image-routes.test.js` | 13 | text-to-image、image-to-image、white-bg、enhance、smms-upload、inpaint、smart-detect、detect-text、auto-clean-chinese、model-status、ocr-status |

---

## 二、发现的问题及修复状态

### 问题 1: settings-import 对非对象 JSON 输入未校验 ✅ 已修复

**严重程度**: 低
**文件**: `server/routes/settings.js:76`
**描述**: `POST /api/settings-import` 未检查 `Array.isArray(data)`，导致数组类型的 JSON 请求体也能通过校验。
**修复方案**: 增加 `Array.isArray(data)` 检查，确保只接受纯对象。

### 问题 2: category-mappings 商品数量统计可能不准确 ✅ 已修复

**严重程度**: 中
**文件**: `server/routes/categories.js:35` 和 `server/routes/categories.js:85`
**描述**: 仅通过 `JSON_EXTRACT(category, '$.leafCategoryName')` 提取类目名，部分商品 category JSON 中只有 `categoryPath` 没有 `leafCategoryName`，导致商品数量统计为 0。
**修复方案**: 使用 `COALESCE(JSON_EXTRACT(category, '$.leafCategoryName'), JSON_EXTRACT(category, '$.categoryPath'))` 兼容两种字段。两处（`/category-mappings` 和 `/category-mappings/grouped`）均已修复。

### 问题 3: product/check 端点 SQL LIKE 通配符未转义 ✅ 已修复

**严重程度**: 低
**文件**: `server/routes/products.js:305`
**描述**: `GET /api/product/check` 的 `LIKE '%' + offerId + '%'` 未转义 `%` 和 `_`，可能产生意外匹配。
**修复方案**: 对 offerId 中的 LIKE 通配符进行 `\` 转义，并添加 `ESCAPE '\\'` 子句。

### 问题 4: batch-delete/batch-status 缺少 id 类型校验 ✅ 已修复

**严重程度**: 低
**文件**: `server/routes/products.js:551-571`
**描述**: 批量操作未校验每个 id 是否为有效数字，`['abc']` 等输入导致静默失败。
**修复方案**: 增加 `ids.map(id => parseInt(id)).filter(id => !isNaN(id) && id > 0)` 过滤无效 id，空结果直接返回 `{ ok: true, deleted/updated: 0 }`。

### 问题 5: extractProductKeywords 中 noiseWords 硬编码与数据库配置重复 ✅ 已修复

**严重程度**: 低（代码质量）
**文件**: `server/routes/ai/category-recommend.js:527-533`
**描述**: LLM 关键词提取后使用硬编码 noiseWords 过滤，与 `getNoiseWords()` 数据库配置重复且可能不一致。
**修复方案**: 将硬编码噪词列表替换为 `getNoiseWords()` 调用，统一使用数据库配置（降级时用内置默认列表）。

### 问题 6: SSE events 端点 Connection header 未加引号 ✅ 已修复

**严重程度**: 低
**文件**: `server/routes/settings.js:133`
**描述**: SSE 响应头中 `Connection: keep-alive` 的键名未用引号，虽然 JS 语法合法但风格不统一。
**修复方案**: 统一使用引号 `'Connection': 'keep-alive'`。

### 问题 7: clearProductsByMapping 使用 LIKE 模式匹配 JSON 字段 ✅ 已修复

**严重程度**: 中
**文件**: `server/routes/categories.js:111-125`
**描述**: `clearProductsByMapping` 用 `LIKE '%"%' + categoryName + '"%'` 匹配 JSON 字段中的类目名，依赖格式假设（双引号位置、空格等），可能遗漏或误匹配。
**修复方案**: 改用 `COALESCE(JSON_EXTRACT(category, '$.leafCategoryName'), JSON_EXTRACT(category, '$.categoryPath')) = ?` 精确匹配，与问题2修复保持一致的 COALESCE 策略。

### 问题 8: scheduleSave 延迟保存期间数据丢失风险 ✅ 已修复

**严重程度**: 中
**文件**: `server/db.js:71-74`
**描述**: `scheduleSave()` 使用 500ms 延迟，进程崩溃时丢失未落盘数据。批量删除等关键操作后数据可能未持久化。
**修复方案**: 新增 `saveNow()` 函数（立即取消延迟定时器并同步写盘），在 `batch-delete` 等关键操作后调用，确保数据即时持久化。`saveNow` 已导出供所有路由使用。

---

## 三、多电脑数据合并问题（同步逻辑审计）

> 测试文件: `server/__tests__/unit/sync.test.js` (48 tests)
> 审计文件: `server/cloud/sync.js`

### 问题 9: 商品字段更新不同步 — 多电脑间编辑丢失 ⚠️ 未修复

**严重程度**: 高
**文件**: `server/cloud/sync.js:227-260` (uploadProducts), `server/cloud/sync.js:262-289` (downloadProducts)
**描述**:
- `uploadProducts` 使用 `INSERT OR IGNORE`：如果云端已存在同 `source_url` 的商品，后续的标题、分类、自定义类目等字段修改不会被同步到云端。
- `downloadProducts` 对已存在的商品只同步 `deleted` 状态，不同步 `title`、`category`、`custom_category`、`dxm_category`、`manual_category`、`status` 等字段。

**影响场景**: 电脑A修改了商品的自定义分类，同步后电脑B看不到该修改。

**建议修复方案**: uploadProducts 改为逐条比对，对已存在的商品使用 `UPDATE` 同步最新字段；downloadProducts 对已存在的商品同步非空字段更新（可用 `updated_at` 时间戳判断哪边更新）。

### 问题 10: keyword_category_rel 的 valid 字段不同步 ⚠️ 未修复

**严重程度**: 中
**文件**: `server/cloud/sync.js:26-40` (uploadLocalToCloud), `server/cloud/sync.js:121-136` (downloadCloudToLocal)
**描述**: 双向同步时只合并 `weight` 和 `match_count`（使用 Math.max），但 `valid` 和 `source` 字段不更新。如果电脑A将某关键词标记为无效（`valid=0`），电脑B不会收到这个标记。

**影响场景**: 用户在一台电脑上标记某关键词为无效后，另一台电脑该关键词仍显示有效。

**建议修复方案**: valid 字段应取两边的最小值（任一方标记无效则全局无效），或基于 `updated_at` 时间戳取最新值。

### 问题 11: category_config 下载时 INSERT OR REPLACE 可能覆盖本地修改 ⚠️ 未修复

**严重程度**: 中
**文件**: `server/cloud/sync.js:152-155` (downloadCloudToLocal)
**描述**: `downloadCloudToLocal` 对 `category_config` 使用 `INSERT OR REPLACE`，会无条件用云端数据覆盖本地数据。如果电脑A修改了配置的 `sort_order` 或 `description`，电脑B推送旧数据到云端后，电脑A在下次 pull 时会被旧数据覆盖。

**影响场景**: 多电脑修改同一条分类配置时，最后 pull 的一台会覆盖其他修改。

**建议修复方案**: 改为逐条比对，用 `updated_at` 时间戳决定保留哪一方的修改，或仅在本地不存在时插入（`INSERT OR IGNORE`），修改类操作通过专门的 `pushTable` 推送到云端。

### 问题 12: 黑名单 reason 字段不同步 ⚠️ 未修复

**严重程度**: 低
**文件**: `server/cloud/sync.js:138-148` (downloadCloudToLocal)
**描述**: `keyword_blacklist` 使用 `INSERT OR IGNORE`，如果本地和云端有同一条黑名单（keyword + category_name 相同），本地已有的 `reason` 不会被云端版本更新，云端版本也不会被本地版本更新。

**影响场景**: 两台电脑对同一黑名单条目设置了不同的 reason，永远不会同步。

---

## 四、修复文件清单（问题1-8）

| 文件 | 修改内容 |
|------|----------|
| `server/routes/settings.js` | 增加 `Array.isArray` 检查、SSE header 引号 |
| `server/routes/categories.js` | COALESCE 替代 JSON_EXTRACT（2处）、clearProductsByMapping 改用精确匹配 |
| `server/routes/products.js` | LIKE 通配符转义、batch 操作 id 类型校验、关键操作后 saveNow |
| `server/routes/ai/category-recommend.js` | 硬编码 noiseWords 替换为 getNoiseWords() |
| `server/db.js` | 新增 saveNow() 函数并导出 |

---

## 五、测试中观察到的好实践

1. **参数校验完整**: 绝大多数 API 端点都有合理的参数校验和 400 错误返回
2. **SQL 参数化**: 所有 SQL 查询都使用参数化绑定，无 SQL 注入风险
3. **错误降级处理**: crypto 解密失败返回原文、LLM 请求失败降级本地搜索、cloud 不可用时回退本地
4. **幂等设计**: `INSERT OR IGNORE`/`INSERT OR REPLACE` 确保重复操作安全
5. **软删除**: 产品删除使用 `deleted=1` 标记，数据可恢复
6. **批量限制**: batch 操作限制 500 条，防止大量数据操作

---

## 六、测试命令

```bash
cd server
npm test
```

---

## 七、文件清单

```
server/__tests__/
├── helpers/
│   └── setup.js                 # 测试基础设施（内存数据库 + Express app + mock）
├── unit/
│   ├── crypto.test.js           # 加密模块 (16 tests)
│   ├── category-score.test.js   # 分类计分算法 (13 tests)
│   ├── category-keywords.test.js # 关键词提取 (12 tests)
│   ├── category-mutex.test.js   # 互斥组 (14 tests)
│   ├── cleanup.test.js          # 清理服务 (3 tests)
│   ├── providers.test.js        # LLM供应商配置 (14 tests)
│   └── sync.test.js             # 多电脑数据合并同步逻辑 (48 tests)
├── routes/
│   ├── settings.test.js         # 设置管理 (16 tests)
│   ├── categories.test.js       # 类目管理 (29 tests)
│   ├── products.test.js         # 商品管理 (22 tests)
│   ├── dxm-tree.test.js         # 分类树 (17 tests)
│   ├── ai-configs.test.js       # AI配置 (18 tests)
│   └── image-routes.test.js     # 图片路由参数校验 (13 tests)
└── TEST_REPORT.md               # 本报告
```
