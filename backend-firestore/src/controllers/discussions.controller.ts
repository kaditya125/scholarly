import { Request, Response, NextFunction } from 'express';
import { DiscussionsService } from '../services/discussions.service';

export class DiscussionsController {
  private service = new DiscussionsService();

  public getDiscussions = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const roomId = req.query.roomId as string | undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;

      const discussions = await this.service.getDiscussions(roomId, limit);
      res.json(discussions);
    } catch (error) {
      next(error);
    }
  };

  public createDiscussion = async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Identity comes from the verified Firebase token, not a client-supplied header.
      const participantId = req.user?.uid;
      if (!participantId) return res.status(401).json({ error: 'Unauthorized' });
      const discussion = await this.service.createDiscussion({
        ...req.body,
        participantId
      });
      res.status(201).json(discussion);
    } catch (error: any) {
      if (error.message === "Content violates community guidelines.") {
        return res.status(400).json({ error: error.message });
      }
      next(error);
    }
  };
}
