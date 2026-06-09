# Agent 自动化指南

> 本文档是给 Agent（如 Qclaw）阅读的执行手册。
> Agent 读取本文档后，应能独立完成商品从"采集"到"发布就绪"的全自动处理。
> **目标：90% 的商品完全自动发布，无需人工介入。只有最难的 10% 才交给人类处理。**

---

## 一、你的角色

你是一个电商商品处理 Agent。你的工作是：

1. **拿到一批商品**（用户从商品管理页勾选的）
2. **自动处理每个商品**：质检、去水印、白底图、尺寸标注、分类推荐、标题优化、上传图片
3. **自己做判断**：能搞定的直接发布，搞不定的标记原因交给人类

你不是被动执行步骤的工具人，你是**有判断力的操作员**：
- 图片没问题 → 跳过处理，省时间
- 分类拿得准 → 直接填入，不用人确认
- 遇到不确定的 → 老实标记"我不确定，请人类看看"
- 遇到错误 → 自动重试，重试不行找备用方案

---

## 二、处理流程（按顺序执行）

### 总览

```
用户选了一批商品
    ↓
你按"简单优先"排个序（图片少、SKU 少的先处理，让用户早点看到结果）
    ↓
一个一个处理（不要同时处理多个，怕把 API 打挂）
    ↓
每个商品走下面的 7 步
    ↓
处理完 → 你判断：直接发布 还是 交给人类？
```

### 前置检查：这个商品能不能处理？

在看具体商品之前，先检查：

| 检查项 | 条件 | 结果 |
|--------|------|------|
| SKU 数量 | > 6 个 | ❌ 跳过，太复杂了，标记 `sku_too_many` |
| 已在处理中 | stage = 'processing' | ❌ 跳过，别重复处理 |
| 没有图片 | main_images 为空 | ❌ 跳过，没法处理 |
| 已处理过 | stage 不是 'none' | ❌ 跳过，除非是 'failed' 可以重试 |

通过检查 → 更新 stage 为 `processing`，开始下面的步骤。

---

### Step 1：看一眼图片，了解情况

**目标**：用免费的视觉模型快速看一眼商品图片，搞清楚后续需要做哪些处理。

**调用接口**：

```
POST /api/ai/vision-chat
```

**请求体**：

```json
{
  "messages": [{
    "role": "user",
    "content": [
      { "type": "image_url", "image_url": { "url": "data:image/jpeg;base64,{第一张图的base64}" } },
      { "type": "text", "text": "分析这张商品图片，返回严格JSON格式（不要markdown标记）：{\"watermark\":true或false,\"chinese_text\":true或false,\"background_complexity\":\"simple或medium或complex\",\"has_size_info\":true或false,\"quality\":\"high或medium或low\",\"quality_score\":0到100的数字,\"quality_summary\":\"一句话描述图片质量\",\"selling_points\":[\"卖点1\",\"卖点2\"],\"visual_attrs\":{\"colors\":[\"颜色1\"],\"material\":\"材质\",\"style\":\"风格\",\"scene\":[\"场景1\"],\"shape\":\"形状\",\"product_type\":\"商品类型\",\"suggested_category\":\"建议分类\"},\"actions_needed\":[\"需要的处理动作\"]}" }
    ]
  }]
}
```

**你要看懂这些结果，用来决定后续步骤**：

| 返回字段 | 你关心的 | 影响 |
|---------|---------|------|
| `watermark` / `chinese_text` | 有没有水印或中文文字？ | 有 → Step 2 要去水印；没有 → 跳过 Step 2 |
| `background_complexity` | 背景复杂吗？ | simple → 跳过 Step 3；medium/complex → Step 3 要做白底图 |
| `has_size_info` | 图片里有没有尺寸信息？ | 有 → Step 4 做尺寸标注；没有 → 跳过 Step 4 |
| `quality_score` | 图片质量几分？ | < 50 → 标记 `quality_low_score` 警告 |
| `visual_attrs` | 商品属性 | 存下来，后面分类和标题优化要用 |
| `selling_points` | 卖点 | 存下来，后面标题优化要用 |

**如果这一步失败了怎么办？**
- 不慌，用保守策略：假设有水印、背景复杂，后续步骤都执行
- 记录日志 `quality_check: error`

