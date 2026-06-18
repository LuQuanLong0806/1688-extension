# AI模型配置页重构方案 — 按厂商分组

## 一、现状分析

### 1.1 当前页面结构（按功能分类）

| 模块 | 厂商 | 模型类型 | 模型 | Key存储位置 | Key类型 |
|------|------|---------|------|------------|---------|
| 分类推荐 | 智谱AI | 📝 文本模型 | GLM-4.7-Flash / GLM-4-Flash | `zhipu_api_keys` | 多Key轮换 |
| 分类推荐 | 通义千问 | 📝 文本模型 | qwen-turbo | `ai_configs.providers.qwen.apiKeys` | 多Key轮换 |
| 分类推荐 | 腾讯混元 | 📝 文本模型 | hunyuan-lite | `ai_configs.providers.hunyuan.accounts` | 多账号(SecretId+SecretKey) |
| 分类推荐 | 本地模型 | 📝 文本模型 | Ollama (qwen3:8b) | `ai_configs.providers.ollama` | 无Key |
| 智能检测 | 智谱AI | 👁️ 视觉模型 | GLM-4V-Flash / GLM-4.6V-Flash | `ai_configs.vision.apiKey` | 单Key(可回退到智谱通用Key) |
| 图片生成 | 智谱AI | 🎨 图像生成模型 | CogView-3-Flash / CogView-4 | `ai_configs.image.apiKey` | 单Key(可回退到智谱通用Key) |
| 图片识别 | 通义千问 | 👁️ 视觉模型 | qwen3.6-flash / qwen3.7-plus / qwen-vl-plus | `qwen_vl_api_key` | 单Key(有内置默认) |
| 图床配置 | ImgBB | 🔧 工具服务 | — | `imgbb_api_key` | 单Key |
| ComfyUI | 本地服务 | 🔧 工具服务 | — | ComfyUI配置 | URL |
| Turso | 云数据库 | 🔧 工具服务 | — | sync配置 | URL+Token |

### 1.2 核心问题

1. **同厂商Key重复配置** — 智谱AI在"分类推荐""智能检测""图片生成"三个模块分别有Key管理入口，用户配多次
2. **存在"单专用Key"概念** — 智能检测、图片生成各有独立的 `vision.apiKey`/`image.apiKey`，和通用Key池分离，增加复杂度
3. **通义千问Key分裂** — 文本Key存 `ai_configs.providers.qwen`，VL Key存 `qwen_vl_api_key`，实际同一厂商同一平台申请
4. **按功能分类导致认知负担** — 用户想"配智谱的Key"，却要在3个功能模块里分别操作
5. **导入导出迁移复杂** — 已有5+种旧格式迁移逻辑（单Key→数组、字符串→对象），重构时需保留兼容

### 1.3 涉及文件清单

| 文件 | 角色 | 改动级别 |
|------|------|----------|
| `server/routes/ai/providers.js` | 后端核心：Key存取、降级链、请求函数 | **重** |
| `server/routes/ai/index.js` | 后端路由：配置API端点 | **重** |
| `server/public/js/components/page-api-keys.js` | 前端页面：整个配置UI | **重写** |
| `server/public/css/app.css` | 样式：`.ai-module`等类 | **中** |
| `server/routes/settings.js` | 导入导出+迁移逻辑 | **中** |
| `server/crypto.js` | 加密/敏感Key判定 | **轻** |

---

## 二、目标页面结构（按厂商分组）

### 2.1 新页面布局

```
AI模型配置
├── 📦 智谱AI (Zhipu)
│   ├── 🔑 通用 API Key（多Key轮换，所有智谱功能共用）
│   ├── 📝 文本模型
│   │   ├── 分类推荐: GLM-4.7-Flash ▾
│   │   └── [降级链] GLM-4.7-Flash → GLM-4-Flash
│   ├── 👁️ 视觉模型
│   │   ├── 智能检测: GLM-4.6V-Flash ▾
│   │   └── [降级链] GLM-4.6V-Flash → GLM-4V-Flash
│   └── 🎨 图像生成模型
│       ├── 图片生成: CogView-3-Flash ▾
│       └── [降级链] CogView-3-Flash → CogView-4
│
├── 📦 通义千问 (Qwen/阿里云)
│   ├── 🔑 API Key（多Key轮换，文本+VL共用）
│   ├── 📝 文本模型
│   │   └── 分类推荐降级: qwen-turbo
│   └── 👁️ 视觉模型
│       ├── 图片识别: qwen3.6-flash ▾
│       └── [降级链] qwen3.6-flash → qwen3.7-plus → qwen-vl-plus
│
├── 📦 腾讯混元 (Hunyuan/腾讯云)
│   ├── 🔑 账号管理（SecretId + SecretKey，多账号轮换）
│   └── 📝 文本模型
│       └── 分类推荐降级: hunyuan-lite
│
├── 📦 本地模型 (Ollama)
│   ├── 模型名称: qwen3:8b
│   └── 端口: 11434
│
├── 📦 工具服务
│   ├── 🖼️ 图床 (ImgBB)
│   │   └── API Key
│   ├── 🎨 ComfyUI Inpaint
│   │   └── 服务地址
│   └── ☁️ Turso 云同步
│       └── URL + Auth Token
```

### 2.2 模型分类总览（每个厂商拥有哪些模型）

| 厂商 | 📝 文本模型 | 👁️ 视觉模型 | 🎨 图像生成模型 |
|------|-----------|-----------|--------------|
| **智谱AI** | GLM-4.7-Flash（免费）<br>GLM-4-Flash（免费） | GLM-4.6V-Flash（免费）<br>GLM-4V-Flash（免费，旧版） | CogView-3-Flash（免费）<br>CogView-4（付费） |
| **通义千问** | qwen-turbo（免费） | qwen3.6-flash（0.5元/百万token）<br>qwen3.7-plus（4元/百万token）<br>qwen-vl-plus（旧版） | — |
| **腾讯混元** | hunyuan-lite（永久免费） | — | — |
| **本地模型** | Ollama（用户自装，如qwen3:8b） | — | — |

> **模型类型说明：**
> - 📝 **文本模型** — 接收文本输入，输出文本。用于分类推荐、关键词提取、标题生成等
> - 👁️ **视觉模型** — 接收图片+文本输入，输出文本。用于图片内容检测（水印/LOGO）、商品图片识别分析
> - 🎨 **图像生成模型** — 接收文本描述，输出图片。用于AI生成商品主图、白底图等

