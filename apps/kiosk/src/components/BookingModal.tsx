'use client';

import { useState, useEffect, useRef } from 'react';
import { Socket } from 'socket.io-client';
import { useAuth } from '@/context/AuthContext';
import {
  createSession,
  extendSession,
  checkMpesaAvailability,
  initiateMpesaPayment,
  type Station,
  type Settings,
} from '@/lib/api';

const PRESET_DURATIONS = [5, 10, 20, 30, 40, 60];
const MPESA_TIMEOUT_SECONDS = 30;
const KENYAN_PHONE_RE = /^(07\d{8}|254\d{9}|\+254\d{9})$/;

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

type Step = 'form' | 'phone' | 'waiting' | 'failed';

interface Props {
  station: Station;
  settings: Settings;
  onClose: () => void;
  onSuccess: () => void;
  extensionSessionId?: number;
  socket: Socket | null;
}

export default function BookingModal({ station, settings, onClose, onSuccess, extensionSessionId, socket }: Props) {
  const { pin } = useAuth();
  const rate = settings.baseHourlyRate;

  // ── Form state ───────────────────────────────────────────────────────────────
  const [selectedMinutes, setSelectedMinutes] = useState<number>(30);
  const [customMinutes, setCustomMinutes] = useState('');
  const [mode, setMode] = useState<'preset' | 'custom' | 'closing'>('preset');
  const [payment, setPayment] = useState<'CASH' | 'MPESA'>('CASH');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // ── M-Pesa state ─────────────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>('form');
  const [mpesaAvailable, setMpesaAvailable] = useState(true);
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [pendingSessionId, setPendingSessionId] = useState<number | null>(null);
  const [countdown, setCountdown] = useState(MPESA_TIMEOUT_SECONDS);
  const onSuccessRef = useRef(onSuccess);
  useEffect(() => { onSuccessRef.current = onSuccess; }, [onSuccess]);

  const closingMinutes = minutesUntilClosing(settings.closingTime);

  // ── Check M-Pesa availability on mount ───────────────────────────────────────
  useEffect(() => {
    checkMpesaAvailability()
      .then(({ mpesaAvailable: available }) => setMpesaAvailable(available))
      .catch(() => setMpesaAvailable(false));
  }, []);

  // ── Countdown + socket listeners when waiting ─────────────────────────────────
  useEffect(() => {
    if (step !== 'waiting') return;

    setCountdown(MPESA_TIMEOUT_SECONDS);

    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          setStep('failed');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    const onConfirmed = (data: { sessionId: number }) => {
      if (data.sessionId === pendingSessionId) {
        clearInterval(interval);
        onSuccessRef.current();
      }
    };

    const onTimeout = (data: { sessionId: number }) => {
      if (data.sessionId === pendingSessionId) {
        clearInterval(interval);
        setStep('failed');
      }
    };

    socket?.on('payment:confirmed', onConfirmed);
    socket?.on('payment:timeout', onTimeout);

    return () => {
      clearInterval(interval);
      socket?.off('payment:confirmed', onConfirmed);
      socket?.off('payment:timeout', onTimeout);
    };
  }, [step, pendingSessionId, socket]);

  // ── Derived values ────────────────────────────────────────────────────────────

  function getDuration(): number {
    if (mode === 'custom') return parseInt(customMinutes) || 0;
    if (mode === 'closing') return closingMinutes;
    return selectedMinutes;
  }

  const duration = getDuration();
  const price = calcPrice(duration, rate);

  // ── Handlers ──────────────────────────────────────────────────────────────────

  async function handleConfirm() {
    if (duration <= 0) { setError('Invalid duration'); return; }
    setLoading(true);
    setError('');
    try {
      if (payment === 'CASH') {
        // Cash: create/extend immediately → done
        if (extensionSessionId != null) {
          await extendSession(extensionSessionId, pin, { durationMinutes: duration, paymentMethod: 'CASH' });
        } else {
          await createSession(pin, { stationId: station.id, durationMinutes: duration, paymentMethod: 'CASH' });
        }
        onSuccess();
      } else {
        // M-Pesa: create PENDING session first, then collect phone
        const session = extensionSessionId != null
          ? await extendSession(extensionSessionId, pin, { durationMinutes: duration, paymentMethod: 'MPESA' })
          : await createSession(pin, { stationId: station.id, durationMinutes: duration, paymentMethod: 'MPESA' });
        setPendingSessionId(session.id);
        setStep('phone');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create session');
    } finally {
      setLoading(false);
    }
  }

  async function handleInitiate() {
    if (!KENYAN_PHONE_RE.test(phone)) {
      setPhoneError('Enter a valid Kenyan phone number (07XX XXX XXX or +254…)');
      return;
    }
    setPhoneError('');
    setLoading(true);
    try {
      await initiateMpesaPayment(pin, {
        sessionId: pendingSessionId!,
        phoneNumber: phone,
        amount: price,
      });
      setStep('waiting');
    } catch (e) {
      setPhoneError(e instanceof Error ? e.message : 'Failed to send M-Pesa request');
    } finally {
      setLoading(false);
    }
  }

  function handleSwitchToCash() {
    // Callback failure path already freed the station — just reset to cash booking form
    setPendingSessionId(null);
    setPhone('');
    setPhoneError('');
    setPayment('CASH');
    setStep('form');
    setCountdown(MPESA_TIMEOUT_SECONDS);
  }

  // ── Render helpers ────────────────────────────────────────────────────────────

  const title = step === 'waiting' ? 'Waiting for Payment'
    : step === 'failed'  ? 'Payment Failed'
    : step === 'phone'   ? 'Enter Customer Phone'
    : extensionSessionId != null ? `${station.name} — Extend Session`
    : `${station.name} — New Session`;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={step === 'form' ? onClose : undefined}>
      <div
        className="bg-[#1E293B] border border-white/10 rounded-2xl p-6 w-full max-w-md flex flex-col gap-5"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold">{title}</h2>

        {/* ── WAITING STEP ── */}
        {step === 'waiting' && (
          <div className="flex flex-col items-center gap-6 py-4">
            <div className="relative w-24 h-24">
              <svg className="w-24 h-24 -rotate-90" viewBox="0 0 96 96">
                <circle cx="48" cy="48" r="42" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="6" />
                <circle
                  cx="48" cy="48" r="42" fill="none"
                  stroke="#2563EB" strokeWidth="6" strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 42}`}
                  strokeDashoffset={`${2 * Math.PI * 42 * (1 - countdown / MPESA_TIMEOUT_SECONDS)}`}
                  style={{ transition: 'stroke-dashoffset 1s linear' }}
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-2xl font-bold">
                {countdown}
              </span>
            </div>
            <div className="text-center">
              <p className="text-white font-medium">M-Pesa request sent to</p>
              <p className="text-blue-400 font-mono text-lg mt-1">{phone}</p>
              <p className="text-white/50 text-sm mt-2">Ask the customer to check their phone and enter their PIN</p>
            </div>
          </div>
        )}

        {/* ── FAILED STEP ── */}
        {step === 'failed' && (
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center">
              <span className="text-3xl text-red-400">✕</span>
            </div>
            <div className="text-center">
              <p className="text-white font-medium">M-Pesa payment timed out</p>
              <p className="text-white/50 text-sm mt-1">The customer did not confirm in time</p>
            </div>
            <div className="flex gap-3 w-full">
              <button
                onClick={onClose}
                className="flex-1 py-3 rounded-xl border border-white/10 text-sm font-semibold hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSwitchToCash}
                className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-sm font-semibold transition-colors"
              >
                Switch to Cash
              </button>
            </div>
          </div>
        )}

        {/* ── PHONE ENTRY STEP ── */}
        {step === 'phone' && (
          <>
            <div>
              <p className="text-xs text-white/40 uppercase tracking-wider mb-2">Customer Phone Number</p>
              <input
                type="tel"
                placeholder="07XX XXX XXX or +254…"
                value={phone}
                onChange={e => { setPhone(e.target.value); setPhoneError(''); }}
                className="w-full bg-[#0F172A] border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500"
                autoFocus
              />
              {phoneError && <p className="text-red-400 text-xs mt-1">{phoneError}</p>}
            </div>
            <div className="bg-[#0F172A] rounded-xl px-4 py-3 text-center">
              <p className="text-xs text-white/40 mb-1">M-Pesa request will be sent for</p>
              <p className="text-3xl font-bold text-blue-400">{price} <span className="text-lg font-normal text-white/50">KES</span></p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => { setStep('form'); setPendingSessionId(null); }}
                disabled={loading}
                className="flex-1 py-3 rounded-xl border border-white/10 text-sm font-semibold hover:bg-white/5 transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleInitiate}
                disabled={loading || phone.trim() === ''}
                className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-sm font-semibold transition-colors"
              >
                {loading ? 'Sending…' : 'Send M-Pesa Request'}
              </button>
            </div>
          </>
        )}

        {/* ── BOOKING FORM STEP ── */}
        {step === 'form' && (
          <>
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

            {/* Payment method */}
            <div>
              <p className="text-xs text-white/40 uppercase tracking-wider mb-2">Payment</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPayment('CASH')}
                  className={`flex-1 py-3 rounded-xl text-sm font-semibold border transition-colors ${
                    payment === 'CASH'
                      ? 'bg-blue-600 border-blue-500 text-white'
                      : 'bg-[#0F172A] border-white/10 hover:border-white/30'
                  }`}
                >
                  Cash
                </button>
                <button
                  onClick={() => mpesaAvailable && setPayment('MPESA')}
                  disabled={!mpesaAvailable}
                  title={mpesaAvailable ? undefined : 'M-Pesa unavailable — no internet'}
                  className={`flex-1 py-3 rounded-xl text-sm font-semibold border transition-colors ${
                    !mpesaAvailable
                      ? 'opacity-40 cursor-not-allowed bg-[#0F172A] border-white/10'
                      : payment === 'MPESA'
                        ? 'bg-blue-600 border-blue-500 text-white'
                        : 'bg-[#0F172A] border-white/10 hover:border-white/30'
                  }`}
                >
                  M-Pesa{!mpesaAvailable && <span className="block text-xs font-normal opacity-70">Unavailable</span>}
                </button>
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
                {loading ? 'Confirming…' : payment === 'MPESA' ? 'Next — Enter Phone' : 'Confirm'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
