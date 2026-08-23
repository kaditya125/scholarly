// Sadhya Backend Server
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';
import { errorHandler } from './middlewares/errorHandler';
import { bootstrapDI } from './core/di/registry';
import { checkReadiness } from './lib/health';
import { isTransientRedisDisconnect } from './utils/redisErrors';

// Initialize DI container before routing.
bootstrapDI();

/*
 * Register domain event subscribers.
 *
 * This was missing entirely: the subscriber implementations existed but nothing called this, so
 * the running server had an EventBus with NO mastery consumer — learning.test_completed was
 * published to a channel nobody was listening on for evidence.
 *
 * Placed HERE, and deliberately not elsewhere:
 *   - AFTER bootstrapDI(), so the invariant "DI ready before subscribers" holds even though no
 *     current subscriber resolves from the container (verified: subscribers.ts uses only module
 *     singletons — masteryEngine, NotificationFactory, the Firestore handle).
 *   - BEFORE the routes require() below and long before app.listen(), so no HTTP request can be
 *     served by a process whose handlers are not yet attached.
 *   - SYNCHRONOUSLY at module load rather than in the listen callback. EventBus subscribes to the
 *     Redis channel asynchronously from its own constructor and delivery is at-most-once with no
 *     replay, so anything arriving before these handlers exist is lost permanently. Registering
 *     synchronously wins that race deterministically, because the Redis connect is a network
 *     round trip. Registration itself needs no live Redis connection — subscribe() only populates
 *     an in-process Map, which is what the delivered message is later dispatched through.
 *
 * NOT gated on NODE_APP_INSTANCE the way the BullMQ workers below are. In cluster mode every
 * instance holds its own Redis subscriber and would receive the same message, so each needs its
 * own handlers; duplicate application is prevented at the correct layer — deterministic event
 * identity plus MasteryEngine's processedEventIds transaction — not by electing one listener.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { registerEventSubscribers } = require('./core/events/subscribers');
registerEventSubscribers();

// Load routes AFTER bootstrapDI(). Routes must be required here (not via a top-level
// `import`) because ES/TS import statements are hoisted above bootstrapDI(); some
// controllers (e.g. FeatureFlagsController -> FeatureFlagService, ConfigService)
// resolve DI dependencies at construction time, so the container must already be
// bootstrapped when their modules are loaded. (module: CommonJS makes require() safe.)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const routes = require('./routes').default;

const app = express();

// ==========================================
// 1. Production Security & Middleware Setup
// ==========================================

import { traceIdMiddleware } from './middlewares/traceId.middleware';

/*
 * Trust exactly one proxy hop.
 *
 * In production Nginx terminates TLS on the same host and forwards to 127.0.0.1:8080, so
 * without this every request arrives looking like it came from 127.0.0.1. That silently
 * breaks the rate limiter below in the worst way: instead of a budget per client, ALL
 * users share a single bucket, so ordinary traffic from a handful of people exhausts the
 * window and everyone gets 429s. It also makes `req.ip` useless for logging and abuse
 * handling.
 *
 * `1` rather than `true`: trusting every hop would let a client spoof its own address
 * via X-Forwarded-For and evade the limiter entirely. One hop is exactly what we have.
 */
app.set('trust proxy', 1);

// Parse JSON bodies with a larger limit to support base64 file attachments
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Add trace ID tracking to every incoming request
app.use(traceIdMiddleware);

// Enable CORS for frontend connection.
// In production the allowlist is driven by the CORS_ORIGINS env var (comma-separated).
// In development all origins are allowed for convenience.
const allowedOrigins = env.NODE_ENV === 'development'
  ? '*'
  : (env.CORS_ORIGINS ? env.CORS_ORIGINS.split(',').map(o => o.trim()).filter(Boolean) : []);

app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-trace-id', 'x-cron-secret']
}));

// Set security HTTP headers
app.use(helmet());

// Compress response bodies
app.use(compression());

// Request logging
app.use(morgan(env.NODE_ENV === 'development' ? 'dev' : 'combined'));

/*
 * Rate limiting to prevent brute-force and DDoS.
 *
 * The production ceiling was 100 per 15 minutes, which sounds generous but is not: this
 * is a per-IP budget across EVERY `/api` route, and a single page load spends a dozen of
 * them (stats, capabilities, sessions, profile, notifications...). A user who browses for
 * a few minutes and then opens the chat would hit the wall before sending a message —
 * which is exactly what happened on the first real production request. It was never
 * caught locally because `skip` disables the limiter entirely in development.
 */
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: env.NODE_ENV === 'development' ? 5000 : 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
  skip: () => env.NODE_ENV === 'development' // Skip entirely in dev
});
app.use('/api', limiter);

