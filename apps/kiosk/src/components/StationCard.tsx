import type { Station } from '@/lib/api';

const STATUS_STYLES: Record<Station['status'], { label: string; badge: string }> = {
  AVAILABLE: { label: 'Available', badge: 'bg-green-500 text-white' },
  ACTIVE:    { label: 'Active',    badge: 'bg-blue-500 text-white' },
  PENDING:   { label: 'Pending',   badge: 'bg-yellow-500 text-black' },
  FAULT:     { label: 'Fault',     badge: 'bg-red-500 text-white' },
};

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function StationCard({ 
  station, 
  onClick, 
  remainingSeconds, 
  isWarning 
}: { 
  station: Station; 
  onClick?: () => void;
  remainingSeconds?: number;
  isWarning?: boolean;
}) {
  const { label, badge } = STATUS_STYLES[station.status] ?? STATUS_STYLES.FAULT;
  const clickable = station.status === 'AVAILABLE' || station.status === 'ACTIVE';
  const warningClass = isWarning ? 'animate-pulse border-amber-500 bg-amber-900/20' : '';

  return (
    <div
      onClick={clickable ? onClick : undefined}
      className={`bg-[#1E293B] border border-white/10 rounded-xl p-6 flex flex-col gap-4 transition-colors ${
        clickable ? 'cursor-pointer hover:bg-[#263548] hover:border-white/20' : 'cursor-default opacity-80'
      } ${warningClass}`}
    >
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">{station.name}</h2>
        <span className={`text-xs font-bold px-3 py-1 rounded-full ${badge}`}>
          {label}
        </span>
      </div>
      <p className="text-sm text-white/40">
        {station.status === 'ACTIVE' && station.currentSession
          ? (remainingSeconds !== undefined ? `Time Remaining: ${formatTime(remainingSeconds)}` : `Session #${station.currentSession.id}`)
          : 'No active session'}
      </p>
    </div>
  );
}
