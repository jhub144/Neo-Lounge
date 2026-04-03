"""Video Pipeline — FastAPI service (port 8000)."""

import time
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI

import config
from capture.mock_capture import MockCaptureService
from capture.cleanup import cleanup_task
from capture.stitcher import stitch_queue
from detection.pipeline import init_pipeline

# ── Service singletons ────────────────────────────────────────────────────────

START_TIME = time.time()

# Initialised at module level so the health endpoint works without lifespan
capture_service: MockCaptureService = MockCaptureService()


async def _load_settings_from_api() -> None:
    """Pull detection settings from the Main API and override config defaults."""
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(f"{config.MAIN_API_URL}/api/settings")
            resp.raise_for_status()
            data = resp.json()
            if "yamnetConfidenceThreshold" in data:
                config.YAMNET_CONFIDENCE_THRESHOLD = float(data["yamnetConfidenceThreshold"])
            if "clipCooldownSeconds" in data:
                config.CLIP_COOLDOWN_SECONDS = int(data["clipCooldownSeconds"])
            if "clipBufferBefore" in data:
                config.CLIP_BUFFER_BEFORE = int(data["clipBufferBefore"])
            if "clipBufferAfter" in data:
                config.CLIP_BUFFER_AFTER = int(data["clipBufferAfter"])
    except Exception:
        pass  # Main API not available — use env defaults


@asynccontextmanager
async def lifespan(_app: FastAPI):  # type: ignore[type-arg]
    capture_service.cleanup_orphaned_buffers()
    await _load_settings_from_api()
    init_pipeline()
    stitch_queue.start()
    cleanup_task.start()
    await stitch_queue.recover()
    yield
    # Graceful shutdown
    stitch_queue.stop()
    cleanup_task.stop()
    for status in capture_service.get_status():
        if status["running"]:
            await capture_service.stop(status["station_id"])


app = FastAPI(title="Neo-Lounge Video Pipeline", lifespan=lifespan)

# ── Routers ───────────────────────────────────────────────────────────────────

from capture.router import router as capture_router  # noqa: E402
from security.router import router as security_router  # noqa: E402
from detection.router import router as detection_router  # noqa: E402

app.include_router(capture_router, prefix="/capture", tags=["capture"])
app.include_router(security_router, prefix="/security", tags=["security"])
app.include_router(detection_router, prefix="/detection", tags=["detection"])

# ── Health ────────────────────────────────────────────────────────────────────


@app.get("/pipeline/health")
async def health() -> dict:
    uptime = round(time.time() - START_TIME, 1)
    running_captures = sum(
        1 for s in capture_service.get_status() if s["running"]
    )
    return {
        "status": "ok",
        "uptime": uptime,
        "capture_streams": running_captures,
        "cameras_recording": 0,
    }
