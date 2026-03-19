# 概要设计：拾慧页面

日期：2026-03-19

---

## 一、涉及文件

### 新增
- `server/routes/wisdom.js` — 拾慧相关接口
- `src/pages/Wisdom.jsx` — 页面重写（替换占位）
- `src/components/wisdom/QuickLinks.jsx` — 快捷按钮行
- `src/components/wisdom/UrlInput.jsx` — URL 输入框
- `src/components/wisdom/ArticleCard.jsx` — 摘要卡片

### 修改
- `server/db.js` — 新增 `articles`、`quick_links` 表及兼容迁移
- `server/index.js` — 注册 `/api/wisdom` 路由

### 更新文档
- `docs/api.md`
- `docs/schema.md`

---

## 二、表结构变更

```sql
-- 文章摘要表
CREATE TABLE IF NOT EXISTS articles (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  url        TEXT NOT NULL,
  title_en   TEXT,
  title_zh   TEXT NOT NULL,
  summary    TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- 快捷链接表
CREATE TABLE IF NOT EXISTS quick_links (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  url        TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT NOT NULL
);
```

兼容迁移：`db.js` 中用 `CREATE TABLE IF NOT EXISTS` 新增两张表，预置 HN 和 Karpathy 两条默认快捷链接（`INSERT OR IGNORE`）。

---

## 三、接口设计

### POST /api/wisdom/summarize
- 请求：`{ url: string }`
- 后端流程：axios 抓取 HTML → cheerio 提取正文 → DeepSeek 生成摘要 → 写入 articles 表
- 响应：`{ id, url, title_en, title_zh, summary, created_at }`
- 错误：抓取失败 → 500 `{ error: 'FETCH_FAILED' }`；DeepSeek 失败 → 500 `{ error: 'AI_FAILED' }`

### GET /api/wisdom/articles?page=1&limit=10
- 响应：`{ articles: [...], hasMore: boolean }`
- 按 `created_at DESC` 排序

### DELETE /api/wisdom/articles/:id
- 硬删除（无软删除需求）
- 响应：`{ success: true }`

### GET /api/wisdom/quick-links
- 响应：`{ links: [{ id, name, url, sort_order }] }`
- 按 `sort_order ASC, id ASC` 排序

### POST /api/wisdom/quick-links
- 请求：`{ name: string, url: string }`
- 响应：`{ id, name, url }`

### DELETE /api/wisdom/quick-links/:id
- 响应：`{ success: true }`

---

## 四、前端主流程

```
用户粘贴 URL → 按 Enter
  → 列表顶部插入 loading 卡片（临时 id）
  → POST /api/wisdom/summarize
    → 成功：替换 loading 卡片为正式卡片
    → 失败：loading 卡片变为错误态，显示错误信息，可手动关闭
```

### 摘要解析规则
DeepSeek 返回格式：
```
The Bitter Lesson        ← 第 1 行：英文标题（无则只有中文）
苦涩的教训               ← 第 2 行：中文标题（或第 1 行直接是中文）
                         ← 空行
• 要点一...
• 要点二...
```

前端解析：
- 取第 1 行，判断是否含中文 → 纯英文则为 `title_en`，含中文则为 `title_zh`
- 若第 1 行为英文，取第 2 行为 `title_zh`
- 剩余内容为 `summary`

### 卡片状态
| 状态 | 说明 |
|------|------|
| loading | skeleton + loading 动画 |
| error | 错误提示 + 关闭按钮 |
| collapsed | 固定高度，摘要截断 |
| expanded | 自适应高度，全文展示 |

### 懒加载
- 初始加载第 1 页（10 条）
- 滚动到底部触发加载下一页（IntersectionObserver）

---

## 五、依赖变更

需新增：
```bash
npm install axios cheerio
```

`axios`：后端抓取网页（已有 fetch，但 cheerio 配合 axios 更方便处理编码）
`cheerio`：服务端 HTML 解析提取正文

---

## 六、边界情况

| 场景 | 处理 |
|------|------|
| 抓取超时（>10s） | axios timeout 10000ms，返回 FETCH_FAILED |
| 反爬 / 403 | 同上，返回 FETCH_FAILED |
| DeepSeek 调用失败 | 返回 AI_FAILED |
| 输入框为空提交 | 前端拦截，不发请求 |
| 重复提交同一 URL | 允许，不去重 |
| 快捷链接已有默认值 | INSERT OR IGNORE 保证幂等 |
