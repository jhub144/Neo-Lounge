import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { requireOwner, requireStaff } from '../middleware/auth';

const router = Router();

// Allow STAFF to see the dashboard too, not just OWNER, as it's the ShiftLog
router.get('/', requireStaff, async (_req: Request, res: Response) => {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [completedTxs, allTxs, activeSessions, recentEvents, stations] = await Promise.all([
    prisma.transaction.findMany({
      where: { status: 'COMPLETED', createdAt: { gte: startOfDay } },
      include: { session: { select: { stationId: true } } },
    }),
    prisma.transaction.findMany({
      where: { createdAt: { gte: startOfDay } },
      include: { session: { select: { stationId: true, station: { select: { name: true } } } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
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

  const recentTransactions = allTxs.map(t => ({
    id: t.id,
    amount: t.amount,
    method: t.method,
    status: t.status,
    createdAt: t.createdAt,
    stationName: t.session.station.name,
  }));

  res.json({
    todayRevenue,
    todayRevenueByStation,
    recentTransactions,
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
