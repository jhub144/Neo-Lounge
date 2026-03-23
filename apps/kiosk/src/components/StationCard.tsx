import type { Station } from '@/lib/api';

const STATUS_STYLES: Record<Station['status'], { label: string; badge: string }> = {
  AVAILABLE: { label: 'Available', badge: 'bg-green-500 text-white' },
  ACTIVE:    { label: 'Active',    badge: 'bg-blue-500 text-white' },
  PENDING:   { label: 'Pending',   badge: 'bg-yellow-500 text-black' },
  FAULT:     { label: 'Fault',     badge: 'bg-red-500 text-white' },
};

export default function StationCard({ station }: { station: Station }) {
  const { label, badge } = STATUS_STYLES[station.status] ?? STATUS_STYLES.FAULT;

  return (
    <div className="bg-[#1E293B] border border-white/10 rounded-xl p-6 flex flex-col gap-4 cursor-pointer transition-colors hover:bg-[#263548] hover:border-white/20">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">{station.name}</h2>
        <span className={`text-xs font-bold px-3 py-1 rounded-full ${badge}`}>
          {label}
        </span>
      </div>
      <p className="text-sm text-white/40">
        {station.status === 'ACTIVE' && station.currentSessionId
          ? `Session #${station.currentSessionId}`
          : 'No active session'}
      </p>
    </div>
  );
}
