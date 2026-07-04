"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const compression_1 = __importDefault(require("compression"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const env_1 = require("./config/env");
const errorHandler_1 = require("./middlewares/errorHandler");
const routes_1 = __importDefault(require("./routes"));
const app = (0, express_1.default)();
// ==========================================
// 1. Production Security & Middleware Setup
// ==========================================
// Parse JSON bodies with a larger limit to support base64 file attachments
app.use(express_1.default.json({ limit: '50mb' }));
app.use(express_1.default.urlencoded({ limit: '50mb', extended: true }));
// Enable CORS for frontend connection
app.use((0, cors_1.default)({
    origin: env_1.env.NODE_ENV === 'development' ? '*' : ['https://your-production-domain.com'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
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
// ==========================================
// 3. API Routes
// ==========================================
app.use('/api', routes_1.default);
// ==========================================
// 4. Centralized Error Handling
// ==========================================
app.use(errorHandler_1.errorHandler);
// ==========================================
// 5. Server Startup & Graceful Shutdown
// ==========================================
const server = app.listen(env_1.env.PORT, () => {
    console.log(`🚀 Server running in ${env_1.env.NODE_ENV} mode on port ${env_1.env.PORT}`);
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
exports.default = app;
