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
- [x] Initialise Python FastAPI project in `services/video-pipeline/`
- [x] Create `requirements.txt`: fastapi, uvicorn, httpx
- [x] Configure on port 8000
- [x] Create `main.py` with FastAPI app
- [x] `GET /pipeline/health` → `{ status: "ok", uptime, capture_streams: 0, cameras_recording: 0 }`
- [x] Create folder structure:
  - [x] `capture/` — station capture management
  - [x] `security/` — security camera recording
  - [x] `detection/` — YAMNet audio detection (placeholder)
  - [x] `config.py` — env variable configuration
- [x] Environment variables: `MAIN_API_URL`, `CAPTURE_BUFFER_DIR`, `REPLAY_DIR`, `SECURITY_RECORDING_DIR`, `SECURITY_CLIPS_DIR`, `USE_MOCK_CAPTURE`, `USE_MOCK_CAMERAS`
- [x] Create mock capture module (generates test video via ffmpeg instead of USB device)
- [x] **TEST:** `cd services/video-pipeline && uvicorn main:app --port 8000` → starts
- [x] **TEST:** `GET /pipeline/health` → returns ok
- [x] Git commit: `git add . && git commit -m "Video pipeline scaffold with health endpoint"`

### Prompt 40 — Station Capture Start/Stop + Buffer Management
- [x] `POST /capture/start/{station_id}`:
  - [x] Starts ffmpeg process for the station
  - [x] Mock mode: generates rolling test pattern video
  - [x] Real mode: reads from USB capture device
  - [x] Writes rolling 60-second buffer using ffmpeg segment muxer
  - [x] Track ffmpeg process: PID, start time, status
- [x] `POST /capture/stop/{station_id}`:
  - [x] Kills ffmpeg process
  - [x] Cleans up buffer files
- [x] `GET /capture/status`:
  - [x] Returns status of all 4 streams: running/stopped, uptime, buffer size
- [x] Buffer management:
  - [x] Each station's buffer in `CAPTURE_BUFFER_DIR/{station_id}/`
  - [x] Rolling 10-second segments that auto-overwrite
  - [x] Cleanup task removes orphaned buffers on startup
- [x] Wire into Main API:
  - [x] `POST /api/sessions` (create) calls `POST http://localhost:8000/capture/start/{stationId}`
  - [x] Session end calls `POST http://localhost:8000/capture/stop/{stationId}`
  - [x] Handle connection refused gracefully (pipeline might not be running)
- [x] **TEST:** Start API + video pipeline → create session → `capture/status` shows station capturing
- [x] **TEST:** End session → capture stops
- [x] **TEST:** Buffer files created in capture directory
- [x] Git commit: `git add . && git commit -m "Station capture with rolling buffer management"`

### Prompt 41 — Clip Extraction Endpoint
- [x] `POST /clips/extract`:
  - [x] Input: `{ station_id, trigger_type, trigger_timestamp, buffer_before_seconds, buffer_after_seconds }`
  - [x] Finds relevant buffer segments for time window
  - [x] Uses `ffmpeg -c copy` to extract clip (zero re-encoding)
  - [x] Saves to `REPLAY_DIR/{session_id}/{game_id}/clip_{timestamp}.mp4`
  - [x] Calls Main API to register ReplayClip record
  - [x] Returns `{ clip_id, file_path, duration_seconds }`
- [x] Session and game context tracked from capture start request
- [x] Mock mode: copies short test video as the "clip", still registers with API
- [x] Add static file route to serve replay files for download
- [x] **TEST:** Start session (capture starts) → call `/clips/extract` → clip file created
- [x] **TEST:** Main API has ReplayClip record
- [x] **TEST:** PWA with session auth code shows the clip in the list
- [x] Git commit: `git add . && git commit -m "Clip extraction from buffer with replay registration"`

### Prompt 42 — YAMNet Audio Detection (Mock + Interface)
- [x] Create detection interface in `detection/`:
  - [x] `AudioDetector` class: `start(station_id)`, `stop(station_id)`, `on_event(callback)`
  - [x] Events: `{ station_id, event_type, confidence, timestamp }`
  - [x] Event types: `CROWD_ROAR`, `WHISTLE`, `MUSIC`
- [x] Mock implementation (`USE_MOCK_YAMNET=true`):
  - [x] Fires `CROWD_ROAR` every 90 seconds after starting
  - [x] Fires `WHISTLE` after 5 minutes
  - [x] Confidence always 0.85 (above threshold)
  - [x] Respects cooldown (default 45 seconds)
- [x] Real implementation stub (`USE_MOCK_YAMNET=false`):
  - [x] Extracts audio from ffmpeg capture stream
  - [x] Runs YAMNet TFLite inference
  - [x] Maps categories to trigger types
  - [x] TODO comments for real inference code
- [x] Wire detection events to clip extraction:
  - [x] `CROWD_ROAR` → extract clip
  - [x] `WHISTLE` → call `POST /api/games/{gameId}/end`, then extract clip
  - [x] Skip events within cooldown of last clip
- [x] Wire into capture lifecycle:
  - [x] Capture starts → start audio detection
  - [x] Capture stops → stop audio detection
- [x] Read settings from Main API: confidence threshold, cooldown, buffer before/after
- [x] **TEST:** Start session → wait ~90s → mock fires CROWD_ROAR → clip extracted
- [x] **TEST:** ReplayClip record in database
- [x] **TEST:** Tablet receives `replay:ready` WebSocket event
- [x] **TEST:** PWA shows the clip
- [x] Git commit: `git add . && git commit -m "YAMNet detection interface with mock implementation"`

### Prompt 43 — Security Camera Continuous Recording
- [x] `POST /security/start-recording`:
  - [x] Starts ffmpeg processes for all 5 cameras
  - [x] Mock mode: generates test pattern video streams
  - [x] Real mode: connects to RTSP URLs from SecurityCamera database records
  - [x] Writes 15-minute rolling segments to `SECURITY_RECORDING_DIR/{camera_id}/`
  - [x] Auto-delete oldest segments when disk exceeds threshold
- [x] `POST /security/stop-recording`: stops all camera processes
- [x] `GET /security/recording-status`: status of all 5 streams (recording/stopped, uptime, segment count)
- [x] `GET /security/storage`: total disk, used, free, estimated days retention remaining
- [x] Camera health monitoring:
  - [x] Check each camera connection every 30 seconds
  - [x] If RTSP drops, mark offline via PATCH to Main API
  - [x] Auto-reconnect every 30 seconds
  - [x] Emit health status to Main API for dashboard
