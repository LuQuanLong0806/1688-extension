var resultTabsMap = {};

chrome.runtime.onMessage.addListener(function (msg, sender) {
  if (msg.action === 'openTab' && msg.url) {
    chrome.tabs.create({ url: msg.url }, function (tab) {
      var sourceId = sender.tab.id;
      if (!resultTabsMap[sourceId]) resultTabsMap[sourceId] = [];
      resultTabsMap[sourceId].push(tab.id);
    });
  }
});

chrome.tabs.onRemoved.addListener(function (tabId) {
  if (resultTabsMap[tabId]) {
    resultTabsMap[tabId].forEach(function (rid) {
      chrome.tabs.remove(rid);
    });
    delete resultTabsMap[tabId];
  }
  for (var sid in resultTabsMap) {
    var idx = resultTabsMap[sid].indexOf(tabId);
    if (idx !== -1) {
      resultTabsMap[sid].splice(idx, 1);
      if (resultTabsMap[sid].length === 0) delete resultTabsMap[sid];
    }
  }
});
