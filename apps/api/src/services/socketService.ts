import { Server } from 'socket.io';

let io: Server | null = null;

export function initSocketService(server: Server) {
  io = server;
}

export function emitStationUpdate(stationId: number, data: object) {
  io?.emit('station:updated', { stationId, ...data });
}

export function emitSessionTick(stationId: number, remainingSeconds: number) {
  io?.emit('session:tick', { stationId, remainingSeconds });
}

export function emitSessionWarning(stationId: number) {
  io?.emit('session:warning', { stationId });
}

export function emitSessionEnded(stationId: number, sessionId: number) {
  io?.emit('session:ended', { stationId, sessionId });
}

export function emitGameEnded(stationId: number, gameId: number) {
  io?.to(`station:${stationId}`).emit('game:ended', { stationId, gameId });
}

export function emitReplayReady(stationId: number, sessionId: number, authCode: string) {
  io?.to(`station:${stationId}`).emit('replay:ready', { stationId, sessionId, authCode });
}

export function emitPaymentConfirmed(sessionId: number, transactionId: number) {
  io?.emit('payment:confirmed', { sessionId, transactionId });
}

export function emitPaymentTimeout(sessionId: number) {
  io?.emit('payment:timeout', { sessionId });
}

export function emitPowerStatus(status: 'normal' | 'save') {
  io?.emit('power:status', { status });
}

export function emitQueueUpdated(stationId: number) {
  io?.emit('queue:updated', { stationId });
}
