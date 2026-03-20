import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';

export async function requireStaff(req: Request, res: Response, next: NextFunction) {
  const pin = req.headers['x-staff-pin'] as string | undefined;
  if (!pin) {
    res.status(401).json({ error: 'Missing x-staff-pin header' });
    return;
  }
  const staff = await prisma.staff.findFirst({ where: { pin, isActive: true } });
  if (!staff) {
    res.status(401).json({ error: 'Invalid PIN' });
    return;
  }
  req.staff = staff;
  next();
}

export async function requireOwner(req: Request, res: Response, next: NextFunction) {
  await requireStaff(req, res, async () => {
    if (req.staff?.role !== 'OWNER') {
      res.status(403).json({ error: 'Owner access required' });
      return;
    }
    next();
  });
}
