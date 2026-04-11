# Neo Lounge — Video Pipeline

Core video processing service for Neo Lounge. Handles TV ring buffer capture, webcam reaction recording, AI event detection (audio/visual/face), and highlight production.

## System Dependencies (Ubuntu 24.04)

Install the following OS-level packages:

```bash
sudo apt update
sudo apt install -y \
  ffmpeg \
  tesseract-ocr \
  smartmontools \
  nut-client \
  fonts-dejavu-core \
  intel-media-va-driver-non-free \
  libpq-dev \
  python3-dev
```

### Verification Commands

```bash
# Verify ffmpeg hardware acceleration (Intel QuickSync)
ffmpeg -hwaccels 2>/dev/null | grep qsv

# Verify ffmpeg segment muxer
ffmpeg -muxers 2>/dev/null | grep segment

# Verify Tesseract OCR
tesseract --version
```

## Python Setup

1. Create a virtual environment:
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Download AI models:
   ```bash
   ./models/download_models.sh
   ```

## Services

| Service | Description | Command |
|---|---|---|
| **Capture API** | Main entry point for starting/stopping streams | `python main.py` |
| **FaceScorer** | Real-time face detection + emotion analysis | (Internal co-process) |
| **EventMerger** | Logic for importance scoring and clip queueing | (Internal co-process) |
| **Security Recorder** | Continuous RTSP capture | (Internal co-process) |
