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

## Stage 11: Enhanced Video Pipeline — Ring Buffer, Game Intelligence & AI Replays

> **Context for this stage:** Everything in Stages 4–10 is complete and working. This stage implements the enhanced capture and processing architecture defined in SPEC.md. **Every prompt must be executed with SPEC.md open** — field names, enum values, defaults, and endpoint paths must match SPEC exactly. Prompts are additive refactors of `services/video-pipeline/`; do not create parallel module trees.
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

### Prompt 47.5 — Stage 11 Setup: System Dependencies and AI Models

**Context:** Every Stage 11 prompt assumes a set of system packages, Python dependencies, and AI model files are already in place on the target host. None of them are installed by earlier stages. This setup prompt is a single prerequisite step that runs before Prompt 48.

```text
Read docs/WORKING-RULES.md and docs/SPEC.md (Video Pipeline Architecture — specifically Quick Sync, OCR, YAMNet, and YuNet references).

1. Add Python dependencies to services/video-pipeline/requirements.txt (create the file if absent):
   opencv-contrib-python
   onnxruntime
   numpy
   pytesseract
   Pillow
   qrcode[pil]
   sdnotify
   psycopg2-binary
   tflite-runtime

   Run: pip install -r services/video-pipeline/requirements.txt in the project's Python venv.

2. Document apt packages in services/video-pipeline/README.md (create or append):
   Required OS packages on the target host:
     sudo apt install -y \
       ffmpeg \
       tesseract-ocr \
       smartmontools \
       nut-client \
       fonts-dejavu-core \
       intel-media-va-driver-non-free

   Verification commands:
     ffmpeg -hwaccels 2>/dev/null | grep qsv    # must list qsv for h264_qsv encoder
     ffmpeg -muxers 2>/dev/null | grep segment  # must list segment muxer
     tesseract --version                        # must be >= 4.1

3. Create services/video-pipeline/models/ directory and a bootstrap script services/video-pipeline/models/download_models.sh:
   #!/bin/bash
   set -euo pipefail
   MODEL_DIR="$(dirname "$0")"

   # YAMNet audio classifier (quantized TFLite)
   #   Source: https://tfhub.dev/google/lite-model/yamnet/tflite/1
   #   Expected sha256: <fill in after first download; commit the hash>
   YAMNET_URL="https://storage.googleapis.com/tfhub-lite-models/google/lite-model/yamnet/tflite/1.tflite"
   YAMNET_FILE="$MODEL_DIR/yamnet.tflite"

   # YuNet face detector (built into OpenCV, but vendored here for reproducibility)
   #   Source: https://github.com/opencv/opencv_zoo/tree/main/models/face_detection_yunet
   YUNET_URL="https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx"
   YUNET_FILE="$MODEL_DIR/face_detection_yunet_2023mar.onnx"

   # FER MobileNet emotion classifier (ONNX)
   #   Source: https://github.com/onnx/models (emotion-ferplus)
   FER_URL="https://github.com/onnx/models/raw/main/validated/vision/body_analysis/emotion_ferplus/model/emotion-ferplus-8.onnx"
   FER_FILE="$MODEL_DIR/fer_mobilenet.onnx"

   download () {
     local url="$1" out="$2"
     if [[ ! -f "$out" ]]; then
       echo "Downloading $(basename "$out")..."
       curl -fL --retry 3 "$url" -o "$out"
     fi
   }

   download "$YAMNET_URL" "$YAMNET_FILE"
   download "$YUNET_URL" "$YUNET_FILE"
   download "$FER_URL" "$FER_FILE"

   echo "All models present in $MODEL_DIR:"
   ls -lh "$MODEL_DIR"/*.{tflite,onnx} 2>/dev/null || true

   Make it executable and run it once:
     chmod +x services/video-pipeline/models/download_models.sh
     services/video-pipeline/models/download_models.sh

   Record the sha256 hashes of each downloaded file in services/video-pipeline/models/SHA256SUMS.txt for integrity checking in CI/deploy.

4. Expose model paths via environment variables (documented in services/video-pipeline/README.md):
   YAMNET_MODEL_PATH (default services/video-pipeline/models/yamnet.tflite)
   YUNET_MODEL_PATH  (default services/video-pipeline/models/face_detection_yunet_2023mar.onnx)
   FER_MODEL_PATH    (default services/video-pipeline/models/fer_mobilenet.onnx)
   Prompts 51 and 57 must read these env vars — never hardcode the path.

5. No tests are required for this prompt — it is a prerequisite environment step. Verify manually that `ls services/video-pipeline/models/` shows all three files and `pip list | grep -Ei 'opencv|onnxruntime|psycopg2|sdnotify'` confirms Python deps.

Commit: "chore(stage-11): setup — apt deps, Python deps, AI model downloads"
```

---

### Prompt 48 — Database Schema: New Models and Fields

**Context:** The existing Prisma schema has `Station`, `Session`, `ReplayClip`, `Game`, and related models. This prompt adds all the new data models the enhanced pipeline needs. Nothing is deleted — only additions. The new models are: `PendingEvent` (raw audio/game event before merging), `ClipJob` (work queue entry for clip extraction), `GameReplay` (detected FIFA onscreen replay, later linked to a ClipJob), and `MatchState` (rolling OCR state per station). New fields are added to `Station` (webcam device paths) and `Settings` (pipeline tuning values). Three new enums are added: `EventType`, `EventSource`, and `ClipJobStatus`. **Every field name, type, default, and enum value must match SPEC.md §5 exactly** — diff against the spec before running the migration.

```text
Read docs/WORKING-RULES.md and docs/SPEC.md (Data Models section). Keep SPEC.md §5 open while editing schema.prisma.

Open apps/api/prisma/schema.prisma. Do not modify any existing models or enums. Add the following, matching SPEC.md §5 field-for-field:

1. New enum EventType (SPEC §5 PendingEvent.eventType):
   GOAL_CANDIDATE | PENALTY_MISS | RED_CARD | YELLOW_CARD | MATCH_END | SCORE_CHANGE

2. New enum EventSource (SPEC §5 PendingEvent.source):
   AUDIO_AI | GAME_ANALYZER | BOTH
   (BOTH = corroborated by both audio and game analyzer, highest confidence)

3. New enum ClipJobStatus (SPEC §5 ClipJob.status):
   PENDING | EXTRACTING | STITCHING | ENHANCING | DONE | FAILED

4. New model PendingEvent (SPEC §5):
   - id (Int, autoincrement PK)
   - sessionId (Int, FK → Session)
   - stationId (Int, FK → Station)
   - gameId (Int, FK → Game)
   - eventType (EventType)
   - eventTimestamp (Float) — unix epoch from audio AI or game analyzer
   - source (EventSource)
   - audioConfidence (Float)
   - matchMinute (Int?) — from OCR
   - homeScore (Int?) — from OCR at time of event
   - awayScore (Int?) — from OCR at time of event
   - mergedWithEventId (Int?) — FK → self, nullable; set if merged into a longer clip
   - processed (Boolean, default false)
   - createdAt (DateTime, default now)

5. New model ClipJob (SPEC §5):
   - id (Int, autoincrement PK)
   - sessionId (Int, FK → Session)
   - stationId (Int, FK → Station)
   - clipStart (Float) — unix epoch, window start
   - clipEnd (Float) — unix epoch, window end
   - eventTypes (String[]) — all event types merged into this clip
   - tvClipPath (String?)
   - webcamClipPath (String?)
   - gameReplayPath (String?) — if a FIFA onscreen replay overlaps this window
   - stitchedPath (String?) — Stage 2 output (matches SPEC name exactly)
   - enhancedPath (String?) — Stage 3 output (matches SPEC name exactly)
   - portraitPath (String?) — 9:16 portrait crop for sharing
   - status (ClipJobStatus, default PENDING)
   - enqueuedAt (DateTime, default now) — FIFO ordering key
   - priority (Int, default 0) — reserved for future manual override
   - errorMessage (String?)

6. New model GameReplay (SPEC §5 — detection record only, not a standalone clip):
   - id (Int, autoincrement PK)
   - stationId (Int, FK → Station)
   - sessionId (Int, FK → Session)
   - replayStart (Float) — unix epoch
   - replayEnd (Float) — unix epoch
   - detectedAt (DateTime, default now)
   - confidence (Float)
   - used (Boolean, default false) — flipped true once linked into a ClipJob.gameReplayPath
   
   Note: GameReplay does NOT store its own clip file. The clip extractor (Prompt 53) reads this row, finds overlapping ClipJobs, extracts the replay segment, and stores the path in ClipJob.gameReplayPath.

7. New model MatchState (SPEC §5 — rolling OCR state):
   - id (Int, autoincrement PK)
   - stationId (Int, FK → Station, unique)
   - capturedAt (DateTime, default now) — matches SPEC name (NOT "lastUpdated")
   - homeScore (Int, default 0)
   - awayScore (Int, default 0)
   - matchMinute (Int, default 0)
   - isReplayShowing (Boolean, default false) — matches SPEC name (NOT "isReplayOnScreen")
   - rawOcrText (String, default "") — for debugging OCR output

8. Add to Station model (SPEC §5):
   - webcamDevice (String?) — e.g. "/dev/video2"
   - analysisWebcamDevice (String?) — the 120fps Stage 3 camera; only set on the one slow-mo station

9. Add to Settings model (SPEC §5 — use these exact names and defaults):
   - replayTTLMinutes (Int, default 60)
   - yamnetConfidenceThreshold (Float, default 0.55)
   - tvRingBufferSeconds (Int, default 120)
   - clipPreRollSeconds (Int, default 10)
   - clipPostRollSeconds (Int, default 25)        ← 25, not 15
   - eventMergeWindowSeconds (Int, default 25)    ← 25, not 8
   - gameAnalysisEnabled (Boolean, default true)
   - replayDetectionThreshold (Float, default 0.80)
   - tensionAudioThreshold (Float, default 0.40) — RMS ratio for tension-based sensitivity boost
   - alertTempCelsius (Int, default 80)
   - alertSmsNumber (String, default "") — owner phone for temperature alerts
   
   (Optional additive feature flags — not in SPEC but harmless:
    audioDetectionEnabled Boolean default true, stage2Enabled Boolean default true, stage3Enabled Boolean default false)

10. Settings data migration: Prisma `default` only fires on insert. The existing seed row already has NULL for all new columns. In the same migration file, add an `UPDATE "Settings" SET ...` statement that seeds every new column with its SPEC default for any row where the column is NULL. This ensures Stage 11 code reads sensible values from row id=1 on day one.

After editing the schema, run:
   npx prisma migrate dev --name enhanced_video_pipeline

**Before migrating, manually diff each field above against SPEC.md §5 (name, type, default, enum).** If anything mismatches, fix the schema — do not fix the SPEC.

Then run:
   npx prisma generate

Write a short test file apps/api/src/services/__tests__/schema.test.ts that:
- Creates a MatchState record for station 1 (uses capturedAt, isReplayShowing)
- Creates a PendingEvent with eventType=GOAL_CANDIDATE, source=AUDIO_AI, eventTimestamp set
- Creates a ClipJob with clipStart/clipEnd, eventTypes=['GOAL_CANDIDATE']
- Creates a GameReplay with replayStart/replayEnd, confidence, used=false
- Reads them back and asserts the fields are correct
- Cleans up after itself

Run the test. It must pass before committing.

Commit: "feat(db): add PendingEvent, ClipJob, GameReplay, MatchState schema per SPEC §5"
```

