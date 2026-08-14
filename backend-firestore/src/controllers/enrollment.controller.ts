import { Request, Response } from 'express';
import { enrollmentService } from '../services/enrollment.service';
import { paymentsService } from '../services/payments.service';
import { ENROLLMENT_TRANSITIONS, isEnrollmentState } from '../types/enrollment';
import { logger } from '../utils/logger';

/**
 * Invitations and enrolment.
 *
 * The actor is always `req.user.uid`. No handler accepts an actor identity, and the service —
 * not this layer — decides whether that actor is the class's teacher or the enrolment's student,
 * by comparing against stored ownership. That keeps the permission table in one place instead of
 * duplicated across route handlers.
 */

function sendError(res: Response, err: any, context: Record<string, unknown>) {
  switch (err?.code) {
    case 'NOT_FOUND':
      return res.status(404).json({ error: err.message || 'Not found.' });
    case 'FORBIDDEN':
      return res.status(403).json({ error: err.message || 'Not permitted.' });
    case 'CLASS_NOT_OPEN':
    case 'INVITATION_UNUSABLE':
    case 'ALREADY_ENROLLED':
    case 'SELF_ENROL':
    case 'NOT_PURCHASABLE':
      return res.status(409).json({ error: err.message });
    case 'CLASS_FULL':
      return res.status(409).json({ error: err.message, reason: 'full' });
    case 'PAYMENT_REQUIRED':
      // 402 is the honest code here: the request is valid and refused purely because payment
      // cannot be taken yet.
      return res.status(402).json({ error: err.message, reason: 'payment_unavailable' });
    case 'INVALID_TRANSITION':
      return res.status(409).json({
        error: err.message,
        from: err.from,
        attempted: err.to,
        allowedFromCurrent: ENROLLMENT_TRANSITIONS[err.from as keyof typeof ENROLLMENT_TRANSITIONS] ?? [],
      });
    default:
      logger.error('[Enrollment] Request failed', { ...context, error: err?.message });
      return res.status(500).json({ error: 'Something went wrong with that enrolment.' });
  }
}

export class EnrollmentController {
  /** POST /api/classes/:id/invitations */
  createInvitation = async (req: Request, res: Response) => {
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({ error: 'Unauthorized' });

    const { expiresAt, maxUses } = req.body ?? {};
    try {
      const invitation = await enrollmentService.createInvitation(req.params.id, uid, {
        expiresAt: typeof expiresAt === 'string' ? expiresAt : null,
        maxUses: typeof maxUses === 'number' ? maxUses : null,
      });
      return res.status(201).json(invitation);
    } catch (err: any) {
      return sendError(res, err, { uid, op: 'createInvitation', classId: req.params.id });
    }
  };

  /**
   * GET /api/invitations/:code
   *
   * Authenticated but otherwise open — anyone holding the code may see the class preview. It
   * returns nothing about who else is enrolled, because a code is shareable and everything here
   * should be assumed public to whoever has it.
   */
  previewInvitation = async (req: Request, res: Response) => {
    if (!req.user?.uid) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const preview = await enrollmentService.previewInvitation(req.params.code);
      return res.status(200).json(preview);
    } catch (err: any) {
      return sendError(res, err, { op: 'previewInvitation', code: req.params.code });
    }
  };

  /** POST /api/invitations/:code/accept — the student's own act. */
  acceptInvitation = async (req: Request, res: Response) => {
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const edge = await enrollmentService.acceptInvitation(req.params.code, uid);
      return res.status(200).json(edge);
    } catch (err: any) {
      return sendError(res, err, { uid, op: 'acceptInvitation', code: req.params.code });
    }
  };

  /** POST /api/classes/:id/requests — the student asks to join. */
  requestToJoin = async (req: Request, res: Response) => {
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const edge = await enrollmentService.requestToJoin(req.params.id, uid);
      return res.status(200).json(edge);
    } catch (err: any) {
      return sendError(res, err, { uid, op: 'requestToJoin', classId: req.params.id });
    }
  };

  /**
   * POST /api/enrollments/:classId/state   body: { state, studentUid? }
   *
   * One endpoint for every move. Omitting `studentUid` means "acting on my own enrolment";
   * supplying it means "acting on that student's enrolment", which only succeeds if the caller
   * owns the class. The service enforces which role may make which move.
   */
  setState = async (req: Request, res: Response) => {
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({ error: 'Unauthorized' });

    const { state, studentUid } = req.body ?? {};
    if (!isEnrollmentState(state)) {
      return res.status(400).json({ error: 'Invalid state.', allowed: Object.keys(ENROLLMENT_TRANSITIONS) });
    }
    if (studentUid !== undefined && typeof studentUid !== 'string') {
      return res.status(400).json({ error: 'studentUid must be a string when provided.' });
    }

    try {
      const edge = await enrollmentService.transition({
        classId: req.params.classId,
        studentUid: studentUid || uid,
        actorUid: uid,
        to: state,
      });
      return res.status(200).json(edge);
    } catch (err: any) {
      return sendError(res, err, { uid, op: 'setState', classId: req.params.classId });
    }
  };

  /** GET /api/classes/:id/enrollments — roster, owner only. Optional ?state= filter. */
  listRoster = async (req: Request, res: Response) => {
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({ error: 'Unauthorized' });

    const state = req.query.state;
    if (state !== undefined && !isEnrollmentState(state)) {
      return res.status(400).json({ error: 'Invalid state filter.' });
    }

    try {
      const enrollments = await enrollmentService.listRoster(req.params.id, uid, state as any);
      return res.status(200).json({ enrollments });
    } catch (err: any) {
      return sendError(res, err, { uid, op: 'listRoster', classId: req.params.id });
    }
  };

  /**
   * POST /api/classes/:id/order — the student's own act, third path into a class alongside
   * invitation-accept and request-to-join. Unlike those two, this never activates anything
   * itself: it only opens a Razorpay order. The edge only reaches ACTIVE once the signed
   * webhook (or client verify callback) confirms the payment actually cleared — see
   * `enrollmentService.activateFromPurchase`, called from `paymentsService.markClassOrderPaid`.
   */
  createOrder = async (req: Request, res: Response) => {
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({ error: 'Unauthorized' });
    if (!paymentsService.isEnabled()) {
      return res.status(503).json({ error: 'Payments are not configured on this server.' });
    }
    try {
      const order = await paymentsService.createClassOrder(uid, req.params.id);
      return res.status(201).json(order);
    } catch (err: any) {
      return sendError(res, err, { uid, op: 'createOrder', classId: req.params.id });
    }
  };

  /** GET /api/enrollments/mine — self-scoped. */
  listMine = async (req: Request, res: Response) => {
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const enrollments = await enrollmentService.listMine(uid);
      return res.status(200).json({ enrollments });
    } catch (err: any) {
      return sendError(res, err, { uid, op: 'listMine' });
    }
  };
}

export const enrollmentController = new EnrollmentController();
