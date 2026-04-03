const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type StationStatus = 'AVAILABLE' | 'ACTIVE' | 'PENDING' | 'FAULT';

export interface Settings {
  id: number;
  baseHourlyRate: number;
  openingTime: string;
  closingTime: string;
}

export interface Game {
  id: number;
  sessionId: number;
  startTime: string;
  endTime: string | null;
  endMethod: string | null;
}

export interface ReplayClip {
  id: number;
  gameId: number;
  filePath: string;
  triggerType: string;
  triggerTimestamp: string;
}

export interface Session {
  id: number;
  stationId: number;
  staffPin: string;
  startTime: string;
  endTime: string | null;
  durationMinutes: number;
  authCode: string;
  status: string;
  games: Game[];
}

export interface StationDetail {
  id: number;
  name: string;
  status: StationStatus;
  currentSessionId: number | null;
  currentSession: Session | null;
  queueCount: number;
}

// ── API Functions ─────────────────────────────────────────────────────────────

export function getStation(id: number): Promise<StationDetail> {
  return apiFetch<StationDetail>(`/api/stations/${id}`);
}

export function getSettings(): Promise<Settings> {
  return apiFetch<Settings>('/api/settings');
}

export function getSession(id: number): Promise<Session> {
  return apiFetch<Session>(`/api/sessions/${id}`);
}

export function endGame(gameId: number): Promise<Game> {
  return apiFetch<Game>(`/api/games/${gameId}/end`, { method: 'POST' });
}

export function extendSession(
  id: number,
  pin: string,
  body: { durationMinutes: number; paymentMethod: string }
): Promise<Session> {
  return apiFetch<Session>(`/api/sessions/${id}/extend`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'x-staff-pin': pin },
    body: JSON.stringify(body),
  });
}

export function initiateMpesaPayment(
  pin: string,
  body: { sessionId: number; phoneNumber: string; amount: number }
): Promise<{ transactionId: number; checkoutRequestId: string }> {
  return apiFetch<{ transactionId: number; checkoutRequestId: string }>(
    '/api/payments/mpesa/initiate',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-staff-pin': pin },
      body: JSON.stringify(body),
    }
  );
}

/** Calculate price using same formula as spec: Math.round(baseHourlyRate / 60 * durationMinutes) */
export function calculatePrice(durationMinutes: number, baseHourlyRate: number): number {
  return Math.round((baseHourlyRate / 60) * durationMinutes);
}