---

### Prompt 49 — Capture Infrastructure: tmpfs Ring Buffer for TV Streams

**Context:** The TV capture service writes 2-second segments into a tmpfs (RAM) ring buffer mounted at `/run/lounge/`. Each station gets a subdirectory: `/run/lounge/tv1/`, `/run/lounge/tv2/`, etc. The ring buffer mechanism is **ffmpeg's built-in `-segment_wrap 60`** — after writing `seg_059.ts`, ffmpeg automatically overwrites `seg_000.ts`. No Python pruner, no separate pruner systemd unit, no Unix-timestamp filenames. See SPEC.md §7 (TV Streams) and line 898 ("auto-managed by ffmpeg `-segment_wrap 60`. No cleanup needed").

This prompt must **refactor the existing `services/video-pipeline/` directory** (already scaffolded in Stage 9). It must NOT create a parallel `services/pipeline/` tree. Read what already exists before making changes.

**System dependencies:** ffmpeg with the segment muxer enabled (standard in Debian/Ubuntu `ffmpeg` package). Verify `ffmpeg -muxers 2>/dev/null | grep segment` on the target host.

```text
Read docs/WORKING-RULES.md and docs/SPEC.md (Video Pipeline Architecture section and the Storage Layout section). Also read every existing file under services/video-pipeline/capture/ before editing — do not create parallel modules.

1. Update/refactor services/video-pipeline/capture/ring_buffer.py (create if absent):
   - Class RingBuffer(station_id, buffer_dir)
   - Segment filenames are sequence numbers: seg_000.ts through seg_059.ts (ffmpeg -segment_wrap 60)
   - No prune() method — ffmpeg overwrites automatically.
   - Method get_segments_in_window(start_dt, end_dt) -> list[Path]:
     Read the mtime of every seg_NNN.ts in the buffer dir, sort by mtime ASC,
     return the sublist whose mtime falls within [start_dt, end_dt].
     Use mtime (not filename) for time mapping because sequence numbers wrap.
   - Method get_segment_for_time(dt) -> Path | None: return the single segment whose mtime covers dt.
   - Method list_current_segments() -> list[tuple[Path, float]]: helper returning (path, mtime) pairs.

2. Update services/video-pipeline/capture/ (tv capture module — use the existing file if one exists; name it tv_capture.py):
   - Output directory: /run/lounge/tv{station_id}/ (create with mkdir -p at startup)
   - ffmpeg command (matches SPEC §7 exactly):
       ffmpeg -hide_banner -loglevel warning \
         -rtsp_transport tcp -i rtsp://tv{station_id}.local/stream \
         -c copy \
         -f segment \
         -segment_time 2 \
         -segment_format mpegts \
         -segment_wrap 60 \
         -reset_timestamps 1 \
         /run/lounge/tv{station_id}/seg_%03d.ts
   - No transcoding. No custom pruning logic.
   - On SIGTERM: send SIGTERM to ffmpeg, wait up to 5s, then SIGKILL.

3. **Delete any existing pruner.py and pruner systemd unit.** If services/video-pipeline/capture/pruner.py exists (from an earlier draft), remove it and its test file. If services/video-pipeline/capture/systemd/neo-lounge-ring-pruner.service exists, remove it.

4. Create/update services/video-pipeline/capture/systemd/neo-lounge-tv-capture@.service:
   - Template unit (instance = station number)
   - ExecStart runs the tv_capture module for that station
   - Restart=always, RestartSec=3
   - WatchdogSec=30
   - After=network.target

5. Create the tmpfs mount documentation. Add a README or inline comment in services/video-pipeline/capture/README.md explaining:
   - /run/lounge must be a tmpfs mount (size ≈ 300 MiB — 4 streams × 15 Mbps × 120s ≈ 225 MiB + headroom)
   - Example /etc/fstab line: tmpfs /run/lounge tmpfs defaults,size=300M 0 0
   - Or leave it as the default tmpfs at /run with a subdirectory — Debian /run is already tmpfs

6. Refactor/remove tests:
   - services/video-pipeline/tests/test_ring_buffer.py: remove any prune() tests. Add/keep tests for get_segments_in_window() using os.utime to set mtimes, and assert ordering by mtime is correct even when filename sequence wraps (e.g. seg_058.ts written AFTER seg_000.ts).

Run the tests. They must pass.

Commit: "feat(capture): ffmpeg -segment_wrap TV ring buffer in tmpfs (no pruner)"
```

---

### Prompt 50 — Capture Infrastructure: Webcam and Security Camera Services

**Context:** Webcam footage goes to NVMe (not RAM) because it's larger and doesn't need instant-overwrite semantics. **Only one webcam runs at 120fps** — the Station 4 (or whichever Station row has `analysisWebcamDevice` set) Stage 3 slow-mo camera. Stations 1–3 capture at 720p 60fps. See SPEC.md §7 Webcam Streams: "Station 1-3: 720p 60fps. Station 4: 720p 120fps (Stage 3 slow-mo cam)". Security cameras use 300-second segments. This prompt refactors the existing `services/video-pipeline/security/recorder.py` module rather than creating a parallel `security_capture.py`.

