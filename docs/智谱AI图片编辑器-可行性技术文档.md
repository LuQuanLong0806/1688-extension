# 智谱AI图片编辑器 — 适配当前项目可行性技术文档

## 一、当前项目架构概览

### 1.1 技术栈

| 层级 | 现有技术 | 版本 |
|------|----------|------|
| 前端框架 | Vue.js 2.x + iView 4.7 | CDN 引入 |
| 图片编辑器 | TUI Image Editor 3.15.3 + Fabric.js 4.6.0 | CDN 引入 |
| 后端 | Node.js + Express 4.18 | 本地运行 |
| 数据库 | sql.js（SQLite WASM） | 本地文件 |
| 依赖管理 | npm | server/package.json |

### 1.2 现有编辑器基础设施

项目已具备两个图片编辑器组件：

| 组件 | 文件 | 用途 |
|------|------|------|
| `image-editor-modal` | `server/public/js/components/image-editor-modal.js` | 商品图片弹窗编辑 |
| `page-editor` | `server/public/js/components/page-editor.js` | 独立图片编辑页面 |

**已实装的AI能力**：
- `@imgly/background-removal@1.7.0` — 纯前端AI抠图，通过 jsdelivr ESM 动态导入
- `dataURLtoBlob()` / `loadBgRemovalLib()` 共享工具函数已封装

### 1.3 后端现有能力

| API路由 | 功能 | 文件 |
|---------|------|------|
| `GET /api/proxy-image` | 图片代理（解决跨域） | `server/server.js` |
| `POST /api/upload-image` | 图片上传保存 | `server/server.js` |
| `/api/products` | 商品CRUD | `server/routes/products.js` |
| `/api/settings` | 设置管理 | `server/routes/settings.js` |
| `/api/categories` | 类目映射 | `server/routes/categories.js` |
| `/api/dxm-tree` | 店小秘类目树 | `server/routes/dxm-tree.js` |

---

## 二、智谱AI核心功能可行性评估

### 2.1 AI抠图 / 去背景

#### 方案对比

| 维度 | 方案A：@imgly（已实装） | 方案B：智谱GLM图像分割 |
|------|------------------------|----------------------|
| 运行位置 | 浏览器端（WASM/ONNX） | 服务端API |
| 首次加载 | ~30MB模型下载 | 无 |
| 处理速度 | 5-15秒/张 | 1-3秒/张 |
| 准确度 | 中等（通用模型） | 高（专用分割模型） |
| 费用 | 免费 | 按量计费 |
| 网络要求 | 首次需下载模型，之后离线可用 | 每次需联网 |
| API密钥 | 无需 | 需要 |

#### 集成可行性：✅ 完全可行

**方案A（已实装）**：当前项目已集成，无需额外开发。

**方案B（智谱API）新增工作量**：

```
server/routes/ai.js          — 新增路由文件（~50行）
server/package.json          — 新增 axios 依赖
image-editor-modal.js        — 新增"智谱抠图"按钮+调用逻辑（~30行）
```

**后端路由示例**：
```javascript
// server/routes/ai.js
const express = require('express');
const router = express.Router();
const axios = require('axios');

// 智谱API密钥从settings表读取，不硬编码
router.post('/matting', async function (req, res) {
  const { image_base64 } = req.body;
  const apiKey = getSetting('zhipu_api_key'); // 从数据库读
  if (!apiKey) return res.status(400).json({ error: '未配置智谱API密钥' });

  try {
    const result = await axios.post('https://open.bigmodel.cn/api/paas/v4/images/seg', {
      image: image_base64
    }, {
      headers: { 'Authorization': 'Bearer ' + apiKey }
    });
    res.json(result.data);
  } catch (err) {
    res.status(502).json({ error: '智谱API调用失败: ' + err.message });
  }
});

module.exports = router;
```

**建议**：双方案并存。默认用免费方案A，在设置面板配置智谱API密钥后自动切换到方案B（更快更准）。

---

### 2.2 文生图（CogView-3-Flash）

#### 技术规格

