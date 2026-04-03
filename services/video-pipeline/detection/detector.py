"""
Audio detection interface and implementations.

Mock (USE_MOCK_YAMNET=true, default):
  - Fires CROWD_ROAR every 90 seconds
  - Fires WHISTLE after 5 minutes
  - Respects cooldown (default 45 s)

Real stub (USE_MOCK_YAMNET=false):
  - Extracts audio from ffmpeg capture stream
  - TODO: run YAMNet TFLite inference and map categories
"""

import asyncio
import time
from dataclasses import dataclass
from typing import Callable, Optional, Awaitable

import config

# ── Event dataclass ───────────────────────────────────────────────────────────


@dataclass
class DetectionEvent:
    station_id: int
    event_type: str          # "CROWD_ROAR" | "WHISTLE" | "MUSIC"
    confidence: float
    timestamp: float         # unix epoch seconds


EventCallback = Callable[[DetectionEvent], Awaitable[None]]


# ── Base interface ────────────────────────────────────────────────────────────


class BaseDetector:
    def __init__(self) -> None:
        self._callbacks: list[EventCallback] = []

    def on_event(self, callback: EventCallback) -> None:
        self._callbacks.append(callback)

    async def _fire(self, event: DetectionEvent) -> None:
        for cb in self._callbacks:
            try:
                await cb(event)
            except Exception as exc:
                print(f"[detection] callback error: {exc}")

    async def start(self, station_id: int) -> None:
        raise NotImplementedError

    async def stop(self, station_id: int) -> None:
        raise NotImplementedError


# ── Mock ──────────────────────────────────────────────────────────────────────


class MockAudioDetector(BaseDetector):
    CROWD_ROAR_INTERVAL = 90        # seconds between CROWD_ROAR events
    WHISTLE_DELAY = 300             # seconds until WHISTLE (5 minutes)
    MOCK_CONFIDENCE = 0.85

    def __init__(self) -> None:
        super().__init__()
        self._tasks: dict[int, list[asyncio.Task]] = {}
        self._last_event_time: dict[int, float] = {}

    async def start(self, station_id: int) -> None:
        if station_id in self._tasks:
            return
        print(f"[detection mock] station {station_id}: start detection")
        tasks = [
            asyncio.create_task(self._crowd_roar_loop(station_id)),
            asyncio.create_task(self._whistle_task(station_id)),
        ]
        self._tasks[station_id] = tasks

    async def stop(self, station_id: int) -> None:
        tasks = self._tasks.pop(station_id, [])
        for task in tasks:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        self._last_event_time.pop(station_id, None)
        print(f"[detection mock] station {station_id}: stopped")

    def _within_cooldown(self, station_id: int, cooldown: int) -> bool:
        last = self._last_event_time.get(station_id, 0)
        return (time.time() - last) < cooldown

    async def _crowd_roar_loop(self, station_id: int) -> None:
        await asyncio.sleep(self.CROWD_ROAR_INTERVAL)
        while True:
            cooldown = config.CLIP_COOLDOWN_SECONDS
            if not self._within_cooldown(station_id, cooldown):
                self._last_event_time[station_id] = time.time()
                event = DetectionEvent(
                    station_id=station_id,
                    event_type="CROWD_ROAR",
                    confidence=self.MOCK_CONFIDENCE,
                    timestamp=time.time(),
                )
                print(f"[detection mock] station {station_id}: CROWD_ROAR fired")
                await self._fire(event)
            await asyncio.sleep(self.CROWD_ROAR_INTERVAL)

    async def _whistle_task(self, station_id: int) -> None:
        await asyncio.sleep(self.WHISTLE_DELAY)
        self._last_event_time[station_id] = time.time()
        event = DetectionEvent(
            station_id=station_id,
            event_type="WHISTLE",
            confidence=self.MOCK_CONFIDENCE,
            timestamp=time.time(),
        )
        print(f"[detection mock] station {station_id}: WHISTLE fired")
        await self._fire(event)

    def active_stations(self) -> list[int]:
        return list(self._tasks.keys())


# ── Real stub ─────────────────────────────────────────────────────────────────


class RealAudioDetector(BaseDetector):
    """
    Real YAMNet detector — extracts audio from the ffmpeg capture stream and
    runs TFLite inference.

    TODO: implement when hardware is available.
    """

    # YAMNet class indices that map to our trigger types
    # See: https://github.com/tensorflow/models/blob/master/research/audioset/yamnet/yamnet_class_map.csv
    CROWD_ROAR_CLASSES = [270, 271, 272]   # Crowd, Cheering, Chanting
    WHISTLE_CLASSES = [556, 557]            # Whistle, Referee whistle

    def __init__(self) -> None:
        super().__init__()
        self._tasks: dict[int, asyncio.Task] = {}
        # TODO: load YAMNet TFLite model
        # self._interpreter = tf.lite.Interpreter(model_path="yamnet.tflite")

    async def start(self, station_id: int) -> None:
        if station_id in self._tasks:
            return
        print(f"[detection real] station {station_id}: start detection (stub)")
        # TODO: launch audio extraction subprocess from ffmpeg capture stream
        # TODO: begin inference loop
        self._tasks[station_id] = asyncio.create_task(
            self._stub_loop(station_id)
        )

    async def stop(self, station_id: int) -> None:
        task = self._tasks.pop(station_id, None)
        if task:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        # TODO: stop audio extraction subprocess

    async def _stub_loop(self, station_id: int) -> None:
        """Placeholder — real implementation runs YAMNet inference here."""
        while True:
            # TODO: read audio chunk from capture stream
            # TODO: run YAMNet: scores, embeddings, spectrogram = yamnet_model(waveform)
            # TODO: map top class to trigger type if confidence >= threshold
            await asyncio.sleep(1)

    def active_stations(self) -> list[int]:
        return list(self._tasks.keys())


# ── Factory ───────────────────────────────────────────────────────────────────

detector: BaseDetector = (
    MockAudioDetector() if config.USE_MOCK_YAMNET else RealAudioDetector()
)
