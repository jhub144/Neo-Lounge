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

> All prompts 47.5 and 48–64 are in `docs/PROMPT-PLAN-STAGES-4-10.md`. Start every session with:
> `Read docs/WORKING-RULES.md and docs/SPEC.md §5–§7.`
> Every Stage 11 prompt must read SPEC field names, defaults, and routes directly — no guessing.

---

### Prompt 47.5 — Stage 11 Setup: System Deps, Python Env, Model Downloads

- [ ] Update `scripts/provision.sh` to apt-install: `ffmpeg`, `tesseract-ocr`, `smartmontools`, `nut-client`, `fonts-dejavu-core`, `intel-media-va-driver-non-free`
- [ ] Create `services/video-pipeline/requirements.txt`: `opencv-contrib-python`, `onnxruntime`, `numpy`, `pytesseract`, `Pillow`, `qrcode[pil]`, `sdnotify`, `psycopg2-binary`, `tflite-runtime`
- [ ] Create `services/video-pipeline/models/download_models.sh`
  - [ ] Download YAMNet tflite → `yamnet.tflite`
  - [ ] Download YuNet → `face_detection_yunet_2023mar.onnx`
  - [ ] Download FER MobileNet → `fer_mobilenet.onnx`
  - [ ] Write `SHA256SUMS.txt`, verify after download
- [ ] Document env vars `YAMNET_MODEL_PATH`, `YUNET_MODEL_PATH`, `FER_MODEL_PATH` in `.env.example`
- [ ] Verify `ffmpeg -muxers | grep segment` and `ffmpeg -hwaccels | grep qsv`
- [ ] Commit: `"chore(stage11): system deps, python env, model downloads"`

---

### Prompt 48 — Database Schema: SPEC §5 Models + Settings Defaults

- [ ] Open `docs/SPEC.md` §5 — use it as the authoritative field list
- [ ] In `apps/api/prisma/schema.prisma`:
  - [ ] Add enum `EventType`: `GOAL_CANDIDATE | PENALTY_MISS | RED_CARD | YELLOW_CARD | MATCH_END | SCORE_CHANGE`
  - [ ] Add enum `EventSource`: `AUDIO_AI | GAME_ANALYZER | BOTH`
  - [ ] Add enum `ClipJobStatus`: `PENDING | EXTRACTING | STITCHING | ENHANCING | DONE | FAILED`
  - [ ] Add model `PendingEvent` — every field and type per SPEC §5 (`source EventSource`, `eventType EventType`, `confidence`, `detectedAt`, `clipStart`, `clipEnd`, `mergedIntoClipJobId`, `rawPayload Json`)
  - [ ] Add model `ClipJob` per SPEC §5 (`status ClipJobStatus`, `tvSegmentPath`, `webcamSegmentPath`, `gameReplayPath`, `stitchedPath`, `enhancedPath`, `portraitPath`, `clipStart`, `clipEnd`, `errorMessage`, timestamps)
  - [ ] Add model `GameReplay` per SPEC §5 (`detectedAt`, `clipPath`, `durationSeconds`, `confidence`, `used Boolean`)
  - [ ] Add model `MatchState` per SPEC §5 (`stationId` unique, `homeScore`, `awayScore`, `matchMinute`, `isReplayShowing`, `rawOcrText`, `capturedAt`)
  - [ ] Add `analysisWebcamDevice String?` to `Station` (Station 4 only)
  - [ ] Add `Session.purgedAt DateTime?`
  - [ ] Add `Settings` fields with SPEC §5 defaults: `clipPreRollSeconds=5`, `clipPostRollSeconds=25`, `eventMergeWindowSeconds=25`, `yamnetConfidenceThreshold=0.55`, `replayDetectionThreshold=0.80`, `replayTTLMinutes=60`, `alertTempCelsius=80`, `alertSmsNumber String?`, plus `gameAnalysisEnabled`, `audioDetectionEnabled`, `stage2Enabled`, `stage3Enabled`, `securityRetentionDays`
- [ ] **Verification**: diff schema vs SPEC §5 field-by-field (name, type, default, enum values) before migrating
- [ ] Write data migration that seeds existing `Settings` row with the SPEC defaults above
- [ ] `npx prisma migrate dev --name stage11_video_pipeline` — applies cleanly
- [ ] `npx prisma generate` — no errors
- [ ] Write `apps/api/src/services/__tests__/schema.test.ts` — create PendingEvent(source=BOTH), ClipJob(status=ENHANCING), GameReplay, MatchState; assert SPEC field names round-trip
- [ ] Run schema test — passes
- [ ] Commit: `"feat(db): stage 11 schema — SPEC §5 models, enums, Settings defaults"`

