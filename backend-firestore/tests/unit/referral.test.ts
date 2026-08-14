/**
 * Phase 3L: referrals — a new signup crediting Pro days to both parties, exactly once.
 *
 * `auth.getUser` is mocked (Firebase Admin Auth, not something to exercise for real). Everything
 * else — the referral record, the entitlement audit trail, and the `users/{uid}.subscription`
 * write — runs for real against the same in-memory Firestore stand-in the other class-scoped
 * suites use.
 */

jest.mock('firebase-admin', () => ({
  firestore: { FieldValue: { serverTimestamp: () => '__ts__' } },
}));

const store: Record<string, Record<string, any>> = {
  referrals: {}, entitlementGrants: {}, rewardRules: {}, users: {},
};

function makeDoc(col: string, id: string) {
  return {
    id,
    get: async () => ({ exists: !!store[col][id], data: () => store[col][id] }),
    set: async (v: any, opts?: { merge?: boolean }) => {
      store[col][id] = opts?.merge ? { ...(store[col][id] || {}), ...v } : v;
    },
  };
}
let autoId = 0;
function makeCollection(col: string, filters: [string, any][] = [], limitN: number | null = null): any {
  return {
    doc: (id?: string) => makeDoc(col, id ?? `auto_${++autoId}`),
    where(field: string, _op: string, value: any) { return makeCollection(col, [...filters, [field, value]], limitN); },
    limit(n: number) { return makeCollection(col, filters, n); },
    get: async () => {
      let docs = Object.values(store[col]).filter((d: any) => filters.every(([f, v]) => d[f] === v));
      if (limitN != null) docs = docs.slice(0, limitN);
      return { empty: docs.length === 0, docs: docs.map((d: any) => ({ data: () => d })) };
    },
  };
}

/** Forwards `{merge:true}` through to `ref.set`, unlike the simpler stand-ins elsewhere — grantProDays relies on real merge semantics to avoid wiping unrelated user fields. */
const tx = {
  get: async (ref: any) => ref.get(),
  set: (ref: any, v: any, opts?: { merge?: boolean }) => { void ref.set(v, opts); },
};

const mockGetUser = jest.fn();
jest.mock('../../src/config/firebase', () => ({
  auth: { getUser: (...args: any[]) => mockGetUser(...args) },
  db: {
    collection: (c: string) => makeCollection(c),
    runTransaction: async (fn: any) => fn(tx),
  },
}));

import { referralService } from '../../src/services/referral.service';

const REFERRER = 'referrer-1';
const REFERRED = 'referred-1';

beforeEach(() => {
  store.referrals = {}; store.entitlementGrants = {}; store.rewardRules = {}; store.users = {};
  autoId = 0;
  mockGetUser.mockReset();
  mockGetUser.mockResolvedValue({ uid: REFERRER });
});