```text
Read docs/WORKING-RULES.md and docs/SPEC.md (Video Pipeline Architecture → Webcam Streams and Security Cameras subsections). Also read services/video-pipeline/security/recorder.py before editing — refactor in place.

1. Create services/video-pipeline/capture/webcam_capture.py:
   - Reads STATION_ID from environment at startup.
   - At startup AND whenever the active session changes: query the API
     (GET /api/stations/:id) to read `webcamDevice` and `analysisWebcamDevice`
     from the Station row. Do not read devices from environment.
   - Frame rate selection per SPEC §7:
       if this station's Station row has analysisWebcamDevice set (the Stage 3 slow-mo cam):
         framerate = 120
       else:
         framerate = 60
   - ffmpeg command:
       ffmpeg -hide_banner -loglevel warning \
         -f v4l2 -input_format h264 \
         -video_size 1280x720 -framerate {framerate} \
         -i {webcamDevice} \
         -c copy \
         -f segment \
         -segment_time 10 \
         -segment_format mpegts \
         -strftime 1 \
         /var/lounge/webcam{station_id}/seg_%Y%m%d_%H%M%S.ts
   - Session-aware: poll GET /api/sessions/active?stationId=X every 5s.
     Start ffmpeg when a session becomes active; on session end, SIGTERM ffmpeg
     but continue recording for an additional 60 seconds first — this gives the
     MATCH_END synthetic event (see Prompt 51) a complete post-roll window.
   - When no session is active: idle (no ffmpeg running).

2. Refactor services/video-pipeline/security/recorder.py (do not create a new security_capture.py):
   - Reads camera list from /etc/lounge/cameras.json (array of {id, rtsp_url, label}).
   - Output directory: /var/lounge/sec/cam{camera_id}/ (matches SPEC §7).
   - ffmpeg command (per SPEC §7):
       ffmpeg -hide_banner -loglevel warning \
         -rtsp_transport tcp -i {rtsp_url} \
         -c copy \
         -f segment \
         -segment_time 300 \
         -segment_format mpegts \
         -strftime 1 \
         /var/lounge/sec/cam{camera_id}/seg_%Y%m%d_%H%M%S.ts
   - Runs continuously regardless of session state.
   - Retention: delete segments older than Settings.securityRetentionDays (default 14) — read at startup, refresh every 60 minutes. Do not hardcode.
   - Update/remove any previous router registration for the old recorder.

3. Create systemd units:
   - services/video-pipeline/capture/systemd/neo-lounge-webcam@.service (template, instance = station id)
   - services/video-pipeline/security/systemd/neo-lounge-security-cam@.service (template, instance = camera id)
   - Both: Restart=always, RestartSec=3, WatchdogSec=30, After=network.target

4. Write tests in services/video-pipeline/tests/test_webcam_capture.py:
   - Mock the ffmpeg subprocess and API calls.
   - Assert: a station with analysisWebcamDevice set builds the ffmpeg command with -framerate 120.
   - Assert: a station WITHOUT analysisWebcamDevice builds with -framerate 60.
   - Assert: correct output path /var/lounge/webcam{N}/seg_*.ts used.
   - Assert: on session end, ffmpeg keeps running for ~60 additional seconds before SIGTERM.
   - Assert: when no active session, ffmpeg is not running.

Also update/replace tests for the refactored security recorder so they test the new retention-from-Settings behaviour.

Run the tests. They must pass.

Commit: "feat(capture): webcam (60fps default, 120fps slow-mo cam) + security recorder refactor"
```

---

### Prompt 51 — Audio Event Detector: YAMNet + EventMerger + Corroboration + MATCH_END

**Context:** Two responsibilities:
(1) YAMNet detector writes raw `PendingEvent` rows (source=`AUDIO_AI`) using the SPEC §5 field names (`eventTimestamp` as unix epoch float, `eventType` as the SPEC enum, `audioConfidence`).
(2) `EventMerger` periodically scans PendingEvents for a session, merges events on the same station within `eventMergeWindowSeconds` (default **25s** per SPEC §5), **corroborates** audio and game-analyzer events that land within the same window (resulting source=`BOTH`), creates `ClipJob` rows with `clipStart`/`clipEnd` computed up front, and issues `NOTIFY clip_jobs_channel`. It also injects a synthetic `MATCH_END` event at session end.

This prompt must refactor the existing `services/video-pipeline/detection/` modules (detector.py, pipeline.py) rather than creating a parallel `audio/` directory. Read them first.

```text
Read docs/WORKING-RULES.md and docs/SPEC.md (Video Pipeline → Audio Detection, Game Stream Analysis → Event Corroboration, and the EventMerger + Edge Cases subsections). Read services/video-pipeline/detection/*.py before editing — refactor in place.

1. Refactor services/video-pipeline/detection/detector.py (YAMNet):
   - Keep YAMNet inference as-is (quantized TFLite model).
   - Replace DB write logic:
     INSERT INTO "PendingEvent"
       (sessionId, stationId, gameId, eventType, eventTimestamp, source, audioConfidence, matchMinute, homeScore, awayScore, processed, createdAt)
     VALUES ($1, $2, $3, $4::"EventType", $5, 'AUDIO_AI'::"EventSource", $6, $7, $8, $9, false, NOW())
   - eventTimestamp is unix epoch float (time.time() at detection).
   - Map YAMNet labels → SPEC EventType enum (GOAL_CANDIDATE for crowd roars, RED_CARD/YELLOW_CARD if card-specific profiles fire, etc.). When unsure, use GOAL_CANDIDATE.
   - Read Settings.yamnetConfidenceThreshold (default 0.55) and Settings.tensionAudioThreshold (default 0.40) at startup, refresh every 60s. Do not hardcode any threshold.
   - Tension sensitivity boost: if MatchState.matchMinute >= 80 OR |homeScore-awayScore| <= 1, reduce yamnetConfidenceThreshold by 0.05 for that station.
   - Populate matchMinute, homeScore, awayScore from the latest MatchState row for the station.
   - Log detected event type and audioConfidence at INFO level.

2. Refactor services/video-pipeline/detection/pipeline.py into an EventMerger class:
   - Class EventMerger(db_conn)
   - Reads eventMergeWindowSeconds, clipPreRollSeconds, clipPostRollSeconds from Settings at startup; refresh every 60s. Never hardcode.
   - Method run_merge_cycle():
     a. Query unprocessed events for the last 5 minutes:
        SELECT ... FROM "PendingEvent"
        WHERE processed = false AND mergedWithEventId IS NULL
          AND eventTimestamp > EXTRACT(EPOCH FROM NOW() - INTERVAL '5 minutes')
        ORDER BY stationId, eventTimestamp ASC
     b. Group by (stationId, sessionId). Within each group, single-pass merge: if
        event[i+1].eventTimestamp - event[i].eventTimestamp <= eventMergeWindowSeconds,
        set event[i+1].mergedWithEventId = event[i].id (transitively to the merge root).
     c. **Corroboration (SPEC §8 Event Corroboration):** when merging, if two merged events have different `source` values (AUDIO_AI vs GAME_ANALYZER), set the merge-root's source to BOTH and boost audioConfidence to max(boost, 0.95).
     d. For each merge-root event, compute:
        clipStart = min(eventTimestamp in cluster) - clipPreRollSeconds
        clipEnd   = max(eventTimestamp in cluster) + clipPostRollSeconds
        eventTypes = distinct list of eventType values in cluster
     e. Insert one ClipJob per cluster:
        INSERT INTO "ClipJob"
          (sessionId, stationId, clipStart, clipEnd, eventTypes, status, enqueuedAt, priority)
        VALUES ($1, $2, $3, $4, $5, 'PENDING', NOW(), 0)
        ON CONFLICT DO NOTHING (idempotency guard: add a partial unique index on (sessionId, stationId, clipStart, clipEnd) in the Prompt 48 migration, OR check for overlap before inserting).
     f. Mark all covered PendingEvents: UPDATE "PendingEvent" SET processed=true WHERE id = ANY($ids)
     g. NOTIFY clip_jobs_channel, '{stationId}';
   - Method start(interval_seconds=3): loop.

3. **MATCH_END synthetic event** (SPEC §9 Edge Cases):
   Add to apps/api/src/routes/sessions.ts (or wherever session end is handled):
   When a session transitions to COMPLETED, insert one final PendingEvent for that session:
     eventType = MATCH_END
     eventTimestamp = epoch of session.endTime
     source = GAME_ANALYZER
     audioConfidence = 1.0
     preRoll/postRoll not stored per-event; EventMerger will use Settings defaults, giving a ~10s-before / ~25s-after window. (SPEC specifies a 60s webcam tail — the webcam capture service from Prompt 50 provides that separately.)
   This ensures the EventMerger picks up the event on its next cycle and creates a final ClipJob. Webcam capture in Prompt 50 keeps recording for 60s after session end so the post-roll window has footage.

4. Refactor services/video-pipeline/detection/ systemd (or create under services/video-pipeline/systemd/):
   - neo-lounge-audio-detector@.service (template, instance = station)
   - neo-lounge-event-merger.service (single instance)
   - Update/remove any old detector router registrations.

5. Write/update tests in services/video-pipeline/tests/test_event_merger.py:
   - Merge window test with merge_window_seconds=25:
     A at T=0, B at T=10, C at T=40 → A+B merge (gap=10<25), C separate. Assert 2 ClipJobs.
   - Assert ClipJob.clipStart = A.eventTimestamp - 10, clipEnd = B.eventTimestamp + 25.
   - Corroboration test: A (AUDIO_AI, T=5), B (GAME_ANALYZER, T=7). Assert merged root has source=BOTH.
   - Idempotency: running run_merge_cycle() twice produces no duplicate ClipJobs.
   - MATCH_END test: simulate session end hook, run merger, assert a ClipJob exists with eventTypes including 'MATCH_END'.
   - All settings values must be read from a mocked Settings fetch — assert no hardcoded 25 / 10 in the production path.

Run the tests. They must pass.

Commit: "feat(audio): YAMNet PendingEvents + EventMerger with corroboration and MATCH_END"
```

