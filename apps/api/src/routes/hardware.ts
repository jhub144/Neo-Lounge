import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { requireOwner } from '../middleware/auth';
import { adbService } from '../services/adbService';
import { tuyaService } from '../services/tuyaService';

const router = Router();

// GET /api/hardware/status
router.get('/status', requireOwner, async (_req: Request, res: Response) => {
  try {
    const stations = await prisma.station.findMany({ orderBy: { id: 'asc' } });

    const statuses = await Promise.all(
      stations.map(async (station) => {
        const [tvResult, ledResult] = await Promise.allSettled([
          adbService.getStatus(station.adbAddress),
          tuyaService.getStatus(station.tuyaDeviceId),
        ]);

        return {
          stationId: station.id,
          name: station.name,
          tvConnected:
            tvResult.status === 'fulfilled' ? tvResult.value.connected : false,
          ledsConnected:
            ledResult.status === 'fulfilled' ? ledResult.value.connected : false,
          adbAddress: station.adbAddress || '(not configured)',
          tuyaDeviceId: station.tuyaDeviceId || '(not configured)',
        };
      })
    );

    res.json({ stations: statuses });
  } catch (err) {
    console.error('[hardware] GET /status error:', err);
    res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});

export default router;
