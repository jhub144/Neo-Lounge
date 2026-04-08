# Technical & Business Breakdown of Recommended Improvements

This document expands on the `recommended-improvements.md` file by providing both a simple business/workflow impact analysis and a concrete technical explanation for each major recommendation.

---

## 🛡️ Security (Protecting the Lounge from Bad Actors)

### 1. Add authentication to read endpoints
* **Business / Workflow Impact:** Prevents curious or malicious customers sitting in the lounge from using their laptops to peek at your business data (station status, pricing rules, etc).
* **Technical Detail:** Currently, `GET` endpoints like `/api/stations` lack authorization middleware. Any HTTP client on the local network can fetch this data. We need to implement a standard Express middleware (e.g., `requireStaff`) that validates an `x-staff-pin` header against active staff credentials before yielding the JSON response.

### 2. Hash staff PINs with bcrypt
* **Business / Workflow Impact:** Peace of mind. Even if the database is somehow copied or stolen, your staff's passwords remain safe and unreadable.
* **Technical Detail:** PINs are currently stored in plain text, making them fully vulnerable to SQL dumps or compromised DB access. Implementing a one-way cryptographic hash function via `bcrypt.js` with a secure work-factor (salt rounds) ensures that checking credentials relies on `bcrypt.compare()` rather than a naked string match.

### 3. Increase auth code length
* **Business / Workflow Impact:** Customers' private gaming clips are protected against theft. A 6-character code is relatively easy to guess; a 10-character code is nearly impossible.
* **Technical Detail:** A 6-character Base64URL string only has roughly 2.2 billion permutations. An automated script could easily brute-force this namespace to steal `ReplayClip` records. Expanding the token to 10 characters increases the entropy space to ~3.6 trillion combinations, effectively neutralizing enumeration attacks.

### 4. Lock down CORS to LAN only
* **Business / Workflow Impact:** Like pulling up the drawbridge on a castle, it seals off your system from internet-based attacks.
* **Technical Detail:** The Express server currently has overly permissive Cross-Origin Resource Sharing (CORS) rules. Restricting the `Access-Control-Allow-Origin` headers via regex to only match local subnets (`192.168.x.x`, `10.x.x.x`, `localhost`) ensures that rogue external web pages cannot execute Cross-Site Request Forgery (CSRF) or XHR polls against the local API.

### 5. Sign M-Pesa webhook callbacks
* **Business / Workflow Impact:** Eliminates the risk of financial fraud and customers tricking the system into giving them free game time.
* **Technical Detail:** Africa's Talking provides a webhook signature (`x-at-signature`) using an HMAC-SHA256 hash of the payload payload signed with a secret key. Currently, the API blindly accepts POST requests to `/api/payments/mpesa/callback`. Validating the HMAC ensures idempotency and guarantees the payload origin.

### 6. Add rate limiting
* **Business / Workflow Impact:** Makes it virtually impossible for someone to brute-force guess their way into the staff controls by guessing thousands of passwords a second.
* **Technical Detail:** Utilizing the `express-rate-limit` package on sensitive endpoints (like `/api/staff/login` and payment initializations) prevents denial-of-service and credential stuffing by restricting the number of HTTP requests a single IP address can make within a specified sliding time window.

### 7. Add Socket.io authentication
* **Business / Workflow Impact:** Just another layer of privacy to keep your lounge operations and live countdowns solely visible to authorized tablets and kiosks.
* **Technical Detail:** The Socket.io namespace currently accepts anonymous WebSocket upgrade handshakes. Implementing handshake authentication requires clients to pass a valid `auth.pin` token during connection establishment, verifying it against the Prisma DB before emitting state events.

---

## 🏛️ Code Quality & Architecture (Cleaning up the Foundation)

