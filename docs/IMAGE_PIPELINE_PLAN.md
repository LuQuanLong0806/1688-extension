# 图片自动化处理管道 — 第一期实施方案

> 基于现有代码深度分析，输出可编码级的详细方案。
> 最后更新: 2026-06-03

---

## 一、现有能力盘点

### 1.1 已有的图片处理基础设施

| 组件 | 文件 | 状态 | 说明 |
|------|------|------|------|
| PaddleOCR 微服务 | `server/services/ocr_service.py` | ✅ 已运行 | 端口3001, FastAPI, server.js 启动时自动 spawn, 自动重启(最多5次) |
| LaMa ONNX 推理 | `server/services/inpaint.js` | ✅ 已集成 | 512×512输入, 渐变mask混合, onnxruntime-node CPU |
| ISNet 抠图(本地) | `server/services/remove-bg.js` | ✅ 已集成 | onnxruntime-node + ISNet fp16, 1024×1024 |
| @imgly 抠图(WASM) | `server/routes/ai/image-edit.js` | ✅ 已集成 | CDN动态导入, 前端运行 |
| 文字清理管道 | `server/services/text-cleaner.js` | ✅ 已集成 | OCR→mask生成(SVG+sharp)→LaMa修复, 支持URL/base64输入 |
| 图片代理 | `server/server.js` `/api/proxy-image` | ✅ 已集成 | SSRF防护, 跟随302重定向 |
| 图片上传 | `server/server.js` `/api/upload-image` | ✅ 已集成 | base64→文件, 支持50MB |

### 1.2 已有的 AI 路由端点

| 端点 | 方法 | 功能 |
|------|------|------|
| `/api/ai/detect-text` | POST | OCR文字检测(image_base64 或 image_url) |
| `/api/ai/auto-clean-chinese` | POST | 一键去中文(OCR+LaMa) |
| `/api/ai/batch-clean-chinese` | POST | 批量去中文(多图并行) |
| `/api/ai/inpaint` | POST | LaMa修复(image_base64 + mask_base64) |
| `/api/ai/remove-bg` | POST | @imgly 抠图 |
| `/api/ai/remove-bg-local` | POST | ISNet 本地抠图 |
| `/api/ai/smart-detect` | POST | 智谱GLM多模态检测水印/文字/LOGO |
| `/api/ai/ocr-status` | GET | OCR+LaMa服务状态 |
| `/api/ai/model-status` | GET | LaMa模型状态 |

### 1.3 已有的 DXM 端脚本能力

| 脚本 | 能力 |
|------|------|
| `dxm-auto-clean.js` | 自动检测并清理图片中文, `smartPasteImages()` 智能贴图入口 |
| `dxm-text-cleaner.js` | 去中文工具页的前端交互逻辑 |
| `dxm-text-cleaner.html` | 独立去中文工具页 UI |
| `dxm-image-editor.js` | 浮动工具栏: 裁剪/消除笔/框选消除/马赛克/标尺/水印/批量翻转 |
| `dxm-paste-img.js` | 粘图/删图工作流 |

### 1.4 数据库中商品图片字段

```sql
-- products 表中已有:
main_images TEXT   -- JSON数组 ["url1","url2"]  主图/轮播图
desc_images TEXT   -- JSON数组 描述图
detail_images TEXT  -- JSON数组 详情图
```

### 1.5 现有依赖

```json
{
  "onnxruntime-node": "^1.25.1",   // 已安装, LaMa和ISNet都在用
  "sharp": "^0.34.5",              // 已安装, mask生成/图像处理
  "@imgly/background-removal": "^1.7.0",  // 已安装
  "express": "^4.18.2",
  "axios": "^1.16.0",
  "sql.js": "^1.11.0"
}
```

**关键发现**: `lama.onnx` (92MB) 和 `isnet_fp16.onnx` (88MB) 模型文件已存在于 `server/models/`。PaddleOCR 微服务已完整实现并自动随 server 启动。**去中文水印流水线已基本可用**, 缺少的是:

1. **标尺寸模板** — sharp canvas 绘制尺寸标注
2. **批量商品图片处理管道** — 从商品列表一键处理所有图片
3. **处理结果回写商品数据** — 将处理后的图片URL更新到 products 表
4. **与DXM自动填表流程的无缝衔接** — smartPasteImages 真正集成到自动填表链路

---

## 二、第一期目标定义

**第一期(Phase 1)核心目标**: 将图片去中文水印+标尺寸的能力, 串联成**商品级别的批量处理管道**, 替代当前手动逐张处理的环节。

### 2.1 功能清单

| # | 功能 | 优先级 | 说明 |
|---|------|--------|------|
| F1 | 批量商品去中文 | P0 | 选择多个商品 → 所有图片自动去中文 → 更新图片URL |
| F2 | 单张图片标尺寸 | P0 | 在管理页/编辑器中对单张图片添加尺寸标注 |
| F3 | 批量商品标尺寸 | P1 | 选择商品 → 从SKU数据中提取尺寸 → 自动标注到主图 |
| F4 | 处理结果持久化 | P0 | 处理后图片URL写入 products 表, 支持回滚到原图 |
| F5 | 处理队列 + 进度 | P1 | 后台批量处理, SSE推送进度 |

