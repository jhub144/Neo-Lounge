# Neo Lounge — Full System Specification

> Last updated: April 2026
> Replaces: "PlayStation Lounge V3 Final Specification"

---

## 1. What Is This System?

A locally-hosted management and media production system for a PS5 gaming lounge in Nairobi, Kenya with 4 gaming stations. The entire system runs on a local area network (LAN). The only external internet traffic is M-Pesa payment requests and SMS alerts via Africa's Talking API.

The system handles:

**Session management**
- Station booking with timed sessions
- Payments (M-Pesa STK push + cash)
- Live countdown timers with auto-end
- Session transfer, extension, queue management
- Staff PIN authentication with full audit trail

**Hardware control**
- TV HDMI input switching via ADB over TCP/IP
- LED ambient lighting via Tuya local API

**Video and audio capture**
- Continuous capture of 4 TV streams into RAM ring buffers
- Continuous capture of webcam reaction feeds (Stage 2+)
- Continuous capture of 5 security cameras to NVMe
- Zero-transcode capture using ffmpeg -c copy throughout

**Replay production (phased)**
- Stage 1: AI-triggered TV highlight clips, available at match end
- Stage 2: Webcam reaction overlays stitched to TV clips
- Stage 3: AI face zoom, slow-motion, emotion-based captions, split reactions

**Game stream intelligence**
- Passive analysis of TV footage at 240p/2fps
- Corroborates audio events, detects FIFA onscreen replays, reads score/timer
- Auto-detects match end, red/yellow cards, penalty situations

**Delivery**
- QR code on tablet → local PWA → landscape + portrait MP4 downloads
- No internet required for clip delivery

**Security**
- 5 IP cameras continuous recording, event-triggered clip extraction
- Long-term archive to external USB drive

**Reliability**
- UPS graceful shutdown on power failure
- Cold-spare backup PC for hardware failure recovery
- Systemd watchdog on all services
- Temperature and NVMe health monitoring with SMS alerts

---

## 2. Hardware

### Primary PC (Single machine runs everything)

| Component | Spec | Notes |
|---|---|---|
| **PC** | Intel N100 mini PC (e.g. Beelink Mini S12 Pro) | Quick Sync Gen 12 — same video acceleration as 12th gen Core i5 |
| **RAM** | 16 GB DDR4-3200 | 8 GB minimum; 16 GB recommended for filesystem cache headroom |
| **NVMe** | 512 GB Gen 3 | Hot tier for all active session data |
| **OS** | Ubuntu 24.04 LTS | XFS filesystem, noatime mount option |
| **Average power** | ~12-18 W active, ~6 W idle | ~KES 215/month at KES 25/kWh |

### Cold Spare

Identical N100 mini PC kept on-site, powered off. In case of primary failure: remove NVMe from dead unit, insert into spare, boot. Recovery time ~20-40 minutes. Cost: ~KES 35k insurance against rare hardware failure.

NAS + hot standby is optional and only justified if lounge runs at near-capacity and 30-minute downtime is unacceptable. The cold spare approach is correct for launch.

### Supporting Hardware

| Component | Spec | Purpose |
|---|---|---|
| **Audio interface** | Behringer UMC404HD | 4 independent audio inputs, one per TV station |
| **PoE+ switch** | TP-Link TL-SG2210MP (8×2.5GbE, 150W PoE) | Powers cameras, connects everything |
| **UPS** | CyberPower/APC 1500VA pure sine | Graceful shutdown on power cut |
| **USB hub** | Powered 10-port USB 3.0 | Aggregates webcams (Stage 2+) |
| **USB archive drive** | 4 TB external USB HDD | Security camera long-term storage |
| **4× HDMI capture cards** | USB UVC H.264 capture | TV streams into PC |
| **3× webcams (Stage 2)** | 720p 60fps, UVC H.264 output | Reaction overlays |
| **1× webcam (Stage 3)** | 720p 120fps, UVC H.264 output | Slow-motion AI reactions |
| **5× IP cameras** | PoE, RTSP/H.265, 720p-1080p | Security recording |

### Storage Layout

```
Filesystem: XFS, mounted with noatime

/run/lounge/          ← tmpfs (RAM-backed, clears on reboot)
  tv1/ ... tv4/       ← 2-minute ring buffers for TV streams
                         (4 × 15 Mbps × 120s = ~225 MB total)

/var/lounge/          ← Local NVMe (hot tier)
  webcam1/ ... webcam4/  ← Session webcam segments (720p)
  sec/cam1/ ... cam5/    ← Security cam segments (7-day rolling)
  replays/               ← Generated clips (expires 1hr after session)
  db/                    ← PostgreSQL data directory

/mnt/archive/         ← USB HDD (cold tier)
  security/YYYY/MM/DD/   ← Security footage, migrated nightly
```

---

## 3. Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| **API** | Node.js + Express + TypeScript (port 3000) | |
| **Database** | PostgreSQL + Prisma ORM | LISTEN/NOTIFY for instant queue wake-up |
| **Kiosk** | Next.js + TypeScript + Tailwind (port 3001) | Staff admin interface |
| **Tablet** | Next.js + TypeScript + Tailwind (port 3002) | Per-station customer display |
| **PWA** | Next.js + TypeScript + Tailwind (port 3003) | Customer replay download |
| **Dashboard** | Next.js + TypeScript + Tailwind (port 3004) | Owner remote access |
| **Video pipeline** | Python + FastAPI (port 8000) | ffmpeg orchestration |
| **AI audio** | TensorFlow Lite + YAMNet quantized (3.7 MB) | Event detection, no GPU |
| **AI face** | OpenCV YuNet (374 KB, built into opencv-python-headless) | Stage 3 face detection |
| **AI emotion** | MobileNet FER model (~5 MB ONNX) | Stage 3 caption selection |
| **OCR** | Tesseract / custom digit templates | Game score/timer reading |
| **Real-time** | socket.io WebSockets | |
| **Remote access** | Tailscale | Owner dashboard |
| **Payments** | Africa's Talking API | M-Pesa + SMS |
| **SMS alerts** | Africa's Talking API | Temperature, hardware alerts |

