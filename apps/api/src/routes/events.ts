import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { requireOwner } from '../middleware/auth';

const router = Router();

router.get('/', requireOwner, async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const type = req.query.type as string | undefined;
    const stationId = req.query.stationId ? parseInt(req.query.stationId as string) : undefined;

    const events = await prisma.securityEvent.findMany({
      where: {
        ...(type ? { type: type as any } : {}),
        ...(stationId ? { stationId } : {}),
      },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });

    res.json(events);
  } catch (err) {
    console.error('[events] GET / error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
