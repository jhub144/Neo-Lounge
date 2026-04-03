# Neo Lounge — Master Build Checklist (Stages 4–10)

> **How to use this file:**
> - Stages 1–3 (Prompts 0–22) are complete. This checklist continues from Prompt 23.
> - Work from top to bottom. Every item depends on the ones above it.
> - Check off each item as you complete it: change `[ ]` to `[x]`
> - If you get stuck, paste the error into Claude Code
> - When you feel overwhelmed: look at ONLY the next unchecked box
> - At the start of every session, read `docs/WORKING-RULES.md` and `docs/SPEC.md`

---

## What Already Exists (Stages 1–3 Complete)

- [x] Express API on port 3000 with all 27 endpoints
- [x] PostgreSQL with 11 tables, all enums, seed data (4 stations, owner PIN 0000, 5 cameras, 300 KES/hr)
- [x] Pricing utilities with 14 passing tests
- [x] Staff PIN authentication with requireStaff and requireOwner middleware
- [x] Station routes (list, detail, update)
- [x] Session routes (create, end, extend, transfer)
- [x] Queue routes (add, remove)
- [x] Settings, security events, and dashboard endpoints
- [x] WebSocket with 10 real-time event types
- [x] Timer service (auto-end sessions, 2-minute warnings)
- [x] Mock hardware services (ADB, Tuya, capture card)
- [x] Kiosk app on port 3001 (PIN login, station grid, booking modal, live timers, session panel, fault handling, transfers, queue badges, shift log)
- [x] Integration test passed, code cleaned up

---

## Stage 4: Tablet App (Per-Station Customer Display)

### Prompt 23 — Tablet App Scaffold + Idle State
- [x] Initialise Next.js + TypeScript + Tailwind in `apps/tablet`
- [x] Configure dev server on port 3002
- [x] Create API client (`apps/tablet/src/lib/api.ts`) pointing to `http://localhost:3000`
- [x] Create WebSocket client (`apps/tablet/src/lib/socket.ts`) connecting to API server
- [x] Add `STATION_ID` environment variable (default: 1)
- [x] Create main page with Idle state: full-screen dark background, large station name centred, lounge branding, subtle animated pulse
- [x] Connect to WebSocket, listen for `station:updated` events for this station's ID
- [x] Log to console when station status changes to ACTIVE
- [x] **TEST:** Start API + tablet app → idle screen shows with station name
- [x] **TEST:** WebSocket connected (check browser console)
- [x] Git commit: `git add . && git commit -m "Tablet app scaffold with idle state"`

### Prompt 24 — Tablet Active Session + Countdown Timer
- [x] Fetch current session from `GET /api/stations/{STATION_ID}` when status is ACTIVE
- [x] Display large countdown timer (MM:SS) centred on screen — readable from 2+ metres
- [x] Listen for `session:tick` WebSocket events to update countdown in real time
- [x] Show station name smaller at the top
- [x] Show muted "Session active" label below timer
- [x] Listen for `session:warning` — timer turns amber, background pulses, text changes to "Session ending soon"
- [x] Listen for `session:ended` — return to Idle state
- [x] State transitions working: Idle → Active → Warning → Idle
- [x] **TEST:** Book station from kiosk → tablet shows countdown timer
- [x] **TEST:** Wait for 2-minute warning → styling changes to amber
- [x] **TEST:** Session ends → tablet returns to idle
- [x] Git commit: `git add . && git commit -m "Tablet active session with live countdown"`

### Prompt 25 — Tablet Extend Button + Payment Flow
- [x] Add "Extend Time" button always visible below countdown timer
- [x] Tapping opens duration picker overlay: +10m, +20m, +30m, +1hr with prices
- [x] Each button shows price calculated from current rate via `GET /api/settings`
- [x] Payment method toggle: Cash / M-Pesa
- [x] Cash flow: shows "Please pay [amount] KES at the counter", waits for staff confirmation
- [x] M-Pesa flow: phone number input → `POST /api/payments/mpesa/initiate` → waiting spinner
- [x] Listen for `payment:confirmed` → timer updates with extended time, close overlay
- [x] Listen for `payment:timeout` → show "Payment timed out" with Retry and Cancel buttons
- [x] After successful extension, overlay closes and countdown shows updated time
- [x] **TEST:** Book 5-min session → tap Extend on tablet → select +10m Cash → confirm on kiosk → timer updates
- [x] **TEST:** M-Pesa flow shows waiting screen → times out → verify timeout UI
- [x] Git commit: `git add . && git commit -m "Tablet extend session with payment flow"`

