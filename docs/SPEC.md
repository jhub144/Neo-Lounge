# Neo Lounge — Full System Specification

> Last updated: April 2026
> Replaces: "PlayStation Lounge V3 Final Specification"
> Companion document: [REACTION-MODEL-SPEC.md](REACTION-MODEL-SPEC.md) — detailed reaction intelligence specification (importance scoring formula, per-tier recipes, video effects reference, emotion transitions, testing plan)

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
- LED ambient lighting via Tuya HDMI Sync Box (HDMI sync mode during gameplay, static color mode during idle — controlled via Tuya Local API over WiFi)

**Video and audio capture**
- Continuous capture of 4 TV streams into 3-minute RAM ring buffers
- Continuous capture of 4× 120fps webcam reaction feeds
- Continuous capture of 5 security cameras to NVMe
- Zero-transcode capture using ffmpeg -c copy throughout

**Reaction intelligence**
- FaceScorer runs YuNet face detection + FER emotion at 4fps per station
- Per-session baseline calibration (first 2 minutes) — all scoring relative to customer's own baseline
- Importance scoring: weighted fusion of face reaction, audio, visual event, match context, face presence
- Three clip tiers (MICRO / STANDARD / BIG) with distinct production recipes
- Dynamic clip length — post-roll determined by face emotion fade-out, not fixed timer

**Replay production**
- AI-triggered highlight clips with tier-aware effects (speed ramp, face zoom, freeze-frame, captions)
- FIFA dual-reaction treatment (DUAL_BEAT): captures both live reaction and reaction while watching replay
- Sheng/Swahili caption library with family-friendly emotion stinger overlays
- Highlight reel with narrative arc ordering, "Moment of the Match" promotion, penalty shootout grouping

**Game stream intelligence**
- Passive analysis of TV footage at 320×240 / 2fps
- Corroborates audio events, detects FIFA onscreen replays, reads score/timer via OCR
- Auto-detects match end, red/yellow cards, penalty situations, shootouts
- Face-only triggers for near-misses and skill moves (no audio/visual event required)

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
| **PC** | Lenovo ThinkCentre Neo 50Q Gen 4 (Intel i5-13420H) | 8 cores / 12 threads, 4.6 GHz boost. Quick Sync Gen 13. Business-grade reliability, 3-year warranty. |
| **RAM** | 16 GB DDR4-3200 | Pre-installed. Expandable to 32 GB if needed. |
| **Boot/Data Drive** | 256 GB NVMe Gen 4 M.2 2280 in external USB-C 3.2 Gen 2 enclosure | All data (OS, database, video files) on this single external drive. Security footage migrates to USB HDD nightly. |
| **OS** | Ubuntu 24.04 LTS | XFS filesystem, noatime mount option |
| **Average power** | ~20-35 W active, ~8 W idle | ~KES 350/month at KES 25/kWh |

### Cold Spare and Failover

Identical ThinkCentre Neo 50Q Gen 4 kept on-site, powered off in the same locked cabinet. Both PCs have empty internal M.2 slots — the system boots entirely from the external USB-C NVMe SSD.

**Failover design:** All connections to the active PC use color-coded cables with matching colored stickers on the ports of both PCs. On failure, staff unplugs all cables from PC1, plugs them into matching ports on PC2, and presses power. No tools, no case opening, no technical knowledge required.

| Cable Color | Connection |
|---|---|
| White | External NVMe SSD (USB-C) — the boot/data drive |
| Red | Powered USB hub (capture cards + webcams) |
| Green | Ethernet (network switch) |
| Yellow | UPS monitoring (USB) |
| Blue | Archive HDD (USB) |

**Recovery time:** ~3 minutes (unplug 5 cables, plug into PC2, boot).

**What survives failover:** Database (all sessions, payments, history), webcam recordings, security footage, clip files, all configuration. **What is lost:** Ring buffer (RAM, last 3 minutes of TV footage) — clips being extracted at crash time may fail.

**udev rules** stored on the external SSD assign stable device names based on USB hub port position, ensuring capture cards and webcams get the same `/dev/video_tvN` names on either PC.

**Monthly maintenance:** Boot PC2 with the external SSD once per month during closed hours to verify it works and run OS updates.

### Supporting Hardware

| Component | Spec | Purpose |
|---|---|---|
| **Audio input** | MS2130 capture card USB Audio Class | Each capture card exposes its own ALSA audio device via USB Audio Class — one per station. No separate audio interface needed. TV audio only — no customer microphones. |
| **PoE+ switch** | TP-Link TL-SG1008PE (8-port, 124W PoE+, unmanaged) | Powers cameras, connects everything |
| **UPS** | CyberPower/APC 1500VA pure sine | Graceful shutdown on power cut |
| **USB hub** | Powered 10-port USB 3.0 | Aggregates webcams and capture cards |
| **USB archive drive** | 1 TB external USB HDD | Security camera long-term storage (~5 GB/day, 14-day retention = ~70 GB) |
| **4× HDMI splitters** | 1-in-2-out, 4K@60Hz, HDCP 2.2 | Splits PS5 signal: one copy to TV, one copy to Tuya HDMI sync box |
| **4× HDMI capture cards** | USB UVC H.264 capture (MS2130 chipset) | TV streams into PC. Connected via sync box HDMI passthrough, not directly from splitter. |
| **4× Tuya HDMI Sync Boxes** | HDMI 2.0, HDCP 2.2, 4K@60Hz HDR10+ passthrough, WiFi | Reads PS5 HDMI signal to drive LED strips (ambilight effect during gameplay). HDMI passthrough output feeds the capture card. Software controls mode via Tuya Local API. |
| **4× LED strips** | WS2812B addressable RGB, included with sync box | One per TV, driven by the sync box |
| **4× webcams** | 720p 120fps, UVC H.264 output | Reaction capture + real slow-motion on all 4 stations |
| **5× IP cameras** | PoE, RTSP/H.265, 720p-1080p | Security recording |

### Signal Chain Per Station

```
PS5 ──HDMI──→ Splitter (1×2) ──→ TV (4K 60Hz, direct — zero latency)
                               ──→ Tuya HDMI Sync Box (reads signal → LEDs)
                                        │ HDMI passthrough
                                        ↓
                                   Capture Card (1080p) ──USB──→ PC
                                   
Sync Box ←──WiFi──→ PC (Tuya Local API: mode switching)
```

**Why this chain:** The TV gets a direct, clean feed from the splitter — no passthrough devices, no latency, no quality loss for the customer. The sync box sits on the second splitter output, reads the HDMI signal to drive ambient LEDs, and passes the signal through to the capture card. The capture card only needs 1080p for recording, so any minor passthrough overhead is irrelevant.

### Storage Layout

