import {
  ProviderError, ProviderTimeoutError, ProviderUnavailableError, ProviderAuthenticationError,
  ProviderRateLimitError, EmbeddingError, RetrievalError, VerificationError,
  classifyProviderError, extractRetryAfterMs, isRateLimit, isTimeout, isAuthError, isUnavailable,
} from '../../src/core/errors/providerErrors';

describe('typed provider errors', () => {
  it('all subclasses are instances of Error and ProviderError with correct retryable flags', () => {
    const cases: Array<[ProviderError, boolean]> = [
      [new ProviderTimeoutError('t'), true],
      [new ProviderUnavailableError('u'), true],
      [new ProviderRateLimitError('r'), true],
      [new ProviderAuthenticationError('a'), false],
      [new RetrievalError('re'), false],
      [new EmbeddingError('e'), false],
      [new VerificationError('v'), false],
    ];
    for (const [err, retryable] of cases) {
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(ProviderError);
      expect(err.retryable).toBe(retryable);
      expect(err.name).toBe(err.constructor.name);
    }
  });

  it('preserves the original message and cause', () => {
    const cause = new Error('root cause');
    const err = new EmbeddingError('embed failed', { cause, provider: 'gemini-embedding' });
    expect(err.message).toBe('embed failed');
    expect(err.cause).toBe(cause);
    expect(err.provider).toBe('gemini-embedding');
  });

  describe('classifyProviderError (behavior-preserving classification)', () => {
    it('classifies 429 / RESOURCE_EXHAUSTED as ProviderRateLimitError (retryable)', () => {
      expect(classifyProviderError({ message: 'Error 429 rate limit' })).toBeInstanceOf(ProviderRateLimitError);
      expect(classifyProviderError({ status: 429, message: 'x' })).toBeInstanceOf(ProviderRateLimitError);
      expect(classifyProviderError({ message: 'RESOURCE_EXHAUSTED quota' }).retryable).toBe(true);
    });

    it('classifies timeouts as ProviderTimeoutError (retryable)', () => {
      expect(classifyProviderError({ message: 'operation timed out after 60000ms' })).toBeInstanceOf(ProviderTimeoutError);
    });

    it('classifies 401/403 as ProviderAuthenticationError (NOT retryable)', () => {
      const e = classifyProviderError({ status: 403, message: 'permission denied' });
      expect(e).toBeInstanceOf(ProviderAuthenticationError);
      expect(e.retryable).toBe(false);
    });

    it('classifies 5xx/network as ProviderUnavailableError (retryable)', () => {
      expect(classifyProviderError({ message: '503 UNAVAILABLE overloaded' })).toBeInstanceOf(ProviderUnavailableError);
      expect(classifyProviderError({ code: 'ECONNRESET', message: 'socket hang up' })).toBeInstanceOf(ProviderUnavailableError);
    });

    it('returns unknown errors as a non-retryable base ProviderError', () => {
      const e = classifyProviderError({ message: 'totally weird' });
      expect(e).toBeInstanceOf(ProviderError);
      expect(e.retryable).toBe(false);
    });

    it('is idempotent — an already-typed error is returned unchanged', () => {
      const original = new ProviderRateLimitError('r');
      expect(classifyProviderError(original)).toBe(original);
    });

    it('preserves the message when classifying (message-based downstream checks keep working)', () => {
      const msg = 'You exceeded your quota; "retryDelay":"24s"';
      const e = classifyProviderError({ message: msg });
      expect(e.message).toBe(msg);
    });
  });

  it('extractRetryAfterMs parses google retryDelay + "retry in Ns" forms', () => {
    expect(extractRetryAfterMs({ message: '"retryDelay":"24s"' })).toBe(24000);
    expect(extractRetryAfterMs({ message: 'Please retry in 18.5s' })).toBe(18500);
    expect(extractRetryAfterMs({ message: 'no delay here' })).toBeUndefined();
  });

  it('predicate helpers match the resilience heuristics', () => {
    expect(isRateLimit({ message: 'quota exceeded' })).toBe(true);
    expect(isRateLimit(new ProviderRateLimitError('x'))).toBe(true);
    expect(isTimeout({ message: 'deadline exceeded' })).toBe(true);
    expect(isAuthError({ status: 401, message: 'unauthorized' })).toBe(true);
    expect(isUnavailable({ code: 'ETIMEDOUT', message: 'x' })).toBe(true);
  });

  // Regression coverage for the exact mid-stream network errors observed in live load testing
  // (docs/LATENCY_INVESTIGATION_REPORT.md §3.4) — ECONNABORTED and "terminated" previously fell
  // through every classification branch and came back as a non-retryable base ProviderError,
  // so the retry fix in GeminiProvider/GrokVertexProvider never actually retried them.
  it('classifies real-world mid-stream network drops as retryable (ProviderUnavailableError)', () => {
    const cases = [
      { code: 'ECONNABORTED', message: 'connect ECONNABORTED 142.250.182.42:443' },
      { code: 'ETIMEDOUT', message: 'connect ETIMEDOUT 142.250.182.42:443' },
      { message: 'terminated' },
      { message: 'fetch failed' },
    ];
    for (const c of cases) {
      const e = classifyProviderError(c);
      expect(e).toBeInstanceOf(ProviderUnavailableError);
      expect(e.retryable).toBe(true);
    }
  });

  // "Incomplete JSON segment" (also observed in the same trial) is intentionally NOT added to
  // the network-drop heuristics above: it can also indicate a genuine malformed-response/parser
  // bug rather than a network drop, so blindly retrying it is not obviously safe. Documented
  // here rather than silently ignored — left unclassified (non-retryable) until there's enough
  // evidence it's always network-caused.
  it('does not (yet) classify "Incomplete JSON segment" as a network error — deliberate, not an oversight', () => {
    const e = classifyProviderError({ message: 'Incomplete JSON segment at the end' });
    expect(e.retryable).toBe(false);
  });
});
