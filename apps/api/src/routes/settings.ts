import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { requireOwner } from '../middleware/auth';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  if (!settings) {
    res.status(404).json({ error: 'Settings not found' });
    return;
  }
  res.json(settings);
});

router.patch('/', requireOwner, async (req: Request, res: Response) => {
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
});

export default router;
