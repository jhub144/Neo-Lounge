'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { type ReplayResponse, getReplaysByAuthCode, getDownloadUrl } from '@/lib/api';
import { getSocket } from '@/lib/socket';

interface ReplayListProps {
  data: ReplayResponse;
  onBack: () => void;
  onRefresh: () => void;
  authCode: string;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-KE', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-KE', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(minutes: number): string {
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hrs > 0) return `${hrs}h ${mins}m`;
  return `${mins}m`;
}

function timeRemaining(expiresAt: string): string {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return 'Expired';
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  if (hrs > 0) return `${hrs}h ${rem}m remaining`;
  return `${mins}m remaining`;
}

export default function ReplayList({ data: initialData, onBack, authCode }: ReplayListProps) {
  const [data, setData] = useState<ReplayResponse>(initialData);
  const [expiryText, setExpiryText] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isSessionActive = data.status === 'ACTIVE';
  const hasExpired = data.replaysExpired;
  const hasAnyClips = data.games.some((g) => g.clips.length > 0);

  // Auto-refresh every 10s while session is active
  useEffect(() => {
    if (isSessionActive) {
      refreshTimerRef.current = setInterval(async () => {
        try {
          const fresh = await getReplaysByAuthCode(authCode);
          setData(fresh);
        } catch {
          // silently fail
        }
      }, 10000);
    }

    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    };
  }, [isSessionActive, authCode]);

  // WebSocket for replay:ready
  useEffect(() => {
    const socket = getSocket();
    socket.connect();

    const onReplayReady = async () => {
      try {
        const fresh = await getReplaysByAuthCode(authCode);
        setData(fresh);
      } catch {
        // silently fail
      }
    };

    socket.on('replay:ready', onReplayReady);

    return () => {
      socket.off('replay:ready', onReplayReady);
      socket.disconnect();
    };
  }, [authCode]);

  // Expiry countdown
  useEffect(() => {
    if (!data.expiresAt || hasExpired) {
      setExpiryText(hasExpired ? 'Expired' : '');
      return;
    }

    const update = () => setExpiryText(timeRemaining(data.expiresAt!));
    update();
    const interval = setInterval(update, 30000);
    return () => clearInterval(interval);
  }, [data.expiresAt, hasExpired]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const fresh = await getReplaysByAuthCode(authCode);
      setData(fresh);
    } catch {
      // keep existing data
    } finally {
      setRefreshing(false);
    }
  }, [authCode]);

  // ── Expired State ────────────────────────────────────────────────────────────
  if (hasExpired) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
        <div className="mb-4 w-16 h-16 rounded-full bg-danger/10 flex items-center justify-center">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-danger">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        </div>
        <h2 className="text-xl font-bold mb-2">Replays Expired</h2>
        <p className="text-sm text-muted max-w-xs">
          These replays are no longer available. Replay clips are kept for a limited time after your session ends.
        </p>
        <button onClick={onBack} className="mt-6 px-6 py-2.5 rounded-xl text-sm font-semibold bg-card border border-border hover:bg-card-hover transition-colors">
          ← Enter Another Code
        </button>
      </div>
    );
  }

  // ── Main Replay List ─────────────────────────────────────────────────────────
  return (
    <div className="flex flex-1 flex-col min-h-full">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-xl border-b border-border px-4 py-3">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <button onClick={onBack} className="p-2 -ml-2 rounded-lg hover:bg-card transition-colors" aria-label="Back">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <h1 className="text-sm font-bold tracking-tight">Your Replays</h1>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-2 -mr-2 rounded-lg hover:bg-card transition-colors disabled:opacity-40"
            aria-label="Refresh"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={refreshing ? 'animate-spin' : ''}>
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
          </button>
        </div>
      </header>

      {/* Session Info Card */}
      <div className="px-4 pt-4 pb-2 max-w-lg mx-auto w-full fade-in">
        <div className="rounded-2xl bg-card border border-border p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent">
                  <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                  <line x1="8" y1="21" x2="16" y2="21" />
                  <line x1="12" y1="17" x2="12" y2="21" />
                </svg>
              </div>
              <span className="font-semibold text-sm">{data.stationName}</span>
            </div>
            {isSessionActive && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-success/10 text-success text-xs font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                Live
              </span>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-xs text-muted mb-0.5">Date</p>
              <p className="text-sm font-medium">{formatDate(data.startTime)}</p>
            </div>
            <div>
              <p className="text-xs text-muted mb-0.5">Time</p>
              <p className="text-sm font-medium">{formatTime(data.startTime)}</p>
            </div>
            <div>
              <p className="text-xs text-muted mb-0.5">Duration</p>
              <p className="text-sm font-medium">{formatDuration(data.durationMinutes)}</p>
            </div>
          </div>

          {/* Expiry countdown */}
          {expiryText && !hasExpired && (
            <div className="mt-3 pt-3 border-t border-border flex items-center justify-center gap-1.5 text-xs text-warning">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              Replays available for {expiryText}
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 px-4 pb-8 max-w-lg mx-auto w-full">
        {/* No clips state */}
        {!hasAnyClips && (
          <div className="mt-8 text-center fade-in">
            <div className="mb-4 w-14 h-14 rounded-full bg-card border border-border flex items-center justify-center mx-auto">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted">
                <polygon points="23 7 16 12 23 17 23 7" />
                <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
              </svg>
            </div>
            <h3 className="font-semibold text-sm mb-1">No replays yet</h3>
            <p className="text-xs text-muted max-w-xs mx-auto">
              {isSessionActive
                ? 'Clips will appear here automatically during gameplay. Keep playing!'
                : 'No replay clips were captured during this session.'}
            </p>
          </div>
        )}

        {/* Games with clips */}
        {hasAnyClips && (
          <div className="mt-4 space-y-6 stagger">
            {data.games.map((game, idx) => (
              <div key={game.id} className="space-y-3">
                {/* Game Header */}
                <div className="flex items-center gap-2">
                  <div className="flex items-center justify-center w-6 h-6 rounded-md bg-accent/15 text-accent text-xs font-bold">
                    {idx + 1}
                  </div>
                  <h3 className="text-sm font-semibold">
                    Game {idx + 1}
                  </h3>
                  <span className="text-xs text-muted">
                    {formatTime(game.startTime)}
                    {game.endTime ? ` – ${formatTime(game.endTime)}` : ' – ongoing'}
                  </span>
                </div>

                {/* Highlight Reel Download — check first clip for stitched reel path */}
                {game.clips.some((c) => c.stitchedReelPath) && (
                  <a
                    href={getDownloadUrl(game.clips.find((c) => c.stitchedReelPath)!.stitchedReelPath!)}
                    download
                    className="btn-download btn-download-highlight w-full justify-center"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                    </svg>
                    Download Highlights
                  </a>
                )}

                {/* Clip List */}
                {game.clips.length > 0 ? (
                  <div className="space-y-2">
                    {game.clips.map((clip) => (
                      <div
                        key={clip.id}
                        className="rounded-xl bg-card border border-border p-3 flex items-center gap-3 transition-colors hover:bg-card-hover"
                      >
                        {/* Thumbnail placeholder */}
                        <div className="shrink-0 w-16 h-10 rounded-lg bg-border flex items-center justify-center">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted">
                            <polygon points="5 3 19 12 5 21 5 3" />
                          </svg>
                        </div>

                        {/* Clip Info */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {clip.triggerType === 'CROWD_ROAR' ? '🔊 Crowd Roar' :
                             clip.triggerType === 'WHISTLE' ? '📣 Whistle' :
                             clip.triggerType === 'MANUAL' ? '🎬 Manual Clip' :
                             clip.triggerType}
                          </p>
                          <p className="text-xs text-muted">
                            {formatTime(clip.triggerTimestamp)}
                          </p>
                        </div>

                        {/* Download */}
                        <a
                          href={getDownloadUrl(clip.filePath)}
                          download
                          className="btn-download shrink-0"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="7 10 12 15 17 10" />
                            <line x1="12" y1="15" x2="12" y2="3" />
                          </svg>
                          <span className="hidden sm:inline">Download</span>
                        </a>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted pl-8">No clips captured for this game</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
