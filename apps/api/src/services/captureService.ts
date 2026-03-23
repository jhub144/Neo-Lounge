const captureStatus: Record<number, boolean> = {};

export class MockCaptureService {
  async startCapture(stationId: number, captureDevice: string) {
    console.log(`[Capture] station ${stationId}: start capture on ${captureDevice}`);
    captureStatus[stationId] = true;
    return { success: true };
  }

  async stopCapture(stationId: number) {
    console.log(`[Capture] station ${stationId}: stop capture`);
    captureStatus[stationId] = false;
    return { success: true };
  }

  getStatus(stationId: number) {
    return { capturing: captureStatus[stationId] ?? false };
  }
}

export const captureService = new MockCaptureService();
