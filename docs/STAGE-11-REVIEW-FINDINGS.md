# Stage 11 Review — SPEC.md ↔ Prompt Plan ↔ todo.md Consistency Findings

> Cross-document consistency review of the three documents that drive Stage 11:
> - `docs/SPEC.md` (the source of truth)
> - `docs/PROMPT-PLAN-STAGES-4-10.md` Stage 11 section (Prompts 48–64)
> - `todo.md` Stage 11 section
>
> **TL;DR:** The Stage 11 prompts and todo list were written without keeping SPEC.md open, and they diverge from the spec on schema field names, enum values, default values, API routes, section references, and core behaviour. **Almost every prompt needs corrections before it can be safely run.** This document lists every divergence and the fix required.

---

## Severity legend

- 🔴 **Blocker** — running the prompt as written would produce code that breaks the spec
- 🟡 **Important** — the prompt would run but the resulting code would not match SPEC and would be reworked later
- 🟢 **Polish** — wording, references, or cosmetics

---

## 🔴 Blockers (must fix before running any prompt)

### B1. Every Prisma model in Prompt 48 has the wrong field names

The schema in **SPEC.md §5** is the contract; the schema in **Prompt 48** invented different names. If you run Prompt 48 as written, every later prompt that touches these tables will be querying fields that don't match the spec.

#### `PendingEvent` — almost completely different

| Field in SPEC §5 | Field in Prompt 48 | Status |
|---|---|---|
| `eventType` (enum) | `type` (enum) | ❌ wrong name |
| `eventTimestamp: Float` (unix epoch) | `detectedAt: DateTime` | ❌ wrong type and name |
| `source` (enum: AUDIO_AI/GAME_ANALYZER/BOTH) | `source: String` ("audio" / "game_analyzer") | ❌ no enum, no BOTH |
| `audioConfidence: Float` | `peakAmplitude: Float?` | ❌ wrong concept |
| `matchMinute: Int` | `gameMinute: Int?` | ❌ wrong name |
| `homeScore`, `awayScore: Int` | `scoreDelta: Int?` | ❌ collapses two fields into one |
| `mergedWithEventId: Int?` | `mergedIntoId: Int?` | ❌ wrong name |
| `processed: Boolean default false` | *(missing)* | ❌ missing |
| `gameId: Int` | *(missing)* | ❌ missing |
| `preRollSeconds: Int default 10` | *(in Prompt only)* | ❌ not in SPEC |
| `postRollSeconds: Int default 15` | *(in Prompt only — and value is wrong, see B2)* | ❌ |

#### `EventType` enum — almost no overlap

| SPEC §5 enum value | Prompt 48 enum value |
|---|---|
| `GOAL_CANDIDATE` | `GOAL_AUDIO` |
| `PENALTY_MISS` | *(missing)* |
| `RED_CARD` | `CARD_EVENT` (collapsed) |
| `YELLOW_CARD` | `CARD_EVENT` (collapsed) |
| `MATCH_END` | `MATCH_END` ✅ |
| `SCORE_CHANGE` | `GAME_REPLAY` (replaced with unrelated value) |
| *(no equivalent)* | `CROWD_NOISE` (Prompt invented) |
| *(no equivalent)* | `CELEBRATION` (Prompt invented) |

The SPEC distinguishes red and yellow cards (deliberately — they have different audio profiles); Prompt 48 collapses them. The SPEC has `SCORE_CHANGE` from OCR; the Prompt drops it. The SPEC lacks `GAME_REPLAY` as a PendingEvent type because GameReplays are tracked in their own `GameReplay` table.

**Fix:** Rewrite Prompt 48 to match SPEC §5 field-for-field. Use the SPEC enum values exactly. Remove the invented Prompt 48 enum entirely.

#### `ClipJob` — wrong status enum, wrong field names, missing fields

