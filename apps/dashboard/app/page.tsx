'use client';

import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import PinLogin from '@/components/PinLogin';
import OverviewTab from '@/components/OverviewTab';
import HistoryTab from '@/components/HistoryTab';
import SecurityTab from '@/components/SecurityTab';
import SystemTab from '@/components/SystemTab';

type Tab = 'overview' | 'history' | 'security' | 'system';

export default function DashboardPage() {
  const { isLoggedIn, name, logout } = useAuth();
  const [tab, setTab] = useState<Tab>('overview');

  if (!isLoggedIn) return <PinLogin />;

  const TABS: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'history', label: 'Session History' },
    { key: 'security', label: 'Security' },
    { key: 'system', label: 'System' },
  ];

  return (
    <div className="min-h-screen">
      {/* Top Nav */}
      <header className="sticky top-0 z-10 border-b border-white/8 bg-[#0F172A]/80 backdrop-blur-xl px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-6">
            {/* Logo */}
            <div className="flex items-center gap-2 mr-2">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6 text-[#2563EB]">
                <rect x="3" y="3" width="18" height="18" rx="3" />
                <path d="M3 9h18M9 21V9" />
              </svg>
              <span className="font-bold text-sm tracking-tight hidden sm:block">Neo Lounge</span>
            </div>

            {/* Tabs */}
            <nav className="flex gap-1">
              {TABS.map(({ key, label }) => (
                <button
                  key={key}
                  id={`tab-${key}`}
                  onClick={() => setTab(key)}
                  className={`tab-btn ${tab === key ? 'active' : ''}`}
                >
                  {label}
                </button>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-xs text-white/40 hidden sm:block">
              Owner: <span className="text-white/70 font-medium">{name}</span>
            </span>
            <button
              onClick={logout}
              className="text-xs px-3 py-1.5 rounded-lg bg-[#1E293B] border border-white/10 hover:bg-[#263548] transition-colors"
            >
              Log Out
            </button>
          </div>
        </div>
      </header>

      {/* Page Content */}
      <main className="max-w-7xl mx-auto px-6 py-6">
        {tab === 'overview' && <OverviewTab />}
        {tab === 'history' && <HistoryTab />}
        {tab === 'security' && <SecurityTab />}
        {tab === 'system' && <SystemTab />}
      </main>
    </div>
  );
}
