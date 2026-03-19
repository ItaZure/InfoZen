import { Router } from 'express';
import db from '../db.js';

const router = Router();

// 递归构建树结构
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

// GET /api/topics/:topicId
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
       ORDER BY time_range DESC`
    )
    .all(topicId);

  // 所有用户消息（含软删除）的日期统计，用于热力图
  const activityDates = db
    .prepare(
      `SELECT substr(timestamp, 1, 10) AS day, COUNT(*) AS count
       FROM messages
       WHERE topic_id = ? AND type = 'user'
       GROUP BY day`
    )
    .all(topicId);

  res.json({
    messages,
    tree,
    notes: meta?.notes ?? '',
    logs,
    activityDates,
  });
});

// DELETE /api/topics/:topicId/data — 清除话题的消息和对话树（保留笔记和日志）
router.delete('/:topicId/data', (req, res) => {
  const { topicId } = req.params;
  const now = new Date().toISOString();

  db.transaction(() => {
    db.prepare(`UPDATE messages SET deleted_at = ? WHERE topic_id = ? AND deleted_at IS NULL`).run(now, topicId);
    db.prepare(`UPDATE tree_nodes SET deleted_at = ? WHERE topic_id = ? AND deleted_at IS NULL`).run(now, topicId);
  })();

  res.json({ success: true });
});

// POST /api/topics/:topicId/logs/generate — 用 DeepSeek 生成日志
router.post('/:topicId/logs/generate', async (req, res) => {
  const { topicId } = req.params;

  // 查询所有未总结的节点
  const unsummarizedNodes = db
    .prepare(
      `SELECT tn.id, tn.ai_message_id, m_ai.timestamp
       FROM tree_nodes tn
       LEFT JOIN messages m_ai ON m_ai.id = tn.ai_message_id
       WHERE tn.topic_id = ? AND tn.summarized = 0 AND tn.deleted_at IS NULL`
    )
    .all(topicId);

  if (unsummarizedNodes.length === 0) {
    return res.json({ success: true, results: [] });
  }

  // 按 AI 消息的 timestamp 自然日分组
  const nodesByDay = {};
  unsummarizedNodes.forEach((node) => {
    const day = node.timestamp.slice(0, 10); // YYYY-MM-DD
    if (!nodesByDay[day]) nodesByDay[day] = [];
    nodesByDay[day].push(node.id);
  });

  // 并行调用 DeepSeek，每个日期一个请求
  const results = await Promise.all(
    Object.entries(nodesByDay).map(async ([day, nodeIds]) => {
      // 查询该日期下所有节点的消息内容
      const nodes = db
        .prepare(
          `SELECT tn.id, m_user.content AS userContent, m_ai.content AS aiContent
           FROM tree_nodes tn
           LEFT JOIN messages m_user ON m_user.id = tn.user_message_id
           LEFT JOIN messages m_ai ON m_ai.id = tn.ai_message_id
           WHERE tn.id IN (${nodeIds.map(() => '?').join(',')}) AND tn.deleted_at IS NULL`
        )
        .all(...nodeIds);

      const conversationText = nodes
        .map((n) => `用户：${n.userContent}\nAI：${n.aiContent}`)
        .join('\n\n');

      // 查询是否有旧日志
      const existingLog = db
        .prepare(
          `SELECT summary FROM logs WHERE topic_id = ? AND time_range = ? AND deleted_at IS NULL`
        )
        .get(topicId, day);

      const messages = [];

      if (existingLog) {
        // 有旧日志：先把旧摘要作为 assistant 消息，再把新对话内容作为 user 消息
        messages.push({ role: 'assistant', content: existingLog.summary });
        messages.push({ role: 'user', content: conversationText });
        messages.push({ role: 'user', content: '以下是今天新增的对话。请结合上方已有摘要，重新整合并输出今天完整的学习总结，以有序列表形式输出。要求：每条以动词开头，从用户视角描述所做的事或学到的内容（例如：了解了X、探讨了Y、分析了Z）；风格简洁，类似工作日报；列表条数尽量少，上限5条。只输出有序列表，不要有其他内容。' });
      } else {
        // 无旧日志：把对话内容作为 user 消息
        messages.push({ role: 'user', content: conversationText });
        messages.push({ role: 'user', content: '请总结以上对话中用户的学习内容，以有序列表形式输出。要求：每条以动词开头，从用户视角描述所做的事或学到的内容（例如：了解了X、探讨了Y、分析了Z）；风格简洁，类似工作日报；列表条数尽量少，上限5条。只输出有序列表，不要有其他内容。' });
      }

      const response = await fetch(process.env.DEEPSEEK_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages,
          stream: false,
        }),
      });

      if (!response.ok) {
        throw new Error(`DeepSeek API error: ${await response.text()}`);
      }

      const data = await response.json();
      const summary = data.choices?.[0]?.message?.content ?? '';

      // upsert 日志
      const now = new Date().toISOString();
      db.prepare(
        `INSERT INTO logs (topic_id, time_range, summary, created_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(topic_id, time_range) DO UPDATE SET summary = excluded.summary, created_at = excluded.created_at`
      ).run(topicId, day, summary, now);

      // 标记节点为已总结
      db.prepare(
        `UPDATE tree_nodes SET summarized = 1 WHERE id IN (${nodeIds.map(() => '?').join(',')})`
      ).run(...nodeIds);

      return { day, summary };
    })
  );

  res.json({ success: true, results });
});

// PUT /api/topics/:topicId/logs/:timeRange — 编辑日志摘要
router.put('/:topicId/logs/:timeRange', (req, res) => {
  const { topicId, timeRange } = req.params;
  const { summary } = req.body;

  if (!summary) {
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

// DELETE /api/topics/:topicId/logs/:timeRange — 软删除日志
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

export default router;