| Field in SPEC §5 | Field in Prompt 48 | Status |
|---|---|---|
| `clipStart: Float`, `clipEnd: Float` | *(missing — Prompt uses `eventIds: Int[]` only)* | ❌ |
| `eventTypes: String[]` | `eventIds: Int[]` | ❌ different concept |
| `gameReplayPath: String?` | *(missing)* | ❌ missing |
| `stitchedPath` | `stitchedClipPath` | ❌ wrong name |
| `enhancedPath` | `finalClipPath` | ❌ wrong name |
| `portraitPath` | `portraitClipPath` | ❌ wrong name |
| `enqueued_at` (snake_case in SPEC) | `enqueuedAt` (camelCase) | ⚠️ snake_case in spec is unusual; clarify with user but Prisma convention is camelCase, so Prompt is probably right and SPEC has a typo |
| `priority: Int default 0` | *(missing)* | ❌ missing |
| `startedAt`, `completedAt` | *(in Prompt only)* | ❌ not in SPEC |

`ClipJobStatus` enum in SPEC: `PENDING / EXTRACTING / STITCHING / ENHANCING / DONE / FAILED`
`ClipJobStatus` enum in Prompt 48: `PENDING / EXTRACTING / STITCHING / AI_EFFECTS / DONE / FAILED`

The Prompt renamed `ENHANCING` → `AI_EFFECTS`. Pick one and use it everywhere. SPEC value is `ENHANCING`.

**Fix:** Rewrite ClipJob in Prompt 48 to match SPEC. Add `clipStart`/`clipEnd` (or document why event-id-only lookup is preferred). Use `ENHANCING` not `AI_EFFECTS`.

#### `GameReplay` — completely different model

| Field in SPEC §5 | Field in Prompt 48 |
|---|---|
| `replayStart: Float`, `replayEnd: Float` | `startSegment: String`, `endSegment: String` |
| `confidence: Float` | *(missing)* |
| `used: Boolean default false` | *(missing)* |
| *(no equivalent)* | `clipPath: String?`, `durationSeconds: Float?` |

SPEC's GameReplay is a *detection record* with timestamps; the actual extracted file becomes part of a `ClipJob.gameReplayPath` (`used=true` after the link is made). Prompt 48 invents a model that stores its own clip file, breaking the SPEC's design where FIFA replays are *attached to* matched events, not standalone.

**Fix:** Rewrite GameReplay to match SPEC. Update Prompt 54 to populate `ClipJob.gameReplayPath` (not write to its own file path) — see B6.

#### `MatchState` — wrong field names, missing field, extra invented field

| Field in SPEC §5 | Field in Prompt 48 |
|---|---|
| `capturedAt: DateTime` | `lastUpdated: DateTime` |
| `isReplayShowing: Boolean` | `isReplayOnScreen: Boolean` |
| `rawOcrText: String` (debug) | *(missing)* |
| *(no equivalent)* | `phase: String` (Prompt invented "pre_match"/"first_half"/etc) |

The `phase` field is Prompt-only and never used by any other prompt. The `rawOcrText` field is in SPEC for debugging and is missing from the Prompt.

**Fix:** Use SPEC names. Drop `phase`. Add `rawOcrText`.

#### `Settings` — wrong field names AND wrong default values

| SPEC §5 field name & default | Prompt 48 field name & default | Issue |
|---|---|---|
| `clipPostRollSeconds: 25` | `clipPostRollSeconds: 15` | 🔴 **wrong default** — 10s difference |
| `eventMergeWindowSeconds: 25` | `eventMergeWindowSeconds: 8` | 🔴 **wrong default** — 17s difference |
| `yamnetConfidenceThreshold: 0.55` | `yamnetThresholdBase: 0.45` | 🔴 wrong name AND wrong default |
| `replayDetectionThreshold: 0.80` | *(missing)* | 🔴 missing |
| `tensionAudioThreshold: 0.40` | *(missing)* | 🔴 missing |
| `replayTTLMinutes: 60` | *(missing — Prompt 63 hardcodes "1 hour")* | 🔴 cleanup should read from Settings |
| `alertTempCelsius: 80` | *(missing — Prompt 62 hardcodes 80°C)* | 🔴 |
| `alertSmsNumber: String` | *(missing — Prompt 62 references `Settings.ownerPhone`)* | 🔴 wrong field name |
| *(no equivalent in SPEC)* | `audioDetectionEnabled`, `stage2Enabled`, `stage3Enabled` | 🟢 Prompt-only feature flags, harmless additions |

