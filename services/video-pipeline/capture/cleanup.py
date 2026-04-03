"""
Replay TTL cleanup background task.

Every 5 minutes:
  - Asks Main API for expired sessions (endTime + replayTTLMinutes has passed)
  - Deletes replay files from disk
  - Notifies Main API to mark clips as expired
"""

import asyncio
import os
import shutil
from typing import Optional

import httpx

import config

CLEANUP_INTERVAL = 5 * 60  # 5 minutes


class ReplayCleanupTask:
    def __init__(self) -> None:
        self._task: Optional[asyncio.Task] = None

    def start(self) -> None:
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self._loop())

    def stop(self) -> None:
        if self._task:
            self._task.cancel()

    async def _loop(self) -> None:
        while True:
            await asyncio.sleep(CLEANUP_INTERVAL)
            try:
                await self._run()
            except Exception as exc:
                print(f"[cleanup] error during cleanup run: {exc}")

    async def _run(self) -> None:
        expired = await self._fetch_expired_sessions()
        if not expired:
            return

        print(f"[cleanup] found {len(expired)} expired sessions")
        for session in expired:
            session_id = session["id"]
            replay_dir = os.path.join(config.REPLAY_DIR, str(session_id))
            if os.path.isdir(replay_dir):
                shutil.rmtree(replay_dir, ignore_errors=True)
                print(f"[cleanup] deleted replay dir: {replay_dir}")

            await self._mark_expired(session_id)

    async def _fetch_expired_sessions(self) -> list[dict]:
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(
                    f"{config.MAIN_API_URL}/api/clips/expired"
                )
                resp.raise_for_status()
                return resp.json().get("sessions", [])
        except Exception as exc:
            print(f"[cleanup] failed to fetch expired sessions: {exc}")
            return []

    async def _mark_expired(self, session_id: int) -> None:
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                await client.delete(
                    f"{config.MAIN_API_URL}/api/clips/session/{session_id}"
                )
        except Exception as exc:
            print(f"[cleanup] failed to mark session {session_id} expired: {exc}")


cleanup_task = ReplayCleanupTask()
