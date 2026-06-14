// 同步操作 — 知识库批量同步 + 分类树同步 + 商品同步 + 单表同步

module.exports = function (cloud, db) {

  // ===== 知识库批量同步：本地 → 云端 =====
  async function uploadLocalToCloud() {
    if (!cloud.connected) return { ok: false, error: '未连接' };
    var counts = {};

    var mappings = db.getAll('SELECT category_name, custom_category, count, source, deleted, updated_at FROM category_mappings');
    for (var i = 0; i < mappings.length; i++) {
      var m = mappings[i];
      var existing = await cloud.getOne('SELECT id, updated_at FROM category_mappings WHERE category_name = ? AND custom_category = ?', [m.category_name, m.custom_category]);
      if (existing) {
        var localNewer = m.updated_at && (!existing.updated_at || m.updated_at > existing.updated_at);
        if (localNewer) {
          await cloud.run('UPDATE category_mappings SET count = ?, source = ?, deleted = ?, updated_at = ? WHERE id = ?', [m.count, m.source, m.deleted || 0, m.updated_at, existing.id]);
        }
      } else {
        await cloud.run(`INSERT INTO category_mappings (category_name, custom_category, count, source, deleted, created_at, updated_at) VALUES (?, ?, ?, ?, ?, datetime('now', '+8 hours'), ?)`,
          [m.category_name, m.custom_category, m.count, m.source, m.deleted || 0, m.updated_at || '']);
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
        await cloud.run(`INSERT INTO keyword_category_rel (keyword, category_name, weight, match_count, valid, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now', '+8 hours'), datetime('now', '+8 hours'))`,
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
          return { sql: `INSERT OR IGNORE INTO keyword_synonyms (word_a, word_b, created_at, updated_at) VALUES (?, ?, datetime('now', '+8 hours'), datetime('now', '+8 hours'))`, args: [s.word_a, s.word_b] };
        });
        try { await cloud.client.batch(stmts); } catch (e) { console.error('[云同步] synonyms batch fail:', e.message); }
      }
    } else {
      for (var i = 0; i < syns.length; i++) {
        await cloud.run(`INSERT OR IGNORE INTO keyword_synonyms (word_a, word_b, created_at, updated_at) VALUES (?, ?, datetime('now', '+8 hours'), datetime('now', '+8 hours'))`, [syns[i].word_a, syns[i].word_b]);
      }
    }
    counts.keyword_synonyms = syns.length;

    var bl = db.getAll('SELECT keyword, category_name, reason, count FROM keyword_blacklist');
    if (bl.length > 0 && cloud.client.batch) {
      var batchSize = 200;
      for (var bi = 0; bi < bl.length; bi += batchSize) {
        var chunk = bl.slice(bi, bi + batchSize);
        var stmts = chunk.map(function (b) {
          return { sql: `INSERT OR IGNORE INTO keyword_blacklist (keyword, category_name, reason, count, created_at, updated_at) VALUES (?, ?, ?, ?, datetime('now', '+8 hours'), datetime('now', '+8 hours'))`, args: [b.keyword, b.category_name, b.reason, b.count || 1] };
        });
        try { await cloud.client.batch(stmts); } catch (e) { console.error('[云同步] blacklist batch fail:', e.message); }
      }
    } else {
      for (var i = 0; i < bl.length; i++) {
        var blExisting = await cloud.getOne('SELECT id, count FROM keyword_blacklist WHERE keyword = ? AND category_name = ?', [bl[i].keyword, bl[i].category_name]);
        if (blExisting) {
          var blMaxCount = Math.max(blExisting.count || 1, bl[i].count || 1);
          if (blMaxCount > blExisting.count) {
            await cloud.run('UPDATE keyword_blacklist SET count = ? WHERE id = ?', [blMaxCount, blExisting.id]);
          }
        } else {
          await cloud.run(`INSERT INTO keyword_blacklist (keyword, category_name, reason, count, created_at, updated_at) VALUES (?, ?, ?, ?, datetime('now', '+8 hours'), datetime('now', '+8 hours'))`, [bl[i].keyword, bl[i].category_name, bl[i].reason, bl[i].count || 1]);
        }
      }
    }
    counts.keyword_blacklist = bl.length;

    var configs = db.getAll('SELECT type, value, group_name, description, sort_order, deleted FROM category_config');
    if (configs.length > 0 && cloud.client.batch) {
      var batchSize = 200;
      for (var ci = 0; ci < configs.length; ci += batchSize) {
        var chunk = configs.slice(ci, ci + batchSize);
        var stmts = chunk.map(function (c) {
          return { sql: `INSERT OR REPLACE INTO category_config (type, value, group_name, description, sort_order, deleted, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now', '+8 hours'), datetime('now', '+8 hours'))`, args: [c.type, c.value, c.group_name, c.description, c.sort_order, c.deleted || 0] };
        });
        try { await cloud.client.batch(stmts); } catch (e) { console.error('[云同步] category_config batch fail:', e.message); }
      }
    } else {
      for (var i = 0; i < configs.length; i++) {
        await cloud.run(`INSERT OR REPLACE INTO category_config (type, value, group_name, description, sort_order, deleted, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now', '+8 hours'), datetime('now', '+8 hours'))`,
          [configs[i].type, configs[i].value, configs[i].group_name, configs[i].description, configs[i].sort_order, configs[i].deleted || 0]);
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

    var cloudMappings = await cloud.getAll('SELECT category_name, custom_category, count, source, deleted, updated_at FROM category_mappings');
    for (var i = 0; i < cloudMappings.length; i++) {
      var m = cloudMappings[i];
      var local = db.getOne('SELECT id, updated_at FROM category_mappings WHERE category_name = ? AND custom_category = ?', [m.category_name, m.custom_category]);
      if (local) {
        var cloudNewer = m.updated_at && (!local.updated_at || m.updated_at > local.updated_at);
        if (cloudNewer) {
          db.run('UPDATE category_mappings SET count = ?, source = ?, deleted = ?, updated_at = ? WHERE id = ?', [m.count, m.source, m.deleted || 0, m.updated_at, local.id]);
        }
      } else {
        db.run(`INSERT INTO category_mappings (category_name, custom_category, count, source, deleted, created_at, updated_at) VALUES (?, ?, ?, ?, ?, datetime('now', '+8 hours'), ?)`,
          [m.category_name, m.custom_category, m.count, m.source, m.deleted || 0, m.updated_at || '']);
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
        db.run(`INSERT INTO keyword_category_rel (keyword, category_name, weight, match_count, valid, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now', '+8 hours'), datetime('now', '+8 hours'))`,
          [r.keyword, r.category_name, r.weight, r.match_count, r.valid, r.source]);
      }
    }
    counts.keyword_category_rel = cloudRels.length;

    var cloudSyns = await cloud.getAll('SELECT word_a, word_b FROM keyword_synonyms');
    for (var i = 0; i < cloudSyns.length; i++) {
      db.run(`INSERT OR IGNORE INTO keyword_synonyms (word_a, word_b, created_at, updated_at) VALUES (?, ?, datetime('now', '+8 hours'), datetime('now', '+8 hours'))`, [cloudSyns[i].word_a, cloudSyns[i].word_b]);
    }
    counts.keyword_synonyms = cloudSyns.length;

    var cloudBl = await cloud.getAll('SELECT keyword, category_name, reason, count FROM keyword_blacklist');
    for (var i = 0; i < cloudBl.length; i++) {
      var localBl = db.getOne('SELECT id, count FROM keyword_blacklist WHERE keyword = ? AND category_name = ?', [cloudBl[i].keyword, cloudBl[i].category_name]);
      if (localBl) {
        var dlMaxCount = Math.max(localBl.count || 1, cloudBl[i].count || 1);
        if (dlMaxCount > localBl.count) {
          db.run('UPDATE keyword_blacklist SET count = ? WHERE id = ?', [dlMaxCount, localBl.id]);
        }
      } else {
        db.run(`INSERT OR IGNORE INTO keyword_blacklist (keyword, category_name, reason, count, created_at, updated_at) VALUES (?, ?, ?, ?, datetime('now', '+8 hours'), datetime('now', '+8 hours'))`,
          [cloudBl[i].keyword, cloudBl[i].category_name, cloudBl[i].reason, cloudBl[i].count || 1]);
      }
    }
    counts.keyword_blacklist = cloudBl.length;

    var cloudConfigs = await cloud.getAll('SELECT type, value, group_name, description, sort_order, deleted, updated_at FROM category_config');
    for (var i = 0; i < cloudConfigs.length; i++) {
      var cc = cloudConfigs[i];
      var localCc = db.getOne('SELECT id, updated_at FROM category_config WHERE type = ? AND value = ? AND group_name = ?', [cc.type, cc.value, cc.group_name || '']);
      if (localCc) {
        // 本地已有：仅云端更新时间更晚时才覆盖
        var cloudNewer = cc.updated_at && (!localCc.updated_at || cc.updated_at > localCc.updated_at);
        if (cloudNewer) {
          db.run('UPDATE category_config SET description = ?, sort_order = ?, deleted = ?, updated_at = ? WHERE id = ?',
            [cc.description || '', cc.sort_order || 0, cc.deleted || 0, cc.updated_at, localCc.id]);
        }
      } else {
        db.run(`INSERT OR IGNORE INTO category_config (type, value, group_name, description, sort_order, deleted, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now', '+8 hours'), ?)`,
          [cc.type, cc.value, cc.group_name || '', cc.description || '', cc.sort_order || 0, cc.deleted || 0, cc.updated_at || '']);
      }
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
          sql: `INSERT OR IGNORE INTO dxm_category_tree (cat_id, cat_name, parent_cat_id, cat_level, is_leaf, path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now', '+8 hours'), datetime('now', '+8 hours'))`,
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
        db.treeRun(`INSERT OR IGNORE INTO dxm_category_tree (cat_id, cat_name, parent_cat_id, cat_level, is_leaf, path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now', '+8 hours'), datetime('now', '+8 hours'))`,
          [t.cat_id, t.cat_name, t.parent_cat_id, t.cat_level, t.is_leaf, t.path]);
        added++;
      }
    }
    db.scheduleTreeSave();
    console.log('[云同步] 分类树下载完成, 云端:', cloudTree.length, '新增:', added);
    return { ok: true, cloudTotal: cloudTree.length, added: added };
  }

  // ===== 商品同步 =====
  async function uploadProducts(options) {
    if (!cloud.connected) return { ok: false, error: '未连接' };
    var where = '';
    var params = [];
    if (options && options.since) {
      where = ' WHERE updated_at >= ?';
      params = [options.since];
    }
    var products = db.getAll("SELECT uid, source_url, title, main_images, desc_images, detail_images, attrs, skus, category, custom_category, dxm_category, manual_category, status, deleted, store_name, variant_attr_name, product_no, variant_attr_name2, variant_attr_name3, variant_attr_images, original_images, owner, claim_at, created_at, updated_at, automation_stage, automation_log, automation_issues, automation_started_at, automation_finished_at FROM products" + where, params);
    var total = products.length;
    var uploaded = 0;
    var skipped = 0;
    var batchSize = 100;

    for (var batch = 0; batch < products.length; batch += batchSize) {
      var chunk = products.slice(batch, batch + batchSize);
      var stmts = chunk.map(function (p) {
        if (!p.uid) return null; // 跳过无 uid 的旧记录
        return {
          sql: (function () {
            var cols = ['source_url', 'title', 'main_images', 'desc_images', 'detail_images', 'attrs', 'skus', 'category', 'custom_category', 'dxm_category', 'manual_category', 'status', 'deleted', 'store_name', 'variant_attr_name', 'product_no', 'variant_attr_name2', 'variant_attr_name3', 'variant_attr_images', 'original_images', 'owner', 'claim_at', 'automation_stage', 'automation_log', 'automation_issues', 'automation_started_at', 'automation_finished_at'];
            var sets = cols.map(function (c) { return c + ' = CASE WHEN excluded.updated_at > products.updated_at THEN excluded.' + c + ' ELSE products.' + c + ' END'; });
            sets.push('created_at = COALESCE(products.created_at, excluded.created_at)');
            sets.push('updated_at = CASE WHEN excluded.updated_at > products.updated_at THEN excluded.updated_at ELSE products.updated_at END');
            return 'INSERT INTO products (uid, source_url, title, main_images, desc_images, detail_images, attrs, skus, category, custom_category, dxm_category, manual_category, status, deleted, store_name, variant_attr_name, product_no, variant_attr_name2, variant_attr_name3, variant_attr_images, original_images, owner, claim_at, created_at, updated_at, automation_stage, automation_log, automation_issues, automation_started_at, automation_finished_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(uid) DO UPDATE SET ' + sets.join(', ');
          })(),
          args: [p.uid, p.source_url, p.title, p.main_images || '', p.desc_images || '', p.detail_images || '', p.attrs || '', p.skus || '', p.category || '', p.custom_category || '', p.dxm_category || '', p.manual_category || '', p.status || 0, p.deleted || 0, p.store_name || '', p.variant_attr_name || '', p.product_no || '', p.variant_attr_name2 || '', p.variant_attr_name3 || '', p.variant_attr_images || '', p.original_images || '', p.owner || '', p.claim_at || '', p.created_at || '', p.updated_at || '', p.automation_stage || 'none', p.automation_log || '', p.automation_issues || '', p.automation_started_at || null, p.automation_finished_at || null]
        };
      }).filter(Boolean);
      try {
        if (stmts.length && cloud.client.batch) {
          await cloud.client.batch(stmts);
          uploaded += stmts.length;
        } else {
          for (var j = 0; j < stmts.length; j++) {
            await cloud.client.execute({ sql: stmts[j].sql, args: stmts[j].args });
            uploaded++;
          }
        }
        console.log('[云同步] 商品上传进度:', uploaded + '/' + total);
      } catch (e) {
        // 批量失败时逐条重试
        console.error('[云同步] 批量上传失败，逐条重试:', e.message);
        for (var j = 0; j < stmts.length; j++) {
          try {
            await cloud.client.execute({ sql: stmts[j].sql, args: stmts[j].args });
            uploaded++;
          } catch (e2) {
            // source_url 冲突：更新 uid 让后续重试成功
            if (e2.message && e2.message.indexOf('source_url') >= 0 && chunk[j] && chunk[j].uid && chunk[j].source_url) {
              try {
                await cloud.run('UPDATE products SET uid = ? WHERE source_url = ?', [chunk[j].uid, chunk[j].source_url]);
                await cloud.client.execute({ sql: stmts[j].sql, args: stmts[j].args });
                uploaded++;
              } catch (e3) {}
            }
          }
        }
        console.log('[云同步] 商品上传进度:', uploaded + '/' + total);
      }
    }

    console.log('[云同步] 商品上传完成, 总数:', total, '成功:', uploaded);
    return { ok: true, total: total, uploaded: uploaded };
  }

  async function downloadProducts(options) {
    if (!cloud.connected) return { ok: false, error: '未连接' };
    var where = '';
    var params = [];
    if (options && options.since) {
      where = ' WHERE updated_at >= ?';
      params = [options.since];
    }
    var cloudProducts = await cloud.getAll('SELECT uid, source_url, title, main_images, desc_images, detail_images, attrs, skus, category, custom_category, dxm_category, manual_category, status, deleted, store_name, variant_attr_name, product_no, variant_attr_name2, variant_attr_name3, variant_attr_images, original_images, owner, claim_at, created_at, updated_at, automation_stage, automation_log, automation_issues, automation_started_at, automation_finished_at FROM products' + where, params);
    var added = 0;
    var updated = 0;
    var skipped = 0;
    var deletedSynced = 0;

    for (var i = 0; i < cloudProducts.length; i++) {
      var p = cloudProducts[i];
      if (!p.uid) { skipped++; continue; } // 跳过无 uid 的旧记录
      var isDeleted = p.deleted && Number(p.deleted) === 1;
      var local = db.getOne('SELECT id, deleted as local_deleted, created_at as local_created_at, updated_at as local_updated_at FROM products WHERE uid = ?', [p.uid]);
      if (!local) {
        if (isDeleted) { skipped++; continue; }
        db.run('INSERT INTO products (uid, source_url, title, main_images, desc_images, detail_images, attrs, skus, category, custom_category, dxm_category, manual_category, status, deleted, store_name, variant_attr_name, product_no, variant_attr_name2, variant_attr_name3, variant_attr_images, original_images, owner, claim_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [p.uid, p.source_url || '', p.title, p.main_images, p.desc_images, p.detail_images, p.attrs, p.skus, p.category, p.custom_category, p.dxm_category, p.manual_category, p.status, 0, p.store_name || '', p.variant_attr_name || '', p.product_no || '', p.variant_attr_name2 || '', p.variant_attr_name3 || '', p.variant_attr_images || '', p.original_images || '', p.owner || '', p.claim_at || '', p.created_at, p.updated_at]);
        added++;
      } else {
        var cloudNewer = p.updated_at && (!local.local_updated_at || p.updated_at > local.local_updated_at);
        if (cloudNewer) {
          db.run('UPDATE products SET source_url = ?, title = ?, main_images = ?, desc_images = ?, detail_images = ?, attrs = ?, skus = ?, category = ?, custom_category = ?, dxm_category = ?, manual_category = ?, status = ?, deleted = ?, store_name = ?, variant_attr_name = ?, product_no = ?, variant_attr_name2 = ?, variant_attr_name3 = ?, variant_attr_images = ?, original_images = ?, owner = ?, claim_at = ?, created_at = COALESCE(created_at, ?), updated_at = ?, automation_stage = ?, automation_log = ?, automation_issues = ?, automation_started_at = ?, automation_finished_at = ? WHERE id = ?',
            [p.source_url || '', p.title, p.main_images, p.desc_images, p.detail_images, p.attrs, p.skus, p.category, p.custom_category, p.dxm_category, p.manual_category, p.status, p.deleted || 0, p.store_name || '', p.variant_attr_name || '', p.product_no || '', p.variant_attr_name2 || '', p.variant_attr_name3 || '', p.variant_attr_images || '', p.original_images || '', p.owner || '', p.claim_at || '', p.created_at, p.updated_at, p.automation_stage || 'none', p.automation_log || '', p.automation_issues || '', p.automation_started_at || null, p.automation_finished_at || null, local.id]);
          updated++;
        } else if (!local.local_created_at && p.created_at) {
          db.run('UPDATE products SET created_at = ? WHERE id = ?', [p.created_at, local.id]);
        }
        if (isDeleted && !local.local_deleted) {
          db.run('UPDATE products SET deleted = 1 WHERE id = ?', [local.id]);
          deletedSynced++;
        }
        skipped++;
      }
    }
    // 物理清理：本地 deleted=1 且云端不存在 → 安全删除
    var cloudUids = {};
    for (var ci = 0; ci < cloudProducts.length; ci++) {
      if (cloudProducts[ci].uid) cloudUids[cloudProducts[ci].uid] = true;
    }
    var localDeleted = db.getAll("SELECT id, uid FROM products WHERE deleted = 1 AND uid IS NOT NULL AND uid != ''");
    var purged = 0;
    for (var pi = 0; pi < localDeleted.length; pi++) {
      if (!cloudUids[localDeleted[pi].uid]) {
        db.run('DELETE FROM products WHERE id = ?', [localDeleted[pi].id]);
        purged++;
      }
    }
    if (purged) db.scheduleSave();

    console.log('[云同步] 商品下载完成, 云端:', cloudProducts.length, '新增:', added, '更新:', updated, '跳过:', skipped, '删除同步:', deletedSynced, '物理清理:', purged);
    return { ok: true, cloudTotal: cloudProducts.length, added: added, updated: updated, skipped: skipped, deletedSynced: deletedSynced, purged: purged };
  }

  function saveProductToLocalAndCloud(uid, sourceUrl, title, category, customCategory, dxmCategory, manualCategory, createdAt, mainImages, descImages, detailImages, attrs, skus, owner) {
    if (!cloud.connected || !uid) return;
    var updatedAt = new Date(Date.now() + 8 * 3600000).toISOString().replace('T', ' ').substring(0, 19);
    var cols = ['source_url', 'title', 'main_images', 'desc_images', 'detail_images', 'attrs', 'skus', 'category', 'custom_category', 'dxm_category', 'manual_category', 'status', 'deleted', 'owner', 'claim_at', 'automation_stage', 'automation_log', 'automation_issues', 'automation_started_at', 'automation_finished_at'];
    var sets = cols.map(function (c) { return c + ' = CASE WHEN excluded.updated_at > products.updated_at THEN excluded.' + c + ' ELSE products.' + c + ' END'; });
    sets.push('created_at = COALESCE(products.created_at, excluded.created_at)');
    sets.push('updated_at = CASE WHEN excluded.updated_at > products.updated_at THEN excluded.updated_at ELSE products.updated_at END');
    var sql = 'INSERT INTO products (uid, source_url, title, main_images, desc_images, detail_images, attrs, skus, category, custom_category, dxm_category, manual_category, status, deleted, owner, claim_at, created_at, updated_at, automation_stage, automation_log, automation_issues, automation_started_at, automation_finished_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, \'\', ?, ?, \'\', \'\', \'\', NULL, NULL) ON CONFLICT(uid) DO UPDATE SET ' + sets.join(', ');
    cloud.run(sql,
      [uid, sourceUrl || '', title || '', mainImages || '', descImages || '', detailImages || '', attrs || '', skus || '', category || '', customCategory || '', dxmCategory || '', manualCategory || '', 0, owner || '', createdAt || '', updatedAt]
    ).catch(function () {});
  }

  // ===== 单表同步 =====
  var SINGLE_TABLE_DEFS = {
    mappings: {
      localGet: function () { return db.getAll('SELECT category_name, custom_category, count, source, deleted, created_at, updated_at FROM category_mappings'); },
      cloudCols: 'category_name, custom_category, count, source, deleted, created_at, updated_at',
      cloudKey: ['category_name', 'custom_category'],
      localKeyMatch: function (r) { return 'SELECT id, count, deleted, updated_at FROM category_mappings WHERE category_name = ? AND custom_category = ?'; },
      localKeyParams: function (r) { return [r.category_name, r.custom_category]; },
      localInsert: `INSERT INTO category_mappings (category_name, custom_category, count, source, deleted, created_at, updated_at) VALUES (?, ?, ?, ?, ?, datetime('now', '+8 hours'), ?)`,
      localInsertParams: function (r) { return [r.category_name, r.custom_category, r.count, r.source, r.deleted || 0, r.updated_at || '']; },
      localUpdate: `UPDATE category_mappings SET count = ?, source = ?, deleted = ?, updated_at = ? WHERE id = ?`,
      cloudTable: 'category_mappings',
      cloudInsert: `INSERT INTO category_mappings (category_name, custom_category, count, source, deleted, created_at, updated_at) VALUES (?, ?, ?, ?, ?, datetime('now', '+8 hours'), ?)`,
      cloudInsertParams: function (r) { return [r.category_name, r.custom_category, r.count, r.source, r.deleted || 0, r.updated_at || '']; },
      cloudUpdate: `UPDATE category_mappings SET count = ?, source = ?, deleted = ?, updated_at = ? WHERE id = ?`,
      label: '类目映射'
    },
    'keyword-rels': {
      localGet: function () { return db.getAll('SELECT keyword, category_name, weight, match_count, valid, source, created_at, updated_at FROM keyword_category_rel'); },
      cloudCols: 'keyword, category_name, weight, match_count, valid, source, created_at, updated_at',
      cloudKey: ['keyword', 'category_name'],
      localKeyMatch: function (r) { return 'SELECT id, weight, match_count FROM keyword_category_rel WHERE keyword = ? AND category_name = ?'; },
      localKeyParams: function (r) { return [r.keyword, r.category_name]; },
      localInsert: `INSERT INTO keyword_category_rel (keyword, category_name, weight, match_count, valid, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now', '+8 hours'), datetime('now', '+8 hours'))`,
      localInsertParams: function (r) { return [r.keyword, r.category_name, r.weight, r.match_count, r.valid, r.source]; },
      localUpdate: `UPDATE keyword_category_rel SET weight = MAX(weight, ?), match_count = MAX(match_count, ?), valid = ?, source = ?, updated_at = datetime('now', '+8 hours') WHERE id = ?`,
      cloudTable: 'keyword_category_rel',
      cloudInsert: `INSERT INTO keyword_category_rel (keyword, category_name, weight, match_count, valid, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now', '+8 hours'), datetime('now', '+8 hours'))`,
      cloudInsertParams: function (r) { return [r.keyword, r.category_name, r.weight, r.match_count, r.valid, r.source]; },
      cloudUpdate: `UPDATE keyword_category_rel SET weight = ?, match_count = ?, valid = ?, source = ?, updated_at = datetime('now', '+8 hours') WHERE id = ?`,
      label: '关键词关联'
    },
    synonyms: {
      localGet: function () { return db.getAll('SELECT word_a, word_b, created_at, updated_at FROM keyword_synonyms'); },
      cloudCols: 'word_a, word_b, created_at, updated_at',
      cloudKey: ['word_a', 'word_b'],
      localKeyMatch: function (r) { return 'SELECT id FROM keyword_synonyms WHERE word_a = ? AND word_b = ?'; },
      localKeyParams: function (r) { return [r.word_a, r.word_b]; },
      localInsert: `INSERT OR IGNORE INTO keyword_synonyms (word_a, word_b, created_at, updated_at) VALUES (?, ?, datetime('now', '+8 hours'), datetime('now', '+8 hours'))`,
      localInsertParams: function (r) { return [r.word_a, r.word_b]; },
      localUpdate: null,
      cloudTable: 'keyword_synonyms',
      cloudInsert: `INSERT OR IGNORE INTO keyword_synonyms (word_a, word_b, created_at, updated_at) VALUES (?, ?, datetime('now', '+8 hours'), datetime('now', '+8 hours'))`,
      cloudInsertParams: function (r) { return [r.word_a, r.word_b]; },
      cloudUpdate: null,
      label: '同义词'
    },
    blacklist: {
      localGet: function () { return db.getAll('SELECT keyword, category_name, reason, count, created_at, updated_at FROM keyword_blacklist'); },
      cloudCols: 'keyword, category_name, reason, count, created_at, updated_at',
      cloudKey: ['keyword', 'category_name'],
      localKeyMatch: function (r) { return 'SELECT id, count FROM keyword_blacklist WHERE keyword = ? AND category_name = ?'; },
      localKeyParams: function (r) { return [r.keyword, r.category_name]; },
      localInsert: `INSERT OR IGNORE INTO keyword_blacklist (keyword, category_name, reason, count, created_at, updated_at) VALUES (?, ?, ?, ?, datetime('now', '+8 hours'), datetime('now', '+8 hours'))`,
      localInsertParams: function (r) { return [r.keyword, r.category_name, r.reason, r.count || 1]; },
      localUpdate: `UPDATE keyword_blacklist SET count = MAX(count, ?), updated_at = datetime('now', '+8 hours') WHERE id = ?`,
      localUpdateParams: function (r, localRow) { return [r.count || 1, localRow.id]; },
      cloudTable: 'keyword_blacklist',
      cloudInsert: `INSERT OR IGNORE INTO keyword_blacklist (keyword, category_name, reason, count, created_at, updated_at) VALUES (?, ?, ?, ?, datetime('now', '+8 hours'), datetime('now', '+8 hours'))`,
      cloudInsertParams: function (r) { return [r.keyword, r.category_name, r.reason, r.count || 1]; },
      cloudUpdate: `UPDATE keyword_blacklist SET count = ?, updated_at = datetime('now', '+8 hours') WHERE id = ?`,
      cloudUpdateParams: function (r, cloudRow) { return [r.count || 1, cloudRow.id]; },
      label: '黑名单'
    },
    'category-config': {
      localGet: function () { return db.getAll('SELECT type, value, group_name, description, sort_order, deleted, created_at, updated_at FROM category_config'); },
      cloudCols: 'type, value, group_name, description, sort_order, deleted, created_at, updated_at',
      cloudKey: ['type', 'value', 'group_name'],
      localKeyMatch: function (r) { return 'SELECT id FROM category_config WHERE type = ? AND value = ? AND group_name = ?'; },
      localKeyParams: function (r) { return [r.type, r.value, r.group_name]; },
      localInsert: `INSERT OR REPLACE INTO category_config (type, value, group_name, description, sort_order, deleted, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now', '+8 hours'), datetime('now', '+8 hours'))`,
      localInsertParams: function (r) { return [r.type, r.value, r.group_name, r.description, r.sort_order, r.deleted || 0]; },
      localUpdate: null,
      cloudTable: 'category_config',
      cloudInsert: `INSERT OR REPLACE INTO category_config (type, value, group_name, description, sort_order, deleted, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now', '+8 hours'), datetime('now', '+8 hours'))`,
      cloudInsertParams: function (r) { return [r.type, r.value, r.group_name, r.description, r.sort_order, r.deleted || 0]; },
      cloudUpdate: null,
      label: '分类配置'
    },
    users: {
      localGet: function () { return db.getAll('SELECT username, password_hash, password_salt, display_name, role, last_login, must_change_password, disabled, created_at, updated_at FROM users'); },
      cloudCols: 'username, password_hash, password_salt, display_name, role, last_login, must_change_password, disabled, created_at, updated_at',
      cloudKey: ['username'],
      localKeyMatch: function (r) { return 'SELECT id, updated_at FROM users WHERE username = ?'; },
      localKeyParams: function (r) { return [r.username]; },
      localInsert: `INSERT OR IGNORE INTO users (username, password_hash, password_salt, display_name, role, last_login, must_change_password, disabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+8 hours'), ?)`,
      localInsertParams: function (r) { return [r.username, r.password_hash, r.password_salt, r.display_name, r.role, r.last_login, r.must_change_password, r.disabled || 0, r.updated_at || '']; },
      localUpdate: `UPDATE users SET password_hash = ?, password_salt = ?, display_name = ?, role = ?, last_login = ?, must_change_password = ?, disabled = ?, updated_at = ? WHERE id = ?`,
      localUpdateParams: function (r, localRow) { return [r.password_hash, r.password_salt, r.display_name, r.role, r.last_login, r.must_change_password || 0, r.disabled || 0, r.updated_at || '', localRow.id]; },
      cloudTable: 'users',
      cloudInsert: `INSERT OR IGNORE INTO users (username, password_hash, password_salt, display_name, role, last_login, must_change_password, disabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+8 hours'), ?)`,
      cloudInsertParams: function (r) { return [r.username, r.password_hash, r.password_salt, r.display_name, r.role, r.last_login, r.must_change_password, r.disabled || 0, r.updated_at || '']; },
      cloudUpdate: `UPDATE users SET password_hash = ?, password_salt = ?, display_name = ?, role = ?, last_login = ?, must_change_password = ?, disabled = ?, updated_at = ? WHERE id = ?`,
      cloudUpdateParams: function (r, cloudRow) { return [r.password_hash, r.password_salt, r.display_name, r.role, r.last_login, r.must_change_password || 0, r.disabled || 0, r.updated_at || '', cloudRow.id]; },
      label: '用户'
    }
  };

  async function pushTable(tableKey, options) {
    if (!cloud.connected) return { ok: false, error: '未连接' };
    var def = SINGLE_TABLE_DEFS[tableKey];
    if (!def) return { ok: false, error: '未知表: ' + tableKey };

    var rows = def.localGet();
    // Filter by updated_at if since provided and table has updated_at
    if (options && options.since) {
      rows = rows.filter(function (r) {
        return r.updated_at && r.updated_at >= options.since;
      });
    }
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
        var cloudRow = await cloud.getOne('SELECT updated_at FROM category_mappings WHERE id = ?', [cloudExisting.id]);
        var localNewer = r.updated_at && (!cloudRow.updated_at || r.updated_at > cloudRow.updated_at);
        if (localNewer) {
          await cloud.run(def.cloudUpdate, [r.count, r.source, r.deleted || 0, r.updated_at, cloudExisting.id]);
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
      } else if (tableKey === 'users') {
        var cloudRowU = await cloud.getOne('SELECT updated_at FROM ' + def.cloudTable + ' WHERE id = ?', [cloudExisting.id]);
        var localNewerU = r.updated_at && (!cloudRowU.updated_at || r.updated_at > cloudRowU.updated_at);
        if (localNewerU) {
          await cloud.run(def.cloudUpdate, def.cloudUpdateParams(r, cloudExisting));
          pushed++;
        } else { skipped++; }
      } else {
        skipped++;
      }
    }
    console.log('[云同步] ' + def.label + '推送完成: 推送', pushed, '跳过', skipped);
    return { ok: true, table: def.label, pushed: pushed, skipped: skipped };
  }

  async function pullTable(tableKey, options) {
    if (!cloud.connected) return { ok: false, error: '未连接' };
    var def = SINGLE_TABLE_DEFS[tableKey];
    if (!def) return { ok: false, error: '未知表: ' + tableKey };

    var where = '';
    var params = [];
    if (options && options.since && def.cloudCols.indexOf('updated_at') >= 0) {
      where = ' WHERE updated_at >= ?';
      params = [options.since];
    }
    var cloudRows = await cloud.getAll('SELECT ' + def.cloudCols + ' FROM ' + def.cloudTable + where, params);
    var added = 0;
    var updated = 0;
    for (var i = 0; i < cloudRows.length; i++) {
      var r = cloudRows[i];
      var local = db.getOne(def.localKeyMatch(r), def.localKeyParams(r));
      if (!local) {
        db.run(def.localInsert, def.localInsertParams(r));
        added++;
      } else if (tableKey === 'mappings') {
        var cloudNewer = r.updated_at && (!local.updated_at || r.updated_at > local.updated_at);
        if (cloudNewer) {
          db.run(def.localUpdate, [r.count, r.source, r.deleted || 0, r.updated_at, local.id]);
          updated++;
        }
      } else if (tableKey === 'keyword-rels') {
        var maxW = Math.max(local.weight || 1.0, r.weight || 1.0);
        var maxM = Math.max(local.match_count || 1, r.match_count || 1);
        if (maxW > local.weight || maxM > local.match_count) {
          db.run('UPDATE keyword_category_rel SET weight = ?, match_count = ? WHERE id = ?', [maxW, maxM, local.id]);
          updated++;
        }
      } else if (tableKey === 'users') {
        var cloudNewerU = r.updated_at && (!local.updated_at || r.updated_at > local.updated_at);
        if (cloudNewerU) {
          db.run(def.localUpdate, def.localUpdateParams(r, local));
          updated++;
        }
      }
    }
    // 清理：本地有但云端没有的记录
    var purged = 0;
    if (def.cloudKey && def.cloudKey.length) {
      var cloudKeys = {};
      for (var ki = 0; ki < cloudRows.length; ki++) {
        var keyVals = def.cloudKey.map(function (k) { return cloudRows[ki][k]; });
        cloudKeys[keyVals.join('\x00')] = true;
      }
      var localAll = def.localGet();
      for (var li = 0; li < localAll.length; li++) {
        var localKeyVals = def.cloudKey.map(function (k) { return localAll[li][k]; });
        var localKey = localKeyVals.join('\x00');
        if (!cloudKeys[localKey]) {
          var delWhere = def.cloudKey.map(function (k) { return k + ' = ?'; }).join(' AND ');
          if (tableKey === 'mappings') {
            // 映射表用逻辑删除，不物理删除
            db.run('UPDATE category_mappings SET deleted = 1 WHERE ' + delWhere, localKeyVals);
          } else if (tableKey === 'users') {
            // 用户表用 disabled 软删除，防止误删导致登录锁死
            db.run('UPDATE users SET disabled = 1 WHERE ' + delWhere, localKeyVals);
          } else {
            db.run('DELETE FROM ' + def.cloudTable + ' WHERE ' + delWhere, localKeyVals);
          }
          purged++;
        }
      }
    }
    if (purged) db.scheduleSave();

    console.log('[云同步] ' + def.label + '拉取完成: 新增', added, '更新', updated, '清理', purged);
    return { ok: true, table: def.label, cloudTotal: cloudRows.length, added: added, updated: updated, purged: purged };
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
