"""Capture router — POST /capture/start/{station_id}, stop, status, clips."""

import time

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from capture.clips import ExtractRequest, extract_clip

router = APIRouter()


class StartCaptureRequest(BaseModel):
    session_id: int
    capture_device: str = ""


class ExtractClipRequest(BaseModel):
    station_id: int
    session_id: int
    game_id: int
    trigger_type: str
    trigger_timestamp: float | None = None  # unix epoch; defaults to now
    buffer_before_seconds: int = 10
    buffer_after_seconds: int = 15


@router.post("/start/{station_id}", status_code=200)
async def start_capture(station_id: int, body: StartCaptureRequest) -> dict:
    import main
    cap = await main.capture_service.start(
        station_id, body.session_id, body.capture_device
    )
    return {
        "station_id": station_id,
        "pid": cap.pid,
        "buffer_dir": cap.buffer_dir,
        "status": "started",
    }


@router.post("/stop/{station_id}", status_code=200)
async def stop_capture(station_id: int) -> dict:
    import main
    await main.capture_service.stop(station_id)
    return {"station_id": station_id, "status": "stopped"}


@router.get("/status")
async def capture_status() -> dict:
    import main
    return {"streams": main.capture_service.get_status()}


@router.post("/clips/extract", status_code=201)
async def extract(body: ExtractClipRequest) -> dict:
    req = ExtractRequest(
        station_id=body.station_id,
        session_id=body.session_id,
        game_id=body.game_id,
        trigger_type=body.trigger_type,
        trigger_timestamp=body.trigger_timestamp or time.time(),
        buffer_before_seconds=body.buffer_before_seconds,
        buffer_after_seconds=body.buffer_after_seconds,
    )
    try:
        result = await extract_clip(req)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    return {
        "clip_id": result.clip_id,
        "file_path": result.file_path,
        "duration_seconds": result.duration_seconds,
    }
