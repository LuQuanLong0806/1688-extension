// LLM 多供应商 + 多Token轮换 + 降级链
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const sec = require('../../crypto');

var API_BASE = 'https://open.bigmodel.cn/api/paas/v4';

// ===== 多 Key 存储 =====

// 统一归一化：旧格式纯字符串 → {key, label}
function normalizeKeyEntry(entry) {
  if (typeof entry === 'string') return { key: entry, label: '' };
  return entry;
}

function getApiKey() {
  var keys = getZhipuKeys();
  return keys.length ? keys[0].key : '';
}

function getZhipuKeys() {
  try {
    var row = require('../../db').getOne("SELECT value FROM settings WHERE key = 'zhipu_api_keys'");
    if (row && row.value) {
      var arr = JSON.parse(sec.decrypt(row.value));
      if (Array.isArray(arr) && arr.length) return arr.filter(function (e) { var k = typeof e === 'string' ? e : (e && e.key); return k && k.trim(); }).map(normalizeKeyEntry);
    }
  } catch (e) {}
  // 兼容旧格式：单个 key
  try {
    var row = require('../../db').getOne("SELECT value FROM settings WHERE key = 'zhipu_api_key'");
    if (row && row.value) { var v = sec.decrypt(row.value).trim(); if (v) return [{ key: v, label: '' }]; }
  } catch (e) {}
  return [];
}

function saveZhipuKeys(keys) {
  require('../../db').run("INSERT OR REPLACE INTO settings (key, value) VALUES ('zhipu_api_keys', ?)", [sec.encrypt(JSON.stringify(keys))]);
  require('../../db').scheduleSave();
}

function getQwenKeys() {
  var cfg = getProviderConfig('qwen');
  if (cfg.apiKeys && Array.isArray(cfg.apiKeys) && cfg.apiKeys.length) return cfg.apiKeys.filter(function (e) { var k = typeof e === 'string' ? e : (e && e.key); return k && k.trim(); }).map(normalizeKeyEntry);
  if (cfg.apiKey && cfg.apiKey.trim()) return [{ key: cfg.apiKey.trim(), label: '' }];
  return [];
}

function getHunyuanAccounts() {
  var cfg = getProviderConfig('hunyuan');
  if (cfg.accounts && Array.isArray(cfg.accounts) && cfg.accounts.length) return cfg.accounts.filter(function (a) { return a.secretId && a.secretKey; });
  if (cfg.secretId && cfg.secretKey) return [{ secretId: cfg.secretId, secretKey: cfg.secretKey, label: '' }];
  return [];
}

function getQwenVlKey() {
  // 1. 优先从通义千问Key池取
  var qwenKeys = getQwenKeys();
  if (qwenKeys.length) return qwenKeys[0].key;
  // 2. 回退到旧VL专用Key（兼容旧数据）
  try {
    var row = require('../../db').getOne("SELECT value FROM settings WHERE key = 'qwen_vl_api_key'");
    if (row && row.value) return sec.decrypt(row.value).trim();
  } catch (e) {}
  return 'sk-ad9a93ab29e34635a92b75fd2d751f81'; // 内置默认key
}

function saveQwenVlKey(key) {
  require('../../db').run("INSERT OR REPLACE INTO settings (key, value) VALUES ('qwen_vl_api_key', ?)", [sec.encrypt(key)]);
  require('../../db').scheduleSave();
}

var AI_USE_CASES = {
  category: {
    label: '分类推荐', defaultModel: 'glm-4.7-flash',
    models: [{ id: 'glm-4.7-flash', name: 'GLM-4.7-Flash（免费）' }, { id: 'glm-4-flash', name: 'GLM-4-Flash（免费）' }]
  },
  vision: {
    label: '智能检测', defaultModel: 'glm-4.6v-flash',
    models: [{ id: 'glm-4.6v-flash', name: 'GLM-4.6V-Flash（免费）' }, { id: 'glm-4v-flash', name: 'GLM-4V-Flash（免费，旧版）' }]
  },
  image: {
    label: '图片生成', defaultModel: 'cogview-3-flash',
    models: [{ id: 'cogview-3-flash', name: 'CogView-3-Flash（免费）' }, { id: 'cogview-4', name: 'CogView-4' }]
  },
  recognize: {
    label: '图片识别', defaultModel: 'qwen3.6-flash',
    models: [{ id: 'qwen3.6-flash', name: 'Qwen3.6-Flash（0.5元/百万token）' }, { id: 'qwen3.7-plus', name: 'Qwen3.7-Plus（4元/百万token）' }, { id: 'qwen-vl-plus', name: 'Qwen-VL-Plus（旧版）' }]
  }
};