---

### Prompt 49 — TV Ring Buffer: ffmpeg segment_wrap (no pruner)

- [ ] Refactor `services/video-pipeline/capture/` (directory already exists)
- [ ] Update `services/video-pipeline/capture/tv_capture.py`
  - [ ] Output directory: `/run/lounge/tv{station_id}/` (tmpfs), `mkdir -p` before launch
  - [ ] ffmpeg args: `-f segment -segment_time 2 -segment_format mpegts -segment_wrap 60 -reset_timestamps 1 -c copy /run/lounge/tv{N}/seg_%03d.ts`
  - [ ] Comment in code: "No pruner needed — ffmpeg overwrites oldest segment via segment_wrap (SPEC §7)"
  - [ ] Reads `STATION_ID` and capture source from env; per-station systemd instance
- [ ] Create `services/video-pipeline/capture/ring_buffer.py`
  - [ ] Class `RingBuffer(station_id, buffer_dir='/run/lounge/tv{N}')`
  - [ ] `get_segments_in_window(start_dt, end_dt) -> list[Path]` — uses **mtime** (sequence numbers wrap)
  - [ ] `get_segment_for_time(dt) -> Path | None`
  - [ ] **No** `prune()` method — segments are overwritten by ffmpeg
- [ ] **DELETE** any `pruner.py` references; no `neo-lounge-ring-pruner.service`
- [ ] Create systemd unit `neo-lounge-tv-capture@.service` (template, per-station, WatchdogSec=30)
- [ ] Mount `/run/lounge` as tmpfs in `/etc/fstab` (provision script)
- [ ] Document ffmpeg segment muxer as system dep (already in Prompt 47.5)
- [ ] Write `services/video-pipeline/tests/test_ring_buffer.py`
  - [ ] Fake `.ts` files with varied mtimes — assert `get_segments_in_window()` returns correct set
  - [ ] Assert no pruning calls anywhere (ring buffer is passive)
- [ ] Run tests — pass
- [ ] Commit: `"feat(capture): tmpfs ring buffer via ffmpeg segment_wrap=60 (SPEC §7)"`

---

### Prompt 50 — Webcam + Security Capture (per-station FPS)

- [ ] Refactor `services/video-pipeline/capture/webcam_capture.py`
  - [ ] Read `Station` row; `framerate = 120 if station.analysisWebcamDevice else 60` (SPEC §7 line 379)
  - [ ] `-video_size 1280x720 -framerate {fps} -c copy` via v4l2
  - [ ] Output: `/var/lounge/webcam{N}/seg_%Y%m%d_%H%M%S.ts` (10-second segments)
  - [ ] Keeps rolling 60s **after** session end (late clip extraction window)
  - [ ] Polls API every 5s for active session; SIGTERM on session end + 60s
- [ ] Refactor `services/video-pipeline/security/recorder.py`
  - [ ] Reads `Settings.securityRetentionDays` at runtime; deletes older segments
  - [ ] 300-second segments, `-c copy`, continuous
- [ ] systemd: `neo-lounge-webcam@.service` (per-station template), `neo-lounge-security-cam@.service`
- [ ] Tests `test_webcam_capture.py`
  - [ ] Station 4 (`analysisWebcamDevice` set) → assert `-framerate 120`
  - [ ] Stations 1–3 → assert `-framerate 60`
  - [ ] Assert SIGTERM sent 60s after session end, not immediately
- [ ] Run tests — pass
- [ ] Commit: `"feat(capture): per-station webcam FPS (Station 4 @120, others @60)"`

---

### Prompt 51 — YAMNet Audio Detector + EventMerger (corroboration)

- [ ] Refactor `services/video-pipeline/detection/audio_detector.py`
  - [ ] `INSERT INTO "PendingEvent"` using SPEC field names: `source=AUDIO_AI::"EventSource"`, `eventType`, `detectedAt`, `confidence`, `rawPayload`
  - [ ] Compute `clipStart = detectedAt - Settings.clipPreRollSeconds`, `clipEnd = detectedAt + Settings.clipPostRollSeconds`
  - [ ] Read `Settings.yamnetConfidenceThreshold` (0.55) at startup, refresh every 60s
  - [ ] Tension boost: lower threshold by 0.05 when `MatchState.matchMinute >= 80` or score tied
