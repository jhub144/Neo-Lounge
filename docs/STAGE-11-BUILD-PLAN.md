# Stage 11 — Build Plan: Enhanced Video Pipeline with Reaction Intelligence

> **What this document is:** A complete, ordered set of implementation prompts for a code-generation LLM.
> Each prompt builds on the previous one. No orphaned code. Test-driven throughout.
>
> **What already exists (Stages 1-10):**
> - Express API on port 3000 with 27 endpoints, PostgreSQL with 11 Prisma models
> - Mock video pipeline (`services/video-pipeline/`) with FastAPI on port 8000
> - Mock capture, mock YAMNet detector, basic clip extraction/stitching
> - Kiosk app (port 3001), Dashboard (port 3004), PWA skeleton (port 3003), Tablet app (port 3002)
> - WebSocket real-time updates, M-Pesa payments, ADB/Tuya mock hardware control
>
> **What Stage 11 adds:**
> - Real ffmpeg TV ring buffer capture (tmpfs, segment_wrap)
> - Real 120fps webcam capture on all 4 stations
> - FaceScorer: real-time face detection (YuNet) + emotion classification (FER) at 4fps
> - Per-session baseline calibration (first 2 minutes)
> - YAMNet audio detection (real, replacing mock)
> - Game stream visual analyzer (320x240/2fps, OCR, replay detection, card detection)
> - EventMerger with importance scoring, tier assignment, dynamic post-roll
> - FIFA dual-reaction treatment (DUAL_BEAT)
> - Three-tier clip processing (MICRO/STANDARD/BIG) with distinct effects
> - Sheng/Swahili caption library + emotion stinger overlays
> - Highlight reel assembly with narrative arc ordering
> - Penalty shootout grouping
> - Replay PWA updates (authCode-keyed, progress bar, portrait downloads)
> - Tablet UX updates (moment counter, QR code)
> - Health endpoints, systemd watchdog, UPS shutdown, temperature SMS
> - Storage lifecycle with FaceSnapshot purge
>
> **Reference documents (keep open during implementation):**
> - `docs/SPEC.md` — the single source of truth
> - `docs/REACTION-MODEL-SPEC.md` — detailed reaction model specification
> - `docs/STAGE-11-FEATURES.md` — plain-English feature overview

---

&nbsp;

---

# PHASE A — Foundation (Prompts 1-4)

*Database schema, system dependencies, configuration. No video processing yet.*

---

## Prompt 1 of 29 — System Dependencies and AI Models

**What:** Install system packages, Python dependencies, and download AI model files.
**Why first:** Every subsequent prompt assumes these exist.
**Builds on:** Existing `services/video-pipeline/` directory from Stage 9.
**Tests:** Manual verification only (no automated tests).

```text
Read docs/SPEC.md §7 (Video Pipeline Architecture) and docs/SPEC.md §3 (Tech Stack).
Read every file currently in services/video-pipeline/ before making changes.

1. Update services/video-pipeline/requirements.txt (create if absent). Add these
   dependencies to whatever already exists — do not remove existing deps:

   opencv-contrib-python
   onnxruntime
   numpy
   pytesseract
   Pillow
   qrcode[pil]
   sdnotify
   psycopg2-binary
   tflite-runtime

   Run: pip install -r services/video-pipeline/requirements.txt

2. Create services/video-pipeline/README.md (or append to existing) documenting
   required OS packages:

   sudo apt install -y \
     ffmpeg tesseract-ocr smartmontools nut-client \
     fonts-dejavu-core intel-media-va-driver-non-free

   Add verification commands:
     ffmpeg -hwaccels 2>/dev/null | grep qsv
     ffmpeg -muxers 2>/dev/null | grep segment
     tesseract --version

3. Create services/video-pipeline/models/ directory.
   Create services/video-pipeline/models/download_models.sh:

   #!/bin/bash
   set -euo pipefail
   MODEL_DIR="$(dirname "$0")"

   YAMNET_URL="https://storage.googleapis.com/tfhub-lite-models/google/lite-model/yamnet/tflite/1.tflite"
   YUNET_URL="https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx"
   FER_URL="https://github.com/onnx/models/raw/main/validated/vision/body_analysis/emotion_ferplus/model/emotion-ferplus-8.onnx"

   download() {
     local url="$1" out="$2"
     if [[ ! -f "$out" ]]; then
       echo "Downloading $(basename "$out")..."
       curl -fL --retry 3 "$url" -o "$out"
     fi
   }

   download "$YAMNET_URL" "$MODEL_DIR/yamnet.tflite"
   download "$YUNET_URL" "$MODEL_DIR/face_detection_yunet_2023mar.onnx"
   download "$FER_URL"   "$MODEL_DIR/fer_mobilenet.onnx"

   echo "Models:" && ls -lh "$MODEL_DIR"/*.{tflite,onnx} 2>/dev/null

   chmod +x and run it. Record sha256 hashes in models/SHA256SUMS.txt.

4. Add to services/video-pipeline/config.py (or create if needed):
   YAMNET_MODEL_PATH  = os.getenv("YAMNET_MODEL_PATH", "models/yamnet.tflite")
   YUNET_MODEL_PATH   = os.getenv("YUNET_MODEL_PATH", "models/face_detection_yunet_2023mar.onnx")
   FER_MODEL_PATH     = os.getenv("FER_MODEL_PATH", "models/fer_mobilenet.onnx")

5. Verify: ls services/video-pipeline/models/ shows 3 files.
   pip list | grep -Ei 'opencv|onnxruntime|psycopg2|sdnotify' confirms deps.

Commit: "chore(stage11): system deps, Python deps, AI model downloads"
```

---

## Prompt 2 of 29 — Database Schema: New Models, Enums, and Settings

**What:** Add PendingEvent, ClipJob, GameReplay, MatchState, FaceSnapshot models. Add EventType, EventSource, ClipJobStatus, ClipTier, ReplayTreatment enums. Extend Station and Settings.
**Why second:** Every pipeline prompt needs these models.
**Builds on:** Existing 11 Prisma models from Stages 1-3.
**Tests:** Schema smoke test creating and reading back each new model.

```text
Read docs/SPEC.md §5 (Data Models) — keep it open. Every field name, type, and
default must match SPEC exactly. Also read docs/REACTION-MODEL-SPEC.md §14 (Schema Fields).

Open apps/api/prisma/schema.prisma. Do NOT modify existing models or enums.
Add the following:

1. New enums:

   enum EventType {
     GOAL_CANDIDATE
     PENALTY_MISS
     RED_CARD
     YELLOW_CARD
     MATCH_END
     SCORE_CHANGE
   }

   enum EventSource {
     AUDIO_AI
     GAME_ANALYZER
     BOTH
     FACE_ONLY
   }

   enum ClipJobStatus {
     PENDING
     EXTRACTING
     STITCHING
     ENHANCING
     READY
     FAILED
     STITCH_FALLBACK
     ENHANCE_FALLBACK
   }

   enum ClipTier {
     MICRO
     STANDARD
     BIG
   }

   enum ReplayTreatment {
     LIVE_ONLY
     REPLAY_ONLY
     DUAL_BEAT
     SKIP
   }

2. New model PendingEvent (SPEC §5):
   id              Int          @id @default(autoincrement())
   sessionId       Int          (FK → Session)
   stationId       Int          (FK → Station)
   gameId          Int          (FK → Game)
   eventType       EventType?   (nullable for FACE_ONLY triggers)
   eventTimestamp   Float        (unix epoch)
   source          EventSource  (AUDIO_AI/GAME_ANALYZER/BOTH/FACE_ONLY)
   audioScore      Float?       (0.0–1.0, TV audio peak + duration + class confidence)
   visualEventScore Float?      (0.0–1.0, event type weight × detection confidence)
   faceReactionScore Float?     (0.0–1.0, emotion peak + sustain + movement + mouth aperture)
   contextMultiplier Float?     (0.5–2.0, late game + close score + drought + shootout)
   importance      Float?       (0.0–1.0, weighted fusion of all scores, see §9)
   emotionTransition String?    (e.g. "heartbreak", "classic_celebration", see §9)
   confidence      Float        @default(0) (legacy — audioConfidence equivalent)
   matchMinute      Int?
   homeScore        Int?
   awayScore        Int?
   mergedWithEventId Int?        (FK → self, nullable)
   processed        Boolean      @default(false)
   createdAt        DateTime     @default(now())

   Relations: session → Session, station → Station, game → Game

3. New model ClipJob (SPEC §5 + REACTION-MODEL-SPEC §14):
   id               Int             @id @default(autoincrement())
   sessionId        Int             (FK → Session)
   stationId        Int             (FK → Station)
   clipStart        Float           (unix epoch)
   clipEnd          Float           (unix epoch)
   eventTypes       String[]
   importanceScore  Float           @default(0)
   tier             ClipTier        @default(MICRO)
   replayTreatment  ReplayTreatment @default(LIVE_ONLY)
   dominantEmotion  String?
   shootoutGroup    String?
   tvClipPath       String?
   webcamClipPath   String?
   gameReplayPath   String?
   stitchedPath     String?
   enhancedPath     String?
   portraitPath     String?
   status           ClipJobStatus   @default(PENDING)
   enqueuedAt       DateTime        @default(now())
   startedAt        DateTime?
   errorMessage     String?

   Relations: session → Session, station → Station

4. New model GameReplay (SPEC §5):
   id           Int      @id @default(autoincrement())
   stationId    Int      (FK → Station)
   sessionId    Int      (FK → Session)
   replayStart  Float    (unix epoch)
   replayEnd    Float    (unix epoch)
   detectedAt   DateTime @default(now())
   confidence   Float
   used         Boolean  @default(false)

5. New model MatchState (SPEC §5):
   id              Int      @id @default(autoincrement())
   stationId       Int      @unique (FK → Station)
   capturedAt      DateTime @default(now())
   homeScore       Int      @default(0)
   awayScore       Int      @default(0)
   matchMinute     Int      @default(0)
   isReplayShowing Boolean  @default(false)
   isShootout      Boolean  @default(false)
   rawOcrText      String   @default("")

6. New model FaceSnapshot (SPEC §5 + REACTION-MODEL-SPEC §16):
   id              Int      @id @default(autoincrement())
   sessionId       Int      (FK → Session)
   stationId       Int      (FK → Station)
   capturedAt      DateTime @default(now())
   faceCount       Int      @default(0)   (0 = no face visible)
   dominantEmotion String?  ("joy", "surprise", "anger", "sadness", "fear", "neutral")
   emotionConfidence Float? (FER model confidence for dominant class)
   mouthAperture   Float?   (normalized 0–1, from YuNet mouth landmarks)
   faceMovement    Float?   (pixels/frame displacement of face bbox)
   offFaceMotion   Float?   (normalized 0–1, pixel change outside face bbox — arm-waving, standing up)
   faceX           Int?
   faceY           Int?
   faceW           Int?
   faceH           Int?
   face2Emotion    String?  (second face emotion, for 2-player scenarios)
   face2Confidence Float?
   face2X          Int?
   face2Y          Int?
   face2W          Int?
   face2H          Int?

   Index: @@index([stationId, sessionId, capturedAt])

7. Add to Station model:
   webcamDevice          String?
   analysisWebcamDevice  String?

8. Add to Session model:
   purgedAt              DateTime?
   audioBaseline         Float?
   emotionBaseline       Float?
   movementBaseline      Float?

9. Add to Settings model (use EXACT names and defaults from SPEC §5):
   clipPreRollSeconds         Int     @default(10)
   clipPreRollBigSeconds      Int     @default(20)
   clipPostRollSeconds        Int     @default(25)
   eventMergeWindowSeconds    Int     @default(25)
   yamnetConfidenceThreshold  Float   @default(0.55)
   tvRingBufferSeconds        Int     @default(180)
   gameAnalysisEnabled        Boolean @default(true)
   audioDetectionEnabled      Boolean @default(true)
   replayDetectionThreshold   Float   @default(0.80)
   alertTempCelsius           Int     @default(80)
   alertSmsNumber             String  @default("")
   stage2Enabled              Boolean @default(true)
   stage3Enabled              Boolean @default(true)
   microTierMax               Float   @default(0.39)
   standardTierMax            Float   @default(0.69)
   microPostRollCap           Int     @default(12)
   standardPostRollCap        Int     @default(30)
   bigPostRollCap             Int     @default(45)

Run: npx prisma migrate dev --name stage11_enhanced_pipeline
Run: npx prisma generate

10. Settings data migration: The existing seed row has NULL for new columns.
    In the migration SQL, add:
    UPDATE "Settings" SET
      "clipPreRollSeconds" = 10,
      "clipPreRollBigSeconds" = 20,
      "clipPostRollSeconds" = 25,
      "eventMergeWindowSeconds" = 25,
      -- ... all new columns with their defaults
    WHERE "clipPreRollSeconds" IS NULL;

Write test: apps/api/src/services/__tests__/schema-stage11.test.ts
- Create a FaceSnapshot, PendingEvent, ClipJob, GameReplay, MatchState
- Read them back and assert all fields
- Test ClipTier and ReplayTreatment enums
- Clean up

Run tests. They must pass.

Commit: "feat(db): Stage 11 schema — PendingEvent, ClipJob, GameReplay, MatchState, FaceSnapshot"
```

