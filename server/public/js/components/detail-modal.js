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
      // selectedSkuImgIndexes removed - linked with SKU list
      // 图片选择弹窗
      showImagePicker: false,
      imagePickerTarget: null,  // { type:'sku'|'variant', skuIndex, attrIdx, valueIdx }
      imagePickerTempUrl: null,
      // 变种属性编辑状态
      editingVariantValue: null,  // { attrIdx, valueIdx, tempName }
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
      storeName: 'Prozzen',
      showMoreInfo: false,
      variantAttrName: '颜色',
      productNo: '',
      variantAttrs: [
        { name: '颜色', values: [], images: {}, _newVal: '' },
        { name: '', values: [], images: {}, _newVal: '' }
      ],
      // 变种属性可选名称（对标店小秘，根据分类动态变化，这里放通用集合）
      attrNameOptions: ['颜色', '风格', '材质', '口味', '适用人群', '容量', '成分', '重量', '品类', '数量', '型号', '头发长度', '被套尺码', 'RAM+ROM', '存储容量', '厚被尺码', '手机型号'],
      // 店铺列表
      storeOptions: ['Frotel', 'Tralli', 'Koetun', 'Xpoine', 'Zondon', 'Prozzen', 'yandonghuoduoduo', 'Smiertl', 'APrioX'],
      // 图片尺寸缓存
      imageSizeCache: {},
      replacingBg: false,
      _imgSizeTimer: null,
      // 添加图片粘贴模式
      addingImage: false,
      _addImgPasteHandler: null,
      _addImgEscHandler: null,
      _addImgTimer: null,
      // SKU图片批量替换
      showSkuBatchModal: false,
      skuBatchSlots: [],
      skuBatchSelectedSlot: -1,
      skuBatchSelectedImage: ''
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
        this.storeName = val.storeName || val.store_name || 'Prozzen';
        this.variantAttrName = val.variantAttrName || val.variant_attr_name || '颜色';
        this.productNo = val.productNo || val.product_no || '';
        this.imageSizeCache = {};
        // 只从 SKU name 拆分第一个变种属性值，第二个及之后默认为空
        var part1 = {};
        (this.editable.skus || []).forEach(function (s) {
          var fullName = (s.customName || s.name || '').trim();
          if (fullName && !part1[fullName]) part1[fullName] = true;
        });
        this.variantAttrs = [
          { name: val.variantAttrName || val.variant_attr_name || '颜色', values: Object.keys(part1), images: {}, _newVal: '' },
          { name: val.variantAttrName2 || '', values: [], images: {}, _newVal: '' }
        ];
        // 恢复变种属性图片缓存
        try {
          var savedImages = val.variantAttrImages || {};
          if (typeof savedImages === 'string') savedImages = JSON.parse(savedImages);
          this.variantAttrs.forEach(function (va, vi) {
            if (savedImages[vi]) va.images = JSON.parse(JSON.stringify(savedImages[vi]));
          });
        } catch (e) {}
        // 自动为变种属性值匹配 SKU 图片
        var vm = this;
        vm.variantAttrs.forEach(function (va, vi) {
          va.values.forEach(function (val) {
            if (!va.images[val]) {
              (vm.editable.skus || []).forEach(function (s) {
                var fullName = (s.customName || s.name || '').trim();
                var parts = fullName.split(/\s*\/\s*|\s+/);
                if (parts[vi] === val && s.image) {
                  va.images[val] = s.image;
                }
              });
            }
          });
        });
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
        // SKU图片独立选中（全选）
