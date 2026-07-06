import { Request, Response } from 'express';
import { adminAggregatesService } from '../services/admin-aggregates.service';
import { logger } from '../../utils/logger';

/**
 * Notebook Management — real platform-wide notebook listing plus admin operations:
 * view detail, archive/unarchive, rename, and (super-admin) delete.
 */
export class NotebooksController {
  getNotebooks = async (req: Request, res: Response) => {
    try {
      const limit = Math.min(parseInt(String(req.query.limit ?? '50'), 10) || 50, 200);
      res.json(await adminAggregatesService.getNotebooks(limit));
    } catch (error) {
      logger.error('admin.notebooks.getNotebooks failed', { error: (error as Error).message });
      res.status(500).json({ error: 'Failed to load notebooks' });
    }
  };

  getDetail = async (req: Request, res: Response) => {
    try {
      const detail = await adminAggregatesService.getNotebookDetail(req.params.id);
      if (!detail) return res.status(404).json({ error: 'Notebook not found' });
      res.json(detail);
    } catch (error) {
      logger.error('admin.notebooks.getDetail failed', { error: (error as Error).message });
      res.status(500).json({ error: 'Failed to load notebook detail' });
    }
  };

  updateNotebook = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { isArchived, title } = req.body ?? {};
      if (typeof isArchived === 'boolean') {
        return res.json(await adminAggregatesService.setNotebookArchived(id, isArchived));
      }
      if (typeof title === 'string' && title.trim()) {
        return res.json(await adminAggregatesService.renameNotebook(id, title.trim()));
      }
      return res.status(400).json({ error: 'Provide `isArchived` (boolean) or `title` (string).' });
    } catch (error) {
      logger.error('admin.notebooks.updateNotebook failed', { error: (error as Error).message });
      res.status(500).json({ error: 'Failed to update notebook' });
    }
  };

  deleteNotebook = async (req: Request, res: Response) => {
    try {
      res.json(await adminAggregatesService.deleteNotebook(req.params.id));
    } catch (error) {
      logger.error('admin.notebooks.deleteNotebook failed', { error: (error as Error).message });
      res.status(500).json({ error: 'Failed to delete notebook' });
    }
  };
}
