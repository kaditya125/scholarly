import { api } from './client';

/** Deterministic daily plan — Stage 4. Priorities and reasons are computed server-side. */
export type ActivityType = 'LEARN' | 'PRACTICE' | 'REVISE' | 'QUIZ' | 'TEST';

export interface PlanTask {
  id: string;
  syllabusNodeId: string;
  label: string;
  activity: ActivityType;
  estimatedMinutes: number;
  priority: 'high' | 'medium' | 'low';
  /** Why this task, in the student's terms. Never "the AI chose it". */
  reasons: string[];
  score: number;
  state: 'UNTOUCHED' | 'LEARNING' | 'WEAK' | 'STRONG' | 'MASTERED';
}

export interface DailyPlan {
  date: string;
  examId: string;
  examDate: string | null;
  daysUntilExam: number | null;
  plannedMinutes: number;
  budgetMinutes: number;
  tasks: PlanTask[];
  outlook: {
    addressable: number;
    untouched: number;
    weak: number;
    estimatedDaysToCover: number | null;
    achievableBeforeExam: boolean | null;
    note?: string;
  };
  generatedAt: number;
}

export const studyPlanApi = {
  async today(examId?: string, minutes?: number): Promise<DailyPlan> {
    const q = new URLSearchParams();
    if (examId) q.set('examId', examId);
    if (minutes) q.set('minutes', String(minutes));
    const res = await api.get(`/study-plan/today${q.toString() ? `?${q}` : ''}`);
    return res.data;
  },
};