function getProviderConfig(provider) {
  var configs = getAIConfigs();
  return (configs.providers && configs.providers[provider]) || {};
}

function isRateLimitError(err) {
  var msg = (err && err.message) || '';
  var keywords = ['访问量过大', '限流', '速率限制', '请求频率', 'rate', 'Rate', '余额', 'ResourceExhausted', 'Throttling', 'frequency', 'quota', '429', '限制'];
  for (var i = 0; i < keywords.length; i++) { if (msg.indexOf(keywords[i]) >= 0) return true; }
  return false;
}

// ===== Key 轮换 & 冷却 =====

var keyCooldowns = {}; // { 'zhipu_0': timestamp, 'qwen_2': timestamp, 'hunyuan_1': timestamp }
var COOLDOWN_MS = 120000; // 2 分钟冷却

function markKeyCooldown(provider, keyIndex) {
  keyCooldowns[provider + '_' + keyIndex] = Date.now();
  console.log('[Key轮换]', provider, 'Key#' + keyIndex, '限流冷却', (COOLDOWN_MS / 1000) + 's');
}

function isKeyCooling(provider, keyIndex) {
  var ts = keyCooldowns[provider + '_' + keyIndex];
  if (!ts) return false;
  if (Date.now() - ts >= COOLDOWN_MS) { delete keyCooldowns[provider + '_' + keyIndex]; return false; }
  return true;
}

function clearKeyCooldown(provider, keyIndex) {
  delete keyCooldowns[provider + '_' + keyIndex];
}

// ===== 供应商请求函数（接收凭据参数）=====

function ollamaChatRequest(messages, temperature, maxTokens) {
  return new Promise(function (resolve, reject) {
    var cfg = getProviderConfig('ollama');
    var port = (cfg.port && parseInt(cfg.port)) || 11434;
    var modelName = cfg.model || 'qwen3:8b';
    var body = { model: modelName, messages: messages, temperature: temperature || 0.1, stream: false };
    if (maxTokens) body.max_tokens = maxTokens;
    var data = JSON.stringify(body);
    var req = http.request({
      hostname: 'localhost', port: port, path: '/v1/chat/completions',
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    }, function (res) {
      var d = '';
      res.on('data', function (c) { d += c; });
      res.on('end', function () {
        try {
          var result = JSON.parse(d);
          if (result.error) return reject(new Error(result.error.message || JSON.stringify(result.error)));
          if (!result.choices || !result.choices.length) return reject(new Error('Ollama返回空结果'));
          resolve(result);
        } catch (e) { reject(new Error('Ollama解析失败: ' + d.substring(0, 100))); }
      });
    });
    req.on('error', function (e) { reject(new Error('Ollama连接失败(未启动?)')); });
    req.write(data);
    req.end();
  });
}

function qwenChatRequest(messages, temperature, maxTokens, apiKey) {
  return new Promise(function (resolve, reject) {
    if (!apiKey) return reject(new Error('未配置通义千问API Key'));
    var body = { model: 'qwen-turbo', messages: messages, temperature: temperature || 0.1 };
    if (maxTokens) body.max_tokens = maxTokens;
    var data = JSON.stringify(body);
    var req = https.request({
      hostname: 'dashscope.aliyuncs.com', port: 443, path: '/compatible-mode/v1/chat/completions',
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey, 'Content-Length': Buffer.byteLength(data) }
    }, function (res) {
      var d = '';
      res.on('data', function (c) { d += c; });
      res.on('end', function () {
        try {
          var result = JSON.parse(d);
          if (result.error) return reject(new Error(result.error.message || JSON.stringify(result.error)));
          if (!result.choices || !result.choices.length) return reject(new Error('Qwen返回空结果'));
          resolve(result);
        } catch (e) { reject(new Error('Qwen解析失败: ' + d.substring(0, 100))); }
      });
    });
    req.on('error', function (e) { reject(e); });
    req.write(data);
    req.end();
  });
}

