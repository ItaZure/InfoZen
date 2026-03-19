/**
 * wisdom 接口测试
 *
 * 覆盖：
 *  - POST /api/wisdom/summarize（正常、链接无效/FETCH_FAILED、缺少url参数）
 *  - GET /api/wisdom/articles（分页、hasMore）
 *  - DELETE /api/wisdom/articles/:id（正常、不存在）
 *  - GET /api/wisdom/quick-links
 *  - POST /api/wisdom/quick-links（正常、缺少参数）
 *  - DELETE /api/wisdom/quick-links/:id（正常、不存在）
 */

import request from 'supertest';
import { createTestDb } from './helpers/db.js';
import { createApp } from './helpers/app.js';

let db;
let app;

// ---------- fetch mock ----------
// fetch 调用顺序：第1次抓网页，第2次调 AI
// mockFetchSequence 控制每次调用返回值
let mockFetchSequence = [];

const defaultFetchMock = jest.fn(() => {
  const next = mockFetchSequence.shift();
  if (next === 'NETWORK_ERROR') return Promise.reject(new Error('network error'));
  if (next === 'FETCH_FAIL_HTTP') return Promise.resolve({ ok: false, text: () => Promise.resolve('bad request') });
  if (next === 'PAGE_OK') return Promise.resolve({ ok: true, text: () => Promise.resolve('<html><body>Article content</body></html>') });
  if (next && next.aiContent) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ choices: [{ message: { content: next.aiContent } }] }),
      text: () => Promise.resolve(''),
    });
  }
  return Promise.resolve({
    ok: true,
    text: () => Promise.resolve('<html><body>content</body></html>'),
    json: () => Promise.resolve({ choices: [{ message: { content: '默认标题\n默认摘要内容' } }] }),
  });
});

global.fetch = defaultFetchMock;

beforeEach(() => {
  db = createTestDb();
  app = createApp(db);
  mockFetchSequence = [];
  global.fetch.mockClear();
});

afterEach(() => {
  db.close();
});

// ---------- 工具函数 ----------

function insertArticle(db, { url = 'https://example.com', title_en = null, title_zh = '测试标题', summary = '测试摘要', created_at } = {}) {
  const ts = created_at || new Date().toISOString();
  const result = db
    .prepare('INSERT INTO articles (url, title_en, title_zh, summary, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(url, title_en, title_zh, summary, ts);
  return result.lastInsertRowid;
}

function insertQuickLink(db, { name = '测试链接', url = 'https://example.com', sort_order = 0 } = {}) {
  const result = db
    .prepare('INSERT INTO quick_links (name, url, sort_order, created_at) VALUES (?, ?, ?, ?)')
    .run(name, url, sort_order, new Date().toISOString());
  return result.lastInsertRowid;
}

// ============================================================
describe('POST /api/wisdom/summarize', () => {

  test('缺少 url 参数 —— 返回 400', async () => {
    const res = await request(app).post('/api/wisdom/summarize').send({});
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'url is required' });
  });

  test('链接抓取失败（网络错误）—— 返回 500 FETCH_FAILED', async () => {
    mockFetchSequence = ['NETWORK_ERROR'];
    const res = await request(app)
      .post('/api/wisdom/summarize')
      .send({ url: 'https://invalid-domain-xyz.com/article' });
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'FETCH_FAILED' });
  });

  test('链接抓取失败（HTTP 非 2xx）—— 返回 500 FETCH_FAILED', async () => {
    mockFetchSequence = ['FETCH_FAIL_HTTP'];
    const res = await request(app)
      .post('/api/wisdom/summarize')
      .send({ url: 'https://example.com/404' });
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'FETCH_FAILED' });
  });

  test('正常流程（纯中文标题）—— 返回文章数据并写入数据库', async () => {
    mockFetchSequence = [
      'PAGE_OK',
      { aiContent: '这是中文标题\n\n这是摘要内容，介绍了文章的主要观点。' },
    ];

    const res = await request(app)
      .post('/api/wisdom/summarize')
      .send({ url: 'https://example.com/article' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      url: 'https://example.com/article',
      title_en: null,
      title_zh: '这是中文标题',
      summary: '这是摘要内容，介绍了文章的主要观点。',
    });
    expect(res.body.id).toBeDefined();
    expect(res.body.created_at).toBeDefined();

    const row = db.prepare('SELECT * FROM articles WHERE id = ?').get(res.body.id);
    expect(row).toBeDefined();
    expect(row.title_zh).toBe('这是中文标题');
  });

  test('正常流程（英文标题 + 中文标题）—— title_en 有值', async () => {
    mockFetchSequence = [
      'PAGE_OK',
      { aiContent: 'The Future of AI\n人工智能的未来\n\n本文探讨了 AI 的发展趋势。' },
    ];

    const res = await request(app)
      .post('/api/wisdom/summarize')
      .send({ url: 'https://example.com/ai-future' });

    expect(res.status).toBe(200);
    expect(res.body.title_en).toBe('The Future of AI');
    expect(res.body.title_zh).toBe('人工智能的未来');
    expect(res.body.summary).toBe('本文探讨了 AI 的发展趋势。');
  });

  test('AI 调用失败 —— 返回 500 AI_FAILED', async () => {
    mockFetchSequence = [
      'PAGE_OK',
      'FETCH_FAIL_HTTP',
    ];

    const res = await request(app)
      .post('/api/wisdom/summarize')
      .send({ url: 'https://example.com/article' });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'AI_FAILED' });
  });
});

