chrome.runtime.onMessage.addListener(function (msg) {
  if (msg.action === 'openTab' && msg.url) {
    chrome.tabs.create({ url: msg.url });
  }
});