// ==========================================
// 2. Health Check Endpoint
// ==========================================
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Liveness: is the process up? (used by container/orchestrator restarts)
app.get('/health/live', (req, res) => {
  res.status(200).json({ status: 'alive', timestamp: new Date().toISOString() });
});

// Readiness: can we serve traffic? (checks critical dependencies)
app.get('/health/ready', async (req, res) => {
  try {
    const { ready, checks } = await checkReadiness();
    res.status(ready ? 200 : 503).json({
      status: ready ? 'ready' : 'not_ready',
      checks,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(503).json({ status: 'not_ready', error: err?.message, timestamp: new Date().toISOString() });
  }
});

// ==========================================
// 3. Public Stats (no auth required)
// ==========================================
import { db, auth } from './config/firebase';

interface PublicStatsResponse {
  students: number;
  activeStudents: number;
  teachers: number;
  totalUsers: number;
  recentStudentAvatars: string[];
  recentTeacherAvatars: string[];
}

let cachedStatsPayload: PublicStatsResponse | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 1000; // 5 seconds — matches frontend poll for near-real-time count
const ACTIVE_PRESENCE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

app.get('/api/public/stats', async (_req, res) => {
  try {
    if (cachedStatsPayload && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
      return res.json(cachedStatsPayload);
    }

    const [list, presenceSnap] = await Promise.all([
      auth.listUsers(1000),
      db.collection('presence')
        .where('lastActive', '>=', Date.now() - ACTIVE_PRESENCE_WINDOW_MS)
        .get()
        .catch(() => null)
    ]);

    const staffRoles = ['super_admin', 'admin', 'moderator', 'content_manager', 'support', 'analytics_viewer'];

    let studentCount = 0;
    let teacherCount = 0;
    const recentStudentAvatars: string[] = [];
    const recentTeacherAvatars: string[] = [];

    const getFallbackAvatar = (name: string, isTeacher = false) => 
      `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=${isTeacher ? 'c8e558' : 'random'}&color=000&rounded=true&bold=true`;

    // Sort users by most recently active first, so when someone updates their profile, they appear in the stack
    const sortedUsers = list.users.sort((a, b) => {
      const timeA = new Date(a.metadata.lastSignInTime || a.metadata.creationTime || 0).getTime();
      const timeB = new Date(b.metadata.lastSignInTime || b.metadata.creationTime || 0).getTime();
      return timeB - timeA;
    });

    for (const u of sortedUsers) {
      if (u.disabled) continue;
      const claims = u.customClaims || {};
      const role = (claims.role as string) || (claims.productRole as string) || '';
      const email = (u.email || '').toLowerCase();
      
      if (staffRoles.includes(role) || email.includes('admin@') || email.includes('test') || email.includes('rk8233321')) {
        continue; // skip platform admin/staff/test accounts
      }

      const name = u.displayName || email.split('@')[0] || (role === 'teacher' ? 'T' : 'S');
      const avatarUrl = u.photoURL || getFallbackAvatar(name, role === 'teacher');

      if (claims.productRole === 'teacher' || role === 'teacher') {
        teacherCount++;
        if (recentTeacherAvatars.length < 3) {
          recentTeacherAvatars.push(avatarUrl);
        }
      } else if (claims.productRole === 'student' || role === 'student') {
        studentCount++;
        if (recentStudentAvatars.length < 3) {
          recentStudentAvatars.push(avatarUrl);
        }
      }
    }

    studentCount = studentCount || 1;
    teacherCount = teacherCount || 1;
    const activeStudents = presenceSnap
      ? presenceSnap.docs.filter(d => (d.data().state ?? 'online') !== 'offline').length
      : 0;

    const payload: PublicStatsResponse = { 
      students: studentCount,
      activeStudents,
      teachers: teacherCount,
      totalUsers: studentCount + teacherCount,
      recentStudentAvatars,
      recentTeacherAvatars
    };

    cachedStatsPayload = payload;
    cacheTimestamp = Date.now();

    res.json(payload);
  } catch (err) {
    console.error('Failed to fetch public stats:', err);
    res.json({ 
      students: 1,
      activeStudents: 0,
      teachers: 1, 
      totalUsers: 2, 
      recentStudentAvatars: [], 
      recentTeacherAvatars: [] 
    });
  }
});

// ==========================================
// 3b. Presence Heartbeat (auth-required, Admin SDK write bypasses client rules)
// ==========================================

// Middleware to verify Firebase ID token
const verifyToken = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing auth token' });
  try {
    const decoded = await auth.verifyIdToken(token);
    (req as any).uid = decoded.uid;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid auth token' });
  }
};

app.post('/api/presence/heartbeat', verifyToken, async (req: express.Request, res: express.Response) => {
  const uid = (req as any).uid as string;
  try {
    await db.collection('presence').doc(uid).set(
      { uid, state: 'online', lastActive: Date.now() },
      { merge: true }
    );
    // Bust the stats cache so next poll reflects the new presence immediately
    cacheTimestamp = 0;
    return res.json({ ok: true });
  } catch (err) {
    console.error('Presence heartbeat error:', err);
    return res.status(500).json({ error: 'Failed to write presence' });
  }
});

app.post('/api/presence/offline', verifyToken, async (req: express.Request, res: express.Response) => {
  const uid = (req as any).uid as string;
  try {
    await db.collection('presence').doc(uid).set(
      { uid, state: 'offline', lastActive: Date.now() },
      { merge: true }
    );
    cacheTimestamp = 0;
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to write presence' });
  }
});

// ==========================================
// 4. API Routes
// ==========================================
app.use('/api', routes);

// ==========================================
// 4. Centralized Error Handling
// ==========================================
app.use(errorHandler);

// ==========================================
// 5. Server Startup & Graceful Shutdown
// ==========================================
const server = app.listen(env.PORT, () => {
  console.log(`🚀 Server running in ${env.NODE_ENV} mode on port ${env.PORT}`);

  // Start the BullMQ background worker so enqueued jobs (podcast.generate,
  // podcast.postassets, intelligence.*, notifications, etc.) actually get
  // processed. Without this call, /api/podcasts/generate accepts the request,
  // enqueues to Redis, and returns 202 — but nothing ever drains the queue,
  // so podcasts sit at status PENDING forever.
  //
  // Wrapped so a startup error in the worker never crashes the HTTP server —
  // the API stays up and the failure is visible in the logs.
  // In PM2 cluster mode each instance is a full copy of this process. BullMQ workers are
  // safe to run on more than one (jobs are locked in Redis, never processed twice) but
  // there's no reason to pay for N-times-redundant polling — one instance is enough to
  // drain the queues at current volume. PM2 sets NODE_APP_INSTANCE per worker ('0', '1', …);
  // it's unset outside cluster mode (dev, or a plain fork), where workers should always run.
  const instanceId = process.env.NODE_APP_INSTANCE;
  const isWorkerInstance = instanceId === undefined || instanceId === '0';

  const disableWorkers = String(process.env.DISABLE_WORKERS || '').toLowerCase() === 'true';
  if (disableWorkers) {
    console.log('⏸️  Background worker skipped (DISABLE_WORKERS=true).');
  } else if (!isWorkerInstance) {
    console.log(`⏸️  Background worker skipped (cluster instance ${instanceId}; instance 0 owns it).`);
  } else {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { startBackgroundWorker } = require('./core/workflow/jobs/BackgroundWorker');
      startBackgroundWorker();
    } catch (err: any) {
      console.error('[server] Failed to start background worker:', err?.message || err);
    }
    // The media worker drains the `media-jobs` queue. Podcast generation
    // enqueues `podcast.stitch` here AFTER synthesizing all voices, and
    // stitching is where audio mixing / mastering happens. Without this
    // worker, every podcast job completes SYNTHESIZING and then sits at
    // status="STITCHING" forever ("Mixing the audio" in the UI) because
    // nothing is consuming the stitch queue.
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { startMediaWorker } = require('./core/workflow/jobs/MediaWorker');
      startMediaWorker();
    } catch (err: any) {
      console.error('[server] Failed to start media worker:', err?.message || err);
    }

    /*
     * The notification worker drains `notification-jobs`. Same omission the mastery subscriber
     * had: startNotificationWorker() existed but was only ever called from one-off scripts, so
     * production enqueued notifications and nothing consumed them. Measured on the VM before this
     * fix: 5 jobs sitting in `wait` with the BullMQ id counter at 2022 — every notification the
     * platform had queued since deployment was stuck, and no student received any.
     *
     * IN-PROCESS rather than a dedicated PM2 worker service, deliberately:
     *   - BullMQ locks each job in Redis, so N workers never double-process one job. "Competing
     *     workers" cannot produce duplicate notifications; the instance election below makes it
     *     one worker anyway.
     *   - Its two siblings above already run here behind the same two gates, so a third pattern
     *     would add surface area without adding a guarantee.
     *   - The worker resolves NotificationIntelligenceService from the DI container, so a
     *     standalone entrypoint would need its own bootstrapDI() and a duplicate module graph
     *     (Firebase Admin, Vertex, Pinecone clients) — several hundred MB on a 2 vCPU / 8 GB box
     *     that is running tsx rather than a compiled build.
     *   - Redis is Upstash's quota-limited tier, and this worker already carries explicit
     *     pause-on-quota-exhausted handling. A second process would double idle polling against
     *     the limit it is written to survive.
     *   - The last time a second Node process was added to this VM (PM2 cluster, instances: 2) it
     *     crash-looped ~298 times in under 15 minutes. That is not a reason to never do it, but
     *     it is a reason not to do it as part of restoring a broken queue consumer.
     * Revisit when the VM is upgraded or cluster mode is re-enabled: the notification path does
     * LLM classification, FCM multicast, email and SMS, which is real work to isolate from
     * request serving.
     *
     * ⚠ BEFORE RE-ENABLING CLUSTER MODE: there is a latent duplicate-notification bug that this
     * election does NOT cover, because it is on the publish side, not the worker side.
     * EventBus.publish() enqueues to BullMQ inside publish() itself. Redis pub/sub broadcasts a
     * domain event to EVERY instance, so with N instances each one runs the podcast.completed /
     * notebook.ingested / user.registered subscriber, each publishes notification.created, and
     * each enqueues its own job — N distinct jobs, which BullMQ then correctly processes once
     * each, yielding N notifications. The anti-spam limiter only suppresses the 4th identical
     * event in 60s, so it would not catch a duplicate pair. Latent today only because
     * instances is pinned at 1.
     */
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { startNotificationWorker } = require('./core/workflow/jobs/NotificationWorker');
      startNotificationWorker();
    } catch (err: any) {
      console.error('[server] Failed to start notification worker:', err?.message || err);
    }

    // Background sync of registered users into the social discovery directory
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { connectionService } = require('./services/connection.service');
      connectionService.syncAllRegisteredUsers().then((count: number) => {
        console.log(`[DirectorySync] Synced ${count} registered users into social discovery directory`);
      }).catch((err: any) => {
        console.warn('[DirectorySync] Background directory sync warning:', err?.message || err);
      });
    } catch (err: any) {
      console.warn('[DirectorySync] Failed to initiate directory sync:', err?.message || err);
    }
  }
});

