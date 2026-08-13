import { Request, Response } from 'express';
import { classAssignmentService } from '../services/classAssignment.service';
import { ASSIGNMENT_TRANSITIONS, isAssignmentStatus } from '../types/classAssignment';
import { logger } from '../utils/logger';

/**
 * Class assignments — teacher-set tests on the existing quiz engine.
 *
 * Identity always comes from `req.user.uid`. No handler accepts a teacher or student id, so
 * there is no request shape that creates, publishes or reads results for another teacher's
 * assignment, or starts an attempt as another student.
 */

function sendError(res: Response, err: any, context: Record<string, unknown>) {
  switch (err?.code) {
    case 'NOT_FOUND':
      return res.status(404).json({ error: err.message || 'Not found.' });
    case 'FORBIDDEN':
      return res.status(403).json({ error: err.message || 'Not permitted.' });
    case 'INVALID_INPUT':
      return res.status(400).json({ error: err.message });
    case 'NOT_OPEN':
      return res.status(409).json({ error: err.message });
    case 'GENERATION_FAILED':
      return res.status(502).json({ error: err.message });
    case 'INVALID_TRANSITION':
      return res.status(409).json({
        error: err.message, from: err.from, attempted: err.to,
        allowedFromCurrent: ASSIGNMENT_TRANSITIONS[err.from as keyof typeof ASSIGNMENT_TRANSITIONS] ?? [],
      });
    default:
      logger.error('[ClassAssignment] Request failed', { ...context, error: err?.message });
      return res.status(500).json({ error: 'Something went wrong with that assignment.' });
  }
}

export class ClassAssignmentController {
  /** POST /api/classes/:id/assignments */
  create = async (req: Request, res: Response) => {
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({ error: 'Unauthorized' });
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({ error: 'Expected an assignment object.' });
    }
    try {
      const record = await classAssignmentService.create(req.params.id, uid, req.body);
      return res.status(201).json(record);
    } catch (err: any) {
      return sendError(res, err, { uid, op: 'create', classId: req.params.id });
    }
  };

  /** GET /api/classes/:id/assignments — owner sees all states; a member sees published/closed. */
  list = async (req: Request, res: Response) => {
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const assignments = await classAssignmentService.listForClass(req.params.id, uid);
      return res.status(200).json({ assignments });
    } catch (err: any) {
      return sendError(res, err, { uid, op: 'list', classId: req.params.id });
    }
  };

  /** POST /api/classes/:id/assignments/:assignmentId/status  body: { status } */
  setStatus = async (req: Request, res: Response) => {
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({ error: 'Unauthorized' });
    const { status } = req.body ?? {};
    if (!isAssignmentStatus(status)) {
      return res.status(400).json({ error: 'Invalid status.', allowed: Object.keys(ASSIGNMENT_TRANSITIONS) });
    }
    try {
      const record = await classAssignmentService.setStatus(req.params.id, req.params.assignmentId, uid, status);
      return res.status(200).json(record);
    } catch (err: any) {
      return sendError(res, err, { uid, op: 'setStatus', classId: req.params.id, assignmentId: req.params.assignmentId });
    }
  };

  /** POST /api/classes/:id/assignments/:assignmentId/start — the student's own act. */
  start = async (req: Request, res: Response) => {
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const result = await classAssignmentService.startAttempt(req.params.id, req.params.assignmentId, uid);
      return res.status(200).json(result);
    } catch (err: any) {
      return sendError(res, err, { uid, op: 'start', classId: req.params.id, assignmentId: req.params.assignmentId });
    }
  };

  /** GET /api/classes/:id/assignments/:assignmentId/results — owner only. */
  results = async (req: Request, res: Response) => {
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const results = await classAssignmentService.getResults(req.params.id, req.params.assignmentId, uid);
      return res.status(200).json(results);
    } catch (err: any) {
      return sendError(res, err, { uid, op: 'results', classId: req.params.id, assignmentId: req.params.assignmentId });
    }
  };
}

export const classAssignmentController = new ClassAssignmentController();
