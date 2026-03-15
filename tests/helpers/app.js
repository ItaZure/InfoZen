/**
 * 可测试的 Express app 工厂
 *
 * 接受一个 db 实例（内存数据库），将其注入路由，
 * 返回 Express app 供 supertest 使用。
 * 不监听任何端口，不影响生产服务。
 */

import express from 'express';
import { Router } from 'express';

// ---------- topics 路由（内联，注入 db） ----------

function buildTree(nodes, parentId = null) {
  return nodes
    .filter((n) => n.parent_id === parentId)
    .map((n) => ({
      id: n.id,
      parentId: n.parent_id,
      label: n.label,
      content: n.content,
      userMessageId: n.user_message_id,
      aiMessageId: n.ai_message_id,
      summarized: n.summarized === 1,
      children: buildTree(nodes, n.id),
    }));
}

function createTopicsRouter(db) {
  const router = Router();

  router.get('/:topicId', (req, res) => {
    const { topicId } = req.params;

    const messages = db
      .prepare(
        `SELECT id, type, content, timestamp, images FROM messages
         WHERE topic_id = ? AND deleted_at IS NULL
         ORDER BY timestamp ASC`
      )
      .all(topicId)
      .map((m) => ({ ...m, images: JSON.parse(m.images ?? '[]') }));

    const rawNodes = db
      .prepare(
        `SELECT id, parent_id, label, content, user_message_id, ai_message_id, summarized
         FROM tree_nodes
         WHERE topic_id = ? AND deleted_at IS NULL`
      )
      .all(topicId);

    const tree = buildTree(rawNodes);

    const meta = db
      .prepare(`SELECT notes FROM topic_meta WHERE topic_id = ?`)
      .get(topicId);

    const logs = db
      .prepare(
        `SELECT time_range AS timeRange, summary, created_at AS timestamp
         FROM logs
         WHERE topic_id = ? AND deleted_at IS NULL
         ORDER BY created_at ASC`
      )
      .all(topicId);

    res.json({
      messages,
      tree,
      notes: meta?.notes ?? '',
      logs,
    });
  });

  // POST /api/topics/:topicId/logs/generate
  router.post('/:topicId/logs/generate', async (req, res) => {
    const { topicId } = req.params;
    const { dates } = req.body;

    if (!dates || !Array.isArray(dates) || dates.length === 0) {
      return res.status(400).json({ error: 'dates array is required' });
    }

    try {
      await Promise.all(
        dates.map(async (date) => {
          // 查询该日期的用户消息和 AI 回复
          const messages = db
            .prepare(
              `SELECT type, content FROM messages
               WHERE topic_id = ? AND substr(timestamp, 1, 10) = ? AND deleted_at IS NULL
               ORDER BY timestamp ASC`
            )
            .all(topicId, date);

          // 过滤出用户消息和 AI 消息
          const userMessages = messages.filter((m) => m.type === 'user');
          const aiMessages = messages.filter((m) => m.type === 'ai');

          let summary;

          if (userMessages.length === 0) {
            // 无用户消息，直接记录空内容
            summary = '当天无学习记录';
          } else {
            // 构建对话文本
            const conversationText = messages
              .map((m) => `${m.type === 'user' ? '用户' : 'AI'}：${m.content}`)
              .join('\n\n');

            // 查询是否有旧日志
            const existingLog = db
              .prepare(
                `SELECT summary FROM logs WHERE topic_id = ? AND time_range = ? AND deleted_at IS NULL`
              )
              .get(topicId, date);

            const apiMessages = [];

            if (existingLog) {
              // 有旧日志：先把旧摘要作为 assistant 消息
              apiMessages.push({ role: 'assistant', content: existingLog.summary });
              apiMessages.push({ role: 'user', content: conversationText });
              apiMessages.push({
                role: 'user',
                content: '我们之前已经做过了一些对话，你需要总结刚刚我和你的对话记录，返回给我一个有序列表，非常简要地总结我们的对话内容。你的回复只需要有序列表即可',
              });
            } else {
              // 无旧日志
              apiMessages.push({ role: 'user', content: conversationText });
              apiMessages.push({
                role: 'user',
                content: '你需要总结刚刚我和你的对话记录，返回给我一个有序列表，非常简要地总结我们的对话内容。你的回复只需要有序列表即可',
              });
            }

            // 调用 DeepSeek API
            const response = await fetch(process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY || 'test-key'}`,
              },
              body: JSON.stringify({
                model: 'deepseek-chat',
                messages: apiMessages,
                stream: false,
              }),
            });

            if (!response.ok) {
              throw new Error(`DeepSeek API error: ${await response.text()}`);
            }

            const data = await response.json();
            summary = data.choices?.[0]?.message?.content ?? '';
          }

          // upsert 日志
          const now = new Date().toISOString();

          // 先检查是否存在已删除的记录
          const deletedLog = db
            .prepare(`SELECT id FROM logs WHERE topic_id = ? AND time_range = ? AND deleted_at IS NOT NULL`)
            .get(topicId, date);

          if (deletedLog) {
            // 如果存在已删除的记录，更新它
            db.prepare(
              `UPDATE logs SET summary = ?, created_at = ?, deleted_at = NULL WHERE id = ?`
            ).run(summary, now, deletedLog.id);
          } else {
            // 否则使用 upsert
            db.prepare(
              `INSERT INTO logs (topic_id, time_range, summary, created_at)
               VALUES (?, ?, ?, ?)
               ON CONFLICT(topic_id, time_range) DO UPDATE SET summary = excluded.summary, created_at = excluded.created_at`
            ).run(topicId, date, summary, now);
          }
        })
      );

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // PUT /api/topics/:topicId/logs/:timeRange
  router.put('/:topicId/logs/:timeRange', (req, res) => {
    const { topicId, timeRange } = req.params;
    const { summary } = req.body;

    if (summary === undefined || summary === null) {
      return res.status(400).json({ error: 'summary is required' });
    }

    const log = db
      .prepare(`SELECT id FROM logs WHERE topic_id = ? AND time_range = ? AND deleted_at IS NULL`)
      .get(topicId, timeRange);

    if (!log) {
      return res.status(404).json({ error: 'Log not found' });
    }

    db.prepare(`UPDATE logs SET summary = ? WHERE id = ?`).run(summary, log.id);

    res.json({ success: true });
  });

  // DELETE /api/topics/:topicId/logs/:timeRange
  router.delete('/:topicId/logs/:timeRange', (req, res) => {
    const { topicId, timeRange } = req.params;

    const log = db
      .prepare(`SELECT id FROM logs WHERE topic_id = ? AND time_range = ? AND deleted_at IS NULL`)
      .get(topicId, timeRange);

    if (!log) {
      return res.status(404).json({ error: 'Log not found' });
    }

    const now = new Date().toISOString();
    db.prepare(`UPDATE logs SET deleted_at = ? WHERE id = ?`).run(now, log.id);

    res.json({ success: true });
  });

  return router;
}

// ---------- conversations 路由（内联，注入 db） ----------

function collectDescendantIds(nodes, nodeId) {
  const ids = [nodeId];
  const children = nodes.filter((n) => n.parent_id === nodeId);
  for (const child of children) {
    ids.push(...collectDescendantIds(nodes, child.id));
  }
  return ids;
}

function createConversationsRouter(db) {
  const router = Router();

  // POST /api/conversations
  router.post('/', (req, res) => {
    const { topicId, userMessage, aiMessage, treeNode } = req.body;

    const insertMsg = db.prepare(
      `INSERT OR REPLACE INTO messages (id, topic_id, type, content, timestamp, images)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    const insertNode = db.prepare(
      `INSERT OR REPLACE INTO tree_nodes
         (id, topic_id, parent_id, label, content, user_message_id, ai_message_id, summarized, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`
    );

    db.transaction(() => {
      insertMsg.run(
        userMessage.id,
        topicId,
        'user',
        userMessage.content,
        userMessage.timestamp,
        JSON.stringify(userMessage.images ?? [])
      );
      insertMsg.run(
        aiMessage.id,
        topicId,
        'ai',
        aiMessage.content,
        aiMessage.timestamp,
        JSON.stringify([])
      );
      insertNode.run(
        treeNode.id,
        topicId,
        treeNode.parentId ?? null,
        treeNode.label,
        treeNode.content,
        userMessage.id,
        aiMessage.id,
        new Date().toISOString()
      );
    })();

    res.json({ success: true });
  });

  // DELETE /api/conversations/:nodeId
  router.delete('/:nodeId', (req, res) => {
    const nodeId = Number(req.params.nodeId);
    const now = new Date().toISOString();

    const targetNode = db
      .prepare(`SELECT topic_id FROM tree_nodes WHERE id = ? AND deleted_at IS NULL`)
      .get(nodeId);

    if (!targetNode) return res.status(404).json({ error: 'Node not found' });

    const allNodes = db
      .prepare(`SELECT id, parent_id FROM tree_nodes WHERE topic_id = ? AND deleted_at IS NULL`)
      .all(targetNode.topic_id);

    const idsToDelete = collectDescendantIds(allNodes, nodeId);

    const nodes = db
      .prepare(
        `SELECT user_message_id, ai_message_id FROM tree_nodes WHERE id IN (${idsToDelete.map(() => '?').join(',')})`
      )
      .all(...idsToDelete);

    const messageIds = nodes.flatMap((n) => [n.user_message_id, n.ai_message_id]).filter(Boolean);

    db.transaction(() => {
      if (messageIds.length > 0) {
        db.prepare(
          `UPDATE messages SET deleted_at = ? WHERE id IN (${messageIds.map(() => '?').join(',')})`
        ).run(now, ...messageIds);
      }
      db.prepare(
        `UPDATE tree_nodes SET deleted_at = ? WHERE id IN (${idsToDelete.map(() => '?').join(',')})`
      ).run(now, ...idsToDelete);
    })();

    res.json({ success: true });
  });

  // PUT /api/conversations/:nodeId/ai-message
  router.put('/:nodeId/ai-message', (req, res) => {
    const nodeId = Number(req.params.nodeId);
    const { content } = req.body;

    const node = db
      .prepare(`SELECT ai_message_id FROM tree_nodes WHERE id = ? AND deleted_at IS NULL`)
      .get(nodeId);

    if (!node) return res.status(404).json({ error: 'Node not found' });

    db.prepare(`UPDATE messages SET content = ? WHERE id = ?`).run(content, node.ai_message_id);
    res.json({ success: true });
  });

  return router;
}

// ---------- app 工厂 ----------

export function createApp(db) {
  const app = express();
  app.use(express.json({ limit: '50mb' }));
  app.use('/api/topics', createTopicsRouter(db));
  app.use('/api/conversations', createConversationsRouter(db));
  return app;
}
