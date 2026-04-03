import request from 'supertest';
import app from '../../index';
import prisma from '../../lib/prisma';

jest.mock('../../lib/prisma', () => ({
  __esModule: true,
  default: {
    station: { findUnique: jest.fn(), update: jest.fn() },
    session: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn() },
    settings: { findUnique: jest.fn() },
    securityEvent: { create: jest.fn(), createMany: jest.fn() },
    game: { updateMany: jest.fn() },
    staff: { findFirst: jest.fn() },
    transaction: { create: jest.fn() },
  },
}));

const mp = prisma as jest.Mocked<typeof prisma>;

const ownerStaff = { id: 1, name: 'Owner', pin: '0000', role: 'OWNER', isActive: true };
const availableStation = { id: 1, name: 'Station 1', status: 'AVAILABLE', currentSessionId: null };
const activeStation = { id: 1, name: 'Station 1', status: 'ACTIVE', currentSessionId: 1 };
const settings = { id: 1, baseHourlyRate: 300 };

const makeSession = (overrides = {}) => ({
  id: 1,
  stationId: 1,
  staffPin: '0000',
  durationMinutes: 60,
  authCode: 'ABC123',
  status: 'ACTIVE',
  startTime: new Date().toISOString(),
  endTime: null,
  transactions: [{ id: 1, amount: 300, method: 'CASH', status: 'COMPLETED' }],
  games: [{ id: 1, startTime: new Date().toISOString(), endTime: null, endMethod: null }],
  ...overrides,
});

beforeEach(() => jest.clearAllMocks());

describe('POST /api/sessions', () => {
  test('creates session for available station with cash', async () => {
    (mp.staff.findFirst as jest.Mock).mockResolvedValue(ownerStaff);
    (mp.station.findUnique as jest.Mock).mockResolvedValue(availableStation);
    (mp.settings.findUnique as jest.Mock).mockResolvedValue(settings);
    (mp.session.create as jest.Mock).mockResolvedValue(makeSession());
    (mp.station.update as jest.Mock).mockResolvedValue(activeStation);
    (mp.securityEvent.createMany as jest.Mock).mockResolvedValue({ count: 2 });

    const res = await request(app)
      .post('/api/sessions')
      .set('x-staff-pin', '0000')
      .send({ stationId: 1, durationMinutes: 60, paymentMethod: 'CASH' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: 1, status: 'ACTIVE', authCode: 'ABC123' });
    expect(mp.session.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          stationId: 1,
          durationMinutes: 60,
          transactions: expect.objectContaining({
            create: expect.objectContaining({ amount: 300, method: 'CASH', status: 'COMPLETED' }),
          }),
        }),
      })
    );
  });

  test('M-Pesa transaction created as PENDING', async () => {
    (mp.staff.findFirst as jest.Mock).mockResolvedValue(ownerStaff);
    (mp.station.findUnique as jest.Mock).mockResolvedValue(availableStation);
    (mp.settings.findUnique as jest.Mock).mockResolvedValue(settings);
    (mp.session.create as jest.Mock).mockResolvedValue(
      makeSession({ transactions: [{ id: 1, amount: 300, method: 'MPESA', status: 'PENDING' }] })
    );
    (mp.station.update as jest.Mock).mockResolvedValue(activeStation);
    (mp.securityEvent.createMany as jest.Mock).mockResolvedValue({ count: 2 });

    const res = await request(app)
      .post('/api/sessions')
      .set('x-staff-pin', '0000')
      .send({ stationId: 1, durationMinutes: 60, paymentMethod: 'MPESA' });

    expect(res.status).toBe(201);
    expect(mp.session.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          transactions: expect.objectContaining({
            create: expect.objectContaining({ method: 'MPESA', status: 'PENDING' }),
          }),
        }),
      })
    );
  });

  test('returns 400 if station is not AVAILABLE', async () => {
    (mp.staff.findFirst as jest.Mock).mockResolvedValue(ownerStaff);
    (mp.station.findUnique as jest.Mock).mockResolvedValue(activeStation);

    const res = await request(app)
      .post('/api/sessions')
      .set('x-staff-pin', '0000')
      .send({ stationId: 1, durationMinutes: 60, paymentMethod: 'CASH' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not available/i);
  });

  test('returns 401 without staff pin', async () => {
    const res = await request(app)
      .post('/api/sessions')
      .send({ stationId: 1, durationMinutes: 60, paymentMethod: 'CASH' });

    expect(res.status).toBe(401);
  });

  test('returns 400 if required fields missing', async () => {
    (mp.staff.findFirst as jest.Mock).mockResolvedValue(ownerStaff);

    const res = await request(app)
      .post('/api/sessions')
      .set('x-staff-pin', '0000')
      .send({ stationId: 1 });

    expect(res.status).toBe(400);
  });
});

