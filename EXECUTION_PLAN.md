# 1688 采集 → 店小蜜回填：执行计划

## 一、整体流程

```
┌──────────────────────────────────────────────────────────┐
│  Chrome 扩展 (shared storage)                            │
│                                                          │
│  1688 商品页                     店小蜜 TEMU 编辑页       │
│  ┌──────────────┐               ┌──────────────────┐    │
│  │ 1. 采集数据   │               │ 3. 读取 storage  │    │
│  │ 2. 保存到     │──────────────→│ 4. 回填表单      │    │
│  │   storage    │               │                  │    │
│  └──────────────┘               └──────────────────┘    │
└──────────────────────────────────────────────────────────┘
```

---

## 二、统一数据结构

以下是需要采集和回填的完整字段映射：

```javascript
var productData = {
  // ---- 基础信息 ----
  sourceUrl: 'https://detail.1688.com/offer/...',   // 1688 商品URL（唯一标识）
  title: '天然水晶项链...',                          // 商品标题

  // ---- 图片 ----
  mainImages: [                                      // 产品轮播图 URL 列表（最多8张）
    'https://cbu01.alicdn.com/img/xxx.jpg',
    'https://cbu01.alicdn.com/img/yyy.jpg'
  ],
  descImages: [                                      // 描述图片 URL 列表
    'https://cbu01.alicdn.com/img/desc1.jpg'
  ],

  // ---- 变种属性 ----
  attrs: ['light green', 'dark green', 'red'],       // 颜色/属性值列表

  // ---- SKU 表格数据（按颜色行一一对应） ----
  skus: [
    {
      image: 'https://cbu01.alicdn.com/img/sku1.jpg',  // 该颜色的 SKU 预览图
      sku: 'SKU-LIGHT-GREEN',                          // SKU货号（可自动生成）
      price: '35.69',                                  // 申报价格 (CNY)
      dimensions: [10, 8, 5],                          // 尺寸 [长,宽,高] cm，自动从大到小排序
      weight: '15'                                     // 重量 g
    },
    {
      image: 'https://cbu01.alicdn.com/img/sku2.jpg',
      sku: 'SKU-DARK-GREEN',
      price: '34.66',
      dimensions: [10, 8, 5],
      weight: '15'
    }
  ]
};
```

---

## 三、1688 采集端需求

### 3.1 需要采集的数据及来源

| 数据字段 | 1688 页面来源 | 选择器/方式 | 备注 |
|---------|-------------|------------|------|
| `sourceUrl` | 当前页面 URL | `location.href` | |
| `title` | 商品标题 | `document.querySelector('.d-title')?.textContent` | 或 `.title-text` |
| `mainImages` | 主图轮播 | 已有 `scanImages()` 中的 main 分类图片 | 最多取前 8 张 |
| `descImages` | 详情描述图 | 已有 `scanImages()` 中的 detail 分类图片 | |
| `attrs` | SKU 颜色/属性 | `#skuSelection` 或 `.sku-item-name` | 需遍历提取 |
| `skus[].image` | SKU 对应图片 | 每个 SKU 行的缩略图 `img` | |
| `skus[].price` | SKU 价格 | 价格列文本，需提取数字 | 可能含 ¥ 符号 |
| `skus[].dimensions` | 包装信息 | `#productPackInfo` 表格中"长×宽×高" | 需解析拆分 |
| `skus[].weight` | 重量 | `#productPackInfo` 表格中"重量"/"毛重" | |

### 3.2 采集触发方式

**方案 1**：在现有抓取结果页面增加"保存到本地"按钮
**方案 2**：在 1688 小鹦鹉 icon 增加新的"采集"按钮（推荐）
**方案 3**：抓取图片时自动采集所有数据

### 3.3 新增文件

- `sites/1688/collect-data.js` — 数据采集逻辑

### 3.4 实现步骤

1. 在 `manifest.json` 的 1688 content_scripts 中添加 `collect-data.js`
2. 在 1688 小鹦鹉 icon 下增加"采集"按钮
3. 点击后执行 `collectProductData()` 函数：
   - 提取标题、图片、SKU、属性、价格、尺寸、重量
   - 结构化为统一数据格式
   - 调用 `chrome.storage.local.set({ latestProduct: data })`
   - 显示气泡提示"✅ 已采集 N 张图片 + N 个SKU"

### 3.5 采集函数伪代码

