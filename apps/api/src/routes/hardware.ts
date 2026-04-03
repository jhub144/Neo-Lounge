import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { requireOwner } from '../middleware/auth';
import { adbService } from '../services/adbService';
import { tuyaService } from '../services/tuyaService';

const router = Router();

// GET /api/hardware/status
// Returns mock connection status for all 4 stations' TV + LED controllers.
router.get('/status', requireOwner, async (_req: Request, res: Response) => {
  try {
    const stations = await prisma.station.findMany({ orderBy: { id: 'asc' } });

    const statuses = await Promise.all(
      stations.map(async (station) => {
        // Mock services always return success — hardware stage will add real checks
        const [tvResult, ledResult] = await Promise.allSettled([
          adbService.switchToHDMI(station.adbAddress).then(() => true).catch(() => false),
          tuyaService.activateSync(station.tuyaDeviceId).then(() => true).catch(() => false),
        ]);

        return {
          stationId: station.id,
          name: station.name,
          tvConnected: tvResult.status === 'fulfilled' ? tvResult.value : false,
          ledsConnected: ledResult.status === 'fulfilled' ? ledResult.value : false,
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