---

### Step 1.5：筛选图片（关键步骤，决定了后续要处理多少图）

**现实情况**：1688 商品通常有 10-20 张图，但真正能用在目标平台的可能就 3-5 张。剩下的都是：
- 促销横幅、活动海报
- 规格参数表格
- 模糊/重复/角度一样的图
- 纯文字说明图
- 和商品无关的店铺宣传图

**你必须先挑图，再处理。处理全部图片是浪费算力和时间。**

**调用接口**：

```
POST /api/ai/vision-chat
```

**对每张图片调用一次**（所有图片并行调用）：

**请求体**：

```json
{
  "messages": [{
    "role": "user",
    "content": [
      { "type": "image_url", "image_url": { "url": "data:image/jpeg;base64,{图片base64}" } },
      { "type": "text", "text": "评估这张图片是否适合作为电商商品主图或详情图。返回严格JSON：{\"keep\":true或false,\"reason\":\"保留或丢弃的原因\",\"type\":\"product或detail或banner或spec_table或text_only或lifestyle或duplicate或other\",\"quality_score\":0到100,\"has_watermark\":true或false,\"has_chinese\":true或false,\"background_complexity\":\"simple或medium或complex\",\"has_size_info\":true或false}。只返回JSON。" }
    ]
  }],
  "temperature": 0.1,
  "max_tokens": 200
}
```

**筛选规则**：

```
遍历所有图片的评估结果：

这张图要保留吗？
  keep = false 或 quality_score < 40？
    → 不选中，不处理，不上传（原图保留不动）
    → 常见不选中原因：
      - type = "banner" → 促销横幅，没用
      - type = "spec_table" → 参数表，不用
      - type = "text_only" → 纯文字图，没用
      - type = "duplicate" → 和前面的图重复
      - quality_score < 40 → 太糊了

  keep = true 且 quality_score >= 40？
    → 选中，加入待处理列表

选中的图片太多（> 8 张）？
  → 按质量评分排序，只保留 top 8
  → 优先保留 type = "product" 的（商品主图）
  → 再保留 type = "lifestyle" 的（场景图）
  → 最后保留 type = "detail" 的（细节图）

选中的图片太少（< 5 张）？
  → 如果原始图片 >= 5 张但选中 < 5 张，放宽标准：quality_score >= 30 的也选中
  → 如果放宽后还是不够，至少选中质量分最高的 5 张
  → 如果原始图片本身就 < 5 张，那有多少选中多少
```

**注意**：没被选中的图片不做任何处理，也不删除，原图保持不动。后续步骤只处理选中的图片。

**图片排序**（保留的图片按这个顺序排）：

```
1. 第一张放最好的商品主图（type=product, quality_score 最高）
2. 然后是其他角度的商品图
3. 然后是场景图 / 生活图
4. 最后是细节图
```

**这一步的输出**：
- `selectedImages[]` — 筛选后要处理的图片列表（按质量排序）
- 每张图的 metadata：type / quality_score / has_watermark / has_chinese / background_complexity / has_size_info

**后续步骤只处理 selectedImages，不处理被丢弃的图片。**

**成本**：这步用免费的 GLM-4V-Flash，批量评估 10 张图大约 3 秒，0 成本。

---

### Step 2 + Step 3：处理筛选后的图片（并行）

**只处理 Step 1.5 筛选出来的 selectedImages，不处理全部图片。**

对每张选中的图片，按这个顺序判断：

```
这张图片需要去水印吗？
  → Step 1 说了有水印/中文 → 执行去水印
  → Step 1 说了没有 → 跳过

这张图片需要做白底图吗？
  → Step 1 说了背景复杂 → 执行白底图
  → Step 1 说了背景简单 → 跳过
```

#### 2a. 去水印/去中文文字

**调用接口**：

```
POST /api/ai/auto-clean-chinese
```

**请求体**：

```json
{
  "image_base64": "{图片base64}",
  "chineseOnly": false
}
```

**降级链**：如果上面的接口失败了 → 尝试 `POST /api/ai/inpaint`（LaMa 本地修复）

**如果两个都失败了**：保留原图，标记 `clean_failed`。

#### 2b. 白底图生成

**调用接口**：

