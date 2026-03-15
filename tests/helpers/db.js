/**
 * 测试专用内存数据库工厂
 *
 * 每次调用 createTestDb() 返回一个全新的 :memory: SQLite 实例，
 * 表结构与 server/db.js 保持同步，不会污染 data.db。
 */

import Database from 'better-sqlite3';

export function createTestDb() {
  const db = new Database(':memory:');

  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY,
      topic_id TEXT NOT NULL,
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      images TEXT NOT NULL DEFAULT '[]',
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS tree_nodes (
      id INTEGER PRIMARY KEY,
      topic_id TEXT NOT NULL,
      parent_id INTEGER,
      label TEXT NOT NULL,
      content TEXT NOT NULL,
      user_message_id INTEGER,
      ai_message_id INTEGER,
      summarized INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS topic_meta (
      topic_id TEXT PRIMARY KEY,
      notes TEXT DEFAULT '',
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      topic_id TEXT NOT NULL,
      time_range TEXT NOT NULL,
      summary TEXT NOT NULL,
      created_at TEXT NOT NULL,
      deleted_at TEXT,
      UNIQUE(topic_id, time_range)
    );
  `);

  // 预置 5 个话题（与生产环境一致）
  const topics = ['自由主题', '产品技术', '哲学', '商业', '英语'];
  const insertTopic = db.prepare(
    `INSERT OR IGNORE INTO topic_meta (topic_id, notes, updated_at) VALUES (?, '', ?)`
  );
  const now = new Date().toISOString();
  for (const topic of topics) {
    insertTopic.run(topic, now);
  }

  return db;
}