describe('GET /api/sessions/:id', () => {
  test('returns session with relations', async () => {
    (mp.session.findUnique as jest.Mock).mockResolvedValue({
      ...makeSession(),
      station: availableStation,
    });

    const res = await request(app).get('/api/sessions/1');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 1, authCode: 'ABC123' });
  });

  test('returns 404 for missing session', async () => {
    (mp.session.findUnique as jest.Mock).mockResolvedValue(null);

    const res = await request(app).get('/api/sessions/99');

    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/sessions/:id/end', () => {
  test('ends active session', async () => {
    (mp.staff.findFirst as jest.Mock).mockResolvedValue(ownerStaff);
    (mp.session.findUnique as jest.Mock).mockResolvedValue(makeSession());
    (mp.game.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    (mp.session.update as jest.Mock).mockResolvedValue(makeSession({ status: 'COMPLETED', endTime: new Date().toISOString() }));
    (mp.station.update as jest.Mock).mockResolvedValue(availableStation);
    (mp.securityEvent.create as jest.Mock).mockResolvedValue({});

    const res = await request(app)
      .patch('/api/sessions/1/end')
      .set('x-staff-pin', '0000');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('COMPLETED');
    expect(mp.game.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ endMethod: 'SESSION_END' }),
      })
    );
    expect(mp.securityEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'SESSION_END' }),
      })
    );
  });

  test('returns 400 if session already completed', async () => {
    (mp.staff.findFirst as jest.Mock).mockResolvedValue(ownerStaff);
    (mp.session.findUnique as jest.Mock).mockResolvedValue(makeSession({ status: 'COMPLETED' }));

    const res = await request(app)
      .patch('/api/sessions/1/end')
      .set('x-staff-pin', '0000');

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not active/i);
  });

  test('returns 401 without staff pin', async () => {
    const res = await request(app).patch('/api/sessions/1/end');
    expect(res.status).toBe(401);
  });

  test('returns 404 for missing session', async () => {
    (mp.staff.findFirst as jest.Mock).mockResolvedValue(ownerStaff);
    (mp.session.findUnique as jest.Mock).mockResolvedValue(null);

    const res = await request(app)
      .patch('/api/sessions/99/end')
      .set('x-staff-pin', '0000');

    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/sessions/:id/extend', () => {
  test('extends session and creates transaction', async () => {
    (mp.staff.findFirst as jest.Mock).mockResolvedValue(ownerStaff);
    (mp.session.findUnique as jest.Mock).mockResolvedValue(makeSession());
    (mp.settings.findUnique as jest.Mock).mockResolvedValue(settings);
    (mp.transaction.create as jest.Mock).mockResolvedValue({});
    (mp.session.update as jest.Mock).mockResolvedValue(makeSession({ durationMinutes: 90 }));
    (mp.securityEvent.create as jest.Mock).mockResolvedValue({});

    const res = await request(app)
      .patch('/api/sessions/1/extend')
      .set('x-staff-pin', '0000')
      .send({ durationMinutes: 30, paymentMethod: 'CASH' });

    expect(res.status).toBe(200);
    expect(mp.transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ amount: 150, method: 'CASH', status: 'COMPLETED' }),
      })
    );
    expect(mp.securityEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'SESSION_EXTENDED' }),
      })
    );
  });

  test('returns 400 if session is not active', async () => {
    (mp.staff.findFirst as jest.Mock).mockResolvedValue(ownerStaff);
    (mp.session.findUnique as jest.Mock).mockResolvedValue(makeSession({ status: 'COMPLETED' }));

    const res = await request(app)
      .patch('/api/sessions/1/extend')
      .set('x-staff-pin', '0000')
      .send({ durationMinutes: 30, paymentMethod: 'CASH' });

    expect(res.status).toBe(400);
  });

  test('returns 401 without staff pin', async () => {
    const res = await request(app)
      .patch('/api/sessions/1/extend')
      .send({ durationMinutes: 30, paymentMethod: 'CASH' });
    expect(res.status).toBe(401);
  });
});

