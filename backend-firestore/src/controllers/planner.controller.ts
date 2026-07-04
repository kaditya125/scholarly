import { Request, Response, NextFunction } from 'express';
import { PlannerService } from '../services/planner.service';

export class PlannerController {
  private service = new PlannerService();

  public getTasks = async (req: Request, res: Response, next: NextFunction) => {
    try {
      // In a real app, you would get userId from req.user (auth middleware)
      const userId = req.query.userId as string || 'default-user';
      const groupedTasks = await this.service.getTasksGroupedByStatus(userId);
      
      // Transform record into an array mapping as required by the frontend
      const kanbanData = Object.entries(groupedTasks).map(([status, tasks]) => {
         return {
            status,
            count: tasks.length.toString().padStart(2, '0'),
            // UI specific styling might be best handled in frontend, 
            // but we'll return raw data here
            tasks
         };
      });

      res.json(kanbanData);
    } catch (error) {
      next(error);
    }
  };
}
