import request from 'supertest';
import app from '../../index';
import prisma from '../../lib/prisma';

jest.mock('../../lib/prisma', () => ({
  __esModule: true,
  default: {
    staff: { findFirst: jest.fn() },
    securityEvent: { create: jest.fn() },
    session: { findMany: jest.fn(), update: jest.fn() },
    station: { findMany: jest.fn() },
  },
}));

jest.mock('../../services/adbService', () => ({
  adbService: {
    setBrightness: jest.fn().mockResolvedValue({ success: true }),
    powerOff: jest.fn().mockResolvedValue({ success: true }),
    switchToHdmi: jest.fn().mockResolvedValue({ success: true }),
  },
}));

jest.mock('../../services/tuyaService', () => ({
  tuyaService: {
    turnOff: jest.fn().mockResolvedValue({ success: true }),
    setSyncMode: jest.fn().mockResolvedValue({ success: true }),
  },
}));

jest.mock('../../services/socketService', () => ({
  initSocketService: jest.fn(),
  emitPowerStatus: jest.fn(),
  emitStationUpdate: jest.fn(),
}));

import { emitPowerStatus } from '../../services/socketService';

const mp = prisma as jest.Mocked<typeof prisma>;
const ownerStaff = { id: 1, name: 'Owner', pin: '0000', role: 'OWNER', isActive: true };
const staffOnly = { id: 2, name: 'Staff', pin: '1111', role: 'STAFF', isActive: true };

const makeSession = (id: number, stationId: number, minutesAgo = 5, durationMinutes = 60) => ({
  id,
  stationId,
  status: 'ACTIVE',
  startTime: new Date(Date.now() - minutesAgo * 60 * 1000),
  durationMinutes,
  remainingAtPowerLoss: null,
  station: { id: stationId, adbAddress: `192.168.1.${100 + stationId}:5555`, tuyaDeviceId: `tuya-${stationId}` },
});

const makeStation = (id: number) => ({
  id,
  adbAddress: `192.168.1.${100 + id}:5555`,
  tuyaDeviceId: `tuya-${id}`,
  status: 'AVAILABLE',
});

beforeEach(() => {
  jest.clearAllMocks();
  (mp.securityEvent.create as jest.Mock).mockResolvedValue({ id: 99 });
  (mp.station.findMany as jest.Mock).mockResolvedValue([
    makeStation(1), makeStation(2), makeStation(3), makeStation(4),
  ]);
});

// ── restart-service (existing) ────────────────────────────────────────────────

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

// ── power-down ────────────────────────────────────────────────────────────────

describe('POST /api/system/power-down', () => {
  beforeEach(() => {
    (mp.staff.findFirst as jest.Mock).mockResolvedValue(ownerStaff);
  });

  it('returns 200 with sessionsPreserved count', async () => {
    (mp.session.findMany as jest.Mock).mockResolvedValue([
      makeSession(1, 1, 5, 60),
      makeSession(2, 2, 10, 60),
    ]);
    (mp.session.update as jest.Mock).mockResolvedValue({});

    const res = await request(app)
      .post('/api/system/power-down')
      .set('x-staff-pin', '0000');

    expect(res.status).toBe(200);
    expect(res.body.sessionsPreserved).toBe(2);
    expect(res.body.timestamp).toBeDefined();
  });

  it('marks active sessions as POWER_INTERRUPTED', async () => {
    (mp.session.findMany as jest.Mock).mockResolvedValue([makeSession(1, 1, 5, 60)]);
    (mp.session.update as jest.Mock).mockResolvedValue({});

    await request(app)
      .post('/api/system/power-down')
      .set('x-staff-pin', '0000');

    expect(mp.session.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1 },
        data: expect.objectContaining({ status: 'POWER_INTERRUPTED' }),
      })
    );
  });

  it('saves correct remainingAtPowerLoss (approx 55 min when 5 min elapsed of 60)', async () => {
    (mp.session.findMany as jest.Mock).mockResolvedValue([makeSession(1, 1, 5, 60)]);
    (mp.session.update as jest.Mock).mockResolvedValue({});

    await request(app)
      .post('/api/system/power-down')
      .set('x-staff-pin', '0000');

    const updateCall = (mp.session.update as jest.Mock).mock.calls[0][0];
    const remaining = updateCall.data.remainingAtPowerLoss;
    // 60 min - 5 min = 55 min = 3300 s (±5 s tolerance)
    expect(remaining).toBeGreaterThan(3290);
    expect(remaining).toBeLessThan(3310);
  });

  it('creates POWER_LOSS security event', async () => {
    (mp.session.findMany as jest.Mock).mockResolvedValue([makeSession(1, 1)]);
    (mp.session.update as jest.Mock).mockResolvedValue({});

    await request(app)
      .post('/api/system/power-down')
      .set('x-staff-pin', '0000');

    expect(mp.securityEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'POWER_LOSS' }),
      })
    );
  });

  it('emits power:status save', async () => {
    (mp.session.findMany as jest.Mock).mockResolvedValue([]);

    await request(app)
      .post('/api/system/power-down')
      .set('x-staff-pin', '0000');

    expect(emitPowerStatus).toHaveBeenCalledWith('save');
  });

  it('works with no active sessions', async () => {
    (mp.session.findMany as jest.Mock).mockResolvedValue([]);

    const res = await request(app)
      .post('/api/system/power-down')
      .set('x-staff-pin', '0000');

    expect(res.status).toBe(200);
    expect(res.body.sessionsPreserved).toBe(0);
  });

  it('requires owner auth', async () => {
    const res = await request(app).post('/api/system/power-down');
    expect(res.status).toBe(401);
  });
});

