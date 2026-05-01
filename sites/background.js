var resultTabsMap = {};

chrome.runtime.onMessage.addListener(function (msg, sender) {
  if (msg.action === 'openTab' && msg.url) {
    chrome.tabs.create({ url: msg.url }, function (tab) {
      var sourceId = sender.tab.id;
      if (!resultTabsMap[sourceId]) resultTabsMap[sourceId] = [];
      resultTabsMap[sourceId].push(tab.id);
    });
  }
  if (msg.action === 'closeSourceTab') {
    chrome.tabs.remove(sender.tab.id);
  }
  // 方案1: background 中继 —— 无需服务器，即时通知所有 1688 标签页
  if (msg.action === 'clearResultSelections') {
    chrome.tabs.query({}, function (tabs) {
      for (var i = 0; i < tabs.length; i++) {
        try { chrome.tabs.sendMessage(tabs[i].id, msg); } catch (e) {}
      }
    });
  }
});

chrome.tabs.onRemoved.addListener(function (tabId) {
  // Source tab closed -> close result tabs
  if (resultTabsMap[tabId]) {
    resultTabsMap[tabId].forEach(function (rid) {
      chrome.tabs.remove(rid);
    });
    delete resultTabsMap[tabId];
    return;
  }
  // Result tab closed -> close source tab
  for (var sid in resultTabsMap) {
    var idx = resultTabsMap[sid].indexOf(tabId);
    if (idx !== -1) {
      chrome.tabs.remove(parseInt(sid));
      delete resultTabsMap[sid];
      break;
    }
  }
});
