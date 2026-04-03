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
  currentSession: { id: number } | null;
  queueCount: number;
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

export interface Transaction {
  id: number;
  amount: number;
  method: string;
  status: string;
}

export interface SessionDetail extends Session {
  startTime: string;
  transactions: Transaction[];
}

export function getStations(pin?: string): Promise<Station[]> {
  return apiFetch<Station[]>('/api/stations', pin);
}

export function getSettings(pin?: string): Promise<Settings> {
  return apiFetch<Settings>('/api/settings', pin);
}

export function getSession(id: number, pin: string): Promise<SessionDetail> {
  return apiFetch<SessionDetail>(`/api/sessions/${id}`, pin);
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

export function endSession(id: number, pin: string): Promise<Session> {
  return apiFetch<Session>(`/api/sessions/${id}/end`, pin, { method: 'PATCH' });
}

export function extendSession(
  id: number,
  pin: string,
  body: { durationMinutes: number; paymentMethod: string }
): Promise<Session> {
  return apiFetch<Session>(`/api/sessions/${id}/extend`, pin, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function grantFreeTime(
  id: number,
  pin: string,
  body: { durationMinutes: number }
): Promise<Session> {
  return apiFetch<Session>(`/api/sessions/${id}/grant-free-time`, pin, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function transferSession(
  id: number,
  pin: string,
  body: { targetStationId: number }
): Promise<Session> {
  return apiFetch<Session>(`/api/sessions/${id}/transfer`, pin, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export interface QueueEntry {
  id: number;
  stationId: number;
  position: number;
  durationMinutes: number;
  status: string;
}

export interface DashboardResponse {
  todayRevenue: number;
  recentTransactions: {
    id: number;
    amount: number;
    method: string;
    status: string;
    createdAt: string;
    stationName: string;
  }[];
}

export function getDashboard(pin: string): Promise<DashboardResponse> {
  return apiFetch<DashboardResponse>('/api/dashboard', pin);
}

export function addToQueue(
  pin: string,
  body: { stationId: number; durationMinutes: number }
): Promise<QueueEntry> {
  return apiFetch<QueueEntry>('/api/queue', pin, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function getQueue(stationId: number, pin?: string): Promise<QueueEntry[]> {
  return apiFetch<QueueEntry[]>(`/api/queue/${stationId}`, pin);
}

export interface HardwareStationStatus {
  stationId: number;
  tvConnected: boolean;
  ledsConnected: boolean;
}

export function getHardwareStatus(pin: string): Promise<{ stations: HardwareStationStatus[] }> {
  return apiFetch<{ stations: HardwareStationStatus[] }>('/api/hardware/status', pin);
}

export function checkMpesaAvailability(): Promise<{ mpesaAvailable: boolean }> {
  return apiFetch<{ mpesaAvailable: boolean }>('/api/payments/status');
}

export function initiateMpesaPayment(
  pin: string,
  body: { sessionId: number; phoneNumber: string; amount: number }
): Promise<{ transactionId: number; checkoutRequestId: string }> {
  return apiFetch<{ transactionId: number; checkoutRequestId: string }>(
    '/api/payments/mpesa/initiate',
    pin,
    { method: 'POST', body: JSON.stringify(body) }
  );
}
