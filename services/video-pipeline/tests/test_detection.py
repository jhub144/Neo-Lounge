"""Tests for audio detection — MockAudioDetector behaviour."""

import asyncio
import time
import pytest
from unittest.mock import AsyncMock, patch

import config
from detection.detector import MockAudioDetector, DetectionEvent


@pytest.fixture
def detector():
    d = MockAudioDetector()
    # Speed up timers for tests
    d.CROWD_ROAR_INTERVAL = 0.05   # 50 ms
    d.WHISTLE_DELAY = 0.1          # 100 ms
    return d


class TestMockDetectorLifecycle:
    async def test_start_registers_station(self, detector: MockAudioDetector) -> None:
        await detector.start(1)
        assert 1 in detector.active_stations()
        await detector.stop(1)

    async def test_stop_removes_station(self, detector: MockAudioDetector) -> None:
        await detector.start(1)
        await detector.stop(1)
        assert 1 not in detector.active_stations()

    async def test_start_idempotent(self, detector: MockAudioDetector) -> None:
        await detector.start(1)
        await detector.start(1)
        assert detector.active_stations().count(1) == 1
        await detector.stop(1)

    async def test_stop_nonexistent_is_safe(self, detector: MockAudioDetector) -> None:
        await detector.stop(99)  # should not raise


class TestMockDetectorEvents:
    async def test_crowd_roar_fires_after_interval(self, detector: MockAudioDetector) -> None:
        events: list[DetectionEvent] = []

        async def capture(e: DetectionEvent) -> None:
            events.append(e)

        detector.on_event(capture)
        await detector.start(1)
        await asyncio.sleep(0.2)  # wait for at least one CROWD_ROAR
        await detector.stop(1)

        crowd_roars = [e for e in events if e.event_type == "CROWD_ROAR"]
        assert len(crowd_roars) >= 1

    async def test_crowd_roar_has_correct_fields(self, detector: MockAudioDetector) -> None:
        events: list[DetectionEvent] = []

        async def capture(e: DetectionEvent) -> None:
            events.append(e)

        detector.on_event(capture)
        await detector.start(2)
        await asyncio.sleep(0.2)
        await detector.stop(2)

        roar = next((e for e in events if e.event_type == "CROWD_ROAR"), None)
        assert roar is not None
        assert roar.station_id == 2
        assert roar.confidence == 0.85
        assert roar.timestamp > 0

    async def test_whistle_fires_after_delay(self, detector: MockAudioDetector) -> None:
        events: list[DetectionEvent] = []

        async def capture(e: DetectionEvent) -> None:
            events.append(e)

        detector.on_event(capture)
        await detector.start(1)
        await asyncio.sleep(0.2)
        await detector.stop(1)

        whistles = [e for e in events if e.event_type == "WHISTLE"]
        assert len(whistles) >= 1

    async def test_cooldown_suppresses_rapid_events(self, detector: MockAudioDetector) -> None:
        original_cooldown = config.CLIP_COOLDOWN_SECONDS
        config.CLIP_COOLDOWN_SECONDS = 999  # very long cooldown
        events: list[DetectionEvent] = []

        async def capture(e: DetectionEvent) -> None:
            events.append(e)

        try:
            detector.on_event(capture)
            await detector.start(1)
            await asyncio.sleep(0.5)
            await detector.stop(1)

            crowd_roars = [e for e in events if e.event_type == "CROWD_ROAR"]
            # With very long cooldown, only the first event should fire
            assert len(crowd_roars) <= 1
        finally:
            config.CLIP_COOLDOWN_SECONDS = original_cooldown

    async def test_multiple_callbacks_all_called(self, detector: MockAudioDetector) -> None:
        calls_a: list[DetectionEvent] = []
        calls_b: list[DetectionEvent] = []

        async def cb_a(e: DetectionEvent) -> None:
            calls_a.append(e)

        async def cb_b(e: DetectionEvent) -> None:
            calls_b.append(e)

        detector.on_event(cb_a)
        detector.on_event(cb_b)
        await detector.start(1)
        await asyncio.sleep(0.2)
        await detector.stop(1)

        assert len(calls_a) > 0
        assert len(calls_b) > 0

    async def test_callback_exception_does_not_stop_detector(
        self, detector: MockAudioDetector
    ) -> None:
        good_events: list[DetectionEvent] = []

        async def bad_cb(_e: DetectionEvent) -> None:
            raise RuntimeError("callback error")

        async def good_cb(e: DetectionEvent) -> None:
            good_events.append(e)

        detector.on_event(bad_cb)
        detector.on_event(good_cb)
        await detector.start(1)
        await asyncio.sleep(0.2)
        await detector.stop(1)

        assert len(good_events) > 0
