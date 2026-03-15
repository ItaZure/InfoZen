/**
 * PUT /api/conversations/:nodeId/ai-message 接口测试
 *
 * 覆盖：
 *  - 正常情况：更新 AI 消息内容、返回 { success: true }、只更新 AI 消息不动用户消息
 *  - 边界情况：内容更新为空字符串、多次更新同一节点、更新后 GET 可取回最新内容
 *  - 错误情况：nodeId 不存在返回 404、已软删除节点返回 404、缺少 content 字段
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

function insertConversation(db, {
  topicId = '自由主题',
  nodeId,
  parentId = null,
  userMsgId,
  aiMsgId,
  aiContent = 'AI 原始回复',
} = {}) {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO messages (id, topic_id, type, content, timestamp, images)
     VALUES (?, ?, 'user', '用户消息', ?, '[]')`
  ).run(userMsgId, topicId, now);
  db.prepare(
    `INSERT INTO messages (id, topic_id, type, content, timestamp, images)
     VALUES (?, ?, 'ai', ?, ?, '[]')`
  ).run(aiMsgId, topicId, aiContent, now);
  db.prepare(
    `INSERT INTO tree_nodes (id, topic_id, parent_id, label, content, user_message_id, ai_message_id, summarized, created_at)
     VALUES (?, ?, ?, '节点', '', ?, ?, 0, ?)`
  ).run(nodeId, topicId, parentId, userMsgId, aiMsgId, now);
}

// ============================================================
describe('PUT /api/conversations/:nodeId/ai-message', () => {

  // ---- 正常情况 ----

  test('更新成功 —— 返回 { success: true }', async () => {
    insertConversation(db, { nodeId: 1, userMsgId: 10, aiMsgId: 11 });

    const res = await request(app)
      .put('/api/conversations/1/ai-message')
      .send({ content: '更新后的内容' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
  });

  test('AI 消息内容被正确更新到数据库', async () => {
    insertConversation(db, { nodeId: 1, userMsgId: 10, aiMsgId: 11 });

    await request(app)
      .put('/api/conversations/1/ai-message')
      .send({ content: '更新后的 AI 内容' });

    const msg = db.prepare(`SELECT content FROM messages WHERE id = 11`).get();
    expect(msg.content).toBe('更新后的 AI 内容');
  });

  test('只更新 AI 消息，用户消息内容不变', async () => {
    insertConversation(db, { nodeId: 1, userMsgId: 10, aiMsgId: 11 });

    const before = db.prepare(`SELECT content FROM messages WHERE id = 10`).get();

    await request(app)
      .put('/api/conversations/1/ai-message')
      .send({ content: '新 AI 内容' });

    const after = db.prepare(`SELECT content FROM messages WHERE id = 10`).get();
    expect(after.content).toBe(before.content);
  });

  test('更新后通过 GET /api/topics/:topicId 可取回最新内容', async () => {
    insertConversation(db, { nodeId: 1, userMsgId: 10, aiMsgId: 11 });

    await request(app)
      .put('/api/conversations/1/ai-message')
      .send({ content: '刷新后的回复内容' });

    const res = await request(app).get('/api/topics/自由主题');
    const aiMsg = res.body.messages.find((m) => m.type === 'ai');
    expect(aiMsg.content).toBe('刷新后的回复内容');
  });

  // ---- 边界情况 ----

  test('内容更新为空字符串时，数据库存储空字符串', async () => {
    insertConversation(db, { nodeId: 1, userMsgId: 10, aiMsgId: 11, aiContent: '原始内容' });

    await request(app)
      .put('/api/conversations/1/ai-message')
      .send({ content: '' });

    const msg = db.prepare(`SELECT content FROM messages WHERE id = 11`).get();
    expect(msg.content).toBe('');
  });

  test('对同一节点多次更新，最后一次生效', async () => {
    insertConversation(db, { nodeId: 1, userMsgId: 10, aiMsgId: 11 });

    await request(app).put('/api/conversations/1/ai-message').send({ content: '第一次' });
    await request(app).put('/api/conversations/1/ai-message').send({ content: '第二次' });
    await request(app).put('/api/conversations/1/ai-message').send({ content: '第三次' });

    const msg = db.prepare(`SELECT content FROM messages WHERE id = 11`).get();
    expect(msg.content).toBe('第三次');
  });

  test('更新内容包含 Markdown 特殊字符时正确存储', async () => {
    const markdown = '# 标题\n\n```js\nconsole.log("hello")\n```\n\n> 引用 & 特殊 <tag>';
    insertConversation(db, { nodeId: 1, userMsgId: 10, aiMsgId: 11 });

    await request(app)
      .put('/api/conversations/1/ai-message')
      .send({ content: markdown });

    const msg = db.prepare(`SELECT content FROM messages WHERE id = 11`).get();
    expect(msg.content).toBe(markdown);
  });

  test('不同话题的节点独立更新，互不影响', async () => {
    insertConversation(db, { topicId: '自由主题', nodeId: 1, userMsgId: 10, aiMsgId: 11 });
    insertConversation(db, { topicId: '哲学', nodeId: 2, userMsgId: 12, aiMsgId: 13 });

    await request(app).put('/api/conversations/1/ai-message').send({ content: '自由主题更新' });

    const philosophyMsg = db.prepare(`SELECT content FROM messages WHERE id = 13`).get();
    expect(philosophyMsg.content).toBe('AI 原始回复');
  });

  // ---- 错误情况 ----

  test('nodeId 不存在 —— 返回 404 和错误信息', async () => {
    const res = await request(app)
      .put('/api/conversations/9999/ai-message')
      .send({ content: '内容' });

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  test('已软删除的节点 —— 返回 404', async () => {
    insertConversation(db, { nodeId: 1, userMsgId: 10, aiMsgId: 11 });
    db.prepare(`UPDATE tree_nodes SET deleted_at = ? WHERE id = 1`).run(new Date().toISOString());

    const res = await request(app)
      .put('/api/conversations/1/ai-message')
      .send({ content: '新内容' });

    expect(res.status).toBe(404);
  });

  test('缺少 content 字段 —— better-sqlite3 对 undefined 抛异常，返回 500', async () => {
    insertConversation(db, { nodeId: 1, userMsgId: 10, aiMsgId: 11, aiContent: '原始内容' });

    // 不传 content，content 解构为 undefined
    // better-sqlite3 不接受 undefined 参数，直接抛出 TypeError → Express 返回 500
    const res = await request(app)
      .put('/api/conversations/1/ai-message')
      .send({});

    expect(res.status).toBe(500);

    // 原始内容不变（事务未提交）
    const msg = db.prepare(`SELECT content FROM messages WHERE id = 11`).get();
    expect(msg.content).toBe('原始内容');
  });
});
