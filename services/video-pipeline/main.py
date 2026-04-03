"""Video Pipeline — FastAPI service (port 8000)."""

import time
from contextlib import asynccontextmanager

from fastapi import FastAPI

import config
from capture.mock_capture import MockCaptureService

# ── Service singletons ────────────────────────────────────────────────────────

START_TIME = time.time()

# Initialised at module level so the health endpoint works without lifespan
capture_service: MockCaptureService = MockCaptureService()


@asynccontextmanager
async def lifespan(app: FastAPI):  # type: ignore[type-arg]
    capture_service.cleanup_orphaned_buffers()
    yield
    # Graceful shutdown — stop any running captures
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
        "cameras_recording": 0,  # updated by security router
    }