| 参数 | 值 |
|------|-----|
| 模型 | CogView-3-Flash |
| 输入 | 文本prompt |
| 输出 | 1024×1024 图片URL |
| 响应时间 | 3-8秒 |
| 费用 | 免费额度（新用户赠送），超出约0.01元/张 |
| API端点 | `POST https://open.bigmodel.cn/api/paas/v4/images/generations` |

#### 集成可行性：✅ 可行

**新增工作量**：

| 文件 | 改动 | 工作量 |
|------|------|--------|
| `server/routes/ai.js` | 新增 `/api/ai/text-to-image` 路由 | ~30行 |
| `server/server.js` | 注册路由 `app.use('/api/ai', require('./routes/ai'))` | 1行 |
| `server/package.json` | 新增 `axios` 依赖 | 1行 |
| 前端编辑器 | 新增"AI文生图"按钮 + prompt输入框 + 画布插入 | ~50行 |
| 设置面板 | 新增"智谱API密钥"配置项 | ~20行 |

**后端路由核心代码**：
```javascript
router.post('/text-to-image', async function (req, res) {
  const { prompt, size } = req.body;
  const apiKey = getSetting('zhipu_api_key');

  const result = await axios.post('https://open.bigmodel.cn/api/paas/v4/images/generations', {
    model: 'cogview-3-flash',
    prompt: prompt,
    size: size || '1024x1024'
  }, {
    headers: { 'Authorization': 'Bearer ' + apiKey }
  });

  // result.data.data[0].url 是生成的图片URL
  res.json({ url: result.data.data[0].url });
});
```

**注意事项**：
- 生成的图片URL有时效性，需下载保存到本地（复用现有 `/api/upload-image` 或后端直接下载）
- 电商场景实用性中等，更适合生成背景图/装饰图
- prompt质量直接影响效果，建议内置电商模板prompt

---

### 2.3 图生图（CogView-4）

#### 技术规格

| 参数 | 值 |
|------|-----|
| 模型 | CogView-4 |
| 输入 | 文本prompt + 参考图片 |
| 输出 | 1024×1024 图片URL |
| 响应时间 | 5-15秒 |
| 费用 | 按量计费，约0.05-0.1元/张 |
| API端点 | `POST https://open.bigmodel.cn/api/paas/v4/images/generations` |

#### 集成可行性：⚠️ 可行但需验证效果

**与文生图共享同一API端点**，区别在于请求体包含 `image` 参数：

```javascript
router.post('/image-to-image', async function (req, res) {
  const { prompt, image_base64, size } = req.body;
  const apiKey = getSetting('zhipu_api_key');

  const result = await axios.post('https://open.bigmodel.cn/api/paas/v4/images/generations', {
    model: 'cogview-4',
    prompt: prompt,
    image: image_base64,  // 参考图
    size: size || '1024x1024'
  }, {
    headers: { 'Authorization': 'Bearer ' + apiKey }
  });

  res.json({ url: result.data.data[0].url });
});
```

**风险点**：
1. **产品细节丢失**：图生图本质是"重绘"，LOGO/文字/精细图案可能变形
2. **适用场景有限**：适合换背景、换风格，不适合需要保留精确内容的场景
3. **费用较高**：CogView-4 单价是 Flash 的5-10倍

**建议**：先实现文生图验证API连通性，图生图作为进阶功能，需要实际测试效果后再决定是否上线。

---

### 2.4 一键复制到剪贴板（直粘店小秘）

#### 技术规格

| 技术 | API | 兼容性 |
|------|-----|--------|
| 剪贴板写入 | `navigator.clipboard.write([new ClipboardItem({...})])` | Chrome 76+, Edge 79+ |
| 图片格式 | `image/png` Blob | 通用 |

#### 集成可行性：✅ 完全可行，工作量极小

**代码实现**（~15行，可直接加入现有编辑器）：
```javascript
async function copyToClipboard() {
  var dataUrl = this.editor.toDataURL({ format: 'png' });
  var blob = await (await fetch(dataUrl)).blob();
  await navigator.clipboard.write([
    new ClipboardItem({ 'image/png': blob })
  ]);
  this.$Message.success('已复制！打开店小秘 Ctrl+V 粘贴');
}
```

