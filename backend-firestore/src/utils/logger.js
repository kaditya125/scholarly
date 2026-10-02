"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
exports.logWithTrace = logWithTrace;
const winston_1 = __importDefault(require("winston"));
const { combine, timestamp, printf, json, colorize, errors } = winston_1.default.format;
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
exports.logger = winston_1.default.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: combine(errors({ stack: true }), timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), json() // Default to structured JSON for production
    ),
    defaultMeta: { service: 'sadhya-api' },
    transports: [
        new winston_1.default.transports.Console({
            format: process.env.NODE_ENV !== 'production'
                ? combine(colorize(), customFormat)
                : json()
        }),
    ],
});
function logWithTrace(traceId, level, message, meta = {}) {
    exports.logger.log(level, message, { traceId, ...meta });
}
