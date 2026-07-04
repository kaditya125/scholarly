import { PlannerRepository } from '../repositories/planner.repository';
import { PlannerTask } from '../types';

export class PlannerService {
  private repository = new PlannerRepository();

  async getTasksGroupedByStatus(userId: string): Promise<Record<string, PlannerTask[]>> {
    const tasks = await this.repository.findAllByUser(userId);
    
    // Group tasks by status for the Kanban board
    const grouped = {
      "To do": [] as PlannerTask[],
      "In Progress": [] as PlannerTask[],
      "Under Review": [] as PlannerTask[],
      "Completed": [] as PlannerTask[]
    };

    tasks.forEach(task => {
      if (grouped[task.status]) {
        grouped[task.status].push(task);
      }
    });

    return grouped;
  }
}
