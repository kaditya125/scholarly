import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';

export function traceIdMiddleware(req: Request, res: Response, next: NextFunction) {
  const traceId = (req.headers['x-trace-id'] as string) || uuidv4();
  req.headers['x-trace-id'] = traceId;
  
  res.setHeader('x-trace-id', traceId);
  
  logger.info(`Incoming ${req.method} ${req.url}`, { traceId, ip: req.ip });
  
  next();
}
