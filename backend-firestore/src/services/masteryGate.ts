import { featureFlags } from '../config/featureFlags';
import { FeatureFlagService } from './featureFlag.service';
import { logger } from '../utils/logger';

/*
 * Constructed lazily, never at import time.
 *
 * FeatureFlagService's constructor resolves CacheProvider from the DI container and initialises
 * a Firestore handle, so building it at module scope would run before bootstrapDI() in any
 * importer that loads early — throwing "Dependency not found for token: Symbol(ICacheProvider)"
 * through the same quiet path that made an unbootstrapped probe look like a production failure.
 * Same lazy pattern admin-aggregates.service uses, for the same reason.
 */
let _flags: FeatureFlagService | undefined;
const flags = (): FeatureFlagService => (_flags ??= new FeatureFlagService());

/**
 * The single decision point for "may mastery be written for this student".
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────────────────────────
 * ENABLE_MASTERY is read from process.env, so it is all-or-nothing: turning it on writes mastery
 * for every student at once. That is the wrong shape for a first enablement — the write path has
 * never run against real traffic, and mastery records are cumulative evidence about real people,
 * not something to be casually generated and deleted.
 *
 * featureFlag.service already supports per-user targeting (scope 'user' | 'beta' with
 * targetUserIds, failing closed on any error). The mastery gate simply never consulted it. This
 * joins the two.
 *
 * ── THE COMBINATION RULE ──────────────────────────────────────────────────────────────────
 *     ENABLE_MASTERY=true            → on for everyone   (unchanged global switch)
 *     flag doc targets this userId   → on for that student only
 *     neither                        → off
 *
 * Deliberately OR, not replace. The env var keeps working exactly as it does today, so this
 * cannot change existing behaviour for anyone: with ENABLE_MASTERY unset the global answer is
 * still false, and the only way to get a true is to be named explicitly in the flag document.
 *
 * ── WHY ONE FUNCTION AND NOT TWO CHECKS ───────────────────────────────────────────────────
 * Two gate sites consult this — the test_completed subscriber and baselineReconciliation. They
 * must agree: a student for whom the subscriber writes but reconciliation refuses (or vice
 * versa) would accumulate a backlog that never drains, or drain evidence twice under different
 * rules. This codebase has already been bitten by two call sites deriving the same answer
 * separately and drifting; one derivation is the fix for that.
 */

/** Firestore document id in the feature-flag collection. */
export const MASTERY_FLAG = 'mastery';

export async function isMasteryEnabledFor(userId?: string): Promise<boolean> {
  // Global switch first: it needs no I/O, and when it is on the per-user lookup is irrelevant.
  if (featureFlags.mastery) return true;
  if (!userId) return false;

  try {
    return await flags().isEnabled(MASTERY_FLAG, userId);
  } catch (err: any) {
    /*
     * Fail closed, and say so. featureFlagService already returns false on its own errors; this
     * catch is for the lookup itself failing (Firestore unreachable, cache throwing). Silently
     * returning false would be indistinguishable from "not targeted", and the difference matters
     * when someone is trying to work out why their test account produced no mastery.
     */
    logger.warn('[MasteryGate] per-user flag lookup failed; treating as disabled', {
      userId, error: err?.message,
    });
    return false;
  }
}
