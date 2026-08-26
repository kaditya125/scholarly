/**
 * Voice quota limits.
 *
 * These assert on REFUSALS and on what gets written to usage, because both are what stand between
 * VOICE_ACCESS_MODE=all and an unmetered bill. The Firestore layer is faked with an in-memory
 * store so the day-rollover and transaction paths are exercised rather than stubbed away.
 */

interface Row { day: string; seconds: number; sessions: number; updatedAt: number }

const store = new Map<string, Row>();
/** Set to make the next read/write throw, for the degraded-Firestore case. */
let failNext = false;

const mockDoc = (id: string) => ({
  get: async () => {
    if (failNext) throw new Error('firestore unavailable');
    return { data: () => store.get(id) };
  },
  set: async (data: Row, _opts?: unknown) => {
    if (failNext) throw new Error('firestore unavailable');
    store.set(id, { ...store.get(id), ...data } as Row);
  },
});

const mockDb = {
  collection: (_name: string) => ({ doc: (id: string) => mockDoc(id) }),
  // Mirrors the real transaction contract closely enough for the accrue path: read-then-write.
  runTransaction: async (fn: (tx: any) => Promise<void>) => {
    const tx = {
      get: async (ref: any) => ref.get(),
      set: (ref: any, data: Row) => { void ref.set(data); },
    };
    return fn(tx);
  },
};

jest.mock('../../src/config/firebase', () => ({ db: mockDb }));

import {
  beginSession, accrue, endSession, hasActiveSession,
  voiceQuotaLimits, __resetVoiceQuotaState,
} from '../../src/services/voice/voiceQuota';

const USER = 'student-1';
const today = () => new Date().toISOString().slice(0, 10);
const limits = voiceQuotaLimits();

beforeEach(() => {
  store.clear();
  failNext = false;
  __resetVoiceQuotaState();
});

describe('daily budget', () => {
  it('allows a user with no history', async () => {
    const d = await beginSession(USER);
    expect(d.ok).toBe(true);
    expect(d.remaining).toBe(limits.dailySeconds);
  });

  it('refuses once the seconds budget is spent', async () => {
    store.set(USER, { day: today(), seconds: limits.dailySeconds, sessions: 1, updatedAt: Date.now() });
    const d = await beginSession(USER);
    expect(d.ok).toBe(false);
    expect(d.code).toBe('VOICE_DAILY_LIMIT');
    expect(d.remaining).toBe(0);
  });

  it('refuses once the session count is spent, even with seconds left', async () => {
    // The case the seconds budget alone would miss: many short connections, little talk time.
    store.set(USER, { day: today(), seconds: 5, sessions: limits.dailySessions, updatedAt: Date.now() });
    const d = await beginSession(USER);
    expect(d.ok).toBe(false);
    expect(d.code).toBe('VOICE_DAILY_LIMIT');
  });

  it("ignores yesterday's usage", async () => {
    store.set(USER, { day: '2020-01-01', seconds: 99_999, sessions: 999, updatedAt: 0 });
    const d = await beginSession(USER);
    expect(d.ok).toBe(true);
    expect(d.remaining).toBe(limits.dailySeconds);
  });

  it('counts the session at start, so an abandoned session still costs one', async () => {
    await beginSession(USER);
    expect(store.get(USER)!.sessions).toBe(1);
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
  it('adds seconds to today', async () => {
    await accrue(USER, 30);
    await accrue(USER, 45);
    expect(store.get(USER)!.seconds).toBe(75);
  });

  it('starts a fresh total when the day has rolled over', async () => {
    store.set(USER, { day: '2020-01-01', seconds: 500, sessions: 9, updatedAt: 0 });
    await accrue(USER, 10);
    const row = store.get(USER)!;
    expect(row.seconds).toBe(10);
    expect(row.day).toBe(today());
  });

  it('ignores non-positive and anonymous accruals', async () => {
    await accrue(USER, 0);
    await accrue('', 60);
    expect(store.has(USER)).toBe(false);
  });

  it('accumulated usage eventually closes the budget', async () => {
    await accrue(USER, limits.dailySeconds);
    const d = await beginSession(USER);
    expect(d.ok).toBe(false);
    expect(d.code).toBe('VOICE_DAILY_LIMIT');
  });
});

describe('when Firestore is down', () => {
  it('allows the session but still holds the concurrency slot', async () => {
    failNext = true;
    const first = await beginSession(USER);
    expect(first.ok).toBe(true);              // metering outage must not become a product outage
    expect(hasActiveSession(USER)).toBe(true);

    const second = await beginSession(USER);  // the in-process limit is unaffected
    expect(second.ok).toBe(false);
    expect(second.code).toBe('VOICE_SESSION_ALREADY_ACTIVE');
  });

  it('does not throw out of accrue', async () => {
    failNext = true;
    await expect(accrue(USER, 60)).resolves.toBeUndefined();
  });
});
