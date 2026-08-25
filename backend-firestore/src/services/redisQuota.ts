/**
 * Shared circuit breaker for Upstash request-quota exhaustion.
 *
 * Upstash meters REQUESTS, not connections or data. When the plan's allowance runs out every
 * command returns `ERR max requests limit exceeded`, and the failure mode observed in production
 * was self-inflicted: four independent clients (cache, rate limiter, EventBus pub + sub, and the
 * BullMQ worker) each kept issuing commands, each logged every rejection, and none of them stopped
 * asking. A quota that is already gone cannot be recovered by asking for it more often — the retry
 * traffic just turns one outage into a log flood.
 *
 * So the breaker is global rather than per-client. The quota is an account-wide budget; a limit
 * discovered by the cache is equally true for the rate limiter a millisecond later, and making each
 * client rediscover it costs another rejected request every time.
 *
 * While tripped, callers are expected to take their own degraded path — in-memory cache, in-memory
 * rate limiting, dropped pub/sub — NOT to fail the request. None of these are correctness-critical
 * at this deployment's single-process topology.
 *
 * NOTE: this makes the application behave correctly while over quota. It does not create quota.
 * Capacity returns when the plan's window resets or the plan is changed.
 */

/** How long to stay tripped before letting one probe through. */
const COOLDOWN_MS = Number(process.env.REDIS_QUOTA_COOLDOWN_MS || 15 * 60 * 1000);

let trippedAt = 0;
let tripCount = 0;
let lastSource = '';

/** Upstash's wording for the request-allowance rejection. Matched loosely — it appears in the
 *  message of both the REST body and the node-redis/ioredis error. */
export function isQuotaError(err: unknown): boolean {
  const msg = String((err as any)?.message ?? err ?? '');
  return /max requests limit exceeded|ERR too many requests|quota exceeded/i.test(msg);
}

/** True while Redis should be left alone. Cheap enough to call on every operation. */
export function isRedisOverQuota(): boolean {
  if (!trippedAt) return false;
  if (Date.now() - trippedAt >= COOLDOWN_MS) {
    // Cooldown elapsed: allow traffic again. If the quota is still gone the next rejection
    // re-trips immediately, which costs one request per cooldown window rather than one per call.
    trippedAt = 0;
    console.warn(`[redis-quota] cooldown elapsed after trip #${tripCount}; probing Redis again`);
    return false;
  }
  return true;
}

/**
 * Report a Redis failure. Returns true if it was a quota rejection (and the breaker is now open),
 * so callers can distinguish "out of budget" from an ordinary transient fault worth retrying.
 */
export function noteRedisError(err: unknown, source: string): boolean {
  if (!isQuotaError(err)) return false;
  if (!trippedAt) {
    trippedAt = Date.now();
    tripCount++;
    lastSource = source;
    // Logged once per trip, not once per rejection. The flood was the symptom that made this
    // hard to see in the first place.
    console.error(
      `[redis-quota] request quota exhausted (first seen by ${source}). ` +
      `Falling back to in-memory for ${Math.round(COOLDOWN_MS / 60000)}m. ` +
      `This does not restore quota — the plan window must reset or the plan must change.`,
    );
  }
  return true;
}

/**
 * Run `resume` once the cooldown has elapsed.
 *
 * Exists because pausing on quota exhaustion is only half a fix. Each BullMQ worker called
 * `worker.pause(true)` and nothing ever called resume, so once the allowance ran out the job
 * pipeline stayed dead until somebody restarted the process — quota coming back at the start of
 * the next window changed nothing. Recovery has to be scheduled at the moment of pausing, or it
 * does not happen at all.
 *
 * If the quota is still gone, the next rejection simply re-trips the breaker and this runs again.
 */
export function scheduleQuotaRecovery(resume: () => void, label: string): void {
  const timer = setTimeout(() => {
    console.warn(`[redis-quota] attempting to resume ${label} after cooldown`);
    try {
      resume();
    } catch (err) {
      console.warn(`[redis-quota] resume of ${label} failed:`, (err as any)?.message ?? err);
    }
  }, COOLDOWN_MS);
  // Never hold the process open just to retry a paused worker.
  if (typeof timer.unref === 'function') timer.unref();
}

export function redisQuotaStatus() {
  return {
    overQuota: trippedAt !== 0,
    trippedAt: trippedAt || null,
    tripCount,
    lastSource,
    cooldownMs: COOLDOWN_MS,
  };
}

/** Test seam. */
export function __resetRedisQuotaBreaker() {
  trippedAt = 0;
  tripCount = 0;
  lastSource = '';
}
