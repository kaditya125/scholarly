import { db } from '../../config/firebase';
import { usageService } from '../usage.service';
import { entitlementService } from '../entitlement.service';

/**
 * Cost and abuse limits for voice sessions, tied to monthly subscription entitlements.
 *
 * Limits:
 *   Free: 15 minutes/month (900 seconds)
 *   Pro:  300 minutes/month (18,000 seconds / 5 hours)
 *
 * Three layers:
 *   MONTHLY BUDGET   total speaking seconds per user per billing cycle/month (tracked via usageService).
 *   ONE AT A TIME    a single live session per user to block multi-tab concurrent draining.
 *   START RATE       minimum 3s gap to eliminate connection flood loops.
 */

/** Minimum gap between starts. Blocks reconnect loops without troubling a normal retry. */
const MIN_START_GAP_MS = Number(process.env.VOICE_MIN_START_GAP_MS || 3000);

export type QuotaDenial =
  | 'VOICE_MONTHLY_LIMIT'
  | 'VOICE_SESSION_ALREADY_ACTIVE'
  | 'VOICE_STARTING_TOO_FAST';

export interface QuotaDecision {
  ok: boolean;
  code?: QuotaDenial;
  message?: string;
  /** Seconds left in the user's monthly allowance. */
  remaining?: number;
  limit?: number;
  used?: number;
  plan?: string;
  resetsAt?: number;
}

/** Users with a live session right now in this process. */
const active = new Set<string>();
/** Last session start per user, for the start-rate check. */
const lastStart = new Map<string, number>();

/**
 * Checks whether this user may open a live voice session now.
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

  try {
    const quota = await usageService.checkQuota(userId, 'voiceSeconds', 10);
    if (!quota.allowed || quota.remaining <= 0) {
      return {
        ok: false,
        code: 'VOICE_MONTHLY_LIMIT',
        message: quota.plan === 'pro'
          ? "You have reached your 300-minute monthly Voice Chat allowance. It will reset on your next billing date."
          : "You have used your 15-minute monthly Voice Chat allowance. Upgrade to Pro for up to 300 minutes each month.",
        remaining: 0,
        limit: quota.limit,
        used: quota.used,
        plan: quota.plan,
        resetsAt: quota.resetsAt,
      };
    }

    active.add(userId);
    lastStart.set(userId, Date.now());

    return {
      ok: true,
      remaining: quota.remaining,
      limit: quota.limit,
      used: quota.used,
      plan: quota.plan,
      resetsAt: quota.resetsAt,
    };
  } catch (err: any) {
    console.warn('[voice-quota] usage lookup failed, allowing session:', err?.message || err);
    active.add(userId);
    lastStart.set(userId, Date.now());
    return { ok: true, remaining: 900 };
  }
}

/**
 * Add speaking seconds to the user's monthly total.
 */
export async function accrue(userId: string, seconds: number): Promise<void> {
  if (!userId || seconds <= 0) return;
  try {
    await usageService.consumeQuota(userId, 'voiceSeconds', Math.round(seconds));
  } catch (err: any) {
    console.warn('[voice-quota] accrue failed or quota reached:', err?.message || err);
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
  return { minStartGapMs: MIN_START_GAP_MS };
}

/** Test seam. */
export function __resetVoiceQuotaState() {
  active.clear();
  lastStart.clear();
}
