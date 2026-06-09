// AI 分类推荐引擎 — 关键词提取/计分匹配/互斥拦截/学习/映射
const express = require('express');
const router = express.Router();

var dbModule = require('../../db');
var cloudDb = require('../../cloud/index');
var providers = require('./providers');

// ===== 互斥组配置 =====

// 从 DB 加载互斥组配置（带缓存）
var MUTEX_CACHE = null;
var MUTEX_CACHE_TIME = 0;
var BLACKLIST_CACHE = null;
var BLACKLIST_CACHE_TIME = 0;
var CONFIG_CACHE_TTL = 300000; // 5分钟缓存

function loadMutexGroups() {
  var now = Date.now();
  if (MUTEX_CACHE && (now - MUTEX_CACHE_TIME) < CONFIG_CACHE_TTL) return MUTEX_CACHE;
  try {
    var rows = dbModule.getAll('SELECT value, group_name FROM category_config WHERE type = \'mutex\' AND deleted = 0 ORDER BY sort_order, id');
    if (rows && rows.length) {
      var groupMap = {};
      rows.forEach(function (r) {
        if (!groupMap[r.group_name]) groupMap[r.group_name] = [];
        groupMap[r.group_name].push(r.value);
      });
      MUTEX_CACHE = Object.keys(groupMap).map(function (label) {
        return { names: groupMap[label], label: label };
      });
      MUTEX_CACHE_TIME = now;
      return MUTEX_CACHE;
    }
  } catch (e) {}
  // 降级：使用内置默认值
  MUTEX_CACHE = [
    { names: ['家居', '家庭', '家居用品', '家居生活', '生活用品', '日用品', '家居日用', '居家'], label: '家居日用' },
    { names: ['厨房', '厨房用品', '厨房工具', '餐厨', '餐饮', '餐具'], label: '厨房用品' },
    { names: ['清洁', '清洁用品', '清洁工具', '家务', '清洁日用'], label: '清洁用品' },
    { names: ['办公', '办公用品', '文具', '办公文具', '办公设备'], label: '办公用品' },
    { names: ['美术', '美术用品', '工艺', '手工', '工艺品'], label: '美术工艺' },
    { names: ['服饰', '服装', '女装', '男装', '童装', '内衣', '鞋靴', '箱包'], label: '服饰鞋包' },
    { names: ['美妆', '美容', '个护', '个人护理', '化妆', '彩妆', '护肤'], label: '美妆个护' },
    { names: ['电子', '数码', '手机', '电脑', '电器', '家电'], label: '电子数码' },
    { names: ['玩具', '母婴', '儿童', '孕婴'], label: '母婴玩具' },
    { names: ['运动', '户外', '体育', '健身'], label: '运动户外' },
    { names: ['汽车', '汽配', '车载', '汽车用品'], label: '汽车用品' },
    { names: ['宠物', '宠物用品'], label: '宠物用品' },
    { names: ['食品', '零食', '茶叶', '酒水'], label: '食品' },
    { names: ['包装', '包装用品', '快递', '物流', '邮政'], label: '包装物流' },
    { names: ['五金', '工具', '五金工具', '家装', '建材', '装修'], label: '五金建材' },
    { names: ['珠宝', '饰品', '首饰', '钟表'], label: '珠宝饰品' }
  ];
  MUTEX_CACHE_TIME = now;
  return MUTEX_CACHE;
}

function loadBlacklistCounts(keywords) {
  var now = Date.now();
  var allRows;
  if (BLACKLIST_CACHE && (now - BLACKLIST_CACHE_TIME) < CONFIG_CACHE_TTL) {
    allRows = BLACKLIST_CACHE;
  } else {
    allRows = dbModule.getAll('SELECT keyword, category_name, count FROM keyword_blacklist');
    BLACKLIST_CACHE = allRows;
    BLACKLIST_CACHE_TIME = now;
  }
  if (!allRows || !keywords || !keywords.length) return [];
  return allRows.filter(function (row) {
    return keywords.indexOf(row.keyword) >= 0 || keywords.indexOf(row.keyword.toLowerCase()) >= 0;
  });
}

// 从 DB 加载过滤词配置（带缓存）
var NOISE_CACHE = null;
var GENERIC_CACHE = null;
var FILTER_CACHE_TIME = 0;

