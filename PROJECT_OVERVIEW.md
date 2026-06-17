# 1688 商品采集管理系统 — 项目功能文档

> 生成时间：2026-06-17
> 仓库：https://github.com/LuQuanLong0806/1688-extension

---

## 一、项目定位

一套面向跨境电商（主做 Temu/店小秘）的 **1688 商品数据采集 + 加工 + 一键铺货** 工具，采用：

- **浏览器扩展（Chrome MV3）**：运行在 `detail.1688.com` 与 `www.dianxiaomi.com` 页面内，负责抓取商品、自动填表、图片加工。
- **本地服务端（Node.js + Express + SQLite）**：数据存储、AI 图像/分类处理、多用户管理与权限、云端同步。

扩展与服务端默认通过 `http://localhost:3000` 通信，扩展通过 `background.js` 自动从服务端 cookie 取 token 完成免登。

---

## 二、整体架构

```
┌──────────────────────────────────────────────────────────────┐
│                       浏览器扩展 (sites/)                       │
│  ┌─────────────────────┐      ┌────────────────────────────┐  │
│  │  1688 采集脚本        │      │  店小秘铺货脚本（小蜜蜂）     │  │
│  │  grab/collect/float  │      │  auto-fill/clean/paste/... │  │
│  └──────────┬──────────┘      └─────────────┬──────────────┘  │
│             │           background.js(消息/cookie中转)         │
└─────────────┼────────────────────────────────┼───────────────┘
              │ fetch + JWT                     │
              ▼                                 ▼
┌──────────────────────────────────────────────────────────────┐
│                 本地服务端 (server/) :3000                     │
│  Express + Helmet + CORS + RateLimit + JWT(auth.js)           │
│  ┌────────────┬────────────┬──────────┬───────────────────┐   │
│  │ products   │ categories │ users    │ ai (图/文/分类)      │   │
│  │ routes     │ routes     │ routes   │ routes             │   │
│  └────────────┴────────────┴──────────┴───────────────────┘   │
│  services: 图片处理流水线 / 抠图 / 去中文 / 尺寸标注 / 自动化      │
│  ┌────────────────────────────────────┐                       │
│  │  SQLite (db.js)  +  Turso 云端      │ (cloud/)             │
│  └────────────────────────────────────┘                       │
└──────────────────────────────────────────────────────────────┘
```

---

## 三、目录结构