The two default-value mismatches (`clipPostRollSeconds`, `eventMergeWindowSeconds`) are particularly damaging because they would change the **behaviour** of the EventMerger. With merge_window=8 instead of 25, events that the SPEC intends to merge into one drama-arc clip will be split into multiple clips. This is exactly the bug the EventMerger was designed to prevent.

**Fix:** Rewrite Prompt 48's Settings additions to match SPEC §5 exactly. Update Prompts 62 and 63 to read from `alertSmsNumber`, `alertTempCelsius`, `replayTTLMinutes` respectively (not hardcoded constants and not invented field names).

---

### B2. Pre-roll/post-roll values disagree with SPEC

SPEC §9 EventMerger:
```python
pre_roll = 10         # seconds before event
post_roll = 25        # seconds after event
merge_window = 25
```

Prompt 48 PendingEvent default values:
```
preRollSeconds Int default 10   ✅ matches
postRollSeconds Int default 15  🔴 wrong (SPEC says 25)
```

Prompt 51 EventMerger description: "merge_window_seconds = 8" 🔴 (SPEC says 25)

**Fix:** Change Prompt 48 PendingEvent default `postRollSeconds` to 25. Change Prompt 51 to read merge window from `Settings.eventMergeWindowSeconds` (default 25) — never hardcode it.

---

### B3. Replay PWA API routes use the wrong path

SPEC §6 Replay Endpoints:
```
GET /api/replays/:authCode
GET /api/replays/:authCode/status
GET /api/replays/:authCode/reel
GET /api/replays/:authCode/reel/portrait
GET /api/replays/:authCode/clip/:id
GET /api/replays/:authCode/clip/:id/portrait
```

Prompt 60 (PWA Updates) and Prompt 63 (cleanup):
```
GET /api/replays/:sessionId
```

The SPEC keys replays by `Session.authCode` (a 6-char unique code embedded in the QR). The Prompt assumes `:sessionId`. These are incompatible: customers scanning a QR code only have the auth code, not the session ID. Building Prompt 60 against `:sessionId` would mean the QR code contains the session ID directly — a security issue (session IDs are sequential and easy to enumerate).

**Fix:**
- Prompt 60: change all route references from `:sessionId` to `:authCode`
- Prompt 60: the response shape spec (`totalClips`, `doneClips`, `reelReady`, `reelUrl`, `portraitReelUrl`, per-clip `portraitClipPath`/`status`) needs to be added to **SPEC §6** as well so the SPEC documents this richer status payload — currently SPEC only lists six raw GET endpoints with no body schema
- Prompt 63: the 410 Gone behaviour is on `/api/replays/:authCode`, not `:sessionId`

---

### B4. System Health endpoints diverge between SPEC and Prompt 61

SPEC §6 lists **four** health endpoints:
```
GET /api/system/health/temperature
GET /api/system/health/nvme
GET /api/system/health/services
GET /api/system/health/disk
```

Prompt 61 creates **two** different endpoints:
```
GET /api/system/health/hardware    (combines temp + nvme + service status)
GET /api/system/health/pipeline    (clip job counts + ring buffer stats)
```

Pick one design and apply it to both documents. The four-endpoint version in SPEC is more REST-y; the two-endpoint version in Prompt 61 is more practical for the dashboard panel.

**Fix:** Decide and align. Recommend keeping Prompt 61's two-endpoint design (it matches how the dashboard actually uses the data), then update SPEC §6 to replace the four-endpoint table with the two new endpoints.

---

### B5. WebSocket events: `replay:all_ready` is in SPEC but no Prompt produces it

SPEC §6 WebSocket Events:
```
replay:clip_ready  — One clip ready
replay:all_ready   — All clips done
replay:reel_ready  — Full highlight reel assembled
```

