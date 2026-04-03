import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { requireStaff } from '../middleware/auth';
import { calculatePrice, generateAuthCode } from '../utils/pricing';
import { emitStationUpdate, emitSessionEnded } from '../services/socketService';
import { adbService } from '../services/adbService';
import { tuyaService } from '../services/tuyaService';
import { captureService } from '../services/captureService';

const router = Router();

// POST /api/sessions
router.post('/', requireStaff, async (req: Request, res: Response) => {
  try {
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

    emitStationUpdate(stationId, { status: 'ACTIVE', currentSessionId: session.id });

    // Hardware activation (fire-and-forget)
    adbService.switchToHDMI(station.adbAddress).catch(() => {});
    tuyaService.activateSync(station.tuyaDeviceId).catch(() => {});
    captureService.startCapture(stationId, station.captureDevice).catch(() => {});

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
  } catch (err) {
    console.error('[sessions] POST / error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/sessions — list sessions (owner dashboard history)
router.get('/', requireStaff, async (req: Request, res: Response) => {
  try {
    const { status, stationId } = req.query as { status?: string; stationId?: string };
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);

    const sessions = await prisma.session.findMany({
      where: {
        ...(status ? { status: status as any } : {}),
        ...(stationId ? { stationId: parseInt(stationId) } : {}),
      },
      include: {
        station: { select: { id: true, name: true } },
        transactions: {
          select: { id: true, amount: true, method: true, status: true, createdAt: true, staffPin: true },
        },
      },
      orderBy: { startTime: 'desc' },
      take: limit,
    });

    res.json(sessions);
  } catch (err) {
    console.error('[sessions] GET / error:', err);
    res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});

// GET /api/sessions/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
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
  } catch (err) {
    console.error('[sessions] GET /:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/sessions/:id/end
router.patch('/:id/end', requireStaff, async (req: Request, res: Response) => {
  try {
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

    emitStationUpdate(session.stationId, { status: 'AVAILABLE', currentSessionId: null });
    emitSessionEnded(session.stationId, id);

    // Hardware deactivation (fire-and-forget)
    const src = await prisma.station.findUnique({ where: { id: session.stationId } });
    adbService.switchToScreensaver(src?.adbAddress ?? '').catch(() => {});
    tuyaService.setAmbientMode(src?.tuyaDeviceId ?? '').catch(() => {});
    captureService.stopCapture(session.stationId).catch(() => {});

    await prisma.securityEvent.create({
      data: {
        type: 'SESSION_END',
        description: `Session ${id} ended on station ${session.stationId}`,
        staffPin: req.staff!.pin,
        stationId: session.stationId,
      },
    });

    res.json(updated);
  } catch (err) {
    console.error('[sessions] PATCH /:id/end error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/sessions/:id/extend
router.patch('/:id/extend', requireStaff, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const { durationMinutes, paymentMethod } = req.body as {
      durationMinutes?: number;
      paymentMethod?: string;
    };

    if (!durationMinutes || !paymentMethod) {
      res.status(400).json({ error: 'durationMinutes and paymentMethod are required' });
      return;
    }

    const session = await prisma.session.findUnique({ where: { id } });
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    if (session.status !== 'ACTIVE') {
      res.status(400).json({ error: 'Session is not active' });
      return;
    }

    const settings = await prisma.settings.findUnique({ where: { id: 1 } });
    const rate = settings?.baseHourlyRate ?? 300;
    const amount = calculatePrice(durationMinutes, rate);
    const staffPin = req.staff!.pin;
    const txStatus = paymentMethod === 'CASH' ? 'COMPLETED' : 'PENDING';

    await prisma.transaction.create({
      data: {
        sessionId: id,
        amount,
        method: paymentMethod as any,
        status: txStatus as any,
        staffPin,
      },
    });

    const updated = await prisma.session.update({
      where: { id },
      data: { durationMinutes: { increment: durationMinutes } },
      include: { transactions: true, games: true },
    });

    await prisma.securityEvent.create({
      data: {
        type: 'SESSION_EXTENDED',
        description: `Session ${id} extended by ${durationMinutes} minutes`,
        staffPin,
        stationId: session.stationId,
      },
    });

    res.json(updated);
  } catch (err) {
    console.error('[sessions] PATCH /:id/extend error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/sessions/:id/grant-free-time
router.post('/:id/grant-free-time', requireStaff, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const { durationMinutes } = req.body as { durationMinutes?: number };
    if (!durationMinutes || durationMinutes <= 0) {
      res.status(400).json({ error: 'durationMinutes is required and must be positive' });
      return;
    }

    const session = await prisma.session.findUnique({ where: { id } });
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    if (session.status !== 'ACTIVE') {
      res.status(400).json({ error: 'Session is not active' });
      return;
    }

    const staffPin = req.staff!.pin;

    const updated = await prisma.session.update({
      where: { id },
      data: { durationMinutes: { increment: durationMinutes } },
      include: { transactions: true, games: true },
    });

    emitStationUpdate(session.stationId, { currentSessionId: id });

    await prisma.securityEvent.create({
      data: {
        type: 'FREE_TIME_GRANTED',
        description: `${durationMinutes} minutes of free time granted on session ${id}`,
        staffPin,
        stationId: session.stationId,
      },
    });

    res.json(updated);
  } catch (err) {
    console.error('[sessions] POST /:id/grant-free-time error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/sessions/:id/transfer
router.post('/:id/transfer', requireStaff, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const { targetStationId } = req.body as { targetStationId?: number };
    if (!targetStationId) {
      res.status(400).json({ error: 'targetStationId is required' });
      return;
    }

    const [session, targetStation] = await Promise.all([
      prisma.session.findUnique({
        where: { id },
        include: { games: { where: { endTime: null } } },
      }),
      prisma.station.findUnique({ where: { id: targetStationId } }),
    ]);

    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    if (session.status !== 'ACTIVE') {
      res.status(400).json({ error: 'Session is not active' });
      return;
    }
    if (!targetStation) {
      res.status(404).json({ error: 'Target station not found' });
      return;
    }
    if (targetStation.status !== 'AVAILABLE') {
      res.status(400).json({ error: 'Target station is not available' });
      return;
    }

    const now = new Date();
    const elapsedMinutes = Math.floor((now.getTime() - new Date(session.startTime).getTime()) / 60000);
    const remainingMinutes = Math.max(0, session.durationMinutes - elapsedMinutes);
    const staffPin = req.staff!.pin;

    // End active games on source session
    if (session.games.length > 0) {
      await prisma.game.updateMany({
        where: { sessionId: id, endTime: null },
        data: { endTime: now, endMethod: 'SESSION_END' },
      });
    }

    // End source session
    await prisma.session.update({
      where: { id },
      data: { status: 'COMPLETED', endTime: now },
    });

    // Free source station
    await prisma.station.update({
      where: { id: session.stationId },
      data: { status: 'AVAILABLE', currentSessionId: null },
    });

    // Create new session on target
    const newSession = await prisma.session.create({
      data: {
        stationId: targetStationId,
        staffPin,
        durationMinutes: remainingMinutes,
        authCode: generateAuthCode(),
        status: 'ACTIVE',
        games: { create: { startTime: now } },
      },
      include: { transactions: true, games: true },
    });

    // Activate target station
    await prisma.station.update({
      where: { id: targetStationId },
      data: { status: 'ACTIVE', currentSessionId: newSession.id },
    });

    await prisma.securityEvent.create({
      data: {
        type: 'SESSION_TRANSFER',
        description: `Session ${id} transferred to station ${targetStationId} with ${remainingMinutes} minutes remaining`,
        staffPin,
        stationId: targetStationId,
        metadata: { fromSessionId: id, toSessionId: newSession.id, remainingMinutes },
      },
    });

    res.status(201).json(newSession);
  } catch (err) {
    console.error('[sessions] POST /:id/transfer error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
