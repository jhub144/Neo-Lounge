import { io, Socket } from 'socket.io-client';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

// Singleton socket — one connection per browser tab
let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(API_BASE, {
      reconnection: true,
      reconnectionDelay: 3000,
      reconnectionDelayMax: 3000,
      reconnectionAttempts: Infinity,
      transports: ['websocket', 'polling'],
    });
  }
  return socket;
}

export function joinStation(stationId: number): void {
  getSocket().emit('join:station', stationId);
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}
