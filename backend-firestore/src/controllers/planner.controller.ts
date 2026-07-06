import { Request, Response, NextFunction } from 'express';
import { PlannerService } from '../services/planner.service';

export class PlannerController {
  private service = new PlannerService();

  public generateTimetable = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req.params;
      const goalData = req.body;
      const result = await this.service.createGoalAndGenerateTimetable(userId, goalData);
      res.json(result);
    } catch (error) {
      next(error);
    }
  };

  public getTimetable = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req.params;
      const timetable = await this.service.getTimetable(userId);
      if (!timetable) {
        return res.status(404).json({ error: 'Timetable not found' });
      }
      res.json(timetable);
    } catch (error) {
      next(error);
    }
  };

  public markTaskCompleted = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req.params;
      const { date, taskId } = req.body;
      const timetable = await this.service.markTaskCompleted(userId, date, taskId);
      res.json(timetable);
    } catch (error) {
      next(error);
    }
  };

  public adaptTimetable = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req.params;
      const timetable = await this.service.adaptRebalanceTimetable(userId);
      res.json(timetable);
    } catch (error) {
      next(error);
    }
  };
}
