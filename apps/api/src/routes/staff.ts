import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';

const router = Router();

router.post('/login', async (req: Request, res: Response) => {
  const { pin } = req.body as { pin?: string };
  if (!pin) {
    res.status(400).json({ error: 'PIN is required' });
    return;
  }
  const staff = await prisma.staff.findFirst({ where: { pin, isActive: true } });
  if (!staff) {
    res.status(401).json({ error: 'Invalid PIN' });
    return;
  }
  await prisma.securityEvent.create({
    data: {
      type: 'SHIFT_START',
      description: `${staff.name} started shift`,
      staffPin: staff.pin,
    },
  });
  res.json({ id: staff.id, name: staff.name, role: staff.role });
});

export default router;