```
1688-extension/
├── sites/                      # 浏览器扩展源码（构建前）
│   ├── manifest.json           # MV3 清单
│   ├── background.js           # 后台：cookie 取 token、扩展热重载
│   ├── build.js / watch.js     # 打包到 1688-extension/
│   ├── 1688/                   # 注入 detail.1688.com
│   │   ├── grab-core.js        # 主图/详情图/SKU图/属性抓取核心
│   │   ├── collect-data.js     # 采集并上传到服务器
│   │   └── float-btn.js        # 浮动「采集」按钮 + 采集面板
│   └── dianxiaomi/             # 注入店小秘编辑页（小蜜蜂工具条）
│       ├── dxm-float-bee.js    # 悬浮工具条（翻译/贴图/去中文/SKU/拼图…）
│       ├── dxm-config*.js      # 配置 UI + 配置存取
│       ├── dxm-auto-fill.js    # 一键自动填表（店铺/类目/标题/图/SKU/描述）
│       ├── dxm-auto-clean.js   # 贴图前自动去中文
│       ├── dxm-paste-img.js    # 批量贴图 URL
│       ├── dxm-sku.js / dxm-sku-table.js  # SKU 规格表填充/过滤
│       ├── dxm-edit-desc.js    # 描述编辑
│       ├── dxm-collage.*       # 拼图工具页
│       ├── dxm-text-cleaner.*  # 去中文测试页
│       └── dxm-image-editor.js # 图床编辑器增强
├── 1688-extension/             # build 产物（可直接加载为扩展）
├── server/                     # 本地服务端
│   ├── server.js               # 入口，路由装配 + 公共端点
│   ├── db.js                   # SQLite 初始化 + 增删改查 + 定时落盘
│   ├── crypto.js               # AES 加解密（密钥/Token）
│   ├── middleware/
│   │   ├── auth.js             # JWT + 角色权限（viewer/operator/admin）
│   │   └── upload-limits.js    # 上传大小/频率限制
│   ├── routes/
│   │   ├── products.js         # 商品 CRUD + 批量 + 自动化触发
│   │   ├── categories.js       # 分类映射/关键词/同义词/黑名单
│   │   ├── dxm-tree.js         # 店小秘分类树同步与查询
│   │   ├── settings.js         # 系统设置 + 清空信号 + SSE 事件
│   │   ├── sync.js             # 云端（Turso）同步/推/拉
│   │   ├── upload-config.js    # 图床上传配置
│   │   ├── users.js            # 用户/登录/资料/头像
│   │   └── ai/                 # AI 能力路由
│   │       ├── index.js        # 路由聚合 + 密钥管理端点
│   │       ├── providers.js    # 多厂商（智谱/通义/混元）多 Key 轮换
│   │       ├── image-gen.js    # 文生图/图生图/白底/增强/上传图床
│   │       ├── image-edit.js   # 抠图/换背景/去中文/尺寸标注/检测
│   │       └── category-recommend.js  # AI 分类推荐
│   ├── services/               # 业务处理
│   │   ├── automation-pipeline.js  # 7 步自动化流水线（核心）
│   │   ├── image-prefilter.js      # sharp 预筛 + dhash 去重
│   │   ├── remove-bg.js            # ISNet ONNX 抠图
│   │   ├── replace-bg-composite.js # 抠图 + 合成新背景
│   │   ├── text-cleaner.js         # OCR 检测中文 + LaMa 修复
│   │   ├── comfyui-inpaint.js      # ComfyUI 高质量修复（替代 LaMa）
│   │   ├── size-annotate.js        # OCR 提尺寸 + 生成标注图
│   │   ├── ocr_service.py          # PaddleOCR 服务（:3001）
│   │   ├── imgbb-upload.js / oss-upload.js  # 图床上传
│   │   ├── upload-transform.js     # 上传前压缩/转换
│   │   └── cleanup.js              # 临时文件清理
│   ├── cloud/                  # 云同步（Turso libSQL）
│   │   ├── index.js            # 连接/配置/基础操作
│   │   ├── knowledge.js        # 知识库（分类映射等）本地优先读写
│   │   └── sync.js             # 表级/商品级 同步、推、拉
│   ├── models/                 # ONNX 模型
│   │   ├── isnet_fp16.onnx     # 抠图（约 88MB）
│   │   └── lama.onnx           # 修复（约 92MB）
│   ├── public/                 # 管理后台前端（Vue + iView）
│   │   ├── index.html          # 主后台
│   │   ├── login.html          # 登录页
│   │   └── css/                # 主题（1688 / JD / fresh）
│   ├── data/ db                # 数据文件 data.db / dxm_tree.db
│   └── __tests__ / e2e(根目录)  # Jest 单测 + Playwright E2E
├── docs/                       # 设计/审计/部署文档
├── e2e/                        # Playwright 测试
└── package.json                # 顶层：build/watch/test/test:e2e
```

---

## 四、浏览器扩展功能（sites/）

### 4.1 1688 采集（注入 detail.1688.com）

| 模块 | 功能 |
|------|------|
| `grab-core.js` | 抓取主图/详情图/SKU 图/属性/SKU 规格；过滤图标占位图（SKIP_PATTERNS）；多选择器兼容 |
| `collect-data.js` | 与服务端对接：获取/缓存 token、提交商品数据；查重、覆盖确认 |
| `float-btn.js` | 浮动「采集」按钮 + 面板；滚动加载全部图；采集进度气泡；重复采集确认 |

