# 需求文档：商品自动化处理流水线 v1.1

> 创建时间：2026-06-08 18:00
> 更新时间：2026-06-08 19:21（合并分析报告优化项）
> 开发分支：feature/automation-pipeline

---

## 一、总体概述

实现从 1688 采集商品到“上架就绪”的自动化流水线。核心流程：

```
1688采集商品 → 商品管理页选中 → 点击“批量自动化” → 后台Pipeline处理
    → 处理完成进入“草稿箱” → 人工确认/修改 → 移入“待发布” → 后续定时发布
```

### 1.1 核心原则

- **编排而非开发**：所有底层能力（去水印/抠图/OCR/分类/VL/上传）均已存在，Pipeline 是组装
- **智能跳过**：质检结果驱动后续步骤，无水印不执行去水印，背景简单不执行白底图
- **渐进增强**：v1.1 串行 + 智能跳过 + 自动重试，后续可升级 Agent 多模型调度
- **CSS 变量优先**：所有新增样式必须使用 CSS 变量，禁止硬编码颜色值

---

## 二、自动化阶段设计

### 2.1 阶段枚举（automation_stage）

| 值 | 名称 | 说明 | 可见页面 |
|----|------|------|----------|
| `none` | 未处理 | 采集后的初始状态 | 商品管理 |
| `processing` | 处理中 | Pipeline正在执行 | 商品管理（进度指示） |
| `draft` | 草稿箱 | 自动化完成，等待人工审核 | 草稿箱页 |
| `ready` | 待发布 | 人工确认，准备发布 | 待发布页 |
| `published` | 已发布 | 已上架 | 商品管理（status=1） |
| `failed` | 处理失败 | 自动化出错，需人工介入 | 商品管理 |

### 2.2 阶段与现有 status 字段的关系

现有 `status` 字段（0=未发布, 1=已发布）保持不变。
新增 `automation_stage` 字段独立跟踪自动化进度。

关系：
- `stage=none` → `status=0`
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
- 点击“批量自动化”按钮
- SKU 列表超过 6 个的商品自动跳过

### 3.2 图片处理规则

**只处理已选中的图片**（main_images 中用户手动选定的子集）。
如果用户没有手动选择图片，默认处理全部 main_images。

### 3.3 处理步骤（串行执行，每个商品独立）

```
Step 1: 智能质检（GLM-4V-Flash）— 路由决策
  → 检测模糊、水印/水印位置、违规内容
  → 评估背景复杂度（simple/medium/complex）
  → 检测是否包含尺寸信息
  → 提取视觉属性（颜色/材质/风格）— 嵌入质检prompt，不增加额外调用
  → 输出结构化决策：哪些步骤需要执行，哪些可以跳过

Step 2: 去水印/去中文（LaMa）— 智能跳过
  → 仅当 Step 1 检测到水印/中文文字时执行
  → 无水印 → 跳过，log 记录 "skipped: no_watermark"
  → 失败 → 自动重试1次 → 降级到 ComfyUI inpaint → 跳过

Step 3: 白底图生成（ISNet 抠图）— 智能跳过
  → 仅当 Step 1 背景复杂度 > simple 时执行
  → 背景已简单 → 跳过，log 记录 "skipped: bg_simple"
  → ISNet 抠图 → 合成白底
  → 抠图失败 → 降级到 ComfyUI Rembg → 跳过

Step 4: 尺寸标注（PaddleOCR + SVG）— 可选步骤
  → 只标注能识别到尺寸的图片，**不知道尺寸的不标**
  → **一个产品只要标注1张尺寸图即可**
  → 全部图未识别到 → 记录警告但不影响 stage

Step 5: 分类推荐（GLM-4.7-Flash）
  → AI 自动推荐商品分类
  → 填充 custom_category / dxm_category
  → 置信度 < 0.7 → 标记 category_low_confidence

Step 6: 图片上传（ImgBB）
  → 按日期自动建相册
  → 部分失败 → 记录 upload_partial

Step 7: 数据诊断 & 标记完成
  → 扫描处理结果，生成问题列表写入 automation_issues
  → stage 更新为 'draft'
```

### 3.4 错误处理（智能重试 + 降级）

可恢复错误（网络超时/429限流/服务暂不可用）：
等待 2-5s → 自动重试1次 → 重试仍失败 → 判断降级方案 → 执行或跳过

不可恢复错误（格式错误/数据损坏）：记录错误 → 跳过该步骤

降级策略：LaMa→ComfyUI、ISNet→Rembg

### 3.5 队列恢复策略

服务启动时扫描所有 `stage = 'processing'` 的商品：
- 超过 10 分钟 → 标记 `failed`
- 未超过 10 分钟 → 重新加入队列头部，从断点继续

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
| `automation_stage` | TEXT | `'none'` | none/processing/draft/ready/published/failed |
| `automation_log` | TEXT | `''` | JSON格式处理日志 |
| `automation_issues` | TEXT | `''` | JSON数组，数据诊断问题列表 |
| `automation_started_at` | DATETIME | NULL | 开始时间 |
| `automation_finished_at` | DATETIME | NULL | 完成时间 |

### 4.2 云端同步

5 个新字段全部同步到 Turso 云端。

---

## 五、API 设计

### 5.1 新增接口

- `POST /api/product/batch-automate` — 批量启动自动化
- `GET /api/product/automate-status?uid=xxx` — 查询进度
- `POST /api/product/:uid/stage` — 手动更新阶段
- `POST /api/product/batch-stage` — 批量更新阶段

### 5.2 修改现有接口

- `GET /api/product` — 新增 stage 筛选 + 返回新字段
- `PUT /api/product/:id` — 新增5个可更新字段
- `POST /api/product` — 创建时写入 automation_stage='none'