---

### Prompt 52 — Game Stream Analyzer

**Context:** Each TV station gets a secondary low-resolution ffmpeg pipe at **320×240** and 2fps (SPEC §7 game analysis streams). A Python process reads frames from this pipe and runs: (1) template matching for FIFA replay banner and red/yellow cards, (2) OCR on score/timer regions, (3) frame differencing for goal flashes. When it detects a significant event it writes a `PendingEvent` with `source=GAME_ANALYZER` using SPEC §5 field names, and updates `MatchState`. The `isReplayShowing` transition is the trigger for FIFA replay harvesting (Prompt 54).

```text
Read docs/WORKING-RULES.md and docs/SPEC.md (Video Pipeline → Game Analysis Streams, and Game Stream Analysis section). Resolution is 320×240 — not 427×240. Field names in MatchState are `isReplayShowing` and `capturedAt` (not "isReplayOnScreen"/"lastUpdated").

1. Create services/video-pipeline/game_analyzer/frame_reader.py:
   - Class FrameReader(station_id, video_source)
   - ffmpeg subprocess:
       ffmpeg -i {video_source} -vf scale=320:240 -r 2 -f rawvideo -pix_fmt bgr24 pipe:1
   - Reads frames: each frame = 240 * 320 * 3 bytes
   - Yields numpy arrays of shape (240, 320, 3)
   - Handles pipe EOF gracefully (restart after 2s delay)

2. Create services/video-pipeline/game_analyzer/detectors.py:
   - detect_replay_banner(frame) -> float:
     Template match against assets/templates/replay_banner_320x240.png; return confidence score.
     Caller compares against Settings.replayDetectionThreshold (default 0.80).
   - detect_card_flash(frame) -> str | None:
     HSV threshold for large red/yellow blob in centre-right of the 320×240 frame.
     Return "red" | "yellow" | None.
   - detect_goal_flash(frame, prev_frame) -> bool:
     Mean absolute difference > 40 → True.
   - extract_score_and_minute(frame) -> tuple[str, str]:
     Crop the top-centre score/timer region appropriate for 320×240 (e.g. y=10:40, x=110:210 —
     tune against a real FIFA screenshot). Run pytesseract with
       --psm 7 -c tessedit_char_whitelist=0123456789:-
     Return (score_string, minute_string), empty strings on OCR failure.
     Also store the raw OCR text for writing into MatchState.rawOcrText.

3. Create services/video-pipeline/game_analyzer/analyzer.py:
   - Class GameAnalyzer(station_id, db_conn, video_source)
   - Reads Settings.replayDetectionThreshold at startup and refreshes every 60s.
   - Maintains prev_frame and a per-event-type debounce timestamp (20s window).
   - Main loop: read frame → run detectors → act:
     - On detect_replay_banner >= threshold and MatchState.isReplayShowing was False:
         UPDATE MatchState SET isReplayShowing=true, capturedAt=NOW(), rawOcrText=...
         INSERT into GameReplay (stationId, sessionId, replayStart=time.time(), replayEnd=time.time(), detectedAt=NOW(), confidence=<score>, used=false)
         (replayEnd is refreshed on exit transition.)
     - On detect_replay_banner < threshold and previously True:
         UPDATE MatchState SET isReplayShowing=false, capturedAt=NOW()
         UPDATE the most recent unused GameReplay row for this station: replayEnd = time.time()
     - On detect_card_flash == "red" (debounced): write PendingEvent with
         eventType=RED_CARD, source=GAME_ANALYZER, eventTimestamp=time.time(), audioConfidence=0.0
     - On detect_card_flash == "yellow" (debounced): write PendingEvent with eventType=YELLOW_CARD.
     - On detect_goal_flash=True (debounced): write PendingEvent with eventType=GOAL_CANDIDATE.
     - On OCR extract: parse scores/minute. UPDATE MatchState(homeScore, awayScore, matchMinute, capturedAt, rawOcrText).
       If homeScore or awayScore changed: write PendingEvent with eventType=SCORE_CHANGE, matchMinute set, homeScore/awayScore set.
   - Populate matchMinute, homeScore, awayScore on every PendingEvent insert from the current MatchState row.
   - Log each detected event at INFO with station_id and eventTimestamp.

4. Create services/video-pipeline/game_analyzer/systemd/neo-lounge-game-analyzer@.service (template, instance = station).

5. Write tests in services/video-pipeline/tests/test_detectors.py:
   - Synthetic 240×320 red blob frame → detect_card_flash returns "red"
   - Two identical frames → detect_goal_flash False
   - Frame vs all-white → detect_goal_flash True
   - Mock pytesseract: extract_score_and_minute parses "2:1" and "43"
   - Confirm frame arrays have shape (240, 320, 3) in all tests.

Run the tests. They must pass.

Commit: "feat(analyzer): 320x240 game stream analysis with SPEC event types"
```

---

### Prompt 53 — Clip Extraction Worker (Stage 1)

**Context:** Core of Stage 1. A Python worker listens on `clip_jobs_channel` and processes the oldest PENDING ClipJob (FIFO). It reads `clipStart`/`clipEnd` **directly from the ClipJob row** (written by the EventMerger in Prompt 51 — no need to re-derive from event IDs). It extracts the TV clip from the ring buffer with `ffmpeg -f concat -c copy`, extracts the overlapping webcam window, and if a GameReplay row exists whose `replayStart`/`replayEnd` overlaps the window it extracts that FIFA in-game replay into `ClipJob.gameReplayPath` and flips `GameReplay.used = true`. Refactor existing `services/video-pipeline/capture/clips.py`; do not create a parallel `workers/` tree unless the existing file is too different in shape to adapt.

```text
Read docs/WORKING-RULES.md and docs/SPEC.md (Video Pipeline → Clip Processing Queue). Read services/video-pipeline/capture/clips.py before editing.

1. Update services/video-pipeline/capture/clips.py (or move to services/video-pipeline/workers/clip_extractor.py if structurally cleaner — but delete the old file if so):

   a. Startup: psycopg2 connection, LISTEN clip_jobs_channel.
   b. Main loop: block on select() with 30s timeout (for watchdog keepalive + sd_notify WATCHDOG=1); on NOTIFY call process_next_job().
   
   c. process_next_job():
      - SELECT * FROM "ClipJob" WHERE status='PENDING' ORDER BY enqueuedAt ASC LIMIT 1 FOR UPDATE SKIP LOCKED
      - If none: return.
      - UPDATE status='EXTRACTING'
      - tvPath = extract_tv_clip(job)
      - webcamPath = extract_webcam_clip(job)   # may be None
      - gameReplayPath = maybe_extract_game_replay(job)  # may be None
      - UPDATE tvClipPath, webcamClipPath, gameReplayPath, status='STITCHING'
      - NOTIFY stitch_jobs_channel, '{job.id}';
      - On any exception: UPDATE status='FAILED', errorMessage=str(e); ERROR log.

   d. extract_tv_clip(job):
      - windowStart = job.clipStart (already a unix epoch float from the row)
      - windowEnd = job.clipEnd
      - segments = RingBuffer(job.stationId, '/run/lounge/tv'+str(job.stationId)).get_segments_in_window(windowStart, windowEnd)
      - If segments is empty: raise RuntimeError("ring buffer miss — segments overwritten before extraction")
      - Write concat list to /tmp/concat_tv_{job.id}.txt
      - Run: ffmpeg -f concat -safe 0 -i /tmp/concat_tv_{job.id}.txt -c copy /var/lounge/sessions/{job.sessionId}/clips/tv_{job.id}.ts
      - verify_clip(output, min_duration=3.0). Return path.

   e. extract_webcam_clip(job):
      - Source dir: /var/lounge/webcam{job.stationId}/
      - Get segments overlapping [clipStart, clipEnd] by mtime.
      - **Partial coverage handling:** if NO segments overlap at all → log WARN "no webcam coverage for clipJob {id}" and return None.
        If SOME segments overlap but the leading pre-roll is not covered (e.g. clip begins near session start), clamp the start of the window to the earliest available segment, log WARN "partial webcam coverage ({missing}s missing from pre-roll)", and still extract what's available. Do not abort.
      - ffmpeg -f concat -c copy → /var/lounge/sessions/{sessionId}/clips/webcam_{job.id}.ts
      - verify_clip with min_duration=2.0 (partial clips may be shorter). Return path or None.

   f. maybe_extract_game_replay(job):
      - SELECT * FROM "GameReplay" WHERE sessionId=$1 AND stationId=$2 AND used=false
        AND NOT (replayEnd < $3 OR replayStart > $4) LIMIT 1
        (with $3=job.clipStart, $4=job.clipEnd)
      - If none: return None.
      - segments = RingBuffer segments for [replayStart, replayEnd]
      - If segments empty: log WARN and return None (do not fail the whole job).
      - ffmpeg concat → /var/lounge/sessions/{sessionId}/clips/gamereplay_{job.id}.ts
      - verify_clip(min_duration=2.0)
      - UPDATE GameReplay SET used=true WHERE id=<row.id>
      - Return path.

2. Helper services/video-pipeline/workers/ffprobe_utils.py (create if absent):
   - get_duration(path) -> float
   - verify_clip(path, min_duration) -> bool

3. systemd unit services/video-pipeline/systemd/neo-lounge-clip-extractor.service:
   - Single instance, WatchdogSec=30, Restart=always.

4. Tests services/video-pipeline/tests/test_clip_extractor.py:
   - Mock ffmpeg subprocess, ffprobe, RingBuffer, and DB.
   - Assert FOR UPDATE SKIP LOCKED used.
   - Assert the worker reads clipStart/clipEnd directly from the row (does NOT SELECT PendingEvents to derive the window).
   - Ring-buffer-empty → job set to FAILED.
   - Webcam partial coverage → WARN logged, clip still produced.
   - No webcam coverage → webcamClipPath=None, job still proceeds to STITCHING.
   - Overlapping GameReplay row → gameReplayPath set, GameReplay.used flipped to true.

Run the tests. They must pass.

Commit: "feat(worker): Stage 1 clip extractor with gameReplayPath link and partial-coverage webcam"
```

