# Neo Lounge — Prompt Plan: Stages 4–10

> **Prerequisites:** Stages 1–3 are complete. You have a working API (port 3000) with all 27 endpoints, WebSocket events, timer service, mock hardware services, and a kiosk frontend (port 3001) with PIN login, booking, live timers, session management, fault handling, queue badges, and shift log.
>
> **How to use:** Paste each prompt into Claude Code one at a time. Wait for it to finish, test the result, then move to the next. Start every session with:
> `Read docs/WORKING-RULES.md and docs/SPEC.md.`

---

## Stage 4: Tablet App (Per-Station Customer Display)

The tablet sits at each gaming station and shows the customer their session timer, extension options, and QR codes for replay downloads. It's a simpler app than the kiosk — fewer features, bigger UI elements, locked to one station.

---

### Prompt 23 — Tablet App Scaffold + Idle State

**Context:** This creates the Next.js app that runs on each station's Android tablet in fullscreen kiosk mode. The tablet is configured to a single station via an environment variable. The idle state is the default — shown when no session is active on that station.

```text
Read docs/WORKING-RULES.md and docs/SPEC.md (Section 12.3 — Tablet App).

Create the tablet frontend app:

1. Initialize Next.js + TypeScript + Tailwind in apps/tablet on port 3002
2. Create a shared API client (apps/tablet/src/lib/api.ts) pointing to http://localhost:3000
3. Create a WebSocket client (apps/tablet/src/lib/socket.ts) connecting to the API server
4. Environment variable STATION_ID (default: 1) controls which station this tablet displays
5. Create the main page with an Idle state:
   - Full-screen dark background (#0F172A)
   - Large station name centred ("Station 1")
   - PlayStation Lounge branding below
   - Subtle animated glow or pulse to show the app is alive
   - No interactive elements — this is a passive display

6. Connect to WebSocket and listen for station:updated events for this station's ID
7. When the station status changes to ACTIVE, log it to console (we'll build the active state next)

Design for a tablet held in landscape orientation. All text should be readable from 1-2 metres away. Use the dark theme from the spec.

Test: Start the API and tablet app. The idle screen should show with the station name. Check browser console — WebSocket should be connected.

Commit: "Tablet app scaffold with idle state"
```

---

### Prompt 24 — Tablet Active Session + Countdown Timer

**Context:** When a session is active on this station, the tablet shows a large countdown timer with the time remaining. This is the primary view customers see during gameplay.

```text
Read docs/WORKING-RULES.md and docs/SPEC.md (Section 12.3).

Add the Active state to the tablet app:

1. When station status is ACTIVE, fetch the current session from GET /api/stations/{STATION_ID}
2. Display a large countdown timer (MM:SS format) centred on screen — this should be the dominant element, readable from 2+ metres
3. Listen for session:tick WebSocket events to update the countdown in real time
4. Show the station name smaller at the top
5. Below the timer, show a muted "Session active" label

6. Listen for session:warning events — when received:
   - Timer text turns amber/orange
   - Background gets a subtle pulsing amber border or glow
   - Text below changes to "Session ending soon"

7. Listen for session:ended events — return to Idle state

State transitions:
- Idle → Active: triggered by station:updated with status ACTIVE
- Active → Warning: triggered by session:warning
- Active/Warning → Idle: triggered by session:ended or station:updated with status AVAILABLE

Test: Book a station from the kiosk. The tablet should show the countdown timer. Wait for the 2-minute warning — styling should change. When the session ends, it should return to idle.

Commit: "Tablet active session with live countdown"
```

---

### Prompt 25 — Tablet Extend Button + Payment Flow

**Context:** Customers need to be able to extend their session from the tablet. This triggers the same booking flow as the kiosk but initiated from the customer side.

```text
Read docs/WORKING-RULES.md and docs/SPEC.md (Sections 8.3 and 12.3).

Add the Extend Session flow to the tablet's active state:

1. Add an "Extend Time" button always visible below the countdown timer — large, easy to tap
2. When tapped, show a duration picker overlay:
   - Preset buttons: +10 min, +20 min, +30 min, +1 hour
   - Each button shows the price (calculated from current rate via GET /api/settings)
   - Payment method toggle: Cash / M-Pesa
   
3. Cash flow:
   - Customer selects duration + Cash → screen shows "Please pay [amount] KES at the counter"
   - Staff confirms payment on the kiosk → session is extended via API → tablet updates timer
   - The tablet listens for the session:tick events which will reflect the new extended time

4. M-Pesa flow:
   - Customer enters phone number → POST /api/payments/mpesa/initiate
   - Show "Check your phone for M-Pesa prompt..." with a spinner
   - Listen for payment:confirmed WebSocket event → timer updates with extended time
   - Listen for payment:timeout → show "Payment timed out" with Retry and Cancel buttons

5. After successful extension, close the overlay and return to the updated countdown

Test: Book a 5-minute session. On the tablet, tap Extend → select +10 min with Cash. Confirm on the kiosk. Timer should update. Test the M-Pesa flow shows the waiting screen (it will timeout in dev since there's no real AT — verify the timeout UI works).

Commit: "Tablet extend session with payment flow"
```

---

### Prompt 26 — Tablet Game End Button + QR Code Display

**Context:** The tablet needs a way to mark game boundaries (so replays are grouped per game) and display QR codes for replay downloads. The replay system isn't built yet, but we wire up the API calls and show placeholder QR codes now.

```text
Read docs/WORKING-RULES.md and docs/SPEC.md (Sections 9.5, 9.6, and 12.3).

Add game boundary marking and replay QR codes to the tablet:

1. Add a smaller "End Game" button in the corner of the active state (always accessible during gameplay)
   - When tapped, call POST /api/games/{gameId}/end
   - If no active game exists yet for this session, create one first via a new route or handle gracefully
   - Show brief confirmation: "Game ended. Next game starts automatically"

2. Add a Game End state that shows briefly after a game ends:
   - "Game Over" message
   - QR code area (placeholder for now — show a static QR code pointing to http://{API_IP}/replays?auth={authCode}&game={gameId})
   - Use a QR code library (e.g., qrcode.react or generate a QR SVG)
   - Text: "Scan to download your replays"
   - Auto-dismiss after 30 seconds and return to active countdown
   - "Skip" button to dismiss immediately

3. Listen for game:ended WebSocket events (from YAMNet auto-detection, once built) — trigger the same Game End state
4. Listen for replay:ready WebSocket events — update the QR code or show a notification

5. Add the Session End state:
   - Shows after session:ended event
   - Large "Session Complete" message
   - Final QR code for all replays in this session
   - Text: "Scan to download your replays — available for 1 hour"
   - After 60 seconds, return to Idle

Test: Book a session. Tap "End Game" on the tablet — it should show the QR code screen briefly. End the session from the kiosk — the tablet should show the Session Complete screen with QR code, then return to idle.

Commit: "Tablet game end button and QR replay display"
```

---

### Prompt 27 — Tablet Polish + Fullscreen Kiosk Mode

**Context:** Final tablet cleanup — lock it down for real-world use on an Android tablet.

```text
Read docs/WORKING-RULES.md and docs/SPEC.md (Section 12.3).

Polish the tablet app for production use:

1. Add a service worker for offline shell caching (the tablet is on local LAN but should be resilient)
2. Add a manifest.json for PWA install — fullscreen display mode, dark theme, PlayStation Lounge name and icon
3. Hide all browser UI cues — no scroll bars, no text selection, no pull-to-refresh
4. Add touch event handling — prevent pinch zoom, prevent long-press context menu
5. Add auto-reconnect for WebSocket — if connection drops, show a small "Reconnecting..." indicator and retry every 3 seconds
6. Add a hidden settings gesture (e.g., 5 rapid taps on the station name) that reveals:
   - Station ID selector (to reconfigure which station this tablet shows)
   - API server URL input
   - "Reload" button
   - This is for initial setup only — not shown during normal use
7. Handle edge cases:
   - If API is unreachable on load, show "Connecting to server..." with retry
   - If station doesn't exist, show an error with the settings gesture hint
8. Run the existing test suite to make sure nothing in the API broke

Test: Open the tablet app in Chrome on a phone/tablet. It should fill the screen. The hidden settings should only appear with the 5-tap gesture. Disconnect the API server — reconnection indicator should appear. Restart the API — tablet should recover automatically.

Commit: "Tablet kiosk mode, PWA, auto-reconnect"
```

---

## Stage 5: Customer Replay PWA

The PWA is what customers see on their phones after scanning the QR code. It's the simplest frontend — just shows clips and lets customers download them. No authentication beyond the session auth code.

---

### Prompt 28 — PWA Scaffold + Auth Code Entry

**Context:** The customer either arrives via QR code (with auth code in the URL) or can manually type an auth code. No login required.

```text
Read docs/WORKING-RULES.md and docs/SPEC.md (Section 12.4 — Customer PWA).

Create the customer replay PWA:

1. Initialize Next.js + TypeScript + Tailwind in apps/pwa on port 3003
2. Create an API client pointing to the Main API

3. Landing page:
   - If URL contains ?auth={code}, auto-fetch replays using GET /api/replays/{authCode}
   - If no auth code in URL, show a 6-character code entry screen:
     - Large input field (styled like a PIN entry — one box per character)
     - "View Replays" button
     - Dark theme matching lounge aesthetic
   - If auth code is invalid, show "Code not found — check your receipt or ask staff"

4. Add a service worker for PWA install + offline shell caching
5. Add manifest.json — fullscreen, dark theme, "Neo Lounge Replays" name

Test: Start the API. Open http://localhost:3003 — you should see the code entry screen. Enter a valid auth code from an existing session — it should navigate to a replay page (empty for now, that's fine). Enter an invalid code — error message should show.

Commit: "Customer PWA scaffold with auth code entry"
```

---

### Prompt 29 — PWA Replay List + Download

**Context:** Once authenticated with an auth code, the customer sees their games and clips. They can download individual clips or (eventually) a highlight reel.

```text
Read docs/WORKING-RULES.md and docs/SPEC.md (Sections 9.6 and 12.4).

Build the replay viewing and download page:

1. After successful auth code lookup, show:
   - Session info header: station name, date, total duration
   - List of games played in this session, grouped by game
   - Under each game: list of replay clips with timestamps
   - Each clip has a "Download" button that triggers direct MP4 download
   - If a stitched highlight reel exists, show it prominently at the top of each game with "Download Highlights"

2. If no clips exist yet (session is still active or no replays captured):
   - Show "No replays yet — clips will appear here during gameplay"
   - Auto-refresh the list every 10 seconds while the session is active
   - Listen for replay:ready WebSocket events if connected

3. Expiry handling:
   - Show a countdown: "Replays available for X more minutes"
   - If replays have expired: "These replays are no longer available"

4. Style everything for mobile phones:
   - Single column layout
   - Large tap targets for download buttons
   - Clips show thumbnail placeholder (we'll generate real thumbnails later)
   - Total download size estimate per game

Note: The replay files don't exist yet (video pipeline isn't built). Wire up the API calls and UI so everything works once files are available. Use placeholder data or handle empty states gracefully.

Test: Create a session via the kiosk. Open the PWA with that session's auth code. The page should load showing the session info. Since no replay files exist yet, it should show the "no replays yet" state gracefully.

Commit: "PWA replay list with download buttons"
```

---

## Stage 6: Owner Dashboard

A simple remote monitoring dashboard the owner accesses via Tailscale VPN. Not a full admin tool — that's the kiosk. This is for checking on the business remotely.

---

### Prompt 30 — Dashboard Scaffold + Revenue Overview

**Context:** The dashboard is a single-page app showing today's business stats. It's accessed remotely so it needs to work well on both phone and desktop.

```text
Read docs/WORKING-RULES.md and docs/SPEC.md (Section 12.5 — Layer 1: Web Dashboard).

Create the owner dashboard:

1. Initialize Next.js + TypeScript + Tailwind in apps/dashboard on port 3004
2. Create an API client pointing to the Main API
3. PIN login screen — same pattern as kiosk but only accepts OWNER role

4. After login, show a single-page dashboard with:

   Revenue section (top):
   - Today's total revenue (large number, prominent)
   - Revenue per station (4 smaller cards)
   - Number of sessions today
   - Average session duration
   - Cash vs M-Pesa split (percentage)
   - All data from GET /api/dashboard

   Active sessions section:
   - Live station grid showing current status of all 4 stations
   - For active stations: timer countdown, customer since [time], amount paid
   - Connect via WebSocket for real-time updates

5. Make it responsive — works on phone (single column) and desktop (grid layout)
6. Auto-refresh dashboard data every 60 seconds

Test: Log in with owner PIN (0000). Book a session via the kiosk. The dashboard should show the active session and the revenue from the booking. End the session — dashboard should update.

Commit: "Owner dashboard with revenue and active sessions"
```

