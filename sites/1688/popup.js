// 登录状态检查
(function () {
  var statusEl = document.getElementById('loginStatus');
  chrome.storage.local.get(['1688_token', '1688_server_url'], function (r) {
    var token = r['1688_token'];
    var serverUrl = r['1688_server_url'] || 'http://localhost:3000';
    if (token) {
      fetch(serverUrl + '/api/me', { headers: { 'Authorization': 'Bearer ' + token } })
        .then(function (res) { return res.json(); })
        .then(function (data) {
          if (data.username) {
            statusEl.innerHTML = '<span class="dot on"></span>' + (data.display_name || data.username) + ' (' + (data.role || '') + ')';
          } else {
            statusEl.innerHTML = '<span class="dot off"></span>未登录，请在页面侧边栏登录';
          }
        })
        .catch(function () {
          statusEl.innerHTML = '<span class="dot off"></span>无法连接服务器';
        });
    } else {
      statusEl.innerHTML = '<span class="dot off"></span>未登录，请在1688页面侧边栏登录';
    }
  });
})();

document.getElementById('grabBtn').addEventListener('click', function () {
  var btn = this;
  var statusEl = document.getElementById('status');

  btn.disabled = true;
  btn.textContent = '⏳ 正在抓取...';
  statusEl.className = 'status';
  statusEl.textContent = '';

  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    var tab = tabs[0];
    if (!tab || !tab.url) {
      statusEl.className = 'status error';
      statusEl.textContent = '❌ 无法获取当前标签页';
      btn.disabled = false;
      btn.textContent = '🚀 开始抓取图片';
      return;
    }

    // 提示：先滚动页面再抓取
    statusEl.textContent = '📌 正在抓取，请稍候...';

    chrome.scripting.executeScript(
      {
        target: { tabId: tab.id },
        files: ['sites/1688/grab-core.js', 'sites/1688/content.js']
      },
      function (results) {
        btn.disabled = false;
        btn.textContent = '🚀 开始抓取图片';

        if (chrome.runtime.lastError) {
          statusEl.className = 'status error';
          statusEl.textContent = '❌ ' + chrome.runtime.lastError.message;
          return;
        }

        if (results && results[0] && results[0].result) {
          var count = results[0].result;
          if (count > 0) {
            statusEl.className = 'status success';
            statusEl.textContent = '✅ 成功抓取 ' + count + ' 张图片！';
          } else {
            statusEl.className = 'status error';
            statusEl.textContent = '❌ 未找到图片，请确认在1688商品页上';
          }
        }
      }
    );
  });
});
