'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { getDashboard, type DashboardResponse } from '@/lib/api';
import { useSocket } from '@/hooks/useSocket';

export default function ShiftLog() {
  const { pin } = useAuth();
  const [data, setData] = useState<DashboardResponse | null>(null);

  const fetchDashboard = useCallback(() => {
    if (!pin) return;
    getDashboard(pin).then(setData).catch(() => {
      // Silently ignore — API may not be ready yet; interval will retry
    });
  }, [pin]);

  // Refresh whenever sessions or stations change via WebSocket
  useSocket({
    onStationUpdated: fetchDashboard,
    onSessionEnded: fetchDashboard,
    onQueueUpdated: fetchDashboard,
  });

  useEffect(() => {
    if (!pin) return;
    fetchDashboard();
    const interval = setInterval(fetchDashboard, 15000);
    return () => clearInterval(interval);
  }, [pin, fetchDashboard]);

  if (!data) return (
    <div className="bg-[#1E293B] border border-white/10 rounded-xl p-6 h-full flex flex-col">
      <h2 className="text-xl font-bold mb-4">Shift Log</h2>
      <p className="text-white/40 text-sm">Loading...</p>
    </div>
  );

  return (
    <div className="bg-[#1E293B] border border-white/10 rounded-xl p-6 h-full flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-bold mb-3">Shift Log</h2>
        <div className="bg-[#0F172A] rounded-xl px-4 py-6 text-center border border-emerald-500/20 shadow-inner">
          <p className="text-xs text-emerald-400 mb-1 uppercase tracking-widest font-semibold opacity-80">Today's Revenue</p>
          <p className="text-4xl font-mono font-bold text-emerald-400 tracking-tight">
            {data.todayRevenue} <span className="text-sm font-sans text-emerald-600 font-medium">KES</span>
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 flex flex-col gap-3 pr-2 custom-scrollbar">
        <h3 className="text-xs font-semibold text-white/50 uppercase tracking-widest sticky top-0 bg-[#1E293B] py-2 z-10">
          Recent Transactions
        </h3>
        {data.recentTransactions.length === 0 ? (
          <p className="text-white/40 text-sm italic">No transactions today</p>
        ) : (
          data.recentTransactions.map(tx => (
            <div key={tx.id} className={`bg-[#0F172A] border rounded-xl p-3 flex flex-col gap-1.5 transition-colors ${
              tx.status === 'COMPLETED'
                ? 'border-white/5 hover:border-white/10'
                : 'border-amber-500/15 opacity-60'
            }`}>
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sm">{tx.stationName}</span>
                <span className={`font-mono font-medium ${
                  tx.status === 'COMPLETED' ? 'text-emerald-400' : 'text-amber-400'
                }`}>
                  {tx.status === 'COMPLETED' ? '+' : ''}{tx.amount}
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-white/40 font-medium">
                <span>{new Date(tx.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                <div className="flex items-center gap-1">
                  {tx.status !== 'COMPLETED' && (
                    <span className="bg-amber-500/10 text-amber-400 px-1.5 py-0.5 rounded border border-amber-500/20 uppercase tracking-wide">
                      Pending
                    </span>
                  )}
                  <span className="bg-white/5 px-2 py-0.5 rounded text-white/50 border border-white/5 uppercase tracking-wide">
                    {tx.method === 'MPESA' ? 'M-Pesa' : tx.method}
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
