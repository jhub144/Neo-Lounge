import { useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { Station } from '@/lib/api';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

export interface SessionTickData {
  stationId: number;
  remainingSeconds: number;
}

export function useSocket(callbacks?: {
  onStationUpdated?: (stationId: number) => void;
  onQueueUpdated?: () => void;
  onSessionEnded?: (stationId: number) => void;
}) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [ticks, setTicks] = useState<Record<number, number>>({});
  const [warnings, setWarnings] = useState<Record<number, boolean>>({});

  const callbacksRef = useRef(callbacks);
  useEffect(() => {
    callbacksRef.current = callbacks;
  }, [callbacks]);

  useEffect(() => {
    let url = API_BASE;
    if (typeof window !== 'undefined') {
      const { hostname, origin } = window.location;
      if (hostname.includes('github.dev') || hostname.includes('app.github.dev') || hostname.includes('githubpreview.dev')) {
         url = origin.replace('-3001', '-3000').replace(':3001', ':3000');
      } else if (hostname !== 'localhost') {
         url = origin.replace(':3001', ':3000');
      }
    }
    const s = io(url);
    setSocket(s);

    s.on('station:updated', (data: { stationId: number }) => {
      callbacksRef.current?.onStationUpdated?.(data.stationId);
    });

    s.on('queue:updated', () => {
      callbacksRef.current?.onQueueUpdated?.();
    });

    s.on('session:tick', (data: SessionTickData) => {
      setTicks((prev) => ({ ...prev, [data.stationId]: data.remainingSeconds }));
    });

    s.on('session:warning', (data: { stationId: number }) => {
      setWarnings((prev) => ({ ...prev, [data.stationId]: true }));
    });

    s.on('session:ended', (data: { stationId: number }) => {
      setTicks((prev) => {
        const next = { ...prev };
        delete next[data.stationId];
        return next;
      });
      setWarnings((prev) => {
        const next = { ...prev };
        delete next[data.stationId];
        return next;
      });
      callbacksRef.current?.onSessionEnded?.(data.stationId);
    });

    return () => {
      s.disconnect();
    };
  }, []);

  return { socket, ticks, warnings };
}