Prompt 59 (tablet) listens for `replay:all_ready`. But none of Prompts 53–58 emit it. The tablet's `allReady` state will never flip.

**Fix:** Add to Prompt 57 (AI effects worker) and Prompt 55 (stitch worker, for stage-3-disabled mode): after marking a job DONE, run:
```sql
SELECT COUNT(*) FROM clip_jobs
WHERE sessionId=$1 AND status NOT IN ('DONE','FAILED')
```
If zero, emit `replay:all_ready` to the session room.

Also: SPEC §6 lists `game:event_captured` (counter++ on tablet). Prompt 59 doesn't listen for it. Add a listener.

Also: SPEC §6 lists `system:temperature_warning`. Prompt 62 only sends SMS — it should also emit this WebSocket event so the dashboard can show the alert without waiting for the next health poll.

---

### B6. Prompt 54 contradicts the SPEC on FIFA replay storage

SPEC §5 ClipJob has a `gameReplayPath` field. SPEC §5 GameReplay has a `used: Boolean` field. The intended flow per SPEC: when a ClipJob is being extracted, check whether a GameReplay row exists with `replayStart`/`replayEnd` overlapping the clip window — if yes, extract it and store the path in `ClipJob.gameReplayPath`, then mark `GameReplay.used = true`.

Prompt 54 instead writes a standalone file at `/var/lounge/sessions/{session_id}/replays/fifa_{replay_id}.ts` and stores the path on `GameReplay.clipPath`. There is no link to any ClipJob, so the FIFA replay never makes it into the highlight reel that the SPEC intends.

**Fix:** Rewrite Prompt 54 to match SPEC's intent. The replay harvester should only write detection records (start/end timestamps); the **clip extractor** (Prompt 53) is responsible for checking the GameReplay table when it processes a ClipJob and pulling the matching FIFA replay segment into the same output, populating `gameReplayPath`. Update Prompt 53 accordingly.

---

### B7. Prompt 49's ring buffer strategy contradicts SPEC §7

SPEC §7 specifies the TV capture using ffmpeg's **built-in** segment wrapping:
```bash
-f segment -segment_time 2 -segment_format mpegts \
-segment_wrap 60 -reset_timestamps 1 \
/run/lounge/tv%i/seg_%03d.ts
```

`-segment_wrap 60` makes ffmpeg automatically overwrite `seg_000.ts` after writing `seg_059.ts`. This is the entire ring buffer mechanism — no Python pruner needed, no Unix-timestamp filenames.

Prompt 49 instead invents:
- Filename pattern `seg_%s.ts` (Unix timestamp via `strftime`)
- A separate Python `pruner.py` daemon running every 5 seconds
- Its own systemd unit (`neo-lounge-ring-pruner.service`)

This is ~150 lines of completely unnecessary Python and an extra running service. The SPEC's ffmpeg-native approach is simpler, more correct, and zero-maintenance.

**Fix:** Rewrite Prompt 49:
- Use `-segment_wrap 60` and `seg_%03d.ts` filenames
- Delete the entire `pruner.py` step
- Delete `RingBuffer.prune()` method
- Keep `RingBuffer.get_segments_in_window()` but rewrite it: since filenames are now sequence numbers, segment-to-time mapping requires tracking the wrap point. Easier alternative: read the file mtime instead of parsing the filename.
- Delete the `neo-lounge-ring-pruner.service` systemd unit
- Update the test file to no longer test pruning

This change cascades into Prompts 53 and 54 (clip extraction logic that reads the segments).

---

### B8. Prompt 50 — webcam frame rate wrong for 3 of 4 stations

SPEC §7 explicitly states:
> Station 1-3: 720p 60fps. Station 4: 720p 120fps (Stage 3 slow-mo cam)

Only **one** webcam is 120fps, and it's specifically for Stage 3 slow-motion sourcing. Prompt 50 says "Capture at 720p 120fps" for **every** station, which:
1. Forces every station to have an expensive 120fps camera (the spec only requires one)
2. Quadruples webcam disk usage (4 × 120fps vs 3 × 60fps + 1 × 120fps)
3. Doesn't match the user's Memory note ("4 webcams" + earlier discussion about cost in a Kenya slum lounge)

