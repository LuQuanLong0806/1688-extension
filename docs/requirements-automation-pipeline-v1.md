# 需求文档：商品自动化处理流水线 v1.0

> 创建时间：2026-06-08 18:00
> 项目分支：feature/detail-page-dxm-align

---

## 一、总体概述

实现从 1688 采集商品到"上架就绪"的自动化流水线。核心流程：

```
1688采集商品 → 商品管理页选中 → 点击"批量自动化" → 后台Pipeline处理
    → 处理完成进入"草稿箱" → 人工确认/修改 → 移入"待发布" → 后续定时发布
```

---

## 二、自动化阶段设计

### 2.1 阶段枚举（automation_stage）

| 值 | 名称 | 说明 | 可见页面 |
|----|------|------|----------|
| `none` | 未处理 | 采集后的初始状态 | 商品管理 |
| `processing` | 处理中 | 自动化Pipeline正在执行 | 商品管理（进度指示） |
| `draft` | 草稿箱 | 自动化完成，等待人工审核 | 草稿箱页 |
| `ready` | 待发布 | 人工确认，准备发布 | 待发布页 |
| `published` | 已发布 | 已上架 | 商品管理（status=1） |
| `failed` | 处理失败 | 自动化出错，需人工介入 | 商品管理 |

### 2.2 阶段与现有 status 字段的关系

现有 `status` 字段（0=未发布, 1=已发布）保持不变，用于最终发布状态。
新增 `automation_stage` 字段独立跟踪自动化进度。

关系：
- `stage=none` → `status=0`（未发布）
- `stage=processing` → `status=0`
- `stage=draft` → `status=0`
- `stage=ready` → `status=0`
- `stage=published` → `status=1`
- `stage=failed` → `status=0`

**不改变现有 status 语义**，`automation_stage` 是正交维度。

---

## 三、自动化Pipeline流程

### 3.1 触发条件

- 商品管理页，用户勾选多个**未处理（stage=none, status=0）**商品
- 点击"批量自动化"按钮
- SKU 列表超过 6 个的商品自动跳过（不处理），返回跳过原因

### 3.2 图片处理规则

**只处理已选中的图片**（main_images 中用户手动选定的子集）。
如果用户没有手动选择图片，默认处理全部 main_images。

### 3.3 处理步骤（串行执行，每个商品独立）

```
Step 1: 质量检测（GLM-4V-Flash）
  → 检测模糊、水印、违规内容
  → 记录检测结果到 automation_log

Step 2: 去水印/去中文（LaMa）
  → 对检测到水印/文字的区域进行 inpaint
  → 更新处理后的图片

Step 3: 白底图生成（ISNet 抠图 + CogView-3-Flash / ComfyUI）
  → 先用 ISNet 抠图去掉原背景
  → 再用 CogView-3-Flash（免费）生成白底商品图
  → 抠图失败时降级到 ComfyUI Rembg
  → 更新处理后的图片

Step 4: 尺寸标注（PaddleOCR + SVG）— 可选步骤
  → OCR 提取图片中尺寸信息
  → 只标注能识别到尺寸的图片，**不知道尺寸的不标**
  → **一个产品只要标注1张尺寸图即可**，多图时标注第一张能识别的
  → 标注完成后生成带尺寸标注的 SVG 图
  → 记录标注结果到 automation_log（标注了几张，跳过了几张）
  → 如果所有图片都未识别到尺寸，记录警告但不影响 stage

Step 5: 分类推荐（GLM-4.7-Flash）
  → AI 自动推荐商品分类
  → 填充 custom_category / dxm_category

Step 6: 图片上传（ImgBB）
  → 处理后的图片上传到 ImgBB
  → 按日期自动建相册
  → 更新 main_images 为 ImgBB URL

Step 7: 数据诊断 & 标记完成
  → 扫描处理结果，生成问题列表写入 automation_issues
  → stage 更新为 'draft'
  → automation_log 记录完整处理日志
```

### 3.4 错误处理

- 单个步骤失败 → 记录错误到 automation_log → 跳过该步骤 → 继续后续步骤
- 所有步骤完成后仍有效果的 → stage 设为 `draft`（部分成功）
- 完全失败（第一步就挂） → stage 设为 `failed`

### 3.5 尺寸标注规则补充

- **可选步骤**：尺寸标注不是必须的，识别不到就不标
- **只标1张**：一个产品最多标注1张尺寸图，标注第一张能识别到尺寸的
- **识别不到 = 不标**：如果 OCR 未从任何图片中提取到尺寸信息，在 automation_issues 中记录 `"no_size_detected": true` 警告
- **标注 = 有尺寸信息就标**：只要 OCR 能从图片中提取到尺寸字符串（如 "60×90cm"），就标注该图
- **不影响流程**：尺寸标注失败或未识别不影响后续步骤，产品仍正常进入草稿箱

