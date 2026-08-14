import { Request, Response } from 'express';
import { teacherProfileService } from '../../services/teacherProfile.service';
import {
  TEACHER_STATUS_TRANSITIONS,
  isTeacherStatus,
  normalizeTeacherStatus,
} from '../../types/teacher';
import { logger } from '../../utils/logger';

/**
 * Administrative control of teacher verification.
 *
 * Mounted under the existing `/api/admin` router, which is already wrapped in `requireAdmin`
 * (super_admin | admin | moderator). This controller therefore does not re-authenticate — it
 * reads the actor from `req.user`, which `requireRoles` populated from a token it verified.
 *
 * The controller validates SHAPE. The service validates the STATE MACHINE. Keeping those
 * separate means an invalid transition is rejected identically no matter which caller reaches
 * the service, rather than depending on this handler having remembered to check.
 */
export class TeacherVerificationController {
  /**
   * GET /api/admin/teacher/queue
   *
   * Teachers currently awaiting a decision (`pending` and `under_review`), oldest first. The
   * actual missing piece of D-3: the state machine and the per-teacher transition endpoint below
   * have existed since Phase 3A, but nothing let a human see who was waiting. This is that list.
   */
  listQueue = async (_req: Request, res: Response) => {
    try {
      const queue = await teacherProfileService.getReviewQueue();
      return res.status(200).json({ queue, count: queue.length });
    } catch (err: any) {
      logger.error('[TeacherVerification] Queue read failed', { error: err?.message });
      return res.status(500).json({ error: 'Failed to load the review queue.' });
    }
  };

  /**
   * POST /api/admin/teacher/:uid/status
   * body: { status: TeacherStatus, reason?: string }
   *
   *   200 transitioned · 400 bad shape · 403 self-review · 404 no profile
   *   409 transition not permitted by the state machine
   */
  setStatus = async (req: Request, res: Response) => {
    const actorUid = req.user?.uid;
    const actorRole = (req.user as any)?.role;
    if (!actorUid) return res.status(401).json({ error: 'Unauthorized' });

    const teacherUid = req.params.uid;
    if (!teacherUid || typeof teacherUid !== 'string') {
      return res.status(400).json({ error: 'A teacher uid is required.' });
    }

    const { status, reason } = req.body ?? {};
    if (!isTeacherStatus(status)) {
      return res.status(400).json({
        error: 'Invalid status.',
        allowed: Object.keys(TEACHER_STATUS_TRANSITIONS),
      });
    }
    if (reason !== undefined && reason !== null && typeof reason !== 'string') {
      return res.status(400).json({ error: 'reason must be a string when provided.' });
    }

    // An administrator who also holds a teacher account must not review themselves. This is an
    // integrity control rather than a security one — an admin could still act through another
    // admin — but it removes the single most obvious way for the trail to record a meaningless
    // approval.
    if (actorUid === teacherUid) {
      return res.status(403).json({ error: 'You cannot change the verification status of your own teacher account.' });
    }

    try {
      const result = await teacherProfileService.transitionStatus({
        teacherUid,
        to: status,
        actorUid,
        actorRole: typeof actorRole === 'string' ? actorRole : 'admin',
        reason: reason ?? null,
      });
      return res.status(200).json({ teacherUid, ...result });
    } catch (err: any) {
      if (err?.code === 'NOT_FOUND') {
        return res.status(404).json({ error: 'No teacher profile exists for that uid.' });
      }
      if (err?.code === 'INVALID_TRANSITION') {
        return res.status(409).json({
          error: `Cannot move a teacher from "${err.from}" to "${err.to}".`,
          from: err.from,
          attempted: err.to,
          allowedFromCurrent: TEACHER_STATUS_TRANSITIONS[err.from as keyof typeof TEACHER_STATUS_TRANSITIONS] ?? [],
        });
      }
      logger.error('[TeacherVerification] Transition failed', { teacherUid, actorUid, error: err?.message });
      return res.status(500).json({ error: 'Failed to update verification status.' });
    }
  };

  /**
   * GET /api/admin/teacher/:uid/verification
   *
   * Current status plus the audit trail, newest first. Admin-only: review reasons may contain
   * internal notes and are deliberately never exposed on the teacher-facing profile endpoint.
   */
  getVerification = async (req: Request, res: Response) => {
    const teacherUid = req.params.uid;
    if (!teacherUid) return res.status(400).json({ error: 'A teacher uid is required.' });

    try {
      const profile = await teacherProfileService.get(teacherUid);
      if (!profile) return res.status(404).json({ error: 'No teacher profile exists for that uid.' });

      const current = normalizeTeacherStatus(profile.teacherStatus);
      const history = await teacherProfileService.getVerificationHistory(teacherUid);

      return res.status(200).json({
        teacherUid,
        teacherStatus: current,
        allowedTransitions: TEACHER_STATUS_TRANSITIONS[current] ?? [],
        history,
      });
    } catch (err: any) {
      logger.error('[TeacherVerification] History read failed', { teacherUid, error: err?.message });
      return res.status(500).json({ error: 'Failed to load verification history.' });
    }
  };
}

export const teacherVerificationController = new TeacherVerificationController();