**Fix:** Update Prompt 50:
- Default capture: 720p 60fps
- Only the station whose `Station.analysisWebcamDevice` is set (or whose `Station.id` matches the configured slow-mo station) captures at 120fps
- The decision should be per-station, read from the `Station` row at startup

---

### B9. Every "Read SPEC.md (Section X)" reference in Prompts 49–63 is wrong

I numbered the section references by guesswork instead of opening SPEC.md. Almost all of them point to wrong sections.

| Prompt | Says "read…" | Actual SPEC section |
|---|---|---|
| 49 | Section 7 — Storage Layout | §2 has Storage Layout (line 89) |
| 49 | Section 8 — TV Ring Buffer | §7 has TV ring buffer details (line 340) |
| 50 | Section 8 — Webcam Capture | §7 has Webcam Streams (line 374) |
| 50 | Section 8 — Security Camera Capture | §7 has security cam details |
| 51 | Section 10 — Audio Detection | §7 has audio detector; §9 has EventMerger |
| 51 | Section 11 — EventMerger | §9 has EventMerger (line 488) |
| 52 | Section 9 — Game Stream Analysis | §8 (line 416) |
| 53 | Section 12 — Clip Extraction Worker | §10 Clip Processing Queue (line 541) |
| 53 | Section 13 — Clip Queue | §10 (line 541) |
| 55 | Section 14 — Stage 2 Stitch Worker | §11 Replay Processing — Stage 2 (line 606) |
| 56 | Section 15 — Caption Library | §12 (line 729) |
| 57 | Section 16 — Stage 3 AI Effects | §11 Replay Processing — Stage 3 (line 628) |
| 58 | Section 17 — Highlight Reel Assembly | §13 (line 812) |
| 59 | Section 20 — Tablet UX Rules | §20 ✅ correct |
| 60 | Section 18 — PWA Delivery | §14 Clip Delivery PWA (line 846) |
| 61 | Section 19 — System Health | §16 Reliability and Operations (line 902) |
| 62 | Section 19.2 / 19.3 / 19.4 | §16 has all reliability subsections |
| 63 | Section 18.3 — Storage Lifecycle | §15 (line 863) |

**Fix:** Rewrite every "Read SPEC.md (Section X — Y)" line in the prompt plan to point to the correct section number. Better yet: drop the section numbers entirely and reference only by title (e.g. "Read SPEC.md sections on EventMerger and Clip Processing Queue") so they don't break when the spec is renumbered later.

---

## 🟡 Important

### I1. Game stream resolution mismatch

SPEC §7 game-analyzer ffmpeg command: `-vf scale=320:240 -r 2` (320×240).
Prompt 52 `frame_reader.py`: `-vf scale=427:240 -r 2` (240p tall, 427 wide).

The aspect ratio is different (4:3 vs 16:9). The OCR crop coordinates in Prompt 52 (`y=10:40, x=150:280`) and the template-matching templates would all need to change between these.

**Fix:** Use 320×240 to match SPEC. Update OCR crop coordinates accordingly.

### I2. SPEC has Event Corroboration; Prompt 52 doesn't implement it

SPEC §8 Event Corroboration: when both audio and game analyzer fire for the same event window, the source should be `BOTH` (highest confidence). Audio-only events with confidence < 0.65 should be flagged as low-confidence.

The Prompt 48 schema (with its String-typed `source` field) and Prompt 52 (which only writes `source="game_analyzer"`) cannot represent this. The corroboration logic doesn't exist in any prompt.

**Fix:**
- Prompt 48: change `PendingEvent.source` to a proper `EventSource` enum: `AUDIO_AI | GAME_ANALYZER | BOTH`
- New responsibility (add to Prompt 51 EventMerger): when an audio event arrives within N seconds of an existing game-analyzer event for the same station, mark the merged record as `BOTH` rather than creating two events

### I3. SPEC's MATCH_END handling is missing from prompts

