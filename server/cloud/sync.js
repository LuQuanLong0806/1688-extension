// 同步操作 — 知识库批量同步 + 分类树同步 + 商品同步 + 单表同步

module.exports = function (cloud, db) {

  // ===== 知识库批量同步：本地 → 云端 =====
  async function uploadLocalToCloud() {
    if (!cloud.connected) return { ok: false, error: '未连接' };
    var counts = {};

    var mappings = db.getAll('SELECT category_name, custom_category, count, source FROM category_mappings');
    for (var i = 0; i < mappings.length; i++) {
      var m = mappings[i];
      var existing = await cloud.getOne('SELECT id, count FROM category_mappings WHERE category_name = ? AND custom_category = ?', [m.category_name, m.custom_category]);
      if (existing) {
        var maxCount = Math.max(existing.count || 0, m.count);
        if (maxCount > existing.count) {
          await cloud.run('UPDATE category_mappings SET count = ? WHERE id = ?', [maxCount, existing.id]);
        }
      } else {
        await cloud.run('INSERT INTO category_mappings (category_name, custom_category, count, source) VALUES (?, ?, ?, ?)',
          [m.category_name, m.custom_category, m.count, m.source]);
      }
    }
    counts.category_mappings = mappings.length;

    var rels = db.getAll('SELECT keyword, category_name, weight, match_count, valid, source FROM keyword_category_rel');
    for (var i = 0; i < rels.length; i++) {
      var r = rels[i];
      var existing = await cloud.getOne('SELECT id, weight, match_count FROM keyword_category_rel WHERE keyword = ? AND category_name = ?', [r.keyword, r.category_name]);
      if (existing) {
        var maxW = Math.max(existing.weight || 1.0, r.weight);
        var maxM = Math.max(existing.match_count || 1, r.match_count);
        if (maxW > existing.weight || maxM > existing.match_count) {
          await cloud.run('UPDATE keyword_category_rel SET weight = ?, match_count = ? WHERE id = ?', [maxW, maxM, existing.id]);
        }
      } else {
        await cloud.run('INSERT INTO keyword_category_rel (keyword, category_name, weight, match_count, valid, source) VALUES (?, ?, ?, ?, ?, ?)',
          [r.keyword, r.category_name, r.weight, r.match_count, r.valid, r.source]);
      }
    }
    counts.keyword_category_rel = rels.length;

    var syns = db.getAll('SELECT word_a, word_b FROM keyword_synonyms');
    if (syns.length > 0 && cloud.client.batch) {
      var batchSize = 200;
      for (var si = 0; si < syns.length; si += batchSize) {
        var chunk = syns.slice(si, si + batchSize);
        var stmts = chunk.map(function (s) {
          return { sql: 'INSERT OR IGNORE INTO keyword_synonyms (word_a, word_b) VALUES (?, ?)', args: [s.word_a, s.word_b] };
        });
        try { await cloud.client.batch(stmts); } catch (e) { console.error('[云同步] synonyms batch fail:', e.message); }
      }
    } else {
      for (var i = 0; i < syns.length; i++) {
        await cloud.run('INSERT OR IGNORE INTO keyword_synonyms (word_a, word_b) VALUES (?, ?)', [syns[i].word_a, syns[i].word_b]);
      }
    }
    counts.keyword_synonyms = syns.length;

    var bl = db.getAll('SELECT keyword, category_name, reason FROM keyword_blacklist');
    if (bl.length > 0 && cloud.client.batch) {
      var batchSize = 200;
      for (var bi = 0; bi < bl.length; bi += batchSize) {
        var chunk = bl.slice(bi, bi + batchSize);
        var stmts = chunk.map(function (b) {
          return { sql: 'INSERT OR IGNORE INTO keyword_blacklist (keyword, category_name, reason) VALUES (?, ?, ?)', args: [b.keyword, b.category_name, b.reason] };
        });
        try { await cloud.client.batch(stmts); } catch (e) { console.error('[云同步] blacklist batch fail:', e.message); }
      }
    } else {
      for (var i = 0; i < bl.length; i++) {
        await cloud.run('INSERT OR IGNORE INTO keyword_blacklist (keyword, category_name, reason) VALUES (?, ?, ?)', [bl[i].keyword, bl[i].category_name, bl[i].reason]);
      }
    }
    counts.keyword_blacklist = bl.length;

    var configs = db.getAll('SELECT type, value, group_name, description, sort_order FROM category_config');
    if (configs.length > 0 && cloud.client.batch) {
      var batchSize = 200;
      for (var ci = 0; ci < configs.length; ci += batchSize) {
        var chunk = configs.slice(ci, ci + batchSize);
        var stmts = chunk.map(function (c) {
          return { sql: 'INSERT OR REPLACE INTO category_config (type, value, group_name, description, sort_order) VALUES (?, ?, ?, ?, ?)', args: [c.type, c.value, c.group_name, c.description, c.sort_order] };
        });
        try { await cloud.client.batch(stmts); } catch (e) { console.error('[云同步] category_config batch fail:', e.message); }
      }
    } else {
      for (var i = 0; i < configs.length; i++) {
        await cloud.run('INSERT OR REPLACE INTO category_config (type, value, group_name, description, sort_order) VALUES (?, ?, ?, ?, ?)',
          [configs[i].type, configs[i].value, configs[i].group_name, configs[i].description, configs[i].sort_order]);
      }
    }
    counts.category_config = configs.length;

    console.log('[云同步] 知识库上传完成:', JSON.stringify(counts));
    cloud.lastSyncTime = new Date().toISOString();
    return { ok: true, counts: counts };
  }

  // ===== 知识库批量同步：云端 → 本地 =====
  async function downloadCloudToLocal() {
    if (!cloud.connected) return { ok: false, error: '未连接' };
    var counts = {};

    var cloudMappings = await cloud.getAll('SELECT category_name, custom_category, count, source FROM category_mappings');
    for (var i = 0; i < cloudMappings.length; i++) {
      var m = cloudMappings[i];
      var local = db.getOne('SELECT id, count FROM category_mappings WHERE category_name = ? AND custom_category = ?', [m.category_name, m.custom_category]);
      if (local) {
        var maxCount = Math.max(local.count || 0, m.count);
        if (maxCount > local.count) {
          db.run('UPDATE category_mappings SET count = ? WHERE id = ?', [maxCount, local.id]);
        }
      } else {
        db.run('INSERT INTO category_mappings (category_name, custom_category, count, source) VALUES (?, ?, ?, ?)',
          [m.category_name, m.custom_category, m.count, m.source]);
      }
    }
    counts.category_mappings = cloudMappings.length;

    var cloudRels = await cloud.getAll('SELECT keyword, category_name, weight, match_count, valid, source FROM keyword_category_rel');
    for (var i = 0; i < cloudRels.length; i++) {
      var r = cloudRels[i];
      var local = db.getOne('SELECT id, weight, match_count FROM keyword_category_rel WHERE keyword = ? AND category_name = ?', [r.keyword, r.category_name]);
      if (local) {
        var maxW = Math.max(local.weight || 1.0, r.weight);
        var maxM = Math.max(local.match_count || 1, r.match_count);
        if (maxW > local.weight || maxM > local.match_count) {
          db.run('UPDATE keyword_category_rel SET weight = ?, match_count = ? WHERE id = ?', [maxW, maxM, local.id]);
        }
      } else {
        db.run('INSERT INTO keyword_category_rel (keyword, category_name, weight, match_count, valid, source) VALUES (?, ?, ?, ?, ?, ?)',
          [r.keyword, r.category_name, r.weight, r.match_count, r.valid, r.source]);
      }
    }
    counts.keyword_category_rel = cloudRels.length;

    var cloudSyns = await cloud.getAll('SELECT word_a, word_b FROM keyword_synonyms');
    for (var i = 0; i < cloudSyns.length; i++) {
      db.run('INSERT OR IGNORE INTO keyword_synonyms (word_a, word_b) VALUES (?, ?)', [cloudSyns[i].word_a, cloudSyns[i].word_b]);
    }
    counts.keyword_synonyms = cloudSyns.length;

    var cloudBl = await cloud.getAll('SELECT keyword, category_name, reason FROM keyword_blacklist');
    for (var i = 0; i < cloudBl.length; i++) {
      db.run('INSERT OR IGNORE INTO keyword_blacklist (keyword, category_name, reason) VALUES (?, ?, ?)',
        [cloudBl[i].keyword, cloudBl[i].category_name, cloudBl[i].reason]);
    }
    counts.keyword_blacklist = cloudBl.length;

    var cloudConfigs = await cloud.getAll('SELECT type, value, group_name, description, sort_order FROM category_config');
    for (var i = 0; i < cloudConfigs.length; i++) {
      db.run('INSERT OR REPLACE INTO category_config (type, value, group_name, description, sort_order) VALUES (?, ?, ?, ?, ?)',
        [cloudConfigs[i].type, cloudConfigs[i].value, cloudConfigs[i].group_name, cloudConfigs[i].description, cloudConfigs[i].sort_order]);
    }
    counts.category_config = cloudConfigs.length;

    console.log('[云同步] 知识库下载完成:', JSON.stringify(counts));
    cloud.lastSyncTime = new Date().toISOString();
    return { ok: true, counts: counts };
  }

  // 双向同步
  async function bidirectionalSync() {
    if (!cloud.connected) return { ok: false, error: '未连接' };
    var pull = await downloadCloudToLocal();
    var push = await uploadLocalToCloud();
    return { ok: true, pull: pull.counts, push: push.counts };
  }

  // ===== 分类树同步 =====
  async function uploadTree() {
    if (!cloud.connected) return { ok: false, error: '未连接' };
    var trees = db.treeGetAll('SELECT cat_id, cat_name, parent_cat_id, cat_level, is_leaf, path FROM dxm_category_tree');
    var total = trees.length;
    var batchSize = 500;
    var uploaded = 0;
    var errors = 0;

    for (var batch = 0; batch < trees.length; batch += batchSize) {
      var chunk = trees.slice(batch, batch + batchSize);
      var stmts = chunk.map(function (t) {
        return {
          sql: 'INSERT OR IGNORE INTO dxm_category_tree (cat_id, cat_name, parent_cat_id, cat_level, is_leaf, path) VALUES (?, ?, ?, ?, ?, ?)',
          args: [t.cat_id, t.cat_name, t.parent_cat_id, t.cat_level, t.is_leaf, t.path]
        };
      });
      try {
        if (cloud.client.batch) {
          await cloud.client.batch(stmts);
        } else {
          for (var j = 0; j < stmts.length; j++) {
            await cloud.client.execute({ sql: stmts[j].sql, args: stmts[j].args });
          }
        }
        uploaded += chunk.length;
        console.log('[云同步] 分类树上传进度:', uploaded + '/' + total);
      } catch (e) {
        errors += chunk.length;
        console.error('[云同步] 分类树批次上传失败:', e.message);
      }
    }

    console.log('[云同步] 分类树上传完成, 总数:', total, '成功:', uploaded, '失败:', errors);
    return { ok: true, total: total, uploaded: uploaded, errors: errors };
  }

  async function downloadTree() {
    if (!cloud.connected) return { ok: false, error: '未连接' };
    var cloudTree = await cloud.getAll('SELECT cat_id, cat_name, parent_cat_id, cat_level, is_leaf, path FROM dxm_category_tree');
    var added = 0;
    for (var i = 0; i < cloudTree.length; i++) {
      var t = cloudTree[i];
      var local = db.treeGetOne('SELECT cat_id FROM dxm_category_tree WHERE cat_id = ?', [t.cat_id]);
      if (!local) {
        db.treeRun('INSERT OR IGNORE INTO dxm_category_tree (cat_id, cat_name, parent_cat_id, cat_level, is_leaf, path) VALUES (?, ?, ?, ?, ?, ?)',
          [t.cat_id, t.cat_name, t.parent_cat_id, t.cat_level, t.is_leaf, t.path]);
        added++;
      }
    }
    db.scheduleTreeSave();
    console.log('[云同步] 分类树下载完成, 云端:', cloudTree.length, '新增:', added);
    return { ok: true, cloudTotal: cloudTree.length, added: added };
  }

  // ===== 商品同步 =====
  async function uploadProducts() {
    if (!cloud.connected) return { ok: false, error: '未连接' };
    var products = db.getAll("SELECT source_url, title, main_images, desc_images, detail_images, attrs, skus, category, custom_category, dxm_category, manual_category, status, deleted, created_at, updated_at FROM products");
    var total = products.length;
    var uploaded = 0;
    var skipped = 0;
    var batchSize = 100;

    for (var batch = 0; batch < products.length; batch += batchSize) {
      var chunk = products.slice(batch, batch + batchSize);
      var stmts = chunk.map(function (p) {
        return {
          sql: 'INSERT OR IGNORE INTO products (source_url, title, main_images, desc_images, detail_images, attrs, skus, category, custom_category, dxm_category, manual_category, status, deleted, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          args: [p.source_url, p.title, p.main_images || '', p.desc_images || '', p.detail_images || '', p.attrs || '', p.skus || '', p.category || '', p.custom_category || '', p.dxm_category || '', p.manual_category || '', p.status || 0, p.deleted || 0, p.created_at || '', p.updated_at || '']
        };
      });
      try {
        if (cloud.client.batch) {
          await cloud.client.batch(stmts);
        } else {
          for (var j = 0; j < stmts.length; j++) {
            await cloud.client.execute({ sql: stmts[j].sql, args: stmts[j].args });
          }
        }
        uploaded += chunk.length;
        console.log('[云同步] 商品上传进度:', uploaded + '/' + total);
      } catch (e) {
        console.error('[云同步] 商品批次上传失败:', e.message);
      }
    }

    console.log('[云同步] 商品上传完成, 总数:', total, '成功:', uploaded);
    return { ok: true, total: total, uploaded: uploaded };
  }

  async function downloadProducts() {
    if (!cloud.connected) return { ok: false, error: '未连接' };
    var cloudProducts = await cloud.getAll('SELECT source_url, title, main_images, desc_images, detail_images, attrs, skus, category, custom_category, dxm_category, manual_category, status, deleted, created_at, updated_at FROM products');
    var added = 0;
    var skipped = 0;
    var deletedSynced = 0;

    for (var i = 0; i < cloudProducts.length; i++) {
      var p = cloudProducts[i];
      var isDeleted = p.deleted && Number(p.deleted) === 1;
      var local = db.getOne('SELECT id, deleted as local_deleted FROM products WHERE source_url = ?', [p.source_url]);
      if (!local) {
        if (isDeleted) { skipped++; continue; }
        db.run('INSERT INTO products (source_url, title, main_images, desc_images, detail_images, attrs, skus, category, custom_category, dxm_category, manual_category, status, deleted, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [p.source_url, p.title, p.main_images, p.desc_images, p.detail_images, p.attrs, p.skus, p.category, p.custom_category, p.dxm_category, p.manual_category, p.status, 0, p.created_at, p.updated_at]);
        added++;
      } else {
        if (isDeleted && !local.local_deleted) {
          db.run('UPDATE products SET deleted = 1 WHERE id = ?', [local.id]);
          deletedSynced++;
        }
        skipped++;
      }
    }
    db.scheduleSave();
    console.log('[云同步] 商品下载完成, 云端:', cloudProducts.length, '新增:', added, '跳过:', skipped, '删除同步:', deletedSynced);
    return { ok: true, cloudTotal: cloudProducts.length, added: added, skipped: skipped, deletedSynced: deletedSynced };
  }

  function saveProductToLocalAndCloud(sourceUrl, title, category, customCategory, dxmCategory, mainImages, descImages, detailImages, attrs, skus) {
    if (!cloud.connected) return;
    cloud.run(
      'INSERT OR IGNORE INTO products (source_url, title, main_images, desc_images, detail_images, attrs, skus, category, custom_category, dxm_category, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)',
      [sourceUrl || '', title || '', mainImages || '', descImages || '', detailImages || '', attrs || '', skus || '', category || '', customCategory || '', dxmCategory || '']
    ).catch(function () {});
  }

  // ===== 单表同步 =====
  var SINGLE_TABLE_DEFS = {
    mappings: {
      localGet: function () { return db.getAll('SELECT category_name, custom_category, count, source FROM category_mappings'); },
      cloudCols: 'category_name, custom_category, count, source',
      cloudKey: ['category_name', 'custom_category'],
      localKeyMatch: function (r) { return 'SELECT id, count FROM category_mappings WHERE category_name = ? AND custom_category = ?'; },
      localKeyParams: function (r) { return [r.category_name, r.custom_category]; },
      localInsert: 'INSERT INTO category_mappings (category_name, custom_category, count, source) VALUES (?, ?, ?, ?)',
      localInsertParams: function (r) { return [r.category_name, r.custom_category, r.count, r.source]; },
      localUpdate: 'UPDATE category_mappings SET count = ?, source = ? WHERE id = ?',
      cloudTable: 'category_mappings',
      cloudInsert: 'INSERT INTO category_mappings (category_name, custom_category, count, source) VALUES (?, ?, ?, ?)',
      cloudInsertParams: function (r) { return [r.category_name, r.custom_category, r.count, r.source]; },
      cloudUpdate: 'UPDATE category_mappings SET count = ?, source = ? WHERE id = ?',
      label: '类目映射'
    },
    'keyword-rels': {
      localGet: function () { return db.getAll('SELECT keyword, category_name, weight, match_count, valid, source FROM keyword_category_rel'); },
      cloudCols: 'keyword, category_name, weight, match_count, valid, source',
      cloudKey: ['keyword', 'category_name'],
      localKeyMatch: function (r) { return 'SELECT id, weight, match_count FROM keyword_category_rel WHERE keyword = ? AND category_name = ?'; },
      localKeyParams: function (r) { return [r.keyword, r.category_name]; },
      localInsert: 'INSERT INTO keyword_category_rel (keyword, category_name, weight, match_count, valid, source) VALUES (?, ?, ?, ?, ?, ?)',
      localInsertParams: function (r) { return [r.keyword, r.category_name, r.weight, r.match_count, r.valid, r.source]; },
      localUpdate: 'UPDATE keyword_category_rel SET weight = MAX(weight, ?), match_count = MAX(match_count, ?), valid = ?, source = ? WHERE id = ?',
      cloudTable: 'keyword_category_rel',
      cloudInsert: 'INSERT INTO keyword_category_rel (keyword, category_name, weight, match_count, valid, source) VALUES (?, ?, ?, ?, ?, ?)',
      cloudInsertParams: function (r) { return [r.keyword, r.category_name, r.weight, r.match_count, r.valid, r.source]; },
      cloudUpdate: 'UPDATE keyword_category_rel SET weight = ?, match_count = ?, valid = ?, source = ? WHERE id = ?',
      label: '关键词关联'
    },
    synonyms: {
      localGet: function () { return db.getAll('SELECT word_a, word_b FROM keyword_synonyms'); },
      cloudCols: 'word_a, word_b',
      cloudKey: ['word_a', 'word_b'],
      localKeyMatch: function (r) { return 'SELECT id FROM keyword_synonyms WHERE word_a = ? AND word_b = ?'; },
      localKeyParams: function (r) { return [r.word_a, r.word_b]; },
      localInsert: 'INSERT OR IGNORE INTO keyword_synonyms (word_a, word_b) VALUES (?, ?)',
      localInsertParams: function (r) { return [r.word_a, r.word_b]; },
      localUpdate: null,
      cloudTable: 'keyword_synonyms',
      cloudInsert: 'INSERT OR IGNORE INTO keyword_synonyms (word_a, word_b) VALUES (?, ?)',
      cloudInsertParams: function (r) { return [r.word_a, r.word_b]; },
      cloudUpdate: null,
      label: '同义词'
    },
    blacklist: {
      localGet: function () { return db.getAll('SELECT keyword, category_name, reason FROM keyword_blacklist'); },
      cloudCols: 'keyword, category_name, reason',
      cloudKey: ['keyword', 'category_name'],
      localKeyMatch: function (r) { return 'SELECT id FROM keyword_blacklist WHERE keyword = ? AND category_name = ?'; },
      localKeyParams: function (r) { return [r.keyword, r.category_name]; },
      localInsert: 'INSERT OR IGNORE INTO keyword_blacklist (keyword, category_name, reason) VALUES (?, ?, ?)',
      localInsertParams: function (r) { return [r.keyword, r.category_name, r.reason]; },
      localUpdate: null,
      cloudTable: 'keyword_blacklist',
      cloudInsert: 'INSERT OR IGNORE INTO keyword_blacklist (keyword, category_name, reason) VALUES (?, ?, ?)',
      cloudInsertParams: function (r) { return [r.keyword, r.category_name, r.reason]; },
      cloudUpdate: null,
      label: '黑名单'
    },
    'category-config': {
      localGet: function () { return db.getAll('SELECT type, value, group_name, description, sort_order FROM category_config'); },
      cloudCols: 'type, value, group_name, description, sort_order',
      cloudKey: ['type', 'value', 'group_name'],
      localKeyMatch: function (r) { return 'SELECT id FROM category_config WHERE type = ? AND value = ? AND group_name = ?'; },
      localKeyParams: function (r) { return [r.type, r.value, r.group_name]; },
      localInsert: 'INSERT OR REPLACE INTO category_config (type, value, group_name, description, sort_order) VALUES (?, ?, ?, ?, ?)',
      localInsertParams: function (r) { return [r.type, r.value, r.group_name, r.description, r.sort_order]; },
      localUpdate: null,
      cloudTable: 'category_config',
      cloudInsert: 'INSERT OR REPLACE INTO category_config (type, value, group_name, description, sort_order) VALUES (?, ?, ?, ?, ?)',
      cloudInsertParams: function (r) { return [r.type, r.value, r.group_name, r.description, r.sort_order]; },
      cloudUpdate: null,
      label: '分类配置'
    }
  };

  async function pushTable(tableKey) {
    if (!cloud.connected) return { ok: false, error: '未连接' };
    var def = SINGLE_TABLE_DEFS[tableKey];
    if (!def) return { ok: false, error: '未知表: ' + tableKey };

    var rows = def.localGet();
    var pushed = 0;
    var skipped = 0;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var whereParts = def.cloudKey.map(function (k) { return k + ' = ?'; });
      var cloudExisting = await cloud.getOne('SELECT id FROM ' + def.cloudTable + ' WHERE ' + whereParts.join(' AND '), def.localKeyParams(r));
      if (!cloudExisting) {
        await cloud.run(def.cloudInsert, def.cloudInsertParams(r));
        pushed++;
      } else if (tableKey === 'mappings') {
        var localCount = r.count || 0;
        var cloudRow = await cloud.getOne('SELECT count FROM category_mappings WHERE id = ?', [cloudExisting.id]);
        if (cloudRow && localCount > (cloudRow.count || 0)) {
          await cloud.run('UPDATE category_mappings SET count = ? WHERE id = ?', [localCount, cloudExisting.id]);
          pushed++;
        } else { skipped++; }
      } else if (tableKey === 'keyword-rels') {
        var cloudRow = await cloud.getOne('SELECT weight, match_count FROM keyword_category_rel WHERE id = ?', [cloudExisting.id]);
        if (cloudRow) {
          var maxW = Math.max(cloudRow.weight || 1.0, r.weight);
          var maxM = Math.max(cloudRow.match_count || 1, r.match_count);
          if (maxW > cloudRow.weight || maxM > cloudRow.match_count) {
            await cloud.run('UPDATE keyword_category_rel SET weight = ?, match_count = ? WHERE id = ?', [maxW, maxM, cloudExisting.id]);
            pushed++;
          } else { skipped++; }
        }
      } else {
        skipped++;
      }
    }
    console.log('[云同步] ' + def.label + '推送完成: 推送', pushed, '跳过', skipped);
    return { ok: true, table: def.label, pushed: pushed, skipped: skipped };
  }

  async function pullTable(tableKey) {
    if (!cloud.connected) return { ok: false, error: '未连接' };
    var def = SINGLE_TABLE_DEFS[tableKey];
    if (!def) return { ok: false, error: '未知表: ' + tableKey };

    var cloudRows = await cloud.getAll('SELECT ' + def.cloudCols + ' FROM ' + def.cloudTable);
    var added = 0;
    var updated = 0;
    for (var i = 0; i < cloudRows.length; i++) {
      var r = cloudRows[i];
      var local = db.getOne(def.localKeyMatch(r), def.localKeyParams(r));
      if (!local) {
        db.run(def.localInsert, def.localInsertParams(r));
        added++;
      } else if (tableKey === 'mappings') {
        var maxCount = Math.max(local.count || 0, r.count || 0);
        if (maxCount > local.count) {
          db.run('UPDATE category_mappings SET count = ? WHERE id = ?', [maxCount, local.id]);
          updated++;
        }
      } else if (tableKey === 'keyword-rels') {
        var maxW = Math.max(local.weight || 1.0, r.weight || 1.0);
        var maxM = Math.max(local.match_count || 1, r.match_count || 1);
        if (maxW > local.weight || maxM > local.match_count) {
          db.run('UPDATE keyword_category_rel SET weight = ?, match_count = ? WHERE id = ?', [maxW, maxM, local.id]);
          updated++;
        }
      }
    }
    db.scheduleSave();
    console.log('[云同步] ' + def.label + '拉取完成: 新增', added, '更新', updated);
    return { ok: true, table: def.label, cloudTotal: cloudRows.length, added: added, updated: updated };
  }

  return {
    uploadLocalToCloud: uploadLocalToCloud,
    downloadCloudToLocal: downloadCloudToLocal,
    bidirectionalSync: bidirectionalSync,
    uploadTree: uploadTree,
    downloadTree: downloadTree,
    uploadProducts: uploadProducts,
    downloadProducts: downloadProducts,
    saveProductToLocalAndCloud: saveProductToLocalAndCloud,
    pushTable: pushTable,
    pullTable: pullTable
  };
};
