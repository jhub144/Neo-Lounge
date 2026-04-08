# Working Rules for Claude Code

> These are standing instructions. Read this file at the start of every session before doing any work.
> Also read the project's specification document (e.g. `docs/SPEC.md`) for full context.

---

## 1. Before You Start Any Work

1. Read this file (`docs/WORKING-RULES.md`) completely.
2. Read the project specification to understand the full system.
3. Check what already exists — look at the folder structure and run `git log --oneline -20` to see recent work.
4. Before writing new code, look at how existing files are structured and match the patterns you find.
5. If you're working in an area that already has code, read that code first. Don't reinvent what's already there.

---

## Environment & Tooling Constraints
- **Operating System:** WSL2 (Ubuntu)
- **Project Root Path:** `/home/janderson/devprojects/Neo-Lounge`
- **MCP Server:** Use **jCodeMunch** located at `/home/janderson/.local/bin/jcodemunch-mcp`.
- **Command Execution:**
  - Always use absolute Linux paths for the `Cwd` parameter (e.g., `/home/janderson/...`).
  - NEVER use Windows paths or UNC paths (no `\\wsl.localhost\`).
  - PostgreSQL management is passwordless (`sudo service postgresql start`).
- **Efficiency:** Prioritize jCodeMunch for symbol searches and indexing to minimize credit usage.

---

## 2. Code Quality Rules

### Follow Existing Patterns
- Look at how existing files are structured before creating new ones. Match the style.
- Use the same naming conventions already in the codebase (file names, variable names, function names).
- Use the same error handling pattern already established in existing code.
- Use the same folder organisation. Don't create new top-level folders without asking.

### TypeScript
- Strict TypeScript. No `any` types unless absolutely unavoidable — and if you must, add a comment explaining why.
- All API responses should have typed interfaces.
- Share types between apps when the same type is needed in multiple places.
- Use `async/await` everywhere. No raw `.then()` chains.

### Python
- Type hints on all function signatures.
- Use `async` endpoints where appropriate.
- Follow the existing file structure.

### General
- No hardcoded values. Configuration goes in environment variables or a settings/config system.
- No magic numbers in code. Use named constants.
- Never leave `console.log` or `print` debug statements in committed code. Use the project's logging pattern.
- Keep functions short and focused. If a function is doing three things, it should probably be three functions.

---

## 3. Testing Rules

### Write Tests With Every Feature
- Every new API endpoint needs at least one test covering the success path and one test covering the primary failure case.
- Core business logic (calculations, state machines, validation) needs thorough unit tests.
- Use the existing test framework already in the project.

### Run Tests Before Committing
- After building a feature, run the project's test command.
- If tests fail, fix them before moving on. Do not commit failing tests.
- If an existing test breaks because of your changes, that's a sign something might be wrong with your approach — investigate before just updating the test to pass.

### Test What a User Would See
- For API endpoints: test the HTTP response status, response body shape, and side effects (e.g., "after creating X, the status of Y should change").
- For real-time features: verify events are emitted with the correct payload after the triggering action.

---

## 4. Database Rules

### Schema Changes
- After any schema change, create a proper migration. Don't manually edit the database.
- Never edit migration files by hand after they've been created.
- The seed file should always produce a working test state that lets someone start using the app immediately after setup.

### Data Integrity
- Use database transactions for any operation that touches multiple tables — all must succeed or all must fail.
- All foreign keys should have appropriate delete behaviour defined in the schema.
- Validate data at the API boundary before it reaches the database.

---

## 5. API Design Rules

### RESTful Conventions
- Follow the endpoint structure defined in the project specification.
- Use proper HTTP methods: GET for reading, POST for creating, PATCH for updating, DELETE for removing.
- Return appropriate status codes: 200 for success, 201 for created, 400 for bad input, 401 for unauthenticated, 403 for unauthorised, 404 for not found, 409 for conflicts.
- Protect endpoints with the project's authentication/authorisation middleware.

### Error Responses
- Errors should return a consistent JSON shape: `{ error: "Human-readable message", code: "MACHINE_READABLE_CODE" }`.
- Never expose internal error details (stack traces, SQL errors, file paths) to the client.

### Validation
- Validate all incoming request data before processing. Check required fields, types, and valid ranges.
- Reject bad input at the API boundary with clear error messages.

---

## 6. Frontend Rules

### Design System
- Follow the project's design system as defined in its specification.
- Touch targets must be at least 44px × 44px for mobile/tablet use.
- Test that the UI works on the devices it's designed for (phone, tablet, desktop — whatever the spec calls for).

### State Management
- Use real-time connections (WebSocket, SSE) for live data where the spec requires it. Don't poll unless there's a good reason.
- Use optimistic UI where safe: show the expected result immediately while the API call completes. Roll back if it fails.

### Internationalisation
- If the project spec mentions future language support, externalise all user-facing strings from the start.
- Never hardcode user-facing text directly in components.

---

## 7. External Service & Hardware Rules

### Mock-First Development
- All external services (payment providers, hardware, third-party APIs) should be accessed through service modules with a clean interface.
- Every service module must have a mock implementation that logs actions and returns success.
- Mock vs real should be controlled by environment variables so you can switch without changing code.
- Never call external services directly from business logic. Always go through the service module.

### Credentials & Secrets
- All API keys, credentials, and secrets go in environment variables. Never commit them to the repository.
- Use a `.env` file locally with a `.env.example` committed to the repo showing which variables are needed (with placeholder values, not real credentials).

---

## 8. Security & Audit Rules

### Logging
- Log significant user actions (payments, status changes, admin actions) to an audit trail.
- Audit records should include: who, what, where, when, and relevant context.
- Never log sensitive data (passwords, full payment details, personal information) in plain text.

### Authentication
- All state-changing endpoints must require authentication.
- Admin/owner actions must require elevated permissions.
- Log authentication events (login, logout, failed attempts).

### Payment Security (if applicable)
- Payment webhook handlers must be idempotent — always check if the transaction is already processed before updating.
- Validate webhook signatures. Don't blindly trust incoming data.
- Lock resources during payment to prevent concurrent conflicts.

---

## 9. Committing Rules

### Commit After Every Meaningful Chunk
- One feature, one commit. Don't bundle unrelated changes.
- Use descriptive commit messages that say what was built, not just "update files".
- Good: `git commit -m "Add session extend endpoint with pricing calculation and tests"`
- Bad: `git commit -m "updates"`

### Push Regularly
- Run `git push` at the end of every work session.
- This ensures backup and makes your progress visible.

---

## 10. When You're Unsure

- If a design decision isn't covered by the project specification, explain the options and ask which approach to take.
- If you need to change something that conflicts with the spec, explain why and ask for approval.
- If a feature is marked as "post-launch" or "deferred" in the spec, do not build it unless explicitly asked.
- Default to the simplest working solution. Don't over-engineer.

---

## 11. How to Use This File

When starting a work session, paste something like this into Claude Code:

```
Read docs/WORKING-RULES.md and docs/SPEC.md.

Here's what I want to build today:
[paste your stage brief or describe what you want]
```

Claude Code will follow these rules automatically for the session. If it drifts from the rules, remind it:

```
Check docs/WORKING-RULES.md — you should be [writing tests / following the existing pattern / using the locale system / etc].
```