SPEC §9 Edge Cases: "When session ends, a final event of type MATCH_END is added with `clip_start = session_end_time`, `clip_end = session_end_time + 60`. Webcam continues recording these 60 seconds."

No prompt implements this. The session-end hook in Stage 8 doesn't know about PendingEvents, and no Stage 11 prompt extends it.

**Fix:** Add a small step to Prompt 51 (EventMerger): on receiving a session-ended signal (or as a separate API hook in `apps/api`), insert a synthetic `PendingEvent` with `eventType=MATCH_END` and the right window. The webcam capture in Prompt 50 also needs to keep recording for an extra 60 seconds after session end (currently it stops on SIGTERM immediately).

### I4. Caption library scope: 1000+ entries in SPEC, 40 in Prompt

SPEC §12: "We need ~1000 caption variants" implied by the rich Sheng/Swahili examples and the by-context/by-emotion structure.
Prompt 56: "At least 40 entries".

40 is a reasonable seed but the Prompt should explicitly say so: "This is the seed library — full library will reach ~1000 entries over time. The 40 here cover the highest-frequency contexts." Otherwise a future agent will think 40 is the target and stop there.

### I5. Prompt 57's slow-mo filter is mathematically backwards

`setpts=0.5*PTS` halves presentation timestamps, which **speeds video up** by 2× — not slow it down. Slow motion is `setpts=2.0*PTS`.

SPEC §11 Stage 3 says "120fps webcam → 60fps output = real 2× slow motion." That math only works if the source is encoded at 120fps and you instruct ffmpeg to play it at 60fps via the `-r 60` output flag *without* a setpts filter (or with `setpts=2.0*PTS` to interpolate timestamps correctly).

**Fix:** Change Prompt 57 to `setpts=2.0*PTS` and explicitly note: only the Station 4 webcam (the 120fps cam from B8) gets real slow-mo; other stations get either no slow-mo or fake slow-mo via `minterpolate`. The current Prompt assumes all stations are 120fps, which is not what SPEC says.

### I6. Prompt 57 filter chain mixes incompatible filters

The Prompt's filter graph:
```
[0:v]setpts=0.5*PTS[slow];
[slow]zoompan=z='zoom+0.002':...:d=75[zoomed];
[zoomed]drawtext=...
```
- `zoompan` outputs at the source frame rate by default; chained after `setpts` it produces wonky output
- `d=75` is "zoom over 75 frames" which at 60fps is 1.25 seconds — applied to the *whole* clip the zoom never holds, it just keeps zooming forever
- `drawtext` should be rendered onto the final composited output, not into the zoom chain

**Fix:** Build the filter chain as three discrete steps (extract face crop region → scale up → apply slow-mo → drawtext), ideally in two ffmpeg passes for clarity. Have a competent video engineer (or Claude with the spec open) redesign this filter graph.

### I7. ClipJob has no `clipStart`/`clipEnd` so the worker can't compute the extract window

Because Prompt 48 omitted SPEC's `clipStart` and `clipEnd` Float fields, Prompt 53's clip extractor has to:
1. Read all `eventIds` from the ClipJob
2. SELECT each PendingEvent
3. Min/max their `detectedAt` to derive the window

…on every job. The SPEC stores the resolved window directly on the ClipJob row. The Prompt's design works but is slower and couples the extractor to the EventMerger's merge logic forever.

**Fix:** Add `clipStart`/`clipEnd` to Prompt 48 ClipJob (per SPEC). EventMerger writes them at insert time. Extractor reads them directly. Drop the eventIds-based window calculation in Prompt 53.

### I8. Prompt 53 webcam extraction will crash on session-start clips

If a clip's pre-roll window starts before `webcam_capture.py` began recording (e.g. an event in the first 10 seconds of a session), there will be no segment files for that part of the window. Prompt 53 says "log a warning and return None" — but the warning means *no webcam clip at all*, which is too aggressive. The correct behaviour is to extract whatever segments DO exist (clamped to the recording start) and stitch a partial-coverage clip.

**Fix:** Update Prompt 53 to clamp the window to the first available segment instead of returning None.

