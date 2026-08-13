import { StoredQuizQuestion, QuizMode } from './quizAttempt.types';

/**
 * Class assignments — a teacher-set test built on the EXISTING AI quiz engine
 * (`quizGeneratorService` + `quizAttemptsService`), not a new question-generation or scoring
 * system.
 *
 * ── The one design choice that shapes everything here ─────────────────────────────────
 * The self-serve `/api/quiz` flow generates a PERSONALIZED question set per call — right for
 * one student practising their own weak areas, wrong for a class test, where "class average"
 * only means something if every student answered the SAME questions. So a class assignment
 * generates its question set exactly ONCE, at creation, and every student's attempt is built
 * from that fixed, stored copy — never regenerated per student.
 *
 * ── What is genuinely new vs. reused ──────────────────────────────────────────────────
 * NEW: this record (the fixed question set + class/teacher context) and a thin pointer from
 * each student to the real attempt they took it under.
 * REUSED, UNCHANGED: `quizAttemptsService.createFromQuestions()` builds each student's actual
 * attempt; the existing `GET/POST /api/quiz/attempts/:id` routes are what a student takes and
 * submits through — this file introduces no parallel taking/scoring/masking logic at all.
 */

export const ASSIGNMENT_STATUSES = ['draft', 'published', 'closed'] as const;
export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

export function isAssignmentStatus(value: unknown): value is AssignmentStatus {
  return typeof value === 'string' && (ASSIGNMENT_STATUSES as readonly string[]).includes(value);
}

/**
 * draft ──► published ──► closed
 *
 * `draft` lets the teacher preview the generated questions (and, in a future phase, edit them)
 * before anyone can see the assignment exists. `closed` stops new attempts from starting —
 * manual, like every other lifecycle transition in this codebase, not date-driven — but does
 * not hide already-submitted results.
 */
export const ASSIGNMENT_TRANSITIONS: Record<AssignmentStatus, readonly AssignmentStatus[]> = {
  draft: ['published'],
  published: ['closed'],
  closed: [],
};

export function canTransitionAssignment(from: AssignmentStatus, to: AssignmentStatus): boolean {
  return ASSIGNMENT_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Visible to a non-owner (an ACTIVE class member) only once it has left draft. */
export function isAssignmentVisibleToMembers(status: AssignmentStatus): boolean {
  return status === 'published' || status === 'closed';
}

/** A student may start an attempt only while it is actually open. */
export function isAssignmentStartable(status: AssignmentStatus): boolean {
  return status === 'published';
}

export const MAX_ASSIGNMENT_TITLE = 160;
export const MAX_ASSIGNMENT_TOPIC = 200;
export const MIN_QUESTIONS = 3;
export const MAX_QUESTIONS = 20;
export const MIN_DURATION_MIN = 5;
export const MAX_DURATION_MIN = 180;

/** `classAssignments/{id}` */
export interface ClassAssignmentRecord {
  id: string;
  classId: string;
  /** The creating teacher. Always the verified token uid — never accepted from a body. */
  ownerUid: string;

  title: string;
  /** What the fixed question set was generated on. Required — see the service for why. */
  topic: string;
  /** Set when the questions were grounded in a specific notebook rather than the topic alone. */
  notebookId: string | null;
  mode: QuizMode;

  /**
   * The fixed set every student's attempt is built from. Carries the answer key — this field
   * must NEVER be sent to a student-facing endpoint. Only the owning teacher's own read path
   * (previewing before publish) may see it; students interact with their own attempt via the
   * existing, separately-authorized `/api/quiz/attempts/:id` routes.
   */
  questions: StoredQuizQuestion[];
  totalQuestions: number;
  durationMinutes: number;

  status: AssignmentStatus;

  createdAt: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
  publishedAt: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp | null;
}

export interface CreateAssignmentInput {
  title?: string;
  topic?: string;
  notebookId?: string | null;
  mode?: QuizMode;
  count?: number;
  durationMinutes?: number;
}

/**
 * `classAssignmentAttempts/{assignmentId}_{studentUid}` — a pointer, not a copy.
 *
 * The composite id makes "has this student already started" a single doc read and a duplicate
 * attempt structurally impossible, exactly like `classEnrollments`'s `{classId}_{studentUid}`.
 * `teacherUid` is denormalised here (rather than read via a join to the class) purely so the
 * Firestore security rule for this collection can be a flat field comparison.
 */
export interface AssignmentAttemptPointer {
  id: string;
  assignmentId: string;
  classId: string;
  teacherUid: string;
  studentUid: string;
  /** The real attempt, owned and scored entirely by the existing quiz-attempts system. */
  quizAttemptId: string;
  createdAt: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
}

export function assignmentAttemptId(assignmentId: string, studentUid: string): string {
  return `${assignmentId}_${studentUid}`;
}

/* ── Results aggregation shapes ───────────────────────────────────────────────────────── */

/** One student's row in the teacher's results view. */
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

/** The full teacher-facing results payload. Computed ONLY over currently-ACTIVE roster members. */
export interface AssignmentResults {
  assignmentId: string;
  totalQuestions: number;
  /** Currently-active students who have started. A student who left after attempting is excluded. */
  started: number;
  completed: number;
  averageAccuracy: number | null;
  averageScore: number | null;
  topicAverages: AssignmentTopicAverage[];
  students: AssignmentResultRow[];
}
