/**
 * Tests for RealAdbService.
 *
 * Strategy: mock child_process.exec and attach a util.promisify.custom symbol
 * so that util.promisify(exec) returns our controllable mock instead of the
 * real exec → the service's execAsync is fully intercepted.
 */

// The mock factory runs before imports, so we set up the custom symbol here.
// mockExecAsync is the function that util.promisify(exec) will resolve to.
const mockExecAsync = jest.fn<Promise<{ stdout: string; stderr: string }>, [string]>();

jest.mock('child_process', () => {
  const { promisify } = jest.requireActual<typeof import('util')>('util');
  const execMock = jest.fn();
  // Attach the custom promisify symbol so util.promisify(execMock) === mockExecAsync
  (execMock as any)[promisify.custom] = mockExecAsync;
  return { exec: execMock };
});

import { RealAdbService } from '../adbService';

/** Make execAsync resolve with the given stdout */
function resolves(stdout: string): void {
  mockExecAsync.mockResolvedValue({ stdout, stderr: '' });
}

/** Make execAsync reject */
function rejects(message = 'command failed'): void {
  mockExecAsync.mockRejectedValue(new Error(message));
}

describe('RealAdbService', () => {
  let service: RealAdbService;

  beforeEach(() => {
    jest.useFakeTimers();
    mockExecAsync.mockReset();
    service = new RealAdbService();
  });

  afterEach(() => {
    service.destroy();
    jest.useRealTimers();
  });

  // ── connect ──────────────────────────────────────────────────────────────

  describe('connect', () => {
    it('builds the correct adb connect command', async () => {
      resolves('connected to 192.168.1.101:5555');
      await service.connect('192.168.1.101:5555');
      expect(mockExecAsync).toHaveBeenCalledWith('adb connect 192.168.1.101:5555');
    });

    it('returns success=true when output contains "connected to"', async () => {
      resolves('connected to 192.168.1.101:5555');
      const result = await service.connect('192.168.1.101:5555');
      expect(result.success).toBe(true);
    });

    it('returns success=true when output contains "already connected"', async () => {
      resolves('already connected to 192.168.1.101:5555');
      const result = await service.connect('192.168.1.101:5555');
      expect(result.success).toBe(true);
    });

    it('returns success=false when output is unexpected', async () => {
      resolves('failed to connect to 192.168.1.101:5555');
      const result = await service.connect('192.168.1.101:5555');
      expect(result.success).toBe(false);
    });

    it('returns success=false and does not throw when exec errors', async () => {
      rejects('connection refused');
      const result = await service.connect('192.168.1.101:5555');
      expect(result.success).toBe(false);
    });
  });

  // ── switchToHdmi ─────────────────────────────────────────────────────────

  describe('switchToHdmi', () => {
    it('sends the correct input select command with HDMI port 1', async () => {
      resolves('');
      await service.switchToHdmi('192.168.1.101:5555', 1);
      expect(mockExecAsync).toHaveBeenCalledWith(
        expect.stringContaining('adb -s 192.168.1.101:5555')
      );
      expect(mockExecAsync).toHaveBeenCalledWith(
        expect.stringContaining('port=1')
      );
    });

    it('uses HDMI port 1 by default', async () => {
      resolves('');
      await service.switchToHdmi('192.168.1.101:5555');
      expect(mockExecAsync).toHaveBeenCalledWith(
        expect.stringContaining('port=1')
      );
    });

    it('returns success=true on success', async () => {
      resolves('');
      const result = await service.switchToHdmi('192.168.1.101:5555');
      expect(result.success).toBe(true);
    });
  });

  // ── switchToAndroidTv ────────────────────────────────────────────────────

  describe('switchToAndroidTv', () => {
    it('sends the home launcher intent', async () => {
      resolves('');
      await service.switchToAndroidTv('192.168.1.101:5555');
      expect(mockExecAsync).toHaveBeenCalledWith(
        expect.stringContaining('android.intent.category.HOME')
      );
    });
  });

  // ── setBrightness ─────────────────────────────────────────────────────────

  describe('setBrightness', () => {
    it('converts 100% to 255', async () => {
      resolves('');
      await service.setBrightness('192.168.1.101:5555', 100);
      expect(mockExecAsync).toHaveBeenCalledWith(
        expect.stringContaining('screen_brightness 255')
      );
    });

    it('converts 0% to 0', async () => {
      resolves('');
      await service.setBrightness('192.168.1.101:5555', 0);
      expect(mockExecAsync).toHaveBeenCalledWith(
        expect.stringContaining('screen_brightness 0')
      );
    });

    it('converts 50% to rounded value', async () => {
      resolves('');
      await service.setBrightness('192.168.1.101:5555', 50);
      const call = mockExecAsync.mock.calls[0][0];
      const match = call.match(/screen_brightness (\d+)/);
      expect(match).not.toBeNull();
      const value = parseInt(match![1], 10);
      expect(value).toBeGreaterThanOrEqual(126);
      expect(value).toBeLessThanOrEqual(130);
    });
  });

  // ── powerOff / powerOn ────────────────────────────────────────────────────

  describe('powerOff', () => {
    it('sends KEYCODE_POWER (26)', async () => {
      resolves('');
      await service.powerOff('192.168.1.101:5555');
      expect(mockExecAsync).toHaveBeenCalledWith(
        expect.stringContaining('keyevent 26')
      );
    });
  });

  describe('powerOn', () => {
    it('sends KEYCODE_WAKEUP (224)', async () => {
      resolves('');
      await service.powerOn('192.168.1.101:5555');
      expect(mockExecAsync).toHaveBeenCalledWith(
        expect.stringContaining('keyevent 224')
      );
    });
  });

  // ── getStatus ─────────────────────────────────────────────────────────────

  describe('getStatus', () => {
    it('returns connected=true when get-state returns "device"', async () => {
      resolves('device\n');
      const result = await service.getStatus('192.168.1.101:5555');
      expect(result.connected).toBe(true);
    });

    it('returns connected=false when get-state returns anything else', async () => {
      resolves('offline\n');
      const result = await service.getStatus('192.168.1.101:5555');
      expect(result.connected).toBe(false);
    });

    it('returns connected=false when exec errors', async () => {
      rejects('no devices');
      const result = await service.getStatus('192.168.1.101:5555');
      expect(result.connected).toBe(false);
    });
  });

  // ── reconnect logic ───────────────────────────────────────────────────────

  describe('reconnect logic', () => {
    it('attempts reconnect for disconnected TVs after 30 seconds', async () => {
      // Register a TV that fails to connect
      rejects('connection refused');
      await service.connect('192.168.1.101:5555');

      mockExecAsync.mockReset();
      resolves('connected to 192.168.1.101:5555');

      // Advance timer to trigger the reconnect interval
      jest.advanceTimersByTime(30_000);
      // Allow pending microtasks to settle
      await Promise.resolve();

      expect(mockExecAsync).toHaveBeenCalledWith('adb connect 192.168.1.101:5555');
    });

    it('marks TV disconnected and triggers reconnect on command failure', async () => {
      // Connect succeeds first
      resolves('connected to 192.168.1.101:5555');
      await service.connect('192.168.1.101:5555');

      // Command fails — the fire-and-forget reconnect also uses this mock
      rejects('broken pipe');
      await service.switchToHdmi('192.168.1.101:5555');

      // Allow fire-and-forget connect() microtask to execute
      await Promise.resolve();
      await Promise.resolve();

      // The reconnect connect() call should appear in the call list
      const commands = mockExecAsync.mock.calls.map((c) => c[0] as string);
      const connectCalls = commands.filter((c) => c === 'adb connect 192.168.1.101:5555');
      // initial connect + reconnect triggered by failure
      expect(connectCalls.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ── legacy aliases ────────────────────────────────────────────────────────

  describe('legacy aliases', () => {
    it('switchToHDMI delegates to switchToHdmi', async () => {
      resolves('');
      const spy = jest.spyOn(service, 'switchToHdmi');
      await service.switchToHDMI('192.168.1.101:5555', 2);
      expect(spy).toHaveBeenCalledWith('192.168.1.101:5555', 2);
    });

    it('switchToScreensaver delegates to switchToAndroidTv', async () => {
      resolves('');
      const spy = jest.spyOn(service, 'switchToAndroidTv');
      await service.switchToScreensaver('192.168.1.101:5555');
      expect(spy).toHaveBeenCalledWith('192.168.1.101:5555');
    });
  });
});
