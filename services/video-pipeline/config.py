"""Configuration — reads from environment variables with sensible defaults."""

import os

MAIN_API_URL: str = os.getenv("MAIN_API_URL", "http://localhost:3000")
CAPTURE_BUFFER_DIR: str = os.getenv("CAPTURE_BUFFER_DIR", "/tmp/neo-capture")
REPLAY_DIR: str = os.getenv("REPLAY_DIR", "./replays")
SECURITY_RECORDING_DIR: str = os.getenv("SECURITY_RECORDING_DIR", "./security-recordings")
SECURITY_CLIPS_DIR: str = os.getenv("SECURITY_CLIPS_DIR", "./security-clips")

USE_MOCK_CAPTURE: bool = os.getenv("USE_MOCK_CAPTURE", "true").lower() != "false"
USE_MOCK_CAMERAS: bool = os.getenv("USE_MOCK_CAMERAS", "true").lower() != "false"
USE_MOCK_YAMNET: bool = os.getenv("USE_MOCK_YAMNET", "true").lower() != "false"

# Detection thresholds (overridden by Main API Settings at runtime)
YAMNET_CONFIDENCE_THRESHOLD: float = float(
    os.getenv("YAMNET_CONFIDENCE_THRESHOLD", "0.7")
)
CLIP_COOLDOWN_SECONDS: int = int(os.getenv("CLIP_COOLDOWN_SECONDS", "45"))
CLIP_BUFFER_BEFORE: int = int(os.getenv("CLIP_BUFFER_BEFORE", "10"))
CLIP_BUFFER_AFTER: int = int(os.getenv("CLIP_BUFFER_AFTER", "15"))

# Security camera settings
SECURITY_SEGMENT_MINUTES: int = int(os.getenv("SECURITY_SEGMENT_MINUTES", "15"))
SECURITY_DISK_LIMIT_GB: float = float(os.getenv("SECURITY_DISK_LIMIT_GB", "100"))
SECURITY_RETENTION_DAYS: int = int(os.getenv("SECURITY_RETENTION_DAYS", "14"))