### 2.2 不在第一期范围

- 图生图/AI换背景(需智谱API, 成本)
- 本地 LaMa 模型升级(如 big-lama)
- 浏览器端 WASM OCR(复杂度高, 现有Python服务够用)
- DXM小蜜蜂工作流深度集成(第二期)

---

## 三、技术架构设计

### 3.1 整体架构

```
┌──────────────────────────────────────────────────────────────────┐
│                     管理前端 (public/)                             │
│  ┌─────────┐  ┌──────────┐  ┌───────────┐  ┌──────────────────┐  │
│  │ 商品列表 │  │ 批量处理 │  │ 图片编辑器│  │ 处理进度面板     │  │
│  │ [批量去中│→│ 对话框   │→│ (标尺寸)  │  │ (SSE实时进度)    │  │
│  │  文/标尺│  │          │  │           │  │                  │  │
│  │  寸按钮]│  │          │  │           │  │                  │  │
│  └─────────┘  └──────────┘  └───────────┘  └──────────────────┘  │
└─────────────────────────┬────────────────────────────────────────┘
                          │ HTTP API
┌─────────────────────────▼────────────────────────────────────────┐
│                   server (Express)                                │
│                                                                  │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────────┐ │
│  │ /api/ai/*      │  │ /api/product/* │  │ /api/image-pipe/*  │ │
│  │ (已有, 不改)    │  │ (已有, 改)     │  │ (新增: 管道端点)   │ │
│  │ detect-text     │  │ 批量更新图片   │  │ batch-process      │ │
│  │ auto-clean-chi  │  │ 回滚原图      │  │ add-size-label     │ │
│  │ batch-clean-chi │  │               │  │ process-status     │ │
│  └────────────────┘  └────────────────┘  └────────┬───────────┘ │
│                                                   │              │
│  ┌────────────────────────────────────────────────▼───────────┐  │
│  │              services/image-pipeline.js (新增)               │  │
│  │                                                            │  │
│  │  processProduct(uid, options)                               │  │
│  │    ├─ 从DB读商品图片列表                                     │  │
│  │    ├─ 遍历每张图片:                                          │  │
│  │    │   ├─ 下载图片(复用 text-cleaner.downloadImage)          │  │
│  │    │   ├─ OCR检测中文(text-cleaner.callOcrService)          │  │
│  │    │   ├─ 生成mask(text-cleaner.generateMask)               │  │
│  │    │   ├─ LaMa修复(inpaint.inpaint)                          │  │
│  │    │   ├─ [可选] 标尺寸(size-label.addSizeLabel)             │  │
│  │    │   └─ 保存到uploads → 新URL                              │  │
│  │    └─ 更新products表图片字段(保留原图备份)                     │  │
│  │                                                            │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────────────┐ │
│  │ services/     │  │ services/     │  │ services/             │ │
│  │ text-cleaner  │  │ inpaint       │  │ size-label.js (新增)  │ │
│  │ (已有,不改)    │  │ (已有,不改)    │  │ sharp canvas 绘制     │ │
│  └───────────────┘  └───────────────┘  └───────────────────────┘ │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ PaddleOCR微服务 :3001 (已有,不改)                          │  │
│  └───────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

### 3.2 PaddleOCR 集成方式（已实现，无需改动）

当前方案已经是最优的:

1. **Python 微服务** (`ocr_service.py`, 端口3001): PaddleOCR 模型延迟加载, 首次调用3-5秒
2. **Node.js 调用**: 通过 HTTP POST 发送 base64 图片, 获取文字区域坐标
3. **自动管理**: `server.js` 启动时 spawn Python 进程, 异常退出自动重启(最多5次, 间隔5秒)
4. **健康检查**: `text-cleaner.checkOcrHealth()` 轮询 `/health` 端点

**结论**: PaddleOCR 集成已完成, 第一期无需改动。只需在新增管道中调用现有 `text-cleaner.callOcrService()` 即可。

### 3.3 LaMa ONNX 模型集成（已实现，无需改动）

1. **模型文件**: `server/models/lama.onnx` (92MB), FP16
2. **推理服务**: `inpaint.js` — 延迟加载ONNX session, CPU推理
3. **输入**: 512×512, RGB float32, 归一化到0-1
4. **输出**: 修复后图像, 与原图做渐变mask混合(blur=8)避免硬边

**结论**: LaMa 集成已完成, 直接复用 `lamaService.inpaint(imageBuffer, maskBuffer)`。

### 3.4 Mask 生成流程（已实现，无需改动）

现有 `text-cleaner.generateMask()` 流程:

```
OCR检测结果 regions[]
  ├─ 每个 region 含: x, y, width, height, polygon(精确四点多边形), text, confidence, is_chinese
  │
  ▼
