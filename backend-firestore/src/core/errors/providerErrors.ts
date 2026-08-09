/**
 * Typed error hierarchy for external-provider failures (Task 7 / Phase 1 completion).
 *
 * Design constraints:
 *  - Purely additive: every class extends the native Error, preserves the original `.message`,
 *    and keeps `instanceof Error === true`, so existing message-based checks (e.g. the graph
 *    backfill's rate-limit/daily-quota detection, chat.service's "429" cleanup) keep working.
 *  - `retryable` is computed with the SAME heuristics the resilience layer already used, so
 *    classifying an error into a typed error NEVER changes a retry/fallback decision.
 *  - Behavior/APIs are unchanged; this only improves maintainability + observability.
 */

export interface ProviderErrorMeta {
  /** Logical provider label, e.g. 'gemini', 'vertex', 'cohere', 'pinecone'. */
  provider?: string;
  /** The original underlying error, preserved for logging / debugging. */
  cause?: unknown;
  /** HTTP-ish status if known. */
  status?: number;
  /** Server-suggested retry delay in ms (rate limits). */
  retryAfterMs?: number;
}

/** Base class for all provider-related errors. */
export class ProviderError extends Error {
  readonly provider?: string;
  readonly status?: number;
  readonly retryAfterMs?: number;
  /** Whether the resilience layer considers this transient/worth retrying. */
  readonly retryable: boolean;
  readonly cause?: unknown;

  constructor(message: string, retryable: boolean, meta: ProviderErrorMeta = {}) {
    super(message);
    this.name = new.target.name;
    this.retryable = retryable;
    this.provider = meta.provider;
    this.status = meta.status;
    this.retryAfterMs = meta.retryAfterMs;
    this.cause = meta.cause;
    // Preserve prototype chain when targeting ES5 (ts-jest/commonjs).
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** A call exceeded its timeout budget. Transient → retryable. */
export class ProviderTimeoutError extends ProviderError {
  constructor(message: string, meta: ProviderErrorMeta = {}) { super(message, true, meta); }
}

/** Provider temporarily unavailable / overloaded / 5xx / network. Transient → retryable. */
export class ProviderUnavailableError extends ProviderError {
  constructor(message: string, meta: ProviderErrorMeta = {}) { super(message, true, meta); }
}

/** Bad/missing credentials or permission (401/403). NOT retryable. */
export class ProviderAuthenticationError extends ProviderError {
  constructor(message: string, meta: ProviderErrorMeta = {}) { super(message, false, meta); }
}

/** Rate limited / quota exhausted (429 / RESOURCE_EXHAUSTED). Retryable (honoring retryAfterMs). */
export class ProviderRateLimitError extends ProviderError {
  constructor(message: string, meta: ProviderErrorMeta = {}) { super(message, true, meta); }
}

/** A retrieval (vector/web/curriculum) operation failed. */
export class RetrievalError extends ProviderError {
  constructor(message: string, meta: ProviderErrorMeta = {}) { super(message, false, meta); }
}

/** An embedding operation failed. */
export class EmbeddingError extends ProviderError {
  constructor(message: string, meta: ProviderErrorMeta = {}) { super(message, false, meta); }
}

/** A verification (claim-checking) operation failed. */
export class VerificationError extends ProviderError {
  constructor(message: string, meta: ProviderErrorMeta = {}) { super(message, false, meta); }
}

// ─── Classification helpers (mirror the existing resilience heuristics) ──────

function statusOf(err: any): number | undefined {
  const s = err?.status ?? err?.response?.status ?? err?.code;
  return typeof s === 'number' ? s : undefined;
}

function msgOf(err: any): string {
  return typeof err?.message === 'string'
    ? err.message
    : (() => { try { return JSON.stringify(err); } catch { return String(err); } })();
}

/** Extract a server-suggested retry delay (ms) from a rate-limit error message, if present. */
export function extractRetryAfterMs(err: any): number | undefined {
  const msg = msgOf(err);
  const m = msg.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/) || msg.match(/retry in (\d+(?:\.\d+)?)\s*s/i);
  return m ? Math.ceil(parseFloat(m[1]) * 1000) : undefined;
}

export function isAuthError(err: any): boolean {
  const status = statusOf(err);
  if (status === 401 || status === 403) return true;
  return /\b401\b|\b403\b|unauthenticated|permission denied|invalid api key|api key not valid|unauthorized/i.test(msgOf(err));
}

export function isRateLimit(err: any): boolean {
  if (err instanceof ProviderRateLimitError) return true;
  const status = statusOf(err);
  if (status === 429) return true;
  return /\b429\b|RESOURCE_EXHAUSTED|resource exhausted|rate limit|quota/i.test(msgOf(err));
}

export function isTimeout(err: any): boolean {
  if (err instanceof ProviderTimeoutError) return true;
  return /timed out|timeout|deadline exceeded/i.test(msgOf(err));
}

export function isUnavailable(err: any): boolean {
  if (err instanceof ProviderUnavailableError) return true;
  const status = statusOf(err);
  if (typeof status === 'number' && status >= 500 && status < 600) return true;
  // Node/undici network-level failure codes. Observed in production load testing (see
  // docs/LATENCY_INVESTIGATION_REPORT.md §3.4): ECONNABORTED and a bare "terminated"/
  // "other side closed" message were previously unclassified (fell through to a
  // non-retryable base ProviderError), so a mid-stream network drop was never retried.
  const code = err?.code;
  if (['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EAI_AGAIN', 'ENOTFOUND', 'ECONNABORTED', 'EPIPE', 'UND_ERR_SOCKET'].includes(code)) return true;
  return /network|fetch failed|socket hang up|unavailable|overloaded|high demand|try again later|terminated|other side closed|"code"\s*:\s*5\d\d/i.test(msgOf(err));
}

/**
 * Classifies a raw/unknown error into the appropriate typed ProviderError, preserving the
 * original message + attaching the cause. If already a ProviderError, it is returned as-is.
 * The chosen subclass's `retryable` matches the resilience layer's existing decision, so this
 * is behavior-preserving.
 */
export function classifyProviderError(err: any, provider?: string): ProviderError {
  if (err instanceof ProviderError) return err;
  const message = msgOf(err);
  const status = statusOf(err);
  const meta: ProviderErrorMeta = { provider, cause: err, status };

  if (isRateLimit(err)) return new ProviderRateLimitError(message, { ...meta, retryAfterMs: extractRetryAfterMs(err) });
  if (isTimeout(err)) return new ProviderTimeoutError(message, meta);
  if (isAuthError(err)) return new ProviderAuthenticationError(message, meta);
  if (isUnavailable(err)) return new ProviderUnavailableError(message, meta);
  // Unclassified: not known-transient → treat as non-retryable base error.
  return new ProviderError(message, false, meta);
}
