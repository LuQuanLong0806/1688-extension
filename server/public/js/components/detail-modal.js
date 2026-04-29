// 商品详情弹窗 — 全屏编辑模式
Vue.component('detail-modal', {
  props: {
    visible: { type: Boolean, default: false },
    detail: { type: Object, default: null }
  },
  data: function () {
    return {
      editable: null,
      selectedSkuIndexes: [],
      selectedDetailIndexes: []
    };
  },
  watch: {
    detail: function (val) {
      if (val) {
        this.editable = JSON.parse(JSON.stringify(val));
        // 初始化自定义类目：优先用已保存值，否则用抓取类目值
        if (!this.editable.customCategory) {
          var cat = this.editable.category;
          this.editable.customCategory = cat && (cat.leafCategoryName || cat.categoryPath) || '';
        }
        // 确保 dimensions 数组至少有 3 个元素（Vue 2 响应式追踪）
        (this.editable.skus || []).forEach(function (s) {
          if (!s.customName && s.name) s.customName = s.name;
          if (!s.dimensions || !s.dimensions.length) s.dimensions = ['', '', ''];
          while (s.dimensions.length < 3) s.dimensions.push('');
        });
        // SKU: 如果之前保存过勾选状态则回显，否则默认全选
        var saved = (val.skus || [])
          .map(function (s, i) { return s._selected ? i : -1; })
          .filter(function (i) { return i >= 0; });
        if (saved.length > 0) {
          this.selectedSkuIndexes = saved;
        } else {
          this.selectedSkuIndexes = (val.skus || []).map(function (_, i) { return i; });
        }
        // 详情图: 兼容旧格式(字符串数组)和新格式(对象数组)，回显勾选状态
        var detailImgs = val.detail_images || [];
        var savedDetail = [];
        var normalizedImgs = [];
        detailImgs.forEach(function (item, i) {
          if (typeof item === 'string') {
            normalizedImgs.push(item);
          } else if (item && item.url) {
            normalizedImgs.push(item.url);
            if (item._selected) savedDetail.push(i);
          }
        });
        this.editable.detail_images = normalizedImgs;
        if (savedDetail.length > 0) {
          this.selectedDetailIndexes = savedDetail;
        } else {
          this.selectedDetailIndexes = [];
        }
      }
    }
  },
  computed: {
    skuImages: function () {
      if (!this.editable || !this.editable.skus) return [];
      var vm = this;
      var seen = {};
      var imgs = [];
      this.editable.skus.forEach(function (s, i) {
        if (s.image && !seen[s.image]) {
          seen[s.image] = true;
          // 收集使用此图片的所有 SKU 索引
          var indexes = [];
          vm.editable.skus.forEach(function (s2, j) {
            if (s2.image === s.image) indexes.push(j);
          });
          imgs.push({ url: s.image, indexes: indexes });
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
    // SKU 图片点击：切换该图片关联的所有 SKU
    toggleSkuImage: function (item) {
      var vm = this;
      var allChecked = item.indexes.every(function (i) { return vm.selectedSkuIndexes.indexOf(i) >= 0; });
      if (allChecked) {
        // 全部取消
        item.indexes.forEach(function (i) {
          var pos = vm.selectedSkuIndexes.indexOf(i);
          if (pos >= 0) vm.selectedSkuIndexes.splice(pos, 1);
        });
      } else {
        // 全部勾选
        item.indexes.forEach(function (i) {
          if (vm.selectedSkuIndexes.indexOf(i) < 0) vm.selectedSkuIndexes.push(i);
        });
      }
    },
    isSkuImageChecked: function (item) {
      var vm = this;
      return item.indexes.some(function (i) { return vm.selectedSkuIndexes.indexOf(i) >= 0; });
    },
    // -- 详情图勾选 --
    toggleDetailImage: function (idx) {
      var pos = this.selectedDetailIndexes.indexOf(idx);
      if (pos >= 0) {
        this.selectedDetailIndexes.splice(pos, 1);
      } else {
        this.selectedDetailIndexes.push(idx);
      }
    },
    isDetailImageChecked: function (idx) {
      return this.selectedDetailIndexes.indexOf(idx) >= 0;
    },
    toggleAllDetailImages: function (checked) {
      var vm = this;
      if (checked) {
        vm.selectedDetailIndexes = (vm.editable.detail_images || []).map(function (_, i) { return i; });
      } else {
        vm.selectedDetailIndexes = [];
      }
    },
    allDetailSelected: function () {
      if (!this.editable || !this.editable.detail_images || !this.editable.detail_images.length) return false;
      return this.selectedDetailIndexes.length === this.editable.detail_images.length;
    },
    removeDetailImage: function (idx) {
      // 先从选中索引中移除
      var pos = this.selectedDetailIndexes.indexOf(idx);
      if (pos >= 0) this.selectedDetailIndexes.splice(pos, 1);
      // 调整后续索引
      for (var i = 0; i < this.selectedDetailIndexes.length; i++) {
        if (this.selectedDetailIndexes[i] > idx) this.selectedDetailIndexes[i]--;
      }
      this.editable.detail_images.splice(idx, 1);
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
      var skus = JSON.parse(JSON.stringify(vm.editable.skus || []));
      skus.forEach(function (s, i) {
        s._selected = vm.selectedSkuIndexes.indexOf(i) >= 0;
      });
      // 详情图保存勾选状态
      var detailImages = (vm.editable.detail_images || []).map(function (url, i) {
        return { url: url, _selected: vm.selectedDetailIndexes.indexOf(i) >= 0 };
      });
      var payload = {
        title: vm.editable.title,
        customCategory: vm.editable.customCategory,
        mainImages: vm.editable.main_images,
        descImages: vm.editable.desc_images,
        detailImages: detailImages,
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
        <!-- 主图 -->\
        <div class="detail-section" v-if="editable.main_images && editable.main_images.length">\
          <div class="detail-section-title">主图 ({{ editable.main_images.length }})</div>\
          <div class="img-grid">\
            <div class="img-item" v-for="(url, i) in editable.main_images" :key="\'m\'+i"\
              @click="openPreview(editable.main_images, i)">\
              <img :src="url" loading="lazy"\
                @mouseenter="onSkuImgEnter(url, $event)"\
                @mousemove="onSkuImgMove($event)"\
                @mouseleave="onSkuImgLeave" />\
              <div class="img-del" @click.stop="editable.main_images.splice(i, 1)">&times;</div>\
            </div>\
          </div>\
        </div>\
        \
        <!-- 详情图（可勾选） -->\
        <div class="detail-section" v-if="editable.detail_images && editable.detail_images.length">\
          <div class="detail-section-title">\
            详情图 ({{ editable.detail_images.length }})\
            <checkbox :value="allDetailSelected()" @on-change="toggleAllDetailImages" style="margin-left:12px;vertical-align:middle"></checkbox>\
            <span style="font-size:12px;color:#999;margin-left:4px;vertical-align:middle">全选</span>\
          </div>\
          <div class="img-grid">\
            <div class="img-item sku-img-checkable" v-for="(url, i) in editable.detail_images" :key="\'di\'+i"\
              :class="{ \'sku-img-unchecked\': !isDetailImageChecked(i) }"\
              @click="toggleDetailImage(i)">\
              <img :src="url" loading="lazy"\
                @mouseenter="onSkuImgEnter(url, $event)"\
                @mousemove="onSkuImgMove($event)"\
                @mouseleave="onSkuImgLeave" />\
              <div class="sku-img-check">\
                <checkbox :value="isDetailImageChecked(i)" @click.native.stop></checkbox>\
              </div>\
              <div class="img-del" @click.stop="removeDetailImage(i)">&times;</div>\
            </div>\
          </div>\
        </div>\
        \
        <!-- SKU图（可勾选，关联SKU列表） -->\
        <div class="detail-section" v-if="skuImages.length">\
          <div class="detail-section-title">SKU图 ({{ skuImages.length }})</div>\
          <div class="img-grid">\
            <div class="img-item sku-img-checkable" v-for="(item, i) in skuImages" :key="\'si\'+i"\
              :class="{ \'sku-img-unchecked\': !isSkuImageChecked(item) }"\
              @click="toggleSkuImage(item)">\
              <img :src="item.url" loading="lazy"\
                @mouseenter="onSkuImgEnter(item.url, $event)"\
                @mousemove="onSkuImgMove($event)"\
                @mouseleave="onSkuImgLeave" />\
              <div class="sku-img-check">\
                <checkbox :value="isSkuImageChecked(item)" @click.native.stop></checkbox>\
              </div>\
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
            <span class="label">类目</span><span class="value"><i-input v-model="editable.customCategory" placeholder="自定义类目" style="width:100%;font-size:14px" /></span>\
            <span class="label">店小秘类目</span><span class="value">\
              <span v-if="editable.dxmCategory" style="color:#ff6a00;font-size:14px">{{ editable.dxmCategory.path || editable.dxmCategory.leafName }}</span>\
              <span v-else style="color:#ccc">-</span>\
            </span>\
            <span class="label">标题</span><span class="value">\
              <i-input v-model="editable.title" type="textarea" :rows="2" style="width:100%;font-size:14px" />\
            </span>\
            <span class="label">采集时间</span><span class="value">{{ editable.created_at || \'-\' }}</span>\
            <span class="label">状态</span><span class="value">\
              <span :class="\'status-tag \' + (editable.status === 0 ? \'status-unused\' : \'status-used\')">{{ editable.status === 0 ? \'未使用\' : \'已使用\' }}</span>\
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
                <th>图片</th><th>SKU名称</th><th>自定义名称</th><th>价格</th><th>长(cm)</th><th>宽(cm)</th><th>高(cm)</th><th>重量</th>\
              </tr></thead>\
              <tbody>\
                <tr v-for="(sku, i) in editable.skus" :key="\'s\'+i" :class="{ \'sku-row-checked\': isSkuChecked(i) }">\
                  <td class="sku-check-col"><checkbox :value="isSkuChecked(i)" @on-change="toggleSkuItem(i)"></checkbox></td>\
                  <td><img v-if="sku.image" :src="sku.image" loading="lazy"\
                    @mouseenter="onSkuImgEnter(sku.image, $event)"\
                    @mousemove="onSkuImgMove($event)"\
                    @mouseleave="onSkuImgLeave" /></td>\
                  <td>{{ sku.name || \'-\' }}</td>\
                  <td><i-input v-model="sku.customName" :placeholder="sku.name || \'-\'" style="width:200px" /></td>\
                  <td><i-input v-model="sku.price" type="number" number style="width:110px" /></td>\
                  <td><i-input v-model="sku.dimensions[0]" type="number" number style="width:90px" /></td>\
                  <td><i-input v-model="sku.dimensions[1]" type="number" number style="width:90px" /></td>\
                  <td><i-input v-model="sku.dimensions[2]" type="number" number style="width:90px" /></td>\
                  <td><i-input v-model="sku.weight" type="number" number style="width:100px" /></td>\
                </tr>\
              </tbody>\
            </table>\
          </div>\
          <div v-else class="detail-sku-empty">暂无SKU数据</div>\
        </div>\
        \
        <!-- 底部固定操作栏 -->\
        <div class="detail-footer-fixed">\
          <i-button type="primary" icon="md-checkmark" @click="saveProduct">保存</i-button>\
          <i-button :type="editable.status === 0 ? \'success\' : \'error\'" @click="toggleStatus">\
            {{ editable.status === 0 ? \'标记已使用\' : \'标记未使用\' }}\
          </i-button>\
          <i-button icon="md-close" @click="close">关闭</i-button>\
        </div>\
      </template>\
    </modal>'
});
