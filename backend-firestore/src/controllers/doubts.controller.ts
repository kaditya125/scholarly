import { Request, Response, NextFunction } from 'express';
import { doubtsService } from '../services/doubts.service';
import { DoubtStatus } from '../types/doubt.types';

/**
 * DoubtsController — CRUD for the student's saved scanned questions. The userId always comes from
 * the authenticated token (req.user.uid); a client-supplied userId is never trusted, so a user can
 * only read/write their own doubts.
 */
export class DoubtsController {
  public create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.uid;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const b = req.body || {};
      if (!(b.questionText || b.answer)) {
        return res.status(400).json({ error: 'A doubt needs at least a questionText or an answer.' });
      }
      const doubt = await doubtsService.create(userId, {
        notebookId: b.notebookId, sourceId: b.sourceId, bookTitle: b.bookTitle, chapterTitle: b.chapterTitle,
        subject: b.subject, page: b.page, questionText: b.questionText, action: b.action, answer: b.answer,
        imageDataUrl: b.imageDataUrl, thumbDataUrl: b.thumbDataUrl, notes: b.notes, tags: b.tags,
      });
      res.status(201).json(doubt);
    } catch (error) {
      next(error);
    }
  };

  public list = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.uid;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const status = req.query.status as DoubtStatus | undefined;
      const subject = req.query.subject as string | undefined;
      const items = await doubtsService.list(userId, {
        status: status === 'open' || status === 'reviewed' ? status : undefined,
        subject: subject || undefined,
      });
      res.json(items);
    } catch (error) {
      next(error);
    }
  };

  public get = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.uid;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const doubt = await doubtsService.get(userId, req.params.id);
      if (!doubt) return res.status(404).json({ error: 'Doubt not found' });
      res.json(doubt);
    } catch (error) {
      next(error);
    }
  };

  public update = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.uid;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const { notes, status, tags } = req.body || {};
      const updated = await doubtsService.update(userId, req.params.id, { notes, status, tags });
      if (!updated) return res.status(404).json({ error: 'Doubt not found' });
      res.json(updated);
    } catch (error) {
      next(error);
    }
  };

  public remove = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.uid;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const ok = await doubtsService.remove(userId, req.params.id);
      if (!ok) return res.status(404).json({ error: 'Doubt not found' });
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  };
}

export const doubtsController = new DoubtsController();
