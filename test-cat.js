// 测试通过服务器 API 调用
var http = require('http');
var d = JSON.stringify({ title: '厨房洗碗神器 百洁布 刷锅刷碗', ali_category: '海绵擦' });
var r = http.request({
  hostname: 'localhost', port: 3000, path: '/api/ai/suggest-category',
  method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) }
}, function(res) {
  var b = '';
  res.on('data', function(c) { b += c; });
  res.on('end', function() {
    try {
      var j = JSON.parse(b);
      console.log('分类:', j.category, '| 置信度:', j.confidence, '| 来源:', j.source);
    } catch(e) { console.log(b); }
    process.exit(0);
  });
});
r.on('error', function(e) { console.error(e.message); process.exit(1); });
r.write(d);
r.end();
setTimeout(function() { console.log('timeout'); process.exit(1); }, 30000);