// 通义千问 VL（视觉理解）— 内部调用，接收 apiKey 参数
function qwenVlRequestRaw(imageContent, prompt, model, apiKey) {
  return new Promise(function (resolve, reject) {
    if (!apiKey) return reject(new Error('未配置通义千问VL API Key'));
    var body = {
      model: model || 'qwen3.6-flash',
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: imageContent } },
          { type: 'text', text: prompt }
        ]
      }],
      temperature: 0.3,
      max_tokens: 1024
    };
    var data = JSON.stringify(body);
    var req = https.request({
      hostname: 'dashscope.aliyuncs.com', port: 443, path: '/compatible-mode/v1/chat/completions',
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey, 'Content-Length': Buffer.byteLength(data) }
    }, function (res) {
      var chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () {
        var raw = Buffer.concat(chunks).toString();
        try {
          var result = JSON.parse(raw);
          if (result.error) return reject(new Error(result.error.message || JSON.stringify(result.error)));
          if (!result.choices || !result.choices.length) return reject(new Error('Qwen VL返回空结果'));
          var text = result.choices[0].message.content || '';
          var usage = result.usage || {};
          resolve({ text: text, inputTokens: usage.prompt_tokens || 0, outputTokens: usage.completion_tokens || 0, totalTokens: usage.total_tokens || 0 });
        } catch (e) { reject(new Error('Qwen VL解析失败: ' + raw.substring(0, 200))); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// 兼容旧调用：qwenVlRequest 仍从 Key 池取 Key
function qwenVlRequest(imageContent, prompt, model, apiKey) {
  var key = apiKey || getQwenVlKey();
  return qwenVlRequestRaw(imageContent, prompt, model, key);
}

function hmacSha256(key, msg) { return crypto.createHmac('sha256', key).update(msg, 'utf8').digest(); }
function sha256Hex(msg) { return crypto.createHash('sha256').update(msg, 'utf8').digest('hex'); }

function hunyuanChatRequest(messages, temperature, maxTokens, secretId, secretKey) {
  return new Promise(function (resolve, reject) {
    if (!secretId || !secretKey) return reject(new Error('未配置腾讯云密钥'));
    var tcMessages = messages.map(function (m) { return { Role: m.role, Content: m.content }; });
    var reqBody = JSON.stringify({ Model: 'hunyuan-lite', Messages: tcMessages, Temperature: temperature || 0.1, TopP: 0.7 });
    var host = 'hunyuan.tencentcloudapi.com', service = 'hunyuan', action = 'ChatCompletions';
    var ts = Math.floor(Date.now() / 1000), date = new Date(ts * 1000).toISOString().split('T')[0];
    var ct = 'application/json; charset=utf-8';
    var canonicalHeaders = 'content-type:' + ct + '\nhost:' + host + '\nx-tc-action:' + action.toLowerCase() + '\n';
    var signedHeaders = 'content-type;host;x-tc-action';
    var canonicalRequest = ['POST', '/', '', canonicalHeaders, signedHeaders, sha256Hex(reqBody)].join('\n');
    var credentialScope = date + '/' + service + '/tc3_request';
    var stringToSign = ['TC3-HMAC-SHA256', ts, credentialScope, sha256Hex(canonicalRequest)].join('\n');
    var sig = crypto.createHmac('sha256', hmacSha256(hmacSha256(hmacSha256('TC3' + secretKey, date), service), 'tc3_request')).update(stringToSign, 'utf8').digest('hex');
    var auth = 'TC3-HMAC-SHA256 Credential=' + secretId + '/' + credentialScope + ', SignedHeaders=' + signedHeaders + ', Signature=' + sig;
    var req = https.request({
      hostname: host, port: 443, path: '/', method: 'POST',
      headers: { 'Content-Type': ct, 'Host': host, 'X-TC-Action': action, 'X-TC-Version': '2023-09-01', 'X-TC-Timestamp': ts.toString(), 'X-TC-Region': 'ap-guangzhou', 'Authorization': auth, 'Content-Length': Buffer.byteLength(reqBody) }
    }, function (res) {
      var d = '';
      res.on('data', function (c) { d += c; });
      res.on('end', function () {
        try {
          var result = JSON.parse(d);
          if (result.Response && result.Response.Error) { return reject(new Error(result.Response.Error.Message || JSON.stringify(result.Response.Error))); }
          var rawChoices = (result.Response && result.Response.Choices) || [];
          if (!rawChoices.length) return reject(new Error('混元返回空结果'));
          resolve({ choices: rawChoices.map(function (c) { return { message: { role: 'assistant', content: (c.Message && c.Message.Content) || '' }, finish_reason: c.FinishReason || 'stop' }; }) });
        } catch (e) { reject(new Error('混元解析失败: ' + d.substring(0, 100))); }
      });
    });
    req.on('error', function (e) { reject(e); });
    req.write(reqBody);
    req.end();
  });
}

// ===== 降级链 =====

var CATEGORY_LLM_CHAIN = [
  { name: 'GLM-4.7-Flash', provider: 'zhipu', model: 'glm-4.7-flash' },
  { name: '腾讯混元', provider: 'hunyuan' },
  { name: '通义千问', provider: 'qwen' },
  { name: 'GLM-4-Flash', provider: 'zhipu', model: 'glm-4-flash' }
];
var EXTRACTION_LLM_CHAIN = [
  { name: '通义千问', provider: 'qwen' },
  { name: '腾讯混元', provider: 'hunyuan' },
  { name: 'GLM-4-Flash', provider: 'zhipu', model: 'glm-4-flash' },
  { name: 'GLM-4.7-Flash', provider: 'zhipu', model: 'glm-4.7-flash' }
];
var VISION_LLM_CHAIN = [
  { name: 'GLM-4.6V-Flash', provider: 'zhipu', model: 'glm-4.6v-flash' },
  { name: 'GLM-4V-Flash', provider: 'zhipu', model: 'glm-4v-flash' }
];
var IMAGE_GEN_LLM_CHAIN = [
  { name: 'CogView-3-Flash', provider: 'zhipu', model: 'cogview-3-flash' },
  { name: 'CogView-4', provider: 'zhipu', model: 'cogview-4' }
];

// ===== 统一调度 =====

var DISPATCH_AVAILABLE_MODELS = {
  zhipu:  { text: ['glm-4.7-flash', 'glm-4-flash'], vision: ['glm-4.6v-flash', 'glm-4v-flash'], image: ['cogview-3-flash', 'cogview-4'] },
  qwen:   { text: ['qwen-turbo'], vision: ['qwen3.6-flash', 'qwen3.7-plus', 'qwen-vl-plus'] },
  hunyuan:{ text: ['hunyuan-lite'] },
  ollama: { text: [] }
};

function buildDefaultDispatchOrder() {
  return {
    version: 3,
    dispatch: {
      text:   [{ vendor: 'zhipu', model: 'glm-4.7-flash' }, { vendor: 'hunyuan', model: 'hunyuan-lite' }, { vendor: 'qwen', model: 'qwen-turbo' }],
      vision: [{ vendor: 'zhipu', model: 'glm-4.6v-flash' }, { vendor: 'qwen', model: 'qwen3.6-flash' }],
      image:  [{ vendor: 'zhipu', model: 'cogview-3-flash' }]
    }
  };
}

function getDispatchOrder() {
  try {
    var row = require('../../db').getOne("SELECT value FROM settings WHERE key = 'ai_dispatch_order'");
    if (row && row.value) return JSON.parse(sec.decrypt(row.value));
  } catch (e) {}
  return null;
}

function saveDispatchOrder(order) {
  require('../../db').run("INSERT OR REPLACE INTO settings (key, value) VALUES ('ai_dispatch_order', ?)", [sec.encrypt(JSON.stringify(order))]);
  require('../../db').scheduleSave();
}

function ensureDispatchMigration() {
  try {
    var migrated = require('../../db').getOne("SELECT value FROM settings WHERE key = 'ai_dispatch_migrated'");
    if (!migrated) {
      var order = buildDefaultDispatchOrder();
      saveDispatchOrder(order);
      require('../../db').run("INSERT OR REPLACE INTO settings (key, value) VALUES ('ai_dispatch_migrated', '1')");
      require('../../db').scheduleSave();
      console.log('[调度] 首次初始化默认调度顺序');
    }
  } catch (e) {
    console.log('[调度] 迁移检查异常:', e.message);
  }
}

function dispatchByCategory(category, apiPath, body) {
  ensureDispatchMigration();
  var order = getDispatchOrder() || buildDefaultDispatchOrder();
  var entries = (order.dispatch && order.dispatch[category]) || [];

  function tryEntry(i) {
    if (i >= entries.length) return Promise.reject(new Error('所有模型均不可用'));
    var entry = entries[i];
    var label = entry.vendor + '/' + entry.model;
    if (isModelBlocked(label)) {
      console.log('[调度]', label, '健康检查不通过，跳过');
      return tryEntry(i + 1);
    }
    console.log('[调度] 尝试:', label);

    if (entry.vendor === 'zhipu') {
      var keys = getZhipuKeys();
      if (!keys.length) return tryEntry(i + 1);
      body.model = entry.model; body.enable_thinking = false;
      return tryKeysDispatch('zhipu', keys, 0, function (k) {
        return zhipuRequest(apiPath, body, { apiKey: k.key || k });
      }).then(function (r) { markModelSuccess(label); return r; })
        .catch(function (err) {
          if (err && err.message === '__ALL_KEYS_EXHAUSTED__') {
            markModelFail(label);
            console.log('[调度]', label, '所有Key限流，跳下一厂商');
            return tryEntry(i + 1);
          }
          markModelFail(label); throw err;
        });
    }
    if (entry.vendor === 'qwen') {
      var keys = getQwenKeys();
      if (!keys.length) return tryEntry(i + 1);
      // 视觉识别：body._vlImageContent 存在时走 qwenVl 格式
      if (body._vlImageContent) {
        var imgContent = body._vlImageContent;
        var vlPrompt = (body.messages && body.messages[0] && body.messages[0].content) || '';
        return tryKeysDispatch('qwen', keys, 0, function (k) {
          return qwenVlRequestRaw(imgContent, vlPrompt, entry.model, k.key || k);
        }).then(function (r) { markModelSuccess(label); return r; })
          .catch(function (err) {
            if (err && err.message === '__ALL_KEYS_EXHAUSTED__') {
              markModelFail(label);
              console.log('[调度]', label, '所有Key限流，跳下一厂商');
              return tryEntry(i + 1);
            }
            markModelFail(label); throw err;
          });
      }
      return tryKeysDispatch('qwen', keys, 0, function (k) {
        return qwenChatRequest(body.messages, body.temperature, body.max_tokens, k.key || k);
      }).then(function (r) { markModelSuccess(label); return r; })
        .catch(function (err) {
          if (err && err.message === '__ALL_KEYS_EXHAUSTED__') {
            markModelFail(label);
            console.log('[调度]', label, '所有Key限流，跳下一厂商');
            return tryEntry(i + 1);
          }
          markModelFail(label); throw err;
        });
    }
    if (entry.vendor === 'hunyuan') {
      var accounts = getHunyuanAccounts();
      if (!accounts.length) return tryEntry(i + 1);
      return tryKeysDispatch('hunyuan', accounts, 0, function (acc) {
        return hunyuanChatRequest(body.messages, body.temperature, body.max_tokens, acc.secretId, acc.secretKey);
      }).then(function (r) { markModelSuccess(label); return r; })
        .catch(function (err) {
          if (err && err.message === '__ALL_KEYS_EXHAUSTED__') {
            markModelFail(label);
            console.log('[调度]', label, '所有Key限流，跳下一厂商');
            return tryEntry(i + 1);
          }
          markModelFail(label); throw err;
        });
    }
    if (entry.vendor === 'ollama') {
      return ollamaChatRequest(body.messages, body.temperature, body.max_tokens)
        .then(function (r) { markModelSuccess(label); return r; })
        .catch(function (err) { markModelFail(label); console.log('[调度]', label, '不可用:', err.message); return tryEntry(i + 1); });
    }
    return tryEntry(i + 1);
  }

  function tryKeysDispatch(provider, keys, keyIdx, callFn) {
    if (keyIdx >= keys.length) return Promise.reject(new Error('__ALL_KEYS_EXHAUSTED__'));
    if (isKeyCooling(provider, keyIdx)) return tryKeysDispatch(provider, keys, keyIdx + 1, callFn);
    console.log('[Key轮换]', provider, '尝试Key#' + keyIdx);
    return callFn(keys[keyIdx])
      .then(function (r) { clearKeyCooldown(provider, keyIdx); return r; })
      .catch(function (err) {
        if (isRateLimitError(err)) {
          markKeyCooldown(provider, keyIdx);
          return tryKeysDispatch(provider, keys, keyIdx + 1, callFn);
        }
        throw err;
      });
  }

  return tryEntry(0);
}

function categoryLLMRequest(apiPath, body) { return dispatchByCategory('text', apiPath, body); }
function extractionLLMRequest(apiPath, body) { return dispatchByCategory('text', apiPath, body); }
function visionLLMRequest(apiPath, body) { return dispatchByCategory('vision', apiPath, body); }
function imageGenLLMRequest(apiPath, body) { return dispatchByCategory('image', apiPath, body); }
function recognizeLLMRequest(imageContent, prompt, model) {
  return dispatchByCategory('vision', '/chat/completions', {
    _vlImageContent: imageContent,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    max_tokens: 1024
  });
}

var modelHealthCache = {};
function isModelBlocked(name) {
  var info = modelHealthCache[name];
  if (!info) return false;
  if (info.failCount >= 3 && Date.now() - info.lastFailTime < 120000) return true;
  if (info.failCount >= 3 && Date.now() - info.lastFailTime >= 120000) { delete modelHealthCache[name]; return false; }
  return false;
}
function markModelFail(name) {
  if (!modelHealthCache[name]) modelHealthCache[name] = { failCount: 0, lastFailTime: 0 };
  modelHealthCache[name].failCount++; modelHealthCache[name].lastFailTime = Date.now();
  console.log('[模型健康]', name, '失败次数:', modelHealthCache[name].failCount);
}
function markModelSuccess(name) { delete modelHealthCache[name]; }

function runLLMChain(chain, apiPath, body) {
  function tryModel(i) {
    if (i >= chain.length) return Promise.reject(new Error('所有模型均不可用'));
    var step = chain[i];
    var stepLabel = step.name + (step.model ? '(' + step.model + ')' : '');
    if (isModelBlocked(step.name)) { console.log('[模型链]', stepLabel, '健康检查不通过，跳过'); return tryModel(i + 1); }
    console.log('[模型链] 尝试:', stepLabel);

    if (step.provider === 'zhipu') {
      var keys = getZhipuKeys();
      if (!keys.length) return tryModel(i + 1);
      body.model = step.model; body.enable_thinking = false;
      return tryKeys('zhipu', keys, 0, function (entry) {
        return zhipuRequest(apiPath, body, { apiKey: entry.key || entry });
      }).then(function (r) { markModelSuccess(step.name); return r; })
        .catch(function (err) {
          if (err && err.message === '__ALL_KEYS_EXHAUSTED__') {
            markModelFail(step.name);
            console.log('[模型链]', stepLabel, '所有Key限流，切换下一个供应商');
            return tryModel(i + 1);
          }
          markModelFail(step.name); throw err;
        });
    }
    if (step.provider === 'qwen') {
      var keys = getQwenKeys();
      if (!keys.length) return tryModel(i + 1);
      return tryKeys('qwen', keys, 0, function (entry) {
        return qwenChatRequest(body.messages, body.temperature, body.max_tokens, entry.key || entry);
      }).then(function (r) { markModelSuccess(step.name); return r; })
        .catch(function (err) {
          if (err && err.message === '__ALL_KEYS_EXHAUSTED__') {
            markModelFail(step.name);
            console.log('[模型链]', stepLabel, '所有Key限流，切换下一个供应商');
            return tryModel(i + 1);
          }
          markModelFail(step.name); throw err;
        });
    }
    if (step.provider === 'hunyuan') {
      var accounts = getHunyuanAccounts();
      if (!accounts.length) return tryModel(i + 1);
      return tryKeys('hunyuan', accounts, 0, function (acc) {
        return hunyuanChatRequest(body.messages, body.temperature, body.max_tokens, acc.secretId, acc.secretKey);
      }).then(function (r) { markModelSuccess(step.name); return r; })
        .catch(function (err) {
          if (err && err.message === '__ALL_KEYS_EXHAUSTED__') {
            markModelFail(step.name);
            console.log('[模型链]', stepLabel, '所有Key限流，切换下一个供应商');
            return tryModel(i + 1);
          }
          markModelFail(step.name); throw err;
        });
    }
    if (step.provider === 'ollama') {
      return ollamaChatRequest(body.messages, body.temperature, body.max_tokens).then(function (r) { markModelSuccess(step.name); return r; }).catch(function (err) { markModelFail(step.name); console.log('[模型链]', stepLabel, '不可用:', err.message); return tryModel(i + 1); });
    }
    return tryModel(i + 1);
  }

  // 同供应商内多 Key 轮换
  function tryKeys(provider, keys, keyIdx, callFn) {
    if (keyIdx >= keys.length) return Promise.reject(new Error('__ALL_KEYS_EXHAUSTED__'));
    if (isKeyCooling(provider, keyIdx)) return tryKeys(provider, keys, keyIdx + 1, callFn);
    console.log('[Key轮换]', provider, '尝试Key#' + keyIdx);
    return callFn(keys[keyIdx])
      .then(function (r) { clearKeyCooldown(provider, keyIdx); return r; })
      .catch(function (err) {
        if (isRateLimitError(err)) {
          markKeyCooldown(provider, keyIdx);
          return tryKeys(provider, keys, keyIdx + 1, callFn);
        }
        throw err;
      });
  }

  return tryModel(0);
}

// ===== 配置管理 =====

function getAIConfigs() {
  try { var row = require('../../db').getOne("SELECT value FROM settings WHERE key = 'ai_configs'"); if (row && row.value) return JSON.parse(sec.decrypt(row.value)); } catch (e) {}
  return {};
}
function saveAIConfigs(configs) {
  require('../../db').run("INSERT OR REPLACE INTO settings (key, value) VALUES ('ai_configs', ?)", [sec.encrypt(JSON.stringify(configs))]);
  require('../../db').scheduleSave();
}
function getAIConfig(useCase) {
  var configs = getAIConfigs();
  var uc = configs[useCase] || {};
  return { model: uc.model || (AI_USE_CASES[useCase] && AI_USE_CASES[useCase].defaultModel) || '', apiKey: uc.apiKey || getApiKey() };
}
function maskApiKey(key) {
  if (!key) return '';
  if (key.length <= 8) return '****';
  return key.substring(0, 4) + '****' + key.substring(key.length - 4);
}

function zhipuRequest(apiPath, body, options) {
  return new Promise(function (resolve, reject) {
    var apiKey = (options && options.apiKey) || getApiKey();
    if (!apiKey) return reject(new Error('未配置API密钥，请在AI模型配置中设置'));
    if (options && options.model && !body.model) body.model = options.model;
    var data = JSON.stringify(body);
    var url = new URL(API_BASE + apiPath);
    var reqOptions = {
      hostname: url.hostname, port: 443, path: url.pathname, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey, 'Content-Length': Buffer.byteLength(data) }
    };
    var req = https.request(reqOptions, function (res) {
      var chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () {
        var raw = Buffer.concat(chunks).toString();
        try {
          var json = JSON.parse(raw);
          if (res.statusCode >= 400) { reject(new Error(json.error && json.error.message ? json.error.message : 'API错误 ' + res.statusCode)); }
          else { resolve(json); }
        } catch (e) { reject(new Error('解析响应失败: ' + raw.substring(0, 200))); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// ===== 厂商分组配置 =====

function getVendorConfigs() {
  try {
    var row = require('../../db').getOne("SELECT value FROM settings WHERE key = 'ai_vendor_configs'");
    if (row && row.value) return JSON.parse(sec.decrypt(row.value));
  } catch (e) {}
  return null;
}

function buildVendorConfigsFromLegacy() {
  var aiConfigs = getAIConfigs();
  var provCfg = aiConfigs.providers || {};
  return {
    version: 2,
    vendors: {
      zhipu: {
        models: {
          text:   (aiConfigs.category && aiConfigs.category.model) || 'glm-4.7-flash',
          vision: (aiConfigs.vision  && aiConfigs.vision.model)   || 'glm-4.6v-flash',
          image:  (aiConfigs.image   && aiConfigs.image.model)    || 'cogview-3-flash'
        }
      },
      qwen: {
        models: {
          text:      'qwen-turbo',
          recognize: (aiConfigs.recognize && aiConfigs.recognize.model) || 'qwen3.6-flash'
        }
      },
      hunyuan: {
        models: { text: 'hunyuan-lite' }
      },
      ollama: {
        model: (provCfg.ollama && provCfg.ollama.model) || 'qwen3:8b',
        port:  (provCfg.ollama && provCfg.ollama.port)  || '11434'
      }
    }
  };
}

function saveVendorModels(vendor, modelType, modelId) {
  var vc = getVendorConfigs() || buildVendorConfigsFromLegacy();
  if (!vc.vendors[vendor]) vc.vendors[vendor] = { models: {} };
  if (!vc.vendors[vendor].models) vc.vendors[vendor].models = {};
  vc.vendors[vendor].models[modelType] = modelId;
  // 同步回写旧格式（降级链、运行时逻辑读取）
  var aiConfigs = getAIConfigs();
  var mapping = {
    'zhipu.text': 'category', 'zhipu.vision': 'vision', 'zhipu.image': 'image',
    'qwen.recognize': 'recognize'
  };
  var key = vendor + '.' + modelType;
  if (mapping[key]) {
    if (!aiConfigs[mapping[key]]) aiConfigs[mapping[key]] = {};
    aiConfigs[mapping[key]].model = modelId;
    saveAIConfigs(aiConfigs);
  }
  require('../../db').run("INSERT OR REPLACE INTO settings (key, value) VALUES ('ai_vendor_configs', ?)", [sec.encrypt(JSON.stringify(vc))]);
  require('../../db').scheduleSave();
}

// 旧专用Key自动并入厂商Key池（幂等）
function migrateDedicatedKeys() {
  var aiConfigs = getAIConfigs();
  var zhipuKeys = getZhipuKeys();
  var changed = false;
  // vision 专用Key → 智谱Key池
  if (aiConfigs.vision && aiConfigs.vision.apiKey) {
    var vk = aiConfigs.vision.apiKey;
    if (!zhipuKeys.some(function(e) { return e.key === vk; })) {
      zhipuKeys.push({ key: vk, label: '旧智能检测Key' });
    }
    delete aiConfigs.vision.apiKey;
    changed = true;
  }
  // image 专用Key → 智谱Key池
  if (aiConfigs.image && aiConfigs.image.apiKey) {
    var ik = aiConfigs.image.apiKey;
    if (!zhipuKeys.some(function(e) { return e.key === ik; })) {
      zhipuKeys.push({ key: ik, label: '旧图片生成Key' });
    }
    delete aiConfigs.image.apiKey;
    changed = true;
  }
  // qwen_vl_api_key → 通义Key池
  try {
    var qwenKeys = getQwenKeys();
    var row = require('../../db').getOne("SELECT value FROM settings WHERE key = 'qwen_vl_api_key'");
    if (row && row.value) {
      var vlKey = sec.decrypt(row.value).trim();
      if (vlKey && vlKey !== 'sk-ad9a93ab29e34635a92b75fd2d751f81') {
        if (!qwenKeys.some(function(e) { return e.key === vlKey; })) {
          qwenKeys.push({ key: vlKey, label: '旧VL Key' });
          var cfg = getAIConfigs();
          if (!cfg.providers) cfg.providers = {};
          if (!cfg.providers.qwen) cfg.providers.qwen = {};
          cfg.providers.qwen.apiKeys = qwenKeys;
          delete cfg.providers.qwen.apiKey;
          saveAIConfigs(cfg);
        }
      }
    }
  } catch(e) {}
  if (changed) {
    saveZhipuKeys(zhipuKeys);
    saveAIConfigs(aiConfigs);
  }
}

module.exports = {
  API_BASE, AI_USE_CASES, normalizeKeyEntry,
  getApiKey, getZhipuKeys, saveZhipuKeys, getQwenKeys, getHunyuanAccounts,
  getQwenVlKey, saveQwenVlKey,
  getAIConfigs, saveAIConfigs, getAIConfig, getProviderConfig, maskApiKey,
  zhipuRequest, qwenVlRequest,
  categoryLLMRequest, extractionLLMRequest, runLLMChain,
  visionLLMRequest: visionLLMRequest,
  imageGenLLMRequest: imageGenLLMRequest,
  recognizeLLMRequest: recognizeLLMRequest,
  VISION_LLM_CHAIN: VISION_LLM_CHAIN,
  IMAGE_GEN_LLM_CHAIN: IMAGE_GEN_LLM_CHAIN,
  getVendorConfigs: getVendorConfigs,
  buildVendorConfigsFromLegacy: buildVendorConfigsFromLegacy,
  saveVendorModels: saveVendorModels,
  migrateDedicatedKeys: migrateDedicatedKeys,
  getDispatchOrder: getDispatchOrder,
  buildDefaultDispatchOrder: buildDefaultDispatchOrder,
  saveDispatchOrder: saveDispatchOrder,
  ensureDispatchMigration: ensureDispatchMigration,
  dispatchByCategory: dispatchByCategory,
  DISPATCH_AVAILABLE_MODELS: DISPATCH_AVAILABLE_MODELS
};
