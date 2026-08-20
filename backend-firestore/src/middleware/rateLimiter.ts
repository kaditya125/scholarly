import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { createClient } from 'redis';
import { Request, Response } from 'express';

// Setup Redis Client
let redisClient: ReturnType<typeof createClient> | null = null;
let useRedis = false;

if (process.env.REDIS_URL) {
  redisClient = createClient({ url: process.env.REDIS_URL });

  /*
   * THIS LISTENER IS LOAD-BEARING, not defensive noise.
   *
   * node-redis emits 'error' on the client for runtime socket faults, and an EventEmitter with no
   * 'error' listener THROWS — which becomes an uncaughtException and, before this, took the whole
   * API down. This was the only one of the four Redis clients in the codebase missing a handler
   * (EventBus's pub/sub clients and the NotificationWorker's anti-spam client all have one), and
   * it is the least-used connection, so it sat idle longest and was the first the provider
   * dropped. That produced the ~6-hourly production restarts.
   *
   * The .catch() below does NOT cover this: it only settles the initial connect promise. Faults
   * after a successful connect had nowhere to go.
   *
   * Logged and swallowed on purpose — node-redis reconnects on its own, and getStore() already
   * degrades to the in-memory limiter, so a dropped connection is a recoverable condition rather
   * than a reason to stop serving traffic.
   */
  redisClient.on('error', (err: any) => {
    console.warn('[RateLimiter] Redis error (reconnect is handled by the client):', err?.message);
  });

  redisClient.connect().then(() => {
    console.log('Connected to Redis for Rate Limiting');
    useRedis = true;
  }).catch(err => {
    console.warn('Redis connection failed, falling back to in-memory rate limiting', err);
    useRedis = false;
  });
}

// Generate the store conditionally
const getStore = () => {
  if (useRedis && redisClient) {
    return new RedisStore({
      sendCommand: (...args: string[]) => redisClient!.sendCommand(args),
    });
  }
  return undefined; // Default in-memory store
};

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
