/**
 * GET /api/topics/:topicId 接口测试
 *
 * 覆盖：
 *  - 正常情况：空话题、有消息和树节点、有日志、有笔记
 *  - 边界情况：图片字段正确反序列化、树结构递归构建、软删除记录不返回
 *  - 错误情况：不存在的 topicId 返回空结构（不报 500）
 */

import request from 'supertest';
import { createTestDb } from './helpers/db.js';
import { createApp } from './helpers/app.js';

// 每个 describe 块共享一个 db + app，各 test 通过 beforeEach 清理数据
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

function insertConversation(db, { topicId = '自由主题', nodeId, parentId = null, userMsgId, aiMsgId, label = '测试节点' } = {}) {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO messages (id, topic_id, type, content, timestamp, images) VALUES (?, ?, 'user', '用户消息', ?, '[]')`
  ).run(userMsgId, topicId, now);
  db.prepare(
    `INSERT INTO messages (id, topic_id, type, content, timestamp, images) VALUES (?, ?, 'ai', 'AI 回复', ?, '[]')`
  ).run(aiMsgId, topicId, now);
  db.prepare(
    `INSERT INTO tree_nodes (id, topic_id, parent_id, label, content, user_message_id, ai_message_id, summarized, created_at)
     VALUES (?, ?, ?, ?, '', ?, ?, 0, ?)`
  ).run(nodeId, topicId, parentId, label, userMsgId, aiMsgId, now);
}

// ============================================================
describe('GET /api/topics/:topicId', () => {

  // ---- 正常情况 ----

  test('空话题 —— 返回空 messages/tree/logs，notes 为空字符串', async () => {
    const res = await request(app).get('/api/topics/自由主题');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      messages: [],
      tree: [],
      notes: '',
      logs: [],
    });
  });

  test('有消息时正确返回 messages 列表', async () => {
    insertConversation(db, { nodeId: 1, userMsgId: 10, aiMsgId: 11 });

    const res = await request(app).get('/api/topics/自由主题');

    expect(res.status).toBe(200);
    expect(res.body.messages).toHaveLength(2);

    const userMsg = res.body.messages.find((m) => m.type === 'user');
    const aiMsg = res.body.messages.find((m) => m.type === 'ai');
    expect(userMsg).toBeDefined();
    expect(aiMsg).toBeDefined();
  });

  test('messages 字段包含 id、type、content、timestamp、images', async () => {
    insertConversation(db, { nodeId: 1, userMsgId: 10, aiMsgId: 11 });

    const res = await request(app).get('/api/topics/自由主题');
    const msg = res.body.messages[0];

    expect(msg).toHaveProperty('id');
    expect(msg).toHaveProperty('type');
    expect(msg).toHaveProperty('content');
    expect(msg).toHaveProperty('timestamp');
    expect(msg).toHaveProperty('images');
    expect(Array.isArray(msg.images)).toBe(true);
  });

  test('图片以数组形式返回，base64 字符串正确反序列化', async () => {
    const now = new Date().toISOString();
    const fakeBase64 = 'data:image/png;base64,abc123';
    db.prepare(
      `INSERT INTO messages (id, topic_id, type, content, timestamp, images)
       VALUES (20, '自由主题', 'user', '含图片', ?, ?)`
    ).run(now, JSON.stringify([fakeBase64]));

    const res = await request(app).get('/api/topics/自由主题');
    const msg = res.body.messages.find((m) => m.id === 20);

    expect(msg.images).toEqual([fakeBase64]);
  });

  test('tree 结构正确构建：父子关系、字段映射', async () => {
    // 根节点
    insertConversation(db, { nodeId: 1, userMsgId: 10, aiMsgId: 11, label: '根节点' });
    // 子节点
    insertConversation(db, { nodeId: 2, parentId: 1, userMsgId: 12, aiMsgId: 13, label: '子节点' });

    const res = await request(app).get('/api/topics/自由主题');
    const tree = res.body.tree;

    expect(tree).toHaveLength(1); // 只有一个根节点
    expect(tree[0].label).toBe('根节点');
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children[0].label).toBe('子节点');
  });

  test('tree 节点包含 userMessageId 和 aiMessageId', async () => {
    insertConversation(db, { nodeId: 1, userMsgId: 10, aiMsgId: 11 });

    const res = await request(app).get('/api/topics/自由主题');
    const node = res.body.tree[0];

    expect(node.userMessageId).toBe(10);
    expect(node.aiMessageId).toBe(11);
  });

  test('tree 节点 summarized 字段：0 → false，1 → true', async () => {
    insertConversation(db, { nodeId: 1, userMsgId: 10, aiMsgId: 11 });
    // 手动标记为 summarized
    db.prepare(`UPDATE tree_nodes SET summarized = 1 WHERE id = 1`).run();

    const res = await request(app).get('/api/topics/自由主题');

    expect(res.body.tree[0].summarized).toBe(true);
  });

  test('notes 返回 topic_meta 中存储的内容', async () => {
    db.prepare(`UPDATE topic_meta SET notes = ? WHERE topic_id = '自由主题'`).run('<p>我的笔记</p>');

    const res = await request(app).get('/api/topics/自由主题');

    expect(res.body.notes).toBe('<p>我的笔记</p>');
  });

  test('logs 正确返回 timeRange、summary、timestamp 字段', async () => {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO logs (topic_id, time_range, summary, created_at) VALUES ('自由主题', '2026-03-16 14:00-15:00', '该时间段进行了3次对话', ?)`
    ).run(now);

    const res = await request(app).get('/api/topics/自由主题');

    expect(res.body.logs).toHaveLength(1);
    expect(res.body.logs[0]).toMatchObject({
      timeRange: '2026-03-16 14:00-15:00',
      summary: '该时间段进行了3次对话',
    });
    expect(res.body.logs[0]).toHaveProperty('timestamp');
  });

  // ---- 边界情况 ----

  test('软删除的消息不出现在返回结果中', async () => {
    insertConversation(db, { nodeId: 1, userMsgId: 10, aiMsgId: 11 });
    const now = new Date().toISOString();
    db.prepare(`UPDATE messages SET deleted_at = ? WHERE id IN (10, 11)`).run(now);

    const res = await request(app).get('/api/topics/自由主题');

    expect(res.body.messages).toHaveLength(0);
  });

  test('软删除的树节点不出现在返回结果中', async () => {
    insertConversation(db, { nodeId: 1, userMsgId: 10, aiMsgId: 11 });
    db.prepare(`UPDATE tree_nodes SET deleted_at = ? WHERE id = 1`).run(new Date().toISOString());

    const res = await request(app).get('/api/topics/自由主题');

    expect(res.body.tree).toHaveLength(0);
  });

  test('软删除的日志不出现在返回结果中', async () => {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO logs (topic_id, time_range, summary, created_at, deleted_at) VALUES ('自由主题', 'X', 'X', ?, ?)`
    ).run(now, now);

    const res = await request(app).get('/api/topics/自由主题');

    expect(res.body.logs).toHaveLength(0);
  });

  test('多层级树结构正确递归构建', async () => {
    insertConversation(db, { nodeId: 1, userMsgId: 10, aiMsgId: 11, label: 'L1' });
    insertConversation(db, { nodeId: 2, parentId: 1, userMsgId: 12, aiMsgId: 13, label: 'L2' });
    insertConversation(db, { nodeId: 3, parentId: 2, userMsgId: 14, aiMsgId: 15, label: 'L3' });

    const res = await request(app).get('/api/topics/自由主题');
    const tree = res.body.tree;

    expect(tree).toHaveLength(1);
    expect(tree[0].children[0].children[0].label).toBe('L3');
  });

  test('不同话题的数据互不干扰', async () => {
    insertConversation(db, { topicId: '自由主题', nodeId: 1, userMsgId: 10, aiMsgId: 11 });
    insertConversation(db, { topicId: '哲学', nodeId: 2, userMsgId: 12, aiMsgId: 13 });

    const res1 = await request(app).get('/api/topics/自由主题');
    const res2 = await request(app).get('/api/topics/哲学');

    expect(res1.body.messages).toHaveLength(2);
    expect(res2.body.messages).toHaveLength(2);
    // 确保消息 id 不交叉
    const ids1 = res1.body.messages.map((m) => m.id);
    const ids2 = res2.body.messages.map((m) => m.id);
    expect(ids1.some((id) => ids2.includes(id))).toBe(false);
  });

  // ---- 错误情况 ----

  test('不存在的 topicId —— 返回 200 空结构，不报 500', async () => {
    const res = await request(app).get('/api/topics/不存在的话题');

    expect(res.status).toBe(200);
    expect(res.body.messages).toEqual([]);
    expect(res.body.tree).toEqual([]);
    expect(res.body.logs).toEqual([]);
    expect(res.body.notes).toBe('');
  });
});
