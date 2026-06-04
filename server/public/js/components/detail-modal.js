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
      selectedDetailIndexes: [],
      selectedMainIndexes: [],
      dragImageUrl: '',
      dragSourceIdx: -1,
      dragSourceField: '',
      dragOverSkuIdx: -1,
      dragOverSkuImgIdx: -1,
      _scrollTimer: null,
      batchFind: '',
      batchReplace: '',
      showBatchReplace: false,
      showPriceFormula: false,
      priceFormulas: [],
      saving: false,
      _batchHideTimer: null,
      // 新增：对标店小秘
      storeName: '',
      variantAttrName: '颜色',
      productNo: '',
      // 变种属性可选名称列表
      attrNameOptions: ['颜色', '尺码', '款式', '材质', '图案', '领型', '包装', '风格', '适用季节', '厚度'],
      // 店铺列表
      storeOptions: ['Frotel', 'Tralli', 'Koetun', 'Xpoine', 'Zondon', 'Prozzen', 'yandonghuoduoduo', 'Smiertl', 'APrioX'],
      // 图片尺寸缓存
      imageSizeCache: {},
      _imgSizeTimer: null
    };
  },
  mounted: function () {
    var vm = this;
    fetch('/api/settings/price_formulas')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.value) {
          try { vm.priceFormulas = JSON.parse(data.value); } catch (e) {}
        }
        if (!vm.priceFormulas.length) {
          vm.priceFormulas = [{ min: 0, max: 50, expr: 'price * 3' }, { min: 50, max: 100, expr: 'price * 2.5' }, { min: 100, max: 9999, expr: 'price * 2' }];
        }
      })
      .catch(function () {
        vm.priceFormulas = [{ min: 0, max: 50, expr: 'price * 3' }, { min: 50, max: 100, expr: 'price * 2.5' }, { min: 100, max: 9999, expr: 'price * 2' }];
      });
  },
  watch: {
    detail: function (val) {
      if (val) {
        this.editable = JSON.parse(JSON.stringify(val));
        (this.editable.skus || []).forEach(function (s) {
          if (!s.customName && s.name) s.customName = s.name;
          if (!s.dimensions || !s.dimensions.length) s.dimensions = ['', '', ''];
          while (s.dimensions.length < 3) s.dimensions.push('');
          if (s.sellPrice === undefined) s.sellPrice = '';
          if (s.sku === undefined) s.sku = '';
          if (s.skuCategory === undefined) s.skuCategory = '';
        });
        // 初始化新增字段
        this.storeName = val.storeName || val.store_name || '';
        this.variantAttrName = val.variantAttrName || val.variant_attr_name || '颜色';
        this.productNo = val.productNo || val.product_no || '';
        this.imageSizeCache = {};
        // 自动计算售价（仅对尚未设置售价的 SKU）
        var vm = this;
        vm.$nextTick(function () {
          if (vm.priceFormulas.length) {
            (vm.editable.skus || []).forEach(function (s) {
              if (!s.sellPrice && s.price) vm.calcSellPrice(s);
            });
          }
        });
        // 主图选中状态
        var savedMain = [];
        var mainImgs = val.main_images || [];
        var normalizedMain = [];
        mainImgs.forEach(function (item, i) {
          if (typeof item === 'string') {
            normalizedMain.push(item);
          } else if (item && item.url) {
            normalizedMain.push(item.url);
            if (item._selected) savedMain.push(i);
          }
        });
        this.editable.main_images = normalizedMain;
        this.selectedMainIndexes = savedMain.length > 0 ? savedMain : normalizedMain.map(function (_, i) { return i; });
        // SKU选中状态
        var saved = (val.skus || [])
          .map(function (s, i) { return s._selected ? i : -1; })
          .filter(function (i) { return i >= 0; });
        if (saved.length > 0) {
          this.selectedSkuIndexes = saved;
        } else {
          this.selectedSkuIndexes = (val.skus || []).map(function (_, i) { return i; });
        }
        // 详情图选中状态
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
    },
    'editable.skus': {
      handler: function () {},
      deep: true
    }
  },
  computed: {
    skuImages: function () {
      if (!this.editable || !this.editable.skus) return [];
      var imgs = [];
      this.editable.skus.forEach(function (s, i) {
        if (s.image) {
          imgs.push({ url: s.image, skuIndex: i });
        }
      });
      return imgs;
    },
    allSkuSelected: function () {
      if (!this.editable || !this.editable.skus || !this.editable.skus.length) return false;
      return this.selectedSkuIndexes.length === this.editable.skus.length;
    },
    originCategory: function () {
      if (!this.editable || !this.editable.category) return '-';
      return this.editable.category.leafCategoryName || this.editable.category.categoryPath || '-';
    },
    // 从 SKU 提取变种属性值（去重），实时响应 customName 变化
    variantAttrValues: function () {
      if (!this.editable || !this.editable.skus) return [];
      var seen = {};
      var values = [];
      (this.editable.skus || []).forEach(function (s) {
        var name = (s.customName || '').trim();
        if (name && !seen[name]) {
          seen[name] = true;
          values.push(name);
        }
      });
      return values;
    }
  },
  methods: {
    toggleMainImage: function (idx) {
      var pos = this.selectedMainIndexes.indexOf(idx);
      if (pos >= 0) this.selectedMainIndexes.splice(pos, 1);
      else this.selectedMainIndexes.push(idx);
    },
    isMainImageChecked: function (idx) {
      return this.selectedMainIndexes.indexOf(idx) >= 0;
    },
    toggleAllMainImages: function (checked) {
      if (checked) {
        this.selectedMainIndexes = (this.editable.main_images || []).map(function (_, i) { return i; });
      } else {
        this.selectedMainIndexes = [];
      }
    },
    allMainSelected: function () {
      if (!this.editable || !this.editable.main_images || !this.editable.main_images.length) return false;
      return this.selectedMainIndexes.length === this.editable.main_images.length;
    },
    removeMainImage: function (idx) {
      this.selectedMainIndexes = this.selectedMainIndexes
        .filter(function (n) { return n !== idx; })
        .map(function (n) { return n > idx ? n - 1 : n; });
      this.editable.main_images.splice(idx, 1);
    },
    openAdd: function () {
      if (!this.editable) return;
      window.open('https://www.dianxiaomi.com/web/temu/add?collectId=' + this.editable.uid, '_blank');
    },
    close: function () { this.$emit('update:visible', false); },
    goToMeitu: function () {
      var vm = this;
      if (!vm.editable) return;
      var urls = [];
      var mainImgs = vm.editable.main_images || [];
      vm.selectedMainIndexes.forEach(function (i) { if (mainImgs[i]) urls.push(mainImgs[i]); });
      var detailImgs = vm.editable.detail_images || [];
      vm.selectedDetailIndexes.forEach(function (i) { if (detailImgs[i]) urls.push(detailImgs[i]); });
      var skuImgs = vm.skuImages || [];
      skuImgs.forEach(function (item) {
        if (vm.isSkuImageChecked(item) && item.url) urls.push(item.url);
      });
      if (!urls.length) { vm.$Message.warning('请先选中要处理的图片'); return; }
      // 存入 sessionStorage 供 meitu 页面读取
      try { sessionStorage.setItem('__meitu_pending_import', JSON.stringify(urls)); } catch (e) {}
      // 存储商品ID以便后续回写
      try { sessionStorage.setItem('__meitu_source_product', vm.editable.uid); } catch (e) {}
      vm.$root.showCollageModal = true;
    },
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
      if (pos >= 0) this.selectedSkuIndexes.splice(pos, 1);
      else this.selectedSkuIndexes.push(idx);
    },
    isSkuChecked: function (idx) {
      return this.selectedSkuIndexes.indexOf(idx) >= 0;
    },
    toggleSkuImage: function (item) {
      var pos = this.selectedSkuIndexes.indexOf(item.skuIndex);
      if (pos >= 0) this.selectedSkuIndexes.splice(pos, 1);
      else this.selectedSkuIndexes.push(item.skuIndex);
    },
    isSkuImageChecked: function (item) {
      return this.selectedSkuIndexes.indexOf(item.skuIndex) >= 0;
    },
    toggleDetailImage: function (idx) {
      var pos = this.selectedDetailIndexes.indexOf(idx);
      if (pos >= 0) this.selectedDetailIndexes.splice(pos, 1);
      else this.selectedDetailIndexes.push(idx);
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
      this.selectedDetailIndexes = this.selectedDetailIndexes
        .filter(function (n) { return n !== idx; })
        .map(function (n) { return n > idx ? n - 1 : n; });
      this.editable.detail_images.splice(idx, 1);
    },
    toggleStatus: function () {
      var vm = this;
      if (!vm.editable) return;
      var ns = vm.editable.status === 0 ? 1 : 0;
      fetch('/api/product/' + vm.editable.uid, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: ns })
      }).then(function () {
        vm.editable.status = ns;
        if (vm.detail) vm.detail.status = ns;
        vm.$emit('status-changed');
      }).catch(function () { vm.$Message.error('状态更新失败'); });
    },
    saveAndPublish: function () {
      var vm = this;
      if (!vm.editable) return;
      vm.$Message.loading({ content: '正在保存...', duration: 0 });
      vm.saveProductDxm(true).then(function () {
        vm.$Message.destroy();
        vm.$Message.success('保存成功，正在跳转发布...');
        vm.openAdd();
      }).catch(function () {
        vm.$Message.destroy();
        vm.$Message.error('保存失败');
      });
    },
    copyUrl: function () {
      var vm = this;
      if (!vm.editable) return;
      var url = location.origin + '/api/product/' + vm.editable.uid;
      navigator.clipboard.writeText(url).then(function () {
        vm.$Message.success('已复制');
      }).catch(function () { vm.$Message.error('复制失败'); });
    },
    saveProduct: function (silent) {
      var vm = this;
      if (!vm.editable) return Promise.resolve();
      if (!silent) vm.saving = true;
      var skus = JSON.parse(JSON.stringify(vm.editable.skus || []));
      skus.forEach(function (s, i) {
        s._selected = vm.selectedSkuIndexes.indexOf(i) >= 0;
      });
      var detailImages = (vm.editable.detail_images || []).map(function (url, i) {
        return { url: url, _selected: vm.selectedDetailIndexes.indexOf(i) >= 0 };
      });
      var mainImages = (vm.editable.main_images || []).map(function (url, i) {
        return { url: url, _selected: vm.selectedMainIndexes.indexOf(i) >= 0 };
      });
      var payload = {
        title: vm.editable.title,
        customCategory: vm.editable.customCategory,
        manualCategory: vm.editable.manualCategory,
        dxmCategory: vm.editable.customCategory ? undefined : '',
        mainImages: mainImages,
        descImages: vm.editable.desc_images,
        detailImages: detailImages,
        skus: skus,
        status: vm.editable.status
      };
      return fetch('/api/product/' + vm.editable.uid, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).then(function () {
        if (!silent) {
          vm.saving = false;
          vm.$Message.success('保存成功');
        }
        vm.$emit('status-changed');
      }).catch(function (e) {
        if (!silent) {
          vm.saving = false;
          vm.$Message.error('保存失败');
        }
        throw e;
      });
    },
    openPreview: function (imgs, idx) {
      this.$root.openPreview(imgs, idx);
    },
    onSkuImgEnter: function (url, e) {
      if (this.dragImageUrl) return;
      this.$root.$refs.thumbPreview.open(url, e);
    },
    onSkuImgMove: function (e) {
      if (this.dragImageUrl) return;
      this.$root.$refs.thumbPreview.move(e);
    },
    onSkuImgLeave: function () {
      this.$root.$refs.thumbPreview.close();
    },
    editImageWithMeitu: function (url, field, index) {
      try {
        sessionStorage.setItem('__meitu_edit_image', JSON.stringify({
          url: url,
          productId: this.editable ? this.editable.uid : '',
          field: field,
          index: index
        }));
      } catch (e) {}
      try { sessionStorage.setItem('__meitu_source_product', this.editable ? this.editable.uid : ''); } catch (e) {}
      this.$root.showCollageModal = true;
    },
    updateImageUrl: function (field, index, newUrl) {
      if (!this.editable) return;
      if (field === 'main_images' && this.editable.main_images) {
        this.$set(this.editable.main_images, index, newUrl);
      } else if (field === 'detail_images' && this.editable.detail_images) {
        this.$set(this.editable.detail_images, index, newUrl);
      } else if (field === 'sku_image' && this.editable.skus && this.editable.skus[index]) {
        this.$set(this.editable.skus[index], 'image', newUrl);
      }
    },
    // 拖拽替换SKU图
    onDragStart: function (url, field, idx, e) {
      if (e) {
        e.dataTransfer.setData('text/plain', url);
        e.dataTransfer.effectAllowed = 'move';
      }
      this.$root.$refs.thumbPreview.close();
      this.dragImageUrl = url;
      this.dragSourceField = field;
      this.dragSourceIdx = idx;
      var vm = this;
      vm._boundDragScroll = function (e) { vm.onDragScroll(e); };
      document.addEventListener('dragover', vm._boundDragScroll);
    },
    onDragEnd: function () {
      this.dragImageUrl = '';
      this.dragSourceField = '';
      this.dragSourceIdx = -1;
      this.dragOverSkuIdx = -1;
      this.dragOverSkuImgIdx = -1;
      clearInterval(this._scrollTimer);
      this._scrollTimer = null;
      if (this._boundDragScroll) {
        document.removeEventListener('dragover', this._boundDragScroll);
        this._boundDragScroll = null;
      }
    },
    onDragScroll: function (e) {
      var vm = this;
      if (!vm.dragImageUrl) return;
      var el = document.querySelector('.detail-modal-fullscreen .ivu-modal-body');
      if (!el) return;
      var rect = el.getBoundingClientRect();
      var y = e.clientY;
      var zone = 60;
      clearInterval(vm._scrollTimer);
      vm._scrollTimer = null;
      if (y < rect.top + zone) {
        vm._scrollTimer = setInterval(function () { el.scrollTop -= 8; }, 16);
      } else if (y > rect.bottom - zone) {
        vm._scrollTimer = setInterval(function () { el.scrollTop += 8; }, 16);
      }
    },
    isDragSource: function (field, idx) {
      return this.dragSourceField === field && this.dragSourceIdx === idx;
    },
    onSkuDragOver: function (idx, e) {
      e.preventDefault();
      this.dragOverSkuIdx = idx;
    },
    onSkuDragLeave: function (idx) {
      if (this.dragOverSkuIdx === idx) this.dragOverSkuIdx = -1;
    },
    onSkuDrop: function (idx, e) {
      if (e) e.preventDefault();
      if (!this.dragImageUrl || !this.editable || !this.editable.skus) return;
      this.$set(this.editable.skus[idx], 'image', this.dragImageUrl);
      this.$Message.success('SKU图已替换');
      this.dragImageUrl = '';
      this.dragSourceField = '';
      this.dragSourceIdx = -1;
      this.dragOverSkuIdx = -1;
      this.dragOverSkuImgIdx = -1;
    },
    onSkuImgDragOver: function (imgIdx, e) {
      e.preventDefault();
      this.dragOverSkuImgIdx = imgIdx;
    },
    onSkuImgDragLeave: function (imgIdx) {
      if (this.dragOverSkuImgIdx === imgIdx) this.dragOverSkuImgIdx = -1;
    },
    onSkuImgDrop: function (item, imgIdx, e) {
      if (e) e.preventDefault();
      if (!this.dragImageUrl || !this.editable || !this.editable.skus) return;
      var vm = this;
      var oldUrl = item.url;
      var count = 0;
      vm.editable.skus.forEach(function (s) {
        if (s.image === oldUrl) {
          vm.$set(s, 'image', vm.dragImageUrl);
          count++;
        }
      });
      vm.$Message.success('已替换 ' + count + ' 个SKU图');
      vm.dragImageUrl = '';
      vm.dragSourceField = '';
      vm.dragSourceIdx = -1;
      vm.dragOverSkuImgIdx = -1;
      vm.dragOverSkuIdx = -1;
    },
    openBatchReplace: function () {
      var vm = this;
      vm.showBatchReplace = true;
      if (!vm.batchFind && vm.editable && vm.editable.skus && vm.editable.skus.length) {
        vm.batchFind = vm.editable.skus[0].name || vm.editable.skus[0].customName || '';
      }
    },
    doBatchReplace: function () {
      var vm = this;
      if (!vm.batchFind) { vm.$Message.warning('请输入要查找的内容'); return; }
      if (!vm.editable || !vm.editable.skus) return;
      var count = 0;
      vm.editable.skus.forEach(function (s) {
        var name = s.customName || s.name || '';
        if (name.indexOf(vm.batchFind) >= 0) {
          s.customName = name.split(vm.batchFind).join(vm.batchReplace);
          count++;
        }
      });
      vm.$Message.success('替换完成，共 ' + count + ' 条');
      vm.showBatchReplace = false;
      vm.batchFind = '';
      vm.batchReplace = '';
    },
    scheduleBatchHide: function () {
      var vm = this;
      vm._batchHideTimer = setTimeout(function () { vm.showBatchReplace = false; }, 300);
    },
    clearBatchHide: function () {
      if (this._batchHideTimer) { clearTimeout(this._batchHideTimer); this._batchHideTimer = null; }
    },
    addFormulaRow: function () {
      this.priceFormulas.push({ min: 0, max: 9999, expr: 'price * 2' });
    },
    removeFormulaRow: function (idx) {
      this.priceFormulas.splice(idx, 1);
    },
    saveFormulas: function () {
      var vm = this;
      fetch('/api/settings/price_formulas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: JSON.stringify(vm.priceFormulas) })
      }).then(function (r) { return r.json(); }).then(function () {
        vm.$Message.success('公式已保存');
      }).catch(function () { vm.$Message.error('保存失败'); });
    },
    applyPriceFormula: function () {
      var vm = this;
      if (!vm.editable || !vm.editable.skus) return;
      var count = 0;
      vm.editable.skus.forEach(function (s) {
        if (vm.calcSellPrice(s)) count++;
      });
      vm.$Message.success('已计算 ' + count + ' 条售价');
    },
    calcSellPrice: function (sku) {
      var price = parseFloat(sku.price);
      if (isNaN(price) || price <= 0) return false;
      for (var i = 0; i < this.priceFormulas.length; i++) {
        var f = this.priceFormulas[i];
        if (price >= f.min && price < f.max) {
          try {
            var result = new Function('price', 'return ' + f.expr)(price);
            sku.sellPrice = Math.round(result * 100) / 100;
            return true;
          } catch (e) { return false; }
        }
      }
      return false;
    },
    // 获取图片尺寸
    getImageSize: function (url) {
      var vm = this;
      if (vm.imageSizeCache[url]) return vm.imageSizeCache[url];
      var img = new Image();
      img.onload = function () {
        vm.$set(vm.imageSizeCache, url, img.width + 'x' + img.height);
      };
      img.src = url;
      return '加载中';
    },
    // 生成 SKU 货号
    generateSkuNo: function () {
      if (!this.editable || !this.editable.skus) return;
      var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      this.editable.skus.forEach(function (s, i) {
        var code = '';
        for (var j = 0; j < 8; j++) {
          code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        s.sku = code;
      });
      this.$Message.success('已生成 ' + this.editable.skus.length + ' 个 SKU 货号');
    },
    // 保存方法（扩展）
    saveProductDxm: function (silent) {
      var vm = this;
      if (!vm.editable) return Promise.resolve();
      if (!silent) vm.saving = true;
      var skus = JSON.parse(JSON.stringify(vm.editable.skus || []));
      skus.forEach(function (s, i) {
        s._selected = vm.selectedSkuIndexes.indexOf(i) >= 0;
      });
      var detailImages = (vm.editable.detail_images || []).map(function (url, i) {
        return { url: url, _selected: vm.selectedDetailIndexes.indexOf(i) >= 0 };
      });
      var mainImages = (vm.editable.main_images || []).map(function (url, i) {
        return { url: url, _selected: vm.selectedMainIndexes.indexOf(i) >= 0 };
      });
      var payload = {
        title: vm.editable.title,
        customCategory: vm.editable.customCategory,
        manualCategory: vm.editable.manualCategory,
        dxmCategory: vm.editable.customCategory ? undefined : '',
        mainImages: mainImages,
        descImages: vm.editable.desc_images,
        detailImages: detailImages,
        skus: skus,
        status: vm.editable.status,
        storeName: vm.storeName,
        variantAttrName: vm.variantAttrName,
        productNo: vm.productNo
      };
      return fetch('/api/product/' + vm.editable.uid, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).then(function () {
        if (!silent) { vm.saving = false; vm.$Message.success('保存成功'); }
        vm.$emit('status-changed');
      }).catch(function (e) {
        if (!silent) { vm.saving = false; vm.$Message.error('保存失败'); }
        throw e;
      });
    }
  },
  template: `
    <modal v-model="visible" class="detail-modal-fullscreen" @on-cancel="close"
      fullscreen footer-hide>
      <template slot="header">
        <a v-if="editable && editable.source_url" :href="editable.source_url" target="_blank"
          style="font-size:16px;font-weight:600;color:var(--text-primary);text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer;transition:color .15s;display:flex;align-items:center;gap:6px"
          @mouseenter="$event.target.closest('a').style.color='var(--accent)'"
          @mouseleave="$event.target.closest('a').style.color='var(--text-primary)'">
          {{ editable ? (editable.title || ('商品 #' + editable.uid)) : '商品详情' }}
          <i class="ivu-icon ivu-icon-md-open" style="font-size:14px;opacity:.5"></i>
        </a>
        <span v-else style="font-size:16px;font-weight:600;color:var(--text-primary)">
          {{ editable ? (editable.title || ('商品 #' + editable.uid)) : '商品详情' }}
        </span>
      </template>
      <template v-if="editable">

        <!-- 基本信息（置顶） -->
        <div class="detail-section">
          <div class="detail-section-title">基本信息</div>
          <div class="info-grid">
            <span class="label">店铺名称</span><span class="value">
              <i-select v-model="storeName" style="width:300px" clearable placeholder="请选择店铺">
                <i-option v-for="s in storeOptions" :key="s" :value="s">{{ s }}</i-option>
              </i-select>
            </span>
            <span class="label">来源</span><span class="value">
              <a v-if="editable.source_url" :href="editable.source_url" target="_blank">{{ editable.source_url }}</a>
              <span v-else>-</span>
            </span>
            <span class="label">产品标题</span><span class="value">
              <i-input v-model="editable.title" type="textarea" :rows="2" style="width:600px;font-size:14px" />
            </span>
            <span class="label">选择分类</span><span class="value">
              <category-picker :value="editable.customCategory" :path="editable.manualCategory || ''" @input="function(v) { editable.customCategory = v; if (!v) { editable.manualCategory = ''; editable.dxmCategory = ''; } }" @path="function(p) { editable.manualCategory = p }" placeholder="搜索或选择分类" style="width:600px" />
            </span>
            <span class="label">1688类目</span><span class="value">
              <span style="color:var(--text-secondary);font-size:14px">{{ originCategory }}</span>
            </span>
            <span class="label">产品货号</span><span class="value">
              <i-input v-model="productNo" style="width:300px" placeholder="可选，自定义货号" />
            </span>
            <span class="label">状态</span><span class="value">
              <span :class="'status-tag ' + (editable.status === 0 ? 'status-unused' : 'status-used')">{{ editable.status === 0 ? '未发布' : '已发布' }}</span>
            </span>
            <span class="label">采集时间</span><span class="value">{{ editable.created_at || '-' }}</span>
          </div>
        </div>

        <!-- 产品轮播图（可选用，显示尺寸） -->
        <div class="detail-section" v-if="editable.main_images && editable.main_images.length">
          <div class="detail-section-title">
            产品轮播图 ({{ editable.main_images.length }})
            <checkbox :value="allMainSelected()" @on-change="toggleAllMainImages" style="margin-left:12px;vertical-align:middle"></checkbox>
            <span style="font-size:12px;color:var(--text-muted);margin-left:4px;vertical-align:middle">全选</span>
            <span style="font-size:12px;color:var(--text-muted);margin-left:12px">选用 {{ selectedMainIndexes.length }} 张</span>
          </div>
          <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px;padding-left:2px">
            比例1:1，不小于800×800，最多选用10张
          </div>
          <div class="img-grid">
            <div class="img-item sku-img-checkable" v-for="(url, i) in editable.main_images" :key="'m'+i"
              :class="{ 'sku-img-unchecked': !isMainImageChecked(i), 'img-drag-source': isDragSource('main', i) }"
              draggable="true"
              @dragstart="onDragStart(url, 'main', i, $event)"
              @dragend="onDragEnd"
              @click="toggleMainImage(i)">
              <img :src="url" loading="lazy"
                @mouseenter="onSkuImgEnter(url, $event)"
                @mousemove="onSkuImgMove($event)"
                @mouseleave="onSkuImgLeave" />
              <div class="sku-img-check">
                <checkbox :value="isMainImageChecked(i)" @click.native.stop></checkbox>
              </div>
              <div class="img-dim-label" :title="getImageSize(url)">{{ imageSizeCache[url] || '...' }}</div>
              <div class="img-action img-edit" @click.stop="editImageWithMeitu(url, 'main_images', i)" title="编辑图片">✎</div>
              <div class="img-del" @click.stop="removeMainImage(i)">&times;</div>
            </div>
          </div>
        </div>

        <!-- 详情图（可勾选） -->
        <div class="detail-section" v-if="editable.detail_images && editable.detail_images.length">
          <div class="detail-section-title">
            详情图 ({{ editable.detail_images.length }})
            <checkbox :value="allDetailSelected()" @on-change="toggleAllDetailImages" style="margin-left:12px;vertical-align:middle"></checkbox>
            <span style="font-size:12px;color:var(--text-muted);margin-left:4px;vertical-align:middle">全选</span>
          </div>
          <div class="img-grid">
            <div class="img-item sku-img-checkable" v-for="(url, i) in editable.detail_images" :key="'di'+i"
              :class="{ 'sku-img-unchecked': !isDetailImageChecked(i), 'img-drag-source': isDragSource('detail', i) }"
              draggable="true"
              @dragstart="onDragStart(url, 'detail', i, $event)"
              @dragend="onDragEnd"
              @click="toggleDetailImage(i)">
              <img :src="url" loading="lazy"
                @mouseenter="onSkuImgEnter(url, $event)"
                @mousemove="onSkuImgMove($event)"
                @mouseleave="onSkuImgLeave" />
              <div class="sku-img-check">
                <checkbox :value="isDetailImageChecked(i)" @click.native.stop></checkbox>
              </div>
              <div class="img-action img-edit" @click.stop="editImageWithMeitu(url, 'detail_images', i)" title="编辑图片">✎</div>
              <div class="img-del" @click.stop="removeDetailImage(i)">&times;</div>
            </div>
          </div>
        </div>

        <!-- SKU图（可勾选，关联SKU列表，可拖拽替换） -->
        <div class="detail-section" v-if="skuImages.length">
          <div class="detail-section-title">SKU图 ({{ skuImages.length }}) <span v-if="dragImageUrl" style="font-size:12px;color:var(--accent);font-weight:400;margin-left:8px">← 拖拽主图/详情图到此处替换</span></div>
          <div class="img-grid">
            <div class="img-item sku-img-checkable sku-img-card" v-for="(item, i) in skuImages" :key="'si'+i"
              :class="{ 'sku-img-unchecked': !isSkuImageChecked(item), 'img-drag-over': dragOverSkuImgIdx === i }"
              @dragover="onSkuImgDragOver(i, $event)"
              @dragleave="onSkuImgDragLeave(i)"
              @drop="onSkuImgDrop(item, i, $event)"
              @click="toggleSkuImage(item)">
              <img :src="item.url" loading="lazy"
                @mouseenter="onSkuImgEnter(item.url, $event)"
                @mousemove="onSkuImgMove($event)"
                @mouseleave="onSkuImgLeave" />
              <div class="sku-img-check">
                <checkbox :value="isSkuImageChecked(item)" @click.native.stop></checkbox>
              </div>
              <div class="img-action img-edit" @click.stop="editImageWithMeitu(item.url, 'sku_image', item.skuIndex)" title="编辑图片">✎</div>
              <div class="sku-img-label">{{ editable.skus[item.skuIndex].name || editable.skus[item.skuIndex].customName || '' }}</div>
            </div>
          </div>
        </div>

        <!-- 描述图 -->
        <div class="detail-section" v-if="editable.desc_images && editable.desc_images.length">
          <div class="detail-section-title">描述图 ({{ editable.desc_images.length }})</div>
          <div class="img-grid">
            <div class="img-item" v-for="(url, i) in editable.desc_images" :key="'d'+i"
              @click="openPreview(editable.desc_images, i)">
              <img :src="url" loading="lazy" />
            </div>
          </div>
        </div>

        <!-- 变种属性（属性名下拉 + 值从SKU提取） -->
        <div class="detail-section">
          <div class="detail-section-title">
            <span style="display:inline-flex;align-items:center;gap:8px">
              <span>变种属性</span>
              <i-select v-model="variantAttrName" style="width:120px" size="small">
                <i-option v-for="n in attrNameOptions" :key="n" :value="n">{{ n }}</i-option>
              </i-select>
              <span style="font-size:12px;color:var(--text-muted);font-weight:400">({{ variantAttrValues.length }} 个值)</span>
            </span>
          </div>
          <div v-if="variantAttrValues.length" class="attr-tags">
            <span class="attr-tag" v-for="(v, i) in variantAttrValues" :key="'av'+i">{{ v }}</span>
          </div>
          <div v-else style="color:var(--text-muted);font-size:13px;padding:4px 0">暂无变种属性值</div>
          <!-- 原始属性标签（如果有） -->
          <div v-if="editable.attrs && editable.attrs.length" style="margin-top:8px">
            <div style="font-size:12px;color:var(--text-muted);margin-bottom:4px">原始属性 ({{ editable.attrs.length }})</div>
            <div class="attr-tags">
              <span class="attr-tag attr-tag-muted" v-for="(a, i) in editable.attrs" :key="'a'+i">{{ a }}</span>
            </div>
          </div>
        </div>

        <!-- SKU 列表（带复选框 + 可编辑） -->
        <div class="detail-section" style="position:relative">
          <div class="detail-section-title">SKU ({{ editable.skus ? editable.skus.length : 0 }})</div>
          <!-- 批量替换气泡（放在section层级避免被overflow裁剪） -->
          <div class="batch-popover batch-popover-float" v-if="showBatchReplace"
            @mouseenter="clearBatchHide" @mouseleave="scheduleBatchHide">
            <div style="margin-bottom:6px">
              <span style="font-size:12px;color:var(--text-secondary)">查找内容</span>
              <i-input v-model="batchFind" size="small" placeholder="要替换的文本" style="margin-top:4px" />
            </div>
            <div style="margin-bottom:8px">
              <span style="font-size:12px;color:var(--text-secondary)">替换为</span>
              <i-input v-model="batchReplace" size="small" placeholder="替换后的文本" style="margin-top:4px" />
            </div>
            <i-button type="primary" size="small" long @click="doBatchReplace">执行替换</i-button>
          </div>
          <div v-if="editable.skus && editable.skus.length" class="detail-sku-scroll">
            <table class="sku-table" :class="{ 'sku-dragging': dragImageUrl }">
              <thead><tr>
                <th class="sku-check-col"><checkbox :value="allSkuSelected" @on-change="toggleSkuAll"></checkbox></th>
                <th>图片</th><th>SKU名称</th>
                <th>自定义名称 <span class="th-action" @click="openBatchReplace" @mouseenter="clearBatchHide" @mouseleave="scheduleBatchHide">批量替换</span></th><th>进价</th><th>售价 <span style="margin-left:6px;font-size:11px;font-weight:400"><a style="color:var(--success);cursor:pointer" @click="applyPriceFormula">自动计算</a><span style="color:var(--border);margin:0 4px">|</span><a style="color:var(--text-muted);cursor:pointer" @click="showPriceFormula=true">公式设置</a></span></th><th>尺寸(cm)</th><th>重量</th>
              </tr></thead>
              <tbody>
                <tr v-for="(sku, i) in editable.skus" :key="'s'+i" :class="{ 'sku-row-checked': isSkuChecked(i) }">
                  <td class="sku-check-col"><checkbox :value="isSkuChecked(i)" @on-change="toggleSkuItem(i)"></checkbox></td>
                  <td class="sku-img-drop" :class="{ 'img-drag-over': dragOverSkuIdx === i }"
                    @dragover="onSkuDragOver(i, $event)"
                    @dragleave="onSkuDragLeave(i)"
                    @drop="onSkuDrop(i, $event)">
                    <img v-if="sku.image" :src="sku.image" loading="lazy"
                      @mouseenter="onSkuImgEnter(sku.image, $event)"
                      @mousemove="onSkuImgMove($event)"
                      @mouseleave="onSkuImgLeave" />
                    <span v-else class="sku-img-placeholder">拖图替换</span>
                  </td>
                  <td>{{ sku.name || '-' }}</td>
                  <td><i-input v-model="sku.customName" :placeholder="sku.name || '-'" style="width:200px" /></td>
                  <td><i-input v-model="sku.price" type="number" number style="width:100px" @on-change="calcSellPrice(sku)" /></td>
                  <td><i-input v-model="sku.sellPrice" type="number" number placeholder="售价" style="width:100px" /></td>
                  <td style="min-width:340px">
                    <div style="display:flex;justify-content:space-around;align-items:center">
                      <i-input v-model="sku.dimensions[0]" type="number" number style="width:100px" />
                      <span style="color:var(--text-muted);padding:0 2px">×</span>
                      <i-input v-model="sku.dimensions[1]" type="number" number style="width:100px" />
                      <span style="color:var(--text-muted);padding:0 2px">×</span>
                      <i-input v-model="sku.dimensions[2]" type="number" number style="width:100px" />
                    </div>
                  </td>
                  <td><i-input v-model="sku.weight" type="number" number style="width:80px" /></td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-else class="detail-sku-empty">暂无SKU数据</div>
        </div>

        <!-- 底部固定操作栏 -->
        <div class="detail-footer-fixed">
          <i-button type="primary" icon="md-checkmark" :loading="saving" @click="saveProductDxm()">保存</i-button>
          <i-button type="success" icon="md-paper-plane" @click="saveAndPublish">保存并发布</i-button>
          <i-button type="warning" icon="md-images" @click="goToMeitu">小秘美图</i-button>
          <i-button :type="editable.status === 0 ? 'success' : 'error'" @click="toggleStatus">
            {{ editable.status === 0 ? '标记已发布' : '标记未发布' }}
          </i-button>
          <i-button icon="md-close" @click="close">关闭</i-button>
        </div>

        <!-- 价格公式配置 -->
        <modal v-model="showPriceFormula" title="售价公式配置" width="520" footer-hide>
          <div style="margin-bottom:12px;font-size:13px;color:var(--text-secondary)">
            根据进价区间自动计算售价，公式中用 <code>price</code> 代表进价。
            如：<code>price * 3</code>、<code>price * 2.5 + 5</code>
          </div>
          <div v-for="(f, i) in priceFormulas" :key="i" style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
            <i-input v-model="f.min" type="number" number size="small" style="width:80px" placeholder="最低" />
            <span style="color:var(--text-muted)">~</span>
            <i-input v-model="f.max" type="number" number size="small" style="width:80px" placeholder="最高" />
            <span style="color:var(--text-muted)">=</span>
            <i-input v-model="f.expr" size="small" style="flex:1" placeholder="price * 2.5" />
            <i-button size="small" type="error" icon="md-trash" @click="removeFormulaRow(i)"></i-button>
          </div>
          <div style="display:flex;gap:8px;margin-top:12px">
            <i-button size="small" icon="md-add" @click="addFormulaRow">添加区间</i-button>
            <i-button type="primary" size="small" @click="saveFormulas">保存公式</i-button>
            <i-button type="success" size="small" @click="applyPriceFormula">应用公式</i-button>
          </div>
        </modal>
      </template>
    </modal>`
});
