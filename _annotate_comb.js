// 改进版：给商品图标注尺寸 14×5.5cm，更专业的标注风格
const sharp = require('F:/00_project/1688-extension/server/node_modules/sharp');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const IMG_URL = 'https://cbu01.alicdn.com/img/ibank/O1CN01MEi0e71Zx8HplDEnn_!!2220072493260-0-cib.jpg_.webp';
const OUTPUT = path.join(__dirname, 'annotated_comb.png');
const W_CM = 14, H_CM = 5.5;

function download(url) {
  return new Promise((resolve, reject) => {
    var mod = url.startsWith('https') ? https : http;
    mod.get(url, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return download(res.headers.location).then(resolve).catch(reject);
      }
      var bufs = [];
      res.on('data', c => bufs.push(c));
      res.on('end', () => resolve(Buffer.concat(bufs)));
    }).on('error', reject);
  });
}

async function main() {
  console.log('[1] Downloading image...');
  var imgBuf = await download(IMG_URL);
  var meta = await sharp(imgBuf).metadata();
  var W = meta.width, H = meta.height;
  console.log('[2] Image size:', W, 'x', H);
  
  // 标注参数
  var fSize = Math.round(W / 30);     // 字号
  var gap = Math.round(W / 30);       // 标注线离物品偏移
  var tick = Math.round(W / 45);      // 引出线长度
  var lineW = Math.max(2, Math.round(W / 300)); // 线宽
  
  // 标注区域：梳子占据中央区域
  var x1 = W * 0.1, x2 = W * 0.9;
  var y1 = H * 0.12, y2 = y1 + (x2 - x1) * (H_CM / W_CM);
  
  var dimColor = '#E53935';
  var font = 'bold ' + fSize + 'px Arial, Helvetica, sans-serif';
  var textY = y2 + gap + fSize;
  var textX = x1 - gap - fSize * 0.6;
  
  var svg = `
  <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <marker id="aS" markerWidth="10" markerHeight="10" refX="1" refY="5" orient="auto" markerUnits="strokeWidth">
        <path d="M1,1 L9,5 L1,9" fill="none" stroke="${dimColor}" stroke-width="1.5" stroke-linejoin="round"/>
      </marker>
      <marker id="aE" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto" markerUnits="strokeWidth">
        <path d="M1,1 L9,5 L1,9" fill="none" stroke="${dimColor}" stroke-width="1.5" stroke-linejoin="round"/>
      </marker>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="1" stdDeviation="2" flood-color="rgba(0,0,0,0.3)"/>
      </filter>
    </defs>
    
    <!-- === 宽度标注（底部）=== -->
    <!-- 左引出线 -->
    <line x1="${x1}" y1="${y2+6}" x2="${x1}" y2="${y2+gap-tick}" stroke="${dimColor}" stroke-width="${lineW}" stroke-dasharray="none"/>
    <!-- 右引出线 -->
    <line x1="${x2}" y1="${y2+6}" x2="${x2}" y2="${y2+gap-tick}" stroke="${dimColor}" stroke-width="${lineW}"/>
    <!-- 标注线 + 箭头 -->
    <line x1="${x1}" y1="${y2+gap}" x2="${x2}" y2="${y2+gap}" stroke="${dimColor}" stroke-width="${lineW}" marker-start="url(#aS)" marker-end="url(#aE)"/>
    <!-- 尺寸文字 + 背景框 -->
    <rect x="${W/2 - fSize*2.2}" y="${y2+gap-fSize*0.7}" width="${fSize*4.4}" height="${fSize*1.2}" rx="3" fill="white" fill-opacity="0.85"/>
    <text x="${W/2}" y="${y2+gap+fSize*0.25}" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="${fSize}" font-weight="bold" fill="${dimColor}">${W_CM} cm</text>
    
    <!-- === 高度标注（左侧）=== -->
    <!-- 上引出线 -->
    <line x1="${x1-6}" y1="${y1}" x2="${x1-gap+tick}" y2="${y1}" stroke="${dimColor}" stroke-width="${lineW}"/>
    <!-- 下引出线 -->
    <line x1="${x1-6}" y1="${y2}" x2="${x1-gap+tick}" y2="${y2}" stroke="${dimColor}" stroke-width="${lineW}"/>
    <!-- 标注线 + 箭头 -->
    <line x1="${x1-gap}" y1="${y1}" x2="${x1-gap}" y2="${y2}" stroke="${dimColor}" stroke-width="${lineW}" marker-start="url(#aS)" marker-end="url(#aE)"/>
    <!-- 尺寸文字 + 背景框 (竖排) -->
    <rect x="${x1-gap-fSize*0.7}" y="${(y1+y2)/2-fSize*2.2}" width="${fSize*1.2}" height="${fSize*4.4}" rx="3" fill="white" fill-opacity="0.85"/>
    <text x="${x1-gap}" y="${(y1+y2)/2+fSize*0.4}" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="${fSize}" font-weight="bold" fill="${dimColor}" transform="rotate(90,${x1-gap},${(y1+y2)/2})">${H_CM} cm</text>
  </svg>`;
  
  console.log('[3] Compositing...');
  await sharp(imgBuf)
    .composite([{ input: Buffer.from(svg), left: 0, top: 0 }])
    .png()
    .toFile(OUTPUT);
  console.log('[4] Done:', OUTPUT);
  
  var pubDir = path.join(__dirname, 'server', 'public', 'uploads');
  if (!fs.existsSync(pubDir)) fs.mkdirSync(pubDir, { recursive: true });
  var pubOutput = path.join(pubDir, 'annotated_comb.png');
  fs.copyFileSync(OUTPUT, pubOutput);
  console.log('[5] Web: http://localhost:3000/uploads/annotated_comb.png');
}

main().catch(e => { console.error('ERROR:', e); process.exit(1); });
