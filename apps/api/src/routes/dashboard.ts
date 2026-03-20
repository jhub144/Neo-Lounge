import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { requireOwner } from '../middleware/auth';

const router = Router();

router.get('/', requireOwner, async (_req: Request, res: Response) => {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [completedTxs, activeSessions, recentEvents, stations] = await Promise.all([
    prisma.transaction.findMany({
      where: { status: 'COMPLETED', createdAt: { gte: startOfDay } },
      include: { session: { select: { stationId: true } } },
    }),
    prisma.session.findMany({
      where: { status: 'ACTIVE' },
      include: { station: { select: { id: true, name: true } } },
    }),
    prisma.securityEvent.findMany({
      orderBy: { timestamp: 'desc' },
      take: 20,
    }),
    prisma.station.findMany({ orderBy: { id: 'asc' } }),
  ]);

  const todayRevenue = completedTxs.reduce((sum, tx) => sum + tx.amount, 0);

  const revenueByStation: Record<number, number> = {};
  for (const station of stations) revenueByStation[station.id] = 0;
  for (const tx of completedTxs) {
    const sid = tx.session.stationId;
    revenueByStation[sid] = (revenueByStation[sid] ?? 0) + tx.amount;
  }

  const todayRevenueByStation = stations.map((s) => ({
    stationId: s.id,
    name: s.name,
    revenue: revenueByStation[s.id] ?? 0,
  }));

  res.json({
    todayRevenue,
    todayRevenueByStation,
    activeSessions: activeSessions.map((s) => ({
      id: s.id,
      stationId: s.stationId,
      stationName: s.station.name,
      durationMinutes: s.durationMinutes,
      startTime: s.startTime,
    })),
    recentEvents,
  });
});

export default router;