---

## Prompt 3 of 29 — Settings Helper and Shared Configuration

**What:** Create a `getSettings()` helper that both TypeScript API and Python pipeline can use. All thresholds/windows/TTLs read from DB at runtime — never hardcoded.
**Why now:** Every subsequent prompt reads Settings values.
**Builds on:** Prompt 2 (new Settings fields).
**Tests:** Unit test that getSettings returns correct defaults.

```text
Read docs/SPEC.md §5 (Settings model) and §10 (Clip Processing Queue — "reads Settings at runtime").

1. TypeScript side — apps/api/src/services/settings.ts:
   Create (or update if exists) a getSettings() function:

   import { prisma } from './prisma'

   let cached: Settings | null = null
   let cachedAt = 0
   const CACHE_TTL = 60_000  // refresh every 60 seconds

   export async function getSettings() {
     if (cached && Date.now() - cachedAt < CACHE_TTL) return cached
     cached = await prisma.settings.findFirstOrThrow()
     cachedAt = Date.now()
     return cached
   }

   Export the function. All API routes and services must use getSettings()
   instead of direct prisma.settings queries.

2. Python side — services/video-pipeline/settings.py:
   Create a module that fetches settings from the API:

   import httpx, time

   _cache = None
   _cache_time = 0
   API_URL = os.getenv("API_URL", "http://localhost:3000")

   async def get_settings() -> dict:
       global _cache, _cache_time
       if _cache and time.time() - _cache_time < 60:
           return _cache
       async with httpx.AsyncClient() as client:
           resp = await client.get(f"{API_URL}/api/settings")
           _cache = resp.json()
           _cache_time = time.time()
       return _cache

3. Write test: apps/api/src/services/__tests__/settings.test.ts
   - Call getSettings(), verify it returns an object with all Stage 11 fields
   - Verify defaults match SPEC §5 (yamnetConfidenceThreshold=0.55, etc.)
   - Call twice within 60s, verify it uses cache (mock prisma to count calls)

4. Write test: services/video-pipeline/tests/test_settings.py
   - Mock the HTTP call, verify get_settings returns parsed JSON
   - Verify caching (second call within 60s doesn't make HTTP request)

Run all tests. Commit: "feat(settings): runtime settings helper with 60s cache"
```

---

## Prompt 4 of 29 — API Endpoints for Pipeline Communication

**What:** Add API endpoints that the Python pipeline will call: ClipJob CRUD, PendingEvent insertion, MatchState updates, FaceSnapshot batch insert, and the LISTEN/NOTIFY trigger.
**Why now:** The pipeline workers need these endpoints before we build them.
**Builds on:** Prompts 2-3 (schema + settings helper).
**Tests:** API route tests for each endpoint.

```text
Read docs/SPEC.md §6 (API Endpoints) and §10 (Clip Processing Queue — LISTEN/NOTIFY pattern).

1. Create or update apps/api/src/routes/pipeline.ts with these endpoints:

   POST /api/pipeline/events
     Body: { sessionId, stationId, gameId, eventType?, eventTimestamp, source,
             audioConfidence, matchMinute?, homeScore?, awayScore? }
     Creates a PendingEvent row. Returns the created row.

   POST /api/pipeline/clip-jobs
     Body: { sessionId, stationId, clipStart, clipEnd, eventTypes[],
             importanceScore, tier, replayTreatment, dominantEmotion?,
             shootoutGroup? }
     Creates a ClipJob row with status=PENDING.
     Executes: NOTIFY new_clip_job (wakes the worker).
     Returns the created row.

   PATCH /api/pipeline/clip-jobs/:id
     Body: { status?, tvClipPath?, webcamClipPath?, gameReplayPath?,
             stitchedPath?, enhancedPath?, portraitPath?, errorMessage? }
     Updates the ClipJob row.
     If status becomes READY, check if all ClipJobs for this session are READY.
     If so, emit socket.io event replay:all_ready to the session's station room.

   GET /api/pipeline/clip-jobs?sessionId=X&status=Y
     Returns ClipJob rows filtered by session and optional status.

   POST /api/pipeline/match-state
     Body: { stationId, homeScore, awayScore, matchMinute, isReplayShowing,
             isShootout, rawOcrText }
     Upserts MatchState for the station.

   POST /api/pipeline/face-snapshots/batch
     Body: { snapshots: [{ sessionId, stationId, capturedAt?,
             faceCount, dominantEmotion?, emotionConfidence?,
             mouthAperture?, faceMovement?, offFaceMotion?,
             faceX?, faceY?, faceW?, faceH?,
             face2Emotion?, face2Confidence?,
             face2X?, face2Y?, face2W?, face2H? }] }
     Bulk inserts FaceSnapshot rows (up to 50 per call).

   GET /api/pipeline/face-snapshots?sessionId=X&stationId=Y&from=T1&to=T2
     Returns FaceSnapshot rows for a time window. Used by the enhancer.

   POST /api/pipeline/game-replays
     Body: { stationId, sessionId, replayStart, replayEnd, confidence }
     Creates a GameReplay row.

   GET /api/pipeline/game-replays?sessionId=X&used=false
     Returns unused GameReplay rows for a session.

2. Register the router in apps/api/src/index.ts (or wherever routes mount).
   These endpoints do NOT require staff authentication — they're internal
   (called by the Python pipeline on localhost only).

3. Set up PostgreSQL LISTEN/NOTIFY:
   In the pipeline router or a shared helper, after creating a ClipJob:
     await prisma.$executeRawUnsafe(`NOTIFY new_clip_job, '${clipJob.id}'`)

4. Write tests: apps/api/src/routes/__tests__/pipeline.test.ts
   - POST /api/pipeline/events → creates PendingEvent, returns it
   - POST /api/pipeline/clip-jobs → creates ClipJob, returns it
   - PATCH /api/pipeline/clip-jobs/:id → updates status
   - POST /api/pipeline/match-state → upserts (create then update)
   - POST /api/pipeline/face-snapshots/batch → bulk inserts
   - POST /api/pipeline/game-replays → creates GameReplay
   - GET endpoints return filtered results

Run tests. Commit: "feat(api): pipeline communication endpoints for Stage 11"
```

---

&nbsp;

---

# PHASE B — Capture Infrastructure (Prompts 5-7)

*Real ffmpeg capture replacing mocks. Ring buffer, webcams, security cameras.*

---

## Prompt 5 of 29 — TV Ring Buffer: Real ffmpeg Segment Capture

**What:** Replace mock TV capture with real ffmpeg `-c copy` segment capture into tmpfs ring buffer.
**Why now:** This is the foundation — clips are extracted from this buffer.
**Builds on:** Prompt 1 (ffmpeg installed), Prompt 3 (settings helper).
**Tests:** Unit test with mock ffmpeg; integration test that ring buffer directory structure is correct.

```text
Read docs/SPEC.md §7 (Video Pipeline Architecture — TV Streams section).
Read existing services/video-pipeline/capture/ files before editing.

The TV ring buffer uses ffmpeg's built-in -segment_wrap. No Python pruner.
No cleanup daemon. ffmpeg overwrites the oldest segment automatically.

1. Create services/video-pipeline/capture/tv_buffer.py:

   class TVRingBuffer:
       """Manages ffmpeg segment capture for one station's TV stream."""

       def __init__(self, station_id: int, capture_device: str):
           self.station_id = station_id
           self.capture_device = capture_device  # e.g. "/dev/video0" or HDMI capture card
           self.buffer_dir = f"/run/lounge/tv{station_id}"
           self.process: subprocess.Popen | None = None

       async def start(self):
           """Start ffmpeg segment capture into tmpfs ring buffer."""
           settings = await get_settings()
           segment_wrap = settings.get("tvRingBufferSeconds", 180) // 2
           # 90 segments × 2 seconds each = 180 seconds = 3 minutes

           os.makedirs(self.buffer_dir, exist_ok=True)

           cmd = [
               "ffmpeg", "-y",
               "-f", "v4l2",          # Linux video device
               "-i", self.capture_device,
               "-c", "copy",          # No transcode — passthrough
               "-f", "segment",
               "-segment_time", "2",
               "-segment_format", "mpegts",
               "-segment_wrap", str(segment_wrap),
               "-reset_timestamps", "1",
               f"{self.buffer_dir}/seg_%03d.ts"
           ]

           self.process = subprocess.Popen(
               cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE
           )

       async def stop(self):
           if self.process:
               self.process.terminate()
               self.process.wait(timeout=5)
               self.process = None

       def get_segments(self, start_time: float, end_time: float) -> list[str]:
           """Return ordered list of segment files covering the time window.
           Uses file mtime to map segments to wall-clock time."""
           segments = []
           for seg in sorted(Path(self.buffer_dir).glob("seg_*.ts")):
               mtime = seg.stat().st_mtime
               seg_start = mtime - 2  # each segment is 2 seconds
               if seg_start <= end_time and mtime >= start_time:
                   segments.append(str(seg))
           return sorted(segments, key=lambda s: Path(s).stat().st_mtime)

       @property
       def is_running(self) -> bool:
           return self.process is not None and self.process.poll() is None

   Add a USE_MOCK_CAPTURE flag check — if True, use the existing mock_capture
   instead of real ffmpeg. This keeps the dev environment working without hardware.

2. Update services/video-pipeline/capture/router.py:
   - The existing /capture/start and /capture/stop endpoints should now
     instantiate TVRingBuffer (or mock) per station.
   - Store active buffers in a dict keyed by station_id.

3. Write test: services/video-pipeline/tests/test_tv_buffer.py
   - Mock subprocess.Popen
   - Verify start() constructs correct ffmpeg command with segment_wrap
   - Verify get_segments() returns files sorted by mtime within a time window
   - Verify stop() terminates the process
   - Test with USE_MOCK_CAPTURE=true falls back to mock

Run tests. Commit: "feat(capture): real ffmpeg TV ring buffer with segment_wrap"
```

---

## Prompt 6 of 29 — Webcam Capture: 120fps on All Stations

**What:** Add real webcam capture — all 4 stations at 720p 120fps.
**Why now:** FaceScorer (Prompt 8) and the enhancer need webcam footage.
**Builds on:** Prompt 5 (capture module structure).
**Tests:** Unit test verifying ffmpeg command, 60s post-session recording.

```text
Read docs/SPEC.md §7 (Webcam Capture section). All 4 stations use identical
120fps webcams. The webcam keeps recording 60 seconds after the session ends
so late clip extractions don't lose their source footage.

1. Create services/video-pipeline/capture/webcam.py:

   class WebcamCapture:
       """Records 720p 120fps webcam for one station."""

       def __init__(self, station_id: int, webcam_device: str):
           self.station_id = station_id
           self.webcam_device = webcam_device
           self.output_dir = f"/var/lounge/webcam{station_id}"
           self.process = None
           self._stop_requested = False

       async def start(self, session_id: int):
           os.makedirs(self.output_dir, exist_ok=True)
           cmd = [
               "ffmpeg", "-y",
               "-f", "v4l2",
               "-video_size", "1280x720",
               "-framerate", "120",
               "-input_format", "h264",    # UVC H.264
               "-i", self.webcam_device,
               "-c", "copy",
               "-f", "segment",
               "-segment_time", "5",       # 5-second segments
               "-segment_format", "mpegts",
               "-reset_timestamps", "1",
               f"{self.output_dir}/session_{session_id}/seg_%05d.ts"
           ]
           os.makedirs(f"{self.output_dir}/session_{session_id}", exist_ok=True)
           self.process = subprocess.Popen(cmd, ...)

       async def stop(self, delay_seconds: int = 60):
           """Stop recording after delay (allows late clip extraction)."""
           await asyncio.sleep(delay_seconds)
           if self.process:
               self.process.terminate()
               self.process.wait(timeout=5)

       def get_segments(self, start_time: float, end_time: float) -> list[str]:
           """Same mtime-based lookup as TVRingBuffer."""
           # ... same pattern as tv_buffer.py

   Add USE_MOCK_CAPTURE fallback.

2. Wire into capture/router.py alongside TV buffer.
   On session start: start both TV buffer and webcam for the station.
   On session end: stop TV buffer immediately; stop webcam after 60s delay.

3. Write test: services/video-pipeline/tests/test_webcam.py
   - Verify ffmpeg command includes -framerate 120 and -video_size 1280x720
   - Verify 60-second delay on stop
   - Verify get_segments returns correct files

Run tests. Commit: "feat(capture): 120fps webcam capture on all stations"
```