遍历 regions:
  ├─ 有 polygon(≥3点) → expandPolygon() 沿质心方向外扩 dilatePx 像素
  └─ 无 polygon → 矩形外扩 dilatePx 像素
  │
  ▼
构建 SVG (黑底+白色填充区域) → sharp 渲染为 grayscale PNG
```

**dilatePx 参数**: 默认20像素, 可通过 API 传入调整。多边形膨胀比简单矩形外扩更精确。

### 3.5 标尺寸模板 — sharp canvas 绘制方案（新增）

#### 3.5.1 设计目标

在商品主图上自动添加尺寸标注(如 "10×8×5 cm"), 用于 TEMU/Amazon 等平台。标注应:

- 位置在图片底部中央或右下角(可配置)
- 白色半透明背景 + 黑色文字(或反色)
- 字体清晰可读, 不遮挡主体
- 尺寸数据从 SKU 的 dimensions 字段自动提取

#### 3.5.2 实现方案: SVG Overlay + sharp 合成

```javascript
// services/size-label.js

const sharp = require('sharp');
const path = require('path');

/**
 * 在图片上添加尺寸标注
 * @param {Buffer} imageBuffer - 原始图片
 * @param {object} options
 * @param {string} options.text - 尺寸文字, 如 "10×8×5cm"
 * @param {string} options.position - 位置: 'bottom-center' | 'bottom-right' | 'top-right'
 * @param {number} options.fontSize - 字号(px), 默认按图片宽度自适应
 * @param {number} options.padding - 内边距(px)
 * @param {string} options.fontFamily - 字体, 默认 "Arial"
 * @param {string} options.textColor - 文字颜色
 * @param {string} options.bgColor - 背景颜色(含透明度)
 * @returns {Promise<Buffer>} 标注后的图片buffer
 */
async function addSizeLabel(imageBuffer, options) {
  options = Object.assign({
    position: 'bottom-center',
    padding: 12,
    fontFamily: 'Arial, sans-serif',
    textColor: '#FFFFFF',
    bgColor: 'rgba(0,0,0,0.6)',
    fontSize: 0  // 0 = 自适应
  }, options || {});

  const text = options.text;
  if (!text) throw new Error('尺寸文字不能为空');

  // 1. 获取原图尺寸
  const meta = await sharp(imageBuffer).metadata();
  const w = meta.width;
  const h = meta.height;

  // 2. 自适应字号: 图片宽度的 3-4%, 最小16px, 最大48px
  const fontSize = options.fontSize || Math.max(16, Math.min(48, Math.round(w * 0.035)));

  // 3. 预估文字宽度(CJK字符宽度≈字号, 英文≈0.6×字号)
  let textWidth = 0;
  for (const ch of text) {
    textWidth += ch.charCodeAt(0) > 127 ? fontSize : fontSize * 0.6;
  }
  const boxW = textWidth + options.padding * 2;
  const boxH = fontSize * 1.4 + options.padding * 2;

  // 4. 计算位置
  const margin = Math.round(w * 0.02); // 距边缘2%
  let boxX, boxY;
  switch (options.position) {
    case 'bottom-right':
      boxX = w - boxW - margin;
      boxY = h - boxH - margin;
      break;
    case 'top-right':
      boxX = w - boxW - margin;
      boxY = margin;
      break;
    case 'bottom-center':
    default:
      boxX = Math.round((w - boxW) / 2);
      boxY = h - boxH - margin;
      break;
  }

  // 5. 构建 SVG overlay
  const svgOverlay = `
    <svg width="${w}" height="${h}">
      <rect x="${boxX}" y="${boxY}" width="${boxW}" height="${boxH}"
            rx="6" ry="6" fill="${options.bgColor}" />
      <text x="${boxX + options.padding}" y="${boxY + options.padding + fontSize}"
            font-family="${options.fontFamily}" font-size="${fontSize}" font-weight="bold"
            fill="${options.textColor}">
        ${escapeXml(text)}
      </text>
    </svg>`;

  // 6. sharp 合成
  const result = await sharp(imageBuffer)
    .composite([{
      input: Buffer.from(svgOverlay),
      top: 0, left: 0
    }])
    .png()
    .toBuffer();

  return result;
}

function escapeXml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * 从 SKU 数据中提取尺寸文本
 * dimensions 格式: [长, 宽, 高] (cm)
 */
function dimensionsToText(dimensions) {
  if (!Array.isArray(dimensions) || dimensions.length < 2) return null;
  // 过滤无效值(0或NaN)
  const valid = dimensions.filter(d => d && !isNaN(d) && d > 0);
  if (valid.length < 2) return null;
  if (valid.length === 2) return valid[0] + '×' + valid[1] + 'cm';
  return valid[0] + '×' + valid[1] + '×' + valid[2] + 'cm';
}

/**
 * 从 SKU 数据中提取最大的尺寸(多个SKU取最大值)
 */
