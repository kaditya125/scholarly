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
export class UserIdentityController {
  /**
   * POST /api/users/bootstrap   body: { role: 'student' | 'teacher', referredBy?: string }
   *
   *   201 — role assigned (client MUST then call getIdToken(true))
   *   200 — already had this role; idempotent no-op
   *   400 — missing/unknown role
   *   401 — no or invalid token (requireAuth)
   *   403 — an administrative role was requested through the public endpoint
   *   409 — account already holds a DIFFERENT product role (no self-escalation)
   *
   * `referredBy` (Phase 3L) is the referring account's uid, captured client-side from a
   * `?ref=` signup link. Referral crediting only fires when `profileCreated` comes back true —
   * a SERVER-COMPUTED fact (see userIdentity.service.ts), never a client assertion — so this
   * cannot be replayed to re-credit a referral, and a pre-existing account gaining a role for
   * the first time (profileCreated: false, an edge case for legacy accounts) is correctly never
   * treated as a fresh referral either.
   */
  bootstrap = async (req: Request, res: Response) => {
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({ error: 'Unauthorized' });

    const requested = (req.body || {}).role;
    const referredBy = typeof (req.body || {}).referredBy === 'string' ? (req.body.referredBy as string).trim() : null;

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

    // Mandatory Email Verification gate: email/password accounts must be verified before activation
    const signInProvider = (req.user as any)?.firebase?.sign_in_provider;
    const isPasswordAccount = signInProvider === 'password';
    let isEmailVerified = (req.user as any)?.email_verified === true;

    // If token claims don't reflect verification yet (e.g. user just clicked email link in another tab),
    // query Firebase Auth server directly for authoritative real-time state.
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

      if (result.profileCreated) {
        if (referredBy) {
          // Best-effort: a referral is a growth nicety, never something that should fail account
          // creation. Errors are logged, not surfaced — the account bootstrap already succeeded.
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
