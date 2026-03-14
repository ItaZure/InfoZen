# 数据持久化方案

## 依赖

```bash
npm install better-sqlite3
```

`better-sqlite3` 是 CommonJS 模块，而项目根目录是 ESM（`"type": "module"`）。
解决方法：在 `server/` 目录下新增一个 `package.json`，内容为：

```json
{ "type": "commonjs" }
```

这样 `server/` 下所有文件改用 `require()`，不影响前端 ESM 代码。

---

## 文件结构变更

```
server/
├── package.json       ← 新增：{ "type": "commonjs" }
├── index.js           ← 修改：引入 db 初始化，挂载新路由
├── db.js              ← 新增：SQLite 初始化单例
└── routes/
    ├── chat.js        ← 不变
    └── data.js        ← 新增：所有持久化 API
```

数据库文件位置：`server/learning.db`（自动创建，建议加入 `.gitignore`）

---

## 表结构

```sql
-- 话题主表（预置 4 条）
CREATE TABLE IF NOT EXISTS topics (
  id      TEXT    PRIMARY KEY,
  notes   TEXT    NOT NULL DEFAULT '',
  counter INTEGER NOT NULL DEFAULT 0
);

INSERT OR IGNORE INTO topics (id) VALUES ('产品技术'), ('哲学'), ('商业'), ('英语');

-- 消息表
CREATE TABLE IF NOT EXISTS messages (
  id        INTEGER PRIMARY KEY,        -- 复用前端 Date.now() 生成的值
  topic_id  TEXT    NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  type      TEXT    NOT NULL CHECK(type IN ('user', 'ai')),
  content   TEXT    NOT NULL DEFAULT '',
  images    TEXT    NOT NULL DEFAULT '[]',  -- JSON Array of base64 strings
  timestamp TEXT    NOT NULL               -- ISO 8601
);

-- 对话树节点（展平存储）
CREATE TABLE IF NOT EXISTS tree_nodes (
  id              INTEGER PRIMARY KEY,   -- 与 userMessageId 一致
  topic_id        TEXT    NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  parent_id       INTEGER,               -- NULL = 根节点
  label           TEXT    NOT NULL,
  content         TEXT    NOT NULL,      -- 用户问题完整文本
  user_message_id INTEGER NOT NULL,
  ai_message_id   INTEGER NOT NULL,
  summarized      INTEGER NOT NULL DEFAULT 0  -- 0=false, 1=true
);

-- 学习日志
CREATE TABLE IF NOT EXISTS logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id   TEXT    NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  time_range TEXT    NOT NULL,
  summary    TEXT    NOT NULL,
  timestamp  TEXT    NOT NULL
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_messages_topic ON messages(topic_id);
CREATE INDEX IF NOT EXISTS idx_tree_topic     ON tree_nodes(topic_id);
CREATE INDEX IF NOT EXISTS idx_tree_parent    ON tree_nodes(parent_id);
CREATE INDEX IF NOT EXISTS idx_logs_topic     ON logs(topic_id);
```

---

## API 规格

### GET /api/data
启动时调用一次，返回所有话题的完整数据，树结构已在服务端重建为嵌套格式。

**Response 200**
```json
{
  "topics": {
    "产品技术": {
      "notes": "",
      "counter": 3,
      "messages": [
        {
          "id": 1741234567890,
          "type": "user",
          "content": "今天天气怎么样",
          "images": [],
          "timestamp": "2026-03-14T09:23:00.000Z"
        },
        {
          "id": 1741234567891,
          "type": "ai",
          "content": "今天杭州天气晴朗...",
          "images": [],
          "timestamp": "2026-03-14T09:23:05.000Z"
        }
      ],
      "tree": [
        {
          "id": 1741234567890,
          "label": "今天天气怎么样",
          "content": "今天天气怎么样",
          "userMessageId": 1741234567890,
          "aiMessageId": 1741234567891,
          "summarized": false,
          "children": []
        }
      ],
      "logs": [
        {
          "id": 1,
          "timeRange": "2026-03-14 09:00-10:00",
          "summary": "该时间段进行了3次对话",
          "timestamp": "2026-03-14T10:05:00.000Z"
        }
      ]
    },
    "哲学": { },
    "商业": { },
    "英语": { }
  }
}
```

