import TuyAPI from 'tuyapi';

export interface ITuyaService {
  initDevices(deviceIds: string[]): void;
  destroy(): void;
  setSyncMode(deviceId: string): Promise<{ success: boolean }>;
  setAmbientMode(deviceId: string): Promise<{ success: boolean }>;
  turnOff(deviceId: string): Promise<{ success: boolean }>;
  getStatus(deviceId: string): Promise<{ connected: boolean }>;
  // Legacy aliases
  activateSync(deviceId: string): Promise<{ success: boolean }>;
}

// ── DPS constants for Tuya LED strips ──────────────────────────────────────

const DPS_POWER   = '20'; // boolean
const DPS_MODE    = '21'; // 'white' | 'colour' | 'scene' | 'music'
const DPS_COLOUR  = '24'; // hex HHSSVV (hue, saturation, value)
const COLOUR_BLUE = '016E64000001'; // PlayStation blue at full brightness

// ── Mock ────────────────────────────────────────────────────────────────────

export class MockTuyaService implements ITuyaService {
  initDevices(_deviceIds: string[]): void {}
  destroy(): void {}

  async setSyncMode(deviceId: string): Promise<{ success: boolean }> {
    console.log(`[Tuya mock] ${deviceId}: activate sync mode`);
    return { success: true };
  }

  async setAmbientMode(deviceId: string): Promise<{ success: boolean }> {
    console.log(`[Tuya mock] ${deviceId}: set ambient mode`);
    return { success: true };
  }

  async turnOff(deviceId: string): Promise<{ success: boolean }> {
    console.log(`[Tuya mock] ${deviceId}: turn off`);
    return { success: true };
  }

  async getStatus(deviceId: string): Promise<{ connected: boolean }> {
    console.log(`[Tuya mock] ${deviceId}: get status`);
    return { connected: true };
  }

  // Legacy alias
  async activateSync(deviceId: string): Promise<{ success: boolean }> {
    return this.setSyncMode(deviceId);
  }
}

// ── Real ────────────────────────────────────────────────────────────────────

/**
 * Configuration is loaded from the TUYA_LOCAL_KEYS environment variable.
 * Format: JSON object mapping deviceId → localKey, e.g.:
 *   TUYA_LOCAL_KEYS='{"abc123":"abcdef1234567890","def456":"fedcba0987654321"}'
 */
export class RealTuyaService implements ITuyaService {
  private localKeys: Record<string, string>;
  private devices = new Map<string, InstanceType<typeof TuyAPI>>();
  private connected = new Map<string, boolean>();
  private reconnectTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    try {
      this.localKeys = JSON.parse(process.env.TUYA_LOCAL_KEYS ?? '{}');
    } catch {
      console.warn('[Tuya] TUYA_LOCAL_KEYS is not valid JSON — no devices will connect');
      this.localKeys = {};
    }
    this.reconnectTimer = setInterval(() => this.reconnectAll(), 30_000);
  }

  /** Call on startup with all station tuyaDeviceId values. */
  initDevices(deviceIds: string[]): void {
    for (const id of deviceIds.filter(Boolean)) {
      if (!this.connected.has(id)) {
        this.connected.set(id, false);
        this.connectDevice(id).catch(() => {});
      }
    }
  }

  destroy(): void {
    if (this.reconnectTimer) {
      clearInterval(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    for (const [, device] of this.devices) {
      try { device.disconnect(); } catch { /* ignore */ }
    }
    this.devices.clear();
  }

  private getOrCreateDevice(deviceId: string): InstanceType<typeof TuyAPI> {
    if (!this.devices.has(deviceId)) {
      const key = this.localKeys[deviceId] ?? '';
      const device = new TuyAPI({ id: deviceId, key });
      device.on('disconnected', () => {
        console.warn(`[Tuya] ${deviceId}: disconnected`);
        this.connected.set(deviceId, false);
        this.connectDevice(deviceId).catch(() => {});
      });
      device.on('error', (err: Error) => {
        console.error(`[Tuya] ${deviceId}: error`, err.message);
        this.connected.set(deviceId, false);
      });
      this.devices.set(deviceId, device);
    }
    return this.devices.get(deviceId)!;
  }

  private async connectDevice(deviceId: string): Promise<void> {
    try {
      const device = this.getOrCreateDevice(deviceId);
      await device.find();
      await new Promise<void>((resolve, reject) => {
        device.once('connected', resolve);
        device.once('error', reject);
        device.connect();
      });
      this.connected.set(deviceId, true);
      console.log(`[Tuya] ${deviceId}: connected`);
    } catch (err) {
      console.error(`[Tuya] ${deviceId}: connect failed`, err);
      this.connected.set(deviceId, false);
    }
  }

  private async reconnectAll(): Promise<void> {
    for (const [id, isConnected] of this.connected.entries()) {
      if (!isConnected) {
        this.connectDevice(id).catch(() => {});
      }
    }
  }

  private async sendCommand(
    deviceId: string,
    dps: Record<string, string | number | boolean>
  ): Promise<{ success: boolean }> {
    try {
      const device = this.getOrCreateDevice(deviceId);
      await device.set({ multiple: true, data: dps as any });
      return { success: true };
    } catch (err) {
      console.error(`[Tuya] ${deviceId}: command failed`, err);
      this.connected.set(deviceId, false);
      this.connectDevice(deviceId).catch(() => {});
      return { success: false };
    }
  }

  async setSyncMode(deviceId: string): Promise<{ success: boolean }> {
    // 'music' mode: LEDs react to audio/HDMI input in real-time
    return this.sendCommand(deviceId, {
      [DPS_POWER]: true,
      [DPS_MODE]: 'music',
    });
  }

  async setAmbientMode(deviceId: string): Promise<{ success: boolean }> {
    // 'colour' mode: steady PlayStation blue
    return this.sendCommand(deviceId, {
      [DPS_POWER]: true,
      [DPS_MODE]: 'colour',
      [DPS_COLOUR]: COLOUR_BLUE,
    });
  }

  async turnOff(deviceId: string): Promise<{ success: boolean }> {
    return this.sendCommand(deviceId, { [DPS_POWER]: false });
  }

  async getStatus(deviceId: string): Promise<{ connected: boolean }> {
    const isConnected = this.connected.get(deviceId) ?? false;
    if (!isConnected) return { connected: false };
    try {
      const device = this.getOrCreateDevice(deviceId);
      await device.get({ dps: parseInt(DPS_POWER, 10) });
      return { connected: true };
    } catch {
      this.connected.set(deviceId, false);
      return { connected: false };
    }
  }

  // Legacy alias
  async activateSync(deviceId: string): Promise<{ success: boolean }> {
    return this.setSyncMode(deviceId);
  }
}

// ── Factory ─────────────────────────────────────────────────────────────────

export const tuyaService: ITuyaService =
  process.env.USE_MOCK_TUYA === 'false'
    ? new RealTuyaService()
    : new MockTuyaService();