---

## Prompt 7 of 29 — Security Camera Capture: Real RTSP Recording

**What:** Replace mock security camera recording with real RTSP stream capture.
**Why now:** Completing the capture layer. Independent of the reaction pipeline.
**Builds on:** Prompt 5 (capture module structure), existing `security/recorder.py`.
**Tests:** Unit test with mocked ffmpeg; verify segment rotation and health checks.

```text
Read docs/SPEC.md §7 (Security Cameras section). 5 PoE cameras, 5-minute
segments, migrated to USB HDD nightly.

Read existing services/video-pipeline/security/recorder.py first.

1. Update services/video-pipeline/security/recorder.py:
   The existing code has the right structure. Ensure it:
   - Uses ffmpeg with -c copy and -f segment -segment_time 300 (5 min)
   - Writes to /var/lounge/sec/cam{N}/
   - Has health check (process alive, last segment mtime < 60s ago)
   - Auto-reconnects on stream loss (retry with backoff)
   - Reads securityRetentionDays from Settings

2. Update security/router.py with health status per camera.

3. Existing tests should still pass. Add test for reconnect logic.

Run tests. Commit: "feat(security): real RTSP camera recording with health checks"
```

---

&nbsp;

---

# PHASE C — Detection & Analysis (Prompts 8-12)

*The sensing layer: face analysis, audio detection, game stream analysis, event merging.*

---

## Prompt 8 of 29 — FaceScorer: Real-Time Face Detection + Emotion Classification

**What:** Build the FaceScorer service that runs YuNet face detection + FER emotion at 4fps per station, writing FaceSnapshot rows to the DB.
**Why now:** FaceSnapshot data is needed by the EventMerger (importance scoring) and the enhancer (face zoom, emotion stingers).
**Builds on:** Prompt 1 (AI models), Prompt 2 (FaceSnapshot schema), Prompt 4 (batch insert endpoint).
**Tests:** Unit tests with synthetic frame data; verify FaceSnapshot writes.

```text
Read docs/SPEC.md §7 (FaceScorer section) and docs/REACTION-MODEL-SPEC.md §16.2.

FaceScorer samples the webcam at 4fps (every 30th frame from 120fps stream),
runs YuNet face detection (~3ms) then FER emotion (~10ms), and batch-inserts
FaceSnapshot rows every 2 seconds. It also manages per-session baseline
calibration during the first 120 seconds.

1. Create services/video-pipeline/analysis/face_scorer.py:

   class FaceScorer:
       """Runs face detection + emotion classification at 4fps per station."""

       def __init__(self, station_id: int):
           self.station_id = station_id
           self.session_id = None
           self.yunet = cv2.FaceDetectorYN.create(
               config.YUNET_MODEL_PATH, "", (1280, 720)
           )
           self.fer_session = onnxruntime.InferenceSession(config.FER_MODEL_PATH)
           self.snapshot_buffer = []
           self.running = False
           # Baseline calibration
           self.baseline_window = []  # first 120 seconds
           self.baseline_ready = False
           self.emotion_baseline = 0.2  # default until calibrated
           self.movement_baseline = 0.1
           self.prev_face_bbox = None

       async def start(self, session_id: int, webcam_device: str):
           self.session_id = session_id
           self.running = True
           self.cap = cv2.VideoCapture(webcam_device)
           self.cap.set(cv2.CAP_PROP_FPS, 120)
           asyncio.create_task(self._run_loop())

       async def _run_loop(self):
           frame_count = 0
           while self.running:
               ret, frame = self.cap.read()
               if not ret:
                   await asyncio.sleep(0.01)
                   continue
               frame_count += 1
               if frame_count % 30 != 0:  # 120fps / 30 = 4fps
                   continue

               snapshot = self._analyze_frame(frame)
               self.snapshot_buffer.append(snapshot)

               # Batch insert every 2 seconds (8 snapshots at 4fps)
               if len(self.snapshot_buffer) >= 8:
                   await self._flush_buffer()

               # Baseline calibration: first 120 seconds
               elapsed = time.time() - self._start_time
               if not self.baseline_ready and elapsed < 120:
                   self.baseline_window.append(snapshot)
               elif not self.baseline_ready and elapsed >= 120:
                   self._compute_baseline()

       def _analyze_frame(self, frame) -> dict:
           # YuNet face detection
           _, faces = self.yunet.detect(frame)
           base = {
               "sessionId": self.session_id,
               "stationId": self.station_id,
               "faceCount": 0,
           }
           if faces is not None and len(faces) > 0:
               face = faces[0]  # dominant face
               x, y, w, h = int(face[0]), int(face[1]), int(face[2]), int(face[3])
               face_crop = frame[y:y+h, x:x+w]
               # FER emotion classification
               emotion, confidence = self._classify_emotion(face_crop)
               # Movement score (bbox displacement from previous frame)
               movement = self._compute_movement(x, y, w, h)
               # Off-face motion (pixel change outside face bbox)
               off_face = self._compute_off_face_motion(frame, x, y, w, h)
               # Mouth aperture from YuNet landmarks
               mouth = self._compute_mouth_aperture(face)
               base.update({
                   "faceCount": min(len(faces), 2),
                   "faceX": x, "faceY": y, "faceW": w, "faceH": h,
                   "dominantEmotion": emotion,
                   "emotionConfidence": confidence,
                   "faceMovement": movement,
                   "offFaceMotion": off_face,
                   "mouthAperture": mouth,
               })
               # Second face (2-player scenarios)
               if len(faces) > 1:
                   f2 = faces[1]
                   x2, y2, w2, h2 = int(f2[0]), int(f2[1]), int(f2[2]), int(f2[3])
                   crop2 = frame[y2:y2+h2, x2:x2+w2]
                   emo2, conf2 = self._classify_emotion(crop2)
                   base.update({
                       "face2X": x2, "face2Y": y2, "face2W": w2, "face2H": h2,
                       "face2Emotion": emo2, "face2Confidence": conf2,
                   })
           return base

       def _classify_emotion(self, face_crop) -> tuple[str, float]:
           """Run FER MobileNet on face crop. Returns (emotion_name, confidence)."""
           blob = cv2.resize(face_crop, (64, 64)).astype(np.float32) / 255.0
           blob = np.expand_dims(np.transpose(blob, (2, 0, 1)), 0)
           probs = self.fer_session.run(None, {"Input3": blob})[0][0]
           emotions = ["neutral", "joy", "surprise", "sadness", "anger", "disgust", "fear"]
           idx = int(np.argmax(probs))
           return emotions[idx], float(probs[idx])

       def _compute_baseline(self):
           """Use 20th percentile of first 120s to establish baseline."""
           scores = [s["emotionConfidence"] for s in self.baseline_window if s["faceCount"] > 0 and s.get("emotionConfidence")]
           movements = [s["faceMovement"] for s in self.baseline_window if s["faceCount"] > 0 and s.get("faceMovement")]
           if scores:
               self.emotion_baseline = float(np.percentile(scores, 20))
           if movements:
               self.movement_baseline = float(np.percentile(movements, 20))
           self.baseline_ready = True
           # Write baselines to Session via API
           # POST /api/sessions/{id} with audioBaseline, emotionBaseline, movementBaseline

       async def _flush_buffer(self):
           """Batch insert FaceSnapshots via API."""
           if not self.snapshot_buffer:
               return
           await api_client.post("/api/pipeline/face-snapshots/batch",
                                 json={"snapshots": self.snapshot_buffer})
           self.snapshot_buffer = []

       async def stop(self):
           self.running = False
           await self._flush_buffer()
           if self.cap:
               self.cap.release()

   Add USE_MOCK_CAPTURE fallback that generates synthetic FaceSnapshot data.

2. Create services/video-pipeline/analysis/__init__.py

3. Write test: services/video-pipeline/tests/test_face_scorer.py
   - Mock webcam cv2.VideoCapture and cv2.FaceDetectorYN
   - Verify _analyze_frame returns correct dict structure (faceCount, emotionConfidence, mouthAperture, offFaceMotion, face2* fields)
   - Verify _compute_baseline uses 20th percentile
   - Verify _flush_buffer calls batch API with SPEC-aligned field names
   - Verify frame sampling rate (every 30th frame)

Run tests. Commit: "feat(analysis): FaceScorer with YuNet + FER at 4fps per station"
```

---

## Prompt 9 of 29 — YAMNet Audio Detection (Real Implementation)

**What:** Replace mock audio detector with real YAMNet TFLite inference on TV audio.
**Why now:** Audio events are one of the three detection sources for the EventMerger.
**Builds on:** Prompt 1 (YAMNet model), Prompt 3 (settings), Prompt 4 (event API).
**Tests:** Unit test with synthetic audio; verify PendingEvent creation.

```text
Read docs/SPEC.md §7 (Audio Detection section) and §8 (line about tension boost).
Read existing services/video-pipeline/detection/detector.py before editing.

1. Update services/video-pipeline/detection/detector.py:
   Replace the mock detector with real YAMNet inference.

   class YAMNetDetector:
       """Listens to TV audio from MS2130 capture card ALSA device, fires PendingEvents."""

       def __init__(self, station_id: int, audio_device: str):
           self.station_id = station_id
           self.interpreter = tflite.Interpreter(model_path=config.YAMNET_MODEL_PATH)
           self.interpreter.allocate_tensors()
           # Audio buffer: 0.975s window at 16kHz = 15600 samples
           self.sample_rate = 16000
           self.window_size = 15600

       async def start(self, session_id: int):
           """Open audio stream from ALSA device and start listening."""
           self.session_id = session_id
           self.running = True
           asyncio.create_task(self._listen_loop())

       async def _listen_loop(self):
           settings = await get_settings()
           threshold = settings.get("yamnetConfidenceThreshold", 0.55)

           while self.running:
               audio_chunk = await self._read_audio(self.window_size)
               scores = self._infer(audio_chunk)

               # Class indices for exciting sounds (cheering, crowd, celebration)
               # YAMNet classes: 0=speech, 494=cheering, 495=crowd, etc.
               excitement_score = max(scores[494], scores[495], scores[0])

               # Tension boost: lower threshold in 80th+ minute when tied
               match_state = await self._get_match_state()
               if match_state and match_state.get("matchMinute", 0) >= 80:
                   if match_state.get("homeScore") == match_state.get("awayScore"):
                       threshold *= 0.85  # 15% more sensitive

               if excitement_score >= threshold:
                   await self._fire_event(excitement_score)

       def _infer(self, audio: np.ndarray) -> np.ndarray:
           input_details = self.interpreter.get_input_details()
           output_details = self.interpreter.get_output_details()
           self.interpreter.set_tensor(input_details[0]['index'], audio.astype(np.float32))
           self.interpreter.invoke()
           return self.interpreter.get_tensor(output_details[0]['index'])[0]

       async def _fire_event(self, confidence: float):
           match_state = await self._get_match_state()
           await api_client.post("/api/pipeline/events", json={
               "sessionId": self.session_id,
               "stationId": self.station_id,
               "gameId": await self._get_current_game_id(),
               "eventType": "GOAL_CANDIDATE",  # refined by game analyzer
               "eventTimestamp": time.time(),
               "source": "AUDIO_AI",
               "audioConfidence": confidence,
               "matchMinute": match_state.get("matchMinute") if match_state else None,
               "homeScore": match_state.get("homeScore") if match_state else None,
               "awayScore": match_state.get("awayScore") if match_state else None,
           })

   Preserve USE_MOCK_YAMNET fallback for dev environments.

2. Write test: services/video-pipeline/tests/test_yamnet_real.py
   - Mock tflite.Interpreter
   - Feed synthetic audio → verify inference is called
   - Test threshold comparison (above fires event, below does not)
   - Test tension boost (tied score at minute 80 lowers threshold)

Run tests. Commit: "feat(detection): real YAMNet audio detection with tension boost"
```

---

## Prompt 10 of 29 — Game Stream Visual Analyzer

**What:** Analyze the TV stream at 320x240/2fps to detect replays, cards, goals, and read score/minute via OCR. Writes to MatchState and fires PendingEvents.
**Why now:** Game analyzer provides corroboration for audio events and detects FIFA replays for DUAL_BEAT treatment.
**Builds on:** Prompt 5 (TV ring buffer — provides segment files), Prompt 4 (match-state and event APIs), Prompt 2 (MatchState + GameReplay schemas).
**Tests:** Unit tests with synthetic frame data for each detection type.

