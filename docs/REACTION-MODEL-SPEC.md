# Neo Lounge — Reaction Model Specification

> Extends SPEC.md §7–§13. This document governs how the system detects, scores, and produces highlight clips. Where this document and SPEC.md conflict on clip treatment, this document takes precedence. Schema fields defined here must be added to SPEC.md §5 and Prisma before implementation.

---

## 1. Design Principle

**The product is the reaction, not the event.** A near-miss with an explosive reaction produces a better clip than a routine goal with no reaction. Every decision in this document flows from that principle.

The system uses multiple signals to compute a single importance score per moment. That score determines how much production effort the clip receives — its length, its layout, its effects, and its position in the final reel.

---

## 2. Input Signals

All detection runs on the Lenovo ThinkCentre Neo 50Q Gen 4 (i5-13420H, 8 cores, 4.6 GHz boost). No GPU. No customer audio. No directional microphones. Audio input is TV audio only, via MS2130 capture card USB Audio Class (each capture card exposes its own ALSA audio device — one per station, no separate audio interface needed).

### 2.1 TV Audio (YAMNet)

| Signal | Source | Cost |
|---|---|---|
| Crowd roar detection | YAMNet tflite on capture card ALSA audio | ~2ms per 0.975s window |
| Goal horn / whistle signature | YAMNet class scores | included above |
| Commentator excitement level | Audio RMS envelope over 3s window | ~0.1ms |
| Sustained noise duration | Time above `Settings.yamnetConfidenceThreshold` | ~0.1ms |

Output: `audioScore: Float (0.0–1.0)` — combines peak amplitude, duration above threshold, and sound-class confidence.

### 2.2 Game Visual Analyzer (OpenCV + Tesseract)

| Signal | Method | Cost |
|---|---|---|
| FIFA replay banner | Template matching at 320×240 | ~1ms/frame |
| Goal flash | Frame brightness spike detection | ~0.5ms/frame |
| Red/yellow card | HSV color blob in known screen region | ~1ms/frame |
| Score + match minute | Tesseract OCR on scoreboard crop | ~5ms/frame |
| Match end screen | Template matching | ~1ms/frame |

Output: `visualEventScore: Float (0.0–1.0)` — based on event type weight (see §3.2) and detection confidence.

### 2.3 Webcam Face Analysis (YuNet + FER MobileNet)

| Signal | Method | Cost |
|---|---|---|
| Face bounding boxes | YuNet (built into OpenCV, 374 KB) | ~3ms/frame at 720p |
| 5-point face landmarks | YuNet (eyes, nose, mouth corners) | included above |
| Emotion classification | FER MobileNet ONNX (~5 MB) on face crop | ~10ms/frame |
| Face count per frame | Count of YuNet detections above confidence | included above |

**Derived signals (computed from above, no additional models):**

| Derived signal | How computed | What it detects |
|---|---|---|
| **Emotion peak intensity** | Max FER confidence for any non-neutral class | How strongly they reacted |
| **Emotion sustain duration** | Consecutive frames above emotion threshold | Brief flinch vs sustained reaction |
| **Mouth aperture** | Distance between 2 YuNet mouth-corner landmarks | Jaw-drop / open-mouth surprise |
| **Face movement magnitude** | Frame-to-frame displacement of face bbox centre | Head-throw, jumping, leaning back |
| **Off-face motion density** | Sum of pixel differences outside face bbox | Arm-waving, standing up, high-fives |
| **Face count change** | Delta in detected faces between frames | Someone walked over (excitement magnet) |
| **Emotion transition velocity** | Rate of change in dominant emotion class | Neutral→Joy in 0.5s is sharper than in 3s |
| **Emotion transition sequence** | Ordered pair of dominant emotions over 3s window | Joy→Anger = "offside!", Neutral→Joy = goal celebration |

Output: `faceReactionScore: Float (0.0–1.0)` — combines emotion peak, sustain, movement, and mouth aperture.

### 2.4 Match Context (derived from MatchState)

| Signal | Source |
|---|---|
| Match minute | OCR (MatchState.matchMinute) |
| Score differential | MatchState.homeScore - awayScore |
| Is drawn? | homeScore == awayScore |
| Is penalty shootout? | Detected via visual analyzer (see §8) |
| Time since last event | Clock delta from previous PendingEvent on this station |

Output: `contextMultiplier: Float (0.5–2.0)` — amplifies or dampens overall importance.

### 2.5 Per-Session Baseline Calibration

The first 2 minutes of each session are calibration. During this window, the system collects:
- Rolling audio RMS from the TV channel (median, not mean — avoids spike contamination)
- Rolling face emotion intensity (20th percentile — avoids counting early events as baseline)
- Rolling face movement magnitude (median)

After calibration:
- All subsequent signal scores are expressed as **deviation from baseline**, not as absolute values
- A quiet customer's small smile registers the same importance as a reactive customer's proportional reaction
- Calibration values are stored on the Session row and refreshed with an exponentially-weighted moving average throughout the session

If a goal happens during the first 2 minutes, the baseline is computed from the 20th percentile (not affected by spikes). No events are missed during calibration — detection runs normally; only the scoring uses absolute thresholds until calibration completes.

```
Session gains:
  - audioBaseline: Float (nullable, set after 120s)
  - emotionBaseline: Float (nullable, set after 120s)
  - movementBaseline: Float (nullable, set after 120s)
  - calibratedAt: DateTime (nullable)
```

---

## 3. Importance Scoring

### 3.1 Formula

Every candidate moment receives a single importance score computed by the EventMerger after the reaction window closes:

```
importance = (
    0.30 × faceReactionScore        ← emotion intensity + sustain + movement
  + 0.25 × audioScore               ← TV audio peak + duration
  + 0.20 × visualEventScore         ← goal flash, card, replay banner
  + 0.15 × contextMultiplier_norm   ← late game, tied score, shootout
  + 0.10 × facePresenceScore        ← face count, face count change, off-face motion
)
```

All input scores are normalized to 0.0–1.0 before weighting.

### 3.2 Visual Event Type Weights

| Event type | Base visualEventScore |
|---|---|
| GOAL_CANDIDATE | 0.85 |
| PENALTY_MISS | 0.80 |
| RED_CARD | 0.70 |
| YELLOW_CARD | 0.40 |
| SCORE_CHANGE | 0.75 |
| MATCH_END | 0.60 |
| No detected event (face-only trigger) | 0.00 |

These are base scores. The actual `visualEventScore` is `base × detectionConfidence`.

### 3.3 Context Multiplier

```python
def compute_context_multiplier(match_state, time_since_last_event):
    mult = 1.0

    # Late-game amplification
    if match_state.matchMinute >= 85:
        mult += 0.40
    elif match_state.matchMinute >= 75:
        mult += 0.20

    # Close-game amplification
    diff = abs(match_state.homeScore - match_state.awayScore)
    if diff == 0:
        mult += 0.30    # drawn = maximum tension
    elif diff == 1:
        mult += 0.15    # one-goal game = high tension

    # Drought amplification (nothing happened for a while, this event matters more)
    if time_since_last_event > 300:   # 5+ minutes of nothing
        mult += 0.10

    # Penalty shootout
    if match_state.isShootout:
        mult += 0.50

    return min(mult, 2.0)  # cap at 2.0
```

The `contextMultiplier_norm` used in the formula is `contextMultiplier / 2.0` (mapped to 0–1 range).

### 3.4 Near-Miss Detection (Face-Only Trigger)

If `faceReactionScore > 0.70` AND `emotionSustainDuration > 1.5s` but NO visual event was detected and audio confidence is below threshold, the system still creates a PendingEvent with:
- `eventType = null` (unclassified)
- `source = FACE_ONLY`
- Lower base importance (visualEventScore = 0.0)

This catches near-misses, skill moves, funny own-goals, and moments the game analyzer didn't classify. They're still included in the reel if the face reaction was strong enough.