### 4.2 店小秘「小蜜蜂」工具条（注入店小秘编辑页）

工作流按钮（`dxm-float-bee.js`），可顺序执行：

| 按钮 | 说明 |
|------|------|
| 翻译 | 一键翻译并优化标题（AI） |
| 删图 | 一键清空图片+视频 |
| 贴图 | 批量粘贴采集图片 URL（`dxm-paste-img.js`） |
| 去中文 | 一键去除图片中的中文文字（`dxm-auto-clean.js`） |
| SKU | 一键 SKU 过滤/填充（`dxm-sku.js` + `dxm-sku-table.js`） |
| 描述 | 一键编辑描述（`dxm-edit-desc.js`） |
| 拼图 | 图片拼图工具（`dxm-collage.js`） |

其它：
- `dxm-auto-fill.js`：通过 URL 上的 `collectId` 拉取已采集数据，自动完成 **店铺选择 → 类目选择 → 标题填写 → 主图/详情图上传 → SKU 规格表 → 描述** 全流程。
- `dxm-config-ui.js` / `dxm-config.js`：配置面板，控制按钮显隐、服务端地址等。
- `dxm-image-editor.js`：在店小秘图床编辑器内增强工具条。

### 4.3 扩展机制

- `manifest.json`（MV3）：权限 `activeTab/scripting/storage/cookies`。
- `background.js`：`getToken`（用服务端 cookie 换 JWT）、扩展版本检测（`/api/extension-version`）实现热重载。
- `build.js`：打包时间戳写入 `build-info.js`，复制到 `1688-extension/`。

---

## 五、服务端功能（server/）

### 5.1 公共能力

- 端口 `3000`；`helmet` + `cors`（允许任意 origin，安全靠 `auth.js`）+ 全局限流 120/min、登录限流 5/min。
- JWT 鉴权（`middleware/auth.js`），白名单：`/api/login`、`/api/plugin-login`、`/api/events`、`/api/proxy-image` 等。
- 角色三档：`viewer`（只读）/ `operator`（可写）/ `admin`（密钥/用户/同步等）。
- SSE 实时事件 `/api/events`：采集进度、自动化流水线进度广播。
- 静态托管 `public/`（管理后台）、`/dev/sites`（开发态扩展文件）、`/avatars`、`/uploads`。
- 扩展版本接口 `/api/extension-version`（站点文件 md5，用于热重载）。
- 特殊页面：`/collage`（拼图）、`/text-cleaner`（去中文测试）。
- 图片中转/上传：`/api/proxy-image`、`/api/upload-image`。

### 5.2 商品管理（routes/products.js）

| 端点 | 功能 |
|------|------|
| `POST /api/product` | 新增采集商品（operator） |
| `GET /api/product` / `:id` | 列表 / 详情 |
| `PUT /api/product/:id` | 更新 |
| `DELETE /api/product/:id` / `POST /api/product/batch-delete` | 删除 / 批量删除 |
| `GET /api/product/check` | 按 source_url 查重 |
| `GET /api/product/trend\|stats\|categories\|dxm-categories` | 趋势/统计/分类聚合 |
| `POST /api/product/:id/recommend-category` | AI 分类推荐 |
| `POST /api/product/batch-status` | 批量改状态 |
| `POST /api/products/claim` / `assign` | 认领 / 分配（多用户） |
| `POST /api/product/batch-automate` / `batch-stage` / `:uid/stage` | 触发自动化流水线 / 推进阶段 |
| `GET /api/product/automate-status` | 自动化队列状态 |
| `PATCH /api/products/backfill-path` | 回填路径 |

### 5.3 分类与知识库（routes/categories.js, dxm-tree.js）

