'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import PinLogin from '@/components/PinLogin';
import StationCard from '@/components/StationCard';
import BookingModal from '@/components/BookingModal';
import { getStations, getSettings, type Station, type Settings } from '@/lib/api';
import { useSocket } from '@/hooks/useSocket';
import ActiveSessionPanel from '@/components/ActiveSessionPanel';

export default function Home() {
  const { isLoggedIn, staffName, pin, logout } = useAuth();
  const [stations, setStations] = useState<Station[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [selectedStation, setSelectedStation] = useState<Station | null>(null);
  const [activeStation, setActiveStation] = useState<Station | null>(null);
  const [extendSessionId, setExtendSessionId] = useState<number | null>(null);

  const refreshStations = useCallback(() => {
    if (!pin) return;
    getStations(pin).then(setStations).catch(console.error);
  }, [pin]);

  const { ticks, warnings } = useSocket({
    onStationUpdated: refreshStations,
    onQueueUpdated: refreshStations,
    onSessionEnded: refreshStations,
  });

  useEffect(() => {
    if (!isLoggedIn) return;
    refreshStations();
    getSettings(pin).then(setSettings).catch(console.error);
  }, [isLoggedIn, pin, refreshStations]);

  if (!isLoggedIn) return <PinLogin />;

  return (
    <div className="min-h-screen p-8">
      <header className="mb-10 flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">PlayStation Lounge</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-white/50">Staff: <span className="text-white font-medium">{staffName}</span></span>
          <button
            onClick={logout}
            className="text-sm px-4 py-2 rounded-lg bg-[#1E293B] border border-white/10 hover:bg-[#263548] transition-colors"
          >
            Log Out
          </button>
        </div>
      </header>

      <main className="grid grid-cols-2 gap-6 max-w-3xl">
        {stations.map((station) => (
          <StationCard
            key={station.id}
            station={station}
            onClick={() => {
              if (station.status === 'ACTIVE') setActiveStation(station);
              else setSelectedStation(station);
            }}
            remainingSeconds={ticks[station.id]}
            isWarning={warnings[station.id]}
          />
        ))}
      </main>

      {selectedStation && settings && (
        <BookingModal
          station={selectedStation}
          settings={settings}
          onClose={() => setSelectedStation(null)}
          onSuccess={() => {
            setSelectedStation(null);
            refreshStations();
          }}
        />
      )}

      {activeStation && settings && extendSessionId == null && (
        <ActiveSessionPanel
          station={activeStation}
          settings={settings}
          remainingSeconds={ticks[activeStation.id]}
          onClose={() => setActiveStation(null)}
          onSuccess={() => {
            setActiveStation(null);
            refreshStations();
          }}
          onExtend={(sessionId) => setExtendSessionId(sessionId)}
        />
      )}

      {activeStation && settings && extendSessionId != null && (
        <BookingModal
          station={activeStation}
          settings={settings}
          extensionSessionId={extendSessionId}
          onClose={() => setExtendSessionId(null)}
          onSuccess={() => {
            setExtendSessionId(null);
            setActiveStation(null);
            refreshStations();
          }}
        />
      )}
    </div>
  );
}
