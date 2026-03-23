import { MockAdbService } from '../adbService';
import { MockTuyaService } from '../tuyaService';
import { MockCaptureService } from '../captureService';

describe('MockAdbService', () => {
  const adb = new MockAdbService();

  test('switchToHDMI returns success', async () => {
    const res = await adb.switchToHDMI('192.168.1.101:5555');
    expect(res).toEqual({ success: true });
  });

  test('switchToHDMI accepts hdmi port', async () => {
    const res = await adb.switchToHDMI('192.168.1.101:5555', 2);
    expect(res).toEqual({ success: true });
  });

  test('switchToScreensaver returns success', async () => {
    const res = await adb.switchToScreensaver('192.168.1.101:5555');
    expect(res).toEqual({ success: true });
  });

  test('setBrightness returns success', async () => {
    const res = await adb.setBrightness('192.168.1.101:5555', 80);
    expect(res).toEqual({ success: true });
  });
});

describe('MockTuyaService', () => {
  const tuya = new MockTuyaService();

  test('activateSync returns success', async () => {
    const res = await tuya.activateSync('device-001');
    expect(res).toEqual({ success: true });
  });

  test('setAmbientMode returns success', async () => {
    const res = await tuya.setAmbientMode('device-001');
    expect(res).toEqual({ success: true });
  });

  test('turnOff returns success', async () => {
    const res = await tuya.turnOff('device-001');
    expect(res).toEqual({ success: true });
  });
});

describe('MockCaptureService', () => {
  const capture = new MockCaptureService();

  test('startCapture returns success and marks capturing', async () => {
    const res = await capture.startCapture(1, '/dev/video0');
    expect(res).toEqual({ success: true });
    expect(capture.getStatus(1)).toEqual({ capturing: true });
  });

  test('stopCapture returns success and marks not capturing', async () => {
    await capture.startCapture(2, '/dev/video1');
    const res = await capture.stopCapture(2);
    expect(res).toEqual({ success: true });
    expect(capture.getStatus(2)).toEqual({ capturing: false });
  });

  test('getStatus returns false for unknown station', () => {
    expect(capture.getStatus(99)).toEqual({ capturing: false });
  });
});
