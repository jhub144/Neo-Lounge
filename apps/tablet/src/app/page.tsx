'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  getStation,
  getSettings,
  endGame,
  extendSession,
  initiateMpesaPayment,
  calculatePrice,
  type Session,
  type Game,
  type Settings,
  type StationDetail,
} from '@/lib/api';
import { getSocket, joinStation } from '@/lib/socket';

// ── Config ────────────────────────────────────────────────────────────────────

const STATION_ID = parseInt(process.env.NEXT_PUBLIC_STATION_ID ?? '1', 10);
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

// ── State machine types ───────────────────────────────────────────────────────

type TabletState =
  | 'connecting'
  | 'idle'
  | 'active'
  | 'warning'
  | 'gameEnd'
  | 'sessionEnd';

type ExtendPaymentStep = 'pick' | 'cashWait' | 'mpesaPhone' | 'mpesaWait' | 'mpesaTimeout';

// ── Helpers ───────────────────────────────────────────────────────────────────

function pad(n: number): string {
  return String(Math.max(0, n)).padStart(2, '0');
}

function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${pad(m)}:${pad(s)}`;
}

// ── Tap-gesture hook (5 taps to open settings) ────────────────────────────────

function useTapGesture(threshold = 5, windowMs = 2000, onGesture: () => void) {
  const taps = useRef<number[]>([]);
  return useCallback(() => {
    const now = Date.now();
    taps.current = [...taps.current.filter((t) => now - t < windowMs), now];
    if (taps.current.length >= threshold) {
      taps.current = [];
      onGesture();
    }
  }, [threshold, windowMs, onGesture]);
}

// ── Main component ────────────────────────────────────────────────────────────

export default function TabletPage() {
  // Connection
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [apiReachable, setApiReachable] = useState<boolean | null>(null);

  // App state
  const [tabletState, setTabletState] = useState<TabletState>('connecting');
  const [stationName, setStationName] = useState(`Station ${STATION_ID}`);
  const [session, setSession] = useState<Session | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [activeGame, setActiveGame] = useState<Game | null>(null);

  // Game-end / session-end
  const [endedGameId, setEndedGameId] = useState<number | null>(null);
  const [sessionAuthCode, setSessionAuthCode] = useState('');
  const [sessionId, setSessionId] = useState<number | null>(null);
  const autoReturnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Extend flow
  const [showExtend, setShowExtend] = useState(false);
  const [extendStep, setExtendStep] = useState<ExtendPaymentStep>('pick');
  const [extendDuration, setExtendDuration] = useState(0);
  const [extendPrice, setExtendPrice] = useState(0);
  const [mpesaPhone, setMpesaPhone] = useState('');
  const [mpesaPhoneError, setMpesaPhoneError] = useState('');
  const [mpesaSending, setMpesaSending] = useState(false);

  // Ref so socket handlers always see the current sessionId (avoids stale closure)
  const sessionIdRef = useRef<number | null>(null);
  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);

  // Hidden settings
  const [showSettings, setShowSettings] = useState(false);
  const [settingsStationId, setSettingsStationId] = useState(String(STATION_ID));
  const [settingsApiUrl, setSettingsApiUrl] = useState(API_BASE);

  // ── Settings fetch ─────────────────────────────────────────────────────────

  useEffect(() => {
    getSettings()
      .then(setSettings)
      .catch(() => {});
  }, []);

  // ── Initial station probe ──────────────────────────────────────────────────

  const probeStation = useCallback(async () => {
    try {
      const st: StationDetail = await getStation(STATION_ID);
      setApiReachable(true);
      setStationName(st.name);
      if (st.status === 'ACTIVE' && st.currentSession) {
        setSession(st.currentSession);
        setSessionId(st.currentSession.id);
        setSessionAuthCode(st.currentSession.authCode);
        const firstGame = st.currentSession.games.find((g) => !g.endTime) ?? null;
        setActiveGame(firstGame);
        const elapsed = Math.floor(
          (Date.now() - new Date(st.currentSession.startTime).getTime()) / 1000
        );
        const total = st.currentSession.durationMinutes * 60;
        setRemainingSeconds(Math.max(0, total - elapsed));
        setTabletState('active');
      } else {
        setTabletState('idle');
      }
    } catch {
      setApiReachable(false);
      // Retry every 5 seconds
      setTimeout(probeStation, 5000);
    }
  }, []);

  useEffect(() => {
    probeStation();
  }, [probeStation]);

  // ── WebSocket ──────────────────────────────────────────────────────────────

  useEffect(() => {
    const socket = getSocket();

    socket.on('connect', () => {
      setConnected(true);
      setReconnecting(false);
      joinStation(STATION_ID);
    });

    socket.on('disconnect', () => {
      setConnected(false);
      setReconnecting(true);
    });

    socket.on('connect_error', () => {
      setReconnecting(true);
    });

    // Station status changes
    socket.on(
      'station:updated',
      (data: { stationId: number; status: string; currentSessionId: number | null }) => {
        if (data.stationId !== STATION_ID) return;
        console.log('[tablet] station:updated', data);

        if (data.status === 'ACTIVE') {
          // Fetch full session on next tick to let API settle
          setTimeout(() => {
            getStation(STATION_ID)
              .then((st) => {
                if (st.currentSession) {
                  setSession(st.currentSession);
                  setSessionId(st.currentSession.id);
                  setSessionAuthCode(st.currentSession.authCode);
                  const firstGame = st.currentSession.games.find((g) => !g.endTime) ?? null;
                  setActiveGame(firstGame);
                  const elapsed = Math.floor(
                    (Date.now() - new Date(st.currentSession.startTime).getTime()) / 1000
                  );
                  const total = st.currentSession.durationMinutes * 60;
                  setRemainingSeconds(Math.max(0, total - elapsed));
                }
              })
              .catch(() => {});
          }, 500);
          setTabletState('active');
        } else if (data.status === 'AVAILABLE') {
          returnToIdle();
        }
      }
    );

    // Live timer tick
    socket.on('session:tick', (data: { stationId: number; remainingSeconds: number }) => {
      if (data.stationId !== STATION_ID) return;
      setRemainingSeconds(data.remainingSeconds);
    });

    // 2-minute warning
    socket.on('session:warning', (data: { stationId: number }) => {
      if (data.stationId !== STATION_ID) return;
      setTabletState('warning');
    });

    // Session ended
    socket.on('session:ended', (data: { stationId: number; sessionId: number }) => {
      if (data.stationId !== STATION_ID) return;
      setSessionId(data.sessionId);
      clearAutoReturn();
      autoReturnTimer.current = setTimeout(() => {
        returnToIdle();
      }, 60_000);
      setTabletState('sessionEnd');
    });

    // Game ended (from YAMNet or manual)
    socket.on('game:ended', (data: { stationId: number; gameId: number }) => {
      if (data.stationId !== STATION_ID) return;
      triggerGameEnd(data.gameId);
    });

    // Replay ready — update QR if we're showing game end state
    socket.on(
      'replay:ready',
      (data: { stationId: number; sessionId: number; authCode: string }) => {
        if (data.stationId !== STATION_ID) return;
        setSessionAuthCode(data.authCode);
      }
    );

    // Payment confirmed — only act if it matches THIS station's session
    socket.on('payment:confirmed', (data: { sessionId: number }) => {
      if (data.sessionId === sessionIdRef.current) {
        setShowExtend(false);
        setExtendStep('pick');
        setMpesaPhone('');
        setMpesaPhoneError('');
      }
    });

    // Payment timeout — only act if it matches THIS station's session
    socket.on('payment:timeout', (data: { sessionId: number }) => {
      if (data.sessionId === sessionIdRef.current) {
        setExtendStep('mpesaTimeout');
      }
    });

    // power:status
    socket.on('power:status', (data: { status: string }) => {
      if (data.status === 'save') {
        // Show power outage overlay — reuse a simple state
        console.log('[tablet] power:status save — session time preserved');
      } else {
        console.log('[tablet] power:status normal — resuming');
      }
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('connect_error');
      socket.off('station:updated');
      socket.off('session:tick');
      socket.off('session:warning');
      socket.off('session:ended');
      socket.off('game:ended');
      socket.off('replay:ready');
      socket.off('payment:confirmed');
      socket.off('payment:timeout');
      socket.off('power:status');
    };
  }, []);

  // ── Helpers ────────────────────────────────────────────────────────────────

  function clearAutoReturn() {
    if (autoReturnTimer.current) {
      clearTimeout(autoReturnTimer.current);
      autoReturnTimer.current = null;
    }
  }

  function returnToIdle() {
    clearAutoReturn();
    setTabletState('idle');
    setSession(null);
    setSessionId(null);
    setActiveGame(null);
    setRemainingSeconds(0);
    setShowExtend(false);
    setExtendStep('pick');
  }

  function triggerGameEnd(gameId: number) {
    setEndedGameId(gameId);
    clearAutoReturn();
    autoReturnTimer.current = setTimeout(() => {
      setTabletState(session?.status === 'ACTIVE' ? 'active' : 'idle');
    }, 30_000);
    setTabletState('gameEnd');
  }

  async function handleEndGame() {
    if (!activeGame) {
      console.warn('[tablet] No active game to end');
      return;
    }
    try {
      const ended = await endGame(activeGame.id);
      setActiveGame(null);
      triggerGameEnd(ended.id);
    } catch (err) {
      console.error('[tablet] endGame failed:', err);
    }
  }

  function dismissGameEnd() {
    clearAutoReturn();
    setTabletState(session ? 'active' : 'idle');
  }

  // ── Extend flow helpers ────────────────────────────────────────────────────

  function openExtend(duration: number) {
    const rate = settings?.baseHourlyRate ?? 300;
    setExtendDuration(duration);
    setExtendPrice(calculatePrice(duration, rate));
    setExtendStep('pick');
    setShowExtend(true);
  }

  function selectCash() {
    setExtendStep('cashWait');
  }

  function selectMpesa() {
    setExtendStep('mpesaPhone');
  }

  async function sendMpesa() {
    setMpesaPhoneError('');
    const KENYAN_PHONE_RE = /^(07\d{8}|254\d{9}|\+254\d{9})$/;
    if (!KENYAN_PHONE_RE.test(mpesaPhone.trim())) {
      setMpesaPhoneError('Enter a valid Kenyan number: 07XX XXX XXX or +254…');
      return;
    }
    if (!session?.id || !session?.staffPin) return;

    setMpesaSending(true);
    try {
      // Increment session duration (creates no transaction for MPESA — initiate handles it)
      await extendSession(session.id, session.staffPin, {
        durationMinutes: extendDuration,
        paymentMethod: 'MPESA',
      });
      // Send STK push to customer's phone
      await initiateMpesaPayment(session.staffPin, {
        sessionId: session.id,
        phoneNumber: mpesaPhone.trim(),
        amount: extendPrice,
      });
      setExtendStep('mpesaWait');
    } catch (err) {
      setMpesaPhoneError(err instanceof Error ? err.message : 'Failed to send M-Pesa request');
    } finally {
      setMpesaSending(false);
    }
  }

  function retryMpesa() {
    setExtendStep('mpesaPhone');
  }

  function cancelExtend() {
    setShowExtend(false);
    setExtendStep('pick');
    setMpesaPhone('');
    setMpesaPhoneError('');
    setMpesaSending(false);
  }

  // ── Tap gesture for hidden settings ───────────────────────────────────────

  const handleStationNameTap = useTapGesture(5, 2000, () => setShowSettings(true));

  function applySettings() {
    setShowSettings(false);
    window.location.reload();
  }

  // ── QR URL helper ──────────────────────────────────────────────────────────

  function buildQrUrl(gameId?: number | null) {
    const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
    const base = `http://${host}:3003/replays?auth=${sessionAuthCode}`;
    return gameId ? `${base}&game=${gameId}` : base;
  }

  // ── Render: connecting ─────────────────────────────────────────────────────

  if (tabletState === 'connecting' && apiReachable === false) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-[#0F172A] gap-6">
        <div className="w-10 h-10 rounded-full border-4 border-blue-500 border-t-transparent animate-spin" />
        <p className="text-gray-400 text-xl font-light tracking-wide">Connecting to server...</p>
        <p className="text-gray-600 text-sm">
          Tap the station name 5 times to configure settings
        </p>
        <button
          className="text-gray-600 text-xs mt-4 underline"
          onClick={() => setShowSettings(true)}
        >
          Settings
        </button>
        {renderSettingsOverlay()}
      </div>
    );
  }

  if (tabletState === 'connecting' && apiReachable === null) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-[#0F172A] gap-6">
        <div className="w-10 h-10 rounded-full border-4 border-blue-500 border-t-transparent animate-spin" />
        <p className="text-gray-400 text-xl font-light tracking-wide">Starting up...</p>
      </div>
    );
  }

  // ── Render: idle ───────────────────────────────────────────────────────────

  if (tabletState === 'idle') {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-[#0F172A] select-none">
        {/* Reconnecting banner */}
        {reconnecting && <ReconnectingBanner />}

        {/* Animated glow ring */}
        <div className="relative flex items-center justify-center mb-10">
          <div className="absolute w-72 h-72 rounded-full bg-blue-600/10 blur-3xl animate-pulse-glow" />
          <div className="absolute w-48 h-48 rounded-full bg-blue-500/15 blur-2xl animate-pulse-glow" style={{ animationDelay: '1s' }} />
          {/* PlayStation icon */}
          <svg className="relative w-24 h-24 text-blue-500 opacity-70" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8.985 2.596v17.548l3.915 1.261V6.688c0-.69.304-1.151.794-.991.636.181.76.814.76 1.505v5.515c2.441 1.054 4.281-.136 4.281-3.054 0-2.99-1.04-4.521-4.601-5.636L8.985 2.596zM2 17.852l4.947 1.687c1.198.41 1.377.971.396 1.27-.981.3-2.452.181-3.65-.228L2 20.063v2.01l.124.043S3.64 22.8 5.831 23c2.19.2 4.723-.27 4.723-.27v-2.21L2 17.493v.359zm12.062-.964c-1.455.136-2.982-.05-4.087-.45V18.7c1.136.37 2.578.49 3.938.44 3.035-.18 4.284-1.365 4.284-3.35 0-2.04-1.285-2.99-4.135-3.27z"/>
          </svg>
        </div>

        {/* Station name (tap 5 times for settings) */}
        <button
          id="station-name-idle"
          className="text-6xl font-bold text-white mb-3 tracking-tight cursor-default"
          onClick={handleStationNameTap}
        >
          {stationName}
        </button>

        <p className="text-blue-400 text-2xl font-light tracking-widest uppercase mb-2">
          PlayStation Lounge
        </p>
        <p className="text-gray-600 text-base font-light mt-6">
          Ready for the next session
        </p>

        {renderSettingsOverlay()}
      </div>
    );
  }

  // ── Render: gameEnd ────────────────────────────────────────────────────────

  if (tabletState === 'gameEnd') {
    const qrUrl = buildQrUrl(endedGameId);
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-[#0F172A] gap-8 animate-fade-in">
        {reconnecting && <ReconnectingBanner />}
        <h1 className="text-7xl font-black text-white tracking-tight">Game Over</h1>
        <div className="rounded-2xl bg-white p-5 shadow-2xl">
          <QRCodeSVG value={qrUrl} size={220} />
        </div>
        <p className="text-gray-300 text-2xl font-light text-center max-w-md leading-relaxed">
          Scan to download your replays
        </p>
        <p className="text-gray-600 text-sm font-mono">{qrUrl}</p>
        <button
          id="skip-game-end"
          className="mt-4 px-10 py-4 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xl font-semibold transition-colors"
          onClick={dismissGameEnd}
        >
          Skip
        </button>
      </div>
    );
  }

  // ── Render: sessionEnd ─────────────────────────────────────────────────────

  if (tabletState === 'sessionEnd') {
    const qrUrl = buildQrUrl(null);
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-[#0F172A] gap-8 animate-fade-in">
        {reconnecting && <ReconnectingBanner />}
        <h1 className="text-6xl font-black text-white tracking-tight">Session Complete</h1>
        <div className="rounded-2xl bg-white p-5 shadow-2xl">
          <QRCodeSVG value={qrUrl} size={220} />
        </div>
        <p className="text-gray-300 text-2xl font-light text-center max-w-md leading-relaxed">
          Scan to download your replays
        </p>
        <p className="text-amber-400 text-lg font-light">
          Available for 1 hour after your session
        </p>
        <button
          id="return-to-idle"
          className="mt-4 px-10 py-4 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xl font-semibold transition-colors"
          onClick={returnToIdle}
        >
          Done
        </button>
      </div>
    );
  }

  // ── Render: active / warning ───────────────────────────────────────────────

  const isWarning = tabletState === 'warning';
  const timerColor = isWarning ? 'text-amber-400' : 'text-white';
  const glowClass = isWarning ? 'animate-amber-pulse' : '';

  return (
    <div
      className={`fixed inset-0 flex flex-col items-center justify-between bg-[#0F172A] select-none ${glowClass}`}
    >
      {reconnecting && <ReconnectingBanner />}

      {/* Top row — station name (tap 5x for settings) */}
      <div className="pt-10 w-full flex items-center justify-center">
        <button
          id="station-name-active"
          className="text-2xl font-semibold text-gray-400 tracking-wide cursor-default"
          onClick={handleStationNameTap}
        >
          {stationName}
        </button>
      </div>

      {/* Centre — timer */}
      <div className="flex flex-col items-center gap-6">
        <div
          id="countdown-timer"
          className={`text-[clamp(6rem,25vw,14rem)] font-black tabular-nums leading-none tracking-tight ${timerColor} transition-colors duration-500`}
          aria-label={`Time remaining: ${formatTime(remainingSeconds)}`}
        >
          {formatTime(remainingSeconds)}
        </div>
        <p className={`text-3xl font-light tracking-wide ${isWarning ? 'text-amber-400' : 'text-gray-500'}`}>
          {isWarning ? 'Session ending soon' : 'Session active'}
        </p>
      </div>

      {/* Bottom row — Extend button + End Game button */}
      <div className="pb-12 w-full flex items-end justify-between px-12">
        {/* End Game — small, corner */}
        <button
          id="end-game-btn"
          className="px-7 py-4 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 text-lg font-semibold transition-colors border border-gray-700"
          onClick={handleEndGame}
        >
          End Game
        </button>

        {/* Extend Time — prominent */}
        <button
          id="extend-time-btn"
          className="px-14 py-6 rounded-2xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-3xl font-bold transition-colors shadow-lg shadow-blue-900/50"
          onClick={() => openExtend(10)}
        >
          Extend Time
        </button>
      </div>

      {/* Extend overlay */}
      {showExtend && renderExtendOverlay()}

      {renderSettingsOverlay()}
    </div>
  );

  // ── Extend overlay ─────────────────────────────────────────────────────────

  function renderExtendOverlay() {
    const rate = settings?.baseHourlyRate ?? 300;
    const durations = [10, 20, 30, 60];

    return (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 animate-fade-in backdrop-blur-sm">
        <div className="bg-[#1E293B] rounded-3xl p-8 w-full max-w-xl mx-4 shadow-2xl border border-white/10">

          {extendStep === 'pick' && (
            <>
              <h2 className="text-4xl font-bold text-white mb-8">Extend Session</h2>
              <div className="grid grid-cols-2 gap-4 mb-8">
                {durations.map((d) => {
                  const price = calculatePrice(d, rate);
                  return (
                    <button
                      key={d}
                      id={`extend-${d}m`}
                      className={`flex flex-col items-center justify-center rounded-2xl border-2 py-6 transition-all text-white font-bold ${
                        extendDuration === d
                          ? 'border-blue-500 bg-blue-600/20'
                          : 'border-gray-700 bg-gray-800 hover:border-blue-400'
                      }`}
                      onClick={() => {
                        setExtendDuration(d);
                        setExtendPrice(price);
                      }}
                    >
                      <span className="text-3xl">{d < 60 ? `+${d} min` : '+1 hour'}</span>
                      <span className="text-blue-400 text-xl mt-1">{price} KES</span>
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-4">
                <button
                  id="extend-cash"
                  onClick={selectCash}
                  className="flex-1 py-5 rounded-xl bg-green-700 hover:bg-green-600 text-white text-2xl font-bold transition-colors"
                >
                  Cash
                </button>
                <button
                  id="extend-mpesa"
                  onClick={selectMpesa}
                  className="flex-1 py-5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-2xl font-bold transition-colors"
                >
                  M-Pesa
                </button>
              </div>
              <button
                onClick={cancelExtend}
                className="w-full mt-4 py-4 rounded-xl bg-white/5 text-gray-400 text-xl hover:bg-white/10 transition-colors"
              >
                Cancel
              </button>
            </>
          )}

          {extendStep === 'cashWait' && (
            <div className="text-center py-6">
              <p className="text-5xl font-black text-white mb-4">{extendPrice} KES</p>
              <p className="text-gray-400 text-2xl font-light mb-8">
                Please pay at the counter
                <br />
                <span className="text-gray-500 text-lg">
                  Staff will confirm your extension
                </span>
              </p>
              <button
                onClick={cancelExtend}
                className="px-10 py-4 rounded-xl bg-white/10 text-gray-300 text-xl hover:bg-white/20"
              >
                Cancel
              </button>
            </div>
          )}

          {extendStep === 'mpesaPhone' && (
            <div className="py-4">
              <h3 className="text-3xl font-bold text-white mb-6">Enter M-Pesa Number</h3>
              <input
                id="mpesa-phone-input"
                type="tel"
                inputMode="numeric"
                className={`w-full bg-gray-900 border-2 rounded-xl px-6 py-5 text-white text-3xl font-mono text-center outline-none transition-colors mb-2 ${
                  mpesaPhoneError ? 'border-red-500' : 'border-gray-700 focus:border-blue-500'
                }`}
                placeholder="07XX XXX XXX"
                value={mpesaPhone}
                onChange={(e) => { setMpesaPhone(e.target.value); setMpesaPhoneError(''); }}
              />
              {mpesaPhoneError && (
                <p className="text-red-400 text-base mb-4 text-center">{mpesaPhoneError}</p>
              )}
              {!mpesaPhoneError && <div className="mb-4" />}
              <div className="flex gap-4">
                <button
                  id="send-mpesa"
                  onClick={sendMpesa}
                  disabled={mpesaPhone.trim().length < 9 || mpesaSending}
                  className="flex-1 py-5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-2xl font-bold transition-colors"
                >
                  {mpesaSending ? 'Sending…' : 'Send M-Pesa Request'}
                </button>
                <button
                  onClick={cancelExtend}
                  disabled={mpesaSending}
                  className="px-8 py-5 rounded-xl bg-white/10 text-gray-300 text-xl hover:bg-white/20 disabled:opacity-40"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {extendStep === 'mpesaWait' && (
            <div className="text-center py-8">
              <div className="w-16 h-16 rounded-full border-4 border-blue-500 border-t-transparent animate-spin mx-auto mb-6" />
              <p className="text-2xl text-gray-300 font-light">
                Check your phone for M-Pesa prompt...
              </p>
              <p className="text-gray-500 text-lg mt-2">{mpesaPhone}</p>
              <button
                onClick={cancelExtend}
                className="mt-8 px-10 py-4 rounded-xl bg-white/10 text-gray-300 text-xl hover:bg-white/20"
              >
                Cancel
              </button>
            </div>
          )}

          {extendStep === 'mpesaTimeout' && (
            <div className="text-center py-8">
              <p className="text-4xl font-bold text-red-400 mb-4">Payment Timed Out</p>
              <p className="text-gray-400 text-xl mb-8">The M-Pesa request was not confirmed</p>
              <div className="flex gap-4 justify-center">
                <button
                  id="retry-mpesa"
                  onClick={retryMpesa}
                  className="px-8 py-5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xl font-bold"
                >
                  Retry M-Pesa
                </button>
                <button
                  onClick={selectCash}
                  className="px-8 py-5 rounded-xl bg-green-700 hover:bg-green-600 text-white text-xl font-bold"
                >
                  Pay Cash Instead
                </button>
                <button
                  onClick={cancelExtend}
                  className="px-8 py-5 rounded-xl bg-white/10 text-gray-300 text-xl"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Hidden settings overlay ───────────────────────────────────────────────

  function renderSettingsOverlay() {
    if (!showSettings) return null;
    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] backdrop-blur-sm">
        <div className="bg-[#1E293B] rounded-2xl p-8 w-full max-w-md mx-4 border border-white/10">
          <h2 className="text-2xl font-bold text-white mb-6">Settings</h2>
          <div className="mb-4">
            <label className="text-gray-400 text-sm mb-2 block">Station ID</label>
            <input
              id="settings-station-id"
              type="number"
              min={1}
              max={10}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white text-xl outline-none focus:border-blue-500"
              value={settingsStationId}
              onChange={(e) => setSettingsStationId(e.target.value)}
            />
          </div>
          <div className="mb-8">
            <label className="text-gray-400 text-sm mb-2 block">API Server URL</label>
            <input
              id="settings-api-url"
              type="url"
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white text-lg font-mono outline-none focus:border-blue-500"
              value={settingsApiUrl}
              onChange={(e) => setSettingsApiUrl(e.target.value)}
            />
          </div>
          <div className="flex gap-4">
            <button
              id="settings-reload"
              onClick={applySettings}
              className="flex-1 py-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xl font-bold"
            >
              Save & Reload
            </button>
            <button
              onClick={() => setShowSettings(false)}
              className="px-8 py-4 rounded-xl bg-white/10 text-gray-400 text-xl"
            >
              Close
            </button>
          </div>
          <p className="text-gray-600 text-xs mt-4 text-center">
            Note: Station ID and API URL changes require a .env.local update to persist after refresh
          </p>
        </div>
      </div>
    );
  }
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ReconnectingBanner() {
  return (
    <div
      id="reconnecting-banner"
      className="fixed top-0 left-0 right-0 z-50 bg-amber-500/90 text-black text-center py-2 text-sm font-semibold tracking-wide"
    >
      Reconnecting...
    </div>
  );
}
