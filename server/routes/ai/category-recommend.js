// AI 分类推荐引擎 — 关键词提取/候选搜索/LLM优选/学习/映射
const express = require('express');
const router = express.Router();

var dbModule = require('../../db');
var cloudDb = require('../../cloud/index');
var providers = require('./providers');

// 关键词清洗：剔除促销/虚词，保留品类/材质/功能/用途核心词
var NOISE_WORDS = [
  '爆款', '热销', '新款', '新款上市', '厂家直销', '批发', '包邮', '特价', '促销',
  '限时', '秒杀', '折扣', '优惠', '满减', '赠品', '现货', '定制', '加工', '代发',
  '一件代发', '源头工厂', '工厂直供', '厂家直供', '品牌', '正品', '旗舰', '专柜',
  '同款', '网红', '直播', '推荐', '精选', '热卖', '畅销', '质量保证', '售后',
  '七天无理由', '退换货', '包邮区', '非偏远包邮', '快递', '物流', '发货',
  '拍照', '实物', '拍摄', '样品', '拿样', '小批量', '起批', '混批',
  '春夏', '秋冬', '春款', '夏款', '秋款', '冬款', '春夏新款', '秋冬新款',
  '2024', '2025', '2026', '最新', '潮流', '时尚', 'ins', 'INS',
  '百搭', '简约', '韩版', '日系', '欧美', '港风', '复古', '文艺',
  '可爱', '小清新', 'ins风', '北欧', '轻奢', '高端', '大气', '上档次',
  '多功能', '二合一', '三合一', '升级', '省心', '省力', '省时',
  '好用', '实用', '耐用', '经久耐用'
];

function cleanTitleKeywords(text) {
  if (!text) return [];
  var t = text;
  NOISE_WORDS.forEach(function (w) { t = t.replace(new RegExp(w, 'g'), ' '); });
  t = t.replace(/\d+[mgkmlMGKML只件套盒条瓶包箱个支把片张块台套米cmCMmmMM]*/g, ' ');
  t = t.replace(/[A-Z]{1,3}[-]?\d{2,6}/gi, ' ');
  var words = t.split(/[\s\/,|，、：:·\-—\(\)（）\[\]【】{}]+/).filter(function (w) {
    if (!w) return false;
    if (w.length < 2) return false;
    if (/^\d+$/.test(w)) return false;
    if (/^[a-zA-Z]$/.test(w)) return false;
    return true;
  });
  return words;
}

function extractSearchKeywords(title, aliCategory) {
  var titleWords = cleanTitleKeywords(title);
  var catWords = cleanTitleKeywords(aliCategory);
  var wholeWords = [];
  var seen = {};
  function addWords(words) {
    words.forEach(function (w) {
      var cn = w.replace(/[a-zA-Z0-9]/g, '');
      if (cn.length >= 2 && cn.length <= 6 && !seen[w]) { seen[w] = true; wholeWords.push(w); }
    });
  }
  addWords(titleWords);
  addWords(catWords);
  return wholeWords;
}

// 二级规则复核
var CATEGORY_VALIDATION_RULES = [
  {
    trigger_keywords: ['洗碗', '厨房', '清洁', '百洁', '刷锅', '抹布', '去污', '垃圾袋', '拖把', '扫帚', '家务'],
    blocked_categories: ['美术用品', '办公用品', '工艺工具', '剪贴', '印刷', '文具'],
    reason: '厨房/清洁用品被误分到办公/美术类'
  },
  {
    trigger_keywords: ['手提袋', '礼品袋', '塑料袋', '包装袋', '购物袋', 'opp袋', 'pp袋', 'pvc袋', '牛皮纸袋', '纸袋'],
    blocked_categories: ['快递', '邮寄', '物流', '包裹包装'],
    reason: '袋子类产品被误分到快递/物流类'
  },
  {
    trigger_keywords: ['镜子', '化妆镜', '手持镜', '化妆'],
    blocked_categories: ['五金', '工具', '螺丝', '扳手', '电钻'],
    reason: '镜子被误分到五金工具类'
  }
];

function postSelectionValidate(title, categoryName, categoryPath) {
  if (!title) return null;
  var pathAndName = (categoryPath || '') + (categoryName || '');
  for (var i = 0; i < CATEGORY_VALIDATION_RULES.length; i++) {
    var rule = CATEGORY_VALIDATION_RULES[i];
    var triggered = false;
    for (var j = 0; j < rule.trigger_keywords.length; j++) {
      if (title.indexOf(rule.trigger_keywords[j]) >= 0) { triggered = true; break; }
    }
    if (!triggered) continue;
    for (var k = 0; k < rule.blocked_categories.length; k++) {
      if (pathAndName.indexOf(rule.blocked_categories[k]) >= 0) {
        console.log('[分类推荐] 二级复核拦截:', categoryName, '→', rule.reason);
        return { blocked: true, reason: rule.reason };
      }
    }
  }
  return null;
}

