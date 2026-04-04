const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

async function apiFetch<T>(path: string, pin?: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (pin) headers['x-staff-pin'] = pin;
  const res = await fetch(`${API_BASE}${path}`, { cache: 'no-store', ...init, headers });
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StaffLoginResponse {
  id: number;
  name: string;
  role: 'STAFF' | 'OWNER';
}

export interface Station {
  id: number;
  name: string;
  status: 'AVAILABLE' | 'ACTIVE' | 'PENDING' | 'FAULT';
  currentSessionId: number | null;
}

export interface StationRevenue {
  stationId: number;
  name: string;
  revenue: number;
}

export interface ActiveSession {
  id: number;
  stationId: number;
  stationName: string;
  durationMinutes: number;
  startTime: string;
}

export interface RecentTransaction {
  id: number;
  amount: number;
  method: string;
  status: string;
  createdAt: string;
  stationName: string;
}

export interface DashboardData {
  todayRevenue: number;
  todayRevenueByStation: StationRevenue[];
  activeSessions: ActiveSession[];
  recentTransactions: RecentTransaction[];
  recentEvents: SecurityEvent[];
}

export interface SessionHistoryEntry {
  id: number;
  stationId: number;
  staffPin: string;
  startTime: string;
  endTime: string | null;
  durationMinutes: number;
  status: string;
  authCode: string;
  station: { id: number; name: string };
  transactions: {
    id: number;
    amount: number;
    method: string;
    status: string;
    createdAt: string;
    staffPin: string;
  }[];
}

export interface SecurityEvent {
  id: number;
  type: string;
  description: string;
  staffPin: string | null;
  stationId: number | null;
  timestamp: string;
  metadata: Record<string, unknown> | null;
  clipsGenerated: boolean;
}

export interface SecurityCamera {
  id: number;
  name: string;
  rtspUrl: string;
  isOnline: boolean;
  location: string;
}

export interface HealthResponse {
  status: string;
  timestamp: string;
}

export interface HardwareStatus {
  stations: {
    stationId: number;
    name: string;
    tvConnected: boolean;
    ledsConnected: boolean;
    adbAddress: string;
    tuyaDeviceId: string;
  }[];
}

export type InternetRoute = 'primary' | '4g' | 'offline';

export interface FailoverEvent {
  timestamp: string;
  from: InternetRoute;
  to: InternetRoute;
  reason: string;
}

export interface InternetStatus {
  route: InternetRoute;
  history: FailoverEvent[];
}

export interface Settings {
  id: number;
  baseHourlyRate: number;
  openingTime: string;
  closingTime: string;
  replayTTLMinutes: number;
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export function staffLogin(pin: string): Promise<StaffLoginResponse> {
  return apiFetch<StaffLoginResponse>('/api/staff/login', undefined, {
    method: 'POST',
    body: JSON.stringify({ pin }),
  });
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export function getDashboard(pin: string): Promise<DashboardData> {
  return apiFetch<DashboardData>('/api/dashboard', pin);
}

export function getStations(pin: string): Promise<Station[]> {
  return apiFetch<Station[]>('/api/stations', pin);
}

// ── Session History ───────────────────────────────────────────────────────────

export function getSessions(pin: string, params?: { status?: string; stationId?: number }): Promise<SessionHistoryEntry[]> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set('status', params.status);
  if (params?.stationId) qs.set('stationId', String(params.stationId));
  const query = qs.toString() ? `?${qs}` : '';
  return apiFetch<SessionHistoryEntry[]>(`/api/sessions${query}`, pin);
}

// ── Security Events ───────────────────────────────────────────────────────────

export function getEvents(pin: string, params?: { type?: string; stationId?: number; limit?: number }): Promise<SecurityEvent[]> {
  const qs = new URLSearchParams();
  if (params?.type) qs.set('type', params.type);
  if (params?.stationId) qs.set('stationId', String(params.stationId));
  if (params?.limit) qs.set('limit', String(params.limit));
  const query = qs.toString() ? `?${qs}` : '';
  return apiFetch<SecurityEvent[]>(`/api/events${query}`, pin);
}

export function getCameras(pin: string): Promise<SecurityCamera[]> {
  return apiFetch<SecurityCamera[]>('/api/security/cameras', pin);
}

// ── Health + System ───────────────────────────────────────────────────────────

export function getHealth(): Promise<HealthResponse> {
  return apiFetch<HealthResponse>('/api/health');
}

export function getHardwareStatus(pin: string): Promise<HardwareStatus> {
  return apiFetch<HardwareStatus>('/api/hardware/status', pin);
}

export function restartService(pin: string, service: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>('/api/system/restart-service', pin, {
    method: 'POST',
    body: JSON.stringify({ service }),
  });
}

export function getInternetStatus(pin: string): Promise<InternetStatus> {
  return apiFetch<InternetStatus>('/api/system/internet', pin);
}

export function getSettings(pin?: string): Promise<Settings> {
  return apiFetch<Settings>('/api/settings', pin);
}

export { API_BASE };