- 分类映射 `category-mappings`：1688 类目 ↔ 店小秘自定义类目，按命中次数排序。
- 关键词关系 `keyword-rels`：关键词→类目自动匹配；支持重建、批量作废。
- 同义词 `keyword-synonyms`、黑名单 `keyword-blacklist`、分类配置 `category-config`。
- 店小秘分类树 `dxm_category_tree`：`/api/dxm-tree/sync`（admin）同步，`children/search/resolve-path` 查询。

### 5.4 AI 能力（routes/ai/）

#### 多厂商接入（providers.js）
- 支持：**智谱 GLM**、**通义千问 Qwen**、**腾讯混元**，多 Key 池 + 轮换 + 降级。
- 密钥经 `crypto.js` AES 加密存于 `settings` 表。
- 端点：`/api/ai/save-key`、`zhipu-keys`、`qwen-keys`、`hunyuan-keys`、`vendor-model`、`dispatch-order`、`vendor-configs` 等（admin）。

#### 图像生成（image-gen.js）
- `POST /api/ai/text-to-image` 文生图
- `POST /api/ai/image-to-image` 图生图
- `POST /api/ai/white-bg` 白底图
- `POST /api/ai/enhance` 画质增强
- `POST /api/ai/image-upload` / `smms-upload` 上传图床（经 `upload-limits` 预检）
- 图床配置：`smms-token`、`oss-config`（阿里云 OSS）

#### 图像编辑（image-edit.js）
- `POST /api/ai/inpaint` / `smart-detect` 局部修复/智能检测
- `POST /api/ai/remove-bg` / `remove-bg-local` 抠图（ISNet ONNX 或 ComfyUI）
- `POST /api/ai/replace-bg` 换背景（抠图 + 合成）
- `POST /api/ai/detect-text` / `auto-clean-chinese` / `batch-clean-chinese` / `batch-clean` 去中文
- `POST /api/ai/detect-sizes` / `annotate-image` 尺寸检测与标注
- `POST /api/ai/recognize-image` 图片识别
- `POST /api/ai/prepare-main-image` / `img2img` / `img2img-auto` / `scene-inpaint` 场景图
- 状态查询：`model-status`、`ocr-status`、`comfyui-status`

#### 分类推荐（category-recommend.js）
- `POST /api/ai/suggest-category` AI 推荐类目
- `POST /api/ai/save-category-mapping` 保存映射

#### ComfyUI 集成
- `comfyui-status`、`comfyui-config`、`comfyui-models`：通过 `/prompt`+`/history`+`/view` 调用，支持账号密码换 Token（4h，到期自动刷新）。

### 5.5 自动化流水线（services/automation-pipeline.js）★核心

商品级 **7 步自动加工流水线**，通过队列串行执行，SSE 实时广播进度：

1. **智能筛选**：本地预筛（尺寸/比例/去重，`image-prefilter.js`）→ AI 批量精选（GLM-4.6v-flash 多图一次调用，选 ~8 张）
2. **图片处理**：去水印去中文 + 白底图（含选中 SKU 图）
3. **尺寸标注**：OCR 检测尺寸并标注（`size-annotate.js`）
4. **分类推荐**：文本通道 + 视觉通道双路交叉验证
5. **标题优化**：AI 去堆砌优化
6. **数据诊断**：完整性检查，标记问题
7. **上传图床**：全部成功后一次性上传 ImgBB，替换原图/SKU 图 URL

机制要点：
- **SKU 门控**：选中 SKU > 6 个 → 跳过不处理，状态置 `不可用`
- **状态机** `automation_stage`：`none → processing → draft → ready → published`（失败 `failed`，可重试 `none`），严格校验转换合法性
- **重试**：`retryWrapper` 处理瞬时错误；`recoverStaleJobs` 恢复卡住任务
- 成功 → `draft`（草稿待人工审核），失败 → `none`（可重跑）

### 5.6 多用户与权限（routes/users.js）