### Prompt 26 — Tablet Game End Button + QR Code Display
- [x] Add smaller "End Game" button in corner of active state
- [x] Tapping calls `POST /api/games/{gameId}/end`
- [x] Handle gracefully if no active game exists
- [x] Show brief confirmation: "Game ended. Next game starts automatically"
- [x] Create Game End state: "Game Over" message + QR code area
- [x] Install QR code library (`qrcode.react`)
- [x] QR code encodes: `http://{API_IP}/replays?auth={authCode}&game={gameId}`
- [x] Show "Scan to download your replays" text
- [x] Auto-dismiss Game End state after 30 seconds, return to active countdown
- [x] Add "Skip" button to dismiss immediately
- [x] Listen for `game:ended` WebSocket events (from YAMNet, once built) — trigger Game End state
- [x] Listen for `replay:ready` WebSocket events — update QR code or show notification
- [x] Create Session End state: "Session Complete" + final QR code for all replays
- [x] Show "Replays available for 1 hour" text
- [x] Session End auto-returns to Idle after 60 seconds
- [x] **TEST:** Book session → tap "End Game" → QR code shows → auto-dismiss after 30s
- [x] **TEST:** End session from kiosk → tablet shows Session Complete → returns to idle
- [x] Git commit: `git add . && git commit -m "Tablet game end button and QR replay display"`

### Prompt 27 — Tablet Polish + Fullscreen Kiosk Mode
- [x] Add service worker for offline shell caching
- [x] Add `manifest.json` for PWA install: fullscreen display mode, dark theme, lounge name
- [x] Hide all browser UI: no scroll bars, no text selection, no pull-to-refresh
- [x] Prevent pinch zoom and long-press context menu
- [x] Add WebSocket auto-reconnect with "Reconnecting..." indicator, retry every 3 seconds
- [x] Add hidden settings gesture: 5 rapid taps on station name reveals:
  - [x] Station ID selector
  - [x] API server URL input
  - [x] Reload button
- [x] Handle API unreachable on load: show "Connecting to server..." with retry
- [x] Handle invalid station: show error with settings gesture hint
- [x] Run existing API test suite — no regressions
- [x] **TEST:** Open tablet app in Chrome on phone/tablet → fills screen
- [x] **TEST:** Hidden settings only appear with 5-tap gesture
- [x] **TEST:** Disconnect API → reconnection indicator appears → restart API → tablet recovers
- [x] Git commit: `git add . && git commit -m "Tablet kiosk mode, PWA, auto-reconnect"`


---

## Stage 5: Customer Replay PWA

### Prompt 28 — PWA Scaffold + Auth Code Entry
- [x] Initialise Next.js + TypeScript + Tailwind in `apps/pwa`
- [x] Configure dev server on port 3003
- [x] Create API client pointing to Main API
- [x] Landing page: if URL contains `?auth={code}`, auto-fetch replays via `GET /api/replays/{authCode}`
- [x] If no auth code in URL, show 6-character code entry screen
- [x] Large input field styled like PIN entry (one box per character)
- [x] "View Replays" submit button
- [x] Invalid code shows "Code not found — check your receipt or ask staff"
- [x] Dark theme matching lounge aesthetic
- [x] Add service worker for PWA install + offline shell caching
- [x] Add `manifest.json`: fullscreen, dark theme, "Neo Lounge Replays" name
- [x] **TEST:** Open `http://localhost:3003` → code entry screen shows
- [x] **TEST:** Enter valid auth code from existing session → navigates to replay page
- [x] **TEST:** Enter invalid code → error message shows
- [ ] Git commit: `git add . && git commit -m "Customer PWA scaffold with auth code entry"`

### Prompt 29 — PWA Replay List + Download
- [x] After successful auth code lookup, show session info header: station name, date, total duration
- [x] List games played in session, grouped by game
- [x] Under each game: list replay clips with timestamps
- [x] Each clip has "Download" button triggering direct MP4 download
- [x] If stitched highlight reel exists, show "Download Highlights" prominently at top of each game
- [x] If no clips exist: show "No replays yet — clips will appear here during gameplay"
- [x] Auto-refresh clip list every 10 seconds while session is active
- [x] Listen for `replay:ready` WebSocket events if connected
- [x] Expiry countdown: "Replays available for X more minutes"
- [x] If replays expired: "These replays are no longer available"
- [x] Single column mobile layout with large tap targets
- [x] Clips show placeholder thumbnail (real thumbnails later)
- [x] Handle empty states gracefully (no replay files exist yet)
- [x] **TEST:** Create session via kiosk → open PWA with auth code → page loads with session info
- [x] **TEST:** No replay files → shows "no replays yet" state
- [ ] Git commit: `git add . && git commit -m "PWA replay list with download buttons"`

---

## Stage 6: Owner Dashboard

