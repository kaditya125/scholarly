/**
 * Small resilience helpers for calls to external services (LLM/embeddings/etc.).
 * Backward compatible: purely additive utilities, used to wrap existing calls.
 */

/** Rejects if `promise` does not settle within `ms` milliseconds. */
export async function withTimeout<T>(promise: Promise<T>, ms: number, label = 'operation'): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

/** Heuristic: is this error worth retrying (transient)? */
function isRetryable(err: any): boolean {
  const status = err?.status ?? err?.response?.status;
  if (status === 429) return true;
  if (typeof status === 'number' && status >= 500 && status < 600) return true;
  const code = err?.code;
  if (typeof code === 'number' && (code === 429 || (code >= 500 && code < 600))) return true;
  if (['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EAI_AGAIN', 'ENOTFOUND'].includes(code)) return true;
  // Provider messages: Google/others often surface transient 5xx as text (e.g. 503 UNAVAILABLE
  // "experiencing high demand", "overloaded", "try again later") rather than a numeric status.
  if (typeof err?.message === 'string' &&
      /timed out|network|fetch failed|socket hang up|unavailable|overloaded|high demand|try again later|"code"\s*:\s*(?:429|5\d\d)/i.test(err.message)) return true;
  return false;
}

/**
 * When a provider returns a rate-limit (429) with a suggested retry delay
 * (e.g. Google `"retryDelay":"44s"` or "retry in 44.2s"), extract it in ms so we
 * can wait the required time instead of a too-short exponential backoff.
 */
function serverRetryDelayMs(err: any): number | null {
  const msg = typeof err?.message === 'string' ? err.message : '';
  const m = msg.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/) || msg.match(/retry in (\d+(?:\.\d+)?)\s*s/i);
  return m ? Math.ceil(parseFloat(m[1]) * 1000) : null;
}

/**
 * Retries `fn` on transient failures with exponential backoff + jitter.
 * Non-transient errors (e.g. 400/401/403) are thrown immediately.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { retries?: number; baseDelayMs?: number; label?: string } = {}
): Promise<T> {
  const retries = opts.retries ?? 2;
  const base = opts.baseDelayMs ?? 500;
  let lastErr: any;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === retries || !isRetryable(err)) break;
      // Honor a server-supplied retry delay (rate limits); otherwise exponential backoff.
      const serverDelay = serverRetryDelayMs(err);
      const delay = serverDelay != null
        ? Math.min(serverDelay + 750, 70000)
        : base * Math.pow(2, attempt) + Math.floor(Math.random() * 100);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}