// ============================================================
describe('GET /api/wisdom/articles', () => {

  test('无文章时返回空数组，hasMore 为 false', async () => {
    const res = await request(app).get('/api/wisdom/articles');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ articles: [], hasMore: false });
  });

  test('返回文章列表，包含必要字段', async () => {
    insertArticle(db, { url: 'https://a.com', title_zh: '标题A', summary: '摘要A' });

    const res = await request(app).get('/api/wisdom/articles');
    expect(res.status).toBe(200);
    expect(res.body.articles).toHaveLength(1);

    const article = res.body.articles[0];
    expect(article).toHaveProperty('id');
    expect(article).toHaveProperty('url');
    expect(article).toHaveProperty('title_en');
    expect(article).toHaveProperty('title_zh');
    expect(article).toHaveProperty('summary');
    expect(article).toHaveProperty('created_at');
  });

  test('分页：limit=2，第1页只返回2条，hasMore 为 true', async () => {
    for (let i = 0; i < 3; i++) {
      insertArticle(db, { url: `https://example.com/${i}`, title_zh: `标题${i}` });
    }

    const res = await request(app).get('/api/wisdom/articles?page=1&limit=2');
    expect(res.status).toBe(200);
    expect(res.body.articles).toHaveLength(2);
    expect(res.body.hasMore).toBe(true);
  });

  test('分页：最后一页 hasMore 为 false', async () => {
    for (let i = 0; i < 3; i++) {
      insertArticle(db, { url: `https://example.com/${i}`, title_zh: `标题${i}` });
    }

    const res = await request(app).get('/api/wisdom/articles?page=2&limit=2');
    expect(res.status).toBe(200);
    expect(res.body.articles).toHaveLength(1);
    expect(res.body.hasMore).toBe(false);
  });

  test('按 created_at 倒序返回', async () => {
    insertArticle(db, { url: 'https://old.com', title_zh: '旧文章', created_at: '2024-01-01T00:00:00.000Z' });
    insertArticle(db, { url: 'https://new.com', title_zh: '新文章', created_at: '2024-06-01T00:00:00.000Z' });

    const res = await request(app).get('/api/wisdom/articles');
    expect(res.status).toBe(200);
    expect(res.body.articles[0].title_zh).toBe('新文章');
    expect(res.body.articles[1].title_zh).toBe('旧文章');
  });

  test('title_en 为 null 时正确返回', async () => {
    insertArticle(db, { title_en: null, title_zh: '纯中文标题' });

    const res = await request(app).get('/api/wisdom/articles');
    expect(res.status).toBe(200);
    expect(res.body.articles[0].title_en).toBeNull();
  });

  test('title_en 有值时正确返回', async () => {
    insertArticle(db, { title_en: 'English Title', title_zh: '中文标题' });

    const res = await request(app).get('/api/wisdom/articles');
    expect(res.status).toBe(200);
    expect(res.body.articles[0].title_en).toBe('English Title');
  });
});