function getMaxDimensions(skus) {
  if (!Array.isArray(skus) || !skus.length) return null;
  let maxDims = null;
  let maxVol = 0;
  for (const sku of skus) {
    const dims = sku.dimensions || sku.dims;
    if (!Array.isArray(dims) || dims.length < 2) continue;
    const valid = dims.filter(d => d && !isNaN(d) && d > 0);
    if (valid.length < 2) continue;
    const vol = valid.reduce((a, b) => a * b, 1);
    if (vol > maxVol) {
      maxVol = vol;
      maxDims = valid;
    }
  }
  return maxDims;
}

module.exports = { addSizeLabel, dimensionsToText, getMaxDimensions };
```

#### 3.5.3 可选: 多模板尺寸标注样式

```javascript
const SIZE_LABEL_TEMPLATES = {
  // 模板1: 底部居中, 黑色半透明背景, 白色文字
  'standard': {
    position: 'bottom-center',
    bgColor: 'rgba(0,0,0,0.6)',
    textColor: '#FFFFFF',
    padding: 12,
    fontSize: 0  // 自适应
  },
  // 模板2: 右下角, 白色半透明背景, 黑色文字
  'light': {
    position: 'bottom-right',
    bgColor: 'rgba(255,255,255,0.75)',
    textColor: '#333333',
    padding: 10,
    fontSize: 0
  },
  // 模板3: 左下角, 红色强调
  'promo': {
    position: 'bottom-right',
    bgColor: 'rgba(233,69,96,0.85)',
    textColor: '#FFFFFF',
    padding: 14,
    fontSize: 0
  }
};
```

---

## 四、API 设计

### 4.1 新增端点

#### 4.1.1 POST `/api/image-pipe/add-size-label`

单张图片添加尺寸标注。

```
POST /api/image-pipe/add-size-label
Content-Type: application/json

{
  "image_base64": "...",       // base64编码的图片(不带data:前缀)
  "image_url": "https://...",  // 或图片URL(二选一)
  "text": "10×8×5cm",         // 尺寸文字(必须)
  "template": "standard",     // 模板名: standard/light/promo
  "position": "bottom-center" // 覆盖模板中的位置
}

→ {
  "ok": true,
  "url": "/uploads/size_1688234567_abc.png",
  "width": 800,
  "height": 800
}
```

#### 4.1.2 POST `/api/image-pipe/batch-process`

批量处理商品的图片(去中文 + 可选标尺寸)。

```
POST /api/image-pipe/batch-process
Content-Type: application/json

{
  "product_uids": ["uid1", "uid2", ...],  // 要处理的商品UID列表
  "options": {
    "clean_chinese": true,         // 是否去中文(默认true)
    "add_size_label": true,        // 是否标尺寸(默认false)
    "size_label_template": "standard",
    "chinese_only": true,          // 只去中文(默认true)
    "min_confidence": 0.5,         // OCR最低置信度
    "dilate_px": 20,              // mask膨胀像素
    "image_types": ["main_images", "desc_images"],  // 处理哪些图片字段
    "skip_no_text": true           // 无中文时跳过(不生成副本)
  }
}

→ {
  "ok": true,
  "job_id": "job_abc123",
  "total": 2,
  "message": "处理任务已创建"
}
```

注意: 这是一个**异步任务**。实际处理通过后台队列执行, 进度通过 SSE 推送。

#### 4.1.3 GET `/api/image-pipe/process-status`

查询处理任务状态。

```
GET /api/image-pipe/process-status?job_id=job_abc123

→ {
  "ok": true,
  "job_id": "job_abc123",
  "status": "processing",  // pending/processing/completed/failed
  "total_products": 2,
  "completed_products": 1,
  "total_images": 8,
  "processed_images": 4,
  "cleaned_images": 3,
  "labeled_images": 1,
  "errors": [],
  "results": [
    {
      "product_uid": "uid1",
      "status": "completed",
      "images_processed": 4,
      "images_cleaned": 3,
      "images_labeled": 1
    }
  ]
}
```

#### 4.1.4 POST `/api/image-pipe/revert-product`

回滚单个商品到原图。

```
POST /api/image-pipe/revert-product
Content-Type: application/json

{ "product_uid": "uid1" }

→ {
  "ok": true,
  "reverted": true,
  "message": "已恢复原图"
}
```

#### 4.1.5 GET `/api/image-pipe/pipeline-status`

管道服务总状态(OCR/LaMa/磁盘空间等)。

```
GET /api/image-pipe/pipeline-status

→ {
  "ocr": { "status": "ok", "model": "PaddleOCR" },
  "lama": { "available": true },
  "uploads_dir": "public/uploads",
  "active_jobs": 0
}
```

### 4.2 与现有 API 的衔接

#### 4.2.1 商品数据流衔接

处理完成后, 更新 products 表的图片字段:

```javascript
// 原始图片URL存储到 processed_images_log 表
// 新的(处理后的)URL写入 main_images/desc_images
// 支持一键回滚

// 示例: 处理前
main_images: ["https://img.example.com/1.jpg", "https://img.example.com/2.jpg"]

// 处理后(图片2检测到中文, 被清理)
main_images: ["https://img.example.com/1.jpg", "http://localhost:3000/uploads/cleaned_xxx.png"]

