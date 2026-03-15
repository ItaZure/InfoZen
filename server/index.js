import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import './db.js'; // 初始化数据库
import db from './db.js'; // 导入 db 实例用于启动检查
import chatRoutes from './routes/chat.js';
import topicsRoutes from './routes/topics.js';
import conversationsRoutes from './routes/conversations.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 启动检查：验证数据库表是否初始化
try {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  const requiredTables = ['messages', 'tree_nodes', 'topic_meta', 'logs'];
  const existingTables = tables.map(t => t.name);
  const missingTables = requiredTables.filter(t => !existingTables.includes(t));

  if (missingTables.length > 0) {
    console.error(`❌ 数据库初始化失败，缺少表: ${missingTables.join(', ')}`);
    process.exit(1);
  }
  console.log('✅ 数据库初始化成功');
} catch (err) {
  console.error('❌ 数据库启动检查失败:', err.message);
  process.exit(1);
}

// 启动时加载所有 system prompts
const PROMPTS = {};
const promptsDir = path.join(__dirname, 'prompts');
const topics = ['产品技术', '哲学', '商业', '英语'];

for (const topic of topics) {
  const filePath = path.join(promptsDir, `${topic}.md`);
  try {
    PROMPTS[topic] = fs.readFileSync(filePath, 'utf-8').trim();
  } catch (err) {
    console.warn(`Warning: Failed to load prompt for ${topic}:`, err.message);
    PROMPTS[topic] = ''; // 降级为空 prompt
  }
}

// 导出 PROMPTS 供路由使用
export { PROMPTS };

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.use('/api/chat', chatRoutes);
app.use('/api/topics', topicsRoutes);
app.use('/api/conversations', conversationsRoutes);

const PORT = 10101;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
