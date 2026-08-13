import { Request, Response } from 'express';
import { classService } from '../services/class.service';
import { CLASS_TRANSITIONS, isClassStatus } from '../types/class';
import { logger } from '../utils/logger';

/**
 * ClassController — classes owned by the authenticated teacher.
 *
 * Identity always comes from `req.user.uid` (derived by requireAuth from a verified ID token).
 * No handler accepts an owner id, so there is no request shape that creates or edits a class on
 * another teacher's behalf. Ownership itself is checked in the service, so it holds for any
 * future caller rather than depending on this layer remembering.
 */

/** Maps the service's coded errors onto HTTP. Anything unrecognised is a 500, never a 200. */
function sendError(res: Response, err: any, context: Record<string, unknown>) {
  switch (err?.code) {
    case 'NOT_FOUND':
      return res.status(404).json({ error: 'Class not found.' });
    case 'FORBIDDEN':
      return res.status(403).json({ error: 'This class belongs to another teacher.' });
    case 'READ_ONLY':
      return res.status(409).json({ error: 'Archived classes cannot be edited.' });
    case 'PRICING_LOCKED':
      return res.status(409).json({
        error: 'Pricing can only be changed while the class is a draft.',
      });
    case 'INVALID_TRANSITION':
      return res.status(409).json({
        error: `Cannot move a class from "${err.from}" to "${err.to}".`,
        from: err.from,
        attempted: err.to,
        allowedFromCurrent: CLASS_TRANSITIONS[err.from as keyof typeof CLASS_TRANSITIONS] ?? [],
      });
    case 'NOT_PUBLISHABLE':
      // 422 rather than 400: the request was well formed, the resource is not ready.
      return res.status(422).json({ error: 'This class is not ready to publish.', problems: err.problems ?? [] });
    default:
      logger.error('[Class] Request failed', { ...context, error: err?.message });
      return res.status(500).json({ error: 'Something went wrong handling that class.' });
  }
}

function requireBodyObject(req: Request, res: Response): boolean {
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    res.status(400).json({ error: 'Expected a class object.' });
    return false;
  }
  return true;
}

export class ClassController {
  /** POST /api/classes — always creates a draft. */
  create = async (req: Request, res: Response) => {
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({ error: 'Unauthorized' });
    if (!requireBodyObject(req, res)) return;

    // Surfaced rather than silently dropped — a client sending a server-owned field is worth a
    // log line even though sanitize() already makes it inert.
    for (const forbidden of ['ownerUid', 'status', 'counts', 'id', 'publishedAt']) {
      if (forbidden in req.body) {
        logger.warn('[Class] Ignored server-owned field in request body', { uid, field: forbidden });
      }
    }

    try {
      const record = await classService.create(uid, req.body);
      return res.status(201).json(record);
    } catch (err: any) {
      return sendError(res, err, { uid, op: 'create' });
    }
  };

  /** GET /api/classes/mine — the caller's own classes, any status. */
  listMine = async (req: Request, res: Response) => {
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({ error: 'Unauthorized' });

    try {
      const classes = await classService.listMine(uid);
      return res.status(200).json({ classes });
    } catch (err: any) {
      return sendError(res, err, { uid, op: 'listMine' });
    }
  };

  /**
   * GET /api/classes/:id
   *
   * Open to any authenticated caller, not just teachers — a student must be able to look at a
   * published class. The service decides what is visible; a draft belonging to someone else
   * returns 404 rather than 403, so the endpoint cannot be used to probe which ids exist.
   */
  getOne = async (req: Request, res: Response) => {
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({ error: 'Unauthorized' });

    try {
      const record = await classService.getForViewer(req.params.id, uid);
      return res.status(200).json(record);
    } catch (err: any) {
      return sendError(res, err, { uid, op: 'getOne', classId: req.params.id });
    }
  };

  /** PATCH /api/classes/:id — partial update, owner only. Cannot change status. */
  update = async (req: Request, res: Response) => {
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({ error: 'Unauthorized' });
    if (!requireBodyObject(req, res)) return;

    if ('status' in req.body) {
      return res.status(400).json({
        error: 'Status is changed through POST /api/classes/:id/status, not this endpoint.',
      });
    }

    try {
      const record = await classService.update(req.params.id, uid, req.body);
      return res.status(200).json(record);
    } catch (err: any) {
      return sendError(res, err, { uid, op: 'update', classId: req.params.id });
    }
  };

  /** POST /api/classes/:id/status  body: { status } */
  setStatus = async (req: Request, res: Response) => {
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({ error: 'Unauthorized' });

    const { status } = req.body ?? {};
    if (!isClassStatus(status)) {
      return res.status(400).json({ error: 'Invalid status.', allowed: Object.keys(CLASS_TRANSITIONS) });
    }

    try {
      const record = await classService.transition(req.params.id, uid, status);
      return res.status(200).json(record);
    } catch (err: any) {
      return sendError(res, err, { uid, op: 'setStatus', classId: req.params.id });
    }
  };
}

export const classController = new ClassController();
