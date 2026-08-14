/**
 * Phase 3K scaffold: the payout provider abstraction has exactly one implementation right now,
 * and its entire job is to fail loudly rather than fabricate a successful payout. This is the
 * one property worth locking down with a test before any real provider exists.
 */

jest.mock('../../src/config/env', () => ({
  env: { RAZORPAYX_KEY_ID: undefined, RAZORPAYX_KEY_SECRET: undefined, RAZORPAYX_ACCOUNT_NUMBER: undefined },
}));

import {
  getPayoutProvider,
  NotConfiguredPayoutProvider,
  PayoutProviderNotConfiguredError,
} from '../../src/services/payout/PayoutProvider';

describe('getPayoutProvider', () => {
  it('resolves to the not-configured stub when no RazorpayX credentials are set', () => {
    const provider = getPayoutProvider();
    expect(provider).toBeInstanceOf(NotConfiguredPayoutProvider);
    expect(provider.isConfigured()).toBe(false);
  });
});

describe('NotConfiguredPayoutProvider', () => {
  it('never returns a fabricated success', async () => {
    const provider = new NotConfiguredPayoutProvider();
    await expect(
      provider.initiatePayout({ teacherUid: 't1', amountPaise: 10000, idempotencyKey: 'k1' }),
    ).rejects.toBeInstanceOf(PayoutProviderNotConfiguredError);
  });

  it('reports itself as unconfigured', () => {
    expect(new NotConfiguredPayoutProvider().isConfigured()).toBe(false);
  });
});
