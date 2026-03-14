# AI Learning Tool - API 文档

## 基础信息

- **Base URL**: `http://localhost:10101/api`
- **数据格式**: JSON
- **字符编码**: UTF-8

---

## 1. 话题管理

### 1.1 获取所有话题列表

```
GET /api/topics
```

**响应示例**:
```json
{
  "success": true,
  "data": [
    {
      "id": "产品技术",
      "name": "产品技术",
      "messageCount": 24,
      "lastActivity": "2026-03-14T10:30:00Z"
    },
    {
      "id": "哲学",
      "name": "哲学",
      "messageCount": 12,
      "lastActivity": "2026-03-13T15:20:00Z"
    }
  ]
}
```

### 1.2 获取话题详细数据

```
GET /api/topics/:topicId
```

**路径参数**:
- `topicId`: 话题ID

**响应示例**:
```json
{
  "success": true,
  "data": {
    "id": "产品技术",
    "name": "产品技术",
    "messages": [],
    "tree": [],
    "notes": "",
    "logs": []
  }
}
```

### 1.3 创建自定义话题

```
POST /api/topics
```

**请求体**:
```json
{
  "name": "自定义话题名称"
}
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "id": "custom_123",
    "name": "自定义话题名称",
    "messages": [],
    "tree": [],
    "notes": "",
    "logs": []
  }
}
```

### 1.4 删除话题

```
DELETE /api/topics/:topicId
```

**路径参数**:
- `topicId`: 话题ID

**响应示例**:
```json
{
  "success": true,
  "message": "话题已删除"
}
```

---

## 2. 对话消息

### 2.1 发送消息

```
POST /api/chat/send
```

**请求体**:
```json
{
  "topicId": "产品技术",
  "message": "什么是产品思维？",
  "images": [
    "data:image/png;base64,iVBORw0KGgoAAAANS..."
  ],
  "parentNodeId": "node_123",
  "contextMessages": [
    {
      "userContent": "什么是用户增长？",
      "userImages": [],
      "aiContent": "用户增长是指..."
    },
    {
      "userContent": "如何做留存？",
      "userImages": ["data:image/png;base64,iVBORw0KGgoAAAANS..."],
      "aiContent": "留存的关键在于..."
    }
  ]
}
```

**字段说明**:
- `topicId`: 话题ID（必填）
- `message`: 当前用户消息内容（必填）
- `images`: 当前消息附带的图片，base64 格式（可选）
- `parentNodeId`: 选中的父节点ID，用于在对话树中挂载新节点（可选，不传则挂在根节点）
- `contextMessages`: 从根节点到父节点路径上的历史对话，按顺序排列（可选）
  - `userContent`: 该轮用户消息文字内容
  - `userImages`: 该轮用户消息附带的图片，base64 格式
  - `aiContent`: 该轮 AI 回复内容

**后端构造给 LLM 的消息列表**:

后端将 `contextMessages` + 当前消息按顺序拼接，构造成 OpenAI messages 格式后调用 Poe API：

```
Base URL: https://api.poe.com/v1
Model: Gemini-3.1-Pro
Authorization: Bearer <POE_API_KEY>
```

```json
{
  "model": "Gemini-3.1-Pro",
  "messages": [
    {
      "role": "user",
      "content": [
        { "type": "text", "text": "什么是用户增长？" }
      ]
    },
    {
      "role": "assistant",
      "content": "用户增长是指..."
    },
    {
      "role": "user",
      "content": [
        { "type": "text", "text": "如何做留存？" },
        { "type": "image_url", "image_url": { "url": "data:image/png;base64,..." } }
      ]
    },
    {
      "role": "assistant",
      "content": "留存的关键在于..."
    },
    {
      "role": "user",
      "content": [
        { "type": "text", "text": "什么是产品思维？" },
        { "type": "image_url", "image_url": { "url": "data:image/png;base64,..." } }
      ]
    }
  ]
}
```

> 每条 user 消息：文字放第一个 `text` 元素，图片依次追加为 `image_url` 元素。无图片时 `content` 可直接传字符串。