```text
Read docs/SPEC.md §8 (Game Stream Analysis). Read docs/REACTION-MODEL-SPEC.md §2.2.
Also read §8 shootout detection section.

IMPORTANT: The game analyzer does NOT open the V4L2 capture device directly.
The TV capture card is already opened exclusively by ffmpeg (Prompt 5) which writes
2-second .ts segments to /run/lounge/tvN/. The game analyzer reads these segment
files instead (Option B). This provides fault isolation — if the analyzer crashes,
TV capture continues uninterrupted.

1. Create services/video-pipeline/analysis/game_analyzer.py:

   class GameAnalyzer:
       """Reads TV ring buffer segments at 320x240/2fps. Detects events, reads score."""

       def __init__(self, station_id: int):
           self.station_id = station_id
           self.buffer_dir = f"/run/lounge/tv{station_id}"
           self.last_segment = None
           # Load replay banner template for template matching
           self.replay_template = cv2.imread("models/replay_banner.png", 0)

       async def start(self, session_id: int):
           self.session_id = session_id
           self.running = True
           asyncio.create_task(self._analyze_loop())

       def _get_latest_segment(self) -> str | None:
           """Find the most recently modified .ts file in the ring buffer directory."""
           import glob
           segments = sorted(
               glob.glob(os.path.join(self.buffer_dir, "seg_*.ts")),
               key=os.path.getmtime
           )
           return segments[-1] if segments else None

       def _extract_frame(self, segment_path: str):
           """Decode one frame from a .ts segment at 320x240."""
           cap = cv2.VideoCapture(segment_path)
           cap.set(cv2.CAP_PROP_FRAME_WIDTH, 320)
           cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 240)
           ret, frame = cap.read()
           cap.release()
           if ret:
               return cv2.resize(frame, (320, 240))
           return None

       async def _analyze_loop(self):
           settings = await get_settings()
           if not settings.get("gameAnalysisEnabled", True):
               return
           frame_interval = 0.5  # 2fps
           while self.running:
               segment = self._get_latest_segment()
               if segment and segment != self.last_segment:
                   self.last_segment = segment
                   frame = self._extract_frame(segment)
                   if frame is not None:
                       await self._process_frame(frame)
               await asyncio.sleep(frame_interval)

       async def _process_frame(self, frame):
           gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

           # 1. Replay banner detection (template matching)
           replay_conf = self._detect_replay_banner(gray)
           settings = await get_settings()
           if replay_conf >= settings.get("replayDetectionThreshold", 0.80):
               await self._handle_replay_detected(replay_conf)

           # 2. Goal flash detection (brightness spike)
           brightness = np.mean(gray)
           if brightness > 200:  # significant brightness spike
               await self._fire_event("GOAL_CANDIDATE", confidence=brightness/255)

           # 3. Card detection (red/yellow region)
           hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
           red_mask = cv2.inRange(hsv, (0, 100, 100), (10, 255, 255))
           yellow_mask = cv2.inRange(hsv, (20, 100, 100), (35, 255, 255))
           if np.sum(red_mask) > 5000:
               await self._fire_event("RED_CARD")
           elif np.sum(yellow_mask) > 5000:
               await self._fire_event("YELLOW_CARD")

           # 4. OCR: score + match minute
           await self._ocr_score_minute(gray)

       def _detect_replay_banner(self, gray_frame) -> float:
           if self.replay_template is None:
               return 0.0
           result = cv2.matchTemplate(gray_frame, self.replay_template, cv2.TM_CCOEFF_NORMED)
           return float(np.max(result))

       async def _ocr_score_minute(self, gray_frame):
           """Read score and match minute from top of screen via Tesseract."""
           # Crop top strip (score area)
           score_region = gray_frame[0:30, :]
           text = pytesseract.image_to_string(score_region, config="--psm 7")
           # Parse score pattern: "1 - 2" or "1-2"
           # Parse minute pattern: "45'" or "78"
           parsed = self._parse_score_text(text)
           if parsed:
               await api_client.post("/api/pipeline/match-state", json={
                   "stationId": self.station_id,
                   "homeScore": parsed["home"],
                   "awayScore": parsed["away"],
                   "matchMinute": parsed["minute"],
                   "isReplayShowing": self._replay_currently_showing,
                   "isShootout": self._check_shootout(),
                   "rawOcrText": text
               })

       def _check_shootout(self) -> bool:
           """Detect shootout: matchMinute >= 90 AND 3+ penalty events in 4 min."""
           # Track recent events internally
           # See SPEC §8 and REACTION-MODEL-SPEC §8.1
           ...

       async def _fire_event(self, event_type: str, confidence: float = 0.9):
           await api_client.post("/api/pipeline/events", json={
               "sessionId": self.session_id,
               "stationId": self.station_id,
               "gameId": await self._get_current_game_id(),
               "eventType": event_type,
               "eventTimestamp": time.time(),
               "source": "GAME_ANALYZER",
               "audioConfidence": confidence,
           })

       async def _handle_replay_detected(self, confidence: float):
           await api_client.post("/api/pipeline/game-replays", json={
               "stationId": self.station_id,
               "sessionId": self.session_id,
               "replayStart": time.time(),
               "replayEnd": time.time() + 15,  # estimated replay duration
               "confidence": confidence,
           })

2. Write test: services/video-pipeline/tests/test_game_analyzer.py
   - Mock _get_latest_segment to return a test .ts file path
   - Mock _extract_frame to return synthetic frames
   - Test replay banner detection with synthetic template match
   - Test goal flash detection with bright frame
   - Test card detection with red/yellow region
   - Test OCR parsing of score text
   - Test shootout detection logic (3+ events at minute 90+)
   - Verify analyzer never opens a V4L2 device (no cv2.VideoCapture("/dev/video*"))

Run tests. Commit: "feat(analysis): game stream visual analyzer — reads ring buffer segments at 320x240/2fps"
```

---

## Prompt 11 of 29 — EventMerger: Importance Scoring, Tiers, and Dynamic Post-Roll

**What:** The core intelligence module. Merges events within a time window, computes importance scores, assigns tiers, determines dynamic post-roll, selects FIFA replay treatment, and creates ClipJobs.
**Why now:** This is the brain — it consumes all detection signals and produces scored ClipJobs for the processing pipeline.
**Builds on:** Prompts 4, 8, 9, 10 (all three detection sources + API endpoints).
**Tests:** Comprehensive unit tests for scoring formula, tier assignment, corroboration, DUAL_BEAT selection, shootout grouping.

```text
Read docs/SPEC.md §9 (Event Handling, Importance Scoring, and Clip Creation) — the ENTIRE section.
Read docs/REACTION-MODEL-SPEC.md §3 (Importance Scoring), §4 (Clip Tiers), §5 (Dynamic Clip Length),
§6 (FIFA Replay Dual-Reaction Treatment), §8 (Penalty Shootout Grouping), §13 (Emotion Transitions).

This is the largest and most important prompt. Take it slowly.

1. Create services/video-pipeline/analysis/event_merger.py:

   class EventMerger:
       """Merges events, scores importance, assigns tiers, creates ClipJobs."""

       def __init__(self, station_id: int):
           self.station_id = station_id
           self.active_windows: dict[int, MergeWindow] = {}  # game_id → window

       async def on_event(self, event: dict):
           """Called when any detection source fires an event."""
           settings = await get_settings()
           merge_window = settings.get("eventMergeWindowSeconds", 25)
           game_id = event["gameId"]

           if game_id in self.active_windows:
               window = self.active_windows[game_id]
               if event["eventTimestamp"] < window.end:
                   # Merge into existing window
                   window.extend(event, merge_window)
                   # Check for corroboration (BOTH source)
                   window.check_corroboration(event)
                   return

           # New window
           window = MergeWindow(event, merge_window)
           self.active_windows[game_id] = window
           # Schedule finalization after window closes
           asyncio.create_task(self._finalize_after_delay(game_id, window))

       async def _finalize_after_delay(self, game_id, window):
           await asyncio.sleep(window.remaining_seconds())
           await self._finalize_window(game_id, window)

       async def _finalize_window(self, game_id, window):
           """Compute importance, assign tier, create ClipJob."""
           del self.active_windows[game_id]

           # 1. Gather FaceSnapshot data for this window
           snapshots = await self._get_face_snapshots(
               window.start - 5, window.end + 30  # pre-roll + post-roll buffer
           )

           # 2. Get session baseline
           session = await self._get_session()
           baseline = {
               "emotion": session.get("emotionBaseline", 0.2),
               "movement": session.get("movementBaseline", 0.1),
               "audio": session.get("audioBaseline", 0.3),
           }

           # 3. Compute importance score (SPEC §9, REACTION-MODEL-SPEC §3.1)
           score = self._compute_importance(window, snapshots, baseline)

           # 4. Assign tier (SPEC §9, REACTION-MODEL-SPEC §4)
           settings = await get_settings()
           tier = self._assign_tier(score, settings)

           # 5. Determine dynamic post-roll (REACTION-MODEL-SPEC §5)
           post_roll = self._compute_dynamic_post_roll(snapshots, tier, settings)

           # 6. Select FIFA replay treatment (REACTION-MODEL-SPEC §6)
           treatment = await self._select_replay_treatment(window, snapshots, tier)

           # 7. Detect emotion transitions (REACTION-MODEL-SPEC §13)
           transition = self._detect_emotion_transition(snapshots)
           if transition:
               score += transition["importance_boost"]
               tier = self._assign_tier(score, settings)  # re-check tier

           # 8. Determine pre-roll
           pre_roll = settings.get("clipPreRollBigSeconds", 20) if tier == "BIG" \
                      else settings.get("clipPreRollSeconds", 10)

           # 9. Check for shootout grouping
           shootout_group = await self._check_shootout_group(window)

           # 10. Create ClipJob
           clip_start = window.earliest_event - pre_roll
           clip_end = window.latest_event + post_roll
           dominant_emotion = self._get_dominant_emotion(snapshots)

           await api_client.post("/api/pipeline/clip-jobs", json={
               "sessionId": window.session_id,
               "stationId": self.station_id,
               "clipStart": clip_start,
               "clipEnd": clip_end,
               "eventTypes": window.event_types,
               "importanceScore": round(score, 4),
               "tier": tier,
               "replayTreatment": treatment,
               "dominantEmotion": dominant_emotion,
               "shootoutGroup": shootout_group,
           })

       def _compute_importance(self, window, snapshots, baseline) -> float:
           """Weighted fusion per REACTION-MODEL-SPEC §3.1:
              faceReactionScore × 0.30
            + audioScore × 0.25
            + visualEventScore × 0.20
            + contextMultiplier × 0.15
            + facePresenceScore × 0.10
           """
           face_reaction = self._face_reaction_score(snapshots, baseline)
           audio = self._audio_score(window)
           visual = self._visual_event_score(window)
           context = self._context_multiplier(window)
           face_presence = self._face_presence_score(snapshots)

           raw = (face_reaction * 0.30 + audio * 0.25 + visual * 0.20
                  + context * 0.15 + face_presence * 0.10)

           # Corroboration boost
           if window.source == "BOTH":
               raw += 0.15

           return min(raw, 1.0)

       def _assign_tier(self, score, settings) -> str:
           if score <= settings.get("microTierMax", 0.39):
               return "MICRO"
           elif score <= settings.get("standardTierMax", 0.69):
               return "STANDARD"
           else:
               return "BIG"

       def _compute_dynamic_post_roll(self, snapshots, tier, settings) -> float:
           """Post-roll ends when face emotion drops below baseline for 2+ seconds.
              Capped by tier: MICRO=12s, STANDARD=30s, BIG=45s."""
           caps = {
               "MICRO": settings.get("microPostRollCap", 12),
               "STANDARD": settings.get("standardPostRollCap", 30),
               "BIG": settings.get("bigPostRollCap", 45),
           }
           # Find when emotion drops below baseline for 2+ consecutive seconds
           # ... scan FaceSnapshot timestamps ...
           return min(computed_post_roll, caps[tier])

       async def _select_replay_treatment(self, window, snapshots, tier) -> str:
           """Per REACTION-MODEL-SPEC §6.3"""
           game_replays = await api_client.get(
               f"/api/pipeline/game-replays?sessionId={window.session_id}&used=false"
           )
           # Check if any GameReplay overlaps this window
           overlapping = [r for r in game_replays if ...]
           if not overlapping:
               return "LIVE_ONLY"
           if tier == "BIG":
               return "DUAL_BEAT"  # BIG always uses DUAL_BEAT
           # STANDARD: DUAL_BEAT if both reactions > 0.4
           if tier == "STANDARD":
               live_peak = self._peak_emotion_in_window(snapshots, window.start, window.end)
               replay_peak = self._peak_emotion_in_window(snapshots, ...)
               if live_peak > 0.4 and replay_peak > 0.4:
                   return "DUAL_BEAT"
               return "REPLAY_ONLY"
           return "REPLAY_ONLY"  # MICRO

       async def on_session_end(self, session_id: int, game_id: int):
           """Inject synthetic MATCH_END event."""
           await self.on_event({
               "sessionId": session_id,
               "stationId": self.station_id,
               "gameId": game_id,
               "eventType": "MATCH_END",
               "eventTimestamp": time.time(),
               "source": "GAME_ANALYZER",
               "audioConfidence": 1.0,
           })

       # Face-only trigger (called from FaceScorer when strong reaction without event)
       async def on_face_trigger(self, session_id, game_id, timestamp, emotion_score):
           """Source=FACE_ONLY — strong face reaction without audio/visual event."""
           await self.on_event({
               "sessionId": session_id,
               "stationId": self.station_id,
               "gameId": game_id,
               "eventType": None,  # no game event
               "eventTimestamp": timestamp,
               "source": "FACE_ONLY",
               "audioConfidence": 0,
           })

2. Create services/video-pipeline/analysis/merge_window.py:
   MergeWindow data class that tracks events, timestamps, sources,
   corroboration status, and event types within a merge window.

3. Write test: services/video-pipeline/tests/test_event_merger.py
   This is the most important test file. Cover:
   - Single audio event → MICRO clip (low importance)
   - Audio + game analyzer within 25s → source=BOTH, boosted importance
   - Goal at 89' with tied score → high context multiplier
   - Strong face reaction with no audio/visual → source=FACE_ONLY
   - Dynamic post-roll: emotion drops after 8s → post-roll = 8s
   - Dynamic post-roll: emotion sustained 40s → capped at tier limit
   - FIFA replay overlaps → DUAL_BEAT for BIG, REPLAY_ONLY for MICRO
   - MATCH_END synthetic event
   - Shootout grouping (3+ events at minute 90+)
   - Emotion transition detection (joy→anger→sadness = heartbreak boost)

Run tests. Commit: "feat(analysis): EventMerger with importance scoring, tiers, DUAL_BEAT"
```

