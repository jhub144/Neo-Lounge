export class MockAdbService {
  async switchToHDMI(adbAddress: string, hdmiPort = 1) {
    console.log(`[ADB] ${adbAddress}: switch to HDMI ${hdmiPort}`);
    return { success: true };
  }

  async switchToScreensaver(adbAddress: string) {
    console.log(`[ADB] ${adbAddress}: switch to screensaver`);
    return { success: true };
  }

  async setBrightness(adbAddress: string, level: number) {
    console.log(`[ADB] ${adbAddress}: set brightness ${level}`);
    return { success: true };
  }
}

export const adbService = new MockAdbService();