### I9. Prompt 63 hardcodes "1 hour" instead of reading `Settings.replayTTLMinutes`

SPEC §5: `replayTTLMinutes: Int default 60`. The cleanup query in Prompt 63 should be `endTime < NOW() - INTERVAL '{replayTTLMinutes} minutes'`, not hardcoded `'1 hour'`.

Prompt 63 must read `replayTTLMinutes` from Settings at startup.

### I10. Existing pipeline directories are ignored

The codebase already has:
- `services/video-pipeline/capture/{clips.py, stitcher.py, cleanup.py, mock_capture.py, router.py}`
- `services/video-pipeline/detection/{detector.py, pipeline.py, router.py}`
- `services/video-pipeline/security/{recorder.py, router.py}`

My prompts create parallel new directories (`audio/`, `workers/`, `game_analyzer/`) and never say what to do with the existing modules. The result will be **two parallel pipelines** running side-by-side.

**Fix:** Each affected prompt needs an explicit "before you start, read and refactor" instruction:
- Prompt 49: refactor `capture/clips.py` (already uses `ffmpeg -f concat -c copy` — close to the new design)
- Prompt 50: refactor `security/recorder.py`, not create new `security_capture.py`
- Prompt 51: refactor `detection/detector.py` and `detection/pipeline.py`, not create new `audio/`
- Prompt 55: refactor `capture/stitcher.py`, not create new `workers/stitch_worker.py`
- Prompt 63: refactor `capture/cleanup.py`, not create new `workers/session_cleanup.py`
- Each refactor prompt should also include "remove or update the old API router registration"

### I11. todo.md inherits every error in the prompt plan

Because todo.md was generated from the prompt plan, it has all the same bugs:
- Wrong field names in the Prompt 48 todo checklist (`type`, `mergedIntoId`, `gameMinute`, `scoreDelta`, `phase`, `lastUpdated`, `isReplayOnScreen`, `webcamDevice`, etc.)
- Wrong default values (`postRollSeconds=15`, `eventMergeWindowSeconds=8`, `yamnetThresholdBase`)
- Wrong API routes (`:sessionId` instead of `:authCode`)
- Wrong Settings field references (`ownerPhone` instead of `alertSmsNumber`)
- Wrong frame size (427×240 instead of 320×240)
- Wrong webcam frame rate (120fps for all stations instead of one)
- Wrong slow-mo filter math (`setpts=0.5*PTS`)
- The pruner.py checklist that shouldn't exist
- Missing checklist items for: corroboration logic (BOTH source), MATCH_END synthetic event, gameReplayPath linking, replayTTLMinutes from Settings

**Fix:** After fixing the prompt plan, regenerate the todo.md Stage 11 section from the corrected prompts. Do not patch todo.md by hand — too many small changes, easy to miss one.

---

## 🟢 Polish

### P1. Stray double horizontal rule

`docs/PROMPT-PLAN-STAGES-4-10.md` line ~1037–1040 has `---\n\n---` between the Summary table and the Stage 11 section. Should be a single separator.

### P2. Two summary tables in the prompt plan file

The original Stages 4–10 summary table at line 1023 and the new Stage 11 summary table at the end are not unified. Either combine them or move the Stage 11 table immediately after the Stage 11 section header.

### P3. todo.md uses two checkbox styles

Most of todo.md uses GitHub-flavoured `- [ ]` / `- [x]`. The Stage 11 summary table at the bottom uses `⬜` Unicode squares. Pick one.

### P4. SPEC.md `enqueued_at` snake_case is inconsistent

SPEC §5 ClipJob uses `enqueued_at` (snake_case) while every other field in SPEC and the existing schema uses camelCase. This is almost certainly a SPEC typo. Decide and align both documents — Prisma convention is camelCase.

### P5. The `EventSource` enum needs to exist

Prompt 48 lists three new "enums" in the body: `EventType`, `ClipJobStatus` — but the heading also says "Two new enums" while the SPEC requires a third (`EventSource` for `PendingEvent.source` per SPEC §5: AUDIO_AI/GAME_ANALYZER/BOTH). Add it explicitly to the prompt.