---

## Prompt 12 of 29 — Wire Detection Services Together

**What:** Connect FaceScorer, YAMNet, GameAnalyzer, and EventMerger into a unified session lifecycle. Start all on session start, stop all on session end.
**Why now:** Individual components exist; now they need to work as a coordinated system.
**Builds on:** Prompts 8-11 (all detection services).
**Tests:** Integration test that starts a session and verifies all services spin up.

```text
Read docs/SPEC.md §17 (User Journey) — steps 3-6 describe the startup sequence.

1. Create services/video-pipeline/session_manager.py:

   class SessionManager:
       """Orchestrates all capture and analysis services for one station."""

       def __init__(self, station_id: int):
           self.station_id = station_id
           self.tv_buffer = TVRingBuffer(station_id, ...)
           self.webcam = WebcamCapture(station_id, ...)
           self.face_scorer = FaceScorer(station_id)
           self.audio_detector = YAMNetDetector(station_id, ...)
           self.game_analyzer = GameAnalyzer(station_id)
           self.event_merger = EventMerger(station_id)

       async def start_session(self, session_id: int, game_id: int):
           """Start all services for a new session."""
           await self.tv_buffer.start()
           await self.webcam.start(session_id)
           await self.face_scorer.start(session_id, ...)
           await self.audio_detector.start(session_id)
           await self.game_analyzer.start(session_id, ...)

           # Wire event flow:
           # audio_detector.on_event → event_merger.on_event
           # game_analyzer.on_event → event_merger.on_event
           # face_scorer.on_strong_reaction → event_merger.on_face_trigger

       async def stop_session(self, session_id: int, game_id: int):
           """Stop all services. Inject MATCH_END. Webcam records 60s more."""
           await self.event_merger.on_session_end(session_id, game_id)
           await self.audio_detector.stop()
           await self.game_analyzer.stop()
           await self.face_scorer.stop()
           await self.tv_buffer.stop()
           # Webcam stops with 60s delay (handled internally)
           await self.webcam.stop(delay_seconds=60)

2. Update services/video-pipeline/main.py:
   - Create a SessionManager per station
   - Add FastAPI endpoints:
     POST /pipeline/session/start  body: { stationId, sessionId, gameId }
     POST /pipeline/session/stop   body: { stationId, sessionId, gameId }
   - These are called by the main API when sessions start/end

3. Update apps/api/src/services/captureService.ts:
   When a session starts, call POST http://localhost:8000/pipeline/session/start
   When a session ends, call POST http://localhost:8000/pipeline/session/stop

4. Write test: services/video-pipeline/tests/test_session_manager.py
   - Mock all sub-services
   - Verify start_session starts all 5 services
   - Verify stop_session injects MATCH_END and stops in correct order
   - Verify webcam gets 60s delay

Run tests. Commit: "feat(pipeline): session manager wiring all detection services"
```

---

&nbsp;

---

# PHASE D — Clip Processing Pipeline (Prompts 13-18)

*Extract, stitch, enhance, and produce clips at each tier level.*

---

## Prompt 13 of 29 — Clip Extraction Worker (Stage 1: EXTRACTING)

**What:** Worker that listens for new ClipJobs via LISTEN/NOTIFY, claims them atomically, and extracts TV + webcam + FIFA replay segments from the ring buffer using `ffmpeg -c copy`.
**Why now:** First stage of the processing pipeline.
**Builds on:** Prompts 5-6 (buffers), Prompt 4 (ClipJob API).
**Tests:** Unit test with mock segments; verify correct time-window extraction.

```text
Read docs/SPEC.md §10 (Clip Processing Queue) and §11 (EXTRACTING stage).

1. Create services/video-pipeline/workers/extractor.py:

   class ClipExtractor:
       """Listens for PENDING ClipJobs, extracts segments from ring buffer."""

       async def start(self):
           """Connect to PostgreSQL LISTEN/NOTIFY."""
           self.conn = await asyncpg.connect(DATABASE_URL)
           await self.conn.add_listener("new_clip_job", self._on_notify)

       async def _on_notify(self, conn, pid, channel, payload):
           await self._process_next()

       async def _process_next(self):
           """Claim next PENDING job atomically (BIG-first priority)."""
           # See SPEC §10 for the exact SQL with FOR UPDATE SKIP LOCKED
           job = await api_client.get_next_pending_job()  # or raw SQL
           if not job:
               return

           await api_client.patch_clip_job(job["id"], {"status": "EXTRACTING"})

           try:
               # Extract TV segments
               tv_path = await self._extract_tv(job)
               # Extract webcam segments
               webcam_path = await self._extract_webcam(job)
               # Extract FIFA replay if gameReplayPath should exist
               replay_path = await self._maybe_extract_replay(job)

               await api_client.patch_clip_job(job["id"], {
                   "status": "STITCHING",
                   "tvClipPath": tv_path,
                   "webcamClipPath": webcam_path,
                   "gameReplayPath": replay_path,
               })
           except Exception as e:
               await api_client.patch_clip_job(job["id"], {
                   "status": "FAILED",
                   "errorMessage": str(e),
               })

       async def _extract_tv(self, job) -> str:
           """Concatenate TV ring buffer segments covering clipStart→clipEnd."""
           buffer = TVRingBuffer(job["stationId"], ...)
           segments = buffer.get_segments(job["clipStart"], job["clipEnd"])
           if not segments:
               raise ValueError("No TV segments available for time window")

           output = f"/var/lounge/replays/session_{job['sessionId']}/tv_{job['id']}.mp4"
           os.makedirs(os.path.dirname(output), exist_ok=True)

           # Write concat file
           concat_file = f"/tmp/concat_{job['id']}.txt"
           with open(concat_file, "w") as f:
               for seg in segments:
                   f.write(f"file '{seg}'\n")

           cmd = ["ffmpeg", "-y", "-f", "concat", "-safe", "0",
                  "-i", concat_file, "-c", "copy", output]
           await asyncio.create_subprocess_exec(*cmd)
           return output

       async def _extract_webcam(self, job) -> str | None:
           """Extract webcam segments. Handle partial coverage gracefully."""
           webcam = WebcamCapture(job["stationId"], ...)
           segments = webcam.get_segments(job["clipStart"], job["clipEnd"])
           if not segments:
               return None  # TV-only clip, no webcam

           # Same concat pattern as TV
           output = f"/var/lounge/replays/session_{job['sessionId']}/webcam_{job['id']}.mp4"
           # ... concat ffmpeg ...
           return output

       async def _maybe_extract_replay(self, job) -> str | None:
           """Find overlapping GameReplay and extract that segment."""
           replays = await api_client.get(
               f"/api/pipeline/game-replays?sessionId={job['sessionId']}&used=false"
           )
           for replay in replays:
               if (replay["replayStart"] <= job["clipEnd"] and
                   replay["replayEnd"] >= job["clipStart"]):
                   # Extract this replay segment from ring buffer
                   output = f"/var/lounge/replays/session_{job['sessionId']}/replay_{job['id']}.mp4"
                   # ... extract ...
                   # Mark used
                   await api_client.patch(f"/api/pipeline/game-replays/{replay['id']}",
                                         json={"used": True})
                   return output
           return None

2. Write test: services/video-pipeline/tests/test_extractor.py
   - Mock ring buffer get_segments to return test file list
   - Verify ffmpeg concat command is correct
   - Verify partial webcam coverage returns None (not crash)
   - Verify GameReplay overlap detection
   - Verify FAILED status on extraction error

Run tests. Commit: "feat(workers): clip extraction worker with LISTEN/NOTIFY"
```

---

## Prompt 14 of 29 — Stitch Worker (Stage 2: STITCHING) — Tier-Aware Layouts

**What:** Takes extracted TV + webcam clips and composites them with tier-specific layouts using ffmpeg filter_complex. Quick Sync h264_qsv encode with libx264 fallback.
**Why now:** Second stage of the pipeline.
**Builds on:** Prompt 13 (extracted clips).
**Tests:** Unit test verifying correct ffmpeg filter for each tier.

```text
Read docs/SPEC.md §11 (Per-Tier Recipes — STITCH column for each tier).
Read docs/REACTION-MODEL-SPEC.md §11 (Per-Tier Layout Recipes).

1. Create services/video-pipeline/workers/stitcher.py:

   class StitchWorker:
       """Applies tier-specific layouts to extracted clips."""

       async def process(self, job: dict):
           tier = job["tier"]
           if not job.get("webcamClipPath"):
               # No webcam — just copy TV clip as stitched
               await self._copy_as_stitched(job)
               return

           if tier == "MICRO":
               await self._stitch_micro(job)
           elif tier == "STANDARD":
               await self._stitch_standard(job)
           elif tier == "BIG":
               await self._stitch_big(job)

       async def _stitch_micro(self, job):
           """Small PiP (240x135) bottom-right. Omit PiP if face emotion < 0.3."""
           # Check peak face emotion from FaceSnapshot
           snapshots = await self._get_face_snapshots(job)
           peak_emotion = max((s["emotionScore"] for s in snapshots), default=0)

           if peak_emotion < 0.3:
               # TV only, no PiP
               await self._copy_as_stitched(job)
           else:
               # Small PiP
               filter_complex = (
                   "[1:v]scale=240:135[wc];"
                   "[0:v][wc]overlay=W-w-12:H-h-12[out]"
               )
               await self._encode(job, filter_complex)

       async def _stitch_standard(self, job):
           """PiP 320x180 bottom-right."""
           filter_complex = (
               "[1:v]scale=320:180[wc];"
               "[0:v][wc]overlay=W-w-16:H-h-16[out]"
           )
           await self._encode(job, filter_complex)

       async def _stitch_big(self, job):
           """Alternating cuts: TV full → webcam face → TV → webcam zoom.
              Complex filter with timeline editing."""
           # See REACTION-MODEL-SPEC §11.3 for the full layout
           # This requires multiple ffmpeg segments stitched together
           ...

       async def _encode(self, job, filter_complex):
           output = f"/var/lounge/replays/session_{job['sessionId']}/stitched_{job['id']}.mp4"
           cmd = [
               "ffmpeg", "-y",
               "-i", job["tvClipPath"],
               "-i", job["webcamClipPath"],
               "-filter_complex", filter_complex,
               "-map", "[out]", "-map", "0:a",
               "-c:v", "h264_qsv", "-preset", "fast",  # Quick Sync
               output
           ]
           result = await asyncio.create_subprocess_exec(*cmd)
           if result.returncode != 0:
               # Fallback to libx264
               cmd[cmd.index("h264_qsv")] = "libx264"
               await asyncio.create_subprocess_exec(*cmd)

           # Handle DUAL_BEAT: append FIFA replay if present
           if job.get("replayTreatment") in ("DUAL_BEAT",) and job.get("gameReplayPath"):
               await self._append_replay(output, job)

           await api_client.patch_clip_job(job["id"], {
               "status": "ENHANCING",
               "stitchedPath": output,
           })

2. Wire into the extraction pipeline: when extractor sets status=STITCHING,
   the stitch worker picks it up.

3. Write test: services/video-pipeline/tests/test_stitch_worker.py
   - Test MICRO: PiP omitted when emotion < 0.3
   - Test MICRO: small PiP when emotion >= 0.3
   - Test STANDARD: 320x180 PiP
   - Test BIG: alternating cuts filter
   - Test Quick Sync fallback to libx264
   - Test DUAL_BEAT appends replay

Run tests. Commit: "feat(workers): tier-aware stitch worker with Quick Sync fallback"
```

