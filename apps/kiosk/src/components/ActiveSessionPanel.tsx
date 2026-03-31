'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { getSession, endSession, type Station, type Settings, type SessionDetail } from '@/lib/api';

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

export default function ActiveSessionPanel({ station, remainingSeconds, onClose, onSuccess, onExtend }: Props) {
  const { pin } = useAuth();
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [ending, setEnding] = useState(false);
  const [error, setError] = useState('');

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

  const totalAmount = session?.transactions.reduce((sum, t) => sum + t.amount, 0) ?? 0;
  const paymentMethod = session?.transactions[0]?.method ?? '—';

  return (
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
                onClick={() => console.log('Report fault', { stationId: station.id, sessionId: session.id })}
                className="flex-1 py-2 rounded-xl border border-white/10 text-xs text-white/50 hover:text-white hover:border-white/30 transition-colors"
              >
                Report Fault
              </button>
              <button
                onClick={() => console.log('Transfer session', { stationId: station.id, sessionId: session.id })}
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
  );
}