### 2.3 各厂商模型能力矩阵（哪个厂商能干什么）

| 功能场景 | 智谱AI | 通义千问 | 腾讯混元 | 本地模型 |
|---------|--------|---------|---------|---------|
| 分类推荐（文本） | ✅ GLM-4.7-Flash 主力 | ✅ qwen-turbo 降级 | ✅ hunyuan-lite 降级 | ✅ Ollama 降级 |
| 属性提取（文本） | ✅ GLM-4-Flash 降级 | ✅ qwen-turbo 主力 | ✅ hunyuan-lite 降级 | ✅ Ollama 降级 |
| 智能检测（视觉） | ✅ GLM-4.6V-Flash 主力 | — | — | — |
| 图片识别（视觉） | — | ✅ qwen3.6-flash 主力 | — | — |
| 图片生成（文生图） | ✅ CogView-3-Flash 主力 | — | — | — |
| 图片编辑（图生图） | ✅ CogView-4 | — | — | — |

### 2.4 关键交互设计

> **核心原则：每个厂商一个Key池，该厂商所有模型共用，统一多Key管理操作。**

**所有AI厂商卡片统一结构：**
```
┌─────────────────────────────────────────────┐
│ 📦 厂商名 (厂商英文名)    免费   官网链接    │
├─────────────────────────────────────────────┤
│ 🔑 Key管理                                   │
│ [sk-xxxx****xxxx [备注] ✏️ ✕] [sk-yyy...] │
│ [+ 添加Key]                                  │
│ 未设置（空状态时）                            │
├─────────────────────────────────────────────┤
│ 模型配置                                     │
│ 📝 文本模型  分类推荐    [GLM-4.7-Flash ▾]  │
│ 👁️ 视觉模型  智能检测    [GLM-4.6V-Flash ▾] │
│ 🎨 图像生成  图片生成    [CogView-3-Flash ▾] │
│                                             │
│ 降级链：GLM-4.7 → 混元 → 通义 → GLM-4      │
└─────────────────────────────────────────────┘
```

**智谱AI卡片：**
- 顶部：厂商名 + "免费"标签 + 官网链接
- Key管理区：统一Key池，多Key标签列表 + 添加/编辑/删除按钮
  - 该厂商下所有模型（文本/视觉/图像生成）都从此池取Key轮换
  - **去掉"智能检测专用Key""图片生成专用Key"概念**
- 模型选择区：三个子行，每行 = 模型类型标签 + 功能名 + 下拉选择模型
  - 📝 文本模型 → GLM-4.7-Flash / GLM-4-Flash
  - 👁️ 视觉模型 → GLM-4.6V-Flash / GLM-4V-Flash
  - 🎨 图像生成 → CogView-3-Flash / CogView-4

**通义千问卡片：**
- 顶部：厂商名 + "免费/付费"标签 + DashScope控制台链接
- Key管理区：统一Key池，多Key标签列表 + 添加/编辑/删除按钮
  - 文本模型和视觉模型共用同一Key池
  - **合并旧版 `qwen_vl_api_key` 到此池**
- 模型选择区：
  - 📝 文本模型 → qwen-turbo（降级链用）
  - 👁️ 视觉模型 → qwen3.6-flash / qwen3.7-plus / qwen-vl-plus

**腾讯混元卡片：**
- 顶部：厂商名 + "永久免费"标签 + 腾讯云API密钥链接
- Key管理区：统一账号池，多账号管理（SecretId + SecretKey）+ 添加/编辑/删除
  - 所有模型共用此账号池
- 模型选择区：
  - 📝 文本模型 → hunyuan-lite（降级链用）

**本地模型卡片：**
- 无Key管理（本地服务不需要Key）
- 直接配置模型名称和端口
- 📝 文本模型类型标签

**工具服务区域（非AI厂商，独立管理）：**
- 图床(ImgBB)：自己的单Key管理
- ComfyUI Inpaint：URL配置
- Turso：URL+Token配置

**降级链可视化（可选增强）：**
- 在每个厂商卡片底部，用文字展示该厂商参与的降级顺序
- 如：智谱 "分类推荐降级链: GLM-4.7-Flash → 混元 → 通义 → GLM-4-Flash"

---

## 二-B、Key操作功能保留清单（按厂商Key池统一管理）

> **核心变化：去掉"单专用Key"概念，每个厂商只有一个Key池，该厂商所有模型共用。**
> 所有厂商的Key操作统一：添加Key、编辑备注、删除Key、标签展示、空状态提示。
> API端点和交互行为保持不变（前端合并入口，后端复用现有端点）。

### 智谱AI — 统一Key池（文本+视觉+图像生成共用）

当前状态：有3个独立Key入口（分类推荐多Key池 + 智能检测单专用Key + 图片生成单专用Key）
重构后：**合并为1个Key池**，智谱卡片内只看到一个Key管理区

| 操作 | 重构后触发方式 | 底层API（不变） | 说明 |
|------|-------------|-------------|------|
| 添加Key | 智谱卡片Key区 → "添加"按钮 → 弹窗(Key+备注) | `POST /api/ai/zhipu-keys {action:'add', key, label}` | 复用现有端点 |
| 编辑备注 | Key标签上✏️图标 | `POST /api/ai/zhipu-keys {action:'update-label', index, label}` | 复用现有端点 |
| 删除Key | Key标签上✕图标 → 确认弹窗 | `POST /api/ai/zhipu-keys {action:'delete', index}` | 复用现有端点 |
| Key展示 | 标签列表 `sk-xxxx****xxxx [备注]` | `GET /api/ai/configs` → `_global.keys` | 同一展示格式 |
| 空状态提示 | "未设置，所有智谱模型将无法使用" | — | 比旧版更明确 |

**旧版"专用Key"迁移：**
- 旧版 `vision.apiKey`、`image.apiKey` → 首次访问新页面时，自动合并到 `zhipu_api_keys` 池
- 合并后删除旧专用Key字段，统一走Key池轮换

### 通义千问 — 统一Key池（文本+视觉共用）

当前状态：文本Key池(`qwen.apiKeys`) + VL独立Key(`qwen_vl_api_key`) + 内置默认Key
重构后：**合并为1个Key池**，通义千问卡片内只看到一个Key管理区

