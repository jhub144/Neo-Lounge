import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { requireOwner } from '../middleware/auth';

const router = Router();

// GET /api/security/cameras — list all cameras with online status
router.get('/cameras', requireOwner, async (_req: Request, res: Response) => {
  try {
    const cameras = await prisma.securityCamera.findMany({ orderBy: { id: 'asc' } });
    res.json(cameras);
  } catch (err) {
    console.error('[security] GET /cameras error:', err);
    res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});

// GET /api/security/clips/:eventId — clips for a specific security event
router.get('/clips/:eventId', requireOwner, async (req: Request, res: Response) => {
  try {
    const eventId = parseInt(req.params.eventId as string);
    if (isNaN(eventId)) {
      res.status(400).json({ error: 'Invalid event ID', code: 'INVALID_ID' });
      return;
    }

    const clips = await prisma.securityClip.findMany({
      where: { eventId },
      include: { camera: { select: { id: true, name: true, location: true } } },
      orderBy: { startTime: 'asc' },
    });

    res.json(clips);
  } catch (err) {
    console.error('[security] GET /clips/:eventId error:', err);
    res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});

// POST /api/security/clips — register a clip created by the video pipeline
router.post('/clips', async (req: Request, res: Response) => {
  try {
    const { cameraId, eventId, filePath } = req.body as {
      cameraId: number;
      eventId: number;
      filePath: string;
    };

    if (!cameraId || !eventId || !filePath) {
      res.status(400).json({ error: 'Missing required fields', code: 'MISSING_FIELDS' });
      return;
    }

    const now = new Date();
    const clip = await prisma.securityClip.create({
      data: {
        cameraId,
        eventId,
        filePath,
        startTime: now,
        endTime: now,
      },
    });

    res.status(201).json({ clipId: clip.id, cameraId, eventId, filePath });
  } catch (err) {
    console.error('[security] POST /clips error:', err);
    res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});

// PATCH /api/security/cameras/:id — update camera online status (called by pipeline)
router.patch('/cameras/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid camera ID', code: 'INVALID_ID' });
      return;
    }

    const { isOnline } = req.body as { isOnline: boolean };
    const camera = await prisma.securityCamera.update({
      where: { id },
      data: { isOnline: Boolean(isOnline) },
    });

    res.json({ id: camera.id, isOnline: camera.isOnline });
  } catch (err) {
    console.error('[security] PATCH /cameras/:id error:', err);
    res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});

// DELETE /api/security/clips/:id — delete a specific security clip
router.delete('/clips/:id', requireOwner, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid clip ID', code: 'INVALID_ID' });
      return;
    }

    const clip = await prisma.securityClip.findUnique({ where: { id } });
    if (!clip) {
      res.status(404).json({ error: 'Clip not found', code: 'NOT_FOUND' });
      return;
    }

    await prisma.securityClip.delete({ where: { id } });

    await prisma.securityEvent.create({
      data: {
        type: 'ADMIN_OVERRIDE',
        description: `Security clip ${id} deleted`,
        staffPin: req.staff!.pin,
        metadata: { clipId: id, filePath: clip.filePath },
      },
    });

    res.json({ ok: true });
  } catch (err) {
    console.error('[security] DELETE /clips/:id error:', err);
    res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});

export default router;
