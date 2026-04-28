// 商品详情弹窗 — 全屏编辑模式
Vue.component('detail-modal', {
  props: {
    visible: { type: Boolean, default: false },
    detail: { type: Object, default: null }
  },
  data: function () {
    return {
      editable: null,
      activeImgTab: 'main',
      selectedSkuIndexes: []
    };
  },
  watch: {
    detail: function (val) {
      if (val) {
        this.editable = JSON.parse(JSON.stringify(val));
        this.activeImgTab = 'main';
        this.selectedSkuIndexes = (val.skus || [])
          .map(function (s, i) { return s._selected ? i : -1; })
          .filter(function (i) { return i >= 0; });
      }
    }
  },
  computed: {
    skuImages: function () {
      if (!this.editable || !this.editable.skus) return [];
      var seen = {};
      var imgs = [];
      this.editable.skus.forEach(function (s) {
        if (s.image && !seen[s.image]) {
          seen[s.image] = true;
          imgs.push(s.image);
        }
      });
      return imgs;
    },
    allSkuSelected: function () {
      if (!this.editable || !this.editable.skus || !this.editable.skus.length) return false;
      return this.selectedSkuIndexes.length === this.editable.skus.length;
    }
  },
  methods: {
    close: function () { this.$emit('update:visible', false); },

    // -- 图片 Tab --
    switchImgTab: function (tab) { this.activeImgTab = tab; },

    // -- SKU 勾选 --
    toggleSkuAll: function (checked) {
      var vm = this;
      if (checked) {
        vm.selectedSkuIndexes = (vm.editable.skus || []).map(function (_, i) { return i; });
      } else {
        vm.selectedSkuIndexes = [];
      }
    },
    toggleSkuItem: function (idx) {
      var pos = this.selectedSkuIndexes.indexOf(idx);
      if (pos >= 0) {
        this.selectedSkuIndexes.splice(pos, 1);
      } else {
        this.selectedSkuIndexes.push(idx);
      }
    },
    isSkuChecked: function (idx) {
      return this.selectedSkuIndexes.indexOf(idx) >= 0;
    },

    // -- 操作 --
    toggleStatus: function () {
      var vm = this;
      if (!vm.editable) return;
      var ns = vm.editable.status === 0 ? 1 : 0;
      fetch('/api/product/' + vm.editable.id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: ns })
      }).then(function () {
        vm.editable.status = ns;
        if (vm.detail) vm.detail.status = ns;
        vm.$emit('status-changed');
      });
    },
    copyUrl: function () {
      var vm = this;
      if (!vm.editable) return;
      var url = location.origin + '/api/product/' + vm.editable.id;
      navigator.clipboard.writeText(url).then(function () {
        vm.$Message.success('已复制');
      });
    },
    saveProduct: function () {
      var vm = this;
      if (!vm.editable) return;
      // 将勾选状态写入 skus
      var skus = JSON.parse(JSON.stringify(vm.editable.skus || []));
      skus.forEach(function (s, i) {
        s._selected = vm.selectedSkuIndexes.indexOf(i) >= 0;
      });
      var payload = {
        title: vm.editable.title,
        skus: skus,
        status: vm.editable.status
      };
      fetch('/api/product/' + vm.editable.id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).then(function () {
        vm.$Message.success('保存成功');
        vm.$emit('status-changed');
      });
    },

    // -- 图片预览 --
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
    <modal v-model="visible" class="detail-modal-fullscreen" @on-cancel="close"\
      :title="editable ? (editable.title || (\'商品 #\' + editable.id)) : \'商品详情\'" fullscreen footer-hide>\
      <template v-if="editable">\
        \
        <!-- 顶部图片区 -->\
        <div class="detail-section" v-if="(editable.main_images && editable.main_images.length) || skuImages.length">\
          <div class="detail-img-tabs">\
            <div class="detail-img-tab" :class="{ active: activeImgTab === \'main\' }"\
              @click="switchImgTab(\'main\')">主图 ({{ editable.main_images ? editable.main_images.length : 0 }})</div>\
            <div class="detail-img-tab" :class="{ active: activeImgTab === \'sku\' }"\
              @click="switchImgTab(\'sku\')">SKU图 ({{ skuImages.length }})</div>\
          </div>\
          <div v-if="activeImgTab === \'main\'" class="img-grid">\
            <div class="img-item" v-for="(url, i) in editable.main_images" :key="\'m\'+i"\
              @click="openPreview(editable.main_images, i)">\
              <img :src="url" loading="lazy" />\
            </div>\
          </div>\
          <div v-else class="img-grid">\
            <div class="img-item" v-for="(url, i) in skuImages" :key="\'si\'+i"\
              @click="openPreview(skuImages, i)">\
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
              <a v-if="editable.source_url" :href="editable.source_url" target="_blank">{{ editable.source_url }}</a>\
              <span v-else>-</span>\
            </span>\
            <span class="label">类目</span><span class="value">{{ editable.category && (editable.category.leafCategoryName || editable.category.categoryPath) || \'-\' }}</span>\
            <span class="label">标题</span><span class="value">\
              <i-input v-model="editable.title" size="small" />\
            </span>\
            <span class="label">采集时间</span><span class="value">{{ editable.created_at || \'-\' }}</span>\
            <span class="label">状态</span><span class="value">\
              <span :class="\'status-dot \' + (editable.status === 0 ? \'unused\' : \'used\')" style="cursor:pointer" @click="toggleStatus">\
                {{ editable.status === 0 ? \'未使用\' : \'已使用\' }}\
              </span>\
            </span>\
          </div>\
        </div>\
        \
        <!-- 描述图 -->\
        <div class="detail-section" v-if="editable.desc_images && editable.desc_images.length">\
          <div class="detail-section-title">描述图 ({{ editable.desc_images.length }})</div>\
          <div class="img-grid">\
            <div class="img-item" v-for="(url, i) in editable.desc_images" :key="\'d\'+i"\
              @click="openPreview(editable.desc_images, i)">\
              <img :src="url" loading="lazy" />\
            </div>\
          </div>\
        </div>\
        \
        <!-- 属性 -->\
        <div class="detail-section" v-if="editable.attrs && editable.attrs.length">\
          <div class="detail-section-title">属性 ({{ editable.attrs.length }})</div>\
          <div class="attr-tags">\
            <span class="attr-tag" v-for="(a, i) in editable.attrs" :key="\'a\'+i">{{ a }}</span>\
          </div>\
        </div>\
        \
        <!-- SKU 列表（带复选框 + 可编辑） -->\
        <div class="detail-section">\
          <div class="detail-section-title">SKU ({{ editable.skus ? editable.skus.length : 0 }})</div>\
          <div v-if="editable.skus && editable.skus.length" class="detail-sku-scroll">\
            <table class="sku-table">\
              <thead><tr>\
                <th class="sku-check-col"><checkbox :value="allSkuSelected" @on-change="toggleSkuAll"></checkbox></th>\
                <th>图片</th><th>SKU名称</th><th>价格</th><th>长(cm)</th><th>宽(cm)</th><th>高(cm)</th><th>重量</th>\
              </tr></thead>\
              <tbody>\
                <tr v-for="(sku, i) in editable.skus" :key="\'s\'+i" :class="{ \'sku-row-checked\': isSkuChecked(i) }">\
                  <td class="sku-check-col"><checkbox :value="isSkuChecked(i)" @on-change="toggleSkuItem(i)"></checkbox></td>\
                  <td><img v-if="sku.image" :src="sku.image" loading="lazy"\
                    @mouseenter="onSkuImgEnter(sku.image, $event)"\
                    @mousemove="onSkuImgMove($event)"\
                    @mouseleave="onSkuImgLeave" /></td>\
                  <td style="text-align:left;">{{ sku.name || \'-\' }}</td>\
                  <td><i-input v-model="sku.price" size="small" style="width:80px" /></td>\
                  <td><i-input v-model="sku.dimensions[0]" size="small" style="width:60px" /></td>\
                  <td><i-input v-model="sku.dimensions[1]" size="small" style="width:60px" /></td>\
                  <td><i-input v-model="sku.dimensions[2]" size="small" style="width:60px" /></td>\
                  <td><i-input v-model="sku.weight" size="small" style="width:70px" /></td>\
                </tr>\
              </tbody>\
            </table>\
          </div>\
          <div v-else class="detail-sku-empty">暂无SKU数据</div>\
        </div>\
        \
        <!-- 底部固定操作栏 -->\
        <div class="detail-footer-fixed">\
          <div style="display:flex;gap:8px;">\
            <i-button icon="ios-link" @click="copyUrl">复制回填URL</i-button>\
            <i-button :type="editable.status === 0 ? \'success\' : \'default\'"\
              :icon="editable.status === 0 ? \'ios-checkmark-circle\' : \'ios-undo\'"\
              @click="toggleStatus">\
              {{ editable.status === 0 ? \'标记已用\' : \'标记未用\' }}\
            </i-button>\
          </div>\
          <i-button type="primary" icon="md-checkmark" @click="saveProduct">保存</i-button>\
        </div>\
      </template>\
    </modal>'
});