- [x] `POST /security/extract-clips`:
  - [x] Input: `{ event_id, timestamp, before_minutes, after_minutes }`
  - [x] For ALL 5 cameras: find segments covering time window
  - [x] Extract clips with `ffmpeg -c copy`
  - [x] Save to `SECURITY_CLIPS_DIR/{event_type}_{timestamp}_cam{id}.mp4`
  - [x] Register SecurityClip records in database via Main API
- [x] Wire into Main API:
  - [x] When SecurityEvent is created, call `POST http://localhost:8000/security/extract-clips`
  - [x] Handle gracefully if pipeline not running
- [x] **TEST:** Start video pipeline → `POST /security/start-recording` → status shows 5 cameras recording
- [x] **TEST:** Create SecurityEvent (e.g., start session) → security clips extracted
- [x] **TEST:** Dashboard shows camera status
- [x] Git commit: `git add . && git commit -m "Security camera recording with event clip extraction"`

### Prompt 44 — Replay Cleanup + Stitching
- [x] Replay TTL cleanup background task:
  - [x] Runs every 5 minutes
  - [x] Finds sessions where endTime + replayTTLMinutes has passed
  - [x] Deletes replay files from disk
  - [x] Updates/deletes ReplayClip records in database
  - [x] Logs cleanup actions
- [x] Highlight reel stitching:
  - [x] When game ends, queue a stitching job
  - [x] Concatenate all clips for that game into single highlight reel using ffmpeg
  - [x] LOW PRIORITY background task — one at a time to avoid CPU contention
  - [x] Save stitched file to same replay directory
  - [x] Update database with `stitchedReelPath`
  - [x] Notify tablet + PWA via WebSocket that reel is ready
- [x] Stitching queue:
  - [x] Simple in-memory queue
  - [x] Process one job at a time
  - [x] On pipeline restart, re-check for games with clips but no stitched reel
- [x] **TEST:** Start session → mock YAMNet generates clips → end game → stitching job runs
- [x] **TEST:** Combined highlight file produced
- [x] **TEST:** PWA shows "Download Highlights" option
- [x] **TEST:** Set short TTL (2 min) → wait → verify clips cleaned up
- [x] Git commit: `git add . && git commit -m "Replay cleanup and highlight reel stitching"`

---

## Stage 10: Power Management + Resilience

### Prompt 45 — Power Down + Restore Endpoints
- [x] `POST /api/system/power-down`:
  - [x] For all ACTIVE sessions: calculate and save `remainingAtPowerLoss`
  - [x] Mark active sessions as `POWER_INTERRUPTED`
  - [x] Call `adbService.setBrightness(stationId, 50)` for active stations
  - [x] Call `adbService.powerOff(stationId)` for unused stations
  - [x] Call `tuyaService.turnOff(stationId)` for unused stations
  - [x] Create SecurityEvent type `POWER_LOSS`
  - [x] Emit `power:status` WebSocket event to all clients
  - [x] Return `{ sessionsPreserved, timestamp }`
- [x] `POST /api/system/power-restore`:
  - [x] Find all `POWER_INTERRUPTED` sessions
  - [x] Restore each: status back to ACTIVE, remaining time from `remainingAtPowerLoss`
  - [x] Re-activate hardware: ADB switchToHdmi + brightness 100, Tuya sync mode
  - [x] Resume timer service for restored sessions
  - [x] Create SecurityEvent type `POWER_RESTORE`
  - [x] Emit `power:status` WebSocket event
  - [x] Return `{ sessionsRestored, timestamp }`
- [x] Kiosk handles `power:status`:
  - [x] Power-down: banner "Power outage detected — sessions preserved"
  - [x] Power-restore: banner "Power restored — sessions resuming"
- [x] Tablet handles `power:status`:
  - [x] Power-down: show "Power outage — your session time is saved"
  - [x] Power-restore: resume normal countdown
- [x] Write tests:
  - [x] Create 2 active sessions → power down → sessions are POWER_INTERRUPTED with correct remaining time
  - [x] Power restore → sessions are ACTIVE with correct remaining time
  - [x] SecurityEvents created for both
- [x] **TEST:** `npm test` — all tests pass
- [x] Git commit: `git add . && git commit -m "Power failure preservation and restore"`

### Prompt 46 — Internet Failover + Health Monitoring
- [x] Create `services/internet.ts` (or update existing connectivity module):
  - [x] `checkPrimaryInternet()`: ping reliable endpoint
  - [x] `check4GDongle()`: check if dongle connected + has signal
  - [x] `getCurrentRoute()`: returns `"primary"` | `"4g"` | `"offline"`
- [x] Internet health monitor:
  - [x] Check connectivity every 15 seconds
  - [x] Primary fails → set route to 4G, log event
  - [x] Primary recovers → switch back, log event
  - [x] Both fail → set route to offline
- [x] Wire into payment service:
  - [x] When offline, `checkInternetAvailability()` returns false
  - [x] Kiosk disables M-Pesa, shows "Cash only — no internet"
  - [x] When primary or 4G, M-Pesa available
- [x] Update `GET /api/payments/status`:
  - [x] Returns `{ mpesaAvailable, internetRoute: "primary" | "4g" | "offline" }`
- [x] Dashboard System tab:
  - [x] Show current internet route
  - [x] Show failover history (last 24 hours of route changes)
- [x] Mock mode: `USE_MOCK_HARDWARE=true` → always report primary available
- [x] `MOCK_INTERNET_ROUTE` env variable to simulate states for testing
- [x] Write tests:
  - [x] Payment status reflects internet availability
  - [x] Failover: primary → 4G → offline → primary
  - [x] M-Pesa endpoints reject when offline
- [x] **TEST:** `npm test` — all tests pass
- [x] Git commit: `git add . && git commit -m "Internet failover with 4G fallback"`

### Prompt 47 — End-to-End Integration Test
- [x] Start all services: PostgreSQL, Main API, Kiosk, Tablet, PWA, Dashboard, Video Pipeline
- [x] **Complete walk-in to replay flow:**
  - [x] Open kiosk, log in with PIN 0000
  - [x] Book Station 1 for 5 minutes, Cash
  - [x] Verify: kiosk station card ACTIVE with countdown
  - [x] Verify: tablet shows timer
  - [x] Verify: hardware calls logged
  - [x] Wait for mock YAMNet CROWD_ROAR (~90s) — clip extracted
  - [x] Open PWA with auth code — clip appears
  - [x] Tap "End Game" on tablet — game boundary + QR code
  - [x] Let session end — hardware deactivates, tablet returns to idle
  - [x] PWA shows all clips + highlight reel option