---

## 4. Pricing

- Base rate: 300 KES per hour (configurable in Settings)
- All durations proportional: `Math.round(baseHourlyRate / 60 * durationMinutes)`
- Standard options: 5m=25, 10m=50, 20m=100, 30m=150, 40m=200, 60m=300 KES
- Custom: staff enters minutes, price auto-calculated
- Until Closing: minutes from now to closingTime, charged proportionally
- Extensions use the same formula

---

## 5. Data Models

### Station
- id, name, status (AVAILABLE/ACTIVE/PENDING/FAULT)
- currentSessionId, adbAddress, tuyaDeviceId, captureDevice
- webcamDevice: String (e.g. "/dev/video0") — Stage 2
- analysisWebcamDevice: String — the 120fps Stage 3 camera

### Session
- id, stationId, staffPin, startTime, endTime, durationMinutes
- remainingAtPowerLoss, status (ACTIVE/PAUSED/COMPLETED/POWER_INTERRUPTED)
- authCode (6-char unique, used for QR code replay access)

### Transaction
- id, sessionId, amount, method (CASH/MPESA)
- status (PENDING/COMPLETED/FAILED/TIMEOUT)
- mpesaReceipt, staffPin, createdAt

### Game
- id, sessionId, startTime, endTime
- endMethod (AI_DETECTED/MANUAL_BUTTON/SESSION_END)

### PendingEvent
- id, sessionId, stationId, gameId
- eventType: Enum (GOAL_CANDIDATE/PENALTY_MISS/RED_CARD/YELLOW_CARD/MATCH_END/SCORE_CHANGE)
- eventTimestamp: Float (unix epoch, from audio AI or game analyzer)
- source: Enum (AUDIO_AI/GAME_ANALYZER/BOTH) — BOTH = corroborated, highest confidence
- audioConfidence: Float
- matchMinute: Int (from OCR, nullable)
- homeScore: Int, awayScore: Int (from OCR at time of event, nullable)
- mergedWithEventId: Int (nullable — if this event was merged into a longer clip)
- processed: Boolean default false
- createdAt: DateTime

### ClipJob
- id, sessionId, stationId
- clipStart: Float, clipEnd: Float (unix epoch — the window to extract)
- eventTypes: String[] (all event types merged into this clip)
- tvClipPath: String (nullable — set when extracted)
- webcamClipPath: String (nullable — Stage 2+)
- gameReplayPath: String (nullable — if FIFA replay detected in window)
- stitchedPath: String (nullable — Stage 2 output)
- enhancedPath: String (nullable — Stage 3 output)
- portraitPath: String (nullable — portrait crop for sharing)
- status: Enum (PENDING/EXTRACTING/STITCHING/ENHANCING/DONE/FAILED)
- enqueued_at: DateTime (FIFO ordering key)
- priority: Int default 0 (for future manual override)
- errorMessage: String (nullable)

### ReplayClip
- id, gameId, sessionId (denormalized)
- clipJobId: Int FK to ClipJob
- filePath (landscape), portraitPath
- triggerType, triggerTimestamp, matchMinute, homeScore, awayScore
- titleCard: String (e.g. "GOAL AT 78' — 2-1")
- dominantEmotion: String (nullable — from FER)
- createdAt, expiresAt (1 hour after session ends)
- stitchedReelPath: String (final highlight reel, nullable)

### GameReplay (detected FIFA onscreen replays)
- id, stationId, sessionId
- replayStart: Float, replayEnd: Float (unix epoch)
- detectedAt: DateTime
- confidence: Float
- used: Boolean default false (true once extracted into a ClipJob)

### MatchState (rolling game state from OCR)
- id, stationId
- capturedAt: DateTime
- homeScore: Int, awayScore: Int
- matchMinute: Int
- isReplayShowing: Boolean
- rawOcrText: String (for debugging)

### SecurityEvent, SecurityClip, SecurityCamera
(unchanged from previous spec — see Section 7 of original)

### Staff
- id, name, pin (unique 4-digit), role (OWNER/STAFF), isActive

### Settings (singleton, id=1)
- baseHourlyRate: Int default 300
- openingTime, closingTime: String
- replayTTLMinutes: Int default 60
- powerSaveBrightness: Int default 50
- yamnetConfidenceThreshold: Float default 0.55
- tvRingBufferSeconds: Int default 120 (2-minute ring buffer)
- clipPreRollSeconds: Int default 10
- clipPostRollSeconds: Int default 25
- eventMergeWindowSeconds: Int default 25 (merge events within this gap)
- gameAnalysisEnabled: Boolean default true
- replayDetectionThreshold: Float default 0.80
- tensionAudioThreshold: Float default 0.40 (RMS ratio for tension detection)
- securityRetentionDays: Int default 14
- alertTempCelsius: Int default 80
- alertSmsNumber: String

---

## 6. API Endpoints

