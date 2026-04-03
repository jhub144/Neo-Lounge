'use client';

import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';

export default function PinLogin() {
  const { login } = useAuth();
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.length < 4) return;
    setLoading(true);
    setError(null);
    try {
      await login(pin);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Login failed';
      setError(msg === 'Owner access required' ? 'Owner PIN required — staff cannot access the dashboard' : 'Invalid PIN');
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm fade-in">
        {/* Logo / branding */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#1E293B] border border-white/10 mb-4">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-8 h-8 text-[#2563EB]">
              <rect x="3" y="3" width="18" height="18" rx="3" />
              <path d="M3 9h18M9 21V9" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Owner Dashboard</h1>
          <p className="mt-1 text-sm text-white/50">Neo Lounge — Owner access only</p>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-4">
          <div>
            <label htmlFor="pin" className="block text-xs font-semibold uppercase tracking-wider text-white/50 mb-2">
              Owner PIN
            </label>
            <input
              id="pin"
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              placeholder="Enter owner PIN"
              className="w-full px-4 py-3 rounded-xl bg-[#0F172A] border border-white/10 text-white text-center text-2xl tracking-[0.5em] placeholder:text-white/20 placeholder:tracking-normal outline-none focus:border-[#2563EB] transition-colors"
              autoFocus
            />
          </div>

          {error && (
            <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={pin.length < 4 || loading}
            className="w-full py-3 rounded-xl font-semibold bg-[#2563EB] text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#1D4ED8] transition-colors"
          >
            {loading ? 'Verifying…' : 'Access Dashboard'}
          </button>
        </form>
      </div>
    </div>
  );
}
