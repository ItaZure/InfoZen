import { Router } from 'express';
import axios from 'axios';
import * as cheerio from 'cheerio';
import db from '../db.js';

const router = Router();

// 从 DeepSeek 返回内容解析标题和摘要
function parseAISummary(text) {
  const lines = text.trim().split('\n');
  let title_en = null;
  let title_zh = '';
  let summaryStart = 0;

  const firstLine = lines[0]?.trim() ?? '';
  const secondLine = lines[1]?.trim() ?? '';

  const hasChinese = (s) => /[\u4e00-\u9fff]/.test(s);

  if (firstLine && !hasChinese(firstLine) && secondLine && hasChinese(secondLine)) {
    // 第一行英文标题，第二行中文标题
    title_en = firstLine;
    title_zh = secondLine;
    summaryStart = 2;
  } else if (firstLine && hasChinese(firstLine)) {
    // 第一行直接是中文标题
    title_zh = firstLine;
    summaryStart = 1;
  } else {
    title_zh = firstLine;
    summaryStart = 1;
  }

  // 跳过空行
  while (summaryStart < lines.length && lines[summaryStart].trim() === '') {
    summaryStart++;
  }

  const summary = lines.slice(summaryStart).join('\n').trim();
  return { title_en, title_zh, summary };
}

// POST /api/wisdom/summarize
router.post('/summarize', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'url is required' });

  // 抓取网页
  let html;
  try {
    const response = await axios.get(url, {
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; InfoZen/1.0)' },
      maxContentLength: 5 * 1024 * 1024,
    });
    html = response.data;
  } catch {
    return res.status(500).json({ error: 'FETCH_FAILED' });
  }

  // 提取正文
  const $ = cheerio.load(html);
  $('script, style, nav, footer, header, aside, iframe').remove();
  const articleText = $('article, main, .post, .content, .entry-content, body')
    .first()
    .text()
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 8000);

  // 调用 DeepSeek
  const prompt = `你是一位专业的文章摘要助手。我会给你一篇英文文章的内容，请用中文为我生成结构化摘要。

要求：
1. 如果原文有英文标题，第一行输出英文原标题，第二行输出中文翻译标题
   如果原文没有标题，只输出一行中文概括标题（15字以内）
2. 空一行后，不要用无序列表，用自然语言段落来总结。保留关键数据、人名、专有名词（可保留英文原文）
3. 不要输出"摘要："等前缀，直接输出内容

文章内容：
${articleText}`;

  let aiText;
  try {
    const aiRes = await fetch(process.env.DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: prompt }],
        stream: false,
      }),
    });
    if (!aiRes.ok) throw new Error(await aiRes.text());
    const data = await aiRes.json();
    aiText = data.choices?.[0]?.message?.content ?? '';
  } catch {
    return res.status(500).json({ error: 'AI_FAILED' });
  }

  const { title_en, title_zh, summary } = parseAISummary(aiText);
  const now = new Date().toISOString();

  const result = db
    .prepare(
      `INSERT INTO articles (url, title_en, title_zh, summary, created_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(url, title_en, title_zh, summary, now);

  res.json({ id: result.lastInsertRowid, url, title_en, title_zh, summary, created_at: now });
});

// GET /api/wisdom/articles
router.get('/articles', (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(50, parseInt(req.query.limit) || 10);
  const offset = (page - 1) * limit;

  const articles = db
    .prepare(
      `SELECT id, url, title_en, title_zh, summary, created_at
       FROM articles ORDER BY created_at DESC LIMIT ? OFFSET ?`
    )
    .all(limit + 1, offset);

  const hasMore = articles.length > limit;
  res.json({ articles: articles.slice(0, limit), hasMore });
});

// DELETE /api/wisdom/articles/:id
router.delete('/articles/:id', (req, res) => {
  const { id } = req.params;
  const article = db.prepare(`SELECT id FROM articles WHERE id = ?`).get(id);
  if (!article) return res.status(404).json({ error: 'Not found' });
  db.prepare(`DELETE FROM articles WHERE id = ?`).run(id);
  res.json({ success: true });
});

// GET /api/wisdom/quick-links
router.get('/quick-links', (req, res) => {
  const links = db
    .prepare(`SELECT id, name, url, sort_order FROM quick_links ORDER BY sort_order ASC, id ASC`)
    .all();
  res.json({ links });
});

// POST /api/wisdom/quick-links
router.post('/quick-links', (req, res) => {
  const { name, url } = req.body;
  if (!name || !url) return res.status(400).json({ error: 'name and url are required' });
  const now = new Date().toISOString();
  const maxOrder = db.prepare(`SELECT MAX(sort_order) AS m FROM quick_links`).get();
  const sort_order = (maxOrder?.m ?? -1) + 1;
  const result = db
    .prepare(`INSERT INTO quick_links (name, url, sort_order, created_at) VALUES (?, ?, ?, ?)`)
    .run(name, url, sort_order, now);
  res.json({ id: result.lastInsertRowid, name, url });
});

// DELETE /api/wisdom/quick-links/:id
router.delete('/quick-links/:id', (req, res) => {
  const { id } = req.params;
  const link = db.prepare(`SELECT id FROM quick_links WHERE id = ?`).get(id);
  if (!link) return res.status(404).json({ error: 'Not found' });
  db.prepare(`DELETE FROM quick_links WHERE id = ?`).run(id);
  res.json({ success: true });
});

export default router;