---

### Prompt 31 — Dashboard Session History + Security Events

```text
Read docs/WORKING-RULES.md and docs/SPEC.md (Section 12.5).

Add history and security sections to the dashboard:

1. Session history section:
   - Scrolling list of today's completed sessions
   - Each row: station, start time, end time, duration, total paid, payment method, staff member
   - Tap a row to expand and see all transactions for that session
   - Filter by station and payment method
   - Pagination or "load more" for busy days

2. Security events section:
   - Chronological list from GET /api/events
   - Each event shows: type badge (colour-coded), timestamp, description, staff member, station
   - Filter by event type (dropdown)
   - Tap an event to see its metadata
   - Placeholder for "View camera clips" link (will wire up when security clips exist)

3. Add tabs or sections to organise the dashboard:
   - Overview (revenue + active sessions — already built)
   - History (session log)
   - Security (event log)

Test: Create several sessions, extend one, transfer one, end them all. Check the History tab shows accurate records. Check Security tab shows all the SecurityEvents that were logged.

Commit: "Dashboard session history and security events"
```

---

### Prompt 32 — Dashboard System Health + Service Controls

```text
Read docs/WORKING-RULES.md and docs/SPEC.md (Sections 10.5 and 12.5).

Add system monitoring to the dashboard:

1. System Health section:
   - API server status (green/red based on GET /api/health)
   - Database status (included in health check response)
   - Video Pipeline status (call GET /pipeline/health — handle connection refused gracefully since it may not be running)
   - Camera status for all 5 cameras from GET /api/security/cameras (show online/offline per camera)
   - External HDD storage from GET /api/security/storage — show used/total with percentage bar and estimated days of retention remaining (handle gracefully when video pipeline isn't running)

2. Service control buttons (owner only):
   - Restart API, Restart Video Pipeline, Restart PostgreSQL
   - Each calls POST /api/system/restart-service with the service name
   - Confirm dialog before restart
   - Show "Restarting..." spinner, then re-check health after 10 seconds

3. Hardware status panel:
   - Per-station: TV connection status, LED controller status
   - This reads from the mock hardware services for now — show connected/disconnected badges
   - Add a GET /api/hardware/status endpoint to the API that queries the mock ADB and Tuya services for all 4 stations

4. Add the System tab to the dashboard navigation

Test: Open the System tab. All services should show green (or gracefully show "not running" for video pipeline). Test the restart button — it should show the confirm dialog and spinner. The hardware panel should show 4 stations with mock-connected status.

Commit: "Dashboard system health, hardware status, service controls"
```

---

## Stage 7: M-Pesa Payment Integration

This replaces the current cash-only flow with real M-Pesa via Africa's Talking. The cash flow continues to work — M-Pesa is an additional option.

---

### Prompt 33 — Africa's Talking Service Module + Mock

**Context:** Before touching any payment UI, build the service layer with a mock so everything can be tested without real money or internet.

```text
Read docs/WORKING-RULES.md and docs/SPEC.md (Section 8 — Payment Flows).

Create the Africa's Talking payment service module:

1. Create services/payments.ts (or wherever existing service modules live) with an interface:
   - initiateStkPush(phoneNumber: string, amount: number, transactionId: number): Promise<{success, checkoutRequestId}>
   - processCallback(payload: any): Promise<{transactionId, success, receiptCode?}>
   - checkInternetAvailability(): Promise<boolean>

2. Create the MOCK implementation (used when USE_MOCK_HARDWARE=true or USE_MOCK_PAYMENTS=true):
   - initiateStkPush: logs the request, waits 3 seconds, returns success with a fake checkout ID
   - After 5 seconds, auto-triggers the callback endpoint to simulate the customer confirming on their phone
   - Add a MOCK_PAYMENT_SHOULD_FAIL env variable — when true, simulates a timeout instead of success
   - processCallback: validates payload shape, returns success with a fake receipt code

3. Create the REAL implementation stub (used when mocks are off):
   - Uses the africastalking npm package
   - Reads AT_API_KEY, AT_USERNAME, AT_ENVIRONMENT, AT_SHORTCODE from environment variables
   - initiateStkPush: calls AT's mobile.checkout() with the correct parameters
   - processCallback: parses AT's webhook format
   - Leave the real implementation as a clear stub with TODO comments — we'll fill it in after sandbox testing

4. Wire the factory pattern: based on environment variables, export the correct implementation

Write tests for the mock:
- Test that initiateStkPush returns expected shape
- Test that processCallback returns expected shape
- Test the auto-callback simulation triggers after delay

Commit: "Africa's Talking payment service with mock implementation"
```

---

### Prompt 34 — M-Pesa API Endpoints + Webhook

```text
Read docs/WORKING-RULES.md and docs/SPEC.md (Sections 8.1–8.4 and 14.1).

Wire the payment service into API endpoints:

1. POST /api/payments/mpesa/initiate
   - Requires: phoneNumber, amount, sessionId
   - Validates phone number format (Kenyan: 254XXXXXXXXX or 07XXXXXXXX — normalise to 254 format)
   - Creates a Transaction record with status PENDING and method MPESA
   - Calls paymentService.initiateStkPush()
   - Returns { transactionId, status: "pending" }
   - Locks the station (status PENDING) to prevent concurrent bookings

2. POST /api/payments/mpesa/callback
   - This is the webhook AT calls when payment completes
   - Calls paymentService.processCallback(req.body)
   - Finds the Transaction by checkoutRequestId
   - IDEMPOTENCY: if transaction is already COMPLETED, return 200 and do nothing
   - On success: update Transaction to COMPLETED, store mpesaReceipt, activate the session, emit payment:confirmed WebSocket event, create SecurityEvent
   - On failure: update Transaction to FAILED, unlock the station, emit payment:timeout WebSocket event
   - Log the full raw webhook payload to SecurityEvent metadata

3. Update POST /api/sessions (create session) to handle M-Pesa:
   - If payment method is MPESA, don't activate the session immediately
   - Create session in a PENDING state, initiate STK push
   - Session activates only when webhook confirms payment

4. Add internet availability check:
   - GET /api/payments/status returns { mpesaAvailable: boolean }
   - Calls paymentService.checkInternetAvailability()
   - Kiosk can poll this to show/hide the M-Pesa option

Write tests:
- Test initiate endpoint creates PENDING transaction
- Test callback endpoint completes transaction (idempotent)
- Test callback with already-completed transaction returns 200 without side effects
- Test failed payment unlocks the station

Commit: "M-Pesa initiate and callback endpoints with idempotency"
```

---

### Prompt 35 — Kiosk M-Pesa UI Integration

```text
Read docs/WORKING-RULES.md and docs/SPEC.md (Section 8).

Update the kiosk booking modal to support M-Pesa:

1. Check M-Pesa availability on load (GET /api/payments/status)
   - If unavailable, show Cash toggle only with "M-Pesa unavailable — no internet" note
   - If available, show Cash / M-Pesa toggle (already exists in the UI from Stage 3)

2. When M-Pesa is selected:
   - Show a phone number input field (pre-formatted for Kenyan numbers)
   - "Send M-Pesa Request" button
   - On tap: call POST /api/payments/mpesa/initiate
   - Show waiting state: "M-Pesa request sent to 07XX XXX XXX — waiting for customer to confirm on their phone..."
   - Show a 30-second countdown timer

3. Listen for WebSocket events:
   - payment:confirmed → close modal, show success toast, station card updates to ACTIVE
   - payment:timeout → show "Payment timed out" with two buttons: "Retry M-Pesa" and "Switch to Cash"

4. Allow switching: while waiting for M-Pesa, staff can tap "Switch to Cash" to cancel the pending M-Pesa and process as cash instead

5. Extension flow: the same M-Pesa option should work in the extend session modal (on both kiosk and tablet)

Test with mock payments:
- Select M-Pesa, enter a phone number, send request → mock auto-confirms after ~5 seconds → session activates
- Set MOCK_PAYMENT_SHOULD_FAIL=true, restart API → M-Pesa should time out → verify timeout UI works → switch to cash and complete

Commit: "Kiosk M-Pesa payment UI with timeout and fallback"
```

---

## Stage 8: Hardware Control (ADB + Tuya)

This stage upgrades the mock hardware services to support real devices. The mocks continue to work for development — real hardware is toggled via environment variables.

---

### Prompt 36 — Real ADB Service Implementation

**Context:** The TVs are controlled via ADB over TCP/IP on the local network. Each station's TV has a known IP address stored in the Station database record.

```text
Read docs/WORKING-RULES.md and docs/SPEC.md (Section 10.1 — TV Control).

Implement the real ADB hardware service:

1. Update the ADB service module to add the real implementation alongside the existing mock:
   - Uses child_process to execute adb commands
   - Each station's TV has an adbAddress field in the database (e.g., "192.168.1.101:5555")

2. Implement all TV control commands:
   - connect(stationId): adb connect {adbAddress}
   - switchToHdmi(stationId): sends input select command for HDMI port
   - switchToAndroidTv(stationId): sends input select for TV's internal apps
   - setBrightness(stationId, percent): sets backlight level (0-100)
   - powerOff(stationId): sends power off command
   - powerOn(stationId): sends wake command
   - getStatus(stationId): checks if TV is reachable via adb

3. Add connection management:
   - On startup, attempt to connect to all 4 TVs
   - Track connection status per TV
   - If a command fails, mark TV as disconnected and attempt reconnect
   - Auto-reconnect every 30 seconds for disconnected TVs

4. Wire into session lifecycle:
   - Session starts → switchToHdmi + setBrightness(100)
   - Session ends → switchToAndroidTv
   - Power save → setBrightness(50) for active, powerOff for unused

5. Add GET /api/hardware/status endpoint (or update if it exists) that returns connection status for all 4 TVs

6. Use USE_MOCK_ADB environment variable — when true, use the existing mock. When false, use the real implementation.

Write tests for the real implementation using a mock adb binary (don't require actual hardware in tests):
- Test connect builds correct command string
- Test switchToHdmi sends correct input command
- Test reconnect logic on failure

Commit: "Real ADB service with TV control and auto-reconnect"
```

---

### Prompt 37 — Real Tuya LED Service Implementation

```text
Read docs/WORKING-RULES.md and docs/SPEC.md (Section 10.2 — LED Lighting).

Implement the real Tuya LED hardware service:

1. Install tinytuya npm package (or use the Python tinytuya via a child process / microservice call — pick whichever approach fits the existing codebase better)

2. Update the Tuya service module with the real implementation:
   - Each station has a tuyaDeviceId field in the database
   - Tuya devices need: deviceId, localKey, and IP address (stored in env or database)

3. Implement LED control modes:
   - setSyncMode(stationId): activates HDMI sync — LEDs follow the gameplay colours
   - setAmbientMode(stationId): slow colour pulse in PlayStation blue (#2563EB)
   - turnOff(stationId): LEDs completely off
   - getStatus(stationId): check if Tuya device is reachable

4. Wire into session lifecycle:
   - Session starts → setSyncMode
   - Session ends → setAmbientMode
   - Power save (unused stations) → turnOff

5. Add connection monitoring + auto-reconnect (same pattern as ADB)

6. Update GET /api/hardware/status to include LED controller status

7. Use USE_MOCK_TUYA environment variable for switching.

Write tests:
- Test each mode sends the correct Tuya command
- Test connection failure handling
- Test auto-reconnect logic

Commit: "Real Tuya LED service with sync, ambient, and off modes"
```

---

### Prompt 38 — Hardware Integration into Session Lifecycle

**Context:** Now that both ADB and Tuya services exist (real + mock), wire them into the session lifecycle so hardware activates automatically when sessions start/end.

