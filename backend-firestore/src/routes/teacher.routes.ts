import { Router } from 'express';
import { teacherProfileController } from '../controllers/teacherProfile.controller';
import { requireAuth, requireProductRole } from '../middlewares/auth';
import { requireCapability } from '../middlewares/capability';

/**
 * /api/teacher/* — the first genuinely teacher-specific surface in the codebase, and therefore
 * the first place `requireProductRole` is actually applied. It has existed since Phase 1 but was
 * used by zero routes, because until now no endpoint was teacher-only.
 *
 * Guard order matters: requireAuth verifies the ID token and populates req.user, then
 * requireProductRole reads the ALREADY-VERIFIED claims from it — no second verifyIdToken.
 * Administrators pass automatically, matching the rest of the codebase.
 *
 * Deliberately NOT applied to shared surfaces (chat, notebooks, podcasts, connections,
 * discussions, search, payments). Teachers are learners too; gating shared features behind a
 * product role would contradict the ecosystem model this platform is built on.
 */
const router = Router();

router.use(requireAuth);
router.use(requireProductRole('teacher'));

// Reading is open to any teacher (and to an admin inspecting the surface).
router.get('/profile', teacherProfileController.get);

/**
 * Writing additionally requires the `editTeacherProfile` capability, which a suspended teacher
 * does not hold — implementing "suspended is read-only" from the §4 capability table. This is
 * the first place capability enforcement actually bites, and it is enforced server-side rather
 * than by hiding a button.
 *
 * Note this narrows the route for administrators: unlike `requireProductRole`, capability gates
 * are not bypassed by an admin claim (see middlewares/capability.ts for the reasoning). An admin
 * has no legitimate reason to author a teacher profile through the teacher-facing endpoint — if
 * that is ever needed it belongs on the admin surface, with an audit entry, exactly like the
 * verification transitions added in Phase 3A. Nothing in the frontend calls this as an admin.
 */
router.post('/profile', requireCapability('editTeacherProfile'), teacherProfileController.upsert);

export default router;