### 8 & 9. Replace console.log with a proper logger & Add request validation with Zod
* **Business / Workflow Impact:** Less random crashing. When bugs do happen, programmers can fix them in 5 minutes instead of 2 hours.
* **Technical Detail:** Generic `console.log` calls lack log-levels, JSON stringification, and context bindings (like execution IDs). Replacing them with `pino` allows structured logging that can be ingested by telemetry tools. Furthermore, untyped `req.body` handling leads to runtime panics. Using `zod` enforces strict schema validation and static type inference at the network boundary, rejecting malformed HTTP payloads with proper `400 Bad Request` context.

### 10. Move shared pricing logic to `shared/utils`
* **Business / Workflow Impact:** Future updates to your pricing will be fast and foolproof, changed in one place rather than five.
* **Technical Detail:** Implementing the DRY (Don't Repeat Yourself) principle. The pricing algorithm operates as isolated pure functions scattered across frontend (React components) and backend (Express routes). Migrating these into a discrete `@neo-lounge/shared` package inside a monorepo structure guarantees algorithmic parity across the stack.

### 11 & 12. Add database indexes & cascade deletes
* **Business / Workflow Impact:** The iPads and Kiosks remain lightning-fast forever, no matter how many years of customer history you save. It keeps the system clean.
* **Technical Detail:** Missing foreign-key cascade rules (`onDelete: Cascade`) lead to orphaned rows and referential integrity violations when parent `Session` records are purged. Additionally, missing B-Tree indexes on frequently scanned columns (like `status`, `sessionId`) will force PostgreSQL to perform sequential table scans (`Seq Scan`), leading to severe query latency degradation as row counts scale.

### 16. Implement circuit breaker for external calls
* **Business / Workflow Impact:** The software will never "freeze up" just because a physical wire to a smart plug got kicked out in the real world.
* **Technical Detail:** Network calls to the Android Debug Bridge (ADB) or Tuya local API lack inherent timeout constraints. Wrapping these asynchronous TCP requests in `Promise.race()` with a timeout rejects hanging promises early (Circuit Breaker pattern). This prevents Node.js from exhausting its active connection pool and degrading the event loop.

### 18. Complete YAMNet audio detection
* **Business / Workflow Impact:** Activates the specific feature of your lounge that gives customers videos of their best moments.
* **Technical Detail:** The audio ingestion pipeline requires completing the TensorFlow Lite (TFLite) inference loop. Specifically, routing NumPy float32 audio chunks through the YAMNet acoustic model, isolating the softmax confidence scores for specific ontologies (e.g., class IDs 137, 138 for cheering), and translating those into persisted `DetectionEvent` objects for the video clipper.

---

## 🤖 Developer Experience & Testing (Making Life Easier for Programmers)

### 19, 20 & 21. Add missing tests, E2E tests, and load testing
* **Business / Workflow Impact:** Updates are much safer. You won't have a nightmare scenario where an update breaks the "Pay" button on a busy Friday night.
* **Technical Detail:** The absence of comprehensive unit testing on infrastructure adapters (like the `InternetService`) leaves functional gaps. Introducing `Jest` for backend API spec enforcement, `Playwright` for headless browser End-to-End DOM interactions, and `Artillery` for concurrency and throughput validation ensures robust CI/CD regression protection.

### 22 & 29. Create a proper `start_all.sh` & Docker Compose
* **Business / Workflow Impact:** Your developers save time on tedious setup every single day, allowing them to spend more time building features.
* **Technical Detail:** Bootstrapping the distributed microservices ecosystem (Next.js SSR apps, Express API, Uvicorn FastAPI, PostgreSQL) mandates a unified orchestration layer. Providing a Bash initialization script and a declarative `docker-compose.yml` automates container networking, environment variable injection, and service dependency graphs.

### 24. Add `CLAUDE.md` to the project root
* **Business / Workflow Impact:** Any time you use AI to write code for this project in the future, it will do it correctly the first time because it read your rulebook.
* **Technical Detail:** LLMs suffer from context window limitations and architecture hallucination. `CLAUDE.md` acts as a deterministic system prompt that pins routing patterns, tech-stack versions, and strict coding invariants into the assistant's context memory prior to task execution.
