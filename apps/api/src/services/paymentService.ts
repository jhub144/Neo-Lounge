/**
 * Payment Service — Africa's Talking M-Pesa STK Push
 *
 * Follows the same mock/real factory pattern used by ADB and Tuya services.
 * Switch with USE_MOCK_PAYMENTS=true (or if USE_MOCK_HARDWARE=true).
 */

const API_BASE = process.env.API_BASE_URL ?? 'http://localhost:3000';

// ── Interface ─────────────────────────────────────────────────────────────────

export interface StkPushResult {
  success: boolean;
  checkoutRequestId: string;
}

export interface CallbackResult {
  transactionId: number;
  success: boolean;
  receiptCode?: string;
  checkoutRequestId: string;
}

// Raw shape AT sends to our webhook
export interface AtCallbackPayload {
  // Africa's Talking callback fields
  transactionId?: string;
  checkoutRequestId?: string;
  status?: string;
  value?: string;
  phoneNumber?: string;
  // Allow anything else AT might add
  [key: string]: unknown;
}

export interface IPaymentService {
  initiateStkPush(phoneNumber: string, amount: number, transactionId: number): Promise<StkPushResult>;
  processCallback(payload: AtCallbackPayload): Promise<CallbackResult>;
  checkInternetAvailability(): Promise<boolean>;
}

// ── Mock Implementation ───────────────────────────────────────────────────────

const MOCK_CHECKOUT_PREFIX = 'MOCK_CHECKOUT_';
const MOCK_RECEIPT_PREFIX   = 'MOCK_RECEIPT_';

export class MockPaymentService implements IPaymentService {
  async initiateStkPush(phoneNumber: string, amount: number, transactionId: number): Promise<StkPushResult> {
    const checkoutRequestId = `${MOCK_CHECKOUT_PREFIX}${transactionId}_${Date.now()}`;
    console.log(`[MockPayment] STK Push → ${phoneNumber} amount=${amount} KES txId=${transactionId} checkoutId=${checkoutRequestId}`);

    const shouldFail = process.env.MOCK_PAYMENT_SHOULD_FAIL === 'true';

    // After 5 seconds, auto-trigger our own callback endpoint to simulate customer confirming
    setTimeout(async () => {
      const payload: AtCallbackPayload = {
        checkoutRequestId,
        transactionId: String(transactionId),
        status: shouldFail ? 'Failed' : 'Success',
        value: String(amount),
        phoneNumber,
        ...(shouldFail ? {} : { receiptCode: `${MOCK_RECEIPT_PREFIX}${transactionId}` }),
      };

      try {
        const res = await fetch(`${API_BASE}/api/payments/mpesa/callback`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const status = res.status;
        console.log(`[MockPayment] Auto-callback sent — status=${status}${shouldFail ? ' (SIMULATED FAILURE)' : ''}`);
      } catch (err) {
        console.error('[MockPayment] Auto-callback fetch error:', err);
      }
    }, 5000);

    // After 3 seconds, return success (the STK push was "sent")
    await new Promise(resolve => setTimeout(resolve, 3000));

    return { success: true, checkoutRequestId };
  }

  async processCallback(payload: AtCallbackPayload): Promise<CallbackResult> {
    const checkoutRequestId = payload.checkoutRequestId ?? '';
    const transactionIdStr  = payload.transactionId ?? '';
    const status            = payload.status ?? 'Failed';
    const receiptCode       = typeof payload.receiptCode === 'string' ? payload.receiptCode : undefined;

    const success = status === 'Success';
    const transactionId = parseInt(transactionIdStr, 10);

    if (isNaN(transactionId)) {
      throw new Error(`[MockPayment] processCallback: invalid transactionId "${transactionIdStr}"`);
    }

    console.log(`[MockPayment] processCallback checkoutId=${checkoutRequestId} success=${success} receipt=${receiptCode}`);

    return { transactionId, success, receiptCode, checkoutRequestId };
  }

  async checkInternetAvailability(): Promise<boolean> {
    // Mock always returns true
    return true;
  }
}

// ── Real Implementation ───────────────────────────────────────────────────────

export class RealPaymentService implements IPaymentService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private getMobile(): any {
    // Lazy-init so credential validation only runs on first real call, not at import time.
    // Required env vars: AT_API_KEY, AT_USERNAME, AT_ENVIRONMENT (sandbox|production), AT_SHORTCODE
    const apiKey   = process.env.AT_API_KEY  ?? '';
    const username = process.env.AT_USERNAME ?? '';
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const AfricasTalking = require('africastalking');
    return AfricasTalking({ apiKey, username }).MOBILE_MONEY;
  }

