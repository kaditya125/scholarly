import { Request, Response } from 'express';
import { publishedAssetsService } from '../services/publishedAssets.service';

export class PublishedAssetsController {
  async publish(req: Request, res: Response) {
    try {
      const userId = req.user?.uid;
      const userName = (req.user as any)?.name || (req.user as any)?.displayName || req.user?.email || 'Anonymous';
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const { assetId, notebookId, subject, exam } = req.body;
      if (!assetId || !notebookId) {
        return res.status(400).json({ error: 'assetId and notebookId are required' });
      }

      const published = await publishedAssetsService.publishAsset(
        userId,
        userName,
        assetId,
        notebookId,
        subject,
        exam
      );
      res.status(201).json(published);
    } catch (error: any) {
      if (error.message.includes('Unauthorized')) return res.status(403).json({ error: error.message });
      if (error.message.includes('not found')) return res.status(404).json({ error: error.message });
      res.status(500).json({ error: error.message });
    }
  }

  async getAll(req: Request, res: Response) {
    try {
      const { type, subject, exam } = req.query;
      const filters: any = {};
      if (type) filters.type = type as string;
      if (subject) filters.subject = subject as string;
      if (exam) filters.exam = exam as string;

      const assets = await publishedAssetsService.getPublishedAssets(
        Object.keys(filters).length > 0 ? filters : undefined
      );
      res.json(assets);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  async rate(req: Request, res: Response) {
    try {
      const userId = req.user?.uid;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const { id } = req.params;
      const { rating } = req.body;

      if (rating === undefined || typeof rating !== 'number') {
        return res.status(400).json({ error: 'A numeric rating is required' });
      }

      await publishedAssetsService.rateAsset(id, rating);
      res.json({ success: true });
    } catch (error: any) {
      if (error.message.includes('Rating must be')) return res.status(400).json({ error: error.message });
      if (error.message.includes('not found')) return res.status(404).json({ error: error.message });
      res.status(500).json({ error: error.message });
    }
  }

  async download(req: Request, res: Response) {
    try {
      const userId = req.user?.uid;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const { id } = req.params;
      const asset = await publishedAssetsService.downloadAsset(id);
      res.json(asset);
    } catch (error: any) {
      if (error.message.includes('not found')) return res.status(404).json({ error: error.message });
      res.status(500).json({ error: error.message });
    }
  }
}

export const publishedAssetsController = new PublishedAssetsController();
