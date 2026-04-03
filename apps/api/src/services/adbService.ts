import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface IAdbService {
  connect(adbAddress: string): Promise<{ success: boolean }>;
  switchToHdmi(adbAddress: string, hdmiPort?: number): Promise<{ success: boolean }>;
  switchToAndroidTv(adbAddress: string): Promise<{ success: boolean }>;
  setBrightness(adbAddress: string, percent: number): Promise<{ success: boolean }>;
  powerOff(adbAddress: string): Promise<{ success: boolean }>;
  powerOn(adbAddress: string): Promise<{ success: boolean }>;
  getStatus(adbAddress: string): Promise<{ connected: boolean }>;
  initAddresses(addresses: string[]): void;
  destroy(): void;
  // Legacy aliases kept for backward compatibility
  switchToHDMI(adbAddress: string, hdmiPort?: number): Promise<{ success: boolean }>;
  switchToScreensaver(adbAddress: string): Promise<{ success: boolean }>;
}

// ── Mock ─────────────────────────────────────────────────────────────────────

export class MockAdbService implements IAdbService {
  initAddresses(_addresses: string[]): void {}
  destroy(): void {}

  async connect(adbAddress: string): Promise<{ success: boolean }> {
    console.log(`[ADB mock] connect ${adbAddress}`);
    return { success: true };
  }

  async switchToHdmi(adbAddress: string, hdmiPort = 1): Promise<{ success: boolean }> {
    console.log(`[ADB mock] ${adbAddress}: switch to HDMI ${hdmiPort}`);
    return { success: true };
  }

  async switchToAndroidTv(adbAddress: string): Promise<{ success: boolean }> {
    console.log(`[ADB mock] ${adbAddress}: switch to Android TV`);
    return { success: true };
  }

  async setBrightness(adbAddress: string, percent: number): Promise<{ success: boolean }> {
    console.log(`[ADB mock] ${adbAddress}: set brightness ${percent}%`);
    return { success: true };
  }

  async powerOff(adbAddress: string): Promise<{ success: boolean }> {
    console.log(`[ADB mock] ${adbAddress}: power off`);
    return { success: true };
  }

  async powerOn(adbAddress: string): Promise<{ success: boolean }> {
    console.log(`[ADB mock] ${adbAddress}: power on (wake)`);
    return { success: true };
  }

  async getStatus(adbAddress: string): Promise<{ connected: boolean }> {
    console.log(`[ADB mock] ${adbAddress}: get status`);
    return { connected: true };
  }

  // Legacy aliases
  async switchToHDMI(adbAddress: string, hdmiPort = 1): Promise<{ success: boolean }> {
    return this.switchToHdmi(adbAddress, hdmiPort);
  }

  async switchToScreensaver(adbAddress: string): Promise<{ success: boolean }> {
    return this.switchToAndroidTv(adbAddress);
  }
}

// ── Real ─────────────────────────────────────────────────────────────────────

export class RealAdbService implements IAdbService {
  private connected = new Map<string, boolean>();
  private reconnectTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.reconnectTimer = setInterval(() => this.reconnectAll(), 30_000);
  }

  /** Call on startup with all station adbAddress values from the database. */
  initAddresses(addresses: string[]): void {
    for (const addr of addresses.filter(Boolean)) {
      if (!this.connected.has(addr)) {
        this.connected.set(addr, false);
        this.connect(addr).catch(() => {});
      }
    }
  }

  destroy(): void {
    if (this.reconnectTimer) {
      clearInterval(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private async reconnectAll(): Promise<void> {
    for (const [addr, isConnected] of this.connected.entries()) {
      if (!isConnected) {
        this.connect(addr).catch(() => {});
      }
    }
  }

  private async run(adbAddress: string, args: string): Promise<{ success: boolean }> {
    try {
      await execAsync(`adb -s ${adbAddress} ${args}`);
      return { success: true };
    } catch (err) {
      console.error(`[ADB] ${adbAddress}: command failed — ${args}`, err);
      this.connected.set(adbAddress, false);
      this.connect(adbAddress).catch(() => {});
      return { success: false };
    }
  }

  async connect(adbAddress: string): Promise<{ success: boolean }> {
    try {
      const { stdout } = await execAsync(`adb connect ${adbAddress}`);
      const success =
        stdout.includes('connected to') || stdout.includes('already connected');
      this.connected.set(adbAddress, success);
      if (!success) {
        console.warn(`[ADB] connect ${adbAddress}: unexpected output — ${stdout.trim()}`);
      }
      return { success };
    } catch (err) {
      console.error(`[ADB] connect ${adbAddress}: failed`, err);
      this.connected.set(adbAddress, false);
      return { success: false };
    }
  }

  async switchToHdmi(adbAddress: string, hdmiPort = 1): Promise<{ success: boolean }> {
    // Send HDMI input select via CEC: KEYCODE_TV_INPUT (178) selects next input;
    // For a specific port we use the Android TV input method.
    return this.run(
      adbAddress,
      `shell am start -a android.intent.action.VIEW -d "tv://input?type=hdmi&port=${hdmiPort}"`
    );
  }

  async switchToAndroidTv(adbAddress: string): Promise<{ success: boolean }> {
    // Return to the Android TV home launcher
    return this.run(
      adbAddress,
      'shell am start -a android.intent.action.MAIN -c android.intent.category.HOME'
    );
  }

  async setBrightness(adbAddress: string, percent: number): Promise<{ success: boolean }> {
    // Android screen_brightness is 0–255; convert from 0–100
    const level = Math.round(Math.min(100, Math.max(0, percent)) * 2.55);
    return this.run(
      adbAddress,
      `shell settings put system screen_brightness ${level}`
    );
  }

  async powerOff(adbAddress: string): Promise<{ success: boolean }> {
    return this.run(adbAddress, 'shell input keyevent 26'); // KEYCODE_POWER
  }

  async powerOn(adbAddress: string): Promise<{ success: boolean }> {
    return this.run(adbAddress, 'shell input keyevent 224'); // KEYCODE_WAKEUP
  }

  async getStatus(adbAddress: string): Promise<{ connected: boolean }> {
    try {
      const { stdout } = await execAsync(`adb -s ${adbAddress} get-state`);
      const connected = stdout.trim() === 'device';
      this.connected.set(adbAddress, connected);
      return { connected };
    } catch {
      this.connected.set(adbAddress, false);
      return { connected: false };
    }
  }

  // Legacy aliases
  async switchToHDMI(adbAddress: string, hdmiPort = 1): Promise<{ success: boolean }> {
    return this.switchToHdmi(adbAddress, hdmiPort);
  }

  async switchToScreensaver(adbAddress: string): Promise<{ success: boolean }> {
    return this.switchToAndroidTv(adbAddress);
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

export const adbService: IAdbService =
  process.env.USE_MOCK_ADB === 'false'
    ? new RealAdbService()
    : new MockAdbService();
