# Voice — operating limits

What stops a live voice session costing more than it should, where each limit is enforced, and
how to change it. Code: `src/services/voice/voiceQuota.ts`, `src/services/voice/voiceGateway.ts`.

## Why these exist

Before this, one ceiling applied: `MAX_SESSION_MS`, ten minutes per session. Nothing stopped a
user opening another the moment it ended, or ten at once, and `VOICE_ACCESS_MODE=all` means any
signed-in student. Gemini Live native audio is the most expensive call this product makes, so
"unmetered access for anyone who can register" was the single largest cost exposure left.

## The limits

| Limit | Default | Env var | Enforced |
|---|---|---|---|
| Voice seconds per user per day | 1800 (30 min) | `VOICE_DAILY_SECONDS` | Firestore |
| Sessions per user per day | 12 | `VOICE_DAILY_SESSIONS` | Firestore |
| Concurrent sessions per user | 1 | — | in-process |
| Minimum gap between starts | 3000 ms | `VOICE_MIN_START_GAP_MS` | in-process |
| Session duration | 10 min | — (`MAX_SESSION_MS`) | in-process timer |
| Time to authenticate | 15 s | — (`AUTH_DEADLINE_MS`) | in-process timer |
| Inbound audio per session | ~19 MB × 1.6 | — (derived) | per-frame counter |
| Single WebSocket frame | 256 KB | — (`MAX_PAYLOAD_BYTES`) | `ws` `maxPayload` |

Each stops something different, and dropping any one re-opens a gap:

- **Seconds per day** is the actual cost control.
- **Sessions per day** catches what seconds alone would miss — many short connections, each
  cheap in talk time but each paying for a Vertex handshake.
- **One at a time** is what makes the daily budget meaningful. Without it, ten parallel sessions
  spend the budget ten times over before the accounting catches up.
- **Start gap** stops a connect/drop loop.
- **Audio budget** stops a modified client sending faster than real time. Vertex bills on audio
  received, so without it the ten-minute clock could be spent in seconds by firing frames in a
  loop. Speech at 16 kHz mono 16-bit is 32 KB/s; the headroom covers base64 overhead and jitter.
- **Auth deadline** stops unauthenticated sockets accumulating. They reach nothing, but they are
  free to open and each holds a file descriptor.

## Cost ceiling

The limits give a hard per-user bound: **1800 audio-seconds per day**, whatever a client does.
Multiply by the current Vertex native-audio rate for the per-user-day figure, and by daily active
voice users for the exposure. The point of the table above is that this bound holds against a
hostile client, not merely a well-behaved one — which is what "10 minutes per session" alone
never gave.

Tighten `VOICE_DAILY_SECONDS` first; it is the term the total is most sensitive to and it needs
no redeploy beyond a PM2 restart with `--update-env`.

## Where the state lives, and the constraint on scaling

The daily counters are in Firestore (`voice_usage/{userId}`, one row per user holding
`day`, `seconds`, `sessions`) because they must survive a restart — a user who has spent their
day should not get it back because the API redeployed.

Concurrency and start-rate are **in-process**, because they describe what is happening right now
inside this process. That is correct at the current topology and only at that topology:

```
ecosystem.config.js → instances: 1, exec_mode: 'fork'
```

**Raising `instances` above 1 silently makes both limits per-worker.** Two workers means two
concurrent sessions per user and double the start rate. They would need moving to Redis first —
the same constraint the payment lock and the rate limiter already carry.

## Accounting

Usage is written every 60 s during a session, not only at the end, so a crash, kill or unclean
socket close leaves at most one minute unbilled. "Make the process die" must not be a way to get
free minutes.

The session count increments at **start**, not at end: a session opened and abandoned still cost
a handshake and a model connection.

Billing starts at `setupComplete`, not at socket open — a slow Vertex handshake is our latency,
not the student's quota.

## Behaviour when Firestore is unreachable

`beginSession` **allows** the session and logs a warning. The in-process concurrency and rate
limits still apply, so the exposure is one session per user rather than unlimited. Refusing every
user because a quota lookup failed would turn a metering outage into a product outage.

If that trade is ever wrong — a sustained Firestore outage under real voice traffic — the change
is one line in `beginSession`'s catch.

## Client-facing codes

| Code | Retry offered | Meaning |
|---|---|---|
| `VOICE_DAILY_LIMIT` | no | Budget or session count spent. Resets at UTC midnight. |
| `VOICE_SESSION_ALREADY_ACTIVE` | yes | Another tab holds the session. |
| `VOICE_STARTING_TOO_FAST` | yes | Reconnecting too quickly. Clears in seconds. |

`VOICE_DAILY_LIMIT` is in the non-retryable list in `VoiceMode.tsx` alongside `VOICE_DISABLED`,
`VOICE_REQUIRES_PRO` and `UNAUTHENTICATED`. The other two are deliberately not: for both, retrying
is the correct next action and the message says so.

The UI warns at under 10 minutes remaining rather than cutting the student off unheralded.

## Not implemented: transcript persistence

Phase 4 listed transcript persistence and reconnect-with-context. **Neither is built**, because
the voice UI currently tells every student:

> Prototype — audio isn't recorded or stored

Storing transcripts would make that false. It is a product and privacy decision, not an
implementation detail: it needs the claim changed, a retention period, and a deletion path before
any code is written. See `VoiceMode.tsx` for where the claim is shown.
