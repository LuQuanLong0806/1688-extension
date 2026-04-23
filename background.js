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