  async initiateStkPush(phoneNumber: string, amount: number, transactionId: number): Promise<StkPushResult> {
    try {
      // TODO: Wire up real Africa's Talking mobile.checkout() parameters
      // The shortcode and currency (KES) must match your AT sandbox/production account
      const response = await this.getMobile().checkout({
        productName: process.env.AT_SHORTCODE ?? 'Neo Lounge',
        phoneNumber: normalizePhone(phoneNumber),
        currencyCode: 'KES',
        amount,
        metadata: { transactionId: String(transactionId) },
      });

      const checkoutRequestId: string = response?.checkoutRequestId ?? '';
      return { success: !!checkoutRequestId, checkoutRequestId };
    } catch (err) {
      console.error('[RealPayment] initiateStkPush error:', err);
      return { success: false, checkoutRequestId: '' };
    }
  }

  async processCallback(payload: AtCallbackPayload): Promise<CallbackResult> {
    // TODO: Add Africa's Talking webhook signature verification
    const checkoutRequestId = String(payload.checkoutRequestId ?? '');
    const status            = String(payload.status ?? 'Failed');
    const receiptCode       = typeof payload.receiptCode === 'string' ? payload.receiptCode : undefined;

    // AT sends transactionId in metadata or as a top-level field
    const rawMetadata  = payload['metadata'];
    const metaTxId     = rawMetadata && typeof rawMetadata === 'object' && !Array.isArray(rawMetadata)
      ? (rawMetadata as Record<string, unknown>)['transactionId']
      : undefined;
    const rawTxId      = payload.transactionId ?? metaTxId;
    const transactionId = parseInt(String(rawTxId ?? ''), 10);

    if (isNaN(transactionId)) {
      throw new Error(`[RealPayment] processCallback: cannot resolve transactionId from payload`);
    }

    return {
      transactionId,
      success: status === 'Success',
      receiptCode,
      checkoutRequestId,
    };
  }

  async checkInternetAvailability(): Promise<boolean> {
    try {
      // TODO: Use a lightweight AT ping endpoint instead of fetching a full page
      const res = await fetch('https://account.africastalking.com', { signal: AbortSignal.timeout(5000) });
      return res.ok;
    } catch {
      return false;
    }
  }
}

// ── Phone number normalisation ────────────────────────────────────────────────

/**
 * Normalise Kenyan phone numbers to international 254XXXXXXXXX format.
 * Accepts: 07XXXXXXXX, +254XXXXXXXXX, 254XXXXXXXXX
 */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('254') && digits.length === 12) return digits;
  if (digits.startsWith('0')   && digits.length === 10) return `254${digits.slice(1)}`;
  if (digits.startsWith('7')   && digits.length === 9)  return `254${digits}`;
  throw new Error(`Invalid Kenyan phone number: "${raw}"`);
}

export function isValidKenyanPhone(raw: string): boolean {
  try { normalizePhone(raw); return true; } catch { return false; }
}

// ── Factory ───────────────────────────────────────────────────────────────────

const useMock = process.env.USE_MOCK_PAYMENTS === 'true' || process.env.USE_MOCK_HARDWARE === 'true';

export const paymentService: IPaymentService = useMock
  ? new MockPaymentService()
  : new RealPaymentService();
