import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import staffRouter from './routes/staff';
import stationsRouter from './routes/stations';
import sessionsRouter from './routes/sessions';
import queueRouter from './routes/queue';
import settingsRouter from './routes/settings';
import eventsRouter from './routes/events';
import dashboardRouter from './routes/dashboard';
import gamesRouter from './routes/games';
import replaysRouter from './routes/replays';
import hardwareRouter from './routes/hardware';
import systemRouter from './routes/system';
import securityRouter from './routes/security';
import paymentsRouter from './routes/payments';
import clipsRouter from './routes/clips';
import { initSocketService } from './services/socketService';
import { startTimerService } from './services/timerService';
import { adbService } from './services/adbService';
import { tuyaService } from './services/tuyaService';
import prisma from './lib/prisma';


dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });

initSocketService(io);

io.on('connection', (socket) => {
  socket.on('join:station', (stationId: number) => {
    socket.join(`station:${stationId}`);
  });
});

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
app.use('/api/games', gamesRouter);
app.use('/api/replays', replaysRouter);
app.use('/api/hardware', hardwareRouter);
app.use('/api/system', systemRouter);
app.use('/api/security', securityRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/clips', clipsRouter);

if (process.env.NODE_ENV !== 'test') {
  httpServer.listen(PORT, () => {
    console.log(`API server running on port ${PORT}`);
  });
  startTimerService();

  // Initialise hardware services with all station addresses from the database
  prisma.station.findMany().then((stations) => {
    adbService.initAddresses(stations.map((s) => s.adbAddress).filter(Boolean));
    tuyaService.initDevices(stations.map((s) => s.tuyaDeviceId).filter(Boolean));
  }).catch((err) => {
    console.error('[startup] Failed to init hardware services:', err);
  });
}

export default app;
