import { Request, Response, NextFunction } from 'express';
import { studentGoalService } from '../services/studentGoal.service';
import { eventBus } from '../core/events/EventBus';
import { logger } from '../utils/logger';

/**
 * Student goal capture.
 *
 * Validation is deterministic and rejects rather than coerces. A goal is a statement the student
 * makes about their own target; silently "fixing" an invalid one (clamping a percentile, or
 * treating an unparseable score as zero) would put words in their mouth and then feed those words
 * to the mentor as fact.
 */

export type GoalKind = 'score' | 'rank' | 'percentile';

export interface GoalValidationError { field: string; message: string; }

/**
 * Pure, testable validation. Exam-specific score ceilings are intentionally NOT hardcoded here —
 * exam metadata owns those, and duplicating them would create a second source of truth that
 * silently drifts. What is enforced here are the universal invariants that hold for every exam.
 */
export function validateGoalInput(body: any): { errors: GoalValidationError[]; kind: GoalKind | null } {
  const errors: GoalValidationError[] = [];
  const has = (v: any) => v !== undefined && v !== null && v !== '';

  const kinds: GoalKind[] = [];
  if (has(body.targetScore)) kinds.push('score');
  if (has(body.targetRank)) kinds.push('rank');
  if (has(body.targetPercentile)) kinds.push('percentile');

  if (kinds.length === 0) {
    errors.push({ field: 'target', message: 'Provide a target score, rank or percentile.' });
  }

  if (has(body.targetScore)) {
    const n = Number(body.targetScore);
    // No upper bound asserted: scoring models differ per exam (percentage vs raw marks vs
    // negative-marked totals), and inventing a ceiling here would reject legitimate targets.
    if (!Number.isFinite(n) || n < 0) {
      errors.push({ field: 'targetScore', message: 'Target score must be a non-negative number.' });
    }
  }
  if (has(body.targetRank)) {
    const n = Number(body.targetRank);
    if (!Number.isInteger(n) || n < 1) {
      errors.push({ field: 'targetRank', message: 'Target rank must be a positive whole number.' });
    }
  }
  if (has(body.targetPercentile)) {
    const n = Number(body.targetPercentile);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      errors.push({ field: 'targetPercentile', message: 'Target percentile must be between 0 and 100.' });
    }
  }
  if (has(body.targetDate)) {
    const t = new Date(body.targetDate).getTime();
    if (!Number.isFinite(t)) {
      errors.push({ field: 'targetDate', message: 'Target date is not a valid date.' });
    } else if (t < Date.now() - 86400000) {
      // A target in the past cannot be something the student is working toward.
      errors.push({ field: 'targetDate', message: 'Target date must not be in the past.' });
    }
  }

  return { errors, kind: kinds[0] ?? null };
}

export class StudentGoalController {
  /** Returns the student's goal, or an explicit not-set state. Never a synthesised default. */
  get = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.params.userId;
      const goal = await studentGoalService.getGoal(userId);
      res.json({ goal, status: goal ? 'ACTIVE' : 'NOT_SET' });
    } catch (err) { next(err); }
  };

  /** Creates or updates the goal. Always STUDENT_DECLARED — this route is the student speaking. */
  put = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.params.userId;
      const { errors, kind } = validateGoalInput(req.body || {});
      if (errors.length > 0) {
        return res.status(400).json({ error: 'Invalid goal', details: errors });
      }

      const existing = await studentGoalService.getGoal(userId);
      const goal = await studentGoalService.setGoal(userId, {
        examId: req.body.examId,
        examCycle: req.body.examCycle,
        targetScore: req.body.targetScore != null ? Number(req.body.targetScore) : undefined,
        targetRank: req.body.targetRank != null ? Number(req.body.targetRank) : undefined,
        targetPercentile: req.body.targetPercentile != null ? Number(req.body.targetPercentile) : undefined,
        targetDate: req.body.targetDate,
      }, 'STUDENT_DECLARED');

      // Deterministic identity so a retried save is not counted as two goal changes.
      void eventBus.publish('learning.goal_set', {
        userId,
        created: !existing,
        examId: goal.examId,
        goalKind: kind || 'score',
        occurredAt: Date.now(),
      }, { eventId: `learning.goal_set:${userId}:${goal.updatedAt}` });

      logger.info('[Goal] student goal saved', { userId, created: !existing, goalKind: kind });
      res.json({ goal });
    } catch (err) { next(err); }
  };
}

export const studentGoalController = new StudentGoalController();
