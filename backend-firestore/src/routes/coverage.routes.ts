import { Router, Request, Response } from 'express';
import { requireAuth } from '../middlewares/auth';
import {
  getSyllabusCoverage, getCoverageSubtree, pruneToDepth, COVERAGE_THRESHOLDS,
} from '../services/learning/syllabusCoverage.service';
import { logger } from '../utils/logger';

/**
 * Stage 3 — syllabus coverage.
 *
 * ── The user id is never taken from the request ─────────────────────────────────────────────
 * Coverage is private learning data. The uid comes from the verified token and nothing else: a
 * client-supplied userId is not read, so there is no parameter through which one student could
 * request another's progress. Exam scoping is separate and additional — a validated node id
 * carries its own exam, so a JEE node cannot appear under SSC even for the right user.
 */

const router = Router();

/**
 * GET /api/coverage/:examId
 *
 * `?depth=2` returns the summary and subject rows only. A phone opening UPSC CSE would otherwise
 * receive all 2,120 nodes to render four collapsed rows; the totals are identical either way
 * because they are computed over the full tree before pruning.
 */
router.get('/:examId', requireAuth, async (req: Request, res: Response) => {
  const userId = req.user?.uid;
  if (!userId) return res.status(401).json({ error: 'unauthenticated' });

  const { examId } = req.params;
  const depth = req.query.depth ? Number(req.query.depth) : undefined;
  const syllabusId = typeof req.query.syllabusId === 'string' ? req.query.syllabusId : undefined;

  try {
    const started = Date.now();
    const full = await getSyllabusCoverage(userId, examId, { syllabusId });
    const payload = depth && Number.isFinite(depth) && depth > 0 ? pruneToDepth(full, depth) : full;
    res.set('Cache-Control', 'private, no-store');   // mastery changes on every attempt
    return res.json({ ...payload, thresholds: COVERAGE_THRESHOLDS, tookMs: Date.now() - started });
  } catch (err: any) {
    logger.error('[Coverage] request failed', { userId, examId, error: err?.message });
    return res.status(500).json({ error: 'coverage_unavailable' });
  }
});

/** GET /api/coverage/:examId/node/:nodeId — one subtree, for lazy expansion. */
router.get('/:examId/node/*', requireAuth, async (req: Request, res: Response) => {
  const userId = req.user?.uid;
  if (!userId) return res.status(401).json({ error: 'unauthenticated' });

  // Canonical ids contain colons and slashes are encoded, so the id is taken as a wildcard tail
  // rather than a single path segment.
  const nodeId = decodeURIComponent(String((req.params as any)[0] || ''));
  if (!nodeId) return res.status(400).json({ error: 'node_id_required' });

  try {
    const node = await getCoverageSubtree(userId, req.params.examId, nodeId);
    if (!node) return res.status(404).json({ error: 'node_not_found_for_exam' });
    res.set('Cache-Control', 'private, no-store');
    return res.json(node);
  } catch (err: any) {
    logger.error('[Coverage] subtree failed', { userId, examId: req.params.examId, error: err?.message });
    return res.status(500).json({ error: 'coverage_unavailable' });
  }
});

export default router;
