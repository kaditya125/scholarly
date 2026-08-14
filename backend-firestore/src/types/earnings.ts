/**
 * Teacher earnings — an append-only ledger, never a mutable balance field.
 *
 * ── Why append-only ───────────────────────────────────────────────────────────────────
 * A stored "balance" field can drift from reality the moment two writes race, and a bug that
 * decrements it wrongly is invisible after the fact — there's no record of what it was before.
 * Every accrual, deduction and reversal is instead its own signed entry; the balance is always
 * `sum(amountPaise)`, computed at read time. This is the same posture the plan calls for
 * ("Balance is derived by summing, never stored as a mutable field") and it means an entry can
 * never be edited, only reversed by a new entry that cancels it — the ledger is a history, not a
 * cache.
 *
 * ── What THIS phase does not build ──────────────────────────────────────────────────────
 * `state` tracks a payout lifecycle (`pending → eligible → processing → paid`), but nothing in
 * this phase moves an entry out of `pending` — there is no scheduled job, no admin transition
 * endpoint, and no payout execution (that's 3J/3K, and 3K is blocked on RazorpayX/Route +
 * a registered legal entity, see TEACHER_ECOSYSTEM_PLAN.md §G). An entry sitting at `pending`
 * forever, for now, is the honest representation of "money collected, not yet payable" — not a
 * bug to work around.
 */

export const EARNING_TYPES = ['sale', 'commission', 'tax', 'refund', 'adjustment'] as const;
export type EarningType = (typeof EARNING_TYPES)[number];

export const EARNING_STATES = ['pending', 'eligible', 'processing', 'paid', 'failed', 'reversed'] as const;
export type EarningState = (typeof EARNING_STATES)[number];

/** `teacherEarnings/{entryId}` */
export interface TeacherEarningEntry {
  id: string;
  teacherUid: string;
  classId: string;
  orderId: string;
  type: EarningType;
  /** Signed. `sale` is positive (gross); `commission`/`tax` are negative deductions. */
  amountPaise: number;
  state: EarningState;
  createdAt: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
}

export interface TeacherEarningsSummary {
  /** Owed but not yet paid — the sum of every entry whose `state` is not `paid`. */
  balancePaise: number;
  /** Already paid out — the sum of every entry whose `state` IS `paid`. */
  paidPaise: number;
  entries: TeacherEarningEntry[];
}

/* ── Payouts (Phase 3J-lite) ──────────────────────────────────────────────────────────────
 *
 * Deliberately MANUAL, not automated. Real payout execution (RazorpayX/Route) is blocked on a
 * registered legal entity and a principal-vs-agent decision — see TEACHER_ECOSYSTEM_PLAN.md §G.
 * Until that exists, `recordPayout` in earnings.service.ts is how an admin records that a
 * teacher was paid OUTSIDE the platform (UPI, bank transfer, cash) so the ledger reflects
 * reality instead of an ever-growing "pending" balance nobody can act on. No money moves through
 * this code path — it only records that it moved elsewhere.
 */

export const PAYOUT_METHODS = ['upi', 'bank_transfer', 'cash', 'other'] as const;
export type PayoutMethod = (typeof PAYOUT_METHODS)[number];

export function isPayoutMethod(value: unknown): value is PayoutMethod {
  return typeof value === 'string' && (PAYOUT_METHODS as readonly string[]).includes(value);
}

export const MAX_PAYOUT_REFERENCE = 120;
export const MAX_PAYOUT_NOTE = 500;

/** `teacherPayouts/{id}` — one record per manual payout, covering every entry it settled. */
export interface TeacherPayoutRecord {
  id: string;
  teacherUid: string;
  /** Every earnings entry this payout marked `paid`. Lets a payout be traced back to its sales. */
  entryIds: string[];
  netPaise: number;
  method: PayoutMethod;
  /** UPI transaction id / bank reference / cheque number — admin-entered, unverified. */
  reference: string | null;
  note: string | null;
  /** The admin who recorded it. Never the teacher — this is not self-serve. */
  paidBy: string;
  createdAt: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
}

export interface RecordPayoutInput {
  method?: PayoutMethod;
  reference?: string | null;
  note?: string | null;
}

export interface PayoutQueueRow {
  teacherUid: string;
  balancePaise: number;
  displayName: string | null;
  email: string | null;
}
