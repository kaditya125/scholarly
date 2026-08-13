import { api } from './client';
import type { QuizMode } from './quiz';

/** Mirrors backend-firestore/src/types/classAssignment.ts. */
export const ASSIGNMENT_STATUSES = ['draft', 'published', 'closed'] as const;
export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

/**
 * The owner's own view of an assignment INCLUDES `questions` (their own answer key, needed to
 * preview before publishing). A non-owner's view never carries that field — the server strips
 * it — so it is typed optional here rather than required, and the UI must not assume it exists.
 */
export interface ClassAssignment {
  id: string;
  classId: string;
  ownerUid: string;
  title: string;
  topic: string;
  notebookId: string | null;
  mode: QuizMode;
  questions?: { id: string; text: string; topic: string; options: string[]; correctAnswerIndex: number; explanation: string }[];
  totalQuestions: number;
  durationMinutes: number;
  status: AssignmentStatus;
  publishedAt: unknown;
}

export interface CreateAssignmentInput {
  title?: string;
  topic: string;
  notebookId?: string | null;
  mode?: QuizMode;
  count?: number;
  durationMinutes?: number;
}

export interface AssignmentResultRow {
  studentUid: string;
  status: 'in-progress' | 'completed';
  score?: number;
  maxMarks?: number;
  accuracy?: number;
  correctCount?: number;
  totalQuestions: number;
  timeSpentSeconds?: number;
}

export interface AssignmentTopicAverage {
  topic: string;
  averageAccuracy: number;
  studentsAttempted: number;
}

export interface AssignmentResults {
  assignmentId: string;
  totalQuestions: number;
  started: number;
  completed: number;
  averageAccuracy: number | null;
  averageScore: number | null;
  topicAverages: AssignmentTopicAverage[];
  students: AssignmentResultRow[];
}

export const classAssignmentsApi = {
  async list(classId: string): Promise<ClassAssignment[]> {
    const { data } = await api.get(`/classes/${classId}/assignments`);
    return data.assignments ?? [];
  },

  async create(classId: string, input: CreateAssignmentInput): Promise<ClassAssignment> {
    const { data } = await api.post(`/classes/${classId}/assignments`, input);
    return data;
  },

  async setStatus(classId: string, assignmentId: string, status: AssignmentStatus): Promise<ClassAssignment> {
    const { data } = await api.post(`/classes/${classId}/assignments/${assignmentId}/status`, { status });
    return data;
  },

  /** Returns only the real quiz-attempt id — taking place through the existing /quiz/attempts/:id routes. */
  async start(classId: string, assignmentId: string): Promise<{ quizAttemptId: string }> {
    const { data } = await api.post(`/classes/${classId}/assignments/${assignmentId}/start`);
    return data;
  },

  async results(classId: string, assignmentId: string): Promise<AssignmentResults> {
    const { data } = await api.get(`/classes/${classId}/assignments/${assignmentId}/results`);
    return data;
  },
};
