import * as crypto from 'crypto';
import { db } from '../config/firebase';
import { env } from '../config/env';
import { logger } from '../utils/logger';

/**
 * Live, admin-rotatable overrides for a fixed set of third-party API keys — NOT a general
 * secret store. A key not listed in MANAGEABLE_SECRET_KEYS is rejected outright by
 * isManageableSecretKey(), so this can never become a side channel for reaching credentials
 * it deliberately does not manage — Firebase's own service-account key above all, which is
 * this platform's identity, not a rotatable third-party API key (see the security-incident
 * notes on unrotated secrets — that key needs rotating at the IAM level, never through a
 * feature like this one).
 *
 * DESIGN. `.env` stays the source of truth for a key nobody has ever touched here — getSecret()
 * checks a stored override first and falls through to process.env when none exists. A
 * deployment that never uses this feature behaves EXACTLY as it did before this file existed.
 *
 * LIVE, NO RESTART. sadhya-api runs as a single PM2 process (fork mode, not cluster), so an
 * in-memory Map is enough to make a saved key effective immediately for every caller in this
 * process — no pub/sub, no cross-process cache invalidation to build. The Map is the fast
 * path (every read is a synchronous lookup, the same cost as reading `env.X`); Firestore is
 * only touched on save/clear and once at boot to repopulate the Map after a restart.
 *
 * STORAGE. AES-256-GCM, keyed by SECRETS_ENCRYPTION_KEY (.env only — see env.ts). Each
 * Firestore doc holds ciphertext + iv + authTag plus non-secret metadata (last4, who/when) for
 * the admin UI; the plaintext is never written anywhere else and never leaves this module
 * except as the direct return value of getSecret().
 */

const ENCRYPTION_ALGO = 'aes-256-gcm';

/** The only env vars this feature will ever read an override for or accept a write to. */
export const MANAGEABLE_SECRET_KEYS = [
  'GROQ_API_KEY',
  'GEMINI_API_KEY',
  'PINECONE_API_KEY',
  'COHERE_API_KEY',
  'TAVILY_API_KEY',
  'RAZORPAY_KEY_ID',
  'RAZORPAY_KEY_SECRET',
  'RAZORPAY_WEBHOOK_SECRET',
  'WHATSAPP_ACCESS_TOKEN',
  'WHATSAPP_PHONE_NUMBER_ID',
] as const;

export type ManageableSecretKey = (typeof MANAGEABLE_SECRET_KEYS)[number];

export function isManageableSecretKey(key: string): key is ManageableSecretKey {
  return (MANAGEABLE_SECRET_KEYS as readonly string[]).includes(key);
}

interface StoredSecret {
  ciphertext: string; // base64
  iv: string; // base64
  authTag: string; // base64
  last4: string;
  updatedAt: number;
  updatedByUid: string;
  updatedByEmail: string | null;
}

const overrides = new Map<ManageableSecretKey, string>();
let loadedOnce = false;

function getEncryptionKey(): Buffer {
  const hex = env.SECRETS_ENCRYPTION_KEY;
  if (!hex) {
    throw new Error(
      'SECRETS_ENCRYPTION_KEY is not configured on this server. Set a 64-character hex ' +
        'string (32 bytes) in the backend .env before storing runtime secrets.'
    );
  }
  const key = Buffer.from(hex, 'hex');
  if (key.length !== 32) {
    throw new Error('SECRETS_ENCRYPTION_KEY must decode to exactly 32 bytes (64 hex characters).');
  }
  return key;
}

function encrypt(plaintext: string): { ciphertext: string; iv: string; authTag: string } {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
  };
}

function decrypt(stored: Pick<StoredSecret, 'ciphertext' | 'iv' | 'authTag'>): string {
  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv(ENCRYPTION_ALGO, key, Buffer.from(stored.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(stored.authTag, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(stored.ciphertext, 'base64')),
    decipher.final(),
  ]);
  return plaintext.toString('utf8');
}

const collection = () => db.collection('runtime_secrets');

/**
 * Loads every stored override into memory. Called once from server.ts, right after
 * bootstrapDI(), fire-and-forget. A failure here — no SECRETS_ENCRYPTION_KEY yet, Firestore
 * unreachable at boot — is logged and swallowed: overrides stays empty and every getSecret()
 * call falls through to process.env, exactly as if this feature were absent.
 */
export async function loadRuntimeSecrets(): Promise<void> {
  if (loadedOnce) return;
  loadedOnce = true;
  try {
    const snap = await collection().get();
    for (const doc of snap.docs) {
      if (!isManageableSecretKey(doc.id)) continue;
      try {
        overrides.set(doc.id, decrypt(doc.data() as StoredSecret));
      } catch (e) {
        logger.error(`runtimeSecrets: failed to decrypt stored override for ${doc.id}`, {
          error: (e as Error).message,
        });
      }
    }
    if (overrides.size > 0) {
      logger.info(`runtimeSecrets: loaded ${overrides.size} stored override(s) from runtime_secrets`);
    }
  } catch (e) {
    logger.warn('runtimeSecrets: failed to load stored overrides (falling back to .env only)', {
      error: (e as Error).message,
    });
  }
}

/** The effective value for a manageable key: a stored override if one exists, else process.env. */
export function getSecret(key: ManageableSecretKey): string | undefined {
  const override = overrides.get(key);
  return override !== undefined ? override : process.env[key];
}

export interface SecretStatus {
  key: ManageableSecretKey;
  /** 'override' = set through this feature; 'env' = only ever set in .env; 'unset' = neither. */
  source: 'override' | 'env' | 'unset';
  last4: string | null;
  updatedAt: number | null;
  updatedByEmail: string | null;
}

/** Status for one key, safe to hand to the admin UI — the plaintext is never included. */
export async function getSecretStatus(key: ManageableSecretKey): Promise<SecretStatus> {
  const doc = await collection().doc(key).get();
  if (doc.exists) {
    const data = doc.data() as StoredSecret;
    return {
      key,
      source: 'override',
      last4: data.last4,
      updatedAt: data.updatedAt,
      updatedByEmail: data.updatedByEmail,
    };
  }
  const envValue = process.env[key];
  return {
    key,
    source: envValue ? 'env' : 'unset',
    last4: envValue ? envValue.slice(-4) : null,
    updatedAt: null,
    updatedByEmail: null,
  };
}

export async function getAllSecretStatuses(): Promise<SecretStatus[]> {
  return Promise.all(MANAGEABLE_SECRET_KEYS.map((key) => getSecretStatus(key)));
}

/** Stores a new value, live for every caller in this process from the moment this returns. */
export async function setSecret(
  key: ManageableSecretKey,
  plaintext: string,
  actor: { uid: string; email: string | null }
): Promise<void> {
  const trimmed = plaintext.trim();
  if (!trimmed) throw new Error('A secret value cannot be empty. Use clearSecret to remove one.');
  const { ciphertext, iv, authTag } = encrypt(trimmed);
  const stored: StoredSecret = {
    ciphertext,
    iv,
    authTag,
    last4: trimmed.slice(-4),
    updatedAt: Date.now(),
    updatedByUid: actor.uid,
    updatedByEmail: actor.email,
  };
  await collection().doc(key).set(stored);
  // Only after the write succeeds — a Firestore failure must never leave this process
  // acting on a value that was not actually persisted (it would vanish on the next restart
  // with no record it was ever set).
  overrides.set(key, trimmed);
}

/** Reverts a key to its .env value, live immediately. */
export async function clearSecret(key: ManageableSecretKey): Promise<void> {
  await collection().doc(key).delete();
  overrides.delete(key);
}
