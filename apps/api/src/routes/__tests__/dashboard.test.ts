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

const makeStation = (id: number) => ({ id, name: `Station ${id}` });

beforeEach(() => {
  jest.clearAllMocks();
  (mp.staff.findFirst as jest.Mock).mockResolvedValue(ownerStaff);
  (mp.transaction.findMany as jest.Mock).mockResolvedValue([]);
  (mp.session.findMany as jest.Mock).mockResolvedValue([]);
  (mp.securityEvent.findMany as jest.Mock).mockResolvedValue([]);
  (mp.station.findMany as jest.Mock).mockResolvedValue([1, 2, 3, 4].map(makeStation));
});

describe('GET /api/dashboard', () => {
  test('returns revenue summary for owner', async () => {
    const res = await request(app)
      .get('/api/dashboard')
      .set('x-staff-pin', '0000');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      todayRevenue: 0,
      todayRevenueByStation: expect.arrayContaining([
        expect.objectContaining({ stationId: 1, revenue: 0 }),
      ]),
      activeSessions: [],
      sessionsCount: 0,
      avgDurationMinutes: 0,
    });
  });

  test('aggregates today revenue correctly', async () => {
    (mp.transaction.findMany as jest.Mock)
      .mockResolvedValueOnce([
        { id: 1, amount: 150, method: 'CASH', status: 'COMPLETED', createdAt: new Date(), session: { stationId: 1 } },
        { id: 2, amount: 300, method: 'CASH', status: 'COMPLETED', createdAt: new Date(), session: { stationId: 2 } },
      ])
      .mockResolvedValueOnce([
        { id: 1, amount: 150, method: 'CASH', status: 'COMPLETED', createdAt: new Date(), session: { stationId: 1, station: { name: 'Station 1' } } },
      ]);

    const res = await request(app)
      .get('/api/dashboard')
      .set('x-staff-pin', '0000');

    expect(res.status).toBe(200);
    expect(res.body.todayRevenue).toBe(450);
  });

  test('requires authentication', async () => {
    const res = await request(app).get('/api/dashboard');
    expect(res.status).toBe(401);
  });
});
