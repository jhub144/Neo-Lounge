"""Detection router — placeholder for Prompt 42."""

from fastapi import APIRouter

router = APIRouter()


@router.get("/status")
async def detection_status() -> dict:
    return {"detectors": []}
