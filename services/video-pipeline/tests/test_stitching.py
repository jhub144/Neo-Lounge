"""Tests for highlight reel stitching and replay cleanup."""

import asyncio
import os
import tempfile
from unittest.mock import AsyncMock, patch

from capture.stitcher import StitchQueue, StitchJob
from capture.cleanup import ReplayCleanupTask


# ── Stitching ─────────────────────────────────────────────────────────────────


class TestStitchQueue:
    def test_enqueue_adds_job(self) -> None:
        q = StitchQueue()
        job = StitchJob(game_id=1, session_id=10, clips=["/tmp/a.mp4"])
        q.enqueue(job)
        assert q._queue.qsize() == 1

    async def test_stitch_skips_missing_clips(self) -> None:
        q = StitchQueue()
        job = StitchJob(
            game_id=1, session_id=10, clips=["/nonexistent/clip.mp4"]
        )
        # Should not raise even when clips are missing
        await q._stitch(job)

    async def test_stitch_calls_ffmpeg_and_notifies(self) -> None:
        q = StitchQueue()
        notified: list[dict] = []

        async def fake_notify(job, reel_path):
            notified.append({"game_id": job.game_id, "reel": reel_path})

        q._notify_reel_ready = fake_notify  # type: ignore[method-assign]

        with tempfile.TemporaryDirectory() as tmp:
            clip1 = os.path.join(tmp, "clip1.mp4")
            clip2 = os.path.join(tmp, "clip2.mp4")
            open(clip1, "wb").close()
            open(clip2, "wb").close()

            import config
            original = config.REPLAY_DIR
            config.REPLAY_DIR = tmp

            mock_proc = AsyncMock()
            mock_proc.returncode = 0
            mock_proc.wait = AsyncMock(return_value=0)

            try:
                job = StitchJob(game_id=5, session_id=20, clips=[clip1, clip2])
                with patch("capture.stitcher.asyncio.create_subprocess_exec", new=AsyncMock(return_value=mock_proc)):
                    await q._stitch(job)
            finally:
                config.REPLAY_DIR = original

        assert len(notified) == 1
        assert notified[0]["game_id"] == 5
        assert "highlights_" in notified[0]["reel"]

    async def test_notify_reel_ready_calls_main_api(self) -> None:
        q = StitchQueue()
        job = StitchJob(game_id=7, session_id=3, clips=[], auth_code="ABC123")

        with patch("capture.stitcher.httpx.AsyncClient") as mock_cls:
            mock_client = AsyncMock()
            mock_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_cls.return_value.__aexit__ = AsyncMock(return_value=False)
            mock_client.patch = AsyncMock()

            await q._notify_reel_ready(job, "/replays/3/7/highlights.mp4")

        mock_client.patch.assert_called_once()
        call_args = mock_client.patch.call_args
        assert "7" in call_args[0][0]   # URL contains game id
        assert call_args[1]["json"]["stitchedReelPath"] == "/replays/3/7/highlights.mp4"

    async def test_notify_failure_does_not_raise(self) -> None:
        q = StitchQueue()
        job = StitchJob(game_id=1, session_id=1, clips=[])

        with patch("capture.stitcher.httpx.AsyncClient") as mock_cls:
            mock_client = AsyncMock()
            mock_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_cls.return_value.__aexit__ = AsyncMock(return_value=False)
            mock_client.patch = AsyncMock(side_effect=ConnectionError("refused"))

            await q._notify_reel_ready(job, "/reel.mp4")  # should not raise

    async def test_worker_processes_jobs_sequentially(self) -> None:
        q = StitchQueue()
        processed: list[int] = []

        async def fake_stitch(job):
            await asyncio.sleep(0.01)
            processed.append(job.game_id)

        q._stitch = fake_stitch  # type: ignore[method-assign]
        q.start()

        q.enqueue(StitchJob(game_id=1, session_id=1, clips=[]))
        q.enqueue(StitchJob(game_id=2, session_id=2, clips=[]))

        await asyncio.sleep(0.1)
        q.stop()

        assert processed == [1, 2]


# ── Cleanup ───────────────────────────────────────────────────────────────────


class TestReplayCleanupTask:
    async def test_run_deletes_expired_session_dir(self) -> None:
        task = ReplayCleanupTask()

        with tempfile.TemporaryDirectory() as tmp:
            session_dir = os.path.join(tmp, "99")
            os.makedirs(session_dir)
            open(os.path.join(session_dir, "clip.mp4"), "wb").close()

            import config
            original = config.REPLAY_DIR
            config.REPLAY_DIR = tmp

            try:
                with patch.object(
                    task,
                    "_fetch_expired_sessions",
                    new=AsyncMock(return_value=[{"id": 99}]),
                ):
                    with patch.object(
                        task, "_mark_expired", new=AsyncMock()
                    ) as mock_mark:
                        await task._run()
                        mock_mark.assert_called_once_with(99)

                assert not os.path.exists(session_dir)
            finally:
                config.REPLAY_DIR = original

    async def test_run_skips_when_no_expired(self) -> None:
        task = ReplayCleanupTask()
        with patch.object(
            task,
            "_fetch_expired_sessions",
            new=AsyncMock(return_value=[]),
        ):
            with patch.object(task, "_mark_expired", new=AsyncMock()) as mock_mark:
                await task._run()
                mock_mark.assert_not_called()

    async def test_fetch_failure_returns_empty(self) -> None:
        task = ReplayCleanupTask()
        with patch("capture.cleanup.httpx.AsyncClient") as mock_cls:
            mock_client = AsyncMock()
            mock_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_cls.return_value.__aexit__ = AsyncMock(return_value=False)
            mock_client.get = AsyncMock(side_effect=ConnectionError("refused"))

            result = await task._fetch_expired_sessions()
            assert result == []
