import { Request, Response } from 'express';
import {
  policiesService,
  CURRENT_POLICY_SET_VERSION,
} from '../services/policies/policies.service';
import { logger } from '../utils/logger';

export class PoliciesController {
  /**
   * GET /api/policies/current
   * Public endpoint — returns the current policy set and section catalog.
   */
  getCurrent = async (_req: Request, res: Response) => {
    try {
      const currentSet = policiesService.getCurrentPolicySet();
      return res.json(currentSet);
    } catch (err: any) {
      logger.error('[PoliciesController] Failed to get current policies', { error: err?.message });
      return res.status(500).json({ error: 'Failed to retrieve current policy set.' });
    }
  };

  /**
   * GET /api/policies/version/:version
   * Public endpoint — returns a specific historical policy snapshot.
   */
  getByVersion = async (req: Request, res: Response) => {
    const version = req.params.version;
    if (!version) {
      return res.status(400).json({ error: 'Version parameter is required.' });
    }

    try {
      const policySet = policiesService.getPolicyVersion(version);
      if (!policySet) {
        return res.status(404).json({ error: `Policy version '${version}' not found.` });
      }
      return res.json(policySet);
    } catch (err: any) {
      logger.error('[PoliciesController] Failed to get policy version', { version, error: err?.message });
      return res.status(500).json({ error: 'Failed to retrieve policy version.' });
    }
  };

  /**
   * GET /api/policies/my-consent
   * Authenticated endpoint — checks whether current user has accepted current policies.
   */
  getMyConsent = async (req: Request, res: Response) => {
    const uid = req.user?.uid;
    if (!uid) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      const status = await policiesService.getUserConsentStatus(uid);
      return res.json(status);
    } catch (err: any) {
      logger.error('[PoliciesController] Failed to get user consent', { uid, error: err?.message });
      return res.status(500).json({ error: 'Failed to check consent status.' });
    }
  };

  /**
   * POST /api/policies/consent
   * Authenticated endpoint — records caller's agreement to the active policy version.
   */
  acceptConsent = async (req: Request, res: Response) => {
    const uid = req.user?.uid;
    if (!uid) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { version } = req.body || {};
    if (!version || typeof version !== 'string') {
      return res.status(400).json({
        error: `A valid policy version string is required (current: ${CURRENT_POLICY_SET_VERSION}).`,
      });
    }

    if (version !== CURRENT_POLICY_SET_VERSION) {
      return res.status(400).json({
        error: `Cannot accept outdated version '${version}'. Current active version is '${CURRENT_POLICY_SET_VERSION}'.`,
        currentVersion: CURRENT_POLICY_SET_VERSION,
      });
    }

    try {
      const userAgent = req.headers['user-agent'] as string | undefined;
      const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress) as string | undefined;

      const record = await policiesService.recordUserConsent(uid, version, { userAgent, ip });

      return res.status(200).json({
        success: true,
        message: 'Policy consent recorded successfully.',
        record,
      });
    } catch (err: any) {
      logger.error('[PoliciesController] Failed to record user consent', { uid, version, error: err?.message });
      return res.status(500).json({ error: 'Failed to record policy consent.' });
    }
  };

  /**
   * GET /api/policies/my-consent/history
   * Authenticated endpoint — returns all historical consents for current user.
   */
  getMyConsentHistory = async (req: Request, res: Response) => {
    const uid = req.user?.uid;
    if (!uid) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      const history = await policiesService.getUserConsentHistory(uid);
      return res.json({ history });
    } catch (err: any) {
      logger.error('[PoliciesController] Failed to get consent history', { uid, error: err?.message });
      return res.status(500).json({ error: 'Failed to retrieve consent history.' });
    }
  };
}

export const policiesController = new PoliciesController();
