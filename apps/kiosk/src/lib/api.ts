const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

async function apiFetch<T>(path: string, pin?: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (pin) headers['x-staff-pin'] = pin;
  const res = await fetch(`${API_BASE}${path}`, { cache: 'no-store', ...init, headers });
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

export interface Session {
  id: number;
  stationId: number;
  durationMinutes: number;
  authCode: string;
  status: string;
}

export function getStations(pin?: string): Promise<Station[]> {
  return apiFetch<Station[]>('/api/stations', pin);
}

export function getSettings(pin?: string): Promise<Settings> {
  return apiFetch<Settings>('/api/settings', pin);
}

export function createSession(
  pin: string,
  body: { stationId: number; durationMinutes: number; paymentMethod: string }
): Promise<Session> {
  return apiFetch<Session>('/api/sessions', pin, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
