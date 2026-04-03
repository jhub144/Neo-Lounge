"""Capture router — POST /capture/start/{station_id}, stop, status."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()


class StartCaptureRequest(BaseModel):
    session_id: int
    capture_device: str = ""


@router.post("/start/{station_id}", status_code=200)
async def start_capture(station_id: int, body: StartCaptureRequest) -> dict:
    import main  # late import to avoid circular dependency
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
