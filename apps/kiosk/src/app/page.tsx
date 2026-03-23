import { getStations } from '@/lib/api';
import StationCard from '@/components/StationCard';

export default async function Home() {
  const stations = await getStations();

  return (
    <div className="min-h-screen p-8">
      <header className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight">PlayStation Lounge</h1>
      </header>
      <main className="grid grid-cols-2 gap-6 max-w-3xl">
        {stations.map((station) => (
          <StationCard key={station.id} station={station} />
        ))}
      </main>
    </div>
  );
}