- [x] **M-Pesa flow:**
  - [x] Book Station 2, select M-Pesa (mock)
  - [x] Verify waiting UI, auto-confirmation, session activates
- [x] **Fault handling:**
  - [x] Station 1 active → report fault → transfer to Station 3
  - [x] Verify hardware deactivates on 1, activates on 3
  - [x] Verify SecurityEvent created
- [x] **Power failure:**
  - [x] With sessions active, call `POST /api/system/power-down`
  - [x] Verify sessions preserved, kiosk/tablet show outage state
  - [x] Call `POST /api/system/power-restore`
  - [x] Verify sessions resume with correct time
- [x] **Dashboard verification:**
  - [x] Log in as owner — revenue, active sessions, security events all show
  - [x] System health — all services green
  - [x] Security clips exist for key events
- [x] Fix any issues found during testing
- [x] Remove any remaining debug code
- [x] Replace `console.log` with proper logging
- [x] Run full test suite one final time — all pass (197 Node.js + 45 Python = 242 total)
- [x] Git commit: `git add . && git commit -m "Stages 4-10 complete: full integration test passed"`
- [x] Git push: `git push origin main`

---

## Summary

| Stage | Prompts | What Gets Built | Status |
|-------|---------|----------------|--------|
| 1–3 | 0–22 | API + Database + Kiosk | ✅ Complete |
| 4 | 23–27 | Tablet app (timer, extend, QR codes, kiosk mode) | ✅ Complete |
| 5 | 28–29 | Customer replay PWA (auth code, clip list, download) | ✅ Complete |
| 6 | 30–32 | Owner dashboard (revenue, history, security, system health) | ✅ Complete |
| 7 | 33–35 | M-Pesa payments (service module, endpoints, kiosk UI) | ✅ Complete |
| 8 | 36–38 | Hardware control (real ADB, real Tuya, session lifecycle) | ✅ Complete |
| 9 | 39–44 | Video pipeline (capture, clips, YAMNet, security cameras, stitching) | ✅ Complete |
| 10 | 45–47 | Power management, internet failover, final integration test | ✅ Complete |

**Total: 25 prompts (23–47)**

---

## Stage 11: Enhanced Video Pipeline — Ring Buffer, Game Intelligence & AI Replays

> All prompts 48–64 are in `docs/PROMPT-PLAN-STAGES-4-10.md`. Start every session with:
> `Read docs/WORKING-RULES.md and docs/SPEC.md.`

---

### Prompt 48 — Database Schema: New Models and Fields

- [ ] Open `apps/api/prisma/schema.prisma`
- [ ] Add enum `EventType`: `CROWD_NOISE | GOAL_AUDIO | CELEBRATION | CARD_EVENT | MATCH_END | GAME_REPLAY`
- [ ] Add enum `ClipJobStatus`: `PENDING | EXTRACTING | STITCHING | AI_EFFECTS | DONE | FAILED`
- [ ] Add model `PendingEvent` with all fields (id, stationId, sessionId, type, source, detectedAt, preRollSeconds, postRollSeconds, peakAmplitude, gameMinute, scoreDelta, mergedIntoId, createdAt)
- [ ] Add model `ClipJob` with all fields (id, stationId, sessionId, eventIds, status, tvClipPath, webcamClipPath, stitchedClipPath, finalClipPath, portraitClipPath, errorMessage, enqueuedAt, startedAt, completedAt)
- [ ] Add model `GameReplay` with all fields (id, stationId, sessionId, detectedAt, startSegment, endSegment, clipPath, durationSeconds, createdAt)
- [ ] Add model `MatchState` with all fields (id, stationId unique, homeScore, awayScore, matchMinute, phase, isReplayOnScreen, lastUpdated)
- [ ] Add `webcamDevice` and `analysisWebcamDevice` fields to `Station` model
- [ ] Add pipeline settings to `Settings` model: `tvRingBufferSeconds`, `clipPreRollSeconds`, `clipPostRollSeconds`, `eventMergeWindowSeconds`, `gameAnalysisEnabled`, `audioDetectionEnabled`, `stage2Enabled`, `stage3Enabled`, `yamnetThresholdBase`
- [ ] Run `npx prisma migrate dev --name enhanced_video_pipeline` — migration applies cleanly
- [ ] Run `npx prisma generate` — no errors
- [ ] Write `apps/api/src/services/__tests__/schema.test.ts` (create MatchState, PendingEvent, ClipJob — read back, assert fields, clean up)
- [ ] Run schema test — passes
- [ ] Commit: `"feat(db): add PendingEvent, ClipJob, GameReplay, MatchState schema"`

---

### Prompt 49 — Capture Infrastructure: tmpfs Ring Buffer for TV Streams

- [ ] Create `services/video-pipeline/capture/ring_buffer.py`
  - [ ] Class `RingBuffer(station_id, buffer_dir, max_age_seconds=120)`
  - [ ] Method `prune()` — deletes segments older than max_age_seconds
  - [ ] Method `get_segments_in_window(start_dt, end_dt) -> list[Path]`
  - [ ] Method `get_segment_for_time(dt) -> Path | None`
  - [ ] Segment filename pattern: `seg_{unix_timestamp}.ts`
- [ ] Create `services/video-pipeline/capture/pruner.py`
  - [ ] Loop calling `RingBuffer.prune()` every 5 seconds per station
  - [ ] Reads `STATION_COUNT` (default 4) and `RING_BUFFER_DIR` (default `/run/lounge`) from env
  - [ ] Logs pruned file count at DEBUG level
- [ ] Update `services/video-pipeline/capture/tv_capture.py`
  - [ ] Output directory changed to `{RING_BUFFER_DIR}/tv{station_id}/`
  - [ ] Segment duration stays at 2 seconds
  - [ ] `-c copy` preserved (no transcode)
  - [ ] Segment filename: `seg_%s.ts` (Unix timestamp via strftime)
  - [ ] `mkdir -p` output directory before starting ffmpeg
- [ ] Create systemd unit `neo-lounge-tv-capture@.service` (template, per-station, WatchdogSec=30)
- [ ] Create systemd unit `neo-lounge-ring-pruner.service`
- [ ] Write `services/video-pipeline/tests/test_ring_buffer.py`
  - [ ] Fake `.ts` files with varied mtimes — assert `prune()` deletes old, keeps recent
  - [ ] `get_segments_in_window()` with known range — assert correct files returned