| 操作 | 重构后触发方式 | 底层API（不变） | 说明 |
|------|-------------|-------------|------|
| 添加Key | 通义千问卡片Key区 → "添加"按钮 → 弹窗(Key+备注) | `POST /api/ai/qwen-keys {action:'add', key, label}` | 复用现有端点 |
| 编辑备注 | Key标签上✏️图标 | `POST /api/ai/qwen-keys {action:'update-label', index, label}` | 复用现有端点 |
| 删除Key | Key标签上✕图标 → 确认弹窗 | `POST /api/ai/qwen-keys {action:'delete', index}` | 复用现有端点 |
| Key展示 | 标签列表 | `GET /api/ai/configs` → `providers.qwen.keys` | 同一展示格式 |
| 空状态提示 | "未设置" 或 "使用内置默认Key" | — | 保留默认Key回退机制 |

**旧版"VL专用Key"迁移：**
- 旧版 `qwen_vl_api_key` → 首次访问新页面时，自动合并到 `qwen.apiKeys` 池
- `getQwenVlKey()` 改为优先从 `qwen.apiKeys` 取，回退到 `qwen_vl_api_key`，最后回退到内置默认Key

### 腾讯混元 — 统一账号池

当前状态：已经是多账号池，无分裂问题
重构后：**保持不变**，只是从"分类推荐模块内"移到"腾讯混元厂商卡片内"

| 操作 | 重构后触发方式 | 底层API（不变） | 说明 |
|------|-------------|-------------|------|
| 添加账号 | 混元卡片Key区 → "添加"按钮 → 弹窗(SecretId+SecretKey+备注) | `POST /api/ai/hunyuan-keys {action:'add', secretId, secretKey, label}` | 复用现有端点 |
| 编辑备注 | 账号标签上✏️图标 | `POST /api/ai/hunyuan-keys {action:'update-label', index, label}` | 复用现有端点 |
| 删除账号 | 账号标签上✕图标 → 确认弹窗 | `POST /api/ai/hunyuan-keys {action:'delete', index}` | 复用现有端点 |
| 账号展示 | 标签列表 `AKIDxxxx****xxxx [备注]` | — | 同一展示格式 |
| 空状态提示 | "未设置" | — | 保留 |

### 本地模型 (Ollama) — 无Key管理

| 操作 | 重构后触发方式 | 底层API（不变） |
|------|-------------|-------------|
| 配置模型名+端口 | 同两个输入框+保存按钮 | `POST /api/ai/configs {providers:{ollama:{model, port}}}` |
| 配置状态展示 | "qwen3:8b:11434" 或 "未配置" | — |

### 工具服务（独立于AI厂商）

#### 图床 (ImgBB)

| 操作 | 重构后触发方式 | 底层API（不变） |
|------|-------------|-------------|
| 设置/替换Key | "设置Key"/"替换Key"按钮 → 弹窗 | `POST /api/ai/smms-token {token, label}` |
| 编辑备注 | Key标签上✏️图标 | `POST /api/ai/smms-token {labelOnly:true, label}` |
| 删除Key | ✕图标 → 确认弹窗 | `POST /api/ai/smms-token-delete` |
| Key展示 | 标签显示脱敏Key+备注 | `GET /api/ai/smms-token` |
| 免费申请链接 | 外链到 api.imgbb.com | — |
| 空状态提示 | "未设置" | — |

#### ComfyUI Inpaint

| 操作 | 重构后触发方式 | 底层API（不变） |
|------|-------------|-------------|
| 保存URL | 输入框+保存按钮 | `POST /api/ai/comfyui-config {url}` |
| 在线状态 | ● 在线(绿) / ● 离线(橙) | `GET /api/ai/comfyui-config` → `online` |
| loading状态 | 保存按钮loading | — |

#### Turso 云同步

| 操作 | 重构后触发方式 | 底层API（不变） |
|------|-------------|-------------|
| 保存配置 | URL+Token输入框+保存按钮 | `POST /api/sync/config {url, token}` |
| 修改模式 | 已配置显示"修改"按钮，进入编辑态 | — |
| 取消修改 | "取消"按钮恢复原值 | — |
| loading状态 | 保存按钮loading | — |
| 校验 | URL和Token不能为空 | — |

### 导入导出（不变）

| 操作 | 重构后保留方式 |
|------|-------------|
| 导出设置 | 同一按钮 → `GET /api/settings-export` |
| 导入设置 | 同一按钮 → 选文件 → `POST /api/settings-import` |

### 弹窗系统（统一，不变）

| 弹窗类型 | 当前行为 | 重构后 |
|---------|---------|-------|
| 多Key添加（智谱/通义） | 标题"添加Key"，字段：API Key + 备注，Enter提交 | ✅ 完全保留 |
| 多Key编辑备注（智谱/通义） | 标题"编辑备注"，字段：备注，Enter提交 | ✅ 完全保留 |
| 混元添加账号 | 标题"添加账号"，字段：SecretId + SecretKey + 备注 | ✅ 完全保留 |
| 混元编辑备注 | 标题"编辑备注"，字段：备注 | ✅ 完全保留 |
| 单Key设置（图床ImgBB） | 标题"设置Key"，字段：API Key + 备注 | ✅ 完全保留 |
| 单Key编辑备注（图床ImgBB） | 标题"编辑备注"，字段：备注 | ✅ 完全保留 |
| 确认删除弹窗 | `vm.$Modal.confirm`，含确认/取消按钮 | ✅ 完全保留 |

---

## 三、数据结构变更

### 3.1 当前存储结构

```
settings 表（6个独立Key）:
├── zhipu_api_keys       → [{key, label}, ...]     (智谱专用)
├── zhipu_api_key        → "sk-xxx"               (旧格式兼容)
├── ai_configs           → {                       (主配置)
│     providers: {
│       qwen:   { apiKeys: [{key, label}] },
│       hunyuan: { accounts: [{secretId, secretKey, label}] },
│       ollama:  { model, port }
│     },
│     category: { model, apiKey, label },
│     vision:   { model, apiKey, label },
│     image:    { model, apiKey, label }
│   }
├── qwen_vl_api_key      → "sk-xxx"               (VL专用)
├── imgbb_api_key         → "xxx"                  (图床)
├── comfyui_url           → "https://..."          (ComfyUI)
└── sync config           → {url, token}           (Turso)
```

### 3.2 新存储结构（向后兼容）

