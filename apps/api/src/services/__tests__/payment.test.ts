import { MockPaymentService, normalizePhone, isValidKenyanPhone } from '../paymentService';

// --- Phone number normalisation tests ----------------------------------------

describe('normalizePhone', () => {
  test('accepts 07XXXXXXXX (10 digits starting with 0)', () => {
    expect(normalizePhone('0712345678')).toBe('254712345678');
  });

  test('accepts 254XXXXXXXXX (12 digits)', () => {
    expect(normalizePhone('254712345678')).toBe('254712345678');
  });

  test('accepts +254XXXXXXXXX (strips +)', () => {
    expect(normalizePhone('+254712345678')).toBe('254712345678');
  });

  test('accepts 7XXXXXXXXX (9 digits starting with 7)', () => {
    expect(normalizePhone('712345678')).toBe('254712345678');
  });

  test('throws on invalid number', () => {
    expect(() => normalizePhone('1234')).toThrow('Invalid Kenyan phone number');
  });
});

describe('isValidKenyanPhone', () => {
  test('returns true for valid number', () => {
    expect(isValidKenyanPhone('0712345678')).toBe(true);
  });
  test('returns false for invalid number', () => {
    expect(isValidKenyanPhone('123')).toBe(false);
  });
});

// --- MockPaymentService tests ------------------------------------------------

describe('MockPaymentService', () => {
  let service: MockPaymentService;

  beforeEach(() => {
    service = new MockPaymentService();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  test('initiateStkPush returns success shape after 3s delay', async () => {
    const promise = service.initiateStkPush('0712345678', 300, 42);
    jest.advanceTimersByTime(3000);
    const result = await promise;

    expect(result.success).toBe(true);
    expect(result.checkoutRequestId).toContain('MOCK_CHECKOUT_42');
  });

  test('checkoutRequestId encodes the transactionId', async () => {
    const promise = service.initiateStkPush('0700000001', 150, 99);
    jest.advanceTimersByTime(3000);
    const { checkoutRequestId } = await promise;
    expect(checkoutRequestId).toMatch(/MOCK_CHECKOUT_99_/);
  });

  test('processCallback returns success shape for successful payment', async () => {
    const result = await service.processCallback({
      checkoutRequestId: 'MOCK_CHECKOUT_1_999',
      transactionId: '1',
      status: 'Success',
      receiptCode: 'MOCK_RECEIPT_1',
    });

    expect(result.success).toBe(true);
    expect(result.transactionId).toBe(1);
    expect(result.receiptCode).toBe('MOCK_RECEIPT_1');
    expect(result.checkoutRequestId).toBe('MOCK_CHECKOUT_1_999');
  });

  test('processCallback returns failure shape for failed payment', async () => {
    const result = await service.processCallback({
      checkoutRequestId: 'MOCK_CHECKOUT_2_999',
      transactionId: '2',
      status: 'Failed',
    });

    expect(result.success).toBe(false);
    expect(result.transactionId).toBe(2);
    expect(result.receiptCode).toBeUndefined();
  });

  test('processCallback throws on invalid transactionId', async () => {
    await expect(service.processCallback({
      checkoutRequestId: 'any',
      transactionId: 'NOT_A_NUMBER',
      status: 'Success',
    })).rejects.toThrow('invalid transactionId');
  });

  test('checkInternetAvailability returns true for mock', async () => {
    expect(await service.checkInternetAvailability()).toBe(true);
  });

  test('auto-callback fires after 5 seconds with success payload', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ status: 200 });
    global.fetch = fetchMock as unknown as typeof fetch;

    process.env.MOCK_PAYMENT_SHOULD_FAIL = 'false';

    const promise = service.initiateStkPush('0712345678', 300, 77);
    jest.advanceTimersByTime(3000); // wait for initiate to resolve
    await promise;

    jest.advanceTimersByTime(2000); // complete the 5-second auto-callback delay
    await Promise.resolve(); // flush microtasks

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/payments/mpesa/callback'),
      expect.objectContaining({ method: 'POST' })
    );

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.status).toBe('Success');
    expect(body.transactionId).toBe('77');
  });

  test('auto-callback fires failure payload when MOCK_PAYMENT_SHOULD_FAIL=true', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ status: 200 });
    global.fetch = fetchMock as unknown as typeof fetch;

    process.env.MOCK_PAYMENT_SHOULD_FAIL = 'true';

    const promise = service.initiateStkPush('0712345678', 300, 88);
    jest.advanceTimersByTime(3000);
    await promise;
    jest.advanceTimersByTime(2000);
    await Promise.resolve();

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.status).toBe('Failed');

    delete process.env.MOCK_PAYMENT_SHOULD_FAIL;
  });
});
