import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { requireOwner } from '../middleware/auth';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  try {
    const settings = await prisma.settings.findUnique({ where: { id: 1 } });
    if (!settings) {
      res.status(404).json({ error: 'Settings not found' });
      return;
    }
    res.json(settings);
  } catch (err) {
    console.error('[settings] GET / error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.patch('/', requireOwner, async (req: Request, res: Response) => {
  try {
    const updated = await prisma.settings.update({
      where: { id: 1 },
      data: req.body,
    });

    await prisma.securityEvent.create({
      data: {
        type: 'ADMIN_OVERRIDE',
        description: 'Settings updated',
        staffPin: req.staff!.pin,
        metadata: req.body,
      },
    });

    res.json(updated);
  } catch (err) {
    console.error('[settings] PATCH / error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
