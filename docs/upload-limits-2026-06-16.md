# 服务端上传限制增强 — 讨论文档

> 日期：2026-06-16
> 状态：✅ 已实施（见"已实施清单"）

## 背景

当前 `/api/ai/image-upload` 是透明代理（OSS 优先 / ImgBB 兜底），**无任何服务端校验**：
- 全局 `express.json({ limit: '50mb' })` —— 50mb base64 ≈ 37M 原图都能上传
- 无 MIME 白名单 —— `image.exe` 改名也能传
- 无像素尺寸上限 —— 20000×20000 的图会压垮内存
- 无格式优化 —— 大图原样上传，存储/带宽双浪费
- 无限流 —— 单用户可瞬间打满 OSS 配额

调用方共 12 处（贴图/拼图/美图编辑/详情弹窗等），都依赖此接口。

## 限制项方案

### 1. 格式转换（核心需求）

**目标**：原图过大时自动转 webp 减少空间占用。

**决策**：✅ **阈值触发**（已确认）

#### 阈值模式细化（建议）

单纯按字节阈值还不够——一张 800K 的 PNG 可能像素极大（5000×5000 高压缩比），转 webp 同样能省很多。建议**双维度任一触发**：

| 维度 | 默认阈值 | 说明 |
|---|---|---|
| 字节 | 1M（1048576） | 防大文件 |
| 像素 | 400 万（2000×2000） | 防大尺寸 |

满足任一即触发转码评估。

#### 智能跳过规则（避免转坏）

阈值触发后，再按以下规则**智能跳过**：

| 原格式 | 处理 | 原因 |
|---|---|---|
| GIF | **保留** | 动图转 webp 会丢帧 |
| PNG 且有 alpha 通道 | **保留 PNG**（不转 webp） | webp alpha 兼容性参差，黑底风险 |
| PNG 且无 alpha | 转 **webp lossless** | 见下方"分格式策略" |
| JPEG | 转 **webp 有损**（quality=85） | 原格式本就有损，再编码可接受 |
| webp | **保留** | 避免重复有损 |
| BMP/TIFF | 转 **webp 有损**（quality=85） | 原格式太大，必转 |

#### 分格式策略（PNG 无损 / JPEG 有损）

电商场景下 PNG 通常是设计师精心做的设计稿（文字、色块、锐利边缘），任何有损压缩都会产生肉眼可见的伪影；而 JPEG 多为摄影图，本身已有损，再编码可接受。因此采用分格式策略：

| 格式 | webp 编码方式 | 理由 |
|---|---|---|
| PNG（无 alpha） | `webp({ lossless: true })` | 保护设计稿画质，文字/色块边缘零损失 |
| JPEG / BMP / TIFF | `webp({ quality: 85 })` | 原格式有损，q=85 视觉无明显差异但体积大幅下降 |

**验证**：测试用例 [server/__tests__/unit/upload-transform.test.js](server/__tests__/unit/upload-transform.test.js) 中 "PNG 转 webp 是无损的（解码后像素与原图一致）" 用高熵伪随机像素 PNG 验证 lossless 模式下像素级零差异。

**关键技术点**：sharp 可以同时读 metadata（含 hasAlpha / 宽高）和转码，**一次 IO 完成**，性能开销可忽略。

#### 阈值取值的依据

- **1M 字节阈值**：电商主图常见 800×800~1500×1500，PNG 编码后约 1-3M，JPEG 约 200-800K。1M 阈值能精准命中 PNG 大图（最该转的），同时放过已优化的小 JPEG。
- **400 万像素阈值**：覆盖长图（如 800×5000 = 400 万）和高清方图（2000×2000）。低于此阈值基本不会有大体积，转了收益也小。

**依赖**：`sharp`（node 原生模块，需 `npm install` + 部署环境有 libvips，**Windows 上需要 prebuild，linux 上需要 build tools**）

