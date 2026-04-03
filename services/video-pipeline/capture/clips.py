"""
Clip extraction from the rolling buffer.
Mock mode: copies a short test video as the extracted clip.
Real mode: uses ffmpeg -c copy to splice buffer segments.
"""

import asyncio
import os
import shutil
import time
from dataclasses import dataclass
from typing import Optional

import httpx

import config


@dataclass
class ExtractRequest:
    station_id: int
    session_id: int
    game_id: int
    trigger_type: str
    trigger_timestamp: float  # unix epoch seconds
    buffer_before_seconds: int = config.CLIP_BUFFER_BEFORE
    buffer_after_seconds: int = config.CLIP_BUFFER_AFTER


@dataclass
class ExtractResult:
    clip_id: Optional[int]
    file_path: str
    duration_seconds: float


async def extract_clip(req: ExtractRequest) -> ExtractResult:
    """Extract a clip and register it with the Main API."""
    if config.USE_MOCK_CAPTURE:
        return await _mock_extract(req)
    return await _real_extract(req)


# ── Mock ──────────────────────────────────────────────────────────────────────

# Tiny silent black video used as the mock clip (generated once on demand)
_MOCK_CLIP_TEMPLATE = os.path.join("/tmp", "neo_mock_clip_template.mp4")


async def _ensure_mock_template() -> None:
    if os.path.exists(_MOCK_CLIP_TEMPLATE):
        return
    cmd = [
        "ffmpeg", "-y",
        "-f", "lavfi", "-i", "color=black:size=60x36:rate=1:duration=5",
        "-f", "lavfi", "-i", "anullsrc=r=8000:cl=mono:duration=5",
        "-c:v", "libx264", "-preset", "ultrafast", "-crf", "51",
        "-c:a", "aac", "-b:a", "8k",
        _MOCK_CLIP_TEMPLATE,
    ]
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.DEVNULL,
    )
    await proc.wait()


async def _mock_extract(req: ExtractRequest) -> ExtractResult:
    await _ensure_mock_template()

    out_dir = os.path.join(
        config.REPLAY_DIR, str(req.session_id), str(req.game_id)
    )
    os.makedirs(out_dir, exist_ok=True)

    ts = int(req.trigger_timestamp)
    out_path = os.path.join(out_dir, f"clip_{ts}.mp4")
    shutil.copy2(_MOCK_CLIP_TEMPLATE, out_path)

    clip_id = await _register_clip(req, out_path)
    return ExtractResult(clip_id=clip_id, file_path=out_path, duration_seconds=5.0)


# ── Real ──────────────────────────────────────────────────────────────────────

async def _real_extract(req: ExtractRequest) -> ExtractResult:
    buffer_dir = os.path.join(config.CAPTURE_BUFFER_DIR, str(req.station_id))
    if not os.path.isdir(buffer_dir):
        raise FileNotFoundError(f"No buffer dir for station {req.station_id}")

    # Collect all segment files sorted by mtime
    segments = sorted(
        [
            os.path.join(buffer_dir, f)
            for f in os.listdir(buffer_dir)
            if f.endswith(".ts")
        ],
        key=os.path.getmtime,
    )

    if not segments:
        raise RuntimeError(f"No buffer segments for station {req.station_id}")

    # Build a concat list covering [trigger - before, trigger + after]
    start_time = req.trigger_timestamp - req.buffer_before_seconds
    end_time = req.trigger_timestamp + req.buffer_after_seconds

    relevant = [
        s for s in segments
        if os.path.getmtime(s) >= start_time - 10  # 10 s tolerance
    ]
    if not relevant:
        relevant = segments[-3:]  # fallback: last 3 segments

    concat_list = "/tmp/neo_concat.txt"
    with open(concat_list, "w") as f:
        for seg in relevant:
            f.write(f"file '{seg}'\n")

    out_dir = os.path.join(
        config.REPLAY_DIR, str(req.session_id), str(req.game_id)
    )
    os.makedirs(out_dir, exist_ok=True)
    ts = int(req.trigger_timestamp)
    out_path = os.path.join(out_dir, f"clip_{ts}.mp4")
    duration = req.buffer_before_seconds + req.buffer_after_seconds

    cmd = [
        "ffmpeg", "-y",
        "-f", "concat", "-safe", "0", "-i", concat_list,
        "-t", str(duration),
        "-c", "copy",
        out_path,
    ]
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.DEVNULL,
    )
    await proc.wait()
    if proc.returncode != 0:
        raise RuntimeError("ffmpeg clip extraction failed")

    clip_id = await _register_clip(req, out_path)
    return ExtractResult(
        clip_id=clip_id,
        file_path=out_path,
        duration_seconds=float(duration),
    )


# ── Register with Main API ────────────────────────────────────────────────────

async def _register_clip(req: ExtractRequest, file_path: str) -> Optional[int]:
    payload = {
        "gameId": req.game_id,
        "sessionId": req.session_id,
        "filePath": file_path,
        "triggerType": req.trigger_type,
        "triggerTimestamp": time.strftime(
            "%Y-%m-%dT%H:%M:%SZ", time.gmtime(req.trigger_timestamp)
        ),
    }
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.post(f"{config.MAIN_API_URL}/api/clips", json=payload)
            resp.raise_for_status()
            return resp.json().get("clipId")
    except Exception as exc:
        print(f"[clips] failed to register clip with Main API: {exc}")
        return None
