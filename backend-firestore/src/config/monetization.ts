/**
 * Monetization config for paid classes (Phase 3I) — commission and tax treatment.
 *
 * ⚠ THESE ARE ASSUMED DEFAULTS, NOT CONFIRMED BUSINESS OR LEGAL DECISIONS.
 *
 * TEACHER_ECOSYSTEM_PLAN.md §"Open decisions I need from you" lists three questions this file
 * stands in for until they're actually answered:
 *   1. Principal or agent? Determines whether Scholarly or the teacher is the seller of record —
 *      which in turn determines GST liability, invoicing, and TDS handling. This is a CA
 *      question with real compliance consequences, not something to guess. `CLASS_TAX_RATE` is
 *      set to 0 specifically BECAUSE that decision hasn't been made — deducting a guessed GST
 *      amount would be worse than deducting none, since it can't yet be remitted correctly
 *      either way.
 *   2. Commission percentage — `CLASS_COMMISSION_RATE` below is a placeholder, not a quoted rate.
 *   3. Refund policy — `REFUND_WINDOW_DAYS` is a placeholder; no refund EXECUTION is built in
 *      this phase (see earnings.service.ts), only the policy value for disclosure.
 *
 * Every value here is config-as-data specifically so it can change without touching the ledger
 * math that reads it — matching TEACHER_ECOSYSTEM_PLAN.md's `rewardRules` posture ("Amounts live
 * in config, not hardcoded in a service").
 */

/** Platform commission, as a fraction of the gross sale. 0.15 = 15%. */
export const CLASS_COMMISSION_RATE = 0.15;

/** Zero until the principal-vs-agent / GST question above is actually answered. */
export const CLASS_TAX_RATE = 0;

/** Disclosure only in this phase — no refund is executed automatically. */
export const REFUND_WINDOW_DAYS = 7;

/**
 * Splits a gross sale (in paise) into ledger amounts. Commission and tax are returned as
 * POSITIVE paise deducted from gross; the ledger records them as negative entries (see
 * earnings.service.ts) so a balance is always a plain sum, never a formula re-derived at read
 * time.
 */
export function splitClassSale(grossPaise: number): { grossPaise: number; commissionPaise: number; taxPaise: number; netPaise: number } {
  const commissionPaise = Math.round(grossPaise * CLASS_COMMISSION_RATE);
  const taxPaise = Math.round(grossPaise * CLASS_TAX_RATE);
  const netPaise = grossPaise - commissionPaise - taxPaise;
  return { grossPaise, commissionPaise, taxPaise, netPaise };
}
