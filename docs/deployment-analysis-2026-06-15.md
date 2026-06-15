# 公网部署方案全集

**日期**：2026-06-15
**目标**：把 `server/` 服务端整体打包部署到公网，3~5 人同时使用
**说明**：本文档列出**所有可行方案**，每个方案包含「办法 / 步骤 / 优缺点 / 成本 / 风险」，供选型参考。

---

## 目录

- [项目架构现状](#项目架构现状)
- [方案 A：VPS + Nginx + PM2](#方案-avps--nginx--pm2)
- [方案 B：Docker + docker-compose](#方案-bdocker--docker-compose)
- [方案 C：PaaS（Railway / Render / Fly.io）](#方案-cpaasrailway--render--flyio)
- [方案 D：内网穿透（Cloudflare Tunnel）](#方案-d内网穿透cloudflare-tunnel)
- [方案 E：Serverless（不推荐）](#方案-eserverless不推荐)
- [方案 F：家用旧电脑 + 动态域名](#方案-f家用旧电脑--动态域名)
- [方案对比矩阵](#方案对比矩阵)
- [通用改造工作量（所有方案都需要）](#通用改造工作量所有方案都需要)

---

## 项目架构现状

### 技术栈
- **后端**：Node.js + Express 4，端口硬编码 3000（不读 env）
- **数据库**：sql.js（SQLite WASM 版），启动整库读入内存，每 500ms 写盘
  - 主库 `data.db`（3.7MB）
  - 分类树 `dxm_tree.db`（13MB）
- **云同步**：Turso（@libsql/client）— 商品 / 用户 / 知识库 5 张表
- **认证**：JWT + `auth_token` Cookie（HttpOnly, 7 天）
- **反向代理**：无，服务直接 listen 3000
- **进程管理**：手动 `node server.js` 或 `npm run dev`（nodemon）

### 配置存储
所有配置都在 SQLite `settings` 表，**没有 `.env`**：
- JWT 密钥：`settings.jwt_secret`（首次随机生成并落盘）
- Turso 连接：`settings.turso_config`（JSON）
- AI API Key：`settings.ai_global_key` + 各 vendor 配置
- 管理员账号：`users` 表（PBKDF2 + salt）

### 持久化文件清单
```
server/
├── data.db              3.7MB  商品/用户/配置/知识库
├── dxm_tree.db          13MB   分类树
├── data.db.bak[.1/.2/.3]       自动轮转备份
├── models/
│   ├── lama.onnx        89MB   LaMa 图像修复
│   └── isnet_fp16.onnx  85MB   ISNet 抠图
├── public/uploads/             用户上传图片（7 天清理）
└── ocr_service.py              PaddleOCR Python 微服务（端口 3001）
```

### 外部进程
| 进程 | 端口 | 必需性 |
|---|---|---|
| Node server | 3000 | **必需** |
| PaddleOCR Python | 3001 | 可选（失灵不影响其他功能） |
| ONNX Runtime | — | **必需**（`sharp` + `onnxruntime-node` 原生模块） |

### 原生模块关键约束
```json
"sharp": "^0.34.5",              // libvips 原生
"onnxruntime-node": "^1.25.1",   // C++ 原生（217MB）
"@imgly/background-removal": "^1.7.0"
```
**不能跨平台拷贝 `node_modules`**，必须在目标系统重新 `npm install`。

### 扩展端硬编码地址（公网部署必改）
| 文件 | 内容 |
|---|---|
| `sites/manifest.json` | `host_permissions: ["http://localhost:3000/*", "http://192.168.*.*:3000/*"]` |
| `sites/background.js` | 3 处 `'http://localhost:3000'` |
| `sites/dianxiaomi/dxm-config.js` | 默认地址 `'http://localhost:3000'` |
| `sites/1688/*.js` + `sites/dianxiaomi/dxm-*.js` 共 14 个文件 | 都引用 localhost:3000 |

### 内存占用估算
- sql.js 内存常驻：4MB + 13MB ≈ 17MB
- ONNX 模型常驻：89MB + 85MB ≈ 174MB
- Node + Express 基础：80MB
- **稳态 ≈ 300MB，峰值（图片处理）500MB~1GB**
- **3~5 人并发：2GB 内存足够**

---

## 方案 A：VPS + Nginx + PM2

### 概述
租一台云服务器，跑 Node 服务 + Python OCR，前面套 Nginx 反向代理做 HTTPS、限流、静态资源缓存，PM2 守护进程崩溃自重启。**最传统、最稳、最适合本项目**。

### 适用场景
- 长期生产部署
- 3~5 人稳定使用
- 想要完全可控、可调试
- 接受一次性配置成本换长期稳定

### 详细步骤

#### Step 1：购买 VPS

**推荐供应商（按推荐度排序）**：

| 供应商 | 配置 | 价格 | 优势 | 劣势 |
|---|---|---|---|---|
| 阿里云轻量应用服务器 | 2C2G 50G | ¥60-99/月 | 国内访问快、备案方便 | 要 ICP 备案 20 天 |
| 腾讯云轻量 | 2C2G 50G | ¥60-99/月 | 同上 | 同上 |
| 雨云/腾讯云香港 | 2C2G 40G | ¥30-60/月 | 免备案、国内可访问 | 国内访问 50-150ms |
| Vultr/DigitalOcean 新加坡 | 1C2G 50G | $6-12/月 | 海外免备案、按小时计费 | 国内访问 100-300ms |
| Hetzner 德国 | 2C4G 40G | €4-7/月 | 极致性价比 | 国内访问慢 |

**系统选择**：Ubuntu 22.04 LTS（生态最完善、踩坑最少）

#### Step 2：基础环境

```bash
# SSH 登录
ssh root@your.server.ip

# 更新系统
apt update && apt upgrade -y

# 安装 Node.js 20.x LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# 验证
node -v  # v20.x.x
npm -v   # 10.x.x

# 安装 Python + pip（给 PaddleOCR）
apt install -y python3 python3-pip python3-venv

# 安装 Nginx
apt install -y nginx

# 安装 PM2（全局）
npm install -g pm2

# 安装 certbot（Let's Encrypt 证书）
apt install -y certbot python3-certbot-nginx

# 安装 git
apt install -y git
```

#### Step 3：拉取代码 + 安装依赖

```bash
# 创建工作目录
mkdir -p /opt/1688-extension
cd /opt/1688-extension

# 拉代码（公开仓库直接 clone，私有仓库要配 SSH key 或 PAT）
git clone https://github.com/yourname/1688-extension.git .

# 进入 server 目录装依赖
cd server
npm install --production

# 这一步会下载 sharp / onnxruntime-node 的 Linux 二进制
# 时间可能 5-10 分钟，取决于网络

# 安装 PaddleOCR（可选，不做这步 OCR 功能失灵）
pip3 install paddleocr paddlepaddle fastapi pydantic pillow "numpy<2.0" uvicorn
```

#### Step 4：环境变量

```bash
# 在 server/ 目录下创建 .env
cat > /opt/1688-extension/server/.env <<'EOF'
PORT=3000
NODE_ENV=production
JWT_SECRET=这里替换成32位以上的随机字符串
EOF

# 生成随机 JWT_SECRET
openssl rand -hex 32
```

**配套代码改造**（见 [通用改造](#通用改造工作量所有方案都需要)）：
- `server.js` 读 `process.env.PORT`
- `middleware/auth.js` 优先读 `process.env.JWT_SECRET`

#### Step 5：PM2 配置

```bash
cat > /opt/1688-extension/server/ecosystem.config.js <<'EOF'
module.exports = {
  apps: [{
    name: 'bee-server',
    script: 'server.js',
    cwd: '/opt/1688-extension/server',
    instances: 1,            // 单实例（SQLite 不支持多实例并发写）
    exec_mode: 'fork',
    autorestart: true,
    max_restarts: 10,
    max_memory_restart: '1G', // 内存超 1G 自动重启
    env: {
      NODE_ENV: 'production'
    },
    error_file: '/var/log/bee-server/err.log',
    out_file: '/var/log/bee-server/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    merge_logs: true,
    time: true
  }]
};
EOF

mkdir -p /var/log/bee-server

# 启动
cd /opt/1688-extension/server
pm2 start ecosystem.config.js
pm2 save             # 保存进程列表

# 开机自启
pm2 startup systemd
# 按提示执行返回的那条命令，类似：
# sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u root --hp /root
```

#### Step 6：Nginx 反向代理

```bash
cat > /etc/nginx/sites-available/bee.example.com <<'EOF'
server {
    listen 80;
    server_name bee.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name bee.example.com;

    # 证书路径（certbot 会自动填）
    ssl_certificate     /etc/letsencrypt/live/bee.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/bee.example.com/privkey.pem;

    # 上传大小限制（图片 base64 上传）
    client_max_body_size 60m;

    # 限流：每个 IP 每秒最多 20 个请求
    limit_req_zone $binary_remote_addr zone=api:10m rate=20r/s;

    location / {
        limit_req zone=api burst=40 nodelay;
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        # SSE / 长连接必须的 header
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # SSE 长连接超时（默认 60s 会断）
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}
EOF

# 启用站点
ln -s /etc/nginx/sites-available/bee.example.com /etc/nginx/sites-enabled/

# 测试配置
nginx -t

# 重载
systemctl reload nginx
```

#### Step 7：申请 HTTPS 证书

```bash
# Let's Encrypt 免费证书（自动改 Nginx 配置）
certbot --nginx -d bee.example.com

# 测试自动续期（Let's Encrypt 证书 90 天过期，certbot 会自动续）
certbot renew --dry-run
```

**国内云替代方案**（Let's Encrypt 部分场景验证不通）：
- 阿里云控制台 → 数字证书管理 → 免费证书（DV）→ 申请 → 下载 Nginx 格式 → 上传到 `/etc/nginx/ssl/`
- 腾讯云同理

#### Step 8：防火墙

```bash
# 只开 22 (SSH) / 80 (HTTP) / 443 (HTTPS)
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable

# 3000 / 3001 端口绝对不要对外，只让 Nginx 内网访问
# ufw 默认拒绝所有其他端口
```

#### Step 9：扩展端改造

1. 改 `sites/manifest.json:7`：
   ```json
   "host_permissions": [
     "http://localhost:3000/*",
     "http://192.168.*.*:3000/*",
     "https://bee.example.com/*"
   ]
   ```

2. 改 `sites/dianxiaomi/dxm-config.js:33`：
   ```js
   return localStorage.getItem(SERVER_URL_KEY) || 'https://bee.example.com';
   ```

3. 改 `sites/background.js`（3 处）：把 `'http://localhost:3000'` 默认值改为 `'https://bee.example.com'`

4. 重新打包扩展：`npm run build`

5. 用户加载 `1688-extension/` 目录

#### Step 10：首次数据同步

服务器首启后，Turso 会自动同步：
- 用户表（管理员账号、所有用户）
- 知识库 5 张表
- **最近 3 天商品**（不是全量）

历史商品（>3 天）有两种处理：
- **选项 A**：服务器从空库起步，只增量同步新采集的商品（推荐）
- **选项 B**：把你本地 `data.db` + `dxm_tree.db` 通过 `scp` 传到服务器，作为基线

```bash
# 选项 B 的命令（在你本地 Windows 跑）
scp server/data.db root@your.server.ip:/opt/1688-extension/server/data.db
scp server/dxm_tree.db root@your.server.ip:/opt/1688-extension/server/dxm_tree.db

# 传完后重启服务
ssh root@your.server.ip "pm2 restart bee-server"
```

### 优缺点

**优点**：
- ✅ 完全可控、配置透明
- ✅ SQLite 文件本地盘 IO 快
- ✅ 原生模块自行编译/下载，兼容性最佳
- ✅ 长进程（ONNX 预热）友好
- ✅ 成本可控（¥60-100/月）
- ✅ HTTPS 用 Let's Encrypt 免费
- ✅ 监控、日志、备份都好做

**缺点**：
- ❌ 首次配置工作量大（4-6 小时）
- ❌ 运维责任全在自己（备份、监控、打补丁、安全更新）
- ❌ 国内云要 ICP 备案（20 天左右）除非用香港/海外节点
- ❌ 单点故障（除非做主备，但 3-5 人没必要）

### 成本估算

| 项目 | 一次性 | 月度 |
|---|---|---|
| VPS（2C2G 香港） | — | ¥30-100 |
| 域名（已有） | — | — |
| HTTPS 证书 | — | 免费（Let's Encrypt） |
| 部署配置工时 | 4-6h | — |
| **合计** | 4-6h | **¥30-100/月** |

### 风险与限制
- VPS 宕机/网络中断 → 服务不可用（用 uptime 监控）
- SQLite 文件损坏 → 用 `.bak` 文件恢复（已有轮转备份机制）
- 磁盘满 → 上传图片 + 日志会涨，要写清理脚本
- 安全：所有端口默认拒绝、密钥不进 git、JWT 密钥每月轮换

---

## 方案 B：Docker + docker-compose

### 概述
把 Node server + PaddleOCR + 所有依赖打包成 Docker 镜像，用 docker-compose 编排。一次构建处处运行，回滚方便。

### 适用场景
- 已经熟悉 Docker
- 未来可能扩到多机
- 想要「环境即代码」可版本化部署

### 详细步骤

#### Step 1：VPS 准备（同方案 A）

```bash
# 装 Docker
curl -fsSL https://get.docker.com | bash
systemctl enable docker
systemctl start docker

# 装 docker-compose
apt install -y docker-compose-plugin
```

#### Step 2：编写 Dockerfile

新建 `server/Dockerfile`：

```dockerfile
# 多阶段构建：第一阶段装依赖（带原生模块编译工具）
FROM node:20-bookworm-slim AS builder

RUN apt-get update && apt-get install -y \
    python3 make g++ \
    libvips-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --production

# 第二阶段：运行时镜像（最小化）
FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y \
    libvips42 \
    python3 python3-pip \
    && rm -rf /var/lib/apt/lists/*

# 装 PaddleOCR
RUN pip3 install --no-cache-dir --break-system-packages \
    paddleocr paddlepaddle fastapi pydantic pillow "numpy<2.0" uvicorn

WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY . .

# 数据目录
RUN mkdir -p /app/data /app/public/uploads /app/models
VOLUME ["/app/data", "/app/public/uploads"]

EXPOSE 3000
CMD ["node", "server.js"]
```

#### Step 3：docker-compose.yml

新建 `server/docker-compose.yml`：

```yaml
version: '3.8'

services:
  bee-server:
    build: .
    container_name: bee-server
    restart: unless-stopped
    ports:
      - "127.0.0.1:3000:3000"   # 只监听本地，由 Nginx 转发
    environment:
      - PORT=3000
      - NODE_ENV=production
      - JWT_SECRET=${JWT_SECRET}
    volumes:
      - ./data:/app              # 持久化 db / uploads / models
      - ./logs:/var/log/bee-server
    mem_limit: 2g
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "5"
```

新建 `server/.env`（同方案 A）

#### Step 4：构建 + 启动

```bash
cd /opt/1688-extension/server

# 构建镜像（首次 10-20 分钟，因为要装 PaddleOCR + 编译原生模块）
docker compose build

# 启动
docker compose up -d

# 查看日志
docker compose logs -f bee-server
```

#### Step 5：Nginx + HTTPS（同方案 A 的 Step 6-7）

#### Step 6：备份策略

```bash
# 每日备份脚本
cat > /opt/1688-extension/backup.sh <<'EOF'
#!/bin/bash
DATE=$(date +%Y%m%d)
tar -czf /backup/bee-$DATE.tar.gz \
    /opt/1688-extension/server/data/data.db \
    /opt/1688-extension/server/data/dxm_tree.db
# 保留 7 天
find /backup -name "bee-*.tar.gz" -mtime +7 -delete
EOF

chmod +x /opt/1688-extension/backup.sh

# 加入 crontab 每天凌晨 3 点
crontab -e
# 添加：
0 3 * * * /opt/1688-extension/backup.sh
```

#### Step 7：更新流程

```bash
cd /opt/1688-extension
git pull
cd server
docker compose build
docker compose up -d
```

### 优缺点

**优点**：
- ✅ 环境完全一致（开发/测试/生产）
- ✅ 一键部署、一键回滚
- ✅ 配置即代码，进 git 可追溯
- ✅ 扩到多机用 Kubernetes 平滑过渡
- ✅ 数据卷独立，升级不影响数据

**缺点**：
- ❌ **镜像体积爆炸**（≥ 1.5GB，主要是 PaddleOCR + ONNX 原生库）
- ❌ 内存占用比裸机高 10-20%
- ❌ Dockerfile + compose 学习成本
- ❌ PaddleOCR 跨容器调试麻烦
- ❌ 国内拉 Docker Hub 慢，要配镜像源

### 成本估算

| 项目 | 一次性 | 月度 |
|---|---|---|
| VPS（2C4G，比方案 A 大一档） | — | ¥80-150 |
| HTTPS 证书 | — | 免费 |
| 部署配置工时 | 6-10h | — |
| **合计** | 6-10h | **¥80-150/月** |

### 风险与限制
- 镜像构建失败：原生模块（sharp/onnxruntime-node）跨平台编译问题
- Docker Hub 国内访问慢：用阿里云镜像加速器 `registry.cn-hangzhou.aliyuncs.com`
- 卷映射出错可能丢数据：第一次部署先用测试库验证

---

## 方案 C：PaaS（Railway / Render / Fly.io）

### 概述
push 代码到 PaaS 平台，自动构建、自动部署、自动 HTTPS、自动域名。

### 适用场景
- 不想自己运维服务器
- 愿意改造代码迁就平台限制
- 接受每月 $7-20 的固定开销

### 详细步骤

#### 选项 1：Railway（最简单的 PaaS）

##### Step 1：项目改造

**问题**：Railway 容器重启后本地文件丢失（Ephemeral Filesystem），SQLite 不持久。

**改造**：
1. 把所有数据迁到 Turso（已有，但要确认所有读写都走云端）
2. ONNX 模型放到对象存储（S3/OSS），启动时下载
3. 上传图片改用 OSS（已有 oss-upload.js）
4. 移除 PaddleOCR（或改用云端 OCR API）

改造量：**大**（约 2-3 天）

##### Step 2：配置文件

新建 `server/railway.json` 或直接用 `railway.toml`：

```toml
[build]
builder = "nixpacks"

[deploy]
startCommand = "node server.js"
healthcheckPath = "/api/extension-version"
healthcheckTimeout = 30
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 3
```

##### Step 3：环境变量（Railway 控制台）

```
PORT=3000
NODE_ENV=production
JWT_SECRET=<自动生成>
TURSO_URL=<已有>
TURSO_TOKEN=<已有>
```

##### Step 4：部署

```bash
# 装 Railway CLI
npm install -g @railway/cli

# 登录 + 关联项目
railway login
railway link

# 部署
railway up
```

代码 push 后自动构建，约 3-5 分钟上线。

#### 选项 2：Render

类似 Railway，但免费版有 15 分钟无流量自动休眠的限制（冷启动 5-10 秒），ONNX 模型每次冷启动都重新加载。

#### 选项 3：Fly.io

支持 persistent volume，**可以保留 SQLite**，但原生模块兼容性偶尔有问题。

### 优缺点

**优点**：
- ✅ 零运维（平台负责监控、备份、扩缩容）
- ✅ 自动 HTTPS + 全球 CDN
- ✅ Git push 即部署
- ✅ 按用量计费（小项目便宜）

**缺点**：
- ❌ **SQLite 文件不持久**（最大问题，需迁全量到 Turso）
- ❌ **原生模块跨平台构建**经常失败（onnxruntime-node）
- ❌ 长连接/SSE 受限（部分平台有超时）
- ❌ Render 免费版冷启动 5-10 秒
- ❌ OCR Python 微服务几乎无法跑
- ❌ 国外 PaaS 国内访问慢（100-300ms）

### 成本估算

| 项目 | 月度 |
|---|---|
| Railway Hobby | $5 + 用量 ≈ $7-15 |
| Render Starter | $7 |
| Fly.io 自动扩缩 | $5-15 |
| 代码改造工时（一次性） | 2-3 天 |
| **合计** | **$7-20/月** |

### 风险与限制
- 平台厂商绑定：换平台成本高
- 数据迁移风险：SQLite → Turso 全量化，要写迁移脚本并测试
- OCR 功能丢失：PaddleOCR 跑不起来，要么去 OCR、要么换云端 API

---

## 方案 D：内网穿透（Cloudflare Tunnel）

### 概述
本地 Windows 继续跑 server.js，用 Cloudflare Tunnel 把 3000 端口暴露到公网域名。**零服务端改造**，30 分钟跑通。

### 适用场景
- 快速验证公网流程
- 临时演示给客户/同事
- 个人使用，不要求 7×24
- 作为方案 A 的过渡验证

### 详细步骤

#### Step 1：Cloudflare 账号准备

1. 注册 [Cloudflare](https://cloudflare.com)（免费）
2. 把你的域名 DNS 迁到 Cloudflare（也可以保持现有 DNS，只配一条 CNAME）
3. 在 Cloudflare 控制台 → Zero Trust → Access → Tunnels

#### Step 2：装 cloudflared

```powershell
# Windows 本地（PowerShell 管理员）
# 方式 1：用 winget
winget install --id Cloudflare.cloudflared

# 方式 2：下载安装包
# https://github.com/cloudflare/cloudflared/releases/latest
```

#### Step 3：创建隧道

**方式 A：用控制台（推荐）**

1. Cloudflare 控制台 → Zero Trust → Networks → Tunnels → Create a tunnel
2. 选 `Cloudflared`，命名 `bee-local`
3. 复制安装命令（含 token），在 Windows PowerShell 执行：
   ```powershell
   cloudflared service install eyJhIjo...
   ```
4. 配置路由：
   - Subdomain: `bee`
   - Domain: `yourdomain.com`
   - Service: `HTTP` → `localhost:3000`

5. 完成。访问 `https://bee.yourdomain.com` 即可

**方式 B：用配置文件**

```yaml
# C:\ProgramData\Cloudflare\cloudflared\config.yml
tunnel: <tunnel-id>
credentials-file: C:\ProgramData\Cloudflare\cloudflared\<tunnel-id>.json

ingress:
  - hostname: bee.yourdomain.com
    service: http://localhost:3000
    originRequest:
      noTLSVerify: true
      connectTimeout: 30s
      noHappyEyeballs: true
  - service: http_status:404
```

```powershell
# 装成 Windows 服务（开机自启）
cloudflared service install
```

#### Step 4：扩展端改造

同方案 A Step 9：改 `manifest.json` 的 `host_permissions`、`dxm-config.js`、`background.js` 默认地址为 `https://bee.yourdomain.com`。

#### Step 5：验证

1. 启动本地 `node server/server.js`
2. 浏览器访问 `https://bee.yourdomain.com` → 应能登录
3. 扩展加载新版，从 1688/店小蜜页面采集 → 应能调通
4. 关掉本地 server → 公网域名应返回 502（这是正常的）

### 优缺点

**优点**：
- ✅ **零服务端改造**（代码完全不动）
- ✅ 部署 30 分钟
- ✅ 免费（Cloudflare Tunnel 不收费）
- ✅ 自动 HTTPS（Cloudflare 边缘证书）
- ✅ 隐藏真实 IP（防 DDoS）
- ✅ 本地保留 174MB ONNX 模型，性能不受影响
- ✅ 国内访问比纯海外 VPS 稳定（走 Cloudflare CDN）

**缺点**：
- ❌ **本地电脑必须开机 + 联网**
- ❌ 家用宽带上行带宽 20-50Mbps，3-5 人传图片会卡
- ❌ Cloudflare 国内访问偶尔抽风（视运营商）
- ❌ 不适合做正式生产环境
- ❌ 长连接/SSE 在 Cloudflare 默认 100s 超时（可配置）

### 成本估算

| 项目 | 一次性 | 月度 |
|---|---|---|
| Cloudflare 账号 | 0 | 0 |
| 域名 | — | 已有 |
| 配置工时 | 30 分钟 | — |
| **合计** | 30 分钟 | **免费** |

### 风险与限制
- 电脑关机服务即停 → 用旧电脑做专用服务器
- Cloudflare ToS 限制（不允许大量非 HTML 流量，但本项目流量小不触线）
- 国内访问稳定性 → 备用方案：用 frp 自建中转

---

## 方案 E：Serverless（不推荐）

### 概述
每个 API 路由变成云函数，按调用计费、自动扩缩容。

### 致命问题
1. **SQLite + ONNX 完全不兼容**——Serverless 无状态短任务，174MB 模型冷启动 30 秒+
2. **PaddleOCR Python 微服务**无处安放（云函数不支持长进程）
3. **express.static 大量静态文件**不适合函数化
4. **响应时间限制**（Vercel 免费版 10 秒）——图片处理经常超时
5. **数据库连接数限制**——每个函数实例独立连接，Turso 连接数会被打爆

### 结论
**完全不适合本项目**，所有方案（Vercel / Netlify / 阿里云函数计算 / 腾讯云 SCF / AWS Lambda）都有相同问题。**直接排除，不考虑**。

---

## 方案 F：家用旧电脑 + 动态域名

### 概述
用家里不用的旧电脑做服务器，公网 IP 通过 DDNS 动态绑定域名。**最省钱但最不稳**。

### 适用场景
- 有闲置电脑 + 家用宽带
- 极度省钱（零成本）
- 接受稳定性差、需自己运维
- 仅个人或小团队使用

### 详细步骤

#### Step 1：硬件准备
- 旧电脑（4GB 内存 + 50G 硬盘即可）
- 装好 Linux（Ubuntu Server）或保留 Windows
- 路由器支持端口转发

#### Step 2：动态域名（DDNS）

家用宽带通常是动态 IP，需要 DDNS：

**选项 A：Cloudflare DDNS（推荐）**
```python
# 用 cloudflare-ddns 脚本，定时把当前公网 IP 写到 Cloudflare DNS
pip install cloudflare-ddns
cloudflare-ddns --token YOUR_TOKEN --zone yourdomain.com --record bee
```

**选项 B：花生壳 / No-IP**
- 国内常用花生壳，免费版有限制
- No-IP 国外免费

#### Step 3：路由器端口转发

登录路由器（一般 192.168.1.1）：
- 端口转发：外部 80 → 内网 192.168.x.x:80
- 端口转发：外部 443 → 内网 192.168.x.x:443

#### Step 4：本机部署（同方案 A 的 Step 2-8）

但要注意：
- 家用宽带 80/443 端口可能被运营商封了（国内常见）
- 替代方案：用 8443 / 8080 等非标端口（但扩展 manifest 写非标端口麻烦）

#### Step 5：UPS 不间断电源
停电就停服，UPS 是必须的（哪怕最便宜的 200 元款）。

### 优缺点

**优点**：
- ✅ **零硬件成本**（旧电脑再利用）
- ✅ **零月度费用**（宽带已有）
- ✅ 完全自主可控
- ✅ 本地维护方便（直接物理接触）

**缺点**：
- ❌ **稳定性差**——断电、断网、运营商抖动都影响
- ❌ 家用宽带上行 20-50Mbps，3-5 人传图片会卡
- ❌ 80/443 端口常被运营商封（要用非标端口）
- ❌ 公网 IP 不固定（要靠 DDNS）
- ❌ 安全风险高（家用网络直接暴露公网）
- ❌ 7×24 运行电费 + 噪音 + 散热

### 成本估算

| 项目 | 一次性 | 月度 |
|---|---|---|
| 旧电脑 | 已有 | — |
| UPS | ¥200 | — |
| 域名 | — | 已有 |
| DDNS | 0 | 0 |
| 电费 | — | ¥30-50 |
| **合计** | ¥200 | **¥30-50/月**（电费） |

### 风险与限制
- 路由器被攻击 → 公网 IP 暴露内网，要严格配置防火墙
- 运营商突然改 IP → DDNS 同步延迟 5-10 分钟
- 电脑硬件故障 → 数据库备份尤为重要

---

## 方案对比矩阵

| 维度 | A. VPS | B. Docker | C. PaaS | D. 内网穿透 | E. Serverless | F. 家用电脑 |
|---|---|---|---|---|---|---|
| 服务端改造量 | 小 | 中 | **大** | **零** | 巨大 | 小 |
| 部署复杂度 | 中 | 高 | 低 | 极低 | 高 | 中 |
| 原生模块兼容 | ✅ | ✅ | ⚠️ | ✅ | ❌ | ✅ |
| SQLite 持久化 | ✅ | ✅ | ⚠️ | ✅ | ❌ | ✅ |
| Python OCR | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ |
| 长连接/SSE | ✅ | ✅ | ⚠️ | ⚠️ | ❌ | ✅ |
| 高可用/7×24 | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |
| 国内访问速度 | 快 | 快 | 慢 | 中 | 中 | 快 |
| 月成本 | ¥30-100 | ¥80-150 | $7-20 | 免费 | — | ¥30-50（电） |
| 首次工时 | 4-6h | 6-10h | 2-3 天 | 30min | — | 4-6h |
| 推荐度 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ | ❌ | ⭐⭐ |

---

## 通用改造工作量（所有方案都需要）

无论选哪个方案，下面这些代码改造都要做（方案 D 内网穿透除外）：

### 1. PORT 读环境变量
`server/server.js:12`
```js
// 改前
const PORT = 3000;
// 改后
const PORT = process.env.PORT || 3000;
app.set('trust proxy', 1);  // 让 Express 识别反向代理转发的 IP
```

### 2. JWT 密钥读环境变量
`server/middleware/auth.js:10-25`
```js
function getSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  // 否则降级到 DB（保留兼容，本地开发继续用 DB）
  if (JWT_SECRET) return JWT_SECRET;
  // ...原逻辑
}
```

### 3. 扩展端默认地址改造
- `sites/manifest.json`：`host_permissions` 加新域名
- `sites/dianxiaomi/dxm-config.js:33`：默认地址改公网域名
- `sites/background.js`：3 处 localhost:3000 改公网域名

### 4. CORS 策略
保持现状（`callback(null, true)` 兜底放行）。注释已说明：靠反向代理 + 网络层 ACL 做隔离，不能在应用层加 origin 白名单（会破坏扩展跨域调用）。

### 5. 数据迁移决策
- 选项 A：服务器从空库起步，只增量同步新数据
- 选项 B：本地 `data.db` + `dxm_tree.db` 通过 scp 传到服务器作为基线

### 6. 备份脚本（方案 A/B/F 需要）
```bash
#!/bin/bash
# /opt/backup.sh
DATE=$(date +%Y%m%d-%H%M)
tar -czf /backup/db-$DATE.tar.gz \
    /opt/1688-extension/server/data.db \
    /opt/1688-extension/server/dxm_tree.db
find /backup -name "db-*.tar.gz" -mtime +7 -delete
```
crontab 每天凌晨 3 点跑。

### 7. 监控（可选）
- PM2 自带进程监控
- Uptime Robot 免费监控 URL 可用性
- 简单方案：写个 cron 每分钟 curl 健康检查接口

---

## 待你决策的事项

读完文档后，请逐项告知倾向（**不急着一次回答完**，可以分多轮讨论）：

1. **方案选型倾向**：A / B / D / F？或者先 D 验证再 A 正式部署？
2. **服务器位置**：国内云（备案）/ 香港云 / 海外云 / 家用电脑？
3. **过渡策略**：是否先用 Cloudflare Tunnel（方案 D）30 分钟跑通验证？
4. **域名规划**：根域名 vs 子域名？是否过 CDN？
5. **数据迁移**：服务器从空库起步 vs 拷贝本地 db 作为基线？
6. **本地 dev server**：部署后本地还跑不跑？跑的话怎么避免和生产 Turso 库冲突？
7. **改造授权**：通用改造（PORT、JWT、扩展地址）现在可以做吗？

确认方案后，我再开始动代码 + 写部署脚本。
