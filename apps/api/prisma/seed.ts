import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  // ── Wipe existing data (order respects FK constraints) ─────────────────────
  await prisma.replayClip.deleteMany();
  await prisma.game.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.securityClip.deleteMany();
  await prisma.securityEvent.deleteMany();
  await prisma.securityCamera.deleteMany();
  await prisma.stationQueue.deleteMany();
  await prisma.station.updateMany({ data: { currentSessionId: null } });
  await prisma.session.deleteMany();
  await prisma.station.deleteMany();
  await prisma.staff.deleteMany();
  await prisma.settings.deleteMany();

  // ── Stations ────────────────────────────────────────────────────────────────
  await prisma.station.createMany({
    data: [
      { name: 'Station 1', adbAddress: '192.168.1.101:5555', tuyaDeviceId: '', captureDevice: '/dev/video0' },
      { name: 'Station 2', adbAddress: '192.168.1.102:5555', tuyaDeviceId: '', captureDevice: '/dev/video1' },
      { name: 'Station 3', adbAddress: '192.168.1.103:5555', tuyaDeviceId: '', captureDevice: '/dev/video2' },
      { name: 'Station 4', adbAddress: '192.168.1.104:5555', tuyaDeviceId: '', captureDevice: '/dev/video3' },
    ],
  });

  // ── Staff ───────────────────────────────────────────────────────────────────
  await prisma.staff.create({
    data: { name: 'Owner', pin: '0000', role: 'OWNER' },
  });

  // ── Settings (singleton id=1) ───────────────────────────────────────────────
  await prisma.settings.create({
    data: {
      id: 1,
      baseHourlyRate: 300,
      openingTime: '08:00',
      closingTime: '22:00',
    },
  });

  // ── Security cameras ────────────────────────────────────────────────────────
  await prisma.securityCamera.createMany({
    data: [
      { name: 'Counter',       location: 'Counter',         rtspUrl: '' },
      { name: 'Entrance',      location: 'Entrance',        rtspUrl: '' },
      { name: 'Stations 1-2',  location: 'Stations 1 & 2',  rtspUrl: '' },
      { name: 'Stations 3-4',  location: 'Stations 3 & 4',  rtspUrl: '' },
      { name: 'Back Room',     location: 'Back Room',        rtspUrl: '' },
    ],
  });

  console.log('✓ Seed complete');
  console.log('  4 stations   (Station 1–4, ADB 192.168.1.101–104:5555)');
  console.log('  1 staff      (Owner, PIN 0000)');
  console.log('  1 settings   (300 KES/hr, 08:00–22:00)');
  console.log('  5 cameras    (Counter, Entrance, Stations 1-2, Stations 3-4, Back Room)');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
