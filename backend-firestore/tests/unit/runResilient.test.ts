jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), log: jest.fn() },
}));

import { runResilient, isFallbackDisabled } from '../../src/services/ai/googleGenAIClient';
import { ProviderRateLimitError, ProviderUnavailableError, ProviderError } from '../../src/core/errors/providerErrors';

// Fake client pair — the `op` distinguishes primary vs fallback by identity.
const PRIMARY = { id: 'primary' } as any;
const FALLBACK = { id: 'fallback' } as any;
const clients = (fallback: any = FALLBACK) => ({ primary: PRIMARY, fallback, primaryLabel: 'vertex' }) as any;

describe('runResilient — provider fallback behavior', () => {
  it('returns the primary result when the primary succeeds (no fallback used)', async () => {
    const op = jest.fn(async (ai: any) => (ai === PRIMARY ? 'primary-ok' : 'fallback-ok'));
    const out = await runResilient(clients(), op, { label: 'test.op', retries: 0 });
    expect(out).toBe('primary-ok');
    expect(op).toHaveBeenCalledTimes(1);
  });

  it('fails over to the Developer API when the primary is rate-limited', async () => {
    const op = jest.fn(async (ai: any) => {
      if (ai === PRIMARY) throw { status: 429, message: 'Error 429 rate limit' };
      return 'fallback-ok';
    });
    const out = await runResilient(clients(), op, { label: 'test.op', retries: 0 });
    expect(out).toBe('fallback-ok');
    expect(op).toHaveBeenCalledTimes(2); // primary (rate-limited) + fallback (ok)
  });

  it('does NOT fail over for a non-rate-limit error, and rethrows a typed ProviderError', async () => {
    const op = jest.fn(async (ai: any) => {
      if (ai === PRIMARY) throw { message: '503 service unavailable overloaded' };
      return 'fallback-ok';
    });
    await expect(runResilient(clients(), op, { label: 'test.op', retries: 0 }))
      .rejects.toBeInstanceOf(ProviderUnavailableError);
    expect(op).toHaveBeenCalledTimes(1); // fallback NOT tried
  });

  it('rethrows a typed error when rate-limited but no fallback is configured', async () => {
    const op = jest.fn(async () => { throw { status: 429, message: 'rate limit' }; });
    await expect(runResilient(clients(null), op, { label: 'test.op', retries: 0 }))
      .rejects.toBeInstanceOf(ProviderRateLimitError);
    expect(op).toHaveBeenCalledTimes(1);
  });

  // MUST run last: trips the process-wide daily-quota circuit breaker (module state).
  it('trips the circuit breaker when the fallback reports DAILY quota exhaustion', async () => {
    expect(isFallbackDisabled()).toBe(false);
    const op = jest.fn(async (ai: any) => {
      if (ai === PRIMARY) throw { status: 429, message: 'rate limit' };
      // Fallback hits the free-tier per-day quota wall.
      throw { message: 'RESOURCE_EXHAUSTED ... EmbedContentRequestsPerDayPerUserPerProjectPerModel-FreeTier, limit: 1000' };
    });
    await expect(runResilient(clients(), op, { label: 'embed', retries: 0 })).rejects.toBeInstanceOf(ProviderError);
    expect(isFallbackDisabled()).toBe(true);

    // With the breaker open, a subsequent rate-limited call does NOT try the fallback.
    const op2 = jest.fn(async (ai: any) => {
      if (ai === PRIMARY) throw { status: 429, message: 'rate limit' };
      return 'fallback-ok';
    });
    await expect(runResilient(clients(), op2, { label: 'embed', retries: 0 })).rejects.toBeInstanceOf(ProviderRateLimitError);
    expect(op2).toHaveBeenCalledTimes(1); // fallback skipped (breaker open)
  });
});
