# 方案 G 执行清单：旧电脑 + frp + 国内小 VPS

**日期**：2026-06-15
**目标**：用最低成本验证公网部署可行性，失败就退回本地（零损失）
**预计成本**：¥15-25/月（小 VPS）+ 0（旧电脑已有）
**预计工时**：1-2 小时

---

## 架构总览

```
┌────────────┐         ┌──────────────┐         ┌─────────────┐
│  用户浏览器 │ ──HTTPS─>│  国内小 VPS   │ ──frp──>│  你家旧电脑  │
│  + 扩展    │         │  frps 中转    │  加密隧道│  server.js  │
└────────────┘         │  443 端口     │         │  3000 端口  │
                       │  nginx + 证书 │         │  SQLite     │
                       └──────────────┘         └─────────────┘
                              │                          │
                              │                          │
                       bee.yourdomain.com         Turso 云端同步
                       （DNS 指向 VPS 公网 IP）   （已有，零改动）
```

**核心思路**：
- VPS 只做反向代理 + HTTPS + frp 中转，配置低（1C1G 都够）
- 旧电脑跑完整 Node server，SQLite / ONNX 模型全部不动
- 公网流量经 VPS 加密隧道转发到旧电脑

---

## 失败回退预案（先看这个）

**任何一步失败 → 直接放弃，本地继续跑**：

| 失败场景 | 处理 |
|---|---|
| VPS 买不到合适的 | 退款（阿里云/腾讯云 5 天内可退）/ 不用了 |
| frp 配不通 | VPS 退款，本地继续跑 |
| 家用宽带封端口 | frp 走非标端口（如 8443），扩展 host_permissions 加上 |
| 旧电脑不稳定 | 关掉 frp 客户端，VPS 上 nginx 改成「503 服务维护中」 |
| 速度太慢 | 改用方案 H（独立 VPS 跑全部） |

**最坏情况损失**：¥15-25 VPS 月费 + 几小时配置时间。**本地数据零影响**。

---

## 执行步骤（按顺序，每步独立验证）

### Step 1：买国内 VPS（5-15 分钟）

**推荐选项**（按性价比排序）：

| 供应商 | 配置 | 价格 | 备注 |
|---|---|---|---|
| **阿里云轻量 1C1G** | 1核1G 25G SSD 1Mbps | ¥24/月（新用户） | 推荐，国内速度好 |
| **腾讯云轻量 2C2G** | 2核2G 50G 4Mbps | ¥45/月（首单优惠） | 配置高一档 |
| 雨云 / 阿里云ECS按量 | 1C1G | ¥0.05-0.1/小时 | 验证期便宜 |
| 搬瓦工 / Vultr 国内节点 | 1C1G | $5/月 | 不推荐（国内访问慢） |

**系统**：Ubuntu 22.04 LTS（选这个，下面命令都基于 Ubuntu）

**支付**：支付宝/微信（**不需要外国银行卡**）

**先不买大的**，验证跑通后再升级。

#### 验证 Step 1 完成
```bash
# 用 SSH 登录 VPS（在本地电脑跑）
ssh root@your.vps.ip
# 能登录就 OK
```

---

### Step 2：VPS 基础环境（15-20 分钟）

SSH 登录 VPS，按顺序执行：

```bash
# 更新系统
apt update && apt upgrade -y

# 装基础工具
apt install -y nginx certbot python3-certbot-nginx unzip wget

# 开放端口（防火墙）
ufw allow 22/tcp     # SSH
ufw allow 80/tcp     # HTTP（证书申请 + 重定向）
ufw allow 443/tcp    # HTTPS
ufw allow 7000/tcp   # frp 服务端监听端口
ufw enable

# 验证 Nginx
systemctl status nginx
# 看到 active (running) 即 OK
```

#### 下载 frp

```bash
# 下载最新 frp（去 https://github.com/fatedier/frp/releases 看版本号）
cd /tmp
wget https://github.com/fatedier/frp/releases/download/v0.61.0/frp_0.61.0_linux_amd64.tar.gz
tar -xzf frp_0.61.0_linux_amd64.tar.gz
mkdir -p /opt/frp
cp frp_0.61.0_linux_amd64/frps /opt/frp/
chmod +x /opt/frp/frps

# 验证
/opt/frp/frps --version
```

---

### Step 3：frp 服务端配置（5 分钟）

```bash
# 生成 frp 通信密钥（记下来，客户端要用）
openssl rand -hex 16
# 假设输出：a1b2c3d4e5f6...

cat > /opt/frp/frps.toml <<'EOF'
bindAddr = "0.0.0.0"
bindPort = 7000

# 客户端连接认证
auth.method = "token"
auth.token = "这里粘贴上面 openssl 生成的密钥"

# 不开 dashboard（避免暴露）
EOF
```