### Session Management (unchanged from V3)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | /api/health | None | Health check |
| GET | /api/stations | None | All stations with status |
| GET | /api/stations/:id | None | Station detail |
| PATCH | /api/stations/:id | Staff | Update status |
| POST | /api/sessions | Staff | Create session |
| GET | /api/sessions/:id | None | Session detail |
| PATCH | /api/sessions/:id/end | Staff | End session |
| PATCH | /api/sessions/:id/extend | Staff | Extend session |
| POST | /api/sessions/:id/transfer | Staff | Transfer to another station |
| POST | /api/transactions | Staff | Cash confirmation |
| POST | /api/payments/mpesa/initiate | Staff | STK push |
| POST | /api/payments/mpesa/callback | None | Webhook |
| POST | /api/games/:id/end | Staff | Manual game end |
| POST | /api/queue | Staff | Add to queue |
| DELETE | /api/queue/:id | Staff | Remove from queue |
| GET | /api/settings | None | Get settings |
| PATCH | /api/settings | Owner | Update settings |
| POST | /api/staff/login | None | PIN auth |
| POST | /api/system/power-down | Owner | Power save |
| POST | /api/system/power-restore | Owner | Restore |
| POST | /api/system/restart-service | Owner | Restart a service |

### Replay Endpoints (updated)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | /api/replays/:authCode | None | Get all clips for session (by QR auth code) |
| GET | /api/replays/:authCode/status | None | Processing status per clip (for progress bar) |
| GET | /api/replays/:authCode/reel | None | Final highlight reel (landscape) |
| GET | /api/replays/:authCode/reel/portrait | None | Portrait crop for WhatsApp |
| GET | /api/replays/:authCode/clip/:id | None | Individual clip (landscape) |
| GET | /api/replays/:authCode/clip/:id/portrait | None | Individual clip portrait |

### Game Intelligence Endpoints

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | /api/games/:id/state | Staff | Current score/minute/match state |
| GET | /api/games/:id/replays | Staff | FIFA onscreen replays detected |
| GET | /api/games/:id/events | Staff | All detected events with sources |

### Security Endpoints (unchanged)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | /api/security/cameras | Owner | Camera status |
| PATCH | /api/security/cameras/:id | None | Update online status (called by pipeline) |
| GET | /api/security/clips/:eventId | Owner | Clips for event |
| POST | /api/security/clips | None | Register new clip (called by pipeline) |
| DELETE | /api/security/clips/:id | Owner | Delete clip |
| GET | /api/events | Owner | Security event log |
| GET | /api/dashboard | Owner | Revenue, health, stats |

### System Health Endpoints

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | /api/system/health/temperature | Owner | Current CPU temperature |
| GET | /api/system/health/nvme | Owner | NVMe health (percentage used, unsafe shutdowns) |
| GET | /api/system/health/services | Owner | All systemd service states |
| GET | /api/system/health/disk | Owner | NVMe free space |

### WebSocket Events (socket.io)

| Event | Direction | Description |
|---|---|---|
| station:updated | Server → All | Station status change |
| session:tick | Server → Station | Timer tick |
| session:warning | Server → Station | 2-minute warning (shown on tablet screen only — no SMS to customer) |
| session:ended | Server → Station | Session complete (shown on tablet screen only) |
| game:ended | Server → Station | Game boundary |
| game:event_captured | Server → Station | New moment captured (counter++ on tablet) |
| game:state_updated | Server → Station | Score/minute from OCR |
| replay:clip_ready | Server → Station | One clip ready — tablet shows notification only, no preview |
| replay:all_ready | Server → Station | All clips done — tablet shows notification + QR code |
| replay:reel_ready | Server → Station | Full highlight reel assembled — tablet updates notification |
| payment:confirmed | Server → Kiosk | M-Pesa success |
| payment:timeout | Server → Kiosk | M-Pesa timeout |
| power:status | Server → All | Power mode change |
| queue:updated | Server → Kiosk | Queue change |
| system:temperature_warning | Server → Dashboard | Temp exceeded threshold |

---

## 7. Video Pipeline Architecture

### Core Principle

**Never decode video you do not need to modify.** All capture uses `ffmpeg -c copy` — raw encoded bytes from cameras are passed straight to disk or RAM. CPU/GPU usage during capture is ~2-3% per stream. Quick Sync (iGPU) is reserved for re-encoding only when creating final clips.

### Capture Services (systemd, one per stream, auto-restart)

#### TV Streams (×4) — Ring Buffer in RAM

```bash
# /etc/systemd/system/capture-tv@.service
ExecStart=/usr/bin/ffmpeg -hide_banner -loglevel warning \
  -rtsp_transport tcp -i rtsp://tv%i.local/stream \
  -c copy \
  -f segment \
  -segment_time 2 \
  -segment_format mpegts \
  -segment_wrap 60 \
  -reset_timestamps 1 \
  /run/lounge/tv%i/seg_%03d.ts

# 60 × 2-second segments = 2-minute rolling ring buffer
# /run/lounge/ is tmpfs (RAM) — auto-clears on reboot
# 4 streams × 15 Mbps × 120s = ~225 MB RAM total
```

#### Game Analysis Streams (×4) — Low-Resolution Passive Analysis

```bash
# /etc/systemd/system/analyze-tv@.service
ExecStart=/usr/bin/ffmpeg -hide_banner -loglevel warning \
  -rtsp_transport tcp -i rtsp://tv%i.local/stream \
  -vf scale=320:240 \
  -r 2 \
  -f rawvideo \
  pipe:1
# Piped to game_analyzer.py --station %i
# 320×240 at 2fps = ~10 Mbps across all 4 streams combined
# CPU cost: ~1-2% total
```

#### Webcam Streams (×4, Stage 2+) — Direct to NVMe

```bash
# /etc/systemd/system/capture-webcam@.service
# Webcams must support UVC H.264 output at 720p
# Station 1-3: 720p 60fps. Station 4: 720p 120fps (Stage 3 slow-mo cam)
ExecStart=/usr/bin/ffmpeg -hide_banner -loglevel warning \
  -f v4l2 -input_format h264 \
  -video_size 1280x720 -framerate 60 \   # (120 for cam 4)
  -i /dev/video%i \
  -c copy \
  -f segment \
  -segment_time 10 \
  -segment_format mpegts \
  -strftime 1 \
  /var/lounge/webcam%i/seg_%Y%m%d_%H%M%S.ts
```