describe('recordReferral', () => {
  it('records the referral and grants Pro days to both parties', async () => {
    const record = await referralService.recordReferral(REFERRER, REFERRED);
    expect(record).not.toBeNull();
    expect(record!.referrerRewardDays).toBeGreaterThan(0);
    expect(record!.referredRewardDays).toBeGreaterThan(0);

    expect(store.users[REFERRER].plan).toBe('pro');
    expect(store.users[REFERRED].plan).toBe('pro');
    expect(store.users[REFERRER].subscription.currentPeriodEnd).toBeGreaterThan(Date.now());
    expect(store.users[REFERRED].subscription.currentPeriodEnd).toBeGreaterThan(Date.now());
  });

  it('writes one entitlement grant per party, tied back to the referral', async () => {
    const record = await referralService.recordReferral(REFERRER, REFERRED);
    const grants = Object.values(store.entitlementGrants) as any[];
    expect(grants).toHaveLength(2);
    expect(grants.every((g) => g.sourceId === record!.id && g.source === 'referral' && g.kind === 'pro_days')).toBe(true);
    expect(grants.map((g) => g.userId).sort()).toEqual([REFERRER, REFERRED].sort());
  });

  it('refuses self-referral', async () => {
    const record = await referralService.recordReferral(REFERRER, REFERRER);
    expect(record).toBeNull();
    expect(Object.keys(store.entitlementGrants)).toHaveLength(0);
  });

  it('refuses a referrer uid that does not exist', async () => {
    mockGetUser.mockRejectedValue(new Error('no such user'));
    const record = await referralService.recordReferral('ghost-uid', REFERRED);
    expect(record).toBeNull();
  });

  it('the single most important test in this phase: a retried bootstrap never double-credits the same new signup', async () => {
    const first = await referralService.recordReferral(REFERRER, REFERRED);
    const second = await referralService.recordReferral(REFERRER, REFERRED);
    expect(second!.id).toBe(first!.id);
    expect(Object.keys(store.entitlementGrants)).toHaveLength(2); // not 4
  });

  it('refuses to credit a SECOND referrer for a signup already credited to a first one', async () => {
    await referralService.recordReferral(REFERRER, REFERRED);
    mockGetUser.mockResolvedValue({ uid: 'referrer-2' });
    const result = await referralService.recordReferral('referrer-2', REFERRED);
    expect(result!.referrerUid).toBe(REFERRER); // the original referral, unchanged
    expect(Object.keys(store.entitlementGrants)).toHaveLength(2); // referrer-2 got nothing
  });

  it('respects the kill switch — an inactive reward rule grants nothing', async () => {
    store.rewardRules.referral_signup = { id: 'referral_signup', active: false, referrerRewardDays: 7, referredRewardDays: 7 };
    const record = await referralService.recordReferral(REFERRER, REFERRED);
    expect(record).toBeNull();
    expect(store.users[REFERRER]).toBeUndefined();
    expect(store.users[REFERRED]).toBeUndefined();
  });

  it('extends an EXISTING Pro period rather than resetting it, and preserves real payment attribution', async () => {
    const future = Date.now() + 10 * 24 * 60 * 60 * 1000;
    store.users[REFERRER] = { plan: 'pro', subscription: { status: 'active', currentPeriodEnd: future, provider: 'razorpay', planName: 'Scholarly Pro', orderId: 'order_real' } };
    await referralService.recordReferral(REFERRER, REFERRED);

    const after = store.users[REFERRER];
    expect(after.subscription.currentPeriodEnd).toBeGreaterThan(future); // extended, not reset
    expect(after.subscription.provider).toBe('razorpay'); // NOT overwritten to 'referral'
    expect(after.subscription.orderId).toBe('order_real'); // untouched
  });
});

describe('getEffectiveRewardRule', () => {
  it('falls back to the documented default when no rule document exists', async () => {
    const rule = await referralService.getEffectiveRewardRule();
    expect(rule.active).toBe(true);
    expect(rule.referrerRewardDays).toBeGreaterThan(0);
  });

  it('uses the stored rule when one exists', async () => {
    store.rewardRules.referral_signup = { id: 'referral_signup', active: true, referrerRewardDays: 30, referredRewardDays: 14 };
    const rule = await referralService.getEffectiveRewardRule();
    expect(rule.referrerRewardDays).toBe(30);
    expect(rule.referredRewardDays).toBe(14);
  });
});

describe('listMyReferrals', () => {
  it('returns only the caller\'s own referrals as referrer', async () => {
    await referralService.recordReferral(REFERRER, REFERRED);
    mockGetUser.mockResolvedValue({ uid: REFERRER });
    await referralService.recordReferral(REFERRER, 'referred-2');
    const mine = await referralService.listMyReferrals(REFERRER);
    expect(mine).toHaveLength(2);
    expect(mine.every((r) => r.referrerUid === REFERRER)).toBe(true);
  });

  it('is empty for someone who has referred nobody', async () => {
    expect(await referralService.listMyReferrals('nobody')).toEqual([]);
  });
});