### Prompt 30 — Dashboard Scaffold + Revenue Overview
- [x] Initialise Next.js + TypeScript + Tailwind in `apps/dashboard`
- [x] Configure dev server on port 3004
- [x] Create API client pointing to Main API
- [x] PIN login screen — only accepts OWNER role
- [x] Revenue section: today's total revenue (large, prominent number)
- [x] Revenue per station (4 smaller cards)
- [x] Number of sessions today
- [x] Average session duration
- [x] Cash vs M-Pesa split percentage
- [x] All data from `GET /api/dashboard`
- [x] Active sessions section: live station grid showing current status of all 4 stations
- [x] For active stations: timer countdown, customer since time, amount paid
- [x] Connect via WebSocket for real-time updates
- [x] Responsive: works on phone (single column) and desktop (grid)
- [x] Auto-refresh dashboard data every 60 seconds
- [x] **TEST:** Log in with owner PIN (0000) → dashboard shows
- [x] **TEST:** Book session via kiosk → dashboard shows active session and revenue
- [x] **TEST:** End session → dashboard updates
- [x] Git commit: `git add . && git commit -m "Owner dashboard with revenue and active sessions"`

### Prompt 31 — Dashboard Session History + Security Events
- [x] Session history section: scrolling list of today's completed sessions
- [x] Each row: station, start time, end time, duration, total paid, payment method, staff member
- [x] Tap row to expand and see all transactions for that session
- [x] Filter by station and payment method
- [x] Pagination or "load more" for busy days
- [x] Security events section: chronological list from `GET /api/events`
- [x] Each event: type badge (colour-coded), timestamp, description, staff member, station
- [x] Filter by event type (dropdown)
- [x] Tap event to see metadata
- [x] Placeholder for "View camera clips" link
- [x] Add tab navigation: Overview, History, Security
- [x] **TEST:** Create sessions, extend one, transfer one, end them → History tab shows accurate records
- [x] **TEST:** Security tab shows all SecurityEvents logged
- [x] Git commit: `git add . && git commit -m "Dashboard session history and security events"`

### Prompt 32 — Dashboard System Health + Service Controls
- [x] System Health section:
  - [x] API server status (green/red from `GET /api/health`)
  - [x] Database status (from health check response)
  - [x] Video Pipeline status (`GET /pipeline/health` — handle connection refused gracefully)
  - [x] Camera status for all 5 cameras from `GET /api/security/cameras`
  - [x] External HDD storage from video pipeline — used/total with percentage bar
  - [x] Estimated days of retention remaining
- [x] Service control buttons (owner only):
  - [x] Restart API, Restart Video Pipeline, Restart PostgreSQL
  - [x] Each calls `POST /api/system/restart-service`
  - [x] Confirm dialog before restart
  - [x] "Restarting..." spinner, re-check health after 10 seconds
- [x] Hardware status panel:
  - [x] Per-station TV connection status
  - [x] Per-station LED controller status
  - [x] Reads from mock hardware services for now
- [x] Add `GET /api/hardware/status` endpoint to API (queries mock ADB + Tuya for all 4 stations)
- [x] Add System tab to dashboard navigation
- [x] **TEST:** System tab → all services green (or "not running" for video pipeline)
- [x] **TEST:** Restart button → confirm dialog → spinner
- [x] **TEST:** Hardware panel → 4 stations with mock-connected status
- [x] Git commit: `git add . && git commit -m "Dashboard system health, hardware status, service controls"`

---

## Stage 7: M-Pesa Payment Integration

### Prompt 33 — Africa's Talking Service Module + Mock ✅
- [x] Create payment service interface in `services/payments.ts` (or matching existing pattern):
  - [x] `initiateStkPush(phoneNumber, amount, transactionId)` → `{success, checkoutRequestId}`
  - [x] `processCallback(payload)` → `{transactionId, success, receiptCode?}`
  - [x] `checkInternetAvailability()` → `boolean`
- [x] Create MOCK implementation:
  - [x] `initiateStkPush`: logs request, waits 3 seconds, returns success with fake checkout ID
  - [x] After 5 seconds, auto-triggers callback endpoint (simulates customer confirming)
  - [x] `MOCK_PAYMENT_SHOULD_FAIL` env variable — when true, simulates timeout
  - [x] `processCallback`: validates payload shape, returns success with fake receipt
- [x] Create REAL implementation stub:
  - [x] Uses `africastalking` npm package
  - [x] Reads `AT_API_KEY`, `AT_USERNAME`, `AT_ENVIRONMENT`, `AT_SHORTCODE` from env
  - [x] Clear TODO comments for real implementation
