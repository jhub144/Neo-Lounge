"""Tests for POST /capture/clips/extract."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from httpx import AsyncClient, ASGITransport

from main import app
import main as main_module
from capture.clips import ExtractResult


@pytest.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


@pytest.fixture(autouse=True)
def mock_capture_service(monkeypatch):
    svc = MagicMock()
    svc.get_status.return_value = []
    monkeypatch.setattr(main_module, "capture_service", svc)
    return svc


class TestClipExtract:
    async def test_extract_returns_201(self, client: AsyncClient) -> None:
        mock_result = ExtractResult(clip_id=1, file_path="/tmp/clip.mp4", duration_seconds=25.0)
        with patch("capture.router.extract_clip", new=AsyncMock(return_value=mock_result)):
            response = await client.post(
                "/capture/clips/extract",
                json={
                    "station_id": 1,
                    "session_id": 10,
                    "game_id": 5,
                    "trigger_type": "CROWD_ROAR",
                    "trigger_timestamp": 1700000000.0,
                },
            )
        assert response.status_code == 201

    async def test_extract_returns_clip_details(self, client: AsyncClient) -> None:
        mock_result = ExtractResult(clip_id=7, file_path="/replays/10/5/clip_123.mp4", duration_seconds=25.0)
        with patch("capture.router.extract_clip", new=AsyncMock(return_value=mock_result)):
            response = await client.post(
                "/capture/clips/extract",
                json={
                    "station_id": 1,
                    "session_id": 10,
                    "game_id": 5,
                    "trigger_type": "CROWD_ROAR",
                },
            )
        data = response.json()
        assert data["clip_id"] == 7
        assert data["file_path"] == "/replays/10/5/clip_123.mp4"
        assert data["duration_seconds"] == 25.0

    async def test_extract_uses_default_timestamp_when_omitted(self, client: AsyncClient) -> None:
        captured: list = []

        async def mock_extract(req):
            captured.append(req)
            return ExtractResult(clip_id=None, file_path="/tmp/x.mp4", duration_seconds=25.0)

        with patch("capture.router.extract_clip", new=mock_extract):
            await client.post(
                "/capture/clips/extract",
                json={
                    "station_id": 1,
                    "session_id": 10,
                    "game_id": 5,
                    "trigger_type": "WHISTLE",
                },
            )
        assert captured[0].trigger_timestamp > 0

    async def test_extract_returns_500_on_failure(self, client: AsyncClient) -> None:
        with patch("capture.router.extract_clip", new=AsyncMock(side_effect=RuntimeError("ffmpeg failed"))):
            response = await client.post(
                "/capture/clips/extract",
                json={
                    "station_id": 1,
                    "session_id": 10,
                    "game_id": 5,
                    "trigger_type": "CROWD_ROAR",
                },
            )
        assert response.status_code == 500