**响应示例**:
```json
{
  "success": true,
  "data": {
    "userMessage": {
      "id": "msg_456",
      "type": "user",
      "content": "什么是产品思维？",
      "images": ["data:image/png;base64,..."],
      "timestamp": "2026-03-14T10:30:00Z",
      "nodeId": "node_456"
    },
    "aiMessage": {
      "id": "msg_457",
      "type": "ai",
      "content": "产品思维是指...",
      "timestamp": "2026-03-14T10:30:05Z",
      "nodeId": "node_456"
    },
    "treeNode": {
      "id": "node_456",
      "label": "什么是产品思维？",
      "messageId": "msg_456",
      "parentId": "node_123",
      "children": []
    }
  }
}
```

### 2.2 获取消息记录

```
GET /api/chat/messages/:topicId
```

**路径参数**:
- `topicId`: 话题ID

**查询参数**:
- `limit`: 返回消息数量限制（可选，默认100）
- `offset`: 偏移量，用于分页（可选，默认0）

**响应示例**:
```json
{
  "success": true,
  "data": {
    "messages": [
      {
        "id": "msg_1",
        "type": "user",
        "content": "用户消息",
        "images": [],
        "timestamp": "2026-03-14T10:00:00Z",
        "nodeId": "node_1"
      },
      {
        "id": "msg_2",
        "type": "ai",
        "content": "AI回复",
        "timestamp": "2026-03-14T10:00:05Z",
        "nodeId": "node_1"
      }
    ],
    "total": 24,
    "hasMore": false
  }
}
```

### 2.3 清空消息记录

```
DELETE /api/chat/messages/:topicId
```

**路径参数**:
- `topicId`: 话题ID

**响应示例**:
```json
{
  "success": true,
  "message": "消息记录已清空"
}
```

---

## 3. 对话树

### 3.1 获取对话树

```
GET /api/chat/tree/:topicId
```

**路径参数**:
- `topicId`: 话题ID

**响应示例**:
```json
{
  "success": true,
  "data": {
    "tree": [
      {
        "id": "node_1",
        "label": "什么是产品思维？",
        "messageId": "msg_1",
        "parentId": null,
        "children": [
          {
            "id": "node_2",
            "label": "如何培养产品思维？",
            "messageId": "msg_3",
            "parentId": "node_1",
            "children": []
          }
        ]
      }
    ]
  }
}
```

### 3.2 获取节点路径

```
GET /api/chat/tree/:topicId/path/:nodeId
```

**路径参数**:
- `topicId`: 话题ID
- `nodeId`: 节点ID

**响应示例**:
```json
{
  "success": true,
  "data": {
    "path": ["node_1", "node_2", "node_3"],
    "messages": [
      {
        "id": "msg_1",
        "type": "user",
        "content": "...",
        "nodeId": "node_1"
      },
      {
        "id": "msg_2",
        "type": "ai",
        "content": "...",
        "nodeId": "node_1"
      }
    ]
  }
}
```

---

## 4. 笔记

### 4.1 获取笔记

```
GET /api/chat/notes/:topicId
```

**路径参数**:
- `topicId`: 话题ID

**响应示例**:
```json
{
  "success": true,
  "data": {
    "notes": "# 学习笔记\n\n产品思维的核心要素...",
    "updatedAt": "2026-03-14T10:30:00Z"
  }
}
```

### 4.2 更新笔记

```
PUT /api/chat/notes/:topicId
```

**路径参数**:
- `topicId`: 话题ID

**请求体**:
```json
{
  "notes": "# 学习笔记\n\n更新后的内容..."
}
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "notes": "# 学习笔记\n\n更新后的内容...",
    "updatedAt": "2026-03-14T10:35:00Z"
  }
}
```

---

## 5. 学习日志

### 5.1 获取学习日志列表

```
GET /api/chat/logs/:topicId
```

**路径参数**:
- `topicId`: 话题ID

**响应示例**:
```json
{
  "success": true,
  "data": {
    "logs": [
      {
        "id": "log_1",
        "title": "产品思维学习总结",
        "content": "通过本次对话，我学习到...",
        "nodeId": "node_1",
        "timestamp": "2026-03-14T10:30:00Z"
      }
    ]
  }
}
```

### 5.2 生成学习日志（总结节点）

```
POST /api/chat/logs/summarize
```