- [ ] Refactor `services/video-pipeline/detection/event_merger.py`
  - [ ] Reads `Settings.eventMergeWindowSeconds` (25) at runtime
  - [ ] `run_merge_cycle()`:
    - [ ] Query unmerged PendingEvents, group by `(stationId, sessionId)`, sort by `detectedAt`
    - [ ] Cluster events within merge window → single root
    - [ ] **Corroboration**: when cluster contains both `AUDIO_AI` and `GAME_ANALYZER` sources → create ClipJob with `source=BOTH`, confidence boosted to 0.95
    - [ ] Compute ClipJob `clipStart`/`clipEnd` from cluster extents
    - [ ] Set `mergedIntoClipJobId` on every member event
    - [ ] `NOTIFY clip_jobs_channel, '{stationId}'`
  - [ ] `synthesize_match_end(session_id)`: when session transitions to COMPLETED, INSERT synthetic `MATCH_END` PendingEvent (source=GAME_ANALYZER) and run merge
- [ ] systemd: `neo-lounge-audio-detector@.service`, `neo-lounge-event-merger.service`
- [ ] Tests `test_event_merger.py`
  - [ ] Events T=0 AUDIO_AI, T=10 AUDIO_AI, T=60 AUDIO_AI (window=25) → 2 ClipJobs
  - [ ] Corroboration: T=5 AUDIO_AI + T=12 GAME_ANALYZER → 1 ClipJob with source=BOTH, confidence=0.95
  - [ ] Session COMPLETED → MATCH_END PendingEvent inserted and produces final ClipJob
  - [ ] No duplicate ClipJob on re-run (idempotent)
- [ ] Run tests — pass
- [ ] Commit: `"feat(detection): YAMNet + EventMerger with BOTH-source corroboration"`

---

### Prompt 52 — Game Stream Analyzer (320×240, SPEC enums)

- [ ] Refactor `services/video-pipeline/detection/game_analyzer/`
- [ ] `frame_reader.py`: ffmpeg pipe `-vf scale=320:240 -r 2 -f rawvideo -pix_fmt bgr24 pipe:1`, frames shape `(240, 320, 3)` (SPEC §7)
- [ ] `detectors.py`:
  - [ ] `detect_replay_banner(frame) -> float` returns confidence; caller compares to `Settings.replayDetectionThreshold` (0.80)
  - [ ] `detect_card_flash(frame) -> "red" | "yellow" | None`
  - [ ] `detect_goal_flash(frame, prev) -> bool`
  - [ ] `extract_score_and_minute(frame) -> (score_text, minute_text)` via tesseract
- [ ] `analyzer.py` — writes SPEC enum values only:
  - [ ] Replay banner confidence > threshold → UPDATE MatchState `isReplayShowing=true`, `capturedAt=NOW()`, `rawOcrText`; INSERT/UPDATE `GameReplay` row with confidence
  - [ ] Banner disappears → `isReplayShowing=false`, finalise GameReplay clip extraction
  - [ ] Red card → `RED_CARD` PendingEvent (source=GAME_ANALYZER)
  - [ ] Yellow card → `YELLOW_CARD`
  - [ ] Goal flash → `GOAL_CANDIDATE`
  - [ ] Score change via OCR → `SCORE_CHANGE` + update MatchState scores/minute
  - [ ] 20s per-type debounce per station
- [ ] systemd: `neo-lounge-game-analyzer@.service`
- [ ] Tests `test_detectors.py`: synthetic red rectangle → `"red"`, identical frames → no goal flash, OCR mock → parsed score/minute
- [ ] Tests: `detect_replay_banner` returns float; analyzer only writes SPEC enum names
- [ ] Run tests — pass
- [ ] Commit: `"feat(analyzer): game stream 320×240/2fps with SPEC event enums"`

---

### Prompt 53 — Stage 1 Clip Extractor (reads ClipJob.clipStart/clipEnd)