```
settings 表（新增 vendor 结构，保留旧字段）:
├── ai_vendor_configs    → {                        ★ 新增
│     version: 2,
│     vendors: {
│       zhipu: {
│         apiKeySource: "shared",    // "shared"=共用Key池, "dedicated"=独立Key
│         models: {
│           text:    "glm-4.7-flash",
│           vision:  "glm-4.6v-flash",
│           image:   "cogview-3-flash"
│         }
│       },
│       qwen: {
│         apiKeySource: "shared",
│         models: {
│           text:    "qwen-turbo",
│           recognize: "qwen3.6-flash"
│         }
│       },
│       hunyuan: {
│         apiKeySource: "shared",
│         models: {
│           text: "hunyuan-lite"
│         }
│       },
│       ollama: {
│         model: "qwen3:8b",
│         port: "11434"
│       }
│     },
│     tools: {
│       imgbb:    { apiKey: "" },
│       comfyui:  { url: "" },
│       turso:    { url: "", token: "" }
│     }
│   }
│
│   保留旧字段（不删除，降级链仍然读取）:
├── zhipu_api_keys       → [{key, label}, ...]
├── qwen_vl_api_key      → "sk-xxx"
├── ai_configs           → { ... }      (Key轮换逻辑继续从此读取)
└── ...
```

### 3.3 关键设计原则

1. **每个厂商一个Key池** — 智谱的Key池(`zhipu_api_keys`)、通义的Key池(`ai_configs.providers.qwen.apiKeys`)、混元的账号池(`ai_configs.providers.hunyuan.accounts`)，该厂商下所有模型共用
2. **去掉"单专用Key"概念** — 不再有 `vision.apiKey`、`image.apiKey` 等独立Key，统一走厂商Key池轮换
3. **旧专用Key迁移到Key池** — 首次访问新页面时，`vision.apiKey`、`image.apiKey` 自动并入 `zhipu_api_keys`；`qwen_vl_api_key` 自动并入 `qwen.apiKeys`
4. **运行时读取逻辑改造** — `visionLLMRequest()` 和 `imageGenLLMRequest()` 不再查专用Key，直接从厂商Key池取Key轮换；`getQwenVlKey()` 优先从通义Key池取
5. **导入导出兼容** — 导入旧格式时自动合并专用Key到厂商Key池；导入新格式直接使用
6. **降级链不动** — 降级顺序、模型健康检查、跨厂商降级逻辑完全不变

---

## 四、逐步实施计划

### 第1步：后端 — 新增厂商配置读写层（不破坏现有逻辑）

**文件：`server/routes/ai/providers.js`**

```javascript
// 新增：获取厂商分组视图配置
function getVendorConfigs() {
  try {
    var row = require('../../db').getOne(
      "SELECT value FROM settings WHERE key = 'ai_vendor_configs'"
    );
    if (row && row.value) return JSON.parse(sec.decrypt(row.value));
  } catch (e) {}
  return null; // null 表示旧版本，需从旧数据自动构建
}

// 新增：从旧数据自动构建厂商配置（首次迁移）
function buildVendorConfigsFromLegacy() {
  var aiConfigs = getAIConfigs();
  var zhipuKeys = getZhipuKeys();
  var qwenKeys = getQwenKeys();
  var qwenVlKey = getQwenVlKey();

  return {
    version: 2,
    vendors: {
      zhipu: {
        hasKeys: zhipuKeys.length > 0,
        keyCount: zhipuKeys.length,
        models: {
          text:   (aiConfigs.category && aiConfigs.category.model) || 'glm-4.7-flash',
          vision: (aiConfigs.vision  && aiConfigs.vision.model)   || 'glm-4.6v-flash',
          image:  (aiConfigs.image   && aiConfigs.image.model)    || 'cogview-3-flash'
        }
      },
      qwen: {
        hasKeys: qwenKeys.length > 0 || !!qwenVlKey,
        keyCount: qwenKeys.length,
        hasVlKey: !!qwenVlKey,
        models: {
          text:      'qwen-turbo',
          recognize: (aiConfigs.recognize && aiConfigs.recognize.model) || 'qwen3.6-flash'
        }
      },
      hunyuan: {
        hasAccounts: getHunyuanAccounts().length > 0,
        accountCount: getHunyuanAccounts().length,
        models: { text: 'hunyuan-lite' }
      },
      ollama: {
        model: (aiConfigs.providers && aiConfigs.providers.ollama && aiConfigs.providers.ollama.model) || 'qwen3:8b',
        port:  (aiConfigs.providers && aiConfigs.providers.ollama && aiConfigs.providers.ollama.port)  || '11434'
      }
    }
  };
}

// 新增：保存厂商UI配置（只改模型选择，不改Key）
function saveVendorModels(vendor, modelType, modelId) {
  var vc = getVendorConfigs() || buildVendorConfigsFromLegacy();
  if (!vc.vendors[vendor]) vc.vendors[vendor] = { models: {} };
  if (!vc.vendors[vendor].models) vc.vendors[vendor].models = {};
  vc.vendors[vendor].models[modelType] = modelId;

  // 同步回写旧格式（让降级链、运行时逻辑保持工作）
  var aiConfigs = getAIConfigs();
  var mapping = {
    'zhipu.text':   'category',
    'zhipu.vision': 'vision',
    'zhipu.image':  'image',
    'qwen.recognize': 'recognize'
  };
  var key = vendor + '.' + modelType;
  if (mapping[key]) {
    if (!aiConfigs[mapping[key]]) aiConfigs[mapping[key]] = {};
    aiConfigs[mapping[key]].model = modelId;
    saveAIConfigs(aiConfigs);
  }

  // 保存新格式
  require('../../db').run(
    "INSERT OR REPLACE INTO settings (key, value) VALUES ('ai_vendor_configs', ?)",
    [sec.encrypt(JSON.stringify(vc))]
  );
  require('../../db').scheduleSave();
}
```

**新增API端点：`server/routes/ai/index.js`**

```javascript
// GET /api/ai/vendor-configs — 获取厂商分组配置
router.get('/vendor-configs', function (req, res) {
  var vc = providers.getVendorConfigs();
  if (!vc) vc = providers.buildVendorConfigsFromLegacy();
  // 追加Key状态（脱敏）
  var zhipuKeys = providers.getZhipuKeys();
  var qwenKeys = providers.getQwenKeys();
  var hunyuanAccounts = providers.getHunyuanAccounts();
  vc.vendors.zhipu.keys = zhipuKeys.map(function (e) {
    return { key: providers.maskApiKey(e.key), label: e.label || '' };
  });
  vc.vendors.qwen.keys = qwenKeys.map(function (e) {
    return { key: providers.maskApiKey(e.key), label: e.label || '' };
  });
  vc.vendors.qwen.vlKey = providers.maskApiKey(providers.getQwenVlKey());
  vc.vendors.hunyuan.accounts = hunyuanAccounts.map(function (a) {
    return {
      secretId: providers.maskApiKey(a.secretId),
      secretKey: providers.maskApiKey(a.secretKey),
      label: a.label || ''
    };
  });
  // 工具服务
  vc.tools = {
    imgbb: { /* 从 imgbb_api_key 读取 */ },
    comfyui: { /* 从 comfyui配置读取 */ },
    turso: { /* 从 sync配置读取 */ }
  };
  res.json(vc);
});

// POST /api/ai/vendor-model — 更新厂商模型选择
router.post('/vendor-model', function (req, res) {
  var vendor = req.body.vendor;
  var modelType = req.body.modelType;
  var modelId = req.body.modelId;
  if (!vendor || !modelType || !modelId) {
    return res.status(400).json({ error: '参数不完整' });
  }
  providers.saveVendorModels(vendor, modelType, modelId);
  res.json({ ok: true });
});
```