#### Security Cameras (×5) — Direct to NVMe

```bash
ExecStart=/usr/bin/ffmpeg -hide_banner -loglevel warning \
  -rtsp_transport tcp -i rtsp://seccam%i.local/stream \
  -c copy \
  -f segment \
  -segment_time 300 \
  -segment_format mpegts \
  -strftime 1 \
  /var/lounge/sec/cam%i/seg_%Y%m%d_%H%M%S.ts
# 5-minute segments, migrated to USB HDD nightly
```

#### Audio Detection

```bash
# /etc/systemd/system/audio-detect@.service
# One instance per station, reads from Behringer UMC404HD channel N
ExecStart=/usr/bin/python3 /opt/lounge/yamnet_detector.py --station %i --channel %i
```

---

## 8. Game Stream Analysis

A lightweight Python service per station reads the 240p/2fps video pipe from ffmpeg and runs:

### What It Detects

| Signal | Method | Cost | Action |
|---|---|---|---|
| **FIFA onscreen replay** | Template matching on REPLAY indicator | ~1ms/frame | Record timestamps in GameReplay table |
| **Goal animation** | Template matching on goal screen flash | ~1ms/frame | Corroborate audio event |
| **Score and match minute** | OCR on cropped scoreboard region | ~5ms/frame | Update MatchState table |
| **Red/yellow card** | Color blob detection (known screen position) | ~1ms/frame | Insert PendingEvent |
| **Match end screen** | Template matching on fulltime overlay | ~1ms/frame | Trigger auto session end |
| **Tension (silence)** | RMS energy ratio (last 10s vs last 60s) | ~0.1ms | Lower audio AI threshold dynamically |

### Analysis Loop (per station)

```python
# game_analyzer.py
for frame in video_pipe:
    score = read_scoreboard(frame)          # OCR, every frame
    replay = detect_replay(frame)          # template match
    card = detect_card(frame)              # color blob
    end = detect_match_end(frame)          # template match

    if score != last_score:
        db.update_match_state(station, score)
        if score != last_score:
            emit_event("SCORE_CHANGE", source="GAME_ANALYZER")

    if replay.started:
        db.insert_game_replay(station, start=now)
    if replay.ended:
        db.update_game_replay(end=now)

    threshold = compute_audio_threshold(score, minute)
    audio_detector.set_threshold(station, threshold)
```

### Dynamic Audio Sensitivity

The audio AI detection threshold adjusts based on game state:

```python
def compute_audio_threshold(match_context) -> float:
    base = 0.55
    diff = abs(match_context.home - match_context.away)
    minute = match_context.minute

    if diff == 0 and minute >= 8:    return base - 0.15  # draw, last 2 min
    if diff == 1 and minute >= 7:    return base - 0.10  # one goal game, late
    return base
```

More sensitive in tense moments. Fewer false positives during blowouts.

### Event Corroboration

An event is classified by source:

| Source | Meaning |
|---|---|
| AUDIO_AI only | Crowd roar detected, no game confirmation |
| GAME_ANALYZER only | Score changed, no audio trigger |
| BOTH | Highest confidence — used for primary clip trigger |

If source is AUDIO_AI only and confidence < 0.65, flag as low-confidence. Still create a clip but mark in metadata.

---

## 9. Event Handling and Clip Extraction

### EventMerger

Events within the same post-roll window are merged into one extended clip rather than creating multiple separate clips. This preserves natural drama arcs (foul → penalty miss → goal becomes one clip, not three).

```python
class EventMerger:
    pre_roll = 10         # seconds before event
    post_roll = 25        # seconds after event
    merge_window = 25     # merge if next event starts before current post-roll ends

    def on_event(self, timestamp, event_type, station_id):
        if self.has_active_window(station_id):
            if timestamp < self.active_end[station_id]:
                # Extend the current clip
                self.active_end[station_id] = timestamp + self.post_roll
                self.event_types[station_id].append(event_type)
                return  # do not create new clip job yet
            else:
                # Previous window is complete — flush it
                self.flush(station_id)

        # Start a new window
        self.active_start[station_id] = timestamp - self.pre_roll
        self.active_end[station_id] = timestamp + self.post_roll
        self.event_types[station_id] = [event_type]

    def on_timer_tick(self):
        # Called every second
        for station_id in self.active_windows:
            if time.time() > self.active_end[station_id]:
                self.flush(station_id)

    def flush(self, station_id):
        # Insert ClipJob into DB, trigger NOTIFY
        db.insert_clip_job(
            station_id=station_id,
            clip_start=self.active_start[station_id],
            clip_end=self.active_end[station_id],
            event_types=self.event_types[station_id],
        )
        db.execute("NOTIFY new_clip_job")
        self.clear(station_id)
```

### Edge Cases

- **Goal in first 10 seconds:** `pre_roll = min(10, seconds_since_match_start)` — use whatever ring buffer has.
- **Goal in last 5 seconds:** Post-roll extends 25 seconds after match timer hits zero. Webcam keeps recording until the window closes.
- **Post-match reaction:** When session ends, a final event of type MATCH_END is added with `clip_start = session_end_time`, `clip_end = session_end_time + 60`. Webcam continues recording these 60 seconds.
- **Audio bleed between stations:** If same event timestamp fires on two adjacent stations within 2 seconds, keep both (each station gets its own clip) but log for monitoring.

---

## 10. Clip Processing Queue

### Queue Design

The ClipJob table IS the queue. No external queue software (Redis, RabbitMQ) is needed.