- [ ] Refactor `services/video-pipeline/capture/clips.py` (or workers/clip_extractor.py)
  - [ ] `LISTEN clip_jobs_channel`, `select()` with 30s watchdog tick
  - [ ] `SELECT ... FOR UPDATE SKIP LOCKED` oldest PENDING FIFO → status=EXTRACTING, set `startedAt`
  - [ ] Read `clipStart` and `clipEnd` **directly from the ClipJob row** (already populated by EventMerger)
  - [ ] `extract_tv_clip(job)`: `RingBuffer.get_segments_in_window(job.clipStart, job.clipEnd)` → concat list → `ffmpeg -f concat -safe 0 -c copy` → write `tvSegmentPath`; verify > 5s
  - [ ] `extract_webcam_clip(job)`: same pattern on `/var/lounge/webcam{N}/`; **partial coverage** → clamp window to available mtimes, log warning, still write clip; only null `webcamSegmentPath` if zero coverage
  - [ ] `maybe_extract_game_replay(job)`: query `GameReplay WHERE stationId=? AND detectedAt BETWEEN clipStart AND clipEnd AND used=false`; copy path into `ClipJob.gameReplayPath`; flip `GameReplay.used=true`
  - [ ] Update job → status=STITCHING, `NOTIFY stitch_jobs_channel, '{job_id}'`
  - [ ] On exception: status=FAILED, `errorMessage`
- [ ] `ffprobe_utils.py`: `get_duration()`, `verify_clip(min=5.0)`
- [ ] systemd: `neo-lounge-clip-extractor.service` (WatchdogSec=30)
- [ ] Tests `test_clip_extractor.py`
  - [ ] Job with `clipStart`/`clipEnd` set → ffmpeg called with segments in that window (no event-ID-to-time derivation)
  - [ ] Partial webcam coverage → `webcamSegmentPath` set, warning logged, job not failed
  - [ ] Zero webcam coverage → `webcamSegmentPath` null, job proceeds
  - [ ] Overlapping GameReplay → `gameReplayPath` populated, `used=true`
  - [ ] `FOR UPDATE SKIP LOCKED` present in SQL
  - [ ] TV clip < 5s → job FAILED
- [ ] Run tests — pass
- [ ] Commit: `"feat(worker): Stage 1 clip extraction — reads clipStart/clipEnd + gameReplayPath linking"`

---

### Prompt 54 — FIFA Replay Sweeper (folded into EventMerger)

- [ ] **No standalone harvester** — Prompt 52 analyzer already writes `GameReplay` rows; Prompt 53 links them via `gameReplayPath`
- [ ] Add `sweep_orphan_game_replays()` to `services/video-pipeline/detection/event_merger.py`
  - [ ] Query `GameReplay WHERE used=false AND detectedAt < NOW() - interval '60 seconds'`
  - [ ] For each orphan: create a ClipJob with `clipStart=detectedAt - 2s`, `clipEnd=detectedAt + durationSeconds + 2s`, `source=GAME_ANALYZER`
  - [ ] Flip `GameReplay.used=true` inside the same transaction
  - [ ] `NOTIFY clip_jobs_channel, '{stationId}'`
  - [ ] Called once per `run_merge_cycle()`
- [ ] Extend `test_event_merger.py`
  - [ ] Orphan GameReplay older than 60s → sweeper creates ClipJob with correct window, marks used
  - [ ] GameReplay within 60s window → skipped (Prompt 53 will pick it up first)
  - [ ] Already-`used=true` → no duplicate ClipJob
- [ ] Run tests — pass
- [ ] Commit: `"feat(merger): sweep orphan GameReplays into ClipJobs (no standalone harvester)"`

---

### Prompt 55 — Stage 2 Stitch Worker (PiP + gameReplay concat)

- [ ] Refactor `services/video-pipeline/capture/stitcher.py` (or workers/stitch_worker.py)
  - [ ] `LISTEN stitch_jobs_channel`, `SELECT ... WHERE status='STITCHING' FOR UPDATE SKIP LOCKED`
  - [ ] Reads `tvSegmentPath`, `webcamSegmentPath`, `gameReplayPath` from ClipJob
  - [ ] No webcam → simple remux of TV clip to `stitchedPath`
  - [ ] Webcam present → `filter_complex` PiP (webcam 320×180 bottom-right, 20px margin)
  - [ ] Encode `-c:v h264_qsv -preset fast -b:v 3M -c:a aac -b:a 128k`; fallback `-c:v libx264 -preset fast -crf 23`
  - [ ] **If `gameReplayPath` is set**: after base stitched output, concat the game replay onto the end (`ffmpeg -f concat -c copy`)
  - [ ] Verify `stitchedPath` > 5s
  - [ ] If `Settings.stage3Enabled`: status=`ENHANCING`, `NOTIFY ai_effects_channel`
  - [ ] Else: status=`DONE`, upsert `ReplayClip`, emit `replay:clip_ready`, call `check_session_all_ready()`
- [ ] Create `services/video-pipeline/workers/completion.py` with `check_session_all_ready(session_id)`
  - [ ] If all session ClipJobs are `DONE` or `FAILED` and at least one `DONE`, emit `replay:all_ready` **once per session** (use Redis/DB flag for idempotency)
