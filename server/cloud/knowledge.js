// 知识库 CRUD — 映射/关键词/同义词/黑名单/分类树路径查询
// 本地优先读取（低延迟），云端异步写入（保持同步）

module.exports = function (cloud, db) {

  async function getMappings(categoryName) {
    // 本地优先，避免远程 170-240ms 延迟
    var rows = db.getAll('SELECT custom_category, count, source FROM category_mappings WHERE category_name = ? ORDER BY count DESC, id', [categoryName]);
    if (rows && rows.length > 0) return rows;
    // 本地无数据时再查云端
    if (cloud.connected) {
      return await cloud.getAll('SELECT custom_category, count, source FROM category_mappings WHERE category_name = ? ORDER BY count DESC, id', [categoryName]);
    }
    return [];
  }

  async function saveMapping(aliCat, customCat, source) {
    var existing = db.getOne('SELECT id, count FROM category_mappings WHERE category_name = ? AND custom_category = ?', [aliCat, customCat]);
    if (existing) {
      db.run(`UPDATE category_mappings SET count = count + 1, source = ?, updated_at = datetime('now', '+8 hours') WHERE id = ?`, [source || 'auto', existing.id]);
    } else {
      db.run(`INSERT INTO category_mappings (category_name, custom_category, count, source, created_at, updated_at) VALUES (?, ?, 1, ?, datetime('now', '+8 hours'), datetime('now', '+8 hours'))`, [aliCat, customCat, source || 'auto']);
    }
    db.scheduleSave();
    if (cloud.connected) {
      cloud.run('SELECT id, count FROM category_mappings WHERE category_name = ? AND custom_category = ?', [aliCat, customCat]).then(function (existing) {
        if (existing && existing.rows && existing.rows.length > 0) {
          var row = existing.rows[0];
          cloud.run(`UPDATE category_mappings SET count = count + 1, source = ?, updated_at = datetime('now', '+8 hours') WHERE id = ?`, [source || 'auto', row.id]);
        } else {
          cloud.run(`INSERT OR IGNORE INTO category_mappings (category_name, custom_category, count, source, created_at, updated_at) VALUES (?, ?, 1, ?, datetime('now', '+8 hours'), datetime('now', '+8 hours'))`, [aliCat, customCat, source || 'auto']);
        }
      }).catch(function () {});
    }
  }

  async function getKeywordRels(keywords) {
    if (!keywords || !keywords.length) return [];
    var placeholders = keywords.map(function () { return '?' }).join(',');
    // 本地优先
    var rows = db.getAll(
      'SELECT keyword, category_name, weight, match_count, source FROM keyword_category_rel WHERE valid = 1 AND keyword IN (' + placeholders + ')',
      keywords
    );
    if (rows && rows.length > 0) return rows;
    // 本地无数据时再查云端
    if (cloud.connected) {
      var placeholders2 = keywords.map(function () { return '?' }).join(',');
      return await cloud.getAll(
        'SELECT keyword, category_name, weight, match_count, source FROM keyword_category_rel WHERE valid = 1 AND keyword IN (' + placeholders2 + ')',
        keywords
      );
    }
    return [];
  }

  async function saveKeywordRel(keyword, categoryName, weight, source) {
    var existing = db.getOne('SELECT id, weight, match_count FROM keyword_category_rel WHERE keyword = ? AND category_name = ?', [keyword, categoryName]);
    if (existing) {
      var newWeight = Math.max(existing.weight, weight);
      db.run(`UPDATE keyword_category_rel SET match_count = match_count + 1, weight = ?, updated_at = datetime('now', '+8 hours') WHERE id = ?`, [newWeight, existing.id]);
    } else {
      db.run(`INSERT INTO keyword_category_rel (keyword, category_name, weight, match_count, source, created_at, updated_at) VALUES (?, ?, ?, 1, ?, datetime('now', '+8 hours'), datetime('now', '+8 hours'))`, [keyword, categoryName, weight, source || 'auto']);
    }
    db.scheduleSave();
    if (cloud.connected) {
      cloud.run('SELECT id, weight, match_count FROM keyword_category_rel WHERE keyword = ? AND category_name = ?', [keyword, categoryName]).then(function (res) {
        if (res && res.rows && res.rows.length > 0) {
          var row = res.rows[0];
          var newW = Math.max(row.weight, weight);
          cloud.run(`UPDATE keyword_category_rel SET match_count = match_count + 1, weight = ?, updated_at = datetime('now', '+8 hours') WHERE id = ?`, [newW, row.id]);
        } else {
          cloud.run(`INSERT OR IGNORE INTO keyword_category_rel (keyword, category_name, weight, match_count, source, created_at, updated_at) VALUES (?, ?, ?, 1, ?, datetime('now', '+8 hours'), datetime('now', '+8 hours'))`, [keyword, categoryName, weight, source || 'auto']);
        }
      }).catch(function () {});
    }
  }

  async function invalidateAutoRels(keywords, categoryName) {
    if (!keywords || !keywords.length || !categoryName) return;
    var placeholders = keywords.map(function () { return '?' }).join(',');
    // 本地：将自动积累的 keyword→错误类目 关联标记为无效
    db.run(
      `UPDATE keyword_category_rel SET valid = 0, updated_at = datetime('now', '+8 hours') WHERE category_name = ? AND source = 'auto' AND keyword IN (` + placeholders + ')',
      [categoryName].concat(keywords)
    );
    db.scheduleSave();
    // 云端同步
    if (cloud.connected) {
      cloud.run(
        `UPDATE keyword_category_rel SET valid = 0, updated_at = datetime('now', '+8 hours') WHERE category_name = ? AND source = 'auto' AND keyword IN (` + placeholders + ')',
        [categoryName].concat(keywords)
      ).catch(function () {});
    }
  }

  async function getSynonyms(keyword) {
    // 本地优先
    var rows = db.getAll('SELECT word_a, word_b FROM keyword_synonyms WHERE word_a = ? OR word_b = ?', [keyword, keyword]);
    if (rows && rows.length > 0) return rows;
    if (cloud.connected) {
      return await cloud.getAll('SELECT word_a, word_b FROM keyword_synonyms WHERE word_a = ? OR word_b = ?', [keyword, keyword]);
    }
    return [];
  }

  async function getBlacklisted(keyword) {
    // 本地优先
    var rows = db.getAll('SELECT category_name FROM keyword_blacklist WHERE keyword = ?', [keyword]);
    if (rows && rows.length > 0) return rows;
    if (cloud.connected) {
      return await cloud.getAll('SELECT category_name FROM keyword_blacklist WHERE keyword = ?', [keyword]);
    }
    return [];
  }

  function getBlacklistCounts(keywords) {
    if (!keywords || !keywords.length) return [];
    var placeholders = keywords.map(function () { return '?' }).join(',');
    var rows = db.getAll(
      'SELECT keyword, category_name, count FROM keyword_blacklist WHERE keyword IN (' + placeholders + ')',
      keywords
    );
    return rows || [];
  }

  function upsertBlacklist(keyword, categoryName) {
    if (!keyword || !categoryName) return;
    var existing = db.getOne('SELECT id, count FROM keyword_blacklist WHERE keyword = ? AND category_name = ?', [keyword, categoryName]);
    if (existing) {
      db.run(`UPDATE keyword_blacklist SET count = count + 1, updated_at = datetime('now', '+8 hours') WHERE id = ?`, [existing.id]);
    } else {
      db.run(`INSERT INTO keyword_blacklist (keyword, category_name, reason, count, created_at, updated_at) VALUES (?, ?, 'auto', 1, datetime('now', '+8 hours'), datetime('now', '+8 hours'))`, [keyword, categoryName]);
    }
    db.scheduleSave();
    if (cloud.connected) {
      cloud.getOne('SELECT id, count FROM keyword_blacklist WHERE keyword = ? AND category_name = ?', [keyword, categoryName]).then(function (cloudRow) {
        if (cloudRow && cloudRow.id) {
          cloud.run(`UPDATE keyword_blacklist SET count = count + 1, updated_at = datetime('now', '+8 hours') WHERE id = ?`, [cloudRow.id]).catch(function () {});
        } else {
          cloud.run(`INSERT OR IGNORE INTO keyword_blacklist (keyword, category_name, reason, count, created_at, updated_at) VALUES (?, ?, 'auto', 1, datetime('now', '+8 hours'), datetime('now', '+8 hours'))`, [keyword, categoryName]).catch(function () {});
        }
      }).catch(function () {});
    }
  }

  function reduceBlacklist(keyword, categoryName) {
    if (!keyword || !categoryName) return;
    var existing = db.getOne('SELECT id, count FROM keyword_blacklist WHERE keyword = ? AND category_name = ?', [keyword, categoryName]);
    if (!existing) return;
    if (existing.count <= 1) {
      db.run('DELETE FROM keyword_blacklist WHERE id = ?', [existing.id]);
    } else {
      db.run(`UPDATE keyword_blacklist SET count = count - 1, updated_at = datetime('now', '+8 hours') WHERE id = ?`, [existing.id]);
    }
    db.scheduleSave();
    if (cloud.connected) {
      cloud.getOne('SELECT id, count FROM keyword_blacklist WHERE keyword = ? AND category_name = ?', [keyword, categoryName]).then(function (cloudRow) {
        if (!cloudRow || !cloudRow.id) return;
        if (cloudRow.count <= 1) {
          cloud.run('DELETE FROM keyword_blacklist WHERE id = ?', [cloudRow.id]).catch(function () {});
        } else {
          cloud.run(`UPDATE keyword_blacklist SET count = count - 1, updated_at = datetime('now', '+8 hours') WHERE id = ?`, [cloudRow.id]).catch(function () {});
        }
      }).catch(function () {});
    }
  }

  async function getTreePath(catName) {
    // 本地优先（treeDb 是本地分类树库）
    var row = db.treeGetOne('SELECT path FROM dxm_category_tree WHERE cat_name = ? AND is_leaf = 1 LIMIT 1', [catName]);
    if (row) return row;
    if (cloud.connected) {
      return await cloud.getOne('SELECT path FROM dxm_category_tree WHERE cat_name = ? AND is_leaf = 1 LIMIT 1', [catName]);
    }
    return null;
  }

  // ===== 分类配置（过滤词/互斥组/泛词） =====

  async function getCategoryConfig(type) {
    // 本地优先
    var rows = db.getAll('SELECT id, type, value, group_name, description, sort_order FROM category_config WHERE type = ? AND deleted = 0 ORDER BY sort_order, id', [type]);
    if (rows && rows.length > 0) return rows;
    if (cloud.connected) {
      return await cloud.getAll('SELECT id, type, value, group_name, description, sort_order FROM category_config WHERE type = ? AND deleted = 0 ORDER BY sort_order, id', [type]);
    }
    return [];
  }

  async function getAllCategoryConfig() {
    // 本地优先
    var rows = db.getAll('SELECT id, type, value, group_name, description, sort_order FROM category_config WHERE deleted = 0 ORDER BY type, sort_order, id');
    if (rows && rows.length > 0) return rows;
    if (cloud.connected) {
      return await cloud.getAll('SELECT id, type, value, group_name, description, sort_order FROM category_config WHERE deleted = 0 ORDER BY type, sort_order, id');
    }
    return [];
  }

  function saveCategoryConfig(type, value, groupName, description, sortOrder) {
    // 检查是否有软删行可复活
    var softDeleted = db.getOne('SELECT id FROM category_config WHERE type = ? AND value = ? AND group_name = ? AND deleted = 1', [type, value, groupName || '']);
    if (softDeleted) {
      db.run(`UPDATE category_config SET description = ?, sort_order = ?, deleted = 0, updated_at = datetime('now', '+8 hours') WHERE id = ?`,
        [description || '', sortOrder || 0, softDeleted.id]);
    } else {
      db.run(`INSERT OR REPLACE INTO category_config (type, value, group_name, description, sort_order, deleted, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, datetime('now', '+8 hours'), datetime('now', '+8 hours'))`,
        [type, value, groupName || '', description || '', sortOrder || 0]);
    }
    db.scheduleSave();
    if (cloud.connected) {
      // 云端同样先尝试复活
      cloud.getOne('SELECT id FROM category_config WHERE type = ? AND value = ? AND group_name = ? AND deleted = 1', [type, value, groupName || '']).then(function (cloudSoft) {
        if (cloudSoft) {
          cloud.run(`UPDATE category_config SET description = ?, sort_order = ?, deleted = 0, updated_at = datetime('now', '+8 hours') WHERE id = ?`,
            [description || '', sortOrder || 0, cloudSoft.id]).catch(function () {});
        } else {
          cloud.run(`INSERT OR REPLACE INTO category_config (type, value, group_name, description, sort_order, deleted, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, datetime('now', '+8 hours'), datetime('now', '+8 hours'))`,
            [type, value, groupName || '', description || '', sortOrder || 0]).catch(function () {});
        }
      }).catch(function () {});
    }
  }

  function deleteCategoryConfig(id) {
    var row = db.getOne('SELECT type, value, group_name FROM category_config WHERE id = ?', [id]);
    db.run(`UPDATE category_config SET deleted = 1, updated_at = datetime('now', '+8 hours') WHERE id = ?`, [id]);
    db.scheduleSave();
    if (cloud.connected && row) {
      cloud.run(`UPDATE category_config SET deleted = 1, updated_at = datetime('now', '+8 hours') WHERE type = ? AND value = ? AND group_name = ?`, [row.type, row.value, row.group_name]).catch(function () {});
    }
  }

  function seedCategoryConfig() {
    var existing = db.getAll('SELECT COUNT(*) as cnt FROM category_config');
    if (existing && existing.length && existing[0].cnt > 0) return;

    var seeds = [];
    // 互斥组
    var groups = [
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
    groups.forEach(function (g, gi) {
      g.names.forEach(function (name) {
        seeds.push({ type: 'mutex', value: name, group_name: g.label, sort_order: gi });
      });
    });

    // 噪音词
    ['爆款','热销','新款','新款上市','厂家直销','批发','包邮','特价','促销','限时','秒杀','折扣','优惠','满减','赠品','现货','定制','加工','代发',
     '一件代发','源头工厂','工厂直供','厂家直供','品牌','正品','旗舰','专柜','同款','网红','直播','推荐','精选','热卖','畅销','质量保证','售后',
     '七天无理由','退换货','包邮区','非偏远包邮','快递','物流','发货','拍照','实物','拍摄','样品','拿样','小批量','起批','混批',
     '春夏','秋冬','春款','夏款','秋款','冬款','春夏新款','秋冬新款','2024','2025','2026','最新','潮流','时尚','ins','INS',
     '百搭','简约','韩版','日系','欧美','港风','复古','文艺','可爱','小清新','ins风','北欧','轻奢','高端','大气','上档次',
     '多功能','二合一','三合一','升级','省心','省力','省时','好用','实用','耐用','经久耐用'].forEach(function (w) {
      seeds.push({ type: 'noise', value: w });
    });

    // 泛词
    ['跨境','外贸','出口','进口','国产','清洁','清洗','去污','除味','消毒','杀菌','厨房','浴室','客厅','卧室','阳台','家用','户外',
     '收纳','整理','便携','折叠','悬挂','可悬挂','深度','加厚','加大','大号','小号','环保','防水','防滑','防尘','防霉',
     '健康','安全','食品级','无毒','无异味','豪华','精致','精美','创意','新款','新款上市','不伤','神器','好用','必备','专用','通用',
     '圆形','方形','长方形','双面','单面','多功能','全自动','半自动','商业','商用','工业','酒店','物业'].forEach(function (w) {
      seeds.push({ type: 'generic', value: w });
    });

    seeds.forEach(function (s) {
      db.run(`INSERT OR IGNORE INTO category_config (type, value, group_name, description, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, datetime('now', '+8 hours'), datetime('now', '+8 hours'))`,
        [s.type, s.value, s.group_name || '', s.description || '', s.sort_order || 0]);
    });
    db.scheduleSave();
    console.log('[分类配置] 初始化种子数据:', seeds.length, '条');
  }

  return {
    getMappings: getMappings,
    saveMapping: saveMapping,
    getKeywordRels: getKeywordRels,
    saveKeywordRel: saveKeywordRel,
    invalidateAutoRels: invalidateAutoRels,
    getSynonyms: getSynonyms,
    getBlacklisted: getBlacklisted,
    getBlacklistCounts: getBlacklistCounts,
    upsertBlacklist: upsertBlacklist,
    reduceBlacklist: reduceBlacklist,
    getTreePath: getTreePath,
    getCategoryConfig: getCategoryConfig,
    getAllCategoryConfig: getAllCategoryConfig,
    saveCategoryConfig: saveCategoryConfig,
    deleteCategoryConfig: deleteCategoryConfig,
    seedCategoryConfig: seedCategoryConfig
  };
};
