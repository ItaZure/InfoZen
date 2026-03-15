/**
 * DELETE /api/conversations/:nodeId 接口测试
 *
 * 覆盖：
 *  - 正常情况：删除根节点、删除中间节点级联子孙、返回 { success: true }
 *  - 边界情况：节点已软删除后再删、删除叶子节点、跨话题隔离
 *  - 错误情况：nodeId 不存在返回 404
 */

import request from 'supertest';
import { createTestDb } from './helpers/db.js';
import { createApp } from './helpers/app.js';

let db;
let app;

beforeEach(() => {
  db = createTestDb();
  app = createApp(db);
});

afterEach(() => {
  db.close();
});

// ---------- 工具函数 ----------

/**
 * 直接向内存 db 插入一条完整对话（消息 + 树节点）
 */
function insertConversation(db, {
  topicId = '自由主题',
  nodeId,
  parentId = null,
  userMsgId,
  aiMsgId,
} = {}) {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO messages (id, topic_id, type, content, timestamp, images)
     VALUES (?, ?, 'user', '用户消息', ?, '[]')`
  ).run(userMsgId, topicId, now);
  db.prepare(
    `INSERT INTO messages (id, topic_id, type, content, timestamp, images)
     VALUES (?, ?, 'ai', 'AI 回复', ?, '[]')`
  ).run(aiMsgId, topicId, now);
  db.prepare(
    `INSERT INTO tree_nodes (id, topic_id, parent_id, label, content, user_message_id, ai_message_id, summarized, created_at)
     VALUES (?, ?, ?, '节点', '', ?, ?, 0, ?)`
  ).run(nodeId, topicId, parentId, userMsgId, aiMsgId, now);
}

// ============================================================
describe('DELETE /api/conversations/:nodeId', () => {

  // ---- 正常情况 ----

  test('删除单个节点 —— 返回 { success: true }', async () => {
    insertConversation(db, { nodeId: 1, userMsgId: 10, aiMsgId: 11 });

    const res = await request(app).delete('/api/conversations/1');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
  });

  test('被删节点的 tree_nodes 设置 deleted_at', async () => {
    insertConversation(db, { nodeId: 1, userMsgId: 10, aiMsgId: 11 });

    await request(app).delete('/api/conversations/1');

    const node = db.prepare(`SELECT deleted_at FROM tree_nodes WHERE id = 1`).get();
    expect(node.deleted_at).not.toBeNull();
  });

  test('被删节点对应的 messages 设置 deleted_at（软删除）', async () => {
    insertConversation(db, { nodeId: 1, userMsgId: 10, aiMsgId: 11 });

    await request(app).delete('/api/conversations/1');

    const msgs = db.prepare(`SELECT deleted_at FROM messages WHERE id IN (10, 11)`).all();
    expect(msgs.every((m) => m.deleted_at !== null)).toBe(true);
  });

  test('删除父节点时，子节点及其消息全部软删除', async () => {
    // 根节点 1 → 子节点 2 → 孙节点 3
    insertConversation(db, { nodeId: 1, userMsgId: 10, aiMsgId: 11 });
    insertConversation(db, { nodeId: 2, parentId: 1, userMsgId: 12, aiMsgId: 13 });
    insertConversation(db, { nodeId: 3, parentId: 2, userMsgId: 14, aiMsgId: 15 });

    await request(app).delete('/api/conversations/1');

    const activeNodes = db
      .prepare(`SELECT COUNT(*) as c FROM tree_nodes WHERE deleted_at IS NULL`)
      .get();
    const activeMsgs = db
      .prepare(`SELECT COUNT(*) as c FROM messages WHERE deleted_at IS NULL`)
      .get();

    expect(activeNodes.c).toBe(0);
    expect(activeMsgs.c).toBe(0);
  });

  test('删除中间节点时，只删除该节点及其子孙，父节点不受影响', async () => {
    // 根节点 1 → 子节点 2 → 孙节点 3
    insertConversation(db, { nodeId: 1, userMsgId: 10, aiMsgId: 11 });
    insertConversation(db, { nodeId: 2, parentId: 1, userMsgId: 12, aiMsgId: 13 });
    insertConversation(db, { nodeId: 3, parentId: 2, userMsgId: 14, aiMsgId: 15 });

    // 删除子节点 2（孙节点 3 应一起被删）
    await request(app).delete('/api/conversations/2');

    const activeNodes = db
      .prepare(`SELECT id FROM tree_nodes WHERE deleted_at IS NULL`)
      .all();
    const activeMsgIds = db
      .prepare(`SELECT id FROM messages WHERE deleted_at IS NULL`)
      .all()
      .map((r) => r.id);

    // 只剩根节点 1
    expect(activeNodes.map((n) => n.id)).toEqual([1]);
    // 只剩根节点的两条消息
    expect(activeMsgIds.sort()).toEqual([10, 11].sort());
  });

  test('删除叶子节点，不影响父节点和其他兄弟节点', async () => {
    // 根节点 1，两个子节点 2 和 3
    insertConversation(db, { nodeId: 1, userMsgId: 10, aiMsgId: 11 });
    insertConversation(db, { nodeId: 2, parentId: 1, userMsgId: 12, aiMsgId: 13 });
    insertConversation(db, { nodeId: 3, parentId: 1, userMsgId: 14, aiMsgId: 15 });

    // 删除叶子节点 2
    await request(app).delete('/api/conversations/2');

    const activeNodeIds = db
      .prepare(`SELECT id FROM tree_nodes WHERE deleted_at IS NULL`)
      .all()
      .map((r) => r.id);

    expect(activeNodeIds.sort()).toEqual([1, 3].sort());
  });

  // ---- 边界情况 ----

  test('删除后，GET 话题数据不再包含被删节点和消息', async () => {
    insertConversation(db, { nodeId: 1, userMsgId: 10, aiMsgId: 11 });

    await request(app).delete('/api/conversations/1');

    const res = await request(app).get('/api/topics/自由主题');
    expect(res.body.messages).toHaveLength(0);
    expect(res.body.tree).toHaveLength(0);
  });

  test('跨话题隔离：删除话题 A 的节点，不影响话题 B', async () => {
    insertConversation(db, { topicId: '自由主题', nodeId: 1, userMsgId: 10, aiMsgId: 11 });
    insertConversation(db, { topicId: '哲学', nodeId: 2, userMsgId: 12, aiMsgId: 13 });

    await request(app).delete('/api/conversations/1');

    const activeInPhilosophy = db
      .prepare(`SELECT COUNT(*) as c FROM tree_nodes WHERE topic_id = '哲学' AND deleted_at IS NULL`)
      .get();
    expect(activeInPhilosophy.c).toBe(1);
  });

  test('已删除节点的 deleted_at 是有效 ISO 时间字符串', async () => {
    insertConversation(db, { nodeId: 1, userMsgId: 10, aiMsgId: 11 });

    await request(app).delete('/api/conversations/1');

    const node = db.prepare(`SELECT deleted_at FROM tree_nodes WHERE id = 1`).get();
    expect(() => new Date(node.deleted_at).toISOString()).not.toThrow();
  });

  // ---- 错误情况 ----

  test('nodeId 不存在 —— 返回 404 和错误信息', async () => {
    const res = await request(app).delete('/api/conversations/9999');

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  test('已被软删除的节点再次删除 —— 返回 404', async () => {
    insertConversation(db, { nodeId: 1, userMsgId: 10, aiMsgId: 11 });

    await request(app).delete('/api/conversations/1');
    const res = await request(app).delete('/api/conversations/1');

    expect(res.status).toBe(404);
  });

  test('非数字 nodeId —— 后端处理不崩溃（404 或 500）', async () => {
    const res = await request(app).delete('/api/conversations/abc');

    // Number('abc') === NaN，查询返回 undefined → 404
    expect([404, 500]).toContain(res.status);
  });
});
