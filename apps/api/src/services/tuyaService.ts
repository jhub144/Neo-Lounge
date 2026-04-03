export class MockTuyaService {
  async activateSync(deviceId: string) {
    console.log(`[Tuya] ${deviceId}: activate sync mode`);
    return { success: true };
  }

  async setAmbientMode(deviceId: string) {
    console.log(`[Tuya] ${deviceId}: set ambient mode`);
    return { success: true };
  }

  async turnOff(deviceId: string) {
    console.log(`[Tuya] ${deviceId}: turn off`);
    return { success: true };
  }

  async getStatus(deviceId: string): Promise<{ connected: boolean }> {
    console.log(`[Tuya mock] ${deviceId}: get status`);
    return { connected: true };
  }
}

export const tuyaService = new MockTuyaService();
