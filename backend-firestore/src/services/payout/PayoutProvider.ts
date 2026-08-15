import { env } from '../../config/env';

/**
 * PayoutProvider — the abstraction boundary for Phase 3K (automated teacher payouts).
 *
 * ── Why this file exists with no caller anywhere ────────────────────────────────────────
 * TEACHER_ECOSYSTEM_PLAN.md §G is explicit: real payout execution needs a registered legal
 * entity, RazorpayX/Route approval on that entity (a SEPARATE product from the RAZORPAY_* keys
 * already used for money coming IN), and a principal-vs-agent decision with real GST/TDS
 * consequences — a question for a CA, not something to guess. None of that exists yet. This
 * interface and its one implementation (`NotConfiguredPayoutProvider`) are the entire scope of
 * 3K until it does: a place for a real provider to plug into later, and a stub that fails loudly
 * rather than silently pretending to work if anything ever calls it by mistake.
 *
 * Nothing in this codebase invokes `getPayoutProvider()` yet. The live payout path is still
 * `earningsService.recordPayout` (Phase 3J-lite) — an admin manually recording a payout they
 * made themselves, which is what actually exists today. Wiring THIS interface into a route
 * belongs to whoever activates 3K for real; doing it now, against a provider that can't be
 * exercised, would produce untested code masquerading as a finished feature.
 *
 * ── Vendor-agnostic on purpose ───────────────────────────────────────────────────────────
 * `initiatePayout` is shaped around "send money to an account, get back a reference and a
 * status" — the same posture TEACHER_ECOSYSTEM_PLAN.md calls for on the live-video question
 * ("Abstraction layer, never direct SDK calls in features"), so a future switch away from
 * RazorpayX (Route, a different PSP, a manual bank-file export) doesn't mean rewriting callers.
 */

export interface PayoutRequest {
  teacherUid: string;
  amountPaise: number;
  /** Idempotency key — must produce the SAME result if retried with the same value. */
  idempotencyKey: string;
}

export type PayoutOutcome =
  | { status: 'processing'; providerRef: string }
  | { status: 'failed'; reason: string };

export interface PayoutProvider {
  readonly name: string;
  isConfigured(): boolean;
  initiatePayout(request: PayoutRequest): Promise<PayoutOutcome>;
}

export class PayoutProviderNotConfiguredError extends Error {
  constructor() {
    super(
      'Automated payouts are not configured. This requires RazorpayX/Route credentials, a ' +
      'registered legal entity, and a principal-vs-agent decision — see ' +
      'TEACHER_ECOSYSTEM_PLAN.md §G. Use the manual payout recorder (earningsService.recordPayout) instead.',
    );
    this.name = 'PayoutProviderNotConfiguredError';
  }
}

/**
 * The only PayoutProvider that exists today. `isConfigured()` is always false — there are no
 * RAZORPAYX_* credentials to check yet (see env.ts) — and `initiatePayout` always throws rather
 * than returning a fabricated success. A future `RazorpayXPayoutProvider` implementing this same
 * interface is what replaces this class; nothing else in the codebase needs to change.
 */
export class NotConfiguredPayoutProvider implements PayoutProvider {
  readonly name = 'not_configured';

  isConfigured(): boolean {
    return false;
  }

  async initiatePayout(_request: PayoutRequest): Promise<PayoutOutcome> {
    throw new PayoutProviderNotConfiguredError();
  }
}

import { RazorpayXPayoutProvider } from './RazorpayXPayoutProvider';

/**
 * Resolves the active provider. Currently always `NotConfiguredPayoutProvider` — the
 * RAZORPAYX_* env vars are read here (not hardcoded) specifically so that activating 3K later is
 * "implement RazorpayXPayoutProvider and return it here when configured", not a structural
 * change to this function's callers.
 */
export function getPayoutProvider(): PayoutProvider {
  const configured = !!(env.RAZORPAYX_KEY_ID && env.RAZORPAYX_KEY_SECRET && env.RAZORPAYX_ACCOUNT_NUMBER);
  if (configured) {
    return new RazorpayXPayoutProvider();
  }
  return new NotConfiguredPayoutProvider();
}
