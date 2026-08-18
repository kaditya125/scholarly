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

// Initialize DI container before routing.
bootstrapDI();

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

// Rate limiting to prevent brute-force and DDoS
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: env.NODE_ENV === 'development' ? 5000 : 100, // Higher limit for dev
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

let cachedStudentCount: number | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 30 * 1000; // 30 seconds

app.get('/api/public/stats', async (_req, res) => {
  try {
    const list = await auth.listUsers(1000);
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

    res.json({ 
      students: studentCount,
      teachers: teacherCount,
      totalUsers: studentCount + teacherCount,
      recentStudentAvatars,
      recentTeacherAvatars
    });
  } catch (err) {
    console.error('Failed to fetch public stats:', err);
    res.json({ 
      students: 1, 
      teachers: 1, 
      totalUsers: 2, 
      recentStudentAvatars: [], 
      recentTeacherAvatars: [] 
    });
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
  const disableWorkers = String(process.env.DISABLE_WORKERS || '').toLowerCase() === 'true';
  if (disableWorkers) {
    console.log('⏸️  Background worker skipped (DISABLE_WORKERS=true).');
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
  // Ignore transient network disconnects from remote Redis/TLS connections
  const msg = (err.message || '').toLowerCase();
  if (msg.includes('econnreset') || msg.includes('epipe') || msg.includes('etimedout')) {
    console.warn('⚠️ Transient network disconnect encountered; keeping HTTP server active.');
    return;
  }
  shutdown('uncaughtException');
});

export default app;