// 高频错配纠正表
var CATEGORY_CORRECTIONS = [
  { wrong: '美术用品', correct_keywords: ['洗碗', '厨房', '清洁', '百洁', '刷锅', '家务', '抹布'] },
  { wrong: '刷子和笔清洁用品', correct_keywords: ['洗碗', '厨房', '百洁', '家务', '抹布'] },
  { wrong: '办公用品', correct_keywords: ['洗碗', '厨房', '清洁', '百洁', '刷锅', '家务', '沐浴', '美妆', '抹布'] },
  { wrong: '镂空印画刷和海绵擦', correct_keywords: ['洗碗', '厨房', '清洁', '百洁', '刷锅', '家务', '抹布', '去污'] },
  { wrong: '剪贴', correct_keywords: ['洗碗', '厨房', '清洁', '百洁', '刷锅', '家务'] },
  { wrong: '工艺工具', correct_keywords: ['洗碗', '厨房', '清洁', '百洁', '刷锅', '家务'] }
];

function applyCategoryCorrection(title, category, path) {
  if (!title || !category) return null;
  for (var i = 0; i < CATEGORY_CORRECTIONS.length; i++) {
    var rule = CATEGORY_CORRECTIONS[i];
    if (category.indexOf(rule.wrong) >= 0 || (path && path.indexOf(rule.wrong) >= 0)) {
      for (var j = 0; j < rule.correct_keywords.length; j++) {
        if (title.indexOf(rule.correct_keywords[j]) >= 0) {
          return { corrected: true, reason: '标题包含"' + rule.correct_keywords[j] + '"，"' + rule.wrong + '"为误匹配' };
        }
      }
    }
  }
  return null;
}

