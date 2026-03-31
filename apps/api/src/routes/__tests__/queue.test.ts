import request from 'supertest';
import app from '../../index';
import prisma from '../../lib/prisma';

jest.mock('../../lib/prisma', () => ({
  __esModule: true,
  default: {
    station: { findUnique: jest.fn() },
    stationQueue: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    staff: { findFirst: jest.fn() },
  },
}));

const mp = prisma as jest.Mocked<typeof prisma>;
const ownerStaff = { id: 1, name: 'Owner', pin: '0000', role: 'OWNER', isActive: true };
const station = { id: 1, name: 'Station 1', status: 'ACTIVE' };

const makeEntry = (id: number, position: number, overrides = {}) => ({
  id,
  stationId: 1,
  durationMinutes: 60,
  position,
  status: 'WAITING',
  createdAt: new Date().toISOString(),
  ...overrides,
});

beforeEach(() => jest.clearAllMocks());

describe('POST /api/queue', () => {
  test('adds first entry with position 1', async () => {
    (mp.staff.findFirst as jest.Mock).mockResolvedValue(ownerStaff);
    (mp.station.findUnique as jest.Mock).mockResolvedValue(station);
    (mp.stationQueue.findFirst as jest.Mock).mockResolvedValue(null);
    (mp.stationQueue.create as jest.Mock).mockResolvedValue(makeEntry(1, 1));

    const res = await request(app)
      .post('/api/queue')
      .set('x-staff-pin', '0000')
      .send({ stationId: 1, durationMinutes: 60 });

    expect(res.status).toBe(201);
    expect(res.body.position).toBe(1);
    expect(mp.stationQueue.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ position: 1 }) })
    );
  });

  test('second entry gets position 2', async () => {
    (mp.staff.findFirst as jest.Mock).mockResolvedValue(ownerStaff);
    (mp.station.findUnique as jest.Mock).mockResolvedValue(station);
    (mp.stationQueue.findFirst as jest.Mock).mockResolvedValue(makeEntry(1, 1));
    (mp.stationQueue.create as jest.Mock).mockResolvedValue(makeEntry(2, 2));

    const res = await request(app)
      .post('/api/queue')
      .set('x-staff-pin', '0000')
      .send({ stationId: 1, durationMinutes: 30 });

    expect(res.status).toBe(201);
    expect(res.body.position).toBe(2);
    expect(mp.stationQueue.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ position: 2 }) })
    );
  });

  test('returns 400 if fields missing', async () => {
    (mp.staff.findFirst as jest.Mock).mockResolvedValue(ownerStaff);

    const res = await request(app)
      .post('/api/queue')
      .set('x-staff-pin', '0000')
      .send({ stationId: 1 });

    expect(res.status).toBe(400);
  });

  test('returns 401 without staff pin', async () => {
    const res = await request(app).post('/api/queue').send({ stationId: 1, durationMinutes: 60 });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/queue/:stationId', () => {
  test('returns WAITING entries ordered by position', async () => {
    (mp.stationQueue.findMany as jest.Mock).mockResolvedValue([
      makeEntry(1, 1),
      makeEntry(2, 2),
    ]);

    const res = await request(app).get('/api/queue/1');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].position).toBe(1);
    expect(res.body[1].position).toBe(2);
  });
});

describe('DELETE /api/queue/:id', () => {
  test('marks entry as EXPIRED', async () => {
    (mp.staff.findFirst as jest.Mock).mockResolvedValue(ownerStaff);
    (mp.stationQueue.findUnique as jest.Mock).mockResolvedValue(makeEntry(1, 1));
    (mp.stationQueue.update as jest.Mock).mockResolvedValue(makeEntry(1, 1, { status: 'EXPIRED' }));

    const res = await request(app)
      .delete('/api/queue/1')
      .set('x-staff-pin', '0000');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('EXPIRED');
    expect(mp.stationQueue.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'EXPIRED' } })
    );
  });

  test('returns 404 for missing entry', async () => {
    (mp.staff.findFirst as jest.Mock).mockResolvedValue(ownerStaff);
    (mp.stationQueue.findUnique as jest.Mock).mockResolvedValue(null);

    const res = await request(app)
      .delete('/api/queue/99')
      .set('x-staff-pin', '0000');

    expect(res.status).toBe(404);
  });

  test('returns 401 without staff pin', async () => {
    const res = await request(app).delete('/api/queue/1');
    expect(res.status).toBe(401);
  });
});