---

## Prompt 15 of 29 — Caption Library and Selection Logic

**What:** Load the Sheng/Swahili caption library from JSON, implement the context-aware selection algorithm, and create the emotion stinger overlay system.
**Why now:** The enhancer (Prompt 16) needs captions and stingers.
**Builds on:** Prompt 2 (schema), Prompt 4 (face snapshot API).
**Tests:** Unit tests for selection algorithm, fallback chain, context overrides.

```text
Read docs/SPEC.md §12 (Caption Library) — the entire section.
Read docs/REACTION-MODEL-SPEC.md §9 (Caption System) — all subsections.

1. Create services/video-pipeline/captions/library.py:

   import json, random

   class CaptionLibrary:
       def __init__(self, path="/opt/lounge/captions.json"):
           with open(path) as f:
               self.captions = json.load(f)

       def get_caption(self, context: str, emotion: str, match_ctx=None) -> str:
           """Select caption per SPEC §12 selection algorithm."""
           # Emotion transition overrides
           if context.startswith("emotion_transition_"):
               options = self.captions.get(context, {}).get(emotion)
               if options:
                   return random.choice(options)

           # Match-context overrides for goals
           if match_ctx and context == "peak_GOAL_CANDIDATE":
               diff = abs(match_ctx.get("homeScore", 0) - match_ctx.get("awayScore", 0))
               minute = match_ctx.get("matchMinute", 0)
               if diff == 0 and minute >= 8:
                   return random.choice([
                       "LAST MINUTE EQUALISER", "HE'S DONE IT",
                       "CHAOS IN INJURY TIME", "GAME. CHANGED."
                   ])
               if diff >= 3:
                   return random.choice([
                       "THE COMEBACK IS NOT ON", "MERCY RULE WHEN?",
                       "SEND HELP", "IT'S GETTING EMBARRASSING"
                   ])

           # Standard lookup: exact → emotion fallback → universal
           options = self.captions.get(context, {}).get(emotion)
           if not options:
               options = self.captions.get(context, {}).get("neutral")
           if not options:
               options = ["..."]
           return random.choice(options)

       def get_game_state_text(self, match_ctx: dict) -> str:
           """Layer 1: score + minute. Always present."""
           minute = match_ctx.get("matchMinute", "")
           home = match_ctx.get("homeScore", 0)
           away = match_ctx.get("awayScore", 0)
           return f"{minute}' — {home}-{away}"

2. Create the seed caption file: services/video-pipeline/captions/captions.json
   Copy the JSON from SPEC.md §12 (40 seed entries).

3. Create services/video-pipeline/captions/stingers.py:
   Maps FER emotion → stinger PNG path (per SPEC §12 Stinger Set).

   STINGER_MAP = {
       "happy": "/opt/lounge/stingers/joy.png",
       "surprise": "/opt/lounge/stingers/surprise.png",
       "anger": "/opt/lounge/stingers/anger.png",
       "sadness": "/opt/lounge/stingers/sadness.png",
       "fear": "/opt/lounge/stingers/fear.png",
       "neutral": "/opt/lounge/stingers/neutral.png",
   }

   def get_stinger_path(emotion: str) -> str | None:
       return STINGER_MAP.get(emotion)

4. Create placeholder stinger PNGs (80x80, simple colored squares for now)
   in services/video-pipeline/captions/stingers/ for testing.

5. Write test: services/video-pipeline/tests/test_captions.py
   - Test exact context+emotion match
   - Test emotion fallback to neutral
   - Test universal fallback to "..."
   - Test match-context override (late equaliser, 3+ goal diff)
   - Test emotion transition context
   - Test get_game_state_text formatting
   - Test stinger map returns correct path

Run tests. Commit: "feat(captions): Sheng caption library + emotion stinger system"
```

---

## Prompt 16 of 29 — AI Enhancer Worker (Stage 3: ENHANCING) — Tier-Aware Effects

**What:** The effects pipeline. Reads FaceSnapshot data, applies tier-specific effects (speed ramp, freeze-frame, zoom punch, screen shake, color grade, captions, stingers) via ffmpeg.
**Why now:** Final processing stage before clips are ready.
**Builds on:** Prompts 14 (stitched clips), 15 (captions), 8 (FaceSnapshot data).
**Tests:** Unit tests for each effect's ffmpeg filter generation; tier routing.

```text
Read docs/SPEC.md §11 (Per-Tier Recipes — ENHANCE column for each tier).
Read docs/REACTION-MODEL-SPEC.md §7 (Per-Tier Recipes), §10 (Video Effects Reference).

1. Create services/video-pipeline/workers/enhancer.py:

   class EnhancerWorker:
       """Applies tier-specific AI effects to stitched clips."""

       def __init__(self):
           self.caption_lib = CaptionLibrary()

       async def process(self, job: dict):
           tier = job["tier"]
           if tier == "MICRO":
               await self._enhance_micro(job)
           elif tier == "STANDARD":
               await self._enhance_standard(job)
           elif tier == "BIG":
               await self._enhance_big(job)

       async def _enhance_micro(self, job):
           """Game state caption only. No effects."""
           match_ctx = await self._get_match_state(job)
           game_text = self.caption_lib.get_game_state_text(match_ctx)

           filter_chain = self._game_state_overlay(game_text)
           await self._encode_enhanced(job, filter_chain)

       async def _enhance_standard(self, job):
           """Speed ramp + zoom punch + Sheng caption + saturation boost."""
           snapshots = await self._get_face_snapshots(job)
           match_ctx = await self._get_match_state(job)
           peak_time = self._find_peak_emotion_time(snapshots)
           peak_emotion = self._get_peak_emotion(snapshots)

           filters = []
           # Game state overlay (always)
           filters.append(self._game_state_overlay(
               self.caption_lib.get_game_state_text(match_ctx)))
           # Speed ramp at peak (SPEC §11 speed ramp)
           filters.append(self._speed_ramp_filter(peak_time, hold_seconds=2))
           # Zoom punch at peak
           filters.append(self._zoom_punch_filter(peak_time, snapshots))
           # Sheng caption at peak
           caption = self.caption_lib.get_caption(
               f"peak_{job['eventTypes'][0]}", peak_emotion, match_ctx)
           filters.append(self._caption_overlay(caption, peak_time))
           # Saturation +8%
           filters.append("eq=saturation=1.08")

           await self._encode_enhanced(job, ";".join(filters))

       async def _enhance_big(self, job):
           """Full treatment: speed ramp + freeze + shake + zoom + captions + stinger + color."""
           snapshots = await self._get_face_snapshots(job)
           match_ctx = await self._get_match_state(job)
           peak_time = self._find_peak_emotion_time(snapshots)
           peak_emotion = self._get_peak_emotion(snapshots)

           filters = []
           filters.append(self._game_state_overlay(
               self.caption_lib.get_game_state_text(match_ctx)))
           # Speed ramp (longer hold: 3-4s)
           filters.append(self._speed_ramp_filter(peak_time, hold_seconds=3))
           # Freeze-frame at peak
           filters.append(self._freeze_frame_filter(peak_time))
           # Screen shake on goal flash
           if "GOAL_CANDIDATE" in job.get("eventTypes", []):
               filters.append(self._screen_shake_filter(peak_time))
           # Sheng caption
           caption = self.caption_lib.get_caption(
               f"peak_{job['eventTypes'][0]}", peak_emotion, match_ctx)
           filters.append(self._caption_overlay(caption, peak_time, fontsize=68))
           # Emotion stinger
           stinger_path = get_stinger_path(peak_emotion)
           if stinger_path:
               filters.append(self._stinger_overlay(stinger_path, peak_time))
           # Color grade: contrast +12%, warm, vignette
           filters.append("eq=contrast=1.12:saturation=1.05")

           await self._encode_enhanced(job, ";".join(filters))

       def _speed_ramp_filter(self, peak_time, hold_seconds=2) -> str:
           """setpts with piecewise expression. See SPEC §11."""
           ramp_start = peak_time - 0.5
           ramp_end = peak_time + hold_seconds
           return f"setpts='...'"  # full expression from SPEC

       def _freeze_frame_filter(self, peak_time) -> str:
           return f"tpad=stop_duration=1.2:stop_mode=clone"

       def _screen_shake_filter(self, peak_time) -> str:
           return "crop=iw-20:ih-20:10+8*sin(t*40):10+6*cos(t*35)"

       # ... other filter builders ...

       async def _encode_enhanced(self, job, filter_chain):
           output = f"/var/lounge/replays/session_{job['sessionId']}/enhanced_{job['id']}.mp4"
           cmd = ["ffmpeg", "-y", "-i", job["stitchedPath"],
                  "-vf", filter_chain,
                  "-c:v", "h264_qsv", "-preset", "fast",
                  output]
           # ... run with libx264 fallback ...
           await api_client.patch_clip_job(job["id"], {
               "enhancedPath": output,
           })

           # Portrait crop (STANDARD + BIG only)
           if job["tier"] != "MICRO":
               portrait = await self._generate_portrait(output, job)
               await api_client.patch_clip_job(job["id"], {
                   "portraitPath": portrait,
                   "status": "READY",
               })
           else:
               await api_client.patch_clip_job(job["id"], {"status": "READY"})

2. Write test: services/video-pipeline/tests/test_enhancer.py
   - Test MICRO: only game state caption, no effects
   - Test STANDARD: speed ramp + zoom + caption + saturation
   - Test BIG: all effects including freeze, shake, stinger
   - Test portrait generation skipped for MICRO
   - Test speed ramp filter string is mathematically correct (2.0*PTS)
   - Test fallback to ENHANCE_FALLBACK on ffmpeg failure

Run tests. Commit: "feat(workers): tier-aware AI enhancer with speed ramp, zoom, captions"
```

---

## Prompt 17 of 29 — Highlight Reel Assembly

**What:** Once all ClipJobs for a session are READY, assemble the highlight reel with narrative arc ordering, "Moment of the Match" promotion, shootout grouping, and winner/loser end card.
**Why now:** Final production step before customer delivery.
**Builds on:** Prompt 16 (enhanced clips), Prompt 15 (captions).
**Tests:** Unit test for clip ordering algorithm; integration test for reel structure.