**前提条件**：
- 页面需在 HTTPS 或 localhost 下运行（当前项目已是 localhost:3000）
- 浏览器需授予剪贴板权限
- 编辑器已有 `toDataURL()` 导出能力

---

## 三、集成架构设计

### 3.1 新增文件清单

```
server/
  routes/
    ai.js                    # 新增：智谱AI代理路由
  server.js                  # 修改：注册ai路由
  package.json               # 修改：新增axios依赖

server/public/js/components/
  image-editor-modal.js      # 修改：新增AI按钮
  page-editor.js             # 修改：新增AI按钮

docs/
  智谱AI图片编辑器-可行性技术文档.md  # 本文档
```

### 3.2 API设计

| 方法 | 路径 | 功能 | 请求体 |
|------|------|------|--------|
| POST | `/api/ai/text-to-image` | 文生图 | `{ prompt, size }` |
| POST | `/api/ai/image-to-image` | 图生图 | `{ prompt, image_base64, size }` |
| POST | `/api/ai/matting` | AI抠图 | `{ image_base64 }` |
| GET  | `/api/ai/quota` | 查询余额 | — |

### 3.3 设置项设计

在现有 settings 表中新增：

| key | 说明 | 示例值 |
|-----|------|--------|
| `zhipu_api_key` | 智谱API密钥 | `abc123xxx.yyy` |
| `ai_default_model` | 默认文生图模型 | `cogview-3-flash` |
| `ai_matting_provider` | 抠图方案 | `local` / `zhipu` |

### 3.4 前端交互流程

```
用户点击"AI文生图"按钮
  → 弹出prompt输入框（可选预设模板）
  → 调用 POST /api/ai/text-to-image
  → 返回图片URL
  → 通过 /api/proxy-image 加载到编辑器画布
  → 用户继续编辑 / 保存 / 复制到剪贴板
```

---

## 四、依赖与成本

### 4.1 新增依赖

| 包名 | 用途 | 大小 |
|------|------|------|
| `axios` | HTTP请求智谱API | ~200KB |

仅需一个新依赖，当前项目后端未使用axios（现有proxy直接用http模块），但axios对API调用更便捷。

### 4.2 智谱API费用参考

| 模型 | 单价 | 免费额度 |
|------|------|----------|
| CogView-3-Flash | ~0.01元/张 | 新用户赠送token |
| CogView-4 | ~0.05-0.1元/张 | 无 |
| GLM图像分割 | 按量计费 | 需确认 |

**预估月成本**：日均处理50张图 → 文生图约0.5元/天 → 月均15元（仅Flash模型）

---

## 五、风险评估

| 风险 | 等级 | 应对 |
|------|------|------|
| 智谱API密钥泄露 | 中 | 后端代理，密钥存数据库不暴露前端 |
| API余额耗尽 | 低 | 设置面板显示余额，阈值告警 |
| 生成图片质量不稳定 | 中 | 提供多次生成+选最佳，内置prompt模板 |
| CogView-4效果不如预期 | 中 | 先验证后上线，保留回退方案 |
| 图片URL时效性 | 低 | 后端下载保存到本地uploads |
| axios未安装 | 无 | `npm install axios`，一个命令 |

---

## 六、实施优先级

| 优先级 | 功能 | 工作量 | 价值 |
|--------|------|--------|------|
| P0 | 一键复制到剪贴板 | 0.5小时 | ⭐⭐⭐⭐⭐ |
| P1 | 智谱AI抠图（方案B） | 2小时 | ⭐⭐⭐⭐⭐ |
| P1 | 智谱API密钥设置面板 | 1小时 | ⭐⭐⭐⭐⭐ |
| P2 | AI文生图（CogView-3-Flash） | 3小时 | ⭐⭐⭐ |
| P3 | AI图生图（CogView-4） | 2小时 | ⭐⭐⭐ |
| P3 | Prompt模板库 | 2小时 | ⭐⭐ |

