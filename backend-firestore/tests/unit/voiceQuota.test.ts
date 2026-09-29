/**
 * Voice quota limits.
 *
 * These assert on REFUSALS and on what gets written to usage, because both are what stand between
 * VOICE_ACCESS_MODE=all and an unmetered bill. The allowance is monthly and plan-based, metered by
 * usageService (Free 900 s, Pro 18,000 s); that service is faked with an in-memory ledger so the
 * limit and accrual paths are exercised rather than stubbed away.
 */

const FREE_LIMIT = 900;
const mockUsed = new Map<string, number>();
/** Set to make the next usage lookup/write throw, for the degraded-metering case. */
let mockFailNext = false;

jest.mock('../../src/config/firebase', () => ({ db: {} }));
jest.mock('../../src/services/entitlement.service', () => ({ entitlementService: {} }));
jest.mock('../../src/services/usage.service', () => ({
  usageService: {
    checkQuota: jest.fn(async (userId: string, _feature: string, requested = 1) => {
      if (mockFailNext) throw new Error('firestore unavailable');
      const used = mockUsed.get(userId) ?? 0;
      return { allowed: used + requested <= 900, remaining: Math.max(0, 900 - used), limit: 900, used, plan: 'free' };
    }),
    consumeQuota: jest.fn(async (userId: string, _feature: string, amount: number) => {
      if (mockFailNext) throw new Error('firestore unavailable');
      mockUsed.set(userId, (mockUsed.get(userId) ?? 0) + amount);
    }),
  },
}));

import {
  beginSession, accrue, endSession, hasActiveSession,
  voiceQuotaLimits, __resetVoiceQuotaState,
} from '../../src/services/voice/voiceQuota';

const USER = 'student-1';
const limits = voiceQuotaLimits();

beforeEach(() => {
  mockUsed.clear();
  mockFailNext = false;
  __resetVoiceQuotaState();
});

describe('monthly allowance', () => {
  it('allows a user with no usage this month', async () => {
    const d = await beginSession(USER);
    expect(d.ok).toBe(true);
    expect(d.remaining).toBe(FREE_LIMIT);
  });

  it('refuses once the allowance is spent', async () => {
    mockUsed.set(USER, FREE_LIMIT);
    const d = await beginSession(USER);
    expect(d.ok).toBe(false);
    expect(d.code).toBe('VOICE_MONTHLY_LIMIT');
    expect(d.remaining).toBe(0);
    expect(hasActiveSession(USER)).toBe(false); // a refused session holds no slot
  });

  it('refuses when fewer seconds remain than a session needs to start', async () => {
    mockUsed.set(USER, FREE_LIMIT - 5);
    expect((await beginSession(USER)).code).toBe('VOICE_MONTHLY_LIMIT');
  });

  it('checks the allowance before the start-rate throttle', async () => {
    // An out-of-allowance user must hear "limit reached", not "too fast", on a quick re-click.
    await beginSession(USER);
    endSession(USER);
    mockUsed.set(USER, FREE_LIMIT);
    expect((await beginSession(USER)).code).toBe('VOICE_MONTHLY_LIMIT');
  });
});

describe('one session at a time', () => {
  it('refuses a second concurrent session', async () => {
    expect((await beginSession(USER)).ok).toBe(true);
    const second = await beginSession(USER);
    expect(second.ok).toBe(false);
    expect(second.code).toBe('VOICE_SESSION_ALREADY_ACTIVE');
  });

  it('does not block a different user', async () => {
    await beginSession(USER);
    expect((await beginSession('student-2')).ok).toBe(true);
  });

  it('frees the slot on endSession', async () => {
    await beginSession(USER);
    expect(hasActiveSession(USER)).toBe(true);
    endSession(USER);
    expect(hasActiveSession(USER)).toBe(false);
  });
});

describe('start rate', () => {
  it('refuses a reconnect loop', async () => {
    await beginSession(USER);
    endSession(USER);                     // as if the socket dropped instantly
    const again = await beginSession(USER);
    expect(again.ok).toBe(false);
    expect(again.code).toBe('VOICE_STARTING_TOO_FAST');
  });

  it('allows a retry once the gap has passed', async () => {
    await beginSession(USER);
    endSession(USER);
    const spy = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + limits.minStartGapMs + 1);
    try {
      expect((await beginSession(USER)).ok).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('accrual', () => {
  it('adds whole seconds to the monthly total', async () => {
    await accrue(USER, 30);
    await accrue(USER, 44.6);
    expect(mockUsed.get(USER)).toBe(75);
  });

  it('ignores non-positive and anonymous accruals', async () => {
    await accrue(USER, 0);
    await accrue('', 60);
    expect(mockUsed.has(USER)).toBe(false);
  });

  it('accumulated usage eventually closes the allowance', async () => {
    await accrue(USER, FREE_LIMIT);
    const d = await beginSession(USER);
    expect(d.ok).toBe(false);
    expect(d.code).toBe('VOICE_MONTHLY_LIMIT');
  });
});

describe('when metering is down', () => {
  it('allows the session but still holds the concurrency slot', async () => {
    mockFailNext = true;
    const first = await beginSession(USER);
    expect(first.ok).toBe(true);              // metering outage must not become a product outage
    expect(hasActiveSession(USER)).toBe(true);

    const second = await beginSession(USER);  // the in-process limit is unaffected
    expect(second.ok).toBe(false);
    expect(second.code).toBe('VOICE_SESSION_ALREADY_ACTIVE');
  });

  it('does not throw out of accrue', async () => {
    mockFailNext = true;
    await expect(accrue(USER, 60)).resolves.toBeUndefined();
  });
});