---

## 四、数据库变更

### 4.1 products 表新增字段

```sql
ALTER TABLE products ADD COLUMN automation_stage TEXT DEFAULT 'none';
ALTER TABLE products ADD COLUMN automation_log TEXT DEFAULT '';
ALTER TABLE products ADD COLUMN automation_issues TEXT DEFAULT '';
ALTER TABLE products ADD COLUMN automation_started_at DATETIME;
ALTER TABLE products ADD COLUMN automation_finished_at DATETIME;
```

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `automation_stage` | TEXT | `'none'` | 自动化阶段：none/processing/draft/ready/published/failed |
| `automation_log` | TEXT | `''` | JSON格式处理日志，每个步骤的结果 |
| `automation_issues` | TEXT | `''` | JSON数组，数据诊断问题列表 |
| `automation_started_at` | DATETIME | NULL | 自动化开始时间 |
| `automation_finished_at` | DATETIME | NULL | 自动化完成时间 |

### 4.2 自动化日志格式（automation_log）

```json
{
  "steps": [
    { "name": "quality_check", "status": "ok", "duration": 2300, "result": { "issues": [], "quality_score": 92 } },
    { "name": "clean_watermark", "status": "ok", "duration": 3200, "result": { "cleaned": 2, "skipped": 1 } },
    { "name": "white_bg", "status": "ok", "duration": 5000, "result": { "generated": 3, "failed": 0 } },
    { "name": "size_annotate", "status": "ok", "duration": 1500, "result": { "annotated": 1, "no_size": 2 }, "skippable": true },
    { "name": "category_recommend", "status": "ok", "duration": 1800, "result": { "category": "杯子", "confidence": 0.85 } },
    { "name": "upload_imgbb", "status": "ok", "duration": 4000, "result": { "uploaded": 3, "album": "2026-06-08" } }
  ],
  "totalDuration": 17800,
  "startedAt": "2026-06-08T18:00:00",
  "finishedAt": "2026-06-08T18:00:18"
}
```

### 4.3 云端同步

- `automation_stage`、`automation_log`、`automation_issues`、`automation_started_at`、`automation_finished_at` 五个字段需要同步到 Turso 云端
- PUT /api/product/:id 更新时，如果这五个字段有变化，同步更新云端
- `cloudDb.cloudRun` 更新云端 products 表（新增5列，与本地同步）
- `saveProductToLocalAndCloud` 创建商品时，五个字段默认值同时写入云端

---

## 五、API 设计

### 5.1 新增接口

#### `POST /api/product/batch-automate`
批量启动自动化处理

请求：
```json
{
  "uids": ["uid1", "uid2", "uid3"]
}
```

响应：
```json
{
  "ok": true,
  "total": 3,
  "started": 2,
  "skipped": [
    { "uid": "uid3", "reason": "SKU超过6个，跳过自动化" },
    { "uid": "uid4", "reason": "已在处理中或已完成" }
  ]
}
```

#### `GET /api/product/automate-status?uid=xxx`
查询单个商品的自动化进度（SSE 或轮询）

响应：
```json
{
  "stage": "processing",
  "log": { "steps": [...], "currentStep": 3 },
  "startedAt": "...",
  "elapsed": 8500
}
```

#### `POST /api/product/:uid/stage`
手动更新自动化阶段（草稿箱→待发布 等）

请求：
```json
{
  "stage": "ready",
  "reason": "人工确认通过"
}
```

#### `GET /api/product?stage=draft`
支持按自动化阶段筛选商品列表（现有 GET /api/product 扩展）

新增查询参数：`stage`

#### `POST /api/product/batch-stage`
批量更新阶段

请求：
```json
{
  "uids": ["uid1", "uid2"],
  "stage": "ready"
}
```

### 5.2 修改现有接口

#### `GET /api/product` — 新增 stage 筛选
- 新增 `stage` 查询参数
- 返回字段新增 `automationStage`、`automationStartedAt`

#### `PUT /api/product/:id` — 新增5个可更新字段
- `automationStage` → `automation_stage`
- `automationLog` → `automation_log`
- `automationIssues` → `automation_issues`
- `automationStartedAt` → `automation_started_at`
- `automationFinishedAt` → `automation_finished_at`

#### `POST /api/product` — 创建时写入默认值
- `automation_stage = 'none'`

---

## 六、前端页面设计

### 6.1 侧边栏菜单调整

现有菜单：
1. 商品管理 (`page-products`)
2. 小秘美图 (`page-meitu`)
3. 数据看板 (`page-dashboard`)
4. API 设置 (`page-api-keys`)
5. 词汇库 (`page-word-library`)
6. 云同步 (`page-cloud-sync`)

