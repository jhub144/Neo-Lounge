# Neo-Lounge: Comprehensive Improvement Recommendations

> Generated: 2026-04-04  
> Based on full codebase analysis: 119 TypeScript/Python files, 23 test files, all services, schema, config, and docs.

---

## SECURITY — Fix Before Production

### 1. Add authentication to read endpoints
`GET /api/stations`, `GET /api/settings`, and `GET /api/sessions/:id` are completely open — anyone on the network can read session data, pricing, and staff pins.

**Fix:** Add `requireStaff` to GET routes that expose sensitive data:

```typescript
// apps/api/src/routes/stations.ts
router.get('/', requireStaff, async (req, res) => { ... });

// apps/api/src/routes/settings.ts
router.get('/', requireStaff, async (req, res) => { ... });
```

### 2. Hash staff PINs with bcrypt
PINs are stored and compared as plain text. If the DB is ever dumped, all PIN credentials are exposed.

```typescript
// On staff creation / seed
import bcrypt from 'bcryptjs';
const hashedPin = await bcrypt.hash(pin, 10);

// In auth middleware
const match = await bcrypt.compare(req.headers['x-staff-pin'], staff.pin);
```

### 3. Increase auth code length
The 6-character replay auth code has ~2.2 billion combinations — enumerable. Use 10 characters (alphanumeric = 3.6 trillion).

```typescript
// apps/api/src/utils/pricing.ts
export function generateAuthCode(): string {
  return randomBytes(6).toString('base64url').slice(0, 10).toUpperCase();
}
```

### 4. Lock down CORS to LAN only
```typescript
// apps/api/src/index.ts
app.use(cors({
  origin: (origin, cb) => {
    const allowed = /^http:\/\/(localhost|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?$/;
    if (!origin || allowed.test(origin)) cb(null, true);
    else cb(new Error('CORS blocked'));
  },
}));
```

### 5. Sign M-Pesa webhook callbacks
Africa's Talking supports webhook signing. Any attacker can POST to `/api/payments/mpesa/callback` and complete fake payments.

```typescript
// In payments.ts callback handler
const expectedSig = crypto
  .createHmac('sha256', process.env.AT_WEBHOOK_SECRET!)
  .update(JSON.stringify(req.body))
  .digest('hex');
if (req.headers['x-at-signature'] !== expectedSig) {
  res.status(401).json({ error: 'Invalid signature' });
  return;
}
```

### 6. Add rate limiting
```bash
npm install express-rate-limit
```
```typescript
import rateLimit from 'express-rate-limit';

const paymentLimiter = rateLimit({ windowMs: 60_000, max: 10 });
app.use('/api/payments/mpesa', paymentLimiter);

const authLimiter = rateLimit({ windowMs: 60_000, max: 20 });
app.use('/api/staff/login', authLimiter);
```

### 7. Add Socket.io authentication
Currently any browser can connect and listen to all station updates.

```typescript
// apps/api/src/index.ts
io.use((socket, next) => {
  const pin = socket.handshake.auth.pin as string;
  if (!pin) return next(new Error('Unauthorized'));
  prisma.staff.findFirst({ where: { pin, isActive: true } })
    .then(s => s ? next() : next(new Error('Unauthorized')))
    .catch(next);
});
```

---

## CODE QUALITY

### 8. Replace console.log with a proper logger
73 `console.log/error` calls violate WORKING-RULES.md. Use `pino` (fast, JSON-structured):

```bash
npm install pino pino-pretty
```
```typescript
// apps/api/src/lib/logger.ts
import pino from 'pino';
export const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });

// Usage (replaces console.log/error throughout):
logger.info({ stationId, sessionId }, '[sessions] session started');
logger.error({ err }, '[payments] callback error');
```

### 9. Add request validation with Zod
Every route does manual `if (!field)` checks with no type coercion or range validation. Zod centralises this:

```bash
npm install zod
```
```typescript
// Example: sessions.ts
import { z } from 'zod';

const CreateSessionSchema = z.object({
  stationId: z.number().int().positive(),
  durationMinutes: z.number().int().min(5).max(480),
  paymentMethod: z.enum(['CASH', 'MPESA']),
  staffPin: z.string().length(4),
});

router.post('/', requireStaff, async (req, res) => {
  const parsed = CreateSessionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.format(), code: 'VALIDATION_ERROR' });
    return;
  }
  const { stationId, durationMinutes, paymentMethod } = parsed.data;
  // ...
});
```

