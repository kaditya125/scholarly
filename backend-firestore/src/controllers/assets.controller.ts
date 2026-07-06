import { Request, Response } from 'express';
import { AssetsService } from '../services/assets.service';
import { podcastService } from '../services/podcast.service';

export class AssetsController {
  private assetsService = new AssetsService();

  updateAsset = async (req: Request, res: Response) => {
    try {
      const { notebookId, assetId } = req.params;
      const updates = req.body;
      await this.assetsService.updateAsset(notebookId, assetId, updates);
      res.status(200).json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  };

  deleteAsset = async (req: Request, res: Response) => {
    try {
      const { notebookId, assetId } = req.params;
      await this.assetsService.deleteAsset(notebookId, assetId);
      res.status(200).json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  };

  duplicateAsset = async (req: Request, res: Response) => {
    try {
      const { notebookId, assetId } = req.params;
      const userId = req.user?.uid;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const newAsset = await this.assetsService.duplicateAsset(notebookId, assetId, userId);
      res.status(201).json(newAsset);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  };

  regenerateAsset = async (req: Request, res: Response) => {
    try {
      const { notebookId, assetId } = req.params;
      const { instruction } = req.body;
      const regeneratedAsset = await this.assetsService.regenerateAsset(notebookId, assetId, instruction);
      res.status(200).json(regeneratedAsset);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  };

  generatePodcastAudio = async (req: Request, res: Response) => {
    try {
      const { notebookId, assetId } = req.params;
      const userId = req.user?.uid;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      
      // We don't await this so it runs in the background
      podcastService.generateAudio(notebookId, assetId, userId).catch(err => {
        console.error('Background podcast generation failed:', err);
      });

      res.status(202).json({ success: true, message: 'Audio generation started in the background.' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  };
}
