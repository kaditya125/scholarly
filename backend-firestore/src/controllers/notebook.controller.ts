import { Request, Response } from 'express';
import { notebookService } from '../services/notebook.service';

export class NotebookController {
  async getNotebooks(req: Request, res: Response) {
    try {
      const userId = req.user?.uid;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      
      const notebooks = await notebookService.getNotebooksByUser(userId);
      res.json(notebooks);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  async getNotebook(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const notebook = await notebookService.getNotebookById(id);
      if (!notebook) return res.status(404).json({ error: 'Not found' });
      res.json(notebook);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  async createNotebook(req: Request, res: Response) {
    try {
      const userId = req.user?.uid;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const { title, color } = req.body;
      if (!title) return res.status(400).json({ error: 'Title required' });

      const notebook = await notebookService.createNotebook(userId, title, color);
      res.status(201).json(notebook);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  async updateNotebook(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const updates = req.body;
      await notebookService.updateNotebook(id, updates);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  async deleteNotebook(req: Request, res: Response) {
    try {
      const { id } = req.params;
      await notebookService.deleteNotebook(id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  async getSources(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const sources = await notebookService.getSources(id);
      res.json(sources);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  async getTimeline(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const timeline = await notebookService.getTimeline(id);
      res.json(timeline);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  async getAssets(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { type } = req.query;
      const assets = await notebookService.getLearningAssets(id, type as string);
      res.json(assets);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
}

export const notebookController = new NotebookController();