### 10. Move shared pricing logic to `shared/utils`
`BookingModal.tsx` in kiosk duplicates the pricing formula. The `shared/` directory exists for exactly this.

```typescript
// shared/utils/pricing.ts  (move from apps/api/src/utils/pricing.ts)
export const calculatePrice = (minutes: number, ratePerHour: number) =>
  Math.round((ratePerHour / 60) * minutes);

// Import in both API and kiosk:
import { calculatePrice } from '@neo-lounge/shared/utils/pricing';
```

Set up a TypeScript path alias or `workspace:*` reference to make cross-app imports work.

### 11. Add database indexes for common queries

```prisma
// prisma/schema.prisma
model Session {
  @@index([status])
  @@index([stationId, status])
}

model ReplayClip {
  @@index([sessionId])
  @@index([expiresAt])
}

model SecurityEvent {
  @@index([type])
  @@index([stationId])
  @@index([timestamp])
}

model Transaction {
  @@index([sessionId])
  @@index([status])
}
```

### 12. Add cascade deletes to schema

```prisma
// prisma/schema.prisma
model Session {
  transactions Transaction[] @relation(onDelete: Cascade)
  games        Game[]        @relation(onDelete: Cascade)
  replayClips  ReplayClip[]  @relation(onDelete: Cascade)
}
```

### 13. Fix the 4 `as any` enum casts in sessions.ts
Replace unsafe casts with proper TypeScript narrowing:

```typescript
// Instead of: data: { status: status as any }
import { SessionStatus } from '@prisma/client';

const status: SessionStatus = 'ACTIVE'; // TypeScript validates this
await prisma.session.update({ where: { id }, data: { status } });
```

---

## ARCHITECTURE

### 14. Align Next.js versions across all apps
Kiosk is on 16.2.1, tablet on 15.5.7. This causes subtle API differences.

```bash
# In apps/kiosk, apps/tablet, apps/pwa, apps/dashboard:
npm install next@latest
```

### 15. Add a monorepo root `package.json` with workspaces

```json
// /package.json (root)
{
  "name": "neo-lounge",
  "private": true,
  "workspaces": ["apps/*", "services/video-pipeline", "shared"],
  "scripts": {
    "dev": "concurrently -n api,kiosk,tablet,pwa,dash \"npm run dev -w apps/api\" \"npm run dev -w apps/kiosk\" ...",
    "test": "npm run test -w apps/api && pytest services/video-pipeline/tests",
    "build": "npm run build -w apps/api && npm run build -w apps/kiosk ...",
    "lint": "npm run lint -w apps/api && npm run lint -w apps/kiosk ..."
  }
}
```

### 16. Implement circuit breaker for external calls

ADB, Tuya, and video pipeline calls can hang. Add timeouts and circuit breaking:

```typescript
// apps/api/src/lib/withTimeout.ts
export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
  );
  return Promise.race([promise, timeout]);
}

// Usage in sessions.ts
await withTimeout(adbService.switchToHdmi(station.adbAddress), 5000, 'ADB switchToHdmi');
```

### 17. Complete the environment variable documentation
Several variables exist in code but not in `.env.example`. Add all missing vars:

```bash
# Add to .env.example:
USE_MOCK_HARDWARE=true
USE_MOCK_CAPTURE=true
USE_MOCK_INTERNET=true
PIPELINE_URL=http://localhost:8000
MOCK_INTERNET_ROUTE=primary
MOCK_PAYMENT_SHOULD_FAIL=false
DONGLE_URL=http://192.168.8.1
TUYA_LOCAL_KEYS={"device-id":"local-key"}
NEXT_PUBLIC_API_URL=http://localhost:3000
NEXT_PUBLIC_STATION_ID=1
AT_WEBHOOK_SECRET=change-me
```

### 18. Complete YAMNet audio detection

