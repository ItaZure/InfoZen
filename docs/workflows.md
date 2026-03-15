# 流程场景文档

## 场景一：发送消息并持久化

1. 前端调用 `POST /api/chat/send`，携带消息内容、上下文、topicId 等参数
2. 服务端向 Poe API 发起流式请求，将 SSE 事件��条透传给前端
3. 前端收到 `data: [DONE]` 后，流结束，本地已拼接完整 AI 回复
4. 前端调用 `POST /api/conversations`，将用户消息、AI 消息、树节点一并写入数据库（事务）
5. 服务端返回 `{ success: true }`，前端更新本地状态

---

## 场景二：切换话题加载历史

1. 用户切换到某个话题，前端调用 `GET /api/topics/:topicId`
2. 服务端查询该话题下未删除的消息（按 timestamp 升序）、树节点（递归构建树）、笔记、日志
3. 前端用返回的 `messages` 渲染消息列表，用 `tree` 渲染对话树，用 `notes` 和 `logs` 填充侧边栏

---

## 场景三：刷新 AI 回复（覆盖写）

1. 用户对某条 AI 回复点击"重新生成"
2. 前端重新调用 `POST /api/chat/send` 获取新回复
3. 流结束后，前端调用 `PUT /api/conversations/:nodeId/ai-message`，传入新 `content`
4. 服务端通过 nodeId 找到对应的 `ai_message_id`，直接覆盖 `messages.content`
5. 返回 `{ success: true }`，前端更新本地消息内容

---

## 场景四：删除消息节点

1. 用户在对话树中删除某个节点
2. 前端调用 `DELETE /api/conversations/:nodeId`
3. 服务端递归收集该节点及所有子孙节点的 id，提取关联的 user/ai message id
4. 事务内对所有相关 `messages` 和 `tree_nodes` 写入 `deleted_at`（软删除）
5. 返回 `{ success: true }`，前端从树和消息列表中移除对应节点