// ===== suggest-category 路由 =====
router.post('/suggest-category', async function (req, res) {
  var title = (req.body.title || '').trim();
  var aliCategory = (req.body.ali_category || '').trim();
  var imageUrl = (req.body.image_url || '').trim();
  var attrs = req.body.attrs;

  if (!title && !aliCategory) {
    return res.status(400).json({ error: '请提供 title 或 ali_category' });
  }

  var attrSummary = '';
  if (Array.isArray(attrs) && attrs.length) {
    var attrParts = attrs.slice(0, 5).map(function (a) {
      return (a.name || a.key || '') + ':' + (a.value || a.values || '');
    }).filter(function (s) { return s.length > 2; });
    if (attrParts.length) attrSummary = attrParts.join(', ');
  }

  console.log('[分类推荐] 标题:', title, '1688类目:', aliCategory, attrs ? '含规格参数' : '');

  try {
    // Step 1: 查映射表 — 云端优先
    var mappings = aliCategory ? await cloudDb.getMappings(aliCategory) : [];

    if (mappings.length === 1) {
      var mappedCategory = mappings[0].custom_category;
      var pathRow = await cloudDb.getTreePath(mappedCategory);
      console.log('[分类推荐] 映射表唯一命中:', mappedCategory);
      return res.json({
        ok: true, source: 'mapping', category: mappedCategory,
        path: pathRow ? pathRow.path : '', confidence: 1.0
      });
    }

    if (mappings.length > 1) {
      console.log('[分类推荐] 映射表命中', mappings.length, '个候选，交给LLM择优');
      try {
        var choice = await selectFromMappingCandidates(title, aliCategory, attrSummary, mappings);
        if (choice) {
          return res.json({
            ok: true, source: 'mapping_llm', category: choice.category,
            path: choice.path || '', confidence: choice.confidence
          });
        }
      } catch (e) { /* fallthrough */ }
      var topCat = mappings[0].custom_category;
      var topPath = await cloudDb.getTreePath(topCat);
      return res.json({
        ok: true, source: 'mapping_top', category: topCat,
        path: topPath ? topPath.path : '', confidence: 0.7
      });
    }

    // Step 2: 无映射，LLM 提炼关键词
    var keywords = await extractProductKeywords(title, aliCategory, attrSummary);
    var localKw = extractSearchKeywords(title, aliCategory);
    localKw.slice(0, 2).forEach(function (kw) {
      if (keywords.indexOf(kw) < 0) keywords.push(kw);
    });

    // Step 3: 同义词扩展 + 关键词关联库查询
    var expandedKeywords = await expandWithSynonyms(keywords);
    var relCandidates = await queryKeywordCategoryRel(expandedKeywords, title);

    if (relCandidates && relCandidates.length === 1 && relCandidates[0].totalWeight >= 3.0 && relCandidates[0].matchCount >= 2) {
      var topRel = relCandidates[0];
      console.log('[分类推荐] 关联库高可信命中:', topRel.category, '权重:', topRel.totalWeight, '次数:', topRel.matchCount);
      return res.json({
        ok: true, source: 'keyword_rel', category: topRel.category,
        path: topRel.path, confidence: Math.min(0.95, 0.7 + topRel.totalWeight * 0.03)
      });
    }
    if (relCandidates && relCandidates.length > 0) {
      console.log('[分类推荐] 关联库命中', relCandidates.length, '个候选，最高权重:', relCandidates[0].totalWeight);
    }

    // Step 4: 构建候选池
    var candidates = [];
    var seenPaths = {};
    var MAX_CANDIDATES = 30;

    if (relCandidates && relCandidates.length > 0) {
      relCandidates.forEach(function (rc) {
        if (!seenPaths[rc.path]) {
          seenPaths[rc.path] = true;
          candidates.push({ name: rc.category, path: rc.path, weight: rc.totalWeight, fromRel: true });
        }
      });
    }

    var searchKeywords = keywords.slice(0, Math.max(2, Math.min(6, keywords.length)));
    console.log('[分类推荐] 搜索关键词:', searchKeywords.join(', '));
    for (var k = 0; k < searchKeywords.length && candidates.length < MAX_CANDIDATES; k++) {
      var rows = dbModule.treeGetAll(
        'SELECT cat_name, path FROM dxm_category_tree WHERE is_leaf = 1 AND (cat_name LIKE ? OR path LIKE ?) LIMIT 15',
        ['%' + searchKeywords[k] + '%', '%' + searchKeywords[k] + '%']
      );
      for (var r = 0; r < rows.length && candidates.length < MAX_CANDIDATES; r++) {
        if (!seenPaths[rows[r].path]) {
          seenPaths[rows[r].path] = true;
          candidates.push({ name: rows[r].cat_name, path: rows[r].path });
        }
      }
    }

    // 错配纠正过滤
    var beforeCorrect = candidates.length;
    if (title && candidates.length > 0) {
      candidates = candidates.filter(function (c) {
        var correction = applyCategoryCorrection(title, c.name, c.path);
        if (correction) console.log('[分类推荐] 纠正过滤:', c.name, '→', correction.reason);
        return !correction;
      });
    }
    candidates.sort(function (a, b) {
      var aRel = a.fromRel ? 0 : 1;
      var bRel = b.fromRel ? 0 : 1;
      if (aRel !== bRel) return aRel - bRel;
      if (a.fromRel && b.fromRel) return (b.weight || 0) - (a.weight || 0);
      var aOther = /^其他|杂项|其他（/.test(a.name) ? 1 : 0;
      var bOther = /^其他|杂项|其他（/.test(b.name) ? 1 : 0;
      return aOther - bOther;
    });
    console.log('[分类推荐] 候选:', candidates.length, '(纠正前:', beforeCorrect, ', 关联库候选:', candidates.filter(function(c) { return c.fromRel; }).length, ')');

    // 无候选，纯 LLM 推荐
    if (candidates.length === 0) {
      var suggestion = await suggestCategoryWithLLM(title, aliCategory, attrSummary);
      if (suggestion) {
        var corr = applyCategoryCorrection(title, suggestion.category, suggestion.path);
        if (corr) {
          console.log('[分类推荐] 错配纠正:', suggestion.category, '-> 拒绝(', corr.reason, ')');
          return res.json({ ok: true, source: 'none', category: '', path: '', confidence: 0 });
        }
        return res.json({
          ok: true, source: 'llm', category: suggestion.category,
          path: suggestion.path, confidence: suggestion.confidence || 0.6,
          alternatives: suggestion.alternatives || []
        });
      }
      return res.json({ ok: true, source: 'none', category: '', path: '', confidence: 0 });
    }

    // 精确匹配 1688 类目名
    if (aliCategory && candidates.length > 0) {
      var exactMatch = candidates.find(function (c) { return c.name === aliCategory; });
      if (exactMatch) {
        console.log('[分类推荐] 候选精确匹配1688类目:', exactMatch.name);
        return res.json({
          ok: true, source: 'exact_match', category: exactMatch.name,
          path: exactMatch.path, confidence: 0.95
        });
      }
    }

    // 多候选，LLM 优选
    if (candidates.length > 1) {
      try {
        var bestChoice = await suggestCategoryFromCandidates(title, aliCategory, attrSummary, candidates);
        var corr = applyCategoryCorrection(title, bestChoice.category, bestChoice.path);
        if (corr) {
          console.log('[分类推荐] 错配纠正:', bestChoice.category, '-> 拒绝(', corr.reason, ')');
          return res.json({ ok: true, source: 'none', category: '', path: '', confidence: 0 });
        }
        return res.json({
          ok: true, source: 'llm_search', category: bestChoice.category,
          path: bestChoice.path, confidence: bestChoice.confidence !== undefined ? bestChoice.confidence : 0.7,
          alternatives: candidates.slice(0, 5)
        });
      } catch (e) {
        return res.json({
          ok: true, source: 'search', category: candidates[0].name,
          path: candidates[0].path, confidence: 0.5, alternatives: candidates.slice(0, 5)
        });
      }
    }

    // 单候选，直接返回
    var corr = applyCategoryCorrection(title, candidates[0].name, candidates[0].path);
    if (corr) {
      console.log('[分类推荐] 错配纠正:', candidates[0].name, '-> 拒绝(', corr.reason, ')');
      return res.json({ ok: true, source: 'none', category: '', path: '', confidence: 0 });
    }
    return res.json({
      ok: true, source: 'search', category: candidates[0].name,
      path: candidates[0].path, confidence: 0.8, alternatives: candidates
    });

  } catch (err) {
    console.log('[分类推荐] LLM提炼失败，回退本地搜索:', err.message);
    fallbackLocalSearch(title, aliCategory, res);
  }
});