- [ ] systemd: `neo-lounge-stitch-worker.service`
- [ ] Tests `test_stitch_worker.py`
  - [ ] Webcam present → PiP filter built
  - [ ] Webcam absent → simple remux
  - [ ] `gameReplayPath` set → final output includes concat tail
  - [ ] QSV fails → libx264 fallback
  - [ ] stage3 disabled → status DONE, `replay:all_ready` emitted when last job finishes
- [ ] Run tests — pass
- [ ] Commit: `"feat(worker): Stage 2 stitcher — PiP + gameReplay concat + all_ready signal"`

---

### Prompt 56 — Caption Library: JSON Structure and Selection Logic

- [ ] Create `services/video-pipeline/captions/captions.json`
  - [ ] Schema: `id`, `context`, `emotion`, `conditions` (minMinute, maxMinute, scoreDelta), `text_en`, `text_sw`
  - [ ] At least 40 seed entries (target ~1000 over time) covering: goals (first half, 80th+ minute), equalisers, red cards, celebrations when winning, despair when losing, last-minute shock, generic crowd noise
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
  - [ ] Listens on `ai_effects_channel`; processes ClipJobs where `status='ENHANCING'` FOR UPDATE SKIP LOCKED
  - [ ] Reads `job.stitchedPath`; writes `job.enhancedPath` + `job.portraitPath`
  - [ ] Step 1 — Sample webcam frames from the stitched clip
  - [ ] Step 2 — YuNet face detection (`face_detection_yunet_2023mar.onnx`, confidence > 0.7)
  - [ ] Step 3 — FER MobileNet emotion via onnxruntime
  - [ ] Step 4 — Caption selection: event-type → context map, use detected emotion + MatchState
  - [ ] Step 5 — Per-station slow-mo gating: `slow_mo_enabled = bool(station.analysisWebcamDevice)` (Station 4 only)
  - [ ] Step 6 — Two-pass ffmpeg (do **not** chain setpts with zoom/drawtext):
    - [ ] Pass A (slow-mo only, if enabled): `-vf "setpts=2.0*PTS" -r 60` (SPEC §7 lines 666, 688 — real slow-mo: 120fps source stretched to 60fps)
    - [ ] Pass B: face zoom (2 faces → split, 1 face → centred, 0 → full frame) + `drawtext` caption burn-in (Swahili, white on black box, bottom-centre)
    - [ ] Landscape 1280×720 `-c:v libx264 -preset fast -crf 22 -r 60`
    - [ ] Portrait 1080×1920: crop 9:16 centred on face x, scale
  - [ ] Step 7 — Verify both outputs > 5s
  - [ ] Step 8 — Update ClipJob (`enhancedPath`, `portraitPath`, status=`DONE`, `completedAt`)
  - [ ] Upsert `ReplayClip` with `enhancedPath` + `portraitPath`
  - [ ] Emit `replay:clip_ready`
  - [ ] Call `check_session_all_ready(session_id)` → may emit `replay:all_ready`
- [ ] systemd: `neo-lounge-ai-effects-worker.service` (WatchdogSec=60)
- [ ] Tests `test_ai_effects_worker.py`
  - [ ] Station 4 job → ffmpeg command contains `setpts=2.0*PTS` (NOT `0.5*PTS`)
  - [ ] Stations 1–3 → no `setpts` filter
  - [ ] Mock FER `{"joy": 0.85}` → assert caption selector called with `emotion="joy"`
  - [ ] `portraitPath` differs from `enhancedPath`
  - [ ] Both `verify_clip` calls made
  - [ ] Processes only status=`ENHANCING` (not `AI_EFFECTS`)
- [ ] Run tests — pass
- [ ] Commit: `"feat(worker): Stage 3 enhancer — per-station 2.0*PTS slow-mo, face zoom, captions"`

---

### Prompt 58 — Highlight Reel Assembly

