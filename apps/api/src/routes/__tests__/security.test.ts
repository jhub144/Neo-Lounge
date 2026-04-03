import request from 'supertest';
import app from '../../index';
import prisma from '../../lib/prisma';

jest.mock('../../lib/prisma', () => ({
  __esModule: true,
  default: {
    staff: { findFirst: jest.fn() },
    securityCamera: { findMany: jest.fn() },
    securityClip: { findMany: jest.fn(), findUnique: jest.fn(), delete: jest.fn() },
    securityEvent: { create: jest.fn() },
  },
}));

const mp = prisma as jest.Mocked<typeof prisma>;
const ownerStaff = { id: 1, name: 'Owner', pin: '0000', role: 'OWNER', isActive: true };
const staffOnly  = { id: 2, name: 'Staff', pin: '1111', role: 'STAFF', isActive: true };

const makeCameras = () => [
  { id: 1, name: 'Counter', rtspUrl: '', isOnline: false, location: 'Front' },
  { id: 2, name: 'Entrance', rtspUrl: '', isOnline: true,  location: 'Door' },
];

beforeEach(() => {
  jest.clearAllMocks();
  (mp.securityEvent.create as jest.Mock).mockResolvedValue({ id: 99 });
});

describe('GET /api/security/cameras', () => {
  test('returns camera list for owner', async () => {
    (mp.staff.findFirst as jest.Mock).mockResolvedValue(ownerStaff);
    (mp.securityCamera.findMany as jest.Mock).mockResolvedValue(makeCameras());

    const res = await request(app)
      .get('/api/security/cameras')
      .set('x-staff-pin', '0000');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toMatchObject({ id: 1, name: 'Counter', isOnline: false });
  });

  test('rejects non-owner', async () => {
    (mp.staff.findFirst as jest.Mock).mockResolvedValue(staffOnly);
    const res = await request(app)
      .get('/api/security/cameras')
      .set('x-staff-pin', '1111');
    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/security/clips/:id', () => {
  test('deletes clip and logs audit event', async () => {
    (mp.staff.findFirst as jest.Mock).mockResolvedValue(ownerStaff);
    (mp.securityClip.findUnique as jest.Mock).mockResolvedValue({ id: 5, filePath: '/clips/clip5.mp4' });
    (mp.securityClip.delete as jest.Mock).mockResolvedValue({ id: 5 });

    const res = await request(app)
      .delete('/api/security/clips/5')
      .set('x-staff-pin', '0000');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(mp.securityClip.delete).toHaveBeenCalledWith({ where: { id: 5 } });
    expect(mp.securityEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'ADMIN_OVERRIDE' }),
      })
    );
  });

  test('returns 404 for unknown clip', async () => {
    (mp.staff.findFirst as jest.Mock).mockResolvedValue(ownerStaff);
    (mp.securityClip.findUnique as jest.Mock).mockResolvedValue(null);

    const res = await request(app)
      .delete('/api/security/clips/999')
      .set('x-staff-pin', '0000');

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });
});
