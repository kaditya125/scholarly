import winston from 'winston';

const { combine, timestamp, printf, json, colorize, errors } = winston.format;

const customFormat = printf(({ level, message, timestamp, traceId, ...metadata }) => {
  let msg = `${timestamp} [${level}]`;
  if (traceId) {
    msg += ` [traceId: ${traceId}]`;
  }
  msg += `: ${message} `;
  
  if (Object.keys(metadata).length > 0) {
    msg += JSON.stringify(metadata);
  }
  return msg;
});

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(
    errors({ stack: true }),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    json() // Default to structured JSON for production
  ),
  defaultMeta: { service: 'scholarly-api' },
  transports: [
    new winston.transports.Console({
      format: process.env.NODE_ENV !== 'production'
        ? combine(colorize(), customFormat)
        : json()
    }),
  ],
});

export function logWithTrace(traceId: string, level: string, message: string, meta: any = {}) {
    logger.log(level, message, { traceId, ...meta });
}