### P6. Settings seed/migration handling not specified

Prompt 48 adds new Settings fields with defaults, but Prisma `default` only fires on insert. The existing single Settings row from Stage 1's seed will have NULL for the new columns until something updates them. Add a one-line `UPDATE Settings SET ...` step to the migration in Prompt 48.

### P7. System dependencies never installed

The prompts assume `tesseract-ocr`, `smartmontools`, `nut-client`, `fonts-dejavu-core`, `ffmpeg` (with `h264_qsv` support), and Python packages `opencv-contrib-python`, `onnxruntime`, `pytesseract`, `Pillow`, `qrcode`, `sdnotify`, `psycopg2-binary`. None are added to a requirements file in any prompt.

**Fix:** Add a "Stage 11 — Setup" prompt before Prompt 48 that:
1. Adds Python dependencies to `services/video-pipeline/requirements.txt`
2. Documents the apt packages needed
3. Verifies `ffmpeg -hwaccels` lists `qsv` (Intel Quick Sync) on the target hardware

### P8. AI model files never downloaded

Prompt 57 references `face_detection_yunet_2023mar.onnx` and `fer_mobilenet.onnx`. Prompt 51 references the YAMNet TFLite model. None of the prompts include a step to download these into a known location.

**Fix:** Add to the Stage 11 — Setup prompt: download all three models into `services/video-pipeline/models/` and document their SHA256 hashes for integrity checking. Reference these paths in Prompts 51 and 57.

---

## Recommended fix order

1. **First — Fix Prompt 48 against SPEC §5.** This is the foundation; every other prompt depends on having the right field names. Address B1, B2, B5 (enum), I7, P5, P6.
2. **Second — Decide and fix Prompt 49's ring buffer strategy.** Either align to SPEC §7 (ffmpeg `-segment_wrap`) or update SPEC to match Prompt 49's Python pruner. Recommend aligning to SPEC. Addresses B7.
3. **Third — Sweep all "Read SPEC.md Section X" references.** Either fix the numbers (B9) or strip them and reference by title.
4. **Fourth — Align API routes and webhook events.** B3, B4, B5.
5. **Fifth — Fix the architectural mismatches.** B6 (FIFA replay storage), B8 (per-station webcam frame rates), I2 (corroboration), I3 (MATCH_END), I10 (existing modules).
6. **Sixth — Behaviour-correctness fixes.** I1, I5, I6, I8, I9, plus any remaining 🟡 items.
7. **Last — Regenerate todo.md from the corrected prompts.** Don't patch by hand. Addresses I11.
8. **Polish pass.** P1–P8.

---

## What I got right (sanity check)

- The schema additions are genuinely additive — no existing models are clobbered (verified the existing schema)
- Provider is `postgresql` so `Int[]`, `String[]`, `LISTEN/NOTIFY`, `FOR UPDATE SKIP LOCKED` are all valid
- The FIFO + LISTEN/NOTIFY worker pattern is sound and matches SPEC §10
- 1-hour cleanup window matches user's stated requirement (though Prompt should read it from Settings, not hardcode)
- Tablet UX rules (no preview, no SMS, QR-only) match SPEC §20 correctly
- Test-driven structure of each prompt (write code → write tests → run tests → commit) matches the existing Stages 4–10 prompt style
- Prompts are self-contained and runnable in order (the structure is right; the contents need correction)

---

## Honest assessment

The biggest mistake was writing Prompts 48–64 and the todo list **without keeping SPEC.md open**. Almost every issue above stems from that single error: I invented field names, default values, route shapes, enum values, and section numbers from memory of the conversation rather than from the document I had just rewritten. The result looks plausible at a glance but does not match the spec.

The fix is mechanical, not architectural — every individual error can be corrected by re-reading the relevant SPEC section and updating the prompt to match. But there are enough errors that doing it prompt-by-prompt with SPEC open is the only safe path. No shortcut.

---

*Generated by self-review on branch `feat/security-hardening`. Apply fixes before running any Stage 11 prompt.*