// ===== 关键词-类目关联库 =====

function expandWithSynonyms(keywords) {
  if (!keywords || !keywords.length) return keywords;
  var expanded = keywords.slice();
  var added = {};
  keywords.forEach(function (kw) { added[kw] = true; });
  var promises = keywords.map(function (kw) {
    return cloudDb.getSynonyms(kw).then(function (synRows) {
      (synRows || []).forEach(function (r) {
        var syn = r.word_a === kw ? r.word_b : r.word_a;
        if (!added[syn]) { added[syn] = true; expanded.push(syn); }
      });
    });
  });
  return Promise.all(promises).then(function () { return expanded; }).catch(function () { return expanded; });
}

async function queryKeywordCategoryRel(keywords, title) {
  if (!keywords || !keywords.length) return [];
  var blacklisted = {};
  var blPromises = keywords.map(function (kw) {
    return cloudDb.getBlacklisted(kw).then(function (blRows) {
      (blRows || []).forEach(function (r) { blacklisted[kw + '|' + r.category_name] = true; });
    });
  });
  await Promise.all(blPromises).catch(function () {});

  var relRows = await cloudDb.getKeywordRels(keywords);
  if (!relRows || !relRows.length) return [];

  var catMap = {};
  for (var i = 0; i < relRows.length; i++) {
    var r = relRows[i];
    if (blacklisted[r.keyword + '|' + r.category_name]) continue;
    if (title) {
      var validation = postSelectionValidate(title, r.category_name, '');
      if (validation) continue;
    }
    if (!catMap[r.category_name]) {
      var pathRow = await cloudDb.getTreePath(r.category_name);
      catMap[r.category_name] = {
        category: r.category_name,
        path: pathRow ? pathRow.path : r.category_name,
        totalWeight: 0,
        matchCount: 0,
        keywordCount: 0,
        hasManual: false
      };
    }
    catMap[r.category_name].totalWeight += (r.weight || 1.0);
    catMap[r.category_name].matchCount += (r.match_count || 1);
    catMap[r.category_name].keywordCount++;
    if (r.source === 'manual') catMap[r.category_name].hasManual = true;
  }

  var result = Object.values(catMap).sort(function (a, b) {
    if (a.hasManual !== b.hasManual) return a.hasManual ? -1 : 1;
    if (b.keywordCount !== a.keywordCount) return b.keywordCount - a.keywordCount;
    if (b.totalWeight !== a.totalWeight) return b.totalWeight - a.totalWeight;
    return b.matchCount - a.matchCount;
  });

  return result.slice(0, 10);
}

async function learnKeywordCategoryRel(keywords, categoryName, source, confidence) {
  if (!keywords || !keywords.length || !categoryName) return;
  if (confidence < 0.6) return;
  var weight = source === 'manual' ? 3.0 : (confidence >= 0.8 ? 1.5 : 1.0);
  for (var i = 0; i < keywords.length; i++) {
    var kw = keywords[i];
    var blRows = await cloudDb.getBlacklisted(kw);
    var blHit = (blRows || []).some(function (r) { return r.category_name === categoryName; });
    if (blHit) continue;
    await cloudDb.saveKeywordRel(kw, categoryName, weight, source || 'auto');
  }
}

