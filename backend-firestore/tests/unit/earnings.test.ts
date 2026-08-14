/**
 * Phase 3I: the earnings ledger — append-only, balance derived by summing.
 */

jest.mock('firebase-admin', () => ({
  firestore: { FieldValue: { serverTimestamp: () => '__ts__' } },
}));

const store: Record<string, Record<string, any>> = { teacherEarnings: {}, teacherPayouts: {} };

function makeDoc(col: string, id: string) {
  return {
    id,
    get: async () => ({ exists: !!store[col][id], data: () => store[col][id] }),
    set: async (v: any) => { store[col][id] = v; },
    update: async (v: any) => { store[col][id] = { ...(store[col][id] || {}), ...v }; },
  };
}
let autoId = 0;
/**
 * Builds a query IMMUTABLY: each `.where()` returns a new query carrying its own filter list,
 * rather than mutating one shared array. `earningsRepository` caches its collection reference
 * once at construction (matching every repository in this codebase), so a mutating `.where()`
 * would let a filter from `listForOrder` leak into a later, unrelated `listForTeacher` call —
 * both methods run against the SAME cached collection object for the life of this test file.
 */
function makeCollection(col: string, filters: [string, any][] = []): any {
  return {
    doc: (id?: string) => makeDoc(col, id ?? `auto_${++autoId}`),
    where(field: string, _op: string, value: any) { return makeCollection(col, [...filters, [field, value]]); },
    orderBy() { return makeCollection(col, filters); },
    get: async () => ({
      docs: Object.values(store[col])
        .filter((d: any) => filters.every(([f, v]) => d[f] === v))
        .map((d: any) => ({ data: () => d })),
    }),
  };
}

jest.mock('../../src/config/firebase', () => ({
  db: { collection: (c: string) => makeCollection(c) },
}));

/**
 * getPayoutQueue joins each owed teacher against their profile purely for display (name/email).
 * teacherProfile.service.ts is a mature, independently-tested subsystem (Phase 3A) — mocked at
 * the module boundary rather than exercised for real, same posture as quizGeneratorService in
 * classAssignment.test.ts.
 */
jest.mock('../../src/services/teacherProfile.service', () => ({
  teacherProfileService: { get: jest.fn().mockResolvedValue(null) },
}));

import { earningsService } from '../../src/services/earnings.service';
import { splitClassSale, CLASS_COMMISSION_RATE, CLASS_TAX_RATE } from '../../src/config/monetization';
import { teacherProfileService } from '../../src/services/teacherProfile.service';

const TEACHER = 'teacher-1';
const CLASS = 'class-1';

beforeEach(() => {
  store.teacherEarnings = {}; store.teacherPayouts = {};
  autoId = 0;
  jest.clearAllMocks();
  (teacherProfileService.get as jest.Mock).mockResolvedValue(null);
});

describe('splitClassSale', () => {
  it('deducts commission at the configured rate', () => {
    const { grossPaise, commissionPaise, netPaise } = splitClassSale(100_00);
    expect(grossPaise).toBe(100_00);
    expect(commissionPaise).toBe(Math.round(100_00 * CLASS_COMMISSION_RATE));
    expect(netPaise).toBe(grossPaise - commissionPaise);
  });

  it('leaves tax at zero until the GST/principal-vs-agent decision is made', () => {
    expect(CLASS_TAX_RATE).toBe(0);
    expect(splitClassSale(100_00).taxPaise).toBe(0);
  });

  it('gross always equals commission + tax + net', () => {
    const s = splitClassSale(4999_00);
    expect(s.commissionPaise + s.taxPaise + s.netPaise).toBe(s.grossPaise);
  });
});

