import prisma from '../lib/prisma';
import {
  emitSessionTick,
  emitSessionWarning,
  emitSessionEnded,
  emitStationUpdate,
} from './socketService';

async function tick() {
  try {
    const sessions = await prisma.session.findMany({
      where: { status: 'ACTIVE' },
    });

    const now = Date.now();

    for (const session of sessions) {
      const elapsedSeconds = Math.floor((now - new Date(session.startTime).getTime()) / 1000);
      const totalSeconds = session.durationMinutes * 60;
      const remainingSeconds = totalSeconds - elapsedSeconds;

      if (remainingSeconds <= 0) {
        // Auto-end session
        await prisma.game.updateMany({
          where: { sessionId: session.id, endTime: null },
          data: { endTime: new Date(), endMethod: 'SESSION_END' },
        });

        await prisma.session.update({
          where: { id: session.id },
          data: { status: 'COMPLETED', endTime: new Date() },
        });

        await prisma.station.update({
          where: { id: session.stationId },
          data: { status: 'AVAILABLE', currentSessionId: null },
        });

        await prisma.securityEvent.create({
          data: {
            type: 'SESSION_END',
            description: `Session ${session.id} auto-ended on station ${session.stationId}`,
            stationId: session.stationId,
          },
        });

        emitStationUpdate(session.stationId, { status: 'AVAILABLE', currentSessionId: null });
        emitSessionEnded(session.stationId, session.id);
      } else {
        emitSessionTick(session.stationId, remainingSeconds);

        if (remainingSeconds <= 120) {
          emitSessionWarning(session.stationId);
        }
      }
    }
  } catch (err) {
    console.error('[timerService] tick error:', err);
  }
}

export function startTimerService() {
  setInterval(tick, 1000);
}