- [x] Factory pattern: export correct implementation based on `USE_MOCK_PAYMENTS` env variable
- [x] Write tests:
  - [x] Test `initiateStkPush` returns expected shape
  - [x] Test `processCallback` returns expected shape
  - [x] Test auto-callback simulation triggers after delay
- [x] **TEST:** `npm test` — all tests pass
- [x] Git commit: `git add . && git commit -m "Africa's Talking payment service with mock"`

### Prompt 34 — M-Pesa API Endpoints + Webhook ✅
- [x] `POST /api/payments/mpesa/initiate`:
  - [x] Requires: phoneNumber, amount, sessionId
  - [x] Validates Kenyan phone format (254XXXXXXXXX or 07XXXXXXXX → normalise to 254)
  - [x] Creates Transaction with status PENDING, method MPESA
  - [x] Calls `paymentService.initiateStkPush()`
  - [x] Locks station (status PENDING) to prevent concurrent bookings
  - [x] Returns `{ transactionId, status: "pending" }`
- [x] `POST /api/payments/mpesa/callback`:
  - [x] Calls `paymentService.processCallback(req.body)`
  - [x] Finds Transaction by checkoutRequestId
  - [x] IDEMPOTENT: if transaction already COMPLETED, return 200, do nothing
  - [x] On success: update Transaction to COMPLETED, store mpesaReceipt, activate session, emit `payment:confirmed`, create SecurityEvent
  - [x] On failure: update Transaction to FAILED, unlock station, emit `payment:timeout`
  - [x] Log full raw webhook payload to SecurityEvent metadata
- [x] Update `POST /api/sessions` to handle M-Pesa:
  - [x] If method is MPESA, create session in PENDING state, initiate STK push
  - [x] Session activates only when webhook confirms
- [x] `GET /api/payments/status` returns `{ mpesaAvailable: boolean }`
- [x] Write tests:
  - [x] Test initiate creates PENDING transaction
  - [x] Test callback completes transaction (idempotent)
  - [x] Test callback with already-completed transaction returns 200 without side effects
  - [x] Test failed payment unlocks station
- [x] **TEST:** `npm test` — all tests pass
- [x] Git commit: `git add . && git commit -m "M-Pesa initiate and callback endpoints"`

### Prompt 35 — Kiosk M-Pesa UI Integration ✅
- [x] Check M-Pesa availability on kiosk load (`GET /api/payments/status`)
- [x] If unavailable: show Cash toggle only with "M-Pesa unavailable" note
- [x] If available: show Cash / M-Pesa toggle
- [x] M-Pesa selected: show phone number input (Kenyan format)
- [x] "Send M-Pesa Request" button → calls `POST /api/payments/mpesa/initiate`
- [x] Show waiting state: "M-Pesa request sent to 07XX XXX XXX — waiting..."
- [x] Show 30-second countdown timer during wait
- [x] Listen for `payment:confirmed` WebSocket → close modal, success toast, station ACTIVE
- [x] Listen for `payment:timeout` → show "Payment timed out" + "Switch to Cash"
- [x] Staff can switch to Cash after timeout (station already freed by webhook failure path)
- [x] Extension flow: same M-Pesa option works in extend session modal
- [x] **TEST (mock):** Select M-Pesa → enter phone → send → mock auto-confirms → session activates
- [x] **TEST (mock fail):** Set `MOCK_PAYMENT_SHOULD_FAIL=true` → M-Pesa times out → switch to cash
- [x] Git commit: `git add . && git commit -m "Kiosk M-Pesa payment UI with timeout and fallback"`

---

## Stage 8: Hardware Control (ADB + Tuya)

### Prompt 36 — Real ADB Service Implementation
- [x] Add real ADB implementation alongside existing mock in ADB service module
- [x] Uses `child_process` to execute `adb` commands
- [x] Reads each station's `adbAddress` from database (e.g., "192.168.1.101:5555")
- [x] Implement all commands:
  - [x] `connect(stationId)`: `adb connect {adbAddress}`
  - [x] `switchToHdmi(stationId)`: input select HDMI port
  - [x] `switchToAndroidTv(stationId)`: input select TV internal apps
  - [x] `setBrightness(stationId, percent)`: set backlight 0–100
  - [x] `powerOff(stationId)`: send power off
  - [x] `powerOn(stationId)`: send wake
  - [x] `getStatus(stationId)`: check if TV reachable
- [x] Connection management: attempt connect to all 4 TVs on startup
- [x] Track per-TV connection status
- [x] On command failure: mark TV disconnected, attempt reconnect
- [x] Auto-reconnect every 30 seconds for disconnected TVs
- [x] Update `GET /api/hardware/status` to return TV connection status
- [x] Switching via `USE_MOCK_ADB` environment variable
- [x] Write tests using mock adb binary (no real hardware needed):
  - [x] Test `connect` builds correct command string
  - [x] Test `switchToHdmi` sends correct input command
  - [x] Test reconnect logic on failure
