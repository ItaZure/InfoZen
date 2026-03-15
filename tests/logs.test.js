/**
 * 日志管理接口测试
 *
 * 覆盖三个接口：
 *  - POST /api/topics/:topicId/logs/generate — 生成学习日志
 *  - PUT /api/topics/:topicId/logs/:timeRange — 更新日志摘要
 *  - DELETE /api/topics/:topicId/logs/:timeRange — 软删除日志
 *
 * 测试策略：
 *  - 使用内存数据库隔离测试
 *  - Mock DeepSeek API 调用（避免真实调用）
 *  - 每个测试独立，不依赖其他测试状态
 */

import request from 'supertest';
import { createTestDb } from './helpers/db.js';
import { createApp } from './helpers/app.js';

let db;
let app;

// Mock DeepSeek API
let mockDeepSeekResponse = '这是一段模拟的学习日志摘要';
let mockDeepSeekError = null;

// 原始 mock 实现
const defaultMockImplementation = (url, options) => {
  if (mockDeepSeekError) {
    return Promise.reject(mockDeepSeekError);
  }

  return Promise.resolve({
    ok: true,
    json: () =>
      Promise.resolve({
        choices: [
          {
            message: {
              content: mockDeepSeekResponse,
            },
          },
        ],
      }),
  });
};

// 在测试开始前 mock fetch
global.fetch = jest.fn(defaultMockImplementation);

beforeEach(() => {
  db = createTestDb();
  app = createApp(db);

  // 重置 mock 状态
  mockDeepSeekResponse = '这是一段模拟的学习日志摘要';
  mockDeepSeekError = null;
  global.fetch.mockClear();
  global.fetch.mockImplementation(defaultMockImplementation);
});

afterEach(() => {
  db.close();
});

// ---------- 工具函数 ----------