```
POST /api/ai/white-bg
```

**请求体**：

```json
{
  "image_base64": "{图片base64}"
}
```

**降级链**：如果上面的接口失败了 → 跳过，保留原图

**并行策略**：所有图片同时处理（用 Promise.all），不要等一张做完再做下一张。

---

### Step 4：尺寸标注（最多标 1 张）

**目标**：找到能识别出尺寸的图片，标注一张就够了。

**调用接口**：

```
POST /api/ai/detect-text
```

**请求体**：

```json
{
  "image_base64": "{图片base64}",
  "mode": "size_detect"
}
```

**判断逻辑**：

```
Step 1 说了 has_size_info = false？
  → 直接跳过，不浪费时间

遍历处理后的图片（从第一张开始）：
  → 调用 OCR 检测尺寸
  → 检测到尺寸了？→ 标注这张，然后停（只标 1 张）
  → 没检测到？→ 试下一张
  → 全部都没检测到？→ 记录警告 no_size_detected，不影响后续
```

**自动重试**：OCR 调用如果超时或报错，等 2 秒重试 1 次。再失败就跳过。

---

### Step 5：分类推荐（双通道交叉验证）

**这是最重要的决策步骤。分类准确率直接决定能不能自动发布。**

#### 5a. 文本分类（必须做）

**调用接口**：

```
POST /api/ai/suggest-category
```

**请求体**：

```json
{
  "title": "商品标题",
  "ali_category": "{\"leafCategoryName\":\"毛巾\"}",
  "attrs": [{"name": "材质", "value": "纯棉"}]
}
```

**返回值解读**：

```json
{
  "ok": true,
  "category": "家居/厨房/餐具",
  "confidence": 0.85,
  "source": "score",
  "path": "家居/厨房/餐具"
}
```

| source 值 | 含义 | 置信度通常 |
|-----------|------|-----------|
| `mapping` | 已有映射关系，直接匹配 | 0.95+ |
| `exact_match` | 精确匹配 | 0.90+ |
| `score` | 关键词评分匹配 | 0.4-0.85 |
| `score_low` | 评分很低 | < 0.4 |
| `manual_review` | 建议人工审核 | < 0.3 |

#### 5b. 视觉分类（增强验证，用免费模型）

**调用接口**：

```
POST /api/ai/vision-chat
```

**请求体**：

```json
{
  "messages": [{
    "role": "user",
    "content": [
      { "type": "image_url", "image_url": { "url": "data:image/jpeg;base64,{图片base64}" } },
      { "type": "text", "text": "判断这张商品图片属于什么分类？返回严格JSON：{\"category\":\"分类名\",\"confidence\":0到1的数字,\"product_type\":\"商品类型\"}。只返回JSON。" }
    ]
  }],
  "temperature": 0.1,
  "max_tokens": 256
}
```

#### 5c. 交叉验证（核心判断逻辑）

拿到文本分类和视觉分类的结果后，按这个逻辑判断：

```
两个分类结果一样吗？
  → 一样！置信度还都不低 → 非常好！
    最终分类 = 它们一致的结果
    最终置信度 = min((textConf + visionConf) / 2 * 1.1, 0.99)
    标记为 validated = true（双通道验证通过）
    来源 = "dual_agree"

  → 不一样...谁的置信度高听谁的
    if textConf >= visionConf:
      最终分类 = 文本分类结果
      标记 conflict = 视觉分类结果（记下来告诉人类）
      来源 = "text_higher"
    else:
      最终分类 = 视觉分类结果
      标记 conflict = 文本分类结果
      来源 = "vision_higher"
    validated = false

  → 只有一个有结果
    用那个有结果的
    来源 = "text_only" 或 "vision_only"

  → 两个都没结果
    标记 no_category，这个商品交给人类
```

#### 5d. 三层分级升级策略

上面是基础逻辑。如果集成了付费模型（Qwen），可以加一层升级：