新增：
1. 商品管理（保持）
2. **📦 草稿箱** (`page-drafts`) ← 新增
3. **🚀 待发布** (`page-publish-queue`) ← 新增
4. 小秘美图（保持）
5. 数据看板（保持）
6. API 设置（保持）
7. 词汇库（保持）
8. 云同步（保持）

### 6.2 商品管理页改动

#### 批量操作栏新增"批量自动化"按钮

位置：批量删除按钮旁边

```
[ 批量删除 ] [ 🔄 批量自动化 ] [ 刷新 ]
```

- 仅当选中项中包含 stage=none 的商品时可用
- 点击后弹出确认对话框，显示：
  - 将处理 N 个商品
  - 跳过 M 个（SKU超6个 / 已处理 / 已发布）
  - 确认 / 取消

#### 列表新增"自动化阶段"列

位置：状态列之后、预览列之前

显示：
- `none` → 灰色文字"未处理"
- `processing` → 蓝色动画旋转图标 + "处理中"
- `draft` → 绿色标签"草稿箱"
- `ready` → 橙色标签"待发布"
- `failed` → 红色标签"失败"（hover 显示错误信息）
- `published` → 无显示（已发布的已在 status 列标绿）

#### 处理中进度指示

- 商品行右上角显示小进度条或旋转图标
- SSE 实时更新（复用现有 SSE 机制）
- 处理完成后自动刷新该行

### 6.3 草稿箱页面（page-drafts）

```
┌─────────────────────────────────────────────────┐
│ 📦 草稿箱                        共 N 个商品     │
├─────────────────────────────────────────────────┤
│ [搜索框]  [全选]  [批量移入待发布]  [批量退回未处理] │
├─────────────────────────────────────────────────┤
│ ☐ [图] 商品标题          分类    SKU  处理时间  操作│
│ ☐ [图] 商品A             杯子    3个  18:00    [详情][查看日志][退回]│
│ ☐ [图] 商品B             餐具    2个  18:01    [详情][查看日志][退回]│
└─────────────────────────────────────────────────┘
```

核心功能：
- 只展示 `stage = 'draft'` 的商品
- "批量移入待发布" → 仅无问题商品可操作（有问题的需先确认）
- "批量退回未处理" → `stage` 更新为 `none`（重新处理）
- 单品操作：查看详情 / 查看处理日志 / 退回 / 移入待发布
- 详情弹窗可编辑（修改标题、分类、图片等）

#### 数据诊断列

每条商品行右侧新增"问题诊断"列，实时显示当前数据缺失/异常情况：

```
├──────────────────────────────────────────────────────────────────────┤
│ ☐ [图] 商品标题          分类   问题诊断              操作         │
│ ☐ [图] 商品A             杯子   ⚠️ 未标注尺寸          [详情][退回]  │
│ ☐ [图] 商品B             餐具   ✅ 无问题              [详情][移入]  │
│ ☐ [图] 商品C             —     ⚠️ 未分类 · 未标注尺寸   [详情][退回]  │
│ ☐ [图] 商品D             箱包   ❌ 白底图生成失败        [详情][退回]  │
│ ☐ [图] 商品E             —     ⚠️ 去水印失败 · 未分类   [详情][退回]  │
└──────────────────────────────────────────────────────────────────────┘
```

**诊断规则**（`automation_issues` JSON 数组，每个元素一个问题）：

| 问题标识 | 严重级别 | 说明 | 显示 |
|----------|---------|------|------|
| `no_size_detected` | ⚠️ 警告 | 所有图片均未识别到尺寸 | "未标注尺寸" |
| `no_category` | ⚠️ 警告 | 分类推荐未成功，custom_category 为空 | "未分类" |
| `no_white_bg` | ⚠️ 警告 | 白底图生成全部失败 | "白底图失败" |
| `clean_failed` | ⚠️ 警告 | 去水印失败 | "去水印失败" |
| `quality_low` | ⚠️ 警告 | 图片质量评分低于阈值 | "图片质量低" |
| `upload_partial` | ⚠️ 警告 | 部分图片上传 ImgBB 失败 | "图片上传不完整" |
| `ocr_error` | ❌ 错误 | OCR 服务不可用 | "OCR服务异常" |
| `pipeline_error` | ❌ 错误 | Pipeline 整体异常 | "处理异常" |

**显示规则**：
- 无问题 → 绿色 ✅ "无问题"
- 仅警告（⚠️） → 橙色标签，可移入待发布（用户确认后继续）
- 有错误（❌） → 红色标签，建议退回重新处理
- 多个问题用 · 分隔："⚠️ 未分类 · 未标注尺寸"

#### `automation_issues` 数据结构

```json
[
  { "code": "no_size_detected", "level": "warning", "message": "所有图片均未识别到尺寸" },
  { "code": "no_category", "level": "warning", "message": "分类推荐未成功" }
]
```