- [ ] Create `services/video-pipeline/workers/reel_assembler.py`
  - [ ] `is_session_complete()`: session COMPLETED AND all ClipJobs DONE/FAILED AND at least 1 DONE
  - [ ] `assemble(session_id)`:
    - [ ] Fetch DONE ClipJobs sorted by `enqueuedAt ASC`; use `job.enhancedPath` (landscape) and `job.portraitPath` (portrait)
    - [ ] Title card PNG (Pillow) → 3s encoded clip
    - [ ] Numbered transition cards ("Moment N") → 1s each
    - [ ] Concat: title + (transition + clip) pairs + QR code 3s video
    - [ ] Landscape: `ffmpeg -f concat -c copy` + watermark drawtext → write to `ReplayClip.stitchedReelPath`
    - [ ] Portrait reel: same pipeline using `portraitPath`s → `Session.portraitReelPath`
    - [ ] UPDATE Session `reelPath`, `portraitReelPath`
    - [ ] Emit `replay:reel_ready` with URLs
  - [ ] Periodic trigger every 30s
- [ ] systemd: `neo-lounge-reel-assembler.service`
- [ ] Tests `test_reel_assembler.py`
  - [ ] 3 DONE ClipJobs → concat list has title + 3 (transition + clip) pairs + QR tail
  - [ ] Portrait reel sourced from `portraitPath` (not `enhancedPath`)
  - [ ] `Session.reelPath` + `stitchedReelPath` updated
  - [ ] `replay:reel_ready` emitted
- [ ] Run tests — pass
- [ ] Commit: `"feat(worker): highlight reel assembly with title cards, QR tail, portrait reel"`

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

### Prompt 60 — Replay PWA (keyed by authCode)

- [ ] API routes per SPEC §6 — **all keyed by `:authCode`** (6-char code), not `:sessionId`:
  - [ ] `GET /api/replays/:authCode` — returns `{sessionId, authCode, stationId, totalClips, doneClips, reelReady, reelUrl, portraitReelUrl, clips:[{id, status, enhancedPath, portraitPath, durationSeconds, capturedAt}]}`
  - [ ] `GET /api/replays/:authCode/clips/:clipId/download?format=landscape|portrait`
  - [ ] `GET /api/replays/:authCode/reel/download?format=landscape|portrait`
  - [ ] 410 Gone with `{error: "expired", message: "Sessions are available for {replayTTLMinutes} minutes after completion"}` when `session.purgedAt` set
- [ ] PWA clip list page (`apps/pwa/src/app/[authCode]/page.tsx`)
  - [ ] Each DONE clip: landscape + portrait (9:16) download buttons
  - [ ] Progress bar while any ClipJob in `PENDING/EXTRACTING/STITCHING/ENHANCING`: `"X of Y ready"`
  - [ ] Subscribes to `replay:clip_ready`, `replay:all_ready`, `replay:reel_ready`
  - [ ] Reel section: spinner → buttons + `"Save to gallery and share on WhatsApp or TikTok"`
- [ ] Tests `apps/pwa/src/__tests__/ReplayPage.test.tsx`
  - [ ] 2 clips (1 DONE, 1 ENHANCING) → progress bar "1 of 2 ready"; ENHANCING shows no button
  - [ ] Simulate `replay:reel_ready` → reel buttons appear
  - [ ] 410 response → shows "expired" message
- [ ] Tests `apps/api/src/routes/__tests__/replays.test.ts`
  - [ ] Routes resolve by authCode; unknown code → 404
  - [ ] `purgedAt` set → 410 Gone
  - [ ] Response includes `portraitPath`, `status`, `totalClips`, `doneClips`, `reelReady`
- [ ] Run tests — pass
- [ ] Commit: `"feat(pwa): replay PWA keyed by authCode, portrait downloads, 410 on expiry"`

---

### Prompt 61 — Health Endpoints (two-endpoint design, SPEC §6 updated)

- [ ] **Prerequisite**: confirm SPEC §6 already updated to two-endpoint design (done in this remediation)
- [ ] `apps/api/src/services/healthService.ts`
  - [ ] `getCpuTemperature()`: `/sys/class/thermal/thermal_zone0/temp` / 1000
  - [ ] `getNvmeHealth()`: `smartctl -j -a /dev/nvme0` → percentUsed, temperature; graceful fallback
  - [ ] `getDiskFree()`: stat free bytes on `/var/lounge`
  - [ ] `getPipelineStatus()`: `systemctl is-active` for the real Stage 11 service list (NO `neo-lounge-ring-pruner`):
    - `neo-lounge-tv-capture@{1..4}`, `neo-lounge-webcam@{1..4}`, `neo-lounge-audio-detector@{1..4}`, `neo-lounge-game-analyzer@{1..4}`, `neo-lounge-event-merger`, `neo-lounge-clip-extractor`, `neo-lounge-stitch-worker`, `neo-lounge-ai-effects-worker`, `neo-lounge-reel-assembler`, `neo-lounge-session-cleanup.timer`, `neo-lounge-temp-monitor`
  - [ ] Reads `Settings.alertTempCelsius` at runtime