```text
Read docs/SPEC.md §13 (Highlight Reel Assembly) — the entire section.
Read docs/REACTION-MODEL-SPEC.md §12 (Highlight Reel Structure).

1. Create services/video-pipeline/workers/reel_assembler.py:

   class ReelAssembler:
       """Assembles the highlight reel from processed ClipJobs."""

       async def assemble(self, session_id: int):
           # 1. Get all READY clips for this session
           clips = await api_client.get(
               f"/api/pipeline/clip-jobs?sessionId={session_id}&status=READY"
           )
           if not clips:
               return  # No reel if zero clips

           # 2. Select clips for reel (SPEC §13 selection rules)
           selected = self._select_clips(clips)

           # 3. Order clips (narrative arc)
           ordered = self._order_clips(selected)

           # 4. Generate title cards via ffmpeg drawtext on black background
           session_info = await self._get_session_info(session_id)
           title_card = self._generate_title_card(session_info)

           # 5. Build concat list with transition cards
           concat_list = [title_card]
           for i, clip in enumerate(ordered):
               # Transition card (except for MICRO clips and shootout group clips)
               if clip.get("shootoutGroup"):
                   if i == 0 or ordered[i-1].get("shootoutGroup") != clip["shootoutGroup"]:
                       concat_list.append(self._generate_card("PENALTY SHOOTOUT", 1.5))
               elif clip["tier"] != "MICRO":
                   # "MOMENT OF THE MATCH" for highest importance
                   if clip == self._highest_importance(ordered):
                       concat_list.append(self._generate_card("MOMENT OF THE MATCH", 1.5))
                   else:
                       duration = 1.2 if clip["tier"] == "BIG" else 0.8
                       concat_list.append(self._generate_card(f"Moment {i+1}", duration))

               concat_list.append(clip["enhancedPath"])

           # 6. End card (winner/loser/draw)
           end_card = await self._generate_end_card(session_id)
           concat_list.append(end_card)

           # 7. QR code frame + branding
           concat_list.append(self._generate_qr_frame(session_info["authCode"]))
           concat_list.append(self._generate_branding_card())

           # 8. Concat everything
           landscape = f"/var/lounge/replays/session_{session_id}/highlight_reel_landscape.mp4"
           portrait = f"/var/lounge/replays/session_{session_id}/highlight_reel_portrait.mp4"
           await self._concat(concat_list, landscape)
           await self._generate_portrait_reel(landscape, portrait)

           # 9. Emit reel ready event
           await api_client.post(f"/api/sessions/{session_id}/reel-ready", json={
               "landscapePath": landscape,
               "portraitPath": portrait,
           })

       def _select_clips(self, clips) -> list:
           """SPEC §13 selection: all BIG, all STANDARD, MICRO only if < 5 total."""
           ...

       def _order_clips(self, clips) -> list:
           """Narrative arc: opener (2nd highest) → middle (chrono) → climax (highest)."""
           ...

2. Write test: services/video-pipeline/tests/test_reel_assembler.py
   - Test clip selection: MICRO excluded when total > 5
   - Test narrative arc ordering: 2nd highest opens, highest closes
   - Test shootout clips stay grouped and chronological
   - Test "Moment of the Match" card inserted before highest importance
   - Test end card: winner gets slow-mo joy, loser gets shorter neutral shot
   - Test empty clips → no reel generated

Run tests. Commit: "feat(workers): highlight reel assembly with narrative arc"
```

---

## Prompt 18 of 29 — Worker Pipeline Coordinator

**What:** Wire extractor → stitcher → enhancer → reel assembler into a continuous pipeline. Each stage triggers the next. Handle fallbacks.
**Why now:** Individual workers exist; now connect them into a flowing pipeline.
**Builds on:** Prompts 13-17 (all workers).
**Tests:** Integration test: mock clip through all stages to READY.

```text
Read docs/SPEC.md §10 (Clip Processing Queue — failure handling section).

1. Create services/video-pipeline/workers/pipeline.py:

   class ClipPipeline:
       """Coordinates the clip processing pipeline."""

       def __init__(self):
           self.extractor = ClipExtractor()
           self.stitcher = StitchWorker()
           self.enhancer = EnhancerWorker()
           self.reel_assembler = ReelAssembler()

       async def start(self):
           """Start listening for ClipJobs."""
           await self.extractor.start()  # Listens via NOTIFY

       async def process_job(self, job_id: int):
           """Process a single job through all stages."""
           job = await api_client.get_clip_job(job_id)

           # Stage 1: Extract
           if job["status"] == "PENDING":
               await self.extractor.process(job)
               job = await api_client.get_clip_job(job_id)

           # Stage 2: Stitch
           if job["status"] == "STITCHING":
               settings = await get_settings()
               if settings.get("stage2Enabled", True):
                   try:
                       await self.stitcher.process(job)
                   except Exception:
                       await api_client.patch_clip_job(job_id, {"status": "STITCH_FALLBACK"})
               job = await api_client.get_clip_job(job_id)

           # Stage 3: Enhance
           if job["status"] in ("ENHANCING", "STITCH_FALLBACK"):
               settings = await get_settings()
               if settings.get("stage3Enabled", True):
                   try:
                       await self.enhancer.process(job)
                   except Exception:
                       await api_client.patch_clip_job(job_id, {"status": "ENHANCE_FALLBACK"})
                       # Serve stitched clip as-is
                       await api_client.patch_clip_job(job_id, {
                           "enhancedPath": job.get("stitchedPath"),
                           "status": "READY"
                       })

           # Check if all clips for this session are done → assemble reel
           await self._check_and_assemble_reel(job["sessionId"])

       async def _check_and_assemble_reel(self, session_id):
           clips = await api_client.get(f"/api/pipeline/clip-jobs?sessionId={session_id}")
           all_ready = all(c["status"] in ("READY", "FAILED", "STITCH_FALLBACK", "ENHANCE_FALLBACK")
                          for c in clips)
           ready_count = sum(1 for c in clips if c["status"] == "READY")
           if all_ready and ready_count > 0:
               await self.reel_assembler.assemble(session_id)

2. Wire into main.py: start the pipeline on service boot.

3. Write test: services/video-pipeline/tests/test_pipeline.py
   - Mock all workers
   - Job flows PENDING → EXTRACTING → STITCHING → ENHANCING → READY
   - Stage 2 disabled: PENDING → EXTRACTING → ENHANCING → READY (skip stitch)
   - Stage 3 disabled: PENDING → EXTRACTING → STITCHING → READY
   - Stitch failure: falls back to STITCH_FALLBACK, continues to enhance
   - Enhance failure: falls back to ENHANCE_FALLBACK, serves stitched clip
   - Reel assembled when all clips READY

Run tests. Commit: "feat(workers): clip pipeline coordinator with graceful fallbacks"
```

---

&nbsp;

---

# PHASE E — Customer-Facing Updates (Prompts 19-22)

*Replay PWA, tablet UX, and delivery.*

---

## Prompt 19 of 29 — Replay API: authCode-Keyed Routes

**What:** Update the existing replay API routes to serve clips by authCode (not sessionId), include tier/importance in response, and return 410 Gone for expired sessions.
**Why now:** The PWA needs these routes to display clips.
**Builds on:** Prompt 2 (Session.purgedAt), Prompt 4 (ClipJob fields).
**Tests:** API tests for authCode lookup, 410 Gone, clip response shape.

```text
Read docs/SPEC.md §14 (Clip Delivery — PWA section).

1. Update apps/api/src/routes/replays.ts:

   GET /api/replays/:authCode
     - Lookup session by authCode
     - If session.purgedAt is set → 410 Gone with message "Your highlights have expired"
     - Otherwise return:
       {
         sessionId, authCode, stationId, startTime, endTime,
         totalClips: count of all ClipJobs,
         readyClips: count of READY ClipJobs,
         reelReady: boolean,
         reelLandscapePath, reelPortraitPath,
         clips: [
           { id, status, tier, importanceScore, dominantEmotion,
             enhancedPath, portraitPath, eventTypes }
         ]
       }
     - MICRO clips: include in clips array but omit portraitPath (reel-only)

   GET /api/replays/:authCode/clips/:clipId/download?format=landscape|portrait
     - Serve the file. Portrait not available for MICRO clips.

   GET /api/replays/:authCode/reel?format=landscape|portrait
     - Serve the highlight reel file.

2. Add WebSocket events:
   - replay:clip_ready — sent when individual clip reaches READY
   - replay:all_ready — sent when all clips for session are READY
   - replay:reel_ready — sent when reel is assembled

3. Write tests for each endpoint + 410 Gone + missing authCode.

Run tests. Commit: "feat(api): authCode-keyed replay routes with 410 Gone"
```

---

## Prompt 20 of 29 — PWA Updates: Progress Bar, Tier Display, Portrait Downloads

**What:** Update the PWA to show live processing progress, tier badges, and portrait download buttons.
**Why now:** Customer-facing delivery surface.
**Builds on:** Prompt 19 (replay API).
**Tests:** Component tests for progress bar, download buttons.

```text
Read docs/SPEC.md §14 (Clip Delivery — PWA).
Read the existing apps/pwa/ code before making changes.

1. Update the PWA replay page (apps/pwa/):
   - Show progress bar: "3 of 5 clips ready" with live updates via WebSocket
   - Each clip card shows tier badge (BIG = gold, STANDARD = silver, MICRO = grey)
   - STANDARD and BIG clips: landscape + portrait download buttons
   - MICRO clips: shown in list but marked "Included in reel only" (no download)
   - Highlight reel section at top: "Download Highlight Reel" landscape + portrait
   - Reel shows "Processing..." until replay:reel_ready received
   - Expired sessions: friendly "Your highlights have expired" page
   - Share hint for WhatsApp / TikTok below each portrait download

2. Subscribe to WebSocket events:
   - replay:clip_ready → update clip status in list
   - replay:all_ready → show "All clips ready!" state
   - replay:reel_ready → show reel download buttons

3. Write component tests (or manual test checklist).

Run tests. Commit: "feat(pwa): live progress, tier badges, portrait downloads"
```

---

## Prompt 21 of 29 — Tablet UX: Moment Counter and QR Code

**What:** Update the tablet app to show a "moments captured" live counter during sessions and a QR code at session end.
**Why now:** Customer-facing notification surface.
**Builds on:** Prompt 19 (WebSocket events).
**Tests:** Component test for counter increment.

```text
Read docs/SPEC.md §20 (Tablet UX Rules). No clip previews on tablet.

1. Update apps/tablet/:
   - During active session: show "X moments captured" counter
     Incremented on each replay:clip_ready event for this station
   - On session end: show "Your highlights are ready!" with QR code
     QR code links to: http://<lounge-ip>:3003/?auth={authCode}
   - No clip thumbnails, no clip playback on tablet — just the counter and QR
   - Use qrcode library (already in package.json or add it) to generate QR

2. Subscribe to WebSocket events:
   - replay:clip_ready → increment counter
   - replay:reel_ready → show QR code

3. Manual test: start session → tablet shows counter → end session → QR shows.

Commit: "feat(tablet): moment counter and QR code display"
```

---

## Prompt 22 of 29 — Replay File Serving and Static Assets

**What:** Configure the Express API to serve clip and reel files from /var/lounge/replays/ as static assets. Serve stinger PNGs and caption JSON.
**Why now:** PWA download buttons need actual file serving.
**Builds on:** Prompt 19 (replay routes).
**Tests:** Test that a file in the replay directory is served correctly.

```text
1. In apps/api/src/index.ts, add static file serving:
   app.use('/replays', express.static('/var/lounge/replays'))

   Or serve files through the download route with Content-Disposition headers.

2. Ensure /opt/lounge/captions.json is a symlink or copy of the caption library.
   Ensure /opt/lounge/stingers/ contains the stinger PNGs.

3. Write test: request a known test file from /replays/ path.

Commit: "feat(api): static file serving for replay clips and reel"
```

---

&nbsp;

---

# PHASE F — Reliability and Operations (Prompts 23-26)

*Health monitoring, systemd, UPS, cleanup.*

---

## Prompt 23 of 29 — Health Endpoints

**What:** Two health endpoints: `/api/system/health` (hardware) and `/api/system/pipeline-health` (pipeline status).
**Builds on:** Prompt 2 (ClipJob schema), Prompt 4 (pipeline API).
**Tests:** API tests for both endpoints.

```text
Read docs/SPEC.md §16 (Reliability and Operations) and the health endpoints in §6.

1. Update apps/api/src/routes/system.ts:

   GET /api/system/health → { cpuTemp, nvmeSmart, diskFree, services: [...], warning }
   GET /api/system/pipeline-health → { clipJobs: {pending, extracting, ...}, gameReplays, ringBufferStats }

2. CPU temp: read /sys/class/thermal/thermal_zone0/temp
   NVMe SMART: parse smartctl -a /dev/nvme0n1
   Disk free: parse df output
   Services: check systemd unit status

3. If cpuTemp > Settings.alertTempCelsius → warning flag + WebSocket system:temperature_warning

4. Write tests with mocked system calls.

Commit: "feat(api): system health and pipeline health endpoints"
```

---

## Prompt 24 of 29 — systemd Services, Watchdog, and UPS Shutdown

**What:** Create systemd service files for all services. Add watchdog keepalives. Create UPS shutdown script.
**Builds on:** Prompt 12 (session manager), Prompt 18 (pipeline coordinator).
**Tests:** Verify service files are syntactically valid.