- `POST /api/login`、`/api/plugin-login`（扩展专用，cookie 换 token）
- `GET /api/me`、`PUT /api/me/profile`、`POST /api/me/avatar`、`POST /api/change-password`
- 用户管理（admin）：`GET/POST/PUT/DELETE /api/users`、`/api/users/:id/enable`
- 用户字段：`username / password_hash / role / disabled / token_invalid_at / avatar_url / email` 等。

### 5.7 系统设置与同步（routes/settings.js, sync.js）

- `GET/PUT /api/settings`、`/api/settings/:key`、`settings-export/import`（admin）
- `clear-signal`：清空信号（触发前端数据清理）
- 云端（Turso libSQL）：`/api/sync/config|test|init|sync|push|pull|status`，表级/商品级/分类树级同步（`cloud/sync.js`），知识库本地优先读取低延迟。

### 5.8 数据库（db.js）

主要表：

- `products`：采集商品（主图/详情图/SKU/属性/类目/自动化状态/归属 owner/认领 claim_at 等）
- `users`：用户与角色
- `settings`：系统配置（密钥/图床/JWT secret/同步配置，KV）
- `categories` / `dxm_categories` / `category_mappings` / `keyword_category_rel` / `keyword_synonyms` / `keyword_blacklist` / `category_config`
- `dxm_category_tree`（独立 `dxm_tree.db`）：店小秘分类树

`scheduleSave` 定时落盘，支持多备份（`data.db.bak.*`）。

---

## 六、管理后台（server/public/）

- Vue + iView（view-design）单页应用。
- 多主题：`theme-1688 / theme-jd / theme-fresh`，可切换。
- 功能：商品列表与详情、采集统计、分类映射与知识库管理、用户与角色、AI 密钥与图床配置、云同步配置、自动化流水线监控。

---

## 七、测试与构建

| 命令 | 说明 |
|------|------|
| `npm run build` | 打包扩展到 `1688-extension/`（`sites/build.js`） |
| `npm run watch` | 扩展源码监听（`sites/watch.js`） |
| `npm test` | Jest 单元测试 |
| `npm run test:e2e` | Playwright E2E（`e2e/`：auth/categories/products/settings/multi-user/ui-navigation） |

- `server/` 独立依赖：`express / sharp / onnxruntime-node / @libsql/client / @imgly/background-removal / sql.js`，构建 `server/build.js`（html/terser 压缩）。
- Python 侧：`ocr_service.py`（PaddleOCR，端口 3001），`requirements.txt`。

---

## 八、典型业务流程

```
1688 商品页
   │（扩展 float-btn）采集
   ▼
本地服务端 products 表  ──► 管理后台查看/编辑
   │（可选）触发 batch-automate
   ▼
7 步自动化流水线：筛选→处理→标注→分类→标题→诊断→上图床
   │ stage: draft（待审核）
   ▼
打开店小秘编辑页（带 collectId）
   │（扩展 小蜜蜂）自动填表 / 一键贴图/去中文/SKU/拼图
   ▼
人工校对 → 发布
```

---

## 九、安全要点

- JWT 鉴权 + 三级角色；密钥/Token AES 加密入库。
- CORS 故意放开（扩展需跨域），安全依赖 `auth.js` 角色控制（源码注释明确记录了历史教训）。
- 登录限流 5/min、全局限流 120/min。
- 上传经 `upload-limits.js` 预检与转换。
- 建议生产环境通过反向代理 + 网络层 ACL 收紧暴露面。

---

## 十、关键文档索引（docs/）

- `api-catalog-2026-06-14.md`：API 目录
- `IMAGE_PIPELINE_PLAN.md`：图像流水线设计
- `ADMIN_SYSTEM.md`：管理后台
- `multi-user-*.md`：多用户方案与审计
- `deployment-*-frp-*.md`：frp 内网穿透部署
- `security-fix-report-*.md`：安全修复
- `智谱AI图片编辑器-可行性技术文档.md`：AI 编辑器可行性