---

## 4. Clip Tiers

The importance score maps to three tiers. Each tier has a different clip recipe (length, effects, layout).

| Tier | Importance range | Typical moments |
|---|---|---|
| **MICRO** | 0.00 – 0.39 | Small reactions, minor events, weak near-misses |
| **STANDARD** | 0.40 – 0.69 | Normal goals, cards, moderate reactions |
| **BIG** | 0.70 – 1.00 | Huge sustained reactions, last-minute goals, corroborated events, shootout kicks |

```
ClipJob gains:
  - importance: Float (0.0–1.0)
  - tier: Enum (MICRO, STANDARD, BIG)
```

### 4.1 Tier Thresholds (configurable)

```
Settings gains:
  - tierMicroMax: Float default 0.39
  - tierStandardMax: Float default 0.69
  # Anything above tierStandardMax is BIG
```

### 4.2 Automatic Tier Overrides

Regardless of computed importance:
- `MATCH_END` events are always at least STANDARD tier
- Events during a penalty shootout are always at least STANDARD tier
- Corroborated events (`source = BOTH`) get a +0.15 importance boost before tier assignment

---

## 5. Dynamic Clip Length

Clips do not have fixed post-roll duration. Instead, the clip window extends until the reaction fades.

### 5.1 Pre-Roll

Fixed: `Settings.clipPreRollSeconds` (default 10). Clamped to available ring buffer.

For BIG tier clips, pre-roll extends to `Settings.clipPreRollBigSeconds` (default 20) to capture more buildup.

```
Settings gains:
  - clipPreRollBigSeconds: Int default 20
```

### 5.2 Post-Roll (reaction-driven)

The EventMerger holds the clip window open until the reaction fades:

```python
def compute_post_roll(emotion_timeline, tier):
    min_post = 5                          # always include at least 5s
    max_post = {MICRO: 12, STANDARD: 30, BIG: 45}[tier]

    # Find the last frame where face emotion is above session baseline + 20%
    fade_time = find_fade_below_threshold(emotion_timeline, threshold=1.2 * session.emotionBaseline)

    post_roll = max(min_post, min(max_post, fade_time + 2))  # +2s buffer after fade
    return post_roll
```

| Tier | Minimum post-roll | Maximum post-roll |
|---|---|---|
| MICRO | 5s | 12s |
| STANDARD | 5s | 30s |
| BIG | 5s | 45s |

### 5.3 Dead-Time Trimming

Within the extracted clip window, the system identifies low-motion segments in the TV feed (inter-frame pixel difference below threshold for 1+ seconds). These are trimmed from the final output to keep clips tight. Applied only when the total clip exceeds 15 seconds.

---

## 6. FIFA Replay Dual-Reaction Treatment

When the game analyzer detects a FIFA in-game replay banner during a clip window, the system captures two separate webcam reaction moments for the same event.

### 6.1 Two Reaction Windows

| Window | Timing | What it captures |
|---|---|---|
| **Live reaction (A)** | T_event ± 3 seconds | The instinctive reaction at the moment the event happened |
| **Replay reaction (B)** | T_replay_start to T_replay_end | The reaction while the customer watches the FIFA replay |

Both are scored using the same face reaction model (§2.3). The system gets two scores: `liveReactionScore` and `replayReactionScore`.

### 6.2 Schema

```
ClipJob gains:
  - eventWindowStart: Float (unix epoch)
  - eventWindowEnd: Float (unix epoch)
  - replayWindowStart: Float (nullable, unix epoch)
  - replayWindowEnd: Float (nullable, unix epoch)
  - liveReactionScore: Float (nullable)
  - replayReactionScore: Float (nullable)
  - replayTreatment: Enum (LIVE_ONLY, REPLAY_ONLY, DUAL_BEAT, SKIP) default LIVE_ONLY
```

### 6.3 Treatment Selection

```python
def select_replay_treatment(live_score, replay_score, tier):
    if tier == MICRO:
        # Use whichever reaction was stronger, keep it short
        return LIVE_ONLY if live_score >= replay_score else REPLAY_ONLY

    if tier == BIG:
        # Always show both reactions in sequence — this is the signature feature
        return DUAL_BEAT

    # STANDARD tier: include both only if both reactions are meaningful
    if live_score > 0.4 and replay_score > 0.4:
        return DUAL_BEAT
    elif live_score >= replay_score:
        return LIVE_ONLY
    else:
        return REPLAY_ONLY
```

### 6.4 DUAL_BEAT Clip Structure (BIG tier)

This is the signature clip format. It shows the event, the customer's live reaction, the FIFA replay, and their reaction to watching the replay — a complete emotional story in one clip.

```
[Pre-roll: 3–5s of gameplay leading up to the moment]
[The event itself: 2–3s at normal speed]
[Live reaction (A): 2–3s webcam face, may include slow-mo and zoom]
[Beat: 0.5s dark frame or caption: "let's see that again"]
[FIFA in-game replay: full length, 5–8s]
[Replay reaction (B): 2–4s webcam face with appropriate treatment]
[Slow-mo of peak emotion frame from whichever window scored higher: 1.5s]
[Caption overlay on the slow-mo frame]
```

Total: 18–28 seconds. The customer sees themselves react twice. This format cannot be replicated by any other gaming lounge.

### 6.5 When No FIFA Replay Is Detected

If `replayWindowStart` is null, the clip uses only the live reaction (A). This is the normal case for events that FIFA does not replay (yellow cards, near-misses, minor fouls).

---

## 7. Per-Tier Clip Recipes

Each tier has a complete recipe that governs every aspect of the clip output.

### 7.1 MICRO Tier

**Purpose:** Quick cut. Keeps the reel moving. Not a standalone clip.

| Aspect | Treatment |
|---|---|
| **Length** | 6–12 seconds |
| **Speed** | Normal playback speed only (no slow-mo regardless of station) |
| **Layout** | Full-screen TV footage with small webcam face insert (PiP, 240×135 bottom-right) OR no webcam if face emotion is weak |
| **Zoom** | None |
| **Caption** | Game state only (score + minute, small corner overlay). No comedic caption. |
| **Color grade** | Neutral — no adjustment |
| **Transition in reel** | Fast cut, no numbered transition card |
| **FIFA replay** | Use stronger of live/replay reaction; do not include both |
| **Standalone download** | Not available as individual download — included in reel only |

### 7.2 STANDARD Tier

**Purpose:** The workhorse clip. Complete moment with reaction.

| Aspect | Treatment |
|---|---|
| **Length** | 15–25 seconds |
| **Speed** | Speed ramp at peak: normal → gradual slow to 2.0×PTS over 0.5s → hold 2s → ramp back to normal. Only on stations with 120fps webcam. |
| **Layout** | PiP webcam bottom-right (320×180) during gameplay. At peak reaction: brief zoom punch into face (0.3s zoompan to 130% then back). |
| **Zoom** | Single face: zoom to 150% centred on face during slow-mo. Two faces: split-screen side-by-side. Zero faces: full frame, no zoom. |
| **Caption** | Game state overlay (always) + one Sheng library caption at peak moment (2s duration, bottom-centre, white on dark box). |
| **Color grade** | Subtle saturation boost (+8%) |
| **Transition in reel** | Numbered transition card ("Moment 2") — 0.8s |
| **FIFA replay** | DUAL_BEAT if both reactions > 0.4; otherwise stronger reaction only |
| **Standalone download** | Available as individual landscape + portrait download in PWA |

### 7.3 BIG Tier

**Purpose:** The hero clip. Maximum production value. The moment people share.

