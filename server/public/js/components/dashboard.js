// 仪表盘页面组件
Vue.component('page-dashboard', {
  props: {
    stats: { type: Object, default: function () { return { total: 0, unused: 0, used: 0, totalCategories: 0 }; } },
    theme: { type: String, default: '1688' }
  },
  data: function () {
    return { recentList: [], charts: {} };
  },
  mounted: function () {
    this.loadRecent();
    var vm = this;
    this.$nextTick(function () { vm.initCharts(); });
  },
  activated: function () {
    this.loadRecent();
    var vm = this;
    this.$nextTick(function () { vm.initCharts(); });
  },
  watch: {
    theme: function () {
      var vm = this;
      this.$nextTick(function () { vm.initCharts(); });
    }
  },
  methods: {
    themeColors: function () {
      var palettes = {
        '1688': { accent: '#ff6a00', accentLight: 'rgba(255,106,0,.25)', tooltipBg: '#fff', tooltipBorder: '#e8e8e8', tooltipText: '#333', axisLine: '#e0e0e0', splitLine: '#f5f5f5', axisLabel: '#999', catLabel: '#555', gaugeBg: '#f0f0f0', gaugeLabel: '#333', gaugeTitle: '#999', emptyText: '#ccc' },
        'jd': { accent: '#e4393c', accentLight: 'rgba(228,57,60,.25)', tooltipBg: '#fff', tooltipBorder: '#e8e8e8', tooltipText: '#333', axisLine: '#e0e0e0', splitLine: '#f5f5f5', axisLabel: '#999', catLabel: '#555', gaugeBg: '#f0f0f0', gaugeLabel: '#333', gaugeTitle: '#999', emptyText: '#ccc' },
        'fresh': { accent: '#0ea5e9', accentLight: 'rgba(14,165,233,.25)', tooltipBg: '#fff', tooltipBorder: '#e2e8f0', tooltipText: '#1e293b', axisLine: '#d4dbe5', splitLine: '#e2e8f0', axisLabel: '#94a3b8', catLabel: '#475569', gaugeBg: '#e2e8f0', gaugeLabel: '#1e293b', gaugeTitle: '#94a3b8', emptyText: '#94a3b8' }
      };
      return palettes[this.theme] || palettes['1688'];
    },
    goProducts: function () { this.$emit('switch-view', 'products'); },
    loadRecent: function () {
      var vm = this;
      fetch('/api/product?pageSize=5').then(function (r) { return r.json(); })
        .then(function (d) {
          vm.recentList = (d.list || []).map(function (item) {
            try {
              var skus = JSON.parse(item.skus || '[]');
              item._thumb = skus.length && skus[0].image ? skus[0].image : '';
            } catch (e) { item._thumb = ''; }
            return item;
          });
        }).catch(function () {});
    },
    initCharts: function () {
      this.initTrendChart();
      this.initCategoryChart();
      this.initUsageChart();
    },
    initTrendChart: function () {
      var el = document.getElementById('chart-trend');
      if (!el) return;
      if (this.charts.trend) this.charts.trend.dispose();
      var chart = echarts.init(el);
      this.charts.trend = chart;
      var c = this.themeColors();
      var accentColor = c.accent;
      fetch('/api/product/trend?days=7').then(function (r) { return r.json(); })
        .then(function (data) {
          var dates = data.map(function (d) { return d.date.substring(5); });
          var counts = data.map(function (d) { return d.count; });
          chart.setOption({
            tooltip: { trigger: 'axis', backgroundColor: c.tooltipBg, borderColor: c.tooltipBorder, textStyle: { color: c.tooltipText } },
            grid: { top: 20, right: 20, bottom: 30, left: 45 },
            xAxis: { type: 'category', data: dates, axisLine: { lineStyle: { color: c.axisLine } }, axisLabel: { color: c.axisLabel }, boundaryGap: false },
            yAxis: { type: 'value', minInterval: 1, axisLine: { show: false }, splitLine: { lineStyle: { color: c.splitLine } }, axisLabel: { color: c.axisLabel } },
            series: [{
              type: 'line', data: counts, smooth: true, symbol: 'circle', symbolSize: 6,
              lineStyle: { width: 2, color: accentColor },
              itemStyle: { color: accentColor },
              areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: c.accentLight }, { offset: 1, color: c.accentLight.replace(/[\d.]+\)$/, '0.02)') }
              ]) }
            }]
          });
          chart.resize();
        }).catch(function () {});
    },
    initCategoryChart: function () {
      var el = document.getElementById('chart-status');
      if (!el) return;
      if (this.charts.status) this.charts.status.dispose();
      var chart = echarts.init(el);
      this.charts.status = chart;
      var c = this.themeColors();
      fetch('/api/product/dxm-category-top?limit=10').then(function (r) { return r.json(); })
        .then(function (data) {
          if (!Array.isArray(data) || !data.length) {
            chart.setOption({
              title: { text: '暂无数据', left: 'center', top: 'center', textStyle: { color: c.emptyText, fontSize: 14, fontWeight: 'normal' } }
            });
            return;
          }
          data.sort(function (a, b) { return a.count - b.count; });
          var names = data.map(function (d) { return d.name; });
          var counts = data.map(function (d) { return d.count; });
          var colors = data.map(function (d, i) {
            var rank = data.length - i;
            if (rank === 1) return c.accent;
            if (rank === 2) return c.accent + 'cc';
            if (rank === 3) return c.accent + '99';
            return c.accent + '66';
          });
          chart.setOption({
            tooltip: { trigger: 'axis', backgroundColor: c.tooltipBg, borderColor: c.tooltipBorder, textStyle: { color: c.tooltipText } },
            grid: { top: 10, right: 40, bottom: 10, left: 10, containLabel: true },
            xAxis: { type: 'value', minInterval: 1, axisLine: { show: false }, splitLine: { lineStyle: { color: c.splitLine } }, axisLabel: { color: c.axisLabel } },
            yAxis: { type: 'category', data: names, axisLine: { lineStyle: { color: c.axisLine } }, axisLabel: { color: c.catLabel, fontSize: 13 } },
            series: [{
              type: 'bar', data: counts, barWidth: 18,
              label: { show: true, position: 'right', color: c.catLabel, fontSize: 13, fontWeight: 'bold' },
              itemStyle: {
                borderRadius: [0, 10, 10, 0],
                color: function (params) { return colors[params.dataIndex]; }
              }
            }]
          });
          chart.resize();
        })
        .catch(function () {
          chart.setOption({
            title: { text: '暂无数据', left: 'center', top: 'center', textStyle: { color: c.emptyText, fontSize: 14, fontWeight: 'normal' } }
          });
        });
    },
    initUsageChart: function () {
      var el = document.getElementById('chart-usage');
      if (!el) return;
      if (this.charts.usage) this.charts.usage.dispose();
      var chart = echarts.init(el);
      this.charts.usage = chart;
      var c = this.themeColors();
      var total = this.stats.total || 1;
      var pct = Math.round((this.stats.used / total) * 100);
      chart.setOption({
        series: [{
          type: 'gauge', startAngle: 200, endAngle: -20, radius: '85%', center: ['50%', '55%'],
          min: 0, max: 100, splitNumber: 5,
          axisLine: { lineStyle: { width: 16, color: [[pct / 100, c.accent], [1, c.gaugeBg]] } },
          axisTick: { show: false }, splitLine: { show: false }, axisLabel: { show: false },
          pointer: { show: false },
          title: { offsetCenter: [0, '30%'], fontSize: 13, color: c.gaugeTitle },
          detail: { offsetCenter: [0, '0%'], fontSize: 32, fontWeight: 700, color: c.gaugeLabel, formatter: '{value}%' },
          data: [{ value: pct, name: '发布率' }]
        }]
      });
    }
  },
  template: `
    <div>
      <div class="stat-cards">
        <div class="stat-card">
          <div class="icon-wrap blue">
            <svg viewBox="0 0 24 24"><path d="M20 6h-8l-2-2H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2zm0 12H4V8h16z"/></svg>
          </div>
          <div class="stat-body"><div class="stat-val">{{ stats.total }}</div><div class="stat-label">总商品</div></div>
        </div>
        <div class="stat-card">
          <div class="icon-wrap green">
            <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8z"/></svg>
          </div>
          <div class="stat-body"><div class="stat-val">{{ stats.unused }}</div><div class="stat-label">未发布</div></div>
        </div>
        <div class="stat-card">
          <div class="icon-wrap gray">
            <svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
          </div>
          <div class="stat-body"><div class="stat-val">{{ stats.used }}</div><div class="stat-label">已发布</div></div>
        </div>
        <div class="stat-card">
          <div class="icon-wrap orange">
            <svg viewBox="0 0 24 24"><path d="M4 6H2v14a2 2 0 002 2h14v-2H4zm16-4H8a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V4a2 2 0 00-2-2zm0 14H8V4h12zm-6-1h2V5h-4v2h2z"/></svg>
          </div>
          <div class="stat-body"><div class="stat-val">{{ stats.totalCategories }}</div><div class="stat-label">类目总数</div></div>
        </div>
      </div>
      <div class="chart-grid">
        <div class="chart-card">
          <div class="chart-card-header">采集趋势（近 7 天）</div>
          <div class="chart-card-body" id="chart-trend"></div>
        </div>
        <div class="chart-card">
          <div class="chart-card-header">偏好分布（店小秘类目 Top10）</div>
          <div class="chart-card-body" id="chart-status"></div>
        </div>
      </div>
      <div class="chart-grid">
        <div class="chart-card">
          <div class="chart-card-header">
            <span>最近采集</span>
            <a href="javascript:void(0)" @click="goProducts" style="font-size:13px;color:var(--accent);">查看全部 &rarr;</a>
          </div>
          <div class="chart-card-body" style="height:auto;padding:0 20px;">
            <ul class="recent-list">
              <li v-for="item in recentList" :key="item.id">
                <img v-if="item._thumb" class="recent-thumb" :src="item._thumb" />
                <div v-else class="recent-thumb-ph"></div>
                <div class="recent-info">
                  <div class="recent-title">{{ item.title || ('商品 #' + item.id) }}</div>
                  <div class="recent-time">{{ item.created_at }}</div>
                </div>
                <span :class="'recent-badge ' + (item.status === 0 ? 'unused' : 'used')">
                  {{ item.status === 0 ? '未发布' : '已发布' }}
                </span>
              </li>
              <li v-if="!recentList.length" style="justify-content:center;color:var(--text-muted);padding:20px 0;">暂无数据</li>
            </ul>
          </div>
        </div>
        <div class="chart-card">
          <div class="chart-card-header">发布率</div>
          <div class="chart-card-body" id="chart-usage"></div>
        </div>
      </div>
    </div>`
});
