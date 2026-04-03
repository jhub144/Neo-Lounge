/**
 * POST /api/clips — register a new ReplayClip created by the video pipeline.
 * Called internally by the Python pipeline after clip extraction.
 * No user auth required — protected by PIPELINE_SECRET header check.
 */
import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { emitClipReady } from '../services/socketService';

const router = Router();

// POST /api/clips
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

export default router;
