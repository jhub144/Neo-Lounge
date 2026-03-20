import request from 'supertest';
import app from '../../index';
import prisma from '../../lib/prisma';

jest.mock('../../lib/prisma', () => ({
  __esModule: true,
  default: {
    station: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    staff: {
      findFirst: jest.fn(),
    },
    securityEvent: {
      create: jest.fn(),
    },
  },
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

const ownerStaff = { id: 1, name: 'Owner', pin: '0000', role: 'OWNER', isActive: true };

const makeStation = (id: number, overrides = {}) => ({
  id,
  name: `Station ${id}`,
  status: 'AVAILABLE',
  adbAddress: `192.168.1.10${id}:5555`,
  tuyaDeviceId: '',
  captureDevice: '',
  currentSessionId: null,
  currentSession: null,
  queue: [],
  sessions: [],
  _count: { queue: 0 },
  ...overrides,
});

beforeEach(() => jest.clearAllMocks());

describe('GET /api/stations', () => {
  test('returns all 4 stations with queueCount', async () => {
    const stations = [1, 2, 3, 4].map((i) => makeStation(i));
    (mockPrisma.station.findMany as jest.Mock).mockResolvedValue(stations);

    const res = await request(app).get('/api/stations');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(4);
    expect(res.body[0]).toMatchObject({ id: 1, name: 'Station 1', status: 'AVAILABLE', queueCount: 0 });
  });
});

describe('GET /api/stations/:id', () => {
  test('returns station detail', async () => {
    const station = makeStation(1);
    (mockPrisma.station.findUnique as jest.Mock).mockResolvedValue(station);

    const res = await request(app).get('/api/stations/1');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 1, name: 'Station 1' });
  });

  test('returns 404 for missing station', async () => {
    (mockPrisma.station.findUnique as jest.Mock).mockResolvedValue(null);

    const res = await request(app).get('/api/stations/99');

    expect(res.status).toBe(404);
  });

  test('returns 404 for non-numeric id', async () => {
    const res = await request(app).get('/api/stations/abc');
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/stations/:id', () => {
  test('returns 401 without staff pin', async () => {
    const res = await request(app).patch('/api/stations/1').send({ status: 'FAULT' });
    expect(res.status).toBe(401);
  });

  test('updates station status with valid staff pin', async () => {
    (mockPrisma.staff.findFirst as jest.Mock).mockResolvedValue(ownerStaff);
    (mockPrisma.station.findUnique as jest.Mock).mockResolvedValue(makeStation(1));
    (mockPrisma.station.update as jest.Mock).mockResolvedValue(makeStation(1, { status: 'AVAILABLE' }));

    const res = await request(app)
      .patch('/api/stations/1')
      .set('x-staff-pin', '0000')
      .send({ status: 'AVAILABLE' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'AVAILABLE' });
  });

  test('FAULT status creates STATION_FAULT security event', async () => {
    (mockPrisma.staff.findFirst as jest.Mock).mockResolvedValue(ownerStaff);
    (mockPrisma.station.findUnique as jest.Mock).mockResolvedValue(makeStation(1));
    (mockPrisma.station.update as jest.Mock).mockResolvedValue(makeStation(1, { status: 'FAULT' }));
    (mockPrisma.securityEvent.create as jest.Mock).mockResolvedValue({});

    const res = await request(app)
      .patch('/api/stations/1')
      .set('x-staff-pin', '0000')
      .send({ status: 'FAULT' });

    expect(res.status).toBe(200);
    expect(mockPrisma.securityEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'STATION_FAULT', stationId: 1 }),
      })
    );
  });

  test('returns 404 for missing station', async () => {
    (mockPrisma.staff.findFirst as jest.Mock).mockResolvedValue(ownerStaff);
    (mockPrisma.station.findUnique as jest.Mock).mockResolvedValue(null);

    const res = await request(app)
      .patch('/api/stations/99')
      .set('x-staff-pin', '0000')
      .send({ status: 'FAULT' });

    expect(res.status).toBe(404);
  });
});