---

### Prompt 54 — FIFA Replay Detection Finalization (no standalone extraction)

**Context:** Per SPEC §5, `GameReplay` is a **detection record only** — it stores `replayStart`/`replayEnd`/`confidence`/`used` and nothing more. The game analyzer (Prompt 52) already creates and finalizes GameReplay rows on `isReplayShowing` transitions. The clip extractor (Prompt 53) reads those rows and pulls the overlapping segment into `ClipJob.gameReplayPath`, then flips `used=true`. There is **no standalone harvester writing its own files** — FIFA replays only exist inside a ClipJob.

This prompt's job is the small bit of plumbing that ensures a GameReplay without any overlapping event still gets surfaced: if an in-game replay was detected but no PendingEvent landed in its window, the system should create a synthetic ClipJob for the replay alone so the highlight reel can include it.

```text
Read docs/WORKING-RULES.md and docs/SPEC.md (Video Pipeline → Game Stream Analysis + Clip Processing Queue + Data Models §5 GameReplay).

This prompt is intentionally small — most of the work is already done in Prompts 51, 52, 53.

1. Add to services/video-pipeline/detection/pipeline.py (EventMerger) a new method `sweep_orphan_game_replays()`:
   - Query: SELECT * FROM "GameReplay" WHERE used=false AND replayEnd < EXTRACT(EPOCH FROM NOW()) - 10
     AND confidence >= (SELECT replayDetectionThreshold FROM "Settings" WHERE id=1)
     (i.e. detection has closed and had 10s grace for normal clip extraction to claim it)
   - For each orphan row, create a ClipJob covering just the replay window:
     clipStart = replayStart - clipPreRollSeconds
     clipEnd   = replayEnd + clipPostRollSeconds
     eventTypes = ['GAME_REPLAY_ORPHAN']  (not in EventType enum — keep as string tag only in eventTypes array)
     Insert with ON CONFLICT DO NOTHING against the same uniqueness guard.
   - NOTIFY clip_jobs_channel.
   - Do not mark GameReplay.used here — the clip extractor will flip it when it actually extracts.
   - Call sweep_orphan_game_replays() at the end of each run_merge_cycle().

2. Remove any previously drafted replay_harvester.py file and its systemd unit + tests (if they exist from an earlier draft).

3. Tests: append to services/video-pipeline/tests/test_event_merger.py:
   - Simulate: GameReplay row with replayStart/replayEnd set, used=false, no PendingEvent overlap.
   - Advance clock 15s past replayEnd, call sweep_orphan_game_replays.
   - Assert: exactly one ClipJob created, clipStart=replayStart-preRoll, clipEnd=replayEnd+postRoll.
   - Running sweep again produces no duplicate (ON CONFLICT guard + "used" will flip later).

Run the tests. They must pass.

Commit: "feat(pipeline): orphan GameReplay sweeper creates ClipJobs for uncorroborated replays"
```

---

### Prompt 55 — Stage 2 Stitch Worker: TV + Webcam PiP + FIFA Replay Concat

**Context:** Stitch worker listens on `stitch_jobs_channel`. For each ClipJob it composites the TV clip + webcam clip as a picture-in-picture MP4. If `ClipJob.gameReplayPath` is populated (FIFA in-game replay detected in the window), the FIFA replay is concatenated onto the end of the stitched clip as a bonus segment. Output uses Quick Sync (`h264_qsv`) with an `libx264` fallback. On success, status becomes `ENHANCING` (if `stage3Enabled`) or `DONE` (otherwise). Refactor `services/video-pipeline/capture/stitcher.py` — do not create a parallel worker.

```text
Read docs/WORKING-RULES.md and docs/SPEC.md (Video Pipeline → Replay Processing Stage 2). Read services/video-pipeline/capture/stitcher.py first and refactor in place.

1. Update services/video-pipeline/capture/stitcher.py (or move to workers/stitch_worker.py; if moved, delete the old file):

   a. Startup: LISTEN stitch_jobs_channel. sd_notify ready + watchdog.

   b. process_next_stitch():
      SELECT * FROM "ClipJob" WHERE status='STITCHING'
      ORDER BY enqueuedAt ASC LIMIT 1 FOR UPDATE SKIP LOCKED

   c. stitch(job):
      If job.webcamClipPath and exists → PiP composite:
        ffmpeg -i {tvClipPath} -i {webcamClipPath} \
          -filter_complex "[0:v]scale=1280:720[tv];[1:v]scale=320:180[cam];[tv][cam]overlay=W-w-20:H-h-20[out]" \
          -map "[out]" -map 0:a \
          -c:v h264_qsv -preset fast -b:v 3M \
          -c:a aac -b:a 128k \
          /tmp/stitched_{job.id}_base.mp4
      Else (no webcam, partial coverage, or file missing):
        ffmpeg -i {tvClipPath} -c copy /tmp/stitched_{job.id}_base.mp4

      If h264_qsv returns non-zero: retry with `-c:v libx264 -preset fast -crf 23`.

      If job.gameReplayPath exists:
        Write concat list: base + gameReplay.
        ffmpeg -f concat -safe 0 -i /tmp/concat_{job.id}.txt -c copy \
          /var/lounge/sessions/{sessionId}/clips/stitched_{job.id}.mp4
      Else:
        mv /tmp/stitched_{job.id}_base.mp4 /var/lounge/sessions/{sessionId}/clips/stitched_{job.id}.mp4

      verify_clip(min_duration=3.0). On failure → FAILED.

      Read Settings.stage3Enabled.
      If true:
        UPDATE ClipJob SET stitchedPath={path}, status='ENHANCING'
        NOTIFY ai_effects_channel, '{job.id}';
      Else:
        UPDATE ClipJob SET stitchedPath={path}, enhancedPath={path}, status='DONE'
        Upsert a ReplayClip row (keyed on clipJobId) with filePath={path}.
        Emit WebSocket replay:clip_ready to the session room (via the API).
        Call check_session_all_ready(sessionId) (see step 3).

2. systemd unit services/video-pipeline/systemd/neo-lounge-stitch-worker.service (single instance).

3. Shared helper services/video-pipeline/workers/completion.py:
   - Function check_session_all_ready(db, session_id):
     If count of ClipJobs WHERE sessionId=$1 AND status NOT IN ('DONE','FAILED') == 0
     AND at least one job is DONE:
       Call the API (POST internal endpoint or emit via a small socket client) to emit `replay:all_ready` to the session room exactly once per session.
     Implement a guard row (e.g. set Session.allReadyEmitted=true) or use an API endpoint that is itself idempotent.
   This function is also called from the AI effects worker (Prompt 57).

4. Tests services/video-pipeline/tests/test_stitch_worker.py:
   - webcam present → filter_complex includes overlay args.
   - webcam absent → remux-only path.
   - gameReplayPath present → concat list includes replay segment.
   - h264_qsv failure → libx264 fallback attempted.
   - verify_clip fail → job FAILED.
   - stage3Enabled=false → job ends at DONE and check_session_all_ready is called.
   - stage3Enabled=true → job ends at ENHANCING and ai_effects_channel NOTIFY issued.

Run the tests. They must pass.

Commit: "feat(worker): Stage 2 stitch worker with gameReplay concat and all_ready emission"
```

