import { Request, Response, NextFunction } from 'express';
import { savedMessageService } from '../services/savedMessage.service';

export class SavedMessageController {
  public list = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: 'Unauthorized' });

      const q = typeof req.query.q === 'string' ? req.query.q : undefined;
      const category = typeof req.query.category === 'string' ? req.query.category : undefined;
      const before = req.query.before ? Number(req.query.before) : undefined;
      const limit = req.query.limit ? Number(req.query.limit) : undefined;

      const items = await savedMessageService.listSavedMessages(uid, {
        q,
        category,
        before: Number.isFinite(before) ? before : undefined,
        limit: Number.isFinite(limit) ? limit : undefined,
      });

      res.json(items);
    } catch (error) {
      next(error);
    }
  };

  public getIds = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: 'Unauthorized' });

      const ids = await savedMessageService.getSavedMessageIds(uid);
      res.json(ids);
    } catch (error) {
      next(error);
    }
  };

  public save = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: 'Unauthorized' });

      const saved = await savedMessageService.saveMessage(uid, req.body);
      res.status(201).json(saved);
    } catch (error) {
      next(error);
    }
  };

  public remove = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: 'Unauthorized' });

      const removed = await savedMessageService.removeSavedMessage(uid, req.params.id);
      res.json({ success: removed });
    } catch (error) {
      next(error);
    }
  };
}

export const savedMessageController = new SavedMessageController();