// LLM 提炼标题核心属性
function extractProductKeywords(title, aliCategory, attrSummary) {
  var prompt = '你是一个产品分类专家。请从产品标题中提取用于分类搜索的核心关键词。\n\n';
  prompt += '提取原则：只提取以下三类信息，排除一切其他内容：\n';
  prompt += '1. 物品品类（产品到底是什么东西，如"垃圾袋""手提袋""化妆镜""钥匙扣"）\n';
  prompt += '2. 用途场景（用在什么地方，如"厨房""汽车""办公""户外""物业""酒店"）\n';
  prompt += '3. 功能描述（做什么用的，如"清洁""收纳""装垃圾""打包"）\n\n';
  prompt += '必须排除（不要出现在关键词中）：\n';
  prompt += '- 颜色/外观（黑色、透明、磨砂等）\n';
  prompt += '- 尺寸/规格（大号、加厚、特大等）\n';
  prompt += '- 数量/型号（一次性、10个装等）\n';
  prompt += '- 材质属性（塑料、pvc、pp等，除非材质是品类核心如"不锈钢锅"）\n';
  prompt += '- 开口方式（平口、背心式等）\n';
  prompt += '- 风格/图案/节日/促销词/形容词\n\n';
  var combinedInput = '';
  if (aliCategory) combinedInput += '【平台类目】' + aliCategory + '\n';
  if (title) combinedInput += '【产品标题】' + title + '\n';
  if (attrSummary) combinedInput += '【规格参数】' + attrSummary + '\n';
  prompt += combinedInput;
  prompt += '\n请结合【平台类目】和【产品标题】综合提炼，类目名是品类判断的核心依据。\n';
  prompt += '关键词必须是可以直接用来搜索商品分类的名词，不要输出任何形容词或特征描述。\n';
  prompt += '示例：标题"黑色大号垃圾袋加厚平口物业厨房商用"→ 应提取 ["垃圾袋", "厨房", "物业"] 而不是 ["黑色","大号","加厚","平口"]\n';
  prompt += '返回JSON格式：\n{"keywords": ["关键词1", "关键词2", ...]}\n';
  prompt += '要求：3-6个关键词，必须是名词。第一个关键词必须是物品品类名。\n只返回一行JSON。';

  return providers.extractionLLMRequest('/chat/completions', {
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.1,
    max_tokens: 200
  }).then(function (result) {
    var msg = result.choices && result.choices[0] && result.choices[0].message;
    var text = (msg && msg.content) || '';
    if (!text && msg && msg.reasoning_content) {
      var m = msg.reasoning_content.match(/\{[^{}]*"keywords"[^{}]*\}/);
      if (m) text = m[0];
    }
    if (!text) return [];
    try {
      var jsonStr = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      var parsed = JSON.parse(jsonStr);
      if (Array.isArray(parsed.keywords) && parsed.keywords.length) {
        var noiseWords = ['六一','儿童节','圣诞','元旦','新年','春节','情人节','国庆','中秋','端午',
          '卡通','可爱','创意','简约','复古','ins','韩版','日系','欧美','网红',
          '批发','现货','特价','热卖','直销','厂家','定制','新款','同款','爆款',
          '礼物','礼品','伴手礼','赠品','福利','奖品'];
        var filtered = parsed.keywords.filter(function (kw) {
          return !noiseWords.some(function (nw) { return kw === nw || kw.indexOf(nw) >= 0; });
        });
        if (!filtered.length) filtered = parsed.keywords.slice(0, 3);
        console.log('[分类推荐] LLM提炼关键词:', filtered.join(', '));
        return filtered;
      }
    } catch (e) {
      console.log('[分类推荐] LLM提炼JSON解析失败:', text.substring(0, 100));
    }
    return [];
  }).catch(function (err) {
    console.log('[分类推荐] LLM提炼请求失败:', err.message);
    return [];
  });
}

function fallbackLocalSearch(title, aliCategory, res) {
  var keywords = extractSearchKeywords(title, aliCategory);
  var candidates = [];
  var seenPaths = {};
  var MAX_CANDIDATES = 30;
  for (var k = 0; k < keywords.length && candidates.length < MAX_CANDIDATES; k++) {
    var rows = dbModule.treeGetAll(
      'SELECT cat_name, path FROM dxm_category_tree WHERE is_leaf = 1 AND (cat_name LIKE ? OR path LIKE ?) LIMIT 15',
      ['%' + keywords[k] + '%', '%' + keywords[k] + '%']
    );
    for (var r = 0; r < rows.length && candidates.length < MAX_CANDIDATES; r++) {
      if (!seenPaths[rows[r].path]) {
        seenPaths[rows[r].path] = true;
        candidates.push({ name: rows[r].cat_name, path: rows[r].path });
      }
    }
  }
  if (title && candidates.length > 0) {
    candidates = candidates.filter(function (c) {
      return !applyCategoryCorrection(title, c.name, c.path);
    });
  }
  if (candidates.length === 0) {
    return res.json({ ok: true, source: 'none', category: '', path: '', confidence: 0 });
  }
  res.json({
    ok: true,
    source: 'search',
    category: candidates[0].name,
    path: candidates[0].path,
    confidence: 0.5,
    alternatives: candidates.slice(0, 5)
  });
}

// LLM通用指令前缀
var LLM_SYSTEM_PROMPT = '你是一个跨境电商分类匹配专家，负责将商品归类到正确的店小秘类目。\n\n' +
  '匹配规则：\n' +
  '1. 优先匹配三级(叶子)精准类目，无匹配则向上回溯二级、一级\n' +
  '2. 必须贴合商品实际属性和用途，跨大类禁止匹配（如清洁用品不能归入办公用品/美术用品）\n' +
  '3. 仅输出唯一最优类目，不额外赘述\n' +
  '4. 相似度低于60%(confidence<0.6)判定无匹配，直接返回confidence=0\n' +
  '5. 分析维度：优先标题语义 > 规格参数 > 来源类目\n';