```text
Read docs/WORKING-RULES.md and docs/SPEC.md (Sections 10.1, 10.2, and 6.1).

Wire hardware control into the session lifecycle:

1. When a session is created (POST /api/sessions) and payment is confirmed:
   - Call adbService.switchToHdmi(stationId) — switch TV to PS5 input
   - Call adbService.setBrightness(stationId, 100) — full brightness
   - Call tuyaService.setSyncMode(stationId) — LEDs follow gameplay
   - If any hardware call fails, log the error but DON'T block the session — the customer can still play even if LEDs fail

2. When a session ends (PATCH /api/sessions/:id/end):
   - Call adbService.switchToAndroidTv(stationId) — TV shows screensaver/home
   - Call tuyaService.setAmbientMode(stationId) — slow blue pulse
   - Again, failures should log but not block

3. When a session is transferred (POST /api/sessions/:id/transfer):
   - Deactivate hardware on old station (same as session end)
   - Activate hardware on new station (same as session start)

4. Add graceful degradation:
   - If hardware fails, add a warning badge on the kiosk station card: "TV not responding" or "LEDs offline"
   - The kiosk hardware status panel (from Prompt 32) should show live status

5. Make sure all existing tests still pass — hardware calls should use mocks in the test environment

Test with mocks (default): Book a session → check logs show mock ADB and Tuya calls. End session → check deactivation calls logged. Transfer → check both deactivation and activation.

Commit: "Hardware control wired into session lifecycle"
```

---

## Stage 9: Video Pipeline + Security Cameras

This is the Python FastAPI service that handles video capture, AI clip detection, and security camera recording. It runs alongside the Node.js API.

---

### Prompt 39 — Video Pipeline Scaffold + Health Check

```text
Read docs/WORKING-RULES.md and docs/SPEC.md (Sections 9.1 and 14.2).

Create the Video Pipeline service:

1. Initialize a Python FastAPI project in services/video-pipeline/
   - requirements.txt: fastapi, uvicorn, httpx (for calling Main API)
   - Port 8000
   - Create main.py with the FastAPI app

2. GET /pipeline/health — returns { status: "ok", uptime, capture_streams: 0, cameras_recording: 0 }

3. Create the service structure:
   - services/video-pipeline/capture/ — station capture management
   - services/video-pipeline/security/ — security camera recording
   - services/video-pipeline/detection/ — YAMNet audio detection (placeholder)
   - services/video-pipeline/config.py — reads env variables for paths, thresholds, etc.

4. Config from environment variables:
   - MAIN_API_URL=http://localhost:3000
   - CAPTURE_BUFFER_DIR=/tmp/capture (tmpfs in production)
   - REPLAY_DIR=./replays
   - SECURITY_RECORDING_DIR=./security-recordings
   - SECURITY_CLIPS_DIR=./security-clips
   - USE_MOCK_CAPTURE=true
   - USE_MOCK_CAMERAS=true

5. Create a mock capture module:
   - Instead of reading from a USB capture card, generates a short test video file using ffmpeg
   - Provides the same interface as the real capture

Test: Start the video pipeline: cd services/video-pipeline && uvicorn main:app --port 8000. Hit GET /pipeline/health — should return ok.

Commit: "Video pipeline scaffold with health endpoint"
```

---

### Prompt 40 — Station Capture Start/Stop + Buffer Management

```text
Read docs/WORKING-RULES.md and docs/SPEC.md (Sections 9.1 and 9.2).

Add station video capture management:

1. POST /capture/start/{station_id}
   - Starts an ffmpeg process for the given station
   - Mock mode: generates rolling test pattern video to CAPTURE_BUFFER_DIR/{station_id}/
   - Real mode: reads from the station's USB capture device (path from config or API)
   - Writes to a rolling 60-second buffer using ffmpeg segment muxer
   - Track the ffmpeg process — store PID, start time, status

2. POST /capture/stop/{station_id}
   - Kills the ffmpeg process for that station
   - Cleans up buffer files

3. GET /capture/status
   - Returns status of all 4 capture streams: running/stopped, uptime, buffer size

4. Buffer management:
   - Each station's buffer is in CAPTURE_BUFFER_DIR/{station_id}/
   - Rolling segments (e.g., 10-second segments) that ffmpeg auto-overwrites
   - Total buffer per station: ~300-400MB in production, much smaller in mock mode
   - Add a cleanup task that removes orphaned buffer files on startup

5. Wire into the Main API:
   - Update POST /api/sessions (in the Node.js API) to call POST http://localhost:8000/capture/start/{stationId} when a session activates
   - Update session end to call POST http://localhost:8000/capture/stop/{stationId}
   - Handle connection refused gracefully (video pipeline might not be running)

Test: Start both API and video pipeline. Create a session on the kiosk. Check that capture/status shows the station as capturing. End the session — capture should stop. Check that buffer files are created in the capture directory.

Commit: "Station capture with rolling buffer management"
```

---

### Prompt 41 — Clip Extraction Endpoint

```text
Read docs/WORKING-RULES.md and docs/SPEC.md (Section 9.4).

Add clip extraction from the rolling buffer:

1. POST /clips/extract
   - Input: { station_id, trigger_type, trigger_timestamp, buffer_before_seconds (default 10), buffer_after_seconds (default 15) }
   - Finds the relevant buffer segments for the time window
   - Uses ffmpeg -c copy to extract the clip (container-level, no re-encoding)
   - Saves to REPLAY_DIR/{session_id}/{game_id}/clip_{timestamp}.mp4
   - Calls Main API to register the ReplayClip record: POST with gameId, sessionId, filePath, triggerType, triggerTimestamp
   - Returns { clip_id, file_path, duration_seconds }

2. Get session and game context:
   - When starting capture, store the current sessionId (from the start request)
   - Track the current gameId (from the Main API, or create a new game when capture starts)

3. Mock mode:
   - Instead of extracting from real buffer, copy a short test video file as the "clip"
   - Still registers with the Main API properly

4. Add the replay file serving:
   - Add a static file route in the Main API or video pipeline that serves files from REPLAY_DIR
   - The customer PWA's download button will point to this URL

Test: Start a session (capture starts). Call POST /clips/extract with the station ID. Check that a clip file is created in the replay directory. Check that the Main API has a ReplayClip record. Open the PWA with the session auth code — the clip should now appear in the list.

Commit: "Clip extraction from buffer with replay file registration"
```

---

### Prompt 42 — YAMNet Audio Detection (Mock + Interface)

**Context:** YAMNet will eventually run on real audio from the capture stream. For now, build the detection interface with a mock that fires events on a timer — this lets the full replay pipeline work end-to-end before tuning real audio detection.

```text
Read docs/WORKING-RULES.md and docs/SPEC.md (Section 9.3).

Create the audio detection system with a mock implementation:

1. Create the detection interface in services/video-pipeline/detection/:
   - AudioDetector class with start(station_id), stop(station_id), on_event(callback)
   - Events: { station_id, event_type: "CROWD_ROAR" | "WHISTLE" | "MUSIC", confidence, timestamp }

2. Mock implementation (USE_MOCK_YAMNET=true):
   - After starting detection for a station, fires a CROWD_ROAR event every 90 seconds (simulating goals)
   - After 5 minutes, fires a WHISTLE event (simulating match end)
   - Confidence always 0.85 (above default threshold)
   - Cooldown of 45 seconds between events (configurable via Settings)

3. Real implementation stub (USE_MOCK_YAMNET=false):
   - Extracts audio from the ffmpeg capture stream
   - Runs YAMNet TFLite inference
   - Maps YAMNet categories to trigger types
   - TODO comments marking where the real inference code goes

4. Wire detection events to clip extraction:
   - When a CROWD_ROAR event fires → call clip extraction (Prompt 41)
   - When a WHISTLE event fires → call POST /api/games/{gameId}/end on the Main API, then extract final clip
   - Respect cooldown: skip events within cooldownSeconds of the last clip

5. Wire into capture lifecycle:
   - When capture starts for a station → start audio detection
   - When capture stops → stop audio detection

6. Read detection settings from the Main API:
   - Confidence threshold from Settings.yamnetConfidenceThreshold
   - Cooldown from Settings.clipCooldownSeconds
   - Buffer before/after from Settings.clipBufferBefore / clipBufferAfter

Test: Start a session. Wait ~90 seconds — the mock detector should fire a CROWD_ROAR, triggering clip extraction. A ReplayClip record should appear in the database. The tablet should receive a replay:ready WebSocket event. The PWA should show the clip.

Commit: "YAMNet detection interface with mock implementation"
```

---

### Prompt 43 — Security Camera Continuous Recording

```text
Read docs/WORKING-RULES.md and docs/SPEC.md (Sections 10.4 and 14.2).

Add security camera continuous recording:

1. POST /security/start-recording
   - Starts ffmpeg processes for all 5 cameras
   - Mock mode: generates test pattern video streams
   - Real mode: connects to each camera's RTSP URL from the SecurityCamera database records
   - Writes 15-minute rolling segments to SECURITY_RECORDING_DIR/{camera_id}/
   - Oldest segments auto-deleted when disk usage exceeds threshold

2. POST /security/stop-recording
   - Stops all camera recording processes

3. GET /security/recording-status
   - Status of all 5 camera streams: recording/stopped, uptime, segment count

4. GET /security/storage
   - Reports: total disk space, used space, free space, estimated days of retention remaining

5. Camera health monitoring:
   - Check each camera's connection every 30 seconds
   - If RTSP stream drops, mark camera as offline via PATCH to Main API
   - Auto-reconnect every 30 seconds
   - Emit health status to Main API for the dashboard

6. POST /security/extract-clips
   - Input: { event_id, timestamp, before_minutes (default 5), after_minutes (default 5) }
   - For ALL 5 cameras: find the recording segments covering the time window
   - Extract clips using ffmpeg -c copy
   - Save to SECURITY_CLIPS_DIR/{event_type}_{timestamp}_cam{id}.mp4
   - Register SecurityClip records in the database via Main API

7. Wire into the Main API:
   - When a SecurityEvent is created, call POST http://localhost:8000/security/extract-clips
   - Handle gracefully if video pipeline is not running

Test: Start the video pipeline. Call POST /security/start-recording. Check status — all cameras should show as recording (mock mode). Create a SecurityEvent from the kiosk (e.g., start a session which creates SESSION_START). Check that security clips were extracted.

Commit: "Security camera recording with event clip extraction"
```

---

### Prompt 44 — Replay Cleanup + Stitching

```text
Read docs/WORKING-RULES.md and docs/SPEC.md (Sections 9.5 and 9.7).

Add replay lifecycle management:

1. Replay TTL cleanup:
   - Create a background task that runs every 5 minutes
   - Finds all sessions where endTime + replayTTLMinutes (from Settings) has passed
   - Deletes the replay files from disk
   - Updates ReplayClip records in the database (mark as expired or delete)
   - Logs cleanup actions

2. Highlight reel stitching:
   - When a game ends (game:ended event), queue a stitching job
   - Stitching concatenates all clips for that game into a single highlight reel using ffmpeg
   - This is a LOW PRIORITY background task — runs when CPU is available
   - Save stitched file to the same replay directory
   - Update the Game or ReplayClip record with stitchedReelPath
   - Notify tablet + PWA via WebSocket that the reel is ready

3. Add a stitching queue:
   - Simple in-memory queue (no need for Redis/RabbitMQ)
   - Process one stitch job at a time to avoid CPU contention
   - If the pipeline restarts, re-check for games with clips but no stitched reel

Test: Start a session, let mock YAMNet generate a few clips, end the game. The stitching job should run and produce a combined highlight file. Check the PWA — the "Download Highlights" option should appear. Wait for TTL to expire (set it short for testing, e.g., 2 minutes). Verify clips are cleaned up.

Commit: "Replay cleanup and highlight reel stitching"
```

---

## Stage 10: Power Management + Resilience

The final stage before physical hardware setup. Handles power failures, internet failover, and session preservation.

---

### Prompt 45 — Power Down + Restore Endpoints