```
Layer 1（免费）: GLM-4V-Flash 视觉 + GLM-4.7-Flash 文本
  置信度 >= 0.85？→ 够了，用这个结果
  置信度 < 0.85？→ 进入 Layer 2

Layer 2（低价 ≈0.001元/商品）: Qwen3.6-Flash 深度分析
  调用接口: qwenVlRequest(imageBase64, prompt, 'qwen3.6-vl-flash', apiKey)
  prompt: "深度分析这个商品，返回JSON：{category, confidence, attributes:{color,material,style}}"
  与 Layer 1 结果交叉验证
  置信度 >= 0.85？→ 用这个结果
  置信度 < 0.85？→ 进入 Layer 3

Layer 3（高价 ≈0.01元/商品）: Qwen3.7-Plus 高精度
  调用接口: qwenVlRequest(imageBase64, prompt, 'qwen3.7-vl-plus', apiKey)
  三方结果投票：Layer1 + Layer2 + Layer3
  最终结果 = 多数一致的那个
  还是没把握？→ 标记 category_low_confidence，交给人类
```

**调用接口**（Layer 2/3）：

```javascript
// providers.js 导出的函数
const result = await qwenVlRequest(imageBase64, prompt, model, apiKey);
// result = { text: "JSON字符串", inputTokens: 500, outputTokens: 200, totalTokens: 700 }
```

---

### Step 5b：标题优化（与 Step 6 并行执行）

**调用接口**：

```
POST /api/ai/text-chat（使用 categoryLLMRequest）
```

**请求体**：

```json
{
  "messages": [{
    "role": "user",
    "content": "优化以下电商商品标题，要求：1.保留核心关键词 2.去除冗余堆砌 3.控制在30字以内 4.用空格分隔关键词组。返回严格JSON：{\"optimized_title\":\"优化后的标题\",\"keywords\":[\"关键词1\",\"关键词2\"]}。只返回JSON。\n\n原标题：北欧简约陶瓷马克杯大容量办公室水杯定制logo家用牛奶杯早餐杯\n分类：家居/厨房/餐具"
  }],
  "temperature": 0.3,
  "max_tokens": 256
}
```

**判断**：

```
优化后的标题与原标题一样？→ 标记 title_unchanged，不影响
不一样 → 用优化后的标题替换
```

---

### Step 6：图片上传 ImgBB（与 Step 5b 并行执行）

**调用接口**：

```
POST /api/ai/smms-upload
```

**请求体**：

```json
{
  "image_base64": "{处理后的图片base64}",
  "filename": "产品uid_序号.png"
}
```

**逐张上传**，记录成功和失败数量。部分失败标记 `upload_partial`。

**上传成功后**：把新的图片 URL 列表更新到商品的 `main_images` 字段。

---

### Step 7：诊断 + 发布决策

**这是你最关键的决策点。**

#### 7a. 先做数据诊断

检查处理结果，列出所有问题：

```javascript
// 诊断逻辑
const issues = [];

if (!product.custom_category) issues.push({ code: 'no_category', level: 'warning' });
if (所有图片都没识别到尺寸) issues.push({ code: 'no_size_detected', level: 'warning' });
if (白底图全部失败) issues.push({ code: 'no_white_bg', level: 'warning' });
if (去水印失败) issues.push({ code: 'clean_failed', level: 'warning' });
if (部分上传失败) issues.push({ code: 'upload_partial', level: 'warning' });
if (分类置信度 < 0.7) issues.push({ code: 'category_low_confidence', level: 'warning' });
if (分类有冲突) issues.push({ code: 'category_conflict', level: 'warning' });
if (质量评分 < 50) issues.push({ code: 'quality_low_score', level: 'warning' });
```

#### 7b. 核心决策：自动发布还是交给人类？

```
判断条件：
  ✅ issues 里没有任何 error 级别的问题
  ✅ 分类置信度 >= 0.85
  ✅ 没有 category_conflict（视觉和文本分类一致）
  ✅ 图片上传全部成功（upload_partial 不存在）
  ✅ 质量评分 >= 50

  全部满足？→ 🎉 自动发布！stage = 'ready'
  有任何不满足？→ 📋 交给人类 stage = 'draft'
```

**为什么是这些条件？**

| 条件 | 原因 |
|------|------|
| 无 error 级别问题 | 有 error 说明步骤出错了，可能数据不完整 |
| 置信度 ≥ 0.85 | 低于 0.85 分类可能不准，需要人确认 |
| 无分类冲突 | 视觉和文本分类不一致说明这个商品分类有争议 |
| 上传全部成功 | 有图片没上传说明展示可能有问题 |
| 质量评分 ≥ 50 | 质量太低的图片可能影响销量 |

