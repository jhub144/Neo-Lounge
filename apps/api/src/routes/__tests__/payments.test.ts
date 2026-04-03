import request from 'supertest';
import app from '../../index';
import prisma from '../../lib/prisma';
import { paymentService } from '../../services/paymentService';
import { emitPaymentConfirmed, emitPaymentTimeout } from '../../services/socketService';

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('../../lib/prisma', () => ({
  __esModule: true,
  default: {
    station:       { findUnique: jest.fn(), update: jest.fn() },
    session:       { findUnique: jest.fn(), update: jest.fn() },
    transaction:   { create: jest.fn(), update: jest.fn(), findUnique: jest.fn() },
    securityEvent: { create: jest.fn(), createMany: jest.fn() },
    staff:         { findFirst: jest.fn() },
    $transaction:  jest.fn(),
  },
}));

// Keep real phone-validation helpers; only stub out the service instance.
jest.mock('../../services/paymentService', () => {
  const original = jest.requireActual('../../services/paymentService');
  return {
    ...original,
    paymentService: {
      checkInternetAvailability: jest.fn(),
      initiateStkPush: jest.fn(),
      processCallback: jest.fn(),
    },
  };
});

jest.mock('../../services/socketService', () => ({
  initSocketService: jest.fn(),
  emitStationUpdate:    jest.fn(),
  emitPaymentConfirmed: jest.fn(),
  emitPaymentTimeout:   jest.fn(),
  emitSessionEnded:     jest.fn(),
  emitSessionTick:      jest.fn(),
  emitSessionWarning:   jest.fn(),
  emitQueueUpdated:     jest.fn(),
  emitGameEnded:        jest.fn(),
  emitReplayReady:      jest.fn(),
  emitPowerStatus:      jest.fn(),
}));

// ── Typed handles ─────────────────────────────────────────────────────────────

const mp   = prisma as jest.Mocked<typeof prisma>;
const mps  = paymentService as { [K in keyof typeof paymentService]: jest.Mock };
const mSC  = { emitPaymentConfirmed: emitPaymentConfirmed as jest.Mock,
               emitPaymentTimeout:   emitPaymentTimeout   as jest.Mock };

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ownerStaff = { id: 1, name: 'Owner', pin: '0000', role: 'OWNER', isActive: true };

const pendingSession = {
  id: 1,
  stationId: 1,
  status: 'PENDING',
  station: { id: 1, name: 'Station 1', adbAddress: '192.168.1.10:5555', tuyaDeviceId: 'tuya1', captureDevice: '/dev/video0' },
};

const pendingTransaction = {
  id: 10,
  status: 'PENDING',
  amount: 300,
  session: pendingSession,
};

beforeEach(() => {
  jest.clearAllMocks();
  (mp.$transaction as jest.Mock).mockResolvedValue([]);
});

// ── GET /api/payments/status ──────────────────────────────────────────────────

describe('GET /api/payments/status', () => {
  test('returns mpesaAvailable: true when internet is up', async () => {
    mps.checkInternetAvailability.mockResolvedValue(true);

    const res = await request(app).get('/api/payments/status');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ mpesaAvailable: true });
  });

  test('returns mpesaAvailable: false when internet is down', async () => {
    mps.checkInternetAvailability.mockResolvedValue(false);

    const res = await request(app).get('/api/payments/status');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ mpesaAvailable: false });
  });

  test('returns 500 on unexpected error', async () => {
    mps.checkInternetAvailability.mockRejectedValue(new Error('network error'));

    const res = await request(app).get('/api/payments/status');

    expect(res.status).toBe(500);
    expect(res.body.code).toBe('INTERNAL_ERROR');
  });
});

// ── POST /api/payments/mpesa/initiate ─────────────────────────────────────────

