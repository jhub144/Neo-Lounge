"""Security router — placeholder for Prompt 43."""

from fastapi import APIRouter

router = APIRouter()


@router.get("/recording-status")
async def recording_status() -> dict:
    return {"cameras": [], "total_recording": 0}


@router.get("/storage")
async def storage_info() -> dict:
    import shutil
    import config
    try:
        total, used, free = shutil.disk_usage(config.SECURITY_RECORDING_DIR)
    except FileNotFoundError:
        total = used = free = 0
    return {
        "total_bytes": total,
        "used_bytes": used,
        "free_bytes": free,
    }
