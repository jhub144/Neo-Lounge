const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

export interface Station {
  id: number;
  name: string;
  status: 'AVAILABLE' | 'ACTIVE' | 'PENDING' | 'FAULT';
  currentSessionId: number | null;
  adbAddress: string;
  tuyaDeviceId: string;
  captureDevice: string;
}

export interface Settings {
  id: number;
  baseHourlyRate: number;
  openingTime: string;
  closingTime: string;
  replayTTLMinutes: number;
}

export function getStations(): Promise<Station[]> {
  return apiFetch<Station[]>('/api/stations');
}

export function getSettings(): Promise<Settings> {
  return apiFetch<Settings>('/api/settings');
}
