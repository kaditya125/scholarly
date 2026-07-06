import { Request, Response, NextFunction } from 'express';
import { auth } from '../config/firebase';
import { env } from '../config/env';

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
