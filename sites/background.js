var resultTabsMap = {};
var collageMap = {}; // sourceId -> collageTabId (1:1)

chrome.runtime.onMessage.addListener(function (msg, sender) {
  if (msg.action === 'openTab' && msg.url) {
    chrome.tabs.create({ url: msg.url }, function (tab) {
      var sourceId = sender.tab.id;
      if (!resultTabsMap[sourceId]) resultTabsMap[sourceId] = [];
      resultTabsMap[sourceId].push(tab.id);
    });
  }
  // 拼图页面：紧挨源标签打开，一对一关联
  if (msg.action === 'openCollage' && msg.url) {
    var sourceId = sender.tab.id;
    if (collageMap[sourceId]) {
      chrome.tabs.update(collageMap[sourceId], { active: true }, function () {
        if (chrome.runtime.lastError) {
          delete collageMap[sourceId];
          chrome.tabs.create({ url: msg.url, index: sender.tab.index + 1 }, function (tab) {
            collageMap[sourceId] = tab.id;
          });
        }
      });
      return;
    }
    chrome.tabs.create({ url: msg.url, index: sender.tab.index + 1 }, function (tab) {
      collageMap[sourceId] = tab.id;
    });
  }
  // 去中文页面：紧挨源标签打开，一对一关联
  if (msg.action === 'openTextCleaner' && msg.url) {
    var sourceId = sender.tab.id;
    if (cleanerMap[sourceId]) {
      chrome.tabs.update(cleanerMap[sourceId], { active: true }, function () {
        if (chrome.runtime.lastError) {
          delete cleanerMap[sourceId];
          chrome.tabs.create({ url: msg.url, index: sender.tab.index + 1 }, function (tab) {
            cleanerMap[sourceId] = tab.id;
          });
        }
      });
      return;
    }
    chrome.tabs.create({ url: msg.url, index: sender.tab.index + 1 }, function (tab) {
      cleanerMap[sourceId] = tab.id;
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
  // 拼图：源标签关闭→关闭拼图；拼图关闭→仅移除映射
  if (collageMap[tabId]) {
    chrome.tabs.remove(collageMap[tabId]);
    delete collageMap[tabId];
    return;
  }
  for (var sid in collageMap) {
    if (collageMap[sid] === tabId) {
      delete collageMap[sid];
      return;
    }
  }
  // 去中文：源标签关闭→关闭去中文页面；去中文页面关闭→仅移除映射
  if (cleanerMap[tabId]) {
    chrome.tabs.remove(cleanerMap[tabId]);
    delete cleanerMap[tabId];
    return;
  }
  for (var sid in cleanerMap) {
    if (cleanerMap[sid] === tabId) {
      delete cleanerMap[sid];
      return;
    }
  }
  // Source tab closed -> close result tabs
  if (resultTabsMap[tabId]) {
    resultTabsMap[tabId].forEach(function (rid) {
      chrome.tabs.remove(rid);
    });
    delete resultTabsMap[tabId];
    return;
  }
  // Result tab closed -> close source tab
  for (var sid2 in resultTabsMap) {
    var idx = resultTabsMap[sid2].indexOf(tabId);
    if (idx !== -1) {
      chrome.tabs.remove(parseInt(sid2));
      delete resultTabsMap[sid2];
      break;
    }
  }
});
