(function () {
  var page = 1;
  var pageSize = 20;
  var total = 0;
  var selectedIds = new Set();
  var currentDetail = null;

  var $ = function (sel) { return document.querySelector(sel); };
  var $$ = function (sel) { return document.querySelectorAll(sel); };

  // Init
  loadList();

  // Events
  $('#searchBtn').addEventListener('click', function () {
    page = 1;
    loadList();
  });

  $('#keyword').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      page = 1;
      loadList();
    }
  });

  $('#statusFilter').addEventListener('change', function () {
    page = 1;
    loadList();
  });

  $('#selectAll').addEventListener('change', function () {
    var checked = this.checked;
    selectedIds.clear();
    if (checked) {
      $$('.row-checkbox').forEach(function (cb) {
        cb.checked = true;
        selectedIds.add(Number(cb.dataset.id));
      });
    } else {
      $$('.row-checkbox').forEach(function (cb) { cb.checked = false; });
    }
    updateBatchBtn();
  });

  $('#batchDeleteBtn').addEventListener('click', function () {
    if (selectedIds.size === 0) return;
    if (!confirm('确认删除 ' + selectedIds.size + ' 条商品？')) return;
    fetch('/api/product/batch-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: Array.from(selectedIds) })
    }).then(function () {
      selectedIds.clear();
      loadList();
    });
  });

  $('#prevBtn').addEventListener('click', function () {
    if (page > 1) { page--; loadList(); }
  });

  $('#nextBtn').addEventListener('click', function () {
    var totalPages = Math.ceil(total / pageSize);
    if (page < totalPages) { page++; loadList(); }
  });

  // Modal events
  $('#modalClose').addEventListener('click', closeModal);
  $('#modalCloseBtn').addEventListener('click', closeModal);
  $('#detailModal').addEventListener('click', function (e) {
    if (e.target === this) closeModal();
  });

  $('#copyUrlBtn').addEventListener('click', function () {
    if (!currentDetail) return;
    var url = location.origin + '/api/product/' + currentDetail.id;
    navigator.clipboard.writeText(url).then(function () {
      alert('已复制: ' + url);
    });
  });

  $('#toggleStatusBtn').addEventListener('click', function () {
    if (!currentDetail) return;
    var newStatus = currentDetail.status === 0 ? 1 : 0;
    fetch('/api/product/' + currentDetail.id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    }).then(function (r) { return r.json(); }).then(function () {
      currentDetail.status = newStatus;
      updateStatusBtn();
      loadList();
    });
  });

  // Load list
  function loadList() {
    var keyword = $('#keyword').value.trim();
    var status = $('#statusFilter').value;
    var params = new URLSearchParams({ page: page, pageSize: pageSize });
    if (keyword) params.set('keyword', keyword);
    if (status !== 'all') params.set('status', status);

    fetch('/api/product?' + params.toString())
      .then(function (r) { return r.json(); })
      .then(function (data) {
        total = data.total;
        renderTable(data.list);
        renderPagination();
        $('#selectAll').checked = false;
        updateBatchBtn();
      });
  }

  function renderTable(list) {
    var tbody = $('#tableBody');
    if (!list.length) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="8">暂无数据</td></tr>';
      return;
    }
    tbody.innerHTML = list.map(function (item) {
      var statusClass = item.status === 1 ? 'status-used' : 'status-unused';
      var statusText = item.status === 1 ? '已用' : '未用';
      var attrsText = item.attrs.length ? item.attrs.length + '个' : '-';
      return '<tr>' +
        '<td class="col-check"><input type="checkbox" class="row-checkbox" data-id="' + item.id + '" /></td>' +
        '<td>' + item.id + '</td>' +
        '<td class="col-title"><span class="title-text">' + esc(item.title || '-') + '</span></td>' +
        '<td>' + attrsText + '</td>' +
        '<td style="text-align:center">' + item.skuCount + '</td>' +
        '<td style="text-align:center"><span class="status-tag ' + statusClass + '">' + statusText + '</span></td>' +
        '<td>' + (item.created_at || '-') + '</td>' +
        '<td>' +
          '<button class="action-btn view" data-id="' + item.id + '">查看</button>' +
          '<button class="action-btn delete" data-id="' + item.id + '">删除</button>' +
        '</td>' +
        '</tr>';
    }).join('');

    // Bind row events
    $$('.row-checkbox').forEach(function (cb) {
      cb.addEventListener('change', function () {
        if (this.checked) {
          selectedIds.add(Number(this.dataset.id));
        } else {
          selectedIds.delete(Number(this.dataset.id));
        }
        updateBatchBtn();
      });
    });

    $$('.action-btn.view').forEach(function (btn) {
      btn.addEventListener('click', function () {
        openDetail(Number(this.dataset.id));
      });
    });

    $$('.action-btn.delete').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = Number(this.dataset.id);
        if (!confirm('确认删除此商品？')) return;
        fetch('/api/product/' + id, { method: 'DELETE' }).then(function () {
          selectedIds.delete(id);
          loadList();
        });
      });
    });
  }

  function renderPagination() {
    var totalPages = Math.ceil(total / pageSize) || 1;
    $('#pageInfo').textContent = '第 ' + page + '/' + totalPages + ' 页  共 ' + total + ' 条';
    $('#prevBtn').disabled = page <= 1;
    $('#nextBtn').disabled = page >= totalPages;
  }

  function updateBatchBtn() {
    $('#batchDeleteBtn').disabled = selectedIds.size === 0;
    if (selectedIds.size > 0) {
      $('#batchDeleteBtn').textContent = '批量删除 (' + selectedIds.size + ')';
    } else {
      $('#batchDeleteBtn').textContent = '批量删除';
    }
  }

  // Detail modal
  function openDetail(id) {
    fetch('/api/product/' + id)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        currentDetail = data;
        $('#modalTitle').textContent = data.title || '商品 #' + data.id;
        renderDetail(data);
        updateStatusBtn();
        $('#detailModal').classList.add('active');
      });
  }

  function closeModal() {
    $('#detailModal').classList.remove('active');
    currentDetail = null;
  }

  function updateStatusBtn() {
    if (!currentDetail) return;
    var btn = $('#toggleStatusBtn');
    if (currentDetail.status === 0) {
      btn.textContent = '标记已用';
      btn.className = 'btn-primary';
    } else {
      btn.textContent = '标记未用';
      btn.className = '';
    }
  }

  function renderDetail(data) {
    var html = '';

    // Basic info
    html += '<div class="detail-section"><h3>基本信息</h3>';
    html += '<div class="info-row"><span class="info-label">ID</span><span class="info-value">' + data.id + '</span></div>';
    html += '<div class="info-row"><span class="info-label">来源</span><span class="info-value">' + esc(data.source_url || '-') + '</span></div>';
    html += '<div class="info-row"><span class="info-label">标题</span><span class="info-value">' + esc(data.title || '-') + '</span></div>';
    html += '</div>';

    // Main images
    if (data.main_images.length) {
      html += '<div class="detail-section"><h3>主图 (' + data.main_images.length + ')</h3><div class="img-grid">';
      data.main_images.forEach(function (url) {
        html += '<img src="' + esc(url) + '" loading="lazy" />';
      });
      html += '</div></div>';
    }

    // Desc images
    if (data.desc_images.length) {
      html += '<div class="detail-section"><h3>描述图 (' + data.desc_images.length + ')</h3><div class="img-grid">';
      data.desc_images.forEach(function (url) {
        html += '<img src="' + esc(url) + '" loading="lazy" />';
      });
      html += '</div></div>';
    }

    // Attributes
    if (data.attrs.length) {
      html += '<div class="detail-section"><h3>属性</h3><div class="attr-tags">';
      data.attrs.forEach(function (a) {
        html += '<span class="attr-tag">' + esc(a) + '</span>';
      });
      html += '</div></div>';
    }

    // SKU table
    if (data.skus.length) {
      html += '<div class="detail-section"><h3>SKU (' + data.skus.length + ')</h3>';
      html += '<table class="sku-table"><thead><tr><th>预览图</th><th>SKU</th><th>价格</th><th>尺寸(长宽高)</th><th>重量</th></tr></thead><tbody>';
      data.skus.forEach(function (sku) {
        var dim = sku.dimensions ? sku.dimensions.join(' x ') : '-';
        html += '<tr>';
        html += '<td>' + (sku.image ? '<img src="' + esc(sku.image) + '" loading="lazy" />' : '-') + '</td>';
        html += '<td>' + esc(sku.sku || '-') + '</td>';
        html += '<td>' + esc(sku.price || '-') + '</td>';
        html += '<td>' + dim + '</td>';
        html += '<td>' + esc(sku.weight != null ? sku.weight : '-') + '</td>';
        html += '</tr>';
      });
      html += '</tbody></table></div>';
    }

    $('#modalBody').innerHTML = html;
  }

  function esc(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
})();
