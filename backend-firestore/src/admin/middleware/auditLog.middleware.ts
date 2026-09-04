import { Request, Response, NextFunction } from 'express';
import { db } from '../../config/firebase';
import { logger } from '../../utils/logger';

/**
 * Records every mutating admin action to `admin_audit_log` — real and durable, not
 * derived from anything else. Mounted in admin.routes.ts right after requireAdmin, so by
 * the time this runs req.user is always the verified, role-checked decoded token that
 * requireRoles() (rbac.middleware.ts) attached.
 *
 * GET requests are not logged: they are reads, and logging every dashboard page view
 * would flood the collection with noise nobody audits. Only state-changing methods
 * (POST/PATCH/PUT/DELETE) are recorded — which is exactly the set of admin actions worth
 * a trail: role/status changes, resolved alerts, edited or deleted notebooks, recorded
 * payouts, toggled feature flags.
 *
 * Fire-and-forget on `res.on('finish')`: the write happens after the response has already
 * gone out, so a failure here is logged and swallowed, never surfaced to an admin whose
 * request already succeeded or failed on its own merits.
 */
export function auditLogMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (req.method === 'GET') return next();

  res.on('finish', () => {
    const user = req.user as { uid?: string; email?: string; role?: string } | undefined;
    if (!user?.uid) return;

    db.collection('admin_audit_log')
      .add({
        actorUid: user.uid,
        actorEmail: user.email || null,
        actorRole: user.role || null,
        method: req.method,
        path: req.baseUrl + req.path,
        params: req.params || {},
        statusCode: res.statusCode,
        timestamp: Date.now(),
      })
      .catch((e) => logger.error('admin.auditLog write failed', { error: (e as Error).message }));
  });

  next();
}