describe('POST /api/payments/mpesa/initiate', () => {
  test('returns 401 without staff pin', async () => {
    const res = await request(app)
      .post('/api/payments/mpesa/initiate')
      .send({ phoneNumber: '0712345678', amount: 300, sessionId: 1 });

    expect(res.status).toBe(401);
  });

  test('returns 400 when required fields are missing', async () => {
    (mp.staff.findFirst as jest.Mock).mockResolvedValue(ownerStaff);

    const res = await request(app)
      .post('/api/payments/mpesa/initiate')
      .set('x-staff-pin', '0000')
      .send({ amount: 300, sessionId: 1 }); // missing phoneNumber

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MISSING_FIELDS');
  });

  test('returns 400 for invalid Kenyan phone format', async () => {
    (mp.staff.findFirst as jest.Mock).mockResolvedValue(ownerStaff);

    const res = await request(app)
      .post('/api/payments/mpesa/initiate')
      .set('x-staff-pin', '0000')
      .send({ phoneNumber: '12345', amount: 300, sessionId: 1 });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_PHONE');
  });

  test('accepts +254 format phone number', async () => {
    (mp.staff.findFirst as jest.Mock).mockResolvedValue(ownerStaff);
    (mp.session.findUnique as jest.Mock).mockResolvedValue(pendingSession);
    (mp.transaction.create as jest.Mock).mockResolvedValue({ id: 10 });
    (mp.transaction.update as jest.Mock).mockResolvedValue({});
    mps.initiateStkPush.mockResolvedValue({ success: true, checkoutRequestId: 'CHK123' });

    const res = await request(app)
      .post('/api/payments/mpesa/initiate')
      .set('x-staff-pin', '0000')
      .send({ phoneNumber: '+254712345678', amount: 300, sessionId: 1 });

    expect(res.status).toBe(200);
  });

  test('returns 404 when session not found', async () => {
    (mp.staff.findFirst as jest.Mock).mockResolvedValue(ownerStaff);
    (mp.session.findUnique as jest.Mock).mockResolvedValue(null);

    const res = await request(app)
      .post('/api/payments/mpesa/initiate')
      .set('x-staff-pin', '0000')
      .send({ phoneNumber: '0712345678', amount: 300, sessionId: 99 });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('SESSION_NOT_FOUND');
  });

  test('returns 400 when session is COMPLETED or PAUSED', async () => {
    (mp.staff.findFirst as jest.Mock).mockResolvedValue(ownerStaff);
    (mp.session.findUnique as jest.Mock).mockResolvedValue({ ...pendingSession, status: 'COMPLETED' });

    const res = await request(app)
      .post('/api/payments/mpesa/initiate')
      .set('x-staff-pin', '0000')
      .send({ phoneNumber: '0712345678', amount: 300, sessionId: 1 });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_SESSION_STATUS');
  });

  test('accepts ACTIVE session for extension M-Pesa payment', async () => {
    (mp.staff.findFirst as jest.Mock).mockResolvedValue(ownerStaff);
    (mp.session.findUnique as jest.Mock).mockResolvedValue({ ...pendingSession, status: 'ACTIVE' });
    (mp.transaction.create as jest.Mock).mockResolvedValue({ id: 10 });
    (mp.transaction.update as jest.Mock).mockResolvedValue({});
    mps.initiateStkPush.mockResolvedValue({ success: true, checkoutRequestId: 'CHK999' });

    const res = await request(app)
      .post('/api/payments/mpesa/initiate')
      .set('x-staff-pin', '0000')
      .send({ phoneNumber: '0712345678', amount: 150, sessionId: 1 });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ transactionId: 10, checkoutRequestId: 'CHK999', status: 'pending' });
  });

  test('returns 502 when STK push fails', async () => {
    (mp.staff.findFirst as jest.Mock).mockResolvedValue(ownerStaff);
    (mp.session.findUnique as jest.Mock).mockResolvedValue(pendingSession);
    (mp.transaction.create as jest.Mock).mockResolvedValue({ id: 10 });
    (mp.transaction.update as jest.Mock).mockResolvedValue({});
    (mp.securityEvent.create as jest.Mock).mockResolvedValue({});
    mps.initiateStkPush.mockResolvedValue({ success: false, checkoutRequestId: '' });

    const res = await request(app)
      .post('/api/payments/mpesa/initiate')
      .set('x-staff-pin', '0000')
      .send({ phoneNumber: '0712345678', amount: 300, sessionId: 1 });

    expect(res.status).toBe(502);
    expect(res.body.code).toBe('STK_PUSH_FAILED');
    expect(mp.transaction.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'FAILED' } })
    );
  });

  test('returns 200 with transactionId and checkoutRequestId on success', async () => {
    (mp.staff.findFirst as jest.Mock).mockResolvedValue(ownerStaff);
    (mp.session.findUnique as jest.Mock).mockResolvedValue(pendingSession);
    (mp.transaction.create as jest.Mock).mockResolvedValue({ id: 10 });
    (mp.transaction.update as jest.Mock).mockResolvedValue({});
    mps.initiateStkPush.mockResolvedValue({ success: true, checkoutRequestId: 'CHK123' });

    const res = await request(app)
      .post('/api/payments/mpesa/initiate')
      .set('x-staff-pin', '0000')
      .send({ phoneNumber: '0712345678', amount: 300, sessionId: 1 });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ transactionId: 10, checkoutRequestId: 'CHK123', status: 'pending' });
    // checkoutRequestId stored on the transaction for callback lookup
    expect(mp.transaction.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { mpesaReceipt: 'CHK123' } })
    );
  });
});

