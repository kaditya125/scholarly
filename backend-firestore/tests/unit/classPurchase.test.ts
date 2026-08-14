/**
 * Phase 3I: paid classes — order creation and the payment→enrolment→ledger transaction.
 *
 * Razorpay is mocked at the module boundary (it's a network dependency, not something to
 * exercise for real). `enrollmentService` and `earningsService` run for REAL against the same
 * in-memory Firestore stand-in `enrollmentConsent.test.ts` uses, so what's actually under test
 * is the orchestration this phase adds: does a paid order really end in an ACTIVE edge AND a
 * ledger entry, exactly once, no matter how many times the webhook fires.
 */

jest.mock('firebase-admin', () => ({
  firestore: { FieldValue: { serverTimestamp: () => '__ts__' } },
}));

const store: Record<string, Record<string, any>> = {
  payments: {}, classes: {}, classEnrollments: {}, teacherEarnings: {}, users: {},
};

function makeDoc(col: string, id: string) {
  return {
    id,
    get: async () => ({ exists: !!store[col][id], data: () => store[col][id] }),
    set: async (v: any, opts?: { merge?: boolean }) => {
      store[col][id] = opts?.merge ? { ...(store[col][id] || {}), ...v } : v;
    },
    update: async (v: any) => { store[col][id] = { ...(store[col][id] || {}), ...v }; },
  };
}
let autoId = 0;
/**
 * Builds a query IMMUTABLY — see earnings.test.ts's identical helper for why: several
 * repositories here (earningsRepository, classRepository) cache their collection reference once
 * at construction, so a mutating `.where()` would leak filters from one query into an unrelated
 * later one against the same cached collection.
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

/** Matches enrollmentConsent.test.ts's tx stand-in exactly — activateFromPurchase uses the same shape. */
const tx = {
  get: async (ref: any) => ref.get(),
  set: (ref: any, v: any) => { void ref.set(v); },
  update: (ref: any, v: any) => {
    const flat: any = {};
    for (const [k, val] of Object.entries(v)) {
      if (k === 'counts.enrolled') flat.counts = { enrolled: val };
      else flat[k] = val;
    }
    void ref.update(flat);
  },
};

jest.mock('../../src/config/firebase', () => ({
  db: {
    collection: (c: string) => makeCollection(c),
    runTransaction: async (fn: any) => fn(tx),
  },
}));

jest.mock('../../src/services/classResource.service', () => ({
  classResourceService: { syncAccessForEnrollment: jest.fn().mockResolvedValue(undefined) },
}));

let mockOrderCreate: jest.Mock;
jest.mock('razorpay', () => jest.fn().mockImplementation(() => ({
  orders: { create: (...args: any[]) => mockOrderCreate(...args) },
})));

jest.mock('../../src/config/env', () => ({
  env: { RAZORPAY_KEY_ID: 'key_test', RAZORPAY_KEY_SECRET: 'secret_test', RAZORPAY_WEBHOOK_SECRET: 'whsecret_test' },
}));

import { paymentsService } from '../../src/services/payments.service';

const TEACHER = 'teacher-1';
const STUDENT = 'student-1';
const CLASS = 'class-1';

function seedClass(over: Record<string, any> = {}) {
  store.classes[CLASS] = {
    id: CLASS, ownerUid: TEACHER, title: 'Physics 101', status: 'published',
    pricing: { type: 'paid', amountINR: 999, currency: 'INR' },
    capacity: null, counts: { enrolled: 0 }, ...over,
  };
}

beforeEach(() => {
  store.payments = {}; store.classes = {}; store.classEnrollments = {}; store.teacherEarnings = {}; store.users = {};
  autoId = 0;
  mockOrderCreate = jest.fn().mockImplementation(async ({ amount }: any) => ({ id: `order_${++autoId}`, amount }));
});

