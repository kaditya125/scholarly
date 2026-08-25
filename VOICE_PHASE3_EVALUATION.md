# Voice Phase 3 — Human Evaluation Sheet

Prototype commit: `4a05a840` (+ dev metrics). **Not pushed, not deployed.**

This sheet exists because the Phase 3 quality gate is a *listening* test. It cannot be
completed from a headless environment — the agent has no microphone and no ears, and the
in-app browser blocks device audio. Everything below needs a person with headphones.

---

## Before you start

```bash
cd backend-firestore && npm run dev
```
```bash
cd frontend && npm run dev
```

Then open http://localhost:3000, sign in, go to **AI Chat → Voice** (button in the composer
toolbar). Use headphones — speaker audio feeding back into the mic will produce false
barge-ins and invalidate section 5.

**Open the browser console before you begin.** Latency is measured for you; see below.

---

## Latency is captured automatically

Timing these by stopwatch is hopeless at sub-second scale, so the session records it.

- Each turn logs `[voice-metric] {metric: 'end_of_speech_to_first_audio', ms}`
- Each barge-in logs `[voice-metric] {metric: 'barge_in_speech_to_silence', ms}`
- Clicking **End conversation** prints `[voice-metric] SUMMARY` with per-turn figures and averages
- The full table is also on `window.__voiceMetrics`

The instrumentation is observational only — it does not touch audio, pacing or state, so what
you are judging is the real experience.

Paste the SUMMARY here:

```
turns:
replyLatencyMs:
avgReplyLatencyMs:
bargeIns:
avgBargeInMs:
```

---

## 1. Basic conversation

Ask "Can you explain probability to me?" — speak normally, don't over-articulate.

| Check | Result | Notes |
|---|---|---|
| Mic permission prompt appears | PASS / FAIL | |
| Connects within a few seconds | PASS / FAIL | |
| Your words transcribed accurately | PASS / FAIL | |
| Reply audio starts progressively (not one late blob) | PASS / FAIL | |
| Voice sounds natural, not robotic | PASS / FAIL | |

## 2. Human-like quality (3–5 min, unscripted)

Use real phrases: "I don't really understand this." / "Wait, what did you mean?" /
"Give me another example." / "No, I mean something else."

| Check | Result | Notes |
|---|---|---|
| Remembers the previous turn | PASS / FAIL | |
| Understands pronouns ("that", "it") | PASS / FAIL | |
| Follow-ups work without restating context | PASS / FAIL | |
| Asks useful questions back | PASS / FAIL | |
| Doesn't repeat itself | PASS / FAIL | |
| Answers short enough for speech | PASS / FAIL | |
| Sounds like a tutor, not a chatbot reading text | PASS / FAIL | |

## 3. Barge-in (mandatory)

Let it start a long explanation, then cut in with "Wait, wait—".

| Check | Result | Notes |
|---|---|---|
| Audio stops quickly | PASS / FAIL | `avgBargeInMs` = |
| Feels conversational, not laggy | PASS / FAIL | |
| It responds to the interruption, not the old thread | PASS / FAIL | |

## 4. False interruptions

While it speaks: cough once, type lightly, shift in your chair.

| Trigger | Caused a false stop? | Notes |
|---|---|---|
| Cough | YES / NO | |
| Typing | YES / NO | |
| Chair / movement | YES / NO | |
| Background speech | YES / NO | |

## 5. Emotional adaptation

Use genuine tone; don't perform.

| Test | Say | Did delivery adapt (slower / calmer / simpler)? | Generic "I understand you're frustrated"? |
|---|---|---|---|
| Frustration | "I've done this three times and still get it wrong." | | |
| Confusion | "I'm completely lost, I don't know what this formula does." | | |
| Excitement | "Oh! I finally got it!" | | |

## 6. Language

| Test | Result | Notes |
|---|---|---|
| English | PASS / FAIL | |
| Hinglish — "Yaar probability ke questions mein galti ho rahi hai." | PASS / FAIL | |
| Hindi — "मुझे प्रायिकता समझ नहीं आ रही, आसान तरीके से समझाइए।" | PASS / FAIL | |
| Switching EN → HI → EN mid-session | PASS / FAIL | |
| Hindi *pronunciation* sounds natural | PASS / FAIL | separate from recognition |

## 7. Audio quality (headphones)

| Check | Result |
|---|---|
| Clear, no clipping or distortion | PASS / FAIL |
| No gaps between chunks | PASS / FAIL |
| No overlapping or repeated audio | PASS / FAIL |
| No abrupt cut at the end | PASS / FAIL |

## 8. Session end

| Check | Result |
|---|---|
| Mic indicator turns **off** | PASS / FAIL |
| Audio stops immediately | PASS / FAIL |
| Returns to chat, text still works | PASS / FAIL |
| Starting a second session works | PASS / FAIL |

## 9. Reconnect

Disable wifi mid-conversation, then re-enable.

> Expected today: the session ends with a clear message and a way back to text chat.
> **Automatic reconnection is NOT implemented** — that is Phase 4. Record what you observe.

Observed:

## 10. Devices

Mark only what you actually tested.

| Platform | Status |
|---|---|
| Chrome desktop | VERIFIED / NOT VERIFIED |
| Safari desktop | VERIFIED / NOT VERIFIED |
| Android | VERIFIED / NOT VERIFIED |
| iPhone / iPad | VERIFIED / NOT VERIFIED |
| Bluetooth headphones | VERIFIED / NOT VERIFIED |

---

## Issues found

Collect first, fix later — don't change code mid-evaluation.

| # | Issue | Severity | Observed | Expected |
|---|---|---|---|---|
| 1 | | BLOCKER / HIGH / MEDIUM / LOW / COSMETIC | | |

---

## Verdict

The gate is not "does the API work" — that is already proven. It is:

> **Would a student rather talk to this than type?**

```
Human Evaluation Status:   PASS / NEEDS IMPROVEMENT
Recommendation:            PROCEED TO PHASE 4 / FIX PHASE 3 ISSUES FIRST
```
