# 商品采集服务 — 需求文档

## 一、项目概述

独立后端服务 + 管理前端，为 Chrome 扩展提供商品数据的增删改查。

```
Chrome 扩展（采集）                   商品服务（后端+前端）                Chrome 扩展（回填）
┌──────────┐   POST /api/product    ┌─────────────────────┐   GET /api/product   ┌──────────┐
│ 1688 页面 │ ─────────────────────→ │  Node.js + SQLite   │ ──────────────────→  │ 店小蜜    │
│ 采集数据  │                        │  管理页面 (同端口)   │                      │ 自动回填  │
└──────────┘                        └─────────────────────┘                      └──────────┘
                                           ↑
                                    ┌──────────────┐
                                    │ 浏览器管理页面 │
                                    │ 列表/搜索/删除 │
                                    └──────────────┘
```

---

## 二、技术栈

| 组件 | 技术 | 说明 |
|------|------|------|
| 后端 | Node.js + Express | 单文件 `server.js` |
| 数据库 | SQLite（better-sqlite3） | **无需单独安装/启动**，Node.js 自动创建 `.db` 文件 |
| 管理前端 | 纯 HTML + CSS + JS（零框架） | `public/` 目录，服务端直接托管 |
| 打包 | pkg | 编译为单个 `.exe`，双击运行 |

**SQLite 不需要单独启动数据库服务**，它是嵌入式数据库，就是一个文件。Node.js 启动时自动读写 `data.db`，进程关闭就结束，零运维。

---

## 三、项目结构（集成在 1688-extension 项目内）

```
f:/00_project/1688-extension/
├── 1688-extension/          ← build.js 生成的扩展打包目录（不含服务端）
├── sites/                   ← Chrome 扩展源码
├── server/                  ← 商品采集服务（新增）
│   ├── server.js            # 后端服务（API + 静态文件托管）
│   ├── package.json         # 服务端依赖
│   ├── public/              # 管理前端
│   │   ├── index.html       # 管理页面（列表+搜索+分页+删除+详情）
│   │   ├── style.css        # 样式
│   │   └── app.js           # 前端逻辑
│   ├── data.db              # SQLite 数据库文件（自动生成，已 gitignore）
│   ├── start.bat            # Windows 一键启动
│   └── start.sh             # Mac/Linux 一键启动
├── manifest.json
├── build.js                 ← 只打包 sites/ + rootFiles，不包含 server/
├── package.json             ← 扩展项目依赖
└── ...
```

**build.js 无需修改** — 它只复制 `sites/` 目录和 `rootFiles`（manifest.json、background.js、icon.svg），`server/` 目录不会被包含。

---

## 四、数据库设计

```sql
CREATE TABLE products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_url TEXT NOT NULL,            -- 1688 商品URL
  title TEXT,                          -- 商品标题
  main_images TEXT,                    -- 轮播图列表 JSON ["url1","url2"]
  desc_images TEXT,                    -- 描述图列表 JSON
  attrs TEXT,                          -- 变种属性值 JSON ["红色","蓝色"]
  skus TEXT,                           -- SKU数据 JSON [{image,sku,price,dimensions,weight}]
  status INTEGER DEFAULT 0,           -- 0=未使用 1=已使用
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## 五、API 设计

### 5.1 保存采集数据

```
POST /api/product
Content-Type: application/json

{
  "sourceUrl": "https://detail.1688.com/offer/123.html",
  "title": "天然水晶项链",
  "mainImages": ["https://..."],
  "descImages": ["https://..."],
  "attrs": ["红色", "蓝色"],
  "skus": [{"image":"...","sku":"SKU-1","price":"35.69","dimensions":[10,8,5],"weight":"15"}]
}

→ { "ok": true, "id": 1 }
```

### 5.2 获取商品列表（分页）

```
GET /api/product?page=1&pageSize=20&keyword=水晶&status=0

→ {
  "total": 56,
  "page": 1,
  "pageSize": 20,
  "list": [
    {
      "id": 1,
      "sourceUrl": "...",
      "title": "天然水晶项链",
      "mainImages": [...],
      "attrs": [...],
      "skus": [...],
      "status": 0,
      "createdAt": "2026-04-27T10:30:00Z"
    }
  ]
}
```

### 5.3 获取单条商品

```
GET /api/product/1

→ { "id": 1, "title": "...", ... }
```

### 5.4 获取最新一条

```
GET /api/product/latest

→ { "id": 1, ... }  或 null
```

### 5.5 更新商品

```
PUT /api/product/1
Content-Type: application/json

{ "title": "修改后的标题", "status": 1 }

→ { "ok": true }
```

### 5.6 删除商品

```
DELETE /api/product/1

→ { "ok": true }
```

### 5.7 批量删除

```
POST /api/product/batch-delete
Content-Type: application/json

