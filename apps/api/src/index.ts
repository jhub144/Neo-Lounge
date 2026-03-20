import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import staffRouter from './routes/staff';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/staff', staffRouter);

app.listen(PORT, () => {
  console.log(`API server running on port ${PORT}`);
});

export default app;