```
Filesystem: XFS, mounted with noatime
Boot/data drive: External USB-C NVMe SSD (256 GB)

/run/lounge/          ← tmpfs (RAM-backed, clears on reboot)
  tv1/ ... tv4/       ← 3-minute ring buffers for TV streams
                         (4 × 15 Mbps × 180s = ~340 MB total)

/var/lounge/          ← External NVMe (hot tier)
  webcam1/ ... webcam4/  ← Session webcam segments (720p)
  sec/cam1/ ... cam5/    ← Security cam segments (migrated nightly)
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
- webcamDevice: String (e.g. "/dev/video0") — all stations have 120fps webcams at launch

### Session
- id, stationId, staffPin, startTime, endTime, durationMinutes
- remainingAtPowerLoss, status (ACTIVE/PAUSED/COMPLETED/POWER_INTERRUPTED)
- authCode (6-char unique, used for QR code replay access)
- purgedAt: DateTime (nullable — set when session files are cleaned up; triggers 410 Gone)
- audioBaseline: Float (nullable — TV audio RMS median, set after 120s calibration)
- emotionBaseline: Float (nullable — face emotion 20th percentile, set after 120s)
- movementBaseline: Float (nullable — face movement median, set after 120s)
- calibratedAt: DateTime (nullable — when baselines were locked in)

### Transaction
- id, sessionId, amount, method (CASH/MPESA)
- status (PENDING/COMPLETED/FAILED/TIMEOUT)
- mpesaReceipt, staffPin, createdAt

### Game
- id, sessionId, startTime, endTime
- endMethod (AI_DETECTED/MANUAL_BUTTON/SESSION_END)

### PendingEvent
- id, sessionId, stationId, gameId
- eventType: Enum (GOAL_CANDIDATE/PENALTY_MISS/RED_CARD/YELLOW_CARD/MATCH_END/SCORE_CHANGE) — nullable for face-only triggers
- eventTimestamp: Float (unix epoch, from audio AI or game analyzer)
- source: Enum (AUDIO_AI/GAME_ANALYZER/BOTH/FACE_ONLY) — BOTH = corroborated; FACE_ONLY = no audio/visual event but strong face reaction
- audioScore: Float (0.0–1.0, nullable — TV audio peak + duration + class confidence)
- visualEventScore: Float (0.0–1.0, nullable — event type weight × detection confidence)
- faceReactionScore: Float (0.0–1.0, nullable — emotion peak + sustain + movement + mouth aperture)
- contextMultiplier: Float (0.5–2.0, nullable — late game + close score + drought + shootout)
- importance: Float (0.0–1.0, nullable — weighted fusion of all scores, see §9)
- emotionTransition: String (nullable — e.g. "heartbreak", "classic_celebration", see §9)
- confidence: Float (legacy/backward compat — audioConfidence equivalent)
- matchMinute: Int (from OCR, nullable)
- homeScore: Int, awayScore: Int (from OCR at time of event, nullable)
- mergedWithEventId: Int (nullable — if this event was merged into a longer clip)
- processed: Boolean default false
- createdAt: DateTime

### ClipJob
- id, sessionId, stationId
- clipStart: Float, clipEnd: Float (unix epoch — the window to extract)
- eventWindowStart: Float, eventWindowEnd: Float (unix epoch — the gameplay event itself)
- replayWindowStart: Float (nullable — when FIFA replay starts, if detected)
- replayWindowEnd: Float (nullable — when FIFA replay ends)
- eventTypes: String[] (all event types merged into this clip)
- importance: Float (0.0–1.0 — weighted multi-signal score, see §9)
- tier: Enum (MICRO/STANDARD/BIG — determined by importance thresholds)
- replayTreatment: Enum (LIVE_ONLY/REPLAY_ONLY/DUAL_BEAT/SKIP) default LIVE_ONLY
- liveReactionScore: Float (nullable — face reaction at time of event)
- replayReactionScore: Float (nullable — face reaction while watching FIFA replay)
- dominantEmotion: String (nullable — e.g. "joy", "surprise", "anger")
- emotionTransition: String (nullable — e.g. "heartbreak", "jaw_drop")
- shootoutGroup: String (nullable — shared ID for all clips in a penalty shootout)
- tvClipPath: String (nullable — set when extracted)
- webcamClipPath: String (nullable — webcam footage for this clip)
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
- isShootout: Boolean default false (set when 3+ penalty events detected in 4min at minute 90+)
- rawOcrText: String (for debugging)

### FaceSnapshot (high-frequency face data from webcam, auto-purged with session)
- id, stationId, sessionId
- capturedAt: DateTime
- faceCount: Int (0 = no face visible)
- dominantEmotion: String (nullable — "joy", "surprise", "anger", "sadness", "fear", "neutral")
- emotionConfidence: Float (nullable — FER model confidence for dominant class)
- mouthAperture: Float (nullable — normalized 0–1, computed from YuNet mouth landmarks)
- faceMovement: Float (nullable — pixels/frame displacement of face bbox)
- offFaceMotion: Float (nullable — normalized 0–1, pixel change outside face bbox — detects arm-waving, standing up)
- faceX, faceY, faceW, faceH: Int (nullable — primary face bounding box)
- face2Emotion: String (nullable — second face emotion, for 2-player scenarios)
- face2Confidence: Float (nullable)
- face2X, face2Y, face2W, face2H: Int (nullable — second face bounding box)
- Indexed on (stationId, sessionId, capturedAt)
- Storage: ~4 rows/s per station × ~200 bytes/row = ~11.5 MB/hour across 4 stations. Purged with session cleanup.

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
- tvRingBufferSeconds: Int default 180 (3-minute ring buffer)
- clipPreRollSeconds: Int default 10
- clipPreRollBigSeconds: Int default 20 (extended pre-roll for BIG tier clips — more buildup)
- clipPostRollSeconds: Int default 25 (fallback only — dynamic post-roll is the default, see §9)
- eventMergeWindowSeconds: Int default 25 (merge events within this gap)
- tierMicroMax: Float default 0.39 (importance <= this → MICRO tier)
- tierStandardMax: Float default 0.69 (importance <= this → STANDARD; above → BIG)
- microPostRollCap: Int default 12 (maximum post-roll seconds for MICRO tier)
- standardPostRollCap: Int default 30 (maximum post-roll seconds for STANDARD tier)
- bigPostRollCap: Int default 45 (maximum post-roll seconds for BIG tier)
- gameAnalysisEnabled: Boolean default true
- audioDetectionEnabled: Boolean default true
- stage2Enabled: Boolean default true
- stage3Enabled: Boolean default true
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
| GET | /api/system/health | Owner | Combined hardware health: CPU temp, NVMe SMART (percentUsed, temperature), disk free space, per-service systemd state for all Stage 11 pipeline units, and `warning: true` when CPU temp exceeds `Settings.alertTempCelsius` |
| GET | /api/system/pipeline-health | Owner | Pipeline throughput: ClipJob counts by status (PENDING/EXTRACTING/STITCHING/ENHANCING/DONE/FAILED) over the last 24h, GameReplay detection counts, and per-station ring buffer stats (segment count, oldest/newest mtimes in `/run/lounge/tvN/`) |

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
  -f v4l2 -input_format h264 \
  -video_size 1920x1080 \
  -i /dev/video_tv%i \
  -c copy \
  -f segment \
  -segment_time 2 \
  -segment_format mpegts \
  -segment_wrap 90 \
  -reset_timestamps 1 \
  /run/lounge/tv%i/seg_%03d.ts

# Source: USB HDMI capture card (MS2130 chipset) via V4L2
# /dev/video_tvN is a stable symlink created by udev rules
# 90 × 2-second segments = 3-minute rolling ring buffer
# /run/lounge/ is tmpfs (RAM) — auto-clears on reboot
# 4 streams × 15 Mbps × 180s = ~340 MB RAM total
```

#### Game Analysis (×4) — Reads From Ring Buffer Segments

The game analyzer does NOT open the V4L2 capture device directly (V4L2 devices are exclusive-access — two processes cannot read the same `/dev/videoN`). Instead, it reads from the ring buffer `.ts` segments in tmpfs that the TV capture service writes.

```python
# game_analyzer.py reads segments from /run/lounge/tvN/
# Decodes the latest segment, downscales to 320×240, analyzes at 2fps
# The ring buffer segments are in RAM (tmpfs) — reading them is instant
# Analysis runs 0-2 seconds behind live — acceptable for event corroboration
```

**Fault isolation:** If the game analyzer crashes, TV capture continues unaffected. If TV capture restarts, the analyzer just waits for new segments. Neither can take the other down.

CPU cost: ~1-2% per station for segment decode + analysis at 320×240/2fps.

#### Webcam Streams (×4) — Direct to NVMe