// LLM 推荐分类（无候选时）— 两阶段
function suggestCategoryWithLLM(title, aliCategory, attrSummary) {
  var apiKey = providers.getApiKey();
  if (!apiKey) return Promise.resolve(null);

  var branches = dbModule.treeGetAll(
    'SELECT DISTINCT path FROM dxm_category_tree WHERE is_leaf = 0 AND cat_level <= 2 AND path LIKE "%/%" ORDER BY path'
  );
  if (!branches.length) return Promise.resolve(null);

  var branchList = branches.map(function (b, i) {
    return (i + 1) + '. ' + b.path;
  }).join('\n');

  var stage1Prompt = LLM_SYSTEM_PROMPT;
  stage1Prompt += '\n任务：请从以下分类分支中选择最匹配产品的分支。\n\n';
  stage1Prompt += '重要：请优先根据产品标题分析产品的实际用途和使用场景，来源平台类目仅供参考。\n';
  if (title) stage1Prompt += '\n产品标题: ' + title;
  if (aliCategory) stage1Prompt += '\n来源平台类目（参考）: ' + aliCategory;
  if (attrSummary) stage1Prompt += '\n规格参数（参考）: ' + attrSummary;
  stage1Prompt += '\n\n可选分类分支:\n' + branchList;
  stage1Prompt += '\n\n请返回JSON格式，将序号填入choice字段。示例：如果选第3个，返回 {"choice": 3, "reason": "理由"}\n只返回一行JSON，不要其他文字。';

  return providers.categoryLLMRequest('/chat/completions', {
    messages: [{ role: 'user', content: stage1Prompt }],
    temperature: 0.1,
    max_tokens: 1024
  }).then(function (result) {
    var msg = result.choices && result.choices[0] && result.choices[0].message;
    var text = (msg && msg.content) || '';
    if (!text && msg && msg.reasoning_content) {
      var jsonMatch = msg.reasoning_content.match(/\{[^{}]*"choice"[^{}]*\}/);
      if (jsonMatch) text = jsonMatch[0];
    }
    console.log('[分类推荐] 阶段1响应 content:', (msg && msg.content || '').substring(0, 100));
    if (!text) return null;
    var parsed;
    try {
      var jsonStr = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      parsed = JSON.parse(jsonStr);
    } catch (e) {
      return null;
    }

    var branchIdx = (parsed.choice || 1) - 1;
    if (branchIdx < 0 || branchIdx >= branches.length) return null;

    var selectedBranch = branches[branchIdx].path;
    var leaves = dbModule.treeGetAll(
      'SELECT cat_name, path FROM dxm_category_tree WHERE is_leaf = 1 AND path LIKE ? LIMIT 50',
      [selectedBranch + '/%']
    );
    if (!leaves.length) {
      leaves = dbModule.treeGetAll(
        'SELECT cat_name, path FROM dxm_category_tree WHERE is_leaf = 1 AND path LIKE ? LIMIT 50',
        [selectedBranch.substring(0, selectedBranch.indexOf('/') + 1) + '%']
      );
    }
    if (!leaves.length) return null;

    if (leaves.length <= 3) {
      return { category: leaves[0].cat_name, path: leaves[0].path, confidence: 0.6 };
    }

    var leafList = leaves.slice(0, 30).map(function (l, i) {
      return (i + 1) + '. ' + l.path;
    }).join('\n');

    var stage2Prompt = LLM_SYSTEM_PROMPT;
    stage2Prompt += '\n任务：请从以下叶子分类中选择最匹配产品的分类。\n\n';
    stage2Prompt += '重要：请优先分析产品标题中的用途和使用场景，来源平台类目仅供参考。\n';
    if (title) stage2Prompt += '\n产品标题: ' + title;
    if (aliCategory) stage2Prompt += '\n来源平台类目（参考）: ' + aliCategory;
    if (attrSummary) stage2Prompt += '\n规格参数（参考）: ' + attrSummary;
    stage2Prompt += '\n\n候选分类:\n' + leafList;
    stage2Prompt += '\n\n请返回JSON格式，将序号填入choice字段，confidence为0.0到1.0。示例：如果选第2个且置信度0.85，返回 {"choice": 2, "confidence": 0.85}\n只返回一行JSON。';

    return providers.categoryLLMRequest('/chat/completions', {
      messages: [{ role: 'user', content: stage2Prompt }],
      temperature: 0.1,
      max_tokens: 1024
    }).then(function (result2) {
      var msg2 = result2.choices && result2.choices[0] && result2.choices[0].message;
      var text2 = (msg2 && msg2.content) || '';
      if (!text2 && msg2 && msg2.reasoning_content) {
        var jsonMatch2 = msg2.reasoning_content.match(/\{[^{}]*"choice"[^{}]*\}/);
        if (jsonMatch2) text2 = jsonMatch2[0];
      }
      if (!text2) return { category: leaves[0].cat_name, path: leaves[0].path, confidence: 0.5 };
      console.log('[分类推荐] 阶段2响应:', text2.substring(0, 150));
      try {
        var jsonStr2 = text2.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
        var parsed2 = JSON.parse(jsonStr2);
        var leafIdx = (parsed2.choice || 1) - 1;
        if (leafIdx >= 0 && leafIdx < leaves.length) {
          var conf = parsed2.confidence !== undefined ? parsed2.confidence : 0.5;
          if (conf < 0.6) return { category: '', path: '', confidence: 0 };
          var llmResult = { category: leaves[leafIdx].cat_name, path: leaves[leafIdx].path, confidence: conf };
          var validation = postSelectionValidate(title, llmResult.category, llmResult.path);
          if (validation) {
            console.log('[分类推荐] 阶段2选择被复核拦截:', llmResult.category, '→', validation.reason);
            return { category: '', path: '', confidence: 0 };
          }
          console.log('[分类推荐] 阶段2选择:', llmResult.category, '置信度:', conf);
          return llmResult;
        }
      } catch (e) {}
      return { category: leaves[0].cat_name, path: leaves[0].path, confidence: 0.5 };
    });
  }).catch(function () { return null; });
}