describe('POST /api/sessions/:id/transfer', () => {
  const targetStation = { id: 2, name: 'Station 2', status: 'AVAILABLE', currentSessionId: null };
  const occupiedStation = { id: 2, name: 'Station 2', status: 'ACTIVE', currentSessionId: 5 };

  test('transfers session to available station', async () => {
    (mp.staff.findFirst as jest.Mock).mockResolvedValue(ownerStaff);
    (mp.session.findUnique as jest.Mock).mockResolvedValue(makeSession());
    (mp.station.findUnique as jest.Mock).mockResolvedValue(targetStation);
    (mp.game.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    (mp.session.update as jest.Mock).mockResolvedValue(makeSession({ status: 'COMPLETED' }));
    (mp.station.update as jest.Mock).mockResolvedValue({});
    (mp.session.create as jest.Mock).mockResolvedValue(makeSession({ id: 2, stationId: 2 }));
    (mp.securityEvent.create as jest.Mock).mockResolvedValue({});

    const res = await request(app)
      .post('/api/sessions/1/transfer')
      .set('x-staff-pin', '0000')
      .send({ targetStationId: 2 });

    expect(res.status).toBe(201);
    expect(mp.session.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ stationId: 2 }),
      })
    );
    expect(mp.securityEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'SESSION_TRANSFER' }),
      })
    );
  });

  test('returns 400 if target station is occupied', async () => {
    (mp.staff.findFirst as jest.Mock).mockResolvedValue(ownerStaff);
    (mp.session.findUnique as jest.Mock).mockResolvedValue(makeSession());
    (mp.station.findUnique as jest.Mock).mockResolvedValue(occupiedStation);

    const res = await request(app)
      .post('/api/sessions/1/transfer')
      .set('x-staff-pin', '0000')
      .send({ targetStationId: 2 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not available/i);
  });

  test('returns 401 without staff pin', async () => {
    const res = await request(app)
      .post('/api/sessions/1/transfer')
      .send({ targetStationId: 2 });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/sessions (list)', () => {
  test('returns sessions list for authenticated staff', async () => {
    (mp.staff.findFirst as jest.Mock).mockResolvedValue(ownerStaff);
    (mp.session.findMany as jest.Mock).mockResolvedValue([
      { ...makeSession(), station: availableStation, transactions: [] },
    ]);

    const res = await request(app)
      .get('/api/sessions')
      .set('x-staff-pin', '0000');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ id: 1, status: 'ACTIVE' });
  });

  test('filters by status query param', async () => {
    (mp.staff.findFirst as jest.Mock).mockResolvedValue(ownerStaff);
    (mp.session.findMany as jest.Mock).mockResolvedValue([]);

    const res = await request(app)
      .get('/api/sessions?status=COMPLETED')
      .set('x-staff-pin', '0000');

    expect(res.status).toBe(200);
    expect(mp.session.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'COMPLETED' }),
      })
    );
  });

  test('returns 401 without staff pin', async () => {
    const res = await request(app).get('/api/sessions');
    expect(res.status).toBe(401);
  });
});
