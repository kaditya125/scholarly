/**
 * Covers the D-3 gap: a profile must not enter the review queue merely by being created, only
 * by being submitted (`markComplete: true`) — and TEACHER_AUTO_APPROVE must still work as the
 * documented testing shortcut once it does.
 */

jest.mock('firebase-admin', () => ({
  firestore: { FieldValue: { serverTimestamp: () => '__ts__' } },
}));

const store: { profiles: Record<string, any>; events: Record<string, any>[] } = { profiles: {}, events: {} as any };

function reset() {
  store.profiles = {};
  (store as any).events = [];
}

const profileDoc = (uid: string) => ({
  get: async () => ({ exists: !!store.profiles[uid], data: () => store.profiles[uid] }),
  set: async (v: any, opts?: { merge?: boolean }) => {
    store.profiles[uid] = opts?.merge ? { ...(store.profiles[uid] || {}), ...v } : v;
  },
  update: async (v: any) => { store.profiles[uid] = { ...(store.profiles[uid] || {}), ...v }; },
});

const eventsCollection = {
  doc: () => ({ id: `e${(store as any).events.length}` }),
};

// submitForReview() only ever tx.set()s an events-collection ref, so the mock does not need to
// branch on which ref it received — unlike the batch mock below, which handles both.
const tx = {
  get: async (ref: any) => ref.get(),
  update: (ref: any, v: any) => { void ref.update(v); },
  set: (_ref: any, v: any) => { (store as any).events.push(v); },
};

const batchOps: (() => void)[] = [];

jest.mock('../../src/config/firebase', () => ({
  auth: { getUser: jest.fn(async () => ({ displayName: 'Test Teacher', email: 't@example.com', photoURL: null })) },
  db: {
    collection: (name: string) => {
      if (name === 'teacherVerificationEvents') return eventsCollection;
      return { doc: (uid: string) => profileDoc(uid) };
    },
    batch: () => {
      batchOps.length = 0;
      return {
        set: (ref: any, v: any) => {
          if (ref && typeof ref.id === 'string' && ref.id.startsWith('e')) batchOps.push(() => (store as any).events.push(v));
          else batchOps.push(() => { void ref.set(v); });
        },
        commit: async () => { for (const op of batchOps) op(); },
      };
    },
    runTransaction: async (fn: any) => fn(tx),
  },
}));

import { teacherProfileService } from '../../src/services/teacherProfile.service';
import { env } from '../../src/config/env';

const UID = 'teacher-1';

beforeEach(() => {
  reset();
  (env as any).TEACHER_AUTO_APPROVE = undefined;
});

describe('creating a profile', () => {
  it('always starts as draft, even with TEACHER_AUTO_APPROVE set', async () => {
    (env as any).TEACHER_AUTO_APPROVE = 'true';
    const { profile, created } = await teacherProfileService.upsert(UID, { subjects: ['Physics'] });
    expect(created).toBe(true);
    expect(profile.teacherStatus).toBe('draft');
  });

  it('writes exactly one audit event on creation', async () => {
    await teacherProfileService.upsert(UID, { subjects: ['Physics'] });
    expect((store as any).events).toHaveLength(1);
    expect((store as any).events[0]).toMatchObject({ previousState: null, newState: 'draft', actorRole: 'system' });
  });
});

describe('an incomplete profile', () => {
  it('does not enter the review queue on an ordinary autosave', async () => {
    const { profile } = await teacherProfileService.upsert(UID, { subjects: ['Physics'] });
    expect(profile.teacherStatus).toBe('draft');
    const again = await teacherProfileService.upsert(UID, { boards: ['CBSE'] });
    expect(again.profile.teacherStatus).toBe('draft');
    expect((store as any).events).toHaveLength(1); // creation only — no submission event
  });
});

describe('marking onboarding complete', () => {
  it('submits to pending when auto-approve is off', async () => {
    const { profile } = await teacherProfileService.upsert(UID, { subjects: ['Physics'], markComplete: true });
    expect(profile.teacherStatus).toBe('pending');
    const events = (store as any).events;
    expect(events[events.length - 1]).toMatchObject({ previousState: 'draft', newState: 'pending', reason: expect.stringContaining('Submitted') });
  });

  it('submits straight to approved when TEACHER_AUTO_APPROVE=true', async () => {
    (env as any).TEACHER_AUTO_APPROVE = 'true';
    const { profile } = await teacherProfileService.upsert(UID, { subjects: ['Physics'], markComplete: true });
    expect(profile.teacherStatus).toBe('approved');
    const events = (store as any).events;
    expect(events[events.length - 1]).toMatchObject({ newState: 'approved', actorRole: 'system', reason: expect.stringContaining('Auto-approved') });
  });

  it('submits in the same call that creates the profile', async () => {
    const { profile, created } = await teacherProfileService.upsert(UID, { subjects: ['Physics'], markComplete: true });
    expect(created).toBe(true);
    expect(profile.teacherStatus).toBe('pending');
    expect((store as any).events).toHaveLength(2); // creation, then submission
  });

  it('does not re-submit a profile that was already reviewed', async () => {
    await teacherProfileService.upsert(UID, { subjects: ['Physics'], markComplete: true }); // -> pending
    store.profiles[UID].teacherStatus = 'approved'; // simulate an admin having approved it

    const before = (store as any).events.length;
    const { profile } = await teacherProfileService.upsert(UID, { bio: 'Updated bio', markComplete: true });

    expect(profile.teacherStatus).toBe('approved'); // untouched
    expect((store as any).events).toHaveLength(before); // no new event
  });

  it('does not re-open a rejected profile via a normal save', async () => {
    await teacherProfileService.upsert(UID, { subjects: ['Physics'], markComplete: true });
    store.profiles[UID].teacherStatus = 'rejected';

    const before = (store as any).events.length;
    await teacherProfileService.upsert(UID, { bio: 'Trying again', markComplete: true });

    expect(store.profiles[UID].teacherStatus).toBe('rejected');
    expect((store as any).events).toHaveLength(before);
  });
});

describe('get()', () => {
  it('normalises whatever status is stored', async () => {
    await teacherProfileService.upsert(UID, {});
    store.profiles[UID].teacherStatus = 'active'; // legacy value
    const profile = await teacherProfileService.get(UID);
    expect(profile?.teacherStatus).toBe('approved');
  });
});
