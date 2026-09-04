import { GoogleGenAI } from '@google/genai';
import { env } from '../../config/env';
import { withRetry } from '../../utils/retry';
import { classifyProviderError, isRateLimit } from '../../core/errors/providerErrors';
import { logger } from '../../utils/logger';
import { getSecret } from '../runtimeSecrets.service';

/** The effective Gemini key: an admin-rotated override if one is set, else .env. */
const geminiApiKey = (): string | undefined => getSecret('GEMINI_API_KEY') || env.GEMINI_API_KEY;

/**
 * Central factory for the Google Gen AI SDK client.
 *
 * Two modes, selected by the GOOGLE_GENAI_USE_VERTEXAI flag:
 *
 *  - Vertex AI (Agent Platform "Express") — flag = 'true':
 *      new GoogleGenAI({ vertexai: true, apiKey: GOOGLE_VERTEX_API_KEY })
 *      Routes generation + embeddings through Vertex AI (aiplatform.googleapis.com)
 *      so usage bills to the Vertex/Agent-Platform project and can draw on that
 *      project's promotional credits. The "AQ." Express API key authenticates
 *      directly — no ADC / service account / gcloud required.
 *
 *  - Gemini Developer API (default / flag off):
 *      new GoogleGenAI({ apiKey: GEMINI_API_KEY })
 *      The original path (generativelanguage.googleapis.com), kept for backward
 *      compatibility and as a fallback.
 *
 * Both modes expose the identical `.models.generateContent / generateContentStream
 * / embedContent` surface, so provider call sites are unchanged. Embeddings from
 * `gemini-embedding-001 @ 768` were verified identical across both modes
 * (cosine = 1.000000), so the existing Pinecone index remains compatible.
 */

export const useVertexAI = (): boolean => env.GOOGLE_GENAI_USE_VERTEXAI === 'true';

export function createGoogleGenAIClient(): GoogleGenAI {
  if (useVertexAI()) {
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS && !process.env.GOOGLE_APPLICATION_CREDENTIALS_RESOLVED) {
      const path = require('path');
      process.env.GOOGLE_APPLICATION_CREDENTIALS = path.resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS);
      process.env.GOOGLE_APPLICATION_CREDENTIALS_RESOLVED = 'true';
    }
    return new GoogleGenAI({
      vertexai: true,
      project: process.env.GOOGLE_VERTEX_PROJECT || 'eng-cache-501514-q4',
      location: process.env.GOOGLE_VERTEX_LOCATION || 'asia-southeast1',
    });
  }

  const apiKey = geminiApiKey();
  if (!apiKey) {
    throw new Error(
      'No AI credential configured. Set GEMINI_API_KEY (Developer API) or ' +
      'GOOGLE_GENAI_USE_VERTEXAI=true with GOOGLE_VERTEX_API_KEY (Vertex AI).'
    );
  }
  // Explicit vertexai:false so the ambient GOOGLE_GENAI_USE_VERTEXAI env var (which
  // the SDK auto-reads) can't accidentally flip a Developer-API client into Vertex mode.
  return new GoogleGenAI({ vertexai: false, apiKey });
}

/**
 * Builds a Developer-API fallback client, used ONLY when the primary is Vertex AI.
 * Vertex "Express" has aggressive per-minute rate limits (observed 429s under load);
 * when a call is throttled after retries, we transparently fail over to the paid
 * Developer API so user-facing requests still succeed. Returns null when there's no
 * distinct fallback (not in Vertex mode, or no Developer key configured).
 */
export function createFallbackGoogleGenAIClient(): GoogleGenAI | null {
  if (!useVertexAI()) return null;   // primary is already the Developer API
  const apiKey = geminiApiKey();
  if (!apiKey) return null;          // no fallback credential available
  return new GoogleGenAI({ vertexai: false, apiKey });
}

/** True for rate-limit / resource-exhausted errors (429). Also recognizes the typed error. */
export function isRateLimitError(err: any): boolean {
  return isRateLimit(err);
}

/**
 * True for a DAILY free-tier quota exhaustion (as opposed to a transient per-minute 429).
 * Google reports these with a "...RequestsPerDay..." quotaId / "free_tier_requests" metric,
 * e.g. `EmbedContentRequestsPerDayPerUserPerProjectPerModel-FreeTier, limit: 1000`. These do
 * NOT clear on retry within the day, so failing over to this endpoint again is pointless.
 */
export function isDailyQuotaExhausted(err: any): boolean {
  const msg = String(err?.message || err?.error?.message || (() => { try { return JSON.stringify(err); } catch { return ''; } })());
  return /RESOURCE_EXHAUSTED|\b429\b|quota/i.test(msg) && /PerDay|per[-_ ]?day|free_tier_requests/i.test(msg);
}

// Process-wide circuit breaker: once the Developer-API fallback reports its DAILY quota
// exhausted, stop failing over to it for the remainder of this process (further calls would
// only 429 again). Reset naturally when the process restarts (after the daily quota resets).
let developerFallbackExhausted = false;
export const isFallbackDisabled = (): boolean => developerFallbackExhausted;

export interface ResilientClients {
  primary: GoogleGenAI;
  fallback: GoogleGenAI | null;
  primaryLabel: string;
}

/** Primary + fallback client pair, built once per provider. */
export function getResilientClients(): ResilientClients {
  return {
    primary: createGoogleGenAIClient(),
    fallback: createFallbackGoogleGenAIClient(),
    primaryLabel: useVertexAI() ? 'vertex' : 'developer',
  };
}

/**
 * Runs `op` against the primary client with retry/backoff (which already honors
 * server-supplied 429 delays). If the primary is still rate-limited after retries
 * and a Developer-API fallback exists, transparently retries `op` on the fallback.
 * Any non-rate-limit error, or a failure with no fallback, is rethrown unchanged.
 */
export async function runResilient<T>(
  clients: ResilientClients,
  op: (ai: GoogleGenAI) => Promise<T>,
  opts: { label: string; retries?: number } = { label: 'genai' }
): Promise<T> {
  const retries = opts.retries ?? 4;
  try {
    return await withRetry(() => op(clients.primary), { retries, label: opts.label });
  } catch (err) {
    // Classify into a typed provider error (message preserved) for consistent handling + logs.
    const typed = classifyProviderError(err, clients.primaryLabel);
    // Only fail over while the fallback is still viable. Once its daily quota is exhausted we
    // stop hammering it (the circuit breaker below trips on the first daily-quota failure).
    if (clients.fallback && !developerFallbackExhausted && isRateLimitError(typed)) {
      logger.warn(`[genai] ${opts.label}: ${clients.primaryLabel} rate-limited after ${retries} retries — failing over to Developer API`, {
        label: opts.label, provider: clients.primaryLabel, retries, event: 'failover', errorType: typed.name,
      });
      try {
        return await withRetry(() => op(clients.fallback!), { retries, label: `${opts.label}:fallback` });
      } catch (fbErr) {
        if (isDailyQuotaExhausted(fbErr)) {
          developerFallbackExhausted = true;
          logger.warn(`[genai] ${opts.label}: Developer API DAILY quota exhausted — disabling failover for the rest of this run`, {
            label: opts.label, provider: 'developer', event: 'circuit_breaker_open',
          });
        }
        throw classifyProviderError(fbErr, 'developer');
      }
    }
    throw typed;
  }
}