- [x] **TEST:** `npm test` — all tests pass
- [x] Git commit: `git add . && git commit -m "Real ADB service with TV control and auto-reconnect"`

### Prompt 37 — Real Tuya LED Service Implementation
- [x] Install `tuyapi` npm package (native Node.js Tuya local protocol)
- [x] Add real Tuya implementation alongside existing mock
- [x] Each station's `tuyaDeviceId` read from database
- [x] Tuya devices need: deviceId, localKey (from TUYA_LOCAL_KEYS env JSON)
- [x] Implement LED modes:
  - [x] `setSyncMode(stationId)`: HDMI sync — LEDs follow gameplay colours
  - [x] `setAmbientMode(stationId)`: slow PlayStation blue pulse
  - [x] `turnOff(stationId)`: LEDs completely off
  - [x] `getStatus(stationId)`: check if Tuya device reachable
- [x] Connection monitoring + auto-reconnect (same pattern as ADB)
- [x] Update `GET /api/hardware/status` to include LED controller status
- [x] Switching via `USE_MOCK_TUYA` environment variable
- [x] Write tests:
  - [x] Test each mode sends correct Tuya command
  - [x] Test connection failure handling
  - [x] Test auto-reconnect logic
- [x] **TEST:** `npm test` — all tests pass
- [x] Git commit: `git add . && git commit -m "Real Tuya LED service with sync, ambient, off modes"`

### Prompt 38 — Hardware Integration into Session Lifecycle
- [x] Session created + payment confirmed:
  - [x] Call `adbService.switchToHdmi(stationId)`
  - [x] Call `adbService.setBrightness(stationId, 100)`
  - [x] Call `tuyaService.setSyncMode(stationId)`
  - [x] Hardware failures log but DON'T block the session
- [x] Session ends:
  - [x] Call `adbService.switchToAndroidTv(stationId)`
  - [x] Call `tuyaService.setAmbientMode(stationId)`
  - [x] Failures log but don't block
- [x] Session transferred:
  - [x] Deactivate hardware on old station (same as session end)
  - [x] Activate hardware on new station (same as session start)
- [x] Graceful degradation:
  - [x] If hardware fails, show warning badge on kiosk station card: "TV not responding" / "LEDs offline"
  - [x] Hardware status endpoint accessible to staff (30s polling in kiosk)
- [x] All existing tests still pass (hardware calls use mocks in test environment)
- [x] **TEST (mocks):** All 173 tests pass
- [x] Git commit: `git add . && git commit -m "Hardware control wired into session lifecycle"`

---

## Stage 9: Video Pipeline + Security Cameras

### Prompt 39 — Video Pipeline Scaffold + Health Check
- [ ] Initialise Python FastAPI project in `services/video-pipeline/`
- [ ] Create `requirements.txt`: fastapi, uvicorn, httpx
- [ ] Configure on port 8000
- [ ] Create `main.py` with FastAPI app
- [ ] `GET /pipeline/health` → `{ status: "ok", uptime, capture_streams: 0, cameras_recording: 0 }`
- [ ] Create folder structure:
  - [ ] `capture/` — station capture management
  - [ ] `security/` — security camera recording
  - [ ] `detection/` — YAMNet audio detection (placeholder)
  - [ ] `config.py` — env variable configuration
- [ ] Environment variables: `MAIN_API_URL`, `CAPTURE_BUFFER_DIR`, `REPLAY_DIR`, `SECURITY_RECORDING_DIR`, `SECURITY_CLIPS_DIR`, `USE_MOCK_CAPTURE`, `USE_MOCK_CAMERAS`
- [ ] Create mock capture module (generates test video via ffmpeg instead of USB device)
- [ ] **TEST:** `cd services/video-pipeline && uvicorn main:app --port 8000` → starts
- [ ] **TEST:** `GET /pipeline/health` → returns ok
- [ ] Git commit: `git add . && git commit -m "Video pipeline scaffold with health endpoint"`

### Prompt 40 — Station Capture Start/Stop + Buffer Management
- [ ] `POST /capture/start/{station_id}`:
  - [ ] Starts ffmpeg process for the station
  - [ ] Mock mode: generates rolling test pattern video
  - [ ] Real mode: reads from USB capture device
  - [ ] Writes rolling 60-second buffer using ffmpeg segment muxer
  - [ ] Track ffmpeg process: PID, start time, status
- [ ] `POST /capture/stop/{station_id}`:
  - [ ] Kills ffmpeg process
  - [ ] Cleans up buffer files