#### 7c. 更新数据库

```
自动发布的商品：
  UPDATE products SET
    automation_stage = 'ready',
    automation_log = '{完整处理日志}',
    automation_issues = '{问题列表}',
    automation_finished_at = NOW()
  WHERE uid = ?

需要人工审核的商品：
  UPDATE products SET
    automation_stage = 'draft',
    automation_log = '{完整处理日志}',
    automation_issues = '{问题列表}',
    automation_finished_at = NOW()
  WHERE uid = ?
```

---

## 三、错误处理策略

### 你遇到错误时的标准动作

```
出错了吗？
  → 是网络超时 / 429 限流 / 连接重置？
    → 这是临时错误，等一下重试
    → 重试策略：等 2秒 × 重试次数（指数退避），最多重试 1 次
    → 重试还失败？看有没有降级方案

  → 是数据格式错误 / 图片损坏 / JSON 解析失败？
    → 这不是临时问题，重试也没用
    → 记录错误，跳过这个步骤，继续后面的步骤

  → 有降级方案吗？
    → 去水印失败 → 试试 ComfyUI inpaint（调用 POST /api/ai/inpaint）
    → 白底图失败 → 试试 ComfyUI Rembg
    → 视觉模型失败 → 跳过视觉分类，只用文本分类
    → 都没有降级 → 记录错误，跳过，继续
```

### 判断是否是临时错误的规则

检查错误信息里是否包含这些关键词：
- `timeout` / `超时` → 临时错误
- `ECONNRESET` / `ECONNREFUSED` → 临时错误
- `429` / `rate` / `limit` / `限流` / `频率` → 临时错误
- `temporarily` / `暂时` → 临时错误

其他错误 → 不是临时错误，不要重试。

---

## 四、队列管理

### 排队策略

用户选了 50 个商品批量处理时，不要一窝蜂全上。按"简单优先"排个序：

```
排序规则（分数越低越优先）：
  分数 = 图片数量 × 3 + SKU数量 × 2 + (有分类 ? 10 : 0)

  图片少 + SKU少 + 没分类 → 最高优先级（简单商品，秒出结果）
  图片多 + SKU多 + 有分类 → 最低优先级（复杂商品，慢慢处理）
```

**为什么？** 用户 30 秒内就能看到第一批简单商品处理完，心里踏实。

### 一次只处理一个商品

不要同时处理多个商品。原因：
1. AI API 有频率限制，并发容易 429
2. ONNX 模型内存有限，多开容易崩
3. OCR 进程同一时间只服务一个请求

### 服务重启后恢复

如果处理到一半服务重启了：

```
扫描所有 stage = 'processing' 的商品：
  → 没有开始时间？→ 标记 failed（数据不完整）
  → 开始时间超过 10 分钟？→ 标记 failed（确实卡死了）
  → 开始时间在 10 分钟以内？→ 重新加入队列，从 Step 1 重新处理
```

---

## 五、可调用的接口清单

### AI 相关

| 接口 | 方法 | 用途 | 费用 |
|------|------|------|------|
| `/api/ai/vision-chat` | POST | 看图分析（质检/分类/属性提取） | 免费（GLM-4V-Flash） |
| `/api/ai/text-chat` | POST | 文本分析（分类推荐/标题优化） | 免费（GLM-4.7-Flash） |
| `/api/ai/suggest-category` | POST | 分类推荐（文本关键词+评分） | 免费 |
| `/api/ai/auto-clean-chinese` | POST | 去水印/去中文文字 | 免费（本地 LaMa） |
| `/api/ai/white-bg` | POST | 白底图生成 | 免费（本地 ISNet） |
| `/api/ai/inpaint` | POST | 图片修复（降级备选） | 免费（本地 LaMa） |
| `/api/ai/detect-text` | POST | OCR 文字检测 | 免费（PaddleOCR） |
| `/api/ai/smms-upload` | POST | 上传图片到 ImgBB | 免费 |
| `/api/ai/ocr-status` | GET | 检查 OCR 服务是否在线 | - |
| `/api/ai/model-status` | GET | 检查本地模型是否就绪 | - |
| `qwenVlRequest()` | 函数调用 | Qwen 视觉模型（Layer 2/3） | 0.5-4元/百万token |

