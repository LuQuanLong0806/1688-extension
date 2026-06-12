// 待发布队列页面组件
Vue.component('page-publish-queue', {
  data: function () {
    return {
      loading: false,
      list: [],
      total: 0,
      page: 1,
      pageSize: 20,
      keyword: '',
      selectedIds: [],
      batchOperating: false,
      logModalVisible: false,
      logContent: ''
    };
  },
  mounted: function () {
    this.loadList();
  },
  computed: {
    columns: function () {
      return [
        { type: 'selection', width: 40, align: 'center' },
        {
          title: '预览',
          width: 80,
          align: 'center',
          ellipsis: false,
          className: 'col-thumb',
          slot: 'preview'
        },
        {
          title: '标题',
          key: 'title',
          minWidth: 180,
          ellipsis: false,
          slot: 'title'
        },
        {
          title: '问题诊断',
          width: 200,
          slot: 'issues'
        },
        {
          title: '类目',
          width: 140,
          slot: 'category'
        },
        { title: '处理时间', key: 'automation_finished_at', width: 180 },
        {
          title: '操作',
          width: 260,
          align: 'center',
          className: 'col-actions',
          fixed: 'right',
          slot: 'actions'
        }
      ];
    }
  },
  methods: {
    loadList: function (p) {
      var vm = this;
      if (p) vm.page = p;
      vm.loading = true;
      var params = new URLSearchParams({
        page: vm.page,
        pageSize: vm.pageSize,
        stage: 'ready'
      });
      if (vm.keyword.trim()) params.set('keyword', vm.keyword.trim());
      apiFetch('/api/product?' + params.toString())
        .then(function (r) { return r.json(); })
        .then(function (d) {
          vm.list = d.list;
          vm.total = d.total;
          vm.loading = false;
        })
        .catch(function () { vm.loading = false; });
    },
    onSelectionChange: function (sel) {
      this.selectedIds = sel.map(function (i) { return i.uid; });
    },
    onPageChange: function (p) { this.loadList(p); },
    onPageSizeChange: function (s) { this.pageSize = s; this.loadList(1); },
    getSkuImage: function (row) {
      var mainImages = JSON.parse(row.main_images || '[]');
      if (mainImages.length) {
        var first = mainImages[0];
        return typeof first === 'string' ? first : (first && first.url) || null;
      }
      var skus = JSON.parse(row.skus || '[]');
      return skus.length && skus[0].image ? skus[0].image : null;
    },
    parseIssues: function (row) {
      try {
        var raw = row.automation_issues;
        if (!raw) return [];
        if (typeof raw === 'string') raw = JSON.parse(raw);
        if (!Array.isArray(raw)) return [];
        return raw;
      } catch (e) { return []; }
    },
    issueClass: function (issue) {
      if (issue.level === 'error') return 'issue-tag issue-tag-error';
      return 'issue-tag issue-tag-warning';
    },
    batchStage: function (targetStage) {
      var vm = this;
      if (!vm.selectedIds.length) return;
      var label = targetStage === 'published' ? '批量发布' : '退回草稿箱';
      vm.$Modal.confirm({
        title: '批量操作',
        content: '确认将 ' + vm.selectedIds.length + ' 个商品' + label + '？',
        onOk: function () {
          vm.batchOperating = true;
          apiFetch('/api/product/batch-stage', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uids: vm.selectedIds, stage: targetStage })
          }).then(function (r) { return r.json(); }).then(function (data) {
            vm.batchOperating = false;
            if (data.ok) {
              vm.$Message.success(label + '成功（' + (data.updated || vm.selectedIds.length) + ' 个）');
              vm.selectedIds = [];
              vm.loadList(1);
            } else {
              vm.$Message.error(data.error || label + '失败');
            }
          }).catch(function () { vm.batchOperating = false; });
        }
      });
    },
    setStage: function (row, stage) {
      var vm = this;
      apiFetch('/api/product/' + row.uid + '/stage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: stage })
      }).then(function (r) { return r.json(); }).then(function (data) {
        if (data.ok) {
          vm.$Message.success('操作成功');
          vm.loadList();
        } else {
          vm.$Message.error(data.error || '操作失败');
        }
      }).catch(function () { vm.$Message.error('请求失败'); });
    },
    showLog: function (row) {
      var vm = this;
      var log = row.automation_log || '暂无日志';
      vm.logContent = typeof log === 'string' ? log : JSON.stringify(log, null, 2);
      vm.logModalVisible = true;
    },
    openAdd: function (id) {
      window.open('https://www.dianxiaomi.com/web/temu/add?collectId=' + id, '_blank');
    }
  },
  template: `
    <div class="automation-page">
      <div class="page-header">
        <h2>待发布</h2>
        <span class="count-badge">{{ total }} 条</span>
      </div>
      <div class="filter-bar" style="padding:12px 20px;border-bottom:1px solid var(--border-subtle)">
        <i-input v-model="keyword" placeholder="搜索标题..." clearable style="width:220px" @on-enter="loadList(1)" @on-clear="loadList(1)">
          <icon type="ios-search" slot="prefix"></icon>
        </i-input>
        <i-button type="primary" icon="ios-search" @click="loadList(1)">搜索</i-button>
      </div>
      <div class="action-bar">
        <div style="display:flex;gap:8px">
          <i-button v-if="selectedIds.length" type="success" size="small" @click="batchStage('published')" :loading="batchOperating">
            批量发布
          </i-button>
          <i-button v-if="selectedIds.length" type="default" size="small" @click="batchStage('draft')" :loading="batchOperating">
            退回草稿箱
          </i-button>
          <tooltip content="刷新" placement="top"><i-button icon="md-refresh" shape="circle" @click="loadList()"></i-button></tooltip>
        </div>
      </div>
      <div class="table-wrap">
        <i-table :columns="columns" :data="list" :loading="loading" stripe @on-selection-change="onSelectionChange" style="margin-bottom:0;">
          <template slot="preview" slot-scope="{ row }">
            <div v-if="!getSkuImage(row)" class="cell-thumb-ph"></div>
            <img v-else :src="getSkuImage(row)" loading="lazy" class="cell-thumb"
              @mouseenter="$root.$refs.thumbPreview.open(getSkuImage(row), $event)"
              @mousemove="$root.$refs.thumbPreview.move($event)"
              @mouseleave="$root.$refs.thumbPreview.close()" />
          </template>
          <template slot="title" slot-scope="{ row }">
            <span style="word-break:break-all;line-height:1.4">{{ row.title || '-' }}</span>
          </template>
          <template slot="issues" slot-scope="{ row }">
            <template v-if="parseIssues(row).length">
              <span v-for="(issue, idx) in parseIssues(row)" :key="idx" :class="issueClass(issue)" :title="issue.message">
                {{ issue.message }}
              </span>
            </template>
            <span v-else style="color:var(--text-muted);font-size:12px">无问题</span>
          </template>
          <template slot="category" slot-scope="{ row }">
            <span style="font-size:12px;color:var(--text-secondary)">{{ row.customCategory || '-' }}</span>
          </template>
          <template slot="actions" slot-scope="{ row }">
            <div class="action-btns">
              <Button type="primary" size="small" icon="ios-eye" @click="$root.openDetail(row.uid)">详情</Button>
              <Button size="small" icon="md-document-text" @click="showLog(row)">日志</Button>
              <Button type="success" size="small" icon="md-paper-plane" @click="openAdd(row.uid)">发布</Button>
              <Button type="default" size="small" @click="setStage(row, 'draft')">退回</Button>
            </div>
          </template>
        </i-table>
      </div>
      <div class="pagination-wrap">
        <page :total="total" :current="page" :page-size="pageSize"
          :page-size-opts="[10,20,50,100]" show-total show-elevator show-sizer
          @on-change="onPageChange" @on-page-size-change="onPageSizeChange" />
      </div>
      <modal v-model="logModalVisible" title="自动化日志" width="600">
        <pre style="max-height:400px;overflow:auto;background:var(--bg-elevated);padding:12px;border-radius:var(--radius);font-size:12px;color:var(--text-secondary);white-space:pre-wrap;word-break:break-all">{{ logContent }}</pre>
      </modal>
    </div>`
});
