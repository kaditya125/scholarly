"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// Scholarly Backend Server
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const compression_1 = __importDefault(require("compression"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const env_1 = require("./config/env");
const errorHandler_1 = require("./middlewares/errorHandler");
const registry_1 = require("./core/di/registry");
const health_1 = require("./lib/health");
// Initialize DI container before routing.
(0, registry_1.bootstrapDI)();
// Load routes AFTER bootstrapDI(). Routes must be required here (not via a top-level
// `import`) because ES/TS import statements are hoisted above bootstrapDI(); some
// controllers (e.g. FeatureFlagsController -> FeatureFlagService, ConfigService)
// resolve DI dependencies at construction time, so the container must already be
// bootstrapped when their modules are loaded. (module: CommonJS makes require() safe.)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const routes = require('./routes').default;
const app = (0, express_1.default)();
// ==========================================
// 1. Production Security & Middleware Setup
// ==========================================
const traceId_middleware_1 = require("./middlewares/traceId.middleware");
// Parse JSON bodies with a larger limit to support base64 file attachments
app.use(express_1.default.json({ limit: '50mb' }));
app.use(express_1.default.urlencoded({ limit: '50mb', extended: true }));
// Add trace ID tracking to every incoming request
app.use(traceId_middleware_1.traceIdMiddleware);
// Enable CORS for frontend connection.
// In production the allowlist is driven by the CORS_ORIGINS env var (comma-separated).
// In development all origins are allowed for convenience.
const allowedOrigins = env_1.env.NODE_ENV === 'development'
    ? '*'
    : (env_1.env.CORS_ORIGINS ? env_1.env.CORS_ORIGINS.split(',').map(o => o.trim()).filter(Boolean) : []);
app.use((0, cors_1.default)({
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-trace-id', 'x-cron-secret']
}));
// Set security HTTP headers
app.use((0, helmet_1.default)());
// Compress response bodies
app.use((0, compression_1.default)());
// Request logging
app.use((0, morgan_1.default)(env_1.env.NODE_ENV === 'development' ? 'dev' : 'combined'));
// Rate limiting to prevent brute-force and DDoS
const limiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: env_1.env.NODE_ENV === 'development' ? 5000 : 100, // Higher limit for dev
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' },
    skip: () => env_1.env.NODE_ENV === 'development' // Skip entirely in dev
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
        const { ready, checks } = await (0, health_1.checkReadiness)();
        res.status(ready ? 200 : 503).json({
            status: ready ? 'ready' : 'not_ready',
            checks,
            timestamp: new Date().toISOString(),
        });
    }
    catch (err) {
        res.status(503).json({ status: 'not_ready', error: err?.message, timestamp: new Date().toISOString() });
    }
});
// ==========================================
// 3. Public Stats (no auth required)
// ==========================================
const firebase_1 = require("./config/firebase");
let cachedStudentCount = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 30 * 1000; // 30 seconds
app.get('/api/public/stats', async (_req, res) => {
    try {
        const list = await firebase_1.auth.listUsers(1000);
        const staffRoles = ['super_admin', 'admin', 'moderator', 'content_manager', 'support', 'analytics_viewer'];
        let studentCount = 0;
        let teacherCount = 0;
        const recentStudentAvatars = [];
        const recentTeacherAvatars = [];
        const getFallbackAvatar = (name, isTeacher = false) => `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=${isTeacher ? 'c8e558' : 'random'}&color=000&rounded=true&bold=true`;
        // Sort users by most recently active first, so when someone updates their profile, they appear in the stack
        const sortedUsers = list.users.sort((a, b) => {
            const timeA = new Date(a.metadata.lastSignInTime || a.metadata.creationTime || 0).getTime();
            const timeB = new Date(b.metadata.lastSignInTime || b.metadata.creationTime || 0).getTime();
            return timeB - timeA;
        });
        for (const u of sortedUsers) {
            if (u.disabled)
                continue;
            const claims = u.customClaims || {};
            const role = claims.role || claims.productRole || '';
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
            }
            else if (claims.productRole === 'student' || role === 'student') {
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
    }
    catch (err) {
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
app.use(errorHandler_1.errorHandler);
// ==========================================
// 5. Server Startup & Graceful Shutdown
// ==========================================
const server = app.listen(env_1.env.PORT, () => {
    console.log(`🚀 Server running in ${env_1.env.NODE_ENV} mode on port ${env_1.env.PORT}`);
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
    }
    else {
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const { startBackgroundWorker } = require('./core/workflow/jobs/BackgroundWorker');
            startBackgroundWorker();
        }
        catch (err) {
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
        }
        catch (err) {
            console.error('[server] Failed to start media worker:', err?.message || err);
        }
    }
});
// Graceful shutdown handling
const shutdown = (signal) => {
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
process.on('unhandledRejection', (reason) => {
    console.error('[unhandledRejection]', reason instanceof Error ? reason.stack : reason);
});
// An uncaught exception can leave the process in an undefined state — log it and
// shut down gracefully so the orchestrator can restart a clean instance.
process.on('uncaughtException', (err) => {
    console.error('[uncaughtException]', err.stack || err.message);
    // Ignore transient network disconnects from remote Redis/TLS connections
    const msg = (err.message || '').toLowerCase();
    if (msg.includes('econnreset') || msg.includes('epipe') || msg.includes('etimedout')) {
        console.warn('⚠️ Transient network disconnect encountered; keeping HTTP server active.');
        return;
    }
    shutdown('uncaughtException');
});
exports.default = app;
