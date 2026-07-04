import { Request, Response, NextFunction } from 'express';
import { LeaderboardService } from '../services/leaderboard.service';

export class LeaderboardController {
  private service = new LeaderboardService();

  public getLeaderboard = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
      const leaderboard = await this.service.getLeaderboard(limit);
      res.json(leaderboard);
    } catch (error) {
      next(error);
    }
  };
}
