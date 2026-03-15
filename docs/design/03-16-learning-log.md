# 03-16 学习日志功能升级 — 概要设计

---

## 接口变更

### 1. POST /api/topics/:topicId/logs/generate（改造）

**现状问题：** 前端传入 `days[].nodeIds`，后端依赖前端提供节点列表，职责错位，且前端需要维护未总结节点的状态。

**改造方案：** 前端不再传任何 body，后端自行查询。

```
请求体：无（空 body）
```

后端逻辑：
1. 查询 `tree_nodes` 中 `topic_id = :topicId AND summarized = 0 AND deleted_at IS NULL` 的所有节点
2. 按节点关联 AI 消息的 `timestamp` 自然日（`YYYY-MM-DD`）分组
3. 各日期并行调用 DeepSeek，同时查询该日是否已有旧日志（`logs` 表），有则在 prompt 中附上旧摘要内容并使用"已有旧日志"版本的指令
4. upsert 写入 `logs`，批量更新 `tree_nodes.summarized = 1`

```json
响应：{ "success": true, "results": [{ "day": "YYYY-MM-DD", "summary": "string" }] }
```

错误响应：DeepSeek 调用失败时返回 500，前端 alert 提示。

---

### 2. PUT /api/topics/:topicId/logs/:timeRange（新增）

手动编辑日志摘要内容。

```
请求体：{ "summary": "string" }
响应：{ "success": true }
错误：404（日志不存在或已删除）、400（summary 缺失）
```

---

### 3. DELETE /api/topics/:topicId/logs/:timeRange（新增）

软删除指定日期日志，写入 `deleted_at`。

```
响应：{ "success": true }
错误：404（日志不存在或已删除）
```

---

### 4. GET /api/topics/:topicId（新增返回字段）

已在现有实现中返回 `activityDates`，无需改动后端逻辑。需补充 API 文档：

```json
"activityDates": [{ "day": "YYYY-MM-DD", "count": 3 }]
```

统计范围：该话题下所有 `type = 'user'` 的消息，**含软删除记录**（不加 `deleted_at IS NULL` 过滤）。

---

## 表结构变更

### logs 表新增唯一约束

```sql
UNIQUE(topic_id, time_range)
```

用途：支持 `ON CONFLICT(topic_id, time_range) DO UPDATE` upsert，保证同一话题同一日期只有一条日志。

现有实现中 upsert SQL 已写好，但建表语句缺少该约束，需迁移。

**迁移方案：** 服务启动时检测约束是否存在，不存在则重建表（`CREATE TABLE logs_new → INSERT INTO logs_new SELECT * FROM logs → DROP TABLE logs → ALTER TABLE logs_new RENAME TO logs`），兼容已有数据。

其余表结构无需变更。

---

## 主流程场景

### 场景 1：首次生成日志

用户在某话题下完成若干对话后，点击「更新日志」按钮。

1. 前端调用 `POST /api/topics/:topicId/logs/generate`（无 body）
2. 后端查到 N 个 `summarized = 0` 的节点，按日期分为 2 组（如 03-14、03-15）
3. 两组并行调用 DeepSeek，均无旧日志，使用无旧日志版 prompt
4. upsert 写入 2 条 logs，将 N 个节点标记 `summarized = 1`
5. 返回 `{ success: true, results: [{day: "03-14", summary: "..."}, {day: "03-15", summary: "..."}] }`
6. 前端刷新日志列表，面包屑节点显示绿色边框，按钮置灰

---

### 场景 2：增量更新日志（已有旧日志的日期又新增了对话）

用户在 03-15 又进行了新对话，再次点击「更新日志」。

1. 前端调用 `POST /api/topics/:topicId/logs/generate`
2. 后端查到新增的 M 个 `summarized = 0` 节点，均属于 03-15
3. 查询 `logs` 表发现 03-15 已有旧摘要，将旧摘要内容拼入 prompt，使用"已有旧日志"版指令
4. DeepSeek 综合旧摘要 + 新对话内容，生成合并后的新摘要
5. upsert 覆盖 03-15 的日志记录，标记新节点 `summarized = 1`
6. 前端日志列表中 03-15 卡片内容更新

---

### 场景 3：手动编辑 / 删除日志

用户 hover 某条日志卡片，点击「编辑」或「删除」。

编辑流程：
1. 前端 inline textarea 展示当前 summary，用户修改后点击保存
2. 调用 `PUT /api/topics/:topicId/logs/2026-03-15`，body `{ summary: "..." }`
3. 后端更新 `logs.summary`，返回 `{ success: true }`
4. 前端退出编辑态，卡片显示新内容

删除流程：
1. 用户点击「删除」，前端弹出二次确认遮罩
2. 确认后调用 `DELETE /api/topics/:topicId/logs/2026-03-15`
3. 后端写入 `deleted_at`，返回 `{ success: true }`
4. 前端从列表移���该卡片
