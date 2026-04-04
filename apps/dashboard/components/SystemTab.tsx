'use client';

import { useEffect, useState, useCallback } from 'react';
import { getHealth, getHardwareStatus, getCameras, restartService, getInternetStatus, type HardwareStatus, type SecurityCamera, type InternetStatus, type InternetRoute } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

interface HealthStatus {
  api: 'ok' | 'error' | 'loading';
  pipeline: 'ok' | 'error' | 'loading' | 'not-running';
}

interface ConfirmState {
  service: string;
  label: string;
}

export default function SystemTab() {
  const { pin } = useAuth();
  const [health, setHealth] = useState<HealthStatus>({ api: 'loading', pipeline: 'loading' });
  const [hardware, setHardware] = useState<HardwareStatus | null>(null);
  const [cameras, setCameras] = useState<SecurityCamera[]>([]);
  const [internet, setInternet] = useState<InternetStatus | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [restarting, setRestarting] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      // API health
      await getHealth();
      setHealth(prev => ({ ...prev, api: 'ok' }));
    } catch {
      setHealth(prev => ({ ...prev, api: 'error' }));
    }

    // Video pipeline (may not be running)
    try {
      const pipelineUrl = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000')
        .replace(':3000', ':8000');
      const res = await fetch(`${pipelineUrl}/pipeline/health`, { cache: 'no-store' });
      setHealth(prev => ({ ...prev, pipeline: res.ok ? 'ok' : 'error' }));
    } catch {
      setHealth(prev => ({ ...prev, pipeline: 'not-running' }));
    }

    // Hardware + cameras + internet
    try {
      const [hw, cams, inet] = await Promise.all([
        getHardwareStatus(pin),
        getCameras(pin),
        getInternetStatus(pin),
      ]);
      setHardware(hw);
      setCameras(cams);
      setInternet(inet);
    } catch { /* keep null */ }

    setLoading(false);
  }, [pin]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleRestart = async (service: string) => {
    setConfirm(null);
    setRestarting(service);
    try {
      await restartService(pin, service);
    } catch { /* log only */ }
    // Re-check health after 10 seconds
    setTimeout(() => {
      setRestarting(null);
      loadAll();
    }, 10_000);
  };

  const statusIcon = (s: 'ok' | 'error' | 'loading' | 'not-running') => {
    if (s === 'ok') return <span className="dot dot-green" />;
    if (s === 'error') return <span className="dot dot-red" />;
    if (s === 'not-running') return <span className="dot dot-amber" />;
    return <span className="dot dot-gray animate-pulse" />;
  };

  const statusLabel = (s: 'ok' | 'error' | 'loading' | 'not-running') => {
    if (s === 'ok') return <span className="text-[#22C55E] text-xs font-semibold">Online</span>;
    if (s === 'error') return <span className="text-red-400 text-xs font-semibold">Error</span>;
    if (s === 'not-running') return <span className="text-amber-400 text-xs font-semibold">Not running</span>;
    return <span className="text-white/40 text-xs">Checking…</span>;
  };

  const SERVICES = [
    { key: 'api', label: 'API Server' },
    { key: 'video-pipeline', label: 'Video Pipeline' },
    { key: 'postgresql', label: 'PostgreSQL' },
  ];

  return (
    <div className="space-y-6 fade-in">
      {/* Service Health */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-3">Service Health</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="card flex items-center justify-between">
            <div className="flex items-center gap-2">
              {statusIcon(health.api)}
              <span className="font-medium text-sm">API Server</span>
            </div>
            <div className="flex items-center gap-3">
              {statusLabel(health.api)}
              <button
                onClick={() => setConfirm({ service: 'api', label: 'API Server' })}
                disabled={!!restarting}
                className="px-3 py-1 rounded-lg bg-[#0F172A] border border-white/10 text-xs hover:bg-white/5 disabled:opacity-40 transition-colors"
              >
                Restart
              </button>
            </div>
          </div>

          <div className="card flex items-center justify-between">
            <div className="flex items-center gap-2">
              {statusIcon(health.pipeline)}
              <span className="font-medium text-sm">Video Pipeline</span>
            </div>
            <div className="flex items-center gap-3">
              {statusLabel(health.pipeline)}
              <button
                onClick={() => setConfirm({ service: 'video-pipeline', label: 'Video Pipeline' })}
                disabled={!!restarting}
                className="px-3 py-1 rounded-lg bg-[#0F172A] border border-white/10 text-xs hover:bg-white/5 disabled:opacity-40 transition-colors"
              >
                Restart
              </button>
            </div>
          </div>

          <div className="card flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="dot dot-green" />
              <span className="font-medium text-sm">PostgreSQL</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[#22C55E] text-xs font-semibold">Online</span>
              <button
                onClick={() => setConfirm({ service: 'postgresql', label: 'PostgreSQL' })}
                disabled={!!restarting}
                className="px-3 py-1 rounded-lg bg-[#0F172A] border border-white/10 text-xs hover:bg-white/5 disabled:opacity-40 transition-colors"
              >
                Restart
              </button>
            </div>
          </div>
        </div>

        {restarting && (
          <div className="mt-3 rounded-xl bg-amber-500/10 border border-amber-500/20 px-4 py-3 text-sm text-amber-400 flex items-center gap-2">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
            Restarting {SERVICES.find(s => s.key === restarting)?.label}… re-checking in 10 seconds
          </div>
        )}
      </section>

      {/* Hardware Status */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-3">Hardware Status</h2>
        {loading ? (
          <div className="card h-32 animate-pulse bg-white/5" />
        ) : hardware ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {hardware.stations.map((s) => (
              <div key={s.stationId} className="card">
                <p className="font-semibold text-sm mb-3">{s.name}</p>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-white/50">TV</span>
                    <span className="flex items-center gap-1.5 text-xs">
                      <span className={`dot ${s.tvConnected ? 'dot-green' : 'dot-red'}`} />
                      {s.tvConnected ? 'Connected' : 'Offline'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-white/50">LEDs</span>
                    <span className="flex items-center gap-1.5 text-xs">
                      <span className={`dot ${s.ledsConnected ? 'dot-green' : 'dot-red'}`} />
                      {s.ledsConnected ? 'Connected' : 'Offline'}
                    </span>
                  </div>
                  <p className="text-xs text-white/25 font-mono truncate pt-1">{s.adbAddress}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-white/40">Unable to load hardware status</p>
        )}
      </section>

      {/* Internet Connection */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-3">Internet Connection</h2>
        {loading ? (
          <div className="card h-20 animate-pulse bg-white/5" />
        ) : internet ? (
          <div className="space-y-4">
            <div className="card flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className={`dot ${internet.route === 'primary' ? 'dot-green' : internet.route === '4g' ? 'dot-amber' : 'dot-red'}`} />
                <div>
                  <p className="font-medium text-sm">
                    {internet.route === 'primary' ? 'Primary Broadband' : internet.route === '4g' ? '4G Dongle (Failover)' : 'Offline'}
                  </p>
                  <p className="text-xs text-white/40">Current route</p>
                </div>
              </div>
              <span className={`text-xs font-semibold ${internet.route === 'primary' ? 'text-[#22C55E]' : internet.route === '4g' ? 'text-amber-400' : 'text-red-400'}`}>
                {internet.route === 'primary' ? 'Primary' : internet.route === '4g' ? '4G' : 'Offline'}
              </span>
            </div>

            {internet.history.length > 0 && (
              <div>
                <p className="text-xs text-white/40 mb-2">Failover history (last 24h)</p>
                <div className="space-y-1.5">
                  {internet.history.slice().reverse().map((event, i) => (
                    <div key={i} className="flex items-center justify-between text-xs bg-white/5 rounded-lg px-3 py-2">
                      <span className="text-white/60 font-mono">{new Date(event.timestamp).toLocaleTimeString()}</span>
                      <span className="text-white/80">{event.from} → {event.to}</span>
                      <span className="text-white/40 truncate max-w-[160px]">{event.reason}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-white/40">Unable to load internet status</p>
        )}
      </section>

      {/* Camera Status */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-3">Security Cameras</h2>
        {cameras.length === 0 ? (
          <p className="text-sm text-white/40">No cameras configured</p>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {cameras.map((cam) => (
              <div key={cam.id} className="card p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`dot ${cam.isOnline ? 'dot-green' : 'dot-red'}`} />
                  <span className="font-medium text-sm truncate">{cam.name}</span>
                </div>
                <p className="text-xs text-white/40 truncate">{cam.location || '(no location)'}</p>
                <p className="text-xs text-white/30 mt-1">{cam.isOnline ? 'Recording' : 'Offline'}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Confirm Dialog */}
      {confirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="card max-w-sm w-full space-y-4">
            <h3 className="font-bold text-lg">Restart {confirm.label}?</h3>
            <p className="text-sm text-white/60">This will briefly interrupt service. Active sessions may be affected. Are you sure?</p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirm(null)}
                className="flex-1 py-2.5 rounded-xl bg-[#0F172A] border border-white/10 text-sm hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleRestart(confirm.service)}
                className="flex-1 py-2.5 rounded-xl bg-red-500/80 text-white text-sm font-semibold hover:bg-red-500 transition-colors"
              >
                Restart
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
