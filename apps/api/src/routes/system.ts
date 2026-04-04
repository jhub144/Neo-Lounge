import { Router, Request, Response } from 'express';
import { requireOwner } from '../middleware/auth';
import prisma from '../lib/prisma';
import { adbService } from '../services/adbService';
import { tuyaService } from '../services/tuyaService';
import { emitPowerStatus, emitStationUpdate } from '../services/socketService';
import { internetService } from '../services/internetService';

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

// POST /api/system/power-down
// Preserves all active sessions and dims/powers off hardware.
router.post('/power-down', requireOwner, async (req: Request, res: Response) => {
  try {
    const now = Date.now();

    // Find all active sessions with their stations
    const activeSessions = await prisma.session.findMany({
      where: { status: 'ACTIVE' },
      include: { station: true },
    });

    // Preserve each session: calculate remaining seconds and mark POWER_INTERRUPTED
    const preserved = await Promise.all(
      activeSessions.map(async (session) => {
        const elapsedSeconds = Math.floor(
          (now - new Date(session.startTime).getTime()) / 1000
        );
        const totalSeconds = session.durationMinutes * 60;
        const remainingAtPowerLoss = Math.max(0, totalSeconds - elapsedSeconds);

        await prisma.session.update({
          where: { id: session.id },
          data: { status: 'POWER_INTERRUPTED', remainingAtPowerLoss },
        });

        // Dim active station TV
        adbService.setBrightness(session.station.adbAddress, 50).catch(() => {});

        return session.id;
      })
    );

    // Power off unused stations (AVAILABLE / PENDING / FAULT)
    const allStations = await prisma.station.findMany();
    const activeStationIds = new Set(activeSessions.map((s) => s.stationId));

    for (const station of allStations) {
      if (!activeStationIds.has(station.id)) {
        adbService.powerOff(station.adbAddress).catch(() => {});
        tuyaService.turnOff(station.tuyaDeviceId).catch(() => {});
      }
    }

    // Audit log
    await prisma.securityEvent.create({
      data: {
        type: 'POWER_LOSS',
        description: `Power-down: ${preserved.length} session(s) preserved`,
        staffPin: req.staff!.pin,
        metadata: { sessionIds: preserved, triggeredAt: new Date().toISOString() },
      },
    });

    emitPowerStatus('save');

    res.json({ sessionsPreserved: preserved.length, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error('[system] POST /power-down error:', err);
    res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});

// POST /api/system/power-restore
// Restores all POWER_INTERRUPTED sessions with their saved remaining time.
router.post('/power-restore', requireOwner, async (req: Request, res: Response) => {
  try {
    const now = new Date();

    const interrupted = await prisma.session.findMany({
      where: { status: 'POWER_INTERRUPTED' },
      include: { station: true },
    });

    const restored = await Promise.all(
      interrupted.map(async (session) => {
        const remaining = session.remainingAtPowerLoss ?? session.durationMinutes * 60;
        const totalSeconds = session.durationMinutes * 60;

        // Adjust startTime so the timer calculates the correct remaining time
        const newStartTime = new Date(now.getTime() - (totalSeconds - remaining) * 1000);

        await prisma.session.update({
          where: { id: session.id },
          data: { status: 'ACTIVE', startTime: newStartTime, remainingAtPowerLoss: null },
        });

        // Re-activate hardware
        adbService.switchToHdmi(session.station.adbAddress).catch(() => {});
        adbService.setBrightness(session.station.adbAddress, 100).catch(() => {});
        tuyaService.setSyncMode(session.station.tuyaDeviceId).catch(() => {});

        emitStationUpdate(session.stationId, { status: 'ACTIVE' });

        return session.id;
      })
    );

    await prisma.securityEvent.create({
      data: {
        type: 'POWER_RESTORE',
        description: `Power-restore: ${restored.length} session(s) resumed`,
        staffPin: req.staff!.pin,
        metadata: { sessionIds: restored, restoredAt: now.toISOString() },
      },
    });

    emitPowerStatus('normal');

    res.json({ sessionsRestored: restored.length, timestamp: now.toISOString() });
  } catch (err) {
    console.error('[system] POST /power-restore error:', err);
    res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});

// ── GET /api/system/internet ──────────────────────────────────────────────────
// Returns current internet route and recent failover history.

router.get('/internet', requireOwner, (_req: Request, res: Response) => {
  res.json({
    route: internetService.getCurrentRoute(),
    history: internetService.getFailoverHistory(24),
  });
});

export default router;