```sql
-- Worker claims next job atomically (no race conditions with multiple workers)
UPDATE clip_jobs
SET status = 'EXTRACTING', started_at = NOW()
WHERE id = (
    SELECT id FROM clip_jobs
    WHERE status = 'PENDING'
    ORDER BY enqueued_at ASC     -- FIFO: oldest job first
    LIMIT 1
    FOR UPDATE SKIP LOCKED
)
RETURNING *;
```

**PostgreSQL NOTIFY** wakes the worker the instant a job is inserted — no polling loop, zero latency.

```python
# Worker startup
await db.execute("LISTEN new_clip_job")

async for notification in db.listen("new_clip_job"):
    await process_next_job()
```

### Why FIFO?

Customers who finished their match earliest have been waiting longest. They get their replays first. Simple and fair.

### Worker Processes Clips During the Match

The worker starts processing each clip **as soon as its post-roll window closes** — not at match end. By the time a 10-minute match finishes, all clips except the final post-match reaction are already done.

Processing order per clip job:

```
1. EXTRACT    — ffmpeg -c copy (TV clip + webcam clip + game replay if detected)
2. STITCH     — ffmpeg filter_complex (webcam PiP overlay, Quick Sync encode) [Stage 2+]
3. ENHANCE    — AI face zoom + slow-mo + caption overlay [Stage 3]
4. PORTRAIT   — ffmpeg crop to 9:16 for WhatsApp sharing
5. VERIFY     — ffprobe checks duration > 5s, no corruption
6. NOTIFY     — socket.io replay:clip_ready to tablet
```

If any step fails, status → FAILED, error logged, tablet shows "clip unavailable" gracefully.

---

## 11. Replay Processing — By Stage

### Stage 1: TV Footage Only

**What it does:** Audio AI detects goal moments. TV clip extracted from ring buffer using `-c copy`. No webcams. No AI effects.

**Processing time per clip:** ~200ms  
**All clips ready after 10-min match:** ~2 seconds after last event post-roll closes  

**Outputs per clip:** `tv_clip_{n}.mp4`  
**Final reel:** All clips + title cards concatenated, `-c copy`, ~3 seconds

### Stage 2: + Webcam Reaction Overlays

**What it adds:** Webcam footage for the matching station is extracted and overlaid as a picture-in-picture on the TV clip. Quick Sync re-encodes the combined output.

**Processing time per clip:** ~4 seconds at 720p  
**All clips ready:** Processing happens during the match. By match end, only the last clip remains. Total wait: ~30 seconds after match end.

**ffmpeg filter (PiP overlay):**
```bash
ffmpeg \
  -i tv_clip.mp4 \
  -i webcam_clip.mp4 \
  -filter_complex \
    "[1:v]scale=320:180[wc]; \
     [0:v][wc]overlay=W-w-16:H-h-16[out]" \
  -map "[out]" -map 0:a \
  -c:v h264_qsv -preset fast \
  stitched_clip.mp4
```

Webcam appears bottom-right corner at 320×180px. TV footage remains full-screen.

### Stage 3: AI-Enhanced Reactions

**What it adds:** Face detection, emotion classification, dynamic zoom, slow-motion, comedic captions. Applied to the 120fps webcam feed. One webcam only (auto-selected as best face for that event).

**AI models used (all CPU, no GPU):**
- **YuNet** (374 KB, built into OpenCV) — face detection, ~3ms/frame at 720p
- **FER MobileNet** (~5 MB ONNX) — emotion classification on face crop, ~10ms/frame
- Both loaded at service startup, zero cold-start on first clip

**Processing time per clip at 720p:** ~8-12 seconds  
**All clips for a 10-min match (3 clips):** ~25-35 seconds after last event

**Processing sequence:**

```python
async def enhance_clip(job: ClipJob):
    # 1. Sample the 120fps webcam clip (every 5th frame = 24fps equivalent)
    frames = sample_frames(job.webcamClipPath, every_n=5)

    # 2. Detect faces in each sampled frame (YuNet)
    face_data = [detect_faces(f) for f in frames]

    # 3. Pick zoom target:
    #    - If 2 faces detected at peak → split-screen
    #    - If 1 face dominant → single zoom
    #    - If 0 faces → use full frame, no zoom
    zoom_mode = select_zoom_mode(face_data)

    # 4. Classify emotion at peak moment (FER on face crop)
    peak_face_crop = get_peak_face_crop(frames, face_data)
    emotion = classify_emotion(peak_face_crop)   # e.g. "surprised"

    # 5. Select captions from library
    pre_caption = get_caption("pre_event", emotion, job.matchContext)
    peak_caption = get_caption(f"peak_{job.primaryEventType}", emotion, job.matchContext)

    # 6. Build FFmpeg filter chain
    #    - zoompan toward face bbox
    #    - setpts=2.0*PTS for 2 seconds at peak (2× slow-mo using 120fps source)
    #    - drawtext for pre_caption then peak_caption
    filter_graph = build_filter(face_data, zoom_mode, pre_caption, peak_caption)

    # 7. Single FFmpeg encode (Quick Sync)
    await run_ffmpeg_encode(job.stitchedPath, filter_graph, job.enhancedPath)

    # 8. Portrait crop (9:16)
    await run_ffmpeg_portrait_crop(job.enhancedPath, job.portraitPath)

    # 9. Verify both outputs
    assert await verify_clip(job.enhancedPath)
    assert await verify_clip(job.portraitPath)
```

#### Split-Screen Mode (two faces)

Both faces zoomed simultaneously, placed side by side. Works best when reactions contrast — one celebrating, one devastated.

```bash
ffmpeg -i webcam_120fps.mp4 \
  -filter_complex "
    [0:v]crop={w1}:{h1}:{x1}:{y1},scale=640:720,setpts=2.0*PTS[left];
    [0:v]crop={w2}:{h2}:{x2}:{y2},scale=640:720,setpts=2.0*PTS[right];
    [left][right]hstack=inputs=2[split]
  " \
  -map "[split]" -c:v h264_qsv split_reaction.mp4
```

