import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';

const router = Router();

// GET /api/replays/:authCode
// Returns replay clips grouped by game for a session identified by its auth code.
// No auth required — the auth code IS the authentication token for customers.
router.get('/:authCode', async (req: Request, res: Response) => {
  try {
    const { authCode } = req.params as { authCode: string };

    if (!authCode || authCode.length !== 6) {
      res.status(400).json({ error: 'Invalid auth code', code: 'INVALID_AUTH_CODE' });
      return;
    }

    const session = await prisma.session.findFirst({
      where: { authCode: authCode.toUpperCase() },
      include: {
        station: { select: { id: true, name: true } },
        games: {
          orderBy: { startTime: 'asc' },
          include: {
            replayClips: {
              orderBy: { triggerTimestamp: 'asc' },
            },
          },
        },
      },
    });

    if (!session) {
      res.status(404).json({ error: 'Session not found', code: 'SESSION_NOT_FOUND' });
      return;
    }

    // Check if replays have expired
    const settings = await prisma.settings.findUnique({ where: { id: 1 } });
    const ttlMinutes = settings?.replayTTLMinutes ?? 60;
    let replaysExpired = false;

    if (session.endTime) {
      const expiresAt = new Date(session.endTime.getTime() + ttlMinutes * 60 * 1000);
      replaysExpired = new Date() > expiresAt;
    }

    res.json({
      sessionId: session.id,
      authCode: session.authCode,
      stationName: session.station.name,
      startTime: session.startTime,
      endTime: session.endTime,
      durationMinutes: session.durationMinutes,
      status: session.status,
      replaysExpired,
      expiresAt:
        session.endTime
          ? new Date(session.endTime.getTime() + ttlMinutes * 60 * 1000).toISOString()
          : null,
      games: session.games.map((g) => ({
        id: g.id,
        startTime: g.startTime,
        endTime: g.endTime,
        endMethod: g.endMethod,
        clips: g.replayClips.map((c) => ({
          id: c.id,
          filePath: c.filePath,
          triggerType: c.triggerType,
          triggerTimestamp: c.triggerTimestamp,
          createdAt: c.createdAt,
          stitchedReelPath: c.stitchedReelPath ?? null,
        })),
      })),
    });
  } catch (err) {
    console.error('[replays] GET /:authCode error:', err);
    res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});

export default router;