- [ ] Run tests — pass
- [ ] Commit: `"feat(capture): tmpfs ring buffer with pruner and systemd units"`

---

### Prompt 50 — Capture Infrastructure: Webcam and Security Camera Services

- [ ] Create `services/video-pipeline/capture/webcam_capture.py`
  - [ ] Reads `STATION_ID` and `WEBCAM_DEVICE` from env
  - [ ] Output: `/var/lounge/sessions/{session_id}/webcam/`, 10-second segments, `seg_%s.ts`
  - [ ] 720p 120fps capture: `-framerate 120 -video_size 1280x720 -c copy`
  - [ ] Polls API every 5s for active session — starts/stops ffmpeg accordingly
  - [ ] SIGTERM to ffmpeg when session ends
- [ ] Create `services/video-pipeline/capture/security_capture.py`
  - [ ] Reads camera list from `/etc/lounge/cameras.json`
  - [ ] Output: `/var/lounge/security/{camera_id}/`, 300-second segments
  - [ ] `-c copy`, runs continuously
  - [ ] Deletes segments older than 72 hours
- [ ] Create systemd unit `neo-lounge-webcam@.service` (template, per-station)
- [ ] Create systemd unit `neo-lounge-security-cam@.service` (template, per-camera)
- [ ] Write `services/video-pipeline/tests/test_webcam_capture.py`
  - [ ] Mock ffmpeg subprocess and API — assert correct args built
  - [ ] Assert SIGTERM sent when session ends
  - [ ] Assert ffmpeg not running when no active session
- [ ] Run tests — pass
- [ ] Commit: `"feat(capture): webcam 120fps and security camera capture services"`

---

### Prompt 51 — Audio Event Detector: YAMNet + EventMerger

- [ ] Update `services/video-pipeline/audio/detector.py`
  - [ ] Replace direct DB write with `INSERT INTO "PendingEvent"` (type, source='audio', detectedAt, peakAmplitude, preRollSeconds=10, postRollSeconds=15)
  - [ ] Read `yamnetThresholdBase` from Settings at startup, refresh every 60s
  - [ ] Reduce threshold by 0.05 when `gameMinute >= 80` or `scoreDelta == 0` (tense moment)
  - [ ] Log detected event type and amplitude at INFO level
- [ ] Create `services/video-pipeline/audio/event_merger.py`
  - [ ] Class `EventMerger(db_conn, merge_window_seconds)`
  - [ ] `run_merge_cycle()`: query unmerged PendingEvents, group by station+session, sort by time
  - [ ] Merge events within `merge_window_seconds` of each other (set `mergedIntoId`)
  - [ ] For each surviving root event/cluster: compute combined window, check for existing ClipJob, create if missing
  - [ ] Issue `NOTIFY clip_jobs_channel, '{stationId}'` after creating ClipJob
  - [ ] `start(interval_seconds=3)`: run merge cycle in loop
- [ ] Create systemd unit `neo-lounge-audio-detector@.service` (template, per-station)
- [ ] Create systemd unit `neo-lounge-event-merger.service`
- [ ] Write `services/video-pipeline/tests/test_event_merger.py`
  - [ ] 3 events at T=0, T=5, T=20 (merge window=8s) — assert T=0+T=5 merge, T=20 separate
  - [ ] Assert 2 ClipJobs created
  - [ ] Assert `B.mergedIntoId = A.id`
  - [ ] Assert no duplicate ClipJob created when cluster already exists
- [ ] Run tests — pass
- [ ] Commit: `"feat(audio): YAMNet detector writes PendingEvents, EventMerger creates ClipJobs"`

---

### Prompt 52 — Game Stream Analyzer

- [ ] Create `services/video-pipeline/game_analyzer/frame_reader.py`
  - [ ] Class `FrameReader(station_id, video_source)`
  - [ ] ffmpeg pipe: `-vf scale=427:240 -r 2 -f rawvideo -pix_fmt bgr24 pipe:1`
  - [ ] Reads frames as numpy arrays `(240, 427, 3)` in a loop
  - [ ] Handles pipe EOF — restarts after 2s delay
- [ ] Create `services/video-pipeline/game_analyzer/detectors.py`
  - [ ] `detect_replay_banner(frame) -> bool`: template match vs `assets/templates/replay_banner.png`, confidence > 0.75
  - [ ] `detect_card_flash(frame) -> str | None`: HSV blob detection for red/yellow in centre-right region
  - [ ] `detect_goal_flash(frame, prev_frame) -> bool`: mean absolute difference > 40
  - [ ] `extract_score_and_minute(frame) -> tuple[str, str]`: tesseract OCR on top-centre crop, whitelist digits/colon/dash
- [ ] Create `services/video-pipeline/game_analyzer/analyzer.py`
  - [ ] Class `GameAnalyzer(station_id, db_conn, video_source)`
  - [ ] On `detect_replay_banner=True`: UPDATE MatchState `isReplayOnScreen=True`, create `GAME_REPLAY` PendingEvent if none in last 30s
  - [ ] On banner disappearing: UPDATE `isReplayOnScreen=False`
  - [ ] On `detect_card_flash=red`: create `CARD_EVENT` PendingEvent
  - [ ] On `detect_goal_flash=True`: create `GOAL_AUDIO` PendingEvent
  - [ ] On score change from OCR: UPDATE MatchState scores/minute, create `GOAL_AUDIO` PendingEvent
  - [ ] Debounce: no duplicate event of same type within 20s per station
- [ ] Create systemd unit `neo-lounge-game-analyzer@.service` (template, per-station)
- [ ] Write `services/video-pipeline/tests/test_detectors.py`
  - [ ] Synthetic frame with red rectangle — assert `detect_card_flash` returns `"red"`
  - [ ] Two identical frames — assert `detect_goal_flash` returns False
  - [ ] Frame vs all-white frame — assert `detect_goal_flash` returns True
  - [ ] Mock tesseract — assert `extract_score_and_minute` parses `"2:1"` and `"43"` correctly
- [ ] Run tests — pass
- [ ] Commit: `"feat(analyzer): game stream analysis at 240p/2fps with event writing"`

---

### Prompt 53 — Clip Extraction Worker (Stage 1)

