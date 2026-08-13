import { Request, Response } from 'express';
import { classResourceService } from '../services/classResource.service';
import { logger } from '../utils/logger';

/**
 * Class resources — teacher-attached notebooks.
 *
 * Identity always comes from `req.user.uid`. No handler accepts an owner id, so there is no
 * request shape that attaches or removes a resource on another teacher's behalf.
 */

function sendError(res: Response, err: any, context: Record<string, unknown>) {
  switch (err?.code) {
    case 'NOT_FOUND':
      return res.status(404).json({ error: err.message || 'Not found.' });
    case 'FORBIDDEN':
      return res.status(403).json({ error: err.message || 'Not permitted.' });
    case 'INVALID_INPUT':
      return res.status(400).json({ error: err.message });
    case 'NOTEBOOK_NOT_FOUND':
    case 'NOTEBOOK_NOT_OWNED':
      return res.status(409).json({ error: err.message });
    default:
      logger.error('[ClassResource] Request failed', { ...context, error: err?.message });
      return res.status(500).json({ error: 'Something went wrong with that resource.' });
  }
}

export class ClassResourceController {
  /** POST /api/classes/:id/resources  body: { notebookId, title?, source? } */
  attach = async (req: Request, res: Response) => {
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({ error: 'Unauthorized' });

    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).json({ error: 'Expected a resource object.' });
    }

    try {
      const resource = await classResourceService.attach(req.params.id, uid, body);
      return res.status(201).json(resource);
    } catch (err: any) {
      return sendError(res, err, { uid, op: 'attach', classId: req.params.id });
    }
  };

  /**
   * GET /api/classes/:id/resources
   *
   * Visibility (owner or ACTIVE member) is enforced inside the service, matching every other
   * service in this codebase — the controller stays a thin translation from HTTP to the call.
   */
  list = async (req: Request, res: Response) => {
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({ error: 'Unauthorized' });

    try {
      const resources = await classResourceService.listForClass(req.params.id, uid);
      return res.status(200).json({ resources });
    } catch (err: any) {
      return sendError(res, err, { uid, op: 'list', classId: req.params.id });
    }
  };

  /** DELETE /api/classes/:id/resources/:resourceId */
  detach = async (req: Request, res: Response) => {
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({ error: 'Unauthorized' });

    try {
      await classResourceService.detach(req.params.id, req.params.resourceId, uid);
      return res.status(204).send();
    } catch (err: any) {
      return sendError(res, err, { uid, op: 'detach', classId: req.params.id, resourceId: req.params.resourceId });
    }
  };
}

export const classResourceController = new ClassResourceController();