// processed_images_log 记录:
// { product_uid, field, original_url, processed_url, processed_at }
```

#### 4.2.2 批量更新商品图片

利用现有的 `PUT /api/product/:uid` 端点更新 `mainImages` 字段, 无需新增商品更新 API。

```javascript
// 在管道内部调用:
// PUT /api/product/:uid  body: { mainImages: [...newUrls], descImages: [...newUrls] }
// 或直接操作 db:
// UPDATE products SET main_images = ? WHERE uid = ?
```

---

## 五、数据库变更

### 5.1 新增表: processed_images_log

用于记录图片处理历史, 支持回滚。

```sql
CREATE TABLE IF NOT EXISTS processed_images_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_uid TEXT NOT NULL,
  field TEXT NOT NULL,              -- 'main_images' / 'desc_images' / 'detail_images'
  index_in_array INTEGER DEFAULT 0,  -- 在JSON数组中的位置
  original_url TEXT NOT NULL,       -- 原始图片URL
  processed_url TEXT NOT NULL,       -- 处理后的图片URL
  operation TEXT DEFAULT 'clean_chinese',  -- 'clean_chinese' / 'add_size' / 'both'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(product_uid, field, index_in_array)
);
```

添加到 `db.js` 的 `LOCAL_TABLE_DEFS` 数组中。

### 5.2 现有 products 表: 无需改动

图片URL直接在 JSON 字段中替换, `processed_images_log` 表记录原始URL供回滚。

---

## 六、文件变更清单

### 6.1 新增文件

| 文件 | 用途 | 代码量估算 |
|------|------|-----------|
| `server/services/size-label.js` | 尺寸标注绘制服务 | ~120行 |
| `server/services/image-pipeline.js` | 批量图片处理管道核心逻辑 | ~250行 |
| `server/routes/image-pipe.js` | 管道API路由 | ~200行 |
| `server/public/js/components/image-pipe-ui.js` | 管理前端: 批量处理对话框 + 进度面板 | ~300行 |

### 6.2 需修改的现有文件

| 文件 | 修改内容 | 影响范围 |
|------|----------|----------|
| `server/server.js` | 添加 `app.use('/api/image-pipe', require('./routes/image-pipe'))` | 1行 |
| `server/db.js` | 在 `LOCAL_TABLE_DEFS` 添加 `processed_images_log` 表定义 | ~15行 |
| `server/public/index.html` | 在商品列表工具栏添加"批量处理"按钮, 引入image-pipe-ui.js | ~10行 |
| `server/public/js/app.js` (或等效前端入口) | 挂载批量处理UI组件 | ~5行 |

### 6.3 无需改动的文件

| 文件 | 原因 |
|------|------|
| `server/services/text-cleaner.js` | 管道直接调用其导出函数, 无需修改 |
| `server/services/inpaint.js` | 同上 |
| `server/services/ocr_service.py` | 同上 |
| `server/services/remove-bg.js` | 第一期不涉及抠图 |
| `server/routes/ai/image-edit.js` | 已有端点保持不变 |
| `server/routes/products.js` | 管道通过 db 模块直接操作, 或通过 PUT API 更新 |

### 6.4 依赖包变更

**无新增依赖**。所有需要的能力(sharp, onnxruntime-node, express)已在 `package.json` 中。

`server/requirements.txt` (Python) 也无需改动, PaddleOCR 相关依赖已齐全。

---

## 七、实施步骤（按优先级, 每步可独立验证）

### Step 1: 尺寸标注服务 ✅ 可独立验证

**文件**: `server/services/size-label.js`

1. 实现 `addSizeLabel(imageBuffer, options)` — SVG overlay + sharp 合成
2. 实现 `dimensionsToText(dimensions)` — `[10,8,5]` → `"10×8×5cm"`
3. 实现 `getMaxDimensions(skus)` — 从多SKU中取最大尺寸
4. 手写单元测试: 读一张测试图片 → 调用 `addSizeLabel()` → 保存结果 → 目视检查

**验证方式**:
```bash
cd server
node -e "
  const sharp = require('sharp');
  const sizeLabel = require('./services/size-label');
  sharp({create:{width:800,height:800,channels:3,background:'white'}})
    .png().toBuffer()
    .then(buf => sizeLabel.addSizeLabel(buf, {text:'10×8×5cm'}))
    .then(result => require('fs').writeFileSync('test_size.png', result))
    .then(() => console.log('OK'))
"
```

### Step 2: 尺寸标注 API 端点 ✅ 可独立验证

**文件**: `server/routes/image-pipe.js` (先创建, 只含 size-label 端点)

1. 实现 `POST /api/image-pipe/add-size-label`
2. 支持输入: base64 或 URL
3. URL输入时先通过 proxy 下载
4. 调用 `sizeLabel.addSizeLabel()` → 保存到 uploads → 返回 URL

**验证方式**:
```bash
curl -X POST http://localhost:3000/api/image-pipe/add-size-label \
  -H "Content-Type: application/json" \
  -d '{"image_url":"https://some-image.jpg","text":"10×8×5cm"}'