describe('accrueForClassSale', () => {
  it('writes a positive sale entry and a negative commission entry', async () => {
    const entries = await earningsService.accrueForClassSale({ teacherUid: TEACHER, classId: CLASS, orderId: 'order_1', grossPaise: 100_00 });
    const sale = entries.find((e) => e.type === 'sale')!;
    const commission = entries.find((e) => e.type === 'commission')!;
    expect(sale.amountPaise).toBe(100_00);
    expect(commission.amountPaise).toBeLessThan(0);
    expect(entries.every((e) => e.state === 'pending')).toBe(true);
  });

  it('is idempotent per orderId — a retried webhook does not double-accrue', async () => {
    await earningsService.accrueForClassSale({ teacherUid: TEACHER, classId: CLASS, orderId: 'order_1', grossPaise: 100_00 });
    const again = await earningsService.accrueForClassSale({ teacherUid: TEACHER, classId: CLASS, orderId: 'order_1', grossPaise: 100_00 });
    const summary = await earningsService.getSummary(TEACHER);
    expect(again).toHaveLength(summary.entries.filter((e) => e.orderId === 'order_1').length);
    expect(summary.entries.filter((e) => e.orderId === 'order_1' && e.type === 'sale')).toHaveLength(1);
  });

  it('omits a zero-amount tax entry rather than writing a no-op row', async () => {
    const entries = await earningsService.accrueForClassSale({ teacherUid: TEACHER, classId: CLASS, orderId: 'order_1', grossPaise: 100_00 });
    expect(entries.some((e) => e.type === 'tax')).toBe(false);
  });
});

describe('getSummary', () => {
  it('derives balance as a plain sum, never a stored field', async () => {
    await earningsService.accrueForClassSale({ teacherUid: TEACHER, classId: CLASS, orderId: 'order_1', grossPaise: 100_00 });
    await earningsService.accrueForClassSale({ teacherUid: TEACHER, classId: CLASS, orderId: 'order_2', grossPaise: 50_00 });
    const summary = await earningsService.getSummary(TEACHER);
    const expected = summary.entries.reduce((sum, e) => sum + e.amountPaise, 0);
    expect(summary.balancePaise).toBe(expected);
    expect(summary.balancePaise).toBeGreaterThan(0);
    expect(summary.balancePaise).toBeLessThan(150_00); // net of commission
  });

  it('never mixes another teacher\'s entries into the balance', async () => {
    await earningsService.accrueForClassSale({ teacherUid: TEACHER, classId: CLASS, orderId: 'order_1', grossPaise: 100_00 });
    await earningsService.accrueForClassSale({ teacherUid: 'teacher-2', classId: CLASS, orderId: 'order_9', grossPaise: 999_00 });
    const summary = await earningsService.getSummary(TEACHER);
    expect(summary.entries.every((e) => e.teacherUid === TEACHER)).toBe(true);
  });

  it('returns a zero balance and empty entries for a teacher with no sales', async () => {
    const summary = await earningsService.getSummary('teacher-nobody');
    expect(summary.balancePaise).toBe(0);
    expect(summary.paidPaise).toBe(0);
    expect(summary.entries).toEqual([]);
  });
});

/* ── Phase 3J-lite: manual payouts ────────────────────────────────────────────────────── */