- [ ] `GET /api/system/health` (owner auth): `{cpuTemp, nvme, diskFree, services, warning: cpuTemp > alertTempCelsius}`
- [ ] `GET /api/system/pipeline-health`: ClipJob counts by status (PENDING/EXTRACTING/STITCHING/**ENHANCING**/DONE/FAILED), GameReplay counts, per-station ring buffer stats
- [ ] Owner dashboard: CPU gauge, NVMe bar, service dots, auto-refresh 30s
- [ ] Tests `healthService.test.ts` and `health.test.ts`
  - [ ] Assert `ENHANCING` key present in pipeline-health response (not `AI_EFFECTS`)
  - [ ] `cpuTemp > alertTempCelsius` → `warning: true`
  - [ ] No `neo-lounge-ring-pruner` reference anywhere
- [ ] Run tests — pass
- [ ] Commit: `"feat(health): /api/system/health + /api/system/pipeline-health (SPEC §6)"`

---

### Prompt 62 — Reliability (watchdog, UPS, temp SMS driven by Settings)

- [ ] Every pipeline systemd unit gets `WatchdogSec=30` (ai-effects=60) + `NotifyAccess=main`
  - [ ] tv-capture@, webcam@, audio-detector@, game-analyzer@, event-merger, clip-extractor, stitch-worker, ai-effects-worker, reel-assembler, temp-monitor, session-cleanup
  - [ ] **Do not** create a ring-pruner unit (Prompt 49 removed it)
- [ ] `sdnotify` keepalive in every Python worker main loop
- [ ] `services/system/ups_shutdown.sh`
  - [ ] `pkill -SIGTERM -f "ffmpeg.*seg_"` (pattern matches segment output regardless of format)
  - [ ] 3s sleep → `psql -U lounge -c "CHECKPOINT;"` → `systemctl poweroff`
  - [ ] NUT `upsmon.conf` wiring comment block
- [ ] `services/system/temp_monitor.py`
  - [ ] Reads `Settings.alertTempCelsius` and `Settings.alertSmsNumber` at startup, refresh every 60s
  - [ ] 3 consecutive reads ≥ threshold → SMS via Africa's Talking to `alertSmsNumber`
  - [ ] Emit WebSocket `system:temperature_warning` after SMS
  - [ ] 30-min minimum between alerts; drop below `threshold - 5` resets counter
- [ ] systemd: `neo-lounge-temp-monitor.service`
- [ ] Tests `test_temp_monitor.py`
  - [ ] 3 consecutive highs → 1 SMS + 1 WebSocket event
  - [ ] 4th within 30min → no second SMS
  - [ ] Settings change at runtime (lower threshold) → next read above new threshold triggers
  - [ ] Pattern assert in `ups_shutdown.sh` test: pkill pattern is `ffmpeg.*seg_`
- [ ] Run tests — pass
- [ ] Commit: `"feat(reliability): Settings-driven temp alerts, UPS shutdown, watchdog"`

---

### Prompt 63 — Session Cleanup (Settings.replayTTLMinutes)

- [ ] `services/video-pipeline/workers/session_cleanup.py`
  - [ ] Read `Settings.replayTTLMinutes` (default 60) at start of each cycle
  - [ ] Query: `Session WHERE status='COMPLETED' AND endTime < NOW() - (replayTTLMinutes || ' minutes')::interval AND purgedAt IS NULL`
  - [ ] `shutil.rmtree('/var/lounge/sessions/{id}/')` (catch errors, continue)
  - [ ] UPDATE session `purgedAt = NOW()`
  - [ ] NULL `stitchedPath`, `enhancedPath`, `portraitPath`, `gameReplayPath`, `tvSegmentPath`, `webcamSegmentPath` on associated ClipJobs
  - [ ] Log `"Session {id} purged: {MB}MB freed"`
- [ ] systemd oneshot + timer `OnCalendar=*:0/5`
- [ ] (`/api/replays/:authCode` already returns 410 in Prompt 60)
- [ ] Tests `test_session_cleanup.py`
  - [ ] With `replayTTLMinutes=60`: session ended 61min ago → cleaned; 59min → not cleaned
  - [ ] With `replayTTLMinutes=120` at runtime: session ended 61min ago → NOT cleaned
  - [ ] rmtree PermissionError → logged, loop continues
  - [ ] ClipJob path fields nulled post-purge