**P0+P1 总工作量约3.5小时**，即可完成核心AI能力集成。

---

## 七、结论

当前项目已具备完整的图片编辑器基础设施（TUI Editor + 画布编辑 + AI抠图 + 图片上传/代理），集成智谱AI只需：

1. **后端新增1个路由文件** `server/routes/ai.js`（~100行）
2. **后端新增1个依赖** `axios`
3. **前端编辑器新增3个按钮**（文生图/图生图/智谱抠图）
4. **设置面板新增API密钥配置**

架构完全兼容，无需重构，不影响现有功能。建议按P0→P1→P2顺序实施。

---

## 八、TUI Image Editor 现有问题分析

### 8.1 核心问题

当前项目使用 TUI Image Editor 作为图片编辑器，在实际使用中暴露以下问题：

| 问题 | 具体表现 | 严重程度 |
|------|----------|----------|
| **操作复杂** | 底部菜单9个tab（裁剪/翻转/旋转/画笔/形状/图标/文字/蒙版/滤镜），每个tab下2-6个子操作，层级深，找功能困难 | ⭐⭐⭐⭐⭐ |
| **缺少核心功能** | 无文字消除、无AI去背景换背景、无智能裁剪、无图片拼接 | ⭐⭐⭐⭐⭐ |
| **编辑器定位不符** | TUI是通用图片编辑器，电商场景80%的功能用不到，20%的核心功能反而没有 | ⭐⭐⭐⭐ |
| **UI笨重** | 底部菜单栏占大量空间，编辑区域被压缩，操作按钮密集 | ⭐⭐⭐ |
| **加载慢** | TUI Editor + Fabric.js CDN包约2MB，首屏加载慢 | ⭐⭐ |
| **主题定制受限** | 黑色主题需手动配置30+个CSS变量，且无法完全自定义布局 | ⭐⭐ |

### 8.2 与店小秘小秘美图对比

| 功能 | 店小秘小秘美图 | 当前TUI编辑器 | 差距 |
|------|---------------|--------------|------|
| AI抠图/去背景 | ✅ 一键操作 | ✅ 已实现（@imgly） | 持平 |
| 文字消除 | ✅ 涂抹消除 | ❌ 无 | 缺失 |
| 智能裁剪 | ✅ 1:1/4:3/16:9/800x800预设 | ⚠️ 有裁剪但无电商预设 | 不足 |
| 添加文字 | ✅ 简单直观 | ✅ 有但操作路径深 | 不足 |
| 换背景 | ✅ 纯色/渐变/图片背景 | ❌ 无 | 缺失 |
| 图片拼接 | ✅ 横拼/竖拼 | ❌ 无 | 缺失 |
| 水印添加 | ✅ 一键添加店铺水印 | ✅ 有文字功能但非专门 | 不足 |
| 操作体验 | 工具栏一目了然 | 底部9tab菜单层级深 | 差距大 |
| 复制粘贴 | ✅ 一键复制到剪贴板 | ❌ 无 | 缺失 |

---

## 九、小秘美图风格改造方案

### 9.1 改造策略

**废弃 TUI Image Editor，基于 Fabric.js 自建轻量电商图片编辑器。**

理由：
- TUI Editor 底层就是 Fabric.js，直接用 Fabric.js 更灵活、更轻量
- 自建UI可完全对标店小秘小秘美图的交互模式
- 电商场景功能明确，不需要通用编辑器的复杂度
- 保留现有 `@imgly/background-removal` 抠图能力 + 智谱AI能力

### 9.2 编辑器架构

