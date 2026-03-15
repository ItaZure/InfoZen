import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'data.db');

const db = new Database(DB_PATH);

// 开启 WAL 模式提升并发性能
db.pragma('journal_mode = WAL');

// 初始化表结构
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

// 兼容已存在的数据库：补充 images 字段（忽略已存在的错误）
try {
  db.exec(`ALTER TABLE messages ADD COLUMN images TEXT NOT NULL DEFAULT '[]'`);
} catch {
  // 字段已存在，忽略
}

// 兼容已存在的数据库：为 logs 表加 UNIQUE 约束（重建表方式）
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS logs_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      topic_id TEXT NOT NULL,
      time_range TEXT NOT NULL,
      summary TEXT NOT NULL,
      created_at TEXT NOT NULL,
      deleted_at TEXT,
      UNIQUE(topic_id, time_range)
    );
    INSERT OR IGNORE INTO logs_new (id, topic_id, time_range, summary, created_at, deleted_at)
      SELECT id, topic_id, time_range, summary, created_at, deleted_at FROM logs;
    DROP TABLE logs;
    ALTER TABLE logs_new RENAME TO logs;
  `);
} catch {
  // 已有约束或迁移失败，忽略
}

// 预置 5 个话题
const topics = ['自由主题', '产品技术', '哲学', '商业', '英语'];
const insertTopic = db.prepare(`
  INSERT OR IGNORE INTO topic_meta (topic_id, notes, updated_at)
  VALUES (?, '', ?)
`);
const now = new Date().toISOString();
for (const topic of topics) {
  insertTopic.run(topic, now);
}

export default db;
