import { Request, Response } from 'express';
import { loadCapabilities } from '../middlewares/capability';
import { PRODUCT_ROLE_CLAIM, isProductRole } from '../types/roles';
import { normalizeTeacherStatus } from '../types/teacher';
import { teacherProfileService } from '../services/teacherProfile.service';
import { logger } from '../utils/logger';

/**
 * GET /api/users/capabilities
 *
 * What the authenticated caller may currently do, so the UI can render honestly — showing
 * "awaiting review" rather than a button that 403s, and hiding actions that are not yet open.
 *
 * ⚠ THIS IS A DISPLAY CONTRACT, NOT AN AUTHORIZATION ONE.
 * Every protected route re-derives capabilities server-side from the verified token and the
 * live teacher status. A client that patches this response, caches it, or fabricates it gains
 * nothing: the gate is `requireCapability`, not this payload. It exists so the interface can
 * tell the truth, not so the browser can decide.
 *
 * Self-scoped by construction — reads `req.user.uid` and accepts no identifier, so there is no
 * request shape that returns another account's capabilities.
 */
export class CapabilitiesController {
  get = async (req: Request, res: Response) => {
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({ error: 'Unauthorized' });

    try {
      const capabilities = await loadCapabilities(req);

      const claims = (req.user || {}) as unknown as Record<string, any>;
      const rawRole = claims[PRODUCT_ROLE_CLAIM];
      const productRole = isProductRole(rawRole) ? rawRole : null;

      // Surfaced so the UI can explain WHY something is closed. Only fetched for teachers —
      // loadCapabilities has already memoised the underlying read for this request.
      let teacherStatus: string | null = null;
      if (productRole === 'teacher') {
        const profile = await teacherProfileService.get(uid);
        teacherStatus = profile ? normalizeTeacherStatus(profile.teacherStatus) : null;
      }

      return res.status(200).json({ uid, productRole, teacherStatus, capabilities });
    } catch (err: any) {
      logger.error('[Capabilities] Read failed', { uid, error: err?.message });
      return res.status(500).json({ error: 'Failed to load capabilities.' });
    }
  };
}

export const capabilitiesController = new CapabilitiesController();
