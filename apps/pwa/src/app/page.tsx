'use client';

import { useEffect, useRef, useState, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { getReplaysByAuthCode, type ReplayResponse } from '@/lib/api';
import ReplayList from '@/components/ReplayList';

function PWAContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [authCode, setAuthCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replayData, setReplayData] = useState<ReplayResponse | null>(null);
  const [autoLoaded, setAutoLoaded] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Register service worker
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

  // Auto-fetch if auth code is in URL
  useEffect(() => {
    const urlAuth = searchParams.get('auth');
    if (urlAuth && !autoLoaded) {
      setAutoLoaded(true);
      setAuthCode(urlAuth.toUpperCase());
      fetchReplays(urlAuth);
    }
  }, [searchParams, autoLoaded]);

  const fetchReplays = useCallback(async (code: string) => {
    if (!code || code.length < 6) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getReplaysByAuthCode(code);
      setReplayData(data);
    } catch {
      setError('Code not found — check your receipt or ask staff');
      setReplayData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRefresh = useCallback(async () => {
    if (authCode) {
      await fetchReplays(authCode);
    }
  }, [authCode, fetchReplays]);

  const handleCodeChange = (index: number, value: string) => {
    const char = value.slice(-1).toUpperCase();
    const newCode = authCode.split('');
    newCode[index] = char;
    const joined = newCode.join('');
    setAuthCode(joined);

    // Auto-advance to next input
    if (char && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !authCode[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
      const newCode = authCode.split('');
      newCode[index - 1] = '';
      setAuthCode(newCode.join(''));
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    setAuthCode(pasted);
    if (pasted.length === 6) {
      inputRefs.current[5]?.focus();
    } else {
      inputRefs.current[pasted.length]?.focus();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (authCode.length === 6) {
      fetchReplays(authCode);
      // Update URL without full reload
      router.replace(`/?auth=${authCode}`);
    }
  };

  const handleBack = () => {
    setReplayData(null);
    setAuthCode('');
    setError(null);
    router.replace('/');
    setTimeout(() => inputRefs.current[0]?.focus(), 100);
  };

  // ── Replay View ──────────────────────────────────────────────────────────────
  if (replayData) {
    return (
      <ReplayList
        data={replayData}
        onBack={handleBack}
        onRefresh={handleRefresh}
        authCode={authCode}
      />
    );
  }

  // ── Auth Code Entry ──────────────────────────────────────────────────────────
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
      {/* Branding */}
      <div className="mb-12 text-center fade-in">
        <div className="mb-3 inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-accent/10 pulse-glow">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Neo Lounge
        </h1>
        <p className="mt-1 text-sm text-muted">
          Enter your replay code to download clips
        </p>
      </div>

      {/* Code Entry Form */}
      <form onSubmit={handleSubmit} className="w-full max-w-sm fade-in" style={{ animationDelay: '0.1s' }}>
        <label htmlFor="code-0" className="block mb-3 text-xs font-semibold uppercase tracking-wider text-muted">
          6-Character Replay Code
        </label>

        <div className="flex gap-2 justify-center mb-6" onPaste={handlePaste}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <input
              key={i}
              id={`code-${i}`}
              ref={(el) => { inputRefs.current[i] = el; }}
              type="text"
              inputMode="text"
              maxLength={1}
              value={authCode[i] || ''}
              onChange={(e) => handleCodeChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              className="code-input"
              placeholder="·"
              autoComplete="off"
              autoFocus={i === 0}
            />
          ))}
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-4 rounded-xl bg-danger/10 border border-danger/20 px-4 py-3 text-sm text-danger fade-in">
            <div className="flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              {error}
            </div>
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={authCode.length < 6 || loading}
          className="w-full py-3.5 rounded-xl font-semibold text-sm bg-accent text-white transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-accent-dim hover:shadow-lg hover:shadow-accent-glow active:scale-[0.98]"
        >
          {loading ? (
            <span className="inline-flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Loading…
            </span>
          ) : (
            'View Replays'
          )}
        </button>
      </form>

      {/* Footer hint */}
      <p className="mt-8 text-xs text-muted/60 text-center max-w-xs fade-in" style={{ animationDelay: '0.2s' }}>
        Your replay code is on the QR card from your gaming station, or ask the staff at the counter.
      </p>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={
      <div className="flex flex-1 items-center justify-center">
        <div className="animate-spin h-8 w-8 border-2 border-accent border-t-transparent rounded-full" />
      </div>
    }>
      <PWAContent />
    </Suspense>
  );
}