```text
Read docs/WORKING-RULES.md and docs/SPEC.md (Sections 6.4 and 13.3).

Implement power failure handling:

1. POST /api/system/power-down
   - Triggered by UPS detection (or manually for testing)
   - For all ACTIVE sessions: save remainingAtPowerLoss (calculate from timer)
   - Mark active sessions as POWER_INTERRUPTED
   - Call adbService.setBrightness(stationId, 50) for active stations
   - Call adbService.powerOff(stationId) for unused stations
   - Call tuyaService.turnOff(stationId) for unused stations
   - Create SecurityEvent type POWER_LOSS
   - Emit power:status WebSocket event to all clients
   - Return { sessionsPreserved: count, timestamp }

2. POST /api/system/power-restore
   - Find all POWER_INTERRUPTED sessions
   - Restore each: set status back to ACTIVE, set remaining time from remainingAtPowerLoss
   - Re-activate hardware: adbService.switchToHdmi + setBrightness(100), tuyaService.setSyncMode
   - Resume the timer service for restored sessions
   - Create SecurityEvent type POWER_RESTORE
   - Emit power:status WebSocket event
   - Return { sessionsRestored: count, timestamp }

3. Update the kiosk to handle power:status events:
   - Show a banner: "Power outage detected — sessions preserved" (on power-down)
   - Show: "Power restored — sessions resuming" (on power-restore)

4. Update the tablet to handle power events:
   - Show "Power outage — your session time is saved" during outage
   - Resume normal countdown on restore

Write tests:
- Create 2 active sessions → power down → verify sessions are POWER_INTERRUPTED with correct remaining time
- Power restore → verify sessions are ACTIVE with correct remaining time
- Verify SecurityEvents are created for both

Commit: "Power failure preservation and restore"
```

---

### Prompt 46 — Internet Failover + Health Monitoring

```text
Read docs/WORKING-RULES.md and docs/SPEC.md (Section 13.2).

Add internet connectivity monitoring and failover:

1. Create services/internet.ts (or update existing connectivity module):
   - checkPrimaryInternet(): pings a reliable endpoint (e.g., Google DNS or AT API health)
   - check4GDongle(): checks if the 4G dongle is connected and has signal
   - getCurrentRoute(): returns "primary" | "4g" | "offline"

2. Internet health monitor:
   - Check connectivity every 15 seconds
   - If primary fails, log the event and set route to 4G
   - If primary recovers, switch back and log
   - If both fail, set route to offline

3. Wire into payment service:
   - When route is "offline", paymentService.checkInternetAvailability() returns false
   - The kiosk disables M-Pesa and shows "Cash only — no internet"
   - When route is "primary" or "4g", M-Pesa is available

4. Update GET /api/payments/status:
   - Returns { mpesaAvailable, internetRoute: "primary" | "4g" | "offline" }

5. Add to dashboard System tab:
   - Show current internet route
   - Show failover history (last 24 hours of route changes)

6. Mock mode:
   - When USE_MOCK_HARDWARE=true, always report primary internet as available
   - Add MOCK_INTERNET_ROUTE env variable to simulate different states for testing

Write tests:
- Test that payment status reflects internet availability
- Test failover from primary → 4G → offline → primary
- Test that M-Pesa endpoints reject when offline

Commit: "Internet failover with 4G fallback and payment availability"
```

---

### Prompt 47 — End-to-End Integration Test

**Context:** Final prompt — verify the entire system works together.

```text
Read docs/WORKING-RULES.md and docs/SPEC.md.

Run a comprehensive integration test across all services:

1. Start all services: PostgreSQL, Main API, Kiosk, Tablet, PWA, Dashboard, Video Pipeline

2. Test the complete walk-in to replay flow:
   a. Open kiosk, log in with PIN 0000
   b. Book Station 1 for 5 minutes, pay with Cash
   c. Verify: station card shows ACTIVE with countdown, tablet shows timer, hardware calls logged
   d. Wait for mock YAMNet to fire a CROWD_ROAR (~90 seconds) — verify clip is extracted
   e. Open PWA with session auth code — verify clip appears
   f. Tap "End Game" on tablet — verify game boundary, QR code shows
   g. Let session end (or manually end) — verify hardware deactivates, tablet returns to idle
   h. Check PWA shows all clips + highlight reel option

3. Test M-Pesa flow:
   a. Book Station 2, select M-Pesa with mock
   b. Verify waiting UI, auto-confirmation, session activates

4. Test fault handling:
   a. While Station 1 is active, report fault and transfer to Station 3
   b. Verify hardware deactivates on 1, activates on 3
   c. Verify SecurityEvent created

5. Test power failure:
   a. With sessions active, call POST /api/system/power-down
   b. Verify sessions preserved, kiosk/tablet show power outage state
   c. Call POST /api/system/power-restore
   d. Verify sessions resume with correct time

6. Test dashboard:
   a. Log in as owner — verify revenue, active sessions, security events all show
   b. Check system health — all services green
   c. Check security clips exist for key events

7. Fix any issues found during testing

8. Clean up:
   - Remove any debug code
   - Ensure all console.log statements are replaced with proper logging
   - Run the full test suite one final time

Commit: "Full integration test passed — Stages 4-10 complete" && git push origin main
```

---

## Summary

| Stage | Prompts | What Gets Built |
|-------|---------|----------------|
| 4 | 23–27 | Tablet app (timer, extend, QR codes, kiosk mode) |
| 5 | 28–29 | Customer replay PWA (auth code, clip list, download) |
| 6 | 30–32 | Owner dashboard (revenue, history, security, system health) |
| 7 | 33–35 | M-Pesa payments (service module, endpoints, kiosk UI) |
| 8 | 36–38 | Hardware control (real ADB, real Tuya, session lifecycle wiring) |
| 9 | 39–44 | Video pipeline (capture, clips, YAMNet, security cameras, stitching) |
| 10 | 45–47 | Power management, internet failover, final integration test |

**Total: 25 prompts (23–47), continuing from where Stage 3 left off.**

---

---

## Stage 11: Enhanced Video Pipeline — Ring Buffer, Game Intelligence & AI Replays

> **Context for this stage:** Everything in Stages 4–10 is complete and working. This stage implements an entirely new video capture and processing architecture designed in a planning session. The changes are additive — nothing from previous stages is deleted. Read `docs/SPEC.md` sections 7–20 in full before starting any prompt in this stage.
>
> **Core principles to keep in mind throughout:**
> - `ffmpeg -c copy` everywhere at capture time. Never transcode live streams.
> - TV footage lives in a tmpfs (RAM) ring buffer. Extract clips immediately when the post-roll window closes — the buffer will overwrite.
> - Process clips during the match in the background. By match end, everything should already be done.
> - The clip queue is a FIFO: oldest event first. Workers wake via PostgreSQL LISTEN/NOTIFY, not polling.
> - YuNet (built into OpenCV) and FER MobileNet run on CPU only — no GPU required. The N100's Quick Sync handles H.264 encode.
> - All session footage is deleted 1 hour after the session ends. Processing must finish well within that window.
>
> **How to use these prompts:** Start every session with:
> ```
> Read docs/WORKING-RULES.md and docs/SPEC.md.
> ```
> Then paste one prompt at a time. Run the tests at the end of each prompt before moving on.

---

### Prompt 48 — Database Schema: New Models and Fields

**Context:** The existing Prisma schema has `Station`, `Session`, `ReplayClip`, `Game`, and related models. This prompt adds all the new data models the enhanced pipeline needs. Nothing is deleted — only additions. The new models are: `PendingEvent` (raw audio/game event before merging), `ClipJob` (work queue entry for clip extraction), `GameReplay` (an in-game FIFA replay segment detected from the TV stream), and `MatchState` (current score, minute, and game phase per station). New fields are added to `Station` (webcam device paths) and `Settings` (pipeline tuning values). Two new enums are added: `EventType` and `ClipJobStatus`.

```text
Read docs/WORKING-RULES.md and docs/SPEC.md.

Open apps/api/prisma/schema.prisma. Do not modify any existing models or enums. Add the following:

1. New enum EventType:
   CROWD_NOISE | GOAL_AUDIO | CELEBRATION | CARD_EVENT | MATCH_END | GAME_REPLAY

2. New enum ClipJobStatus:
   PENDING | EXTRACTING | STITCHING | AI_EFFECTS | DONE | FAILED

3. New model PendingEvent:
   - id (Int, autoincrement PK)
   - stationId (Int, FK → Station)
   - sessionId (Int, FK → Session)
   - type (EventType)
   - source (String) — "audio" | "game_analyzer"
   - detectedAt (DateTime)
   - preRollSeconds (Int, default 10)
   - postRollSeconds (Int, default 15)
   - peakAmplitude (Float?)
   - gameMinute (Int?)
   - scoreDelta (Int?)
   - mergedIntoId (Int?) — FK → self (PendingEvent), nullable
   - createdAt (DateTime, default now)

4. New model ClipJob:
   - id (Int, autoincrement PK)
   - stationId (Int, FK → Station)
   - sessionId (Int, FK → Session)
   - eventIds (Int[]) — array of PendingEvent IDs merged into this job
   - status (ClipJobStatus, default PENDING)
   - tvClipPath (String?) — extracted TV segment
   - webcamClipPath (String?) — extracted webcam segment
   - stitchedClipPath (String?) — Stage 2 output
   - finalClipPath (String?) — Stage 3 output
   - portraitClipPath (String?) — 9:16 portrait crop
   - errorMessage (String?)
   - enqueuedAt (DateTime, default now)
   - startedAt (DateTime?)
   - completedAt (DateTime?)

5. New model GameReplay:
   - id (Int, autoincrement PK)
   - stationId (Int, FK → Station)
   - sessionId (Int, FK → Session)
   - detectedAt (DateTime)
   - startSegment (String) — filename of first segment in replay window
   - endSegment (String) — filename of last segment in replay window
   - clipPath (String?) — extracted path after processing
   - durationSeconds (Float?)
   - createdAt (DateTime, default now)

6. New model MatchState:
   - id (Int, autoincrement PK)
   - stationId (Int, FK → Station, unique)
   - homeScore (Int, default 0)
   - awayScore (Int, default 0)
   - matchMinute (Int, default 0)
   - phase (String, default "pre_match") — "pre_match" | "first_half" | "half_time" | "second_half" | "full_time"
   - isReplayOnScreen (Boolean, default false)
   - lastUpdated (DateTime, default now)

7. Add to Station model:
   - webcamDevice (String?) — e.g. "/dev/video2"
   - analysisWebcamDevice (String?) — separate low-res pipe device if needed

8. Add to Settings model:
   - tvRingBufferSeconds (Int, default 120)
   - clipPreRollSeconds (Int, default 10)
   - clipPostRollSeconds (Int, default 15)
   - eventMergeWindowSeconds (Int, default 8)
   - gameAnalysisEnabled (Boolean, default true)
   - audioDetectionEnabled (Boolean, default true)
   - stage2Enabled (Boolean, default true)
   - stage3Enabled (Boolean, default false)
   - yamnetThresholdBase (Float, default 0.45)

After editing the schema, run:
   npx prisma migrate dev --name enhanced_video_pipeline

Verify the migration applies cleanly. Then run:
   npx prisma generate

Write a short test file apps/api/src/services/__tests__/schema.test.ts that:
- Creates a MatchState record for station 1
- Creates a PendingEvent linked to it
- Creates a ClipJob
- Reads them back and asserts the fields are correct
- Cleans up after itself

Run the test. It must pass before committing.

Commit: "feat(db): add PendingEvent, ClipJob, GameReplay, MatchState schema"
```

---

### Prompt 49 — Capture Infrastructure: tmpfs Ring Buffer for TV Streams

**Context:** The TV capture service currently writes segments to disk in a simple directory. This prompt upgrades it to write into a tmpfs (RAM) ring buffer mounted at `/run/lounge/`. Each station gets its own subdirectory: `/run/lounge/tv1/`, `/run/lounge/tv2/`, etc. Segments are 2 seconds long. A separate Python pruner process watches each directory and deletes segments older than the configured buffer window (default: 120 seconds = 60 segments). The existing capture service is updated to point to the new paths; nothing else about the capture logic changes yet.

