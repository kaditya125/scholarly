import {
  MANAGEABLE_SECRET_KEYS,
  ManageableSecretKey,
  isManageableSecretKey,
  getAllSecretStatuses,
  setSecret,
  clearSecret,
  SecretStatus,
} from '../../services/runtimeSecrets.service';

/**
 * Display metadata for the Settings → API Keys section. Purely presentational — the
 * mechanics (encryption, live in-process override, .env fallback) all live in
 * runtimeSecrets.service.ts and are unaffected by anything here. Every key listed matches
 * MANAGEABLE_SECRET_KEYS exactly; adding a service means adding it in both places, which is
 * deliberate — a key not in runtimeSecrets.service.ts's allowlist can never be written
 * through this admin surface no matter what this metadata claims.
 */
export interface SecretMeta {
  key: ManageableSecretKey;
  service: string;
  label: string;
  /** Whether saving this key takes effect immediately (see each provider's own comment for
   *  why) or needs a restart the first time a never-before-configured integration is turned on. */
  liveNote: string;
}

const META: Record<ManageableSecretKey, Omit<SecretMeta, 'key'>> = {
  GROQ_API_KEY: {
    service: 'Groq',
    label: 'Chat (primary)',
    liveNote: 'Live immediately — the next chat request uses it.',
  },
  GEMINI_API_KEY: {
    service: 'Google Gemini',
    label: 'Chat fallback + embeddings',
    liveNote: 'Live immediately — the next request uses it.',
  },
  PINECONE_API_KEY: {
    service: 'Pinecone',
    label: 'Vector database',
    liveNote: 'Live immediately — the next retrieval or ingestion call uses it.',
  },
  COHERE_API_KEY: {
    service: 'Cohere',
    label: 'Reranker',
    liveNote: 'Live immediately — the next retrieval call uses it.',
  },
  TAVILY_API_KEY: {
    service: 'Tavily',
    label: 'Web search',
    liveNote: 'Live immediately — the next web search uses it.',
  },
  RAZORPAY_KEY_ID: {
    service: 'Razorpay',
    label: 'Key ID',
    liveNote: 'Live immediately — the next order or refund uses it.',
  },
  RAZORPAY_KEY_SECRET: {
    service: 'Razorpay',
    label: 'Key secret',
    liveNote: 'Live immediately — the next order, refund or signature check uses it.',
  },
  RAZORPAY_WEBHOOK_SECRET: {
    service: 'Razorpay',
    label: 'Webhook secret',
    liveNote:
      'Live immediately, but must match what is set in the Razorpay dashboard or inbound webhooks stop verifying.',
  },
  WHATSAPP_ACCESS_TOKEN: {
    service: 'WhatsApp (Meta Cloud API)',
    label: 'Access token',
    liveNote:
      'Live immediately once WhatsApp is already active. If it was never configured, a restart is still needed the first time (bootstrapDI decides mock-vs-real once, at boot).',
  },
  WHATSAPP_PHONE_NUMBER_ID: {
    service: 'WhatsApp (Meta Cloud API)',
    label: 'Phone number ID',
    liveNote: 'Same as the access token above.',
  },
};

export interface SecretRow extends SecretMeta, Omit<SecretStatus, 'key'> {}

export class AdminSecretsService {
  async list(): Promise<SecretRow[]> {
    const statuses = await getAllSecretStatuses();
    const byKey = new Map(statuses.map((s) => [s.key, s]));
    return MANAGEABLE_SECRET_KEYS.map((key) => {
      const meta = META[key];
      const { key: _statusKey, ...status } = byKey.get(key)!;
      return { key, ...meta, ...status };
    });
  }

  async set(key: string, value: string, actor: { uid: string; email: string | null }): Promise<void> {
    if (!isManageableSecretKey(key)) {
      throw Object.assign(new Error(`Unknown secret key: ${key}`), { code: 'UNKNOWN_KEY' });
    }
    await setSecret(key, value, actor);
  }

  async clear(key: string): Promise<void> {
    if (!isManageableSecretKey(key)) {
      throw Object.assign(new Error(`Unknown secret key: ${key}`), { code: 'UNKNOWN_KEY' });
    }
    await clearSecret(key);
  }
}

export const adminSecretsService = new AdminSecretsService();
