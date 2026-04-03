'use client';

import { useEffect, useState, useCallback } from 'react';
import { getEvents, type SecurityEvent } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

function formatTs(iso: string) {
  return new Date(iso).toLocaleString('en-KE', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

const EVENT_BADGE: Record<string, string> = {
  CASH_PAYMENT: 'badge-green',
  MPESA_PAYMENT: 'badge-blue',
  MPESA_TIMEOUT: 'badge-red',
  SESSION_START: 'badge-blue',
  SESSION_END: 'badge-gray',
  SESSION_EXTENDED: 'badge-purple',
  SESSION_TRANSFER: 'badge-purple',
  HARDWARE_FAULT: 'badge-red',
  FREE_TIME_GRANTED: 'badge-amber',
  ADMIN_OVERRIDE: 'badge-amber',
  SHIFT_START: 'badge-green',
  SHIFT_END: 'badge-gray',
  POWER_LOSS: 'badge-red',
  POWER_RESTORE: 'badge-green',
  STATION_FAULT: 'badge-red',
  SYSTEM_STARTUP: 'badge-gray',
};

const EVENT_TYPES = [
  'CASH_PAYMENT', 'MPESA_PAYMENT', 'MPESA_TIMEOUT',
  'SESSION_START', 'SESSION_END', 'SESSION_EXTENDED', 'SESSION_TRANSFER',
  'HARDWARE_FAULT', 'FREE_TIME_GRANTED', 'ADMIN_OVERRIDE',
  'SHIFT_START', 'SHIFT_END', 'POWER_LOSS', 'POWER_RESTORE', 'STATION_FAULT',
];

export default function SecurityTab() {
  const { pin } = useAuth();
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);
  const [limit, setLimit] = useState(100);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getEvents(pin, { type: filterType || undefined, limit });
      setEvents(data);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [pin, filterType, limit]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="card h-48 animate-pulse bg-white/5" />;

  return (
    <div className="space-y-4 fade-in">
      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-center">
        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
          className="px-3 py-2 rounded-lg bg-[#1E293B] border border-white/10 text-sm text-white/80 outline-none focus:border-[#2563EB]"
        >
          <option value="">All Event Types</option>
          {EVENT_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
        </select>
        <span className="text-xs text-white/40">{events.length} events</span>
        <div className="flex-1" />
        <button onClick={load} className="px-3 py-2 rounded-lg bg-[#1E293B] border border-white/10 text-xs hover:bg-[#263548] transition-colors">
          Refresh
        </button>
      </div>

      {events.length === 0 ? (
        <p className="text-sm text-white/40 text-center py-12">No security events found</p>
      ) : (
        <div className="card p-0 overflow-hidden">
          <div className="divide-y divide-white/5">
            {events.map((ev) => {
              const isExpanded = expanded === ev.id;
              return (
                <div key={ev.id}>
                  <button
                    onClick={() => setExpanded(isExpanded ? null : ev.id)}
                    className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-white/3 transition-colors"
                  >
                    <span className={`badge shrink-0 mt-0.5 ${EVENT_BADGE[ev.type] ?? 'badge-gray'}`}>
                      {ev.type.replace(/_/g, ' ')}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white/80 truncate">{ev.description}</p>
                      <div className="flex gap-3 mt-0.5 text-xs text-white/40">
                        <span>{formatTs(ev.timestamp)}</span>
                        {ev.staffPin && <span>PIN {ev.staffPin}</span>}
                        {ev.stationId && <span>Station {ev.stationId}</span>}
                      </div>
                    </div>
                    <span className="text-white/20 text-xs mt-1 shrink-0">{isExpanded ? '▲' : '▼'}</span>
                  </button>

                  {isExpanded && (
                    <div className="px-4 pb-3 bg-white/2">
                      {ev.metadata ? (
                        <pre className="text-xs text-white/50 bg-black/20 rounded-lg p-3 overflow-auto max-h-40">
                          {JSON.stringify(ev.metadata, null, 2)}
                        </pre>
                      ) : (
                        <p className="text-xs text-white/30">No metadata</p>
                      )}
                      {/* Placeholder for camera clips link */}
                      <p className="text-xs text-white/30 mt-2 italic">Camera clips: available after video pipeline is running</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {events.length >= limit && (
        <button
          onClick={() => setLimit(l => l + 100)}
          className="w-full py-2.5 rounded-xl bg-[#1E293B] border border-white/10 text-sm hover:bg-[#263548] transition-colors"
        >
          Load more
        </button>
      )}
    </div>
  );
}