```python
# services/video-pipeline/detection/detector.py
import tflite_runtime.interpreter as tflite
import numpy as np
import sounddevice as sd

class RealAudioDetector(IAudioDetector):
    def __init__(self, confidence_threshold: float = 0.3):
        self.model = tflite.Interpreter('yamnet.tflite')
        self.model.allocate_tensors()
        self.threshold = confidence_threshold

    async def detect(self, audio_chunk: np.ndarray) -> list[DetectionEvent]:
        input_details = self.model.get_input_details()
        self.model.set_tensor(input_details[0]['index'], audio_chunk)
        self.model.invoke()
        scores = self.model.get_tensor(self.model.get_output_details()[0]['index'])[0]
        # Map YAMNet class IDs to TriggerType
        CROWD_ROAR_CLASSES = {137, 138, 139}  # Crowd, Cheering, Applause
        WHISTLE_CLASSES = {397}
        results = []
        for cls_id in CROWD_ROAR_CLASSES:
            if scores[cls_id] > self.threshold:
                results.append(DetectionEvent(type='CROWD_ROAR', confidence=float(scores[cls_id])))
        return results
```

---

## TESTING

### 19. Add missing test files

**Staff login** — no test file exists:
```typescript
// apps/api/src/routes/__tests__/staff.test.ts
describe('POST /api/staff/login', () => {
  test('returns 200 with staff info for valid PIN', ...);
  test('returns 401 for invalid PIN', ...);
  test('returns 401 for inactive staff', ...);
});
```

**Events route** — no test file exists:
```typescript
// apps/api/src/routes/__tests__/events.test.ts
describe('GET /api/events', () => {
  test('requires owner auth', ...);
  test('filters by type', ...);
  test('filters by stationId', ...);
});
```

**Internet service** — logic not unit tested:
```typescript
// apps/api/src/services/__tests__/internetService.test.ts
describe('RealInternetService', () => {
  test('setRoute emits failover event and updates history');
  test('runCheck: primary ok → route stays primary');
  test('runCheck: primary fails, dongle ok → route becomes 4g');
  test('runCheck: both fail → route becomes offline');
  test('getFailoverHistory filters by hours');
});
```

### 20. Add E2E tests with Playwright

```bash
npm install -D @playwright/test
npx playwright install
```

```typescript
// e2e/session-flow.spec.ts
test('complete session booking flow', async ({ page }) => {
  await page.goto('http://localhost:3001');
  await page.fill('[data-testid="pin-input"]', '0000');
  await page.click('[data-testid="login-btn"]');
  await page.click('[data-testid="station-1-book"]');
  await page.click('[data-testid="duration-30"]');
  await page.click('[data-testid="pay-cash"]');
  await expect(page.locator('[data-testid="station-1-status"]')).toHaveText('ACTIVE');
});
```

### 21. Add load testing

```bash
npm install -D artillery
```
```yaml
# artillery/sessions.yml
config:
  target: http://localhost:3000
  phases:
    - duration: 60
      arrivalRate: 10
scenarios:
  - flow:
      - post:
          url: /api/staff/login
          json: { pin: "0000" }
          capture:
            json: $.pin
            as: pin
      - get:
          url: /api/stations
          headers:
            x-staff-pin: "{{ pin }}"
```

---

## DEVELOPER EXPERIENCE

### 22. Create a proper `start_all.sh`

```bash
#!/usr/bin/env bash
# start_all.sh
set -e

# Start PostgreSQL (if not already running)
sudo systemctl start postgresql

# Start API
cd apps/api && npm run dev &
API_PID=$!

# Wait for API to be ready
until curl -sf http://localhost:3000/api/health > /dev/null; do sleep 1; done
echo "✓ API ready"

# Start video pipeline
cd ../../services/video-pipeline
.venv/bin/uvicorn main:app --port 8000 --reload &
PIPE_PID=$!

# Start frontends
cd ../../apps/kiosk && npm run dev &
cd ../tablet && npm run dev &
cd ../pwa && npm run dev &
cd ../dashboard && npm run dev &

echo ""
echo "✓ All services started"
echo "  API:       http://localhost:3000"
echo "  Kiosk:     http://localhost:3001"
echo "  Tablet:    http://localhost:3002"
echo "  PWA:       http://localhost:3003"
echo "  Dashboard: http://localhost:3004"
echo "  Pipeline:  http://localhost:8000"

wait
```

### 23. Add ESLint to the API

The kiosk has `eslint.config.mjs` but the API does not:

```bash
cd apps/api && npm install -D eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin
```
```json
// apps/api/.eslintrc.json
{
  "parser": "@typescript-eslint/parser",
  "rules": {
    "@typescript-eslint/no-explicit-any": "error",
    "no-console": "warn"
  }
}
```