// 从映射候选池中 LLM 限定范围择优
function selectFromMappingCandidates(title, aliCategory, attrSummary, mappings) {
  var apiKey = providers.getApiKey();
  if (!apiKey) return Promise.resolve(null);

  var candidateItems = [];
  var filtered = [];
  mappings.forEach(function (m, i) {
    if (m.source === 'error' || m.count <= 0) {
      filtered.push(m.custom_category);
      return;
    }
    var pathRow = dbModule.treeGetOne(
      'SELECT path FROM dxm_category_tree WHERE cat_name = ? AND is_leaf = 1 LIMIT 1',
      [m.custom_category]
    );
    candidateItems.push({
      index: candidateItems.length + 1,
      name: m.custom_category,
      path: pathRow ? pathRow.path : m.custom_category,
      count: m.count || 1,
      source: m.source || 'auto'
    });
  });
  if (filtered.length) {
    console.log('[分类推荐] 映射过滤掉:', filtered.join(', '));
  }
  if (candidateItems.length === 0) {
    mappings.forEach(function (m, i) {
      var pathRow = dbModule.treeGetOne(
        'SELECT path FROM dxm_category_tree WHERE cat_name = ? AND is_leaf = 1 LIMIT 1',
        [m.custom_category]
      );
      candidateItems.push({
        index: candidateItems.length + 1,
        name: m.custom_category,
        path: pathRow ? pathRow.path : m.custom_category,
        count: m.count || 1,
        source: m.source || 'auto'
      });
    });
  }

  var candidateList = candidateItems.map(function (c) {
    return c.index + '. ' + c.path + ' (使用' + c.count + '次' + (c.source === 'manual' ? '，手动设置' : '') + ')';
  }).join('\n');

  var prompt = '你是一个跨境电商分类匹配专家。\n\n';
  prompt += '任务：根据商品信息，从以下历史映射类目中选择最匹配的一个。\n\n';
  prompt += '选择规则：\n';
  prompt += '1. 优先贴合商品的实际用途和使用场景\n';
  prompt += '2. 对比商品品类与候选类目的核心属性是否一致\n';
  prompt += '3. 频次高的类目说明历史匹配成功率高，但不是唯一标准\n';
  prompt += '4. 如果商品特征与所有候选都不匹配，confidence设为0.3以下\n\n';
  if (title) prompt += '产品标题: ' + title + '\n';
  if (aliCategory) prompt += '来源类目: ' + aliCategory + '\n';
  if (attrSummary) prompt += '规格参数: ' + attrSummary + '\n';
  prompt += '\n可选类目（仅限以下范围）:\n' + candidateList;
  prompt += '\n\n请返回JSON：{"choice": 序号, "confidence": 0.0-1.0}\n只返回一行JSON。';

  return providers.categoryLLMRequest('/chat/completions', {
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.1,
    max_tokens: 200
  }).then(function (result) {
    var msg = result.choices && result.choices[0] && result.choices[0].message;
    var text = (msg && msg.content) || '';
    if (!text && msg && msg.reasoning_content) {
      var m = msg.reasoning_content.match(/\{[^{}]*"choice"[^{}]*\}/);
      if (m) text = m[0];
    }
    if (!text) return null;
    try {
      var jsonStr = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      var parsed = JSON.parse(jsonStr);
      var idx = (parsed.choice || 1) - 1;
      if (idx >= 0 && idx < candidateItems.length) {
        var conf = parsed.confidence !== undefined ? parsed.confidence : 0.7;
        if (conf < 0.4) return null;
        var selectedItem = { category: candidateItems[idx].name, path: candidateItems[idx].path, confidence: conf };
        var validation = postSelectionValidate(title, selectedItem.category, selectedItem.path);
        if (validation) return null;
        console.log('[分类推荐] 映射LLM选择:', candidateItems[idx].name, '置信度:', conf);
        return selectedItem;
      }
    } catch (e) { console.log('[分类推荐] 映射LLM JSON解析失败:', text.substring(0, 100)); }
    return null;
  }).catch(function (e) {
    console.log('[分类推荐] 映射LLM请求失败:', e.message);
    return null;
  });
}