| Aspect | Treatment |
|---|---|
| **Length** | 20–40 seconds |
| **Speed** | Speed ramp: normal → gradual slow to 2.0×PTS over 0.5s → hold 3–4s → ramp back. Only on stations with 120fps webcam. |
| **Layout** | Alternating cuts between TV and webcam: [3s TV] → [2s webcam face] → [3s TV] → [4s webcam zoom at peak]. At peak emotion: full-screen face for 2s before cutting back. |
| **Zoom** | Zoom punch at peak emotion: zoompan from 100% to 150% over 10 frames, hold 20 frames. Two faces: alternate between them every 0.8s. |
| **Caption** | Game state overlay + Sheng library caption + emotion stinger (see §9) at peak frame. |
| **Color grade** | Punched contrast (+12%), warm highlights, slight vignette. Sports-film look. |
| **Freeze-frame** | At peak emotion frame: hold for 1.2s before resuming. |
| **Screen shake** | On goal flash: 0.25s of subtle crop-offset oscillation. |
| **Transition in reel** | Numbered transition card ("Moment 3") — 1.2s with a slightly slower reveal. |
| **FIFA replay** | Always DUAL_BEAT — full event → live reaction → beat → FIFA replay → replay reaction → slow-mo peak. |
| **Standalone download** | Available as individual landscape + portrait download in PWA |

---

## 8. Penalty Shootout Grouping

### 8.1 Shootout Detection

The game analyzer detects a penalty shootout when:
- `MatchState.matchMinute >= 90` (or 120 for extra time)
- 3 or more `GOAL_CANDIDATE` or `PENALTY_MISS` events occur within 4 minutes
- Score changes alternate or increment in a pattern consistent with penalties

When these conditions are met, `MatchState.isShootout` is set to `true`.

```
MatchState gains:
  - isShootout: Boolean default false
```

### 8.2 Clip Grouping

During a shootout, individual ClipJobs are created normally but receive a `shootoutGroup` tag:

```
ClipJob gains:
  - shootoutGroup: String (nullable) — shared identifier for all clips in the same shootout
```

The stitch worker **defers** shootout clips — it processes them to ENHANCING/DONE individually but the reel assembler treats them as a single group.

### 8.3 Shootout Sequence in the Reel

Instead of individual transition cards between shootout clips, the reel assembler renders them as a continuous montage:

```
["PENALTY SHOOTOUT" title card — 1.5s]
[Kick 1: event + reaction — no transition card, just a hard cut]
[Kick 2: event + reaction — hard cut]
[Kick 3: event + reaction — hard cut]
  ...
[Final kick: event + reaction + slow-mo of decisive moment]
[Winner reaction: 3s face zoom with caption]
[Loser reaction: 2s face zoom with caption (see §9.2 for tone)]
```

Fast hard cuts between kicks build tension. The sequence should feel like it's accelerating. Each kick is trimmed tighter than a standalone clip (8–12s each). The final kick gets the BIG tier treatment regardless of face reaction score.

---

## 9. Caption System

### 9.1 Three Caption Layers

Every clip receives up to three caption layers. They serve different purposes and appear in different positions.

**Layer 1 — Game State (always present)**

Small informational text in the top-left corner. White, 50% opacity, 28px.

Format: `"78' — 2-1"` or `"PENS: 3-2"` or `"90+3'"`.

Source: `MatchState` at the time of the event. Always accurate, zero creative risk.

**Layer 2 — Sheng/Swahili Library Caption (STANDARD + BIG tiers only)**

Large comedic text, bottom-centre, white on semi-transparent dark box, 52–68px depending on tier.

Appears for 2 seconds at the peak emotion moment. Selected by `(eventType × dominantEmotion × matchContext)` from the caption library JSON (see SPEC.md §12 for structure and examples).

Source: pre-written Sheng/Swahili caption library (`/opt/lounge/captions.json`). Seed: 40 entries at launch. Target: 1000+ entries over the first year, added by the owner based on observed moments.

Selection algorithm: exact context match → emotion match → fallback to "generic" context with matching emotion → final fallback to universal neutral caption.

**Layer 3 — Emotion Stinger (BIG tier only)**

A small visual indicator at the peak emotion frame. Not text — a simple, clean icon or symbol. Appears for 0.8 seconds at the peak frame.

Source: mapped from FER dominant emotion (see §9.3 for approved set).

### 9.2 Caption Tone Guidelines

All captions must be:
- **Family-friendly** — no profanity, no crude humor, nothing that would make a parent uncomfortable if their child read it
- **Culturally respectful** — no religious references, no tribal references, no political content
- **Humorous but refined** — witty, not crude; clever, not mean-spirited
- **Inclusive** — never mock a player's skill level; the humor is in the situation and reaction, not the person

Loser/heartbreak captions should be **sympathetic** not mocking: "We go again", "Next time", "The pain is real" — never "You're terrible" or similar.

### 9.3 Approved Emotion Stinger Set

These are the only visual stingers permitted. Family-friendly, culturally neutral, no tongue-related imagery.

| FER Emotion | Stinger | Notes |
|---|---|---|
| **Joy / Happy** | Star burst (sparkle effect) | Clean, universal celebration symbol |
| **Surprise** | Exclamation marks (‼) | Simple, widely understood |
| **Anger** | Lightning bolt | Energy without aggression |
| **Sadness** | Rain droplet | Sympathetic, not mocking |
| **Fear** | Wide eyes symbol (custom drawn) | Stylised, not a real emoji — avoids platform inconsistency |
| **Neutral (strong)** | Snowflake | "Ice cold" — used only when neutral emotion is sustained through a major event |

**Explicitly excluded:** All tongue-related imagery (tongue out, money tongue, etc.), skull/death imagery, religious symbols (prayer hands, etc.), flag imagery, real emoji characters (rendered differently per device — use custom-drawn PNG overlays for consistency).

Stingers are rendered as semi-transparent PNG overlays via ffmpeg `overlay` filter, not as text. They appear at 60% opacity, bottom-right of the face zoom frame, for 0.8 seconds. Size: 80×80px.

---

## 10. Video Effects Reference

All effects use standard ffmpeg filters. No external tools or GPU shaders.

### 10.1 Speed Ramp (STANDARD + BIG tiers, 120fps stations only)

Instead of binary slow-mo (on/off), the video smoothly decelerates into and out of the slow-motion segment.

```
Normal speed (1.0×) → decelerate over 0.5s → slow (2.0×PTS) for 2–4s → accelerate over 0.5s → normal
```

Implementation: `setpts` with a piecewise expression based on frame number ranges. The ramp is pre-computed from the peak emotion timestamp.

Stations without 120fps webcams do not receive any speed modification — their footage stays at normal playback speed throughout.

### 10.2 Freeze-Frame at Peak (BIG tier only)

The single highest-emotion frame is identified by FER. The video holds on that frame for 1.2 seconds using `tpad=stop_duration=1.2`.

### 10.3 Zoom Punch (STANDARD + BIG tiers)

At the peak emotion moment, the camera zooms from 100% to 130–150% over 8 frames (0.13s at 60fps), holds for 12 frames (0.2s), then returns to 100% over 8 frames.

```bash
zoompan=z='if(between(in,PEAK-8,PEAK+20),1.3+(0.2*sin((in-PEAK)/8*PI/2)),1)':
  x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1280x720
```

Centres on the dominant face bounding box, not frame centre.

### 10.4 Screen Shake on Goal Flash (BIG tier only)

When the game analyzer detects a goal flash at timestamp T, apply a 0.25s oscillating crop offset to the TV footage:

```
crop=iw-20:ih-20:10+8*sin(t*40):10+6*cos(t*35)
```

Subtle, not nauseating. Mimics the "camera shook from the roar" effect.

### 10.5 Color Grading by Emotion

Applied as a final pass. The dominant emotion of the clip determines the grade:

| Emotion | Grade |
|---|---|
| Joy | Warm: saturation +10%, slight orange shift in highlights |
| Anger | Punch: contrast +15%, reds +5% |
| Sadness | Cool: saturation -8%, blue shift +5% |
| Surprise | Neutral + brief brightness flash at peak frame (0.1s) |
| Fear | Slight desaturation (-5%), mild vignette |
| Neutral | No adjustment |

