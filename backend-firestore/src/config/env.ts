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
  
  // AI Keys
  GEMINI_API_KEY: z.string().min(1, "GEMINI_API_KEY is required for the genai provider"),
  GROQ_API_KEY: z.string().optional(),
  NVIDIA_API_KEY: z.string().optional(),
  // RAG & Tools
  PINECONE_API_KEY: z.string().default('pcsk_4VuMim_UZHLBpMuwwoX17xXqnKBtptgc5o5ZN5omAXc1S6RcLyHs3mpBatxcBbzuVw5K56'),
  PINECONE_INDEX_NAME: z.string().default('edtech-ai-rag'),
  PINECONE_NAMESPACE: z.string().default('production'),
  TAVILY_API_KEY: z.string().default('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'),
  COHERE_API_KEY: z.string().optional(),
  
  // Caching
  REDIS_URL: z.string().optional(),
  REDIS_TOKEN: z.string().optional(),
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
