import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { requireStaff } from '../middleware/auth';
import { calculatePrice, generateAuthCode } from '../utils/pricing';

const router = Router();

// POST /api/sessions
router.post('/', requireStaff, async (req: Request, res: Response) => {
  const { stationId, durationMinutes, paymentMethod } = req.body as {
    stationId?: number;
    durationMinutes?: number;
    paymentMethod?: string;
  };

  if (!stationId || !durationMinutes || !paymentMethod) {
    res.status(400).json({ error: 'stationId, durationMinutes, and paymentMethod are required' });
    return;
  }

  const station = await prisma.station.findUnique({ where: { id: stationId } });
  if (!station) {
    res.status(404).json({ error: 'Station not found' });
    return;
  }
  if (station.status !== 'AVAILABLE') {
    res.status(400).json({ error: 'Station is not available' });
    return;
  }

  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  const rate = settings?.baseHourlyRate ?? 300;
  const amount = calculatePrice(durationMinutes, rate);
  const authCode = generateAuthCode();
  const staffPin = req.staff!.pin;

  const txStatus = paymentMethod === 'CASH' ? 'COMPLETED' : 'PENDING';

  const session = await prisma.session.create({
    data: {
      stationId,
      staffPin,
      durationMinutes,
      authCode,
      status: 'ACTIVE',
      transactions: {
        create: {
          amount,
          method: paymentMethod as any,
          status: txStatus as any,
          staffPin,
        },
      },
      games: {
        create: {
          startTime: new Date(),
        },
      },
    },
    include: { transactions: true, games: true },
  });

  await prisma.station.update({
    where: { id: stationId },
    data: { status: 'ACTIVE', currentSessionId: session.id },
  });

  const eventType = paymentMethod === 'CASH' ? 'CASH_PAYMENT' : 'MPESA_PAYMENT';
  await prisma.securityEvent.createMany({
    data: [
      {
        type: 'SESSION_START',
        description: `Session ${session.id} started on ${station.name}`,
        staffPin,
        stationId,
      },
      {
        type: eventType as any,
        description: `${paymentMethod} payment of ${amount} KES for session ${session.id}`,
        staffPin,
        stationId,
      },
    ],
  });

  res.status(201).json(session);
});

// GET /api/sessions/:id
router.get('/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  const session = await prisma.session.findUnique({
    where: { id },
    include: {
      station: true,
      transactions: true,
      games: { include: { replayClips: true } },
    },
  });

  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  res.json(session);
});

// PATCH /api/sessions/:id/end
router.patch('/:id/end', requireStaff, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  const session = await prisma.session.findUnique({
    where: { id },
    include: { games: { where: { endTime: null } } },
  });

  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  if (session.status !== 'ACTIVE') {
    res.status(400).json({ error: 'Session is not active' });
    return;
  }

  const now = new Date();

  // End any active games
  if (session.games.length > 0) {
    await prisma.game.updateMany({
      where: { sessionId: id, endTime: null },
      data: { endTime: now, endMethod: 'SESSION_END' },
    });
  }

  const updated = await prisma.session.update({
    where: { id },
    data: { status: 'COMPLETED', endTime: now },
    include: { transactions: true, games: true },
  });

  await prisma.station.update({
    where: { id: session.stationId },
    data: { status: 'AVAILABLE', currentSessionId: null },
  });

  await prisma.securityEvent.create({
    data: {
      type: 'SESSION_END',
      description: `Session ${id} ended on station ${session.stationId}`,
      staffPin: req.staff!.pin,
      stationId: session.stationId,
    },
  });

  res.json(updated);
});

export default router;
