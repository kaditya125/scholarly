import { Router } from 'express';
import { classController } from '../controllers/class.controller';
import { enrollmentController } from '../controllers/enrollment.controller';
import { classResourceController } from '../controllers/classResource.controller';
import { classAssignmentController } from '../controllers/classAssignment.controller';
import { requireAuth, requireProductRole } from '../middlewares/auth';
import { requireCapability } from '../middlewares/capability';

/**
 * /api/classes/* — classes (3D), the class-scoped half of enrolment (3E), class resources
 * (3F), and class assignments (3G).
 *
 * Guard layering, outermost first:
 *   requireAuth              verify the ID token
 *   requireProductRole       teaching surfaces only (admins pass, as elsewhere)
 *   requireCapability        …and the account must currently hold that capability
 *   ownership (in service)   …and must own the specific class
 *
 * Capabilities are required to CREATE or CHANGE, never to READ. A teacher who is pending review
 * or suspended keeps sight of their own classes and roster — losing a capability should not make
 * existing work vanish.
 *
 * ⚠ FOUR ORDERING RULES, all load-bearing:
 *   1. Literal paths (`/mine`) must precede parameterised ones (`/:id`), or Express looks up a
 *      class whose id is the string "mine".
 *   2. Student-initiated routes must precede `router.use(requireProductRole('teacher'))`.
 *      `POST /:id/requests` is a STUDENT asking to join; putting it below the role gate would
 *      make it permanently 403 for exactly the people it exists for.
 *   3. `GET /:id/resources` is the SAME shape — a student who is an ACTIVE class member must be
 *      able to read the resource list, so it sits above the role gate too. Visibility itself
 *      (owner or ACTIVE member, nothing else) is decided inside
 *      `classResourceService.listForClass`, exactly as `GET /:id` defers to
 *      `classService.getForViewer`. Attaching and detaching a resource ARE teacher-only
 *      mutations and stay below the gate, alongside the other class-management actions.
 *   4. `GET /:id/assignments` and `POST /:id/assignments/:assignmentId/start` are the SAME
 *      shape again — a student must be able to see published assignments and start their own
 *      attempt. Creating, publishing/closing, and reading aggregate RESULTS are teacher-only
 *      and stay below the gate.
 */
const router = Router();

router.use(requireAuth);

// ── Literal paths, and routes open to any authenticated account ──
router.get('/mine', requireProductRole('teacher'), classController.listMine);

/** A student asks to join a discoverable class. Grants nothing until the teacher accepts. */
router.post('/:id/requests', enrollmentController.requestToJoin);

/** Any authenticated account may read a class; the service decides what is visible. */
router.get('/:id', classController.getOne);

/** Owner or ACTIVE member; the service decides which. See ordering rule 3 above. */
router.get('/:id/resources', classResourceController.list);

/** Owner sees every state; an ACTIVE member sees published/closed only. See ordering rule 4. */
router.get('/:id/assignments', classAssignmentController.list);

/** A student starts (or resumes) their own attempt. See ordering rule 4. */
router.post('/:id/assignments/:assignmentId/start', classAssignmentController.start);

// ── Teacher-only from here down ──
router.use(requireProductRole('teacher'));

router.post('/', requireCapability('createClass'), classController.create);
router.patch('/:id', requireCapability('createClass'), classController.update);
router.post('/:id/status', requireCapability('createClass'), classController.setStatus);

/** Minting an invitation is a student-facing act, so it needs the student-facing capability. */
router.post('/:id/invitations', requireCapability('inviteStudents'), enrollmentController.createInvitation);

/** Reading your own roster needs ownership, not a capability — see the note above. */
router.get('/:id/enrollments', enrollmentController.listRoster);

/** Attaching/detaching a resource is a class-management action — same gate as PATCH/status. */
router.post('/:id/resources', requireCapability('createClass'), classResourceController.attach);
router.delete('/:id/resources/:resourceId', requireCapability('createClass'), classResourceController.detach);

/** Creating/publishing an assignment and reading its aggregate results are class-management. */
router.post('/:id/assignments', requireCapability('createClass'), classAssignmentController.create);
router.post('/:id/assignments/:assignmentId/status', requireCapability('createClass'), classAssignmentController.setStatus);
router.get('/:id/assignments/:assignmentId/results', requireCapability('createClass'), classAssignmentController.results);

export default router;
