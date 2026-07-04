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
}
