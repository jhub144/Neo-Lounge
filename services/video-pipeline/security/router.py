"""Security router — camera recording control and clip extraction."""

import shutil
import time

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

import config
from security.recorder import security_recorder

router = APIRouter()


class ExtractClipsRequest(BaseModel):
    event_id: int
    event_type: str
    timestamp: float | None = None
    before_minutes: int = 5
    after_minutes: int = 5


# ── Recording control ─────────────────────────────────────────────────────────


@router.post("/start-recording", status_code=200)
async def start_recording() -> dict:
    cameras = await _fetch_cameras()
    results = await security_recorder.start_recording(cameras)
    return {"started": len(results), "cameras": results}


@router.post("/stop-recording", status_code=200)
async def stop_recording() -> dict:
    await security_recorder.stop_recording()
    return {"status": "stopped"}


@router.get("/recording-status")
async def recording_status() -> dict:
    statuses = security_recorder.get_status()
    return {
        "cameras": statuses,
        "total_recording": security_recorder.total_recording(),
    }


# ── Storage ───────────────────────────────────────────────────────────────────


@router.get("/storage")
async def storage_info() -> dict:
    try:
        total, used, free = shutil.disk_usage(config.SECURITY_RECORDING_DIR)
    except FileNotFoundError:
        total = used = free = 0

    seg_size_bytes = config.SECURITY_DISK_LIMIT_GB * 1024 ** 3
    days_remaining = (
        round((free / (seg_size_bytes / config.SECURITY_RETENTION_DAYS)), 1)
        if seg_size_bytes > 0
        else 0
    )
    return {
        "total_bytes": total,
        "used_bytes": used,
        "free_bytes": free,
        "estimated_retention_days": days_remaining,
    }


# ── Clip extraction ───────────────────────────────────────────────────────────


@router.post("/extract-clips", status_code=200)
async def extract_clips(body: ExtractClipsRequest) -> dict:
    ts = body.timestamp or time.time()
    try:
        clips = await security_recorder.extract_clips(
            event_id=body.event_id,
            event_type=body.event_type,
            timestamp=ts,
            before_minutes=body.before_minutes,
            after_minutes=body.after_minutes,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    return {"clips_extracted": len(clips), "clips": clips}


# ── Helpers ───────────────────────────────────────────────────────────────────


async def _fetch_cameras() -> list[dict]:
    """Fetch camera list from Main API, or fall back to mock cameras."""
    if config.USE_MOCK_CAMERAS:
        # 5 mock cameras — no RTSP URL needed in mock mode
        return [{"id": i, "rtspUrl": ""} for i in range(1, 6)]
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{config.MAIN_API_URL}/api/security/cameras")
            resp.raise_for_status()
            return resp.json()
    except Exception as exc:
        print(f"[security] failed to fetch cameras: {exc}")
        return []
