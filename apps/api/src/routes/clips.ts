/**
 * Clip routes — used by the Python video pipeline to register and manage clips.
 */
import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { emitClipReady } from '../services/socketService';

const router = Router();

// POST /api/clips — register a new ReplayClip after extraction
router.post('/', async (req: Request, res: Response) => {
  try {
    const { gameId, sessionId, filePath, triggerType, triggerTimestamp } = req.body as {
      gameId: number;
      sessionId: number;
      filePath: string;
      triggerType: string;
      triggerTimestamp: string;
    };

    if (!gameId || !sessionId || !filePath || !triggerType || !triggerTimestamp) {
      res.status(400).json({ error: 'Missing required fields', code: 'MISSING_FIELDS' });
      return;
    }

    const VALID_TRIGGER_TYPES = ['CROWD_ROAR', 'WHISTLE'];
    if (!VALID_TRIGGER_TYPES.includes(triggerType)) {
      res.status(400).json({ error: 'Invalid trigger type', code: 'INVALID_TRIGGER_TYPE' });
      return;
    }

    const settings = await prisma.settings.findUnique({ where: { id: 1 } });
    const ttlMinutes = settings?.replayTTLMinutes ?? 60;
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

    const clip = await prisma.replayClip.create({
      data: {
        gameId,
        sessionId,
        filePath,
        triggerType: triggerType as 'CROWD_ROAR' | 'WHISTLE',
        triggerTimestamp: new Date(triggerTimestamp),
        expiresAt,
      },
    });

    emitClipReady(clip.id, sessionId, gameId, triggerType, filePath);

    res.status(201).json({
      clipId: clip.id,
      sessionId,
      gameId,
      filePath,
      expiresAt: clip.expiresAt,
    });
  } catch (err) {
    console.error('[clips] POST / error:', err);
    res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});

// GET /api/clips/unstitched — games with clips but no stitched reel (for pipeline recovery)
router.get('/unstitched', async (_req: Request, res: Response) => {
  try {
    // Find games that have clips where none have been stitched yet
    const games = await prisma.game.findMany({
      where: {
        endTime: { not: null },
        replayClips: {
          some: { stitchedReelPath: null },
        },
      },
      include: {
        replayClips: {
          where: { stitchedReelPath: null },
          select: { filePath: true },
          orderBy: { triggerTimestamp: 'asc' },
        },
        session: { select: { authCode: true } },
      },
    });

    res.json({
      games: games
        .filter((g) => g.replayClips.length > 0)
        .map((g) => ({
          gameId: g.id,
          sessionId: g.sessionId,
          authCode: g.session.authCode,
          clips: g.replayClips.map((c) => c.filePath),
        })),
    });
  } catch (err) {
    console.error('[clips] GET /unstitched error:', err);
    res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});

// GET /api/clips/expired — sessions whose replay TTL has passed
router.get('/expired', async (_req: Request, res: Response) => {
  try {
    const settings = await prisma.settings.findUnique({ where: { id: 1 } });
    const ttlMinutes = settings?.replayTTLMinutes ?? 60;
    const cutoff = new Date(Date.now() - ttlMinutes * 60 * 1000);

    const sessions = await prisma.session.findMany({
      where: {
        endTime: { lte: cutoff },
        replayClips: { some: {} },
      },
      select: { id: true, endTime: true },
    });

    res.json({ sessions });
  } catch (err) {
    console.error('[clips] GET /expired error:', err);
    res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});

// DELETE /api/clips/session/:sessionId — remove all clips for a session after TTL
router.delete('/session/:sessionId', async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(req.params.sessionId as string);
    if (isNaN(sessionId)) {
      res.status(400).json({ error: 'Invalid session ID', code: 'INVALID_ID' });
      return;
    }

    const { count } = await prisma.replayClip.deleteMany({ where: { sessionId } });
    res.json({ deleted: count });
  } catch (err) {
    console.error('[clips] DELETE /session/:sessionId error:', err);
    res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});

export default router;
