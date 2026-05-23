// 知识库 CRUD — 映射/关键词/同义词/黑名单/分类树路径查询
// 云端优先读取，降级本地

module.exports = function (cloud, db) {

  async function getMappings(categoryName) {
    if (cloud.connected) {
      var rows = await cloud.getAll('SELECT custom_category, count, source FROM category_mappings WHERE category_name = ? ORDER BY count DESC, id', [categoryName]);
      if (rows && rows.length > 0) return rows;
    }
    return db.getAll('SELECT custom_category, count, source FROM category_mappings WHERE category_name = ? ORDER BY count DESC, id', [categoryName]);
  }

  async function saveMapping(aliCat, customCat, source) {
    var existing = db.getOne('SELECT id, count FROM category_mappings WHERE category_name = ? AND custom_category = ?', [aliCat, customCat]);
    if (existing) {
      db.run('UPDATE category_mappings SET count = count + 1, source = ? WHERE id = ?', [source || 'auto', existing.id]);
    } else {
      db.run('INSERT INTO category_mappings (category_name, custom_category, count, source) VALUES (?, ?, 1, ?)', [aliCat, customCat, source || 'auto']);
    }
    if (cloud.connected) {
      cloud.run('SELECT id, count FROM category_mappings WHERE category_name = ? AND custom_category = ?', [aliCat, customCat]).then(function (existing) {
        if (existing && existing.rows && existing.rows.length > 0) {
          var row = existing.rows[0];
          cloud.run('UPDATE category_mappings SET count = count + 1, source = ? WHERE id = ?', [source || 'auto', row.id]);
        } else {
          cloud.run('INSERT OR IGNORE INTO category_mappings (category_name, custom_category, count, source) VALUES (?, ?, 1, ?)', [aliCat, customCat, source || 'auto']);
        }
      }).catch(function () {});
    }
  }

  async function getKeywordRels(keywords) {
    if (!keywords || !keywords.length) return [];
    if (cloud.connected) {
      var placeholders = keywords.map(function () { return '?' }).join(',');
      var rows = await cloud.getAll(
        'SELECT keyword, category_name, weight, match_count, source FROM keyword_category_rel WHERE valid = 1 AND keyword IN (' + placeholders + ')',
        keywords
      );
      if (rows && rows.length > 0) return rows;
    }
    var placeholders2 = keywords.map(function () { return '?' }).join(',');
    return db.getAll(
      'SELECT keyword, category_name, weight, match_count, source FROM keyword_category_rel WHERE valid = 1 AND keyword IN (' + placeholders2 + ')',
      keywords
    );
  }

  async function saveKeywordRel(keyword, categoryName, weight, source) {
    var existing = db.getOne('SELECT id, weight, match_count FROM keyword_category_rel WHERE keyword = ? AND category_name = ?', [keyword, categoryName]);
    if (existing) {
      var newWeight = Math.max(existing.weight, weight);
      db.run('UPDATE keyword_category_rel SET match_count = match_count + 1, weight = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newWeight, existing.id]);
    } else {
      db.run('INSERT INTO keyword_category_rel (keyword, category_name, weight, match_count, source) VALUES (?, ?, ?, 1, ?)', [keyword, categoryName, weight, source || 'auto']);
    }
    if (cloud.connected) {
      cloud.run('SELECT id, weight, match_count FROM keyword_category_rel WHERE keyword = ? AND category_name = ?', [keyword, categoryName]).then(function (res) {
        if (res && res.rows && res.rows.length > 0) {
          var row = res.rows[0];
          var newW = Math.max(row.weight, weight);
          cloud.run('UPDATE keyword_category_rel SET match_count = match_count + 1, weight = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newW, row.id]);
        } else {
          cloud.run('INSERT OR IGNORE INTO keyword_category_rel (keyword, category_name, weight, match_count, source) VALUES (?, ?, ?, 1, ?)', [keyword, categoryName, weight, source || 'auto']);
        }
      }).catch(function () {});
    }
  }

  async function getSynonyms(keyword) {
    if (cloud.connected) {
      var rows = await cloud.getAll('SELECT word_a, word_b FROM keyword_synonyms WHERE word_a = ? OR word_b = ?', [keyword, keyword]);
      if (rows && rows.length > 0) return rows;
    }
    return db.getAll('SELECT word_a, word_b FROM keyword_synonyms WHERE word_a = ? OR word_b = ?', [keyword, keyword]);
  }

  async function getBlacklisted(keyword) {
    if (cloud.connected) {
      var rows = await cloud.getAll('SELECT category_name FROM keyword_blacklist WHERE keyword = ?', [keyword]);
      if (rows && rows.length > 0) return rows;
    }
    return db.getAll('SELECT category_name FROM keyword_blacklist WHERE keyword = ?', [keyword]);
  }

  async function getTreePath(catName) {
    if (cloud.connected) {
      var row = await cloud.getOne('SELECT path FROM dxm_category_tree WHERE cat_name = ? AND is_leaf = 1 LIMIT 1', [catName]);
      if (row) return row;
    }
    return db.treeGetOne('SELECT path FROM dxm_category_tree WHERE cat_name = ? AND is_leaf = 1 LIMIT 1', [catName]);
  }

  return {
    getMappings: getMappings,
    saveMapping: saveMapping,
    getKeywordRels: getKeywordRels,
    saveKeywordRel: saveKeywordRel,
    getSynonyms: getSynonyms,
    getBlacklisted: getBlacklisted,
    getTreePath: getTreePath
  };
};
