/**
 * Voice quota limits.
 *
 * Covers the two gates voiceQuota still owns in-process: one live session per user, and the
 * minimum gap between starts.
 *
 * The daily seconds/sessions budget used to live here behind a faked Firestore layer. It moved to
 * usageService (checkQuota/consumeQuota on 'voiceSeconds'), so those cases were removed rather
 * than left asserting on a row nothing writes any more. Budget enforcement is now untested at this
 * level — it wants a suite built against usageService.
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
