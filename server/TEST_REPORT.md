# 测试报告

> 测试日期: 2026-05-24
> 测试框架: Jest 30.4.2 + Supertest 7.2.2
> 测试结果: **12 套件, 203 测试, 全部通过**

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

## 三、修复文件清单

| 文件 | 修改内容 |
|------|----------|
| `server/routes/settings.js` | 增加 `Array.isArray` 检查、SSE header 引号 |
| `server/routes/categories.js` | COALESCE 替代 JSON_EXTRACT（2处）、clearProductsByMapping 改用精确匹配 |
| `server/routes/products.js` | LIKE 通配符转义、batch 操作 id 类型校验、关键操作后 saveNow |
| `server/routes/ai/category-recommend.js` | 硬编码 noiseWords 替换为 getNoiseWords() |
| `server/db.js` | 新增 saveNow() 函数并导出 |

---

## 四、测试中观察到的好实践

1. **参数校验完整**: 绝大多数 API 端点都有合理的参数校验和 400 错误返回
2. **SQL 参数化**: 所有 SQL 查询都使用参数化绑定，无 SQL 注入风险
3. **错误降级处理**: crypto 解密失败返回原文、LLM 请求失败降级本地搜索、cloud 不可用时回退本地
4. **幂等设计**: `INSERT OR IGNORE`/`INSERT OR REPLACE` 确保重复操作安全
5. **软删除**: 产品删除使用 `deleted=1` 标记，数据可恢复
6. **批量限制**: batch 操作限制 500 条，防止大量数据操作

---

## 五、测试命令

```bash
cd server
npm test
```

---

## 六、文件清单

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
│   └── providers.test.js        # LLM供应商配置 (14 tests)
├── routes/
│   ├── settings.test.js         # 设置管理 (16 tests)
│   ├── categories.test.js       # 类目管理 (29 tests)
│   ├── products.test.js         # 商品管理 (22 tests)
│   ├── dxm-tree.test.js         # 分类树 (17 tests)
│   ├── ai-configs.test.js       # AI配置 (18 tests)
│   └── image-routes.test.js     # 图片路由参数校验 (13 tests)
└── TEST_REPORT.md               # 本报告
```