**替代方案**：用 `ali-oss` 的 [IM 模板/数据处理](https://help.aliyun.com/document_detail/44686.html) 在 OSS 侧转码——不引入 sharp，但只对 OSS 路径生效，ImgBB 兜底分支不享受，且 URL 会带 `?x-oss-process=image/format,webp` 查询参数。

### 2. 最大上传尺寸（默认 10M）

**校验三层**（建议都加）：

| 层 | 位置 | 实现 | 备注 |
|---|---|---|---|
| HTTP body | `express.json({ limit })` | 改全局为 `15mb`（10M 原图 + base64 膨胀 ~33% + 余量） | 超过直接 413 |
| base64 字符串 | 路由入口 | `image_base64.length * 0.75 ≤ maxBytes` | 早失败，省 decode CPU |
| 解码后 buffer | 路由入口 | `Buffer.byteLength(buf) ≤ maxBytes` | 兜底（防止 base64 padding 攻击） |

**配置项**：`upload_max_bytes`（默认 10485760），admin 可调。

**注意**：现有全局 limit 是 50mb（其他接口如 `/api/upload-image` 也吃这个），改全局会影响其他接口。建议**在 `/api/ai/image-upload` 路由单独叠加一层 limit**：
```js
router.post('/image-upload', express.json({ limit: '15mb' }), function (req, res) { ... });
```

### 3. 其他常用限制

#### 3.1 MIME 白名单

只允许：`image/png` `image/jpeg` `image/webp` `image/gif` `image/bmp`

**实现**：从 base64 头 `data:image/png;base64,` 解析 MIME，不在白名单的 400 拒绝。

#### 3.2 像素尺寸上限

防止超大图压垮内存（sharp 解码 20000×20000 RGBA ≈ 1.6GB）。

**配置项**：`upload_max_pixels`（默认 8000×8000 = 6400 万像素），超过拒绝。

**实现**：需要先解码 metadata（sharp 同样能做），无 sharp 时跳过此项。

#### 3.3 本地备份落盘开关

`server/public/uploads/oss_*.png` 和 `imgbb_*.png` 当前上传时无脑写入本地。

**决策**：✅ **维持现状**（已确认）

已验证 [server.js:267-270](server/server.js#L267-L270) 配置了 7 天自动清理（每 6 小时扫描一次），磁盘不会无限增长。本次不动。

#### 3.4 全局 body limit 处理

当前 [server.js:35](server/server.js#L35) 全局 `express.json({ limit: '50mb' })`。

**决策**：✅ **直接降全局**到 `15mb`（已确认）

修改 `app.use(express.json({ limit: '50mb' }))` → `15mb`。

**已知影响**：
- `/api/upload-image`（[server.js:132](server/server.js#L132)）路由级显式叠加了 `50mb`，**不受影响**，继续保持 50mb
- `/api/ai/image-upload` 及其他 `/api/ai/*`：隐式吃全局，同步降到 15mb。这些接口典型负载是 1-3 张图，正常不会超 15mb
- 如未来某接口报 413，给该路由单独叠加 `express.json({ limit: '...' })` 即可，无需回滚全局

#### 3.4 频率限制（暂不做）

**决策**：❌ 暂不实施（内部工具，当前未现滥用）

#### 3.5 EXIF 剥除

PNG/JPEG 可能含 GPS、相机型号等隐私信息。

**决策**：✅ **默认关**（保留拍摄信息，已确认）

**配置项**：`upload_strip_exif`（默认 `off`），admin 需要时手动开。

#### 3.6 文件名规范

当前 `Date.now() + '_' + rand + '.png'` 写死 png。建议：
- 扩展名跟随实际转换后格式（转 webp 后缀就是 `.webp`）
- OSS 路径加用户/业务前缀：`products/{date}/{userId}_{ts}.webp`，便于后续按用户清理

### 4. 批量上传

当前所有上传都是单图（一个 base64 → 一个 URL）。批量场景需要单独设计。

**应用场景**：
- 详情弹窗一次上传多张产品图
- 美图拼图多素材合成
- 采集端 SKU 多图回填
- 后续可能的批量导入功能

**两种实现路线**（择一）：

| 方案 | 描述 | 优点 | 缺点 |
|---|---|---|---|
| A. 新增批量端点 | `/api/ai/image-batch-upload` 接收数组 `[{base64}, {base64}, ...]`，服务端串行/并发处理 | 单次请求完成，前端简单 | 大批量超 HTTP 超时；中途失败整批回滚 |
| B. 复用单图端点 + 客户端循环 | 前端 for 循环调 `/api/ai/image-upload`，控制并发数 | 无需新端点；单图失败可单独重试 | 前端要写并发控制 + 进度合并 |

**推荐 B**：复用现有端点 + 客户端并发控制。理由：
- 服务端无需新逻辑（单图端点已有限制直接生效）
- HTTP 长连接在弱网下不可靠，单图调用更稳健
- 失败重试粒度小（某张失败不影响其他张）
- 进度反馈天然支持（每张完成回调一次）

但服务端仍需补充批量相关限制：

**决策**：✅ **走方案 B**（客户端循环，已确认）

批量场景不多，无需新增服务端端点。客户端负责：
- 控制并发数（建议 3-5 个并发，前端用 `p-limit` 或手写 Promise 池）
- 单张失败不影响其他张（局部 try/catch）
- 进度回报（每张完成回调，UI 显示 `已完成 N/M`）

服务端**无需为批量新增配置项**——单图端点已有的 MIME/尺寸/转码/字节限制自动生效。

## 配置存储

所有配置项统一存在 `settings` 表（沿用现有模式），**非敏感不加密**：

| key | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `upload_max_bytes` | int | 10485760 | 单图最大字节（10M） |
| `upload_max_pixels` | int | 64000000 | 单图最大像素（8000×8000） |
| `upload_format_convert` | text | `auto` | `off`/`auto`/`webp`/`jpeg` |
| `upload_convert_threshold_bytes` | int | 1048576 | 触发转换的最小字节（1M） |
| `upload_convert_threshold_pixels` | int | 4000000 | 触发转换的最小像素（400 万） |
| `upload_webp_quality` | int | 85 | webp/jpeg 质量 |
| `upload_mime_whitelist` | text | `png,jpeg,webp,gif,bmp` | 允许的 MIME 列表 |
| `upload_strip_exif` | text | `off` | 是否剥除 EXIF（默认关，保留拍摄信息） |

**管理入口**：复用现有 admin 配置接口模式，新增 `/api/upload-config` (GET/POST)，前端在云同步页或系统设置页加一块"上传配置"卡片。

## 实现复杂度

| 改动 | 文件 | 行数估算 | 风险 |
|---|---|---|---|
| 加 sharp 依赖 | package.json | +1 | Windows 部署需 prebuild binary |
| 校验+转码中间件 | server/middleware/upload-limits.js (新) | ~120 | 中（含 sharp 调用 + alpha 检测） |
| `/api/ai/image-upload` 接入 | server/routes/ai/image-gen.js | ~20 | 低 |
| 配置 API | server/routes/upload-config.js (新) | ~40 | 低 |
| admin 前端卡片 | server/public/js/components/page-api-keys.js（AI模型配置页） | ~50 | 低 |

**总计**：~230 行新代码 + 1 个新依赖。

## 待决策问题

无剩余待决策项，所有方案已确认。等待开工指令。

## 已确认决策

- ✅ **格式转换触发模式**：阈值触发（字节 1M + 像素 400 万，任一满足即触发）
- ✅ **格式转换实现**：sharp
- ✅ **格式转换智能跳过**：GIF/带 alpha 的 PNG/已是 webp 保留
- ✅ **分格式策略**：PNG → webp lossless（保护设计稿画质）；JPEG/BMP/TIFF → webp 有损 q=85
- ✅ **批量上传**：方案 B（客户端循环 + 控制并发），不新增服务端端点
- ✅ **本地备份**：维持现状（已有 7 天自动清理，验证 OK）
- ✅ **EXIF 剥除**：默认关（保留拍摄信息），admin 可手动开
- ✅ **频率限制和每日配额**：暂不实施（内部工具未现滥用）
- ✅ **全局 limit**：从 50mb 直接降到 15mb
- ✅ **管理入口**：AI模型配置页面（page-api-keys.js），紧邻 OSS 配置

## 已实施清单

| 改动 | 文件 |
|---|---|
| 加 sharp 依赖 | [package.json](package.json) |
| 转码服务（parseBase64 + checkSkip + maybeTransform） | [server/services/upload-transform.js](server/services/upload-transform.js) |
| 配置服务（9 项默认值 + 缓存） | [server/services/upload-config.js](server/services/upload-config.js) |
| 校验+转码中间件（preCheck + transformHandler） | [server/middleware/upload-limits.js](server/middleware/upload-limits.js) |
| `/api/ai/image-upload` + `/smms-upload` 接入中间件 | [server/routes/ai/image-gen.js](server/routes/ai/image-gen.js) |
| `/api/upload-config` 配置 API（admin only） | [server/routes/upload-config.js](server/routes/upload-config.js) |
| admin 前端卡片（AI模型配置页紧邻 OSS） | [server/public/js/components/page-api-keys.js](server/public/js/components/page-api-keys.js) |
| 全局 `express.json` limit 50mb → 15mb | [server/server.js](server/server.js#L35) |
| 测试 suite（4 个新文件 52 用例全过 + 旧 image-upload-routes 向后兼容） | [server/__tests__/unit/](server/__tests__/unit/) |

## 不在本次范围

- 客户端（扩展端）压缩预上传（独立话题，目前贴图按钮前端有硬编码 800px 压缩，其他调用方都没有）
- 上传去重（hash 校验是否已存在）
- 异步上传队列（当前都是同步阻塞）
- 多区域 OSS / CDN 加速
