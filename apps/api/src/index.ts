import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import staffRouter from './routes/staff';
import stationsRouter from './routes/stations';
import sessionsRouter from './routes/sessions';
import queueRouter from './routes/queue';
import settingsRouter from './routes/settings';
import eventsRouter from './routes/events';
import dashboardRouter from './routes/dashboard';

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
app.use('/api/queue', queueRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/events', eventsRouter);
app.use('/api/dashboard', dashboardRouter);

app.listen(PORT, () => {
  console.log(`API server running on port ${PORT}`);
});

export default app;
