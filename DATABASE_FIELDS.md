# 商品数据字段文档

## 数据库表：products

| 字段 | 类型 | 说明 | 采集端 | 回填端 |
|------|------|------|--------|--------|
| `id` | INTEGER | 主键自增 | - | 读取时用 |
| `source_url` | TEXT | 1688 商品 URL | `location.href` | - |
| `title` | TEXT | 商品标题 | `.d-title` | 翻译后回填标题输入框 |
| `main_images` | TEXT (JSON) | 轮播图 URL 列表 | `scanImages()` main 分类 | 产品轮播图 |
| `desc_images` | TEXT (JSON) | 描述图 URL 列表 | `scanImages()` detail 分类 | 描述图片 |
| `attrs` | TEXT (JSON) | 变种属性值列表 | SKU 颜色/属性 | 取消勾选 → 重新添加 |
| `skus` | TEXT (JSON) | SKU 表格数据 | SKU 行数据 | 逐行填充表格 |
| `status` | INTEGER | 0=未使用 1=已使用 | - | - |
| `created_at` | DATETIME | 创建时间 | 自动 | - |
| `updated_at` | DATETIME | 更新时间 | 自动 | - |

---

## skus JSON 子结构

每个 SKU 对象：

| 字段 | 类型 | 说明 | 采集端来源 | 回填端目标 |
|------|------|------|-----------|-----------|
| `image` | String | SKU 预览图 URL | SKU 行缩略图 `img` | hover → 网络图片弹窗 |
| `sku` | String | SKU 货号 | 自动生成 | `input[name="variationSku"]` |
| `price` | String | 申报价格 CNY | SKU 行价格列 | `input[name="price"]` |
| `dimensions` | Array | [长,宽,高] cm | `#productPackInfo` 表格 | `skuLength/skuWidth/skuHeight`（从大到小排序） |
| `weight` | String | 重量 g | `#productPackInfo` 表格 | `input[name="weight"]` |

---

## 数据流映射

```
1688 采集                       SQLite 存储                    店小蜜回填
───────────                    ──────────                    ──────────
location.href          →  source_url
.d-title               →  title                 →  翻译后填标题
scanImages() main      →  main_images           →  轮播图上传
scanImages() detail    →  desc_images           →  描述图上传
SKU 属性值             →  attrs                 →  取消勾选 → 添加属性值
  ├ SKU 预览图         →  skus[].image          →  hover → 网络图片
  ├ SKU 货号           →  skus[].sku            →  variationSku input
  ├ SKU 价格           →  skus[].price          →  price input
  ├ 包装尺寸           →  skus[].dimensions     →  skuLength/Width/Height
  └ 包装重量           →  skus[].weight         →  weight input
```

---

## 待确认/可扩展字段

以下字段目前**未采集**，后续可能需要：

| 字段 | 说明 | 来源 | 备注 |
|------|------|------|------|
| `category` | 商品分类 | 1688 面包屑导航 | 用于自动选择分类 |
| `price_range` | 价格区间 | 1688 价格区域 | 多个起批量对应不同价 |
| `moq` | 最小起订量 | 1688 页面 | 店小蜜可能需要 |
| `description` | 商品描述文本 | 1688 详情区 | 区别于描述图片 |
| `shop_name` | 店铺名称 | 1688 页面 | 方便管理区分 |
| `tags` | 标签/关键词 | 1688 标签 | 可用于搜索 |
| `remark` | 备注 | 用户手动填写 | 管理用 |