### 第2步：后端 — 去掉专用Key，统一走厂商Key池

**文件：`server/routes/ai/providers.js`**

**改造1：`getQwenVlKey()` — 优先从通义Key池取**
```javascript
// 修改 getQwenVlKey：优先从 providers.qwen.apiKeys 取，回退到 qwen_vl_api_key，最后回退默认
function getQwenVlKey() {
  // 1. 先从通义千问Key池取
  var qwenKeys = getQwenKeys();
  if (qwenKeys.length) return qwenKeys[0].key;

  // 2. 再查旧VL专用Key（兼容旧数据）
  try {
    var row = require('../../db').getOne(
      "SELECT value FROM settings WHERE key = 'qwen_vl_api_key'"
    );
    if (row && row.value) return sec.decrypt(row.value).trim();
  } catch (e) {}
  return ''; // 用户必须在 API 配置页填写
}
```

**改造2：`visionLLMRequest()` — 去掉专用Key分支，直接走降级链从智谱Key池取**
```javascript
// 改造前：先查 vision 专用 apiKey，有就用，没有才走降级链
// 改造后：直接走 VISION_LLM_CHAIN，从智谱Key池轮换
function visionLLMRequest(apiPath, body) {
  return runLLMChain(VISION_LLM_CHAIN, apiPath, body);
}
```

**改造3：`imageGenLLMRequest()` — 同理，去掉专用Key分支**
```javascript
// 改造前：先查 image 专用 apiKey，有就用，没有才走降级链
// 改造后：直接走 IMAGE_GEN_LLM_CHAIN，从智谱Key池轮换
function imageGenLLMRequest(apiPath, body) {
  return runLLMChain(IMAGE_GEN_LLM_CHAIN, apiPath, body);
}
```

**改造4：首次迁移 — 旧专用Key自动并入Key池**
```javascript
// 新增：启动时或首次访问时，把 vision/image 专用Key合并到 zhipu_api_keys
function migrateDedicatedKeys() {
  var aiConfigs = getAIConfigs();
  var zhipuKeys = getZhipuKeys();
  var changed = false;

  // vision 专用Key → 合并到智谱Key池
  if (aiConfigs.vision && aiConfigs.vision.apiKey) {
    var vk = aiConfigs.vision.apiKey;
    if (!zhipuKeys.some(function(e) { return e.key === vk; })) {
      zhipuKeys.push({ key: vk, label: '旧智能检测Key' });
    }
    delete aiConfigs.vision.apiKey;
    changed = true;
  }

  // image 专用Key → 合并到智谱Key池
  if (aiConfigs.image && aiConfigs.image.apiKey) {
    var ik = aiConfigs.image.apiKey;
    if (!zhipuKeys.some(function(e) { return e.key === ik; })) {
      zhipuKeys.push({ key: ik, label: '旧图片生成Key' });
    }
    delete aiConfigs.image.apiKey;
    changed = true;
  }

  // qwen_vl_api_key → 合并到通义Key池
  try {
    var qwenKeys = getQwenKeys();
    var row = require('../../db').getOne(
      "SELECT value FROM settings WHERE key = 'qwen_vl_api_key'"
    );
    if (row && row.value) {
      var vlKey = sec.decrypt(row.value).trim();
      if (vlKey) {
        if (!qwenKeys.some(function(e) { return e.key === vlKey; })) {
          qwenKeys.push({ key: vlKey, label: '旧VL Key' });
          var cfg = getAIConfigs();
          if (!cfg.providers) cfg.providers = {};
          if (!cfg.providers.qwen) cfg.providers.qwen = {};
          cfg.providers.qwen.apiKeys = qwenKeys;
          saveAIConfigs(cfg);
        }
      }
    }
  } catch(e) {}

  if (changed) {
    saveZhipuKeys(zhipuKeys);
    saveAIConfigs(aiConfigs);
  }
}
```

> **注意**：`migrateDedicatedKeys()` 是幂等操作，重复调用不会重复添加。迁移后旧字段 `vision.apiKey`/`image.apiKey`/`qwen_vl_api_key` 保留在数据库中不删除（兼容旧版本回退），但运行时不再读取。

### 第3步：前端 — 重写配置页面

**文件：`server/public/js/components/page-api-keys.js`**

**核心改动：**

1. `loadConfigs()` 改为调用 `/api/ai/vendor-configs`
2. template 按厂商分组渲染，每个厂商一个卡片，卡片内 = Key管理区 + 模型选择区
3. Key管理操作复用现有API端点（`/api/ai/zhipu-keys`、`/api/ai/qwen-keys`等），每个厂商的Key只在一个地方管理
4. 模型选择调用新端点 `POST /api/ai/vendor-model`
5. **去掉所有"专用Key"相关UI**（vision专用Key按钮、image专用Key按钮、qwen VL独立输入框）

**新template结构骨架：**