```
┌─────────────────────────────────────────────────────┐
│  工具栏（顶部，横向排列，图标+文字，一目了然）          │
│  [裁剪] [旋转] [文字] [消除] [抠图] [换背景] [滤镜]   │
├───────────────────────────────────┬──────────────────┤
│                                   │  右侧属性面板     │
│                                   │  (根据选中工具     │
│       画布区域                     │   动态显示)       │
│    (Fabric.js Canvas)             │                  │
│                                   │  裁剪: 预设比例   │
│                                   │  文字: 字号/颜色   │
│                                   │  消除: 画笔大小   │
│                                   │  滤镜: 亮度/对比度 │
│                                   │                  │
├───────────────────────────────────┴──────────────────┤
│  底部操作栏                                           │
│  [撤销] [重做]  |  [复制到剪贴板] [保存] [下载]         │
└─────────────────────────────────────────────────────┘
```

### 9.3 核心功能实现方案

#### 9.3.1 文字消除（涂抹修复）

**实现原理**：用户涂抹要消除的区域 → 将涂抹区域发送给AI → AI用周围像素填充修复

| 方案 | 技术 | 效果 | 成本 |
|------|------|------|------|
| 方案A：智谱AI Inpainting | 发送图片+mask给智谱API | 高（AI智能填充） | ~0.05元/次 |
| 方案B：前端Canvas修复 | 用周围像素做简单插值/克隆 | 中（适合纯色背景） | 免费 |

**推荐**：双方案组合。纯色/简单背景用方案B（即时），复杂背景用方案A（AI修复）。

**方案B核心代码思路**：
```javascript
// Fabric.js 画布上创建涂抹层
// 用户涂抹后生成 mask（黑白图）
// 对mask区域用周围像素做高斯模糊填充
// 适用于白底/纯色底商品图（占电商图片80%+）
```

**方案A后端路由**：
```javascript
router.post('/inpaint', async function (req, res) {
  const { image_base64, mask_base64 } = req.body;
  // 智谱 CogView-4 或专用 inpainting 模型
  const result = await axios.post('https://open.bigmodel.cn/api/paas/v4/images/generations', {
    model: 'cogview-4',
    prompt: 'clean background, remove text, fill with surrounding texture',
    image: image_base64,
    mask: mask_base64
  }, { headers: { 'Authorization': 'Bearer ' + apiKey } });
  res.json({ url: result.data.data[0].url });
});
```

#### 9.3.2 智能裁剪

**实现**：Fabric.js + 预设比例框

```
预设比例选项（电商常用）：
┌────────┐ ┌─────┐ ┌──────┐ ┌──────────┐
│  1:1   │ │ 4:3 │ │ 16:9 │ │ 800×800  │
│ 正方形  │ │ 3:4 │ │ 9:16 │ │ 750×1000 │
└────────┘ └─────┘ └──────┘ └──────────┘
用户也可自由拖拽裁剪框
```

**Fabric.js实现**：创建可拖拽/调整大小的矩形overlay，确定后裁剪画布。

#### 9.3.3 换背景

| 背景 | 实现 |
|------|------|
| 纯色填充 | Fabric.js `canvas.setBackgroundColor()` |
| 渐变 | Fabric.js `new fabric.Gradient()` |
| 自定义图片 | 抠图后设置底层图片 |
| AI换背景 | 抠图 + 智谱图生图生成新背景 |

#### 9.3.4 添加文字

**Fabric.js原生支持**，简化交互：
- 工具栏点"文字" → 点击画布输入
- 右侧面板调整：字号/颜色/字体/对齐/描边
- 预设样式：促销标签/价格标签/标题模板

#### 9.3.5 滤镜/调色

Fabric.js 内置滤镜：
- 亮度 (Brightness)
- 对比度 (Contrast)
- 饱和度 (Saturation)
- 锐化 (Sharpen)
- 模糊 (Blur)

右侧面板用滑块控件，实时预览。

#### 9.3.6 一键复制到剪贴板

```javascript
async function copyToClipboard() {
  var dataUrl = canvas.toDataURL({ format: 'png' });
  var blob = await (await fetch(dataUrl)).blob();
  await navigator.clipboard.write([
    new ClipboardItem({ 'image/png': blob })
  ]);
}
```

### 9.4 技术选型