{ "ids": [1, 2, 3] }

→ { "ok": true, "deleted": 3 }
```

---

## 六、管理前端

### 6.1 页面布局

```
┌──────────────────────────────────────────────────┐
│  商品采集管理                          [+ 导入URL] │
├──────────────────────────────────────────────────┤
│  搜索: [________] 状态: [全部▾] [搜索]           │
├────┬───────┬────────┬────────┬──────┬───────────┤
│ ID │ 标题  │ 属性数  │ SKU数  │ 状态 │ 操作      │
├────┼───────┼────────┼────────┼──────┼───────────┤
│ 1  │ 水晶.. │ 3个    │ 3个    │ 未用 │ 查看 删除 │
│ 2  │ 手链.. │ 2个    │ 2个    │ 已用 │ 查看 删除 │
├────┴───────┴────────┴────────┴──────┴───────────┤
│  [上一页]  第1/3页  共56条  [下一页]  [全选] [批量删除] │
└──────────────────────────────────────────────────┘
```

### 6.2 功能清单

| 功能 | 说明 |
|------|------|
| 列表展示 | ID、标题、属性数、SKU数、状态、创建时间 |
| 分页 | 默认每页 20 条，支持切换页码 |
| 搜索 | 按标题关键词模糊搜索 |
| 状态筛选 | 全部 / 未使用 / 已使用 |
| 查看详情 | 弹窗展示完整数据（图片预览、SKU 表格、属性列表） |
| 删除 | 单条删除 + 批量删除，带确认提示 |
| 标记已用 | 手动标记状态，方便区分 |
| 复制回填URL | 复制 `/api/product/{id}` 地址，粘贴到扩展配置 |

---

## 七、Chrome 扩展对接

### 7.1 manifest.json

```json
{
  "permissions": ["activeTab", "scripting", "storage"],
  "host_permissions": ["http://localhost:3000/*"]
}
```

### 7.2 扩展配置

在扩展右键菜单或配置页面增加"服务器地址"配置项：

```
服务器地址: [http://localhost:3000]
```

保存在 `chrome.storage.local`，默认 `http://localhost:3000`。

### 7.3 1688 采集端改动

```javascript
// 采集完成后
var serverUrl = 'http://localhost:3000'; // 从配置读取
fetch(serverUrl + '/api/product', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(productData)
}).then(function(r) { return r.json(); }).then(function(res) {
  console.log('保存成功, id:', res.id);
});
```

### 7.4 店小蜜回填端改动

```javascript
// 从服务器读取最新数据
var serverUrl = 'http://localhost:3000'; // 从配置读取
fetch(serverUrl + '/api/product/latest')
  .then(function(r) { return r.json(); })
  .then(function(data) {
    if (!data) { /* 提示无数据 */ return; }
    // 回填表单...
  });
```

---

## 八、本地部署

### 8.1 开发模式

```bash
cd server
npm install
npm start
# 服务启动在 http://localhost:3000
# 同时运行 npm run build 打包扩展到 1688-extension/ 目录
```

### 8.2 一键启动（开发用）

**server/start.bat（Windows）**：
```bat
@echo off
cd /d %~dp0
echo Starting Product Server...
node server.js
pause
```

**server/start.sh（Mac/Linux）**：
```bash
#!/bin/bash
cd "$(dirname "$0")"
echo "Starting Product Server..."
node server.js
```

### 8.3 打包为 EXE（分发给其他人）

在 `server/` 目录下执行：

```bash
cd server
npm install -g pkg
pkg . --targets node18-win-x64 --output product-server.exe
```

打包后分发 `server/` 目录：
```
server/
├── product-server.exe    # 双击运行（包含 Node.js 运行时）
├── public/               # 管理前端
└── README.md
```

运行：双击 `product-server.exe`，自动创建 `data.db`，打开 `http://localhost:3000`。

### 8.4 后台运行（可选）

如果不想一直开着命令行窗口：

**Windows**：使用 `node-windows` 注册为服务，或用 `start /b` 后台运行
**Mac/Linux**：`nohup node server.js &`

---

## 九、开发顺序

### Phase 1：最小可用
1. 初始化项目 `npm init` + 安装 `express`、`better-sqlite3`
2. 编写 `server.js` — 建表 + POST 保存 + GET 列表（分页）+ GET 单条 + DELETE
3. 编写 `public/index.html` — 列表页 + 删除
4. Chrome 扩展 manifest 添加权限 + 改采集端/回填端对接
5. 端到端测试

### Phase 2：完善管理
6. 搜索 + 状态筛选
7. 查看详情弹窗（图片预览）
8. 批量删除
9. 标记已用/未用

### Phase 3：打包分发
10. 编写 `start.bat` / `start.sh`
11. `pkg` 打包为 EXE
12. 编写 README.md