```

### Step 3: 图片处理管道核心 ✅ 可独立验证

**文件**: `server/services/image-pipeline.js`

1. 实现 `processProduct(uid, options)`:
   - 从 db 读取商品数据(`main_images`, `desc_images`, `skus`)
   - 遍历指定图片字段中的每张URL
   - 下载图片 → OCR检测 → 生成mask → LaMa修复 → [可选]标尺寸 → 保存
   - 替换处理后的URL到商品图片数组
   - 记录原始URL到 `processed_images_log`
   - 更新 db
   - SSE 广播进度
2. 实现 `revertProduct(uid)`:
   - 从 `processed_images_log` 读取原始URL
   - 还原到 products 表
   - 删除 log 记录
3. 实现 `processSingleImage(url, options)`:
   - 单张图片处理, 返回处理后URL

**验证方式**:
```bash
curl -X POST http://localhost:3000/api/image-pipe/batch-process \
  -H "Content-Type: application/json" \
  -d '{"product_uids":["一个已有商品的uid"],"options":{"clean_chinese":true}}'
```

### Step 4: 批量处理 API 端点 ✅ 可独立验证

**文件**: 完善 `server/routes/image-pipe.js`

1. 实现 `POST /api/image-pipe/batch-process` — 创建异步任务
2. 实现 `GET /api/image-pipe/process-status` — 查询进度
3. 实现 `POST /api/image-pipe/revert-product` — 回滚
4. 实现 `GET /api/image-pipe/pipeline-status` — 服务状态
5. 并发控制: 同一时间只处理1个商品, 避免OCR/LaMa争抢CPU

**在 server.js 中注册路由**:
```javascript
app.use('/api/image-pipe', require('./routes/image-pipe'));
```

### Step 5: 前端批量处理UI ✅ 可独立验证

**文件**: `server/public/js/components/image-pipe-ui.js`

1. 商品列表工具栏添加"批量去中文"/"批量标尺寸"按钮
2. 点击后弹出处理对话框:
   - 显示已选商品数量
   - 选项面板: 去中文开关, 标尺寸开关, 模板选择, 膨胀像素
   - "开始处理"按钮
3. 处理进度面板(SSE):
   - 当前商品 x/total
   - 当前图片 x/y
   - 预计剩余时间
   - 成功/失败计数
4. 处理完成后:
   - 显示处理结果摘要
   - "查看"按钮(跳到处理后的图片)
   - "回滚"按钮

### Step 6: 数据库表 + DB迁移 ✅ 可自动完成

**文件**: 修改 `server/db.js`

1. 在 `LOCAL_TABLE_DEFS` 添加 `processed_images_log` 表DDL
2. 添加索引: `idx_pil_product_uid`, `idx_pil_created_at`
3. 重启 server 即可自动建表(现有 `migrateLocalSchema()` 机制)

### Step 7: 端到端测试

1. 采集一个含中文水印的1688商品
2. 在管理页面选中该商品
3. 点击"批量去中文"
4. 验证: 图片中的中文被消除, 处理后URL已更新
5. 点击"回滚" → 验证原图恢复
6. 选中含SKU尺寸的商品 → 点击"批量标尺寸"
7. 验证: 主图底部出现尺寸标注

---

## 八、关键代码片段

### 8.1 image-pipeline.js 核心结构

```javascript
// server/services/image-pipeline.js

const textCleaner = require('./text-cleaner');
const lamaService = require('./inpaint');
const sizeLabel = require('./size-label');
const db = require('../db');
const fs = require('fs');
const path = require('path');

const UPLOADS_DIR = path.join(__dirname, '..', 'public', 'uploads');

// 活跃任务管理
const jobs = new Map();
let jobCounter = 0;

/**
 * 批量处理商品图片
 */
async function batchProcess(productUids, options, onProgress) {
  const jobId = 'job_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
  const job = {
    id: jobId,
    status: 'processing',
    totalProducts: productUids.length,
    completedProducts: 0,
    totalImages: 0,
    processedImages: 0,
    cleanedImages: 0,
    labeledImages: 0,
    errors: [],
    results: []
  };
  jobs.set(jobId, job);

  options = Object.assign({
    cleanChinese: true,
    addSizeLabel: false,
    sizeLabelTemplate: 'standard',
    chineseOnly: true,
    minConfidence: 0.5,
    dilatePx: 20,
    imageTypes: ['main_images', 'desc_images'],
    skipNoText: true
  }, options || {});

  try {
    for (let i = 0; i < productUids.length; i++) {
      const uid = productUids[i];
      const result = await processSingleProduct(uid, options, (imgProgress) => {
        if (onProgress) onProgress(job, imgProgress);
        db.sseBroadcast('image-pipe-progress', { jobId, ...job, currentProduct: uid });
      });
      job.results.push(result);
      job.completedProducts++;
      if (onProgress) onProgress(job);
    }
    job.status = 'completed';
  } catch (err) {
    job.status = 'failed';
    job.errors.push(err.message);
  }

  db.sseBroadcast('image-pipe-complete', job);
  return job;
}