---

### Prompt 56 — Caption Library: JSON Structure and Selection Logic

**Context:** Before building Stage 3 AI effects, we need the caption library in place because the AI effects worker will call into it. The library is a JSON file of 1000+ caption entries. Each entry has a context tag (goal, miss, card, celebration, equaliser, etc.), an emotion tag (shock, joy, despair, etc.), optional conditions (matchMinute range, scoreDelta range), and the caption text in English and Sheng/Swahili. The selection function takes the current MatchState and detected emotion and returns the most contextually appropriate caption.

```text
Read docs/WORKING-RULES.md and docs/SPEC.md (Caption Library section under Replay Processing). The 40 captions written here are the **seed set** — the full library will grow to ~1000 entries over time. This prompt establishes the structure and high-frequency seed content; do not treat 40 as the final target.

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

**Context:** CPU-intensive final processing stage. Takes the stitched MP4 from Stage 2 and produces an enhanced clip: (1) YuNet face detection on sampled webcam-PiP frames, (2) FER MobileNet emotion classification, (3) caption selection, (4) rebuild with zoom on the peak face region, (5) real 2× slow-mo derived from the 120fps Station 4 webcam source — **only** when `job.stationId` matches the configured slow-mo station (the one whose `analysisWebcamDevice` is set); otherwise fall back to `minterpolate` fake slow-mo or skip slow-mo entirely, (6) burn in caption text, (7) produce both 16:9 landscape and 9:16 portrait outputs.

**Critical math:** `setpts=2.0*PTS` *slows* video down (doubles presentation timestamps). `setpts=0.5*PTS` *speeds it up*. SPEC §11 uses `2.0*PTS` everywhere. Do not invert this.

```text
Read docs/WORKING-RULES.md and docs/SPEC.md (Video Pipeline → Replay Processing → Stage 3). Slow-mo filter is setpts=2.0*PTS. The slow-mo source requirement is the 120fps webcam on the one station whose Station.analysisWebcamDevice is set — per-station check, not global.

1. Create services/video-pipeline/workers/ai_effects_worker.py:

   a. Startup: LISTEN ai_effects_channel;
   
   b. process_next_ai_job():
      - SELECT ClipJob WHERE status='ENHANCING' ORDER BY enqueuedAt ASC LIMIT 1 FOR UPDATE SKIP LOCKED
      - Call apply_ai_effects(job)

   c. apply_ai_effects(job):
      input_path = job.stitchedPath
      output_landscape = /var/lounge/sessions/{sessionId}/clips/final_{job.id}.mp4
      output_portrait  = /var/lounge/sessions/{sessionId}/clips/final_{job.id}_portrait.mp4
      
      Look up Station: is this station the slow-mo station? (Station.analysisWebcamDevice IS NOT NULL)
      slow_mo_enabled = bool(station.analysisWebcamDevice)
      
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
        Load MatchState for this station from DB (use capturedAt, isReplayShowing — the SPEC names).
        context = map job event type to caption context
          GOAL_CANDIDATE → "goal"
          PENALTY_MISS   → "miss"
          RED_CARD       → "card_red"
          YELLOW_CARD    → "card_yellow"
          SCORE_CHANGE   → "goal"  (covers OCR-confirmed scoring)
          MATCH_END      → "match_end"
          default        → "generic"
        emotion = dominant emotion from Step 3 (or "neutral" if no faces)
        caption = select_caption(captions, context, emotion, match_state)
      
      Step 5 — Build ffmpeg command.
        Determine zoom mode:
          - 2+ faces detected → split-screen: zoom both face regions side-by-side
          - 1 face → single face zoom centred on the peak_frame face_x
          - 0 faces → full frame, no zoom
        
        Two-pass approach for clarity:
        
        Pass A — Base enhance (landscape, 1280×720):
          If slow_mo_enabled (this station has analysisWebcamDevice set → source is 120fps webcam PiP):
            Use setpts=2.0*PTS on the video stream (slows playback to half speed — real 2× slow-mo).
            Output at -r 60 so the perceived frame rate is correct.
          Else:
            No setpts filter (normal playback), or optional minterpolate at 60fps for a fake-slow visual.
          
          Then apply the zoom filter as a separate ffmpeg step (not chained with setpts in one graph):
            crop then scale on the face region.
          
          Then drawtext burns in the caption:
            drawtext=fontfile=<caption_font_path>:text='<escaped caption text>':fontsize=36:fontcolor=white:box=1:boxcolor=black@0.5:x=(w-text_w)/2:y=h-80
          
          Output: -c:v libx264 -preset fast -crf 22 -r 60 → final_{job.id}.mp4
        
        Pass B — Portrait (9:16) from the landscape output:
          ffmpeg -i final_{job.id}.mp4 -vf "crop=405:720:face_x_centre-202:0,scale=1080:1920" \
            -c:v libx264 -preset fast -crf 22 → final_{job.id}_portrait.mp4
        
        Never chain setpts + zoompan + drawtext in a single filter graph — that's the bug we're avoiding.
      
      Step 6 — verify_clip() on both outputs (min_duration=3.0).
      
      Step 7 — UPDATE ClipJob SET enhancedPath=landscape, portraitPath=portrait, status='DONE'
               Upsert ReplayClip with enhancedPath.
               Emit WebSocket replay:clip_ready to the session room (include portraitPath in payload).
               Call check_session_all_ready(sessionId) (see Prompt 55 step 3) — may emit replay:all_ready.

2. systemd unit services/video-pipeline/systemd/neo-lounge-ai-effects-worker.service:
   - Single instance, WatchdogSec=60.

3. Tests services/video-pipeline/tests/test_ai_effects_worker.py:
   - Mock OpenCV VideoCapture, YuNet detect() (returns 1 face on frame 3), FER ONNX ({"joy":0.85,"neutral":0.15}).
   - Assert: caption selector called with emotion="joy".
   - Assert: for a station with analysisWebcamDevice set, ffmpeg call includes `setpts=2.0*PTS` (not 0.5).
   - Assert: for a station WITHOUT analysisWebcamDevice, no setpts filter (or minterpolate) is used.
   - Assert: ffmpeg call includes drawtext with the Sheng caption text.
   - Assert: portrait output path differs from landscape path.
   - Assert: both verify_clip calls made.
   - Assert: check_session_all_ready called after DONE update.

Run the tests. They must pass.

Commit: "feat(worker): Stage 3 AI effects — correct 2x slow-mo (setpts=2.0), per-station gating, captions"
```

---

### Prompt 58 — Highlight Reel Assembly

**Context:** Once all ClipJobs for a session reach DONE status, a highlight reel is automatically assembled. The reel concatenates all final clips in chronological order, adds a title card at the start ("Station 1 — Match Highlights"), numbered transition cards between clips (e.g. "Moment 2"), a watermark logo in the corner, and a final QR code frame linking to the session's PWA download page. Both landscape and portrait versions are produced. The API emits `replay:reel_ready` when done.

```text
Read docs/WORKING-RULES.md and docs/SPEC.md (Video Pipeline → Highlight Reel Assembly section).

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
     g. Portrait reel: repeat with portrait clips (ClipJob.portraitPath) + portrait-cropped title/transition cards
        → /var/lounge/sessions/{session_id}/reel_portrait.mp4
     h. UPDATE Session/ReplayClip stitchedReelPath (per SPEC §5 ReplayClip.stitchedReelPath) and portrait reel path.
     i. Emit WebSocket: replay:reel_ready {sessionId, stationId, reelUrl, portraitReelUrl} — tablet and PWA listen.
   
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
Read docs/WORKING-RULES.md and docs/SPEC.md (Tablet UX Rules section — "Tablet Display Rules (Strict)" — the strict rules: no preview, no thumbnail, no SMS, QR-only).

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

### Prompt 60 — PWA Updates: Portrait Download and Live Progress (auth-code-keyed)

**Context:** The customer PWA is keyed by `Session.authCode` — a 6-char code embedded in the QR. Customers never see the session ID. Every API path must use `:authCode`. This prompt adds (1) portrait 9:16 download alongside landscape, (2) live progress using socket.io, (3) highlight reel download when ready. Field names follow SPEC §5 (`portraitPath`, `enhancedPath`, `stitchedPath`).