```javascript
function collectProductData() {
  var data = {
    sourceUrl: location.href,
    title: '',
    mainImages: [],
    descImages: [],
    attrs: [],
    skus: []
  };

  // 1. 标题
  var titleEl = document.querySelector('.d-title') || document.querySelector('.title-text');
  if (titleEl) data.title = titleEl.textContent.trim();

  // 2. 图片（复用 grab-core.js 的 scanImages 逻辑）
  var images = scanImages(); // 已有函数
  data.mainImages = images.main.slice(0, 8).map(function(img) { return img.src; });
  data.descImages = images.detail.map(function(img) { return img.src; });

  // 3. SKU 属性值
  var skuItems = document.querySelectorAll('#skuSelection .sku-item-name');
  skuItems.forEach(function(item) {
    data.attrs.push(item.textContent.trim());
  });

  // 4. SKU 表格数据（价格、图片等）
  // 遍历 SKU 行提取每行数据

  // 5. 包装信息（尺寸、重量）
  var packTable = document.querySelector('#productPackInfo table');
  // 解析表格提取 dimensions 和 weight

  // 6. 保存
  chrome.storage.local.set({ latestProduct: data });
}
```

---

## 四、店小蜜回填端需求

### 4.1 数据读取

修改 `dxm-sku-table.js` 中的 `getMockData()`：

```javascript
function loadData(cb) {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get('latestProduct', function (result) {
      cb(result.latestProduct || null);
    });
  } else {
    cb(null);
  }
}
```

### 4.2 回填字段映射

| storage 字段 | 店小蜜表单 | 操作 |
|-------------|-----------|------|
| `title` | 标题输入框 | 翻译后填入，含过滤 |
| `mainImages` | 产品轮播图 | 通过"网络图片"弹窗填入 URL |
| `descImages` | 描述图片 | 编字工作流批量传图 |
| `attrs` | 变种属性 | 取消勾选 → 逐个添加属性值 |
| `skus[].image` | SKU 预览图 | 逐行 hover → 网络图片 |
| `skus[].sku` | SKU 货号 | 逐行填入 `input[name="variationSku"]` |
| `skus[].price` | 申报价格 | 逐行填入 `input[name="price"]` |
| `skus[].dimensions` | 尺寸 | 排序后填入 skuLength/skuWidth/skuHeight |
| `skus[].weight` | 重量 | 逐行填入 `input[name="weight"]` |

### 4.3 回填流程（填表按钮点击后）

```
1. 读取 chrome.storage.local → latestProduct
2. 如果无数据 → 提示"请先在1688采集商品数据"
3. 取消变种属性勾选（已有功能）
4. 添加新属性值（已有功能）
5. 逐行填充 SKU 表格（已有功能）
6. （后续扩展）填充标题、轮播图、描述图片
```

---

## 五、manifest.json 改动

```json
{
  "permissions": ["activeTab", "scripting", "storage"]
}
```

只需增加 `"storage"` 权限。

---

## 六、文件改动清单

### 新增文件
| 文件 | 说明 |
|------|------|
| `sites/1688/collect-data.js` | 1688 数据采集脚本 |

### 修改文件
| 文件 | 改动 |
|------|------|
| `manifest.json` | 添加 `"storage"` 权限；1688 content_scripts 增加 `collect-data.js` |
| `sites/1688/float-btn.js` | 小鹦鹉 icon 下增加"采集"按钮 |
| `sites/dianxiaomi/dxm-sku-table.js` | `getMockData()` 替换为 `chrome.storage.local.get` 读取 |

---

## 七、开发顺序

### Phase 1：跑通最小闭环
1. `manifest.json` 添加 `"storage"` 权限
2. 在 `grab-core.js` 末尾临时加一段：采集后自动 `chrome.storage.local.set()`
3. 修改 `dxm-sku-table.js` 的 `getMockData()` 改为从 storage 读取
4. 测试：1688 采集 → 打开店小蜜 → 点填表 → 数据回填

### Phase 2：完善采集端
5. 新建 `collect-data.js`，提取完整的 SKU、属性、价格、尺寸、重量
6. 1688 小鹦鹉增加"采集"按钮
7. 采集后显示气泡提示采集结果摘要

### Phase 3：完善回填端
8. 填表工作流增加标题回填（翻译 + 过滤）
9. 填表工作流增加产品轮播图回填
10. 填表工作流增加描述图片回填

---

## 八、验证清单

- [ ] 1688 页面采集后，storage 中能查到结构化数据
- [ ] 店小蜜页面点填表，能从 storage 读到数据
- [ ] 变种属性取消勾选 + 重新添加正常
- [ ] SKU 表格逐行填充（预览图、货号、价格、尺寸、重量）
- [ ] 尺寸自动从大到小排序
- [ ] 已有值的输入框不被覆盖
- [ ] 采集数据在不同 1688 商品间切换时正确更新