---

### POST /api/conversations
流式输出结束后调用，用 transaction 原子写入用户消息 + AI 消息 + 树节点。

**Request Body**
```json
{
  "topicId": "产品技术",
  "userMessage": {
    "id": 1741234567890,
    "content": "今天天气怎么样",
    "images": [],
    "timestamp": "2026-03-14T09:23:00.000Z"
  },
  "aiMessage": {
    "id": 1741234567891,
    "content": "今天杭州天气晴朗...",
    "timestamp": "2026-03-14T09:23:05.000Z"
  },
  "treeNode": {
    "id": 1741234567890,
    "parentId": null,
    "label": "今天天气怎么样",
    "content": "今天天气怎么样",
    "userMessageId": 1741234567890,
    "aiMessageId": 1741234567891,
    "summarized": false
  },
  "newCounter": 4
}
```

**Response 200**
```json
{ "success": true }
```

---

### PUT /api/topics/:id/notes
前端防抖 1000ms 后调用，`:id` 需 `encodeURIComponent`（中文话题名）。

**Request Body**
```json
{ "notes": "笔记内容..." }
```

**Response 200**
```json
{ "success": true }
```

---

### POST /api/topics/:id/logs
`handleUpdateLogs` 计算完成后调用，日志全量替换，同时更新节点的 summarized 标记。

**Request Body**
```json
{
  "logs": [
    {
      "timeRange": "2026-03-14 09:00-10:00",
      "summary": "该时间段进行了5次对话",
      "timestamp": "2026-03-14T10:05:00.000Z"
    }
  ],
  "summarizedNodeIds": [1741234567890, 1741234568000]
}
```

**Response 200**
```json
{ "success": true }
```

---

### DELETE /api/topics/:id/clear
清除对话记录，保留 notes 和 logs。

执行：
```sql
DELETE FROM messages   WHERE topic_id = ?;
DELETE FROM tree_nodes WHERE topic_id = ?;
UPDATE topics SET counter = 0 WHERE id = ?;
```

**Response 200**
```json
{ "success": true }
```

---

## 前端改动点（Chat.jsx）

### 1. 初始化加载
- `useState` 初始值保持空结构（四个话题各为空）
- 新增 `useEffect([], ...)` 在 mount 时 fetch `GET /api/data`
- 拿到数据后 `setTopicData(data.topics)`
- 加载期间禁用输入（防止数据到达前操作）

### 2. 流结束后保存对话
`handleSend` 的 `finally` 块目前只有 `setIsLoading(false)`，在此之前新增：
- 从流中累积一个本地变量 `let aiContent = ''`（每次 append delta 时同步更新）
- 流结束后构造 `POST /api/conversations` 的 body
- `treeNode.parentId` 取自 `selectedNode`（发送前的值，需在流开始前捕获）
- 持久化失败只 `console.error`，不阻断用户

### 3. 笔记防抖保存
`notes onChange` 回调中：
- 用 `useRef` 保存 debounce timer
- 每次触发先 `clearTimeout`，再 `setTimeout(1000ms)` 调用 `PUT /api/topics/:id/notes`
- 切换话题时立即 flush（`clearTimeout` + 立即发请求），避免丢失

### 4. 学习日志同步
`handleUpdateLogs` 里，`setTopicData` 执行完后新增：
- 调用 `POST /api/topics/:id/logs`
- `summarizedNodeIds` 来自已有的 `unsummarizedNodes.map(n => n.id)`

### 5. 清除对话
`confirmClearHistory` 里，`setTopicData` 执行完后新增：
- 调用 `DELETE /api/topics/:id/clear`

---

## 设计决策说明

| 决策 | 原因 |
|------|------|
| 流结束后才写库 | 流中断时不产生残缺记录；流结束时才能拿到完整 AI 内容 |
| 日志全量替换 | 前端已完成合并计算，服务端无需处理 upsert 逻辑 |
| Date.now() 作主键 | 前后端 ID 完全对齐，单用户场景毫秒级碰撞概率为零 |
| 树在服务端重建 | 前端接收格式与当前 state 完全一致，前端改动最小 |
| server/ 独立 CJS | 避免 `better-sqlite3` 与 ESM 的兼容问题，改动范围最小 |