### 24. Add `CLAUDE.md` to the project root

This guides Claude Code in future sessions without needing to re-read all docs:

```markdown
# CLAUDE.md

## Project
Neo-Lounge — 4-station PS5 lounge management, Nairobi Kenya.

## Stack
- API: Node.js + Express + TypeScript (port 3000)
- Kiosk: Next.js (3001), Tablet: Next.js (3002), PWA: Next.js (3003), Dashboard: Next.js (3004)
- Video Pipeline: FastAPI Python (8000)
- DB: PostgreSQL via Prisma

## Rules
- Always read docs/WORKING-RULES.md and docs/SPEC.md before implementing features
- All services follow mock/real factory pattern (USE_MOCK_HARDWARE, USE_MOCK_PAYMENTS, etc.)
- No console.log — use logger from src/lib/logger.ts
- No any types — use proper Prisma types or Zod schemas
- Commit message format: short description + blank line + detailed body

## Test
- API: cd apps/api && npx jest
- Python: cd services/video-pipeline && python3.12 -m pytest tests/
- All tests must pass before every commit

## Do not commit signatures
- No Co-Authored-By lines in commits
```

---

## MCP & CLAUDE CODE WORKFLOW

### 25. Expand `.mcp.json` with high-value servers

```json
{
  "mcpServers": {
    "jcodemunch": {
      "command": "/home/janderson/.local/bin/jcodemunch-mcp"
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_TOKEN}"
      }
    },
    "postgres": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres"],
      "env": {
        "POSTGRES_CONNECTION_STRING": "postgres://postgres:neolounge@127.0.0.1:5432/neolounge"
      }
    },
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "/home/janderson/devprojects/Neo-Lounge"
      ]
    }
  }
}
```

**Benefits:**
- **GitHub MCP** — enables Claude to push commits, create PRs, open issues directly
- **Postgres MCP** — enables Claude to query live DB to verify data, debug sessions, inspect schema
- **Filesystem MCP** — gives Claude structured file access for large-scale refactors

### 26. Add Claude Code hooks in `.claude/settings.json`

Hooks enforce rules automatically without needing reminders in every session:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "bash -c 'if echo \"$CLAUDE_TOOL_INPUT\" | grep -q \"git commit\"; then cd /home/janderson/devprojects/Neo-Lounge/apps/api && npx jest --passWithNoTests --silent 2>&1 | tail -5; fi'"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "bash -c 'FILE=$(echo $CLAUDE_TOOL_INPUT | python3 -c \"import sys,json; d=json.load(sys.stdin); print(d.get(\\\"file_path\\\",\\\"\\\"))\" 2>/dev/null); [[ \"$FILE\" == *.ts ]] && cd /home/janderson/devprojects/Neo-Lounge/apps/api && npx tsc --noEmit 2>&1 | head -5 || true'"
          }
        ]
      }
    ]
  }
}
```

This auto-runs tests before commits and TypeScript checks after every `.ts` file edit.

### 27. Use the `/simplify` skill after large features

After implementing a new feature, run `/simplify` to catch duplication and quality issues before committing.

### 28. Use `jCodeMunch` for impact analysis before refactors

Before any significant refactor (e.g., adding Zod validation across all routes), run:

```
mcp__jcodemunch__get_blast_radius — target file before editing
mcp__jcodemunch__get_dependency_graph — services layer overview
mcp__jcodemunch__find_dead_code — identify unused symbols before cleanup
mcp__jcodemunch__get_hotspots — highest-churn files (most likely to have bugs)
```

---

## INFRASTRUCTURE & DEPLOYMENT

### 29. Add a `docker-compose.yml` for local dev

```yaml
# docker-compose.yml
version: '3.9'
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: neolounge
      POSTGRES_DB: neolounge
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  api:
    build: ./apps/api
    ports: ["3000:3000"]
    environment:
      DATABASE_URL: postgresql://postgres:neolounge@postgres:5432/neolounge
      USE_MOCK_HARDWARE: "true"
    depends_on: [postgres]

  pipeline:
    build: ./services/video-pipeline
    ports: ["8000:8000"]

volumes:
  pgdata:
```

### 30. Add GitHub Actions CI

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]

jobs:
  test-api:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: neolounge
        ports: ["5432:5432"]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: cd apps/api && npm ci && npx jest
        env:
          DATABASE_URL: postgresql://postgres:neolounge@localhost:5432/postgres
          USE_MOCK_HARDWARE: "true"
          USE_MOCK_PAYMENTS: "true"

  test-pipeline:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: '3.12' }
      - run: cd services/video-pipeline && pip install -r requirements.txt && python -m pytest tests/

  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: cd apps/api && npm ci && npx tsc --noEmit
      - run: cd apps/kiosk && npm ci && npx tsc --noEmit
      - run: cd apps/dashboard && npm ci && npx tsc --noEmit
      - run: cd apps/tablet && npm ci && npx tsc --noEmit
```

---

## PRIORITY RANKING

| # | Item | Category | Impact | Effort | Priority |
|---|------|----------|--------|--------|----------|
| 1 | Hash staff PINs with bcrypt | Security | Critical | Low | **P0** |
| 2 | Auth on read endpoints | Security | Critical | Low | **P0** |
| 3 | CORS lockdown to LAN | Security | Critical | Low | **P0** |
| 4 | Sign M-Pesa webhooks | Security | Critical | Medium | **P0** |
| 5 | Rate limiting on auth + payments | Security | High | Low | **P1** |
| 6 | Replace console.log with pino | Quality | High | Medium | **P1** |
| 7 | Add Zod validation across routes | Quality | High | High | **P1** |
| 8 | Add CLAUDE.md | DX | High | Low | **P1** |
| 9 | Proper start_all.sh | DX | High | Low | **P1** |
| 10 | Database indexes | Performance | High | Low | **P1** |
| 11 | Complete .env.example | DX | Medium | Low | **P1** |
| 12 | Add missing tests (staff, events, internet) | Testing | Medium | Medium | **P2** |
| 13 | GitHub Actions CI | DX | High | Medium | **P2** |
| 14 | GitHub MCP + Postgres MCP in .mcp.json | Tooling | High | Low | **P2** |
| 15 | Claude Code hooks in settings.json | Tooling | High | Low | **P2** |
| 16 | Increase auth code length to 10 chars | Security | Medium | Low | **P2** |
| 17 | Move shared pricing to shared/ | Quality | Medium | Medium | **P2** |
| 18 | Fix 4 `as any` enum casts in sessions.ts | Quality | Medium | Low | **P2** |
| 19 | Align Next.js versions across all apps | Quality | Medium | Medium | **P2** |
| 20 | Cascade deletes in Prisma schema | DB | Medium | Low | **P2** |
| 21 | Add ESLint to API | Quality | Medium | Low | **P2** |
| 22 | Circuit breaker / withTimeout for ADB+Tuya | Resilience | High | Medium | **P3** |
| 23 | Socket.io authentication | Security | Medium | Medium | **P3** |
| 24 | Complete YAMNet audio detection | Feature | High | High | **P3** |
| 25 | Docker Compose for local dev | DX | Medium | Medium | **P3** |
| 26 | E2E tests with Playwright | Testing | High | High | **P3** |
| 27 | Complete AT webhook signature verification | Feature | High | Medium | **P3** |
| 28 | Load testing with Artillery | Testing | Medium | Low | **P4** |
| 29 | Monorepo root package.json with workspaces | Architecture | Medium | Medium | **P4** |
| 30 | /simplify + jCodeMunch workflow adoption | Tooling | Medium | Low | **P4** |

---

## WHAT'S ALREADY EXCELLENT

Before shipping improvements, it is worth noting what this codebase gets right:

1. **Mock/real factory pattern** applied consistently across all 6 external services
2. **Comprehensive audit trail** — SecurityEvent with JSON metadata captures every action
3. **Real-time features** — Socket.io integration across all apps for live countdown and status
4. **Payment idempotency** — M-Pesa callback handler correctly handles AT retries
5. **Power failure handling** — `remainingAtPowerLoss` math correctly preserves and restores time
6. **TypeScript strict mode** throughout all apps, zero type errors at baseline
7. **197 Node.js tests + 45 Python tests** — strong automated coverage
8. **Clean component architecture** — Next.js apps are well-structured with small focused components
9. **Consistent error responses** — all routes follow `{ error, code }` pattern
10. **WORKING-RULES.md** — clear standards document prevents drift in future work

---

*Analysis based on: 119 source files, 23 test files, prisma schema, all config files, SPEC.md and WORKING-RULES.md.*
