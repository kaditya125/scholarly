import { IAIProvider } from '../interfaces/IAIProvider';
import { container, TOKENS } from '../di/container';
import { StudyGoal, ExamBlueprint, DailyTask, Timetable } from '../../types';

export class PlannerAgent {
  private get aiProvider(): IAIProvider {
    return container.resolve<IAIProvider>(TOKENS.AIProvider);
  }

  async generatePlan(goal: StudyGoal, blueprint: ExamBlueprint | null): Promise<Record<string, DailyTask[]>> {
    const prompt = `You are an expert AI Study Planner. Generate a 7-day study schedule based on the following goal and syllabus blueprint.
    
Goal: ${JSON.stringify(goal)}
Blueprint: ${blueprint ? JSON.stringify(blueprint) : 'None provided'}

Planning Mode: ${goal.planningMode}
(Note: 'Crash Course' means an intense, packed schedule. 'Balanced' means steady pace, etc. Adapt task priority and frequency accordingly.)

Output MUST be valid JSON, strictly matching the type Record<string, DailyTask[]>. The keys must be ISO date strings (e.g. YYYY-MM-DD) starting from today for 7 days.
DailyTask structure: { id, title, type: 'read'|'quiz'|'revision'|'practice_test'|'break', chapter, topic, blueprintNodeId (optional), estimatedMinutes, completed: false, priority: 'high'|'medium'|'low' }.
Do not include markdown blocks, just raw JSON.`;

    const response = await this.aiProvider.generateResponse([{ role: 'user', content: prompt }]);
    try {
      const parsed = JSON.parse(response.reply.replace(/```json/g, '').replace(/```/g, '').trim());
      return parsed as Record<string, DailyTask[]>;
    } catch (error) {
      console.error("Failed to parse AI plan output:", error);
      return {};
    }
  }

  async rebalancePlan(timetable: Timetable, missedTasks: DailyTask[]): Promise<Record<string, DailyTask[]>> {
    const prompt = `You are an expert AI Study Planner. A user has missed some tasks in their schedule, and we need to rebalance the remaining days.

Current Timetable (Remaining Days): ${JSON.stringify(timetable.schedule)}
Missed Tasks to Reintegrate: ${JSON.stringify(missedTasks)}

Please merge the missed tasks into the upcoming days logically without overloading the user. Ensure no single day exceeds reasonable study hours. 
Return the updated schedule as a JSON object of type Record<string, DailyTask[]>. 
Do not include markdown blocks, just raw JSON.`;

    const response = await this.aiProvider.generateResponse([{ role: 'user', content: prompt }]);
    try {
      const parsed = JSON.parse(response.reply.replace(/```json/g, '').replace(/```/g, '').trim());
      return parsed as Record<string, DailyTask[]>;
    } catch (error) {
      console.error("Failed to parse AI rebalance output:", error);
      return timetable.schedule;
    }
  }

  async recoverMissedTasks(tasks: DailyTask[]): Promise<DailyTask[]> {
     const prompt = `Analyze these missed tasks and determine a recovery strategy. Consolidate them or break them down if necessary.
Missed Tasks: ${JSON.stringify(tasks)}

Return an array of DailyTask[] in JSON format representing the optimized recovery tasks. Set priority to 'high' for critical topics.
Do not include markdown blocks, just raw JSON.`;

    const response = await this.aiProvider.generateResponse([{ role: 'user', content: prompt }]);
    try {
      const parsed = JSON.parse(response.reply.replace(/```json/g, '').replace(/```/g, '').trim());
      return parsed as DailyTask[];
    } catch (error) {
      console.error("Failed to parse AI recovery output:", error);
      return tasks;
    }
  }
}