空数组 `[]` = 无问题。

### 6.4 待发布页面（page-publish-queue）

```
┌─────────────────────────────────────────────────┐
│ 🚀 待发布                        共 N 个商品     │
├─────────────────────────────────────────────────┤
│ [搜索框]  [全选]  [批量发布]  [批量退回草稿箱]      │
├─────────────────────────────────────────────────┤
│ ☐ [图] 商品标题          分类    SKU  处理时间  操作│
│ ☐ [图] 商品A             杯子    3个  18:00    [详情][退回草稿箱]│
└─────────────────────────────────────────────────┘
```

核心功能：
- 只展示 `stage = 'ready'` 的商品
- "批量发布" → `status` 更新为 `1`，`stage` 更新为 `published`（定时发布留后续）
- "批量退回草稿箱" → `stage` 回退为 `draft`
- 支持排序：按处理完成时间、分类等

---

## 七、自动化处理服务（后端核心）

### 7.1 文件：`server/services/automation-pipeline.js`

```javascript
// 核心函数
async function processProduct(uid) → { stage, log, images, category }
async function runPipeline(uids) → { started, skipped, results }
```

### 7.2 处理队列设计

- 使用内存队列（`automationQueue`），无需 Redis
- 串行处理（一次只处理一个商品，避免 API 限流）
- 队列状态：`idle | running | uid`
- 每个商品处理完成后通过 SSE 广播进度

### 7.3 并发控制

- 同时只处理 1 个商品（避免 API 限流压力过大）
- 多 Key 轮换已有机制，Pipeline 直接调用现有函数即可
- 处理间隔：每完成一个商品后延迟 500ms，降低限流风险

### 7.4 每个步骤的实现复用

| 步骤 | 复用现有模块 | 调用方式 |
|------|-------------|----------|
| 质量检测 | `providers.visionLLMRequest` | 直接调用 |
| 去水印 | `text-cleaner.js cleanImage` | 直接调用 |
| 白底图 | `remove-bg.js` + ComfyUI Rembg | 直接调用 |
| 尺寸标注 | `ocr_service.py` + `size-annotate.js` | HTTP localhost:3001 + 直接调用 |
| 分类推荐 | `category-recommend.js` | 直接调用 |
| 图片上传 | `imgbb-upload.js` | 直接调用 |

---

## 八、单元测试计划

### 8.1 后端测试

1. **DB Schema 测试**：新增5个字段自动补列（含 automation_issues）
2. **stage 状态机测试**：none → processing → draft → ready → published，非法转换拦截
3. **batch-automate 路由测试**：正常启动、SKU>6跳过、已处理跳过、空列表
4. **batch-stage 路由测试**：批量 draft→ready、ready→published、非法转换
5. **Pipeline 步骤跳过测试**：某个步骤失败时记录错误继续后续步骤
6. **automation_log 格式测试**：JSON 结构验证
7. **automation_issues 格式测试**：问题诊断 JSON 数组验证
8. **数据诊断规则测试**：无尺寸/无分类/白底失败等场景
9. **尺寸标注"只标1张"测试**：多图时只标注第一张有尺寸的
10. **尺寸标注"不可标"测试**：OCR无结果时不标，不报错
11. **GET /api/product stage 筛选测试**：按 stage 查询正确
12. **PUT /api/product 云端同步测试**：5个新字段同步到云端
13. **并发控制测试**：同时只处理1个商品

### 8.2 前端测试

14. **商品列表自动化阶段列渲染测试**
15. **草稿箱页面数据加载测试**
16. **待发布页面数据加载测试**
17. **批量操作按钮状态测试**（选中项包含已发布时禁用等）
18. **stage 标签颜色测试**

---

## 九、实施顺序

1. **DB Schema** — products 表新增5列 + db.js 自动补列
2. **后端路由** — batch-automate / batch-stage / stage 查询
3. **Pipeline 服务** — automation-pipeline.js 核心逻辑
4. **前端组件** — page-drafts.js / page-publish-queue.js
5. **商品管理页** — 新增阶段列 + 批量自动化按钮
6. **侧边栏** — 新增两个菜单项
7. **云端同步** — 新字段同步到 Turso
8. **单元测试** — 204 → 目标 250+
9. **集成验证** — 端到端走通完整流程

---

## 十、注意事项

1. **SKU > 6 跳过规则**：解析 `skus` JSON 数组，`length > 6` 的商品跳过
2. **已选中图片规则**：detail-modal 中的图片选中状态保存在哪里？需确认后对接
3. **幂等性**：同一个 uid 重复触发 batch-automate 时，已 processing 的跳过
4. **服务重启恢复**：processing 状态的商品在服务重启时应标记为 failed（避免永久卡住）
5. **不要破坏现有功能**：status 字段语义不变，新增 stage 是正交维度
