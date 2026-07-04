"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
const zod_1 = require("zod");
const dotenv_1 = __importDefault(require("dotenv"));
// Load environment variables from .env file if present
dotenv_1.default.config();
const envSchema = zod_1.z.object({
    NODE_ENV: zod_1.z.enum(['development', 'production', 'test']).default('development'),
    PORT: zod_1.z.string().default('8080'),
    // Firebase Configuration
    FIREBASE_PROJECT_ID: zod_1.z.string().optional(),
    FIREBASE_CLIENT_EMAIL: zod_1.z.string().email().optional(),
    FIREBASE_PRIVATE_KEY: zod_1.z.string().optional(),
    GOOGLE_APPLICATION_CREDENTIALS: zod_1.z.string().optional(),
    // AI Keys
    GEMINI_API_KEY: zod_1.z.string().min(1, "GEMINI_API_KEY is required for the genai provider"),
    GROQ_API_KEY: zod_1.z.string().optional(),
    NVIDIA_API_KEY: zod_1.z.string().optional(),
    // RAG & Tools
    PINECONE_API_KEY: zod_1.z.string().default('pcsk_4VuMim_UZHLBpMuwwoX17xXqnKBtptgc5o5ZN5omAXc1S6RcLyHs3mpBatxcBbzuVw5K56'),
    PINECONE_INDEX_NAME: zod_1.z.string().default('edtech-ai-rag'),
    PINECONE_NAMESPACE: zod_1.z.string().default('production'),
    TAVILY_API_KEY: zod_1.z.string().default('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'),
    COHERE_API_KEY: zod_1.z.string().optional(),
    // Caching
    REDIS_URL: zod_1.z.string().optional(),
    REDIS_TOKEN: zod_1.z.string().optional(),
}).refine((data) => {
    // Either GOOGLE_APPLICATION_CREDENTIALS must be provided, OR all three manual FIREBASE vars must be provided.
    // If none are provided, firebase-admin will attempt to use default credentials (e.g. on GCP/Firebase hosting).
    const hasManualCreds = data.FIREBASE_PROJECT_ID && data.FIREBASE_CLIENT_EMAIL && data.FIREBASE_PRIVATE_KEY;
    const hasFileCreds = !!data.GOOGLE_APPLICATION_CREDENTIALS;
    // We'll allow empty if NODE_ENV is development to gracefully fall back to default application credentials, 
    // but usually we want at least one form of auth setup.
    return true; // You can add stricter validation if you want to enforce specific cred setups locally
}, {
    message: "Must provide either GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_PROJECT_ID/EMAIL/PRIVATE_KEY",
});
const _env = envSchema.safeParse(process.env);
if (!_env.success) {
    console.error('❌ Invalid environment variables:', _env.error.format());
    process.exit(1);
}
exports.env = _env.data;
