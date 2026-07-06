import { z } from 'zod';
import dotenv from 'dotenv';

// Load environment variables from .env file if present
dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('8080'),
  
  // Firebase Configuration
  FIREBASE_PROJECT_ID: z.string().optional(),
  FIREBASE_CLIENT_EMAIL: z.string().email().optional(),
  FIREBASE_PRIVATE_KEY: z.string().optional(),
  GOOGLE_APPLICATION_CREDENTIALS: z.string().optional(),
  FIREBASE_STORAGE_BUCKET: z.string().optional(),
  
  // AI Keys
  GEMINI_API_KEY: z.string().min(1, "GEMINI_API_KEY is required for the genai provider"),
  GROQ_API_KEY: z.string().optional(),
  NVIDIA_API_KEY: z.string().optional(),
  GROQ_MODEL: z.string().optional(),
  GEMINI_MODEL: z.string().optional(),
  // Global AI kill switch: set AI_DISABLED=true to make every AI/embedding call fail fast
  // (zero token spend) without removing API keys. Requires a restart to toggle.
  AI_DISABLED: z.string().optional(),
  // RAG & Tools
  // NOTE: API keys are intentionally NOT defaulted. They must be provided via the
  // environment (.env / secret manager). Previously-committed default keys were removed
  // and must be rotated. Services degrade gracefully when a key is absent.
  PINECONE_API_KEY: z.string().optional(),
  PINECONE_INDEX_NAME: z.string().default('edtech-ai-rag'),
  PINECONE_NAMESPACE: z.string().default('production'),
  TAVILY_API_KEY: z.string().optional(),
  COHERE_API_KEY: z.string().optional(),
  
  // Caching
  REDIS_URL: z.string().optional(),
  REDIS_TOKEN: z.string().optional(),

  // Security / Ops
  CRON_SECRET: z.string().optional(),
  CORS_ORIGINS: z.string().optional(), // comma-separated allowlist of origins for production CORS
}).refine(
  (data) => {
    // Either GOOGLE_APPLICATION_CREDENTIALS must be provided, OR all three manual FIREBASE vars must be provided.
    // If none are provided, firebase-admin will attempt to use default credentials (e.g. on GCP/Firebase hosting).
    const hasManualCreds = data.FIREBASE_PROJECT_ID && data.FIREBASE_CLIENT_EMAIL && data.FIREBASE_PRIVATE_KEY;
    const hasFileCreds = !!data.GOOGLE_APPLICATION_CREDENTIALS;
    
    // We'll allow empty if NODE_ENV is development to gracefully fall back to default application credentials, 
    // but usually we want at least one form of auth setup.
    return true; // You can add stricter validation if you want to enforce specific cred setups locally
  },
  {
    message: "Must provide either GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_PROJECT_ID/EMAIL/PRIVATE_KEY",
  }
);

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
  console.error('❌ Invalid environment variables:', _env.error.format());
  process.exit(1);
}

export const env = _env.data;

// Non-fatal warnings for secrets that were previously hardcoded and are now required
// via the environment. The related feature is disabled / fails at call time when unset.
const _warnIfMissing = (key: string, value?: string) => {
  if (!value) {
    console.warn(`[env] ${key} is not set. The related feature will be disabled or will fail when invoked.`);
  }
};
_warnIfMissing('PINECONE_API_KEY', env.PINECONE_API_KEY);
_warnIfMissing('TAVILY_API_KEY', env.TAVILY_API_KEY);
_warnIfMissing('GROQ_API_KEY', env.GROQ_API_KEY);
_warnIfMissing('COHERE_API_KEY', env.COHERE_API_KEY);

// ─── Global AI kill switch ───────────────────────────────────────────
// When AI_DISABLED=true, every LLM/embedding call throws immediately (zero token spend)
// while the API keys stay in place. Toggle it in .env and restart to apply.
export const isAIDisabled = (): boolean => env.AI_DISABLED === 'true';

export function assertAIEnabled(operation = 'AI call'): void {
  if (isAIDisabled()) {
    throw new Error(`AI_DISABLED: ${operation} blocked by the AI kill switch. Set AI_DISABLED=false (or unset it) and restart to re-enable.`);
  }
}

if (isAIDisabled()) {
  console.warn('[env] ⚠️  AI_DISABLED=true — AI kill switch is ON. All LLM/embedding calls will fail fast (no tokens spent).');
}
if (env.NODE_ENV === 'production' && !env.CORS_ORIGINS) {
  console.warn('[env] CORS_ORIGINS is not set in production — cross-origin browser requests will be blocked. Provide a comma-separated allowlist.');
}