```html
<div>
  <!-- 页面标题 + 导入导出按钮（保留）-->

  <!-- ====== 智谱AI 厂商卡片 ====== -->
  <div class="ai-module vendor-card">
    <div class="ai-module-header">
      智谱AI (Zhipu)
      <span class="ai-pfree">免费</span>
      <a href="https://open.bigmodel.cn" target="_blank">官网</a>
    </div>

    <!-- 🔑 统一Key池（所有智谱模型共用） -->
    <div class="vendor-keys">
      <div class="ai-key-list">
        <span v-for="(k, i) in vendors.zhipu.keys" class="ai-key-tag">
          {{ k.key }}<span v-if="k.label" class="ai-key-label-text">[{{ k.label }}]</span>
          <i class="ivu-icon ivu-icon-ios-create ai-key-edit-icon" @click="openEditModal('zhipu', i, k.label)"></i>
          <i class="ivu-icon ivu-icon-ios-close ai-key-del-icon" @click="deleteKey('zhipu', i)"></i>
        </span>
        <i-button type="primary" size="small" @click="openAddModal('zhipu')">
          <icon type="md-add"></icon>添加Key
        </i-button>
      </div>
      <div v-if="!vendors.zhipu.keys.length" class="ai-key-empty">未设置，所有智谱模型将无法使用</div>
    </div>

    <!-- 模型选择 -->
    <div class="vendor-models">
      <div class="model-row">
        <span class="model-type-tag tag-text">📝 文本模型</span>
        <span class="model-func">分类推荐</span>
        <Select v-model="vendors.zhipu.models.text" @on-change="saveModel('zhipu','text',$event)">
          <Option value="glm-4.7-flash">GLM-4.7-Flash（免费）</Option>
          <Option value="glm-4-flash">GLM-4-Flash（免费）</Option>
        </Select>
      </div>
      <div class="model-row">
        <span class="model-type-tag tag-vision">👁️ 视觉模型</span>
        <span class="model-func">智能检测</span>
        <Select v-model="vendors.zhipu.models.vision" @on-change="saveModel('zhipu','vision',$event)">
          <Option value="glm-4.6v-flash">GLM-4.6V-Flash（免费）</Option>
          <Option value="glm-4v-flash">GLM-4V-Flash（免费，旧版）</Option>
        </Select>
      </div>
      <div class="model-row">
        <span class="model-type-tag tag-image">🎨 图像生成</span>
        <span class="model-func">图片生成/编辑</span>
        <Select v-model="vendors.zhipu.models.image" @on-change="saveModel('zhipu','image',$event)">
          <Option value="cogview-3-flash">CogView-3-Flash（免费）</Option>
          <Option value="cogview-4">CogView-4（付费）</Option>
        </Select>
      </div>
    </div>
  </div>

  <!-- ====== 通义千问 厂商卡片 ====== -->
  <div class="ai-module vendor-card">
    <div class="ai-module-header">
      通义千问 (Qwen/阿里云)
      <span class="ai-pfree">免费/付费</span>
      <a href="https://dashscope.console.aliyun.com" target="_blank">控制台</a>
    </div>

    <!-- 🔑 统一Key池（文本+视觉共用） -->
    <div class="vendor-keys">
      <div class="ai-key-list">
        <span v-for="(k, i) in vendors.qwen.keys" class="ai-key-tag">
          {{ k.key }}<span v-if="k.label" class="ai-key-label-text">[{{ k.label }}]</span>
          <i class="ivu-icon ivu-icon-ios-create ai-key-edit-icon" @click="openEditModal('qwen', i, k.label)"></i>
          <i class="ivu-icon ivu-icon-ios-close ai-key-del-icon" @click="deleteKey('qwen', i)"></i>
        </span>
        <i-button type="primary" size="small" @click="openAddModal('qwen')">
          <icon type="md-add"></icon>添加Key
        </i-button>
      </div>
      <div v-if="!vendors.qwen.keys.length" class="ai-key-empty">
        未设置（图片识别将使用内置默认Key）
      </div>
    </div>

    <!-- 模型选择 -->
    <div class="vendor-models">
      <div class="model-row">
        <span class="model-type-tag tag-text">📝 文本模型</span>
        <span class="model-func">分类推荐降级</span>
        <span class="model-hint">qwen-turbo（固定）</span>
      </div>
      <div class="model-row">
        <span class="model-type-tag tag-vision">👁️ 视觉模型</span>
        <span class="model-func">图片识别</span>
        <Select v-model="vendors.qwen.models.recognize" @on-change="saveModel('qwen','recognize',$event)">
          <Option value="qwen3.6-flash">Qwen3.6-Flash（0.5元/百万token）</Option>
          <Option value="qwen3.7-plus">Qwen3.7-Plus（4元/百万token）</Option>
          <Option value="qwen-vl-plus">Qwen-VL-Plus（旧版）</Option>
        </Select>
      </div>
    </div>
  </div>

  <!-- ====== 腾讯混元 厂商卡片 ====== -->
  <div class="ai-module vendor-card">
    <div class="ai-module-header">
      腾讯混元 (Hunyuan/腾讯云)
      <span class="ai-pfree">永久免费</span>
      <a href="https://console.cloud.tencent.com/cam/capi" target="_blank">密钥管理</a>
    </div>

    <!-- 🔑 统一账号池 -->
    <div class="vendor-keys">
      <div class="ai-key-list">
        <span v-for="(a, i) in vendors.hunyuan.accounts" class="ai-key-tag">
          {{ a.secretId }}<span v-if="a.label" class="ai-key-label-text">[{{ a.label }}]</span>
          <i class="ivu-icon ivu-icon-ios-create ai-key-edit-icon" @click="openEditModal('hunyuan', i, a.label)"></i>
          <i class="ivu-icon ivu-icon-ios-close ai-key-del-icon" @click="deleteKey('hunyuan', i)"></i>
        </span>
        <i-button type="primary" size="small" @click="openAddModal('hunyuan')">
          <icon type="md-add"></icon>添加账号
        </i-button>
      </div>
      <div v-if="!vendors.hunyuan.accounts.length" class="ai-key-empty">未设置</div>
    </div>

    <div class="vendor-models">
      <div class="model-row">
        <span class="model-type-tag tag-text">📝 文本模型</span>
        <span class="model-func">分类推荐降级</span>
        <span class="model-hint">hunyuan-lite（永久免费）</span>
      </div>
    </div>
  </div>

  <!-- ====== 本地模型 厂商卡片 ====== -->
  <div class="ai-module vendor-card">
    <div class="ai-module-header">本地模型 (Ollama)</div>
    <div class="vendor-models">
      <div class="model-row">
        <span class="model-type-tag tag-text">📝 文本模型</span>
        <i-input v-model="editData.ollama_model" placeholder="模型名" />
        <i-input v-model="editData.ollama_port" placeholder="端口" />
        <i-button type="primary" size="small" @click="saveOllama()">保存</i-button>
      </div>
    </div>
  </div>

  <!-- ====== 工具服务 ====== -->
  <div class="ai-module tools-card">
    <div class="ai-module-header">🔧 工具服务</div>
    <!-- 图床 ImgBB — 保留原有Key操作 -->
    <div class="tool-row">...</div>
    <!-- ComfyUI — 保留URL+在线状态 -->
    <div class="tool-row">...</div>
    <!-- Turso — 保留URL+Token -->
    <div class="tool-row">...</div>
  </div>

  <!-- 说明区 + Key弹窗（保留） -->
</div>
```
        <Select v-model="vendors.zhipu.models.text">
          <Option value="glm-4.7-flash">GLM-4.7-Flash（免费）</Option>
          <Option value="glm-4-flash">GLM-4-Flash（免费）</Option>
        </Select>
      </div>
      <div class="model-row">
        <span class="model-type-tag tag-vision">👁️ 视觉模型</span>
        <span class="model-func">智能检测</span>
        <Select v-model="vendors.zhipu.models.vision">
          <Option value="glm-4.6v-flash">GLM-4.6V-Flash（免费）</Option>
          <Option value="glm-4v-flash">GLM-4V-Flash（免费，旧版）</Option>
        </Select>
      </div>
      <div class="model-row">
        <span class="model-type-tag tag-image">🎨 图像生成</span>
        <span class="model-func">图片生成/编辑</span>
        <Select v-model="vendors.zhipu.models.image">
          <Option value="cogview-3-flash">CogView-3-Flash（免费）</Option>
          <Option value="cogview-4">CogView-4（付费）</Option>
        </Select>
      </div>
    </div>
  </div>

  <!-- 通义千问 厂商卡片 -->
  <div class="ai-module vendor-card">
    <div class="ai-module-header">
      通义千问 (Qwen/阿里云)
      <span class="ai-pfree">免费/付费</span>
    </div>
    <!-- Key管理（合并文本Key + VL Key） -->
    <div class="vendor-keys">...</div>
    <!-- 模型选择 -->
    <div class="vendor-models">
      <div class="model-row">
        <span class="model-type-tag tag-text">📝 文本模型</span>
        <span class="model-func">分类推荐降级</span>
        <span class="model-hint">qwen-turbo（固定，参与降级链）</span>
      </div>
      <div class="model-row">
        <span class="model-type-tag tag-vision">👁️ 视觉模型</span>
        <span class="model-func">图片识别</span>
        <Select v-model="vendors.qwen.models.recognize">
          <Option value="qwen3.6-flash">Qwen3.6-Flash（0.5元/百万token）</Option>
          <Option value="qwen3.7-plus">Qwen3.7-Plus（4元/百万token）</Option>
          <Option value="qwen-vl-plus">Qwen-VL-Plus（旧版）</Option>
        </Select>
      </div>
    </div>
  </div>

