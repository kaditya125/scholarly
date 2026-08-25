import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';

/*
 * ── Rate limiting is IN-MEMORY here, deliberately ────────────────────────────────────────
 *
 * It already was, though not on purpose. `getStore()` was evaluated synchronously while these
 * limiters were constructed at module load, but `useRedis` only became true inside the async
 * `.connect()` callback — which always resolved later. So the flag was invariably false at the
 * moment it was read, every limiter got the default memory store, and the Redis client that was
 * opened for this purpose sat idle and unused. Idle is exactly why the provider kept dropping it,
 * which is the reconnect churn the previous comment here was written to explain.
 *
 * Making it in-memory explicitly is also correct for this deployment rather than merely cheaper:
 * ecosystem.config.js pins `instances: 1` / `exec_mode: fork`, verified in production, so there
 * is no second process for a shared store to coordinate with. A Redis round trip per request
 * would buy nothing and Upstash bills per request.
 *
 * If this ever runs more than one instance, a shared store becomes REQUIRED for the limits to
 * mean anything — set RATE_LIMIT_REDIS_URL and restore a store here. Leaving it unset is a
 * decision about topology, not an oversight.
 */
if (process.env.RATE_LIMIT_REDIS_URL) {
  console.warn(
    '[RateLimiter] RATE_LIMIT_REDIS_URL is set but a shared store is not wired up. ' +
    'Rate limits are per-process; with more than one instance they will not be enforced globally.',
  );
}

/** Default in-memory store. Explicit so the call sites read as a choice. */
const getStore = () => undefined;

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 100, 
  store: getStore(),
  standardHeaders: true, 
  legacyHeaders: false, 
  message: { error: 'Too many requests, please try again later.' },
  handler: (req: Request, res: Response, next, options) => {
    console.warn(`Rate limit exceeded for IP: ${req.ip}`);
    res.status(options.statusCode).send(options.message);
  }
});

export const strictLimiter = rateLimit({
  windowMs: 60 * 1000, 
  max: 10, 
  store: getStore(),
  message: { error: 'Too many generations requested. Please wait a minute.' },
});

// ---------------------------------------------------------------------------
// Paid generation endpoints
// ---------------------------------------------------------------------------
// Podcast generation and similar expensive endpoints reuse the strict limiter
// (10 req/min). Exposed under its own name so route files can express intent
// clearly and so we can tune it independently later without touching every
// call site.
export const podcastGenerateLimiter = strictLimiter;

export const helpdeskLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  store: getStore(),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many helpdesk inquiries from this IP. Please wait a few minutes before asking again.' },
});

