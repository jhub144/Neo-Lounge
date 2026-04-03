import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { requireStaff } from '../middleware/auth';
import { paymentService, isValidKenyanPhone, normalizePhone } from '../services/paymentService';
import { emitStationUpdate, emitPaymentConfirmed, emitPaymentTimeout } from '../services/socketService';
import { adbService } from '../services/adbService';
import { tuyaService } from '../services/tuyaService';
import { captureService } from '../services/captureService';

const router = Router();

// ── GET /api/payments/status ──────────────────────────────────────────────────
// Kiosk polls this to decide whether to show the M-Pesa option.

router.get('/status', async (_req: Request, res: Response) => {
  try {
    const mpesaAvailable = await paymentService.checkInternetAvailability();
    res.json({ mpesaAvailable });
  } catch (err) {
    console.error('[payments] GET /status error:', err);
    res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});

// ── POST /api/payments/mpesa/initiate ─────────────────────────────────────────
// Creates a PENDING transaction and sends an STK push to the customer's phone.
// The session must already exist (created in PENDING state by POST /api/sessions).

router.post('/mpesa/initiate', requireStaff, async (req: Request, res: Response) => {
  try {
    const { phoneNumber, amount, sessionId } = req.body as {
      phoneNumber?: string;
      amount?: number;
      sessionId?: number;
    };

    // ── Validation ────────────────────────────────────────────────────────────
    if (!phoneNumber || !amount || !sessionId) {
      res.status(400).json({
        error: 'phoneNumber, amount, and sessionId are required',
        code: 'MISSING_FIELDS',
      });
      return;
    }

    if (!isValidKenyanPhone(phoneNumber)) {
      res.status(400).json({
        error: 'Invalid Kenyan phone number. Accepted formats: 07XXXXXXXX, +254XXXXXXXXX, 254XXXXXXXXX',
        code: 'INVALID_PHONE',
      });
      return;
    }

    const normalizedPhone = normalizePhone(phoneNumber);

    // ── Session lookup ────────────────────────────────────────────────────────
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { station: true },
    });

    if (!session) {
      res.status(404).json({ error: 'Session not found', code: 'SESSION_NOT_FOUND' });
      return;
    }

    // Only allow initiate on PENDING sessions (station locked for M-Pesa)
    if ((session.status as string) !== 'PENDING') {
      res.status(400).json({
        error: `Session is ${session.status}. Can only initiate M-Pesa for PENDING sessions.`,
        code: 'INVALID_SESSION_STATUS',
      });
      return;
    }

    // ── Create Transaction ────────────────────────────────────────────────────
    const transaction = await prisma.transaction.create({
      data: {
        sessionId,
        amount,
        method: 'MPESA',
        status: 'PENDING',
        staffPin: req.staff!.pin,
      },
    });

    // ── Send STK Push ─────────────────────────────────────────────────────────
    const result = await paymentService.initiateStkPush(normalizedPhone, amount, transaction.id);

    if (!result.success) {
      // Mark transaction failed immediately; keep station PENDING so staff can retry
      await prisma.transaction.update({
        where: { id: transaction.id },
        data: { status: 'FAILED' },
      });

      await prisma.securityEvent.create({
        data: {
          type: 'MPESA_TIMEOUT',
          description: `M-Pesa STK Push failed for session ${sessionId}`,
          staffPin: req.staff!.pin,
          stationId: session.stationId,
          metadata: { sessionId, transactionId: transaction.id, phone: normalizedPhone },
        },
      });

      res.status(502).json({ error: 'Failed to send M-Pesa STK push', code: 'STK_PUSH_FAILED' });
      return;
    }

    // Store checkoutRequestId on the transaction so the callback can find it
    await prisma.transaction.update({
      where: { id: transaction.id },
      data: { mpesaReceipt: result.checkoutRequestId }, // re-using mpesaReceipt field temporarily
    });

    res.json({ transactionId: transaction.id, checkoutRequestId: result.checkoutRequestId, status: 'pending' });
  } catch (err) {
    console.error('[payments] POST /mpesa/initiate error:', err);
    res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});

// ── POST /api/payments/mpesa/callback ─────────────────────────────────────────
// Called by Africa's Talking (or our mock) when the customer confirms payment.
// Must be IDEMPOTENT — if the transaction is already COMPLETED, do nothing.