---

## 六、前端页面设计

### 6.1 侧边栏菜单调整

新增：草稿箱 (`page-drafts`) 和 待发布 (`page-publish-queue`)

### 6.2 商品管理页改动

- 批量操作栏新增“批量自动化”按钮
- 列表新增“自动化阶段”列（状态列之后、预览列之前）
- SSE 实时更新进度

### 6.3 草稿箱页面（page-drafts）

核心功能：
- 只展示 `stage = 'draft'`
- 批量移入待发布 / 批量退回未处理
- 单品操作：详情 / 日志 / 退回 / 移入

#### 数据诊断列

| 问题标识 | 级别 | CSS 变量 | 说明 |
|----------|------|----------|------|
| `no_size_detected` | warning | `--warning` | 未标注尺寸 |
| `no_category` | warning | `--warning` | 未分类 |
| `category_low_confidence` | warning | `--warning` | 分类置信度低 |
| `no_white_bg` | warning | `--warning` | 白底图失败 |
| `clean_failed` | warning | `--warning` | 去水印失败 |
| `quality_low` | warning | `--warning` | 图片质量低 |
| `upload_partial` | warning | `--warning` | 图片上传不完整 |
| `ocr_error` | error | `--danger` | OCR服务异常 |
| `pipeline_error` | error | `--danger` | 处理异常 |

显示规则（使用 CSS 变量）：
- 无问题 → `var(--success)` + `var(--success-bg)` “无问题”
- 仅警告 → `var(--warning)` + `var(--warning-bg)` 可放行
- 有错误 → `var(--danger)` + `var(--danger-bg)` 建议退回

### 6.4 待发布页面（page-publish-queue）

- 只展示 `stage = 'ready'`
- 批量发布 / 批量退回草稿箱

---

## 七、CSS 样式规范（强制）

### 7.1 禁止硬编码颜色

所有新增样式必须使用项目 CSS 变量。

### 7.2 需要新增的 CSS 变量

三个主题文件均新增：
- 1688: `--warning: #ff9900; --warning-bg: rgba(255,153,0,.06);`
- JD: `--warning: #faad14; --warning-bg: rgba(250,173,20,.06);`
- Fresh: `--warning: #f59e0b; --warning-bg: rgba(245,158,11,.06);`

### 7.3 可用变量清单

```
--bg-base / --bg-surface / --bg-elevated / --bg-hover
--border / --border-subtle
--text-primary / --text-secondary / --text-muted
--accent / --accent-hover / --accent-subtle / --accent-glow / --accent-gradient
--success / --success-bg
--danger / --danger-bg
--info / --info-bg
--warning / --warning-bg  (新增)
--radius-xs / --radius-sm / --radius / --radius-lg / --radius-xl
--shadow / --shadow-hover / --shadow-accent
--transition
```

---

## 八、自动化处理服务

### 8.1 文件：`server/services/automation-pipeline.js`

### 8.2 处理队列

内存队列，串行处理（一次1个商品），SSE 广播进度。

### 8.3 步骤复用

| 步骤 | 复用模块 |
|------|---------|
| 智能质检 | `providers.visionLLMRequest` |
| 去水印 | `text-cleaner.js cleanImage` |
| 白底图 | `remove-bg.js` + ComfyUI Rembg |
| 尺寸标注 | `ocr_service.py` + `size-annotate.js` |
| 分类推荐 | `category-recommend.js` |
| 图片上传 | `imgbb-upload.js` |

---

## 九、单元测试计划

### 9.1 后端测试

1. DB Schema新增5字段自动补列
2. stage 状态机合法/非法转换
3. batch-automate 正常/SKU>6跳过/已处理跳过/空列表
4. batch-stage 批量转换
5. Pipeline 智能跳过逻辑
6. 自动重试 + 降级
7. automation_log 格式验证
8. automation_issues 格式验证
9. 数据诊断规则
10. 尺寸标注只标1张/不可标不报错
11. GET /api/product stage 筛选
12. PUT /api/product 云端同歧5字段
13. 并发控制
14. 队列恢复超时/断点续

### 9.2 前端测试

15. 阶段列渲染
16. 草稿箱数据加载
17. 待发布数据加载
18. 批量操作按钮状态
19. 问题诊断标签渲染
20. CSS 变量使用检查（无硬编码颜色）

---

## 十、实施顺序

1. **CSS 变量** — 三个主题文件新增 `--warning` / `--warning-bg`
2. **DB Schema** — products 表新增5列 + db.js 自动补列 + cloud 同步
3. **后端路由** — batch-automate / batch-stage / stage 查询
4. **Pipeline 服务** — automation-pipeline.js（智能跳过 + 自动重试）
5. **前端组件** — page-drafts.js / page-publish-queue.js
6. **商品管理页** — 阶段列 + 批量自动化按钮
7. **侧边栏** — 新增两个菜单项
8. **单元测试** — 每个模块完成后立即编写
9. **集成验证**

---

## 十一、注意事项

1. SKU > 6 跳过
2. 只处理已选中图片
3. 幂等性：重复触发时 processing 跳过
4. 服务重启恢复（10分钟阈值）
5. 不破坏现有 status 语义
6. **所有 CSS 使用变量，禁止硬编码颜色**
7. **每个模块完成后立即单元测试 + 语法检测**

---

## 附录：未来扩展（v2.0）

以下功能不在 v1.1 范围内：

- P2：步骤内并行、批量优先级排序
- P2：智能质检报告、视觉属性展示
- P2：Agent Layer 2（Qwen3.6-Flash 升级分类）
- P3：图片管道合并、ComfyUI场景图、自动标题优化
