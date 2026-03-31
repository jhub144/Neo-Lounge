import request from 'supertest';
import app from '../../index';
import prisma from '../../lib/prisma';

jest.mock('../../lib/prisma', () => ({
  __esModule: true,
  default: {
    settings: { findUnique: jest.fn(), update: jest.fn() },
    securityEvent: { create: jest.fn() },
    staff: { findFirst: jest.fn() },
  },
}));

const mp = prisma as jest.Mocked<typeof prisma>;
const ownerStaff = { id: 1, name: 'Owner', pin: '0000', role: 'OWNER', isActive: true };
const staffOnly = { id: 2, name: 'Staff', pin: '1111', role: 'STAFF', isActive: true };

const defaultSettings = {
  id: 1,
  baseHourlyRate: 300,
  openingTime: '08:00',
  closingTime: '22:00',
  replayTTLMinutes: 60,
};

beforeEach(() => jest.clearAllMocks());

describe('GET /api/settings', () => {
  test('returns settings without auth', async () => {
    (mp.settings.findUnique as jest.Mock).mockResolvedValue(defaultSettings);

    const res = await request(app).get('/api/settings');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ baseHourlyRate: 300 });
  });

  test('returns 404 if settings not found', async () => {
    (mp.settings.findUnique as jest.Mock).mockResolvedValue(null);

    const res = await request(app).get('/api/settings');

    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/settings', () => {
  test('updates settings as owner', async () => {
    (mp.staff.findFirst as jest.Mock).mockResolvedValue(ownerStaff);
    (mp.settings.update as jest.Mock).mockResolvedValue({ ...defaultSettings, baseHourlyRate: 400 });
    (mp.securityEvent.create as jest.Mock).mockResolvedValue({});

    const res = await request(app)
      .patch('/api/settings')
      .set('x-staff-pin', '0000')
      .send({ baseHourlyRate: 400 });

    expect(res.status).toBe(200);
    expect(res.body.baseHourlyRate).toBe(400);
    expect(mp.securityEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'ADMIN_OVERRIDE' }),
      })
    );
  });

  test('returns 403 for non-owner staff', async () => {
    (mp.staff.findFirst as jest.Mock).mockResolvedValue(staffOnly);

    const res = await request(app)
      .patch('/api/settings')
      .set('x-staff-pin', '1111')
      .send({ baseHourlyRate: 400 });

    expect(res.status).toBe(403);
  });

  test('returns 401 without auth', async () => {
    const res = await request(app).patch('/api/settings').send({ baseHourlyRate: 400 });
    expect(res.status).toBe(401);
  });
});
