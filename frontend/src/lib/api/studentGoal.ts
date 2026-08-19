import { api } from './client';

/**
 * Student goal API.
 *
 * The backend is authoritative for validation, provenance and persistence — this client does
 * light UX-level checking only, and never writes Firestore directly. A save that fails must
 * surface as a failure: reporting success for a goal that was not stored would leave the mentor
 * reasoning about a target the student never actually set.
 */

export type GoalKind = 'score' | 'rank' | 'percentile';

export interface StudentGoal {
  studentId: string;
  status: 'ACTIVE' | 'NOT_SET' | 'ACHIEVED' | 'ABANDONED';
  source: 'STUDENT_DECLARED' | 'IMPORTED' | 'SYSTEM_SUGGESTED';
  examId?: string;
  examCycle?: string;
  targetScore?: number;
  targetRank?: number;
  targetPercentile?: number;
  targetDate?: string;
  createdAt: number;
  updatedAt: number;
}

export interface GoalInput {
  kind: GoalKind;
  /** The numeric target, interpreted according to `kind`. */
  value: number;
  targetDate?: string;
  examId?: string;
  examCycle?: string;
}

/** Field-level errors returned by the backend, so the student sees the real reason. */
export interface GoalFieldError { field: string; message: string; }

export const studentGoalApi = {
  async getGoal(userId: string): Promise<{ goal: StudentGoal | null; status: string }> {
    const { data } = await api.get(`/users/${userId}/goal`);
    return data;
  },

  /**
   * Saves the goal. Throws on failure — deliberately no fallback and no optimistic success, so
   * the caller cannot advance onboarding while pretending the target was persisted.
   */
  async saveGoal(userId: string, input: GoalInput): Promise<StudentGoal> {
    const body: Record<string, unknown> = {
      examId: input.examId,
      examCycle: input.examCycle,
      targetDate: input.targetDate || undefined,
    };
    if (input.kind === 'score') body.targetScore = input.value;
    if (input.kind === 'rank') body.targetRank = input.value;
    if (input.kind === 'percentile') body.targetPercentile = input.value;

    const { data } = await api.put(`/users/${userId}/goal`, body);
    if (!data?.goal) throw new Error('Goal was not saved. Please try again.');
    return data.goal as StudentGoal;
  },
};

/**
 * UX-level validation only. Deliberately mirrors the backend's *universal* invariants and adds
 * no exam-specific ceiling — scoring models differ (percentage, raw marks, NEET's 720), and a
 * universal maximum here would reject legitimate targets. The backend stays authoritative.
 *
 * Returns null when the input is acceptable, or a message to show the student. Never coerces:
 * "95abc" is rejected rather than silently read as 95, because the stored goal must be what the
 * student actually meant.
 */
export function validateGoalValue(kind: GoalKind, raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return 'Enter a target, or skip this step.';
  // Reject anything that is not purely numeric rather than letting parseFloat salvage a prefix.
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return 'Use digits only — for example 90.';
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return 'That does not look like a number.';

  if (kind === 'rank') {
    if (!Number.isInteger(n)) return 'Rank must be a whole number.';
    if (n < 1) return 'Rank must be 1 or higher.';
  }
  if (kind === 'percentile' && (n < 0 || n > 100)) return 'Percentile must be between 0 and 100.';
  if (kind === 'score' && n < 0) return 'Score cannot be negative.';
  return null;
}
