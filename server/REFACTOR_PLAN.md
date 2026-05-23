# 重构计划：回调扁平化 + 模块化拆分

> 日期: 2026-05-23
> 状态: 第一阶段已完成，第二阶段全部完成

---

## 第一阶段：回调嵌套扁平化

### 问题分析

`routes/ai.js` 的 `POST /suggest-category` 路由（1145-1396 行）存在 5 层回调嵌套：

```
router.post → mappingPromise.then → extractProductKeywords.then → expandWithSynonyms.then → queryKeywordCategoryRel.then
```

嵌套链路：
1. 查映射表 `cloudDb.getMappings()` → .then
2. LLM 提炼关键词 `extractProductKeywords()` → .then
3. 同义词扩展 `expandWithSynonyms()` → .then
4. 关键词关联查询 `queryKeywordCategoryRel()` → .then
5. 候选搜索 + LLM 优选（内部还有 .then/.catch）

### 修复方案

将整个路由处理器改为 `async (req, res)` 风格，每一步 `await` 替代 `.then()`。

### 步骤

#### Step 1: 重写路由为 async/await
- **文件**: `routes/ai.js` 第 1145-1396 行
- **操作**: 将 `router.post('/suggest-category', function(req, res) {` 改为 `router.post('/suggest-category', async function(req, res) {`
- **要点**:
  1. 外层 try/catch 包裹整个逻辑
  2. `mappingPromise.then(...)` → `var mappings = await cloudDb.getMappings(...)`
  3. 映射表命中的 return 提前返回（guard clause）
  4. `extractProductKeywords().then().then().then()` → 三行 await
  5. 候选搜索逻辑保持同步（已是同步的）
  6. LLM 优选逻辑保持 await
- **预期行数**: 从 250 行减少到约 150 行（去掉嵌套缩进和重复 .catch）

#### Step 2: 同步改造 doRecommendAndGetResult
- **文件**: `routes/ai.js` 第 272-274 行
- **操作**: 将 Promise 包装的 HTTP 请求函数提取为独立 async 函数，供 products.js 调用
- **注意**: 此函数被 products.js 通过 HTTP 调用自身（localhost:3000），不改调用方式，仅内部扁平化

#### Step 3: 同步改造 doRecommendAndSave
- **文件**: `routes/ai.js` 第 277-372 行
- **操作**: 同 Step 2，内部改为 async/await

### 验证方法

1. **语法检查**: `node -c routes/ai.js` ✅ 通过
2. **模块加载**: `node -e "require('./routes/ai')"` ✅ 不报错
3. **导出检查**: `extractSearchKeywordsPublic` 和 `learnKeywordCategoryRelPublic` 仍可访问 ✅
4. **products.js 加载**: `node -e "require('./routes/products')"` ✅ 不报错

#### Step 1 结果
- ai.js: 1989 行 → 1934 行（减少 55 行）
- suggest-category 路由：5 层嵌套 → 1 层 try/catch，全部 async/await

#### Step 2+3 结果
- products.js: 609 行 → 578 行（减少 31 行）
- 提取公共 `localPost()` 函数，消除重复的 HTTP 请求包装
- `doRecommendAndGetResult` 和 `doRecommendAndSave` 从 Promise 包装改为 async 函数

---

## 第二阶段：模块化拆分

### M-1 结果：ai.js 拆分完成 ✅

- 原始 ai.js: 1934 行 → 备份为 ai.js.bak
- 拆分为 5 个模块：
  - `routes/ai/providers.js` (254 行) — 多供应商 LLM 调用 + 配置管理 + 降级链
  - `routes/ai/image-gen.js` (237 行) — 文生图/图生图/白底图/画质增强 + ImgBB图床
  - `routes/ai/image-edit.js` (278 行) — 抠图/修复/智能检测 + OCR文字处理
  - `routes/ai/category-recommend.js` (555 行) — 分类推荐引擎
  - `routes/ai/index.js` (139 行) — 路由入口 + 配置管理端点 + 导出
- 引用更新：server.js、products.js、categories.js 全部指向 `./routes/ai/index`
- 验证：语法检查全部通过、模块加载测试全部通过、导出函数可用

### M-2 结果：cloud-db.js 拆分完成 ✅

- 原始 cloud-db.js: 760 行 → 备份为 cloud-db.js.bak
- 拆分为 3 个模块（使用工厂模式传递共享状态）：
  - `cloud/index.js` (~175 行) — 连接管理 + 配置 + 云操作基础 + 统一导出
  - `cloud/knowledge.js` (~110 行) — 知识库 CRUD（云端优先，降级本地）
  - `cloud/sync.js` (~380 行) — 知识库/分类树/商品批量同步 + 单表同步
- 引用更新：server.js、products.js、categories.js、sync.js、ai/category-recommend.js 全部指向 `./cloud/index`
- 验证：语法检查全部通过、模块加载测试全部通过、所有导出函数可用

### 拆分方案

#### M-1. ai.js 拆分（1989 行 → 5 个文件）

