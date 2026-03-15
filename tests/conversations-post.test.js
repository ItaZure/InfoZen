/**
 * POST /api/conversations 接口测试
 *
 * 覆盖：
 *  - 正常情况：基础写入、图片写入、parentId 传递、重复 id 覆盖
 *  - 边界情况：images 为空数组、images 缺省时默认 []、treeNode.parentId 为 null
 *  - 错误情况：缺少必填字段时的行为
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

// ---------- 构造合法的请求体 ----------

function makePayload(overrides = {}) {
  return {
    topicId: '自由主题',
    userMessage: {
      id: 101,
      content: '你好',
      images: [],
      timestamp: new Date().toISOString(),
    },
    aiMessage: {
      id: 201,
      content: 'AI 的回复',
      timestamp: new Date().toISOString(),
    },
    treeNode: {
      id: 1,
      label: '你好',
      content: '',
      parentId: null,
    },
    ...overrides,
  };
}

// ============================================================
describe('POST /api/conversations', () => {

  // ---- 正常情况 ----

  test('成功写入 —— 返回 { success: true }', async () => {
    const res = await request(app).post('/api/conversations').send(makePayload());

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
  });

  test('写入后 messages 表有 2 条记录（user + ai）', async () => {
    await request(app).post('/api/conversations').send(makePayload());

    const rows = db.prepare(`SELECT * FROM messages WHERE deleted_at IS NULL`).all();
    expect(rows).toHaveLength(2);

    const types = rows.map((r) => r.type).sort();
    expect(types).toEqual(['ai', 'user']);
  });

  test('写入后 tree_nodes 表有 1 条记录', async () => {
    await request(app).post('/api/conversations').send(makePayload());

    const rows = db.prepare(`SELECT * FROM tree_nodes WHERE deleted_at IS NULL`).all();
    expect(rows).toHaveLength(1);
  });

  test('tree_node.user_message_id 指向 userMessage.id（修复验证）', async () => {
    const payload = makePayload();
    await request(app).post('/api/conversations').send(payload);

    const node = db.prepare(`SELECT user_message_id FROM tree_nodes WHERE id = 1`).get();
    expect(node.user_message_id).toBe(payload.userMessage.id);
  });

  test('tree_node.ai_message_id 指向 aiMessage.id', async () => {
    const payload = makePayload();
    await request(app).post('/api/conversations').send(payload);

    const node = db.prepare(`SELECT ai_message_id FROM tree_nodes WHERE id = 1`).get();
    expect(node.ai_message_id).toBe(payload.aiMessage.id);
  });

  test('图片数组正确存入 messages.images，GET 时可取回', async () => {
    const fakeBase64 = 'data:image/png;base64,abc123';
    const payload = makePayload();
    payload.userMessage.images = [fakeBase64];
    await request(app).post('/api/conversations').send(payload);

    const row = db
      .prepare(`SELECT images FROM messages WHERE id = ? AND type = 'user'`)
      .get(payload.userMessage.id);

    expect(JSON.parse(row.images)).toEqual([fakeBase64]);
  });

  test('parentId 正确写入 tree_nodes.parent_id', async () => {
    // 先写入根节点
    await request(app).post('/api/conversations').send(makePayload());

    // 再写入子节点，parentId 指向根节点
    const child = makePayload({
      userMessage: { id: 102, content: '子问题', images: [], timestamp: new Date().toISOString() },
      aiMessage: { id: 202, content: 'AI 子回复', timestamp: new Date().toISOString() },
      treeNode: { id: 2, label: '子问题', content: '', parentId: 1 },
    });
    await request(app).post('/api/conversations').send(child);

    const node = db.prepare(`SELECT parent_id FROM tree_nodes WHERE id = 2`).get();
    expect(node.parent_id).toBe(1);
  });

  test('重复 id 使用 INSERT OR REPLACE 覆盖旧记录', async () => {
    await request(app).post('/api/conversations').send(makePayload());

    // 用相同 id 但不同内容再次写入
    const updated = makePayload();
    updated.aiMessage.content = '更新后的 AI 回复';
    await request(app).post('/api/conversations').send(updated);

    const row = db
      .prepare(`SELECT content FROM messages WHERE id = ? AND type = 'ai'`)
      .get(updated.aiMessage.id);
    expect(row.content).toBe('更新后的 AI 回复');

    // 总记录数不变（覆盖，不是新增）
    const count = db.prepare(`SELECT COUNT(*) as c FROM messages WHERE deleted_at IS NULL`).get();
    expect(count.c).toBe(2);
  });

  // ---- 边界情况 ----

  test('images 为空数组时，存储 [] 字符串', async () => {
    await request(app).post('/api/conversations').send(makePayload());

    const row = db
      .prepare(`SELECT images FROM messages WHERE id = 101 AND type = 'user'`)
      .get();
    expect(row.images).toBe('[]');
  });

  test('userMessage.images 缺省时，默认存储 [] 字符串', async () => {
    const payload = makePayload();
    delete payload.userMessage.images;
    await request(app).post('/api/conversations').send(payload);

    const row = db
      .prepare(`SELECT images FROM messages WHERE id = 101 AND type = 'user'`)
      .get();
    expect(row.images).toBe('[]');
  });

  test('treeNode.parentId 为 null 时，tree_nodes.parent_id 为 null', async () => {
    await request(app).post('/api/conversations').send(makePayload());

    const node = db.prepare(`SELECT parent_id FROM tree_nodes WHERE id = 1`).get();
    expect(node.parent_id).toBeNull();
  });

  test('topic_id 从请求体 topicId 字段写入', async () => {
    const payload = makePayload({ topicId: '哲学' });
    await request(app).post('/api/conversations').send(payload);

    const msg = db
      .prepare(`SELECT topic_id FROM messages WHERE id = 101`)
      .get();
    expect(msg.topic_id).toBe('哲学');
  });

  test('写入多组对话，每组数据独立', async () => {
    await request(app).post('/api/conversations').send(makePayload());
    await request(app).post('/api/conversations').send(
      makePayload({
        userMessage: { id: 102, content: '第二条', images: [], timestamp: new Date().toISOString() },
        aiMessage: { id: 202, content: 'AI 第二条', timestamp: new Date().toISOString() },
        treeNode: { id: 2, label: '第二条', content: '', parentId: null },
      })
    );

    const msgCount = db.prepare(`SELECT COUNT(*) as c FROM messages WHERE deleted_at IS NULL`).get();
    const nodeCount = db.prepare(`SELECT COUNT(*) as c FROM tree_nodes WHERE deleted_at IS NULL`).get();
    expect(msgCount.c).toBe(4);
    expect(nodeCount.c).toBe(2);
  });

  // ---- 错误情况 ----

  test('缺少 userMessage 时，后端抛出 500', async () => {
    const payload = makePayload();
    delete payload.userMessage;

    const res = await request(app).post('/api/conversations').send(payload);

    expect(res.status).toBe(500);
  });

  test('缺少 aiMessage 时，后端抛出 500', async () => {
    const payload = makePayload();
    delete payload.aiMessage;

    const res = await request(app).post('/api/conversations').send(payload);

    expect(res.status).toBe(500);
  });

  test('缺少 treeNode 时，后端抛出 500', async () => {
    const payload = makePayload();
    delete payload.treeNode;

    const res = await request(app).post('/api/conversations').send(payload);

    expect(res.status).toBe(500);
  });
});