All grades applied via ffmpeg `eq`, `colorbalance`, and `vignette` filters.

### 10.6 Color Grading by Tier

Applied in addition to emotion grading:

| Tier | Adjustment |
|---|---|
| MICRO | None |
| STANDARD | Saturation +8% |
| BIG | Contrast +12%, warm highlights, mild vignette (the "sports film" look) |

### 10.7 Dead-Time Trimming

For clips longer than 15 seconds, the system identifies segments of the TV feed where inter-frame pixel difference is below 5% for 1+ seconds continuously (FIFA crowd shots, menu screens, loading moments). These segments are trimmed from the output.

Not applied to webcam footage or to the freeze-frame/slow-mo segments.

---

## 11. Per-Tier Layout Recipes

The spatial arrangement of TV footage and webcam footage varies by tier.

### 11.1 MICRO Layout

```
+---------------------------+
|                           |
|       TV FOOTAGE          |
|       (full frame)        |
|                  +------+ |
|                  | face | |
|                  |240x135| |
|                  +------+ |
+---------------------------+
```

Small PiP in bottom-right corner. If face emotion is below 0.3, the PiP is omitted entirely — just TV footage.

### 11.2 STANDARD Layout

**During gameplay:** Same as MICRO (PiP bottom-right, 320×180).

**At peak emotion (2s):** Zoom punch into face within the PiP window (PiP expands to 480×270 briefly).

**During slow-mo (if applicable):** Webcam moves to bottom-left at 320×180, TV footage remains full-screen behind.

### 11.3 BIG Layout

**During pre-roll:** TV footage full-screen, no PiP.

**During event:** PiP webcam bottom-right (320×180).

**At peak emotion (2–3s):** Cut to full-screen webcam face. TV audio continues underneath. This is the "money shot" — the reaction IS the content.

**After peak:** Cut back to TV footage with PiP webcam. Resume normal layout.

**During FIFA replay (DUAL_BEAT):** TV footage full-screen showing the replay. Webcam PiP shows the customer watching the replay.

### 11.4 Face Count Layout Variants

| Faces detected | Layout adjustment |
|---|---|
| 0 faces | No webcam shown. TV footage only. |
| 1 face | Standard layouts as described above. |
| 2 faces | At peak: alternate cuts between faces every 0.8s (cross-cut editing). During slow-mo: split-screen side-by-side. |
| 3+ faces | At peak: wide group shot (no zoom). During PiP: PiP window sized to 400×225 to fit all faces. |

---

## 12. Highlight Reel Structure

The reel assembler (Prompt 58) uses the tier system and importance scores to build a structured, emotionally-varied highlight reel.

### 12.1 Clip Selection for Reel

From all clips in the session:
1. All BIG tier clips are always included
2. All STANDARD tier clips are included
3. MICRO tier clips are included only if the total clip count is below 5 (ensures short sessions still get a reel)
4. If total clip count exceeds 8, drop the lowest-importance MICRO clips first, then lowest-importance STANDARD clips
5. **Emotional variety**: if 3+ clips share the same dominant emotion, replace the weakest with the next-best clip of a different emotion

### 12.2 Clip Ordering in Reel

Clips are ordered for narrative arc, not chronological order:

1. **Opener** — second-highest importance clip (strong start, not the best)
2. **Middle clips** — remaining clips in chronological order
3. **Climax** — highest importance clip (the best moment, positioned for maximum impact)
4. **Closer** — MATCH_END reaction (see §12.3)

Exception: penalty shootout groups (§8.3) are always kept in chronological order and placed as a single block.

### 12.3 End Card — Winner / Loser Closing Shot

The final reel beat uses the MATCH_END event:

**If the customer won** (higher score at session end):
- 3-second slow-mo of peak joy frame from the post-match webcam footage
- Caption: winning Sheng caption from library
- Emotion stinger: star burst

**If the customer lost:**
- 2-second face shot from the post-match webcam footage (not slow-mo — keep their dignity)
- Caption: sympathetic Sheng caption ("We go again", "Next time bro")
- No emotion stinger

**If draw:**
- 2-second neutral shot
- Caption: draw-specific caption ("Stalemate.", "Neither backing down")

### 12.4 "Highlight of the Match" Promotion

The single highest-importance clip across the session receives special treatment in the reel:
- A "MOMENT OF THE MATCH" title card (1.5s) immediately before it
- 0.5s longer dwell before the next transition
- Slightly louder audio mix (+2 dB)

### 12.5 Reel Assembly Structure

```
[Session title card: "NEO LOUNGE — Station 2 — [Date] — [Final Score]" — 2s]
[Opener clip — second-highest importance]
[Transition card: "Moment 1" — 0.8s]
[Clip 2]
[Transition card: "Moment 2" — 0.8s]
  ...
[If shootout: "PENALTY SHOOTOUT" card → grouped shootout sequence]
  ...
["MOMENT OF THE MATCH" card — 1.5s]
[Climax clip — highest importance, BIG treatment]
[End card: winner/loser/draw closing shot — 2–3s]
[QR code frame — 2s, links to PWA download]
[NEO LOUNGE branding card — 1.5s]
```

---

## 13. Emotion Transition Detection

Specific emotion sequences detected over a 5-second window receive special caption treatment and can influence tier assignment.

### 13.1 Named Transitions

| Sequence (over 5s) | Name | Effect |
|---|---|---|
| Neutral → Surprise → Joy | "Classic celebration" | +0.05 importance; caption context = celebration |
| Joy → Surprise → Anger | "Offside!" | +0.10 importance; caption context = disallowed_goal |
| Joy → Anger | "VAR moment" | +0.10 importance; caption context = reversal |
| Neutral → Fear → Joy | "Saved!" | +0.05 importance; caption context = narrow_escape |
| Joy → Sadness | "Too soon" | +0.10 importance; caption = "Too soon..." (hardcoded, always funny) |
| Neutral → Surprise (sustained 3s+) | "Jaw drop" | +0.05 importance; freeze-frame applied even on STANDARD tier |

### 13.2 "Heartbreak" Detection

Special case: when the system detects `Joy → Anger → Sadness` within 4 seconds (customer celebrated, then the goal was disallowed or countered), the clip receives:
- Automatic tier bump to at least STANDARD
- Hard cut from peak joy frame directly to peak sadness frame (no transition)
- Caption: "Too soon..." or equivalent from library
- This is consistently the funniest moment type and should never be missed

---

## 14. New Schema Fields Summary

All fields introduced by this specification, to be added to SPEC.md §5 and the Prisma schema:

### Session
```
+ audioBaseline: Float (nullable)
+ emotionBaseline: Float (nullable)
+ movementBaseline: Float (nullable)
+ calibratedAt: DateTime (nullable)
```

### MatchState
```
+ isShootout: Boolean default false
```

### PendingEvent
```
+ faceReactionScore: Float (nullable)
+ audioScore: Float (nullable)
+ visualEventScore: Float (nullable)
+ contextMultiplier: Float (nullable)
+ importance: Float (nullable)
+ emotionTransition: String (nullable)   — e.g. "joy_to_anger"
```

### ClipJob
```
+ importance: Float (0.0–1.0)
+ tier: Enum (MICRO, STANDARD, BIG)
+ eventWindowStart: Float (unix epoch)
+ eventWindowEnd: Float (unix epoch)
+ replayWindowStart: Float (nullable)
+ replayWindowEnd: Float (nullable)
+ liveReactionScore: Float (nullable)
+ replayReactionScore: Float (nullable)
+ replayTreatment: Enum (LIVE_ONLY, REPLAY_ONLY, DUAL_BEAT, SKIP) default LIVE_ONLY
+ shootoutGroup: String (nullable)
+ dominantEmotion: String (nullable)
+ emotionTransition: String (nullable)
```