**目标目录结构**:
```
server/routes/ai/
  ├── index.js           (~80 行)  路由注册 + 导出
  ├── providers.js       (~280 行) 多供应商 LLM 调用（智谱/千问/混元/Ollama）+ 降级链
  ├── image-gen.js       (~200 行) 文生图/图生图/白底图/画质增强 + ImgBB图床
  ├── image-edit.js      (~250 行) 抠图/修复/智能检测 + OCR文字处理
  └── category-recommend.js (~900 行) 分类推荐引擎（关键词提取/候选搜索/LLM优选/学习/映射）
```

**拆分细节**:

| 新模块 | 源码行 | 包含的端点 | 依赖 |
|--------|--------|-----------|------|
| `index.js` | 全局 | 配置管理端点 `/configs`, `/save-key`, `/global-key` | providers.js |
| `providers.js` | 76-351 | 无端点（纯函数） | crypto, http/https, db |
| `image-gen.js` | 469-517, 657-871 | `/text-to-image`, `/image-to-image`, `/white-bg`, `/enhance`, `/smms-*` | providers.js |
| `image-edit.js` | 557-777, 873-1013 | `/inpaint`, `/remove-bg`, `/remove-bg-local`, `/smart-detect`, `/detect-text`, `/auto-clean-chinese`, `/batch-clean-chinese`, `/ocr-status`, `/model-status` | services/*, providers.js |
| `category-recommend.js` | 1015-1880 | `/suggest-category`, `/save-category-mapping` | providers.js, db, cloud-db |

**步骤**:

1. 创建 `routes/ai/` 目录
2. 提取 `providers.js` — 把 4 个供应商函数 + 降级链 + 健康缓存移入，导出 `{ runLLMChain, categoryLLMRequest, extractionLLMRequest, ollamaChatRequest, zhipuRequest, getAIConfig, getAIConfigs, saveAIConfigs, getApiKey, maskApiKey }`
3. 提取 `image-gen.js` — require providers.js 的 `imageLLMRequest`，注册图片生成路由，导出 router
4. 提取 `image-edit.js` — require services 和 providers，注册图片编辑路由，导出 router
5. 提取 `category-recommend.js` — require providers.js 和 db/cloud-db，注册推荐路由，导出 router + `extractSearchKeywordsPublic` + `learnKeywordCategoryRelPublic`
6. 编写 `index.js` — 合并所有子路由，挂载配置管理端点，统一导出
7. 修改 `server.js` — 将 `require('./routes/ai')` 改为 `require('./routes/ai/index')`
8. 修改 `products.js` — 将 `require('./ai')` 改为 `require('./ai/category-recommend')`

**验证方法**:
1. 每个新文件 `node -c` 语法检查
2. `node -e "require('./routes/ai/index')"` 加载成功
3. 所有原有端点可访问（curl 逐个测试）
4. `products.js` 中 `require('./ai/category-recommend').extractSearchKeywordsPublic` 可用
5. 启动服务无报错，采集+分类全流程正常

#### M-2. cloud-db.js 拆分（760 行 → 3 个文件）

**目标目录结构**:
```
server/cloud/
  ├── index.js         (~100 行) 连接管理 + 状态 + 导出
  ├── knowledge.js     (~400 行) 知识库表同步（mappings/keywords/synonyms/blacklist）
  └── products.js      (~260 行) 商品+分类树同步
```

**步骤**:

1. 创建 `cloud/` 目录
2. 提取 `knowledge.js` — 包含知识库的 CRUD + 双向同步 + 单表同步（pushTable/pullTable）
3. 提取 `products.js` — 包含商品和分类树的批量同步
4. 编写 `index.js` — 连接管理 + 配置读写 + 合并导出
5. 修改所有 require('./cloud-db') 为 require('./cloud/index')

**验证方法**:
1. 每个文件语法检查
2. `require('./cloud/index')` 加载成功，导出所有原有函数
3. 路由模块（sync.js, products.js, categories.js, ai/）引用不报错

#### M-3. products.js 清理 [-] 跳过

- `doRecommendAndGetResult` 和 `doRecommendAndSave` 深度依赖 products.js 的 localPost/getOne/run/scheduleSave/sseBroadcast
- 通过 HTTP 调用 `/api/ai/suggest-category`，不属于推荐引擎核心逻辑
- 移动到 category-recommend.js 会引入反向依赖（category-recommend 需要 products 的数据库操作）
- 当前位置合理，保持不动

### 执行顺序

```
第一阶段（回调扁平化）
  Step 1: suggest-category async/await 重写 ← 先做
  Step 2: doRecommendAndGetResult 扁平化
  Step 3: doRecommendAndSave 扁平化
  验证 ← 每步验证

第二阶段（模块化拆分）
  M-1: ai.js 拆分 ← 最大收益
    Step 1-8 逐步执行
  M-2: cloud-db.js 拆分
    Step 1-5 逐步执行  
  M-3: products.js 清理
    最后执行
  验证 ← 每个模块完成后全量验证
```

### 回归风险控制

- 每个 Step 完成后立即语法检查 + 模块加载测试
- 每个阶段完成后做完整的功能回归测试
- 所有改动前确保 git 工作区干净，可随时回退
