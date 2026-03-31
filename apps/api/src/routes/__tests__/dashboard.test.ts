import request from 'supertest';
import app from '../../index';
import prisma from '../../lib/prisma';

jest.mock('../../lib/prisma', () => ({
  __esModule: true,
  default: {
    transaction: { findMany: jest.fn() },
    session: { findMany: jest.fn() },
    securityEvent: { findMany: jest.fn() },
    station: { findMany: jest.fn() },
    staff: { findFirst: jest.fn() },
  },
}));

const mp = prisma as jest.Mocked<typeof prisma>;
const ownerStaff = { id: 1, name: 'Owner', pin: '0000', role: 'OWNER', isActive: true };
const staffOnly = { id: 2, name: 'Staff', pin: '1111', role: 'STAFF', isActive: true };

const stations = [
  { id: 1, name: 'Station 1', status: 'ACTIVE' },
  { id: 2, name: 'Station 2', status: 'AVAILABLE' },
  { id: 3, name: 'Station 3', status: 'AVAILABLE' },
  { id: 4, name: 'Station 4', status: 'AVAILABLE' },
];

beforeEach(() => jest.clearAllMocks());

describe('GET /api/dashboard', () => {
  test('returns dashboard data for owner', async () => {
    (mp.staff.findFirst as jest.Mock).mockResolvedValue(ownerStaff);
    // completedTxs (first call) needs session.stationId
    // allTxs (second call) needs session.stationId AND session.station.name
    // mockResolvedValue returns the same value for both calls, so include the full shape
    (mp.transaction.findMany as jest.Mock).mockResolvedValue([
      { id: 1, amount: 300, session: { stationId: 1, station: { name: 'Station 1' } } },
      { id: 2, amount: 150, session: { stationId: 1, station: { name: 'Station 1' } } },
    ]);
    (mp.session.findMany as jest.Mock).mockResolvedValue([
      { id: 1, stationId: 1, durationMinutes: 60, startTime: new Date().toISOString(), station: { id: 1, name: 'Station 1' } },
    ]);
    (mp.securityEvent.findMany as jest.Mock).mockResolvedValue([]);
    (mp.station.findMany as jest.Mock).mockResolvedValue(stations);

    const res = await request(app).get('/api/dashboard').set('x-staff-pin', '0000');

    expect(res.status).toBe(200);
    expect(res.body.todayRevenue).toBe(450);
    expect(res.body.todayRevenueByStation).toHaveLength(4);
    expect(res.body.todayRevenueByStation.find((s: any) => s.stationId === 1).revenue).toBe(450);
    expect(res.body.activeSessions).toHaveLength(1);
    expect(res.body.recentEvents).toBeDefined();
  });

  test('todayRevenue is 0 with no transactions', async () => {
    (mp.staff.findFirst as jest.Mock).mockResolvedValue(ownerStaff);
    (mp.transaction.findMany as jest.Mock).mockResolvedValue([]);
    (mp.session.findMany as jest.Mock).mockResolvedValue([]);
    (mp.securityEvent.findMany as jest.Mock).mockResolvedValue([]);
    (mp.station.findMany as jest.Mock).mockResolvedValue(stations);

    const res = await request(app).get('/api/dashboard').set('x-staff-pin', '0000');

    expect(res.status).toBe(200);
    expect(res.body.todayRevenue).toBe(0);
  });

  test('returns dashboard data for regular staff (requireStaff allows it)', async () => {
    (mp.staff.findFirst as jest.Mock).mockResolvedValue(staffOnly);
    (mp.transaction.findMany as jest.Mock).mockResolvedValue([]);
    (mp.session.findMany as jest.Mock).mockResolvedValue([]);
    (mp.securityEvent.findMany as jest.Mock).mockResolvedValue([]);
    (mp.station.findMany as jest.Mock).mockResolvedValue(stations);

    const res = await request(app).get('/api/dashboard').set('x-staff-pin', '1111');

    expect(res.status).toBe(200);
    expect(res.body.todayRevenue).toBe(0);
  });

  test('returns 401 without auth', async () => {
    const res = await request(app).get('/api/dashboard');
    expect(res.status).toBe(401);
  });
});
