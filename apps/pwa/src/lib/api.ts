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

// ── Types (matching actual API response from /api/replays/:authCode) ─────────

export interface ReplayClip {
  id: number;
  filePath: string;
  triggerType: string;
  triggerTimestamp: string;
  createdAt: string;
  stitchedReelPath: string | null;
}

export interface GameWithClips {
  id: number;
  startTime: string;
  endTime: string | null;
  endMethod: string | null;
  clips: ReplayClip[];
}

export interface ReplayResponse {
  sessionId: number;
  authCode: string;
  stationName: string;
  startTime: string;
  endTime: string | null;
  durationMinutes: number;
  status: string;
  replaysExpired: boolean;
  expiresAt: string | null;
  games: GameWithClips[];
}

// ── API Functions ─────────────────────────────────────────────────────────────

export function getReplaysByAuthCode(authCode: string): Promise<ReplayResponse> {
  return apiFetch<ReplayResponse>(`/api/replays/${authCode}`);
}

export function getDownloadUrl(filePath: string): string {
  return `${API_BASE}/replays/download/${encodeURIComponent(filePath)}`;
}

export { API_BASE };
