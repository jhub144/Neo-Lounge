import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { requireStaff } from '../middleware/auth';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  const stations = await prisma.station.findMany({
    orderBy: { id: 'asc' },
    include: {
      currentSession: true,
      _count: { select: { queue: { where: { status: 'WAITING' } } } },
    },
  });
  res.json(
    stations.map((s) => ({
      id: s.id,
      name: s.name,
      status: s.status,
      currentSession: s.currentSession,
      queueCount: s._count.queue,
    }))
  );
});

router.get('/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) {
    res.status(404).json({ error: 'Station not found' });
    return;
  }
  const station = await prisma.station.findUnique({
    where: { id },
    include: {
      currentSession: { include: { transactions: true } },
      queue: { where: { status: 'WAITING' }, orderBy: { position: 'asc' } },
      sessions: {
        orderBy: { startTime: 'desc' },
        take: 10,
        include: { transactions: true },
      },
    },
  });
  if (!station) {
    res.status(404).json({ error: 'Station not found' });
    return;
  }
  res.json(station);
});

router.patch('/:id', requireStaff, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) {
    res.status(404).json({ error: 'Station not found' });
    return;
  }
  const { status } = req.body as { status?: string };
  if (!status) {
    res.status(400).json({ error: 'status is required' });
    return;
  }

  const station = await prisma.station.findUnique({ where: { id } });
  if (!station) {
    res.status(404).json({ error: 'Station not found' });
    return;
  }

  const updated = await prisma.station.update({ where: { id }, data: { status: status as any } });

  if (status === 'FAULT') {
    await prisma.securityEvent.create({
      data: {
        type: 'STATION_FAULT',
        description: `${station.name} marked as FAULT`,
        staffPin: req.staff!.pin,
        stationId: id,
      },
    });
  }

  res.json(updated);
});

export default router;