### Settings
```
+ tierMicroMax: Float default 0.39
+ tierStandardMax: Float default 0.69
+ clipPreRollBigSeconds: Int default 20
```

### EventSource Enum
```
+ FACE_ONLY   (added to existing AUDIO_AI | GAME_ANALYZER | BOTH)
```

---

## 15. Decisions Log

Decisions made during the design of this feature set, recorded for future reference.

| # | Decision | Rationale |
|---|---|---|
| D1 | No customer audio capture, no directional microphones, no future-proofing for customer audio | Owner decision — simplifies hardware, removes privacy concerns. Visual reaction detection is sufficient. |
| D2 | No end-of-match customer comment recording | Owner decision — adds friction to the customer flow, many customers would skip it. |
| D3 | TV audio via MS2130 capture card USB Audio Class (1 ALSA device per station) | Each capture card provides both video and audio — no separate audio interface needed. Sufficient for YAMNet crowd detection. |
| D4 | All 4 stations have 120fps webcams at launch | Owner decision — enables slow-motion on all stations, not just Station 4. (Pending: SPEC.md §2 and §7 update.) |
| D5 | Importance scoring uses weighted multi-signal fusion, not binary event detection | Better clips, fewer false positives, allows near-miss detection. |
| D6 | Three clip tiers (MICRO/STANDARD/BIG) with different production recipes | Matches production effort to moment quality. Saves CPU time on unimportant clips. |
| D7 | FIFA replay dual-reaction (DUAL_BEAT) is default for BIG tier clips | Signature feature — shows live reaction AND replay-watching reaction. Distinctive. |
| D8 | Dynamic post-roll based on face emotion fade-out, not fixed timer | Clips end when the reaction ends, not at an arbitrary cutoff. |
| D9 | Per-session face emotion baseline calibration (first 2 minutes) | Adapts to quiet vs loud customers without customer audio. |
| D10 | Caption stingers are custom PNG overlays, not emoji characters | Consistent rendering across devices; avoids platform-specific emoji differences. |
| D11 | All stingers family-friendly; no tongues, skulls, religious symbols | Owner requirement — refined humor, culturally appropriate for Nairobi family audience. |
| D12 | Loser end-card is sympathetic, not mocking; shorter than winner card | Humor comes from situations, not from ridiculing customers. |
| D13 | Penalty shootout clips grouped as a continuous montage, not individual clips | Shootouts are episodic drama — cutting between them kills the tension. |
| D14 | Near-miss detection via face-only trigger (no game event required) | Catches moments the game analyzer misses — skill moves, funny mistakes, dramatic saves. |
| D15 | Ring buffer extended to 3 minutes (180 seconds, segment_wrap 90) | Cheap in RAM (~340 MB); captures full buildup plays. |
| D16 | Commentator ASR captions cut from launch | CPU cost too high for marginal benefit. Sheng library captions are funnier and cheaper. |
| D17 | No per-frame dynamic PiP placement; per-tier fixed layout recipes instead | Per-frame analysis is expensive and visually twitchy. Per-tier layouts are cleaner and cheaper. |
| D18 | Reel ordered by narrative arc (opener → middle → climax → closer), not chronological | More engaging viewing experience. Strongest moment saved for the end. |

---

## 16. Architecture and Data Flow

### 16.1 Service Topology

The reaction model adds no new services. It modifies existing Stage 11 services:

```
┌─────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│  audio_detector  │    │  game_analyzer   │    │  face_scorer     │
│  (per station)   │    │  (per station)   │    │  (per station)   │
│  YAMNet tflite   │    │  OpenCV+Tess     │    │  YuNet + FER     │
│                  │    │                  │    │  (new component)  │
│  Writes:         │    │  Writes:         │    │  Writes:         │
│  PendingEvent    │    │  PendingEvent    │    │  FaceSnapshot    │
│  (audioScore)    │    │  (visualScore)   │    │  (per frame)     │
└────────┬─────────┘    └────────┬─────────┘    └────────┬─────────┘
         │                       │                       │
         └───────────┬───────────┘                       │
                     ▼                                   │
           ┌─────────────────┐                           │
           │  event_merger   │◄──────────────────────────┘
           │  (singleton)    │   reads FaceSnapshot rows
           │                 │   for the clip window
           │  Computes:      │
           │  - importance   │
           │  - tier         │
           │  - clipStart/   │
           │    clipEnd      │
           │  - replayTreat  │
           │                 │
           │  Creates:       │
           │  ClipJob        │
           │  NOTIFY         │
           └────────┬────────┘
                    │
         ┌──────────┼──────────┐
         ▼          ▼          ▼
   ┌──────────┐ ┌────────┐ ┌──────────┐
   │ extractor│ │ stitch │ │ enhancer │
   │ (Stage1) │→│(Stage2)│→│ (Stage3) │
   │          │ │        │ │          │
   │ Reads:   │ │ Tier-  │ │ Tier-    │
   │ tier for │ │ aware  │ │ aware    │
   │ pre-roll │ │ layout │ │ effects  │
   └──────────┘ └────────┘ └──────────┘
                               │
                               ▼
                        ┌──────────────┐
                        │ reel_assembler│
                        │              │
                        │ Reads:       │
                        │ - importance │
                        │ - tier       │
                        │ - emotion    │
                        │ - shootout   │
                        │   Group      │
                        │              │
                        │ Builds:      │
                        │ narrative    │
                        │ arc reel     │
                        └──────────────┘
```

### 16.2 New Component: FaceScorer

A new Python module (`services/video-pipeline/detection/face_scorer.py`) runs alongside the webcam capture for each station. It is NOT a separate systemd service — it runs as a thread within the audio_detector or as a co-process within the game_analyzer service to minimize resource use.

**Responsibilities:**
1. Samples webcam frames at 4 fps (every 15th frame from the 60fps stream, or every 30th from 120fps)
2. Runs YuNet face detection on each sample
3. Runs FER emotion classification on detected face crops
4. Writes `FaceSnapshot` rows to the database (batch insert every 2 seconds)
5. Computes derived signals (movement, mouth aperture, off-face motion) per sample
6. Manages session baseline calibration (first 120 seconds)

**FaceSnapshot table (new, high-write, auto-purged):**

```prisma
model FaceSnapshot {
  id          Int      @id @default(autoincrement())
  stationId   Int
  sessionId   Int
  capturedAt  DateTime
  faceCount   Int
  dominantEmotion String?    // "joy", "surprise", "anger", etc.
  emotionConfidence Float?
  mouthAperture Float?       // normalized 0-1
  faceMovement  Float?       // pixels/frame
  offFaceMotion Float?       // normalized 0-1
  faceX       Int?           // bbox centre x
  faceY       Int?           // bbox centre y
  faceW       Int?           // bbox width
  faceH       Int?           // bbox height
  // Second face (nullable, for 2-player scenarios)
  face2Emotion String?
  face2Confidence Float?
  face2X      Int?
  face2Y      Int?
  face2W      Int?
  face2H      Int?

  station     Station  @relation(fields: [stationId], references: [id])
  session     Session  @relation(fields: [sessionId], references: [id])

  @@index([stationId, sessionId, capturedAt])
}
```

**Storage:** At 4 fps × 4 stations × ~200 bytes/row = ~3.2 KB/s = ~11.5 MB/hour. Purged with the session cleanup worker (Prompt 63). Negligible storage impact.

**CPU budget:** YuNet at 720p = ~3ms/frame, FER on face crop = ~10ms/frame. At 4 fps = ~52ms/s per station = ~5.2% of one CPU core per station. Four stations = ~20.8% of one core. The i5-13420H has 8 cores (4P + 4E). Leaves 7+ cores for all other work. Ample headroom.

### 16.3 Data Flow: Event → Scored ClipJob

