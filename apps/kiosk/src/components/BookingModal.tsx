'use client';

import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { createSession, extendSession, type Station, type Settings } from '@/lib/api';

const PRESET_DURATIONS = [5, 10, 20, 30, 40, 60];

function calcPrice(minutes: number, baseHourlyRate: number): number {
  return Math.round(baseHourlyRate / 60 * minutes);
}

function minutesUntilClosing(closingTime: string): number {
  const now = new Date();
  const [h, m] = closingTime.split(':').map(Number);
  const closing = new Date(now);
  closing.setHours(h, m, 0, 0);
  return Math.max(0, Math.floor((closing.getTime() - now.getTime()) / 60000));
}

interface Props {
  station: Station;
  settings: Settings;
  onClose: () => void;
  onSuccess: () => void;
  extensionSessionId?: number;
}

export default function BookingModal({ station, settings, onClose, onSuccess, extensionSessionId }: Props) {
  const { pin } = useAuth();
  const rate = settings.baseHourlyRate;

  const [selectedMinutes, setSelectedMinutes] = useState<number>(30);
  const [customMinutes, setCustomMinutes] = useState('');
  const [mode, setMode] = useState<'preset' | 'custom' | 'closing'>('preset');
  const [payment, setPayment] = useState<'CASH' | 'MPESA'>('CASH');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const closingMinutes = minutesUntilClosing(settings.closingTime);

  function getDuration(): number {
    if (mode === 'custom') return parseInt(customMinutes) || 0;
    if (mode === 'closing') return closingMinutes;
    return selectedMinutes;
  }

  const duration = getDuration();
  const price = calcPrice(duration, rate);

  async function handleConfirm() {
    if (duration <= 0) { setError('Invalid duration'); return; }
    setLoading(true);
    setError('');
    try {
      if (extensionSessionId != null) {
        await extendSession(extensionSessionId, pin, { durationMinutes: duration, paymentMethod: payment });
      } else {
        await createSession(pin, { stationId: station.id, durationMinutes: duration, paymentMethod: payment });
      }
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : extensionSessionId != null ? 'Failed to extend session' : 'Failed to create session');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-[#1E293B] border border-white/10 rounded-2xl p-6 w-full max-w-md flex flex-col gap-5"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold">{station.name} — {extensionSessionId != null ? 'Extend Session' : 'New Session'}</h2>

        {/* Duration presets */}
        <div>
          <p className="text-xs text-white/40 uppercase tracking-wider mb-2">Duration</p>
          <div className="grid grid-cols-3 gap-2">
            {PRESET_DURATIONS.map(min => (
              <button
                key={min}
                onClick={() => { setMode('preset'); setSelectedMinutes(min); }}
                className={`py-3 rounded-xl text-sm font-semibold border transition-colors ${
                  mode === 'preset' && selectedMinutes === min
                    ? 'bg-blue-600 border-blue-500 text-white'
                    : 'bg-[#0F172A] border-white/10 hover:border-white/30'
                }`}
              >
                <div>{min < 60 ? `${min}m` : '1hr'}</div>
                <div className="text-xs font-normal opacity-70">{calcPrice(min, rate)} KES</div>
              </button>
            ))}

            {/* Custom */}
            <button
              onClick={() => setMode('custom')}
              className={`py-3 rounded-xl text-sm font-semibold border transition-colors ${
                mode === 'custom'
                  ? 'bg-blue-600 border-blue-500 text-white'
                  : 'bg-[#0F172A] border-white/10 hover:border-white/30'
              }`}
            >
              Custom
            </button>

            {/* Until Closing */}
            <button
              onClick={() => setMode('closing')}
              className={`col-span-2 py-3 rounded-xl text-sm font-semibold border transition-colors ${
                mode === 'closing'
                  ? 'bg-blue-600 border-blue-500 text-white'
                  : 'bg-[#0F172A] border-white/10 hover:border-white/30'
              }`}
            >
              <div>Until Closing</div>
              <div className="text-xs font-normal opacity-70">{closingMinutes}m · {calcPrice(closingMinutes, rate)} KES</div>
            </button>
          </div>

          {mode === 'custom' && (
            <input
              type="number"
              min="1"
              placeholder="Enter minutes"
              value={customMinutes}
              onChange={e => setCustomMinutes(e.target.value)}
              className="mt-2 w-full bg-[#0F172A] border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500"
            />
          )}
        </div>

        {/* Payment */}
        <div>
          <p className="text-xs text-white/40 uppercase tracking-wider mb-2">Payment</p>
          <div className="flex gap-2">
            {(['CASH', 'MPESA'] as const).map(method => (
              <button
                key={method}
                onClick={() => setPayment(method)}
                className={`flex-1 py-3 rounded-xl text-sm font-semibold border transition-colors ${
                  payment === method
                    ? 'bg-blue-600 border-blue-500 text-white'
                    : 'bg-[#0F172A] border-white/10 hover:border-white/30'
                }`}
              >
                {method === 'MPESA' ? 'M-Pesa' : 'Cash'}
              </button>
            ))}
          </div>
        </div>

        {/* Total */}
        <div className="bg-[#0F172A] rounded-xl px-4 py-4 text-center">
          <p className="text-xs text-white/40 mb-1">Total</p>
          <p className="text-4xl font-bold text-blue-400">{price} <span className="text-xl font-normal text-white/50">KES</span></p>
          {duration > 0 && <p className="text-xs text-white/40 mt-1">{duration} minutes</p>}
        </div>

        {error && <p className="text-red-400 text-sm text-center">{error}</p>}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 py-3 rounded-xl border border-white/10 text-sm font-semibold hover:bg-white/5 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading || duration <= 0}
            className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-sm font-semibold transition-colors"
          >
            {loading ? 'Confirming…' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}
