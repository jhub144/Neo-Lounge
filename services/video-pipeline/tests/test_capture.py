"""Tests for POST /capture/start, /capture/stop, GET /capture/status."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from httpx import AsyncClient, ASGITransport

from main import app
import main as main_module


def make_mock_capture_service():
    svc = MagicMock()
    fake_cap = MagicMock()
    fake_cap.pid = 12345
    fake_cap.buffer_dir = "/tmp/neo-capture/1"
    fake_cap.is_running = True
    fake_cap.uptime_seconds = 5.0
    fake_cap.buffer_size_bytes.return_value = 1024
    fake_cap.station_id = 1
    svc.start = AsyncMock(return_value=fake_cap)
    svc.stop = AsyncMock()
    svc.get_status.return_value = [
        {
            "station_id": 1,
            "running": True,
            "pid": 12345,
            "uptime_seconds": 5.0,
            "buffer_size_bytes": 1024,
            "buffer_dir": "/tmp/neo-capture/1",
        }
    ]
    return svc


@pytest.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


@pytest.fixture(autouse=True)
def mock_service(monkeypatch):
    svc = make_mock_capture_service()
    monkeypatch.setattr(main_module, "capture_service", svc)
    return svc


class TestCaptureStart:
    async def test_start_returns_200(self, client: AsyncClient, mock_service) -> None:
        response = await client.post(
            "/capture/start/1", json={"session_id": 42, "capture_device": ""}
        )
        assert response.status_code == 200

    async def test_start_returns_station_id_and_status(self, client: AsyncClient, mock_service) -> None:
        response = await client.post(
            "/capture/start/1", json={"session_id": 42, "capture_device": ""}
        )
        data = response.json()
        assert data["station_id"] == 1
        assert data["status"] == "started"
        assert data["pid"] == 12345

    async def test_start_calls_service(self, client: AsyncClient, mock_service) -> None:
        await client.post(
            "/capture/start/2", json={"session_id": 7, "capture_device": "/dev/video0"}
        )
        mock_service.start.assert_called_once_with(2, 7, "/dev/video0")


class TestCaptureStop:
    async def test_stop_returns_200(self, client: AsyncClient, mock_service) -> None:
        response = await client.post("/capture/stop/1")
        assert response.status_code == 200

    async def test_stop_returns_stopped_status(self, client: AsyncClient, mock_service) -> None:
        response = await client.post("/capture/stop/1")
        data = response.json()
        assert data["station_id"] == 1
        assert data["status"] == "stopped"

    async def test_stop_calls_service(self, client: AsyncClient, mock_service) -> None:
        await client.post("/capture/stop/3")
        mock_service.stop.assert_called_once_with(3)


class TestCaptureStatus:
    async def test_status_returns_streams_list(self, client: AsyncClient, mock_service) -> None:
        response = await client.get("/capture/status")
        assert response.status_code == 200
        data = response.json()
        assert "streams" in data
        assert isinstance(data["streams"], list)

    async def test_status_shows_running_stream(self, client: AsyncClient, mock_service) -> None:
        response = await client.get("/capture/status")
        data = response.json()
        stream = data["streams"][0]
        assert stream["station_id"] == 1
        assert stream["running"] is True

    async def test_health_reflects_running_streams(self, client: AsyncClient, mock_service) -> None:
        response = await client.get("/pipeline/health")
        data = response.json()
        assert data["capture_streams"] == 1