```text
Read docs/WORKING-RULES.md and docs/SPEC.md (API Endpoints → Replay Endpoints, and Data Models → ClipJob). All replay endpoints are keyed by :authCode per SPEC §6 — never :sessionId.

1. Update apps/api/src/routes/replays.ts (create if absent):

   GET /api/replays/:authCode
     Look up Session by authCode.
     If session.purgedAt IS NOT NULL or session.expiresAt < NOW(): return 410 Gone with message
       "This session's replays have expired. Sessions are available for 1 hour after completion."
     Else return:
       {
         sessionId, authCode, stationId,
         totalClips, doneClips,
         reelReady: bool, reelUrl: string | null, portraitReelUrl: string | null,
         clips: [
           { id, status (ClipJobStatus), enhancedPath, portraitPath, stitchedPath, triggerType, matchMinute, homeScore, awayScore, titleCard, dominantEmotion }
         ]
       }

   GET /api/replays/:authCode/status    — {totalClips, doneClips, reelReady} lightweight
   GET /api/replays/:authCode/reel             → serve reel_landscape.mp4
   GET /api/replays/:authCode/reel/portrait    → serve reel_portrait.mp4
   GET /api/replays/:authCode/clip/:id         → serve ClipJob.enhancedPath (landscape)
   GET /api/replays/:authCode/clip/:id/portrait → serve ClipJob.portraitPath

   All endpoints verify the :id belongs to the session identified by :authCode before serving.

2. Update the replay PWA (apps/pwa or the existing PWA app):
   a. All API calls key off the authCode from the URL path.
   b. For each clip with status='DONE':
      - Landscape download button → /api/replays/:authCode/clip/:id
      - Portrait (9:16) download button → /api/replays/:authCode/clip/:id/portrait
   c. Progress indicator at top:
      - While at least one ClipJob is PENDING/EXTRACTING/STITCHING/ENHANCING:
        "Processing your highlights… {doneClips} of {totalClips} ready" + animated progress bar.
      - Subscribe to `replay:clip_ready` to increment doneClips in real time.
      - On `replay:all_ready`: hide progress bar, show "All highlights ready!".
   d. Highlight reel section:
      - While not ready: "Highlight reel compiling…" with spinner.
      - On `replay:reel_ready`: show "Download Highlight Reel" (landscape) and "Download Portrait Reel" (9:16) + share hint.

3. Tests:
   - apps/api/src/routes/__tests__/replays.test.ts:
     - 2 clips (1 DONE, 1 ENHANCING), reelReady=false → GET /api/replays/:authCode returns correct shape with totalClips=2, doneClips=1.
     - Unknown authCode → 404.
     - Session.purgedAt set → 410 with the expected message.
   - apps/pwa/src/__tests__/ReplayPage.test.tsx:
     - Mock API response with 1 DONE + 1 ENHANCING → progress bar shows "1 of 2".
     - DONE clip renders both landscape and portrait download buttons.
     - ENHANCING clip renders no download buttons.
     - Simulate replay:reel_ready socket event → reel download buttons appear.

Run the tests. They must pass.

Commit: "feat(pwa): :authCode-keyed replay API, portrait download, live progress, reel download"
```

---

### Prompt 61 — Dashboard Health Endpoints: Temperature, NVMe, Pipeline Status

**Context:** The owner dashboard currently shows session and revenue data. This prompt adds real hardware health data: CPU temperature (read from `/sys/class/thermal/`), NVMe S.M.A.R.T health (via `smartctl`), and the status of all pipeline systemd services. These are served by three new API endpoints and displayed as a health panel on the dashboard.

```text
Read docs/WORKING-RULES.md and docs/SPEC.md (API Endpoints → System Health, and Reliability and Operations section).

**Important — SPEC alignment:** The current SPEC §6 lists four health endpoints (temperature / nvme / services / disk). This prompt's two-endpoint design (`/hardware` and `/pipeline`) is what the dashboard actually consumes. As a final step, update SPEC.md §6 System Health Endpoints table to replace the four rows with the two rows built here, so SPEC and code stay in sync.

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
     Run: systemctl is-active for the Stage 11 pipeline units (neo-lounge-tv-capture@1..4, neo-lounge-webcam@1..4, neo-lounge-audio-detector@1..4, neo-lounge-event-merger, neo-lounge-game-analyzer@1..4, neo-lounge-clip-extractor, neo-lounge-stitch-worker, neo-lounge-ai-effects-worker, neo-lounge-reel-assembler, neo-lounge-temp-monitor).
     **Do not include neo-lounge-ring-pruner** — that service no longer exists (ring buffer is ffmpeg-native).
     Parse one status per service name, return as a dict.

2. Create GET /api/system/health (this is the combined hardware endpoint):
   - Returns: { cpuTemp, nvme: { healthy, percentUsed, temperature }, pipeline: { ...serviceStatuses }, warning: bool }
   - Owner auth required.
   - If cpuTemp > Settings.alertTempCelsius: warning=true and the API should also emit the `system:temperature_warning` WebSocket event (once per crossing, not every poll).

3. Create GET /api/system/pipeline-health:
   - Returns all ClipJob counts grouped by status for the last 24 hours:
     { PENDING: n, EXTRACTING: n, STITCHING: n, ENHANCING: n, DONE: n, FAILED: n }
   - Returns count of GameReplay rows detected today (with `used` breakdown).
   - Returns ring buffer stats per station: { tv1: { segmentCount, oldestSegmentAge, newestSegmentAge } } — derived from mtimes in /run/lounge/tvN/.

4. **Update docs/SPEC.md §6 System Health Endpoints table** — replace the four rows (temperature / nvme / services / disk) with the two rows created here (`GET /api/system/health` owner; `GET /api/system/pipeline-health` owner). Do not leave SPEC and code diverged.

5. Update the owner dashboard frontend to show a hardware health card:
   - Green/amber/red indicator for CPU temp (green < 70°C, amber 70–80, red > 80)
   - NVMe health bar (% used)
   - Each pipeline service: green dot (active) or red dot (inactive/failed)
   - Refresh every 30 seconds automatically

6. Write tests:
   - apps/api/src/services/__tests__/healthService.test.ts:
     - Mock fs.readFile for /sys/class/thermal — assert correct temp parsing.
     - Mock child_process exec for smartctl JSON — assert percentUsed extracted correctly.
     - Mock systemctl output — assert service statuses parsed correctly and neo-lounge-ring-pruner is NOT in the checked list.
   - apps/api/src/routes/__tests__/health.test.ts:
     - GET /api/system/health returns 200 with the documented shape.
     - cpuTemp > Settings.alertTempCelsius → warning: true and a temperature warning socket event is emitted (mocked).
     - GET /api/system/pipeline-health returns ClipJob counts with key `ENHANCING` (not `AI_EFFECTS`).

Run the tests. They must pass.

Commit: "feat(health): two-endpoint health API, updates SPEC §6, dashboard panel"
```

---

### Prompt 62 — Reliability: systemd Watchdog, UPS Shutdown, Temperature SMS

**Context:** Three reliability features run at the OS/system level and ensure the lounge keeps running or recovers gracefully under hardware stress. The watchdog config is added to all pipeline systemd units. UPS shutdown uses NUT (Network UPS Tools) with a custom script that signals ffmpeg and PostgreSQL cleanly. Temperature alerts use Africa's Talking SMS API (already present in the project for other uses) — a simple Python daemon reads CPU temp every 60 seconds and sends an SMS to the owner if it stays above 80°C for 3 consecutive checks.

```text
Read docs/WORKING-RULES.md and docs/SPEC.md (Reliability and Operations section — watchdog, UPS, temperature monitoring subsections).

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
   pkill -SIGTERM -f "ffmpeg.*seg_"
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
   - Reads Settings.alertTempCelsius and Settings.alertSmsNumber at startup; refresh every 60s. Do not hardcode 80 or the phone number.
   - Reads /sys/class/thermal/thermal_zone0/temp every 60 seconds.
   - Maintains a consecutive_high counter.
   - If temp > Settings.alertTempCelsius for 3 consecutive readings (3 minutes sustained):
     a. Send SMS via Africa's Talking API (use existing credentials from env or Settings):
          "⚠️ Neo Lounge alert: CPU temperature is {temp}°C. Check ventilation."
        to Settings.alertSmsNumber.
     b. Emit the `system:temperature_warning` WebSocket event via the API (POST to an internal endpoint or a small socket client) so the dashboard shows the alert immediately without waiting for the next health poll.
     c. Reset counter; enforce a minimum 30-minute interval between alerts.
   - If temp drops below (alertTempCelsius - 5): reset counter.
   - Log temp reading every cycle at DEBUG level.

4. Create systemd unit services/system/systemd/neo-lounge-temp-monitor.service:
   - Restart=always

5. Write tests in services/system/tests/test_temp_monitor.py:
   - Mock Settings.alertTempCelsius=80 and Settings.alertSmsNumber="+2547XXXXXXXX".
   - Mock thermal file reads: 3 consecutive reads above 80°C.
   - Assert: SMS sent exactly once after the 3rd read to the Settings.alertSmsNumber value (not an env var or hardcoded string).
   - Assert: `system:temperature_warning` emitted after SMS.
   - Assert: 4th read above 80°C (within 30 min) does NOT send another SMS.
   - Assert: read below 75°C resets the counter.
   - Mock Africa's Talking client; assert correct message text.

Run the tests. They must pass.

Commit: "feat(reliability): systemd watchdog notify, UPS clean shutdown, temperature SMS"
```

