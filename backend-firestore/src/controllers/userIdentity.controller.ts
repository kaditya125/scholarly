import { Request, Response } from 'express';
import { auth } from '../config/firebase';
import {
  userIdentityService,
  RoleConflictError,
} from '../services/userIdentity.service';
import { referralService } from '../services/referral.service';
import { zeptoMailService } from '../services/email/zeptoMail.service';
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
import { connectionService } from '../services/connection.service';

export class UserIdentityController {
  /**
   * POST /api/users/bootstrap   body: { role: 'student' | 'teacher', referredBy?: string }
   */
  bootstrap = async (req: Request, res: Response) => {
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({ error: 'Unauthorized' });

    const requested = (req.body || {}).role;
    const referredBy = typeof (req.body || {}).referredBy === 'string' ? (req.body.referredBy as string).trim() : null;

    // Administrative roles are never grantable here.
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

    // Mandatory Email Verification gate: email/password accounts must be verified before activation
    const signInProvider = (req.user as any)?.firebase?.sign_in_provider;
    const isPasswordAccount = signInProvider === 'password';
    let isEmailVerified = (req.user as any)?.email_verified === true;

    if (isPasswordAccount && !isEmailVerified) {
      try {
        const liveUser = await auth.getUser(uid);
        if (liveUser.emailVerified) {
          isEmailVerified = true;
        }
      } catch (err) {
        logger.warn('[UserIdentity] Failed to fetch live user record for verification check', { uid });
      }
    }

    if (isPasswordAccount && !isEmailVerified) {
      logger.warn('[UserIdentity] Bootstrap rejected: email is not verified', { uid });
      return res.status(403).json({
        error: 'Email verification required before activating your account. Please verify your email.',
        code: 'auth/unverified-email',
      });
    }

    try {
      const result = await userIdentityService.bootstrapProductRole(uid, requested);

      // Auto-sync directory for instant peer discovery
      connectionService.syncDirectory(uid).catch(() => {});

      if (result.profileCreated) {
        if (referredBy) {
          await referralService.recordReferral(referredBy, uid).catch((err) => {
            logger.warn('[UserIdentity] Referral crediting failed', { uid, referredBy, error: err?.message });
          });
        }

        // Send rich, professional Welcome Email for first-time account initialization
        try {
          const userRec = await auth.getUser(uid);
          if (userRec.email) {
            const displayName = userRec.displayName || (req.user as any)?.name || 'Learner';
            zeptoMailService.sendWelcomeEmail(userRec.email, displayName, requested).catch((err) => {
              logger.warn('[UserIdentity] Welcome email failed to dispatch', { uid, email: userRec.email, error: err?.message });
            });
          }
        } catch (err: any) {
          logger.warn('[UserIdentity] Could not retrieve user record for welcome email', { uid, error: err?.message });
        }
      }

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
        return res.status(200).json({ exists: false, uid, role: null });
      }
      // Keep directory entry synced
      connectionService.syncDirectory(uid).catch(() => {});
      return res.status(200).json({ exists: true, ...profile });
    } catch (err: any) {
      logger.error('[UserIdentity] Profile read failed', { uid, error: err?.message });
      return res.status(500).json({ error: 'Failed to load profile.' });
    }
  };
}

export const userIdentityController = new UserIdentityController();
