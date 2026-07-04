import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';
import { errorHandler } from './middlewares/errorHandler';
import { bootstrapDI } from './core/di/registry';

// Initialize DI container before routing
bootstrapDI();

import routes from './routes';

const app = express();

// ==========================================
// 1. Production Security & Middleware Setup
// ==========================================

// Parse JSON bodies with a larger limit to support base64 file attachments
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Enable CORS for frontend connection
app.use(cors({
  origin: env.NODE_ENV === 'development' ? '*' : ['https://your-production-domain.com'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
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

// ==========================================
// 3. API Routes
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

export default app;
