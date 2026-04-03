"""
Wires detection events to clip extraction and game-end calls.

When a CROWD_ROAR fires → extract clip
When a WHISTLE fires → end the game via Main API, then extract clip
Respects cooldown between clips.
"""

import time

import httpx

import config
from capture.clips import ExtractRequest, extract_clip
from detection.detector import DetectionEvent, detector

# track per-station last-clip time for cooldown enforcement
_last_clip_time: dict[int, float] = {}

# track per-station current session/game context
_station_context: dict[int, dict] = {}  # {station_id: {session_id, game_id}}


def set_station_context(station_id: int, session_id: int, game_id: int) -> None:
    _station_context[station_id] = {"session_id": session_id, "game_id": game_id}


def clear_station_context(station_id: int) -> None:
    _station_context.pop(station_id, None)
    _last_clip_time.pop(station_id, None)


async def _handle_detection_event(event: DetectionEvent) -> None:
    sid = event.station_id
    ctx = _station_context.get(sid)
    if not ctx:
        print(f"[pipeline] no context for station {sid}, skipping clip")
        return

    # Enforce cooldown
    last = _last_clip_time.get(sid, 0)
    if (time.time() - last) < config.CLIP_COOLDOWN_SECONDS:
        print(f"[pipeline] station {sid}: within cooldown, skipping")
        return

    _last_clip_time[sid] = time.time()

    if event.event_type == "WHISTLE":
        await _end_game(ctx["game_id"])

    req = ExtractRequest(
        station_id=sid,
        session_id=ctx["session_id"],
        game_id=ctx["game_id"],
        trigger_type=event.event_type,
        trigger_timestamp=event.timestamp,
    )
    try:
        result = await extract_clip(req)
        print(
            f"[pipeline] station {sid}: clip extracted → {result.file_path} "
            f"(clip_id={result.clip_id})"
        )
    except Exception as exc:
        print(f"[pipeline] station {sid}: clip extraction failed: {exc}")


async def _end_game(game_id: int) -> None:
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.post(
                f"{config.MAIN_API_URL}/api/games/{game_id}/end",
                json={"endMethod": "DETECTION"},
            )
            resp.raise_for_status()
            print(f"[pipeline] game {game_id} ended via detection")
    except Exception as exc:
        print(f"[pipeline] failed to end game {game_id}: {exc}")


def init_pipeline() -> None:
    """Register the detection event handler. Call once at startup."""
    detector.on_event(_handle_detection_event)