describe('createClassOrder', () => {
  it('computes the amount server-side from the class pricing record, never from input', async () => {
    seedClass();
    const order = await paymentsService.createClassOrder(STUDENT, CLASS);
    expect(order.amount).toBe(999_00);
    expect(mockOrderCreate).toHaveBeenCalledWith(expect.objectContaining({ amount: 999_00, currency: 'INR' }));
  });

  it('refuses a free class', async () => {
    seedClass({ pricing: { type: 'free', amountINR: 0, currency: 'INR' } });
    await expect(paymentsService.createClassOrder(STUDENT, CLASS)).rejects.toMatchObject({ code: 'NOT_PURCHASABLE' });
  });

  it('refuses the teacher buying their own class', async () => {
    seedClass();
    await expect(paymentsService.createClassOrder(TEACHER, CLASS)).rejects.toMatchObject({ code: 'SELF_ENROL' });
  });

  it('refuses a full class before checkout ever opens', async () => {
    seedClass({ capacity: 1, counts: { enrolled: 1 } });
    await expect(paymentsService.createClassOrder(STUDENT, CLASS)).rejects.toMatchObject({ code: 'CLASS_FULL' });
  });

  it('refuses a class that is still a draft', async () => {
    seedClass({ status: 'draft' });
    await expect(paymentsService.createClassOrder(STUDENT, CLASS)).rejects.toMatchObject({ code: 'CLASS_NOT_OPEN' });
  });
});

describe('applyOrderPayment — class purchase', () => {
  it('activates enrolment and accrues the teacher\'s earnings on first application', async () => {
    seedClass();
    const order = await paymentsService.createClassOrder(STUDENT, CLASS);
    const result = await paymentsService.applyOrderPayment(order.orderId, 'pay_1', 'webhook');

    expect(result.applied).toBe(true);
    expect(result.orderType).toBe('class_purchase');

    const edge = store.classEnrollments[`${CLASS}_${STUDENT}`];
    expect(edge.state).toBe('ACTIVE');
    expect(edge.source).toBe('purchase');
    expect(edge.orderId).toBe(order.orderId);

    const saleEntry = Object.values(store.teacherEarnings).find((e: any) => e.type === 'sale');
    expect(saleEntry).toMatchObject({ teacherUid: TEACHER, classId: CLASS, orderId: order.orderId, amountPaise: 999_00 });
  });

  it('the single most important test in this phase: applying the same order twice never double-activates or double-accrues', async () => {
    seedClass();
    const order = await paymentsService.createClassOrder(STUDENT, CLASS);
    await paymentsService.applyOrderPayment(order.orderId, 'pay_1', 'webhook');
    await paymentsService.applyOrderPayment(order.orderId, 'pay_1', 'client'); // client callback racing the webhook

    expect(store.classes[CLASS].counts.enrolled).toBe(1);
    const saleEntries = Object.values(store.teacherEarnings).filter((e: any) => e.type === 'sale');
    expect(saleEntries).toHaveLength(1);
  });

  it('leaves an order that was never created untouched', async () => {
    const result = await paymentsService.applyOrderPayment('does-not-exist', 'pay_1', 'webhook');
    expect(result.applied).toBe(false);
    expect(result.orderType).toBeNull();
  });

  it('never applies the class-purchase path to a subscription order, or vice versa', async () => {
    // A subscription order has no orderType stamped as 'class_purchase' — orderType defaults to
    // 'subscription' for anything else, exactly as applyOrderPayment's dispatch logic requires.
    store.payments.sub_order_1 = { orderId: 'sub_order_1', orderType: 'subscription', userId: STUDENT, planId: 'pro', planName: 'Pro', billing: 'monthly', amountRupees: 499, status: 'created' };
    const result = await paymentsService.applyOrderPayment('sub_order_1', 'pay_1', 'webhook');
    expect(result.orderType).toBe('subscription');
    // No class enrolment or earnings entry should exist anywhere from this.
    expect(Object.keys(store.classEnrollments)).toHaveLength(0);
    expect(Object.keys(store.teacherEarnings)).toHaveLength(0);
  });
});