#### 把 frps 装成系统服务

```bash
cat > /etc/systemd/system/frps.service <<'EOF'
[Unit]
Description=frp server
After=network.target

[Service]
Type=simple
ExecStart=/opt/frp/frps -c /opt/frp/frps.toml
Restart=on-failure
RestartSec=5s

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable frps
systemctl start frps
systemctl status frps
# 看到 active (running) 即 OK
```

#### 验证 Step 3 完成
```bash
ss -tlnp | grep 7000
# 看到 0.0.0.0:7000 LISTEN 即 OK
```

---

### Step 4：域名 DNS 解析（2 分钟）

在你的域名注册商控制台（阿里云/腾讯云/Cloudflare 等）添加 A 记录：

| 主机记录 | 类型 | 记录值 | TTL |
|---|---|---|---|
| bee | A | your.vps.ip | 600 |

等 1-5 分钟生效，然后：

```bash
# 在 VPS 或本地验证 DNS
ping bee.yourdomain.com
# 看到 VPS 公网 IP 即 OK
```

---

### Step 5：Nginx + HTTPS 证书（10 分钟）

```bash
cat > /etc/nginx/sites-available/bee <<'EOF'
server {
    listen 80;
    server_name bee.yourdomain.com;
    location / { return 301 https://$host$request_uri; }
}

server {
    listen 443 ssl http2;
    server_name bee.yourdomain.com;

    # 证书路径（certbot 会自动填，先留空跑一次 certbot）
    ssl_certificate     /etc/letsencrypt/live/bee.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/bee.yourdomain.com/privkey.pem;

    client_max_body_size 60m;

    location / {
        proxy_pass http://127.0.0.1:7001;   # frp 客户端会监听这里
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # SSE / 长连接
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}
EOF

# 先申请证书（自动修改 nginx 配置）
certbot --nginx -d bee.yourdomain.com

# 启用站点
ln -sf /etc/nginx/sites-available/bee /etc/nginx/sites-enabled/

# 测试 + 重载
nginx -t
systemctl reload nginx
```

#### 验证 Step 5 完成
浏览器访问 `https://bee.yourdomain.com` → 应该返回 502（因为 frp 客户端还没启动），但**证书应该有效**（锁图标正常）。

---

### Step 6：旧电脑装 frpc 客户端（10 分钟）

在旧电脑（Windows）上：

```powershell
# 1. 下载 frp Windows 版
# 去 https://github.com/fatedier/frp/releases 下载 frp_0.61.0_windows_amd64.zip
# 解压到 D:\frp\

# 2. 创建 frpc.toml 配置文件
notepad D:\frp\frpc.toml
```

`D:\frp\frpc.toml` 内容：

```toml
serverAddr = "your.vps.ip"
serverPort = 7000

auth.method = "token"
auth.token = "这里粘贴 Step 3 生成的密钥"

# 把 VPS 的 127.0.0.1:7001 转发到旧电脑的 3000
[[proxies]]
name = "bee-server"
type = "tcp"
localIP = "127.0.0.1"
localPort = 3000
remotePort = 7001
```

#### 测试连接

```powershell
# 启动 frpc（前台跑，看日志）
cd D:\frp
.\frpc.exe -c .\frpc.toml
```

如果看到 `login to server success` 就 OK。

#### 验证 Step 6 完成
- 浏览器访问 `https://bee.yourdomain.com` → 应该看到登录页
- 输入管理员账号 → 应该能登录

---

### Step 7：frpc 装成 Windows 服务（开机自启）

```powershell
# 用 nssm 把 frpc 装成服务
# 下载 nssm: https://nssm.cc/release/nssm-2.24.zip
# 解压到 D:\frp\nssm.exe

D:\frp\nssm.exe install frpc
# GUI 弹窗里填：
# Application > Path: D:\frp\frpc.exe
# Application > Startup directory: D:\frp
# Application > Arguments: -c D:\frp\frpc.toml
# 点 Install service

# 启动服务
net start frpc
sc config frpc start= auto
```

---

### Step 8：服务端代码改造（15 分钟）

只改 2 处，其他不动：

#### 改动 1：信任反向代理 IP

`server/server.js` 找到 `app.use(helmet(...))` 这一行附近：

```js
// 加这一行（在 app = express() 之后）
app.set('trust proxy', 1);
```

#### 改动 2：（可选）端口读环境变量

`server/server.js:12`：
```js
// 改前
const PORT = 3000;
// 改后
const PORT = process.env.PORT || 3000;
```

**SQLite / ONNX / PaddleOCR / Turso 配置 全部不动**。

#### 重启本地 server
```powershell
# Ctrl+C 停掉当前 server，然后重启
cd D:\1688-extension\server
npm start
```

