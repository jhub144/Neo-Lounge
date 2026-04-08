# Stage 11 Prompt Plan — Review Findings & Required Improvements

> Self-review of the Stage 11 additions made to `docs/PROMPT-PLAN-STAGES-4-10.md` and `todo.md` (commit `c6e1856`). This document lists every issue found and the fix needed before the prompts are run.

## Severity legend

- 🔴 **Blocker** — running the prompt as written would fail or produce broken code
- 🟡 **Important** — the prompt would run but leave gaps, conflicts, or rework
- 🟢 **Polish** — clarity, style, or convention issues

---

## 🔴 Blockers

### B1. Prompt 48 — missing `Session` schema fields used by later prompts

Prompts 58, 60, 63 all reference `Session.reelPath`, `Session.portraitReelPath`, and `Session.purgedAt`, but Prompt 48 never adds them. The migration will silently succeed, then Prompt 58 will fail at runtime when it tries to `UPDATE Session SET reelPath=…`.

**Fix:** Add to Prompt 48 under "Add to Session model":
- `reelPath String?`
- `portraitReelPath String?`
- `purgedAt DateTime?`
- `authCode String? @unique` (verify it doesn't already exist; required by reel QR URL in Prompt 58)

### B2. Prompt 58 — `ffmpeg -c copy` is incompatible with `-vf drawtext`

The reel assembly command uses `-c copy` *and* `-vf "drawtext=…"`. ffmpeg cannot apply video filters while stream-copying. The watermark filter forces a re-encode.

**Fix:** Change Prompt 58's reel command to:
```
ffmpeg -f concat -safe 0 -i concat.txt \
  -vf "drawtext=text='Neo Lounge':fontsize=20:fontcolor=white@0.4:x=20:y=20" \
  -c:v libx264 -preset fast -crf 22 -c:a aac \
  reel_landscape.mp4
```
Or split into two passes: concat with `-c copy`, then a second ffmpeg pass to overlay the watermark. The second pass is cheaper and avoids re-encoding the title/transition cards twice.

### B3. Prompt 62 — UPS shutdown `pkill` pattern is wrong

`pkill -SIGTERM -f "ffmpeg.*seg_%s.ts"` matches the *literal* string `seg_%s.ts`. At runtime, ffmpeg expands `%s` to a Unix timestamp in the actual filename, so this pattern matches nothing and no ffmpeg processes get signalled.

**Fix:** Change to `pkill -SIGTERM -f "ffmpeg.*seg_.*\\.ts"` or, better, target by capture script name: `pkill -SIGTERM -f "tv_capture.py\\|webcam_capture.py\\|security_capture.py"`.

### B4. Prompt 51 — duplicate-ClipJob check is unspecified

The EventMerger spec says "Check if a ClipJob already exists for this event cluster (by checking eventIds overlap). If not, create one." This isn't an actual SQL query — `eventIds` is an `Int[]` and there's no straightforward "overlap" check defined. Two merger cycles running back-to-back would create duplicate jobs.

**Fix:** Replace with a concrete strategy. Two viable options:
1. Add a `rootEventId Int @unique` column to `ClipJob`. The merger uses the earliest unmerged PendingEvent's id as the root. The unique index makes duplicate inserts a no-op via `ON CONFLICT DO NOTHING`.
2. Add an index on `(stationId, sessionId)` and check `WHERE eventIds && ARRAY[$rootId]` (Postgres array overlap operator) before insert. Slower but no schema change.

Update Prompt 48 to include whichever you pick.

### B5. Prompt 59 — `replay:all_ready` event has no producer

Prompt 59 listens for `replay:all_ready`, but no worker in Prompts 53–58 ever emits it. The tablet's `allReady` state will never flip.

**Fix:** Either delete the listener (the tablet can derive "all ready" from `clipReadyCount === totalClips`, but it doesn't know `totalClips` either), OR add an explicit emission step. The cleanest fix:
- In Prompt 55 (stitch worker) or Prompt 57 (AI effects worker), after marking a job DONE, query `COUNT(*) FROM ClipJob WHERE sessionId=… AND status NOT IN ('DONE','FAILED')`. If zero, emit `replay:all_ready`.
- Also have the tablet receive `totalClips` via the existing session state or via `replay:clip_ready` payload.

---

## 🟡 Important

### I1. Prompts 50–63 create new directories that ignore existing modules

The existing pipeline lives at:
- `services/video-pipeline/capture/` — already has `clips.py`, `stitcher.py`, `cleanup.py`, `mock_capture.py`, `router.py`
- `services/video-pipeline/detection/` — already has `detector.py`, `pipeline.py`
- `services/video-pipeline/security/` — already has `recorder.py`, `router.py`

My prompts create parallel new directories (`audio/`, `workers/`, `game_analyzer/`) and new files (`capture/ring_buffer.py`, `capture/tv_capture.py`, `capture/webcam_capture.py`, `capture/security_capture.py`, `capture/pruner.py`) without acknowledging the existing files. The result will be two parallel pipelines: the existing one still wired into the API router and the new one running independently.

**Fix:** Each affected prompt needs an explicit "before you start, read and refactor the existing module" instruction:
- Prompt 49 should refactor `capture/clips.py` and `capture/stitcher.py` to use the ring buffer (or explicitly retire them)
- Prompt 50 should refactor or replace `security/recorder.py`
- Prompt 51 should refactor `detection/detector.py` and `detection/pipeline.py` rather than create a new `audio/` directory
- Prompt 63 should refactor `capture/cleanup.py` rather than create `workers/session_cleanup.py`
- Each refactor prompt should include "remove or update the old API router registration in `capture/router.py` / `detection/router.py` / `security/router.py`"

### I2. Prompt 48 — no indexes on the new tables

The queries in later prompts will scan-and-sort frequently. Without indexes:
- Prompt 53: `SELECT … FROM ClipJob WHERE status='PENDING' ORDER BY enqueuedAt ASC LIMIT 1 FOR UPDATE SKIP LOCKED` — full table scan
- Prompt 51: `SELECT … FROM PendingEvent WHERE mergedIntoId IS NULL AND detectedAt > NOW() - INTERVAL '5 minutes'` — full table scan
- Prompt 58: `WHERE sessionId=… AND status='DONE'` — full table scan
- Prompt 63: `WHERE status='COMPLETED' AND endTime < NOW() - 1 hour AND purgedAt IS NULL` — full table scan

**Fix:** Add to Prompt 48:
```prisma
@@index([status, enqueuedAt])           // ClipJob
@@index([sessionId, status])            // ClipJob
@@index([mergedIntoId, detectedAt])     // PendingEvent
@@index([stationId, sessionId])         // PendingEvent
@@index([status, endTime, purgedAt])    // Session (the cleanup query)
```

### I3. Settings refresh is racy and doesn't account for restart

Prompt 51 says "Read `yamnetThresholdBase` from Settings at startup, refresh every 60s." Several other prompts have similar patterns. There's no specification for what happens when:
- Settings table is empty on first run (will the detector crash or use a hardcoded default?)
- The threshold change should propagate to the *event merger* and *game analyzer* (only the audio detector reads it in the spec)

**Fix:** Add a small `services/video-pipeline/common/settings_loader.py` step (new prompt or extend Prompt 48) that defines: `get_settings(refresh_if_older_than=60)` returning a frozen dict with documented defaults if Settings is empty. Then later prompts reference `from common.settings_loader import get_settings`.

### I4. Prompt 57 — slow-mo math doesn't match the source frame rate assumption

The prompt says `setpts=0.5*PTS` gives "real 2× slow-mo (120fps source → 60fps output)". This is wrong on two counts:
1. `setpts=0.5*PTS` *halves* presentation timestamps, which **speeds up** playback 2× — not slow it down. Slow-mo is `setpts=2.0*PTS`.
2. The webcam is 120fps but the **TV** layer is whatever the source TV stream is (probably 50fps PAL or 60fps NTSC). The stitched clip from Stage 2 has *one* frame rate (whichever Stage 2 chose to output), so the webcam's 120fps advantage is already lost unless Stage 2 was specifically configured to preserve 120fps in the PiP region — which it isn't.

**Fix:**
- Correct the filter to `setpts=2.0*PTS` for slow-mo
- Either (a) revisit Stage 2 to preserve 120fps source output (likely complicated for a PiP), OR (b) move the slow-mo step **before** Stage 2 by extracting the webcam clip alone, slow-mo'ing it to 60fps, then stitching, OR (c) accept that the slow-mo is fake (just frame interpolation via `minterpolate`) and document that.

Recommend option (c) with `minterpolate` for simplicity: `[slow]minterpolate=fps=60[smoothed];[smoothed]setpts=2.0*PTS[final]`.

### I5. Prompt 53 — webcam window calculation assumes session is known

`extract_webcam_clip(job)` says "Source dir: `/var/lounge/sessions/{sessionId}/webcam/`" but the webcam capture from Prompt 50 only starts capturing **when the session is active**. There will be no segments for the first ~10 seconds of the session, and any pre-roll window that crosses the session boundary will fail.

**Fix:** In Prompt 53, when no webcam segments exist for the requested window (or only a partial window), don't fail — log it, set `webcamClipPath=NULL`, and let the stitch worker handle it (it already has a code path for "no webcam"). The current spec says "log a warning and return None" but doesn't make clear the worker should still continue successfully.

### I6. Prompt 60 — assumes `apps/pwa` exists with no verification

The prompt edits `apps/pwa/src/__tests__/ReplayPage.test.tsx` and the replay PWA pages, but doesn't say "first read the existing PWA structure." If the actual PWA file layout differs, the prompt will create files in the wrong place.

**Fix:** Add at the top of Prompt 60: "First, run `ls apps/pwa/src/` and read the existing replay page implementation. Then update those files in place — do not create parallel files."

### I7. Prompt 54 — `GameReplay` rows have no `sessionId` cleanup path

GameReplay rows reference `sessionId`, but the cleanup worker in Prompt 63 only cleans up `Session` directories and nulls `ClipJob` paths. `GameReplay.clipPath` is not nulled, and the FIFA replay files at `/var/lounge/sessions/{session_id}/replays/` would be deleted by the `rmtree`, leaving dangling DB rows pointing to nonexistent files.

**Fix:** In Prompt 63, also `UPDATE GameReplay SET clipPath=NULL WHERE sessionId=…`.

### I8. Prompt 58 — title card font/asset path not specified

Pillow needs a TTF font path to render the title card. If you call `ImageFont.truetype("arial.ttf", …)` on a Linux mini PC, it will fail (no Arial). Default `ImageFont.load_default()` produces tiny text.

**Fix:** Specify in the prompt: install `fonts-dejavu-core` (apt package) and use `/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf` at size 64. Document this as a system dependency in the prompt.

### I9. Prompt 51 — "merge_window_seconds = 8" is hardcoded but Settings has `eventMergeWindowSeconds`

The prompt creates the EventMerger with `merge_window_seconds` as a constructor parameter and the test uses `8`, but Prompt 48 added `Settings.eventMergeWindowSeconds (default: 8)`. The merger should read from Settings, not have it injected as a constant.

**Fix:** Update Prompt 51 to "Read `eventMergeWindowSeconds` from Settings at startup, refresh every 60s" — same pattern as the audio detector's threshold.

### I10. Prompts 53/55/57 — three workers all use the same worker pattern; no shared base class

Each worker independently implements: connect to Postgres, LISTEN on a channel, select with `FOR UPDATE SKIP LOCKED`, watchdog notify, error handling. This is ~80 lines of duplication per worker.

**Fix:** Either add a Prompt 52.5 / Prompt 53a creating `services/video-pipeline/workers/base_worker.py` with a `BaseWorker` class first, OR explicitly accept the duplication and add a note: "duplication is acceptable here for clarity; do not refactor into a base class until all three workers are working."

---

## 🟢 Polish

### P1. Stray double horizontal rule in PROMPT-PLAN file

The append left this in the file:
```
**Total: 25 prompts (23–47), continuing from where Stage 3 left off.**

---

---

## Stage 11: Enhanced Video Pipeline …
```
The double `---` is harmless but ugly. Should be one separator.

### P2. The Stage 11 summary table at the bottom of PROMPT-PLAN-STAGES-4-10.md is duplicated by the existing Summary table at line 1023

There are now two summary tables in the file. Consider merging them or moving the original Stages 1-10 summary above Stage 11.

### P3. Caption library scope says "1000+" in SPEC, "40+" in Prompt 56

The SPEC (Section 15) describes a 1000+ entry caption library. Prompt 56 only asks for 40 entries as a starting set. This is intentional (40 is a feasible starting point), but the prompt should explicitly note "this is the seed set; the library will be grown over time" so the next reviewer doesn't think 40 is the final target.

### P4. No prompt covers seeding initial Settings values

Prompt 48 adds new Settings fields with `default` values, but the existing Settings table likely has only one row already created by an earlier seed. The Prisma `default` clause fires on insert, not on existing rows. The existing row will have `NULL` for the new fields.

**Fix:** Either (a) make the new fields `@default` non-null with sensible defaults so Prisma backfills on migration, or (b) add a one-line `prisma db seed` step to Prompt 48: `UPDATE Settings SET tvRingBufferSeconds=120, … WHERE id=1;`.

### P5. Tests reference `ImageFont`, `qrcode`, `pytesseract`, `onnxruntime`, `cv2.FaceDetectorYN`, `sdnotify`, `psycopg2` — none mentioned as dependencies

The prompts assume these Python packages are available but never mention adding them to `requirements.txt` (or `pyproject.toml`).

**Fix:** Add a new Prompt 47.5 OR a "Setup" section at the top of Stage 11: "Add to `services/video-pipeline/requirements.txt`: `opencv-contrib-python`, `onnxruntime`, `pytesseract`, `Pillow`, `qrcode`, `sdnotify`, `psycopg2-binary`. Run `pip install -r requirements.txt` before starting Prompt 49." Also note system packages: `ffmpeg`, `tesseract-ocr`, `smartmontools`, `nut-client`, `fonts-dejavu-core`.

### P6. Prompt 60 PWA test mocks the API but the API also got a new endpoint shape — they should be tested together

Prompt 60 updates `GET /api/replays/:sessionId` shape and writes a frontend test. The frontend test mocks the new shape. There's no contract test that asserts the **real** API returns the shape the frontend expects. Easy to drift.

**Fix:** In Prompt 60, the API test (`replays.test.ts`) should construct the *full* response object and assert each field the frontend reads — not just spot-check `portraitClipPath` and counts.

### P7. Stage 11 todo.md section uses `⬜` boxes, but the rest of todo.md uses `[x]` / `[ ]` GitHub-flavoured checkboxes

The summary table at the bottom of the Stage 11 todo section uses `⬜` Unicode squares while the actual checklists above use markdown `- [ ]`. Inconsistency only — both render fine.

---

## Recommended order of fixes

1. **First:** Apply all 🔴 blockers (B1–B5) directly to `docs/PROMPT-PLAN-STAGES-4-10.md` and `todo.md`. These are pure spec corrections — no code yet.
2. **Second:** Resolve I1 (existing module conflicts) by deciding for each existing file whether to refactor or retire. This is an architectural decision that affects 5–6 prompts.
3. **Third:** Add P5 (dependency setup) as a new "Stage 11 — Setup" prompt before Prompt 48.
4. **Fourth:** Add I2 (indexes) and B1 (Session fields) into the same Prompt 48 update.
5. Address remaining 🟡 items in prompt order.
6. 🟢 polish items can be batched into a single cleanup pass at the end.

---

## What I got right (sanity check)

- Prisma provider is `postgresql` (verified in `apps/api/prisma/schema.prisma:7`), so `Int[]`, `FOR UPDATE SKIP LOCKED`, and `LISTEN/NOTIFY` are all valid.
- Existing schema does not have `PendingEvent`, `ClipJob`, `GameReplay`, or `MatchState` — Prompt 48 is genuinely additive.
- The FIFO + LISTEN/NOTIFY pattern (Prompts 51, 53, 55, 57) is sound for the workload described in `MEMORY.md` (4 stations, ~10-min matches, low concurrency).
- The 1-hour cleanup window (Prompt 63) matches the user's stated requirement (`memory/project_video_pipeline.md`).
- Tablet UX rules (Prompt 59: no preview, no SMS, QR-only) match `docs/SPEC.md` Section 20 and the user's explicit instruction.

---

*Generated by self-review on branch `feat/security-hardening`. Apply fixes before running any Stage 11 prompt.*
