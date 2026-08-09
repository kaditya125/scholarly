/**
 * Types for the AI-generated quiz flow (the live `/quiz` engine used by the /test page).
 * Distinct from tests.types.ts (the series/mock_tests/question_bank subsystem): these attempts
 * are self-contained — the generated questions are stored on the attempt itself, so scoring,
 * history, and progress reporting need no separate question bank.
 */

export type QuizAttemptStatus = 'in-progress' | 'completed';
export type QuizSource = 'weak-areas' | 'topic' | 'notebook';
export type QuizMode = 'exam' | 'study';

/** A stored question — includes the answer key (server-side scoring only; masked before it reaches the client mid-test). */
export interface StoredQuizQuestion {
  id: string;
  text: string;
  topic: string;
  options: string[];
  correctAnswerIndex: number;
  explanation: string;
}

/** Per-topic (section) result inside a single attempt. */
export interface TopicBreakdown {
  topic: string;
  correct: number;
  incorrect: number;
  unattempted: number;
  total: number;
  accuracy: number; // 0-100 (correct / total)
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

  // ── Results (populated on submit) ────────────────────────────────
  answers?: Record<string, number>;
  score?: number;      // net marks (correct*positive - incorrect*negative)
  maxMarks?: number;
  correctCount?: number;
  incorrectCount?: number;
  unattemptedCount?: number;
  accuracy?: number;   // 0-100
  timeSpentSeconds?: number;
  topicBreakdown?: TopicBreakdown[];
  weakTopics?: string[];
  strongTopics?: string[];
  feedback?: string;   // data-driven "work on these sections" summary
}

/** Card/list view: no questions (never leak the answer key) and no answer map. */
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

/** Aggregate mastery for one section across every completed attempt. */
export interface ProgressTopicMastery {
  topic: string;
  attempts: number;
  correct: number;
  total: number;
  accuracy: number; // 0-100
}

/** One point on the accuracy-over-time trend. */
export interface ProgressTrendPoint {
  attemptId: string;
  title: string;
  date: string;
  accuracy: number;
  score: number;
  maxMarks: number;
}

/** The student's overall test progress report + weak-section feedback. */
export interface ProgressReport {
  totalTests: number;        // completed
  totalGenerated: number;    // every attempt ever generated
  inProgress: number;
  averageAccuracy: number;   // 0-100 across completed
  bestAccuracy: number;
  totalQuestionsAnswered: number;
  totalTimeSpentSeconds: number;
  trend: ProgressTrendPoint[];          // chronological (oldest -> newest)
  topicMastery: ProgressTopicMastery[]; // worst -> best
  weakSections: ProgressTopicMastery[];
  strongSections: ProgressTopicMastery[];
  recentAttempts: QuizAttemptSummary[];
  narrative: string;
}
