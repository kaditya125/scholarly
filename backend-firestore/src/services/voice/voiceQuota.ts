import { db } from '../../config/firebase';

/**
 * Cost and abuse limits for voice sessions.
 *
 * Until now the only ceiling was MAX_SESSION_MS — ten minutes per session, with nothing stopping
 * a user starting another the moment it ended, or ten at once. With VOICE_ACCESS_MODE=all that is
 * unmetered access to a native-audio model for anyone who can sign in, and native audio is the
 * most expensive thing this product calls.
 *
 * Three separate limits, because they stop three different things:
 *
 *   DAILY BUDGET     total speaking seconds per user per day. The actual cost control.
 *   ONE AT A TIME    a single live session per user. Without it the daily budget is worthless —
 *                    ten parallel sessions spend it ten times faster and the accounting only
 *                    catches up when they end.
 *   START RATE       how often a session may be opened. Connecting and dropping in a loop costs
 *                    a Vertex handshake every time without ever accruing much duration.
 *
 * ── Where the state lives ────────────────────────────────────────────────────────────────────
 * The daily budget is in Firestore because it must survive a restart; a user who has spent their
 * day should not get it back because the API redeployed. Concurrency and start-rate are in-process
 * because they describe what is happening RIGHT NOW inside this process, and ecosystem.config.js
 * pins instances to 1 / fork mode. Raising that above 1 makes both of them per-worker and they
 * would need moving to Redis — the same constraint the payment lock and rate limiter carry.
 */

/** Speaking seconds per user per day. Ten minutes is one full session at the current cap. */
const DAILY_SECONDS = Number(process.env.VOICE_DAILY_SECONDS || 1800);
/** Sessions per user per day, so many short connections cannot dodge the seconds budget. */
const DAILY_SESSIONS = Number(process.env.VOICE_DAILY_SESSIONS || 12);
/** Minimum gap between starts. Blocks reconnect loops without troubling a normal retry. */
const MIN_START_GAP_MS = Number(process.env.VOICE_MIN_START_GAP_MS || 3000);

export type QuotaDenial =
  | 'VOICE_DAILY_LIMIT'
  | 'VOICE_SESSION_ALREADY_ACTIVE'
  | 'VOICE_STARTING_TOO_FAST';

export interface QuotaDecision {
  ok: boolean;
  code?: QuotaDenial;
  message?: string;
  /** Seconds left in the user's day, when known. */
  remaining?: number;
}

/** Users with a live session right now. See the note above about instances: 1. */
const active = new Set<string>();
/** Last session start per user, for the start-rate check. */
const lastStart = new Map<string, number>();

const dayKey = (at = new Date()) => at.toISOString().slice(0, 10);
const usageRef = (userId: string) => db.collection('voice_usage').doc(userId);

interface UsageDoc {
  day: string;
  seconds: number;
  sessions: number;
  updatedAt: number;
}

async function readUsage(userId: string): Promise<UsageDoc> {
  const snap = await usageRef(userId).get();
  const data = snap.data() as UsageDoc | undefined;
  // A record from a previous day is not this day's usage. Treated as zero rather than reset on
  // write, so a user who never comes back does not leave a stale row claiming spend.
  if (!data || data.day !== dayKey()) {
    return { day: dayKey(), seconds: 0, sessions: 0, updatedAt: Date.now() };
  }
  return data;
}

/**
 * May this user open a session now?
 *
 * Reserves the slot on success — the caller MUST call `endSession` when the socket closes, or the
 * user is locked out of voice until the process restarts. voiceGateway does that from `teardown`,
 * which every exit path runs through.
 */
export async function beginSession(userId: string): Promise<QuotaDecision> {
  if (active.has(userId)) {
    return {
      ok: false,
      code: 'VOICE_SESSION_ALREADY_ACTIVE',
      message: 'Voice chat is already open in another tab. Close it and try again.',
    };
  }

  const since = Date.now() - (lastStart.get(userId) ?? 0);
  if (since < MIN_START_GAP_MS) {
    return {
      ok: false,
      code: 'VOICE_STARTING_TOO_FAST',
      message: 'Give it a moment before starting voice chat again.',
    };
  }

  let usage: UsageDoc;
  try {
    usage = await readUsage(userId);
  } catch (err) {
    /*
     * Firestore is unreachable. Allowing the session is the deliberate choice: the in-process
     * concurrency and rate limits still apply, so the exposure is one session rather than
     * unlimited, and refusing every user because a quota lookup failed turns a metering outage
     * into a product outage.
     */
    console.warn('[voice-quota] usage lookup failed, allowing session:', (err as any)?.message);
    active.add(userId);
    lastStart.set(userId, Date.now());
    return { ok: true };
  }

  if (usage.seconds >= DAILY_SECONDS) {
    return {
      ok: false,
      code: 'VOICE_DAILY_LIMIT',
      message: "You've used today's voice time. It resets tomorrow — text chat is still open.",
      remaining: 0,
    };
  }
  if (usage.sessions >= DAILY_SESSIONS) {
    return {
      ok: false,
      code: 'VOICE_DAILY_LIMIT',
      message: "You've reached today's voice session limit. It resets tomorrow.",
      remaining: Math.max(0, DAILY_SECONDS - usage.seconds),
    };
  }

  active.add(userId);
  lastStart.set(userId, Date.now());

  // Counted at START, not at end. A session that is opened and abandoned still cost a handshake
  // and a model connection, and counting only completed sessions would let that be repeated.
  try {
    await usageRef(userId).set(
      { day: usage.day, seconds: usage.seconds, sessions: usage.sessions + 1, updatedAt: Date.now() },
      { merge: true },
    );
  } catch { /* accounted on accrue instead */ }

  return { ok: true, remaining: Math.max(0, DAILY_SECONDS - usage.seconds) };
}

/**
 * Add speaking seconds to today's total.
 *
 * Called periodically DURING a session as well as at the end, so a crash or an unclean socket
 * close costs at most one tick of unaccounted time rather than the whole session.
 */
export async function accrue(userId: string, seconds: number): Promise<void> {
  if (!userId || seconds <= 0) return;
  try {
    await db.runTransaction(async (tx) => {
      const ref = usageRef(userId);
      const snap = await tx.get(ref);
      const data = snap.data() as UsageDoc | undefined;
      const sameDay = data && data.day === dayKey();
      tx.set(ref, {
        day: dayKey(),
        seconds: Math.round((sameDay ? data!.seconds : 0) + seconds),
        sessions: sameDay ? data!.sessions : 1,
        updatedAt: Date.now(),
      }, { merge: true });
    });
  } catch (err) {
    console.warn('[voice-quota] accrue failed:', (err as any)?.message);
  }
}

/** Release the concurrency slot. Must run on every exit path. */
export function endSession(userId: string): void {
  if (userId) active.delete(userId);
}

/** True while this user holds a live session in this process. */
export function hasActiveSession(userId: string): boolean {
  return active.has(userId);
}

export function voiceQuotaLimits() {
  return { dailySeconds: DAILY_SECONDS, dailySessions: DAILY_SESSIONS, minStartGapMs: MIN_START_GAP_MS };
}

/** Test seam. */
export function __resetVoiceQuotaState() {
  active.clear();
  lastStart.clear();
}
