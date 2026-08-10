import { Request, Response, NextFunction } from 'express';
import { auth } from '../config/firebase';
import { env } from '../config/env';
import {
  PRODUCT_ROLE_CLAIM,
  ProductRole,
  isAdminRole,
  isProductRole,
} from '../types/roles';

/**
 * Verifies the Firebase ID token from the `Authorization: Bearer <token>` header
 * and attaches the decoded token to `req.user`. Rejects with 401 when the token
 * is missing or invalid.
 */
export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.split('Bearer ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const decodedToken = await auth.verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Unauthorized' });
  }
};

/**
 * Ensures the authenticated user matches the `:userId` (or the supplied param)
 * present in the route. MUST be used after `requireAuth`.
 *
 * This closes IDOR gaps on routes that previously trusted a client-supplied
 * `userId` path parameter, WITHOUT changing the URL shape (backward compatible).
 */
export const enforceSelf = (paramName: string = 'userId') => {
  return (req: Request, res: Response, next: NextFunction) => {
    const authedUid = req.user?.uid;
    if (!authedUid) return res.status(401).json({ error: 'Unauthorized' });

    const target = req.params[paramName];
    if (target && target !== authedUid) {
      return res.status(403).json({ error: "Forbidden: cannot access another user's resources" });
    }
    next();
  };
};

/**
 * Reads custom claims off the already-verified token.
 *
 * `req.user` is declared in types/express.d.ts as `UserRecord | { uid: string; [k: string]: any }`.
 * firebase-admin's UserRecord has no index signature, so the union can't be indexed directly.
 * requireAuth actually assigns a DecodedIdToken (which does carry arbitrary claims), so we
 * narrow here rather than widening the shared declaration and rippling into every consumer.
 */
const tokenClaims = (req: Request): Record<string, any> =>
  (req.user || {}) as unknown as Record<string, any>;

/**
 * True when the verified token carries an administrative `role` claim.
 *
 * Reads the token `requireAuth` already verified — it does NOT re-verify, so this adds no
 * latency and no duplicate `verifyIdToken` path. MUST be used after `requireAuth`.
 */
export const isAdmin = (req: Request): boolean => isAdminRole(tokenClaims(req).role);

/**
 * True when the verified token carries the given product role.
 * MUST be used after `requireAuth`.
 */
export const hasProductRole = (req: Request, role: ProductRole): boolean =>
  tokenClaims(req)[PRODUCT_ROLE_CLAIM] === role;

/**
 * Gate a route on one or more product roles (`student` / `teacher`).
 *
 * Deliberately mirrors the shape of admin/middleware/rbac.middleware.ts's `requireRoles`
 * rather than replacing it: that middleware guards the admin surface and is left alone.
 * The difference is that this one runs AFTER `requireAuth` and reuses the already-verified
 * token, instead of pulling and verifying the bearer token a second time.
 *
 * Administrators pass automatically — an admin inspecting a teacher surface should not be
 * blocked by the absence of a product role.
 */
export const requireProductRole = (...roles: ProductRole[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user?.uid) return res.status(401).json({ error: 'Unauthorized' });
    if (isAdmin(req)) return next();

    const current = tokenClaims(req)[PRODUCT_ROLE_CLAIM];
    if (!isProductRole(current) || !roles.includes(current)) {
      return res.status(403).json({
        error: `Forbidden: requires ${roles.join(' or ')} role`,
      });
    }
    next();
  };
};

/**
 * Protects internal / CRON endpoints with a shared secret (`env.CRON_SECRET`).
 * The secret may be supplied via the `x-cron-secret` header or as a Bearer token.
 *
 * Backward-compatibility note: if `CRON_SECRET` is not configured, the request is
 * allowed but a warning is logged. Set `CRON_SECRET` in production to lock this down.
 */
export const requireCronSecret = (req: Request, res: Response, next: NextFunction) => {
  const configured = env.CRON_SECRET;
  if (!configured) {
    console.warn('[Security] CRON_SECRET is not configured — CRON endpoint is currently unauthenticated. Set CRON_SECRET in production.');
    return next();
  }

  const provided = (req.headers['x-cron-secret'] as string) || req.headers.authorization?.split('Bearer ')[1];
  if (provided !== configured) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};
