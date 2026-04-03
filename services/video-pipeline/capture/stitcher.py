"""
Highlight reel stitching — concatenates all clips for a game into one file.

Runs as a LOW PRIORITY background queue (one job at a time).
On startup, re-checks for games with clips but no stitched reel.
"""

import asyncio
import os
import time
from dataclasses import dataclass
from typing import Optional

import httpx

import config


@dataclass
class StitchJob:
    game_id: int
    session_id: int
    clips: list[str]             # ordered list of clip file paths
    auth_code: str = ""


class StitchQueue:
    def __init__(self) -> None:
        self._queue: asyncio.Queue[StitchJob] = asyncio.Queue()
        self._worker_task: Optional[asyncio.Task] = None

    def start(self) -> None:
        if self._worker_task is None or self._worker_task.done():
            self._worker_task = asyncio.create_task(self._worker())

    def stop(self) -> None:
        if self._worker_task:
            self._worker_task.cancel()

    def enqueue(self, job: StitchJob) -> None:
        self._queue.put_nowait(job)
        print(f"[stitch] queued game {job.game_id} ({len(job.clips)} clips)")

    async def recover(self) -> None:
        """On startup: find games with unstitched clips and re-queue them."""
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(
                    f"{config.MAIN_API_URL}/api/clips/unstitched"
                )
                resp.raise_for_status()
                unstitched: list[dict] = resp.json().get("games", [])
                for g in unstitched:
                    job = StitchJob(
                        game_id=g["gameId"],
                        session_id=g["sessionId"],
                        clips=g["clips"],
                        auth_code=g.get("authCode", ""),
                    )
                    self.enqueue(job)
                if unstitched:
                    print(f"[stitch] recovered {len(unstitched)} pending jobs")
        except Exception as exc:
            print(f"[stitch] recovery skipped: {exc}")

    async def _worker(self) -> None:
        while True:
            job = await self._queue.get()
            try:
                await self._stitch(job)
            except Exception as exc:
                print(f"[stitch] game {job.game_id} failed: {exc}")
            finally:
                self._queue.task_done()

    async def _stitch(self, job: StitchJob) -> None:
        existing = [p for p in job.clips if os.path.exists(p)]
        if not existing:
            print(f"[stitch] game {job.game_id}: no clip files found, skipping")
            return

        out_dir = os.path.join(config.REPLAY_DIR, str(job.session_id), str(job.game_id))
        os.makedirs(out_dir, exist_ok=True)
        ts = int(time.time())
        reel_path = os.path.join(out_dir, f"highlights_{ts}.mp4")

        concat_list = f"/tmp/stitch_{job.game_id}.txt"
        with open(concat_list, "w") as f:
            for clip in existing:
                f.write(f"file '{clip}'\n")

        cmd = [
            "ffmpeg", "-y",
            "-f", "concat", "-safe", "0", "-i", concat_list,
            "-c", "copy",
            reel_path,
        ]
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        await proc.wait()

        if proc.returncode != 0:
            raise RuntimeError(f"ffmpeg stitch failed (rc={proc.returncode})")

        print(f"[stitch] game {job.game_id}: reel → {reel_path}")

        await self._notify_reel_ready(job, reel_path)

    async def _notify_reel_ready(self, job: StitchJob, reel_path: str) -> None:
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                await client.patch(
                    f"{config.MAIN_API_URL}/api/games/{job.game_id}/reel",
                    json={"stitchedReelPath": reel_path, "authCode": job.auth_code},
                )
        except Exception as exc:
            print(f"[stitch] failed to notify Main API: {exc}")


# Module-level singleton
stitch_queue = StitchQueue()