| 技术 | 版本 | 引入方式 | 用途 |
|------|------|----------|------|
| Fabric.js | 4.6.0 | CDN（已引入） | 画布核心 |
| Vue.js 2.x | — | CDN（已引入） | UI框架 |
| iView 4.7 | — | CDN（已引入） | UI组件 |
| @imgly/background-removal | 1.7.0 | ESM动态导入（已引入） | 前端AI抠图 |

**无需引入任何新的前端库。** Fabric.js 已包含在现有项目中（TUI Editor依赖），改造后反而可以移除 TUI Editor 的CDN引用，减少约1.5MB加载量。

### 9.5 文件变更清单

```
废弃/替换：
  server/public/js/components/image-editor-modal.js    # 重写为自建编辑器
  server/public/js/components/page-editor.js           # 重写为自建编辑器
  server/public/css/image-editor.css                   # 重写样式
  index.html 中移除 TUI Image Editor CDN 引用          # 减少加载量

新增：
  server/public/js/components/meitu-editor.js          # 核心编辑器组件（~500行）
  server/public/js/components/meitu-tools.js           # 工具面板组件（~300行）
  server/public/css/meitu-editor.css                   # 编辑器专用样式（~200行）
  server/routes/ai.js                                  # 智谱AI后端路由（~100行）

修改：
  server/server.js                                     # 注册ai路由
  server/package.json                                  # 新增axios
  server/public/index.html                             # 更新脚本引用
```

### 9.6 新编辑器组件结构

```javascript
// meitu-editor.js — 核心编辑器
Vue.component('meitu-editor', {
  props: ['imageUrl', 'productId', 'field', 'index'],
  data: function () {
    return {
      canvas: null,          // Fabric.js 实例
      activeTool: 'select',  // 当前选中工具
      history: [],           // 撤销栈
      redoStack: [],         // 重做栈
      // 工具配置
      cropRatio: '',         // 裁剪比例
      brushSize: 20,         // 消除画笔大小
      textConfig: {},        // 文字配置
      filterConfig: {},      // 滤镜配置
      // AI状态
      aiProcessing: false,
      aiProgress: ''
    };
  },
  methods: {
    // 基础操作
    initCanvas: function () { /* Fabric.js 初始化 */ },
    loadImage: function (url) { /* 加载图片到画布 */ },
    undo: function () { /* 从history恢复 */ },
    redo: function () { /* 从redoStack恢复 */ },
    saveHistory: function () { /* 保存快照 */ },

    // 工具操作
    startCrop: function () { /* 显示裁剪框 */ },
    applyCrop: function () { /* 执行裁剪 */ },
    rotateImage: function (deg) { /* 旋转 */ },
    flipImage: function (dir) { /* 翻转 */ },

    // 文字
    addText: function () { /* Fabric.js Textbox */ },

    // 消除
    startErase: function () { /* 涂抹模式 */ },
    applyErase: function () { /* 前端修复 或 调AI */ },

    // AI功能
    removeBg: function () { /* @imgly 或 智谱API抠图 */ },
    changeBg: function (color) { /* 换背景色 */ },
    aiInpaint: function () { /* 智谱AI修复 */ },

    // 导出
    copyToClipboard: function () { /* 剪贴板 */ },
    saveToServer: function () { /* 上传保存 */ },
    downloadImage: function () { /* 本地下载 */ }
  },
  template: `
    <div class="meitu-editor">
      <div class="meitu-toolbar">
        <!-- 顶部工具栏，7个核心工具 -->
      </div>
      <div class="meitu-main">
        <div class="meitu-canvas-wrap">
          <canvas id="meitu-canvas"></canvas>
        </div>
        <div class="meitu-panel">
          <!-- 右侧属性面板，根据activeTool动态渲染 -->
        </div>
      </div>
      <div class="meitu-footer">
        <!-- 底部操作栏 -->
      </div>
    </div>
  `
});
```

### 9.7 UI对标设计

**对标店小秘小秘美图的交互模式**：