```text
Read docs/WORKING-RULES.md and docs/SPEC.md (Section 7 — Storage Layout, Section 8 — TV Ring Buffer).

1. Create services/video-pipeline/capture/ring_buffer.py:
   - Class RingBuffer(station_id, buffer_dir, max_age_seconds=120)
   - Method prune(): scan the buffer dir, delete any .ts segment whose mtime is older than max_age_seconds
   - Method get_segments_in_window(start_dt, end_dt) -> list[Path]: return sorted list of segment files whose timestamps fall between start_dt and end_dt
   - Method get_segment_for_time(dt) -> Path | None: return the single segment covering a given datetime
   - Segment filenames follow the pattern: seg_{unix_timestamp}.ts

2. Create services/video-pipeline/capture/pruner.py:
   - Standalone script: runs a loop, calls RingBuffer.prune() every 5 seconds for each configured station
   - Reads station count from environment variable STATION_COUNT (default 4)
   - Buffer base dir from RING_BUFFER_DIR (default /run/lounge)
   - Logs pruned file count each cycle at DEBUG level

3. Update services/video-pipeline/capture/tv_capture.py (or equivalent):
   - Change segment output directory from existing path to {RING_BUFFER_DIR}/tv{station_id}/
   - Keep segment duration at 2 seconds (-segment_time 2)
   - Keep -c copy (no transcode)
   - Segment filename pattern: seg_%s.ts (uses Unix timestamp via strftime)
   - Ensure the output directory exists before starting ffmpeg (mkdir -p)

4. Create services/video-pipeline/capture/systemd/neo-lounge-tv-capture@.service:
   - Template unit, instance = station number (e.g. neo-lounge-tv-capture@1.service)
   - ExecStart: runs tv_capture.py for that station
   - Restart=always, RestartSec=3
   - WatchdogSec=30
   - After=network.target

5. Create services/video-pipeline/capture/systemd/neo-lounge-ring-pruner.service:
   - ExecStart: runs pruner.py
   - Restart=always, RestartSec=5

6. Write tests in services/video-pipeline/tests/test_ring_buffer.py:
   - Create a temp directory
   - Write fake .ts files with various mtimes (using os.utime)
   - Call prune() and assert old files are deleted, recent ones kept
   - Call get_segments_in_window() with a known time range and assert correct files returned

Run the tests. They must pass.

Commit: "feat(capture): tmpfs ring buffer with pruner and systemd units"
```

---

### Prompt 50 — Capture Infrastructure: Webcam and Security Camera Services

**Context:** Webcam footage goes to NVMe (not RAM) because it's larger and doesn't need the same instant-overwrite semantics. Each station has one 120fps webcam. Security cameras use 300-second segments — very different from the 2-second TV segments. This prompt creates the capture services for both, separate from the TV ring buffer.

```text
Read docs/WORKING-RULES.md and docs/SPEC.md (Section 8 — Webcam Capture, Section 8 — Security Camera Capture).

1. Create services/video-pipeline/capture/webcam_capture.py:
   - Reads STATION_ID and WEBCAM_DEVICE from environment
   - Output directory: /var/lounge/sessions/{session_id}/webcam/
   - Segment duration: 10 seconds (-segment_time 10)
   - Capture at 720p 120fps: -framerate 120 -video_size 1280x720
   - Copy stream as-is: -c copy
   - Segment filename: seg_%s.ts
   - Polls the API (GET /api/sessions/active?stationId=X) every 5 seconds to get the current session_id
   - When a session starts: begin capturing into that session directory
   - When a session ends: stop ffmpeg cleanly (SIGTERM), log final segment path
   - When no session is active: idle (no ffmpeg running)

2. Create services/video-pipeline/capture/security_capture.py:
   - Reads camera list from /etc/lounge/cameras.json (array of {id, rtsp_url, label})
   - Output directory: /var/lounge/security/{camera_id}/
   - Segment duration: 300 seconds (-segment_time 300)
   - Copy stream: -c copy
   - Runs continuously regardless of session state
   - Implements retention pruning: delete segments older than 72 hours

3. Create systemd units:
   - services/video-pipeline/capture/systemd/neo-lounge-webcam@.service (template, instance = station)
   - services/video-pipeline/capture/systemd/neo-lounge-security-cam@.service (template, instance = camera id)

4. Write tests in services/video-pipeline/tests/test_webcam_capture.py:
   - Mock the ffmpeg subprocess and API calls
   - Assert: correct ffmpeg args built for device + output path
   - Assert: when session ends, SIGTERM sent to ffmpeg process
   - Assert: when no active session, ffmpeg is not running

Run the tests. They must pass.

Commit: "feat(capture): webcam 120fps and security camera capture services"
```

---

### Prompt 51 — Audio Event Detector: YAMNet + EventMerger

**Context:** The existing audio detection code writes events to the database directly and moves on. This prompt replaces that with two things: (1) a YAMNet-based detector that writes raw `PendingEvent` rows as it detects events, and (2) an `EventMerger` class that periodically looks at the pending events table, finds events within `eventMergeWindowSeconds` of each other on the same station, and merges them into a single expanded window. The EventMerger then creates a `ClipJob` for each merged group and issues a PostgreSQL NOTIFY to wake the clip extraction worker.

```text
Read docs/WORKING-RULES.md and docs/SPEC.md (Section 10 — Audio Detection, Section 11 — EventMerger).

1. Update services/video-pipeline/audio/detector.py:
   - Keep YAMNet inference as-is (quantized TFLite model, 15,600-sample chunks)
   - Replace the existing DB write logic:
     Instead of writing a final event, write a PendingEvent row:
       INSERT INTO "PendingEvent" (stationId, sessionId, type, source, detectedAt, peakAmplitude, preRollSeconds, postRollSeconds)
       VALUES ($1, $2, $3, 'audio', NOW(), $4, 10, 15)
   - Use the threshold from Settings.yamnetThresholdBase (read from DB at startup, refresh every 60s)
   - If MatchState for this station has gameMinute >= 80 or scoreDelta == 0 (tied), reduce threshold by 0.05 (tense moment = more sensitive)
   - Log detected event type and amplitude at INFO level

2. Create services/video-pipeline/audio/event_merger.py:
   - Class EventMerger(db_conn, merge_window_seconds)
   - Method run_merge_cycle():
     a. Query all PendingEvents where mergedIntoId IS NULL and detectedAt > NOW() - INTERVAL '5 minutes', grouped by stationId+sessionId
     b. For each station group, sort events by detectedAt ASC
     c. Scan through: if two events are within merge_window_seconds of each other, mark the later one as mergedIntoId = earlier one's id
     d. For each surviving (non-merged) event or merge-root, compute the combined window:
        windowStart = min(detectedAt) - preRollSeconds
        windowEnd = max(detectedAt) + postRollSeconds
     e. Check if a ClipJob already exists for this event cluster (by checking eventIds overlap). If not, create one:
        INSERT INTO "ClipJob" (stationId, sessionId, eventIds, status, enqueuedAt)
        VALUES ($1, $2, $3, 'PENDING', NOW())
     f. Issue: NOTIFY clip_jobs_channel, '{stationId}';
   - Method start(interval_seconds=3): runs run_merge_cycle() in a loop every interval_seconds

3. Create services/video-pipeline/audio/systemd/neo-lounge-audio-detector@.service (template, instance = station)
4. Create services/video-pipeline/audio/systemd/neo-lounge-event-merger.service

5. Write tests in services/video-pipeline/tests/test_event_merger.py:
   - Test with 3 events: A at T=0, B at T=5, C at T=20 (merge window = 8s)
   - Assert: A and B merge (gap=5 < 8), C is separate
   - Assert: 2 ClipJobs created
   - Assert: merged event has B.mergedIntoId = A.id
   - Test: if ClipJob already exists for A's cluster, no duplicate is created

Run the tests. They must pass.

Commit: "feat(audio): YAMNet detector writes PendingEvents, EventMerger creates ClipJobs"
```

---

### Prompt 52 — Game Stream Analyzer

**Context:** Each TV station gets a secondary low-resolution ffmpeg pipe running alongside the main capture. It decodes only — at 240p and 2fps — just enough to analyze what's on screen. A Python process reads frames from this pipe and runs: (1) template matching to detect the FIFA in-game replay banner and red/yellow card flashes, (2) lightweight OCR on the score/timer region, and (3) simple frame differencing to detect the goal animation flash. When it detects a significant event, it writes a `PendingEvent` (source="game_analyzer") and updates `MatchState`.

```text
Read docs/WORKING-RULES.md and docs/SPEC.md (Section 9 — Game Stream Analysis).

1. Create services/video-pipeline/game_analyzer/frame_reader.py:
   - Class FrameReader(station_id, video_source)
   - Uses ffmpeg subprocess piping to stdout:
     ffmpeg -i {video_source} -vf scale=427:240 -r 2 -f rawvideo -pix_fmt bgr24 pipe:1
   - Reads frames in a loop: each frame = 240 * 427 * 3 bytes
   - Yields numpy arrays of shape (240, 427, 3)
   - Handles pipe EOF gracefully (restart after 2s delay)

2. Create services/video-pipeline/game_analyzer/detectors.py:
   - Function detect_replay_banner(frame) -> bool:
     Template match against a pre-saved template image at assets/templates/replay_banner.png
     Return True if match confidence > 0.75
   - Function detect_card_flash(frame) -> str | None:
     Check for large red or yellow blob in centre-right of frame using HSV thresholds
     Return "red" | "yellow" | None
   - Function detect_goal_flash(frame, prev_frame) -> bool:
     Compute mean absolute difference between frame and prev_frame
     Return True if difference > 40 (large sudden brightness change)
   - Function extract_score_and_minute(frame) -> tuple[str, str]:
     Crop the top-centre region (y=10:40, x=150:280)
     Run pytesseract.image_to_string with config "--psm 7 -c tessedit_char_whitelist=0123456789:-"
     Parse and return (score_string, minute_string) — both raw strings, empty string if OCR fails

3. Create services/video-pipeline/game_analyzer/analyzer.py:
   - Class GameAnalyzer(station_id, db_conn, video_source)
   - Maintains prev_frame for diff detection
   - Main loop: read frame → run all detectors → act:
     - On detect_replay_banner=True: UPDATE MatchState SET isReplayOnScreen=True
       Create a PendingEvent type=GAME_REPLAY if not already created in last 30s
     - On detect_replay_banner=False (after being True): UPDATE MatchState SET isReplayOnScreen=False
     - On detect_card_flash=red: create PendingEvent type=CARD_EVENT
     - On detect_goal_flash=True: create PendingEvent type=GOAL_AUDIO (game-confirmed goal)
     - On extract_score_and_minute: parse scores, UPDATE MatchState homeScore/awayScore/matchMinute
       If score changed: also create PendingEvent type=GOAL_AUDIO
   - Debounce: no event of the same type created within 20 seconds on the same station
   - Log each detected event at INFO level with station_id and frame timestamp

4. Create services/video-pipeline/game_analyzer/systemd/neo-lounge-game-analyzer@.service (template, instance = station)

5. Write tests in services/video-pipeline/tests/test_detectors.py:
   - Load a synthetic white frame and a synthetic frame with a red rectangle — assert detect_card_flash returns "red"
   - Two identical frames — assert detect_goal_flash returns False
   - Frame vs all-white frame — assert detect_goal_flash returns True
   - Mock pytesseract and assert extract_score_and_minute parses "2:1" and "43" correctly

Run the tests. They must pass.

Commit: "feat(analyzer): game stream analysis at 240p/2fps with event writing"
```

---

### Prompt 53 — Clip Extraction Worker (Stage 1)

**Context:** This is the core of Stage 1. A Python worker listens on the PostgreSQL `clip_jobs_channel` for NOTIFY messages. When one arrives, it picks the oldest `PENDING` ClipJob (FIFO). It then extracts the TV clip from the ring buffer using `ffmpeg -f concat -c copy`, and simultaneously extracts the matching webcam segment window using the same approach. Both extractions happen immediately — the TV ring buffer cannot wait. The worker updates the ClipJob status as it progresses and writes the output paths back to the row.