### 第4步：样式调整

**文件：`server/public/css/app.css`**

新增CSS类：

```css
/* 厂商卡片 */
.vendor-card .ai-module-header { /* 厂商标识样式 */ }
.vendor-keys { /* Key管理区 */ }
.vendor-models { /* 模型选择区 */ }
.model-row { /* 每个模型选择行 */ }
.model-row .model-func { /* 功能名（如"分类推荐"） */ }
.model-row .model-select { /* 下拉框 */ }
.model-row .model-hint { /* 不可变模型的说明文字 */ }
.model-chain { /* 降级链说明文字 */ }
.tools-card { /* 工具服务卡片 */ }

/* 模型类型标签 — 用颜色区分三种模型 */
.model-type-tag {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  margin-right: 6px;
  flex-shrink: 0;
}
.model-type-tag.tag-text   { background: #e3f2fd; color: #1565c0; }  /* 📝 蓝色=文本 */
.model-type-tag.tag-vision  { background: #f3e5f5; color: #7b1fa2; }  /* 👁️ 紫色=视觉 */
.model-type-tag.tag-image   { background: #e8f5e9; color: #2e7d32; }  /* 🎨 绿色=图像生成 */

/* 暗色主题适配 */
[data-theme="dark"] .model-type-tag.tag-text   { background: #1a3a5c; color: #64b5f6; }
[data-theme="dark"] .model-type-tag.tag-vision  { background: #3a1a4c; color: #ce93d8; }
[data-theme="dark"] .model-type-tag.tag-image   { background: #1a3c1e; color: #81c784; }
```

### 第5步：导入导出兼容

**文件：`server/routes/settings.js`**

在 `POST /settings-import` 中新增迁移逻辑：

```javascript
// ===== 导入时：旧专用Key合并到厂商Key池 =====
try {
  var aiCfg;
  try { aiCfg = JSON.parse(data['ai_configs'] || '{}'); } catch(e) { aiCfg = {}; }

  // 智谱：vision/image 专用Key → 合并到 zhipu_api_keys
  var zhipuArr;
  try { zhipuArr = JSON.parse(data['zhipu_api_keys'] || '[]'); } catch(e) { zhipuArr = []; }
  // 旧格式兼容：纯字符串 → {key, label}
  zhipuArr = zhipuArr.map(function(e) { return typeof e === 'string' ? {key: e, label: ''} : e; });

  if (aiCfg.vision && aiCfg.vision.apiKey) {
    var vk = aiCfg.vision.apiKey;
    if (!zhipuArr.some(function(e) { return e.key === vk; })) {
      zhipuArr.push({ key: vk, label: '旧智能检测Key' });
    }
    delete aiCfg.vision.apiKey; // 清除专用Key
  }
  if (aiCfg.image && aiCfg.image.apiKey) {
    var ik = aiCfg.image.apiKey;
    if (!zhipuArr.some(function(e) { return e.key === ik; })) {
      zhipuArr.push({ key: ik, label: '旧图片生成Key' });
    }
    delete aiCfg.image.apiKey;
  }
  // 保存合并后的 zhipu_api_keys
  if (zhipuArr.length) {
    run("INSERT OR REPLACE INTO settings (key, value) VALUES ('zhipu_api_keys', ?)",
      [sec.encrypt(JSON.stringify(zhipuArr))]);
  }

  // 通义千问：qwen_vl_api_key → 合并到 ai_configs.providers.qwen.apiKeys
  if (data['qwen_vl_api_key']) {
    var vlKey = String(data['qwen_vl_api_key']).trim();
    if (vlKey) {
      if (!aiCfg.providers) aiCfg.providers = {};
      if (!aiCfg.providers.qwen) aiCfg.providers.qwen = {};
      if (!aiCfg.providers.qwen.apiKeys) aiCfg.providers.qwen.apiKeys = [];
      if (!aiCfg.providers.qwen.apiKeys.some(function(e) { return (e.key||e) === vlKey; })) {
        aiCfg.providers.qwen.apiKeys.push({ key: vlKey, label: '旧VL Key' });
      }
    }
  }

  // 重新保存 ai_configs（已清除专用Key，已合并VL Key）
  var val = JSON.stringify(aiCfg);
  if (sec.isSensitive('ai_configs')) val = sec.encrypt(val);
  run("INSERT OR REPLACE INTO settings (key, value) VALUES ('ai_configs', ?)", [val]);
} catch(e) {
  console.log('[导入迁移] Key合并异常:', e.message);
}

// ===== 如果导入文件包含 ai_vendor_configs（新版本导出） =====
if (data['ai_vendor_configs']) {
  // 已有旧格式迁移逻辑 + Key合并逻辑会处理
  // ai_vendor_configs 直接保存即可
}
  } catch(e) {
    console.log('[导入迁移] ai_vendor_configs 同步异常:', e.message);
  }
}
```

