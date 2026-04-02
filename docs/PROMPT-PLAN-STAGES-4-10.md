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
