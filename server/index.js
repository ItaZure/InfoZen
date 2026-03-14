import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import chatRoutes from './routes/chat.js';

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.use('/api/chat', chatRoutes);

const PORT = 10101;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