```bash
# /etc/systemd/system/capture-webcam@.service
# All 4 webcams: 720p 120fps, UVC H.264 — enables real slow-motion on every station
ExecStart=/usr/bin/ffmpeg -hide_banner -loglevel warning \
  -f v4l2 -input_format h264 \
  -video_size 1280x720 -framerate 120 \
  -i /dev/video%i \
  -c copy \
  -f segment \
  -segment_time 10 \
  -segment_format mpegts \
  -strftime 1 \
  /var/lounge/webcam%i/seg_%Y%m%d_%H%M%S.ts
# Webcam continues recording 60 seconds after session end (late clip extraction window)
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
# One instance per station, reads from MS2130 capture card ALSA audio device
# Each capture card exposes its own USB Audio Class device — one per station
# TV audio only — no customer microphones
ExecStart=/usr/bin/python3 /opt/lounge/yamnet_detector.py --station %i --device hw:%i
```

#### Face Scoring (per station, co-process with audio detector)

```bash
# Runs as a thread within the audio detector or as a lightweight co-process
# Samples webcam at 4 fps (every 30th frame from 120fps stream)
# Runs YuNet face detection (~3ms/frame) + FER emotion (~10ms/frame)
# Writes FaceSnapshot rows to DB (batch insert every 2 seconds)
# Total CPU: ~5% of one core per station, ~20% across all 4 stations
# The i5-13420H (8 cores) has ample headroom for this workload
# Manages per-session baseline calibration (first 120 seconds)
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
| **Penalty shootout** | 3+ GOAL_CANDIDATE/PENALTY_MISS events within 4min at matchMinute >= 90 | ~0ms (derived) | Set MatchState.isShootout=true; group ClipJobs |
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

### Event Corroboration and Scoring

An event is classified by source:

| Source | Meaning |
|---|---|
| AUDIO_AI only | Crowd roar detected, no game confirmation |
| GAME_ANALYZER only | Score changed, no audio trigger |
| BOTH | Highest confidence — corroborated event, +0.15 importance boost |
| FACE_ONLY | Strong face reaction detected but no audio/visual event — catches near-misses, skill moves, funny moments |

If source is AUDIO_AI only and confidence < 0.65, flag as low-confidence. Still create a clip but mark in metadata.

**Face-only triggers:** When faceReactionScore > 0.70 AND emotion sustain > 1.5s, but no audio/visual event was detected, a PendingEvent is created with source=FACE_ONLY and eventType=null. These receive lower importance scores (visualEventScore=0) but are still included in the reel if the reaction was strong enough.

---

## 9. Event Handling, Importance Scoring, and Clip Creation

### EventMerger

Events within the same post-roll window are merged into one extended clip rather than creating multiple separate clips. This preserves natural drama arcs (foul → penalty miss → goal becomes one clip, not three).

The merger now also computes an **importance score** for each clip, assigns a **tier** (MICRO/STANDARD/BIG), determines **dynamic post-roll** based on face reaction fade-out, and selects **FIFA replay treatment**.

```python
class EventMerger:
    pre_roll = Settings.clipPreRollSeconds           # default 10
    pre_roll_big = Settings.clipPreRollBigSeconds     # default 20
    merge_window = Settings.eventMergeWindowSeconds   # default 25

    def on_event(self, timestamp, event_type, station_id):
        if self.has_active_window(station_id):
            if timestamp < self.active_end[station_id]:
                self.active_end[station_id] = timestamp + self.merge_window
                self.event_types[station_id].append(event_type)
                return
            else:
                self.flush(station_id)

        self.active_start[station_id] = timestamp - self.pre_roll
        self.active_end[station_id] = timestamp + self.merge_window
        self.event_types[station_id] = [event_type]

    def on_timer_tick(self):
        # Called every second — checks for reaction fade-out
        for station_id in list(self.active_windows):
            window = self.active_windows[station_id]
            if self.reaction_has_faded(station_id) or self.exceeded_max_post_roll(window):
                self.flush(station_id)

    def flush(self, station_id):
        window = self.active_windows[station_id]

        # 1. Query FaceSnapshot for the clip window
        face_data = db.query_face_snapshots(station_id, window.start, window.end)

        # 2. Compute signal scores
        audio_score = self.compute_audio_score(window.events)
        visual_score = self.compute_visual_score(window.events)
        face_score = self.compute_face_reaction_score(face_data, session.emotionBaseline)
        face_presence = self.compute_face_presence_score(face_data)
        context_mult = self.compute_context_multiplier(station_id)

        # 3. Compute importance (weighted fusion)
        importance = (
            0.30 * face_score +
            0.25 * audio_score +
            0.20 * visual_score +
            0.15 * (context_mult / 2.0) +  # normalize 0-2 → 0-1
            0.10 * face_presence
        )

        # 4. Apply corroboration boost
        if window.source == 'BOTH':
            importance = min(1.0, importance + 0.15)

        # 5. Assign tier
        tier = self.assign_tier(importance, window.events)

        # 6. Check for FIFA replay during window
        replay_treatment = self.select_replay_treatment(station_id, window, face_data, tier)

        # 7. Detect emotion transitions
        emotion_transition = self.detect_emotion_transition(face_data)

        # 8. Check for shootout grouping
        shootout_group = self.get_shootout_group(station_id) if match_state.isShootout else None

        # 9. Determine pre-roll based on tier
        pre_roll = self.pre_roll_big if tier == 'BIG' else self.pre_roll

        # 10. Insert ClipJob
        db.insert_clip_job(
            station_id=station_id,
            clip_start=window.event_time - pre_roll,
            clip_end=window.end,
            event_window_start=window.event_time - 3,
            event_window_end=window.event_time + 5,
            importance=importance,
            tier=tier,
            replay_treatment=replay_treatment,
            dominant_emotion=face_data.peak_emotion,
            emotion_transition=emotion_transition,
            shootout_group=shootout_group,
            event_types=window.event_types,
        )
        db.execute("NOTIFY clip_jobs_channel")
        self.clear(station_id)

    def assign_tier(self, importance, events):
        # Automatic overrides
        if any(e.type == 'MATCH_END' for e in events):
            return max('STANDARD', self.tier_from_score(importance))
        if match_state.isShootout:
            return max('STANDARD', self.tier_from_score(importance))
        return self.tier_from_score(importance)

    def tier_from_score(self, importance):
        if importance <= Settings.tierMicroMax:    return 'MICRO'
        if importance <= Settings.tierStandardMax: return 'STANDARD'
        return 'BIG'
```

### Importance Scoring Formula

```
importance = 0.30 × faceReactionScore        (emotion intensity + sustain + movement + mouth aperture)
           + 0.25 × audioScore               (TV audio peak + duration + YAMNet class confidence)
           + 0.20 × visualEventScore          (event type weight × detection confidence)
           + 0.15 × contextMultiplier_norm    (late game + close score + drought + shootout, /2.0)
           + 0.10 × facePresenceScore         (face count, face count change, off-face motion)
```

**Visual event type base weights:** GOAL_CANDIDATE=0.85, PENALTY_MISS=0.80, SCORE_CHANGE=0.75, RED_CARD=0.70, MATCH_END=0.60, YELLOW_CARD=0.40, no event (face-only)=0.00.

**Context multiplier:** matchMinute >= 85 → +0.40; >= 75 → +0.20; drawn → +0.30; 1-goal game → +0.15; 5+ min since last event → +0.10; penalty shootout → +0.50. Capped at 2.0.

**When face data is unavailable** (webcam offline): weights are redistributed proportionally among available signals.

### Clip Tiers

| Tier | Importance | Typical moments | Clip length |
|---|---|---|---|
| **MICRO** | 0.00–0.39 | Small reactions, minor events, weak near-misses | 6–12s |
| **STANDARD** | 0.40–0.69 | Normal goals, cards, moderate reactions | 15–25s |
| **BIG** | 0.70–1.00 | Huge sustained reactions, last-minute goals, corroborated events, shootout kicks | 20–40s |

### Dynamic Post-Roll (reaction-driven clip length)

Clips do not have fixed post-roll. The EventMerger holds the window open until the face reaction fades:

```python
def compute_post_roll(emotion_timeline, tier, session):
    min_post = 5
    max_post = {MICRO: 12, STANDARD: 30, BIG: 45}[tier]

    # Find last frame where emotion exceeds baseline + 20%
    fade_time = find_fade_below_threshold(emotion_timeline, threshold=1.2 * session.emotionBaseline)

    return max(min_post, min(max_post, fade_time + 2))  # +2s buffer after fade