router.post('/mpesa/callback', async (req: Request, res: Response) => {
  // Always return 200 to AT, even on errors — AT expects 200 to stop retrying
  try {
    const payload = req.body as Record<string, unknown>;

    let callbackResult;
    try {
      callbackResult = await paymentService.processCallback(payload);
    } catch (parseErr) {
      console.error('[payments] callback parse error:', parseErr);
      // Log and return 200 so AT doesn't retry
      res.json({ ok: false, error: 'callback parse error' });
      return;
    }

    const { transactionId, success, receiptCode, checkoutRequestId } = callbackResult;

    // ── Find the transaction ──────────────────────────────────────────────────
    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionId },
      include: {
        session: {
          include: { station: true },
        },
      },
    });

    if (!transaction) {
      console.error(`[payments] callback: transaction ${transactionId} not found`);
      res.json({ ok: false, error: 'transaction not found' });
      return;
    }

    // ── IDEMPOTENCY: if already processed, do nothing ─────────────────────────
    if (transaction.status === 'COMPLETED' || transaction.status === 'FAILED') {
      console.log(`[payments] callback: transaction ${transactionId} already ${transaction.status} — skipping`);
      res.json({ ok: true, skipped: true });
      return;
    }

    const session  = transaction.session;
    const station  = session.station;

    if (success) {
      // ── SUCCESS PATH ──────────────────────────────────────────────────────
      await prisma.$transaction([
        // Update transaction
        prisma.transaction.update({
          where: { id: transactionId },
          data: { status: 'COMPLETED', mpesaReceipt: receiptCode ?? checkoutRequestId },
        }),
        // Activate the session
        prisma.session.update({
          where: { id: session.id },
          data: { status: 'ACTIVE' },
        }),
        // Unlock the station
        prisma.station.update({
          where: { id: station.id },
          data: { status: 'ACTIVE', currentSessionId: session.id },
        }),
      ]);

      // Hardware activation (fire-and-forget)
      adbService.switchToHDMI(station.adbAddress).catch(() => {});
      tuyaService.activateSync(station.tuyaDeviceId).catch(() => {});
      captureService.startCapture(station.id, station.captureDevice).catch(() => {});

      // Log audit events
      await prisma.securityEvent.createMany({
        data: [
          {
            type: 'MPESA_PAYMENT',
            description: `M-Pesa payment confirmed — ${transaction.amount} KES for session ${session.id}`,
            stationId: station.id,
            metadata: {
              transactionId, receiptCode: receiptCode ?? '', checkoutRequestId,
              rawPayload: JSON.stringify(payload),
            } as object,
          },
          {
            type: 'SESSION_START',
            description: `Session ${session.id} activated on ${station.name} after M-Pesa payment`,
            stationId: station.id,
          },
        ],
      });

      // Emit WebSocket events
      emitStationUpdate(station.id, { status: 'ACTIVE', currentSessionId: session.id });
      emitPaymentConfirmed(session.id, transactionId);

      console.log(`[payments] M-Pesa confirmed — session ${session.id} activated, receipt=${receiptCode}`);
    } else {
      // ── FAILURE PATH ──────────────────────────────────────────────────────
      await prisma.$transaction([
        prisma.transaction.update({
          where: { id: transactionId },
          data: { status: 'FAILED' },
        }),
        // Return station to AVAILABLE so a new booking can be made
        prisma.station.update({
          where: { id: station.id },
          data: { status: 'AVAILABLE', currentSessionId: null },
        }),
        // Mark the pending session as completed (abandoned)
        prisma.session.update({
          where: { id: session.id },
          data: { status: 'COMPLETED', endTime: new Date() },
        }),
      ]);

      await prisma.securityEvent.create({
        data: {
          type: 'MPESA_TIMEOUT',
          description: `M-Pesa payment failed for session ${session.id}`,
          stationId: station.id,
          metadata: { transactionId, checkoutRequestId, rawPayload: JSON.stringify(payload) } as object,
        },
      });

      emitStationUpdate(station.id, { status: 'AVAILABLE', currentSessionId: null });
      emitPaymentTimeout(session.id);

      console.log(`[payments] M-Pesa failed — station ${station.id} unlocked`);
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('[payments] POST /mpesa/callback error:', err);
    // Still return 200 to prevent AT retry loops
    res.json({ ok: false, error: 'internal error' });
  }
});

export default router;
