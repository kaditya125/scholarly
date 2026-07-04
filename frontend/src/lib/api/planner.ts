import { api } from './client';

export interface PlannerTask {
  id: string;
  title: string;
  subject: string;
  status: 'To do' | 'In Progress' | 'Under Review' | 'Completed';
  dueDate: string;
}

export const plannerApi = {
  async getTasks(): Promise<PlannerTask[]> {
    const response = await api.get('/planner');
    return response.data;
  },
  
  async addTask(task: Omit<PlannerTask, 'id'>): Promise<PlannerTask> {
    const response = await api.post('/planner', task);
    return response.data;
  },
  
  async updateTaskStatus(id: string, status: string): Promise<PlannerTask> {
    const response = await api.patch(`/planner/${id}`, { status });
    return response.data;
  }
};
