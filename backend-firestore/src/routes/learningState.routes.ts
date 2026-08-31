import { Router, Request, Response } from 'express';
import { requireAuth } from '../middlewares/auth';
import {
  learningStateService, MIN_TOPIC_EVIDENCE, WEAK_ACCURACY, STRONG_ACCURACY,
} from '../services/learningState.service';
import { logger } from '../utils/logger';

/**
 * Gate 8 — the measured learning state.
 *
 * LearningStateService was built and then never mounted, so nothing outside the process could
 * read it. This exposes it, unchanged.
 *
 * ── WHAT MAKES THIS SAFE TO EXPOSE WHILE MASTERY IS OFF ───────────────────────────────────
 * Every measurement it reports carries explicit availability semantics: a metric is either
 * `available` with a confidence and its evidence, or `insufficient` with the reason. With
 * ENABLE_MASTERY off it says so in the reason ("no mastery record (ENABLE_MASTERY may be off…)")
 * rather than reporting a zero. That distinction is the point of the service — "not measured"
 * and "measured as zero" are different claims about a student, and only one of them is true here.
 *
 * ── THE USER ID IS NEVER TAKEN FROM THE REQUEST ───────────────────────────────────────────
 * This is private learning data — weaknesses, accuracy, goal gap. The uid comes from the verified
 * token and nothing else, matching coverage.routes: there is no parameter through which one
 * student could request another's state.
 *
 * ── WHY THIS IS READ-ONLY ─────────────────────────────────────────────────────────────────
 * The service composes what other systems already measured (quizAttempts, MasteryEngine,
 * UserStats, StudentGoal) and writes nothing. GET only, and deliberately no route that could
 * mutate state — a measurement surface that can also write is one refactor away from becoming a
 * second source of truth for numbers it was built to report.
 */

const router = Router();

/**
 * GET /api/learning-state
 *
 * Returns the composed state for the signed-in student: observations, analysis, and the goal-gap
 * and priority decisions, each metric carrying its own status, confidence and evidence.
 *
 * The thresholds it measured against are returned alongside so a client renders the same
 * definition of "weak" the server applied. A second copy on the client would drift, and a UI
 * disagreeing with the evidence it is displaying is worse than no UI.
 */
router.get('/', requireAuth, async (req: Request, res: Response) => {
  const userId = req.user?.uid;
  if (!userId) return res.status(401).json({ error: 'unauthenticated' });

  try {
    const started = Date.now();
    const state = await learningStateService.getLearningState(userId);

    // Changes on every graded attempt, and it is per-student — never cache it anywhere shared.
    res.set('Cache-Control', 'private, no-store');
    return res.json({
      ...state,
      thresholds: { MIN_TOPIC_EVIDENCE, WEAK_ACCURACY, STRONG_ACCURACY },
      tookMs: Date.now() - started,
    });
  } catch (err: any) {
    logger.error('[LearningState] request failed', { userId, error: err?.message });
    return res.status(500).json({ error: 'learning_state_unavailable' });
  }
});

export default router;