```text
Read docs/WORKING-RULES.md and docs/SPEC.md (Section 12 — Clip Extraction Worker, Section 13 — Clip Queue).

1. Create services/video-pipeline/workers/clip_extractor.py:

   a. At startup: open a psycopg2 connection and run LISTEN clip_jobs_channel;
   
   b. Main loop:
      - Block on select() waiting for NOTIFY (timeout 30s for watchdog keepalive)
      - On NOTIFY (or on startup): call process_next_job()
   
   c. process_next_job():
      - SELECT ... FROM "ClipJob" WHERE status='PENDING' ORDER BY enqueuedAt ASC LIMIT 1 FOR UPDATE SKIP LOCKED
      - If none: return
      - UPDATE status='EXTRACTING', startedAt=NOW()
      - Call extract_tv_clip(job) → returns output path or raises
      - Call extract_webcam_clip(job) → returns output path or None (webcam optional)
      - UPDATE tvClipPath, webcamClipPath, status='STITCHING'
      - NOTIFY stitch_jobs_channel, '{job_id}';
      - On any exception: UPDATE status='FAILED', errorMessage=str(e); log at ERROR level

   d. extract_tv_clip(job):
      - Compute windowStart = min event detectedAt - preRollSeconds
      - Compute windowEnd = max event detectedAt + postRollSeconds
      - Call RingBuffer(job.stationId).get_segments_in_window(windowStart, windowEnd)
      - If no segments: raise RuntimeError("Ring buffer miss — segments already pruned")
      - Write a concat list file to /tmp/concat_{job.id}.txt
      - Run: ffmpeg -f concat -safe 0 -i /tmp/concat_{job.id}.txt -c copy /var/lounge/sessions/{sessionId}/clips/tv_{job.id}.ts
      - Verify output exists and duration > 5 seconds (using ffprobe)
      - Return output path

   e. extract_webcam_clip(job):
      - Same window calculation
      - Source dir: /var/lounge/sessions/{sessionId}/webcam/
      - Use RingBuffer-equivalent logic to find webcam segments (RingBuffer works on any segment dir)
      - Run same ffmpeg concat command → /var/lounge/sessions/{sessionId}/clips/webcam_{job.id}.ts
      - If no webcam segments exist, log a warning and return None (station may not have webcam yet)
      - Verify output > 5s if it exists

2. Create a helper services/video-pipeline/workers/ffprobe_utils.py:
   - Function get_duration(path) -> float: runs ffprobe, parses duration in seconds
   - Function verify_clip(path, min_duration=5.0) -> bool: returns True if file exists and duration >= min_duration

3. Create systemd unit services/video-pipeline/workers/systemd/neo-lounge-clip-extractor.service:
   - Single instance (not templated — one worker handles all stations' jobs)
   - WatchdogSec=30
   - Restart=always

4. Write tests in services/video-pipeline/tests/test_clip_extractor.py:
   - Mock ffmpeg subprocess and ffprobe
   - Mock DB connection and NOTIFY
   - Assert: FOR UPDATE SKIP LOCKED query is used (prevents double processing)
   - Assert: correct concat file is written with right segment paths
   - Assert: on ffprobe duration < 5, RuntimeError is raised and job set to FAILED
   - Assert: on ring buffer miss (no segments), job set to FAILED with descriptive message

Run the tests. They must pass.

Commit: "feat(worker): Stage 1 clip extraction via LISTEN/NOTIFY and ring buffer"
```

---

### Prompt 54 — FIFA In-Game Replay Harvesting

**Context:** When the game analyzer detects the FIFA replay banner, it marks `MatchState.isReplayOnScreen = True`. A separate harvester watches for this state and extracts whatever is currently on the TV stream as a `GameReplay` clip — this is the FIFA game engine's own professional slow-motion replay camera, available for free inside the capture stream. These clips are stored separately from ClipJobs and later assembled into the highlight reel.

```text
Read docs/WORKING-RULES.md and docs/SPEC.md (Section 9.3 — FIFA Replay Harvesting).

1. Create services/video-pipeline/workers/replay_harvester.py:
   - Class ReplayHarvester(db_conn, ring_buffer_dir)
   - Maintains a dict per station: {station_id: replay_start_time | None}
   
   - Method poll():
     For each station (query all MatchState rows):
       - If isReplayOnScreen=True and no active harvest for this station:
         Record replay_start_time = NOW()
         Create a GameReplay row: INSERT ... (stationId, sessionId, detectedAt=NOW(), startSegment=current_segment_name)
       - If isReplayOnScreen=False and there IS an active harvest:
         Compute replay window: replay_start_time to NOW()
         Call extract_replay_clip(station_id, session_id, start_time, end_time, game_replay_id)
         Clear active harvest for this station
   
   - Method extract_replay_clip(station_id, session_id, start_dt, end_dt, replay_id):
     - Get segments from RingBuffer for the window
     - Run ffmpeg -f concat -c copy → /var/lounge/sessions/{session_id}/replays/fifa_{replay_id}.ts
     - Verify duration > 3 seconds
     - UPDATE GameReplay SET clipPath=..., durationSeconds=..., endSegment=...
     - Log "FIFA replay harvested: {duration:.1f}s for station {station_id}"
   
   - poll() runs every 1 second (replay banner shows for 10-25 seconds typically)

2. Create systemd unit services/video-pipeline/workers/systemd/neo-lounge-replay-harvester.service:
   - Restart=always, WatchdogSec=30

3. Write tests in services/video-pipeline/tests/test_replay_harvester.py:
   - Simulate: isReplayOnScreen goes True at T=0, False at T=15
   - Assert: one GameReplay row created, extract called with correct 15-second window
   - Simulate: isReplayOnScreen stays True across two poll() cycles
   - Assert: only one harvest started (no duplicate)
   - Simulate: replay ends but ring buffer has no segments (buffer miss)
   - Assert: GameReplay row created but clipPath stays null; error logged

Run the tests. They must pass.

Commit: "feat(worker): FIFA in-game replay harvester from ring buffer"
```

---

### Prompt 55 — Stage 2 Stitch Worker: TV + Webcam PiP Overlay

**Context:** The stitch worker listens for `stitch_jobs_channel` NOTIFY messages (issued by the clip extractor when a job moves to STITCHING status). It takes the TV clip and webcam clip for a given ClipJob and composites them using `ffmpeg -filter_complex`. The webcam is placed as a picture-in-picture (PiP) overlay in the bottom-right corner of the TV frame. Quick Sync hardware encode (`h264_qsv`) is used for the output. If no webcam clip exists, the TV clip is passed through as-is. The output is a single H.264 MP4 file ready for Stage 3 or direct serving.

```text
Read docs/WORKING-RULES.md and docs/SPEC.md (Section 14 — Stage 2 Stitch Worker).

1. Create services/video-pipeline/workers/stitch_worker.py:

   a. Startup: LISTEN stitch_jobs_channel;
   
   b. process_next_stitch():
      - SELECT ClipJob WHERE status='STITCHING' ORDER BY enqueuedAt ASC LIMIT 1 FOR UPDATE SKIP LOCKED
      - If none: return
      
   c. stitch(job):
      If job.webcamClipPath is None or file does not exist:
        # No webcam — just remux TV clip to MP4
        ffmpeg -i {tvClipPath} -c copy /var/lounge/sessions/{sessionId}/clips/stitched_{job.id}.mp4
      Else:
        # PiP composite
        ffmpeg \
          -i {tvClipPath} \
          -i {webcamClipPath} \
          -filter_complex "
            [0:v]scale=1280:720[tv];
            [1:v]scale=320:180[cam];
            [tv][cam]overlay=W-w-20:H-h-20[out]
          " \
          -map "[out]" -map 0:a \
          -c:v h264_qsv -preset fast -b:v 3M \
          -c:a aac -b:a 128k \
          /var/lounge/sessions/{sessionId}/clips/stitched_{job.id}.mp4
      
      Fallback: if h264_qsv fails (device not available), retry with -c:v libx264 -preset fast -crf 23
      
      Verify output > 5 seconds.
      UPDATE ClipJob SET stitchedClipPath=..., status='AI_EFFECTS' (if stage3Enabled) or 'DONE'
      
      If stage3Enabled from Settings:
        NOTIFY ai_effects_channel, '{job.id}';
      Else:
        UPDATE ReplayClip SET filePath=stitchedClipPath (upsert by sessionId+stationId+clipJobId)
        Emit WebSocket event replay:clip_ready to session room

2. Create systemd unit services/video-pipeline/workers/systemd/neo-lounge-stitch-worker.service

3. Write tests in services/video-pipeline/tests/test_stitch_worker.py:
   - Mock ffmpeg subprocess
   - Test: webcam clip present → assert filter_complex command is built correctly (PiP overlay args)
   - Test: webcam clip absent → assert simple remux command (no filter_complex)
   - Test: h264_qsv fails (non-zero exit) → assert libx264 fallback attempted
   - Test: output duration < 5s → job set to FAILED

Run the tests. They must pass.

Commit: "feat(worker): Stage 2 PiP stitch worker with Quick Sync encode and fallback"
```

---

### Prompt 56 — Caption Library: JSON Structure and Selection Logic

**Context:** Before building Stage 3 AI effects, we need the caption library in place because the AI effects worker will call into it. The library is a JSON file of 1000+ caption entries. Each entry has a context tag (goal, miss, card, celebration, equaliser, etc.), an emotion tag (shock, joy, despair, etc.), optional conditions (matchMinute range, scoreDelta range), and the caption text in English and Sheng/Swahili. The selection function takes the current MatchState and detected emotion and returns the most contextually appropriate caption.

```text
Read docs/WORKING-RULES.md and docs/SPEC.md (Section 15 — Caption Library).

1. Create services/video-pipeline/captions/captions.json:
   - Array of caption objects. Each object has:
     {
       "id": "unique_string",
       "context": "goal" | "miss" | "card_red" | "card_yellow" | "celebration" | "equaliser" | "winning" | "losing" | "match_end" | "generic",
       "emotion": "shock" | "joy" | "despair" | "anger" | "anticipation" | "disbelief" | "neutral",
       "conditions": {
         "minMinute": 0,       (optional, defaults to 0)
         "maxMinute": 90,      (optional, defaults to 90)
         "scoreDelta": null    (optional: positive = winning, negative = losing, 0 = tied, null = any)
       },
       "text_en": "Caption text in English",
       "text_sw": "Maandishi kwa Kiswahili / Sheng"
     }
   
   - Write at least 40 entries covering: goals in first half, goals in 80th+ minute, equalisers, red cards, celebrations when winning big, despair when losing, shock at last-minute events, and 10 generic crowd-noise captions.
   
   - Make the Sheng/Swahili texts feel natural and local — short, punchy, how fans in Nairobi actually talk. Examples: "Hiyo ni poa sana!", "Wacha mchezo!", "Nilikuambia!", "Pole pole ndo mwendo... mpaka sasa!"

2. Create services/video-pipeline/captions/selector.py:
   - Function load_captions(path="captions/captions.json") -> list[dict]
   - Function select_caption(captions, context, emotion, match_state) -> dict:
     a. Filter by context (exact match first, fall back to "generic")
     b. Filter by emotion (exact match first, fall back to any emotion)
     c. Filter by conditions (matchMinute within range, scoreDelta matches if specified)
     d. If multiple candidates: pick randomly from top 5 matches
     e. If zero candidates after filtering: return a hardcoded fallback {"text_en": "...", "text_sw": "..."}
   - Function get_caption_text(caption, lang="sw") -> str: returns text_sw or text_en

3. Write tests in services/video-pipeline/tests/test_caption_selector.py:
   - Load the real captions.json
   - Assert: selecting context="goal", emotion="joy", minute=85, scoreDelta=0 returns an equaliser/late-goal caption
   - Assert: selecting context="card_red", emotion="shock" returns a red card caption
   - Assert: when no exact emotion match, a caption is still returned (fallback works)
   - Assert: calling 10 times with same inputs produces varied results (randomization)

Run the tests. They must pass.

Commit: "feat(captions): caption library JSON with 40+ entries and context-aware selector"
```

---

### Prompt 57 — Stage 3 AI Effects Worker: Face Detection, Emotion, Zoom, Slow-Mo

**Context:** This is the most CPU-intensive step and the last processing stage before a clip is ready to serve. The AI effects worker takes the stitched MP4 from Stage 2 and produces a final enhanced clip. It: (1) runs YuNet face detection on key frames of the webcam region to find customer faces, (2) runs FER MobileNet on each detected face crop to classify emotion, (3) selects a caption from the library using the detected emotion + MatchState context, (4) rebuilds the clip with a zoom-in to face(s) in the most emotive moment, played at 60fps output (giving real 2× slow-motion from the 120fps webcam source), (5) burns in the caption text, (6) generates both 16:9 landscape and 9:16 portrait crops. This runs on CPU — Quick Sync is not used here.

