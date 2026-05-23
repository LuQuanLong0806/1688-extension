var http = require('http');
function get(path) {
  return new Promise(function (resolve, reject) {
    http.get('http://localhost:3000' + path, function (res) {
      var d = '';
      res.on('data', function (c) { d += c; });
      res.on('end', function () {
        try { resolve(JSON.parse(d)); } catch (e) { resolve(d); }
      });
    }).on('error', reject);
  });
}
async function run() {
  await new Promise(function(r) { setTimeout(r, 3000); });

  // 1. API 读取
  var r = await get('/api/ai/configs');
  console.log('=== API 读取 ===');
  console.log('智谱:', JSON.stringify(r._global && r._global.keys));
  console.log('千问:', JSON.stringify(r.providers && r.providers.qwen && r.providers.qwen.keys));
  console.log('混元:', JSON.stringify(r.providers && r.providers.hunyuan && r.providers.hunyuan.accounts));
  console.log('vision apiKey:', r.vision && r.vision.apiKey);
  console.log('image apiKey:', r.image && r.image.apiKey);

  var imgbb = await get('/api/ai/smms-token');
  console.log('imgbb:', JSON.stringify(imgbb));

  // 2. 导出安全检查
  var exp = await get('/api/settings-export');
  if (typeof exp === 'object') {
    console.log('\n=== 导出文件安全 ===');
    ['zhipu_api_key', 'zhipu_api_keys', 'ai_configs', 'imgbb_api_key'].forEach(function(k) {
      if (exp[k]) {
        console.log(k + ': ' + (exp[k].indexOf('ENC:') === 0 ? '已加密 ✓' : '明文 ✗'));
      } else {
        console.log(k + ': (不存在)');
      }
    });
  }

  process.exit();
}
run().catch(function(e) { console.error(e.message); process.exit(1); });
