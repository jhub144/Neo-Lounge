'use client';

import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';

const DIGITS = ['1','2','3','4','5','6','7','8','9','','0','⌫'];

export default function PinLogin() {
  const { login } = useAuth();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleDigit(d: string) {
    if (loading) return;
    if (d === '⌫') {
      setPin(p => p.slice(0, -1));
      setError('');
      return;
    }
    const next = pin + d;
    setPin(next);
    setError('');
    if (next.length === 4) {
      setLoading(true);
      try {
        await login(next);
      } catch {
        setError('Invalid PIN. Try again.');
        setPin('');
      } finally {
        setLoading(false);
      }
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-8">
      <h1 className="text-3xl font-bold tracking-tight">PlayStation Lounge</h1>
      <p className="text-white/50 text-sm">Enter your staff PIN</p>

      <div className="flex gap-4">
        {[0,1,2,3].map(i => (
          <div
            key={i}
            className={`w-4 h-4 rounded-full border-2 transition-colors ${
              pin.length > i ? 'bg-blue-500 border-blue-500' : 'border-white/30'
            }`}
          />
        ))}
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <div className="grid grid-cols-3 gap-3 w-64">
        {DIGITS.map((d, i) => (
          <button
            key={i}
            onClick={() => d && handleDigit(d)}
            disabled={!d || loading}
            className={`h-16 rounded-xl text-xl font-semibold transition-colors ${
              d
                ? 'bg-[#1E293B] hover:bg-[#263548] active:bg-blue-600 border border-white/10'
                : 'invisible'
            }`}
          >
            {d}
          </button>
        ))}
      </div>
    </div>
  );
}
