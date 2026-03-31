'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import {
  getSession,
  getStations,
  endSession,
  grantFreeTime,
  transferSession,
  type Station,
  type Settings,
  type SessionDetail,
} from '@/lib/api';

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface Props {
  station: Station;
  settings: Settings;
  remainingSeconds?: number;
  onClose: () => void;
  onSuccess: () => void;
  onExtend: (sessionId: number) => void;
}

type FaultView = 'menu' | 'free-time' | 'transfer';

export default function ActiveSessionPanel({ station, remainingSeconds, onClose, onSuccess, onExtend }: Props) {
  const { pin } = useAuth();
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [ending, setEnding] = useState(false);
  const [error, setError] = useState('');

  // Fault modal
  const [faultView, setFaultView] = useState<FaultView | null>(null);
  const [freeMinutes, setFreeMinutes] = useState('');
  const [availableStations, setAvailableStations] = useState<Station[]>([]);
  const [stationsLoading, setStationsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [faultError, setFaultError] = useState('');

  useEffect(() => {
    if (!station.currentSession) return;
    getSession(station.currentSession.id, pin)
      .then(setSession)
      .catch(() => setError('Failed to load session'))
      .finally(() => setLoading(false));
  }, [station.currentSession, pin]);

  async function handleEnd() {
    if (!session) return;
    setEnding(true);
    setError('');
    try {
      await endSession(session.id, pin);
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to end session');
      setEnding(false);
    }
  }

  function openFaultMenu() {
    setFaultView('menu');
    setFaultError('');
    setFreeMinutes('');
  }

  function openTransfer() {
    setFaultError('');
    setStationsLoading(true);
    setFaultView('transfer');
    getStations(pin)
      .then(all => setAvailableStations(all.filter(s => s.status === 'AVAILABLE')))
      .catch(() => setFaultError('Failed to load stations'))
      .finally(() => setStationsLoading(false));
  }

  async function handleGrantFreeTime() {
    if (!session) return;
    const mins = parseInt(freeMinutes);
    if (!mins || mins <= 0) { setFaultError('Enter a valid duration'); return; }
    setSubmitting(true);
    setFaultError('');
    try {
      await grantFreeTime(session.id, pin, { durationMinutes: mins });
      setFaultView(null);
      onSuccess();
    } catch (e) {
      setFaultError(e instanceof Error ? e.message : 'Failed to grant free time');
      setSubmitting(false);
    }
  }

  async function handleTransfer(targetStationId: number) {
    if (!session) return;
    setSubmitting(true);
    setFaultError('');
    try {
      await transferSession(session.id, pin, { targetStationId });
      setFaultView(null);
      onSuccess();
    } catch (e) {
      setFaultError(e instanceof Error ? e.message : 'Failed to transfer session');
      setSubmitting(false);
    }
  }

  const totalAmount = session?.transactions.reduce((sum, t) => sum + t.amount, 0) ?? 0;
  const paymentMethod = session?.transactions[0]?.method ?? '—';

  return (
    <>
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
        <div
          className="bg-[#1E293B] border border-white/10 rounded-2xl p-6 w-full max-w-md flex flex-col gap-5"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold">{station.name}</h2>
            <span className="text-xs font-bold px-3 py-1 rounded-full bg-blue-500 text-white">Active</span>
          </div>

          {loading && <p className="text-white/40 text-sm text-center">Loading session…</p>}

          {!loading && session && (
            <>
              {/* Live timer */}
              <div className="bg-[#0F172A] rounded-xl px-4 py-5 text-center">
                <p className="text-xs text-white/40 mb-1 uppercase tracking-wider">Time Remaining</p>
                <p className={`text-5xl font-mono font-bold ${remainingSeconds !== undefined && remainingSeconds <= 300 ? 'text-amber-400' : 'text-white'}`}>
                  {remainingSeconds !== undefined ? formatTime(remainingSeconds) : '—:——'}
                </p>
              </div>

              {/* Session details */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#0F172A] rounded-xl px-4 py-3">
                  <p className="text-xs text-white/40 mb-1">Amount</p>
                  <p className="text-lg font-semibold">{totalAmount} <span className="text-sm text-white/50">KES</span></p>
                </div>
                <div className="bg-[#0F172A] rounded-xl px-4 py-3">
                  <p className="text-xs text-white/40 mb-1">Payment</p>
                  <p className="text-lg font-semibold">{paymentMethod === 'MPESA' ? 'M-Pesa' : paymentMethod}</p>
                </div>
                <div className="bg-[#0F172A] rounded-xl px-4 py-3 col-span-2">
                  <p className="text-xs text-white/40 mb-1">Auth Code</p>
                  <p className="text-lg font-mono font-semibold tracking-widest">{session.authCode}</p>
                </div>
              </div>

              {error && <p className="text-red-400 text-sm text-center">{error}</p>}

              {/* Primary actions */}
              <div className="flex gap-3">
                <button
                  onClick={handleEnd}
                  disabled={ending}
                  className="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 text-sm font-semibold transition-colors"
                >
                  {ending ? 'Ending…' : 'End Session'}
                </button>
                <button
                  onClick={() => onExtend(session.id)}
                  className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-sm font-semibold transition-colors"
                >
                  Extend
                </button>
              </div>

              {/* Secondary actions */}
              <div className="flex gap-3">
                <button
                  onClick={openFaultMenu}
                  className="flex-1 py-2 rounded-xl border border-white/10 text-xs text-white/50 hover:text-white hover:border-white/30 transition-colors"
                >
                  Report Fault
                </button>
                <button
                  onClick={openTransfer}
                  className="flex-1 py-2 rounded-xl border border-white/10 text-xs text-white/50 hover:text-white hover:border-white/30 transition-colors"
                >
                  Transfer
                </button>
              </div>
            </>
          )}

          {!loading && !session && !error && (
            <p className="text-white/40 text-sm text-center">No session data available.</p>
          )}

          {!loading && error && (
            <button
              onClick={onClose}
              className="py-3 rounded-xl border border-white/10 text-sm font-semibold hover:bg-white/5 transition-colors"
            >
              Close
            </button>
          )}
        </div>
      </div>

      {/* Fault modal */}
      {faultView && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-60 p-4" onClick={() => setFaultView(null)}>
          <div
            className="bg-[#1E293B] border border-white/10 rounded-2xl p-6 w-full max-w-sm flex flex-col gap-4"
            onClick={e => e.stopPropagation()}
          >
            {faultView === 'menu' && (
              <>
                <h3 className="text-lg font-bold">Report Fault</h3>
                <p className="text-sm text-white/50">How would you like to resolve this?</p>
                <button
                  onClick={() => { setFaultView('free-time'); setFaultError(''); }}
                  className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-sm font-semibold transition-colors"
                >
                  Grant Free Time
                </button>
                <button
                  onClick={openTransfer}
                  className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-sm font-semibold transition-colors"
                >
                  Transfer to Another Station
                </button>
                <button
                  onClick={() => setFaultView(null)}
                  className="w-full py-2 rounded-xl border border-white/10 text-xs text-white/50 hover:text-white transition-colors"
                >
                  Cancel
                </button>
              </>
            )}

            {faultView === 'free-time' && (
              <>
                <div className="flex items-center gap-3">
                  <button onClick={() => setFaultView('menu')} className="text-white/40 hover:text-white text-lg">←</button>
                  <h3 className="text-lg font-bold">Grant Free Time</h3>
                </div>
                <p className="text-sm text-white/50">Extend session at 0 KES</p>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-white/40 uppercase tracking-wider">Duration (minutes)</label>
                  <input
                    type="number"
                    min="1"
                    value={freeMinutes}
                    onChange={e => setFreeMinutes(e.target.value)}
                    placeholder="e.g. 15"
                    className="bg-[#0F172A] border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-white/30"
                  />
                </div>
                {faultError && <p className="text-red-400 text-sm">{faultError}</p>}
                <button
                  onClick={handleGrantFreeTime}
                  disabled={submitting}
                  className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-sm font-semibold transition-colors"
                >
                  {submitting ? 'Granting…' : 'Confirm — 0 KES'}
                </button>
                <button
                  onClick={() => setFaultView(null)}
                  className="w-full py-2 rounded-xl border border-white/10 text-xs text-white/50 hover:text-white transition-colors"
                >
                  Cancel
                </button>
              </>
            )}

            {faultView === 'transfer' && (
              <>
                <div className="flex items-center gap-3">
                  <button onClick={() => setFaultView('menu')} className="text-white/40 hover:text-white text-lg">←</button>
                  <h3 className="text-lg font-bold">Transfer Session</h3>
                </div>
                <p className="text-sm text-white/50">Select an available station</p>
                {stationsLoading && <p className="text-white/40 text-sm text-center">Loading stations…</p>}
                {!stationsLoading && availableStations.length === 0 && !faultError && (
                  <p className="text-white/40 text-sm text-center">No available stations</p>
                )}
                {!stationsLoading && availableStations.length > 0 && (
                  <div className="flex flex-col gap-2 max-h-60 overflow-y-auto">
                    {availableStations.map(s => (
                      <button
                        key={s.id}
                        onClick={() => handleTransfer(s.id)}
                        disabled={submitting}
                        className="w-full py-3 px-4 rounded-xl bg-[#0F172A] hover:bg-white/5 disabled:opacity-50 text-sm font-semibold text-left transition-colors border border-white/5 hover:border-white/20"
                      >
                        {s.name}
                      </button>
                    ))}
                  </div>
                )}
                {faultError && <p className="text-red-400 text-sm">{faultError}</p>}
                <button
                  onClick={() => setFaultView(null)}
                  className="w-full py-2 rounded-xl border border-white/10 text-xs text-white/50 hover:text-white transition-colors"
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
