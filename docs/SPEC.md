# PlayStation Lounge — V3 Final Specification

## 1. What Is This App?

A locally-hosted management system for a PlayStation 5 gaming lounge in Nairobi, Kenya with 4 gaming stations. The entire system runs on a local area network. The only internet traffic is M-Pesa payment requests and SMS via Africa's Talking API.

The system handles:
- Station booking with timed sessions
- Payments (M-Pesa mobile money + cash)
- Live countdown timers with auto-end
- TV control (switch HDMI inputs, brightness) via ADB over TCP/IP
- LED ambient lighting control via Tuya local API
- Automated gameplay video recording from HDMI capture cards
- AI-detected highlight clipping (FIFA goal detection via YAMNet audio analysis)
- Replay delivery to customers via QR code → local PWA
- Security camera continuous recording + event-triggered clip extraction
- Staff PIN authentication with full audit trail
- Station queue management
- Session transfer between stations
- Owner remote dashboard via Tailscale
- Server failover (primary + backup Orange Pi)
- Power failure handling (save/restore sessions)

## 2. Tech Stack

- **API:** Node.js + Express + TypeScript (port 3000)
- **Database:** PostgreSQL + Prisma ORM
- **Frontend (Kiosk):** Next.js + TypeScript + Tailwind CSS (port 3001) — staff admin interface
- **Frontend (Tablet):** Next.js + TypeScript + Tailwind CSS (port 3002) — per-station customer display
- **Frontend (PWA):** Next.js + TypeScript + Tailwind CSS (port 3003) — customer replay downloads
- **Frontend (Dashboard):** Next.js + TypeScript + Tailwind CSS (port 3004) — owner remote dashboard
- **Video Pipeline:** Python + FastAPI (port 8000) — ffmpeg + YAMNet AI
- **Real-time:** socket.io WebSockets
- **Hardware:** Orange Pi 5 Max 16GB (RK3588, 2x USB 3.0, 2x USB 2.0, 2.5GbE, M.2 NVMe)

## 3. Pricing

- Base rate: 300 KES per hour (configurable in Settings)
- All durations proportional: Math.round(baseHourlyRate / 60 * durationMinutes)
- Standard options: 5m=25, 10m=50, 20m=100, 30m=150, 40m=200, 1hr=300 KES
- "Custom" = staff enters minutes, price calculated
- "Until Closing" = calculates minutes from now to closingTime, charges proportionally
- Extensions use the same calculation

## 4. Data Models

### Station
- id: Int, autoincrement, primary key
- name: String (e.g. "Station 1")
- status: Enum StationStatus (AVAILABLE, ACTIVE, PENDING, FAULT) — default AVAILABLE
- currentSessionId: Int, optional, FK to Session
- adbAddress: String, default "" (e.g. "192.168.1.101:5555")
- tuyaDeviceId: String, default ""
- captureDevice: String, default "" (e.g. "/dev/video0")
- Relations: currentSession, sessions[], queue[]

### Session
- id: Int, autoincrement, primary key
- stationId: Int, FK to Station
- staffPin: String
- startTime: DateTime, default now()
- endTime: DateTime, optional
- durationMinutes: Int
- remainingAtPowerLoss: Int, optional
- status: Enum SessionStatus (ACTIVE, PAUSED, COMPLETED, POWER_INTERRUPTED) — default ACTIVE
- authCode: String, unique (6-char alphanumeric, generated on creation)
- Relations: station, transactions[], games[]

### Transaction
- id: Int, autoincrement, primary key
- sessionId: Int, FK to Session
- amount: Int (KES)
- method: Enum PaymentMethod (CASH, MPESA)
- status: Enum TransactionStatus (PENDING, COMPLETED, FAILED, TIMEOUT) — default PENDING
- mpesaReceipt: String, optional
- staffPin: String
- createdAt: DateTime, default now()
- Relations: session

