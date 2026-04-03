import request from 'supertest';
import app from '../../index';
import prisma from '../../lib/prisma';

jest.mock('../../lib/prisma', () => ({
  __esModule: true,
  default: {
    staff: { findFirst: jest.fn() },
    securityEvent: { create: jest.fn() },
  },
}));

const mp = prisma as jest.Mocked<typeof prisma>;
const ownerStaff = { id: 1, name: 'Owner', pin: '0000', role: 'OWNER', isActive: true };
const staffOnly  = { id: 2, name: 'Staff', pin: '1111', role: 'STAFF', isActive: true };

beforeEach(() => {
  jest.clearAllMocks();
  (mp.securityEvent.create as jest.Mock).mockResolvedValue({ id: 1 });
});

describe('POST /api/system/restart-service', () => {
  test('restarts api service and logs audit event (owner)', async () => {
    (mp.staff.findFirst as jest.Mock).mockResolvedValue(ownerStaff);

    const res = await request(app)
      .post('/api/system/restart-service')
      .set('x-staff-pin', '0000')
      .send({ service: 'api' });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.service).toBe('api');
    expect(mp.securityEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'ADMIN_OVERRIDE' }),
      })
    );
  });

  test('rejects invalid service name', async () => {
    (mp.staff.findFirst as jest.Mock).mockResolvedValue(ownerStaff);

    const res = await request(app)
      .post('/api/system/restart-service')
      .set('x-staff-pin', '0000')
      .send({ service: 'malicious-script' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_SERVICE');
  });

  test('rejects non-owner staff', async () => {
    (mp.staff.findFirst as jest.Mock).mockResolvedValue(staffOnly);

    const res = await request(app)
      .post('/api/system/restart-service')
      .set('x-staff-pin', '1111')
      .send({ service: 'api' });

    expect(res.status).toBe(403);
  });

  test('requires authentication', async () => {
    const res = await request(app)
      .post('/api/system/restart-service')
      .send({ service: 'api' });
    expect(res.status).toBe(401);
  });
});
