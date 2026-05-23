// LLM 多供应商 + 配置管理 + 降级链
const http = require('http');
const https = require('https');
const crypto = require('crypto');

var API_BASE = 'https://open.bigmodel.cn/api/paas/v4';

function getApiKey() {
  try {
    var row = require('../../db').getOne("SELECT value FROM settings WHERE key = 'zhipu_api_key'");
    return row ? row.value : '';
  } catch (e) { return ''; }
}

var AI_USE_CASES = {
  category: {
    label: '分类推荐', defaultModel: 'glm-4.7-flash',
    models: [{ id: 'glm-4.7-flash', name: 'GLM-4.7-Flash（免费）' }, { id: 'glm-4-flash', name: 'GLM-4-Flash（免费）' }]
  },
  vision: {
    label: '智能检测', defaultModel: 'glm-4v-flash',
    models: [{ id: 'glm-4v-flash', name: 'GLM-4V-Flash（免费）' }]
  },
  image: {
    label: '图片生成', defaultModel: 'cogview-3-flash',
    models: [{ id: 'cogview-3-flash', name: 'CogView-3-Flash（免费）' }, { id: 'cogview-4', name: 'CogView-4' }]
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

function qwenChatRequest(messages, temperature, maxTokens) {
  return new Promise(function (resolve, reject) {
    var cfg = getProviderConfig('qwen');
    if (!cfg.apiKey) return reject(new Error('未配置通义千问API Key'));
    var body = { model: 'qwen-turbo', messages: messages, temperature: temperature || 0.1 };
    if (maxTokens) body.max_tokens = maxTokens;
    var data = JSON.stringify(body);
    var req = https.request({
      hostname: 'dashscope.aliyuncs.com', port: 443, path: '/compatible-mode/v1/chat/completions',
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.apiKey, 'Content-Length': Buffer.byteLength(data) }
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

function hmacSha256(key, msg) { return crypto.createHmac('sha256', key).update(msg, 'utf8').digest(); }
function sha256Hex(msg) { return crypto.createHash('sha256').update(msg, 'utf8').digest('hex'); }

function hunyuanChatRequest(messages, temperature, maxTokens) {
  return new Promise(function (resolve, reject) {
    var cfg = getProviderConfig('hunyuan');
    if (!cfg.secretId || !cfg.secretKey) return reject(new Error('未配置腾讯云密钥'));
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
    var sig = crypto.createHmac('sha256', hmacSha256(hmacSha256(hmacSha256('TC3' + cfg.secretKey, date), service), 'tc3_request')).update(stringToSign, 'utf8').digest('hex');
    var auth = 'TC3-HMAC-SHA256 Credential=' + cfg.secretId + '/' + credentialScope + ', SignedHeaders=' + signedHeaders + ', Signature=' + sig;
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

function categoryLLMRequest(apiPath, body) { return runLLMChain(CATEGORY_LLM_CHAIN, apiPath, body); }
function extractionLLMRequest(apiPath, body) { return runLLMChain(EXTRACTION_LLM_CHAIN, apiPath, body); }

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
  var zhipuConfig = getAIConfig('category');
  function tryModel(i) {
    if (i >= chain.length) return Promise.reject(new Error('所有模型均不可用'));
    var step = chain[i];
    var stepLabel = step.name + (step.model ? '(' + step.model + ')' : '');
    if (isModelBlocked(step.name)) { console.log('[模型链]', stepLabel, '健康检查不通过，跳过'); return tryModel(i + 1); }
    console.log('[模型链] 尝试:', stepLabel);
    if (step.provider === 'zhipu') {
      body.model = step.model; body.enable_thinking = false;
      return zhipuRequest(apiPath, body, { apiKey: zhipuConfig.apiKey }).then(function (r) { markModelSuccess(step.name); return r; }).catch(function (err) { markModelFail(step.name); if (isRateLimitError(err)) { console.log('[模型链]', stepLabel, '限流，切换下一个'); return tryModel(i + 1); } throw err; });
    }
    if (step.provider === 'qwen') {
      var qc = getProviderConfig('qwen'); if (!qc.apiKey) return tryModel(i + 1);
      return qwenChatRequest(body.messages, body.temperature, body.max_tokens).then(function (r) { markModelSuccess(step.name); return r; }).catch(function (err) { markModelFail(step.name); if (isRateLimitError(err)) { console.log('[模型链]', stepLabel, '限流，切换下一个'); return tryModel(i + 1); } throw err; });
    }
    if (step.provider === 'hunyuan') {
      var hc = getProviderConfig('hunyuan'); if (!hc.secretId) return tryModel(i + 1);
      return hunyuanChatRequest(body.messages, body.temperature, body.max_tokens).then(function (r) { markModelSuccess(step.name); return r; }).catch(function (err) { markModelFail(step.name); if (isRateLimitError(err)) { console.log('[模型链]', stepLabel, '限流，切换下一个'); return tryModel(i + 1); } throw err; });
    }
    if (step.provider === 'ollama') {
      return ollamaChatRequest(body.messages, body.temperature, body.max_tokens).then(function (r) { markModelSuccess(step.name); return r; }).catch(function (err) { markModelFail(step.name); console.log('[模型链]', stepLabel, '不可用:', err.message); return tryModel(i + 1); });
    }
    return tryModel(i + 1);
  }
  return tryModel(0);
}

function getAIConfigs() {
  try { var row = require('../../db').getOne("SELECT value FROM settings WHERE key = 'ai_configs'"); if (row && row.value) return JSON.parse(row.value); } catch (e) {}
  return {};
}
function saveAIConfigs(configs) {
  require('../../db').run("INSERT OR REPLACE INTO settings (key, value) VALUES ('ai_configs', ?)", [JSON.stringify(configs)]);
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

module.exports = {
  API_BASE, AI_USE_CASES,
  getApiKey, getAIConfigs, saveAIConfigs, getAIConfig, getProviderConfig, maskApiKey,
  zhipuRequest,
  categoryLLMRequest, extractionLLMRequest, runLLMChain,
  imageLLMRequest: function (apiPath, body) { var config = getAIConfig('image'); return zhipuRequest(apiPath, body, { apiKey: config.apiKey }); }
};