### Game
- id: Int, autoincrement, primary key
- sessionId: Int, FK to Session
- startTime: DateTime, default now()
- endTime: DateTime, optional
- endMethod: Enum GameEndMethod (AI_DETECTED, MANUAL_BUTTON, SESSION_END), optional
- Relations: session, replayClips[]

### ReplayClip
- id: Int, autoincrement, primary key
- gameId: Int, FK to Game
- sessionId: Int, FK to Session (denormalized for easy lookup)
- filePath: String
- triggerType: Enum TriggerType (CROWD_ROAR, WHISTLE, OTHER)
- triggerTimestamp: DateTime
- createdAt: DateTime, default now()
- expiresAt: DateTime (1 hour after parent session ends)
- stitchedReelPath: String, optional
- Relations: game, session

### SecurityEvent
- id: Int, autoincrement, primary key
- type: Enum SecurityEventType (CASH_PAYMENT, MPESA_PAYMENT, MPESA_TIMEOUT, SESSION_START, SESSION_END, SESSION_EXTENDED, HARDWARE_FAULT, FREE_TIME_GRANTED, ADMIN_OVERRIDE, SHIFT_START, SHIFT_END, SESSION_TRANSFER, POWER_LOSS, POWER_RESTORE, STATION_FAULT, SYSTEM_STARTUP)
- description: String
- staffPin: String, optional
- stationId: Int, optional
- timestamp: DateTime, default now()
- metadata: Json, optional
- clipsGenerated: Boolean, default true
- Relations: securityClips[]

### SecurityClip
- id: Int, autoincrement, primary key
- eventId: Int, FK to SecurityEvent
- cameraId: Int, FK to SecurityCamera
- filePath: String
- startTime: DateTime
- endTime: DateTime
- createdAt: DateTime, default now()
- Relations: event, camera

### SecurityCamera
- id: Int, autoincrement, primary key
- name: String (e.g. "Counter", "Entrance")
- rtspUrl: String, default ""
- isOnline: Boolean, default false
- location: String, default ""

### Staff
- id: Int, autoincrement, primary key
- name: String
- pin: String, unique (4-digit)
- role: Enum StaffRole (OWNER, STAFF) — default STAFF
- isActive: Boolean, default true

### Settings (singleton — always id=1)
- id: Int, autoincrement, primary key
- baseHourlyRate: Int, default 300
- openingTime: String, default "08:00"
- closingTime: String, default "22:00"
- replayTTLMinutes: Int, default 60
- powerSaveBrightness: Int, default 50
- yamnetConfidenceThreshold: Float, default 0.7
- clipBufferBefore: Int, default 10 (seconds before event)
- clipBufferAfter: Int, default 15 (seconds after event)
- clipCooldownSeconds: Int, default 45
- securityClipBeforeMinutes: Int, default 5
- securityClipAfterMinutes: Int, default 5
- securityRetentionDays: Int, default 14

### StationQueue
- id: Int, autoincrement, primary key
- stationId: Int, FK to Station
- position: Int
- durationMinutes: Int
- createdAt: DateTime, default now()
- status: Enum QueueStatus (WAITING, NOTIFIED, EXPIRED, CONVERTED) — default WAITING
- Relations: station

## 5. API Endpoints