// Graceful shutdown handling
const shutdown = (signal: string) => {
  console.log(`\n🛑 Received ${signal}. Shutting down gracefully...`);
  server.close(() => {
    console.log('💤 HTTP server closed.');
    process.exit(0);
  });
  
  // Force shutdown if it takes too long
  setTimeout(() => {
    console.error('⏰ Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// ==========================================
// 6. Process-level Safety Nets
// ==========================================
// Log unhandled promise rejections but keep serving (a stray rejection in one
// request must not take down the process for all other users). Monitor these logs.
process.on('unhandledRejection', (reason: any) => {
  console.error('[unhandledRejection]', reason instanceof Error ? reason.stack : reason);
});

// An uncaught exception can leave the process in an undefined state — log it and
// shut down gracefully so the orchestrator can restart a clean instance.
process.on('uncaughtException', (err: Error) => {
  console.error('[uncaughtException]', err.stack || err.message);

  /*
   * Transient Redis/TLS disconnects are survivable and must not restart the API.
   *
   * This check previously matched only ECONNRESET / EPIPE / ETIMEDOUT as substrings, so
   * node-redis's SocketClosedUnexpectedlyError — an idle managed-Redis connection being dropped —
   * fell through to shutdown(). Production restarted roughly every six hours as a result. Because
   * the EventBus is at-most-once with no replay, each of those restarts was a window in which a
   * published learning event could be lost.
   *
   * isTransientRedisDisconnect() identifies the condition by error CLASS rather than by message
   * text, and is deliberately narrow: it covers connection-lifecycle faults node-redis recovers
   * from by reconnecting, and nothing else. Anything genuinely unexpected still shuts the process
   * down — the guarantee here is unchanged for real faults.
   *
   * The root cause is fixed at source in middleware/rateLimiter.ts (a client with no 'error'
   * listener, which is what turned a routine reconnect into an uncaught throw). This remains as
   * defence in depth for any client added later that forgets one.
   */
  if (isTransientRedisDisconnect(err)) {
    console.warn('⚠️ Transient Redis/network disconnect encountered; keeping HTTP server active. ' +
                 'The client reconnects on its own.');
    return;
  }

  shutdown('uncaughtException');
});

export default app;