```text
Read docs/WORKING-RULES.md and docs/SPEC.md (Section 16 — Stage 3 AI Effects).

1. Create services/video-pipeline/workers/ai_effects_worker.py:

   a. Startup: LISTEN ai_effects_channel;
   
   b. process_next_ai_job():
      - SELECT ClipJob WHERE status='AI_EFFECTS' ORDER BY enqueuedAt ASC LIMIT 1 FOR UPDATE SKIP LOCKED
      - Call apply_ai_effects(job)

   c. apply_ai_effects(job):
      input_path = job.stitchedClipPath
      output_landscape = /var/lounge/sessions/{sessionId}/clips/final_{job.id}.mp4
      output_portrait  = /var/lounge/sessions/{sessionId}/clips/final_{job.id}_portrait.mp4
      
      Step 1 — Sample frames from webcam PiP region:
        Use OpenCV VideoCapture to open input_path
        Sample 1 frame every 0.5 seconds
        Crop webcam PiP region (bottom-right 320×180 pixels)
      
      Step 2 — Face detection with YuNet:
        Load cv2.FaceDetectorYN (model: face_detection_yunet_2023mar.onnx — 374KB)
        Run detect() on each sampled crop
        Collect all face bounding boxes with confidence > 0.7
        Find the frame with the highest-confidence face detection → "peak_frame_time"
      
      Step 3 — Emotion classification with FER MobileNet:
        Load ONNX model (fer_mobilenet.onnx — ~5MB) via onnxruntime
        For each detected face crop: run inference, get top emotion label + score
        Keep the dominant emotion across all sampled frames
      
      Step 4 — Caption selection:
        Load MatchState for this station from DB
        context = map job event type to caption context (GOAL_AUDIO → "goal", CARD_EVENT → "card_red", etc.)
        emotion = dominant emotion from Step 3 (or "neutral" if no faces)
        caption = select_caption(captions, context, emotion, match_state)
      
      Step 5 — Build ffmpeg command:
        Determine zoom mode:
          - 2+ faces detected → split-screen: zoom both face regions side-by-side
          - 1 face → single face zoom centred
          - 0 faces → full frame, no zoom
        
        Build filter_complex for landscape output:
          [0:v]setpts=0.5*PTS[slow];          ← 120fps → 60fps output = real 2× slow-mo
          [slow]zoompan=z='zoom+0.002':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=75[zoomed];
          [zoomed]drawtext=text='{caption.text_sw}':fontsize=36:fontcolor=white:
                  box=1:boxcolor=black@0.5:x=(w-text_w)/2:y=h-80[out]
        
        Output: -c:v libx264 -preset fast -crf 22 -r 60 (landscape 1280×720)
        
        Portrait: add additional filter to crop 9:16 centred on face x-coordinate:
          crop=405:720:face_x_centre-202:0
          scale=1080:1920
          Output: final_{job.id}_portrait.mp4
      
      Step 6 — Verify both outputs > 5 seconds
      
      Step 7 — UPDATE ClipJob SET finalClipPath=..., portraitClipPath=..., status='DONE', completedAt=NOW()
               Upsert ReplayClip with finalClipPath
               Emit WebSocket: replay:clip_ready to session room (include portraitClipPath in payload)

2. Create services/video-pipeline/workers/systemd/neo-lounge-ai-effects-worker.service:
   - Single instance, WatchdogSec=60 (AI processing can take up to 30s per clip)

3. Write tests in services/video-pipeline/tests/test_ai_effects_worker.py:
   - Mock OpenCV VideoCapture (return 5 synthetic frames with a 50×50 face region)
   - Mock YuNet detect() to return one face bounding box on frame 3
   - Mock FER ONNX inference to return {"joy": 0.85, "neutral": 0.15}
   - Assert: caption selector called with emotion="joy"
   - Assert: ffmpeg called with setpts=0.5*PTS (slow-mo) and drawtext filter
   - Assert: portrait output path differs from landscape path
   - Assert: both verify_clip calls made

Run the tests. They must pass.

Commit: "feat(worker): Stage 3 AI effects — face zoom, 2x slow-mo, captions, portrait crop"
```

---

### Prompt 58 — Highlight Reel Assembly

**Context:** Once all ClipJobs for a session reach DONE status, a highlight reel is automatically assembled. The reel concatenates all final clips in chronological order, adds a title card at the start ("Station 1 — Match Highlights"), numbered transition cards between clips (e.g. "Moment 2"), a watermark logo in the corner, and a final QR code frame linking to the session's PWA download page. Both landscape and portrait versions are produced. The API emits `replay:reel_ready` when done.

```text
Read docs/WORKING-RULES.md and docs/SPEC.md (Section 17 — Highlight Reel Assembly).

1. Create services/video-pipeline/workers/reel_assembler.py:
   - Class ReelAssembler(db_conn, session_id, station_id)
   
   - Method is_session_complete() -> bool:
     Check that the session has ended (Session.status = 'COMPLETED')
     AND all ClipJobs for this session have status='DONE' or 'FAILED'
     AND at least 1 ClipJob has status='DONE'
   
   - Method assemble():
     a. Fetch all DONE ClipJobs for session, sorted by enqueuedAt ASC
     b. Generate a title card image using Pillow:
        1280×720, dark background, white text "Station {n} — Match Highlights", lounge logo if available
        Save to /tmp/title_{session_id}.png
        Encode as 3-second video: ffmpeg -loop 1 -i /tmp/title_{session_id}.png -t 3 -c:v libx264 /tmp/title_{session_id}.ts
     c. For each clip (index i):
        Generate transition card: "Moment {i+1}" in same style → 1-second video
        /tmp/transition_{session_id}_{i}.ts
     d. Build concat list:
        title.ts | transition_0.ts | clip_0 | transition_1.ts | clip_1 | ...
     e. ffmpeg -f concat -safe 0 -i concat.txt \
              -vf "drawtext=text='Neo Lounge':fontsize=20:fontcolor=white@0.4:x=20:y=20" \
              -c:v libx264 -preset fast -crf 22 \
              /var/lounge/sessions/{session_id}/reel_landscape.mp4
     f. Generate QR code PNG (using qrcode library):
        URL = https://replay.neolounge.co.ke/{auth_code}
        Encode as 3-second video and append to concat list
     g. Portrait reel: repeat with portrait clips (portraitClipPath) + portrait-cropped title/transition cards
        → /var/lounge/sessions/{session_id}/reel_portrait.mp4
     h. UPDATE Session SET reelPath=..., portraitReelPath=...
     i. Emit WebSocket: replay:reel_ready {sessionId, stationId, reelUrl, portraitReelUrl}
   
   - Trigger: a periodic check (every 30 seconds) scans all COMPLETED sessions without a reel and calls assemble() if is_session_complete() returns True. Alternatively, triggered directly by the last ClipJob completing.

2. Create systemd unit: neo-lounge-reel-assembler.service

3. Write tests in services/video-pipeline/tests/test_reel_assembler.py:
   - Mock all DONE ClipJobs for a session (3 clips)
   - Mock ffmpeg subprocess and Pillow image generation
   - Assert: concat list contains title + 3 pairs of (transition + clip)
   - Assert: QR code video appended at end
   - Assert: portrait reel uses portraitClipPath not finalClipPath
   - Assert: Session.reelPath updated after assembly
   - Assert: WebSocket event emitted

Run the tests. They must pass.

Commit: "feat(worker): highlight reel assembly with title cards, transitions, QR code frame"
```

---

### Prompt 59 — Tablet UX Updates: Notifications, Live Counter, QR Code

**Context:** The tablet app currently shows a countdown timer and QR code for session management. This prompt adds the replay-specific tablet experience: a live "moments captured" counter that increments each time a clip is processed, a notification banner when all clips are ready, and a QR code for the highlight reel download — replacing the session management QR. Per the UX rules in the spec: no clip preview on the tablet, no SMS to customers, notification only.

```text
Read docs/WORKING-RULES.md and docs/SPEC.md (Section 20 — Tablet UX Rules).

IMPORTANT UX RULES — do not violate these:
- The tablet must NOT show a preview or thumbnail of any clip
- Customers must NOT be sent SMS notifications about replays
- The tablet shows only: (1) a count of clips ready, (2) a notification when the reel is ready, (3) a QR code for the PWA download link
- All replay-related WebSocket events are for display on the TABLET SCREEN only

1. Update apps/tablet/src/lib/socket.ts:
   - Add listeners for:
     - replay:clip_ready — increment local clipReadyCount state
     - replay:all_ready — set allReady=true, store reelUrl and portraitReelUrl
     - replay:reel_ready — set reelReady=true, store reel QR code URL

2. Create apps/tablet/src/components/ReplayStatus.tsx:
   - Props: { clipReadyCount: number, totalClips: number, reelReady: boolean, reelQrUrl: string | null }
   - Shows a subtle animated counter: "X moments captured so far"
     - This appears while session is active (clipReadyCount > 0)
     - No clips shown, no thumbnails, no preview
   - When reelReady=true: show a notification banner:
     "Your highlight reel is ready!"
     Below it: a QR code (use qrcode.react library) pointing to reelQrUrl
     Caption: "Scan to watch and share your highlights"
   - Style: dark background, accent colour from theme, large enough to read from 1.5m

3. Update apps/tablet/src/app/page.tsx (or equivalent active session page):
   - Add ReplayStatus component to the active session layout
   - Position below the countdown timer, above any extension/booking controls
   - Pass clipReadyCount and reelReady state from socket listeners

4. Ensure: no clip URLs are displayed anywhere on the tablet screen
   - The only link shown is the reel QR code
   - No thumbnail images from replay clips rendered at any point

5. Write tests in apps/tablet/src/__tests__/ReplayStatus.test.tsx (using React Testing Library):
   - Render with clipReadyCount=0 — assert counter not shown
   - Render with clipReadyCount=2, reelReady=false — assert "2 moments captured" shown, no QR code
   - Render with reelReady=true and reelQrUrl set — assert notification banner and QR code visible
   - Assert: no <img> or <video> tags rendered that reference clip paths

Run the tests. They must pass.

Commit: "feat(tablet): replay counter, reel-ready notification, and QR code (no preview)"
```

---

### Prompt 60 — PWA Updates: Portrait Download and Live Progress

**Context:** The customer PWA (running at the replay URL accessed via QR code) currently shows a list of clips and lets customers download them. This prompt adds: (1) a portrait (9:16) download option alongside the existing landscape download, (2) a live progress bar that shows how many clips are processing vs ready (using the existing socket.io connection), (3) a highlight reel download button when the reel is ready.

```text
Read docs/WORKING-RULES.md and docs/SPEC.md (Section 18 — PWA Delivery).

1. Update the replay PWA (apps/pwa or the equivalent PWA app in the project):

   a. On the clip list page, for each clip that has status='DONE':
      - Show the existing landscape download button (16:9)
      - Add a second button: "Portrait (9:16)" that downloads portraitClipPath
      - Both buttons use the existing auth-code-protected download endpoint

   b. Add a progress indicator at the top of the page:
      - While at least one ClipJob is PENDING/EXTRACTING/STITCHING/AI_EFFECTS:
        Show: "Processing your highlights… {doneCount} of {totalCount} ready"
        Animated progress bar (doneCount / totalCount)
      - When all done: hide progress bar, show "All highlights ready!"
      - Subscribe to replay:clip_ready WebSocket event to increment doneCount in real-time

   c. Add a highlight reel section below the clip list:
      - While reel is not ready: show "Highlight reel compiling…" with spinner
      - When replay:reel_ready received:
        Show a "Download Highlight Reel" button (landscape)
        Show a "Download Portrait Reel" button (9:16)
        Show a share hint: "Save to gallery and share on WhatsApp or TikTok"

2. Update GET /api/replays/:sessionId to include in each clip:
   - portraitClipPath (or a derived portraitUrl)
   - status (ClipJobStatus)
   - Include top-level: totalClips, doneClips, reelReady, reelUrl, portraitReelUrl

3. Write tests:
   - apps/pwa/src/__tests__/ReplayPage.test.tsx:
     - Mock API response with 2 clips (1 DONE, 1 AI_EFFECTS) and reelReady=false
     - Assert: progress bar shows "1 of 2 ready"
     - Assert: DONE clip shows both landscape and portrait download buttons
     - Assert: AI_EFFECTS clip shows no download button (not yet ready)
     - Simulate replay:reel_ready socket event → assert reel download buttons appear
   - apps/api/src/routes/__tests__/replays.test.ts:
     - GET /api/replays/:sessionId returns portraitClipPath and status per clip
     - Returns totalClips and doneClips counts

Run the tests. They must pass.

Commit: "feat(pwa): portrait download, live progress bar, highlight reel download"
```

---

### Prompt 61 — Dashboard Health Endpoints: Temperature, NVMe, Pipeline Status

**Context:** The owner dashboard currently shows session and revenue data. This prompt adds real hardware health data: CPU temperature (read from `/sys/class/thermal/`), NVMe S.M.A.R.T health (via `smartctl`), and the status of all pipeline systemd services. These are served by three new API endpoints and displayed as a health panel on the dashboard.