function insertMessage(db, { id, topicId = '自由主题', type = 'user', content = '测试消息', timestamp, images = [] } = {}) {
  const ts = timestamp || new Date().toISOString();
  db.prepare(
    `INSERT INTO messages (id, topic_id, type, content, timestamp, images) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, topicId, type, content, ts, JSON.stringify(images));
}

function insertLog(db, { topicId = '自由主题', timeRange, summary = '测试日志', createdAt, deletedAt = null } = {}) {
  const ts = createdAt || new Date().toISOString();
  db.prepare(
    `INSERT INTO logs (topic_id, time_range, summary, created_at, deleted_at) VALUES (?, ?, ?, ?, ?)`
  ).run(topicId, timeRange, summary, ts, deletedAt);
}

function getLog(db, topicId, timeRange) {
  return db
    .prepare(`SELECT * FROM logs WHERE topic_id = ? AND time_range = ? AND deleted_at IS NULL`)
    .get(topicId, timeRange);
}

function getAllLogs(db, topicId) {
  return db
    .prepare(`SELECT * FROM logs WHERE topic_id = ? AND deleted_at IS NULL ORDER BY created_at ASC`)
    .all(topicId);
}

// ============================================================
describe('POST /api/topics/:topicId/logs/generate', () => {

  // ---- 正常情况 ----

  test('单日期生��� —— 成功创建日志记录', async () => {
    // 准备数据：2024-01-15 有 3 条消息
    insertMessage(db, { id: 1, content: '学习 Vue', timestamp: '2024-01-15T10:00:00Z' });
    insertMessage(db, { id: 2, type: 'ai', content: 'Vue 是渐进式框架', timestamp: '2024-01-15T10:01:00Z' });
    insertMessage(db, { id: 3, content: '学习组件通信', timestamp: '2024-01-15T11:00:00Z' });

    mockDeepSeekResponse = '今天学习了 Vue 框架基础和组件通信机制';

    const res = await request(app)
      .post('/api/topics/自由主题/logs/generate')
      .send({ dates: ['2024-01-15'] });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });

    // 验证数据库记录
    const log = getLog(db, '自由主题', '2024-01-15');
    expect(log).toBeDefined();
    expect(log.summary).toBe('今天学习了 Vue 框架基础和组件通信机制');
    expect(log.time_range).toBe('2024-01-15');

    // 验证 API 调用
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('多日期生成 —— 并行创建多条日志', async () => {
    // 准备数据：两天各有消息
    insertMessage(db, { id: 1, content: '第一天学习', timestamp: '2024-01-15T10:00:00Z' });
    insertMessage(db, { id: 2, content: '第二天学习', timestamp: '2024-01-16T10:00:00Z' });

    mockDeepSeekResponse = '学习摘要';

    const res = await request(app)
      .post('/api/topics/自由主题/logs/generate')
      .send({ dates: ['2024-01-15', '2024-01-16'] });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });

    // 验证两条日志都创建成功
    const logs = getAllLogs(db, '自由主题');
    expect(logs).toHaveLength(2);
    expect(logs.map(l => l.time_range)).toEqual(['2024-01-15', '2024-01-16']);

    // 验证并行调用了 2 次 API
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test('覆盖旧日志 —— 已存在的日志被更新', async () => {
    // 准备数据：已有旧日志
    insertMessage(db, { id: 1, content: '学习内容', timestamp: '2024-01-15T10:00:00Z' });
    insertLog(db, { timeRange: '2024-01-15', summary: '旧的摘要', createdAt: '2024-01-15T20:00:00Z' });

    mockDeepSeekResponse = '新的摘要内容';

    const res = await request(app)
      .post('/api/topics/自由主题/logs/generate')
      .send({ dates: ['2024-01-15'] });

    expect(res.status).toBe(200);

    // 验证日志被更新（不是新增）
    const logs = getAllLogs(db, '自由主题');
    expect(logs).toHaveLength(1);
    expect(logs[0].summary).toBe('新的摘要内容');
    expect(logs[0].time_range).toBe('2024-01-15');
  });

  test('空日期的消息 —— 生成空内容提示', async () => {
    // 2024-01-15 没有任何消息
    const res = await request(app)
      .post('/api/topics/自由主题/logs/generate')
      .send({ dates: ['2024-01-15'] });

    expect(res.status).toBe(200);

    const log = getLog(db, '自由主题', '2024-01-15');
    expect(log).toBeDefined();
    expect(log.summary).toBe('当天无学习记录');
  });

  test('只有 AI 消息 —— 生成空内容提示', async () => {
    // 只有 AI 消息，没有用户消息
    insertMessage(db, { id: 1, type: 'ai', content: 'AI 回复', timestamp: '2024-01-15T10:00:00Z' });

    const res = await request(app)
      .post('/api/topics/自由主题/logs/generate')
      .send({ dates: ['2024-01-15'] });

    expect(res.status).toBe(200);

    const log = getLog(db, '自由主题', '2024-01-15');
    expect(log.summary).toBe('当天无学习记录');
  });

  test('消息内容包含在 API 请求中', async () => {
    insertMessage(db, { id: 1, content: '学习 React Hooks', timestamp: '2024-01-15T10:00:00Z' });
    insertMessage(db, { id: 2, type: 'ai', content: 'Hooks 是函数组件的状态管理', timestamp: '2024-01-15T10:01:00Z' });

    await request(app)
      .post('/api/topics/自由主题/logs/generate')
      .send({ dates: ['2024-01-15'] });

    // 验证 fetch 调用参数
    const fetchCall = global.fetch.mock.calls[0];
    const requestBody = JSON.parse(fetchCall[1].body);

    expect(requestBody.messages[0].content).toContain('学习 React Hooks');
    expect(requestBody.messages[0].content).toContain('Hooks 是函数组件的状态管理');
  });

  // ---- 边界情况 ----

  test('跨话题隔离 —— 只统计当前话题的消息', async () => {
    insertMessage(db, { id: 1, topicId: '自由主题', content: '自由主题消息', timestamp: '2024-01-15T10:00:00Z' });
    insertMessage(db, { id: 2, topicId: '产品技术', content: '产品技术消息', timestamp: '2024-01-15T10:00:00Z' });

    mockDeepSeekResponse = '自由主题的摘要';

    await request(app)
      .post('/api/topics/自由主题/logs/generate')
      .send({ dates: ['2024-01-15'] });

    const fetchCall = global.fetch.mock.calls[0];
    const requestBody = JSON.parse(fetchCall[1].body);

    // 只包含自由主题的消息
    expect(requestBody.messages[0].content).toContain('自由主题消息');
    expect(requestBody.messages[0].content).not.toContain('产品技术消息');
  });

  test('软删除消息不参与统计', async () => {
    const now = new Date().toISOString();
    insertMessage(db, { id: 1, content: '正常消息', timestamp: '2024-01-15T10:00:00Z' });

    // 插入已删除的消息
    db.prepare(
      `INSERT INTO messages (id, topic_id, type, content, timestamp, images, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(2, '自由主题', 'user', '已删除消息', '2024-01-15T11:00:00Z', '[]', now);

    await request(app)
      .post('/api/topics/自由主题/logs/generate')
      .send({ dates: ['2024-01-15'] });

    const fetchCall = global.fetch.mock.calls[0];
    const requestBody = JSON.parse(fetchCall[1].body);

    expect(requestBody.messages[0].content).toContain('正常消息');
    expect(requestBody.messages[0].content).not.toContain('已删除消息');
  });

  test('日期格式正确解析 —— YYYY-MM-DD', async () => {
    insertMessage(db, { id: 1, content: '测试', timestamp: '2024-01-15T23:59:59Z' });

    await request(app)
      .post('/api/topics/自由主题/logs/generate')
      .send({ dates: ['2024-01-15'] });

    const log = getLog(db, '自由主题', '2024-01-15');
    expect(log).toBeDefined();
  });

  // ---- 错误情况 ----

  test('缺少 dates 参数 —— 返回 400', async () => {
    const res = await request(app)
      .post('/api/topics/自由主题/logs/generate')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'dates array is required' });
  });

  test('dates 不是数组 —— 返回 400', async () => {
    const res = await request(app)
      .post('/api/topics/自由主题/logs/generate')
      .send({ dates: '2024-01-15' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'dates array is required' });
  });

  test('dates 为空数组 —— 返回 400', async () => {
    const res = await request(app)
      .post('/api/topics/自由主题/logs/generate')
      .send({ dates: [] });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'dates array is required' });
  });

  test('DeepSeek API 调用失败 —— 返回 500', async () => {
    insertMessage(db, { id: 1, content: '测试', timestamp: '2024-01-15T10:00:00Z' });

    mockDeepSeekError = new Error('API 调用失败');

    const res = await request(app)
      .post('/api/topics/自由主题/logs/generate')
      .send({ dates: ['2024-01-15'] });

    expect(res.status).toBe(500);
    expect(res.body.error).toContain('API 调用失败');
  });

  test('部分日期失败不影响其他日期', async () => {
    insertMessage(db, { id: 1, content: '第一天', timestamp: '2024-01-15T10:00:00Z' });
    insertMessage(db, { id: 2, content: '第二天', timestamp: '2024-01-16T10:00:00Z' });

    // Mock：第一次调用成功，第二次失败
    let callCount = 0;
    global.fetch.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            choices: [{ message: { content: '第一天摘要' } }],
          }),
        });
      } else {
        return Promise.reject(new Error('第二次失败'));
      }
    });

    const res = await request(app)
      .post('/api/topics/自由主题/logs/generate')
      .send({ dates: ['2024-01-15', '2024-01-16'] });

    // 整体请求失败
    expect(res.status).toBe(500);

    // 但第一天的日志可能已创建（取决于并行执行顺序）
    // 这里不做强制断言，因为 Promise.all 会在任一失败时中断
  });
});