---

### Prompt 63 — Storage Lifecycle: Replay TTL Cleanup

**Context:** All session footage is deleted `Settings.replayTTLMinutes` after the session ends (default 60 per SPEC §5). The TTL is read from Settings, never hardcoded. A cleanup worker runs every 5 minutes, finds COMPLETED sessions whose `endTime < NOW() - replayTTLMinutes`, deletes files, and marks the session as purged. The 410 Gone response is served at `/api/replays/:authCode`. Refactor the existing `services/video-pipeline/capture/cleanup.py` module.

```text
Read docs/WORKING-RULES.md and docs/SPEC.md (Reliability and Operations → Storage Lifecycle; Data Models → Settings.replayTTLMinutes). Read services/video-pipeline/capture/cleanup.py first and refactor in place.

1. Refactor services/video-pipeline/capture/cleanup.py:
   - Add a `Session.purgedAt` field to the schema (via a follow-on migration in this prompt if absent).
   - On startup and every 60s, read Settings.replayTTLMinutes from the DB.
   - Every 5 minutes:
     SELECT * FROM "Session"
     WHERE status='COMPLETED'
       AND endTime < NOW() - (replayTTLMinutes || ' minutes')::interval
       AND purgedAt IS NULL
   - For each session:
     a. Directories to delete:
        - /var/lounge/sessions/{session_id}/
        - /var/lounge/webcam{stationId}/  is NOT deleted here — webcam capture rotates its own output; instead, delete only segments whose mtime < endTime+postRoll buffer.
        - /run/lounge/ is self-managed by ffmpeg segment_wrap — skip.
     b. shutil.rmtree() each, catching and logging errors (continue to next session on failure).
     c. UPDATE Session SET purgedAt=NOW()
     d. UPDATE ClipJob SET tvClipPath=NULL, webcamClipPath=NULL, stitchedPath=NULL, enhancedPath=NULL, portraitPath=NULL, gameReplayPath=NULL WHERE sessionId=$1
     e. Log: "Session {id} purged after {ttl} min: {bytes_freed}MB freed"

2. systemd timer unit:
   services/video-pipeline/systemd/neo-lounge-session-cleanup.timer (OnCalendar=*:0/5)
   services/video-pipeline/systemd/neo-lounge-session-cleanup.service (Type=oneshot)
   Remove any previously drafted parallel workers/session_cleanup.py file.

3. Ensure GET /api/replays/:authCode (from Prompt 60) returns 410 Gone when session.purgedAt IS NOT NULL. This was added in Prompt 60; this prompt only verifies it exists and covers it in tests.

4. Write/update tests in services/video-pipeline/tests/test_session_cleanup.py:
   - Mock Settings.replayTTLMinutes = 60.
   - Session ended 61 minutes ago with files present → shutil.rmtree called, purgedAt set, ClipJob paths nulled.
   - Session ended 59 minutes ago → NOT cleaned up.
   - Session ended 61 minutes ago BUT Settings.replayTTLMinutes = 120 → NOT cleaned up (assert cleanup reads value from Settings, not a hardcoded interval).
   - shutil.rmtree raises PermissionError → error logged, next session still processed.

Run the tests. They must pass.

Commit: "feat(lifecycle): replay-TTL cleanup reads Settings.replayTTLMinutes"
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

Scenario (all timestamps are unix epoch floats; eventMergeWindowSeconds=25):
1. Session starts for station 1. Confirm MatchState row created (capturedAt, isReplayShowing=false).

2. Simulate audio detector: 3 PendingEvents written at T=0, T=10, T=60 (source=AUDIO_AI, eventType=GOAL_CANDIDATE, audioConfidence=0.7).

3. Run EventMerger.run_merge_cycle():
   - Assert: T=0 and T=10 merged into one ClipJob (gap=10 ≤ 25).
   - Assert: T=60 is a separate ClipJob (gap=50 > 25).
   - Assert: 2 ClipJobs created, both PENDING, each with clipStart/clipEnd populated.

4. Simulate game analyzer: write PendingEvent at T=12 (source=GAME_ANALYZER, eventType=GOAL_CANDIDATE).
   Rerun merger → assert the T=0/T=10/T=12 cluster now has source=BOTH on its root and no new ClipJob is created for T=12 (corroboration, not duplication).

5. Simulate game analyzer replay detection: insert a GameReplay row with replayStart=T=15, replayEnd=T=27, confidence=0.88, used=false. Run merger → no new ClipJob needed (it overlaps existing ClipJob's window). Run clip extractor later — assert ClipJob.gameReplayPath is set and GameReplay.used flipped to true.

6. Run clip extractor for each ClipJob:
   - Assert: each job moves EXTRACTING → STITCHING.
   - Assert: tvClipPath set on each job.
   - Assert: partial webcam coverage handled without failing the job.

7. Run stitch worker for each job:
   - Assert: each job moves STITCHING → ENHANCING (with stage3Enabled=true) or DONE (with stage3Enabled=false).
   - Assert: stitchedPath set.

8. Run AI effects worker for each job (with stage3Enabled=true):
   - Assert: each job moves ENHANCING → DONE.
   - Assert: enhancedPath and portraitPath set.
   - Assert: for station 1 (slow-mo cam), ffmpeg invocation included `setpts=2.0*PTS`.

9. End the session (Session.status = COMPLETED, endTime = NOW()). Assert a synthetic PendingEvent with eventType=MATCH_END is inserted and picked up by the next merger cycle, producing one more ClipJob that also processes to DONE.

10. Run reel assembler:
    - Assert: reel assembled, stitchedReelPath set.
    - Assert: `replay:all_ready` emitted exactly once.
    - Assert: `replay:reel_ready` emitted after assembly.

11. Assert: cleanup worker does NOT purge (session ended < replayTTLMinutes).
    - Advance mock time by 61 minutes (Settings.replayTTLMinutes=60).
    - Run cleanup — assert session.purgedAt is set, directories deleted.
    - GET /api/replays/:authCode returns 410 Gone.

All assertions must pass. Fix any issues found.

Commit: "test(integration): full enhanced pipeline end-to-end test — all stages green"
```

---

## Stage 11 Summary

| Prompt | What Gets Built |
|--------|----------------|
| 47.5 | Setup: apt packages, Python deps, YAMNet/YuNet/FER model downloads |
| 48 | DB schema matching SPEC §5: PendingEvent, ClipJob, GameReplay, MatchState + Station/Settings additions (three enums: EventType, EventSource, ClipJobStatus) |
| 49 | TV ring buffer via ffmpeg `-segment_wrap 60` in tmpfs (no pruner daemon) |
| 50 | Per-station webcam capture (60fps default, 120fps only on slow-mo cam) + security recorder refactor |
| 51 | YAMNet detector writes PendingEvents (AUDIO_AI) + EventMerger with BOTH corroboration + MATCH_END synthetic event |
| 52 | Game stream analyzer at 320×240 / 2fps with SPEC EventType enum and MatchState writes |
| 53 | Clip extractor: reads clipStart/clipEnd from row, partial webcam coverage, populates ClipJob.gameReplayPath |
| 54 | Orphan GameReplay sweeper — creates ClipJob for replays without a corroborating PendingEvent |
| 55 | Stage 2 stitch worker: PiP + optional FIFA replay concat + all_ready emission |
| 56 | Seed caption library (40 entries — library target ~1000) + context-aware selector |
| 57 | Stage 3 AI effects: per-station slow-mo (setpts=2.0*PTS on Station 4 only), two-pass filter chain, portrait crop |
| 58 | Highlight reel assembly: title/transition cards, QR frame, landscape + portrait reels |
| 59 | Tablet UX: moments counter, reel-ready notification, QR (no preview, no SMS) |
| 60 | PWA: `:authCode`-keyed replay API, portrait download, live progress bar, reel download, 410 Gone on purge |
| 61 | Health endpoints: `/api/system/health` + `/api/system/pipeline-health` (and SPEC §6 alignment) |
| 62 | Reliability: systemd watchdog notify, UPS clean shutdown, temperature monitor reading Settings.alertSmsNumber/alertTempCelsius + socket emit |
| 63 | Storage lifecycle: TTL cleanup reads Settings.replayTTLMinutes, 410 Gone served at `/api/replays/:authCode` |
| 64 | Full integration test covering merge + corroboration + MATCH_END + gameReplayPath + reel + TTL purge |

**Total new prompts: 17 (48–64)**
