import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import staffRouter from './routes/staff';
import stationsRouter from './routes/stations';
import sessionsRouter from './routes/sessions';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/staff', staffRouter);
app.use('/api/stations', stationsRouter);
app.use('/api/sessions', sessionsRouter);

app.listen(PORT, () => {
  console.log(`API server running on port ${PORT}`);
});

export default app;
