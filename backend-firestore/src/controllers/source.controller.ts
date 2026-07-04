import { Request, Response } from 'express';
import { sourceService } from '../services/source.service';

export class SourceController {
  async uploadSource(req: Request, res: Response) {
    try {
      const userId = req.user?.uid;
      const { id: notebookId } = req.params;
      const file = req.file;

      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      if (!file) return res.status(400).json({ error: 'No file uploaded' });

      const source = await sourceService.processUpload(notebookId, userId, file);
      res.status(201).json(source);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  async deleteSource(req: Request, res: Response) {
    try {
      const userId = req.user?.uid;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const { id: notebookId, sourceId } = req.params;
      await sourceService.deleteSource(notebookId, sourceId, userId);
      res.json({ success: true });
    } catch (error: any) {
      if (error.message === 'Forbidden') return res.status(403).json({ error: 'Forbidden' });
      res.status(500).json({ error: error.message });
    }
  }
}

export const sourceController = new SourceController();
