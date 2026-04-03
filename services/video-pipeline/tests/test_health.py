"""Tests for GET /pipeline/health."""

import pytest
from httpx import AsyncClient, ASGITransport

from main import app


@pytest.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


@pytest.mark.asyncio
async def test_health_returns_ok(client: AsyncClient) -> None:
    response = await client.get("/pipeline/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"


@pytest.mark.asyncio
async def test_health_includes_uptime(client: AsyncClient) -> None:
    response = await client.get("/pipeline/health")
    data = response.json()
    assert "uptime" in data
    assert isinstance(data["uptime"], (int, float))
    assert data["uptime"] >= 0


@pytest.mark.asyncio
async def test_health_includes_stream_counts(client: AsyncClient) -> None:
    response = await client.get("/pipeline/health")
    data = response.json()
    assert data["capture_streams"] == 0
    assert data["cameras_recording"] == 0