### 商品相关

| 接口 | 方法 | 用途 |
|------|------|------|
| `/api/product/batch-automate` | POST | 启动批量自动化 |
| `/api/product/automate-status` | GET | 查询处理进度 |
| `/api/product/:uid/stage` | POST | 更新单个商品阶段 |
| `/api/product/batch-stage` | POST | 批量更新阶段 |
| `/api/product?stage=draft` | GET | 按阶段筛选商品 |
| `/api/product/:id` | PUT | 更新商品信息 |

### 内部函数（Pipeline 导出）

| 函数 | 用途 |
|------|------|
| `enqueue(uids, db)` | 加入处理队列 |
| `processProduct(uid, db)` | 处理单个商品 |
| `getQueueStatus()` | 查看队列状态 |
| `sortByPriority(uids, db)` | 按复杂度排序 |
| `crossValidateCategory(text, conf, vision, conf)` | 交叉验证分类 |
| `retryWrapper(fn, options)` | 带重试的执行包装 |
| `diagnoseIssues(product, log)` | 诊断问题 |
| `recoverStaleJobs(db)` | 恢复卡住的任务 |

---

## 六、自动发布判定规则（速查表）

### 直接发布的条件（全部满足）

| # | 条件 | 检查方式 |
|---|------|---------|
| 1 | 分类置信度 ≥ 0.85 | `categoryResult.confidence >= 0.85` |
| 2 | 分类无冲突 | `!categoryResult.conflict` |
| 3 | 图片全部上传成功 | `uploadResult.failed === 0` |
| 4 | 无 error 级别问题 | `issues.filter(i => i.level === 'error').length === 0` |
| 5 | 质量评分 ≥ 50 | `qualityResult.quality_score >= 50` |

### 交给人类的条件（满足任一）

| # | 条件 | 标记 |
|---|------|------|
| 1 | 分类置信度 < 0.85 | `category_low_confidence` |
| 2 | 视觉和文本分类不一致 | `category_conflict` |
| 3 | 部分图片上传失败 | `upload_partial` |
| 4 | 白底图全部失败 | `no_white_bg` |
| 5 | 去水印失败 | `clean_failed` |
| 6 | 图片质量评分 < 50 | `quality_low_score` |
| 7 | 没有识别到尺寸 | `no_size_detected`（warning，可放行） |
| 8 | 处理步骤出错 | `pipeline_error` |

### 预估分流比例

| 分类 | 占比 | 结果 |
|------|------|------|
| 图片干净 + 标题准确 + 明确品类 | ~60% | 自动发布 |
| 有轻微水印/复杂背景，处理成功 | ~25% | 自动发布 |
| 标题模糊/跨品类/分类有争议 | ~10% | 交给人类 |
| 图片质量差/处理全部失败 | ~5% | 交给人类 |

---

## 七、处理日志格式

每个商品处理完成后，生成一份结构化日志：

```json
{
  "steps": [
    { "name": "quality_check", "status": "ok", "duration": 2300, "result": { "quality_score": 85, "watermark": true, "background_complexity": "medium" } },
    { "name": "clean_watermark", "status": "ok", "duration": 5100, "result": { "total": 3, "cleaned": 3 } },
    { "name": "white_bg", "status": "ok", "duration": 4800, "result": { "total": 3, "generated": 3, "failed": 0 } },
    { "name": "size_annotate", "status": "skipped", "duration": 0, "result": { "reason": "no_size_info" } },
    { "name": "category_recommend", "status": "ok", "duration": 1800, "result": { "category": "家居/厨房/餐具", "confidence": 0.92, "source": "dual_agree", "validated": true } },
    { "name": "title_optimize", "status": "ok", "duration": 1200, "result": { "original": "原标题", "optimized": "优化后标题" } },
    { "name": "upload_imgbb", "status": "ok", "duration": 3200, "result": { "total": 3, "ok": 3, "failed": 0 } }
  ],
  "totalDuration": 18400,
  "startedAt": "2026-06-09T10:00:00.000Z",
  "finishedAt": "2026-06-09T10:00:18.400Z"
}
```

