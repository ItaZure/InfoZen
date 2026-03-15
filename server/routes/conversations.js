import { Router } from 'express';
import db from '../db.js';

const router = Router();

// 递归收集节点及所有子孙节点 id
function collectDescendantIds(nodes, nodeId) {
  const ids = [nodeId];
  const children = nodes.filter((n) => n.parent_id === nodeId);
  for (const child of children) {
    ids.push(...collectDescendantIds(nodes, child.id));
  }
  return ids;
}

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
    insertMsg.run(userMessage.id, topicId, 'user', userMessage.content, userMessage.timestamp, JSON.stringify(userMessage.images ?? []));
    insertMsg.run(aiMessage.id, topicId, 'ai', aiMessage.content, aiMessage.timestamp, JSON.stringify([]));
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

  if (content === undefined || content === null) {
    return res.status(400).json({ error: 'content is required' });
  }

  const node = db
    .prepare(`SELECT ai_message_id FROM tree_nodes WHERE id = ? AND deleted_at IS NULL`)
    .get(nodeId);

  if (!node) return res.status(404).json({ error: 'Node not found' });

  db.prepare(`UPDATE messages SET content = ? WHERE id = ?`).run(content, node.ai_message_id);
  res.json({ success: true });
});

export default router;
