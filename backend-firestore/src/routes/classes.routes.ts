import { Router } from 'express';
import { classController } from '../controllers/class.controller';
import { enrollmentController } from '../controllers/enrollment.controller';
import { classResourceController } from '../controllers/classResource.controller';
import { classAssignmentController } from '../controllers/classAssignment.controller';
import { classPostController } from '../controllers/classPost.controller';
import { classSessionController } from '../controllers/classSession.controller';
import { requireAuth, requireProductRole } from '../middlewares/auth';
import { requireCapability } from '../middlewares/capability';

/**
 * /api/classes/* — classes (3D), the class-scoped half of enrolment (3E), class resources
 * (3F), class assignments (3G), and announcements/discussion (3H).
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
 *   5. `GET /:id/posts` AND `POST /:id/posts` both sit above the gate — unlike resources and
 *      assignments, POSTING here is not teacher-only: a discussion reply can come from an ACTIVE
 *      student. `classPostController.create` enforces the one sub-case that IS teacher-only
 *      (`kind: 'announcement'`) itself, via `loadCapabilities`, since route-level
 *      `requireCapability` would also block every legitimate student discussion post on the same
 *      route.
 *   6. `POST /:id/order` is the SAME shape as rule 2: a student opening checkout on a paid
 *      class, same as `POST /:id/requests`. It sits directly below that route, above the gate.
 *   7. `GET /:id/sessions` and `GET /:id/sessions/:sessionId/join` are the SAME shape as rule
 *      3/4: an ACTIVE student must be able to see session history and fetch their OWN join
 *      code. Starting (`POST .../sessions`) and ending a session are teacher-only and stay
 *      below the gate.
 */
const router = Router();

router.use(requireAuth);

// ── Literal paths, and routes open to any authenticated account ──
router.get('/mine', requireProductRole('teacher'), classController.listMine);

/** A student asks to join a discoverable class. Grants nothing until the teacher accepts. */
router.post('/:id/requests', enrollmentController.requestToJoin);

/** A student opens checkout on a paid class. See ordering rule 6. */
router.post('/:id/order', enrollmentController.createOrder);

/** Any authenticated account may read a class; the service decides what is visible. */
router.get('/:id', classController.getOne);

/** Owner or ACTIVE member; the service decides which. See ordering rule 3 above. */
router.get('/:id/resources', classResourceController.list);

/** Owner sees every state; an ACTIVE member sees published/closed only. See ordering rule 4. */
router.get('/:id/assignments', classAssignmentController.list);

/** A student starts (or resumes) their own attempt. See ordering rule 4. */
router.post('/:id/assignments/:assignmentId/start', classAssignmentController.start);

/** Owner or ACTIVE member; the service decides which. See ordering rule 5. */
router.get('/:id/posts', classPostController.list);

/** Owner (announcements) or owner/ACTIVE member (discussion); the controller/service decide. See ordering rule 5. */
router.post('/:id/posts', classPostController.create);

/** Owner or ACTIVE member; the service decides which. See ordering rule 7. */
router.get('/:id/sessions', classSessionController.list);

/** A student (or the teacher) fetches their OWN role's join code. See ordering rule 7. */
router.get('/:id/sessions/:sessionId/join', classSessionController.join);

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

/** Starting/ending a live session is a class-management action — same gate as the rest. */
router.post('/:id/sessions', requireCapability('createClass'), classSessionController.goLive);
router.post('/:id/sessions/:sessionId/end', requireCapability('createClass'), classSessionController.end);

export default router;
