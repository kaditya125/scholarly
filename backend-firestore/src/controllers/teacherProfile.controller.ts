import { Request, Response } from 'express';
import { teacherProfileService } from '../services/teacherProfile.service';
import { logger } from '../utils/logger';

/**
 * TeacherProfileController — the caller's own teacher profile.
 *
 * Self-scoped by construction: every handler reads `req.user.uid` (derived by requireAuth from a
 * verified Firebase ID token) and no handler accepts a user identifier. There is therefore no
 * request that can read or write another account's teacher profile through this surface.
 *
 * Route-level guards (`requireAuth` + `requireProductRole('teacher')`) mean a student reaching
 * these endpoints is rejected with 403 before any handler runs.
 */
export class TeacherProfileController {
  /**
   * GET /api/teacher/profile
   *   200 { exists: false } — teacher has not started onboarding (expected, not an error)
   *   200 { exists: true, ...profile }
   */
  get = async (req: Request, res: Response) => {
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({ error: 'Unauthorized' });

    try {
      const profile = await teacherProfileService.get(uid);
      if (!profile) return res.status(200).json({ exists: false, uid });
      return res.status(200).json({ exists: true, ...profile });
    } catch (err: any) {
      logger.error('[TeacherProfile] Read failed', { uid, error: err?.message });
      return res.status(500).json({ error: 'Failed to load teacher profile.' });
    }
  };

  /**
   * POST /api/teacher/profile   body: partial TeacherProfileInput
   *   201 created · 200 updated · 400 invalid body · 401 unauth · 403 not a teacher
   *
   * Accepts partial payloads so the wizard can autosave each step. `teacherStatus` in the body is
   * ignored — the service builds its write set field-by-field rather than spreading input.
   */
  upsert = async (req: Request, res: Response) => {
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({ error: 'Unauthorized' });

    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).json({ error: 'Expected a teacher profile object.' });
    }

    // Surfaced rather than silently dropped: a client attempting a privileged field is a signal
    // worth logging, even though sanitize() already makes it inert.
    for (const forbidden of ['teacherStatus', 'uid', 'role', 'productRole', 'createdAt']) {
      if (forbidden in body) {
        logger.warn('[TeacherProfile] Ignored privileged field in request body', { uid, field: forbidden });
      }
    }

    try {
      const { profile, created } = await teacherProfileService.upsert(uid, body);
      return res.status(created ? 201 : 200).json({ exists: true, ...profile });
    } catch (err: any) {
      logger.error('[TeacherProfile] Upsert failed', { uid, error: err?.message });
      return res.status(500).json({ error: 'Failed to save teacher profile.' });
    }
  };
}

export const teacherProfileController = new TeacherProfileController();
