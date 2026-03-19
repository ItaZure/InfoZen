# API 文档

## POST /api/chat/send

发送消息，流式返回 AI 回复（SSE）。

**请求体：**
```json
{
  "message": "string",
  "images": ["base64 data URL"],
  "parentNodeId": "string | null",
  "contextMessages": [
    {
      "userContent": "string",
      "userImages": [],
      "aiContent": "string"
    }
  ],
  "thinkingLevel": "low | medium | high",
  "webSearch": false,
  "topicId": "string"
}
```

**响应：** `text/event-stream`，每条事件格式与 OpenAI SSE 兼容，最后发送 `data: [DONE]`。

**错误码：**
| 状态码 | code | 说明 |
|--------|------|------|
| 500 | `AI_SERVICE_ERROR` | Poe API 调用失败或服务内部错误 |

---

## GET /api/topics/:topicId

加载话题完整数据（消息列表、对话树、笔记、日志）。

**Path Params：**
- `topicId`：话题名称，如 `自由主题`

**响应：**
```json
{
  "messages": [
    {
      "id": "integer",
      "type": "user | ai",
      "content": "string",
      "timestamp": "ISO8601",
      "images": []
    }
  ],
  "tree": [
    {
      "id": "integer",
      "parentId": "integer | null",
      "label": "string",
      "content": "string",
      "userMessageId": "integer",
      "aiMessageId": "integer",
      "summarized": false,
      "children": []
    }
  ],
  "notes": "string",
  "logs": [
    {
      "timeRange": "string",
      "summary": "string",
      "timestamp": "ISO8601"
    }
  ]
}
```

---

## DELETE /api/topics/:topicId/data

软删除话题下所有消息和树节点（保留笔记和日志）。

**Path Params：**
- `topicId`：话题名称

**响应：**
```json
{ "success": true }
```

---

## POST /api/conversations

保存一对用户消息 + AI 消息及对应树节点（事务写入）。

**请求体：**
```json
{
  "topicId": "string",
  "userMessage": {
    "id": "integer",
    "content": "string",
    "images": [],
    "timestamp": "ISO8601"
  },
  "aiMessage": {
    "id": "integer",
    "content": "string",
    "timestamp": "ISO8601"
  },
  "treeNode": {
    "id": "integer",
    "label": "string",
    "content": "string",
    "parentId": "integer | null"
  }
}
```

**响应：**
```json
{ "success": true }
```

---

## DELETE /api/conversations/:nodeId

软删除指定节点及其所有子孙节点（含关联消息）。

**Path Params：**
- `nodeId`：树节点 id（integer）

**响应：**
```json
{ "success": true }
```

**错误码：**
| 状态码 | 说明 |
|--------|------|
| 404 | 节点不存在或已删除 |

---

## PUT /api/conversations/:nodeId/ai-message

覆盖更新指定节点关联的 AI 消息内容（用于刷新回复后覆盖）。

**Path Params：**
- `nodeId`：树节点 id（integer）

**请求体：**
```json
{ "content": "string" }
```

**响应：**
```json
{ "success": true }
```

**错误码：**
| 状态码 | 说明 |
|--------|------|
| 400 | `content` 字段缺失 |
| 404 | 节点不存在或已删除 |

---

## POST /api/wisdom/summarize

抓取网页正文并用 DeepSeek 生成中文摘要。

**请求体：**
```json
{ "url": "string" }
```

**响应：**
```json
{
  "id": "integer",
  "url": "string",
  "title_en": "string | null",
  "title_zh": "string",
  "summary": "string",
  "created_at": "ISO8601"
}
```

**错误码：**
| 状态码 | error | 说明 |
|--------|-------|------|
| 400 | — | `url` 字段缺失 |
| 500 | `FETCH_FAILED` | 网页抓取失败 |
| 500 | `AI_FAILED` | DeepSeek 调用失败 |

---

## GET /api/wisdom/articles

分页获取历史摘要列表，按创建时间倒序。

**Query Params：**
- `page`：页码，默认 1
- `limit`：每页条数，默认 10，最大 50

**响应：**
```json
{
  "articles": [
    {
      "id": "integer",
      "url": "string",
      "title_en": "string | null",
      "title_zh": "string",
      "summary": "string",
      "created_at": "ISO8601"
    }
  ],
  "hasMore": "boolean"
}
```

---

## DELETE /api/wisdom/articles/:id

删除指定摘要（硬删除）。

**响应：**
```json
{ "success": true }
```

**错误码：**
| 状态码 | 说明 |
|--------|------|
| 404 | 文章不存在 |

---

## GET /api/wisdom/quick-links

获取所有快捷链接，按 sort_order 升序。

**响应：**
```json
{ "links": [{ "id": "integer", "name": "string", "url": "string", "sort_order": "integer" }] }
```

---

## POST /api/wisdom/quick-links

新增快捷链接。

**请求体：**
```json
{ "name": "string", "url": "string" }
```

**响应：**
```json
{ "id": "integer", "name": "string", "url": "string" }
```

---

## DELETE /api/wisdom/quick-links/:id

删除快捷链接。

**响应：**
```json
{ "success": true }
```