- [ ] Create `services/video-pipeline/workers/clip_extractor.py`
  - [ ] Startup: open psycopg2 connection, run `LISTEN clip_jobs_channel`
  - [ ] Main loop: `select()` blocking wait for NOTIFY (30s timeout for watchdog keepalive)
  - [ ] `process_next_job()`: `SELECT ... FOR UPDATE SKIP LOCKED`, oldest PENDING first (FIFO)
  - [ ] Update job status to `EXTRACTING`, set `startedAt`
  - [ ] `extract_tv_clip(job)`: compute window, call `RingBuffer.get_segments_in_window()`, write concat file, run `ffmpeg -f concat -safe 0 -c copy`, verify > 5s with ffprobe
  - [ ] `extract_webcam_clip(job)`: same pattern on webcam segments dir, return None if no segments (log warning)
  - [ ] Update job: set `tvClipPath`, `webcamClipPath`, status=`STITCHING`
  - [ ] Issue `NOTIFY stitch_jobs_channel, '{job_id}'`
  - [ ] On exception: update status=`FAILED`, set `errorMessage`, log at ERROR
- [ ] Create `services/video-pipeline/workers/ffprobe_utils.py`
  - [ ] `get_duration(path) -> float`: ffprobe duration in seconds
  - [ ] `verify_clip(path, min_duration=5.0) -> bool`: exists + duration >= min
- [ ] Create systemd unit `neo-lounge-clip-extractor.service` (single instance, WatchdogSec=30)
- [ ] Write `services/video-pipeline/tests/test_clip_extractor.py`
  - [ ] Mock ffmpeg and ffprobe, mock DB + NOTIFY
  - [ ] Assert `FOR UPDATE SKIP LOCKED` used
  - [ ] Assert correct concat file written with right segment paths
  - [ ] Assert duration < 5s → `RuntimeError` raised, job set to `FAILED`
  - [ ] Assert ring buffer miss → job set to `FAILED` with descriptive message
- [ ] Run tests — pass
- [ ] Commit: `"feat(worker): Stage 1 clip extraction via LISTEN/NOTIFY and ring buffer"`

---

### Prompt 54 — FIFA In-Game Replay Harvesting

- [ ] Create `services/video-pipeline/workers/replay_harvester.py`
  - [ ] Class `ReplayHarvester(db_conn, ring_buffer_dir)`
  - [ ] Maintains per-station `{station_id: replay_start_time | None}` dict
  - [ ] `poll()`: query all MatchState rows
    - [ ] `isReplayOnScreen=True` + no active harvest → record start time, INSERT `GameReplay` row
    - [ ] `isReplayOnScreen=False` + active harvest → compute window, call `extract_replay_clip()`, clear active harvest
  - [ ] `extract_replay_clip(station_id, session_id, start_dt, end_dt, replay_id)`:
    - [ ] Get segments from RingBuffer for window
    - [ ] `ffmpeg -f concat -c copy` → `/var/lounge/sessions/{session_id}/replays/fifa_{replay_id}.ts`
    - [ ] Verify duration > 3s
    - [ ] UPDATE `GameReplay` with `clipPath`, `durationSeconds`, `endSegment`
  - [ ] `poll()` runs every 1 second
- [ ] Create systemd unit `neo-lounge-replay-harvester.service` (WatchdogSec=30)
- [ ] Write `services/video-pipeline/tests/test_replay_harvester.py`
  - [ ] `isReplayOnScreen` True at T=0, False at T=15 — assert one GameReplay, extract called with 15s window
  - [ ] Two consecutive `poll()` calls while still True — assert no duplicate harvest started
  - [ ] Buffer miss on replay end — assert GameReplay row created but `clipPath` stays null, error logged
- [ ] Run tests — pass
- [ ] Commit: `"feat(worker): FIFA in-game replay harvester from ring buffer"`

---

### Prompt 55 — Stage 2 Stitch Worker: TV + Webcam PiP Overlay

- [ ] Create `services/video-pipeline/workers/stitch_worker.py`
  - [ ] Startup: `LISTEN stitch_jobs_channel`
  - [ ] `process_next_stitch()`: `SELECT ... WHERE status='STITCHING' FOR UPDATE SKIP LOCKED`
  - [ ] If no webcam clip: simple remux `ffmpeg -i {tvClip} -c copy stitched_{id}.mp4`
  - [ ] If webcam clip exists: build `filter_complex` PiP overlay (webcam 320×180 bottom-right, 20px margin)
  - [ ] Encode: `-c:v h264_qsv -preset fast -b:v 3M -c:a aac -b:a 128k`
  - [ ] Fallback: if `h264_qsv` fails → retry with `-c:v libx264 -preset fast -crf 23`
  - [ ] Verify output > 5s
  - [ ] If `stage3Enabled`: update status=`AI_EFFECTS`, `NOTIFY ai_effects_channel`
  - [ ] If stage 3 disabled: update status=`DONE`, upsert `ReplayClip`, emit WebSocket `replay:clip_ready`
- [ ] Create systemd unit `neo-lounge-stitch-worker.service`
- [ ] Write `services/video-pipeline/tests/test_stitch_worker.py`
  - [ ] Webcam present → assert `filter_complex` PiP command built correctly
  - [ ] Webcam absent → assert simple remux (no `filter_complex`)
  - [ ] `h264_qsv` fails → assert `libx264` fallback attempted
  - [ ] Output < 5s → job set to `FAILED`
- [ ] Run tests — pass
- [ ] Commit: `"feat(worker): Stage 2 PiP stitch worker with Quick Sync encode and fallback"`

---

### Prompt 56 — Caption Library: JSON Structure and Selection Logic

- [ ] Create `services/video-pipeline/captions/captions.json`
  - [ ] Schema: `id`, `context`, `emotion`, `conditions` (minMinute, maxMinute, scoreDelta), `text_en`, `text_sw`
  - [ ] At least 40 entries covering: goals (first half, 80th+ minute), equalisers, red cards, celebrations when winning, despair when losing, last-minute shock, generic crowd noise
  - [ ] Sheng/Swahili texts are natural and punchy (e.g. "Nilikuambia!", "Wacha mchezo!", "Pole pole ndo mwendo... mpaka sasa!")
- [ ] Create `services/video-pipeline/captions/selector.py`
  - [ ] `load_captions(path) -> list[dict]`
  - [ ] `select_caption(captions, context, emotion, match_state) -> dict`
    - [ ] Filter by context (exact, fallback to "generic")
    - [ ] Filter by emotion (exact, fallback to any)
    - [ ] Filter by conditions (minute range, scoreDelta if specified)
    - [ ] Pick randomly from top 5 candidates
    - [ ] Return hardcoded fallback if zero candidates
  - [ ] `get_caption_text(caption, lang="sw") -> str`