function loadFilterWords() {
  var now = Date.now();
  if (NOISE_CACHE && (now - FILTER_CACHE_TIME) < CONFIG_CACHE_TTL) return;
  try {
    var noiseRows = dbModule.getAll('SELECT value FROM category_config WHERE type = \'noise\' AND deleted = 0 ORDER BY id');
    var genericRows = dbModule.getAll('SELECT value FROM category_config WHERE type = \'generic\' AND deleted = 0 ORDER BY id');
    if (noiseRows && noiseRows.length) {
      NOISE_CACHE = noiseRows.map(function (r) { return r.value; });
    }
    if (genericRows && genericRows.length) {
      GENERIC_CACHE = genericRows.map(function (r) { return r.value; });
    }
    FILTER_CACHE_TIME = now;
  } catch (e) {}
  if (!NOISE_CACHE) NOISE_CACHE = null; // 降级时用硬编码
  if (!GENERIC_CACHE) GENERIC_CACHE = null;
}

// 获取当前生效的噪音词列表
function getNoiseWords() {
  loadFilterWords();
  if (NOISE_CACHE) return NOISE_CACHE;
  return [
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
}

// 获取当前生效的泛词列表
function getGenericWords() {
  loadFilterWords();
  if (GENERIC_CACHE) return GENERIC_CACHE;
  return [
    '跨境', '外贸', '出口', '进口', '国产',
    '清洁', '清洗', '去污', '除味', '消毒', '杀菌',
    '厨房', '浴室', '客厅', '卧室', '阳台', '家用', '户外',
    '收纳', '整理', '便携', '折叠', '悬挂', '可悬挂',
    '深度', '加厚', '加大', '大号', '小号',
    '环保', '防水', '防滑', '防尘', '防霉',
    '健康', '安全', '食品级', '无毒', '无异味',
    '豪华', '精致', '精美', '创意', '新款', '新款上市',
    '不伤', '神器', '好用', '必备', '专用', '通用',
    '圆形', '方形', '长方形', '双面', '单面',
    '多功能', '全自动', '半自动',
    '商业', '商用', '工业', '酒店', '物业'
  ];
}

// 判定一个类目路径属于哪个互斥组（返回组索引，-1 表示未匹配）
function getMutexGroupIndex(pathOrName) {
  var text = (pathOrName || '').toLowerCase();
  var groups = loadMutexGroups();
  for (var i = 0; i < groups.length; i++) {
    var group = groups[i];
    for (var j = 0; j < group.names.length; j++) {
      if (text.indexOf(group.names[j]) >= 0) return i;
    }
  }
  return -1;
}

// 判断候选类目是否与商品应属大类互斥
function isMutexConflict(titleKeywords, aliCategoryWords, candidatePath) {
  // 从标题关键词和1688类目词推断商品应属大类
  var productGroupSet = {};
  var allWords = (aliCategoryWords || []).concat(titleKeywords || []);
  for (var i = 0; i < allWords.length; i++) {
    var gIdx = getMutexGroupIndex(allWords[i]);
    if (gIdx >= 0) productGroupSet[gIdx] = true;
  }
  var productGroups = Object.keys(productGroupSet);
  if (productGroups.length === 0) return false; // 无法判定大类，不拦截

  // 判定候选类目所属大类
  var candidateGroup = getMutexGroupIndex(candidatePath);
  if (candidateGroup < 0) return false; // 候选未匹配到任何组，不拦截

  // 如果候选所属大类不在商品推断大类内，则互斥
  return !productGroupSet[candidateGroup];
}

function cleanTitleKeywords(text) {
  if (!text) return [];
  var t = text;
  getNoiseWords().forEach(function (w) { t = t.replace(new RegExp(w, 'g'), ' '); });
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

// ===== 确定性计分算法 =====

// 计算关键词命中候选的详细数据
function calcHitDetail(words, candFull, candName, candPath) {
  var hitWords = [];
  var nameHit = false;
  var pathHit = false;
  for (var i = 0; i < words.length; i++) {
    if (candName === words[i]) { hitWords.push(words[i]); nameHit = true; }
    else if (candName.indexOf(words[i]) >= 0 || words[i].indexOf(candName) >= 0) { hitWords.push(words[i]); nameHit = true; }
    else if (candPath.indexOf(words[i]) >= 0) { hitWords.push(words[i]); pathHit = true; }
  }
  return { ratio: words.length ? hitWords.length / words.length : 0, nameHit: nameHit, pathHit: pathHit, hitWords: hitWords };
}

// 对单个候选类目计算匹配分数
// 三级优先：双方重合 > 仅1688类目词 > 仅标题关键词
function scoreCategory(titleKeywords, aliCategoryWords, candidate, blacklistEntries) {
  var candPath = (candidate.path || '').toLowerCase();
  var candName = (candidate.name || candidate.cat_name || '').toLowerCase();
  var candFull = candPath + candName;

  var score = 0;

  // 1. 三级优先重合分（权重 0.5）
  var aliDetail = calcHitDetail(aliCategoryWords, candFull, candName, candPath);
  var titleDetail = calcHitDetail(titleKeywords, candFull, candName, candPath);

  // 双方重合词（1688词和标题词都命中同一个候选）
  var overlapWords = aliDetail.hitWords.filter(function (w) {
    return titleDetail.hitWords.indexOf(w) >= 0;
  });
  var overlapRatio = aliCategoryWords.length && titleKeywords.length ? overlapWords.length / Math.max(aliCategoryWords.length, titleKeywords.length) : 0;
  var aliOnlyRatio = Math.max(0, aliDetail.ratio - overlapRatio);
  var titleOnlyRatio = Math.max(0, titleDetail.ratio - overlapRatio);

  // 三级加权：重合 0.5，仅1688 0.35，仅标题 0.15
  score += (overlapRatio * 0.5 + aliOnlyRatio * 0.35 + titleOnlyRatio * 0.15) * 0.5;

  // 2. 精确匹配加分（权重 0.3）
  var exactBonus = 0;
  // 1688类目精确匹配权重更高
  for (var i = 0; i < aliCategoryWords.length; i++) {
    var kw = aliCategoryWords[i];
    if (candName === kw) { exactBonus = 1.0; break; }
    if (candName.indexOf(kw) >= 0 || kw.indexOf(candName) >= 0) { if (exactBonus < 0.8) exactBonus = 0.8; }
    if (candPath.indexOf(kw) >= 0) { if (exactBonus < 0.4) exactBonus = 0.4; }
  }
  // 标题精确匹配权重稍低
  if (exactBonus < 1.0) {
    for (var i = 0; i < titleKeywords.length; i++) {
      var kw = titleKeywords[i];
      if (candName === kw) { if (exactBonus < 0.7) exactBonus = 0.7; break; }
      if (candName.indexOf(kw) >= 0 || kw.indexOf(candName) >= 0) { if (exactBonus < 0.5) exactBonus = 0.5; }
      if (candPath.indexOf(kw) >= 0) { if (exactBonus < 0.3) exactBonus = 0.3; }
    }
  }
  score += exactBonus * 0.3;

  // 3. 叶子节点深度加分（权重 0.1）
  var depth = (candPath.match(/\//g) || []).length;
  var depthScore = depth >= 2 ? 1.0 : (depth === 1 ? 0.5 : 0.2);
  score += depthScore * 0.1;

  // 4. 关联库加权（权重 0.1）
  if (candidate.fromRel) {
    var relWeight = Math.min(1.0, (candidate.weight || 1.0) / 5.0);
    score += relWeight * 0.1;
  }

  // 4.5 映射表候选加权（权重 0.15，高于关联库）
  if (candidate.fromMapping) {
    var mapWeight = Math.min(1.0, (candidate.mappingCount || 1) / 3.0);
    score += mapWeight * 0.15;
  }

  // 5. 惩罚"其他/杂项"类目
  if (/^其他|杂项|其他（/.test(candidate.name || candidate.cat_name || '')) {
    score *= 0.5;
  }

  // 5.5 逐字匹配加分：1688类目词始终参与，重合词的字权重加倍
  if (aliCategoryWords.length > 0) {
    // 收集重合词
    var overlapWords = [];
    var _seen = {};
    if (titleKeywords.length > 0) {
      for (var ai = 0; ai < aliCategoryWords.length; ai++) {
        for (var ti = 0; ti < titleKeywords.length; ti++) {
          var aw = aliCategoryWords[ai]; var tw = titleKeywords[ti];
          if (aw.length < 2 || tw.length < 2) continue;
          var matchWord = null;
          if (aw === tw) matchWord = aw;
          else if (aw.indexOf(tw) >= 0 && tw.length >= 2) matchWord = tw;
          else if (tw.indexOf(aw) >= 0 && aw.length >= 2) matchWord = aw;
          if (matchWord && !_seen[matchWord]) { _seen[matchWord] = true; overlapWords.push(matchWord); }
        }
      }
    }
    // 构建 char → weight 映射：重合词拆出的字权重=1.5，仅1688词拆出的字权重=1
    var charWeight = {};
    aliCategoryWords.forEach(function (w) {
      for (var ci = 0; ci < w.length; ci++) {
        var ch = w[ci];
        if (!charWeight[ch]) charWeight[ch] = 1;
      }
    });
    overlapWords.forEach(function (w) {
      for (var ci = 0; ci < w.length; ci++) { charWeight[w[ci]] = 1.5; }
    });
    var charArr = Object.keys(charWeight);
    if (charArr.length > 0) {
      var totalWeight = 0;
      var hitWeight = 0;
      for (var chi = 0; chi < charArr.length; chi++) {
        var w = charWeight[charArr[chi]];
        totalWeight += w;
        if (candFull.indexOf(charArr[chi]) >= 0) hitWeight += w;
      }
      score += (totalWeight > 0 ? hitWeight / totalWeight : 0) * 0.15;
    }
  }

  // 6. 黑名单惩罚（极小幅度，避免误杀）
  if (blacklistEntries && blacklistEntries.length > 0) {
    var blCount = 0;
    for (var bi = 0; bi < blacklistEntries.length; bi++) {
      if (blacklistEntries[bi].category_name === candName) {
        blCount += (blacklistEntries[bi].count || 1);
      }
    }
    if (blCount > 0) {
      score -= Math.min(0.15, blCount * 0.03);
    }
  }

  return Math.max(0, Math.min(1.0, score));
}

// 基于 1688 类目名拆分出关键词
function splitAliCategoryWords(aliCategory) {
  if (!aliCategory) return [];
  var base = aliCategory.split(/[\/>\/\s,，、：:]+/).filter(function (w) {
    return w.length >= 2;
  });
  // 对>=4字的复合词做子串拆分，如"连体雨衣"→"雨衣"
  var result = base.slice();
  var seen = {};
  base.forEach(function (w) { seen[w] = true; });
  base.forEach(function (w) {
    if (w.length >= 4) {
      for (var sl = 2; sl <= Math.min(w.length - 1, 3); sl++) {
        for (var si = 0; si <= w.length - sl; si++) {
          var sub = w.substring(si, si + sl);
          if (!seen[sub]) {
            seen[sub] = true;
            result.push(sub);
          }
        }
      }
    }
  });
  return result;
}

// 互斥拦截验证（替代旧的硬编码规则）
function postSelectionValidate(title, categoryName, categoryPath) {
  if (!title) return null;
  var titleKws = cleanTitleKeywords(title);
  var pathAndName = (categoryPath || '') + '/' + (categoryName || '');
  if (isMutexConflict(titleKws, [], pathAndName)) {
    return { blocked: true, reason: '互斥拦截：候选类目与商品品类跨大类' };
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
    // Step 1: 查映射表
    var mappings = aliCategory ? await cloudDb.getMappings(aliCategory) : [];
    var mappingCandidates = []; // 多条映射候选，后续注入候选池

    if (mappings.length === 1) {
      var mappedCategory = mappings[0].custom_category;
      var pathRow = await cloudDb.getTreePath(mappedCategory);
      console.log('[分类推荐] 映射表唯一命中:', mappedCategory);
      return res.json({
        ok: true, source: 'mapping', category: mappedCategory,
        path: pathRow ? pathRow.path : '', confidence: 1.0,
        keywords: aliCategory ? [aliCategory] : []
      });
    }

    if (mappings.length > 1) {
      console.log('[分类推荐] 映射表命中', mappings.length, '个候选，转入候选池');
      mappings.forEach(function (m) {
        if (m.source === 'error' || m.count <= 0) return;
        var pathRow = dbModule.treeGetOne(
          'SELECT path FROM dxm_category_tree WHERE cat_name = ? AND is_leaf = 1 LIMIT 1',
          [m.custom_category]
        );
        mappingCandidates.push({
          name: m.custom_category,
          path: pathRow ? pathRow.path : m.custom_category,
          fromMapping: true,
          mappingCount: m.count || 1
        });
      });
    }

    // Step 1.5: 1688类目与店小秘叶子节点完全一致则直接命中
    var exactLeafCandidates = [];
    if (aliCategory) {
      exactLeafCandidates = dbModule.treeGetAll(
        'SELECT cat_name, path FROM dxm_category_tree WHERE is_leaf = 1 AND cat_name = ?',
        [aliCategory]
      );
      if (exactLeafCandidates.length === 1) {
        var exactLeaf = exactLeafCandidates[0];
        console.log('[分类推荐] 1688类目与叶子节点唯一命中:', exactLeaf.cat_name, exactLeaf.path);
        return res.json({
          ok: true, source: 'exact_match', category: exactLeaf.cat_name,
          path: exactLeaf.path, confidence: 0.95,
          keywords: aliCategory ? [aliCategory] : []
        });
      }
      if (exactLeafCandidates.length > 1) {
        console.log('[分类推荐] 1688类目命中', exactLeafCandidates.length, '个叶子节点，转入候选池');
      }
    }

    // Step 2: LLM 提取关键词（仅提取，不做分类决策）
    var llmResult = await extractProductKeywords(title, aliCategory, attrSummary);
    var keywords = llmResult.keywords || [];
    var categoryHint = llmResult.categoryHint || '';
    var localKw = extractSearchKeywords(title, aliCategory);
    localKw.slice(0, 2).forEach(function (kw) {
      if (keywords.indexOf(kw) < 0 && getGenericWords().indexOf(kw) < 0) keywords.push(kw);
    });

    // Step 3: 1688 类目拆词（含子串拆分，用于搜索候选）
    var aliCategoryWordsAll = splitAliCategoryWords(aliCategory);
    // 计分只用原始拆词（不含子串噪声），子串仅用于搜索候选
    var aliCategoryWords = aliCategory.split(/[\/>\/\s,，、：:]+/).filter(function (w) {
      return w.length >= 2;
    });

    // Step 4: 构建候选池
    var candidates = [];
    var seenPaths = {};
    var MAX_CANDIDATES = 50;

    // 优先注入 Step 1 多条映射候选
    if (mappingCandidates.length > 0) {
      mappingCandidates.forEach(function (mc) {
        if (!seenPaths[mc.path]) {
          seenPaths[mc.path] = true;
          candidates.push(mc);
        }
      });
    }

    // 其次注入 Step 1.5 多条叶子候选
    if (exactLeafCandidates.length > 1) {
      exactLeafCandidates.forEach(function (lc) {
        if (!seenPaths[lc.path]) {
          seenPaths[lc.path] = true;
          candidates.push({ name: lc.cat_name, path: lc.path, exactMatch: true });
        }
      });
    }

    // 数据库搜索候选：1688 类目词（含子串）优先，LLM 关键词补充
    var searchKeywords = aliCategoryWordsAll.slice();
    keywords.forEach(function (w) {
      if (searchKeywords.indexOf(w) < 0) searchKeywords.push(w);
    });
    searchKeywords = searchKeywords.slice(0, 12);

    console.log('[分类推荐] 搜索关键词:', searchKeywords.join(', '));

    // 精确匹配优先
    for (var k = 0; k < searchKeywords.length && candidates.length < MAX_CANDIDATES; k++) {
      var exactRows = dbModule.treeGetAll(
        'SELECT cat_name, path FROM dxm_category_tree WHERE is_leaf = 1 AND cat_name = ? LIMIT 5',
        [searchKeywords[k]]
      );
      for (var r = 0; r < exactRows.length && candidates.length < MAX_CANDIDATES; r++) {
        if (!seenPaths[exactRows[r].path]) {
          seenPaths[exactRows[r].path] = true;
          candidates.push({ name: exactRows[r].cat_name, path: exactRows[r].path, exactMatch: true });
        }
      }
    }

    // 子串拆分匹配：先清洗关键词（去英文/数字/标点），再对纯中文复合词拆成 2~3 字子词搜一轮
    // 如"连体雨衣" → 拆出"雨衣"；"iPhone13手机壳" → 清洗为"手机壳"再拆
    var subKeywords = [];
    for (var k = 0; k < searchKeywords.length; k++) {
      var kw = searchKeywords[k].replace(/[a-zA-Z0-9\s\p{P}]/gu, '');
      if (kw.length >= 4) {
        for (var sl = 2; sl <= Math.min(kw.length - 1, 4); sl++) {
          for (var si = 0; si <= kw.length - sl; si++) {
            var sub = kw.substring(si, si + sl);
            if (searchKeywords.indexOf(sub) < 0 && subKeywords.indexOf(sub) < 0) {
              subKeywords.push(sub);
            }
          }
        }
      }
    }
    if (subKeywords.length > 0) {
      console.log('[分类推荐] 子串拆分词:', subKeywords.join(', '));
      for (var sk = 0; sk < subKeywords.length && candidates.length < MAX_CANDIDATES; sk++) {
        var subRows = dbModule.treeGetAll(
          'SELECT cat_name, path FROM dxm_category_tree WHERE is_leaf = 1 AND (cat_name LIKE ? OR path LIKE ?) LIMIT 10',
          ['%' + subKeywords[sk] + '%', '%' + subKeywords[sk] + '%']
        );
        for (var sr = 0; sr < subRows.length && candidates.length < MAX_CANDIDATES; sr++) {
          if (!seenPaths[subRows[sr].path]) {
            seenPaths[subRows[sr].path] = true;
            candidates.push({ name: subRows[sr].cat_name, path: subRows[sr].path });
          }
        }
      }
    }

    // 模糊匹配补充
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

    // Step 4.5: 关联库候选注入
    var relRows = await cloudDb.getKeywordRels(searchKeywords);
    if (relRows && relRows.length > 0) {
      var relCategoryNames = [];
      relRows.forEach(function (rr) {
        if (relCategoryNames.indexOf(rr.category_name) < 0) relCategoryNames.push(rr.category_name);
      });
      var relNamePlaceholders = relCategoryNames.map(function () { return '?' }).join(',');
      var relTreeRows = dbModule.treeGetAll(
        'SELECT cat_name, path FROM dxm_category_tree WHERE is_leaf = 1 AND cat_name IN (' + relNamePlaceholders + ')',
        relCategoryNames
      );
      // 构建 category_name → [{cat_name, path}] 映射
      var relTreeMap = {};
      relTreeRows.forEach(function (tr) {
        if (!relTreeMap[tr.cat_name]) relTreeMap[tr.cat_name] = [];
        relTreeMap[tr.cat_name].push(tr);
      });
      // 取每个关联词的最大 weight
      var relBestWeight = {};
      relRows.forEach(function (rr) {
        if (!relBestWeight[rr.category_name] || rr.weight > relBestWeight[rr.category_name]) {
          relBestWeight[rr.category_name] = rr.weight;
        }
      });
      // 注入候选：已存在的候选打上 fromRel 标记，新候选直接加入
      relCategoryNames.forEach(function (catName) {
        var trees = relTreeMap[catName];
        if (!trees) return;
        trees.forEach(function (tr) {
          if (seenPaths[tr.path]) {
            // 已存在：给已有候选补上 fromRel 标记和权重
            for (var ci = 0; ci < candidates.length; ci++) {
              if (candidates[ci].path === tr.path) {
                candidates[ci].fromRel = true;
                candidates[ci].weight = relBestWeight[catName] || 1.0;
                break;
              }
            }
          } else if (candidates.length < MAX_CANDIDATES) {
            seenPaths[tr.path] = true;
            candidates.push({
              name: tr.cat_name,
              path: tr.path,
              fromRel: true,
              weight: relBestWeight[catName] || 1.0
            });
          }
        });
      });
    }

    console.log('[分类推荐] 候选:', candidates.length, '(关联库:', candidates.filter(function(c) { return c.fromRel; }).length, ')');

    // Step 6: 互斥拦截 + 计分排序
    var titleKws = keywords.map(function (w) { return w.toLowerCase(); });
    var aliWords = aliCategoryWords.map(function (w) { return w.toLowerCase(); });
    // categoryHint 辅助互斥组判定：作为额外的产品大类锚点
    var mutexAliWords = aliWords.slice();
    if (categoryHint) {
      var hintLower = categoryHint.toLowerCase();
      if (mutexAliWords.indexOf(hintLower) < 0) mutexAliWords.push(hintLower);
    }

    // 互斥过滤
    var beforeFilter = candidates.length;
    var filteredCandidates = candidates.filter(function (c) {
      if (isMutexConflict(titleKws, mutexAliWords, c.path)) {
        console.log('[分类推荐] 互斥过滤:', c.name, c.path);
        return false;
      }
      return true;
    });
    // 保底：互斥过滤后为空则保留原始候选（LLM品类提示可能不准）
    if (filteredCandidates.length > 0) {
      candidates = filteredCandidates;
    } else {
      console.log('[分类推荐] 互斥过滤清空全部候选，保留原始候选');
    }
    console.log('[分类推荐] 互斥过滤:', beforeFilter, '→', candidates.length);

    // 计分
    var blEntries = loadBlacklistCounts(searchKeywords.map(function (w) { return w.toLowerCase(); }));
    candidates.forEach(function (c) {
      c.score = scoreCategory(titleKws, aliWords, c, blEntries);
    });

    // 按分数降序排列
    candidates.sort(function (a, b) { return (b.score || 0) - (a.score || 0); });

    if (candidates.length > 0) {
      console.log('[分类推荐] 计分TOP3:', candidates.slice(0, 3).map(function (c) {
        return c.name + '(' + (c.score || 0).toFixed(3) + ')';
      }).join(', '));
    }

    // 无候选
    if (candidates.length === 0) {
      console.log('[分类推荐] 无有效候选，标记人工审核');
      return res.json({ ok: true, source: 'manual_review', category: '', path: '', confidence: 0 });
    }

    // Step 7: 判定输出
    var best = candidates[0];

    if (best.score >= 0.4) {
      console.log('[分类推荐] 计分命中:', best.name, '分数:', best.score.toFixed(3));
      return res.json({
        ok: true, source: 'score', category: best.name,
        path: best.path, confidence: Math.min(0.95, best.score),
        alternatives: candidates.slice(1, 6),
        keywords: searchKeywords
      });
    }

    if (best.score >= 0.25) {
      console.log('[分类推荐] 低置信度命中:', best.name, '分数:', best.score.toFixed(3));
      return res.json({
        ok: true, source: 'score_low', category: best.name,
        path: best.path, confidence: best.score,
        alternatives: candidates.slice(1, 6),
        keywords: searchKeywords
      });
    }

    // 分数太低，标记人工审核
    console.log('[分类推荐] 最高分仅', best.score.toFixed(3), '，标记人工审核');
    return res.json({
      ok: true, source: 'manual_review', category: '', path: '', confidence: 0,
      alternatives: candidates.slice(0, 5)
    });

  } catch (err) {
    console.log('[分类推荐] 推荐失败，回退本地搜索:', err.message);
    fallbackLocalSearch(title, aliCategory, res);
  }
});

// LLM 提取关键词 + 品类提示（一次调用，避免限流）
function extractProductKeywords(title, aliCategory, attrSummary) {
  var prompt = '你是产品分类分析专家。请从产品信息中完成以下2项任务（一次输出）：\n\n';

  prompt += '任务1 — 核心品类词：只提取"这个产品到底是什么东西"的名词\n';
  prompt += '  正确示例："跨境圆形可悬挂洗头按摩搓澡刷" → ["搓澡刷", "洗澡刷"]\n';
  prompt += '  正确示例："黑色大号垃圾袋加厚平口" → ["垃圾袋"]\n';
  prompt += '  正确示例："纯棉短袖T恤男夏季新款" → ["T恤"]\n';
  prompt += '  禁止提取：材质词、形容词、营销词、功能词、用途词\n\n';

  prompt += '任务2 — 产品品类判定：根据标题和类目，判断该产品属于什么品类大类\n';
  prompt += '  输出一个简短品类描述，如"洗浴用品"、"包装袋"、"服装"、"清洁工具"\n\n';

  var combinedInput = '';
  if (aliCategory) combinedInput += '【平台类目】' + aliCategory + '\n';
  if (title) combinedInput += '【产品标题】' + title + '\n';
  if (attrSummary) combinedInput += '【规格参数】' + attrSummary + '\n';
  prompt += combinedInput;
  prompt += '\n请结合【平台类目】优先判断品类。\n';
  prompt += '返回JSON格式（只返回一行）：\n';
  prompt += '{"keywords": ["核心词1", "核心词2"], "category_hint": "品类大类"}\n';
  prompt += '只返回一行JSON，不要其他文字。';

  return providers.extractionLLMRequest('/chat/completions', {
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.1,
    max_tokens: 400
  }).then(function (result) {
    var msg = result.choices && result.choices[0] && result.choices[0].message;
    var text = (msg && msg.content) || '';
    if (!text && msg && msg.reasoning_content) {
      var m = msg.reasoning_content.match(/\{[^{}]*"keywords"[^{}]*\}/);
      if (m) text = m[0];
    }
    if (!text) return { keywords: [], categoryHint: '' };
    try {
      var jsonStr = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      var parsed = null;
      try { parsed = JSON.parse(jsonStr); } catch (e) {
        var m2 = jsonStr.match(/\{[^{}]*"keywords"[^{}]*\}/);
        if (m2) { parsed = JSON.parse(m2[0]); }
      }
      if (!parsed || !Array.isArray(parsed.keywords)) return { keywords: [], categoryHint: '' };

      // 使用统一的噪词列表（DB 配置优先，降级用内置列表）
      var noiseList = getNoiseWords();
      var filtered = parsed.keywords.filter(function (kw) {
        return !noiseList.some(function (nw) { return kw === nw || kw.indexOf(nw) >= 0; });
      });
      if (!filtered.length) filtered = parsed.keywords.slice(0, 3);

      var categoryHint = parsed.category_hint || '';
      if (categoryHint) {
        console.log('[分类推荐] LLM品类提示:', categoryHint);
      }

      console.log('[分类推荐] LLM提炼关键词:', filtered.join(', '));
      return { keywords: filtered, categoryHint: categoryHint };
    } catch (e) {
      console.log('[分类推荐] LLM提炼JSON解析失败:', text.substring(0, 100));
      return { keywords: [], categoryHint: '' };
    }
  }).catch(function (err) {
    console.log('[分类推荐] LLM提炼请求失败:', err.message);
    return { keywords: [], categoryHint: '' };
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
  if (candidates.length === 0) {
    return res.json({ ok: true, source: 'manual_review', category: '', path: '', confidence: 0 });
  }
  // 互斥过滤 + 计分
  var titleKws = keywords.map(function (w) { return w.toLowerCase(); });
  var aliWords = splitAliCategoryWords(aliCategory).map(function (w) { return w.toLowerCase(); });
  candidates = candidates.filter(function (c) {
    return !isMutexConflict(titleKws, aliWords, c.path);
  });
  candidates.forEach(function (c) {
    c.score = scoreCategory(titleKws, aliWords, c, loadBlacklistCounts(aliWords.concat(titleKws)));
  });
  candidates.sort(function (a, b) { return (b.score || 0) - (a.score || 0); });
  if (candidates.length === 0) {
    return res.json({ ok: true, source: 'manual_review', category: '', path: '', confidence: 0 });
  }
  res.json({
    ok: true,
    source: 'fallback',
    category: candidates[0].name,
    path: candidates[0].path,
    confidence: Math.max(0.3, candidates[0].score || 0.3),
    alternatives: candidates.slice(1, 6)
  });
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

// 清除分类配置缓存（供外部调用，如 categories.js 的配置管理端点）
function clearConfigCache() {
  MUTEX_CACHE = null;
  NOISE_CACHE = null;
  GENERIC_CACHE = null;
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
module.exports.clearConfigCache = clearConfigCache;

// 测试用导出（仅单元测试使用）
module.exports._test = {
  scoreCategory: scoreCategory,
  isMutexConflict: isMutexConflict,
  getMutexGroupIndex: getMutexGroupIndex,
  splitAliCategoryWords: splitAliCategoryWords,
  cleanTitleKeywords: cleanTitleKeywords,
  calcHitDetail: calcHitDetail,
  loadMutexGroups: loadMutexGroups,
  clearConfigCache: clearConfigCache
};
