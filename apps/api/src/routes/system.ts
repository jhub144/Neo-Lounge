import { Router, Request, Response } from 'express';
import { requireOwner } from '../middleware/auth';
import prisma from '../lib/prisma';

const router = Router();

const ALLOWED_SERVICES = ['api', 'video-pipeline', 'postgresql'] as const;
type ServiceName = typeof ALLOWED_SERVICES[number];

// POST /api/system/restart-service
router.post('/restart-service', requireOwner, async (req: Request, res: Response) => {
  try {
    const { service } = req.body as { service?: string };

    if (!service || !ALLOWED_SERVICES.includes(service as ServiceName)) {
      res.status(400).json({
        error: `Invalid service. Must be one of: ${ALLOWED_SERVICES.join(', ')}`,
        code: 'INVALID_SERVICE',
      });
      return;
    }

    await prisma.securityEvent.create({
      data: {
        type: 'ADMIN_OVERRIDE',
        description: `Owner requested restart of service: ${service}`,
        staffPin: req.staff!.pin,
        metadata: { service, requestedAt: new Date().toISOString() },
      },
    });

    // In production this would call systemctl or similar.
    // For now we log and return success so the UI can be tested.
    console.log(`[system] Restart requested for service: ${service}`);

    res.json({ ok: true, service, message: `Restart signal sent to ${service}` });
  } catch (err) {
    console.error('[system] POST /restart-service error:', err);
    res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});

export default router;
