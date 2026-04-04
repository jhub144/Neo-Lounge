/**
 * Internet Connectivity Service
 *
 * Monitors primary broadband and 4G dongle, maintains route state and failover history.
 * Follows the same mock/real factory pattern used by ADB, Tuya, and payment services.
 *
 * Routes:
 *   "primary"  — main broadband is up
 *   "4g"       — broadband down, 4G dongle available
 *   "offline"  — both unavailable
 *
 * Mock mode: enabled by USE_MOCK_HARDWARE=true or USE_MOCK_INTERNET=true.
 *            MOCK_INTERNET_ROUTE env var overrides the simulated route.
 */

export type InternetRoute = 'primary' | '4g' | 'offline';

export interface FailoverEvent {
  timestamp: string;
  from: InternetRoute;
  to: InternetRoute;
  reason: string;
}

export interface IInternetService {
  getCurrentRoute(): InternetRoute;
  checkPrimaryInternet(): Promise<boolean>;
  check4GDongle(): Promise<boolean>;
  getFailoverHistory(hours?: number): FailoverEvent[];
  start(): void;
  stop(): void;
}

// ── Mock Implementation ───────────────────────────────────────────────────────

export class MockInternetService implements IInternetService {
  getCurrentRoute(): InternetRoute {
    const env = process.env.MOCK_INTERNET_ROUTE;
    if (env === 'primary' || env === '4g' || env === 'offline') return env;
    return 'primary';
  }

  async checkPrimaryInternet(): Promise<boolean> {
    const route = this.getCurrentRoute();
    return route === 'primary';
  }

  async check4GDongle(): Promise<boolean> {
    const route = this.getCurrentRoute();
    return route === '4g' || route === 'primary';
  }

  getFailoverHistory(_hours?: number): FailoverEvent[] {
    return [];
  }

  start(): void {}
  stop(): void {}
}

// ── Real Implementation ───────────────────────────────────────────────────────

const CHECK_INTERVAL_MS = 15_000;
const PING_TIMEOUT_MS = 5_000;
const MAX_HISTORY = 1_000;

// Cloudflare DNS-over-HTTPS — lightweight HEAD request
const PRIMARY_PING_URL = 'https://1.1.1.1';
// Default Huawei 4G dongle admin page (common in Kenya)
const DONGLE_PING_URL = process.env.DONGLE_URL ?? 'http://192.168.8.1';

export class RealInternetService implements IInternetService {
  private route: InternetRoute = 'primary';
  private history: FailoverEvent[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;

  getCurrentRoute(): InternetRoute {
    return this.route;
  }

  async checkPrimaryInternet(): Promise<boolean> {
    try {
      const res = await fetch(PRIMARY_PING_URL, {
        method: 'HEAD',
        signal: AbortSignal.timeout(PING_TIMEOUT_MS),
      });
      return res.ok || res.status < 500;
    } catch {
      return false;
    }
  }

  async check4GDongle(): Promise<boolean> {
    try {
      await fetch(DONGLE_PING_URL, {
        method: 'HEAD',
        signal: AbortSignal.timeout(PING_TIMEOUT_MS),
      });
      return true;
    } catch {
      return false;
    }
  }

  getFailoverHistory(hours = 24): FailoverEvent[] {
    const cutoffMs = Date.now() - hours * 3_600_000;
    return this.history.filter(e => new Date(e.timestamp).getTime() >= cutoffMs);
  }

  private setRoute(newRoute: InternetRoute, reason: string): void {
    if (newRoute === this.route) return;
    const event: FailoverEvent = {
      timestamp: new Date().toISOString(),
      from: this.route,
      to: newRoute,
      reason,
    };
    this.history.push(event);
    if (this.history.length > MAX_HISTORY) this.history.shift();
    console.log(`[internet] Route: ${this.route} → ${newRoute} (${reason})`);
    this.route = newRoute;
  }

  private async runCheck(): Promise<void> {
    const [primaryOk, dongleOk] = await Promise.all([
      this.checkPrimaryInternet(),
      this.check4GDongle(),
    ]);

    if (primaryOk) {
      this.setRoute('primary', 'primary internet restored');
    } else if (dongleOk) {
      this.setRoute('4g', 'primary failed, 4G dongle available');
    } else {
      this.setRoute('offline', 'primary and 4G both unavailable');
    }
  }

  start(): void {
    if (this.timer) return;
    this.runCheck().catch(() => {});
    this.timer = setInterval(() => this.runCheck().catch(() => {}), CHECK_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

const useMock =
  process.env.USE_MOCK_HARDWARE === 'true' || process.env.USE_MOCK_INTERNET === 'true';

export const internetService: IInternetService = useMock
  ? new MockInternetService()
  : new RealInternetService();