| 交互 | 店小秘 | 改造方案 |
|------|--------|----------|
| 工具切换 | 顶部图标栏 | 顶部图标栏，选中高亮 |
| 属性调整 | 右侧面板滑块 | 右侧面板，iView Slider组件 |
| 裁剪比例 | 预设按钮组 | 1:1 / 4:3 / 3:4 / 16:9 / 800×800 / 自定义 |
| 文字添加 | 点击画布输入 | 同上，Fabric.js Textbox |
| AI抠图 | 一键按钮 | 顶部工具栏按钮，Loading遮罩 |
| 消除 | 涂抹 → 自动修复 | 画笔涂抹 → AI修复 |
| 导出 | 底部按钮行 | 底部固定栏：撤销/重做 | 复制/保存/下载 |

### 9.8 改造工作量估算

| 阶段 | 内容 | 工作量 |
|------|------|--------|
| Phase 1：基础框架 | Fabric.js画布 + 工具栏UI + 图片加载/导出 + 撤销重做 | 4小时 |
| Phase 2：基础工具 | 裁剪(预设比例) + 旋转翻转 + 文字 + 滤镜调色 | 4小时 |
| Phase 3：AI功能 | AI抠图(迁移) + 换背景 + 文字消除(前端修复) | 4小时 |
| Phase 4：AI进阶 | 智谱AI抠图 + AI文字消除 + 文生图 + 复制到剪贴板 | 4小时 |
| Phase 5：集成测试 | 替换旧编辑器 + 弹窗/页面双场景 + 回归测试 | 2小时 |
| **总计** | | **~18小时** |

### 9.9 渐进式改造路线

无需一次性替换，可分阶段平滑过渡：

```
当前状态                    Phase 1-2                   Phase 3-5
┌──────────┐            ┌──────────────┐           ┌──────────────┐
│ TUI Editor│  ──→保留──→│ 自建编辑器v1 │  ──→替换──→│ 自建编辑器v2 │
│ (弹窗+页面)│            │ 基础裁剪/文字 │           │ 全AI功能     │
└──────────┘            │ + TUI并存    │           │ 替换TUI      │
                        └──────────────┘           └──────────────┘
```

**Phase 1-2 期间**：新增"小秘美图"菜单项，自建编辑器与TUI并存，用户可选择使用。
**Phase 3-5 完成后**：移除TUI Editor依赖，统一使用自建编辑器。

### 9.10 性能对比

| 指标 | TUI Editor（当前） | 自建编辑器（改造后） |
|------|-------------------|---------------------|
| CDN加载量 | ~2MB（TUI + Fabric） | ~0.5MB（仅Fabric） |
| 首屏渲染 | 2-4秒 | <1秒 |
| 编辑操作响应 | 200-500ms | <100ms |
| 内存占用 | ~80MB | ~30MB |
| UI渲染层级 | 3层（菜单→子菜单→面板） | 2层（工具栏→属性面板） |

---

## 十、总结与建议

### 10.1 最终建议

1. **废弃TUI Image Editor**，基于Fabric.js自建电商专用图片编辑器
2. **先做Phase 1-2**（~8小时），实现基础编辑能力，与TUI并存
3. **再做Phase 3-4**（~8小时），接入智谱AI，实现文字消除、AI抠图、换背景
4. **最后Phase 5**（~2小时），替换TUI，统一编辑器入口

### 10.2 技术风险

| 风险 | 应对 |
|------|------|
| Fabric.js API不熟悉 | TUI Editor底层就是Fabric.js，现有代码已有参考 |
| 文字消除效果不理想 | 先做简单修复（纯色背景80%场景够用），复杂场景走智谱AI |
| 自建编辑器不如TUI完善 | 分阶段迭代，Phase 1-2保留TUI作为备选 |
| 智谱API不稳定 | 保留@imgly前端抠图作为降级方案 |

### 10.3 收益

- **用户体验**：从9tab复杂菜单 → 7个核心工具一目了然
- **加载速度**：减少1.5MB CDN加载
- **核心能力**：新增文字消除、换背景、智能裁剪、剪贴板复制
- **AI能力**：智谱AI抠图/文生图/图生图无缝集成
- **维护成本**：自建代码~800行 vs TUI黑盒+30+项主题配置