```

If no face data is available, falls back to `Settings.clipPostRollSeconds` (25s).

### Per-Session Baseline Calibration

First 2 minutes of each session are calibration. The system collects rolling audio RMS, face emotion intensity, and face movement magnitude. After 120 seconds:

- `session.audioBaseline` = median TV audio RMS
- `session.emotionBaseline` = 20th percentile of face emotion confidence (robust against early spikes)
- `session.movementBaseline` = median face movement
- `session.calibratedAt` = timestamp

All subsequent signal scores are expressed as deviation from baseline. A quiet customer's small smile registers the same importance as a reactive customer's proportional reaction.

If a session is shorter than 2 minutes, absolute thresholds are used (same as Settings defaults).

### FIFA Replay Dual-Reaction

When the game analyzer detects a FIFA replay banner during a clip window, the system captures two webcam reaction windows:

| Window | Timing | What it captures |
|---|---|---|
| **Live reaction (A)** | T_event ± 3 seconds | Instinctive reaction at the moment |
| **Replay reaction (B)** | T_replay_start to T_replay_end | Reaction while watching the FIFA replay |

Both scored using the face reaction model. Treatment selected per tier:

| Tier | Treatment |
|---|---|
| MICRO | Use whichever reaction scored higher (LIVE_ONLY or REPLAY_ONLY) |
| STANDARD | DUAL_BEAT if both reactions > 0.4; otherwise stronger only |
| BIG | Always DUAL_BEAT — shows live reaction, then FIFA replay with watching reaction. This is the signature feature. |

**DUAL_BEAT clip structure:** Pre-roll → event at normal speed → live reaction face zoom → 0.5s beat → FIFA replay → watching reaction → slow-mo peak from stronger window → caption.

### Emotion Transition Detection

Specific emotion sequences detected over a 5-second window receive special treatment:

| Sequence | Name | Effect |
|---|---|---|
| Neutral → Surprise → Joy | "Classic celebration" | +0.05 importance |
| Joy → Surprise → Anger | "Offside!" / "VAR moment" | +0.10 importance |
| Joy → Anger → Sadness | "Heartbreak" | +0.10 importance, auto-bump to STANDARD, hard cut from peak joy to peak sadness, caption "Too soon..." |
| Neutral → Surprise (sustained 3s+) | "Jaw drop" | +0.05 importance, freeze-frame even on STANDARD tier |

### Edge Cases

- **Goal in first 10 seconds:** `pre_roll = min(pre_roll, seconds_since_match_start)` — use whatever ring buffer has.
- **Goal in last 5 seconds:** Post-roll extends after match timer hits zero. Webcam keeps recording until the window closes.
- **Post-match reaction:** When session ends, a MATCH_END event is injected. Webcam continues recording 60 seconds. Always at least STANDARD tier.
- **Audio bleed between stations:** If same event timestamp fires on two adjacent stations within 2 seconds, keep both (each station gets its own clip) but log for monitoring.
- **Active window exceeds safety cap:** Force-flush after `max_post_roll + 5s` regardless of face state.

---

## 10. Clip Processing Queue

### Queue Design

The ClipJob table IS the queue. No external queue software (Redis, RabbitMQ) is needed.

```sql
-- Worker claims next job atomically (no race conditions with multiple workers)
-- Priority order: BIG first (hero clips), then STANDARD, then MICRO
UPDATE clip_jobs
SET status = 'EXTRACTING', started_at = NOW()
WHERE id = (
    SELECT id FROM clip_jobs
    WHERE status = 'PENDING'
    ORDER BY
      CASE tier WHEN 'BIG' THEN 0 WHEN 'STANDARD' THEN 1 WHEN 'MICRO' THEN 2 END,
      enqueued_at ASC
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

### Why BIG-First Priority?

BIG clips are hero moments — they're the ones customers share. Processing them first means the best content is ready earliest. Within the same tier, FIFO ordering ensures fairness across sessions.

### Worker Processes Clips During the Match

The worker starts processing each clip **as soon as its dynamic post-roll window closes** (see §9 for post-roll duration rules) — not at match end. By the time a 10-minute match finishes, most clips are already done.

### Tier-Aware Processing Pipeline

Each ClipJob moves through stages. The tier determines which stages run and what effects are applied.

```
1. EXTRACT     — ffmpeg -c copy (TV segments + webcam segments from ring buffer)
                 If gameReplayPath exists: extract FIFA replay clip too
                 If replayTreatment = DUAL_BEAT: extract both live and replay webcam windows
2. STITCH      — Tier-specific PiP layout (see §11 for per-tier recipes)
                 MICRO: small PiP or TV-only if face emotion < 0.3
                 STANDARD: PiP with zoom punch at peak
                 BIG: alternating cuts between TV and full-screen face
3. ENHANCE     — Tier-specific effects (see §11 for full treatment tables)
                 MICRO: game state caption only, no effects
                 STANDARD: speed ramp + zoom punch + Sheng caption + color grade
                 BIG: speed ramp + freeze-frame + screen shake + face zoom
                       + Sheng caption + emotion stinger + full color grade
4. PORTRAIT    — ffmpeg crop to 9:16 (1080×1920) for WhatsApp/TikTok
                 MICRO clips: portrait not generated (reel-only, not standalone)
5. VERIFY      — ffprobe checks duration > 5s, no corruption
6. NOTIFY      — socket.io replay:clip_ready to tablet
                 MICRO clips: no individual notification (included in reel only)
```

### Failure Handling

If any step fails, status → `FAILED`, error logged. Behaviour:
- **EXTRACT fails:** skip clip entirely, log warning. Tablet shows "clip unavailable".
- **STITCH fails:** fall back to TV-only extract (no webcam overlay). Status → `STITCH_FALLBACK`.
- **ENHANCE fails:** serve the stitched clip without effects. Status → `ENHANCE_FALLBACK`.
- **PORTRAIT fails:** serve landscape only. Portrait download hidden in PWA.
- **VERIFY fails:** discard clip, status → `FAILED`.

The system always degrades gracefully — a clip without effects is better than no clip.

---

## 11. Replay Processing — Per-Tier Recipes

Each ClipJob passes through EXTRACT → STITCH → ENHANCE → PORTRAIT → VERIFY → NOTIFY (see §10). This section defines what each stage does for each tier.

### AI Models (all CPU, no GPU)

- **YuNet** (374 KB, built into OpenCV) — face detection, ~3ms/frame at 720p
- **FER MobileNet** (~5 MB ONNX) — emotion classification on face crop, ~10ms/frame
- Both loaded at service startup, zero cold-start on first clip
- FaceScorer (§7) has already run during the session — FaceSnapshot rows in the DB provide per-frame emotion data. The enhancer reads these rather than re-running inference.

### MICRO Tier Recipe

**Purpose:** Quick cut. Keeps the reel moving. Not a standalone clip.

| Stage | Treatment |
|---|---|
| **EXTRACT** | TV segments from ring buffer via `-c copy`. Webcam segments extracted. No FIFA replay clip. |
| **STITCH** | TV full-screen. Small webcam PiP (240×135, bottom-right) if peak face emotion ≥ 0.3. Otherwise TV-only, no PiP. |
| **ENHANCE** | Game state caption only (score + minute, top-left, 28px, 50% opacity). No Sheng caption. No stinger. No speed ramp. No zoom. No color grade. |
| **PORTRAIT** | Not generated — MICRO clips appear in the reel only, not as standalone downloads. |
| **Duration** | 6–12 seconds |
| **FIFA replay** | If `replayTreatment = STRONGER_REACTION`: use whichever webcam window (live or replay-watching) had the higher peak emotion. Do not include both. |

**Processing time per clip:** ~2 seconds (stitch only, minimal filters)

### STANDARD Tier Recipe

**Purpose:** The workhorse clip. Complete moment with full reaction.

| Stage | Treatment |
|---|---|
| **EXTRACT** | TV segments + webcam segments via `-c copy`. FIFA replay clip if `gameReplayPath` exists. If `replayTreatment = DUAL_BEAT` and both reaction windows have emotion > 0.4: extract both live and replay webcam windows. |
| **STITCH** | PiP webcam bottom-right (320×180) during gameplay. At peak emotion: zoom punch — PiP expands to 480×270 for 0.3s then returns. During slow-mo: webcam moves to bottom-left. |
| **ENHANCE** | Speed ramp: normal → decelerate over 0.5s → 2.0×PTS for 2s → accelerate over 0.5s → normal. Zoom punch at peak: zoompan 100%→130% over 8 frames, hold 12 frames, return. Game state caption (always) + one Sheng library caption at peak (2s, bottom-centre, 52px, white on dark box). Subtle saturation boost (+8%). Dead-time trimming for clips >15s. |
| **PORTRAIT** | Crop to 9:16 (1080×1920). Available as standalone download in PWA. |
| **Duration** | 15–25 seconds |
| **FIFA replay** | If `replayTreatment = DUAL_BEAT`: event footage → live reaction → 0.5s beat → FIFA replay → replay reaction. If `STRONGER_REACTION`: use the stronger webcam window only. |

**Processing time per clip:** ~6–8 seconds

**Speed ramp ffmpeg (setpts with piecewise expression):**
```bash
# RAMP_START/RAMP_END computed from peak emotion timestamp in FaceSnapshot data
# 120fps source → 2.0×PTS = true 2× slow-motion (60fps output)
setpts='if(between(N,RAMP_START-15,RAMP_START),
  PTS*1.0+(N-RAMP_START+15)/15*1.0,
  if(between(N,RAMP_START,RAMP_END),
    2.0*PTS,
    if(between(N,RAMP_END,RAMP_END+15),
      PTS*2.0-(N-RAMP_END)/15*1.0,
      PTS)))'
```

**Zoom punch ffmpeg:**
```bash
zoompan=z='if(between(in,PEAK-8,PEAK+20),1.3+(0.2*sin((in-PEAK)/8*PI/2)),1)':
  x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1280x720
```
Centres on the dominant face bounding box from FaceSnapshot, not frame centre.

### BIG Tier Recipe

**Purpose:** The hero clip. Maximum production value. The moment people share.

| Stage | Treatment |
|---|---|
| **EXTRACT** | TV segments + webcam segments + FIFA replay clip. If `replayTreatment = DUAL_BEAT` (always for BIG): extract both live and replay webcam windows. |
| **STITCH** | Alternating cuts: [3s TV] → [2s webcam face] → [3s TV] → [4s webcam zoom at peak]. At peak emotion: full-screen webcam face for 2s (the "money shot" — the reaction IS the content). Then cut back to TV with PiP. During DUAL_BEAT FIFA replay: TV full-screen showing replay, webcam PiP shows customer watching. |
| **ENHANCE** | Speed ramp: normal → decelerate 0.5s → 2.0×PTS for 3–4s → ramp back (longer hold than STANDARD). Freeze-frame at peak emotion: hold highest-emotion frame for 1.2s via `tpad=stop_duration=1.2`. Screen shake on goal flash: 0.25s oscillating crop offset. Game state caption + Sheng caption (68px) + emotion stinger PNG overlay (80×80px, 60% opacity, 0.8s). Contrast +12%, warm highlights, mild vignette ("sports film" look). Dead-time trimming. |
| **PORTRAIT** | Crop to 9:16 (1080×1920). Available as standalone download in PWA. |
| **Duration** | 20–40 seconds |
| **FIFA replay** | Always DUAL_BEAT: event → live reaction → 0.5s beat → FIFA replay → replay reaction → slow-mo of peak frame from whichever reaction was stronger. |

**Processing time per clip:** ~10–15 seconds

**Freeze-frame ffmpeg:**
```bash
# Peak frame identified from FaceSnapshot with highest emotion intensity
tpad=stop_duration=1.2:stop_mode=clone
```

**Screen shake ffmpeg (goal flash only):**
```bash
# 0.25s oscillating crop offset — subtle, not nauseating
crop=iw-20:ih-20:10+8*sin(t*40):10+6*cos(t*35)
```

**Split-screen mode (two faces detected at peak):**
```bash
ffmpeg -i webcam_120fps.mp4 \
  -filter_complex "
    [0:v]crop={w1}:{h1}:{x1}:{y1},scale=640:720,setpts=2.0*PTS[left];
    [0:v]crop={w2}:{h2}:{x2}:{y2},scale=640:720,setpts=2.0*PTS[right];
    [left][right]hstack=inputs=2[split]
  " \
  -map "[split]" -c:v h264_qsv split_reaction.mp4
```

### DUAL_BEAT Clip Structure (BIG tier)

The signature clip format. Two emotional beats in one clip:

```
[Pre-roll: 3–5s TV footage, normal speed, game state caption]
[EVENT: goal / red card / penalty — TV full-screen]
[BEAT 1 — Live Reaction: 3–4s webcam, speed ramp into slow-mo at peak]
  ↓ 0.5s black beat (breathing room)
[FIFA IN-GAME REPLAY: TV full-screen, webcam PiP bottom-right]
[BEAT 2 — Replay Reaction: 2–3s webcam watching their own replay]
[CLIMAX: slow-mo of whichever beat had higher peak emotion]
  Freeze-frame at absolute peak → Sheng caption → emotion stinger
[Post-roll: 1–2s return to normal speed, fade out]
```

### Face Count Layout Variants

All tiers adjust their layout based on how many faces the FaceScorer detected:

| Faces | Layout adjustment |
|---|---|
| 0 | No webcam shown. TV footage only. No face zoom. |
| 1 | Standard tier-specific layouts as described above. |
| 2 | At peak: alternate cuts between faces every 0.8s (cross-cut). During slow-mo: split-screen side-by-side. |
| 3+ | At peak: wide group shot (no zoom). PiP sized to 400×225 to fit all faces. |

### Color Grading

Applied as a final pass. Two layers stack: emotion grade + tier grade.

**By emotion (from FaceSnapshot dominant emotion):**

| Emotion | Grade |
|---|---|
| Joy | Warm: saturation +10%, slight orange shift in highlights |
| Anger | Punch: contrast +15%, reds +5% |
| Sadness | Cool: saturation -8%, blue shift +5% |
| Surprise | Neutral + brief brightness flash at peak frame (0.1s) |
| Fear | Slight desaturation (-5%), mild vignette |
| Neutral | No adjustment |

**By tier:**

| Tier | Adjustment |
|---|---|
| MICRO | None |
| STANDARD | Saturation +8% |
| BIG | Contrast +12%, warm highlights, mild vignette |

All grades applied via ffmpeg `eq`, `colorbalance`, and `vignette` filters.

### Dead-Time Trimming (STANDARD + BIG only)

For clips longer than 15 seconds, the system identifies segments of the TV feed where inter-frame pixel difference is below 5% for 1+ seconds continuously (FIFA crowd shots, menu screens, loading moments). These segments are trimmed from the output. Not applied to webcam footage or freeze-frame/slow-mo segments.

### Caption Overlay

```bash
# Layer 1: Game state — always present, all tiers
-vf "drawtext=text='{score_minute}':
       fontsize=28:fontcolor=white@0.5:
       fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:
       x=16:y=16:enable='1'"

# Layer 2: Sheng caption — STANDARD + BIG only, at peak moment
-vf "drawtext=text='{sheng_caption}':
       fontsize=52:fontcolor=white:
       fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:
       x=(w-text_w)/2:y=h-80:
       box=1:boxcolor=black@0.5:boxborderw=12:
       enable='between(t,PEAK_T,PEAK_T+2)'"

# Layer 3: Emotion stinger — BIG only, at peak frame
# Rendered as PNG overlay, not text (see §12 for stinger rules)
-i stinger.png -filter_complex "overlay=W-96:H-96:enable='between(t,PEAK_T,PEAK_T+0.8)'"
```

---

## 12. Caption Library

### Three Caption Layers

Every clip receives up to three caption layers. They serve different purposes and appear in different positions. See §11 for ffmpeg overlay implementation.

| Layer | Tiers | Position | Source |
|---|---|---|---|
| **Game State** | ALL | Top-left, 28px, white 50% opacity | `MatchState` at event time |
| **Sheng/Swahili** | STANDARD + BIG | Bottom-centre, 52–68px, white on dark box | `captions.json` library |
| **Emotion Stinger** | BIG only | Bottom-right of face zoom, 80×80px PNG, 60% opacity | Mapped from FER emotion |

### Caption Library File

A JSON file (`/opt/lounge/captions.json`) with entries organised by `(eventContext × emotion)`. Loaded at service startup, selected at clip-enhancement time.

**Seed:** 40 entries at launch. **Target:** 1000+ entries over the first year, added by the owner based on observed moments. No code change required to add captions — just edit the JSON.

```json
{
  "peak_GOAL_CANDIDATE": {
    "happy":     ["SHEEEESH", "KNEW IT WAS GOING IN", "MANZE!", "TOO EASY BRO"],
    "surprised": ["WAIT—", "EVEN HE DIDN'T EXPECT THAT", "HOW???"],
    "angry":     ["UNBELIEVABLE", "THAT'S NOT FAIR", "REFUSES TO ACCEPT REALITY"],
    "neutral":   ["ICE IN HIS VEINS", "DIDN'T EVEN FLINCH", "ZERO REACTION. DEMON."],
    "sad":       ["KNEW IT WAS COMING", "THE PAIN WAS ANTICIPATED"]
  },

  "peak_PENALTY_MISS": {
    "fearful":   ["THE PAIN IS REAL", "COULDN'T WATCH"],
    "angry":     ["ABSOLUTELY FURIOUS", "CONTROLLER ALMOST FLEW", "UNACCEPTABLE"],
    "surprised": ["HE SAW IT. HE STILL MISSED.", "HOW DO YOU MISS THAT"]
  },

  "peak_RED_CARD": {
    "angry":     ["SEE YA", "ENJOY THE WALK", "DESERVED"],
    "surprised": ["THOUGHT IT WAS LEGAL", "IN COMPLETE SHOCK"]
  },

  "match_end_win": {
    "happy":     ["CHAMPIONS", "GG EZ", "CLINICAL FROM START TO FINISH", "FLAWLESS"],
    "surprised": ["DIDN'T THINK WE'D DO IT", "AGAINST ALL ODDS"],
    "neutral":   ["EXPECTED. NEXT.", "ROUTINE VICTORY", "TOO EASY TO CELEBRATE"]
  },

  "match_end_loss": {
    "sad":       ["WE GO AGAIN", "NEXT TIME BRO", "IT HURTS BUT WE MOVE"],
    "angry":     ["ABSOLUTELY ROBBED", "THE GAME WAS RIGGED"],
    "fearful":   ["KNEW IT WAS COMING", "THE DREAD WAS REAL ALL ALONG"]
  },

  "match_end_draw": {
    "neutral":   ["STALEMATE.", "NEITHER BACKING DOWN"],
    "angry":     ["SHOULD HAVE WON THAT", "HOW DID WE NOT FINISH IT"],
    "happy":     ["TAKE THE POINT AND RUN", "WE'LL TAKE IT"]
  },

  "emotion_transition_disallowed_goal": {
    "angry":     ["VAR SAID NO", "THE COMEBACK WAS A LIE", "STOLEN"],
    "surprised": ["WHAT JUST HAPPENED", "THE REF REALLY DID THAT"]
  },

  "emotion_transition_celebration": {
    "happy":     ["PURE JOY", "THE SCENES", "INJECT THIS INTO MY VEINS"]
  },

  "emotion_transition_narrow_escape": {
    "happy":     ["SAVED!", "HOW DID THAT STAY OUT", "ALIVE BY INCHES"],
    "fearful":   ["HEART STOPPED", "NEARLY DONE"]
  },

  "shootout_kick": {
    "happy":     ["NERVES OF STEEL", "BURIED IT"],
    "fearful":   ["THE PRESSURE", "COULDN'T LOOK"],
    "angry":     ["STRAIGHT DOWN THE MIDDLE. WHY."]
  }
}
```

### Context-Aware Selection

When score and match minute are available from MatchState OCR, captions are context-specific:

```python
def get_caption(context: str, emotion: str, match_ctx: MatchState = None) -> str:
    # Emotion transition overrides (from §9 emotion transition detection)
    if context.startswith("emotion_transition_"):
        options = CAPTIONS.get(context, {}).get(emotion)
        if options:
            return random.choice(options)
        # Fall through to generic peak caption

    # Match-context overrides for goals
    if match_ctx and context == "peak_GOAL_CANDIDATE":
        diff = abs(match_ctx.homeScore - match_ctx.awayScore)
        minute = match_ctx.matchMinute

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

    # Standard lookup: exact context + emotion → emotion fallback → universal
    options = CAPTIONS.get(context, {}).get(emotion)
    if not options:
        options = CAPTIONS.get(context, {}).get("neutral")
    if not options:
        options = ["..."]
    return random.choice(options)
```

### Emotion Stinger Set (BIG Tier Only)

Stingers are rendered as **custom-drawn PNG overlays** via ffmpeg `overlay` filter — not emoji characters (which render differently per device). They appear at 60% opacity, bottom-right of the face zoom frame, for 0.8 seconds. Size: 80×80px.

**Approved stingers:**

| FER Emotion | Stinger | Notes |
|---|---|---|
| Joy / Happy | Star burst (sparkle effect) | Clean, universal celebration |
| Surprise | Exclamation marks (‼) | Simple, widely understood |
| Anger | Lightning bolt | Energy without aggression |
| Sadness | Rain droplet | Sympathetic, not mocking |
| Fear | Wide eyes symbol (custom drawn) | Stylised, avoids platform inconsistency |
| Neutral (strong) | Snowflake | "Ice cold" — only when neutral is sustained through a major event |

**Explicitly excluded imagery:** All tongue-related imagery (tongue out, money tongue, etc.), skull/death imagery, religious symbols (prayer hands, crosses, crescents), flag imagery, any real emoji characters. Stingers must be family-friendly, culturally neutral, and suitable for all ages.

Stinger PNG files stored at `/opt/lounge/stingers/` — one per emotion: `joy.png`, `surprise.png`, `anger.png`, `sadness.png`, `fear.png`, `neutral.png`.

### Caption Tone Guidelines

All captions must be:
- **Family-friendly** — no profanity, no crude humor, nothing that would make a parent uncomfortable
- **Culturally respectful** — no religious references, no tribal references, no political content
- **Humorous but refined** — witty, not crude; clever, not mean-spirited
- **Inclusive** — never mock a player's skill level; the humor is in the situation and reaction, not the person

Loser/heartbreak captions must be **sympathetic** not mocking: "We go again", "Next time", "The pain is real" — never "You're terrible" or similar.

### Localisation

All captions can be written in Sheng or Swahili for the Nairobi market. The library is a plain JSON file — no code change required to update or translate it. The owner adds new captions over time based on real observed moments.

---

## 13. Highlight Reel Assembly

After all ClipJobs for a session reach `READY` status, the reel assembler builds the final highlight compilation. The system emits `replay:all_ready` over WebSocket once per session when the last job completes.

### Clip Selection for Reel

From all clips in the session:
1. All BIG tier clips are always included
2. All STANDARD tier clips are included
3. MICRO tier clips are included only if the total clip count is below 5 (ensures short sessions still get a reel)
4. If total clip count exceeds 8, drop the lowest-importance MICRO clips first, then lowest-importance STANDARD clips
5. **Emotional variety**: if 3+ clips share the same dominant emotion, replace the weakest with the next-best clip of a different emotion

### Clip Ordering — Narrative Arc

Clips are ordered for emotional impact, not chronological order:

1. **Opener** — second-highest importance clip (strong start, not the best)
2. **Middle clips** — remaining clips in chronological order
3. **Climax** — highest importance clip (the best moment, positioned for maximum impact)
4. **Closer** — MATCH_END reaction (see End Card below)

**Exception:** Penalty shootout groups (see below) are always kept in chronological order and placed as a single block.

### "Highlight of the Match" Promotion

The single highest-importance clip across the session receives special treatment:
- A `"MOMENT OF THE MATCH"` title card (1.5s) immediately before it
- 0.5s longer dwell before the next transition
- Slightly louder audio mix (+2 dB)

### Penalty Shootout Grouping

When `MatchState.isShootout = true` (see §8 for detection), shootout clips share a `shootoutGroup` tag. Instead of individual transition cards, the reel assembler renders them as a continuous montage:

```
["PENALTY SHOOTOUT" title card — 1.5s]
[Kick 1: event + reaction — hard cut, no transition card]
[Kick 2: event + reaction — hard cut]
[Kick 3: event + reaction — hard cut]
  ...
[Final kick: event + reaction + slow-mo of decisive moment (BIG treatment)]
[Winner reaction: 3s face zoom with caption]
[Loser reaction: 2s face zoom with caption (sympathetic tone — see §12)]
```

Fast hard cuts between kicks build tension. Each kick is trimmed to 8–12s. The final kick always gets BIG tier treatment regardless of its original tier.

### End Card — Winner / Loser Closing Shot

The final reel beat uses the MATCH_END event:

**Customer won** (higher score at session end):
- 3-second slow-mo of peak joy frame from post-match webcam footage
- Sheng winning caption from library
- Emotion stinger: star burst

**Customer lost:**
- 2-second face shot from post-match webcam (not slow-mo — keep their dignity)
- Sympathetic Sheng caption ("We go again", "Next time bro")
- No emotion stinger

**Draw:**
- 2-second neutral shot
- Draw-specific caption ("Stalemate.", "Neither backing down")

### Reel Assembly Structure

```
[Session title card: "NEO LOUNGE — Station 2 — [Date] — [Final Score]" — 2s]
[Opener clip — second-highest importance]
[Transition card: "Moment 1" — 0.8s]
[Clip 2]
[Transition card: "Moment 2" — 0.8s]
  ...
[If shootout: "PENALTY SHOOTOUT" card → grouped shootout sequence]
  ...
["MOMENT OF THE MATCH" card — 1.5s]
[Climax clip — highest importance, BIG treatment]
[End card: winner/loser/draw closing shot — 2–3s]
[QR code frame — 2s, links to PWA download]
[NEO LOUNGE branding card — 1.5s]
```

Transition card durations: MICRO clips get no transition card (fast cut). STANDARD clips: 0.8s. BIG clips: 1.2s with a slightly slower reveal.

Title cards are generated via FFmpeg `drawtext` on a black `lavfi color` source. Assembly uses `-c copy` where possible. Full reel generation takes ~3–5 seconds.

### Outputs

- `highlight_reel_landscape.mp4` — 1280×720, for lounge TV display and tablet
- `highlight_reel_portrait.mp4` — 1080×1920, for WhatsApp/TikTok sharing

Both served from the PWA by auth code. The portrait file is what appears when a customer scans the QR code on their phone.

### Session Watermark

All clips and the reel carry a persistent watermark:
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

At TTL expiry (cleanup worker runs every 5 minutes):
  DELETE /var/lounge/webcam{n}/session_{id}/   (webcam raw footage)
  DELETE /var/lounge/replays/session_{id}/     (all clip files — enhanced, portrait, reel)
  DELETE FROM face_snapshots WHERE session_id = X
  DELETE FROM pending_events WHERE session_id = X
  DELETE FROM game_replays WHERE session_id = X
  UPDATE clip_jobs SET
    tv_segment_path = NULL, webcam_segment_path = NULL,
    game_replay_path = NULL, stitched_path = NULL,
    enhanced_path = NULL, portrait_path = NULL
    WHERE session_id = X
  UPDATE sessions SET purged_at = NOW() WHERE id = X
```

**FaceSnapshot purge:** FaceSnapshot rows are high-volume (~4 rows/second/station, ~11.5 MB/hour across all 4 stations). They are essential during session processing for importance scoring and enhancer face data, but have no value after the session's clips are delivered. They are deleted at TTL expiry along with all other session data.

**ClipJob rows are kept** (with file paths nulled) so the session history remains queryable. The `purgedAt` timestamp on Session enables the PWA to return **410 Gone** with a friendly "Your highlights have expired" message.

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

Auto-managed by ffmpeg `-segment_wrap 90` (3-minute rolling buffer). Oldest segments overwrite automatically. No cleanup daemon needed. Stored on tmpfs (`/run/lounge/`) — clears on reboot.

### Storage Budget (External NVMe 256 GB)

| Data | Size | Retention |
|---|---|---|
| TV ring buffer (tmpfs/RAM) | ~340 MB | Auto-overwrite |
| Webcam raw per session | ~150 MB | Until TTL expiry |
| Clips per session (all tiers) | ~50–100 MB | Until TTL expiry |
| FaceSnapshot DB rows per session | ~2–3 MB | Until TTL expiry |
| Security camera footage | ~5 GB/day | Migrated to USB HDD nightly (only current day on NVMe) |
| PostgreSQL database | ~100 MB | Backed up nightly |

With a 60-minute TTL, 4 stations, and nightly security footage migration to USB HDD, peak active data is well under 2 GB. The 256 GB external NVMe is sufficient.

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

## 17. User Journey

**Session start:**
1. Staff opens kiosk → selects station → selects duration → takes payment (cash or M-Pesa)
2. Session starts: TV → PS5 HDMI (ADB), Tuya sync box → HDMI sync mode (LEDs follow gameplay via Tuya Local API)
3. ffmpeg capture services start for that station (TV ring buffer via V4L2 capture card, webcam at 120fps). Game analyzer reads ring buffer segments at 320×240/2fps.
4. Audio detector starts listening on that station's audio channel
5. FaceScorer starts sampling webcam at 4fps → writes FaceSnapshot rows to DB
6. **Baseline calibration begins** — first 120 seconds of audio/emotion/movement data establishes the customer's personal baseline (20th percentile, resistant to spike contamination)

**During gameplay:**
7. YAMNet detects crowd roar → fires PendingEvent (source=AUDIO_AI)
8. Game analyzer reads score/minute → updates MatchState
9. Game analyzer detects FIFA onscreen replay → records GameReplay
10. Game analyzer detects visual events (goal flash, card) → fires PendingEvent (source=GAME_ANALYZER)
11. FaceScorer detects strong face-only reaction without audio/visual event → fires PendingEvent (source=FACE_ONLY)
12. EventMerger groups events within 25s window, corroborates multi-source events (source=BOTH)
13. **Importance scoring** runs: weighted fusion of face reaction, audio, visual event, context, face presence → assigns tier (MICRO/STANDARD/BIG)
14. **Dynamic post-roll** — clip end determined by face emotion fade-out, not fixed timer (per-tier caps: MICRO=12s, STANDARD=30s, BIG=45s)
15. ClipJob inserted with tier, importance score, and replay treatment → worker wakes instantly via LISTEN/NOTIFY
16. Worker processes: EXTRACT → STITCH (tier-specific layout) → ENHANCE (tier-specific effects) → PORTRAIT (STANDARD+BIG only) → VERIFY
17. socket.io → tablet: "2 moments captured" — counter only, no clip preview on tablet

**Match end:**
18. Match end detected (game analyzer fulltime template OR manual "End Game" button)
19. Synthetic MATCH_END event injected by EventMerger
20. Webcam continues recording 60 more seconds (late clip extraction window)
21. Final MATCH_END ClipJob processed → end card generated (winner/loser/draw treatment — see §13)
22. Reel assembler builds highlight reel: narrative arc ordering, "Moment of the Match" promotion, shootout grouping if applicable (see §13)
23. socket.io → tablet: "Your highlights are ready — scan the QR code below"
24. QR code displayed on tablet (links to PWA via 6-character `authCode`). No clip playback on tablet.
25. Customer scans QR → phone connects to lounge WiFi → PWA shows progress bar → downloads landscape + portrait clips

**Session end:**
26. Timer hits zero (or staff ends session)
27. TV → screensaver (ADB), Tuya sync box → static ambient color mode (Tuya Local API)
28. All capture services stop for this station (FaceScorer, audio detector, webcam, game analyzer)
29. TTL clock starts (`Settings.replayTTLMinutes`, default 60 minutes)
30. At TTL: all clip files, raw footage, FaceSnapshot rows, and PendingEvent rows deleted. PWA returns 410 Gone.

---

## 18. Phased Rollout

### Phase 1 — Launch (full system)

All hardware ships at launch. All 4 stations are identical: PS5, TV, 120fps webcam, HDMI capture card, tablet. The full pipeline runs from day one.

**Hardware at launch:**
- 2× Lenovo ThinkCentre Neo 50Q Gen 4 (primary + cold spare)
- 1× External USB-C NVMe SSD 256 GB in enclosure (boot/data drive, moves between PCs on failover)
- 4× HDMI splitters (1×2, 4K@60Hz, HDCP 2.2)
- 4× HDMI capture cards (UVC, H.264, MS2130 chipset — also provides TV audio via USB Audio Class)
- 4× Tuya HDMI Sync Boxes (ambilight LEDs + HDMI passthrough to capture card)
- 4× 720p 120fps webcams (all stations identical)
- 10-port powered USB 3.0 hub
- TP-Link TL-SG1008PE unmanaged PoE+ switch
- 5× PoE security cameras
- 4× Android tablets
- 1500VA UPS
- 1 TB USB archive drive
- Color-coded cables with matching port stickers on both PCs

**Software at launch:**
- TV ring buffer (3-minute, tmpfs)
- Webcam capture (all 120fps)
- FaceScorer (YuNet + FER at 4fps per station)
- YAMNet audio detection
- Game stream visual analyzer (320×240/2fps)
- EventMerger with importance scoring and tier assignment
- Full 3-stage clip processing (EXTRACT → STITCH → ENHANCE)
- DUAL_BEAT FIFA replay treatment
- Sheng/Swahili caption library (40 seed entries)
- Emotion stinger overlays
- Highlight reel assembly with narrative arc
- Replay PWA with authCode-keyed access
- Security camera recording
- Health monitoring + UPS shutdown

**Processing time for 10-min match (3–5 clips):** Most clips done before match ends. Last clip + reel ready ~30 seconds after match end.

### Phase 2 — Growth (no hardware changes)

Software-only improvements after the lounge is running and generating data:
- Expand caption library toward 1000+ entries based on observed moments
- Tune importance scoring weights based on customer feedback
- Tune YAMNet confidence threshold based on false positive rate
- Add per-station baseline calibration refinements
- Commission custom stinger PNG artwork

### Software Kill-Switches

If the i5-13420H struggles under full load (unlikely given 8 cores), individual pipeline stages can be disabled without code changes via Settings:

| Setting | Effect when disabled |
|---|---|
| `audioDetectionEnabled = false` | YAMNet stops; only game analyzer + face triggers fire events |
| `gameAnalysisEnabled = false` | Game analyzer stops; only audio + face triggers fire events |
| `stage2Enabled = false` | No webcam stitching; clips are TV-only extracts |
| `stage3Enabled = false` | No AI enhancement; clips are stitched but without effects/captions |

These degrade gracefully — a TV-only clip is still valuable. The system always produces something.

---

## 19. Error Handling

### Infrastructure Failures

| Scenario | Handling |
|---|---|
| **Internet outage** | Africa's Talking routes via 4G LTE dongle. PWA still works (local WiFi). |
| **M-Pesa timeout** | 30 seconds → retry/switch-to-cash buttons |
| **Duplicate webhooks** | Idempotent handler checks if transaction already COMPLETED |
| **Power cut** | UPS graceful shutdown: SIGTERM ffmpeg, CHECKPOINT Postgres, power off cleanly |
| **Hardware fault** | Staff can grant free time or transfer session |
| **NVMe full** | Alert via SMS + dashboard; old security footage migrated aggressively |
| **Temperature warning** | 3 consecutive readings > `alertTempCelsius` → SMS to `alertSmsNumber` + WebSocket alert |

### Capture Pipeline Failures

| Scenario | Handling |
|---|---|
| **Capture service crash** | systemd watchdog restarts within 2 seconds; `sdnotify` keepalive required |
| **Ring buffer miss** | pre_roll clamped to available footage; warn in logs but don't skip clip |
| **Webcam disconnects mid-session** | Service restarts; ClipJob proceeds as TV-only. FaceScorer stops; importance scoring uses audio+visual only (face weights → 0) |
| **Game analyzer loses feed** | Falls back to audio-only + face-only detection; logs gap period |

### FaceScorer Failures

| Scenario | Handling |
|---|---|
| **YuNet face detection fails** | `facePresenceScore = 0`, `faceReactionScore = 0`. Importance scoring continues with remaining signals. Clip produced without face zoom. |
| **FER emotion inference fails** | Use `neutral` as dominant emotion. Caption selection falls back to emotion-neutral entries. No stinger overlay. |
| **No FaceSnapshot rows for clip window** | Enhancer skips face-dependent effects (zoom, stinger, emotion color grade). PiP uses full webcam frame. |
| **Baseline calibration has no data** (session < 120s) | Use global defaults: `audioBaseline = 0.3`, `emotionBaseline = 0.2`, `movementBaseline = 0.1` |

### Importance Scoring Edge Cases

| Scenario | Handling |
|---|---|
| **All signals are zero** | `importanceScore = 0.0`, tier = MICRO. Clip still created (game state caption only). |
| **Face-only trigger without audio/visual** | Valid source=FACE_ONLY event. Scored normally; often produces MICRO or low STANDARD. |
| **Extreme baseline (very reactive customer)** | Baseline recalibrates upward; only truly exceptional moments produce high scores. System still produces at least the MATCH_END clip. |

### Clip Processing Failures

| Scenario | Handling |
|---|---|
| **EXTRACT fails** | Skip clip. Log warning. Tablet shows "clip unavailable". |
| **STITCH fails** | Fall back to TV-only extract (no webcam). Status → `STITCH_FALLBACK`. |
| **ENHANCE fails** | Serve the stitched clip without effects. Status → `ENHANCE_FALLBACK`. |
| **PORTRAIT fails** | Serve landscape only. Portrait download hidden in PWA. |
| **ffprobe VERIFY fails** (corrupt/short clip) | Discard clip, status → `FAILED`. |
| **FIFA replay detection misses** | `replayTreatment = LIVE_ONLY`. Clip uses live reaction only. No DUAL_BEAT. |
| **FIFA replay detected but no replay webcam footage** | Fall back to `LIVE_ONLY` treatment. |
| **Shootout false positive** (3+ events near 90' but not penalties) | Clips still valid individually. Reel grouping may look odd — acceptable edge case. |

### Reel Assembly Failures

| Scenario | Handling |
|---|---|
| **Zero clips ready** | No reel generated. Tablet shows "No highlights captured this session." |
| **Some clips FAILED** | Reel assembled from available clips only. PWA hides failed clip entries. |
| **Reel ffmpeg concat fails** | Retry once. If retry fails, serve individual clips only (no reel). |
| **OCR fails to read score** | Caption selection falls back to emotion-only context; game state overlay shows "—" |

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