// ── power-restore ─────────────────────────────────────────────────────────────

describe('POST /api/system/power-restore', () => {
  beforeEach(() => {
    (mp.staff.findFirst as jest.Mock).mockResolvedValue(ownerStaff);
  });

  const makeInterrupted = (id: number, stationId: number, remainingAtPowerLoss: number) => ({
    id,
    stationId,
    status: 'POWER_INTERRUPTED',
    startTime: new Date(Date.now() - 10 * 60 * 1000),
    durationMinutes: 60,
    remainingAtPowerLoss,
    station: { id: stationId, adbAddress: `192.168.1.${100 + stationId}:5555`, tuyaDeviceId: `tuya-${stationId}` },
  });

  it('returns 200 with sessionsRestored count', async () => {
    (mp.session.findMany as jest.Mock).mockResolvedValue([
      makeInterrupted(1, 1, 3300),
      makeInterrupted(2, 2, 1800),
    ]);
    (mp.session.update as jest.Mock).mockResolvedValue({});

    const res = await request(app)
      .post('/api/system/power-restore')
      .set('x-staff-pin', '0000');

    expect(res.status).toBe(200);
    expect(res.body.sessionsRestored).toBe(2);
  });

  it('restores sessions to ACTIVE', async () => {
    (mp.session.findMany as jest.Mock).mockResolvedValue([makeInterrupted(1, 1, 3300)]);
    (mp.session.update as jest.Mock).mockResolvedValue({});

    await request(app)
      .post('/api/system/power-restore')
      .set('x-staff-pin', '0000');

    expect(mp.session.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1 },
        data: expect.objectContaining({
          status: 'ACTIVE',
          remainingAtPowerLoss: null,
        }),
      })
    );
  });

  it('adjusts startTime so remaining time is correct', async () => {
    const remaining = 1800; // 30 minutes
    (mp.session.findMany as jest.Mock).mockResolvedValue([makeInterrupted(1, 1, remaining)]);
    (mp.session.update as jest.Mock).mockResolvedValue({});

    const before = Date.now();
    await request(app)
      .post('/api/system/power-restore')
      .set('x-staff-pin', '0000');
    const after = Date.now();

    const updateCall = (mp.session.update as jest.Mock).mock.calls[0][0];
    const newStart: Date = updateCall.data.startTime;
    // total = 60 min = 3600s; elapsed should be 3600 - 1800 = 1800s
    const expectedStartMs = before - (3600 - 1800) * 1000;
    expect(newStart.getTime()).toBeGreaterThanOrEqual(expectedStartMs - 100);
    expect(newStart.getTime()).toBeLessThanOrEqual(after - (3600 - 1800) * 1000 + 100);
  });

  it('creates POWER_RESTORE security event', async () => {
    (mp.session.findMany as jest.Mock).mockResolvedValue([makeInterrupted(1, 1, 3300)]);
    (mp.session.update as jest.Mock).mockResolvedValue({});

    await request(app)
      .post('/api/system/power-restore')
      .set('x-staff-pin', '0000');

    expect(mp.securityEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'POWER_RESTORE' }),
      })
    );
  });

  it('emits power:status normal', async () => {
    (mp.session.findMany as jest.Mock).mockResolvedValue([]);

    await request(app)
      .post('/api/system/power-restore')
      .set('x-staff-pin', '0000');

    expect(emitPowerStatus).toHaveBeenCalledWith('normal');
  });

  it('works with no interrupted sessions', async () => {
    (mp.session.findMany as jest.Mock).mockResolvedValue([]);

    const res = await request(app)
      .post('/api/system/power-restore')
      .set('x-staff-pin', '0000');

    expect(res.status).toBe(200);
    expect(res.body.sessionsRestored).toBe(0);
  });
});
