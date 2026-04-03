import request from 'supertest';
import app from '../../index';
import prisma from '../../lib/prisma';

jest.mock('../../lib/prisma', () => ({
  __esModule: true,
  default: {
    station: { findMany: jest.fn() },
    staff: { findFirst: jest.fn() },
  },
}));

const mp = prisma as jest.Mocked<typeof prisma>;
const ownerStaff = { id: 1, name: 'Owner', pin: '0000', role: 'OWNER', isActive: true };
const staffOnly = { id: 2, name: 'Staff', pin: '1111', role: 'STAFF', isActive: true };

beforeEach(() => {
  jest.clearAllMocks();
  (mp.station.findMany as jest.Mock).mockResolvedValue([
    { id: 1, name: 'Station 1', adbAddress: '192.168.1.101:5555', tuyaDeviceId: 'dev-001' },
    { id: 2, name: 'Station 2', adbAddress: '192.168.1.102:5555', tuyaDeviceId: 'dev-002' },
  ]);
});

describe('GET /api/hardware/status', () => {
  test('returns mock connection status for all stations (owner)', async () => {
    (mp.staff.findFirst as jest.Mock).mockResolvedValue(ownerStaff);

    const res = await request(app)
      .get('/api/hardware/status')
      .set('x-staff-pin', '0000');

    expect(res.status).toBe(200);
    expect(res.body.stations).toHaveLength(2);
    expect(res.body.stations[0]).toMatchObject({
      stationId: 1,
      name: 'Station 1',
      tvConnected: true,
      ledsConnected: true,
    });
  });

  test('allows non-owner staff', async () => {
    (mp.staff.findFirst as jest.Mock).mockResolvedValue(staffOnly);
    (mp.station.findMany as jest.Mock).mockResolvedValue([]);

    const res = await request(app)
      .get('/api/hardware/status')
      .set('x-staff-pin', '1111');

    expect(res.status).toBe(200);
  });

  test('requires authentication', async () => {
    const res = await request(app).get('/api/hardware/status');
    expect(res.status).toBe(401);
  });
});