/**
 * 处理单个商品
 */
async function processSingleProduct(uid, options, onImageProgress) {
  // 1. 读取商品数据
  const row = db.getOne('SELECT * FROM products WHERE uid = ? AND deleted = 0', [uid]);
  if (!row) return { product_uid: uid, status: 'error', error: '商品不存在' };

  const parsed = db.parseRow(row);
  const result = { product_uid: uid, status: 'processing', images_processed: 0, images_cleaned: 0, images_labeled: 0 };

  // 2. 提取尺寸(标尺寸用)
  let sizeText = null;
  if (options.addSizeLabel && parsed.skus && parsed.skus.length) {
    const maxDims = sizeLabel.getMaxDimensions(parsed.skus);
    if (maxDims) sizeText = sizeLabel.dimensionsToText(maxDims);
  }

  // 3. 遍历每个图片字段
  for (const field of options.imageTypes) {
    const images = parsed[field]; // 如 ["url1", "url2"]
    if (!Array.isArray(images) || !images.length) continue;

    result[field] = { original: images.length, processed: 0, cleaned: 0, labeled: 0 };
    const newImages = [...images]; // 复制数组

    for (let idx = 0; idx < images.length; idx++) {
      const url = images[idx];
      if (!url || !/^https?:\/\//i.test(url)) continue; // 跳过非URL(如已处理过的本地URL)

      try {
        // 下载图片
        let imgBuf = await textCleaner.downloadImage(url);

        // 去中文
        let cleaned = false;
        if (options.cleanChinese) {
          const cleanResult = await textCleaner.cleanImage(imgBuf, {
            chineseOnly: options.chineseOnly,
            minConfidence: options.minConfidence,
            dilatePx: options.dilatePx
          });

          if (cleanResult.cleaned && cleanResult.imageBuffer) {
            imgBuf = cleanResult.imageBuffer;
            cleaned = true;
            result[field].cleaned++;
            result.images_cleaned++;
          } else if (options.skipNoText && !cleanResult.detected) {
            // 无中文, 跳过(不生成副本)
            if (onImageProgress) onImageProgress({ field, idx, status: 'skipped' });
            continue;
          }
        }

        // 标尺寸
        if (sizeText && options.addSizeLabel) {
          imgBuf = await sizeLabel.addSizeLabel(imgBuf, {
            text: sizeText,
            template: options.sizeLabelTemplate
          });
          result[field].labeled++;
          result.images_labeled++;
        }

        // 保存处理后图片
        const filename = 'pipe_' + uid.substring(0, 8) + '_' + field + '_' + idx + '_' + Date.now() + '.png';
        fs.writeFileSync(path.join(UPLOADS_DIR, filename), imgBuf);
        const newUrl = '/uploads/' + filename;

        // 记录原始URL(回滚用)
        db.run(
          'INSERT OR REPLACE INTO processed_images_log (product_uid, field, index_in_array, original_url, processed_url, operation) VALUES (?, ?, ?, ?, ?, ?)',
          [uid, field, idx, url, newUrl, options.addSizeLabel ? 'both' : 'clean_chinese']
        );

        newImages[idx] = newUrl;
        result[field].processed++;
        result.images_processed++;

        if (onImageProgress) onImageProgress({ field, idx, status: 'done', cleaned, labeled: !!sizeText });
      } catch (err) {
        console.error('[管道] 处理图片失败:', uid, field, idx, err.message);
        if (onImageProgress) onImageProgress({ field, idx, status: 'error', error: err.message });
      }
    }

    // 更新商品的图片字段
    const fieldColMap = { main_images: 'mainImages', desc_images: 'descImages', detail_images: 'detailImages' };
    const fieldName = fieldColMap[field];
    if (fieldName && newImages !== images) {
      db.db.run('UPDATE products SET ' + field + ' = ?, updated_at = CURRENT_TIMESTAMP WHERE uid = ?', [JSON.stringify(newImages), uid]);
      db.scheduleSave();
    }
  }

  result.status = 'completed';
  return result;
}

/**
 * 回滚商品到原图
 */
function revertProduct(uid) {
  const logs = db.getAll('SELECT * FROM processed_images_log WHERE product_uid = ? ORDER BY field, index_in_array', [uid]);
  if (!logs || !logs.length) return { ok: true, reverted: false, message: '无处理记录' };

  // 按字段分组还原
  const fieldUrls = {};
  for (const log of logs) {
    if (!fieldUrls[log.field]) fieldUrls[log.field] = {};
    fieldUrls[log.field][log.index_in_array] = log.original_url;
  }

  // 读取当前图片
  const row = db.getOne('SELECT main_images, desc_images, detail_images FROM products WHERE uid = ?', [uid]);
  if (!row) return { ok: false, error: '商品不存在' };

  let updated = 0;
  const fieldColMap = { 'main_images': 'main_images', 'desc_images': 'desc_images', 'detail_images': 'detail_images' };

  for (const [field, urls] of Object.entries(fieldUrls)) {
    const current = JSON.parse(row[field] || '[]');
    for (const [idx, origUrl] of Object.entries(urls)) {
      const i = parseInt(idx);
      if (i < current.length) {
        current[i] = origUrl;
        updated++;
      }
    }
    db.db.run('UPDATE products SET ' + field + ' = ?, updated_at = CURRENT_TIMESTAMP WHERE uid = ?', [JSON.stringify(current), uid]);

    // 删除处理后的本地文件
    const logsForField = logs.filter(l => l.field === field);
    for (const log of logsForField) {
      try {
        const filePath = path.join(UPLOADS_DIR, log.processed_url.replace('/uploads/', ''));
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch (e) {}
    }

    // 清除log
    db.run('DELETE FROM processed_images_log WHERE product_uid = ? AND field = ?', [uid, field]);
  }

  db.scheduleSave();
  db.sseBroadcast('image-pipe-revert', { uid, reverted: true });
  return { ok: true, reverted: true, images_reverted: updated };
}

module.exports = { batchProcess, processSingleProduct, revertProduct, jobs };
```

### 8.2 server.js 注册路由

在 `server.js` 中, 现有路由注册之后添加:

```javascript
// 图片处理管道
app.use('/api/image-pipe', require('./routes/image-pipe'));
```

位置: 在 `app.use('/api/sync', require('./routes/sync'));` 之后。

---

## 九、已知风险和注意事项

### 9.1 性能风险

| 风险 | 严重度 | 应对 |
|------|--------|------|
| LaMa 推理慢(每张2-5秒CPU) | 中 | 串行处理, 一次只处理一张图; 提供跳过无中文图片选项 |
| OCR 检测慢(首次3-5秒加载模型) | 低 | PaddleOCR 模型常驻, 首次后热启动; 服务已实现自动启动 |
| 大量并发处理吃内存 | 中 | 串行队列, 同一时间只处理一张图; cleanup 定期清理旧文件 |
| 1688图片URL过期/防盗链 | 低 | 现有 proxy-image 已处理302重定向和 Referer 伪装 |

### 9.2 准确性风险

| 风险 | 严重度 | 应对 |
|------|--------|------|
| OCR误检非水印文字(如产品本身含中文品牌名) | 高 | 提供 `skipNoText` 选项; 用户可在处理前预览检测结果; 处理后支持一键回滚 |
| LaMa修复区域有伪影 | 中 | 现有渐变mask混合(blur=8)已大幅降低; 可调 dilatePx 控制修复范围 |
| 尺寸标注位置遮挡主体 | 低 | 提供多模板位置; 字号自适应图片大小 |

### 9.3 部署风险

| 风险 | 严重度 | 应对 |
|------|--------|------|
| PaddleOCR 未安装(Python环境缺失) | 中 | 现有 server.js 已检测并跳过; 管道API返回服务不可用状态 |
| lama.onnx 模型文件缺失 | 低 | 文件已在 models/ 中(92MB); 提供 isModelAvailable() 检查 |
| 磁盘空间(处理后图片累积) | 低 | 现有 cleanup.js 已实现30天过期删除+按日期归档 |

### 9.4 业务风险

| 风险 | 严重度 | 应对 |
|------|--------|------|
| 批量处理后图片质量不符合预期 | 中 | 提供回滚机制; 建议先单张预览再批量处理 |
| 标尺寸数据(SKU dimensions)不准确 | 中 | 取所有SKU中最大尺寸; 用户可在处理前确认 |

### 9.5 实现注意事项

1. **图片URL判断**: 已处理过的本地URL(以 `/uploads/` 开头)应跳过, 不重复处理
2. **SSE广播**: 利用现有 `db.sseBroadcast()` 机制推送进度, 前端已有 SSE 客户端(`GET /api/events`)
3. **错误隔离**: 单张图片处理失败不影响其他图片和商品
4. **幂等性**: 重复处理同一商品时, processed_images_log 的 UNIQUE 约束防止重复记录
5. **sharp text rendering**: SVG 中 `<text>` 的宽度是预估值(CJK vs Latin), 实际渲染可能有微小偏差。如果精度要求高, 可用 `opentype.js` 做精确测量, 但第一期 SVG 方案足够
6. **内存管理**: 大图(>4000px)处理时注意 sharp 的流式处理, 避免一次性加载多张大图到内存

---

## 十、第二期展望（不在本期范围）

| 功能 | 说明 |
|------|------|
| DXM 工作流深度集成 | 自动填表时自动触发去中文+标尺寸, 无需手动操作 |
| 浏览器端预览 | 在管理页面显示处理前后对比 |
| 智能检测(PaddleOCR之外) | 智谱GLM多模态检测非中文字水印/LOGO |
| 模板系统 | 更丰富的尺寸标注模板(渐变、描边、角标等) |
| 批量水印添加 | 店铺统一水印 |
| GPU加速 | onnxruntime-node 支持 CUDA, 提升 LaMa 推理速度 |
| 大图LaMa | 当前 512×512 足够水印修复; 如需大面积修复可升级 big-lama |
