import { Router, Request, Response } from 'express';
import { requireAuth } from '../middlewares/auth';
import { generateDailyPlan, PLANNER_WEIGHTS, REVIEW_INTERVAL_DAYS } from '../services/learning/studyPlanner.service';
import { PlannerRepository } from '../repositories/planner.repository';
import { logger } from '../utils/logger';

/**
 * Stage 4 — the deterministic daily plan.
 *
 * The uid comes from the verified token, never the request: a plan is private learning data and
 * there is no parameter through which one student could request another's.
 *
 * Exam date and study time are read from the student's EXISTING study goal rather than from a new
 * settings surface — a second source of truth for "when is your exam" would eventually disagree
 * with the first, and the student would have no way to tell which one their plan used.
 */
const router = Router();
const planner = new PlannerRepository();

router.get('/today', requireAuth, async (req: Request, res: Response) => {
  const userId = req.user?.uid;
  if (!userId) return res.status(401).json({ error: 'unauthenticated' });

  const examIdParam = typeof req.query.examId === 'string' ? req.query.examId : undefined;

  try {
    const goal = await planner.getGoalByUserId(userId).catch(() => null);
    const examId = examIdParam || goal?.targetExam;
    if (!examId) {
      return res.status(400).json({ error: 'no_target_exam', detail: 'Set a target exam to get a plan.' });
    }

    /*
     * weeklyHours is what the existing goal model stores, so daily minutes are derived from it
     * rather than invented. An explicit override is allowed for a student who wants today to be
     * shorter or longer than their usual week.
     */
    const override = req.query.minutes ? Number(req.query.minutes) : undefined;
    const dailyMinutes = Number.isFinite(override) && override! > 0
      ? Math.min(override!, 600)
      : Math.round(((goal?.weeklyHours ?? 7) * 60) / 7);

    const plan = await generateDailyPlan({
      userId, examId, examDate: goal?.examDate ?? null, dailyMinutes,
    });

    res.set('Cache-Control', 'private, no-store');   // mastery moves; a cached plan goes stale fast
    return res.json({ ...plan, model: { weights: PLANNER_WEIGHTS, reviewIntervalDays: REVIEW_INTERVAL_DAYS } });
  } catch (err: any) {
    logger.error('[Planner] daily plan failed', { userId, error: err?.message });
    return res.status(500).json({ error: 'plan_unavailable' });
  }
});

export default router;
