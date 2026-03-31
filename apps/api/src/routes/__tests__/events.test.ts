import request from 'supertest';
import app from '../../index';
import prisma from '../../lib/prisma';

jest.mock('../../lib/prisma', () => ({
  __esModule: true,
  default: {
    securityEvent: { findMany: jest.fn() },
    staff: { findFirst: jest.fn() },
  },
}));

const mp = prisma as jest.Mocked<typeof prisma>;
const ownerStaff = { id: 1, name: 'Owner', pin: '0000', role: 'OWNER', isActive: true };
const staffOnly = { id: 2, name: 'Staff', pin: '1111', role: 'STAFF', isActive: true };

const makeEvent = (id: number, type = 'SESSION_START') => ({
  id,
  type,
  description: `Event ${id}`,
  staffPin: '0000',
  stationId: 1,
  timestamp: new Date().toISOString(),
  metadata: null,
  clipsGenerated: true,
});

beforeEach(() => jest.clearAllMocks());

describe('GET /api/events', () => {
  test('returns events for owner', async () => {
    (mp.staff.findFirst as jest.Mock).mockResolvedValue(ownerStaff);
    (mp.securityEvent.findMany as jest.Mock).mockResolvedValue([makeEvent(1), makeEvent(2)]);

    const res = await request(app).get('/api/events').set('x-staff-pin', '0000');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  test('filters by type', async () => {
    (mp.staff.findFirst as jest.Mock).mockResolvedValue(ownerStaff);
    (mp.securityEvent.findMany as jest.Mock).mockResolvedValue([makeEvent(1, 'CASH_PAYMENT')]);

    const res = await request(app)
      .get('/api/events?type=CASH_PAYMENT')
      .set('x-staff-pin', '0000');

    expect(res.status).toBe(200);
    expect(mp.securityEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ type: 'CASH_PAYMENT' }),
      })
    );
  });

  test('respects limit query param', async () => {
    (mp.staff.findFirst as jest.Mock).mockResolvedValue(ownerStaff);
    (mp.securityEvent.findMany as jest.Mock).mockResolvedValue([]);

    await request(app).get('/api/events?limit=10').set('x-staff-pin', '0000');

    expect(mp.securityEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 10 })
    );
  });

  test('returns 403 for non-owner staff', async () => {
    (mp.staff.findFirst as jest.Mock).mockResolvedValue(staffOnly);

    const res = await request(app).get('/api/events').set('x-staff-pin', '1111');

    expect(res.status).toBe(403);
  });

  test('returns 401 without auth', async () => {
    const res = await request(app).get('/api/events');
    expect(res.status).toBe(401);
  });
});