- [ ] Write `services/video-pipeline/tests/test_caption_selector.py`
  - [ ] `context="goal"`, `emotion="joy"`, `minute=85`, `scoreDelta=0` → returns equaliser/late-goal caption
  - [ ] `context="card_red"`, `emotion="shock"` → returns red card caption
  - [ ] No exact emotion match → still returns a caption (fallback works)
  - [ ] 10 calls with same inputs → varied results (randomization confirmed)
- [ ] Run tests — pass
- [ ] Commit: `"feat(captions): caption library JSON with 40+ entries and context-aware selector"`

---

### Prompt 57 — Stage 3 AI Effects Worker: Face Detection, Emotion, Zoom, Slow-Mo

- [ ] Create `services/video-pipeline/workers/ai_effects_worker.py`
  - [ ] Startup: `LISTEN ai_effects_channel`
  - [ ] `process_next_ai_job()`: `SELECT ... WHERE status='AI_EFFECTS' FOR UPDATE SKIP LOCKED`
  - [ ] Step 1 — Sample frames from webcam PiP region (1 frame/0.5s) using OpenCV `VideoCapture`
  - [ ] Step 2 — YuNet face detection (`face_detection_yunet_2023mar.onnx`, confidence > 0.7), find peak-confidence frame
  - [ ] Step 3 — FER MobileNet emotion (`fer_mobilenet.onnx` via onnxruntime), dominant emotion across sampled frames
  - [ ] Step 4 — Caption selection: map event type → context, use detected emotion + MatchState
  - [ ] Step 5 — Build ffmpeg command:
    - [ ] 2 faces → split-screen zoom both face regions
    - [ ] 1 face → single face zoom centred
    - [ ] 0 faces → full frame, no zoom
    - [ ] `setpts=0.5*PTS` for real 2× slow-mo (120fps source → 60fps output)
    - [ ] `drawtext` for caption burn-in (Swahili text, white, black box background, bottom-centre)
    - [ ] Landscape output: 1280×720, `-c:v libx264 -preset fast -crf 22 -r 60`
    - [ ] Portrait output: crop 9:16 centred on face x, scale 1080×1920
  - [ ] Step 6 — Verify both outputs > 5s
  - [ ] Step 7 — Update `ClipJob` (`finalClipPath`, `portraitClipPath`, status=`DONE`, `completedAt`)
  - [ ] Upsert `ReplayClip` with `finalClipPath`
  - [ ] Emit WebSocket `replay:clip_ready` (include `portraitClipPath` in payload)
- [ ] Create systemd unit `neo-lounge-ai-effects-worker.service` (WatchdogSec=60)
- [ ] Write `services/video-pipeline/tests/test_ai_effects_worker.py`
  - [ ] Mock OpenCV (5 synthetic frames, face region on frame 3)
  - [ ] Mock YuNet (one bounding box)
  - [ ] Mock FER ONNX (`{"joy": 0.85, "neutral": 0.15}`)
  - [ ] Assert caption selector called with `emotion="joy"`
  - [ ] Assert ffmpeg called with `setpts=0.5*PTS` and `drawtext` filter
  - [ ] Assert portrait path differs from landscape path
  - [ ] Assert both `verify_clip` calls made
- [ ] Run tests — pass
- [ ] Commit: `"feat(worker): Stage 3 AI effects — face zoom, 2x slow-mo, captions, portrait crop"`

---

### Prompt 58 — Highlight Reel Assembly

- [ ] Create `services/video-pipeline/workers/reel_assembler.py`
  - [ ] Class `ReelAssembler(db_conn, session_id, station_id)`
  - [ ] `is_session_complete() -> bool`: session status=`COMPLETED` AND all ClipJobs done/failed AND at least 1 DONE
  - [ ] `assemble()`:
    - [ ] Fetch all DONE ClipJobs sorted by `enqueuedAt ASC`
    - [ ] Generate title card PNG with Pillow (dark bg, white text, "Station N — Match Highlights"), encode as 3s video
    - [ ] For each clip: generate numbered transition card ("Moment N"), encode as 1s video
    - [ ] Build concat list: title + (transition + clip) pairs
    - [ ] `ffmpeg -f concat -c copy` with watermark `drawtext` overlay (20px corner) → `reel_landscape.mp4`
    - [ ] Generate QR code PNG (`qrcode` library), encode as 3s video, append to concat
    - [ ] Portrait reel: use `portraitClipPath` per clip + portrait-format title/transitions → `reel_portrait.mp4`
    - [ ] UPDATE `Session` with `reelPath` and `portraitReelPath`
    - [ ] Emit WebSocket `replay:reel_ready` with reel URLs
  - [ ] Periodic trigger: every 30s scan COMPLETED sessions without reel, call `assemble()` if `is_session_complete()`
- [ ] Create systemd unit `neo-lounge-reel-assembler.service`
- [ ] Write `services/video-pipeline/tests/test_reel_assembler.py`
  - [ ] 3 DONE ClipJobs — assert concat list has title + 3 (transition + clip) pairs
  - [ ] Assert QR code video appended at end
  - [ ] Assert portrait reel uses `portraitClipPath` not `finalClipPath`
  - [ ] Assert `Session.reelPath` updated after assembly
  - [ ] Assert WebSocket event emitted
- [ ] Run tests — pass
- [ ] Commit: `"feat(worker): highlight reel assembly with title cards, transitions, QR code frame"`

---

### Prompt 59 — Tablet UX Updates: Notifications, Live Counter, QR Code

- [ ] Update `apps/tablet/src/lib/socket.ts`
  - [ ] Listen for `replay:clip_ready` → increment `clipReadyCount`
  - [ ] Listen for `replay:all_ready` → set `allReady=true`, store reel URLs
  - [ ] Listen for `replay:reel_ready` → set `reelReady=true`, store reel QR URL
- [ ] Create `apps/tablet/src/components/ReplayStatus.tsx`
  - [ ] Props: `{ clipReadyCount, totalClips, reelReady, reelQrUrl }`
  - [ ] Show `"X moments captured so far"` counter while `clipReadyCount > 0` and session active
  - [ ] NO clip thumbnails, NO clip preview, NO clip URLs shown anywhere
  - [ ] When `reelReady=true`: show `"Your highlight reel is ready!"` notification banner
  - [ ] Show `qrcode.react` QR code pointing to `reelQrUrl`
  - [ ] Caption: `"Scan to watch and share your highlights"`
  - [ ] Text large enough to read from 1.5m, dark theme