#### Single Zoom Mode (one dominant face)

```bash
ffmpeg -i webcam_120fps.mp4 \
  -filter_complex "
    [0:v]
    zoompan=z='1.5':x='{cx}-iw/2*zoom':y='{cy}-ih/2*zoom':d=1:s=1280x720,
    setpts=2.0*PTS
    [zoomed]
  " \
  -map "[zoomed]" -c:v h264_qsv single_zoom.mp4
```

#### Caption Overlay

```bash
# Fade in pre-event caption during pre-roll
# Bold peak caption appears at the slow-mo moment
-vf "drawtext=text='{pre_caption}':
       fontsize=52:fontcolor=white@0.8:
       fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:
       x=(w-text_w)/2:y=h-80:
       enable='between(t,2,8)',

     drawtext=text='{peak_caption}':
       fontsize=68:fontcolor=white:
       fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:
       x=(w-text_w)/2:y=h/2:
       box=1:boxcolor=black@0.5:boxborderw=12:
       enable='between(t,9,14)'"
```

---

## 12. Caption Library

A JSON file (`/opt/lounge/captions.json`) with 1000+ entries, organised by context and emotion. The library is loaded at service startup and selected at clip-enhancement time.

### Structure

```json
{
  "pre_event": {
    "fearful":   ["the dread is setting in...", "he can feel it coming", "the look of inevitability"],
    "neutral":   ["suspiciously calm", "ice cold", "unbothered... for now"],
    "angry":     ["already losing it", "pure focus or pure rage?"],
    "happy":     ["peak confidence", "too relaxed for this situation"],
    "surprised": ["what is he looking at", "completely zoned out"]
  },

  "peak_GOAL_CANDIDATE": {
    "happy":     ["SHEEEESH", "KNEW IT WAS GOING IN", "MANZE!", "TOO EASY BRO", "CLINICAL 🎯", "GGGG"],
    "surprised": ["WAIT—", "EVEN HE DIDN'T EXPECT THAT", "HOW???", "CHAOS AGENT"],
    "angry":     ["UNBELIEVABLE", "THAT'S NOT FAIR", "REFUSES TO ACCEPT REALITY"],
    "neutral":   ["ICE IN HIS VEINS 🥶", "DIDN'T EVEN FLINCH", "ZERO REACTION. DEMON."],
    "sad":       ["KNEW IT WAS COMING", "THE PAIN WAS ANTICIPATED"]
  },

  "peak_PENALTY_MISS": {
    "fearful":   ["HEARTBREAK 💔", "THE PAIN IS REAL", "COULDN'T WATCH"],
    "angry":     ["ABSOLUTELY FURIOUS", "CONTROLLER ALMOST FLEW", "UNACCEPTABLE"],
    "surprised": ["HE SAW IT. HE STILL MISSED.", "UNBELIEVABLE SCENES", "HOW DO YOU MISS THAT"]
  },

  "peak_RED_CARD": {
    "angry":     ["SEE YA 👋", "ENJOY THE WALK", "DESERVED"],
    "surprised": ["THOUGHT IT WAS LEGAL", "IN COMPLETE SHOCK", "DIDN'T SEE THAT COMING"]
  },

  "match_end_win": {
    "happy":     ["CHAMPIONS 🏆", "GG EZ", "CLINICAL FROM START TO FINISH", "FLAWLESS"],
    "surprised": ["DIDN'T THINK WE'D DO IT", "SOMEHOW. SOMEWAY.", "AGAINST ALL ODDS"],
    "neutral":   ["EXPECTED. NEXT.", "ROUTINE VICTORY 😴", "TOO EASY TO CELEBRATE"]
  },

  "match_end_loss": {
    "sad":       ["IT'S OKAY... (IT'S NOT OKAY)", "WE GO AGAIN 😔", "NEXT TIME BRO"],
    "angry":     ["ABSOLUTELY ROBBED", "THE GAME WAS RIGGED", "REFS WERE PAID"],
    "fearful":   ["KNEW IT WAS COMING", "THE DREAD WAS REAL ALL ALONG"]
  }
}
```

### Context-Aware Selection

When score and match minute are available from OCR, captions can be context-specific:

```python
def get_caption(context, emotion, match_ctx=None):
    # Context-specific overrides take priority
    if match_ctx and context == "peak_GOAL_CANDIDATE":
        diff = abs(match_ctx.home - match_ctx.away)
        minute = match_ctx.minute

        if diff == 0 and minute >= 8:
            return random.choice([
                "LAST MINUTE EQUALISER 😱", "HE'S DONE IT",
                "CHAOS IN INJURY TIME", "GAME. CHANGED."
            ])
        if diff >= 3:
            return random.choice([
                "THE COMEBACK IS NOT ON", "MERCY RULE WHEN?",
                "SEND HELP", "GAME OVER 💀"
            ])

    options = CAPTIONS.get(context, {}).get(emotion)
    if not options:
        options = CAPTIONS.get(context, {}).get("neutral", ["..."])
    return random.choice(options)
```

### Localisation

All captions can be written in Sheng or Swahili for the Nairobi market. The library is a plain JSON file — no code change required to update or translate it.

---

## 13. Highlight Reel Assembly

After all clips for a session are enhanced, the worker assembles the final highlight reel.

**Structure:**

```
[Session title card: "NEO LOUNGE — Station 2 — April 8 2026 — 2-1"]
[EVENT 1 TITLE: "GOAL AT 3' — 0-1"]
[Clip 1: enhanced reaction + FIFA replay (if captured)]
[EVENT 2 TITLE: "THE DRAMA — 7'"]
[Clip 2: merged foul + penalty miss]
[FINAL REACTION]
[Post-match reaction clip]
[QR code frame: 2 seconds — links to PWA download]
[NEO LOUNGE logo card: 2 seconds]
```

