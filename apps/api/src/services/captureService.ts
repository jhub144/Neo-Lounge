/**
 * Capture service — start/stop video capture for each station.
 *
 * Mock mode (USE_MOCK_CAPTURE=true, default): logs actions locally.
 * Real mode (USE_MOCK_CAPTURE=false): delegates to the Python video
 *   pipeline at PIPELINE_URL (default http://localhost:8000).
 */

const PIPELINE_URL = process.env.PIPELINE_URL ?? 'http://localhost:8000';

export interface ICaptureService {
  startCapture(stationId: number, captureDevice: string, sessionId?: number): Promise<{ success: boolean }>;
  stopCapture(stationId: number): Promise<{ success: boolean }>;
  getStatus(stationId: number): { capturing: boolean };
}

// ── Mock ──────────────────────────────────────────────────────────────────────

const captureStatus: Record<number, boolean> = {};

export class MockCaptureService implements ICaptureService {
  async startCapture(stationId: number, captureDevice: string): Promise<{ success: boolean }> {
    console.log(`[Capture mock] station ${stationId}: start capture on ${captureDevice}`);
    captureStatus[stationId] = true;
    return { success: true };
  }

  async stopCapture(stationId: number): Promise<{ success: boolean }> {
    console.log(`[Capture mock] station ${stationId}: stop capture`);
    captureStatus[stationId] = false;
    return { success: true };
  }

  getStatus(stationId: number): { capturing: boolean } {
    return { capturing: captureStatus[stationId] ?? false };
  }
}

// ── Real (HTTP → Python pipeline) ─────────────────────────────────────────────

export class RealCaptureService implements ICaptureService {
  private capturing = new Map<number, boolean>();

  async startCapture(stationId: number, captureDevice: string, sessionId = 0): Promise<{ success: boolean }> {
    try {
      const res = await fetch(`${PIPELINE_URL}/capture/start/${stationId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, capture_device: captureDevice }),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`pipeline responded ${res.status}`);
      this.capturing.set(stationId, true);
      return { success: true };
    } catch (err) {
      console.error(`[Capture] station ${stationId}: startCapture failed`, err);
      return { success: false };
    }
  }

  async stopCapture(stationId: number): Promise<{ success: boolean }> {
    try {
      const res = await fetch(`${PIPELINE_URL}/capture/stop/${stationId}`, {
        method: 'POST',
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`pipeline responded ${res.status}`);
      this.capturing.set(stationId, false);
      return { success: true };
    } catch (err) {
      console.error(`[Capture] station ${stationId}: stopCapture failed`, err);
      return { success: false };
    }
  }

  getStatus(stationId: number): { capturing: boolean } {
    return { capturing: this.capturing.get(stationId) ?? false };
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

export const captureService: ICaptureService =
  process.env.USE_MOCK_CAPTURE === 'false'
    ? new RealCaptureService()
    : new MockCaptureService();