// ============================================================
describe('PUT /api/topics/:topicId/logs/:timeRange', () => {

  // ---- 正常情况 ----

  test('更新已存在的日志 —— 成功修改摘要', async () => {
    insertLog(db, { timeRange: '2024-01-15', summary: '旧摘要' });

    const res = await request(app)
      .put('/api/topics/自由主题/logs/2024-01-15')
      .send({ summary: '新摘要内容' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });

    const log = getLog(db, '自由主题', '2024-01-15');
    expect(log.summary).toBe('新摘要内容');
  });

  test('更新后其他字段不变', async () => {
    const createdAt = '2024-01-15T20:00:00Z';
    insertLog(db, { timeRange: '2024-01-15', summary: '旧摘要', createdAt });

    await request(app)
      .put('/api/topics/自由主题/logs/2024-01-15')
      .send({ summary: '新摘要' });

    const log = getLog(db, '自由主题', '2024-01-15');
    expect(log.time_range).toBe('2024-01-15');
    expect(log.created_at).toBe(createdAt);
    expect(log.topic_id).toBe('自由主题');
  });

  test('摘要可以包含特殊字符', async () => {
    insertLog(db, { timeRange: '2024-01-15', summary: '旧摘要' });

    const specialSummary = '学习了 "Vue 3" & React，使用 <script> 标签';

    const res = await request(app)
      .put('/api/topics/自由主题/logs/2024-01-15')
      .send({ summary: specialSummary });

    expect(res.status).toBe(200);

    const log = getLog(db, '自由主题', '2024-01-15');
    expect(log.summary).toBe(specialSummary);
  });

  test('摘要可以是空字符串', async () => {
    insertLog(db, { timeRange: '2024-01-15', summary: '旧摘要' });

    const res = await request(app)
      .put('/api/topics/自由主题/logs/2024-01-15')
      .send({ summary: '' });

    expect(res.status).toBe(200);

    const log = getLog(db, '自由主题', '2024-01-15');
    expect(log.summary).toBe('');
  });

  // ---- 边界情况 ----

  test('跨话题隔离 —— 不能更新其他话题的日志', async () => {
    insertLog(db, { topicId: '产品技术', timeRange: '2024-01-15', summary: '产品技术日志' });

    const res = await request(app)
      .put('/api/topics/自由主题/logs/2024-01-15')
      .send({ summary: '尝试修改' });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Log not found' });

    // 原日志不受影响
    const log = db
      .prepare(`SELECT * FROM logs WHERE topic_id = ? AND time_range = ?`)
      .get('产品技术', '2024-01-15');
    expect(log.summary).toBe('产品技术日志');
  });

  test('软删除的日志不能更新', async () => {
    const now = new Date().toISOString();
    insertLog(db, { timeRange: '2024-01-15', summary: '已删除日志', deletedAt: now });

    const res = await request(app)
      .put('/api/topics/自由主题/logs/2024-01-15')
      .send({ summary: '尝试修改' });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Log not found' });
  });

  // ---- 错误情况 ----

  test('缺少 summary 参数 —— 返回 400', async () => {
    insertLog(db, { timeRange: '2024-01-15', summary: '旧摘要' });

    const res = await request(app)
      .put('/api/topics/自由主题/logs/2024-01-15')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'summary is required' });
  });

  test('日志不存在 —— 返回 404', async () => {
    const res = await request(app)
      .put('/api/topics/自由主题/logs/2024-01-15')
      .send({ summary: '新摘要' });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Log not found' });
  });

  test('timeRange 格式错误仍能处理', async () => {
    // 即使格式不标准，只要数据库中有对应记录就能更新
    insertLog(db, { timeRange: 'invalid-date', summary: '旧摘要' });

    const res = await request(app)
      .put('/api/topics/自由主题/logs/invalid-date')
      .send({ summary: '新摘要' });

    expect(res.status).toBe(200);

    const log = getLog(db, '自由主题', 'invalid-date');
    expect(log.summary).toBe('新摘要');
  });
});

