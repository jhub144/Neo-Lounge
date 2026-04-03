'use client';

import { useEffect, useState, useCallback } from 'react';
import { getSessions, type SessionHistoryEntry } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-KE', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

function formatDuration(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

const METHOD_BADGE: Record<string, string> = {
  CASH: 'badge-green',
  MPESA: 'badge-blue',
};

const STATUS_BADGE: Record<string, string> = {
  ACTIVE: 'badge-blue',
  COMPLETED: 'badge-gray',
  POWER_INTERRUPTED: 'badge-amber',
};

const PAGE_SIZE = 20;

export default function HistoryTab() {
  const { pin } = useAuth();
  const [sessions, setSessions] = useState<SessionHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [filterStation, setFilterStation] = useState('');
  const [filterMethod, setFilterMethod] = useState('');
  const [page, setPage] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getSessions(pin);
      setSessions(data);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [pin]);

  useEffect(() => { load(); }, [load]);

  const filtered = sessions.filter((s) => {
    if (filterStation && String(s.stationId) !== filterStation) return false;
    if (filterMethod) {
      const hasMethods = s.transactions.some(t => t.method === filterMethod);
      if (!hasMethods) return false;
    }
    return true;
  });

  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  if (loading) return <div className="card h-48 animate-pulse bg-white/5" />;

  const stationIds = [...new Set(sessions.map(s => s.stationId))].sort();

  return (
    <div className="space-y-4 fade-in">
      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <select
          value={filterStation}
          onChange={e => { setFilterStation(e.target.value); setPage(0); }}
          className="px-3 py-2 rounded-lg bg-[#1E293B] border border-white/10 text-sm text-white/80 outline-none focus:border-[#2563EB]"
        >
          <option value="">All Stations</option>
          {stationIds.map(id => <option key={id} value={String(id)}>Station {id}</option>)}
        </select>
        <select
          value={filterMethod}
          onChange={e => { setFilterMethod(e.target.value); setPage(0); }}
          className="px-3 py-2 rounded-lg bg-[#1E293B] border border-white/10 text-sm text-white/80 outline-none focus:border-[#2563EB]"
        >
          <option value="">All Methods</option>
          <option value="CASH">Cash</option>
          <option value="MPESA">M-Pesa</option>
        </select>
        <span className="self-center text-xs text-white/40">{filtered.length} sessions</span>
      </div>

      {/* Table */}
      {paginated.length === 0 ? (
        <p className="text-sm text-white/40 text-center py-12">No sessions found</p>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-white/8">
              <tr className="text-left">
                {['Station', 'Start', 'End', 'Duration', 'Total', 'Method', 'Staff', 'Status'].map(h => (
                  <th key={h} className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-white/40">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginated.map((s) => {
                const totalPaid = s.transactions.filter(t => t.status === 'COMPLETED').reduce((sum, t) => sum + t.amount, 0);
                const methods = [...new Set(s.transactions.map(t => t.method))];
                const isExpanded = expanded === s.id;
                return (
                  <>
                    <tr
                      key={s.id}
                      onClick={() => setExpanded(isExpanded ? null : s.id)}
                      className="border-b border-white/5 hover:bg-white/4 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3 font-medium">{s.station.name}</td>
                      <td className="px-4 py-3 text-white/70">{formatDate(s.startTime)}</td>
                      <td className="px-4 py-3 text-white/70">{s.endTime ? formatDate(s.endTime) : '—'}</td>
                      <td className="px-4 py-3">{formatDuration(s.durationMinutes)}</td>
                      <td className="px-4 py-3 font-semibold text-[#22C55E]">KES {totalPaid}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          {methods.map(m => <span key={m} className={`badge ${METHOD_BADGE[m] ?? 'badge-gray'}`}>{m}</span>)}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-white/50 font-mono text-xs">{s.staffPin}</td>
                      <td className="px-4 py-3">
                        <span className={`badge ${STATUS_BADGE[s.status] ?? 'badge-gray'}`}>{s.status}</span>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${s.id}-exp`} className="bg-white/2 border-b border-white/5">
                        <td colSpan={8} className="px-4 py-3">
                          <p className="text-xs font-semibold uppercase text-white/40 mb-2">Transactions</p>
                          <div className="space-y-1">
                            {s.transactions.map(tx => (
                              <div key={tx.id} className="flex gap-4 text-xs text-white/70">
                                <span className={`badge ${METHOD_BADGE[tx.method] ?? 'badge-gray'}`}>{tx.method}</span>
                                <span>KES {tx.amount}</span>
                                <span className={tx.status === 'COMPLETED' ? 'text-[#22C55E]' : 'text-red-400'}>{tx.status}</span>
                                <span>{formatDate(tx.createdAt)}</span>
                                <span className="font-mono">PIN {tx.staffPin}</span>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <button
            disabled={page === 0}
            onClick={() => setPage(p => p - 1)}
            className="px-4 py-2 rounded-lg bg-[#1E293B] border border-white/10 text-sm disabled:opacity-30 hover:bg-[#263548] transition-colors"
          >
            Previous
          </button>
          <span className="text-xs text-white/40">Page {page + 1} of {totalPages}</span>
          <button
            disabled={page >= totalPages - 1}
            onClick={() => setPage(p => p + 1)}
            className="px-4 py-2 rounded-lg bg-[#1E293B] border border-white/10 text-sm disabled:opacity-30 hover:bg-[#263548] transition-colors"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