- [ ] Update `apps/tablet/src/app/page.tsx` (active session page)
  - [ ] Add `ReplayStatus` below countdown timer
  - [ ] Pass `clipReadyCount` and `reelReady` from socket listeners
- [ ] Ensure no clip URLs rendered anywhere on tablet — confirm with code review
- [ ] Write `apps/tablet/src/__tests__/ReplayStatus.test.tsx` (React Testing Library)
  - [ ] `clipReadyCount=0` — assert counter not shown
  - [ ] `clipReadyCount=2`, `reelReady=false` — assert "2 moments captured" shown, no QR code
  - [ ] `reelReady=true`, `reelQrUrl` set — assert notification banner and QR code visible
  - [ ] Assert no `<img>` or `<video>` tags referencing clip paths
- [ ] Run tests — pass
- [ ] Commit: `"feat(tablet): replay counter, reel-ready notification, and QR code (no preview)"`

---

### Prompt 60 — PWA Updates: Portrait Download and Live Progress

- [ ] Update replay PWA clip list page
  - [ ] For each DONE clip: add `"Portrait (9:16)"` download button alongside existing landscape button
  - [ ] Both buttons use existing auth-code-protected download endpoint
- [ ] Add live progress indicator
  - [ ] While any ClipJob is `PENDING/EXTRACTING/STITCHING/AI_EFFECTS`: show `"Processing your highlights… X of Y ready"` with animated progress bar
  - [ ] When all done: hide bar, show `"All highlights ready!"`
  - [ ] Subscribe to `replay:clip_ready` WebSocket event to increment done count in real-time
- [ ] Add highlight reel section below clip list
  - [ ] While reel not ready: show `"Highlight reel compiling…"` with spinner
  - [ ] On `replay:reel_ready`: show landscape and portrait reel download buttons
  - [ ] Show share hint: `"Save to gallery and share on WhatsApp or TikTok"`
- [ ] Update `GET /api/replays/:sessionId` response
  - [ ] Include `portraitClipPath` (or `portraitUrl`) per clip
  - [ ] Include `status` per clip
  - [ ] Include top-level: `totalClips`, `doneClips`, `reelReady`, `reelUrl`, `portraitReelUrl`
- [ ] Write `apps/pwa/src/__tests__/ReplayPage.test.tsx`
  - [ ] 2 clips (1 DONE, 1 AI_EFFECTS), `reelReady=false` — assert progress bar shows "1 of 2 ready"
  - [ ] DONE clip shows both landscape and portrait download buttons
  - [ ] AI_EFFECTS clip shows no download button
  - [ ] Simulate `replay:reel_ready` event → assert reel download buttons appear
- [ ] Write/update `apps/api/src/routes/__tests__/replays.test.ts`
  - [ ] `GET /api/replays/:sessionId` returns `portraitClipPath` and `status` per clip
  - [ ] Returns `totalClips` and `doneClips` counts
- [ ] Run tests — pass
- [ ] Commit: `"feat(pwa): portrait download, live progress bar, highlight reel download"`

---

### Prompt 61 — Dashboard Health Endpoints: Temperature, NVMe, Pipeline Status

- [ ] Create `apps/api/src/services/healthService.ts`
  - [ ] `getCpuTemperature()`: read `/sys/class/thermal/thermal_zone0/temp`, divide by 1000
  - [ ] `getNvmeHealth()`: run `smartctl -j -a /dev/nvme0`, extract `percentage_used` and temperature; graceful fallback if smartctl unavailable
  - [ ] `getPipelineStatus()`: run `systemctl is-active` for all 6 pipeline services, return dict of service → status
- [ ] Create `GET /api/system/health/hardware` (owner auth required)
  - [ ] Returns `{ cpuTemp, nvme: { healthy, percentUsed, temperature }, pipeline: { ...statuses } }`
  - [ ] If `cpuTemp > 80`: include `warning: true`
- [ ] Create `GET /api/system/health/pipeline`
  - [ ] ClipJob counts by status for last 24 hours
  - [ ] GameReplay clips harvested today
  - [ ] Ring buffer stats per station (segment count, oldest/newest segment age)
- [ ] Update owner dashboard frontend
  - [ ] Hardware health card: CPU temp gauge (green/amber/red), NVMe % used bar, service dots
  - [ ] Auto-refresh every 30 seconds
- [ ] Write `apps/api/src/services/__tests__/healthService.test.ts`
  - [ ] Mock `fs.readFile` for thermal zone — assert correct temp
  - [ ] Mock `exec` for smartctl JSON — assert `percentUsed` extracted
  - [ ] Mock `systemctl` output — assert service statuses parsed
- [ ] Write `apps/api/src/routes/__tests__/health.test.ts`
  - [ ] `GET /api/system/health/hardware` returns 200 with correct shape
  - [ ] `cpuTemp > 80` → `warning: true` in response
- [ ] Run tests — pass
- [ ] Commit: `"feat(health): CPU temp, NVMe SMART, pipeline status endpoints and dashboard panel"`

---

### Prompt 62 — Reliability: systemd Watchdog, UPS Shutdown, Temperature SMS

- [ ] Verify all pipeline systemd units include `WatchdogSec=30` and `NotifyAccess=main`
  - [ ] `neo-lounge-tv-capture@.service`
  - [ ] `neo-lounge-ring-pruner.service`
  - [ ] `neo-lounge-webcam@.service`
  - [ ] `neo-lounge-audio-detector@.service`
  - [ ] `neo-lounge-event-merger.service`
  - [ ] `neo-lounge-game-analyzer@.service`
  - [ ] `neo-lounge-clip-extractor.service`
  - [ ] `neo-lounge-replay-harvester.service`
  - [ ] `neo-lounge-stitch-worker.service`
  - [ ] `neo-lounge-ai-effects-worker.service` (WatchdogSec=60)
  - [ ] `neo-lounge-reel-assembler.service`
- [ ] Add `sdnotify` watchdog keepalive to each Python worker's main loop (`n.notify("WATCHDOG=1")` every loop iteration)
- [ ] Create `services/system/ups_shutdown.sh`
  - [ ] `pkill -SIGTERM -f "ffmpeg.*seg_%s.ts"` then 3s sleep
  - [ ] `psql -U lounge -c "CHECKPOINT;"`
  - [ ] `systemctl poweroff`
  - [ ] Include comment block explaining NUT `upsmon.conf` wiring