// ── POST /api/payments/mpesa/callback ─────────────────────────────────────────

describe('POST /api/payments/mpesa/callback', () => {
  test('always returns 200 (even for missing transactions)', async () => {
    mps.processCallback.mockResolvedValue({
      transactionId: 99, success: true, checkoutRequestId: 'CHK123',
    });
    (mp.transaction.findUnique as jest.Mock).mockResolvedValue(null);

    const res = await request(app)
      .post('/api/payments/mpesa/callback')
      .send({});

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: false, error: 'transaction not found' });
  });

  test('returns ok:true skipped:true for already-COMPLETED transaction (idempotency)', async () => {
    mps.processCallback.mockResolvedValue({
      transactionId: 10, success: true, checkoutRequestId: 'CHK123',
    });
    (mp.transaction.findUnique as jest.Mock).mockResolvedValue({ ...pendingTransaction, status: 'COMPLETED' });

    const res = await request(app)
      .post('/api/payments/mpesa/callback')
      .send({});

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, skipped: true });
    expect(mp.$transaction).not.toHaveBeenCalled();
  });

  test('returns ok:true skipped:true for already-FAILED transaction (idempotency)', async () => {
    mps.processCallback.mockResolvedValue({
      transactionId: 10, success: false, checkoutRequestId: 'CHK123',
    });
    (mp.transaction.findUnique as jest.Mock).mockResolvedValue({ ...pendingTransaction, status: 'FAILED' });

    const res = await request(app)
      .post('/api/payments/mpesa/callback')
      .send({});

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, skipped: true });
  });

  test('success path: activates session, emits payment:confirmed', async () => {
    mps.processCallback.mockResolvedValue({
      transactionId: 10, success: true, receiptCode: 'RCP001', checkoutRequestId: 'CHK123',
    });
    (mp.transaction.findUnique as jest.Mock).mockResolvedValue(pendingTransaction);
    (mp.securityEvent.createMany as jest.Mock).mockResolvedValue({ count: 2 });

    const res = await request(app)
      .post('/api/payments/mpesa/callback')
      .send({});

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(mp.$transaction).toHaveBeenCalledTimes(1);
    // Verify the transaction batches include COMPLETED status update
    const batchOps = (mp.$transaction as jest.Mock).mock.calls[0][0];
    expect(batchOps).toHaveLength(3);
    expect(mSC.emitPaymentConfirmed).toHaveBeenCalledWith(1, 10);
  });

  test('failure path: frees station, emits payment:timeout', async () => {
    mps.processCallback.mockResolvedValue({
      transactionId: 10, success: false, checkoutRequestId: 'CHK123',
    });
    (mp.transaction.findUnique as jest.Mock).mockResolvedValue(pendingTransaction);
    (mp.securityEvent.create as jest.Mock).mockResolvedValue({});

    const res = await request(app)
      .post('/api/payments/mpesa/callback')
      .send({});

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(mp.$transaction).toHaveBeenCalledTimes(1);
    expect(mSC.emitPaymentTimeout).toHaveBeenCalledWith(1);
  });

  test('returns 200 even when processCallback throws (prevents AT retry)', async () => {
    mps.processCallback.mockRejectedValue(new Error('parse error'));

    const res = await request(app)
      .post('/api/payments/mpesa/callback')
      .send({});

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: false });
  });
});
