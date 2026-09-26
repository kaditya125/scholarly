import { api } from './client';

/**
 * Quiz client — matches the backend (quiz.controller.ts / quizAttempts.service.ts) route-for-route.
 *
 * Note: `GET /quiz` and `POST /quiz/generate` both GENERATE and PERSIST a new in-progress
 * attempt. Never call them just to read data — use getAttempt/listAttempts for that.
 */

export const quizApi = {
  /** Generates a fresh, personalized weak-area (or topic/notebook) quiz and starts an attempt. */
  async generate(opts: {
    topic?: string; notebookId?: string; notebookTitle?: string; mode?: QuizMode; count?: number;
    /** A real canonical syllabus node — from a weak-area recommendation or an explicit topic
     *  pick, never guessed client-side. Pins WHERE the questions come from. */
    syllabusNodeId?: string;
    /** Canonical examId, when known (e.g. resolved via examApi.resolveExamId beforehand). */
    examId?: string;
    /** True when this request originated from a weak-area recommendation — keeps the
     *  real-PYQ/reference-weighted source mix even when syllabusNodeId also narrows WHERE. */
    isWeakAreaDrill?: boolean;
  } = {}) {
    const { data } = await api.post('/quiz/generate', opts);
    return data as { attemptId: string; questions: Pick<StoredQuizQuestion, 'id' | 'text' | 'topic' | 'options'>[]; durationMinutes: number; title: string; topic?: string; totalQuestions: number };
  },

  /** Real, examId/syllabusNodeId-scoped weak areas — see quiz.controller.ts's getWeakAreas. */
  async getWeakAreas(examQuery: string): Promise<{ examId: string | null; examResolved: boolean; weakAreas: WeakTopic[] }> {
    const { data } = await api.get('/quiz/weak-areas', { params: { exam: examQuery } });
    return data;
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

  /** Starts an attempt from a stored mock test's own questions (no generation). */
  async startMockTest(testId: string, opts: { mode?: QuizMode } = {}) {
    const { data } = await api.post(`/quiz/mock-tests/${encodeURIComponent(testId)}/start`, opts);
    return data as { attemptId: string; questions: Pick<StoredQuizQuestion, 'id' | 'text' | 'topic' | 'options'>[]; durationMinutes: number; title: string; totalQuestions: number };
  },
};

export type QuizAttemptStatus = 'in-progress' | 'completed';
export type QuizSource = 'weak-areas' | 'topic' | 'notebook' | 'mock-test';
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
  answeredCount?: number;
}

export interface ProgressTopicMastery {
  topic: string;
  attempts: number;
  correct: number;
  total: number;
  accuracy: number;
  /** Present when at least one contributing attempt carried real syllabus identity — pass these
   *  straight into quizApi.generate() instead of just `topic` to get a genuinely scoped drill. */
  examId?: string;
  syllabusNodeId?: string;
  lastAttemptAt?: string;
}

/** The structured, exam-scoped weak-area shape — see WeakTopic in the backend's
 *  quizAttempt.types.ts. What quiz.controller.ts's GET /quiz/weak-areas returns. */
export interface WeakTopic {
  examId?: string;
  subjectId?: string;
  syllabusNodeId?: string;
  topicId?: string;
  topicName: string;
  attempts: number;
  correct: number;
  incorrect: number;
  total: number;
  accuracy: number;
  confidence: number;
  lastAttemptAt?: string;
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
