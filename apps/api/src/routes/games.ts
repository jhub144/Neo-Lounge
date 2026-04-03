import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { requireStaff } from '../middleware/auth';
import { emitGameEnded } from '../services/socketService';

const router = Router();

// POST /api/games/:id/end
// Manually ends a game (triggered by the tablet "End Game" button or staff action)
router.post('/:id/end', requireStaff, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) {
      res.status(404).json({ error: 'Game not found', code: 'GAME_NOT_FOUND' });
      return;
    }

    const game = await prisma.game.findUnique({
      where: { id },
      include: { session: true },
    });

    if (!game) {
      res.status(404).json({ error: 'Game not found', code: 'GAME_NOT_FOUND' });
      return;
    }

    if (game.endTime !== null) {
      res.status(400).json({ error: 'Game has already ended', code: 'GAME_ALREADY_ENDED' });
      return;
    }

    const now = new Date();
    const updated = await prisma.game.update({
      where: { id },
      data: { endTime: now, endMethod: 'MANUAL_BUTTON' },
    });

    // Emit game:ended WebSocket event so tablet and other clients update
    emitGameEnded(game.session.stationId, id);

    res.json(updated);
  } catch (err) {
    console.error('[games] POST /:id/end error:', err);
    res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});

// PATCH /api/games/:id/reel — called by the pipeline when a highlight reel is ready
// Updates all ReplayClips for this game with the stitchedReelPath
router.patch('/:id/reel', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) {
      res.status(404).json({ error: 'Game not found', code: 'GAME_NOT_FOUND' });
      return;
    }

    const { stitchedReelPath } = req.body as { stitchedReelPath: string };

    if (!stitchedReelPath) {
      res.status(400).json({ error: 'Missing stitchedReelPath', code: 'MISSING_FIELDS' });
      return;
    }

    const game = await prisma.game.findUnique({
      where: { id },
      include: { session: { select: { stationId: true } } },
    });

    if (!game) {
      res.status(404).json({ error: 'Game not found', code: 'GAME_NOT_FOUND' });
      return;
    }

    await prisma.replayClip.updateMany({
      where: { gameId: id },
      data: { stitchedReelPath },
    });

    emitGameEnded(game.session.stationId, id);

    res.json({ gameId: id, stitchedReelPath });
  } catch (err) {
    console.error('[games] PATCH /:id/reel error:', err);
    res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});

export default router;