Title cards are generated via FFmpeg `drawtext` on a black `lavfi color` source. Assembly uses `-c copy` where possible. Full reel generation takes ~3-5 seconds.

**Outputs:**
- `highlight_reel_landscape.mp4` — 1280×720, for lounge TV display and tablet
- `highlight_reel_portrait.mp4` — 720×1280, for WhatsApp/TikTok sharing

Both served from the PWA by auth code. The portrait file is what appears when a customer scans the QR code on their phone.

**Session watermark on all clips:**
```
"NEO LOUNGE — Station N — [Date]"
Fontsize 18, white 50% opacity, top-left corner
```

---

## 14. Clip Delivery (PWA)

**How customers access replays:**

1. QR code appears on tablet when first clip is ready (not waiting for all)
2. Customer scans with phone
3. Phone must be on lounge WiFi (local network only)
4. PWA opens at `http://192.168.1.x:3003/replay/{authCode}`
5. Shows individual clips as they complete (live progress)
6. Shows full highlight reel when assembled
7. Download button: saves portrait MP4 to phone
8. All files deleted 1 hour after session ends (TTL configurable in Settings)

**Auth code:** 6-character alphanumeric, generated at session creation, embedded in QR. No login required — possession of the QR code grants access.

---

## 15. Storage Lifecycle

### Active Session Data (NVMe)

```
On session end:
  - Schedule cleanup job for session_end + replayTTLMinutes (default 60)
  - Worker continues processing clips until all done

At TTL expiry:
  DELETE /var/lounge/webcam{n}/session_{id}/   (webcam raw footage)
  DELETE /var/lounge/replays/session_{id}/     (all clip files)
  DELETE pending_events WHERE session_id = X
  DELETE clip_jobs WHERE session_id = X
  DELETE replay_clips WHERE session_id = X
  (ReplayClip DB rows are soft-deleted or purged)
```

### Security Camera Data

```
Nightly (03:00 systemd timer):
  rsync --remove-source-files \
    /var/lounge/sec/cam*/seg_$(date -d yesterday +%Y%m%d)*.ts \
    /mnt/archive/security/$(date -d yesterday +%Y/%m/%d)/

  # Delete archive footage older than securityRetentionDays
  find /mnt/archive/security/ -mtime +14 -delete

  # PostgreSQL backup snapshot
  pg_dump lounge | zstd -3 > /mnt/archive/db/lounge_$(date +%Y%m%d).sql.zst
```

### TV Ring Buffer

Auto-managed by ffmpeg `-segment_wrap 60`. Oldest segments overwrite automatically. No cleanup needed. Clears on reboot.

---

## 16. Reliability and Operations

### systemd Service Configuration

All services use watchdog to detect silent hangs (not just crashes):

```ini
[Service]
Restart=always
RestartSec=2
WatchdogSec=30       # service must prove it's alive every 30 seconds
# Service must call sd_notify("WATCHDOG=1") in its main loop
```

### UPS Graceful Shutdown

```bash
apt install nut    # Network UPS Tools

# /etc/nut/upsmon.conf:
# NOTIFYCMD /usr/local/bin/lounge-shutdown.sh
# Triggers when battery reaches 20%

# lounge-shutdown.sh:
systemctl stop capture-tv@{1..4}.service   # ffmpeg flushes and closes cleanly
systemctl stop capture-webcam@{1..4}.service
pg_ctl stop -m fast                         # PostgreSQL checkpoints cleanly
shutdown -h now
```

No corrupt video files or database corruption on power cuts.

### Temperature Monitoring

```bash
# /opt/lounge/temp_monitor.sh (systemd timer, every 5 minutes)
TEMP=$(sensors | grep "Core 0" | awk '{print $3}' | tr -d '+°C')

if (( $(echo "$TEMP > 80" | bc -l) )); then
    # Log to DB
    curl -X POST https://api.africastalking.com/version1/messaging \
      -d "username=${AT_USERNAME}&to=${ALERT_NUMBER}&message=NEO LOUNGE WARNING: CPU temp ${TEMP}C"
fi
```

### NVMe Health Monitoring

```bash
# /opt/lounge/nvme_monitor.sh (systemd timer, daily)
USED=$(nvme smart-log /dev/nvme0n1 | grep "percentage_used" | awk '{print $3}')
if [ "$USED" -gt 70 ]; then
    # SMS alert: NVMe is 70%+ worn, plan replacement
fi
```

### Clip Integrity Verification

```python
async def verify_clip(path: str) -> bool:
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v",
         "-show_entries", "stream=duration", "-of", "csv=p=0", path],
        capture_output=True, text=True, timeout=10
    )
    duration = float(result.stdout.strip() or 0)
    return duration > 5.0   # valid clip must be >5 seconds
```

Called after every extraction and encode step. Failed clips get status FAILED in DB. Tablet shows "clip unavailable" rather than a broken player.

### AI Models Pre-Loaded at Startup

```python
# pipeline/main.py startup
print("Loading AI models...")
FACE_DETECTOR = cv2.FaceDetectorYN.create("yunet.onnx", "", (1280, 720))
EMOTION_MODEL  = ort.InferenceSession("fer_mobilenet.onnx")
YAMNET_MODEL   = load_yamnet_tflite("yamnet_quantized.tflite")
CAPTIONS       = json.load(open("captions.json"))
print("Ready.")
```

Zero cold-start latency on first clip.

---

## 17. User Journey (Updated)

**Session start** (unchanged from V3):
1. Staff opens kiosk → selects station → selects duration → takes payment (cash or M-Pesa)
2. Session starts: TV → PS5 HDMI (ADB), LEDs sync (Tuya)
3. ffmpeg capture services start for that station (TV ring buffer, webcam, game analyzer)
4. Audio detector starts listening on that station's audio channel

