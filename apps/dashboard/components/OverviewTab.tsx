'use client';

import { useEffect, useState, useCallback } from 'react';
import { getDashboard, getStations, type DashboardData, type Station } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { useAuth } from '@/context/AuthContext';

function formatKES(n: number) { return `KES ${n.toLocaleString()}`; }
function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' });
}
function elapsed(startIso: string): string {
  const mins = Math.floor((Date.now() - new Date(startIso).getTime()) / 60000);
  return `${mins}m`;
}

const STATUS_BADGE: Record<string, string> = {
  AVAILABLE: 'badge-green',
  ACTIVE: 'badge-blue',
  PENDING: 'badge-amber',
  FAULT: 'badge-red',
};

export default function OverviewTab() {
  const { pin } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [stations, setStations] = useState<Station[]>([]);
  const [loading, setLoading] = useState(true);
  const [ticks, setTicks] = useState<Record<number, number>>({});

  const refresh = useCallback(async () => {
    try {
      const [dash, sts] = await Promise.all([getDashboard(pin), getStations(pin)]);
      setData(dash);
      setStations(sts);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [pin]);

  // Initial load + auto-refresh every 60s
  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 60_000);
    return () => clearInterval(interval);
  }, [refresh]);

  // WebSocket real-time
  useEffect(() => {
    const socket = getSocket();
    socket.connect();

    const onStationUpdated = () => refresh();
    const onSessionEnded = () => refresh();
    const onTick = ({ stationId, remaining }: { stationId: number; remaining: number }) => {
      setTicks((prev) => ({ ...prev, [stationId]: remaining }));
    };

    socket.on('station:updated', onStationUpdated);
    socket.on('session:ended', onSessionEnded);
    socket.on('session:tick', onTick);

    return () => {
      socket.off('station:updated', onStationUpdated);
      socket.off('session:ended', onSessionEnded);
      socket.off('session:tick', onTick);
      socket.disconnect();
    };
  }, [refresh]);

  if (loading) return (
    <div className="space-y-6">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="card h-32 animate-pulse bg-white/5" />
      ))}
    </div>
  );

  if (!data) return <p className="text-white/50 text-sm">Failed to load dashboard data.</p>;

  const cashTotal = data.recentTransactions.filter(t => t.method === 'CASH' && t.status === 'COMPLETED').reduce((s, t) => s + t.amount, 0);
  const mpesaTotal = data.recentTransactions.filter(t => t.method === 'MPESA' && t.status === 'COMPLETED').reduce((s, t) => s + t.amount, 0);
  const totalPaid = cashTotal + mpesaTotal;
  const cashPct = totalPaid > 0 ? Math.round((cashTotal / totalPaid) * 100) : 0;
  const mpesaPct = totalPaid > 0 ? 100 - cashPct : 0;

  const avgDuration = data.activeSessions.length > 0
    ? Math.round(data.activeSessions.reduce((s, sess) => s + sess.durationMinutes, 0) / data.activeSessions.length)
    : 0;

  return (
    <div className="space-y-6 fade-in">
      {/* Revenue Section */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-3">Revenue — Today</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Total */}
          <div className="card col-span-2 lg:col-span-1">
            <p className="stat-label">Total Revenue</p>
            <p className="stat-value text-[#22C55E]">{formatKES(data.todayRevenue)}</p>
          </div>
          {/* Sessions */}
          <div className="card">
            <p className="stat-label">Sessions Today</p>
            <p className="stat-value">{data.recentTransactions.length}</p>
          </div>
          {/* Avg duration */}
          <div className="card">
            <p className="stat-label">Avg Duration</p>
            <p className="stat-value">{avgDuration}<span className="text-base font-normal text-white/50 ml-1">min</span></p>
          </div>
          {/* Cash vs MPesa */}
          <div className="card">
            <p className="stat-label">Cash / M-Pesa</p>
            <p className="stat-value text-lg">{cashPct}% / {mpesaPct}%</p>
            <div className="progress-bar mt-2">
              <div className="progress-fill bg-[#22C55E]" style={{ width: `${cashPct}%` }} />
            </div>
          </div>
        </div>
      </section>

      {/* Per-station revenue */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-3">Revenue by Station</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {data.todayRevenueByStation.map((s) => (
            <div key={s.stationId} className="card">
              <p className="stat-label">{s.name}</p>
              <p className="stat-value text-base">{formatKES(s.revenue)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Live Station Grid */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-3">Live Stations</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {stations.map((station) => {
            const activeSession = data.activeSessions.find(s => s.stationId === station.id);
            const remaining = ticks[station.id];
            const mm = remaining !== undefined ? Math.floor(remaining / 60).toString().padStart(2, '0') : '--';
            const ss = remaining !== undefined ? (remaining % 60).toString().padStart(2, '0') : '--';

            return (
              <div key={station.id} className="card">
                <div className="flex items-center justify-between mb-3">
                  <span className="font-semibold text-sm">{station.name}</span>
                  <span className={`badge ${STATUS_BADGE[station.status] ?? 'badge-gray'}`}>
                    {station.status}
                  </span>
                </div>

                {activeSession ? (
                  <div>
                    <p className="text-2xl font-mono font-bold text-[#2563EB]">{mm}:{ss}</p>
                    <p className="text-xs text-white/40 mt-1">Since {formatTime(activeSession.startTime)}</p>
                    <p className="text-xs text-white/40">
                      {formatKES(data.recentTransactions.filter(t => t.stationName === station.name && t.status === 'COMPLETED').reduce((s, t) => s + t.amount, 0))} paid
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-white/30 mt-1">
                    {station.status === 'AVAILABLE' ? 'No active session' : station.status === 'FAULT' ? 'Station fault' : 'Waiting…'}
                  </p>
                )}

                {activeSession && (
                  <p className="text-xs text-white/30 mt-2">{elapsed(activeSession.startTime)} elapsed</p>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