describe('recordPayout', () => {
  it('pays out the full owed balance and moves it from balance to paid', async () => {
    await earningsService.accrueForClassSale({ teacherUid: TEACHER, classId: CLASS, orderId: 'order_1', grossPaise: 100_00 });
    const before = await earningsService.getSummary(TEACHER);
    expect(before.balancePaise).toBeGreaterThan(0);

    const payout = await earningsService.recordPayout(TEACHER, 'admin-1', { method: 'upi', reference: 'UPI123' });
    expect(payout.netPaise).toBe(before.balancePaise);
    expect(payout.paidBy).toBe('admin-1');

    const after = await earningsService.getSummary(TEACHER);
    expect(after.balancePaise).toBe(0);
    expect(after.paidPaise).toBe(before.balancePaise);
  });

  it('refuses a payout when nothing is owed', async () => {
    await expect(earningsService.recordPayout(TEACHER, 'admin-1', { method: 'upi' })).rejects.toMatchObject({ code: 'NOTHING_OWED' });
  });

  it('refuses a payout without a method', async () => {
    await earningsService.accrueForClassSale({ teacherUid: TEACHER, classId: CLASS, orderId: 'order_1', grossPaise: 100_00 });
    await expect(earningsService.recordPayout(TEACHER, 'admin-1', {})).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('a second payout only covers what accrued since the first', async () => {
    await earningsService.accrueForClassSale({ teacherUid: TEACHER, classId: CLASS, orderId: 'order_1', grossPaise: 100_00 });
    const first = await earningsService.recordPayout(TEACHER, 'admin-1', { method: 'bank_transfer' });

    await earningsService.accrueForClassSale({ teacherUid: TEACHER, classId: CLASS, orderId: 'order_2', grossPaise: 50_00 });
    const second = await earningsService.recordPayout(TEACHER, 'admin-1', { method: 'bank_transfer' });

    expect(second.entryIds).not.toEqual(expect.arrayContaining(first.entryIds));
    const summary = await earningsService.getSummary(TEACHER);
    expect(summary.balancePaise).toBe(0);
    expect(summary.paidPaise).toBe(first.netPaise + second.netPaise);
  });

  it('does not touch another teacher\'s balance', async () => {
    await earningsService.accrueForClassSale({ teacherUid: TEACHER, classId: CLASS, orderId: 'order_1', grossPaise: 100_00 });
    await earningsService.accrueForClassSale({ teacherUid: 'teacher-2', classId: CLASS, orderId: 'order_9', grossPaise: 999_00 });
    await earningsService.recordPayout(TEACHER, 'admin-1', { method: 'cash' });

    const other = await earningsService.getSummary('teacher-2');
    expect(other.balancePaise).toBeGreaterThan(0);
    expect(other.paidPaise).toBe(0);
  });
});

describe('listPayouts', () => {
  it('returns a teacher\'s own payout history, newest first', async () => {
    await earningsService.accrueForClassSale({ teacherUid: TEACHER, classId: CLASS, orderId: 'order_1', grossPaise: 100_00 });
    await earningsService.recordPayout(TEACHER, 'admin-1', { method: 'upi' });
    const payouts = await earningsService.listPayouts(TEACHER);
    expect(payouts).toHaveLength(1);
    expect(payouts[0].teacherUid).toBe(TEACHER);
  });

  it('is empty for a teacher never paid out', async () => {
    expect(await earningsService.listPayouts('teacher-nobody')).toEqual([]);
  });
});

describe('getPayoutQueue', () => {
  it('lists only teachers with a positive outstanding balance', async () => {
    await earningsService.accrueForClassSale({ teacherUid: TEACHER, classId: CLASS, orderId: 'order_1', grossPaise: 100_00 });
    await earningsService.accrueForClassSale({ teacherUid: 'teacher-2', classId: CLASS, orderId: 'order_2', grossPaise: 200_00 });
    const queue = await earningsService.getPayoutQueue();
    expect(queue.map((r) => r.teacherUid).sort()).toEqual([TEACHER, 'teacher-2'].sort());
  });

  it('drops a teacher from the queue once fully paid out', async () => {
    await earningsService.accrueForClassSale({ teacherUid: TEACHER, classId: CLASS, orderId: 'order_1', grossPaise: 100_00 });
    await earningsService.recordPayout(TEACHER, 'admin-1', { method: 'upi' });
    const queue = await earningsService.getPayoutQueue();
    expect(queue.find((r) => r.teacherUid === TEACHER)).toBeUndefined();
  });

  it('sorts by balance, highest first', async () => {
    await earningsService.accrueForClassSale({ teacherUid: 'teacher-small', classId: CLASS, orderId: 'order_1', grossPaise: 50_00 });
    await earningsService.accrueForClassSale({ teacherUid: 'teacher-big', classId: CLASS, orderId: 'order_2', grossPaise: 500_00 });
    const queue = await earningsService.getPayoutQueue();
    expect(queue[0].teacherUid).toBe('teacher-big');
  });

  it('enriches each row with the teacher\'s profile name/email', async () => {
    (teacherProfileService.get as jest.Mock).mockResolvedValue({ displayName: 'Asha Rao', email: 'asha@example.com' });
    await earningsService.accrueForClassSale({ teacherUid: TEACHER, classId: CLASS, orderId: 'order_1', grossPaise: 100_00 });
    const queue = await earningsService.getPayoutQueue();
    expect(queue[0]).toMatchObject({ displayName: 'Asha Rao', email: 'asha@example.com' });
  });
});