```
1. Audio detector writes PendingEvent (source=AUDIO_AI, audioScore=0.72)
2. Game analyzer writes PendingEvent (source=GAME_ANALYZER, visualEventScore=0.85, eventType=GOAL_CANDIDATE)
3. Game analyzer updates MatchState (isReplayShowing=true at T+8s, false at T+16s)

4. EventMerger sees both events within merge window:
   a. Queries FaceSnapshot WHERE stationId=X AND capturedAt BETWEEN (T-5) AND (T+25)
   b. Computes faceReactionScore from the snapshot series:
      - peak emotion intensity (max emotionConfidence where emotion != 'neutral')
      - sustain duration (count of consecutive snapshots above threshold × 0.25s)
      - movement magnitude (max faceMovement)
      - mouth aperture peak (max mouthAperture)
      - face count bonus (max faceCount > 1 → +0.1)
   c. Checks if MatchState.isReplayShowing flipped during the window
      → if yes: sets replayWindowStart/replayWindowEnd from MatchState
      → queries FaceSnapshot for the replay window separately
      → computes replayReactionScore
   d. Waits for reaction fade-out (emotion drops below baseline + 20% for 2+ seconds)
   e. Computes final importance from the weighted formula (§3.1)
   f. Assigns tier (MICRO/STANDARD/BIG) from importance thresholds
   g. Selects replayTreatment (LIVE_ONLY/REPLAY_ONLY/DUAL_BEAT) per §6.3
   h. Detects emotion transitions (§13)
   i. Creates ClipJob with all scored fields populated
   j. NOTIFY clip_jobs_channel
```

### 16.4 Data Flow: ClipJob → Final Output

```
1. Clip extractor (Stage 1):
   - Reads ClipJob.tier to determine pre-roll length (10s standard, 20s BIG)
   - Extracts TV segments for eventWindow
   - Extracts webcam segments for eventWindow (webcamLivePath)
   - If replayWindowStart set: extracts webcam segments for replayWindow (webcamReplayPath)
   - If GameReplay overlaps: links gameReplayPath
   - Status → STITCHING, NOTIFY stitch_jobs_channel

2. Stitch worker (Stage 2):
   - Reads ClipJob.tier to select layout recipe (§11)
   - Reads ClipJob.replayTreatment for FIFA replay handling
   - Reads FaceSnapshot for the clip window to determine peak emotion timestamp and face positions
   - Builds tier-appropriate filter_complex:
     * MICRO: small PiP or none
     * STANDARD: PiP with zoom punch at peak
     * BIG: alternating cuts with full-screen face at peak
   - Applies dead-time trimming if clip > 15s
   - Quick Sync encode with libx264 fallback
   - Status → ENHANCING, NOTIFY ai_effects_channel

3. Enhancer (Stage 3):
   - Reads ClipJob.tier, dominantEmotion, emotionTransition
   - Applies tier-appropriate effects (§10):
     * Speed ramp (STANDARD+BIG, 120fps stations only)
     * Freeze-frame (BIG only)
     * Zoom punch (STANDARD+BIG)
     * Screen shake on goal flash (BIG only)
     * Color grade by emotion + tier
   - Selects and burns caption layers (§9):
     * Layer 1: game state (always)
     * Layer 2: Sheng caption (STANDARD+BIG)
     * Layer 3: emotion stinger PNG (BIG only)
   - Produces landscape (1280×720) and portrait (1080×1920) outputs
   - Status → DONE
   - check_session_all_ready()

4. Reel assembler:
   - Waits for all ClipJobs DONE/FAILED
   - Applies clip selection rules (§12.1)
   - Orders by narrative arc (§12.2)
   - Groups shootout clips (§8.3)
   - Promotes highest-importance clip (§12.4)
   - Appends end card (§12.3)
   - Assembles landscape + portrait reels
   - Emits replay:reel_ready
```

### 16.5 Thread Safety and Concurrency

**FaceScorer writes** are the highest-frequency DB operations in the system (~16 inserts/second across 4 stations). To avoid row-level lock contention:
- Batch inserts every 2 seconds (8 rows per batch per station)
- Use a dedicated DB connection per station (not the shared pool)
- FaceSnapshot table has no foreign key constraints enforced at DB level (application validates session/station existence)

**EventMerger reads FaceSnapshot** in the merge cycle. To avoid reading partial batches:
- Merger queries snapshots with `capturedAt < NOW() - 2 seconds` (gives the batch writer time to flush)
- Merger runs its merge cycle every 3 seconds (unchanged from original design)

**Reaction fade-out detection** requires the merger to hold a clip window open for potentially 45 seconds (BIG tier max post-roll). To avoid blocking:
- Active windows are held in memory (dict per station), not in the DB
- The merger's timer tick (every 1 second) checks each active window for fade-out
- A window older than `max_post_roll + 5s` (safety cap) is force-flushed regardless of face state

---

## 17. Error Handling

### 17.1 FaceScorer Failures

| Failure | Handling |
|---|---|
| YuNet detects 0 faces for 30+ consecutive seconds | Log WARNING. Continue writing FaceSnapshot with faceCount=0. Clips from this period get faceReactionScore=0 — system still triggers from audio + game analyzer. |
| FER model crashes or returns invalid output | Catch exception, log ERROR. Write FaceSnapshot with dominantEmotion=null, emotionConfidence=0. Scorer attempts model reload on next frame. After 3 consecutive failures, disable FER for this station (YuNet-only mode — face detection + movement still work). |
| Webcam disconnects (v4l2 device lost) | FaceScorer detects EOF on frame read. Logs ERROR, enters retry loop (5s backoff). All clips created during webcam outage have no face data — tier assignment uses audio + game signals only (§3.1 formula gracefully handles null face scores by redistributing weight to other signals). |
| FaceSnapshot INSERT fails (DB connection lost) | Buffer up to 100 snapshots in memory. Reconnect with exponential backoff (1s, 2s, 4s, max 30s). If buffer exceeds 100, drop oldest. Log WARN per dropped batch. |

### 17.2 Importance Scoring Edge Cases

| Edge case | Handling |
|---|---|
| All signal scores are null/zero (no audio, no game event, no face data) | Do not create a ClipJob. Log DEBUG "no signal, skipping." |
| Only one signal source available (e.g., game analyzer only, face scorer offline) | Redistribute weights proportionally among available signals. E.g., if face is unavailable: audio=0.45, visual=0.35, context=0.20. |
| Importance score of exactly 0.39 or 0.69 (tier boundary) | Apply >= comparison: 0.39 is MICRO, 0.40 is STANDARD. Thresholds are exclusive upper bounds for the lower tier. |
| Calibration period (first 120s): no baseline yet | Use absolute thresholds (same as the defaults in §3) until `session.calibratedAt` is set. Clips created during calibration may be slightly less well-tuned — acceptable. |
| Session shorter than 2 minutes (calibration never completes) | Use absolute thresholds for the entire session. Set `session.calibratedAt = null`. |

### 17.3 FIFA Replay Detection Failures

| Failure | Handling |
|---|---|
| Replay banner detected but no corresponding live event within the previous 15 seconds | Create a ClipJob from the replay window only (replayTreatment=REPLAY_ONLY). The FIFA replay itself is still interesting content. |
| Replay banner stays "on" for more than 30 seconds (false positive — stuck detection) | Force isReplayShowing=false after 30s. Log WARN "replay banner stuck, force-clearing." |
| Multiple replay banners in the same 60-second window | Each replay banner is a separate replay window. The EventMerger associates the first replay window with the nearest event. Subsequent replays within the same clip window are ignored (they are usually the same replay shown from different angles). |

### 17.4 Shootout Detection Failures