```text
Read docs/SPEC.md §16 (Reliability and Operations) — systemd, watchdog, UPS sections.

1. Create systemd service files in deploy/systemd/:
   - neo-lounge-api.service (Node.js API)
   - neo-lounge-pipeline.service (Python video pipeline)
   - capture-tv@.service (template, one per station)
   - capture-webcam@.service (template, one per station)
   - analyze-tv@.service (template, one per station)
   - audio-detect@.service (template, one per station)
   - neo-lounge-kiosk.service
   - neo-lounge-tablet.service
   - neo-lounge-dashboard.service
   - neo-lounge-pwa.service

   Each service:
   - WatchdogSec=30 where applicable
   - Restart=always, RestartSec=2
   - After=postgresql.service

2. Add sdnotify keepalives to Python workers:
   import sdnotify
   n = sdnotify.SystemdNotifier()
   # In main loop:
   n.notify("WATCHDOG=1")

3. Create deploy/scripts/lounge-shutdown.sh:
   - SIGTERM all ffmpeg processes
   - CHECKPOINT PostgreSQL
   - Sync filesystem
   - Power off

4. Create deploy/scripts/temp_monitor.sh:
   - Read CPU temp every 5 minutes
   - If 3 consecutive readings > alertTempCelsius → send SMS via Africa's Talking
   - Emit system:temperature_warning via API

5. Verify: systemd-analyze verify deploy/systemd/*.service

Commit: "feat(deploy): systemd services, watchdog, UPS shutdown, temp monitor"
```

---

## Prompt 25 of 29 — Tuya HDMI Sync Box Integration

**What:** Control the Tuya HDMI Sync Box via Tuya Local API (tinytuya) to switch LED modes: HDMI sync during gameplay, static ambient color during idle/screensaver, off when station inactive.
**Why now:** Session start/end already triggers ADB and capture services. This adds the LED sync box control alongside those events.
**Builds on:** Prompt 12 (session lifecycle wiring), Prompt 3 (settings helper).
**Tests:** Unit tests with mocked tinytuya device; verify mode transitions.

```text
Read docs/SPEC.md §2 (Tuya HDMI Sync Box section) and §17 (User Journey — session start/end LED control).

The Tuya HDMI Sync Box sits in the signal chain: Splitter → Sync Box (reads HDMI for LEDs, passthrough) → Capture Card.
It is controlled over local WiFi using the tinytuya Python library (Tuya Local API).
DPs: DP 20 (power on/off), DP 21 (mode: "hdmi" for gameplay sync, "colour" for static ambient), DP 24 (HSV color value for colour mode).

1. Add tinytuya to services/video-pipeline/requirements.txt.

2. Create services/video-pipeline/hardware/tuya_sync_box.py:

   import tinytuya

   class TuyaSyncBox:
       """Controls Tuya HDMI Sync Box LED modes via Tuya Local API."""

       def __init__(self, station_id: int, device_id: str, local_key: str, ip: str):
           self.station_id = station_id
           self.device = tinytuya.BulbDevice(device_id, ip, local_key)
           self.device.set_version(3.3)

       async def set_hdmi_sync(self):
           """HDMI sync mode — LEDs follow gameplay colors."""
           self.device.set_value(20, True)   # Power on
           self.device.set_value(21, "hdmi") # HDMI sync mode

       async def set_ambient_color(self, hsv: str = "003c03e803e8"):
           """Static ambient color mode — used during idle/screensaver.
           Default: warm orange (HSV: h=60, s=1000, v=1000 in Tuya format)."""
           self.device.set_value(20, True)
           self.device.set_value(21, "colour")
           self.device.set_value(24, hsv)

       async def set_off(self):
           """Turn off sync box LEDs."""
           self.device.set_value(20, False)

3. Add to Station model or config:
   - tuyaDeviceId, tuyaLocalKey, tuyaIp per station (stored in Settings or station config)
   - ambientColor (default HSV string for idle mode)

4. Wire into session lifecycle (update Prompt 12 wiring):
   - Session start: call set_hdmi_sync() alongside ADB TV switch
   - Session end: call set_ambient_color() alongside ADB screensaver switch
   - Station inactive (no session for 30+ min): call set_off()

5. Add Settings kill-switch: tuyaSyncEnabled (default true).

6. Add USE_MOCK_TUYA fallback that logs mode changes without hardware.

7. Write test: services/video-pipeline/tests/test_tuya_sync_box.py
   - Mock tinytuya.BulbDevice
   - Verify set_hdmi_sync sets DP 20=True, DP 21="hdmi"
   - Verify set_ambient_color sets DP 20=True, DP 21="colour", DP 24=HSV
   - Verify set_off sets DP 20=False
   - Verify kill-switch skips all calls

Run tests. Commit: "feat(hardware): Tuya HDMI Sync Box control via tinytuya Local API"
```

---

## Prompt 26 of 29 — Storage Lifecycle: TTL Cleanup and FaceSnapshot Purge

**What:** Cleanup worker that runs every 5 minutes, deletes expired session data including FaceSnapshot rows.
**Builds on:** Prompt 2 (purgedAt field), Prompt 3 (settings helper).
**Tests:** Unit test verifying cleanup logic; integration test with expired session.

```text
Read docs/SPEC.md §15 (Storage Lifecycle) — the entire section.

1. Create services/video-pipeline/workers/cleanup.py (or update existing cleanup.py):

   async def cleanup_expired_sessions():
       """Runs every 5 minutes. Deletes session data older than replayTTLMinutes."""
       settings = await get_settings()
       ttl = settings.get("replayTTLMinutes", 60)

       # Find sessions where endTime + TTL < now AND purgedAt is NULL
       expired = await api_client.get(f"/api/sessions/expired?ttlMinutes={ttl}")

       for session in expired:
           session_id = session["id"]
           # Delete files
           shutil.rmtree(f"/var/lounge/replays/session_{session_id}", ignore_errors=True)
           shutil.rmtree(f"/var/lounge/webcam*/session_{session_id}", ignore_errors=True)

           # Delete DB rows via API
           await api_client.delete(f"/api/pipeline/face-snapshots?sessionId={session_id}")
           await api_client.delete(f"/api/pipeline/events?sessionId={session_id}")
           await api_client.delete(f"/api/pipeline/game-replays?sessionId={session_id}")

           # Null out file paths on ClipJobs (keep rows for history)
           await api_client.post(f"/api/pipeline/clip-jobs/purge?sessionId={session_id}")

           # Mark session as purged
           await api_client.patch(f"/api/sessions/{session_id}", json={"purgedAt": "now"})

2. Add corresponding API endpoints for bulk delete operations.

3. Add security camera archive migration (nightly rsync to USB HDD).

4. Write test:
   - Create session with endTime 2 hours ago
   - Run cleanup
   - Verify files deleted, DB rows cleaned, purgedAt set

Run tests. Commit: "feat(cleanup): TTL-based session cleanup with FaceSnapshot purge"
```

---

## Prompt 27 of 29 — NVMe Health Monitor and Security Archive

**What:** NVMe SMART monitoring (daily), security footage archive to USB HDD (nightly).
**Builds on:** Prompt 23 (health endpoints).
**Tests:** Unit test for SMART parsing; verify archive rsync command.

```text
Read docs/SPEC.md §16 (NVMe monitoring and security archive sections).

1. Create deploy/scripts/nvme_monitor.sh:
   - Run smartctl, check percentage_used and temperature
   - If percentage_used > 80% or temperature > 70°C → SMS alert
   - Log to systemd journal

2. Create deploy/scripts/security_archive.sh:
   - rsync yesterday's security footage to /mnt/archive/security/
   - Delete footage older than securityRetentionDays from archive
   - pg_dump database backup

3. Create systemd timers:
   - neo-lounge-nvme-check.timer (daily at 06:00)
   - neo-lounge-security-archive.timer (daily at 03:00)

4. Write test for SMART output parsing.

Commit: "feat(deploy): NVMe monitor, security archive, systemd timers"
```

---

&nbsp;

---

# PHASE G — Integration and Verification (Prompts 28-29)

*End-to-end testing and final wiring.*

---

## Prompt 28 of 29 — End-to-End Integration Test

**What:** Full pipeline test: start session → inject mock events → verify ClipJobs created with correct tiers → verify reel assembled → verify PWA serves clips → verify cleanup.
**Tests:** This IS the test.

```text
Read docs/SPEC.md §17 (User Journey) for the expected flow.

Create services/video-pipeline/tests/test_integration_e2e.py:

Scenario 1: Basic session with 3 events
  - Start session on station 1
  - Inject AUDIO_AI event at T=0 (crowd roar, confidence 0.7)
  - Inject GAME_ANALYZER event at T=10 (goal flash) → corroborated = BOTH
  - Inject AUDIO_AI event at T=60 (another crowd roar, confidence 0.5)
  - End session → MATCH_END injected
  - Verify: 3 ClipJobs created
  - Verify: first clip has source=BOTH, higher importance
  - Verify: tier assignment is correct
  - Verify: all clips reach READY (using mocks for ffmpeg)
  - Verify: reel assembled with narrative arc ordering
  - Verify: replay:all_ready and replay:reel_ready emitted

Scenario 2: DUAL_BEAT with FIFA replay
  - Start session
  - Inject goal event + GameReplay overlapping
  - Verify: ClipJob has replayTreatment=DUAL_BEAT for BIG tier

Scenario 3: Penalty shootout
  - Start session
  - Inject 5 GOAL_CANDIDATE events at minutes 91-95
  - Verify: MatchState.isShootout = true
  - Verify: all clips share same shootoutGroup

Scenario 4: Face-only trigger
  - Start session
  - Inject FaceSnapshot data with high emotion but no audio/visual event
  - Verify: FACE_ONLY PendingEvent created

Scenario 5: TTL cleanup
  - Create session with old endTime
  - Run cleanup worker
  - Verify: files deleted, FaceSnapshots purged, purgedAt set
  - Verify: GET /api/replays/:authCode returns 410 Gone

Scenario 6: Settings kill-switches
  - Set stage3Enabled=false
  - Process clip → verify it reaches READY without ENHANCING stage

Scenario 7: Graceful degradation
  - Simulate stitch failure → verify STITCH_FALLBACK
  - Simulate enhance failure → verify ENHANCE_FALLBACK

Run all scenarios. They must pass.

Commit: "test(e2e): full Stage 11 integration test — 7 scenarios"
```

---

## Prompt 29 of 29 — Final Wiring and Documentation

**What:** Connect everything end-to-end. Update STAGE-11-FEATURES.md. Update todo.md. Verify all tests pass.
**Tests:** Full test suite run.

```text
1. Verify all services start together:
   - Start PostgreSQL
   - Start API (npm run dev in apps/api)
   - Start pipeline (uvicorn in services/video-pipeline)
   - Start kiosk, tablet, dashboard, PWA

2. Verify WebSocket flow:
   - Start session via kiosk → pipeline starts capture
   - Events flow through detection → merger → clip processing → reel
   - Tablet shows moment counter
   - PWA shows progress and downloads work

3. Run full test suite:
   cd apps/api && npm test
   cd services/video-pipeline && pytest

4. Update docs/STAGE-11-FEATURES.md:
   - Replace "Station 4 only" with "all stations" for 120fps/slow-mo
   - Add reaction model features: importance scoring, tiers, DUAL_BEAT
   - Add FaceScorer, baseline calibration, emotion transitions
   - Update prompt-to-feature map

5. Update todo.md: mark all Stage 11 items as [x]

6. Final git commit:
   git add -A
   git commit -m "feat(stage11): complete enhanced video pipeline with reaction intelligence"
```

---

&nbsp;

---

# Summary: Prompt Dependency Graph

```
Phase A — Foundation
  1. System deps
  2. Schema (depends on 1)
  3. Settings helper (depends on 2)
  4. Pipeline API (depends on 2, 3)

Phase B — Capture
  5. TV ring buffer (depends on 1, 3)
  6. Webcam capture (depends on 5)
  7. Security cameras (depends on 5)

Phase C — Detection
  8. FaceScorer (depends on 1, 2, 4)
  9. YAMNet audio (depends on 1, 3, 4)
  10. Game analyzer (depends on 5, 4, 2)
  11. EventMerger (depends on 4, 8, 9, 10)
  12. Wire detection (depends on 5, 6, 8, 9, 10, 11)

Phase D — Processing
  13. Extractor (depends on 5, 6, 4)
  14. Stitcher (depends on 13)
  15. Caption library (depends on 2)
  16. Enhancer (depends on 14, 15, 8)
  17. Reel assembler (depends on 16)
  18. Pipeline coordinator (depends on 13, 14, 16, 17)

Phase E — Customer-facing
  19. Replay API (depends on 2, 18)
  20. PWA updates (depends on 19)
  21. Tablet UX (depends on 19)
  22. File serving (depends on 19)

Phase F — Operations
  23. Health endpoints (depends on 2)
  24. systemd + watchdog (depends on 12, 18)
  25. Tuya HDMI Sync Box (depends on 12, 3)
  26. TTL cleanup (depends on 2, 3)
  27. NVMe + archive (depends on 23)

Phase G — Integration
  28. E2E test (depends on everything)
  29. Final wiring (depends on 28)
```

---

*Total: 29 prompts across 7 phases. Each prompt is self-contained, builds on previous work, and ends with tests and a commit.*
