"""Detection router — status endpoint."""

from fastapi import APIRouter

from detection.detector import detector

router = APIRouter()


@router.get("/status")
async def detection_status() -> dict:
    active = detector.active_stations() if hasattr(detector, "active_stations") else []
    return {"active_stations": active, "total": len(active)}