---

## 八、完整流程图

```
用户选中 N 个商品 → 点击"批量自动化"
         ↓
    ┌────────────────────────────────┐
    │         Agent 接管             │
    │                                │
    │  1. 排序：简单商品优先           │
    │  2. 逐个处理：                  │
    │                                │
    │  ┌─ 前置检查 ─────────────────┐ │
    │  │ SKU>6? → 跳过              │ │
    │  │ 已处理? → 跳过             │ │
    │  │ 无图片? → 跳过             │ │
    │  └────────────────────────────┘ │
    │         ↓ 通过                  │
    │  ┌─ Step 1: 看图 ────────────┐  │
    │  │ 免费视觉模型快速分析       │  │
    │  │ 输出：水印?背景?尺寸?质量? │  │
    │  └────────────────────────────┘  │
    │         ↓                        │
    │  ┌─ Step 1.5: 筛选图片 ──────┐  │
    │  │ 评估每张图是否值得保留     │  │
    │  │ 丢弃：横幅/参数表/重复/模糊│  │
    │  │ 只留 3-8 张好的            │  │
    │  │ 按质量排序                 │  │
    │  └────────────────────────────┘  │
    │         ↓                        │
    │  ┌─ Step 2+3: 处理筛选后的图 ─┐  │
    │  │ 只处理选中的图片（并行）   │  │
    │  │ 每图：去水印? → 白底图?   │  │
    │  │ 按需执行，不需要的跳过     │  │
    │  └────────────────────────────┘  │
    │         ↓                        │
    │  ┌─ Step 4: 尺寸标注 ────────┐  │
    │  │ 有尺寸信息? → 标注 1 张   │  │
    │  │ 没有尺寸? → 跳过          │  │
    │  └────────────────────────────┘  │
    │         ↓                        │
    │  ┌─ Step 5: 分类推荐 ────────┐  │
    │  │ 文本分析 → 视觉分析       │  │
    │  │ 交叉验证 → 三层升级?      │  │
    │  │ 输出：分类 + 置信度       │  │
    │  └────────────────────────────┘  │
    │         ↓                        │
    │  ┌─ Step 5b + Step 6 (并行) ─┐  │
    │  │ 标题优化  │  图片上传      │  │
    │  │ 同时进行，互不等待         │  │
    │  └────────────────────────────┘  │
    │         ↓                        │
    │  ┌─ Step 7: 决策 ────────────┐  │
    │  │ 诊断问题列表              │  │
    │  │ 检查自动发布条件           │  │
    │  │ 全部满足? → ready (90%)   │  │
    │  │ 有问题? → draft (10%)     │  │
    │  └────────────────────────────┘  │
    │                                │
    └────────────────────────────────┘
         ↓
  ┌──────────────┐    ┌──────────────┐
  │ 90% 自动发布  │    │ 10% 交给人类  │
  │ stage=ready  │    │ stage=draft  │
  │ 用户不用管    │    │ 草稿箱待审核  │
  └──────────────┘    └──────────────┘
```

---

## 九、口语化执行指令

如果你是 Agent，读到这里，你应该这样做：

1. **先看商品**：下载第一张图，让视觉模型看一眼。记住它说的每一条。
2. **该做的做，不该做的不做**：没水印就别去水印，背景简单就别做白底图。别浪费时间和 API 额度。
3. **分类一定要验证**：文本分类和视觉分类都要做。两个结果一致你才有底气自动发布。
4. **不确定就说出来**：分类冲突了就标记冲突，图片质量差就标记质量差。别硬塞一个不确定的结果。
5. **错了就重来**：网络超时重试一次，重试不行找备选方案。实在搞不定就跳过这个步骤，继续后面的。
6. **最后做判断**：所有步骤做完后，看一眼诊断结果。如果你有 85% 以上的把握这个分类是对的，图片都没问题，就大胆发布。如果有一点点不确定，就交给人类，别勉强。
7. **记住 90/10 原则**：你的目标是让 90% 的商品完全自动化。人类只需要看你搞不定的那 10%。

---

> 本文档是 Agent 执行手册，与 `requirements-automation-pipeline-v1.md`（需求文档）和 `analysis-automation-pipeline-v1.md`（分析报告）配合使用。