---

### Step 9：扩展端改造（15 分钟）

#### 改动 1：`sites/manifest.json`

```json
"host_permissions": [
  "http://localhost:3000/*",
  "http://192.168.*.*:3000/*",
  "https://bee.yourdomain.com/*"
]
```

#### 改动 2：`sites/dianxiaomi/dxm-config.js:33`

```js
return localStorage.getItem(SERVER_URL_KEY) || 'https://bee.yourdomain.com';
```

#### 改动 3：`sites/background.js`（3 处默认值）

把所有 `'http://localhost:3000'` 改成 `'https://bee.yourdomain.com'`（line 5、22、57）。

#### 重新打包扩展

```powershell
cd D:\1688-extension
npm run build
```

#### 用户加载新版扩展

1. 打开 `chrome://extensions`
2. 开发者模式 → 加载已解压的扩展 → 选 `D:\1688-extension\1688-extension` 目录
3. 在店小蜜/1688 页面测试采集功能

---

### Step 10：端到端验证清单

- [ ] 浏览器访问 `https://bee.yourdomain.com` 能打开登录页
- [ ] 用管理员账号能登录
- [ ] 商品列表能正常显示
- [ ] 上传一张图片能成功
- [ ] 触发一次图片处理（去水印/抠图）能完成
- [ ] 扩展从 1688 商品页采集 → 数据出现在列表
- [ ] 扩展从店小蜜填表 → 能调通 API
- [ ] SSE 实时事件能推送（修改商品状态，其他用户能立即看到）
- [ ] 关掉旧电脑 server → 浏览器访问应返回 502（证明流量确实走旧电脑）
- [ ] 重启旧电脑 → frpc 服务自动启动 → 服务恢复

全部 ✅ → 部署成功，可以正式用。

---

## 常见问题排查

| 现象 | 排查 |
|---|---|
| frpc 启动报 `connection refused` | VPS 防火墙没开 7000 端口 / frps 服务没起 |
| frpc 连上但浏览器 502 | nginx 配置里 `proxy_pass` 端口和 `remotePort` 不一致 |
| 能访问但图片上传失败 | nginx `client_max_body_size` 太小 |
| 速度慢 | 家用宽带上行带宽不够，可改用方案 H |
| Cloudflare DNS 不解析 | DNS 没生效，等 10 分钟或换 DNS 服务商 |
| 扩展请求报错 | host_permissions 没加新域名 |
| Chrome 报证书错误 | certbot 申请失败，重跑 `certbot --nginx -d ...` |

---

## 长期运维（验证成功后）

### 旧电脑要做的事
1. **开机自启 server**：用 `pm2-windows-service` 或 `node-windows` 装成 Windows 服务
2. **frpc 开机自启**：Step 7 已配置
3. **UPS 防断电**：买个 ¥200 的 UPS，避免突然断电数据库损坏
4. **磁盘空间监控**：uploads/ 文件夹每周检查一次（已有 7 天清理脚本）

### VPS 要做的事
1. **frps 开机自启**：Step 3 已配置（systemd）
2. **证书自动续期**：certbot 默认装好了 systemd timer，无需配置
3. **日志监控**：`journalctl -u frps -f` 看 frp 日志

### 备份策略
- **SQLite 数据**：旧电脑 data.db 已有 `.bak[.1/.2/.3]` 自动轮转，足够
- **VPS**：只是中转节点，无需备份
- **额外保险**：每周手动复制一份 `data.db` 到云盘

---

## 后续：方案 H 切换

如果方案 G 验证一段时间后发现：
- ❌ 旧电脑不稳定 / 经常断电
- ❌ 速度太慢（家用上行带宽不够）
- ❌ 不想维护旧电脑 7×24

**就切到方案 H**（独立 VPS 部署），步骤：
1. 买一台香港 VPS（2C2G ¥30-60/月，可用支付宝）
2. 旧电脑 `data.db` + `dxm_tree.db` 通过 scp 传到 VPS
3. VPS 上 `npm install` + 启动 server
4. nginx 配置改 `proxy_pass http://127.0.0.1:3000`（不再走 frp）
5. 关掉旧电脑

方案 G 的 nginx 配置、域名、证书、扩展端改造**全部沿用**，只需改 nginx 一行。

---

## 现在开始？

确认后告诉我，我可以：
1. 帮你改 Step 8 + Step 9 的代码（约 10 分钟）
2. 准备 frp 服务端配置文件（你可以直接拷贝到 VPS）
3. 准备扩展端改造 diff

VPS 购买、SSH 操作、frp 安装需要你自己做（远程操作你的机器风险大，命令我已经逐条列清楚）。

或者你说"不行就本地启动跑跑算了"——那就什么都不改，维持现状。
