import { io, Socket } from 'socket.io-client';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(API_BASE, {
      autoConnect: false,
      reconnection: true,
      reconnectionDelay: 3000,
      reconnectionAttempts: Infinity,
    });
  }
  return socket;
}
