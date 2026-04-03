"""
Mock capture module — generates a test-pattern video using ffmpeg instead of
reading from a USB capture card.  Provides the same interface as the real capture.
"""

import asyncio
import os
import shutil
import time
from dataclasses import dataclass, field
from typing import Optional

import config


@dataclass
class CaptureProcess:
    station_id: int
    pid: Optional[int]
    start_time: float = field(default_factory=time.time)
    process: Optional[asyncio.subprocess.Process] = field(default=None, repr=False)
    buffer_dir: str = ""

    @property
    def uptime_seconds(self) -> float:
        return time.time() - self.start_time

    @property
    def is_running(self) -> bool:
        return self.process is not None and self.process.returncode is None

    def buffer_size_bytes(self) -> int:
        if not os.path.isdir(self.buffer_dir):
            return 0
        total = 0
        for f in os.listdir(self.buffer_dir):
            try:
                total += os.path.getsize(os.path.join(self.buffer_dir, f))
            except OSError:
                pass
        return total


class MockCaptureService:
    """
    Generates a rolling lavfi test-pattern video to simulate capture input.
    Writes 10-second segments to CAPTURE_BUFFER_DIR/{station_id}/.
    """

    # segment duration in seconds
    SEGMENT_SECONDS = 10
    # how many segments to keep (rolling window ~60 s)
    MAX_SEGMENTS = 6

    def __init__(self) -> None:
        self._captures: dict[int, CaptureProcess] = {}

    async def start(self, station_id: int, session_id: int, capture_device: str = "") -> CaptureProcess:
        if station_id in self._captures and self._captures[station_id].is_running:
            return self._captures[station_id]

        buffer_dir = os.path.join(config.CAPTURE_BUFFER_DIR, str(station_id))
        os.makedirs(buffer_dir, exist_ok=True)

        # ffmpeg test-pattern: 60×36 px, 1 fps — tiny so it runs fast in CI/dev
        segment_pattern = os.path.join(buffer_dir, "seg%03d.ts")
        cmd = [
            "ffmpeg", "-y",
            "-f", "lavfi",
            "-i", "testsrc=size=60x36:rate=1",
            "-f", "lavfi",
            "-i", "sine=frequency=440:sample_rate=8000",
            "-c:v", "libx264",
            "-preset", "ultrafast",
            "-crf", "51",
            "-c:a", "aac",
            "-b:a", "8k",
            "-f", "segment",
            "-segment_time", str(self.SEGMENT_SECONDS),
            "-segment_wrap", str(self.MAX_SEGMENTS),
            "-reset_timestamps", "1",
            segment_pattern,
        ]

        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )

        cap = CaptureProcess(
            station_id=station_id,
            pid=process.pid,
            process=process,
            buffer_dir=buffer_dir,
        )
        self._captures[station_id] = cap
        print(f"[capture mock] station {station_id}: started (pid={process.pid})")
        return cap

    async def stop(self, station_id: int) -> None:
        cap = self._captures.get(station_id)
        if cap is None:
            return
        if cap.process and cap.process.returncode is None:
            cap.process.terminate()
            try:
                await asyncio.wait_for(cap.process.wait(), timeout=5.0)
            except asyncio.TimeoutError:
                cap.process.kill()
        # Clean up buffer directory
        if os.path.isdir(cap.buffer_dir):
            shutil.rmtree(cap.buffer_dir, ignore_errors=True)
        del self._captures[station_id]
        print(f"[capture mock] station {station_id}: stopped")

    def get_status(self) -> list[dict]:
        return [
            {
                "station_id": cap.station_id,
                "running": cap.is_running,
                "pid": cap.pid,
                "uptime_seconds": round(cap.uptime_seconds, 1),
                "buffer_size_bytes": cap.buffer_size_bytes(),
                "buffer_dir": cap.buffer_dir,
            }
            for cap in self._captures.values()
        ]

    def get(self, station_id: int) -> Optional[CaptureProcess]:
        return self._captures.get(station_id)

    def cleanup_orphaned_buffers(self) -> None:
        """Remove buffer directories for stations that are not actively capturing."""
        base = config.CAPTURE_BUFFER_DIR
        if not os.path.isdir(base):
            return
        active = {str(sid) for sid in self._captures}
        for entry in os.listdir(base):
            if entry not in active:
                path = os.path.join(base, entry)
                if os.path.isdir(path):
                    shutil.rmtree(path, ignore_errors=True)
                    print(f"[capture mock] cleaned orphaned buffer: {path}")