- [ ] Create `services/system/temp_monitor.py`
  - [ ] Read thermal zone temp every 60s
  - [ ] Maintain `consecutive_high` counter
  - [ ] 3 consecutive readings > 80°C → send SMS via Africa's Talking to `Settings.ownerPhone`
  - [ ] Message: `"⚠️ Neo Lounge alert: CPU temperature is {temp}°C. Check ventilation."`
  - [ ] 30-minute minimum between alerts (reset counter after sending)
  - [ ] Drop below 75°C resets counter
  - [ ] Log temp at DEBUG every cycle
- [ ] Create systemd unit `neo-lounge-temp-monitor.service`
- [ ] Write `services/system/tests/test_temp_monitor.py`
  - [ ] 3 consecutive reads > 80°C → assert SMS sent exactly once
  - [ ] 4th read > 80°C within 30min → assert no second SMS
  - [ ] Read below 75°C resets counter → 3 more high reads needed before next SMS
  - [ ] Mock Africa's Talking client — assert correct message and phone number
- [ ] Run tests — pass
- [ ] Commit: `"feat(reliability): systemd watchdog notify, UPS clean shutdown, temperature SMS"`

---

### Prompt 63 — Storage Lifecycle: 1-Hour Session Cleanup

- [ ] Create `services/video-pipeline/workers/session_cleanup.py`
  - [ ] Query: `Session WHERE status='COMPLETED' AND endTime < NOW() - 1 hour AND purgedAt IS NULL`
  - [ ] For each session: `shutil.rmtree(/var/lounge/sessions/{session_id}/)` (catch and log errors, continue)
  - [ ] UPDATE `Session.purgedAt = NOW()`
  - [ ] NULL out all file paths on associated `ClipJob` rows
  - [ ] Log `"Session {id} purged: {MB}MB freed"`
- [ ] Create systemd unit `neo-lounge-session-cleanup.service` (Type=oneshot)
- [ ] Create systemd timer `neo-lounge-session-cleanup.timer` (`OnCalendar=*:0/5` — every 5 minutes)
- [ ] Update `GET /api/replays/:sessionId`
  - [ ] If `session.purgedAt` is set: return `410 Gone` with `"This session's replays have expired. Sessions are available for 1 hour after completion."`
- [ ] Write `services/video-pipeline/tests/test_session_cleanup.py`
  - [ ] Session ended 61 min ago with files present → assert `shutil.rmtree` called, `purgedAt` set, ClipJob paths nulled
  - [ ] Session ended 59 min ago → assert NOT cleaned
  - [ ] `shutil.rmtree` raises `PermissionError` → assert error logged, continues to next session
- [ ] Run tests — pass
- [ ] Commit: `"feat(lifecycle): 1-hour session cleanup worker with purge tracking"`

---

### Prompt 64 — Full Integration Test: Enhanced Pipeline End-to-End

- [ ] Create `services/video-pipeline/tests/test_pipeline_integration.py`
  - [ ] Setup: real test DB, mock ffmpeg (exit 0, touch output files), mock YuNet/FER (one face, emotion="joy"), mock Africa's Talking, real Session + MatchState rows
  - [ ] Step 1: Session starts → confirm `MatchState` row created
  - [ ] Step 2: 3 `PendingEvent` rows written at T=0, T=5, T=25 (source="audio", type=CROWD_NOISE)
  - [ ] Step 3: `EventMerger.run_merge_cycle()` → assert T=0+T=5 merged (1 ClipJob), T=25 separate (1 ClipJob) = 2 total
  - [ ] Step 4: game analyzer writes `PendingEvent` at T=40 (GAME_REPLAY) → assert 3rd ClipJob created
  - [ ] Step 5: replay harvester — `isReplayOnScreen=True` for 12s → assert 1 `GameReplay` row with `clipPath` set
  - [ ] Step 6: clip extractor runs all 3 jobs → assert all move `EXTRACTING → STITCHING`, `tvClipPath` set
  - [ ] Step 7: stitch worker runs all 3 → assert all move `STITCHING → AI_EFFECTS`, `stitchedClipPath` set
  - [ ] Step 8: AI effects worker runs all 3 → assert all move `AI_EFFECTS → DONE`, `finalClipPath` and `portraitClipPath` set
  - [ ] Step 9: session ends (`status=COMPLETED`, `endTime=NOW()`)
  - [ ] Step 10: reel assembler runs → assert `Session.reelPath` set, WebSocket `replay:reel_ready` emitted
  - [ ] Step 11: cleanup worker with session ended < 1 hour → assert NOT purged; advance mock time 61 min → run cleanup → assert `session.purgedAt` set, directories deleted
  - [ ] All assertions must pass — fix any issues found
- [ ] Run integration test — all assertions pass
- [ ] Commit: `"test(integration): full enhanced pipeline end-to-end test — all stages green"`

---

## Stage 11 Summary

| Prompt | Status | What Gets Built |
|--------|--------|----------------|
| 48 | ⬜ | DB schema: PendingEvent, ClipJob, GameReplay, MatchState + new fields |
| 49 | ⬜ | TV ring buffer (tmpfs) with pruner and systemd units |
| 50 | ⬜ | Webcam 120fps capture + security camera capture services |
| 51 | ⬜ | YAMNet detector → PendingEvent + EventMerger → ClipJob + NOTIFY |
| 52 | ⬜ | Game stream analyzer at 240p/2fps (template match, OCR, events) |
| 53 | ⬜ | Stage 1 clip extraction worker (LISTEN/NOTIFY, FIFO, ffmpeg -c copy) |
| 54 | ⬜ | FIFA in-game replay harvester |
| 55 | ⬜ | Stage 2 stitch worker (PiP overlay, Quick Sync, x264 fallback) |
| 56 | ⬜ | Caption library JSON (40+ Sheng/Swahili entries) + selector |
| 57 | ⬜ | Stage 3 AI effects (YuNet, FER, zoom, 2× slow-mo, captions, portrait) |
| 58 | ⬜ | Highlight reel assembly (title cards, transitions, QR frame) |
| 59 | ⬜ | Tablet UX: counter, notification, QR code (no preview, no SMS) |
| 60 | ⬜ | PWA: portrait download, live progress, reel download |
| 61 | ⬜ | Dashboard: CPU temp, NVMe SMART, pipeline service status |
| 62 | ⬜ | Reliability: watchdog keepalive, UPS shutdown, temp SMS |
| 63 | ⬜ | Storage lifecycle: 1-hour cleanup, 410 Gone on purged replays |
| 64 | ⬜ | Full end-to-end integration test |

**Total new prompts: 17 (48–64)**
