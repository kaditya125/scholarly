"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isAIDisabled = exports.env = void 0;
exports.assertAIEnabled = assertAIEnabled;
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
    FIREBASE_STORAGE_BUCKET: zod_1.z.string().optional(),
    // AI Keys
    GEMINI_API_KEY: zod_1.z.string().min(1, "GEMINI_API_KEY is required for the genai provider"),
    GROQ_API_KEY: zod_1.z.string().optional(),
    NVIDIA_API_KEY: zod_1.z.string().optional(),
    GROQ_MODEL: zod_1.z.string().optional(),
    GEMINI_MODEL: zod_1.z.string().optional(),
    // Global AI kill switch: set AI_DISABLED=true to make every AI/embedding call fail fast
    // (zero token spend) without removing API keys. Requires a restart to toggle.
    AI_DISABLED: zod_1.z.string().optional(),
    // RAG & Tools
    // NOTE: API keys are intentionally NOT defaulted. They must be provided via the
    // environment (.env / secret manager). Previously-committed default keys were removed
    // and must be rotated. Services degrade gracefully when a key is absent.
    PINECONE_API_KEY: zod_1.z.string().optional(),
    PINECONE_INDEX_NAME: zod_1.z.string().default('edtech-ai-rag'),
    PINECONE_NAMESPACE: zod_1.z.string().default('production'),
    TAVILY_API_KEY: zod_1.z.string().optional(),
    COHERE_API_KEY: zod_1.z.string().optional(),
    // Caching
    REDIS_URL: zod_1.z.string().optional(),
    REDIS_TOKEN: zod_1.z.string().optional(),
    // Security / Ops
    CRON_SECRET: zod_1.z.string().optional(),
    CORS_ORIGINS: zod_1.z.string().optional(), // comma-separated allowlist of origins for production CORS
    // Teacher verification.
    //
    // When 'true', a newly created teacher profile is assigned 'approved' immediately instead of
    // 'pending', so a development environment is not blocked behind a review queue that has no
    // reviewer. It is opt-in by ABSENCE-IS-FALSE: unset, empty, or any value other than the exact
    // string 'true' leaves auto-approval OFF, which makes the production default safe by default
    // rather than by remembering to set it.
    //
    // An auto-approval still writes a verification audit event attributed to the system, so it is
    // always distinguishable from a genuine review. The UI must key "verified" off the status
    // itself (isVerifiedStatus), never off this flag.
    TEACHER_AUTO_APPROVE: zod_1.z.string().optional(),
    // Payments
    RAZORPAY_KEY_ID: zod_1.z.string().optional(),
    RAZORPAY_KEY_SECRET: zod_1.z.string().optional(),
    RAZORPAY_WEBHOOK_SECRET: zod_1.z.string().optional(),
    // RazorpayX / Route (Phase 3K — automated teacher payouts). A SEPARATE product from the
    // RAZORPAY_* keys above, with its own onboarding and a business-entity prerequisite. Reading
    // these unset is expected and correct right now — see services/payout/PayoutProvider.ts.
    RAZORPAYX_KEY_ID: zod_1.z.string().optional(),
    RAZORPAYX_KEY_SECRET: zod_1.z.string().optional(),
    RAZORPAYX_ACCOUNT_NUMBER: zod_1.z.string().optional(),
    // 100ms (Phase 3M — live classes, TESTING vendor). App Access Key + App Secret from the
    // project's Developer dashboard; the server SDK mints its own management tokens from these,
    // never a manually-copied one. HMS_TEMPLATE_ID and the role names must match what's actually
    // configured in the 100ms dashboard's Templates section — see HundredMsProvider.ts.
    HMS_ACCESS_KEY: zod_1.z.string().optional(),
    HMS_SECRET: zod_1.z.string().optional(),
    HMS_TEMPLATE_ID: zod_1.z.string().optional(),
    HMS_TEACHER_ROLE: zod_1.z.string().default('teacher'),
    HMS_STUDENT_ROLE: zod_1.z.string().default('student'),
    // The template's subdomain (100ms dashboard → Templates → Room Links) — join URLs are
    // https://<subdomain>.app.100ms.live/meeting/<room-code>. Required for a room-code join link
    // to resolve to anything; see HundredMsProvider.ts#buildJoinUrl.
    HMS_SUBDOMAIN: zod_1.z.string().optional(),
    // Video and Veo Models
    GROK_VERTEX_PROJECT: zod_1.z.string().optional(),
    VEO_LOCATION: zod_1.z.string().optional(),
    VEO_MODEL: zod_1.z.string().optional(),
    VEO_OUTPUT_BUCKET: zod_1.z.string().optional(),
    GROK_SA_KEY_FILE: zod_1.z.string().optional(),
    GROK_MODEL: zod_1.z.string().optional(),
    VIDEO_LESSON_SCENES: zod_1.z.string().optional(),
    VIDEO_LESSON_DAILY_LIMIT: zod_1.z.string().optional(),
    VEO_ENABLED: zod_1.z.string().optional(),
    // Vertex AI routing — when true, Gemini/embedding calls go through Vertex.
    GOOGLE_GENAI_USE_VERTEXAI: zod_1.z.string().optional(),
    GOOGLE_VERTEX_PROJECT: zod_1.z.string().optional(),
    GOOGLE_VERTEX_LOCATION: zod_1.z.string().optional(),
    // Twilio SMS — falls back to Mock provider when any of the three is empty.
    TWILIO_ACCOUNT_SID: zod_1.z.string().optional(),
    TWILIO_AUTH_TOKEN: zod_1.z.string().optional(),
    TWILIO_FROM_NUMBER: zod_1.z.string().optional(),
    // Meta WhatsApp Cloud API — falls back to Mock provider when empty.
    WHATSAPP_ACCESS_TOKEN: zod_1.z.string().optional(),
    WHATSAPP_PHONE_NUMBER_ID: zod_1.z.string().optional(),
    // Chat fast-path toggle read by GenerationOrchestrator; keep declared so it
    // can be set from .env without a schema failure.
    CHAT_FAST_ANSWER: zod_1.z.string().optional(),
    // Reasoning model toggles
    CHAT_REASONING_ENABLED: zod_1.z.string().optional(),
    CHAT_REASONING_MODEL: zod_1.z.string().optional(),
    // ZeptoMail & Transactional Email Configuration
    ZEPTO_API_KEY: zod_1.z.string().optional(),
    ZEPTO_FROM_EMAIL: zod_1.z.string().default('noreply@sadhya.app'),
    ZEPTO_FROM_NAME: zod_1.z.string().default('Sadhya'),
    ZEPTO_API_URL: zod_1.z.string().default('https://api.zeptomail.in/v1.1/email'),
    SMTP_HOST: zod_1.z.string().optional(),
    SMTP_PORT: zod_1.z.string().optional(),
    SMTP_USER: zod_1.z.string().optional(),
    SMTP_PASS: zod_1.z.string().optional(),
    SMTP_FROM: zod_1.z.string().optional(),
    SMTP_SECURE: zod_1.z.string().optional(),
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
// Non-fatal warnings for secrets that were previously hardcoded and are now required
// via the environment. The related feature is disabled / fails at call time when unset.
const _warnIfMissing = (key, value) => {
    if (!value) {
        console.warn(`[env] ${key} is not set. The related feature will be disabled or will fail when invoked.`);
    }
};
_warnIfMissing('PINECONE_API_KEY', exports.env.PINECONE_API_KEY);
_warnIfMissing('TAVILY_API_KEY', exports.env.TAVILY_API_KEY);
_warnIfMissing('GROQ_API_KEY', exports.env.GROQ_API_KEY);
_warnIfMissing('COHERE_API_KEY', exports.env.COHERE_API_KEY);
// ─── Global AI kill switch ───────────────────────────────────────────
// When AI_DISABLED=true, every LLM/embedding call throws immediately (zero token spend)
// while the API keys stay in place. Toggle it in .env and restart to apply.
const isAIDisabled = () => exports.env.AI_DISABLED === 'true';
exports.isAIDisabled = isAIDisabled;
function assertAIEnabled(operation = 'AI call') {
    if ((0, exports.isAIDisabled)()) {
        throw new Error(`AI_DISABLED: ${operation} blocked by the AI kill switch. Set AI_DISABLED=false (or unset it) and restart to re-enable.`);
    }
}
if ((0, exports.isAIDisabled)()) {
    console.warn('[env] ⚠️  AI_DISABLED=true — AI kill switch is ON. All LLM/embedding calls will fail fast (no tokens spent).');
}
if (exports.env.NODE_ENV === 'production' && !exports.env.CORS_ORIGINS) {
    console.warn('[env] CORS_ORIGINS is not set in production — cross-origin browser requests will be blocked. Provide a comma-separated allowlist.');
}
// ─── Vertex AI routing signal ────────────────────────────────────────
// The @google/genai SDK reads GOOGLE_GENAI_USE_VERTEXAI itself; this line is
// just to make the routing visible in the boot log. When "true", Gemini and
// embedding calls hit Vertex AI (Agent Platform / Express) using the service
// account credentials rather than a bare API key.
if (exports.env.GOOGLE_GENAI_USE_VERTEXAI === 'true') {
    console.log('[env] ✅ Vertex AI mode enabled — Google AI calls route through Vertex AI (Service Account/Express).');
}
