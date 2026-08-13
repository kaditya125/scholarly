import { api } from './client';

/**
 * Quiz client.
 *
 * `getQuestions`/`submitQuiz` are the ORIGINAL contents of this file, byte-for-byte — left
 * exactly as they were. `useQuiz.ts` (consumed by `TestEngine.tsx` and `Report.tsx`) depends on
 * them, and whatever behaviour they have today — including against `/quiz` and `/quiz/submit`,
 * which do not match the routes `quiz.routes.ts` actually mounts — is a pre-existing question
 * for those pages, not something to change as a side effect of unrelated work.
 *
 * Everything below that block is ADDITIVE: `hooks/api/useQuizAttempts.ts` already imports
 * `QuizAttempt`/`QuizAttemptSummary`/`ProgressReport` and calls `listAttempts`/
 * `getProgressReport`/`getAttempt` — none of which this file defined, so that hook (and its
 * three real consumers: WeakSectionsPanel, TestProgressOverview, AttemptHistoryList) could not
 * have compiled correctly before now. These match the real backend
 * (quiz.controller.ts / quizAttempts.service.ts) route-for-route.
 */

export interface Question {
  id: string;
  text: string;
  topic: string;
  options: string[];
  correctAnswerIndex: number;
  explanation: string;
}

export const quizApi = {
  async getQuestions(): Promise<Question[]> {
    const response = await api.get('/quiz');
    return response.data;
  },

  async submitQuiz(payload: { answers: Record<string, number>, timeSpent: number }): Promise<void> {
    await api.post('/quiz/submit', payload);
  },

  // ─── Quiz attempts (additive — see file header) ────────────────────────────────────

  /** Generates a fresh, personalized weak-area (or topic/notebook) quiz and starts an attempt. */
  async generate(opts: { topic?: string; notebookId?: string; notebookTitle?: string; mode?: QuizMode; count?: number } = {}) {
    const { data } = await api.post('/quiz/generate', opts);
    return data as { attemptId: string; questions: Pick<StoredQuizQuestion, 'id' | 'text' | 'topic' | 'options'>[]; durationMinutes: number; title: string; topic?: string; totalQuestions: number };
  },

  async listAttempts(): Promise<QuizAttemptSummary[]> {
    const { data } = await api.get('/quiz/attempts');
    return data;
  },

  async getProgressReport(): Promise<ProgressReport> {
    const { data } = await api.get('/quiz/progress');
    return data;
  },

  /** In-progress attempts come back with the answer key masked (-1 / empty explanation). */
  async getAttempt(attemptId: string): Promise<QuizAttempt> {
    const { data } = await api.get(`/quiz/attempts/${attemptId}`);
    return data;
  },

  async submitAttempt(attemptId: string, payload: { answers: Record<string, number>; timeSpentSeconds: number }): Promise<QuizAttempt> {
    const { data } = await api.post(`/quiz/attempts/${attemptId}/submit`, payload);
    return data;
  },
};

export type QuizAttemptStatus = 'in-progress' | 'completed';
export type QuizSource = 'weak-areas' | 'topic' | 'notebook';
export type QuizMode = 'exam' | 'study';

export interface StoredQuizQuestion {
  id: string;
  text: string;
  topic: string;
  options: string[];
  correctAnswerIndex: number;
  explanation: string;
}

export interface TopicBreakdown {
  topic: string;
  correct: number;
  incorrect: number;
  unattempted: number;
  total: number;
  accuracy: number;
}

export interface QuizAttempt {
  id: string;
  userId: string;
  title: string;
  source: QuizSource;
  topic?: string;
  notebookId?: string;
  notebookTitle?: string;
  mode: QuizMode;
  questions: StoredQuizQuestion[];
  totalQuestions: number;
  durationMinutes: number;
  positiveMark: number;
  negativeMark: number;
  status: QuizAttemptStatus;
  createdAt: string;
  completedAt?: string;
  answers?: Record<string, number>;
  score?: number;
  maxMarks?: number;
  correctCount?: number;
  incorrectCount?: number;
  unattemptedCount?: number;
  accuracy?: number;
  timeSpentSeconds?: number;
  topicBreakdown?: TopicBreakdown[];
  weakTopics?: string[];
  strongTopics?: string[];
  feedback?: string;
}

export interface QuizAttemptSummary {
  id: string;
  title: string;
  source: QuizSource;
  topic?: string;
  notebookId?: string;
  notebookTitle?: string;
  mode: QuizMode;
  totalQuestions: number;
  durationMinutes: number;
  status: QuizAttemptStatus;
  createdAt: string;
  completedAt?: string;
  score?: number;
  maxMarks?: number;
  accuracy?: number;
  correctCount?: number;
}

export interface ProgressTopicMastery {
  topic: string;
  attempts: number;
  correct: number;
  total: number;
  accuracy: number;
}

export interface ProgressTrendPoint {
  attemptId: string;
  title: string;
  date: string;
  accuracy: number;
  score: number;
  maxMarks: number;
}

export interface ProgressReport {
  totalTests: number;
  totalGenerated: number;
  inProgress: number;
  averageAccuracy: number;
  bestAccuracy: number;
  totalQuestionsAnswered: number;
  totalTimeSpentSeconds: number;
  trend: ProgressTrendPoint[];
  topicMastery: ProgressTopicMastery[];
  weakSections: ProgressTopicMastery[];
  strongSections: ProgressTopicMastery[];
  recentAttempts: QuizAttemptSummary[];
  narrative: string;
}
