# 对话持久化概要设计

## 1. 接口设计

### 1.1 话题数据

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/topics/:topicId/data` | 加载话题完整数据（消息、树、日志、笔记、计数） |
| DELETE | `/api/topics/:topicId/data` | 清除话题的消息和树（保留笔记和日志） |

**GET `/api/topics/:topicId/data` 响应：**
```json
{
  "messages": [
    {
      "id": "string",
      "type": "user | ai",
      "content": "string",
      "images": ["base64 data URL", "..."],
      "timestamp": "ISO8601"
    }
  ],
  "tree": [
    {
      "id": "string",
      "label": "string",
      "userMessageId": "string",
      "aiMessageId": "string",
      "content": "string",
      "summarized": false,
      "children": []
    }
  ],
  "counter": 0,
  "notes": "string",
  "logs": [
    {
      "timeRange": "2026-03-15 14:00-15:00",
      "summary": "该时间段进行了3次对话",
      "timestamp": "ISO8601"
    }
  ]
}
```

---

### 1.2 消息

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/topics/:topicId/messages` | 保存一对用户+AI消息及对应树节点 |
| DELETE | `/api/topics/:topicId/messages/:nodeId` | 删除节点及其所有子孙节点的消息 |
| PATCH | `/api/topics/:topicId/messages/:messageId` | 更新 AI 消息内容（刷新后覆盖） |

**POST `/api/topics/:topicId/messages` 请求体：**
```json
{
  "userMessage": {
    "id": "string",
    "content": "string",
    "images": [],
    "timestamp": "ISO8601"
  },
  "aiMessage": {
    "id": "string",
    "content": "string",
    "timestamp": "ISO8601"
  },
  "treeNode": {
    "id": "string",
    "label": "string",
    "userMessageId": "string",
    "aiMessageId": "string",
    "content": "string",
    "parentNodeId": "string | null",
    "summarized": false
  }
}
```

**PATCH `/api/topics/:topicId/messages/:messageId` 请求体：**
```json
{ "content": "string" }
```

---

### 1.3 笔记

| 方法 | 路径 | 说明 |
|------|------|------|
| PUT | `/api/topics/:topicId/notes` | 保存笔记（全量覆盖） |

**请求体：**
```json
{ "notes": "string" }
```

---

### 1.4 学习日志

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/topics/:topicId/logs` | 保存新生成的日志条目，同时标记节点为 summarized |

**请求体：**
```json
{
  "logs": [
    {
      "timeRange": "2026-03-15 14:00-15:00",
      "summary": "该时间段进行了3次对话",
      "timestamp": "ISO8601"
    }
  ],
  "summarizedNodeIds": ["nodeId1", "nodeId2"]
}
```

---

## 2. 表结构设计

### 2.1 messages

```sql
CREATE TABLE messages (
  id          TEXT PRIMARY KEY,
  topic_id    TEXT NOT NULL,
  type        TEXT NOT NULL CHECK(type IN ('user', 'ai')),
  content     TEXT NOT NULL DEFAULT '',
  images      TEXT NOT NULL DEFAULT '[]',  -- JSON array of base64 strings
  timestamp   TEXT NOT NULL,
  deleted_at  TEXT                          -- 软删除
);

CREATE INDEX idx_messages_topic ON messages(topic_id) WHERE deleted_at IS NULL;
```

### 2.2 tree_nodes

```sql
CREATE TABLE tree_nodes (
  id              TEXT PRIMARY KEY,
  topic_id        TEXT NOT NULL,
  parent_id       TEXT,                     -- NULL 表示根节点
  label           TEXT NOT NULL,
  content         TEXT NOT NULL DEFAULT '',
  user_message_id TEXT NOT NULL,
  ai_message_id   TEXT NOT NULL,
  summarized      INTEGER NOT NULL DEFAULT 0,
  deleted_at      TEXT
);

CREATE INDEX idx_tree_nodes_topic ON tree_nodes(topic_id) WHERE deleted_at IS NULL;
```

### 2.3 topic_meta

```sql
CREATE TABLE topic_meta (
  topic_id  TEXT PRIMARY KEY,
  counter   INTEGER NOT NULL DEFAULT 0,
  notes     TEXT NOT NULL DEFAULT ''
);
```

初始化时插入五条记录：`自由主题`、`产品技术`、`哲学`、`商业`、`英语`。

### 2.4 logs

```sql
CREATE TABLE logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id    TEXT NOT NULL,
  time_range  TEXT NOT NULL,
  summary     TEXT NOT NULL,
  timestamp   TEXT NOT NULL
);

CREATE INDEX idx_logs_topic ON logs(topic_id);
```

---

## 3. 主流程场景

### 场景一：发送消息

**触发**：用户输入文本（含可选图片）点击发送。

1. 前端生成 `userMessageId`、`aiMessageId`，立即更新本地 state（乐观更新），同时向 `/api/chat/send` 发起 SSE 流式请求。
2. SSE 流结束后，前端拿到完整 AI 回复内容。
3. 调用 `POST /api/topics/:topicId/messages`，将 userMessage、aiMessage、treeNode 一次性持久化。
4. 调用 `PUT /api/topics/:topicId/notes` 不需要（笔记未变）；`topic_meta.counter` 在步骤 3 的接口内由后端 +1。

**预期结果**：刷新页面后消息和树节点均可恢复。

---

### 场景二：删除对话节点

**触发**：用户点击某条 AI 消息的删除按钮，确认弹窗后执行。

1. 前端收集该节点及所有子孙节点的 ID（已有 `collectMessageIds` 逻辑）。
2. 调用 `DELETE /api/topics/:topicId/messages/:nodeId`，后端递归软删除该节点及子孙的 `tree_nodes` 和对应 `messages`（设置 `deleted_at`）。
3. 后端返回 200 后，前端更新本地 state（移除对应消息和树节点），选中状态回退到父节点。

**预期结果**：被删节点及子孙从消息列表和树中消失，刷新后不再出现。

---

### 场景三：刷新页面恢复对话

**触发**：用户刷新浏览器或重新打开页面。

1. 前端 `useEffect` 在组件挂载时，对当前 `selectedTopic`（默认 `自由主题`）调用 `GET /api/topics/:topicId/data`。
2. 后端查询 `messages`、`tree_nodes`（按 parent_id 重建树结构）、`topic_meta`、`logs`，组装成与前端 state 一致的结构返回。
3. 前端用返回数据初始化 `topicData[topic]`，切换话题时按需懒加载其他话题数据。

**预期结果**：页面恢复到刷新前的完整状态，消息列表、对话树、笔记、日志均正常显示。

---

## 4. 补充说明

- **自由主题**：`topic_id = '自由主题'`，后端 `PROMPTS['自由主题']` 为空，`/api/chat/send` 不注入 system prompt，其余流程与其他话题完全一致。
- **图片存储**：图片以 base64 存入 `messages.images` 字段（JSON 数组）。单用户场景数据量可控，暂不做文件系统分离。
- **刷新（重新生成）**：SSE 完成后调用 `PATCH /api/topics/:topicId/messages/:aiMessageId` 覆盖旧内容，无需删除重建。
- **软删除**：`deleted_at` 非空即为已删除，所有查询加 `WHERE deleted_at IS NULL`。