- [ ] `GET /capture/status`:
  - [ ] Returns status of all 4 streams: running/stopped, uptime, buffer size
- [ ] Buffer management:
  - [ ] Each station's buffer in `CAPTURE_BUFFER_DIR/{station_id}/`
  - [ ] Rolling 10-second segments that auto-overwrite
  - [ ] Cleanup task removes orphaned buffers on startup
- [ ] Wire into Main API:
  - [ ] `POST /api/sessions` (create) calls `POST http://localhost:8000/capture/start/{stationId}`
  - [ ] Session end calls `POST http://localhost:8000/capture/stop/{stationId}`
  - [ ] Handle connection refused gracefully (pipeline might not be running)
- [ ] **TEST:** Start API + video pipeline → create session → `capture/status` shows station capturing
- [ ] **TEST:** End session → capture stops
- [ ] **TEST:** Buffer files created in capture directory
- [ ] Git commit: `git add . && git commit -m "Station capture with rolling buffer management"`

### Prompt 41 — Clip Extraction Endpoint
- [ ] `POST /clips/extract`:
  - [ ] Input: `{ station_id, trigger_type, trigger_timestamp, buffer_before_seconds, buffer_after_seconds }`
  - [ ] Finds relevant buffer segments for time window
  - [ ] Uses `ffmpeg -c copy` to extract clip (zero re-encoding)
  - [ ] Saves to `REPLAY_DIR/{session_id}/{game_id}/clip_{timestamp}.mp4`
  - [ ] Calls Main API to register ReplayClip record
  - [ ] Returns `{ clip_id, file_path, duration_seconds }`
- [ ] Session and game context tracked from capture start request
- [ ] Mock mode: copies short test video as the "clip", still registers with API
- [ ] Add static file route to serve replay files for download
- [ ] **TEST:** Start session (capture starts) → call `/clips/extract` → clip file created
- [ ] **TEST:** Main API has ReplayClip record
- [ ] **TEST:** PWA with session auth code shows the clip in the list
- [ ] Git commit: `git add . && git commit -m "Clip extraction from buffer with replay registration"`

### Prompt 42 — YAMNet Audio Detection (Mock + Interface)
- [ ] Create detection interface in `detection/`:
  - [ ] `AudioDetector` class: `start(station_id)`, `stop(station_id)`, `on_event(callback)`
  - [ ] Events: `{ station_id, event_type, confidence, timestamp }`
  - [ ] Event types: `CROWD_ROAR`, `WHISTLE`, `MUSIC`
- [ ] Mock implementation (`USE_MOCK_YAMNET=true`):
  - [ ] Fires `CROWD_ROAR` every 90 seconds after starting
  - [ ] Fires `WHISTLE` after 5 minutes
  - [ ] Confidence always 0.85 (above threshold)
  - [ ] Respects cooldown (default 45 seconds)
- [ ] Real implementation stub (`USE_MOCK_YAMNET=false`):
  - [ ] Extracts audio from ffmpeg capture stream
  - [ ] Runs YAMNet TFLite inference
  - [ ] Maps categories to trigger types
  - [ ] TODO comments for real inference code
- [ ] Wire detection events to clip extraction:
  - [ ] `CROWD_ROAR` → extract clip
  - [ ] `WHISTLE` → call `POST /api/games/{gameId}/end`, then extract clip
  - [ ] Skip events within cooldown of last clip
- [ ] Wire into capture lifecycle:
  - [ ] Capture starts → start audio detection
  - [ ] Capture stops → stop audio detection
- [ ] Read settings from Main API: confidence threshold, cooldown, buffer before/after
- [ ] **TEST:** Start session → wait ~90s → mock fires CROWD_ROAR → clip extracted
- [ ] **TEST:** ReplayClip record in database
- [ ] **TEST:** Tablet receives `replay:ready` WebSocket event
- [ ] **TEST:** PWA shows the clip
- [ ] Git commit: `git add . && git commit -m "YAMNet detection interface with mock implementation"`

### Prompt 43 — Security Camera Continuous Recording
- [ ] `POST /security/start-recording`:
  - [ ] Starts ffmpeg processes for all 5 cameras
  - [ ] Mock mode: generates test pattern video streams
  - [ ] Real mode: connects to RTSP URLs from SecurityCamera database records
  - [ ] Writes 15-minute rolling segments to `SECURITY_RECORDING_DIR/{camera_id}/`
  - [ ] Auto-delete oldest segments when disk exceeds threshold
