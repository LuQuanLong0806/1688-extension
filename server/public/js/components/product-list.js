// 商品列表页面组件
Vue.component('page-products', {
  data: function () {
    return {
      loading: false,
      list: [],
      total: 0,
      page: 1,
      pageSize: 20,
      keyword: '',
      statusFilter: 'all',
      categoryFilter: '',
      categoryList: [],
      dxmCategoryFilter: '',
      dxmCategoryList: [],
      selectedIds: [],
      quoteProductId: localStorage.getItem('dxm_quote_product_id') || '',
      editingCatId: -1,
      dxmCatOptions: [],
      batchCatVisible: false,
      batchCatValue: '',
      columns: [],
      _pollTimer: null
    };
  },
  created: function () {
    var vm = this;
    this.columns = [
      { type: 'selection', width: 40, align: 'center' },
      {
        title: '预览',
        width: 80,
        align: 'center',
        ellipsis: false,
        className: 'col-thumb',
        render: function (h, params) {
          var skus = JSON.parse(params.row.skus || '[]');
          var img = skus.length && skus[0].image ? skus[0].image : null;
          if (!img) return h('div', { class: 'cell-thumb-ph' });
          return h('img', {
            attrs: { src: img, loading: 'lazy' },
            class: 'cell-thumb',
            on: {
              mouseenter: function (e) {
                vm.$root.$refs.thumbPreview.open(img, e);
              },
              mousemove: function (e) {
                vm.$root.$refs.thumbPreview.move(e);
              },
              mouseleave: function () {
                vm.$root.$refs.thumbPreview.close();
              }
            }
          });
        }
      },
      {
        title: '标题',
        key: 'title',
        width: 220,
        ellipsis: false,
        tooltip: false,
        render: function (h, params) {
          return h(
            'span',
            { style: { wordBreak: 'break-all', lineHeight: '1.4' } },
            params.row.title || '-'
          );
        }
      },
      {
        title: '类目',
        width: 280,
        render: function (h, params) {
          var idx = params.index;
          var row = vm.list[idx];
          var cat = row.category;
          var name =
            row.customCategory ||
            (cat && (cat.leafCategoryName || cat.categoryPath)) ||
            '';
          var isEditing = vm.editingCatId === row.id;

          if (!isEditing) {
            // 显示模式：文字 + 修改icon + 复制icon
            return h('span', { class: 'cell-category-wrap' }, [
              h(
                'span',
                { style: { fontSize: '13px', marginRight: '6px' } },
                name || '-'
              ),
              h('Icon', {
                props: { type: 'md-create', size: 16 },
                style: { color: '#bbb', cursor: 'pointer', marginRight: '4px' },
                attrs: { title: '修改类目' },
                nativeOn: {
                  mouseenter: function (e) {
                    e.target.style.color = '#1890ff';
                  },
                  mouseleave: function (e) {
                    e.target.style.color = '#bbb';
                  },
                  click: function (e) {
                    e.stopPropagation();
                    if (!vm.list[idx].customCategory) {
                      vm.list[idx].customCategory = name;
                    }
                    vm.$set(vm, 'editingCatId', row.id);
                  }
                }
              }),
              h('Icon', {
                props: { type: 'md-copy', size: 16 },
                style: { color: '#bbb', cursor: 'pointer' },
                attrs: { title: '复制类目' },
                nativeOn: {
                  mouseenter: function (e) {
                    e.target.style.color = '#1890ff';
                  },
                  mouseleave: function (e) {
                    e.target.style.color = '#bbb';
                  },
                  click: function (e) {
                    e.stopPropagation();
                    if (!name) return;
                    navigator.clipboard.writeText(name).then(function () {
                      vm.$Message.success('已复制: ' + name);
                    });
                  }
                }
              })
            ]);
          }

          // 编辑模式：可搜索下拉，选中自动保存
          return h('span', { class: 'cell-category-wrap' }, [
            h(
              'i-select',
              {
                props: {
                  value: name,
                  filterable: true,
                  clearable: true,
                  placeholder: '搜索店小秘类目',
                  'not-found-text': '无匹配'
                },
                style: { width: '100%' },
                on: {
                  'on-change': function (val) {
                    if (val === undefined || val === '') return;
                    vm.list[idx].customCategory = val;
                    fetch('/api/product/' + row.id, {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ customCategory: val })
                    }).then(function () {
                      vm.$Message.success('类目已保存');
                      vm.editingCatId = -1;
                      vm.loadList();
                    });
                  },
                  'on-open-change': function (open) {
                    if (!open && vm.editingCatId === row.id) {
                      vm.editingCatId = -1;
                    }
                  }
                }
              },
              vm.dxmCatOptions.map(function (c) {
                return h('i-option', { props: { value: c.path } }, c.path);
              })
            )
          ]);
        }
      },
      {
        title: '推荐店小秘类目',
        minWidth: 240,
        render: function (h, params) {
          var recs = params.row.recommendedDxm;
          if (
            !recs ||
            ((!recs.mapped || !recs.mapped.length) &&
              (!recs.matched || !recs.matched.length))
          ) {
            return h('span', { style: { color: '#ccc' } }, '-');
          }
          var items = [];
          // 映射的排在前面
          if (recs.mapped && recs.mapped.length) {
            recs.mapped.forEach(function (c) {
              items.push({
                path: c.path,
                leafName: c.leafName,
                isMapped: true,
                score: null
              });
            });
          }
          if (recs.matched && recs.matched.length) {
            recs.matched.forEach(function (c) {
              // 去重
              for (var i = 0; i < items.length; i++) {
                if (items[i].path === c.path) return;
              }
              items.push({
                path: c.path,
                leafName: c.leafName,
                isMapped: false,
                score: c.score
              });
            });
          }
          if (!items.length)
            return h('span', { style: { color: '#ccc' } }, '-');

          return h(
            'div',
            { style: { lineHeight: '1.6' } },
            items.map(function (c) {
              return h(
                'div',
                {
                  style: {
                    marginBottom: '2px'
                  }
                },
                [
                  h(
                    'Tooltip',
                    {
                      props: {
                        content: c.path,
                        placement: 'top',
                        transfer: true,
                        maxWidth: 400
                      }
                    },
                    [
                      h(
                        'span',
                        {
                          style: {
                            fontSize: '14px',
                            color: c.isMapped ? '#52c41a' : (c.score >= 50 ? '#ff6a00' : '#999'),
                            cursor: 'pointer',
                            wordBreak: 'break-all'
                          }
                        },
                        c.leafName
                      ),
                      h(
                        'span',
                        {
                          style: {
                            fontSize: '13px',
                            color: c.isMapped ? '#52c41a' : (c.score >= 50 ? '#ff6a00' : '#999'),
                            marginLeft: '4px'
                          }
                        },
                        c.isMapped ? '100%' : (c.score !== null ? Math.round(c.score) + '%' : '')
                      )
                    ]
                  ),
                  h('Icon', {
                    props: { type: 'md-checkmark-circle-outline', size: 18 },
                    style: {
                      color: '#bbb',
                      cursor: 'pointer',
                      verticalAlign: 'middle',
                      marginLeft: '6px',
                      position: 'relative',
                      top: '-1px'
                    },
                    attrs: { title: '设为自定义类目' },
                    nativeOn: {
                      mouseenter: function (e) {
                        e.target.style.color = '#1890ff';
                      },
                      mouseleave: function (e) {
                        e.target.style.color = '#bbb';
                      },
                      click: function (e) {
                        e.stopPropagation();
                        fetch('/api/product/' + params.row.id, {
                          method: 'PUT',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ customCategory: c.path })
                        }).then(function () {
                          vm.$Message.success('已设为: ' + c.leafName);
                          vm.loadList();
                        });
                      }
                    }
                  })
                ]
              );
            })
          );
        }
      },
      {
        title: '来源地址',
        width: 120,
        render: function (h, params) {
          var url = params.row.source_url;
          if (!url) return h('span', { style: { color: '#ccc' } }, '-');
          var short = url.length > 35 ? url.substring(0, 35) + '...' : url;
          return h(
            'a',
            {
              attrs: { href: url, target: '_blank', title: url },
              style: {
                fontSize: '12px',
                color: '#ff6a00',
                wordBreak: 'break-all',
                lineHeight: '1.4',
                display: '-webkit-box',
                WebkitLineClamp: '2',
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden'
              }
            },
            short
          );
        }
      },
      {
        title: 'SKU',
        width: 200,
        render: function (h, params) {
          var skus = JSON.parse(params.row.skus || '[]');
          if (!skus.length) return h('span', { style: { color: '#ccc' } }, '-');
          var names = skus
            .map(function (s) {
              return s.name || s.sku || '';
            })
            .filter(Boolean);
          if (!names.length)
            names = skus.map(function (s, i) {
              return 'SKU' + (i + 1);
            });
          var text = names.join('、');
          return h(
            'span',
            {
              style: {
                fontSize: '12px',
                lineHeight: '1.4',
                display: '-webkit-box',
                WebkitLineClamp: '2',
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                wordBreak: 'break-all'
              }
            },
            text
          );
        }
      },
      {
        title: '使用状态',
        width: 100,
        align: 'center',
        render: function (h, params) {
          var used = params.row.status === 1;
          return h(
            'span',
            {
              class: used
                ? 'status-tag status-used'
                : 'status-tag status-unused'
            },
            used ? '已使用' : '未使用'
          );
        }
      },
      { title: '采集时间', key: 'created_at', width: 200 },
      {
        title: '操作',
        width: 180,
        align: 'center',
        className: 'col-actions',
        fixed: 'right',
        render: function (h, params) {
          var row = params.row;
          return h('div', { class: 'action-btns' }, [
            h(
              'Tooltip',
              {
                props: {
                  content: '查看/编辑',
                  placement: 'top',
                  transfer: true
                }
              },
              [
                h('Button', {
                  props: { type: 'primary', size: 'small', icon: 'ios-eye' },
                  style: { minWidth: '36px' },
                  on: {
                    click: function () {
                      vm.$root.openDetail(row.id);
                    }
                  }
                })
              ]
            ),
            h(
              'Tooltip',
              {
                props: { content: '引用打开', placement: 'top', transfer: true }
              },
              [
                h('Button', {
                  props: { size: 'small', icon: 'ios-link' },
                  style: { minWidth: '36px' },
                  on: {
                    click: function () {
                      vm.openQuoteEdit(row.id);
                    }
                  }
                })
              ]
            ),
            h(
              'Tooltip',
              { props: { content: '删除', placement: 'top', transfer: true } },
              [
                h('Button', {
                  props: { type: 'error', size: 'small', icon: 'ios-trash' },
                  style: { minWidth: '36px' },
                  on: {
                    click: function () {
                      vm.deleteProduct(row.id);
                    }
                  }
                })
              ]
            )
          ]);
        }
      }
    ];
  },
  mounted: function () {
    this.loadList(1);
    this.loadCategories();
    this.loadDxmCategories();
    this.loadDxmCatOptions();
    this.startPoll();
  },
  beforeDestroy: function () {
    if (this._pollTimer) this._pollTimer.close();
  },
  methods: {
    startPoll: function () {
      var vm = this;
      var es = new EventSource('/api/events');
      es.addEventListener('product-added', function () {
        vm.loadList(vm.page);
        vm.$root.loadStats();
        vm.$Message.info('新采集数据已同步');
      });
      vm._pollTimer = es;
    },
    loadCategories: function () {
      var vm = this;
      fetch('/api/product/categories')
        .then(function (r) {
          return r.json();
        })
        .then(function (list) {
          vm.categoryList = list;
        });
    },
    loadDxmCategories: function () {
      var vm = this;
      fetch('/api/product/dxm-categories')
        .then(function (r) {
          return r.json();
        })
        .then(function (list) {
          vm.dxmCategoryList = list;
        });
    },
    loadDxmCatOptions: function () {
      var vm = this;
      fetch('/api/dxm-category/library')
        .then(function (r) {
          return r.json();
        })
        .then(function (list) {
          vm.dxmCatOptions = list;
        });
    },
    loadList: function (p) {
      var vm = this;
      if (p) vm.page = p;
      vm.loading = true;
      var params = new URLSearchParams({
        page: vm.page,
        pageSize: vm.pageSize
      });
      if (vm.keyword.trim()) params.set('keyword', vm.keyword.trim());
      if (vm.statusFilter && vm.statusFilter !== 'all')
        params.set('status', vm.statusFilter);
      if (vm.categoryFilter) params.set('category', vm.categoryFilter);
      if (vm.dxmCategoryFilter) params.set('dxmCategory', vm.dxmCategoryFilter);
      fetch('/api/product?' + params.toString())
        .then(function (r) {
          return r.json();
        })
        .then(function (d) {
          vm.list = d.list;
          vm.total = d.total;
          vm.loading = false;
        })
        .catch(function () {
          vm.loading = false;
        });
    },
    onPageChange: function (p) {
      this.loadList(p);
    },
    onPageSizeChange: function (s) {
      this.pageSize = s;
      this.loadList(1);
    },
    onSelectionChange: function (sel) {
      this.selectedIds = sel.map(function (i) {
        return i.id;
      });
    },
    openQuoteEdit: function (id) {
      var pid = this.quoteProductId || '166827730497622099';
      window.open(
        'https://www.dianxiaomi.com/web/temu/quoteEdit?id=' +
          pid +
          '&collectId=' +
          id,
        '_blank'
      );
    },
    saveQuoteId: function () {
      var vm = this;
      var val = (vm.quoteProductId || '').trim();
      if (!val) return;
      // 校验：纯数字，15-20位
      if (!/^\d{15,20}$/.test(val)) {
        vm.$Message.warning('请输入正确的店小秘ID');
        vm.quoteProductId = '';
        return;
      }
      localStorage.setItem('dxm_quote_product_id', val);
      vm.$Message.success('已保存');
    },
    openSource: function (url) {
      if (url) window.open(url, '_blank');
    },
    deleteProduct: function (id) {
      var vm = this;
      this.$Modal.confirm({
        title: '确认删除',
        content: '确认删除此商品？',
        onOk: function () {
          fetch('/api/product/' + id, { method: 'DELETE' }).then(function () {
            vm.loadList();
            vm.$root.loadStats();
          });
        }
      });
    },
    batchDelete: function () {
      var vm = this;
      if (!vm.selectedIds.length) return;
      this.$Modal.confirm({
        title: '确认删除',
        content: '确认删除 ' + vm.selectedIds.length + ' 条商品？',
        onOk: function () {
          fetch('/api/product/batch-delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: vm.selectedIds })
          }).then(function () {
            vm.selectedIds = [];
            vm.loadList();
            vm.$root.loadStats();
          });
        }
      });
    },
    openBatchCategory: function () {
      if (!this.selectedIds.length) {
        this.$Message.warning('请先选择商品');
        return;
      }
      this.batchCatValue = '';
      this.batchCatVisible = true;
    },
    saveBatchCategory: function () {
      var vm = this;
      if (!vm.batchCatValue) {
        vm.$Message.warning('请选择类目');
        return;
      }
      Promise.all(vm.selectedIds.map(function (id) {
        return fetch('/api/product/' + id, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ customCategory: vm.batchCatValue })
        });
      })).then(function () {
        vm.$Message.success('已批量设置 ' + vm.selectedIds.length + ' 条商品的类目');
        vm.batchCatVisible = false;
        vm.selectedIds = [];
        vm.loadList();
      });
    }
  },
  template:
    '\
    <div class="list-card">\
      <div class="filter-bar">\
        <i-input v-model="keyword" placeholder="搜索标题..." clearable style="width:220px" @on-enter="loadList(1)" @on-clear="loadList(1)">\
          <icon type="ios-search" slot="prefix"></icon>\
        </i-input>\
        <i-select v-model="statusFilter" clearable placeholder="全部状态" style="width:130px" @on-change="loadList(1)">\
          <i-option value="all">全部状态</i-option>\
          <i-option value="0">未使用</i-option>\
          <i-option value="1">已使用</i-option>\
        </i-select>\
        <i-select v-model="categoryFilter" clearable filterable placeholder="全部类目" style="width:150px" @on-change="loadList(1)">\
          <i-option v-for="c in categoryList" :key="c" :value="c">{{ c }}</i-option>\
        </i-select>\
        <i-select v-model="dxmCategoryFilter" clearable filterable placeholder="店小秘类目" style="width:160px" @on-change="loadList(1)">\
          <i-option value="_none">未映射</i-option>\
          <i-option v-for="d in dxmCategoryList" :key="d.path" :value="d.leafName">{{ d.leafName }}</i-option>\
        </i-select>\
        <i-button type="primary" icon="ios-search" @click="loadList(1)">搜索</i-button>\
      </div>\
      <div class="action-bar">\
        <div class="action-bar-left">共采集 <strong>{{ total }}</strong> 条数据</div>\
        <div class="action-bar-right" style="position:relative">\
          <div style="position:relative;margin-right:8px">\
            <i-input v-model="quoteProductId" placeholder="店小秘引用产品ID" search enter-button="保存" style="width:240px" @on-search="saveQuoteId" />\
            <span style="position:absolute;left:2px;top:100%;font-size:11px;color:#999;white-space:nowrap">输入店小秘产品ID后点击保存</span>\
          </div>\
          <i-button type="error" icon="ios-trash"\
            :disabled="selectedIds.length === 0"\
            @click="batchDelete">\
            批量删除{{ selectedIds.length ? \' (\' + selectedIds.length + \')\' : \'\' }}\
          </i-button>\
          <i-button type="warning" icon="md-pricetag"\
            :disabled="selectedIds.length === 0"\
            @click="openBatchCategory">\
            批量设置类目{{ selectedIds.length ? \' (\' + selectedIds.length + \')\' : \'\' }}\
          </i-button>\
          <tooltip content="刷新" placement="top"><i-button icon="md-refresh" shape="circle" @click="loadList()"></i-button></tooltip>\
        </div>\
      </div>\
      <i-table :columns="columns" :data="list" :loading="loading" stripe\
        @on-selection-change="onSelectionChange" style="margin-bottom:0;"></i-table>\
      <div class="pagination-wrap">\
        <page :total="total" :current="page" :page-size="pageSize"\
          :page-size-opts="[10,20,50,100]" show-total show-elevator show-sizer\
          @on-change="onPageChange" @on-page-size-change="onPageSizeChange" />\
      </div>\
      <modal v-model="batchCatVisible" title="批量设置类目" :mask-closable="false" width="500">\
        <div style="margin-bottom:12px">\
          <p style="margin-bottom:8px;color:#666">已选择 <strong>{{ selectedIds.length }}</strong> 条商品</p>\
          <i-select v-model="batchCatValue" filterable clearable placeholder="搜索店小秘类目" style="width:100%" not-found-text="无匹配">\
            <i-option v-for="c in dxmCatOptions" :key="c.id" :value="c.path">{{ c.path }}</i-option>\
          </i-select>\
        </div>\
        <div slot="footer">\
          <i-button @click="batchCatVisible = false">取消</i-button>\
          <i-button type="primary" @click="saveBatchCategory">保存</i-button>\
        </div>\
      </modal>\
    </div>'
});
