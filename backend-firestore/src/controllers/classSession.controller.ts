import { Request, Response } from 'express';
import { classSessionService } from '../services/classSession.service';
import { logger } from '../utils/logger';

/**
 * Class sessions (Phase 3M) — live video calls attached to a class.
 *
 * Identity always comes from `req.user.uid`. No handler accepts an owner id or a role, so there
 * is no request shape that starts a session on another teacher's behalf, or joins as the wrong
 * role — the service derives role from ownership, never from the request.
 */

function sendError(res: Response, err: any, context: Record<string, unknown>) {
  switch (err?.code) {
    case 'NOT_FOUND':
      return res.status(404).json({ error: err.message || 'Not found.' });
    case 'FORBIDDEN':
      return res.status(403).json({ error: err.message || 'Not permitted.' });
    case 'ALREADY_LIVE':
      return res.status(409).json({ error: err.message, sessionId: err.sessionId });
    case 'SESSION_ENDED':
      return res.status(410).json({ error: err.message });
    case 'VIDEO_NOT_CONFIGURED':
      return res.status(503).json({ error: err.message });
    default:
      logger.error('[ClassSession] Request failed', { ...context, error: err?.message });
      return res.status(500).json({ error: 'Something went wrong with that session.' });
  }
}

export class ClassSessionController {
  /** POST /api/classes/:id/sessions  body: { title? } */
  goLive = async (req: Request, res: Response) => {
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const session = await classSessionService.goLive(req.params.id, uid, req.body?.title);
      return res.status(201).json(session);
    } catch (err: any) {
      return sendError(res, err, { uid, op: 'goLive', classId: req.params.id });
    }
  };

  /** POST /api/classes/:id/sessions/:sessionId/end */
  end = async (req: Request, res: Response) => {
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const session = await classSessionService.endSession(req.params.id, req.params.sessionId, uid);
      return res.status(200).json(session);
    } catch (err: any) {
      return sendError(res, err, { uid, op: 'end', classId: req.params.id, sessionId: req.params.sessionId });
    }
  };

  /** GET /api/classes/:id/sessions/:sessionId/join — the caller's own role + code. */
  join = async (req: Request, res: Response) => {
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const info = await classSessionService.getJoinInfo(req.params.id, req.params.sessionId, uid);
      return res.status(200).json(info);
    } catch (err: any) {
      return sendError(res, err, { uid, op: 'join', classId: req.params.id, sessionId: req.params.sessionId });
    }
  };

  /** GET /api/classes/:id/sessions */
  list = async (req: Request, res: Response) => {
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const sessions = await classSessionService.listForClass(req.params.id, uid);
      return res.status(200).json({ sessions });
    } catch (err: any) {
      return sendError(res, err, { uid, op: 'list', classId: req.params.id });
    }
  };
}

export const classSessionController = new ClassSessionController();
