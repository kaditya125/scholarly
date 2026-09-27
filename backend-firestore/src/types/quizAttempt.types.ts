/**
 * Types for the AI-generated quiz flow (the live `/quiz` engine used by the /test page).
 * Distinct from tests.types.ts (the series/mock_tests/question_bank subsystem): these attempts
 * are self-contained — the generated questions are stored on the attempt itself, so scoring,
 * history, and progress reporting need no separate question bank.
 */

export type QuizAttemptStatus = 'in-progress' | 'completed';
export type QuizSource = 'weak-areas' | 'topic' | 'notebook' | 'mock-test' | 'pyq-paper';
export type QuizMode = 'exam' | 'study';

/** A stored question — includes the answer key (server-side scoring only; masked before it reaches the client mid-test). */
export interface StoredQuizQuestion {
  id: string;
  text: string;
  /** Display label only — non-authoritative. Never derive syllabus identity from it. */
  topic: string;
  options: string[];
  correctAnswerIndex: number;
  explanation: string;
  /**
   * Canonical syllabus identity, captured at generation and frozen into the attempt.
   *
   * Denormalised deliberately: once a student has answered, this attempt IS the historical
   * evidence, and it must stay interpretable even if the syllabus is later revised. Resolving
   * identity from the topic string after the fact is exactly what this pipeline removes.
   *
   * Optional because questions generated before this contract (and any generated without a
   * canonical node) legitimately have none — identityStatus says which, rather than leaving
   * downstream code to infer meaning from absence.
   */
  syllabusNodeId?: string;
  syllabusId?: string;
  cycleId?: string;
  /**
   * The exam this question was authored for.
   *
   * Added in J.7.1. Without it a stored question carried a node id and a version but no exam, so
   * answering "which exam was this asked for?" required resolving the node — and a node from a
   * deleted or superseded graph would have made the question permanently unattributable. The full
   * coordinate set is denormalised here precisely so historical evidence stays self-describing.
   */
  examId?: string;
  identityStatus?: 'CANONICAL' | 'UNANCHORED';
  /**
   * Where the question TEXT actually came from — orthogonal to identityStatus, which is about
   * syllabus anchoring, not evidence. A question can be UNANCHORED (no syllabus node) and still
   * be an AUTHENTIC_PYQ (a real historical question with no resolved syllabus location yet), and
   * a CANONICAL-anchored question can still be entirely model-invented. Conflating the two is
   * exactly how a generated question ends up presented as a past paper.
   *   AUTHENTIC_PYQ         — real historical question, retrieved verbatim, never generated.
   *   PYQ_INSPIRED          — newly generated, but genuinely informed by real PYQ pattern data
   *                            (pyqAnalyticsService supplied a non-empty pattern for this exam).
   *   CURRICULUM_SYNTHESIZED — grounded in retrieved source material (notebook/reference chunks).
   *   GENERAL_KNOWLEDGE     — generated from the model's own knowledge; no PYQ or source evidence
   *                            was available. Previously this case was mislabelled PYQ_INSPIRED.
   */
  questionOrigin?: 'AUTHENTIC_PYQ' | 'PYQ_INSPIRED' | 'CURRICULUM_SYNTHESIZED' | 'GENERAL_KNOWLEDGE';
  /** Present only for AUTHENTIC_PYQ: the real question's canonical id, year/shift/paper. */
  sourcePyqId?: string;
  sourceYear?: number;
  sourceShift?: string;
  sourcePaper?: string;
  canonicalPaperId?: string;
}

/**
 * Per-topic (section) result inside a single attempt.
 *
 * Carries the canonical node so mastery can aggregate by syllabus location. Grading previously
 * grouped on the `topic` STRING and dropped the node the question already carried, which is the
 * exact re-derivation the question type warns against — and it meant every mastery record landed
 * under a label slug that collides across exams and that coverage cannot see.
 */
export interface TopicBreakdown {
  topic: string;
  correct: number;
  incorrect: number;
  unattempted: number;
  total: number;
  accuracy: number; // 0-100 (correct / total)
  /** Present when the questions in this row were generated against a validated syllabus node. */
  syllabusNodeId?: string;
  identityStatus?: 'CANONICAL' | 'UNANCHORED';
  /**
   * The exam this bucket's questions were authored for (from StoredQuizQuestion.examId).
   *
   * Added so mastery aggregation across attempts can scope by exam. Without it, getProgressReport
   * grouped purely on the topic LABEL — "Algebra" from an SSC CGL attempt and "Algebra" from a JEE
   * Main attempt landed in the same bucket, so a JEE weakness could surface as an SSC recommendation
   * and vice versa. Optional because older attempts (pre-Phase-1) genuinely have no examId to report.
   */
  examId?: string;
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
  pedagogicalDiagnostics?: PedagogicalDiagnostic[];
}

/** Root-cause diagnostic linking a failed quiz topic to its foundational prerequisite gap. */
export interface PedagogicalDiagnostic {
  topic: string;
  accuracy: number;
  rootCauseConceptId: string;
  rootCauseTitle: string;
  rootCauseChapter: string;
  prerequisiteChain: Array<{
    conceptId: string;
    title: string;
    chapter: string;
  }>;
  diagnosticMessage: string;
  recommendedAction: string;
  remediationDrillId?: string;
  remediationDrillTitle?: string;
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
  /** Present when at least one contributing attempt carried these — the compound key
   *  (examId, syllabusNodeId ?? topic) is what this row is actually aggregated by now, not the
   *  bare topic string, so this is the row's real identity, not decoration. */
  examId?: string;
  syllabusNodeId?: string;
  lastAttemptAt?: string;
}

/**
 * A student's weakness at ONE syllabus location within ONE exam — the structured replacement for
 * a bare topic string. This is what survives from a question, through an attempt, through
 * cross-attempt analytics, to a recommendation: examId and syllabusNodeId travel with the topic
 * name the whole way, so "recommend a Percentage drill" can mean an actual retrieval constraint
 * (syllabusNodeId = X) instead of a fuzzy label match that happens to collide across exams.
 *
 * Deliberately NOT a replacement for UserStats.weakTopics (kept as-is: many callers — podcast
 * planning, voice assistant, WhatsApp scripts, dashboard suggestion chips — only ever need topic
 * NAMES for display or prompt text, don't do retrieval, and would gain nothing from this shape
 * while a blanket type change would touch a dozen unrelated files). This is additive: a second,
 * more precise view for the callers that actually retrieve by syllabus location.
 */
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
  accuracy: number; // 0-100
  /** 0-1: how much a small sample size should temper "weak"/"strong" — see WEAK_CONFIDENCE_FLOOR.
   *  A 2/2 row and an 18/20 row can carry the same accuracy and very different confidence. */
  confidence: number;
  lastAttemptAt?: string;
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
