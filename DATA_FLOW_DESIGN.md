# 1688 采集 → 店小蜜回填 方案设计

## 需求概述

1. **1688 页面**：采集商品数据（标题、图片、SKU、价格、尺寸、重量等），保存到服务器
2. **店小蜜页面**：从服务器获取已采集的数据，自动回填到表单

## 整体架构

```
1688 页面                    你的服务器                 店小蜜页面
┌─────────┐   POST /api/save   ┌─────┐   GET /api/data   ┌─────────┐
│ 采集脚本 │ ──────────────────→│ 服务 │←────────────────── │ 回填脚本 │
│ (content)│                    │  器  │                    │ (content)│
└─────────┘                    └─────┘                    └─────────┘
```

---

## 方案对比

### 方案 A：自有服务器 + 数据库（推荐长期方案）

| 项     | 说明                                     |
| ------ | ---------------------------------------- |
| 后端   | Node.js / Python Flask，单个接口文件即可 |
| 数据库 | SQLite（最简单）或 MySQL                 |
| 存储   | 图片保留 1688 URL，不下载，无需 OSS      |
| 优点   | 数据持久化、多设备共享、可扩展           |
| 缺点   | 需要服务器、需要部署维护                 |

**数据表设计（极简版）**：

```sql
CREATE TABLE products (
  id INTEGER PRIMARY KEY,
  source_url TEXT,          -- 1688 商品URL
  title TEXT,               -- 标题
  images TEXT,              -- 图片URL列表，JSON数组
  attrs TEXT,               -- 变种属性值列表，JSON数组
  skus TEXT,                -- SKU数据，JSON数组
  price REAL,               -- 价格
  dimensions TEXT,          -- 尺寸，JSON数组 [长,宽,高]
  weight REAL,              -- 重量
  created_at DATETIME
);
```

**接口设计**：

```
POST /api/product          → 保存采集数据（1688 页面调用）
GET  /api/product/latest   → 获取最近一条（店小蜜页面调用）
GET  /api/product/:id      → 按ID获取
```

### 方案 B：自有服务器 + 无数据库（JSON 文件）

| 项   | 说明                                 |
| ---- | ------------------------------------ |
| 后端 | Node.js，读写 JSON 文件              |
| 存储 | 数据存 `data/products.json`          |
| 优点 | 零配置、无需数据库、快速搭建         |
| 缺点 | 并发写入可能丢数据、数据量大时性能差 |

**后端仅需一个文件**（~30行）：

```javascript
// server.js
const express = require('express');
const fs = require('fs');
const app = express();
app.use(express.json());

const DATA_FILE = 'data.json';

app.post('/api/product', (req, res) => {
  const products = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8') || '[]');
  products.unshift({
    id: Date.now(),
    ...req.body,
    created_at: new Date().toISOString()
  });
  fs.writeFileSync(DATA_FILE, JSON.stringify(products, null, 2));
  res.json({ ok: true });
});

app.get('/api/product/latest', (req, res) => {
  const products = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8') || '[]');
  res.json(products[0] || null);
});

app.listen(3000);
```

### 方案 C：无服务器（Chrome Storage 本地存储）

| 项   | 说明                                        |
| ---- | ------------------------------------------- |
| 存储 | Chrome `chrome.storage.local`               |
| 优点 | 零成本、无需服务器、最快实现                |
| 缺点 | 数据仅存本机、容量限制 10MB、换电脑数据丢失 |

**实现**：

```javascript
// 1688 页面采集后保存
chrome.storage.local.set({ latestProduct: productData });

// 店小蜜页面读取
chrome.storage.local.get('latestProduct', (data) => {
  // data.latestProduct 就是采集的数据
});
```

---

## 推荐路线

**分两步走**：

### 第一步：先用方案 C（本地存储）快速验证

- 改动最小，只需在 manifest.json 添加 `"storage"` 权限
- 1688 采集脚本 `grab-core.js` 末尾加 `chrome.storage.local.set()`
- 店小蜜填表脚本 `dxm-sku-table.js` 开头改 `getMockData()` 为从 storage 读取
- **当天可用，零成本**

### 第二步：按需升级到方案 B 或 A

- 当需要多设备共享、数据管理时再搭服务器
- 方案 B（JSON文件）适合个人使用，一台轻量服务器即可
- 方案 A（SQLite）适合数据量增长后

---

## Chrome 扩展改动清单

无论哪种方案，扩展改动一致：

### 1. manifest.json 增加权限

```json
{
  "permissions": ["activeTab", "scripting", "storage"]
}
```

方案 A/B 额外需要 host_permissions：

```json
{
  "host_permissions": ["https://your-server.com/*"]
}
```

### 2. 1688 采集端（新增或修改）

在 `sites/1688/grab-core.js` 采集完成后，将数据结构化为统一格式并保存：

```javascript
// 采集完成后
var productData = {
  sourceUrl: location.href,
  title: document.title,
  images: imageUrls,        // ['https://...', ...]
  attrs: attrValues,        // ['红色', '蓝色', ...]
  skus: [
    { image: '...', sku: '...', price: '35.69', dimensions: [10,8,5], weight: 15 },
    ...
  ]
};

// 方案 C：本地存储
chrome.storage.local.set({ latestProduct: productData });

// 方案 A/B：发送到服务器
fetch('https://your-server.com/api/product', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(productData)
});
```

### 3. 店小蜜回填端（修改 dxm-sku-table.js）

将 `getMockData()` 替换为实际数据获取：

```javascript
// 方案 C：从本地存储读取
function loadData(cb) {
  chrome.storage.local.get('latestProduct', function (data) {
    cb(data.latestProduct);
  });
}

// 方案 A/B：从服务器获取
function loadData(cb) {
  fetch('https://your-server.com/api/product/latest')
    .then(function (r) {
      return r.json();
    })
    .then(cb);
}
```

---

## 总结

| 方案 | 服务器 | 数据库 | 成本 | 多设备 | 复杂度 |
| ---- | ------ | ------ | ---- | ------ | ------ |
| A    | 需要   | SQLite | 低   | 支持   | 中     |
| B    | 需要   | 无     | 低   | 支持   | 低     |
| C    | 不需要 | 不需要 | 零   | 不支持 | 最低   |

**建议**：先用方案 C 跑通整个流程，再根据需求升级。
