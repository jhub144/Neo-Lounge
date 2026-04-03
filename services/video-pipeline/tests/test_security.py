"""Tests for security camera recording endpoints."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from httpx import AsyncClient, ASGITransport

from main import app
import main as main_module
from security.recorder import SecurityRecorder


def make_mock_recorder(recording: bool = True, camera_count: int = 2) -> MagicMock:
    rec = MagicMock(spec=SecurityRecorder)
    cam_statuses = [
        {
            "camera_id": i,
            "recording": recording,
            "online": recording,
            "pid": 10000 + i,
            "uptime_seconds": 60.0,
            "segment_count": 4,
            "recording_dir": f"/tmp/security/{i}",
            "rtsp_url": "",
        }
        for i in range(1, camera_count + 1)
    ]
    rec.get_status.return_value = cam_statuses
    rec.total_recording.return_value = camera_count if recording else 0
    rec.start_recording = AsyncMock(
        return_value=[{"camera_id": i, "recording": True, "pid": 10000 + i} for i in range(1, camera_count + 1)]
    )
    rec.stop_recording = AsyncMock()
    rec.extract_clips = AsyncMock(
        return_value=[
            {"camera_id": i, "clip_path": f"/tmp/clips/event_cam{i}.mp4", "clip_id": i}
            for i in range(1, camera_count + 1)
        ]
    )
    return rec


@pytest.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


@pytest.fixture(autouse=True)
def mock_capture_service(monkeypatch):
    svc = MagicMock()
    svc.get_status.return_value = []
    monkeypatch.setattr(main_module, "capture_service", svc)


class TestStartRecording:
    async def test_start_returns_200(self, client: AsyncClient) -> None:
        mock_rec = make_mock_recorder()
        with patch("security.router.security_recorder", mock_rec):
            with patch("security.router._fetch_cameras", new=AsyncMock(return_value=[{"id": 1, "rtspUrl": ""}])):
                response = await client.post("/security/start-recording")
        assert response.status_code == 200

    async def test_start_returns_camera_list(self, client: AsyncClient) -> None:
        mock_rec = make_mock_recorder(camera_count=2)
        with patch("security.router.security_recorder", mock_rec):
            with patch("security.router._fetch_cameras", new=AsyncMock(return_value=[{"id": 1, "rtspUrl": ""}, {"id": 2, "rtspUrl": ""}])):
                response = await client.post("/security/start-recording")
        data = response.json()
        assert "cameras" in data
        assert data["started"] == 2


class TestStopRecording:
    async def test_stop_returns_200(self, client: AsyncClient) -> None:
        mock_rec = make_mock_recorder()
        with patch("security.router.security_recorder", mock_rec):
            response = await client.post("/security/stop-recording")
        assert response.status_code == 200

    async def test_stop_calls_recorder(self, client: AsyncClient) -> None:
        mock_rec = make_mock_recorder()
        with patch("security.router.security_recorder", mock_rec):
            await client.post("/security/stop-recording")
        mock_rec.stop_recording.assert_called_once()


class TestRecordingStatus:
    async def test_status_returns_cameras(self, client: AsyncClient) -> None:
        mock_rec = make_mock_recorder(camera_count=5)
        with patch("security.router.security_recorder", mock_rec):
            response = await client.get("/security/recording-status")
        assert response.status_code == 200
        data = response.json()
        assert len(data["cameras"]) == 5
        assert data["total_recording"] == 5

    async def test_status_shows_camera_fields(self, client: AsyncClient) -> None:
        mock_rec = make_mock_recorder(camera_count=1)
        with patch("security.router.security_recorder", mock_rec):
            response = await client.get("/security/recording-status")
        cam = response.json()["cameras"][0]
        assert "camera_id" in cam
        assert "recording" in cam
        assert "segment_count" in cam


class TestStorage:
    async def test_storage_returns_disk_info(self, client: AsyncClient) -> None:
        response = await client.get("/security/storage")
        assert response.status_code == 200
        data = response.json()
        assert "total_bytes" in data
        assert "used_bytes" in data
        assert "free_bytes" in data


class TestExtractClips:
    async def test_extract_returns_200(self, client: AsyncClient) -> None:
        mock_rec = make_mock_recorder()
        with patch("security.router.security_recorder", mock_rec):
            response = await client.post(
                "/security/extract-clips",
                json={"event_id": 1, "event_type": "SESSION_START", "timestamp": 1700000000.0},
            )
        assert response.status_code == 200

    async def test_extract_returns_clips_list(self, client: AsyncClient) -> None:
        mock_rec = make_mock_recorder(camera_count=2)
        with patch("security.router.security_recorder", mock_rec):
            response = await client.post(
                "/security/extract-clips",
                json={"event_id": 1, "event_type": "SESSION_START"},
            )
        data = response.json()
        assert data["clips_extracted"] == 2
        assert len(data["clips"]) == 2

    async def test_extract_calls_recorder_with_correct_args(self, client: AsyncClient) -> None:
        mock_rec = make_mock_recorder()
        with patch("security.router.security_recorder", mock_rec):
            await client.post(
                "/security/extract-clips",
                json={
                    "event_id": 42,
                    "event_type": "PAYMENT_RECEIVED",
                    "timestamp": 1700000000.0,
                    "before_minutes": 3,
                    "after_minutes": 7,
                },
            )
        mock_rec.extract_clips.assert_called_once_with(
            event_id=42,
            event_type="PAYMENT_RECEIVED",
            timestamp=1700000000.0,
            before_minutes=3,
            after_minutes=7,
        )
