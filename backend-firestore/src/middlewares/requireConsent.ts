import { Request, Response, NextFunction } from 'express';
import {
  policiesService,
  CURRENT_POLICY_SET_VERSION,
} from '../services/policies/policies.service';
import { logger } from '../utils/logger';

/**
 * Middleware: requirePolicyConsent
 *
 * Ensures the authenticated user has accepted the active platform policy version.
 * If not, returns 403 with code 'policy/consent-required' to prompt review.
 */
export async function requirePolicyConsent(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const uid = req.user?.uid;
  if (!uid) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const status = await policiesService.getUserConsentStatus(uid);
    if (!status.hasAcceptedCurrent) {
      logger.warn('[requirePolicyConsent] User has not accepted current policies', {
        uid,
        currentVersion: CURRENT_POLICY_SET_VERSION,
        lastAccepted: status.lastAcceptedVersion,
      });

      return res.status(403).json({
        error: 'Please review and accept the updated Sadhya platform terms and policies to continue.',
        code: 'policy/consent-required',
        currentVersion: CURRENT_POLICY_SET_VERSION,
        lastAcceptedVersion: status.lastAcceptedVersion,
      });
    }

    next();
  } catch (err: any) {
    logger.error('[requirePolicyConsent] Error checking policy consent', { uid, error: err?.message });
    // Fail safe to next in case of transient error so user is not locked out indefinitely
    next();
  }
}
