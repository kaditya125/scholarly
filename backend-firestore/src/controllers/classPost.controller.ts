import { Request, Response } from 'express';
import { classPostService } from '../services/classPost.service';
import { loadCapabilities } from '../middlewares/capability';
import { logger } from '../utils/logger';

/**
 * Class posts — announcements and discussion.
 *
 * This route can't sit behind `requireCapability('createClass')` in the router the way
 * `classResourceController.attach` and `classAssignmentController.create` do: it also carries
 * student-authored discussion posts, and a student holds no capabilities at all. Instead,
 * `create` loads the caller's capability set itself (`loadCapabilities` is written for exactly
 * this — see capability.ts) and enforces `createClass` only for the announcement sub-case. A
 * discussion post needs no capability, only ownership or ACTIVE membership, which the service
 * checks.
 */

function sendError(res: Response, err: any, context: Record<string, unknown>) {
  switch (err?.code) {
    case 'NOT_FOUND':
      return res.status(404).json({ error: err.message || 'Not found.' });
    case 'FORBIDDEN':
      return res.status(403).json({ error: err.message || 'Not permitted.' });
    case 'INVALID_INPUT':
      return res.status(400).json({ error: err.message });
    default:
      logger.error('[ClassPost] Request failed', { ...context, error: err?.message });
      return res.status(500).json({ error: 'Something went wrong with that post.' });
  }
}

export class ClassPostController {
  /** POST /api/classes/:id/posts  body: { kind, title?, body, parentId? } */
  create = async (req: Request, res: Response) => {
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({ error: 'Unauthorized' });

    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).json({ error: 'Expected a post object.' });
    }

    if (body.kind === 'announcement') {
      const capabilities = await loadCapabilities(req);
      if (!capabilities.createClass) {
        return res.status(403).json({
          error: 'Forbidden: this action requires the "createClass" capability.',
          capability: 'createClass',
        });
      }
    }

    try {
      const post = await classPostService.create(req.params.id, uid, body);
      return res.status(201).json(post);
    } catch (err: any) {
      return sendError(res, err, { uid, op: 'create', classId: req.params.id });
    }
  };

  /** GET /api/classes/:id/posts */
  list = async (req: Request, res: Response) => {
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({ error: 'Unauthorized' });

    try {
      const posts = await classPostService.listForClass(req.params.id, uid);
      return res.status(200).json({ posts });
    } catch (err: any) {
      return sendError(res, err, { uid, op: 'list', classId: req.params.id });
    }
  };
}

export const classPostController = new ClassPostController();
