"""
Security camera continuous recording.

Mock mode (USE_MOCK_CAMERAS=true): ffmpeg test-pattern streams per camera.
Real mode (USE_MOCK_CAMERAS=false): connects to each camera's RTSP URL.

Writes 15-minute rolling segments to SECURITY_RECORDING_DIR/{camera_id}/.
Monitors each camera every 30 s and auto-reconnects on failure.
"""

import asyncio
import os
import shutil
import time
from dataclasses import dataclass, field
from typing import Optional

import httpx

import config


@dataclass
class CameraProcess:
    camera_id: int
    rtsp_url: str
    pid: Optional[int] = None
    process: Optional[asyncio.subprocess.Process] = field(default=None, repr=False)
    start_time: float = field(default_factory=time.time)
    recording_dir: str = ""
    online: bool = False

    @property
    def uptime_seconds(self) -> float:
        return time.time() - self.start_time

    @property
    def is_running(self) -> bool:
        return self.process is not None and self.process.returncode is None

    def segment_count(self) -> int:
        if not os.path.isdir(self.recording_dir):
            return 0
        return sum(1 for f in os.listdir(self.recording_dir) if f.endswith(".ts"))


class SecurityRecorder:
    HEALTH_CHECK_INTERVAL = 30
    SEGMENT_SECONDS = config.SECURITY_SEGMENT_MINUTES * 60

    def __init__(self) -> None:
        self._cameras: dict[int, CameraProcess] = {}
        self._health_task: Optional[asyncio.Task] = None

    # ── Public API ────────────────────────────────────────────────────────────

    async def start_recording(self, cameras: list[dict]) -> list[dict]:
        """Start recording for all provided camera records."""
        results = []
        for cam in cameras:
            cam_id = cam["id"]
            rtsp_url = cam.get("rtspUrl", "")
            proc = await self._start_camera(cam_id, rtsp_url)
            results.append({
                "camera_id": cam_id,
                "recording": proc.is_running,
                "pid": proc.pid,
            })

        if self._health_task is None or self._health_task.done():
            self._health_task = asyncio.create_task(self._health_loop())

        return results

    async def stop_recording(self) -> None:
        if self._health_task:
            self._health_task.cancel()
            try:
                await self._health_task
            except asyncio.CancelledError:
                pass
            self._health_task = None

        for cam_id in list(self._cameras.keys()):
            await self._stop_camera(cam_id)

    def get_status(self) -> list[dict]:
        return [
            {
                "camera_id": cam.camera_id,
                "recording": cam.is_running,
                "online": cam.online,
                "pid": cam.pid,
                "uptime_seconds": round(cam.uptime_seconds, 1),
                "segment_count": cam.segment_count(),
                "recording_dir": cam.recording_dir,
                "rtsp_url": cam.rtsp_url,
            }
            for cam in self._cameras.values()
        ]

    def total_recording(self) -> int:
        return sum(1 for cam in self._cameras.values() if cam.is_running)

    async def extract_clips(
        self,
        event_id: int,
        event_type: str,
        timestamp: float,
        before_minutes: int = 5,
        after_minutes: int = 5,
    ) -> list[dict]:
        """Extract clips from all cameras around the given timestamp."""
        results = []
        os.makedirs(config.SECURITY_CLIPS_DIR, exist_ok=True)

        for cam in self._cameras.values():
            clip_path = await self._extract_camera_clip(
                cam, event_type, timestamp, before_minutes, after_minutes
            )
            if clip_path:
                clip_id = await self._register_clip(cam.camera_id, event_id, clip_path)
                results.append({
                    "camera_id": cam.camera_id,
                    "clip_path": clip_path,
                    "clip_id": clip_id,
                })

        return results

    # ── Private ───────────────────────────────────────────────────────────────

    async def _start_camera(self, camera_id: int, rtsp_url: str) -> CameraProcess:
        if camera_id in self._cameras and self._cameras[camera_id].is_running:
            return self._cameras[camera_id]

        rec_dir = os.path.join(config.SECURITY_RECORDING_DIR, str(camera_id))
        os.makedirs(rec_dir, exist_ok=True)

        process = await self._launch_ffmpeg(camera_id, rtsp_url, rec_dir)
        cam = CameraProcess(
            camera_id=camera_id,
            rtsp_url=rtsp_url,
            pid=process.pid if process else None,
            process=process,
            recording_dir=rec_dir,
            online=process is not None,
        )
        self._cameras[camera_id] = cam
        print(f"[security] camera {camera_id}: started (pid={cam.pid})")
        return cam

    async def _stop_camera(self, camera_id: int) -> None:
        cam = self._cameras.pop(camera_id, None)
        if cam and cam.process and cam.process.returncode is None:
            cam.process.terminate()
            try:
                await asyncio.wait_for(cam.process.wait(), timeout=5.0)
            except asyncio.TimeoutError:
                cam.process.kill()
        print(f"[security] camera {camera_id}: stopped")

    async def _launch_ffmpeg(
        self, camera_id: int, rtsp_url: str, rec_dir: str
    ) -> Optional[asyncio.subprocess.Process]:
        seg_pattern = os.path.join(rec_dir, "seg%05d.ts")

        if config.USE_MOCK_CAMERAS:
            # Generate a tiny test-pattern stream
            cmd = [
                "ffmpeg", "-y",
                "-f", "lavfi", "-i", "testsrc=size=60x36:rate=1",
                "-f", "lavfi", "-i", "anullsrc=r=8000:cl=mono",
                "-c:v", "libx264", "-preset", "ultrafast", "-crf", "51",
                "-c:a", "aac", "-b:a", "8k",
                "-f", "segment",
                "-segment_time", str(self.SEGMENT_SECONDS),
                "-segment_wrap", "48",  # ~12 hours retention at 15 min segments
                "-reset_timestamps", "1",
                seg_pattern,
            ]
        else:
            if not rtsp_url:
                print(f"[security] camera {camera_id}: no RTSP URL, skipping")
                return None
            cmd = [
                "ffmpeg", "-y",
                "-rtsp_transport", "tcp",
                "-i", rtsp_url,
                "-c", "copy",
                "-f", "segment",
                "-segment_time", str(self.SEGMENT_SECONDS),
                "-segment_wrap", "48",
                "-reset_timestamps", "1",
                seg_pattern,
            ]

        try:
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.DEVNULL,
            )
            return process
        except Exception as exc:
            print(f"[security] camera {camera_id}: failed to launch ffmpeg: {exc}")
            return None

    async def _health_loop(self) -> None:
        while True:
            await asyncio.sleep(self.HEALTH_CHECK_INTERVAL)
            for cam in list(self._cameras.values()):
                if not cam.is_running:
                    print(f"[security] camera {cam.camera_id}: reconnecting")
                    cam.online = False
                    await self._notify_camera_offline(cam.camera_id)
                    new_proc = await self._launch_ffmpeg(
                        cam.camera_id, cam.rtsp_url, cam.recording_dir
                    )
                    if new_proc:
                        cam.process = new_proc
                        cam.pid = new_proc.pid
                        cam.online = True
                        cam.start_time = time.time()

    async def _notify_camera_offline(self, camera_id: int) -> None:
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                await client.patch(
                    f"{config.MAIN_API_URL}/api/security/cameras/{camera_id}",
                    json={"isOnline": False},
                )
        except Exception:
            pass

    async def _extract_camera_clip(
        self,
        cam: CameraProcess,
        event_type: str,
        timestamp: float,
        before_minutes: int,
        after_minutes: int,
    ) -> Optional[str]:
        ts_str = time.strftime("%Y%m%dT%H%M%S", time.gmtime(timestamp))
        out_name = f"{event_type}_{ts_str}_cam{cam.camera_id}.mp4"
        out_path = os.path.join(config.SECURITY_CLIPS_DIR, out_name)

        if config.USE_MOCK_CAMERAS:
            # In mock mode, copy a blank file as the "clip"
            open(out_path, "wb").close()
            return out_path

        segments = sorted(
            [
                os.path.join(cam.recording_dir, f)
                for f in os.listdir(cam.recording_dir)
                if f.endswith(".ts")
            ],
            key=os.path.getmtime,
        )
        if not segments:
            return None

        start_t = timestamp - before_minutes * 60
        relevant = [s for s in segments if os.path.getmtime(s) >= start_t - 60]
        if not relevant:
            relevant = segments[-max(1, before_minutes):]

        concat_list = f"/tmp/sec_concat_{cam.camera_id}.txt"
        with open(concat_list, "w") as f:
            for seg in relevant:
                f.write(f"file '{seg}'\n")

        duration = (before_minutes + after_minutes) * 60
        cmd = [
            "ffmpeg", "-y",
            "-f", "concat", "-safe", "0", "-i", concat_list,
            "-t", str(duration),
            "-c", "copy",
            out_path,
        ]
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        await proc.wait()
        return out_path if proc.returncode == 0 else None

    async def _register_clip(
        self, camera_id: int, event_id: int, file_path: str
    ) -> Optional[int]:
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.post(
                    f"{config.MAIN_API_URL}/api/security/clips",
                    json={"cameraId": camera_id, "eventId": event_id, "filePath": file_path},
                )
                resp.raise_for_status()
                return resp.json().get("clipId")
        except Exception as exc:
            print(f"[security] failed to register clip: {exc}")
            return None


# Module-level singleton
security_recorder = SecurityRecorder()
