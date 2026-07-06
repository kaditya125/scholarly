import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { createClient } from 'redis';
import { Request, Response } from 'express';

// Setup Redis Client
let redisClient: ReturnType<typeof createClient> | null = null;
let useRedis = false;

if (process.env.REDIS_URL) {
  redisClient = createClient({ url: process.env.REDIS_URL });
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
