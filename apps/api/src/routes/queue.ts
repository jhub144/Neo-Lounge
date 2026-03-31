import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { requireStaff } from '../middleware/auth';
import { emitQueueUpdated } from '../services/socketService';

const router = Router();

// POST /api/queue
router.post('/', requireStaff, async (req: Request, res: Response) => {
  try {
    const { stationId, durationMinutes } = req.body as {
      stationId?: number;
      durationMinutes?: number;
    };

    if (!stationId || !durationMinutes) {
      res.status(400).json({ error: 'stationId and durationMinutes are required' });
      return;
    }

    const station = await prisma.station.findUnique({ where: { id: stationId } });
    if (!station) {
      res.status(404).json({ error: 'Station not found' });
      return;
    }

    const last = await prisma.stationQueue.findFirst({
      where: { stationId, status: 'WAITING' },
      orderBy: { position: 'desc' },
    });

    const position = (last?.position ?? 0) + 1;

    const entry = await prisma.stationQueue.create({
      data: { stationId, durationMinutes, position, status: 'WAITING' },
    });

    emitQueueUpdated(stationId);
    res.status(201).json(entry);
  } catch (err) {
    console.error('[queue] POST / error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/queue/:stationId
router.get('/:stationId', async (req: Request, res: Response) => {
  try {
    const stationId = parseInt(req.params.stationId as string);
    if (isNaN(stationId)) {
      res.status(400).json({ error: 'Invalid stationId' });
      return;
    }

    const entries = await prisma.stationQueue.findMany({
      where: { stationId, status: 'WAITING' },
      orderBy: { position: 'asc' },
    });

    res.json(entries);
  } catch (err) {
    console.error('[queue] GET /:stationId error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/queue/:id
router.delete('/:id', requireStaff, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) {
      res.status(404).json({ error: 'Queue entry not found' });
      return;
    }

    const entry = await prisma.stationQueue.findUnique({ where: { id } });
    if (!entry) {
      res.status(404).json({ error: 'Queue entry not found' });
      return;
    }

    const updated = await prisma.stationQueue.update({
      where: { id },
      data: { status: 'EXPIRED' },
    });

    emitQueueUpdated(entry.stationId);
    res.json(updated);
  } catch (err) {
    console.error('[queue] DELETE /:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
