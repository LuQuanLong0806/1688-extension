# 店小秘类目库 + 智能匹配 - 需求文档

> 状态：开发中
> 创建时间：2026-04-29

---

## 1. 核心思路

在店小秘页面每次选择分类时自动收集，逐步建立店小秘类目库。管理端通过智能匹配，将1688类目批量关联到店小秘类目。

```
店小秘选分类 → 自动收集到类目库 → 管理端智能匹配 → 确认后批量同步
```

---

## 2. 新建表：dxm_categories（店小秘类目库）

```sql
CREATE TABLE dxm_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL UNIQUE,      -- 完整路径 "艺术品、工艺品和缝纫用品/礼品包装用品/礼品包装袋"
  leaf_name TEXT NOT NULL,        -- 叶子类目名 "礼品包装袋"
  count INTEGER DEFAULT 1,       -- 被选次数
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## 3. 自动收集

### 3.1 触发方式

在店小秘页面，**不管有没有 collectId**，只要用户选择了分类，就自动回传。

监听 `.category-list` 元素的 MutationObserver：

```javascript
var catList = document.querySelector('.category-list');
var observer = new MutationObserver(function() {
  var text = catList.textContent.trim(); // "艺术品、工艺品和缝纫用品 > 礼品包装用品 > 礼品包装袋"
  if (!text) return;
  var parts = text.split(/\s*>\s*/);
  fetch('http://localhost:3000/api/dxm-category/collect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      path: parts.join('/'),
      leafName: parts[parts.length - 1]
    })
  }).catch(function() {});
});
observer.observe(catList, { childList: true, characterData: true, subtree: true });
```

### 3.2 API

**POST /api/dxm-category/collect**

```json
{ "path": "艺术品、工艺品和缝纫用品/礼品包装用品/礼品包装袋", "leafName": "礼品包装袋" }
```

逻辑：
- path 已存在 → `count + 1`
- path 不存在 → 插入新记录

---

## 4. 智能匹配算法

### 4.1 匹配规则

对比 **1688类目名** 与 **dxm_categories.leaf_name**：

#### 正向命中率
1688类目名拆字，检查每个字符是否出现在 DXM 类目名中：

```
1688: "手机壳" → [手, 机, 壳]
DXM:  "手机保护套" → 包含 手✓ 机✓ 壳✗
正向命中率 = 2/3 = 66.7%
```

#### 反向命中率
DXM类目名拆字，检查每个字符是否出现在 1688 类目名中：

```
DXM:  "手机保护套" → [手, 机, 保, 护, 套]
1688: "手机壳" → 包含 手✓ 机✓ 保✗ 护✗ 套✗
反向命中率 = 2/5 = 40%
```

#### 连续子串匹配（加权）

找最长公共子串，计算占比：

```
1688: "礼品包装袋"
DXM:  "礼品包装纸"
最长公共子串: "礼品包装" (4字)
占比 = 4 / max(5, 5) = 80%
```

#### 综合得分

```
score = 正向命中率 × 0.4 + 反向命中率 × 0.2 + 连续子串占比 × 0.4
```

- score ≥ 50% → 显示为建议匹配
- score ≥ 80% → 高亮标记为强匹配

### 4.2 匹配示例

| 1688类目 | DXM类目 | 正向 | 反向 | 子串 | 综合 | 建议 |
|---------|---------|------|------|------|------|------|
| 手机壳 | 手机保护套 | 66.7% | 40% | 66.7% | 60% | ✓ |
| 礼品包装袋 | 礼品包装纸 | 80% | 80% | 80% | 80% | ✓ 强 |
| 连衣裙 | 夏季女装 | 0% | 0% | 0% | 0% | ✗ |
| 连衣裙 | 连衣裙 | 100% | 100% | 100% | 100% | ✓ 强 |
| 礼品包装袋 | 礼品袋 | 80% | 100% | 40% | 72% | ✓ |

---

## 5. 管理端分类页面

### 5.1 页面布局

```
┌─────────────────────────────────────────────────────┐
│  类目映射管理                                        │
├─────────────────────────────────────────────────────┤
│  待映射 (1688类目有值但dxm_category为空的商品数)        │
│                                                      │
│  ┌─────────────────────────────────────────────────┐ │
│  │ 1688类目: 手机壳 (12条商品)                       │ │
│  │ 建议匹配:                                        │ │
│  │   ✅ 手机保护套  (60%)  [确认]                    │ │
│  │   ☐ 手机壳      (100%) [确认]  ← 强匹配          │ │
│  │   [跳过]                                         │ │
│  ├─────────────────────────────────────────────────┤ │
│  │ 1688类目: 礼品包装袋 (5条商品)                     │ │
│  │ 建议匹配:                                        │ │
│  │   ✅ 礼品包装纸  (80%)  [确认]  ← 强匹配          │ │
│  │   ☐ 礼品包装袋  (100%) [确认]                     │ │
│  │   [跳过]                                         │ │
│  └─────────────────────────────────────────────────┘ │
│                                                      │
│  已映射 (8条)                                         │
│  类目库 (23个DXM类目)                                  │
└─────────────────────────────────────────────────────┘
```

### 5.2 交互

- **确认**：将该1688类目下所有 dxm_category 为空的商品，设置选中的 DXM 类目
- **跳过**：标记为已处理，不再显示
- 点击展开可查看所有建议匹配及其得分

### 5.3 API

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/dxm-category/collect` | POST | 收集店小秘类目 |
| `/api/dxm-category/library` | GET | 获取类目库列表 |
| `/api/dxm-category/unmapped` | GET | 获取未映射的1688类目列表 |
| `/api/dxm-category/match` | GET | 对指定1688类目执行智能匹配，返回候选DXM类目 |
| `/api/dxm-category/confirm` | POST | 确认映射 `{ categoryName, dxmCategory }` |

---

## 6. 确认映射逻辑

POST /api/dxm-category/confirm

```json
{
  "categoryName": "手机壳",
  "dxmCategory": { "path": "手机和配件/手机保护套", "leafName": "手机保护套" }
}
```

服务端：
1. 找到所有 category LIKE '%"手机壳"%'
2. 更新 dxm_category 为传入的 DXM 类目
3. 仅更新 dxm_category 为空的商品（已手动选过的不覆盖）

```sql
UPDATE products 
SET dxm_category = ?, updated_at = CURRENT_TIMESTAMP 
WHERE category LIKE '%"手机壳"%' 
  AND (dxm_category IS NULL OR dxm_category = '')
```

---

## 7. 涉及文件

| 文件 | 改动 |
|------|------|
| `server/server.js` | 新建 dxm_categories 表 + collect/library/unmapped/match/confirm 接口 |
| `server/public/js/components/category-page.js` | **新建**，管理端分类映射页面 |
| `sites/dianxiaomi/dxm-float-bee.js` | 添加 MutationObserver 监听 .category-list 变化 |
| `sites/dianxiaomi/dxm-auto-fill.js` | onCategorySet 回传时同时 collect |