// SKU image selection uses selectedSkuIndexes (linked)
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
  directives: {
    focus: {
      inserted: function (el) { el.focus(); }
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
    // 下拉选项：过滤掉另一个已选的属性名（互斥）
    getFilteredOptions: function () {
      var vm = this;
      var all = vm.attrNameOptions;
      return function (index) {
        var usedNames = vm.variantAttrs.filter(function (va, i) { return i !== index && va.name; }).map(function (va) { return va.name; });
        return all.filter(function (n) { return usedNames.indexOf(n) < 0; });
      };
    },
    skuBatchAllImages: function () {
      if (!this.editable) return [];
      var imgs = [];
      var seen = {};
      (this.editable.main_images || []).forEach(function (url) {
        if (url && !seen[url]) { seen[url] = true; imgs.push(url); }
      });
      (this.editable.detail_images || []).forEach(function (url) {
        if (url && !seen[url]) { seen[url] = true; imgs.push(url); }
      });
      (this.editable.skus || []).forEach(function (s) {
        if (s.image && !seen[s.image]) { seen[s.image] = true; imgs.push(s.image); }
      });
      return imgs;
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
    // ===== 变种属性：属性名变更时同步SKU自定义属性 =====
    onVariantNameChange: function (attrIdx) {
      // 仅用于UI显示，实际数据存储在variantAttrs[attrIdx].name中
      var vm = this;
      vm.rebuildSkusFromVariants();
    },
    // ===== 变种属性：勾选（关联SKU列表）=====
    isVariantValueChecked: function (attrIdx, value) {
      var vm = this;
      if (!vm.editable || !vm.editable.skus) return false;
      var checked = false;
      vm.editable.skus.forEach(function (s, i) {
        var fullName = (s.customName || s.name || '').trim();
        var parts = fullName.split(/\s*\/\s*|\s+/);
        if (parts[attrIdx] === value && vm.isSkuChecked(i)) checked = true;
      });
      return checked;
    },
    addVariantValue: function (attrIdx) {
      var vm = this;
      var newVal = prompt('输入新属性值');
      if (!newVal || !newVal.trim()) return;
      newVal = newVal.trim();
      var va = vm.variantAttrs[attrIdx];
      if (!va) return;
      if (va.values.indexOf(newVal) >= 0) { vm.$Message.warning('属性值已存在'); return; }
      va.values.push(newVal);
    },
    toggleVariantValue: function (attrIdx, value, checked) {
      var vm = this;
      if (!vm.editable || !vm.editable.skus) return;
      vm.editable.skus.forEach(function (s, i) {
        var fullName = (s.customName || s.name || '').trim();
        var parts = fullName.split(/\s*\/\s*|\s+/);
        if (parts[attrIdx] === value) {
          var pos = vm.selectedSkuIndexes.indexOf(i);
          if (checked && pos < 0) vm.selectedSkuIndexes.push(i);
          else if (!checked && pos >= 0) vm.selectedSkuIndexes.splice(pos, 1);
        }
      });
    },
    // ===== 变种属性：编辑属性值 =====
    startEditVariantValue: function (attrIdx, valueIdx) {
      var va = this.variantAttrs[attrIdx];
      if (!va || valueIdx >= va.values.length) return;
      this.editingVariantValue = { attrIdx: attrIdx, valueIdx: valueIdx, tempName: va.values[valueIdx] };
    },
    confirmEditVariantValue: function () {
      var ev = this.editingVariantValue;
      if (!ev) return;
      var va = this.variantAttrs[ev.attrIdx];
      if (!va) { this.editingVariantValue = null; return; }
      var oldVal = va.values[ev.valueIdx];
      var newVal = ev.tempName.trim();
      if (!newVal) { this.editingVariantValue = null; return; }
      if (newVal === oldVal) { this.editingVariantValue = null; return; }
      // 同步修改 SKU customName 中对应位置的值
      var vm = this;
      (vm.editable.skus || []).forEach(function (s) {
        var fullName = (s.customName || s.name || '').trim();
        var parts = fullName.split(/\s*\/\s*|\s+/);
        if (parts[ev.attrIdx] === oldVal) {
          parts[ev.attrIdx] = newVal;
          s.customName = parts.join(' / ');
        }
      });
      // 更新变种属性值
      vm.$set(va.values, ev.valueIdx, newVal);
      // 迁移图片映射
      if (va.images[oldVal] !== undefined) {
        vm.$set(va.images, newVal, va.images[oldVal]);
        vm.$delete(va.images, oldVal);
      }
      vm.editingVariantValue = null;
      // 同步重建SKU列表
      vm.rebuildSkusFromVariants();
    },
    cancelEditVariantValue: function () {
      this.editingVariantValue = null;
    },
    // ===== 变种属性：图片操作 =====
    setVariantImage: function (attrIdx, value, url) {
      var va = this.variantAttrs[attrIdx];
      if (!va) return;
      this.$set(va.images, value, url);
    },
    removeVariantImage: function (attrIdx, value) {
      var va = this.variantAttrs[attrIdx];
      if (!va) return;
      this.$delete(va.images, value);
    },
    // ===== 变种属性：添加/删除属性组 =====
    addVariantAttr: function () {
      var vm = this;
      // 最多支持 3 个变种属性
      if (vm.variantAttrs.length >= 3) { vm.$Message.warning('最多支持3个变种属性'); return; }
      vm.variantAttrs.push({ name: '', values: [], images: {}, _newVal: '' });
    },
    removeVariantAttr: function (attrIdx) {
      var vm = this;
      if (attrIdx === 0) return; // 不允许删除第一个
      vm.variantAttrs.splice(attrIdx, 1);
      vm.rebuildSkusFromVariants();
    },
    addVariantValueFromInput: function (attrIdx) {
      var vm = this;
      var va = vm.variantAttrs[attrIdx];
      if (!va || !va.name) return;
      var newVal = (va._newVal || '').trim();
      if (!newVal) return;
      if (va.values.indexOf(newVal) >= 0) { vm.$Message.warning('属性值已存在'); return; }
      va.values.push(newVal);
      vm.$set(va, '_newVal', '');
      vm.rebuildSkusFromVariants();
    },
    removeVariantValue: function (attrIdx, valueIdx) {
      var vm = this;
      var va = vm.variantAttrs[attrIdx];
      if (!va || valueIdx >= va.values.length) return;
      va.values.splice(valueIdx, 1);
      vm.rebuildSkusFromVariants();
    },
    // ===== SKU列表与变种属性联动：笛卡尔积重建 =====
    rebuildSkusFromVariants: function () {
      var vm = this;
      if (!vm.editable || !vm.editable.skus) return;
      // 收集所有有值的变种属性
      var activeAttrs = [];
      vm.variantAttrs.forEach(function (va) {
        if (va.values.length > 0) activeAttrs.push(va);
      });
      // 没有任何变种属性值，不动
      if (activeAttrs.length === 0) return;
      // 生成笛卡尔积
      var combos = activeAttrs[0].values.map(function (v) { return [v]; });
      for (var ai = 1; ai < activeAttrs.length; ai++) {
        var newCombos = [];
        activeAttrs[ai].values.forEach(function (v) {
          combos.forEach(function (c) { newCombos.push(c.concat(v)); });
        });
        combos = newCombos;
      }
      // 匹配现有SKU的图片/价格/重量等数据
      var oldSkus = vm.editable.skus.slice();
      var dimDefault = ['', '', ''];
      if (oldSkus.length > 0 && oldSkus[0].dimensions) dimDefault = oldSkus[0].dimensions.slice();
      var getOldMatch = function (combo) {
        // 构建查找key：按属性位置匹配
        for (var oi = 0; oi < oldSkus.length; oi++) {
          var s = oldSkus[oi];
          var full = (s.customName || s.name || '').trim();
          var parts = full.split(/\s*\/\s*|\s+/);
          var match = true;
          for (var ci = 0; ci < combo.length; ci++) {
            if (parts[ci] !== combo[ci]) { match = false; break; }
          }
          if (match) return s;
        }
        return null;
      };
      // 建新SKU列表
      var newSkus = combos.map(function (combo) {
        var old = getOldMatch(combo);
        return {
          name: combo.join(' / '),
          customName: combo.join(' / '),
          image: old ? old.image : '',
          price: old ? old.price : 0,
          sellPrice: old ? old.sellPrice : 0,
          dimensions: old && old.dimensions ? old.dimensions.slice() : dimDefault.slice(),
          size: old ? old.size : '',
          weight: old ? old.weight : ''
        };
      });
      vm.editable.skus = newSkus;
      // 清理无效选中
      vm.selectedSkuIndexes = vm.selectedSkuIndexes.filter(function (i) { return i < newSkus.length; });
    },
    // ===== 图片选择弹窗 =====
    openImagePicker: function (target) {
      this.imagePickerTarget = target;
      this.imagePickerTempUrl = null;
      this.showImagePicker = true;
    },
    onImagePickerSelect: function (url) {
      this.imagePickerTempUrl = url;
    },
    confirmImagePicker: function () {
      var t = this.imagePickerTarget;
      if (!t || !this.imagePickerTempUrl) { this.showImagePicker = false; this.imagePickerTarget = null; return; }
      if (t.type === 'sku') {
        this.$set(this.editable.skus[t.skuIndex], 'image', this.imagePickerTempUrl);
      } else if (t.type === 'variant') {
        this.setVariantImage(t.attrIdx, t.valueName, this.imagePickerTempUrl);
      }
      this.showImagePicker = false;
      this.imagePickerTarget = null;
      this.imagePickerTempUrl = null;
    },
    onImagePickerClose: function () {
      this.showImagePicker = false;
      this.imagePickerTarget = null;
      this.imagePickerTempUrl = null;
    },
    // ===== SKU列表图片删除/替换 =====
    removeSkuImage: function (skuIndex) {
      if (!this.editable || !this.editable.skus || !this.editable.skus[skuIndex]) return;
      this.$set(this.editable.skus[skuIndex], 'image', '');

    },
    onSkuImgDropReplace: function (skuIndex, e) {
      if (e) e.preventDefault();
      if (!this.dragImageUrl || !this.editable || !this.editable.skus) return;
      this.$set(this.editable.skus[skuIndex], 'image', this.dragImageUrl);
      this.$Message.success('SKU图已替换');
      this.dragImageUrl = '';
      this.dragSourceField = '';
      this.dragSourceIdx = -1;
      this.dragOverSkuIdx = -1;
    },
    // ===== SKU图片批量替换 =====
    openSkuBatchModal: function () {
      var vm = this;
      if (!vm.editable || !vm.editable.skus || !vm.editable.skus.length) return;
      // Build slots from all SKU items
      vm.skuBatchSlots = vm.editable.skus.map(function (s, i) {
        return { skuIndex: i, name: s.customName || s.name || ('SKU' + (i + 1)), image: s.image || '' };
      });
      vm.skuBatchSelectedSlot = -1;
      vm.skuBatchSelectedImage = '';
      vm.showSkuBatchModal = true;
    },
    skuBatchSelectSlot: function (si) {
      var vm = this;
      if (si < 0 || si >= vm.skuBatchSlots.length) return;
      // If an image is selected and slot is empty, fill it
      if (vm.skuBatchSelectedImage && !vm.skuBatchSlots[si].image) {
        vm.$set(vm.skuBatchSlots[si], 'image', vm.skuBatchSelectedImage);
        // Auto-advance to next empty slot
        vm.skuBatchSelectedSlot = -1;
        vm.skuBatchSelectedImage = '';
        var nextEmpty = vm.skuBatchSlots.findIndex(function (s) { return !s.image; });
        if (nextEmpty >= 0) vm.skuBatchSelectedSlot = nextEmpty;
        return;
      }
      vm.skuBatchSelectedSlot = si;
    },
    skuBatchSelectImage: function (url) {
      var vm = this;
      vm.skuBatchSelectedImage = url;
      // If a slot is selected and empty, fill it
      if (vm.skuBatchSelectedSlot >= 0 && !vm.skuBatchSlots[vm.skuBatchSelectedSlot].image) {
        vm.$set(vm.skuBatchSlots[vm.skuBatchSelectedSlot], 'image', url);
        // Auto-advance to next empty slot
        var nextEmpty = vm.skuBatchSlots.findIndex(function (s, idx) { return idx > vm.skuBatchSelectedSlot && !s.image; });
        if (nextEmpty === -1) nextEmpty = vm.skuBatchSlots.findIndex(function (s) { return !s.image; });
        vm.skuBatchSelectedSlot = nextEmpty;
        vm.skuBatchSelectedImage = '';
        return;
      }
    },
    skuBatchRemoveSlotImage: function (si) {
      if (si < 0 || si >= this.skuBatchSlots.length) return;
      this.$set(this.skuBatchSlots[si], 'image', '');
      this.skuBatchSelectedSlot = si;
    },
    confirmSkuBatch: function () {
      var vm = this;
      var changed = 0;
      vm.skuBatchSlots.forEach(function (slot) {
        var sku = vm.editable.skus[slot.skuIndex];
        if (sku && sku.image !== slot.image) {
          vm.$set(sku, 'image', slot.image);
          changed++;
        }
      });
      vm.showSkuBatchModal = false;
      if (changed > 0) {
        vm.$Message.success(changed + ' 张SKU图片已替换');
      }
    },

    // ===== 图片选择弹窗用的图片列表 =====
    imagePickerImages: function () {
      if (!this.editable) return [];
      var imgs = [];
      var seen = {};
      // 主图
      (this.editable.main_images || []).forEach(function (url) {
        if (url && !seen[url]) { seen[url] = true; imgs.push(url); }
      });
      // 详情图
      (this.editable.detail_images || []).forEach(function (url) {
        if (url && !seen[url]) { seen[url] = true; imgs.push(url); }
      });
      // SKU图
      (this.editable.skus || []).forEach(function (s) {
        if (s.image && !seen[s.image]) { seen[s.image] = true; imgs.push(s.image); }
      });
      return imgs;
    },
    // ===== 变种属性拖拽 =====
    onVariantImgDragOver: function (attrIdx, valueName, e) {
      e.preventDefault();
      if (!this.dragImageUrl) return;
      this.setVariantImage(attrIdx, valueName, this.dragImageUrl);
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
      var slots = [];
      var mainImgs = vm.editable.main_images || [];
      vm.selectedMainIndexes.forEach(function (i) { if (mainImgs[i]) { urls.push(mainImgs[i]); slots.push({ field: 'main_images', index: i, url: mainImgs[i] }); } });
      var detailImgs = vm.editable.detail_images || [];
      vm.selectedDetailIndexes.forEach(function (i) { if (detailImgs[i]) { urls.push(detailImgs[i]); slots.push({ field: 'detail_images', index: i, url: detailImgs[i] }); } });
      var skuImgs = vm.skuImages || [];
      skuImgs.forEach(function (item) {
        if (vm.isSkuImageChecked(item) && item.url) { urls.push(item.url); slots.push({ field: 'sku', url: item.url }); }
      });
      if (!urls.length) { vm.$Message.warning('请先选中要处理的图片'); return; }
      // 直接构建图片列表，打开全局编辑器
      var images = urls.map(function (url, i) {
        var s = slots[i];
        var slotLabel = s ? ' (' + (s.field === 'main_images' ? '主图' + (s.index + 1) : s.field === 'detail_images' ? '详情' + (s.index + 1) : 'SKU') + ')' : '';
        return { id: 'ext-' + i, src: url, originalSrc: url, type: 'external', refId: null, label: '图片 #' + (i + 1) + slotLabel, _slot: s || null };
      });
      try { sessionStorage.setItem('__meitu_source_product', vm.editable.uid); } catch (e) {}
      // 确保 collage 已初始化（编辑器依赖其 JS 函数）
      if (typeof initMeituCollage === 'function' && !initMeituCollage._init) initMeituCollage();
      if (typeof window.openEditor === 'function') {
        window.openEditor(images[0].src, images);
      } else {
        // fallback：如果 collage JS 还没加载，通过拼图页面打开
        try { sessionStorage.setItem('__meitu_pending_import', JSON.stringify(urls)); } catch (e) {}
        try { sessionStorage.setItem('__meitu_import_slots', JSON.stringify(slots)); } catch (e) {}
        try { sessionStorage.setItem('__meitu_auto_open_editor', '1'); } catch (e) {}
        vm.$root.showCollageModal = true;
      }
    },
    goToMeituCollage: function () {
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
      try { sessionStorage.setItem('__meitu_pending_import', JSON.stringify(urls)); } catch (e) {}
      try { sessionStorage.setItem('__meitu_source_product', vm.editable.uid); } catch (e) {}
      vm.$root.showCollageModal = true;
    },
    goToMeituCleaner: function () {
      var vm = this;
      if (!vm.editable) return;
      var urls = [];
      var slots = []; // 记录每张图的位置 { field, index }
      var mainImgs = vm.editable.main_images || [];
      vm.selectedMainIndexes.forEach(function (i) {
        if (mainImgs[i]) { urls.push(mainImgs[i]); slots.push({ field: 'main_images', index: i, url: mainImgs[i] }); }
      });
      var detailImgs = vm.editable.detail_images || [];
      vm.selectedDetailIndexes.forEach(function (i) {
        if (detailImgs[i]) { urls.push(detailImgs[i]); slots.push({ field: 'detail_images', index: i, url: detailImgs[i] }); }
      });
      var skuImgs = vm.skuImages || [];
      skuImgs.forEach(function (item) {
        if (vm.isSkuImageChecked(item) && item.url) { urls.push(item.url); slots.push({ field: 'sku', url: item.url }); }
      });
      if (!urls.length) { vm.$Message.warning('请先选中要处理的图片'); return; }
      var images = urls.map(function (url, i) {
        var s = slots[i];
        var slotLabel = s ? ' (' + (s.field === 'main_images' ? '主图' + (s.index + 1) : s.field === 'detail_images' ? '详情' + (s.index + 1) : 'SKU') + ')' : '';
        return { id: 'ext-' + i, src: url, originalSrc: url, type: 'external', refId: null, label: '图片 #' + (i + 1) + slotLabel, _slot: s || null };
      });
      try { sessionStorage.setItem('__meitu_source_product', vm.editable.uid); } catch (e) {}
      if (typeof initMeituCollage === 'function' && !initMeituCollage._init) initMeituCollage();
      if (typeof window.openEditor === 'function') {
        window.openEditor(images[0].src, images);
        // openEditor会清理标记，所以在它之后重新设
        try { sessionStorage.setItem('__meitu_auto_clean', '1'); } catch (e) {}
      } else {
        try { sessionStorage.setItem('__meitu_pending_import', JSON.stringify(urls)); } catch (e) {}
        try { sessionStorage.setItem('__meitu_import_slots', JSON.stringify(slots)); } catch (e) {}
        try { sessionStorage.setItem('__meitu_auto_open_editor', '1'); } catch (e) {}
        vm.$root.showCollageModal = true;
      }
    },
    goToMeituAnnotate: function () {
      var vm = this;
      if (!vm.editable) return;
      var urls = [];
      var slots = [];
      var mainImgs = vm.editable.main_images || [];
      mainImgs.forEach(function (url, i) { urls.push(url); slots.push({ field: 'main_images', index: i, url: url }); });
      var detailImgs = vm.editable.detail_images || [];
      detailImgs.forEach(function (url, i) { urls.push(url); slots.push({ field: 'detail_images', index: i, url: url }); });
      var skuImgs = vm.skuImages || [];
      skuImgs.forEach(function (item) {
        if (item.url) { urls.push(item.url); slots.push({ field: 'sku', url: item.url }); }
      });
      if (!urls.length) { vm.$Message.warning('该商品没有图片'); return; }
      var images = urls.map(function (url, i) {
        var s = slots[i];
        var slotLabel = s ? ' (' + (s.field === 'main_images' ? '主图' + (s.index + 1) : s.field === 'detail_images' ? '详情' + (s.index + 1) : 'SKU') + ')' : '';
        return { id: 'ext-' + i, src: url, originalSrc: url, type: 'external', refId: null, label: '图片 #' + (i + 1) + slotLabel, _slot: s || null };
      });
      try { sessionStorage.setItem('__meitu_source_product', vm.editable.uid); } catch (e) {}
      if (typeof initMeituCollage === 'function' && !initMeituCollage._init) initMeituCollage();
      if (typeof window.openEditor === 'function') {
        window.openEditor(images[0].src, images);
        try { sessionStorage.setItem('__meitu_annotate_auto_detect', '1'); } catch (e) {}
      } else {
        try { sessionStorage.setItem('__meitu_pending_import', JSON.stringify(urls)); } catch (e) {}
        try { sessionStorage.setItem('__meitu_import_slots', JSON.stringify(slots)); } catch (e) {}
        try { sessionStorage.setItem('__meitu_auto_open_editor', '1'); } catch (e) {}
        try { sessionStorage.setItem('__meitu_annotate_auto_detect', '1'); } catch (e) {}
        vm.$root.showCollageModal = true;
      }
    },
    annotateSingleImage: function (url, field, index) {
      var vm = this;
      if (!vm.editable) return;
      var slots = [{ field: field, index: index, url: url }];
      var images = [{ id: 'ext-0', src: url, originalSrc: url, type: 'external', refId: null, label: '图片 #1', _slot: slots[0] }];
      try { sessionStorage.setItem('__meitu_source_product', vm.editable.uid); } catch (e) {}
      try { sessionStorage.setItem('__meitu_annotate_auto_detect', '1'); } catch (e) {}
      if (typeof initMeituCollage === 'function' && !initMeituCollage._init) initMeituCollage();
      if (typeof window.openEditor === 'function') {
        window.openEditor(url, images);
      } else {
        try { sessionStorage.setItem('__meitu_pending_import', JSON.stringify([url])); } catch (e) {}
        try { sessionStorage.setItem('__meitu_import_slots', JSON.stringify(slots)); } catch (e) {}
        try { sessionStorage.setItem('__meitu_auto_open_editor', '1'); } catch (e) {}
        vm.$root.showCollageModal = true;
      }
    },
    // ===== 换背景 =====
    replaceBackground: function () {
      var vm = this;
      if (!vm.editable) return;
      if (vm.replacingBg) return;

      // 收集选中的图片
      var urls = [];
      var mainImgs = vm.editable.main_images || [];
      vm.selectedMainIndexes.forEach(function (i) { if (mainImgs[i]) urls.push({ url: mainImgs[i], field: 'main_images', index: i }); });
      var detailImgs = vm.editable.detail_images || [];
      vm.selectedDetailIndexes.forEach(function (i) { if (detailImgs[i]) urls.push({ url: detailImgs[i], field: 'detail_images', index: i }); });

      if (!urls.length) {
        vm.$Message.warning('请先选择要换背景的图片');
        return;
      }

      // 弹出背景选择弹窗（上传背景图）
      var bgInput = document.createElement('input');
      bgInput.type = 'file';
      bgInput.accept = 'image/*';
      bgInput.onchange = function () {
        var file = bgInput.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function () {
          var bgBase64 = reader.result;
          vm.replacingBg = true;
          vm.$Message.info('正在处理 ' + urls.length + ' 张图片换背景...');

          var processed = 0;
          var failed = 0;
          var results = [];

          function processNext() {
            if (processed + failed >= urls.length) {
              vm.replacingBg = false;
              if (failed > 0) {
                vm.$Message.warning('完成: ' + (urls.length - failed) + ' 张成功, ' + failed + ' 张失败');
              } else {
                vm.$Message.success('全部 ' + urls.length + ' 张换背景完成');
              }
              // 替换原图 URL
              results.forEach(function (r) {
                if (r.newUrl) vm.editable[r.field][r.index] = r.newUrl;
              });
              return;
            }
            var item = urls[processed + failed];
            var serverBase = vm.getServerBase ? vm.getServerBase() : (typeof getServerBase === 'function' ? getServerBase() : '');
            // 下载图片为 base64
            var img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = function () {
              var canvas = document.createElement('canvas');
              canvas.width = img.width;
              canvas.height = img.height;
              canvas.getContext('2d').drawImage(img, 0, 0);
              var productBase64 = canvas.toDataURL('image/png');
              // 调后端换背景 API（不依赖 ComfyUI）
              fetch(serverBase + '/api/ai/replace-bg', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ product_base64: productBase64, bg_base64: bgBase64 })
              }).then(function (r) { return r.json(); }).then(function (data) {
                if (data.ok && data.url) {
                  results.push({ newUrl: data.url, field: item.field, index: item.index });
                  processed++;
                } else {
                  failed++;
                  console.error('换背景失败:', data.error);
                }
                processNext();
              }).catch(function (e) {
                failed++;
                console.error('换背景请求失败:', e);
                processNext();
              });
            };
            img.onerror = function () {
              failed++;
              processNext();
            };
            img.src = item.url;
          }
          processNext();
        };
        reader.readAsDataURL(file);
      };
      bgInput.click();
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
      this.toggleSkuItem(item.skuIndex);
    },
    isSkuImageChecked: function (item) {
      return this.isSkuChecked(item.skuIndex);
    },
    toggleAllSkuImages: function (checked) {
      var vm = this;
      (vm.editable.skus || []).forEach(function (s, i) {
        if (s.image) {
          var pos = vm.selectedSkuIndexes.indexOf(i);
          if (checked && pos < 0) vm.selectedSkuIndexes.push(i);
          else if (!checked && pos >= 0) vm.selectedSkuIndexes.splice(pos, 1);
        }
      });
    },
    allSkuImagesSelected: function () {
      if (!this.editable || !this.editable.skus || !this.editable.skus.length) return false;
      var allHaveImg = true;
      var imgCount = 0;
      (this.editable.skus || []).forEach(function (s) {
        if (s.image) imgCount++;
      });
      if (imgCount === 0) return false;
      return this.selectedSkuIndexes.length === this.editable.skus.length;
    },    toggleDetailImage: function (idx) {
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
    // ===== 添加图片（粘贴模式）=====
    addMainImage: function (url) {
      if (!this.editable || !url) return;
      if (!this.editable.main_images) this.$set(this.editable, 'main_images', []);
      var imgs = this.editable.main_images;
      // 去重
      for (var i = 0; i < imgs.length; i++) {
        if (imgs[i] === url) { this.$Message.info('图片已存在'); return; }
      }
      imgs.push(url);
      var idx = imgs.length - 1;
      if (this.selectedMainIndexes.indexOf(idx) < 0) this.selectedMainIndexes.push(idx);
    },
    startAddImagePaste: function () {
      var vm = this;
      if (vm.addingImage) return;
      vm.addingImage = true;

      vm._addImgPasteHandler = function (e) {
        var cd = e.clipboardData;
        if (!cd) return;
        // 检测图片
        for (var i = 0; i < cd.items.length; i++) {
          if (cd.items[i].type.indexOf('image/') === 0) {
            e.preventDefault();
            var file = cd.items[i].getAsFile();
            var reader = new FileReader();
            reader.onload = function () {
              var base64 = reader.result;
              vm.$Message.loading({ content: '正在上传图片...', duration: 0 });
              fetch('/api/ai/smms-upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image_base64: base64 })
              }).then(function (r) { return r.json(); }).then(function (d) {
                vm.$Message.destroy();
                if (d.url) {
                  vm.addMainImage(d.url);
                  vm.$Message.success('图片已添加');
                } else {
                  vm.$Message.error('上传失败');
                }
              }).catch(function () {
                vm.$Message.destroy();
                vm.$Message.error('上传失败');
              });
            };
            reader.readAsDataURL(file);
            return;
          }
        }
        // 检测文本 URL
        var text = cd.getData('text/plain') || '';
        if (text.trim()) {
          var lines = text.trim().split(/[\n\r]+/).filter(function (l) { return l.trim(); });
          var urlLines = lines.filter(function (l) { return /^https?:\/\/.+/i.test(l.trim()); });
          if (urlLines.length) {
            e.preventDefault();
            var count = 0;
            urlLines.forEach(function (line) {
              var url = line.trim();
              vm.addMainImage(url);
              count++;
            });
            vm.$Message.success('已添加 ' + count + ' 张图片');
          }
        }
      };

      vm._addImgEscHandler = function (e) {
        if (e.key === 'Escape') {
          e.stopPropagation();
          e.stopImmediatePropagation();
          vm.stopAddImagePaste();
        }
      };

      document.addEventListener('paste', vm._addImgPasteHandler, true);
      document.addEventListener('keydown', vm._addImgEscHandler, true);
      // 60s 超时自动退出
      vm._addImgTimer = setTimeout(function () { vm.stopAddImagePaste(); }, 60000);
    },
    stopAddImagePaste: function () {
      this.addingImage = false;
      if (this._addImgPasteHandler) {
        document.removeEventListener('paste', this._addImgPasteHandler, true);
        this._addImgPasteHandler = null;
      }
      if (this._addImgEscHandler) {
        document.removeEventListener('keydown', this._addImgEscHandler, true);
        this._addImgEscHandler = null;
      }
      if (this._addImgTimer) {
        clearTimeout(this._addImgTimer);
        this._addImgTimer = null;
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
      var variantAttrImages = vm.variantAttrs.map(function (va) { return JSON.parse(JSON.stringify(va.images || {})); });
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
        variantAttrName: (vm.variantAttrs[0] || {}).name || '',
        variantAttrName2: (vm.variantAttrs[1] || {}).name || '',
        productNo: vm.productNo,
        variantAttrImages: variantAttrImages
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
          <div class="detail-section-title" style="cursor:default">基本信息</div>
          <div class="info-grid">
            <span class="label">店铺名称</span><span class="value">
              <i-select v-model="storeName" style="width:300px" clearable placeholder="请选择店铺">
                <i-option v-for="s in storeOptions" :key="s" :value="s">{{ s }}</i-option>
              </i-select>
            </span>
            <span class="label">产品标题</span><span class="value">
              <i-input v-model="editable.title" style="width:100%;font-size:14px" placeholder="产品标题" />
            </span>
            <span class="label">选择分类</span><span class="value">
              <category-picker :value="editable.customCategory" :path="editable.manualCategory || ''" @input="function(v) { editable.customCategory = v; if (!v) { editable.manualCategory = ''; editable.dxmCategory = ''; } }" @path="function(p) { editable.manualCategory = p }" placeholder="搜索或选择分类" style="width:600px" />
            </span>
            <span class="info-more-toggle" @click="showMoreInfo = !showMoreInfo">
              {{ showMoreInfo ? '收起 ▲' : '更多 ▼' }}
            </span>
          </div>
          <div class="info-grid" v-show="showMoreInfo" style="margin-top:2px">
            <span class="label">来源</span><span class="value">
              <a v-if="editable.source_url" :href="editable.source_url" target="_blank">{{ editable.source_url }}</a>
              <span v-else>-</span>
              <span class="info-inline-sep">|</span>
              <span style="color:var(--text-secondary);font-size:13px">1688: {{ originCategory }}</span>
              <span class="info-inline-sep">|</span>
              <span :class="'status-tag ' + (editable.status === 0 ? 'status-unused' : 'status-used')" style="font-size:12px">{{ editable.status === 0 ? '未发布' : '已发布' }}</span>
              <span class="info-inline-sep">|</span>
              <span style="color:var(--text-secondary);font-size:13px">{{ editable.created_at || '-' }}</span>
            </span>
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
              <div class="img-action img-annotate" @click.stop="annotateSingleImage(url, 'main_images', i)" title="尺寸标注">📐</div>
              <div class="img-del" @click.stop="removeMainImage(i)">&times;</div>
            </div>
            <div class="img-add-btn" @click="startAddImagePaste" :class="{ active: addingImage }">
              <span class="img-add-icon">+</span>
              <span class="img-add-text">添加图片</span>
            </div>
          </div>
          <div class="add-image-hint" v-if="addingImage">
            请粘贴图片URL或截图 (Ctrl+V)，按 ESC 取消
            <span class="add-image-hint-close" @click="stopAddImagePaste">&times;</span>
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
              <div class="img-action img-annotate" @click.stop="annotateSingleImage(url, 'detail_images', i)" title="尺寸标注">📐</div></div>
              <div class="img-del" @click.stop="removeDetailImage(i)">&times;</div>
            </div>
          </div>
        </div>

        <!-- SKU图（独立选中，仅用于填充店小秘产品轮播图） -->
        <div class="detail-section" v-if="skuImages.length">
          <div class="detail-section-title">
            SKU图 ({{ skuImages.length }})
            <checkbox :value="allSkuImagesSelected()" @on-change="toggleAllSkuImages" style="margin-left:12px;vertical-align:middle"></checkbox>
            <span style="font-size:12px;color:var(--text-muted);margin-left:4px;vertical-align:middle">全选</span>
            <span style="font-size:12px;color:var(--text-muted);margin-left:12px">已选 {{ selectedSkuIndexes.length }} 项SKU</span>
          </div>
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

        <!-- 变种属性（图片+名称栅格，勾选关联SKU，编辑同步自定义属性） -->
        <div class="detail-section">
          <div class="detail-section-title">变种属性
            <i-button size="small" type="dashed" icon="md-add" @click="addVariantAttr" style="margin-left:8px;font-size:12px">添加变种属性</i-button>
          </div>
          <div class="variant-attr-row" v-for="(va, vi) in variantAttrs" :key="vi">
            <div class="variant-attr-header">
              <div class="variant-attr-label">
                <span class="variant-attr-index">{{ vi + 1 }}</span>
                <i-select v-model="va.name" style="width:130px" size="small" placeholder="选择属性名" clearable transfer @on-change="onVariantNameChange(vi)">
                  <i-option v-for="n in getFilteredOptions(vi)" :key="n" :value="n">{{ n }}</i-option>
                </i-select>
              </div>
              <span class="variant-attr-del-row" v-if="vi > 0" @click="removeVariantAttr(vi)" title="删除此变种属性"><i class="ivu-icon ivu-icon-md-close"></i></span>
            </div>
            <div class="variant-attr-values" v-if="va.values.length">
              <span class="attr-tag attr-tag-variant"
                v-for="(val, vj) in va.values" :key="vi+'-'+vj"
                :class="{ 'attr-tag-active': isVariantValueChecked(vi, val) }"
                @click="toggleVariantValue(vi, val, !isVariantValueChecked(vi, val))">
                <span class="attr-tag-check"><input type="checkbox" :checked="isVariantValueChecked(vi, val)" @click.stop @change="toggleVariantValue(vi, val, $event.target.checked)" /></span>
                <span class="attr-tag-text" v-if="editingVariantValue && editingVariantValue.attrIdx === vi && editingVariantValue.valueIdx === vj">
                  <input class="attr-tag-edit-input" v-model="editingVariantValue.tempName"
                    @keyup.enter="confirmEditVariantValue"
                    @keyup.escape="$event.stopPropagation(); cancelEditVariantValue()"
                    @blur="confirmEditVariantValue" v-focus />
                </span>
                <span class="attr-tag-text" v-else>{{ val }}</span>
                <span class="attr-tag-action attr-tag-edit" @click.stop="startEditVariantValue(vi, vj)" title="编辑">✎</span>
                <span class="attr-tag-action attr-tag-del" @click.stop="removeVariantValue(vi, vj)" title="删除">×</span>
              </span>
            </div>
            <div class="variant-attr-values" v-else>
              <span style="color:var(--text-muted);font-size:12px">暂无属性值</span>
            </div>
            <div class="variant-attr-add-row" v-if="va.name">
              <i-input v-model="va._newVal" size="small" placeholder="输入新属性值" style="width:200px" @on-enter="addVariantValueFromInput(vi)" />
              <i-button size="small" type="text" icon="md-add" @click="addVariantValueFromInput(vi)" style="margin-left:4px;color:var(--accent,#409eff)">添加</i-button>
            </div>
          </div>
          <!-- 原始属性标签 --><!-- 原始属性标签 -->
          <div v-if="editable.attrs && editable.attrs.length" style="margin-top:8px">
            <div style="font-size:12px;color:var(--text-muted);margin-bottom:4px">原始属性 ({{ editable.attrs.length }})</div>
            <div class="attr-tags">
              <span class="attr-tag attr-tag-muted" v-for="(a, i) in editable.attrs" :key="'a'+i">{{ a }}</span>
            </div>
          </div>
        </div>

        <!-- SKU 列表（带复选框 + 可编辑） -->
        <div class="detail-section" style="position:relative">
          <div class="detail-section-title" style="display:flex;align-items:center;gap:8px">SKU ({{ editable.skus ? editable.skus.length : 0 }})
              <i-button size="small" type="warning" icon="md-images" @click="openSkuBatchModal" style="font-size:12px">批量替换图片</i-button>
            </div>
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
                    @drop="onSkuImgDropReplace(i, $event)">
                    <div v-if="sku.image" class="sku-img-wrap">
                      <img :src="sku.image" loading="lazy"
                        @mouseenter="onSkuImgEnter(sku.image, $event)"
                        @mousemove="onSkuImgMove($event)"
                        @mouseleave="onSkuImgLeave" />
                      <span class="sku-img-remove" @click.stop="removeSkuImage(i)" title="删除图片">×</span>
                    </div>
                    <div v-else class="sku-img-placeholder" @click.stop="openImagePicker({ type:'sku', skuIndex: i })" title="点击选择图片">
                      <span style="font-size:16px;color:#ccc">+</span>
                    </div>
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
          <i-button icon="md-grid" @click="goToMeituCollage">拼图</i-button>
          <i-button type="error" icon="md-brush" @click="goToMeituCleaner">一键去中文</i-button>
          <i-button type="info" icon="md-pricetags" @click="goToMeituAnnotate">📏 尺寸标注</i-button>
          <i-button icon="md-color-palette" @click="replaceBackground" :loading="replacingBg">🖼️ 换背景</i-button>
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

        <!-- 图片选择弹窗 -->
        <modal v-model="showImagePicker" title="选择图片" width="900">
          <div style="margin-bottom:10px;font-size:12px;color:var(--text-muted)">点击图片选择（拖拽图片也可替换）共 {{ skuBatchAllImages.length }} 张</div>
          <div v-if="!skuBatchAllImages.length" style="padding:40px;text-align:center;color:#999">当前产品没有图片，请先添加主图或详情图</div>
          <div class="img-picker-grid" v-show="skuBatchAllImages.length">
            <div class="img-picker-item" v-for="(url, pi) in skuBatchAllImages" :key="'pi'+pi"
              :class="{ 'img-picker-selected': imagePickerTempUrl === url }"
              @click="onImagePickerSelect(url)">
              <img :src="url" loading="lazy" />
              <div class="img-picker-check">✓</div>
            </div>
          </div>
          <div slot="footer">
            <i-button size="small" @click="onImagePickerClose">取消</i-button>
            <i-button type="primary" size="small" @click="confirmImagePicker" :disabled="!imagePickerTempUrl">确认</i-button>
          </div>
        </modal>

        <!-- SKU\u56fe\u7247\u6279\u91cf\u66ff\u6362\u5f39\u7a97 -->
        <modal v-model="showSkuBatchModal" title="SKU\u56fe\u7247\u6279\u91cf\u66ff\u6362" width="1200" footer-hide>
          <div class="sku-batch-layout">
            <!-- \u5de6\u4fa7\uff1a\u6240\u6709\u56fe\u7247 -->
            <div class="sku-batch-left">
              <div class="sku-batch-panel-title">\u53ef\u9009\u56fe\u7247 ({{ skuBatchAllImages.length }})</div>
              <div class="sku-batch-img-grid">
                <div v-for="(url, pi) in skuBatchAllImages" :key="'sb'+pi"
                  class="sku-batch-img-item"
                  :class="{ 'sku-batch-img-active': skuBatchSelectedImage === url }"
                  @click="skuBatchSelectImage(url)">
                  <img :src="url" loading="lazy" />
                  <div v-if="skuBatchSelectedImage === url" class="sku-batch-img-selected-mark">\u2713</div>
                </div>
              </div>
            </div>
            <!-- \u53f3\u4fa7\uff1aSKU\u5c5e\u6027\u56fe\u7247\u6805\u683c -->
            <div class="sku-batch-right">
              <div class="sku-batch-panel-title">SKU\u5c5e\u6027\u56fe\u7247 (\u70b9\u51fb\u7a7a\u4f4d\u9009\u4e2d\uff0c\u70b9\u51fb\u5de6\u4fa7\u56fe\u7247\u586b\u5145)</div>
              <div class="sku-batch-slot-grid">
                <div v-for="(slot, si) in skuBatchSlots" :key="'slot'+si"
                  class="sku-batch-slot"
                  :class="{ 'sku-batch-slot-selected': skuBatchSelectedSlot === si, 'sku-batch-slot-empty': !slot.image }"
                  @click="skuBatchSelectSlot(si)">
                  <div class="sku-batch-slot-img">
                    <img v-if="slot.image" :src="slot.image" loading="lazy" />
                    <div v-else class="sku-batch-slot-placeholder">+</div>
                    <span v-if="slot.image" class="sku-batch-slot-del" @click.stop="skuBatchRemoveSlotImage(si)">\u00d7</span>
                  </div>
                  <div class="sku-batch-slot-name" :title="slot.name">{{ slot.name }}</div>
                </div>
              </div>
            </div>
          </div>
          <div class="sku-batch-footer">
            <i-button size="small" @click="showSkuBatchModal = false">\u53d6\u6d88</i-button>
            <i-button type="primary" size="small" @click="confirmSkuBatch">\u786e\u5b9a\u66ff\u6362</i-button>
          </div>
        </modal>
</modal>
      </template>
    </modal>`
});
