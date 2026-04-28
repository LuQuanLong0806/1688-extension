// 仪表盘页面组件
Vue.component('page-dashboard', {
  props: {
    stats: { type: Object, default: function () { return { total: 0, unused: 0, used: 0, totalCategories: 0 }; } }
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
  methods: {
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
        });
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
      fetch('/api/product/trend?days=7').then(function (r) { return r.json(); })
        .then(function (data) {
          var dates = data.map(function (d) { return d.date.substring(5); });
          var counts = data.map(function (d) { return d.count; });
          chart.setOption({
            tooltip: { trigger: 'axis', backgroundColor: '#fff', borderColor: '#eee', textStyle: { color: '#333' } },
            grid: { top: 20, right: 20, bottom: 30, left: 45 },
            xAxis: { type: 'category', data: dates, axisLine: { lineStyle: { color: '#e0e0e0' } }, axisLabel: { color: '#999' }, boundaryGap: false },
            yAxis: { type: 'value', minInterval: 1, axisLine: { show: false }, splitLine: { lineStyle: { color: '#f5f5f5' } }, axisLabel: { color: '#999' } },
            series: [{
              type: 'line', data: counts, smooth: true, symbol: 'circle', symbolSize: 6,
              lineStyle: { width: 2, color: '#ff6a00' },
              itemStyle: { color: '#ff6a00' },
              areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: 'rgba(255,106,0,0.25)' }, { offset: 1, color: 'rgba(255,106,0,0.02)' }
              ]) }
            }]
          });
          chart.resize();
        });
    },
    initCategoryChart: function () {
      var el = document.getElementById('chart-status');
      if (!el) return;
      if (this.charts.status) this.charts.status.dispose();
      var chart = echarts.init(el);
      this.charts.status = chart;
      fetch('/api/product/category-top').then(function (r) { return r.json(); })
        .then(function (data) {
          // 按数量从小到大排，echarts Y轴从下到上
          data.sort(function (a, b) { return a.count - b.count; });
          var names = data.map(function (d) { return d.name; });
          var counts = data.map(function (d) { return d.count; });
          var maxCount = counts.length ? counts[counts.length - 1] : 1;
          // 排行榜前三名用不同颜色
          var colors = data.map(function (d, i) {
            var rank = data.length - i; // 排名（从高到低）
            if (rank === 1) return '#ff4500';
            if (rank === 2) return '#ff6a00';
            if (rank === 3) return '#ff9a4d';
            return '#ffcc80';
          });
          chart.setOption({
            tooltip: { trigger: 'axis', backgroundColor: '#fff', borderColor: '#eee', textStyle: { color: '#333' } },
            grid: { top: 10, right: 40, bottom: 10, left: 10, containLabel: true },
            xAxis: { type: 'value', minInterval: 1, axisLine: { show: false }, splitLine: { lineStyle: { color: '#f5f5f5' } }, axisLabel: { color: '#999' } },
            yAxis: { type: 'category', data: names, axisLine: { lineStyle: { color: '#e0e0e0' } }, axisLabel: { color: '#555', fontSize: 13 } },
            series: [{
              type: 'bar', data: counts, barWidth: 18,
              label: { show: true, position: 'right', color: '#555', fontSize: 13, fontWeight: 'bold' },
              itemStyle: {
                borderRadius: [0, 10, 10, 0],
                color: function (params) { return colors[params.dataIndex]; }
              }
            }]
          });
          chart.resize();
        });
    },
    initUsageChart: function () {
      var el = document.getElementById('chart-usage');
      if (!el) return;
      if (this.charts.usage) this.charts.usage.dispose();
      var chart = echarts.init(el);
      this.charts.usage = chart;
      var total = this.stats.total || 1;
      var pct = Math.round((this.stats.used / total) * 100);
      chart.setOption({
        series: [{
          type: 'gauge', startAngle: 200, endAngle: -20, radius: '85%', center: ['50%', '55%'],
          min: 0, max: 100, splitNumber: 5,
          axisLine: { lineStyle: { width: 16, color: [[pct / 100, '#ff6a00'], [1, '#f0f0f0']] } },
          axisTick: { show: false }, splitLine: { show: false }, axisLabel: { show: false },
          pointer: { show: false },
          title: { offsetCenter: [0, '30%'], fontSize: 13, color: '#999' },
          detail: { offsetCenter: [0, '0%'], fontSize: 32, fontWeight: 700, color: '#333', formatter: '{value}%' },
          data: [{ value: pct, name: '使用率' }]
        }]
      });
    }
  },
  template: '\
    <div>\
      <div class="stat-cards">\
        <div class="stat-card">\
          <div class="icon-wrap blue">\
            <svg viewBox="0 0 24 24"><path d="M20 6h-8l-2-2H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2zm0 12H4V8h16z"/></svg>\
          </div>\
          <div class="stat-body"><div class="stat-val">{{ stats.total }}</div><div class="stat-label">总商品</div></div>\
        </div>\
        <div class="stat-card">\
          <div class="icon-wrap green">\
            <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8z"/></svg>\
          </div>\
          <div class="stat-body"><div class="stat-val">{{ stats.unused }}</div><div class="stat-label">未使用</div></div>\
        </div>\
        <div class="stat-card">\
          <div class="icon-wrap gray">\
            <svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>\
          </div>\
          <div class="stat-body"><div class="stat-val">{{ stats.used }}</div><div class="stat-label">已使用</div></div>\
        </div>\
        <div class="stat-card">\
          <div class="icon-wrap orange">\
            <svg viewBox="0 0 24 24"><path d="M4 6H2v14a2 2 0 002 2h14v-2H4zm16-4H8a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V4a2 2 0 00-2-2zm0 14H8V4h12zm-6-1h2V5h-4v2h2z"/></svg>\
          </div>\
          <div class="stat-body"><div class="stat-val">{{ stats.totalCategories }}</div><div class="stat-label">类目总数</div></div>\
        </div>\
      </div>\
      <div class="chart-grid">\
        <div class="chart-card">\
          <div class="chart-card-header">采集趋势（近 7 天）</div>\
          <div class="chart-card-body" id="chart-trend"></div>\
        </div>\
        <div class="chart-card">\
          <div class="chart-card-header">偏好分布（类目 Top20）</div>\
          <div class="chart-card-body" id="chart-status"></div>\
        </div>\
      </div>\
      <div class="chart-grid">\
        <div class="chart-card">\
          <div class="chart-card-header">\
            <span>最近采集</span>\
            <a href="javascript:void(0)" @click="goProducts" style="font-size:13px;color:#ff6a00;">查看全部 &rarr;</a>\
          </div>\
          <div class="chart-card-body" style="height:auto;padding:0 20px;">\
            <ul class="recent-list">\
              <li v-for="item in recentList" :key="item.id">\
                <img v-if="item._thumb" class="recent-thumb" :src="item._thumb" />\
                <div v-else class="recent-thumb-ph"></div>\
                <div class="recent-info">\
                  <div class="recent-title">{{ item.title || (\'商品 #\' + item.id) }}</div>\
                  <div class="recent-time">{{ item.created_at }}</div>\
                </div>\
                <span :class="\'recent-badge \' + (item.status === 0 ? \'unused\' : \'used\')">\
                  {{ item.status === 0 ? \'未使用\' : \'已使用\' }}\
                </span>\
              </li>\
              <li v-if="!recentList.length" style="justify-content:center;color:#ccc;padding:20px 0;">暂无数据</li>\
            </ul>\
          </div>\
        </div>\
        <div class="chart-card">\
          <div class="chart-card-header">使用率</div>\
          <div class="chart-card-body" id="chart-usage"></div>\
        </div>\
      </div>\
    </div>'
});
