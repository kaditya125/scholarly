import { AdaptiveQuestion } from './adaptiveCat.service';

/**
 * Server-authoritative grading for the baseline assessment.
 *
 * WHY THIS EXISTS: correctness used to be computed in the browser
 * (useAdaptiveAssessment.ts: `String(selectedAnswer)... === String(currentQuestion.correctAnswer)...`)
 * and the server simply counted `responses.filter(r => r.isCorrect)`. That is a client ASSERTION,
 * not a measurement, and feeding it into the mastery pipeline would produce evidence that looks
 * measured and is not — the exact failure this programme exists to eliminate, but arriving
 * through a legitimate-looking path where nothing downstream could tell the difference.
 *
 * The authoritative source is the question persisted server-side in
 * users/{uid}/assessments/baselineSession.questions — the same document the server already
 * writes when serving the batch. No new storage is required.
 *
 * Deliberately pure and dependency-free: no Firestore, no LLM, no MasteryEngine, no Express. It
 * takes a question and an answer and returns a verdict, so it can be exhaustively unit-tested
 * including adversarial cases.
 */

export type GradeReason =
  | 'CORRECT'
  | 'INCORRECT'
  | 'SKIPPED'
  /** The submitted questionId was not part of this student's persisted session. */
  | 'QUESTION_NOT_IN_SESSION'
  /** The persisted question carries no answer key — cannot grade, must not guess. */
  | 'NO_ANSWER_KEY';

export interface GradedResponse {
  questionId: string;
  /** Server-derived. Never the client's `isCorrect`. */
  correct: boolean;
  skipped: boolean;
  /** True only when the server could actually establish a verdict. */
  graded: boolean;
  reason: GradeReason;
  subject?: string;
  topic?: string;
  difficulty?: string;
  timeSpentSeconds?: number;
}

/**
 * Canonical answer comparison.
 *
 * Intentionally mirrors the comparison the client already performed (trim + lowercase, string
 * coerced) so that fixing WHO grades does not silently change WHAT counts as correct. Numeric
 * answers are compared numerically when both sides parse as numbers, so `2` and `"2"` and `"2.0"`
 * agree — the bank mixes option-text answers ('Velocity') with numeric ones.
 */
export function answersMatch(correctAnswer: unknown, userAnswer: unknown): boolean {
  if (correctAnswer === null || correctAnswer === undefined) return false;
  if (userAnswer === null || userAnswer === undefined) return false;

  const a = String(correctAnswer).trim();
  const b = String(userAnswer).trim();
  if (a === '' || b === '') return false;

  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na === nb;

  return a.toLowerCase() === b.toLowerCase();
}

/** A response as submitted. `isCorrect` may be present but is NEVER read. */
export interface SubmittedResponse {
  questionId?: string;
  userAnswer?: unknown;
  timeTakenSeconds?: number;
  /** Client assertion. Deliberately ignored — see gradeBaselineResponse. */
  isCorrect?: boolean;
  [k: string]: unknown;
}

/**
 * Grades ONE response against the student's own persisted questions.
 *
 * `sessionQuestions` must be the questions persisted for THIS user's session. Passing a global
 * question pool would let a client submit an arbitrary questionId whose answer it already knows.
 */
export function gradeBaselineResponse(
  response: SubmittedResponse,
  sessionQuestions: Array<Partial<AdaptiveQuestion>>,
): GradedResponse {
  const questionId = String(response?.questionId ?? '');
  const base = {
    questionId,
    timeSpentSeconds: typeof response?.timeTakenSeconds === 'number' ? response.timeTakenSeconds : undefined,
  };

  const question = sessionQuestions.find((q) => String(q?.id ?? '') === questionId && questionId !== '');
  if (!question) {
    // Not gradeable and NOT counted as incorrect: an unknown id is a malformed or hostile
    // submission, not a demonstration that the student got something wrong.
    return { ...base, correct: false, skipped: false, graded: false, reason: 'QUESTION_NOT_IN_SESSION' };
  }

  const meta = {
    subject: question.subject,
    topic: question.topic,
    difficulty: question.difficulty as string | undefined,
  };

  const answered = response.userAnswer !== undefined && response.userAnswer !== null
    && String(response.userAnswer).trim() !== '';
  if (!answered) {
    // Skipped is distinct from wrong throughout this system: it is a time/avoidance signal, not
    // a knowledge gap, and counting it as incorrect would understate the student.
    return { ...base, ...meta, correct: false, skipped: true, graded: false, reason: 'SKIPPED' };
  }

  if (question.correctAnswer === undefined || question.correctAnswer === null) {
    // The persisted question has no answer key. Refuse rather than assume — an ungradeable
    // question must not silently become a wrong answer on the student's record.
    return { ...base, ...meta, correct: false, skipped: false, graded: false, reason: 'NO_ANSWER_KEY' };
  }

  const correct = answersMatch(question.correctAnswer, response.userAnswer);
  return {
    ...base, ...meta,
    correct,
    skipped: false,
    graded: true,
    reason: correct ? 'CORRECT' : 'INCORRECT',
  };
}

export interface BaselineGradeSummary {
  graded: GradedResponse[];
  /** Denominator = the assessment actually served, never a fabricated constant. */
  totalQuestions: number;
  attempted: number;
  skipped: number;
  correctCount: number;
  /** Submitted responses that could not be graded (unknown id / missing key). */
  ungradable: number;
  /** Percentage over GRADED attempts only. Null when nothing was gradeable. */
  accuracyPct: number | null;
}

/**
 * Grades a whole submission against the persisted session.
 *
 * `totalQuestions` comes from the persisted question set — the assessment that actually existed.
 * The previous `responses.length || 20` invented a denominator of 20 for an empty submission,
 * which would have reported a real-looking score for a student who answered nothing.
 */
export function gradeBaselineSubmission(
  responses: SubmittedResponse[],
  sessionQuestions: Array<Partial<AdaptiveQuestion>>,
): BaselineGradeSummary {
  const graded = (responses || []).map((r) => gradeBaselineResponse(r, sessionQuestions));
  const gradedOnly = graded.filter((g) => g.graded);
  const correctCount = gradedOnly.filter((g) => g.correct).length;
  const attempted = gradedOnly.length;

  return {
    graded,
    totalQuestions: sessionQuestions.length,
    attempted,
    skipped: graded.filter((g) => g.skipped).length,
    correctCount,
    ungradable: graded.filter((g) => !g.graded && !g.skipped).length,
    accuracyPct: attempted > 0 ? Math.round((correctCount / attempted) * 100) : null,
  };
}
