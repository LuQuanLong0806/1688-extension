// 商品详情弹窗
Vue.component('detail-modal', {
  props: {
    visible: { type: Boolean, default: false },
    detail: { type: Object, default: null }
  },
  methods: {
    close: function () { this.$emit('update:visible', false); },
    toggleStatus: function () {
      var vm = this;
      if (!vm.detail) return;
      var ns = vm.detail.status === 0 ? 1 : 0;
      fetch('/api/product/' + vm.detail.id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: ns })
      }).then(function () {
        vm.detail.status = ns;
        vm.$emit('status-changed');
      });
    },
    copyUrl: function () {
      var vm = this;
      if (!vm.detail) return;
      var url = location.origin + '/api/product/' + vm.detail.id;
      navigator.clipboard.writeText(url).then(function () {
        vm.$Message.success('已复制');
      });
    },
    openPreview: function (imgs, idx) {
      this.$root.openPreview(imgs, idx);
    },
    onSkuImgEnter: function (url, e) {
      this.$root.$refs.thumbPreview.open(url, e);
    },
    onSkuImgMove: function (e) {
      this.$root.$refs.thumbPreview.move(e);
    },
    onSkuImgLeave: function () {
      this.$root.$refs.thumbPreview.close();
    }
  },
  template: '\
    <modal v-model="visible" class="detail-modal" @on-cancel="close"\
      :title="detail ? (detail.title || (\'商品 #\' + detail.id)) : \'商品详情\'" width="1100" footer-hide>\
      <template v-if="detail">\
        \
        <!-- 主图 -->\
        <div class="detail-section" v-if="detail.main_images && detail.main_images.length">\
          <div class="detail-section-title">主图 ({{ detail.main_images.length }})</div>\
          <div class="img-grid">\
            <div class="img-item" v-for="(url, i) in detail.main_images" :key="\'m\'+i"\
              @click="openPreview(detail.main_images, i)">\
              <img :src="url" loading="lazy" />\
            </div>\
          </div>\
        </div>\
        \
        <!-- 基本信息 -->\
        <div class="detail-section">\
          <div class="detail-section-title">基本信息</div>\
          <div class="info-grid">\
            <span class="label">来源</span><span class="value">\
              <a v-if="detail.source_url" :href="detail.source_url" target="_blank">{{ detail.source_url }}</a>\
              <span v-else>-</span>\
            </span>\
            <span class="label">标题</span><span class="value">{{ detail.title || \'-\' }}</span>\
            <span class="label">采集时间</span><span class="value">{{ detail.created_at || \'-\' }}</span>\
            <span class="label">状态</span><span class="value">\
              <span :class="\'status-dot \' + (detail.status === 0 ? \'unused\' : \'used\')">\
                {{ detail.status === 0 ? \'未使用\' : \'已使用\' }}\
              </span>\
            </span>\
          </div>\
        </div>\
        \
        <!-- 描述图 -->\
        <div class="detail-section" v-if="detail.desc_images && detail.desc_images.length">\
          <div class="detail-section-title">描述图 ({{ detail.desc_images.length }})</div>\
          <div class="img-grid">\
            <div class="img-item" v-for="(url, i) in detail.desc_images" :key="\'d\'+i"\
              @click="openPreview(detail.desc_images, i)">\
              <img :src="url" loading="lazy" />\
            </div>\
          </div>\
        </div>\
        \
        <!-- 属性 -->\
        <div class="detail-section" v-if="detail.attrs && detail.attrs.length">\
          <div class="detail-section-title">属性 ({{ detail.attrs.length }})</div>\
          <div class="attr-tags">\
            <span class="attr-tag" v-for="(a, i) in detail.attrs" :key="\'a\'+i">{{ a }}</span>\
          </div>\
        </div>\
        \
        <!-- SKU -->\
        <div class="detail-section">\
          <div class="detail-section-title">SKU ({{ detail.skus ? detail.skus.length : 0 }})</div>\
          <div v-if="detail.skus && detail.skus.length" class="detail-sku-scroll">\
            <table class="sku-table">\
              <thead><tr><th>图片</th><th>SKU名称</th><th>价格</th><th>长(cm)</th><th>宽(cm)</th><th>高(cm)</th><th>重量</th></tr></thead>\
              <tbody>\
                <tr v-for="(sku, i) in detail.skus" :key="\'s\'+i">\
                  <td><img v-if="sku.image" :src="sku.image" loading="lazy"\
                    @mouseenter="onSkuImgEnter(sku.image, $event)"\
                    @mousemove="onSkuImgMove($event)"\
                    @mouseleave="onSkuImgLeave" /></td>\
                  <td style="text-align:left;">{{ sku.name || \'-\' }}</td>\
                  <td>{{ sku.price || \'-\' }}</td>\
                  <td>{{ sku.dimensions && sku.dimensions[0] ? sku.dimensions[0] : \'-\' }}</td>\
                  <td>{{ sku.dimensions && sku.dimensions[1] ? sku.dimensions[1] : \'-\' }}</td>\
                  <td>{{ sku.dimensions && sku.dimensions[2] ? sku.dimensions[2] : \'-\' }}</td>\
                  <td>{{ sku.weight != null && sku.weight !== \'\' ? sku.weight : \'-\' }}</td>\
                </tr>\
              </tbody>\
            </table>\
          </div>\
          <div v-else class="detail-sku-empty">暂无SKU数据</div>\
        </div>\
        \
        <!-- 操作栏 -->\
        <div class="detail-footer">\
          <i-button icon="ios-link" @click="copyUrl">复制回填URL</i-button>\
          <i-button :type="detail && detail.status === 0 ? \'success\' : \'default\'"\
            :icon="detail && detail.status === 0 ? \'ios-checkmark-circle\' : \'ios-undo\'"\
            @click="toggleStatus">\
            {{ detail && detail.status === 0 ? \'标记已用\' : \'标记未用\' }}\
          </i-button>\
        </div>\
      </template>\
    </modal>'
});