```text
Read docs/WORKING-RULES.md and docs/SPEC.md (Section 19 — System Health).

1. Create apps/api/src/services/healthService.ts:
   - getCpuTemperature(): Promise<number>
     Read /sys/class/thermal/thermal_zone0/temp, divide by 1000 → °C
     Return -1 if file not readable (non-Linux or missing sensor)
   
   - getNvmeHealth(): Promise<{ healthy: boolean, percentUsed: number, temperature: number }>
     Run: smartctl -j -a /dev/nvme0 (parse JSON output)
     Extract: nvme_smart_health_information_log.percentage_used
     Extract: temperature from Temperature_Celsius or temperature field
     If smartctl not available: return { healthy: true, percentUsed: 0, temperature: 0 }
   
   - getPipelineStatus(): Promise<Record<string, 'active' | 'inactive' | 'failed'>>
     Run: systemctl is-active neo-lounge-clip-extractor neo-lounge-stitch-worker neo-lounge-ai-effects-worker neo-lounge-reel-assembler neo-lounge-event-merger neo-lounge-ring-pruner
     Parse one status per service name
     Return as a dict keyed by service name

2. Create GET /api/system/health/hardware:
   - Returns: { cpuTemp, nvme: { healthy, percentUsed, temperature }, pipeline: { ...serviceStatuses } }
   - Owner auth required
   - If cpuTemp > 80: also set a warning flag in response

3. Create GET /api/system/health/pipeline:
   - Returns all ClipJob counts grouped by status for the last 24 hours:
     { PENDING: n, EXTRACTING: n, STITCHING: n, AI_EFFECTS: n, DONE: n, FAILED: n }
   - Returns count of GameReplay clips harvested today
   - Returns ring buffer stats per station: { tv1: { segmentCount, oldestSegmentAge, newestSegmentAge } }

4. Update the owner dashboard frontend to show a hardware health card:
   - Green/amber/red indicator for CPU temp (green < 70°C, amber 70–80, red > 80)
   - NVMe health bar (% used)
   - Each pipeline service: green dot (active) or red dot (inactive/failed)
   - Refresh every 30 seconds automatically

5. Write tests:
   - apps/api/src/services/__tests__/healthService.test.ts:
     - Mock fs.readFile for /sys/class/thermal — assert correct temp parsing
     - Mock child_process exec for smartctl JSON — assert percentUsed extracted correctly
     - Mock systemctl output — assert service statuses parsed correctly
   - apps/api/src/routes/__tests__/health.test.ts:
     - GET /api/system/health/hardware returns 200 with expected shape
     - cpuTemp > 80 → response includes warning: true

Run the tests. They must pass.

Commit: "feat(health): CPU temp, NVMe SMART, pipeline status endpoints and dashboard panel"
```

---

### Prompt 62 — Reliability: systemd Watchdog, UPS Shutdown, Temperature SMS

**Context:** Three reliability features run at the OS/system level and ensure the lounge keeps running or recovers gracefully under hardware stress. The watchdog config is added to all pipeline systemd units. UPS shutdown uses NUT (Network UPS Tools) with a custom script that signals ffmpeg and PostgreSQL cleanly. Temperature alerts use Africa's Talking SMS API (already present in the project for other uses) — a simple Python daemon reads CPU temp every 60 seconds and sends an SMS to the owner if it stays above 80°C for 3 consecutive checks.

```text
Read docs/WORKING-RULES.md and docs/SPEC.md (Section 19.2 — Reliability, Section 19.3 — UPS, Section 19.4 — Temperature Monitoring).

1. Verify all pipeline systemd units created in previous prompts include:
   WatchdogSec=30
   NotifyAccess=main
   
   Update any unit files missing these lines. The workers must call sd_notify("WATCHDOG=1") every ~15 seconds. For Python services, use the sdnotify library:
   
   In each long-running worker's main loop, add:
     import sdnotify
     n = sdnotify.SystemdNotifier()
     n.notify("WATCHDOG=1")   # call every loop iteration (loop is ~1-3s; watchdog fires at 30s)

2. Create services/system/ups_shutdown.sh:
   #!/bin/bash
   # Called by NUT upsd when battery reaches critical level
   # 1. Signal all ffmpeg capture processes to flush and exit
   pkill -SIGTERM -f "ffmpeg.*seg_%s.ts"
   sleep 3
   # 2. Checkpoint PostgreSQL (ensure WAL is written)
   psql -U lounge -c "CHECKPOINT;"
   # 3. Halt the system
   systemctl poweroff
   
   Create /etc/nut/upsmon.conf entry comment block explaining where to wire this in:
   # Add to upsmon.conf: NOTIFYCMD /opt/lounge/services/system/ups_shutdown.sh
   # NOTIFYFLAG LOWBATT EXEC
   # NOTIFYFLAG ONBATT EXEC+SYSLOG

3. Create services/system/temp_monitor.py:
   - Reads /sys/class/thermal/thermal_zone0/temp every 60 seconds
   - Maintains a consecutive_high counter
   - If temp > 80°C for 3 consecutive readings (3 minutes sustained):
     Send SMS via Africa's Talking API (use existing credentials from Settings or env vars):
       "⚠️ Neo Lounge alert: CPU temperature is {temp}°C. Check ventilation."
     Send to owner phone number from Settings.ownerPhone
     Reset counter after SMS sent (don't spam — minimum 30 minutes between alerts)
   - If temp drops below 75°C: reset counter
   - Log temp reading every cycle at DEBUG level

4. Create systemd unit services/system/systemd/neo-lounge-temp-monitor.service:
   - Restart=always

5. Write tests in services/system/tests/test_temp_monitor.py:
   - Mock thermal file reads: 3 consecutive reads above 80°C
   - Assert: SMS sent exactly once after the 3rd read
   - Assert: 4th read above 80°C (within 30 min) does NOT send another SMS
   - Assert: read below 75°C resets the counter (no SMS sent even after 3 reads)
   - Mock Africa's Talking client, assert correct message and phone number used

Run the tests. They must pass.

Commit: "feat(reliability): systemd watchdog notify, UPS clean shutdown, temperature SMS"
```

---

### Prompt 63 — Storage Lifecycle: 1-Hour Session Cleanup

**Context:** All session footage — webcam segments, TV clips, processed clips, stitched files, and the final highlight reel — must be deleted 1 hour after the session ends. The highlight reel itself is also deleted at this point; customers must download before then. A cleanup worker runs every 5 minutes, finds completed sessions whose end time was more than 1 hour ago, deletes all associated files, and marks the session as purged.

```text
Read docs/WORKING-RULES.md and docs/SPEC.md (Section 18.3 — Storage Lifecycle).

1. Create services/video-pipeline/workers/session_cleanup.py:
   - Runs every 5 minutes
   - Query: SELECT * FROM "Session" WHERE status='COMPLETED' AND endTime < NOW() - INTERVAL '1 hour' AND purgedAt IS NULL
   - For each session:
     a. Build list of directories to delete:
        - /var/lounge/sessions/{session_id}/ (all clips, webcam segments, reel files)
        - /run/lounge/ segments are self-pruning (ring buffer) — skip
     b. For each path in list: if it exists, shutil.rmtree() it safely (catch and log errors)
     c. UPDATE Session SET purgedAt=NOW()
     d. UPDATE ClipJob SET tvClipPath=NULL, webcamClipPath=NULL, stitchedClipPath=NULL, finalClipPath=NULL, portraitClipPath=NULL WHERE sessionId={session_id}
     e. Log: "Session {session_id} purged: {bytes_freed}MB freed"

2. Create systemd unit: neo-lounge-session-cleanup.service
   - Type=oneshot with a timer unit (OnCalendar=*:0/5 — every 5 minutes)

3. Update GET /api/replays/:sessionId:
   - If session.purgedAt is set: return 410 Gone with message "This session's replays have expired. Sessions are available for 1 hour after completion."

4. Write tests in services/video-pipeline/tests/test_session_cleanup.py:
   - Mock a session ended 61 minutes ago with files present
   - Assert: shutil.rmtree called for correct path
   - Assert: Session.purgedAt set
   - Assert: ClipJob paths nulled out
   - Mock a session ended 59 minutes ago — assert NOT cleaned up
   - Mock shutil.rmtree raising PermissionError — assert error logged but process continues to next session

Run the tests. They must pass.

Commit: "feat(lifecycle): 1-hour session cleanup worker with purge tracking"
```

---

### Prompt 64 — Full Integration Test: Enhanced Pipeline End-to-End

**Context:** All components of the enhanced pipeline are now built. This prompt runs a full end-to-end scenario test: a simulated 10-minute match on station 1 with 3 audio events, 1 game-analyzer event, and 1 FIFA replay detection. By the time the session ends, all clips should be DONE, the reel assembled, and the tablet showing the reel QR code. This is a smoke test — it uses mocked ffmpeg and hardware but real DB and real service logic.

```text
Read docs/WORKING-RULES.md and docs/SPEC.md.

Write a full integration test in services/video-pipeline/tests/test_pipeline_integration.py.

Setup:
- Use a real test PostgreSQL database (or SQLite if the project supports it)
- Mock all ffmpeg subprocess calls (just return exit code 0, touch the output file)
- Mock YuNet and FER ONNX (return one face, emotion="joy")
- Mock Africa's Talking SMS client
- Create a real Session row for station 1 with a webcam device configured

Scenario:
1. Session starts for station 1. Confirm MatchState row created.

2. Simulate audio detector: 3 PendingEvents written at T=0, T=5, T=25 (source="audio", type=CROWD_NOISE)

3. Run EventMerger.run_merge_cycle():
   - Assert: T=0 and T=5 merged into one ClipJob
   - Assert: T=25 is a separate ClipJob
   - Assert: 2 ClipJobs created, both PENDING

4. Simulate game analyzer: write PendingEvent at T=40 (source="game_analyzer", type=GAME_REPLAY)
   - Assert: 3rd ClipJob created

5. Simulate replay harvester: isReplayOnScreen=True for 12 seconds
   - Assert: 1 GameReplay row created with clipPath set

6. Run clip extractor for each ClipJob:
   - Assert: each job moves EXTRACTING → STITCHING
   - Assert: tvClipPath set on each job

7. Run stitch worker for each job:
   - Assert: each job moves STITCHING → AI_EFFECTS
   - Assert: stitchedClipPath set

8. Run AI effects worker for each job:
   - Assert: each job moves AI_EFFECTS → DONE
   - Assert: finalClipPath and portraitClipPath set

9. End the session (Session.status = COMPLETED, endTime = NOW())

10. Run reel assembler:
    - Assert: reel assembled, Session.reelPath set
    - Assert: WebSocket event replay:reel_ready emitted (mock the emitter)

11. Assert: cleanup worker does NOT purge (session ended < 1 hour ago)
    - Advance mock time by 61 minutes
    - Run cleanup — assert: session.purgedAt is set, directories deleted

All assertions must pass. Fix any issues found.

Commit: "test(integration): full enhanced pipeline end-to-end test — all stages green"
```

---

## Stage 11 Summary

| Prompt | What Gets Built |
|--------|----------------|
| 48 | DB schema: PendingEvent, ClipJob, GameReplay, MatchState + Station/Settings fields |
| 49 | TV ring buffer (tmpfs) with segment pruner and systemd units |
| 50 | Webcam 120fps capture + security camera capture services |
| 51 | YAMNet audio detector → PendingEvent + EventMerger → ClipJob + NOTIFY |
| 52 | Game stream analyzer at 240p/2fps (template match, OCR, event detection) |
| 53 | Stage 1 clip extraction worker (LISTEN/NOTIFY, FIFO, ffmpeg -c copy) |
| 54 | FIFA in-game replay harvester (isReplayOnScreen → extract clip automatically) |
| 55 | Stage 2 stitch worker (PiP overlay, Quick Sync encode, QSV → x264 fallback) |
| 56 | Caption library JSON (40+ entries, Sheng/Swahili) + context-aware selector |
| 57 | Stage 3 AI effects (YuNet faces, FER emotion, zoom, 2× slow-mo, captions, portrait) |
| 58 | Highlight reel assembly (title cards, transitions, QR frame, portrait reel) |
| 59 | Tablet UX: moments counter, reel-ready notification, QR code (no preview, no SMS) |
| 60 | PWA: portrait download option, live progress bar, reel download |
| 61 | Dashboard health: CPU temp, NVMe SMART, pipeline service status |
| 62 | Reliability: watchdog notify in workers, UPS shutdown script, temperature SMS |
| 63 | Storage lifecycle: 1-hour cleanup worker, 410 Gone on purged replays |
| 64 | Full integration test: end-to-end pipeline from event detection to reel assembly |

**Total new prompts: 17 (48–64)**