**During gameplay:**
5. YAMNet detects crowd roar → EventMerger creates/extends clip window
6. Game analyzer reads score/minute → updates MatchState
7. Game analyzer detects FIFA onscreen replay → records GameReplay timestamps
8. 25 seconds after each event window closes → ClipJob inserted → worker wakes instantly
9. Worker extracts TV clip + webcam + FIFA replay (all -c copy, ~500ms)
10. Worker stitches (Stage 2, ~4s) → enhances (Stage 3, ~10s) → portrait crop
11. socket.io → tablet: "⚡ 2 moments captured" — counter only, no clip preview on tablet

**Match end:**
12. Match end detected (game analyzer fulltime template OR manual "End Game" button)
13. Tablet shows session end screen (timer expired / match over)
14. Final post-match reaction: webcam records 60 more seconds
15. MATCH_END ClipJob queued → processed → added to reel
16. Worker assembles final highlight reel (landscape + portrait)
17. socket.io → tablet: notification only — "🎬 Your highlights are ready — scan the QR code below"
18. QR code displayed on tablet. No clip playback on tablet itself.
19. Customer scans QR → their phone connects to lounge WiFi → PWA → downloads portrait MP4

**Session end:**
19. Timer hits zero (or staff ends session)
20. TV → screensaver, LEDs → ambient
21. All capture services stop for this station
22. TTL clock starts (60 minutes)
23. At TTL: all clip files and raw footage deleted automatically

---

## 18. Phased Rollout

### Stage 1 — Launch (TV replays only)

**Hardware:** N100 + audio interface + 4× HDMI capture cards + PoE switch + UPS  
**No webcams.** Game analyzer active from day one (valuable even without webcams).  
**Replays:** TV highlight clips with title cards, available within seconds of match end.  
**Processing time for 10-min match:** < 5 seconds total.

### Stage 2 — Webcam Reactions (add a few months after stable launch)

**Add:** 4× USB webcams (3× 720p 60fps + 1× 720p 120fps), powered USB hub.  
**Replays:** TV clip + webcam PiP reaction overlay, stitched during match.  
**Processing time:** ~4 seconds per clip, all done before match ends.  
**No code changes to capture infrastructure** — just enable webcam services and Stage 2 worker path.

### Stage 3 — AI-Enhanced Highlight Reels (when lounge is profitable)

**Add:** Nothing — hardware already in place from Stage 2.  
**Enables:** Face zoom, slow-motion, emotion detection, comedic captions, split-screen reactions, portrait export, context-aware titles, FIFA replay harvesting.  
**Processing time:** ~10 seconds per clip, all done before match ends for a 10-min game.  
**New dependencies:** `opencv-python-headless`, `onnxruntime`, `pytesseract`, FER model, YuNet model.

---

## 19. Error Handling

| Scenario | Handling |
|---|---|
| **Internet outage** | Africa's Talking routes via 4G LTE dongle |
| **M-Pesa timeout** | 30 seconds → retry/switch-to-cash buttons |
| **Duplicate webhooks** | Idempotent handler checks if transaction already COMPLETED |
| **Power cut** | UPS graceful shutdown preserves all files and DB; session remainders saved |
| **Hardware fault** | Staff can grant free time or transfer session |
| **Capture service crash** | systemd watchdog restarts within 2 seconds |
| **Ring buffer miss** | pre_roll clamped to available footage; no crash |
| **Clip extraction fails** | Retry once from ring buffer; mark FAILED if retry fails; tablet shows "unavailable" |
| **Corrupt clip** | ffprobe detects < 5 second duration; marks FAILED gracefully |
| **NVMe full** | Alert via SMS + dashboard; old security footage migrated aggressively |
| **Temperature warning** | SMS alert to owner; logs to DB for trending |
| **Game analyzer loses feed** | Falls back to audio-only detection; logs gap |
| **OCR fails to read score** | Caption selection falls back to emotion-only; no crash |
| **Face not detected** | Clip produced without zoom; full-frame webcam used |
| **Webcam disconnects** | Service restarts; ClipJob proceeds as TV-only (Stage 1 fallback) |

---

## 20. Tablet UX Rules

These are hard rules for the per-station customer tablet (port 3002):

| Rule | Detail |
|---|---|
| **No SMS to customers** | All session notifications (warnings, end, replays ready) appear on the tablet screen only. No text messages are sent to customers at any point. |
| **No clip previews on tablet** | The tablet never plays or shows thumbnails of replay clips. It shows notifications only. |
| **No replay content on tablet** | Replay clips live exclusively in the PWA (port 3003), accessed via QR code on the customer's own phone. |
| **2-minute warning** | Shown as a visible countdown banner on the tablet screen. Staff are also notified on the kiosk. |
| **Session end** | Shown on the tablet screen with a clear message. Timer goes to zero. |
| **Moments captured counter** | A subtle live counter ("⚡ 3 moments captured") updates during the match. Builds anticipation without being distracting. |
| **Replays ready notification** | When all clips are done, the tablet shows a notification with the QR code. One screen, one action: scan and go. |
| **QR code** | Displayed prominently after match end. Links to the PWA on the local WiFi. No internet required. |

---

## 21. Design (unchanged)

- Dark mode: background `#0F172A`
- Primary accent: `#2563EB` (PlayStation blue)
- Cards: `#1E293B` with subtle border
- Status badges: green (Available), blue (Active), yellow (Pending), red (Fault)
- Typography: clean sans-serif, large and readable for lounge environment
- Language: English at launch, strings externalized for Swahili
- All clip text overlays: DejaVu Sans Bold (open source, ships with Ubuntu)
