import { Router } from 'express';
import { enrollmentController } from '../controllers/enrollment.controller';
import { requireAuth } from '../middlewares/auth';

/**
 * /api/enrollments/* and /api/invitations/* (Phase 3E).
 *
 * Deliberately NOT behind `requireProductRole('teacher')`: these are the STUDENT side of the
 * consent handshake. A student accepting an invitation, requesting to join, or leaving a class
 * is the whole point, and gating the namespace on a teacher role would make it unreachable.
 *
 * Authorization is per-edge instead: the service compares the caller against the class's owner
 * and the enrolment's student, and rejects anyone who is neither. That is stricter than a role
 * check — a teacher has no power here over a class they do not own.
 *
 * ⚠ `/mine` is registered before `/:classId/state` for the usual reason: a literal path must not
 * be swallowed by a parameterised sibling.
 */
const router = Router();

router.use(requireAuth);

router.get('/mine', enrollmentController.listMine);
router.post('/:classId/state', enrollmentController.setState);

export default router;

/**
 * Invitation code resolution lives on its own router so the URLs read the way a shared link
 * should: /api/invitations/ABC12XYZ rather than nested under a class the recipient cannot see yet.
 */
export const invitationsRouter = Router();
invitationsRouter.use(requireAuth);
invitationsRouter.get('/:code', enrollmentController.previewInvitation);
invitationsRouter.post('/:code/accept', enrollmentController.acceptInvitation);