// ============================================================
describe('DELETE /api/wisdom/articles/:id', () => {

  test('正常删除 —— 返回 success，数据库中记录消失', async () => {
    const id = insertArticle(db);

    const res = await request(app).delete(`/api/wisdom/articles/${id}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });

    const row = db.prepare('SELECT id FROM articles WHERE id = ?').get(id);
    expect(row).toBeUndefined();
  });

  test('删除不存在的文章 —— 返回 404', async () => {
    const res = await request(app).delete('/api/wisdom/articles/99999');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not found' });
  });

  test('删除后不影响其他文章', async () => {
    const id1 = insertArticle(db, { url: 'https://a.com', title_zh: '文章A' });
    const id2 = insertArticle(db, { url: 'https://b.com', title_zh: '文章B' });

    await request(app).delete(`/api/wisdom/articles/${id1}`);

    const res = await request(app).get('/api/wisdom/articles');
    expect(res.body.articles).toHaveLength(1);
    expect(res.body.articles[0].id).toBe(id2);
  });
});

// ============================================================
describe('GET /api/wisdom/quick-links', () => {

  test('无快捷链接时返回空数组', async () => {
    const res = await request(app).get('/api/wisdom/quick-links');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ links: [] });
  });

  test('返回快捷链接列表，包含必要字段', async () => {
    insertQuickLink(db, { name: 'HN', url: 'https://news.ycombinator.com', sort_order: 0 });

    const res = await request(app).get('/api/wisdom/quick-links');
    expect(res.status).toBe(200);
    expect(res.body.links).toHaveLength(1);

    const link = res.body.links[0];
    expect(link).toHaveProperty('id');
    expect(link).toHaveProperty('name');
    expect(link).toHaveProperty('url');
    expect(link).toHaveProperty('sort_order');
  });

  test('按 sort_order 升序返回', async () => {
    insertQuickLink(db, { name: '第二', url: 'https://b.com', sort_order: 1 });
    insertQuickLink(db, { name: '第一', url: 'https://a.com', sort_order: 0 });

    const res = await request(app).get('/api/wisdom/quick-links');
    expect(res.status).toBe(200);
    expect(res.body.links[0].name).toBe('第一');
    expect(res.body.links[1].name).toBe('第二');
  });
});

// ============================================================
describe('POST /api/wisdom/quick-links', () => {

  test('正常添加 —— 返回新链接数据', async () => {
    const res = await request(app)
      .post('/api/wisdom/quick-links')
      .send({ name: 'Hacker News', url: 'https://news.ycombinator.com' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      name: 'Hacker News',
      url: 'https://news.ycombinator.com',
    });
    expect(res.body.id).toBeDefined();
  });

  test('添加后可通过 GET 查询到', async () => {
    await request(app)
      .post('/api/wisdom/quick-links')
      .send({ name: '测试链接', url: 'https://test.com' });

    const res = await request(app).get('/api/wisdom/quick-links');
    expect(res.body.links).toHaveLength(1);
    expect(res.body.links[0].name).toBe('测试链接');
  });

  test('缺少 name —— 返回 400', async () => {
    const res = await request(app)
      .post('/api/wisdom/quick-links')
      .send({ url: 'https://test.com' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'name and url are required' });
  });

  test('缺少 url —— 返回 400', async () => {
    const res = await request(app)
      .post('/api/wisdom/quick-links')
      .send({ name: '测试' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'name and url are required' });
  });

  test('多次添加 sort_order 自动递增', async () => {
    await request(app).post('/api/wisdom/quick-links').send({ name: 'A', url: 'https://a.com' });
    await request(app).post('/api/wisdom/quick-links').send({ name: 'B', url: 'https://b.com' });

    const res = await request(app).get('/api/wisdom/quick-links');
    expect(res.body.links[0].sort_order).toBe(0);
    expect(res.body.links[1].sort_order).toBe(1);
  });
});

// ============================================================
describe('DELETE /api/wisdom/quick-links/:id', () => {

  test('正常删除 —— 返回 success，数据库中记录消失', async () => {
    const id = insertQuickLink(db);

    const res = await request(app).delete(`/api/wisdom/quick-links/${id}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });

    const row = db.prepare('SELECT id FROM quick_links WHERE id = ?').get(id);
    expect(row).toBeUndefined();
  });

  test('删除不存在的链接 —— 返回 404', async () => {
    const res = await request(app).delete('/api/wisdom/quick-links/99999');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not found' });
  });

  test('删除后不��响其他链接', async () => {
    const id1 = insertQuickLink(db, { name: '链接A', url: 'https://a.com', sort_order: 0 });
    insertQuickLink(db, { name: '链接B', url: 'https://b.com', sort_order: 1 });

    await request(app).delete(`/api/wisdom/quick-links/${id1}`);

    const res = await request(app).get('/api/wisdom/quick-links');
    expect(res.body.links).toHaveLength(1);
    expect(res.body.links[0].name).toBe('链接B');
  });
});