- [ ] Run tests — pass
- [ ] Commit: `"feat(lifecycle): Settings-driven replay TTL cleanup"`

---

### Prompt 64 — Full Pipeline Integration Test

- [ ] `services/video-pipeline/tests/test_pipeline_integration.py`
  - [ ] Setup: real test DB, mock ffmpeg (exit 0, touch outputs), mock YuNet/FER (1 face, joy), mock Africa's Talking, seed `Settings` with SPEC defaults
  - [ ] Session starts → MatchState row auto-created
  - [ ] Three AUDIO_AI PendingEvents at T=0, T=10, T=60 (eventType=GOAL_CANDIDATE) → merger: T=0+T=10 merged (window=25), T=60 separate → 2 ClipJobs
  - [ ] Corroboration: add GAME_ANALYZER event at T=12 → merges into T=0 cluster with `source=BOTH`, confidence=0.95
  - [ ] GameReplay row overlapping T=55..T=65 → clip extractor populates `ClipJob.gameReplayPath`, flips `used=true`
  - [ ] Partial webcam coverage on second clip → `webcamSegmentPath` set, warning logged, job not failed
  - [ ] Clip extractor: PENDING → EXTRACTING → STITCHING; `tvSegmentPath` set
  - [ ] Stitch worker: STITCHING → **ENHANCING** (stage3Enabled=true); `stitchedPath` set; `gameReplayPath` concatenated onto first clip
  - [ ] AI effects worker: ENHANCING → DONE; `enhancedPath` + `portraitPath` set
  - [ ] Assert ffmpeg command for Station 4 contained `setpts=2.0*PTS` (NOT `0.5*PTS`); stations 1–3 contained no setpts
  - [ ] Session status=COMPLETED → MATCH_END synthetic PendingEvent inserted → merger produces final ClipJob
  - [ ] `replay:all_ready` emitted exactly once
  - [ ] Reel assembler → `Session.reelPath` + `portraitReelPath` set; `replay:reel_ready` emitted
  - [ ] Cleanup at T+30min (replayTTLMinutes=60) → NOT purged
  - [ ] Advance time to T+61min → cleanup purges, `purgedAt` set, paths nulled
  - [ ] `GET /api/replays/:authCode` after purge → 410 Gone
- [ ] Run integration test — all assertions pass
- [ ] Commit: `"test(integration): Stage 11 end-to-end — corroboration, 2.0*PTS, TTL purge, 410"`

---

## Stage 11 Summary

| Prompt | Status | What Gets Built |
|--------|--------|----------------|
| 47.5 | ⬜ | Stage 11 system deps, Python env, model downloads (YAMNet/YuNet/FER) |
| 48 | ⬜ | Schema: SPEC §5 models + EventType/EventSource/ClipJobStatus enums + Settings defaults |
| 49 | ⬜ | TV ring buffer via ffmpeg `segment_wrap=60` (tmpfs, no pruner) |
| 50 | ⬜ | Webcam per-station FPS (Station 4 @120, others @60) + security capture |
| 51 | ⬜ | YAMNet detector + EventMerger with BOTH-source corroboration + MATCH_END synthesis |
| 52 | ⬜ | Game stream analyzer 320×240 @2fps writing SPEC enums + GameReplay rows |
| 53 | ⬜ | Stage 1 clip extractor reads `clipStart`/`clipEnd` + links `gameReplayPath` |
| 54 | ⬜ | Orphan GameReplay sweeper folded into EventMerger (no standalone harvester) |
| 55 | ⬜ | Stage 2 stitch worker: PiP + gameReplay concat + `check_session_all_ready` |
| 56 | ⬜ | Caption library seed (40+) + selector |
| 57 | ⬜ | Stage 3 enhancer: per-station `setpts=2.0*PTS` slow-mo, face zoom, captions, portrait |
| 58 | ⬜ | Highlight reel assembly using `enhancedPath`/`portraitPath` |
| 59 | ⬜ | Tablet UX: counter, reel-ready notification, QR code |
| 60 | ⬜ | Replay PWA keyed by `:authCode`, portrait download, 410 on expiry |
| 61 | ⬜ | Health endpoints: `/api/system/health` + `/api/system/pipeline-health` (SPEC §6) |
| 62 | ⬜ | Reliability: Settings-driven temp alerts, UPS shutdown, watchdog |
| 63 | ⬜ | Session cleanup driven by `Settings.replayTTLMinutes` |
| 64 | ⬜ | Full end-to-end integration test |

**Total new prompts: 18 (47.5 + 48–64)**