// LLM 从候选中选择最佳
function suggestCategoryFromCandidates(title, aliCategory, attrSummary, candidates) {
  var apiKey = providers.getApiKey();
  if (!apiKey) return Promise.resolve({ category: candidates[0].name, path: candidates[0].path, confidence: 0.5 });

  var candidateList = candidates.slice(0, 15).map(function (c, i) {
    return (i + 1) + '. ' + c.path;
  }).join('\n');

  var prompt = LLM_SYSTEM_PROMPT;
  prompt += '\n任务：请从候选分类路径中选择最匹配产品的一个。\n\n';
  prompt += '选择标准（按优先级）：\n';
  prompt += '1. 首先确认产品是什么品类（如"手提袋"是容器/包装用品，不是快递用品）\n';
  prompt += '2. 优先选择叶子节点名称直接描述产品品类的（如"塑料包装袋"优于"其他"）\n';
  prompt += '3. 路径层级必须语义匹配（如"包装和配送用品/塑料包装袋"适合塑料袋，"邮寄用品"不适合）\n';
  prompt += '4. 排除"其他""杂项"类节点，除非没有更精准的匹配\n';
  prompt += '5. 如果所有候选都不匹配产品品类，confidence设为0.3以下\n\n';
  if (title) prompt += '产品标题: ' + title + '\n';
  if (aliCategory) prompt += '来源平台类目（参考）: ' + aliCategory + '\n';
  if (attrSummary) prompt += '规格参数（参考）: ' + attrSummary + '\n';
  prompt += '\n候选分类路径:\n' + candidateList;
  prompt += '\n\n请返回JSON格式，将序号填入choice字段，confidence为0.0到1.0。示例：如果选第5个且置信度0.9，返回 {"choice": 5, "confidence": 0.9}\n只返回一行JSON。';

  return providers.categoryLLMRequest('/chat/completions', {
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.1,
    max_tokens: 1024
  }).then(function (result) {
    var msg = result.choices && result.choices[0] && result.choices[0].message;
    var text = (msg && msg.content) || '';
    if (!text && msg && msg.reasoning_content) {
      var jsonMatchC = msg.reasoning_content.match(/\{[^{}]*"choice"[^{}]*\}/);
      if (jsonMatchC) text = jsonMatchC[0];
    }
    console.log('[分类推荐] 候选LLM content:', (msg && msg.content || '').substring(0, 150));
    console.log('[分类推荐] 候选LLM finish_reason:', result.choices && result.choices[0] && result.choices[0].finish_reason);
    if (!text) return { category: candidates[0].name, path: candidates[0].path, confidence: 0.5 };
    try {
      var jsonStr = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      var parsed = JSON.parse(jsonStr);
      var idx = (parsed.choice || 1) - 1;
      if (idx >= 0 && idx < candidates.length) {
        var conf = parsed.confidence !== undefined ? parsed.confidence : 0.7;
        if (conf < 0.6) return { category: '', path: '', confidence: 0 };
        var selected = { category: candidates[idx].name, path: candidates[idx].path, confidence: conf };
        var validation = postSelectionValidate(title, selected.category, selected.path);
        if (validation) return { category: '', path: '', confidence: 0 };
        return selected;
      }
    } catch (e) { console.log('[分类推荐] JSON解析失败:', e.message, '原文:', text.substring(0, 100)); }
    return { category: candidates[0].name, path: candidates[0].path, confidence: 0.5 };
  }).catch(function (e) {
    console.log('[分类推荐] suggestCategoryFromCandidates API错误:', e.message);
    return { category: candidates[0].name, path: candidates[0].path, confidence: 0.5 };
  });
}

// 自动保存分类映射
router.post('/save-category-mapping', function (req, res) {
  var aliCategory = (req.body.ali_category || '').trim();
  var temuCategory = (req.body.temu_category || '').trim();

  if (!aliCategory || !temuCategory) {
    return res.status(400).json({ error: '请提供 ali_category 和 temu_category' });
  }

  var existing = dbModule.getOne('SELECT id, count FROM category_mappings WHERE category_name = ? AND custom_category = ?', [aliCategory, temuCategory]);
  if (existing) {
    dbModule.run('UPDATE category_mappings SET count = count + 1 WHERE id = ?', [existing.id]);
  } else {
    dbModule.run('INSERT INTO category_mappings (category_name, custom_category, count, source) VALUES (?, ?, 1, \'manual\')', [aliCategory, temuCategory]);
  }
  console.log('[分类映射] 保存:', aliCategory, '→', temuCategory);

  res.json({ ok: true, ali_category: aliCategory, temu_category: temuCategory });
});

module.exports = router;
module.exports.extractSearchKeywordsPublic = extractSearchKeywords;
module.exports.learnKeywordCategoryRelPublic = learnKeywordCategoryRel;
