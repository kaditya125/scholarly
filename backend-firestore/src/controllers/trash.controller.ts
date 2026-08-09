import { Request, Response, NextFunction } from 'express';
import { TrashService } from '../services/trash.service';

export class TrashController {
  private service = new TrashService();

  public list = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.uid;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const items = await this.service.list(userId);
      res.json({ items });
    } catch (error) {
      console.error('Trash List Error:', error);
      next(error);
    }
  };

  public restore = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.uid;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const { type, id } = req.body || {};
      if (!type || !id) {
        return res.status(400).json({ error: 'Missing required fields: type, id' });
      }

      const ok = await this.service.restore(userId, type, id);
      if (!ok) {
        return res.status(404).json({ error: 'Item not found or you do not have permission to restore it' });
      }
      res.json({ message: 'Item restored successfully' });
    } catch (error) {
      console.error('Trash Restore Error:', error);
      next(error);
    }
  };

  public purge = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.uid;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const { type, id } = req.params;
      if (!type || !id) {
        return res.status(400).json({ error: 'Missing required parameters: type, id' });
      }

      const ok = await this.service.purge(userId, type, id);
      if (!ok) {
        return res.status(404).json({ error: 'Item not found or you do not have permission to delete it' });
      }
      res.json({ message: 'Item permanently deleted' });
    } catch (error) {
      console.error('Trash Purge Error:', error);
      next(error);
    }
  };

  public empty = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.uid;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const count = await this.service.empty(userId);
      res.json({ message: 'Trash emptied', count });
    } catch (error) {
      console.error('Trash Empty Error:', error);
      next(error);
    }
  };
}