### Main API (Node.js/Express, port 3000)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | /api/health | None | Health check |
| GET | /api/stations | None | List all 4 stations with status, current session, queue count |
| GET | /api/stations/:id | None | Station detail with session, queue, recent sessions |
| PATCH | /api/stations/:id | Staff | Update station status |
| POST | /api/sessions | Staff | Create session (triggers hardware activation) |
| GET | /api/sessions/:id | None | Session detail with transactions, games |
| PATCH | /api/sessions/:id/end | Staff | End session (triggers hardware deactivation) |
| PATCH | /api/sessions/:id/extend | Staff | Extend session (new transaction) |
| POST | /api/sessions/:id/transfer | Staff | Transfer session to another station |
| POST | /api/transactions | Staff | Create transaction (cash confirmation) |
| POST | /api/payments/mpesa/initiate | Staff | Send M-Pesa STK push |
| POST | /api/payments/mpesa/callback | None | Africa's Talking webhook |
| POST | /api/games/:id/end | Staff | Manually end a game |
| GET | /api/replays/:authCode | None | Get replay clips for a session |
| POST | /api/queue | Staff | Add customer to station queue |
| DELETE | /api/queue/:id | Staff | Remove from queue |
| GET | /api/events | Owner | Security event log (filterable by type, stationId, limit) |
| GET | /api/security/cameras | Owner | Camera status (online/offline) |
| GET | /api/security/clips/:eventId | Owner | Clips for a specific event |
| DELETE | /api/security/clips/:id | Owner | Delete a security clip |
| GET | /api/dashboard | Owner | Revenue, sessions, health stats |
| POST | /api/system/restart-service | Owner | Restart a service |
| GET | /api/settings | None | Get system settings |
| PATCH | /api/settings | Owner | Update settings |
| POST | /api/staff/login | None | Staff PIN authentication |
| POST | /api/system/power-down | Owner | Trigger power save mode |
| POST | /api/system/power-restore | Owner | Restore from power save |

### WebSocket Events (socket.io)

| Event | Direction | Description |
|-------|-----------|-------------|
| station:updated | Server → All | Station status change |
| session:tick | Server → Station | Timer tick (remaining seconds) |
| session:warning | Server → Station | 2-minute warning |
| session:ended | Server → Station | Session complete |
| game:ended | Server → Station | Game boundary detected |
| replay:ready | Server → Station | New clip available |
| payment:confirmed | Server → Kiosk | M-Pesa payment successful |
| payment:timeout | Server → Kiosk | M-Pesa payment timed out |
| power:status | Server → All | Power mode changed |
| queue:updated | Server → Kiosk | Queue changed |

## 6. User Journey

1. Customer arrives → Staff opens kiosk → station grid shows 4 cards
2. Staff taps available station → booking modal → selects duration → sees price → selects Cash/M-Pesa → Confirm
3. Cash: staff confirms "Cash Received" → session starts. M-Pesa: STK Push sent → customer enters PIN → callback confirms → session starts
4. Session starts: TV switches to PS5 HDMI (ADB), LEDs sync (Tuya), capture begins (ffmpeg), timer starts on kiosk + tablet
5. During gameplay: ffmpeg buffers video to RAM, YAMNet monitors audio for crowd roars (goals)
6. Goal scored: YAMNet triggers → clip extracted (10s before + 15s after) → saved to disk
7. Match ends: detected by YAMNet (final whistle) or manual "End Game" button on tablet → clips grouped → QR code appears on tablet
8. Customer scans QR → phone connects to lounge WiFi → opens PWA → downloads replay clips
9. 2 minutes remaining: tablet + kiosk show warning → extension prompt
10. Timer hits 0 or staff ends session: TV → screensaver, LEDs → ambient, capture stops, final QR shown
11. 1 hour after session end: replay files auto-deleted

## 7. Error Handling

- **Internet outage:** Route Africa's Talking API through 4G LTE dongle failover
- **M-Pesa timeout:** 30 seconds → show retry/switch-to-cash buttons
- **Duplicate webhooks:** Idempotent handler — check if transaction already COMPLETED
- **Concurrent payments:** Lock station during payment, reject second attempt
- **Power cut:** Save each session's remaining time → restore when power returns
- **Hardware fault:** Staff can grant free time or transfer session to another station

## 8. Design

- Dark mode: background #0F172A (near black)
- Primary accent: #2563EB (PlayStation blue)
- Cards: #1E293B background with subtle border
- Status badges: green (Available), blue (Active), yellow (Pending), red (Fault)
- Typography: clean sans-serif, large and readable
- Language: English at launch, strings externalized for future Swahili support