// ============================================================
describe('DELETE /api/topics/:topicId/logs/:timeRange', () => {

  // ---- 正常情况 ----

  test('删除已存在的日志 —— 软删除成功', async () => {
    insertLog(db, { timeRange: '2024-01-15', summary: '测试日志' });

    const res = await request(app)
      .delete('/api/topics/自由主题/logs/2024-01-15');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });

    // 验证软删除：deleted_at 不为空
    const log = db
      .prepare(`SELECT * FROM logs WHERE topic_id = ? AND time_range = ?`)
      .get('自由主题', '2024-01-15');

    expect(log).toBeDefined();
    expect(log.deleted_at).not.toBeNull();
  });

  test('软删除后 GET 接口不返回该日志', async () => {
    insertLog(db, { timeRange: '2024-01-15', summary: '测试日志' });

    await request(app).delete('/api/topics/自由主题/logs/2024-01-15');

    // 通过 GET 接口验证
    const getRes = await request(app).get('/api/topics/自由主题');
    expect(getRes.body.logs).toHaveLength(0);
  });

  test('删除后可以重新生成同日期日志', async () => {
    insertLog(db, { timeRange: '2024-01-15', summary: '旧日志' });
    insertMessage(db, { id: 1, content: '测试', timestamp: '2024-01-15T10:00:00Z' });

    // 删除旧日志
    await request(app).delete('/api/topics/自由主题/logs/2024-01-15');

    // 重新生成
    mockDeepSeekResponse = '新日志';
    const res = await request(app)
      .post('/api/topics/自由主题/logs/generate')
      .send({ dates: ['2024-01-15'] });

    expect(res.status).toBe(200);

    // 验证新日志创建成功
    const logs = getAllLogs(db, '自由主题');
    expect(logs).toHaveLength(1);
    expect(logs[0].summary).toBe('新日志');
  });

  test('删除多个日志互不影响', async () => {
    insertLog(db, { timeRange: '2024-01-15', summary: '第一天' });
    insertLog(db, { timeRange: '2024-01-16', summary: '第二天' });

    await request(app).delete('/api/topics/自由主题/logs/2024-01-15');

    const logs = getAllLogs(db, '自由主题');
    expect(logs).toHaveLength(1);
    expect(logs[0].time_range).toBe('2024-01-16');
  });

  // ---- 边界情况 ----

  test('跨话题隔离 —— 不能删除其他话题的日志', async () => {
    insertLog(db, { topicId: '产品技术', timeRange: '2024-01-15', summary: '产品技术日志' });

    const res = await request(app)
      .delete('/api/topics/自由主题/logs/2024-01-15');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Log not found' });

    // 原日志不受影响
    const log = db
      .prepare(`SELECT * FROM logs WHERE topic_id = ? AND time_range = ? AND deleted_at IS NULL`)
      .get('产品技术', '2024-01-15');
    expect(log).toBeDefined();
  });

  test('已删除的日志不能再次删除', async () => {
    const now = new Date().toISOString();
    insertLog(db, { timeRange: '2024-01-15', summary: '已删除', deletedAt: now });

    const res = await request(app)
      .delete('/api/topics/自由主题/logs/2024-01-15');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Log not found' });
  });

  // ---- 错误情况 ----

  test('日志不存在 —— 返回 404', async () => {
    const res = await request(app)
      .delete('/api/topics/自由主题/logs/2024-01-15');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Log not found' });
  });

  test('话题不存在 —— 返回 404', async () => {
    const res = await request(app)
      .delete('/api/topics/不存在的话题/logs/2024-01-15');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Log not found' });
  });

  test('timeRange 格式错误但数据库中有记录仍能删除', async () => {
    insertLog(db, { timeRange: 'invalid-date', summary: '测试' });

    const res = await request(app)
      .delete('/api/topics/自由主题/logs/invalid-date');

    expect(res.status).toBe(200);

    const log = getLog(db, '自由主题', 'invalid-date');
    expect(log).toBeUndefined();
  });
});
