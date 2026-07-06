import { Request, Response, NextFunction } from 'express';
import { UserStatsService } from '../services/userStats.service';

export class UserStatsController {
  private service = new UserStatsService();

  public getUserStats = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req.params;
      const stats = await this.service.getUserStats(userId);
      
      if (!stats) {
        return res.status(404).json({ error: "User stats not found" });
      }
      res.json(stats);
    } catch (error) {
      next(error);
    }
  };

  public awardXP = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req.params;
      const { actionType } = req.body; // e.g. 'LOGIN', 'STUDY_30'
      await this.service.awardXP(userId, actionType);
      const updatedStats = await this.service.getUserStats(userId);
      res.json(updatedStats);
    } catch (error) {
      next(error);
    }
  };
}
