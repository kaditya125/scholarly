import { db } from '../config/firebase';
import { StudentGoal, GoalSource } from '../types/learningState.types';

/**
 * StudentGoal — the student's own declared target.
 *
 * Stored at users/{uid}/profile/goal, a sibling of the existing onboarding profile document, so
 * this reuses the established profile convention rather than introducing a parallel goal system.
 * targetExam/targetYear already live on the onboarding profile and are NOT duplicated here; this
 * record adds only what genuinely did not exist — what the student is aiming for, and by when.
 *
 * Why this had to become first-class: the only targetScore anywhere in the system came off the
 * LLM-generated studentDigitalTwin, and the only targetDate was the EXAM's date. Neither is the
 * student's commitment, so "are you on track?" could not be answered honestly. A goal the system
 * guessed must never be reflected back at the student as their own.
 */
export class StudentGoalService {
  private ref(userId: string) {
    return db.collection('users').doc(userId).collection('profile').doc('goal');
  }

  /**
   * Returns the student's goal, or null when none has been set.
   *
   * Deliberately returns null rather than a synthesised default. Callers must represent "no
   * goal" as NOT_SET — inferring `targetScore = previous best` or `targetDate = exam date` and
   * presenting it as the student's target is exactly the fabrication this phase exists to
   * eliminate.
   */
  async getGoal(userId: string): Promise<StudentGoal | null> {
    try {
      const snap = await this.ref(userId).get();
      if (!snap.exists) return null;
      const goal = snap.data() as StudentGoal;
      // A record explicitly marked NOT_SET is the same as absent for every consumer.
      return goal.status === 'NOT_SET' ? null : goal;
    } catch {
      // Distinguishable from "no goal" by the caller only via degraded-dependency reporting;
      // never silently becomes a default target.
      return null;
    }
  }

  /**
   * Creates or updates the student's goal.
   *
   * `source` defaults to STUDENT_DECLARED because that is the only path currently wired: a
   * system-suggested target must be passed explicitly so it can never be mistaken for the
   * student's own commitment downstream.
   */
  async setGoal(
    userId: string,
    input: {
      examId?: string;
      examCycle?: string;
      targetScore?: number;
      targetRank?: number;
      targetPercentile?: number;
      targetDate?: string;
    },
    source: GoalSource = 'STUDENT_DECLARED',
  ): Promise<StudentGoal> {
    const now = Date.now();
    const existing = await this.getGoal(userId);

    const goal: StudentGoal = {
      studentId: userId,
      status: 'ACTIVE',
      source,
      ...existing,
      ...input,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    await this.ref(userId).set(goal, { merge: true });
    return goal;
  }

  /** Marks a goal inactive without deleting it, preserving the record for history. */
  async closeGoal(userId: string, status: 'ACHIEVED' | 'ABANDONED'): Promise<void> {
    await this.ref(userId).set({ status, updatedAt: Date.now() }, { merge: true });
  }
}

export const studentGoalService = new StudentGoalService();
