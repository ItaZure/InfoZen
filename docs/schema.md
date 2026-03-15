# 表结构文档

## messages

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PRIMARY KEY | 消息 id |
| topic_id | TEXT NOT NULL | 所属话题 |
| type | TEXT NOT NULL | `user` 或 `ai` |
| content | TEXT NOT NULL | 消息正文 |
| timestamp | TEXT NOT NULL | ISO8601 时间戳 |
| images | TEXT NOT NULL DEFAULT '[]' | 图片列表，JSON 数组（base64 data URL） |
| deleted_at | TEXT | 软删除时间，NULL 表示未删除 |

---

## tree_nodes

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PRIMARY KEY | 节点 id |
| topic_id | TEXT NOT NULL | 所属话题 |
| parent_id | INTEGER | 父节点 id，NULL 表示根节点 |
| label | TEXT NOT NULL | 节点标签（展示用） |
| content | TEXT NOT NULL | 节点摘要内容 |
| user_message_id | INTEGER | 关联的用户消息 id |
| ai_message_id | INTEGER | 关联的 AI 消息 id |
| summarized | INTEGER DEFAULT 0 | 是否已总结，0/1 |
| created_at | TEXT NOT NULL | 创建时间 ISO8601 |
| deleted_at | TEXT | 软删除时间，NULL 表示未删除 |

---

## topic_meta

| 字段 | 类型 | 说明 |
|------|------|------|
| topic_id | TEXT PRIMARY KEY | 话题名称 |
| notes | TEXT DEFAULT '' | 话题笔记 |
| updated_at | TEXT | 最后更新时间 ISO8601 |

预置话题：`自由主题`、`产品技术`、`哲学`、`商业`、`英语`。

---

## logs

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PRIMARY KEY AUTOINCREMENT | 日志 id |
| topic_id | TEXT NOT NULL | 所属话题 |
| time_range | TEXT NOT NULL | 时间段描述，如 `2026-03-15 14:00-15:00` |
| summary | TEXT NOT NULL | 该时间段对话摘要 |
| created_at | TEXT NOT NULL | 创建时间 ISO8601 |
| deleted_at | TEXT | 软删除时间，NULL 表示未删除 |
