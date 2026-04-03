/**
 * Tests for RealTuyaService.
 *
 * Strategy: mock tuyapi entirely so no network access is needed.
 * The mock device implements the event emitter pattern tuyapi uses.
 */

import EventEmitter from 'events';

// Shared mock device — tests control its behavior via mockFind, mockSet, mockGet
const mockDevice = {
  find: jest.fn<Promise<void>, []>(),
  connect: jest.fn<void, []>(),
  disconnect: jest.fn<void, []>(),
  set: jest.fn<Promise<void>, [unknown]>(),
  get: jest.fn<Promise<unknown>, [unknown]>(),
  on: jest.fn<void, [string, (...args: unknown[]) => void]>(),
  once: jest.fn<void, [string, (...args: unknown[]) => void]>(),
  _emitter: new EventEmitter(),
};

jest.mock('tuyapi', () => jest.fn(() => mockDevice));

import { RealTuyaService } from '../tuyaService';

/** Helper: make the device connect successfully */
function connectSucceeds(): void {
  mockDevice.find.mockResolvedValue(undefined);
  mockDevice.once.mockImplementation((event, cb) => {
    if (event === 'connected') setImmediate(() => (cb as () => void)());
  });
}

/** Helper: make the device fail to connect */
function connectFails(message = 'ECONNREFUSED'): void {
  mockDevice.find.mockRejectedValue(new Error(message));
}

describe('RealTuyaService', () => {
  let service: RealTuyaService;

  beforeEach(() => {
    jest.useFakeTimers();
    // Reset all mocks
    mockDevice.find.mockReset();
    mockDevice.connect.mockReset();
    mockDevice.disconnect.mockReset();
    mockDevice.set.mockReset();
    mockDevice.get.mockReset();
    mockDevice.on.mockReset();
    mockDevice.once.mockReset();
    mockDevice.set.mockResolvedValue(undefined);
    mockDevice.get.mockResolvedValue({ dps: { '20': true } });

    process.env.TUYA_LOCAL_KEYS = JSON.stringify({
      'device-abc': 'localkey1234567',
    });

    service = new RealTuyaService();
  });

  afterEach(() => {
    service.destroy();
    jest.useRealTimers();
    delete process.env.TUYA_LOCAL_KEYS;
  });

  // ── setSyncMode ────────────────────────────────────────────────────────────

  describe('setSyncMode', () => {
    it('sends power=true and mode="music"', async () => {
      await service.setSyncMode('device-abc');
      expect(mockDevice.set).toHaveBeenCalledWith({
        multiple: true,
        data: expect.objectContaining({ '20': true, '21': 'music' }),
      });
    });

    it('returns success=true on success', async () => {
      const result = await service.setSyncMode('device-abc');
      expect(result.success).toBe(true);
    });

    it('returns success=false when set fails', async () => {
      mockDevice.set.mockRejectedValue(new Error('timeout'));
      const result = await service.setSyncMode('device-abc');
      expect(result.success).toBe(false);
    });
  });

  // ── setAmbientMode ─────────────────────────────────────────────────────────

  describe('setAmbientMode', () => {
    it('sends power=true, mode="colour", and PlayStation blue colour', async () => {
      await service.setAmbientMode('device-abc');
      expect(mockDevice.set).toHaveBeenCalledWith({
        multiple: true,
        data: expect.objectContaining({ '20': true, '21': 'colour', '24': expect.any(String) }),
      });
    });

    it('returns success=true on success', async () => {
      const result = await service.setAmbientMode('device-abc');
      expect(result.success).toBe(true);
    });

    it('returns success=false when set fails', async () => {
      mockDevice.set.mockRejectedValue(new Error('device offline'));
      const result = await service.setAmbientMode('device-abc');
      expect(result.success).toBe(false);
    });
  });

  // ── turnOff ────────────────────────────────────────────────────────────────

  describe('turnOff', () => {
    it('sends power=false', async () => {
      await service.turnOff('device-abc');
      expect(mockDevice.set).toHaveBeenCalledWith({
        multiple: true,
        data: expect.objectContaining({ '20': false }),
      });
    });

    it('returns success=true on success', async () => {
      const result = await service.turnOff('device-abc');
      expect(result.success).toBe(true);
    });
  });

  // ── getStatus ──────────────────────────────────────────────────────────────

  describe('getStatus', () => {
    it('returns connected=false when device has not been marked connected', async () => {
      const result = await service.getStatus('device-abc');
      expect(result.connected).toBe(false);
    });

    it('returns connected=false when get fails', async () => {
      // Force the internal connected map to true so get() is attempted
      (service as any).connected.set('device-abc', true);
      mockDevice.get.mockRejectedValue(new Error('timeout'));
      const result = await service.getStatus('device-abc');
      expect(result.connected).toBe(false);
    });

    it('returns connected=true when device responds to get', async () => {
      (service as any).connected.set('device-abc', true);
      mockDevice.get.mockResolvedValue({ '20': true });
      const result = await service.getStatus('device-abc');
      expect(result.connected).toBe(true);
    });
  });

  // ── connection failure handling ─────────────────────────────────────────────

  describe('connection failure handling', () => {
    it('marks device as disconnected when a command fails', async () => {
      (service as any).connected.set('device-abc', true);
      mockDevice.set.mockRejectedValue(new Error('broken pipe'));

      await service.setSyncMode('device-abc');

      expect((service as any).connected.get('device-abc')).toBe(false);
    });

    it('does not throw when a command fails', async () => {
      mockDevice.set.mockRejectedValue(new Error('timeout'));
      await expect(service.setSyncMode('device-abc')).resolves.toEqual({ success: false });
    });
  });

  // ── auto-reconnect ──────────────────────────────────────────────────────────

  describe('auto-reconnect', () => {
    it('attempts reconnect for disconnected devices after 30 seconds', async () => {
      // Seed a disconnected device
      (service as any).connected.set('device-abc', false);
      (service as any).getOrCreateDevice('device-abc'); // ensure device exists

      connectSucceeds();

      jest.advanceTimersByTime(30_000);
      await Promise.resolve();

      // find() should have been called as part of connectDevice
      expect(mockDevice.find).toHaveBeenCalled();
    });
  });

  // ── legacy alias ────────────────────────────────────────────────────────────

  describe('legacy aliases', () => {
    it('activateSync delegates to setSyncMode', async () => {
      const spy = jest.spyOn(service, 'setSyncMode');
      await service.activateSync('device-abc');
      expect(spy).toHaveBeenCalledWith('device-abc');
    });
  });

  // ── destroy ─────────────────────────────────────────────────────────────────

  describe('destroy', () => {
    it('disconnects all known devices', () => {
      (service as any).getOrCreateDevice('device-abc');
      service.destroy();
      expect(mockDevice.disconnect).toHaveBeenCalled();
    });
  });
});