| Failure | Handling |
|---|---|
| Shootout detected but fewer than 3 kicks actually happen (false positive) | If `shootoutGroup` has fewer than 3 clips when the session ends, ungroup them (set shootoutGroup=null) and treat as individual clips. |
| OCR fails to read penalty score correctly | Shootout detection falls back to event frequency heuristic only (3+ events within 4 minutes at matchMinute >= 90). If detection is uncertain, do not set isShootout — individual clips still work fine. |

### 17.5 Enhancer Failures (ffmpeg)

| Failure | Handling |
|---|---|
| Speed ramp filter produces corrupted output (rare ffmpeg edge case) | Verify output with ffprobe. If corrupt: retry without speed ramp (normal speed). Log WARN. |
| Complex filter_complex fails (too many filters chained) | Fall back to simplified recipe: simple PiP, no zoom, no color grade. Apply caption only. This produces a usable clip even if effects fail. |
| Output file is 0 bytes or < 2 seconds | Status → FAILED, errorMessage set. Do not retry — a human should investigate. The reel assembler skips FAILED clips. |
| Quick Sync unavailable at runtime (driver issue) | Fall back to libx264. This is already in the Stage 11 design. No change. |

### 17.6 Reel Assembly Failures

| Failure | Handling |
|---|---|
| All clips FAILED (no usable clips for the session) | Do not generate a reel. Log ERROR. Emit a WebSocket event `replay:no_clips` to the tablet (display: "Sorry — no highlights captured for this session"). |
| Only 1 clip available | Generate reel with single clip (no opener/climax distinction). Skip narrative arc ordering. Still include title card and end card. |
| Session ends before any events detected | Wait 90 seconds for any delayed clip processing. If still no clips, emit `replay:no_clips`. |

---

## 18. Testing Plan

### 18.1 Unit Tests: FaceScorer

**File:** `services/video-pipeline/tests/test_face_scorer.py`

| Test | Input | Assert |
|---|---|---|
| Single face detected | 5 synthetic 720p frames, face region at (300,200,150,150) | YuNet returns 1 face, bbox within 20px of expected position |
| Emotion classification | Face crop with exaggerated smile (synthetic) | FER returns "joy" with confidence > 0.5 |
| Mouth aperture calculation | Two YuNet mouth landmarks 30px apart | mouthAperture > 0.5 (normalized) |
| Face movement detection | Face bbox at (100,100) then (100,140) next frame | faceMovement > 30 |
| Off-face motion | Frame with large pixel change outside face bbox | offFaceMotion > 0.5 |
| Multiple faces | Frame with two face regions | faceCount=2, face2Emotion populated |
| No face | Empty frame (solid color) | faceCount=0, all face fields null |
| Batch insert | 8 snapshots buffered then flushed | 8 FaceSnapshot rows in DB |
| Baseline calibration | 120s of face data at consistent low emotion | session.emotionBaseline set, session.calibratedAt set |
| Baseline spike resistance | Goal at T=45s during calibration | Baseline uses 20th percentile — not affected by spike |

### 18.2 Unit Tests: Importance Scoring

**File:** `services/video-pipeline/tests/test_importance_scorer.py`

| Test | Input | Assert |
|---|---|---|
| All signals high | audioScore=0.9, visualEventScore=0.85, faceReactionScore=0.9, contextMult=1.8 | importance > 0.75, tier=BIG |
| All signals low | audioScore=0.1, visualEventScore=0.2, faceReactionScore=0.1, contextMult=1.0 | importance < 0.25, tier=MICRO |
| Strong face, no audio/visual | audioScore=0, visualEventScore=0, faceReactionScore=0.95 | importance > 0.28 (face-only trigger fires), near-miss detected |
| Strong audio, no face (webcam offline) | audioScore=0.9, visualEventScore=0.7, face=null | Weights redistributed, importance > 0.5, tier=STANDARD |
| Late-game close-score multiplier | matchMinute=89, scoreDiff=0 | contextMultiplier = 1.7 |
| Corroboration boost | source=BOTH | importance += 0.15 before tier assignment |
| Tier boundary exact | computed importance = 0.39 | tier=MICRO (exclusive upper bound) |
| Tier boundary just above | computed importance = 0.40 | tier=STANDARD |
| MATCH_END override | eventType=MATCH_END, computed importance=0.15 | tier forced to STANDARD minimum |
| Shootout override | isShootout=true, computed importance=0.20 | tier forced to STANDARD minimum |

### 18.3 Unit Tests: Dynamic Post-Roll

**File:** `services/video-pipeline/tests/test_dynamic_postroll.py`

| Test | Input | Assert |
|---|---|---|
| Quick fade | Emotion drops below baseline at T+8s, tier=STANDARD | post_roll = 10 (min 5 + 2s buffer, clamped) |
| Sustained reaction | Emotion stays above baseline until T+22s, tier=STANDARD | post_roll = 24 (22 + 2s buffer) |
| Very long reaction capped | Emotion stays high until T+50s, tier=BIG | post_roll = 45 (BIG max cap) |
| No face data | FaceSnapshot empty for window | post_roll = Settings.clipPostRollSeconds (fixed fallback) |
| MICRO tier cap | Emotion sustained T+15s, tier=MICRO | post_roll = 12 (MICRO max cap) |

### 18.4 Unit Tests: FIFA Replay Treatment Selection

**File:** `services/video-pipeline/tests/test_replay_treatment.py`

| Test | Input | Assert |
|---|---|---|
| BIG tier, replay detected | tier=BIG, liveScore=0.7, replayScore=0.5 | replayTreatment=DUAL_BEAT |
| BIG tier, no replay | tier=BIG, replayWindowStart=null | replayTreatment=LIVE_ONLY |
| STANDARD, both strong | tier=STANDARD, liveScore=0.6, replayScore=0.5 | replayTreatment=DUAL_BEAT |
| STANDARD, only live strong | tier=STANDARD, liveScore=0.8, replayScore=0.1 | replayTreatment=LIVE_ONLY |
| STANDARD, only replay strong | tier=STANDARD, liveScore=0.1, replayScore=0.7 | replayTreatment=REPLAY_ONLY |
| MICRO, live stronger | tier=MICRO, liveScore=0.5, replayScore=0.3 | replayTreatment=LIVE_ONLY |
| MICRO, replay stronger | tier=MICRO, liveScore=0.2, replayScore=0.6 | replayTreatment=REPLAY_ONLY |

### 18.5 Unit Tests: Emotion Transition Detection

**File:** `services/video-pipeline/tests/test_emotion_transitions.py`

| Test | Input (emotion sequence over 5s) | Assert |
|---|---|---|
| Classic celebration | neutral, neutral, surprise, joy, joy | transition="classic_celebration", importance boost=+0.05 |
| Offside / disallowed | joy, joy, surprise, anger, anger | transition="var_moment", importance boost=+0.10 |
| Heartbreak | joy, joy, anger, sadness, sadness | transition="heartbreak", auto-tier-bump to STANDARD |
| Jaw drop | neutral, surprise, surprise, surprise, surprise | transition="jaw_drop", freeze-frame enabled |
| No significant transition | neutral, neutral, neutral, neutral, neutral | transition=null, no boost |
| Too fast (single frame spike) | neutral, surprise, neutral, neutral, neutral | transition=null (sustained < 1.5s) |

### 18.6 Unit Tests: Shootout Detection and Grouping

**File:** `services/video-pipeline/tests/test_shootout.py`

| Test | Input | Assert |
|---|---|---|
| Valid shootout | matchMinute=92, 4 GOAL_CANDIDATE events within 3 min | isShootout=true, all ClipJobs share same shootoutGroup |
| Not a shootout (too few events) | matchMinute=92, 2 events within 3 min | isShootout=false |
| Not a shootout (too early) | matchMinute=60, 4 events within 3 min | isShootout=false |
| Ungroup on false positive | shootoutGroup set but only 2 clips when session ends | shootoutGroup nulled on all clips |
| Reel assembly order | 5 shootout clips, importance varies | Clips rendered in chronological order (not narrative arc) |
| Final kick treatment | Last clip in shootout group | tier forced to BIG regardless of score |