**请求体**:
```json
{
  "topicId": "产品技术",
  "nodeId": "node_1",
  "includeChildren": true
}
```

**字段说明**:
- `topicId`: 话题ID（必填）
- `nodeId`: 要总结的节点ID（必填）
- `includeChildren`: 是否包含子节点内容（可选，默认true）

**响应示例**:
```json
{
  "success": true,
  "data": {
    "log": {
      "id": "log_123",
      "title": "产品思维学习总结",
      "content": "## 核心要点\n\n1. 产品思维的定义...\n2. 培养方法...",
      "nodeId": "node_1",
      "timestamp": "2026-03-14T10:30:00Z"
    }
  }
}
```

### 5.3 删除学习日志

```
DELETE /api/chat/logs/:logId
```

**路径参数**:
- `logId`: 日志ID

**响应示例**:
```json
{
  "success": true,
  "message": "学习日志已删除"
}
```

---

## 6. 图片上传

### 6.1 上传图片

```
POST /api/upload/image
```

**请求体**:
```json
{
  "image": "data:image/png;base64,iVBORw0KGgoAAAANS...",
  "topicId": "产品技术"
}
```

**字段说明**:
- `image`: base64 格式的图片数据（必填）
- `topicId`: 关联的话题ID（可选）

**响应示例**:
```json
{
  "success": true,
  "data": {
    "url": "https://cdn.example.com/images/img_123.png",
    "filename": "img_123.png",
    "size": 102400
  }
}
```

---

## 错误响应格式

所有接口在发生错误时返回统一格式：

```json
{
  "success": false,
  "error": {
    "code": "INVALID_TOPIC",
    "message": "话题不存在"
  }
}
```

**常见错误码**:
- `INVALID_TOPIC`: 话题不存在
- `INVALID_NODE`: 节点不存在
- `INVALID_REQUEST`: 请求参数错误
- `AI_SERVICE_ERROR`: AI服务调用失败
- `DATABASE_ERROR`: 数据库操作失败
- `UPLOAD_ERROR`: 文件上传失败

---

## 数据模型

### Message（消息）
```typescript
{
  id: string;              // 消息ID
  type: "user" | "ai";     // 消息类型
  content: string;         // 消息内容
  images?: string[];       // 图片URL数组
  timestamp: string;       // ISO 8601 时间戳
  nodeId: string;          // 关联的树节点ID
}
```

### TreeNode（对话树节点）
```typescript
{
  id: string;              // 节点ID
  label: string;           // 节点标签（用户问题前20字）
  messageId: string;       // 关联的用户消息ID
  parentId: string | null; // 父节点ID
  children: TreeNode[];    // 子节点数组
}
```

### LearningLog（学习日志）
```typescript
{
  id: string;              // 日志ID
  title: string;           // 日志标题
  content: string;         // 日志内容（Markdown格式）
  nodeId: string;          // 关联的树节点ID
  timestamp: string;       // ISO 8601 时间戳
}
```

### Topic（话题）
```typescript
{
  id: string;              // 话题ID
  name: string;            // 话题名称
  messages: Message[];     // 消息列表
  tree: TreeNode[];        // 对话树
  notes: string;           // 笔记内容（Markdown格式）
  logs: LearningLog[];     // 学习日志列表
}
```

---

## 业务逻辑说明

### 1. 上下文管理
- 发送消息时，如果指定了 `parentNodeId`，后端需要获取从根节点到该节点的完整路径
- 只将路径上的消息（用户+AI）作为 AI 的上下文
- 这样可以实现对话分支，每个分支有独立的上下文

### 2. 对话树构建
- 每次用户发送消息后，自动创建新的树节点
- 如果指定了 `parentNodeId`，新节点作为其子节点
- 如果未指定，新节点作为根节点
- 节点的 `label` 为用户问题的前20个字符

### 3. 学习日志生成
- 用户选择某个节点点击"总结"时，调用 `/api/chat/logs/summarize`
- 后端收集该节点及其所有子节点的对话内容
- 将完整对话发送给 AI，要求生成学习总结
- 总结内容以 Markdown 格式返回

### 4. 图片处理
- 用户粘贴图片时，前端将图片转为 base64
- 可以选择立即上传或在发送消息时一起上传
- 建议在发送消息时一起处理，减少请求次数