### 第6步：加密敏感Key判定更新

**文件：`server/crypto.js`**

在 `isSensitive()` 中新增 `ai_vendor_configs`：

```javascript
// 在敏感Key列表中添加
var sensitiveKeys = ['zhipu_api_key', 'zhipu_api_keys', 'ai_configs', 'ai_vendor_configs', 'imgbb_api_key', ...];
```

---

## 五、降级链和运行时改造说明

### 不动的部分

| 组件 | 文件位置 | 是否改动 |
|------|---------|---------|
| 降级链定义 | providers.js `CATEGORY_LLM_CHAIN` 等 | ❌ 不改 |
| `runLLMChain()` | providers.js:326 | ❌ 不改 |
| `tryKeys()` Key轮换 | providers.js:387 | ❌ 不改 |
| `getZhipuKeys()` | providers.js:22 | ❌ 不改 |
| `getQwenKeys()` | providers.js:43 | ❌ 不改 |
| `getHunyuanAccounts()` | providers.js:50 | ❌ 不改 |
| `zhipuRequest()` | providers.js:426 | ❌ 不改 |
| `qwenChatRequest()` | providers.js:153 | ❌ 不改 |
| `hunyuanChatRequest()` | providers.js:224 | ❌ 不改 |
| `ollamaChatRequest()` | providers.js:124 | ❌ 不改 |

### 需要改的部分（去掉专用Key分支，统一走Key池）

| 函数 | 改动 | 效果 |
|------|------|------|
| `visionLLMRequest()` | 去掉 `config.apiKey` 分支，直接走 `runLLMChain(VISION_LLM_CHAIN)` | 视觉模型从智谱Key池轮换取Key |
| `imageGenLLMRequest()` | 去掉 `config.apiKey` 分支，直接走 `runLLMChain(IMAGE_GEN_LLM_CHAIN)` | 图像生成从智谱Key池轮换取Key |
| `getQwenVlKey()` | 增加从 `qwen.apiKeys` 优先读取 | VL功能从通义Key池取Key |

---

## 六、数据安全清单

| 检查项 | 说明 | 状态 |
|--------|------|------|
| 旧字段不删除 | `zhipu_api_keys`、`ai_configs`、`qwen_vl_api_key` 全部保留在数据库 | ✅ |
| 旧专用Key自动迁移 | `vision.apiKey`/`image.apiKey` 首次访问时自动并入 `zhipu_api_keys` | ✅ |
| VL Key自动迁移 | `qwen_vl_api_key` 首次访问时自动并入 `qwen.apiKeys` | ✅ |
| 迁移幂等 | `migrateDedicatedKeys()` 重复调用不会重复添加Key | ✅ |
| Key池读取路径不变 | `getZhipuKeys()` → `zhipu_api_keys`，`getQwenKeys()` → `ai_configs.providers.qwen` | ✅ |
| 导入旧格式兼容 | 导入时旧专用Key自动合并到厂商Key池 | ✅ |
| 导出新格式兼容 | 导入时直接使用，无需额外处理 | ✅ |
| 加密一致 | `ai_vendor_configs` 使用同样的 AES-256-GCM 加密 | ✅ |
| Key轮换不受影响 | `runLLMChain` → `tryKeys` 调用链不变 | ✅ |

---

## 七、测试要点

1. **首次访问** — 没有 `ai_vendor_configs` 数据时，页面从旧数据正确构建厂商视图
2. **Key池统一** — 智谱卡片Key区添加1个Key，文本/视觉/图像生成三个模型都能使用
3. **旧专用Key迁移** — 已有 `vision.apiKey` 的用户首次访问，Key自动出现在智谱Key池中
4. **旧VL Key迁移** — 已有 `qwen_vl_api_key` 的用户首次访问，Key自动出现在通义Key池中
5. **Key管理** — 每个厂商卡片都能添加/编辑备注/删除Key
6. **模型选择** — 切换模型后，降级链和运行时正确使用新模型
7. **导入旧设置** — 导入不包含 `ai_vendor_configs` 的JSON，旧专用Key自动合并到Key池
8. **导入新设置** — 导入包含 `ai_vendor_configs` 的JSON，页面正常工作
9. **导出** — 导出的JSON包含所有Key和配置
10. **降级链** — 分类推荐仍然走 GLM → 混元 → 通义 → GLM 的降级顺序
11. **Key轮换** — 多Key限流时仍然自动切换+冷却
12. **暗色/亮色主题** — 新CSS类兼容主题切换

---

## 八、改动文件汇总与工作量估算

| 序号 | 文件 | 改动描述 | 预计行数 |
|------|------|---------|---------|
| 1 | `server/routes/ai/providers.js` | 新增 `getVendorConfigs()`、`buildVendorConfigsFromLegacy()`、`saveVendorModels()`、`migrateDedicatedKeys()`；修改 `visionLLMRequest()`、`imageGenLLMRequest()`、`getQwenVlKey()` | +120行，改3个函数 |
| 2 | `server/routes/ai/index.js` | 新增 `GET /vendor-configs`、`POST /vendor-model` 端点 | +50行 |
| 3 | `server/public/js/components/page-api-keys.js` | 重写template和部分data/methods，按厂商分组，去掉专用Key UI | 重写~400行 |
| 4 | `server/public/css/app.css` | 新增厂商卡片样式+模型类型标签样式 | +50行 |
| 5 | `server/routes/settings.js` | 导入逻辑新增旧专用Key合并到Key池 | +40行 |
| 6 | `server/crypto.js` | `isSensitive` 添加 `ai_vendor_configs` | +1行 |
| 7 | 测试文件 | 新增/更新测试 | — |

**总预估：~660行新增/修改**