- [ ] `POST /security/stop-recording`: stops all camera processes
- [ ] `GET /security/recording-status`: status of all 5 streams (recording/stopped, uptime, segment count)
- [ ] `GET /security/storage`: total disk, used, free, estimated days retention remaining
- [ ] Camera health monitoring:
  - [ ] Check each camera connection every 30 seconds
  - [ ] If RTSP drops, mark offline via PATCH to Main API
  - [ ] Auto-reconnect every 30 seconds
  - [ ] Emit health status to Main API for dashboard
- [ ] `POST /security/extract-clips`:
  - [ ] Input: `{ event_id, timestamp, before_minutes, after_minutes }`
  - [ ] For ALL 5 cameras: find segments covering time window
  - [ ] Extract clips with `ffmpeg -c copy`
  - [ ] Save to `SECURITY_CLIPS_DIR/{event_type}_{timestamp}_cam{id}.mp4`
  - [ ] Register SecurityClip records in database via Main API
- [ ] Wire into Main API:
  - [ ] When SecurityEvent is created, call `POST http://localhost:8000/security/extract-clips`
  - [ ] Handle gracefully if pipeline not running
- [ ] **TEST:** Start video pipeline → `POST /security/start-recording` → status shows 5 cameras recording
- [ ] **TEST:** Create SecurityEvent (e.g., start session) → security clips extracted
- [ ] **TEST:** Dashboard shows camera status
- [ ] Git commit: `git add . && git commit -m "Security camera recording with event clip extraction"`

### Prompt 44 — Replay Cleanup + Stitching
- [ ] Replay TTL cleanup background task:
  - [ ] Runs every 5 minutes
  - [ ] Finds sessions where endTime + replayTTLMinutes has passed
  - [ ] Deletes replay files from disk
  - [ ] Updates/deletes ReplayClip records in database
  - [ ] Logs cleanup actions
- [ ] Highlight reel stitching:
  - [ ] When game ends, queue a stitching job
  - [ ] Concatenate all clips for that game into single highlight reel using ffmpeg
  - [ ] LOW PRIORITY background task — one at a time to avoid CPU contention
  - [ ] Save stitched file to same replay directory
  - [ ] Update database with `stitchedReelPath`
  - [ ] Notify tablet + PWA via WebSocket that reel is ready
- [ ] Stitching queue:
  - [ ] Simple in-memory queue
  - [ ] Process one job at a time
  - [ ] On pipeline restart, re-check for games with clips but no stitched reel
- [ ] **TEST:** Start session → mock YAMNet generates clips → end game → stitching job runs
- [ ] **TEST:** Combined highlight file produced
- [ ] **TEST:** PWA shows "Download Highlights" option
- [ ] **TEST:** Set short TTL (2 min) → wait → verify clips cleaned up
- [ ] Git commit: `git add . && git commit -m "Replay cleanup and highlight reel stitching"`

---

## Stage 10: Power Management + Resilience

### Prompt 45 — Power Down + Restore Endpoints
- [ ] `POST /api/system/power-down`:
  - [ ] For all ACTIVE sessions: calculate and save `remainingAtPowerLoss`
  - [ ] Mark active sessions as `POWER_INTERRUPTED`
  - [ ] Call `adbService.setBrightness(stationId, 50)` for active stations
  - [ ] Call `adbService.powerOff(stationId)` for unused stations
  - [ ] Call `tuyaService.turnOff(stationId)` for unused stations
  - [ ] Create SecurityEvent type `POWER_LOSS`
  - [ ] Emit `power:status` WebSocket event to all clients
  - [ ] Return `{ sessionsPreserved, timestamp }`
- [ ] `POST /api/system/power-restore`:
  - [ ] Find all `POWER_INTERRUPTED` sessions
  - [ ] Restore each: status back to ACTIVE, remaining time from `remainingAtPowerLoss`
  - [ ] Re-activate hardware: ADB switchToHdmi + brightness 100, Tuya sync mode
  - [ ] Resume timer service for restored sessions
  - [ ] Create SecurityEvent type `POWER_RESTORE`
  - [ ] Emit `power:status` WebSocket event
  - [ ] Return `{ sessionsRestored, timestamp }`
- [ ] Kiosk handles `power:status`:
  - [ ] Power-down: banner "Power outage detected — sessions preserved"
  - [ ] Power-restore: banner "Power restored — sessions resuming"
- [ ] Tablet handles `power:status`:
  - [ ] Power-down: show "Power outage — your session time is saved"
  - [ ] Power-restore: resume normal countdown
- [ ] Write tests:
  - [ ] Create 2 active sessions → power down → sessions are POWER_INTERRUPTED with correct remaining time
  - [ ] Power restore → sessions are ACTIVE with correct remaining time
  - [ ] SecurityEvents created for both
- [ ] **TEST:** `npm test` — all tests pass
- [ ] Git commit: `git add . && git commit -m "Power failure preservation and restore"`

