import { Router, Request, Response } from 'express';
import { requireAuth } from '../middlewares/auth';
import { canonicalPreTestService } from '../services/assessment/canonicalPreTest.service';
import { SyllabusUnavailableError } from '../types/canonicalAssessment.types';
import { logger } from '../utils/logger';

/**
 * J.7.1 — the canonical, syllabus-backed assessment endpoint.
 *
 * The ONLY way to obtain an exam-specific pre-test. It resolves a verified CURRENT syllabus for the
 * exact exam + cycle before a single question exists, and returns NO_CANONICAL_SYLLABUS when there
 * isn't one. There is deliberately no query parameter, header or body field that can relax that:
 * a caller cannot ask for "a general test instead", because offering one is the substitution this
 * gate exists to prevent.
 */
const router = Router();
router.use(requireAuth);

/**
 * POST /api/assessment/pretest
 * Body: { examId, cycleId, questionCount?, language? }
 *
 * `studentId` is taken from the verified token and NEVER from the body — accepting it as input
 * would let any authenticated caller generate and persist an assessment onto another student's
 * record. Same reasoning as `enforceSelf` on the baseline routes, expressed by not having the
 * parameter at all.
 */
router.post('/pretest', async (req: Request, res: Response) => {
  const studentId = (req as any).user?.uid;
  if (!studentId) return res.status(401).json({ error: 'Unauthorized' });

  const examId = String(req.body?.examId ?? '').trim();
  const cycleId = String(req.body?.cycleId ?? '').trim();
  if (!examId || !cycleId) {
    // Both are mandatory and neither is ever defaulted. Guessing a cycle would silently test the
    // student against a different year's syllabus.
    return res.status(400).json({
      error: 'examId and cycleId are both required',
      detail: 'An assessment is anchored to an exact exam and cycle; neither is inferred.',
    });
  }

  const rawCount = Number(req.body?.questionCount);
  const questionCount = Number.isFinite(rawCount)
    ? Math.min(Math.max(Math.trunc(rawCount), 1), 50) : 10;

  try {
    const result = await canonicalPreTestService.generatePreTest({
      studentId, examId, cycleId, questionCount,
      language: typeof req.body?.language === 'string' ? req.body.language : 'English',
    });

    if (result.outcome === 'GENERATED') {
      return res.status(201).json({
        outcome: 'GENERATED',
        attemptId: result.attemptId,
        questionCount: result.questionCount,
        // The audit trail: exactly which syllabus version and which canonical nodes this test came
        // from, so "why was this asked?" is answerable without re-deriving anything.
        examId: result.request.examId,
        cycleId: result.request.cycleId,
        syllabusId: result.request.syllabusId,
        syllabusVersion: result.request.syllabusVersion,
        requestId: result.request.requestId,
        nodeIdsUsed: result.nodeIdsUsed,
      });
    }

    if (result.outcome === 'NO_CANONICAL_SYLLABUS') {
      // 409, not 404 and not 500: the exam exists and the platform is healthy — the verified
      // syllabus this assessment must be built from does not exist yet. `reason` is for operators;
      // `message` is the only text safe to show a student.
      return res.status(409).json({
        outcome: 'NO_CANONICAL_SYLLABUS',
        examId: result.examId, cycleId: result.cycleId,
        reason: result.reason,
        message: result.studentMessage,
      });
    }

    // FAILED — generation or canonical validation broke after a syllabus WAS resolved. A real
    // fault, surfaced rather than papered over with an unanchored test.
    return res.status(502).json({
      outcome: 'FAILED', examId: result.examId, cycleId: result.cycleId, reason: result.reason,
    });
  } catch (err: any) {
    if (err instanceof SyllabusUnavailableError) {
      // Infrastructure, not data. Kept distinct from 409 so a Firestore outage can never be read
      // as "this exam has no syllabus".
      logger.error('[CanonicalAssessment] syllabus resolution unavailable', {
        studentId, examId, cycleId, error: err.message,
      });
      return res.status(503).json({
        outcome: 'UNAVAILABLE',
        message: 'We could not check the syllabus for this exam just now. Please try again shortly.',
      });
    }
    logger.error('[CanonicalAssessment] pre-test generation failed', {
      studentId, examId, cycleId, error: err?.message,
    });
    return res.status(500).json({ error: 'Failed to generate assessment' });
  }
});

export default router;
