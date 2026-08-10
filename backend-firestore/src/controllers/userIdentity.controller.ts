import { Request, Response } from 'express';
import {
  userIdentityService,
  RoleConflictError,
} from '../services/userIdentity.service';
import { PRODUCT_ROLES, isProductRole, isAdminRole } from '../types/roles';
import { logger } from '../utils/logger';

/**
 * UserIdentityController — product-role bootstrap and canonical profile reads.
 *
 * The single security rule here: the request body supplies the *desired role only*. It
 * never supplies identity. The uid always comes from `req.user.uid`, which requireAuth
 * derived from a verified Firebase ID token, so a client cannot bootstrap a profile for
 * another account by passing someone else's uid.
 */
export class UserIdentityController {
  /**
   * POST /api/users/bootstrap   body: { role: 'student' | 'teacher' }
   *
   *   201 — role assigned (client MUST then call getIdToken(true))
   *   200 — already had this role; idempotent no-op
   *   400 — missing/unknown role
   *   401 — no or invalid token (requireAuth)
   *   403 — an administrative role was requested through the public endpoint
   *   409 — account already holds a DIFFERENT product role (no self-escalation)
   */
  bootstrap = async (req: Request, res: Response) => {
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({ error: 'Unauthorized' });

    const requested = (req.body || {}).role;

    // Administrative roles are never grantable here. Called out separately from the
    // generic invalid-role case so an attempt is unambiguous in the logs.
    if (isAdminRole(requested)) {
      logger.warn('[UserIdentity] Administrative role requested via public bootstrap', {
        uid,
        requested,
      });
      return res.status(403).json({
        error: 'Administrative roles cannot be assigned through this endpoint.',
      });
    }

    if (!isProductRole(requested)) {
      return res.status(400).json({
        error: `Invalid role. Expected one of: ${PRODUCT_ROLES.join(', ')}.`,
      });
    }

    try {
      const result = await userIdentityService.bootstrapProductRole(uid, requested);
      return res.status(result.assigned ? 201 : 200).json(result);
    } catch (err: any) {
      if (err instanceof RoleConflictError) {
        return res.status(409).json({
          error: err.message,
          currentRole: err.current,
          requestedRole: err.requested,
        });
      }
      logger.error('[UserIdentity] Bootstrap failed', { uid, error: err?.message });
      return res.status(500).json({ error: 'Failed to initialise account.' });
    }
  };

  /**
   * GET /api/users/me — the caller's canonical profile.
   * Self-scoped by construction: it reads req.user.uid and accepts no user identifier.
   */
  me = async (req: Request, res: Response) => {
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({ error: 'Unauthorized' });

    try {
      const profile = await userIdentityService.getCanonicalProfile(uid);
      if (!profile) {
        // Pre-existing accounts have no canonical document yet — that is expected, not an
        // error. The client treats this as "needs bootstrap".
        return res.status(200).json({ exists: false, uid, role: null });
      }
      return res.status(200).json({ exists: true, ...profile });
    } catch (err: any) {
      logger.error('[UserIdentity] Profile read failed', { uid, error: err?.message });
      return res.status(500).json({ error: 'Failed to load profile.' });
    }
  };
}

export const userIdentityController = new UserIdentityController();