### Prompt 46 — Internet Failover + Health Monitoring
- [ ] Create `services/internet.ts` (or update existing connectivity module):
  - [ ] `checkPrimaryInternet()`: ping reliable endpoint
  - [ ] `check4GDongle()`: check if dongle connected + has signal
  - [ ] `getCurrentRoute()`: returns `"primary"` | `"4g"` | `"offline"`
- [ ] Internet health monitor:
  - [ ] Check connectivity every 15 seconds
  - [ ] Primary fails → set route to 4G, log event
  - [ ] Primary recovers → switch back, log event
  - [ ] Both fail → set route to offline
- [ ] Wire into payment service:
  - [ ] When offline, `checkInternetAvailability()` returns false
  - [ ] Kiosk disables M-Pesa, shows "Cash only — no internet"
  - [ ] When primary or 4G, M-Pesa available
- [ ] Update `GET /api/payments/status`:
  - [ ] Returns `{ mpesaAvailable, internetRoute: "primary" | "4g" | "offline" }`
- [ ] Dashboard System tab:
  - [ ] Show current internet route
  - [ ] Show failover history (last 24 hours of route changes)
- [ ] Mock mode: `USE_MOCK_HARDWARE=true` → always report primary available
- [ ] `MOCK_INTERNET_ROUTE` env variable to simulate states for testing
- [ ] Write tests:
  - [ ] Payment status reflects internet availability
  - [ ] Failover: primary → 4G → offline → primary
  - [ ] M-Pesa endpoints reject when offline
- [ ] **TEST:** `npm test` — all tests pass
- [ ] Git commit: `git add . && git commit -m "Internet failover with 4G fallback"`

### Prompt 47 — End-to-End Integration Test
- [ ] Start all services: PostgreSQL, Main API, Kiosk, Tablet, PWA, Dashboard, Video Pipeline
- [ ] **Complete walk-in to replay flow:**
  - [ ] Open kiosk, log in with PIN 0000
  - [ ] Book Station 1 for 5 minutes, Cash
  - [ ] Verify: kiosk station card ACTIVE with countdown
  - [ ] Verify: tablet shows timer
  - [ ] Verify: hardware calls logged
  - [ ] Wait for mock YAMNet CROWD_ROAR (~90s) — clip extracted
  - [ ] Open PWA with auth code — clip appears
  - [ ] Tap "End Game" on tablet — game boundary + QR code
  - [ ] Let session end — hardware deactivates, tablet returns to idle
  - [ ] PWA shows all clips + highlight reel option
- [ ] **M-Pesa flow:**
  - [ ] Book Station 2, select M-Pesa (mock)
  - [ ] Verify waiting UI, auto-confirmation, session activates
- [ ] **Fault handling:**
  - [ ] Station 1 active → report fault → transfer to Station 3
  - [ ] Verify hardware deactivates on 1, activates on 3
  - [ ] Verify SecurityEvent created
- [ ] **Power failure:**
  - [ ] With sessions active, call `POST /api/system/power-down`
  - [ ] Verify sessions preserved, kiosk/tablet show outage state
  - [ ] Call `POST /api/system/power-restore`
  - [ ] Verify sessions resume with correct time
- [ ] **Dashboard verification:**
  - [ ] Log in as owner — revenue, active sessions, security events all show
  - [ ] System health — all services green
  - [ ] Security clips exist for key events
- [ ] Fix any issues found during testing
- [ ] Remove any remaining debug code
- [ ] Replace `console.log` with proper logging
- [ ] Run full test suite one final time — all pass
- [ ] Git commit: `git add . && git commit -m "Stages 4-10 complete: full integration test passed"`
- [ ] Git push: `git push origin main`

---

## Summary

| Stage | Prompts | What Gets Built | Status |
|-------|---------|----------------|--------|
| 1–3 | 0–22 | API + Database + Kiosk | ✅ Complete |
| 4 | 23–27 | Tablet app (timer, extend, QR codes, kiosk mode) | ✅ Complete |
| 5 | 28–29 | Customer replay PWA (auth code, clip list, download) | ✅ Complete |
| 6 | 30–32 | Owner dashboard (revenue, history, security, system health) | ✅ Complete |
| 7 | 33–35 | M-Pesa payments (service module, endpoints, kiosk UI) | ⬜ |
| 8 | 36–38 | Hardware control (real ADB, real Tuya, session lifecycle) | ⬜ |
| 9 | 39–44 | Video pipeline (capture, clips, YAMNet, security cameras, stitching) | ⬜ |
| 10 | 45–47 | Power management, internet failover, final integration test | ⬜ |

**Total: 25 prompts (23–47)**