### 18.7 Unit Tests: Caption Selection

**File:** `services/video-pipeline/tests/test_caption_selector.py`

| Test | Input | Assert |
|---|---|---|
| Exact context + emotion match | context=peak_GOAL_CANDIDATE, emotion=joy | Returns caption from library, non-empty string |
| Emotion fallback | context=peak_GOAL_CANDIDATE, emotion=fear (no entries) | Returns caption from "neutral" emotion fallback |
| Context fallback | context=peak_UNKNOWN_EVENT, emotion=joy | Returns caption from "generic" context |
| Stinger selection | emotion=joy | Returns "star_burst" stinger ID |
| Excluded stinger | emotion=any | Assert no tongue/skull/religious stingers in any result |
| No duplicate in session | 5 calls for same context+emotion within one session | Assert at least 3 unique captions returned (randomization works) |
| MICRO tier | tier=MICRO | Assert Layer 2 (Sheng caption) is null. Only game state caption returned. |

### 18.8 Integration Test: Full Reaction Pipeline

**File:** `services/video-pipeline/tests/test_reaction_pipeline_integration.py`

**Setup:** Real test DB, mock ffmpeg (exit 0, touch output files), mock YuNet (returns 1 face at fixed bbox), mock FER (returns configurable emotion+confidence), real EventMerger, real importance scorer.

**Scenario 1 — Standard goal with moderate reaction:**
1. Seed session, station, MatchState (matchMinute=35, homeScore=0, awayScore=0)
2. Insert 120 FaceSnapshot rows: first 100 with emotion=neutral confidence=0.3, then 20 with emotion=joy confidence=0.72 (simulating reaction at T+25)
3. Insert PendingEvent: source=AUDIO_AI, audioScore=0.65
4. Insert PendingEvent: source=GAME_ANALYZER, eventType=GOAL_CANDIDATE, visualEventScore=0.85
5. Run EventMerger.run_merge_cycle()
6. Assert: 1 ClipJob created with source=BOTH, importance between 0.5–0.7, tier=STANDARD
7. Assert: clipEnd extends to ~T+29 (joy fades at T+25 + last snapshot + 2s buffer)
8. Assert: replayTreatment=LIVE_ONLY (no replay detected in this scenario)

**Scenario 2 — Near-miss (face-only trigger):**
1. Seed session with calibrated baseline (emotionBaseline=0.25)
2. Insert 40 FaceSnapshot rows: 30 neutral, then 10 with emotion=surprise confidence=0.82 sustained 2.5s
3. NO PendingEvent from audio or game analyzer
4. Run EventMerger.run_merge_cycle()
5. Assert: 1 PendingEvent created with source=FACE_ONLY
6. Assert: 1 ClipJob created, visualEventScore=0, importance=0.25–0.35, tier=MICRO
7. Assert: clip included in reel (MICRO clips included when total < 5)

**Scenario 3 — BIG tier with DUAL_BEAT:**
1. Seed session, matchMinute=88, homeScore=1, awayScore=1 (drawn, late game)
2. Insert FaceSnapshot: moderate joy at T_event, then stronger joy at T+10 (during FIFA replay)
3. Insert PendingEvent: AUDIO_AI audioScore=0.92 at T
4. Insert PendingEvent: GAME_ANALYZER GOAL_CANDIDATE at T+1, detectionConfidence=0.95
5. Update MatchState: isReplayShowing=true at T+8, false at T+16
6. Run EventMerger
7. Assert: ClipJob with importance > 0.75, tier=BIG
8. Assert: replayWindowStart=T+8, replayWindowEnd=T+16
9. Assert: liveReactionScore and replayReactionScore both populated
10. Assert: replayTreatment=DUAL_BEAT
11. Assert: contextMultiplier > 1.5 (late + drawn)

**Scenario 4 — Heartbreak transition:**
1. Insert FaceSnapshot: joy(0.85) for 8 frames → anger(0.70) for 4 frames → sadness(0.65) for 8 frames
2. Insert PendingEvent: GAME_ANALYZER GOAL_CANDIDATE (detected flash), then SCORE_CHANGE shows same score (offside/VAR)
3. Run EventMerger
4. Assert: emotionTransition="heartbreak"
5. Assert: tier >= STANDARD (auto-bumped)
6. Assert: ClipJob.dominantEmotion cycles through the transition

**Scenario 5 — Penalty shootout grouping:**
1. Seed session, matchMinute=95
2. Insert 5 GOAL_CANDIDATE events at T, T+45, T+90, T+135, T+180 (spread over 3 min)
3. Run EventMerger after each event
4. Assert: isShootout=true set on MatchState after 3rd event
5. Assert: All 5 ClipJobs share the same shootoutGroup
6. Run reel assembler
7. Assert: Reel contains "PENALTY SHOOTOUT" title card
8. Assert: Shootout clips in chronological order (not narrative arc)
9. Assert: Final kick clip has tier=BIG

**Scenario 6 — Session baseline calibration:**
1. Start session, insert 480 FaceSnapshot rows over 120 seconds (4fps) with varied emotion levels
2. Assert: session.calibratedAt set at T+120
3. Assert: session.emotionBaseline equals 20th percentile of emotion confidences
4. Insert a spike at T+45 (emotion=0.9 for 2 seconds during calibration)
5. Assert: baseline NOT contaminated by the spike (20th percentile is robust)

**Scenario 7 — Webcam offline graceful degradation:**
1. Seed session with no FaceSnapshot rows (webcam offline)
2. Insert PendingEvent: AUDIO_AI audioScore=0.8, GAME_ANALYZER GOAL_CANDIDATE
3. Run EventMerger
4. Assert: ClipJob created, faceReactionScore=null
5. Assert: importance computed from audio + visual only (weights redistributed)
6. Assert: tier assigned correctly despite missing face data
7. Assert: clip extractor produces TV-only clip (no webcam path)
8. Assert: enhancer skips face zoom, speed ramp, emotion stinger — applies caption from event type only

### 18.9 Performance Test

**File:** `services/video-pipeline/tests/test_performance.py`

| Test | What it measures | Pass threshold |
|---|---|---|
| FaceScorer throughput | Process 100 frames through YuNet + FER | < 1.5s (15ms/frame average) |
| Importance computation | Score 1000 candidate events | < 50ms total |
| EventMerger with face queries | Merge cycle with 50 FaceSnapshot rows per event, 10 events | < 200ms |
| FaceSnapshot batch insert | Insert 32 rows (4 stations × 8 per batch) | < 10ms |
| FaceSnapshot query for clip window | Query 200 rows for a 50-second window | < 5ms |
| Full enhancer recipe (BIG tier) | Mock ffmpeg, build filter_complex string, select caption | < 20ms (excluding ffmpeg execution) |

### 18.10 Test Data Fixtures

Create `services/video-pipeline/tests/fixtures/`:

| File | Contents |
|---|---|
| `synthetic_face_720p.png` | 1280×720 PNG with a drawn face shape at centre (eyes, nose, mouth) for YuNet testing |
| `synthetic_no_face.png` | 1280×720 solid grey — no face present |
| `synthetic_two_faces.png` | 1280×720 with two drawn face shapes, 400px apart |
| `caption_test_library.json` | Minimal caption library (3 entries per context/emotion) for deterministic tests |
| `stinger_star_burst.png` | 80×80 PNG test stinger |
| `face_snapshots_goal_reaction.json` | 120 FaceSnapshot records simulating a goal reaction (neutral→joy→fade) |
| `face_snapshots_heartbreak.json` | 80 FaceSnapshot records simulating joy→anger→sadness |
| `face_snapshots_quiet_customer.json` | 480 FaceSnapshot records with low-intensity emotions throughout |
