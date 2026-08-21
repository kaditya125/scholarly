/**
 * Exam Intelligence Routes
 * Exposes canonical exam registry, cycles, official sources, and versioned syllabus endpoints.
 */

import { Router, Request, Response } from 'express';
import { examMasterService } from '../services/exam/examMaster.service';
import { requireAuth } from '../middlewares/auth';
import { ExamCategory, ExamStatus } from '../types/exam.types';

const router = Router();

// Middleware to enforce Admin role for write operations
const requireAdminRole = (req: Request, res: Response, next: Function) => {
  const user = req.user;
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const role = user.role || (user as any).customClaims?.role;
  const adminRoles = ['admin', 'super_admin', 'moderator', 'content_manager'];
  if (!role || !adminRoles.includes(role)) {
    return res.status(403).json({ error: 'Forbidden: requires admin privileges' });
  }
  next();
};

// ─── Public / Student Endpoints ──────────────────────────────────────────────

/**
 * GET /api/exams
 * Lists supported exams with optional category / status filters.
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const category = req.query.category as ExamCategory | undefined;
    const status = (req.query.status as ExamStatus) || 'ACTIVE';
    const exams = await examMasterService.listExams({ category, status });
    res.json({ exams });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to list exams' });
  }
});

/**
 * GET /api/exams/resolve/:query
 * Resolves a query or alias to canonical exam (e.g. "cgl" -> SSC_CGL).
 */
router.get('/resolve/:query', async (req: Request, res: Response) => {
  try {
    const exam = await examMasterService.resolveExam(req.params.query);
    if (!exam) {
      return res.status(404).json({ error: 'Exam not found for query' });
    }
    res.json({ exam });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to resolve exam' });
  }
});

/**
 * GET /api/exams/:examId
 * Retrieves full details for a specific examination.
 */
router.get('/:examId', async (req: Request, res: Response) => {
  try {
    const exam = await examMasterService.getExam(req.params.examId);
    if (!exam) {
      return res.status(404).json({ error: `Exam '${req.params.examId}' not found` });
    }
    res.json({ exam });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to get exam' });
  }
});

/**
 * GET /api/exams/:examId/cycles
 * Lists available examination cycles (e.g. 2025, 2026).
 */
router.get('/:examId/cycles', async (req: Request, res: Response) => {
  try {
    const cycles = await examMasterService.listCycles(req.params.examId);
    res.json({ cycles });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to list cycles' });
  }
});

/**
 * GET /api/exams/:examId/sources
 * Lists verified official sources for an examination.
 */
router.get('/:examId/sources', async (req: Request, res: Response) => {
  try {
    const verifiedOnly = req.query.verifiedOnly !== 'false';
    const sources = await examMasterService.listOfficialSources(req.params.examId, {
      activeOnly: true,
      verifiedOnly,
    });
    res.json({ sources });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to list official sources' });
  }
});

/**
 * GET /api/exams/:examId/syllabus
 * Retrieves the current active canonical syllabus for an exam (optional ?cycleId=2026).
 */
router.get('/:examId/syllabus', async (req: Request, res: Response) => {
  try {
    const cycleId = req.query.cycleId as string | undefined;
    const syllabus = await examMasterService.getCurrentSyllabus(req.params.examId, cycleId);
    if (!syllabus) {
      return res.status(404).json({ error: 'No active syllabus found for specified exam and cycle' });
    }
    res.json({ syllabus });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to get current syllabus' });
  }
});

/**
 * GET /api/exams/:examId/syllabi
 * Lists all syllabus versions for an examination.
 */
router.get('/:examId/syllabi', async (req: Request, res: Response) => {
  try {
    const cycleId = req.query.cycleId as string | undefined;
    const syllabi = await examMasterService.listSyllabi(req.params.examId, cycleId);
    res.json({ syllabi });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to list syllabus versions' });
  }
});

// ─── Admin Endpoints ─────────────────────────────────────────────────────────

/**
 * POST /api/exams/admin
 * Creates a new canonical examination entry.
 */
router.post('/admin', requireAuth, requireAdminRole, async (req: Request, res: Response) => {
  try {
    const performedBy = req.user?.uid || 'admin';
    const exam = await examMasterService.createExam(req.body, performedBy);
    res.status(201).json({ exam });
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to create exam' });
  }
});

/**
 * PUT /api/exams/admin/:examId
 * Updates master examination fields.
 */
router.put('/admin/:examId', requireAuth, requireAdminRole, async (req: Request, res: Response) => {
  try {
    const performedBy = req.user?.uid || 'admin';
    const exam = await examMasterService.updateExam(req.params.examId, req.body, performedBy);
    res.json({ exam });
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to update exam' });
  }
});

/**
 * POST /api/exams/admin/:examId/cycles
 * Adds a new examination cycle.
 */
router.post('/admin/:examId/cycles', requireAuth, requireAdminRole, async (req: Request, res: Response) => {
  try {
    const performedBy = req.user?.uid || 'admin';
    const cycle = await examMasterService.createCycle(req.params.examId, req.body, performedBy);
    res.status(201).json({ cycle });
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to create cycle' });
  }
});

/**
 * POST /api/exams/admin/:examId/sources
 * Registers and verifies an official source URL.
 */
router.post('/admin/:examId/sources', requireAuth, requireAdminRole, async (req: Request, res: Response) => {
  try {
    const performedBy = req.user?.uid || 'admin';
    const source = await examMasterService.addOfficialSource(req.params.examId, req.body, performedBy);
    res.status(201).json({ source });
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to add official source' });
  }
});

/**
 * POST /api/exams/admin/:examId/syllabi
 * Creates a new versioned syllabus structure (in DRAFT status).
 */
router.post('/admin/:examId/syllabi', requireAuth, requireAdminRole, async (req: Request, res: Response) => {
  try {
    const performedBy = req.user?.uid || 'admin';
    const cycleId = req.body.cycleId || new Date().getFullYear().toString();
    const syllabus = await examMasterService.createSyllabusVersion(req.params.examId, cycleId, req.body, performedBy);
    res.status(201).json({ syllabus });
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to create syllabus version' });
  }
});

/**
 * POST /api/exams/admin/:examId/syllabi/:syllabusId/publish
 * Publishes a syllabus version as CURRENT and supersedes previous versions.
 */
router.post('/admin/:examId/syllabi/:syllabusId/publish', requireAuth, requireAdminRole, async (req: Request, res: Response) => {
  try {
    const performedBy = req.user?.uid || 'admin';
    const cycleId = req.body.cycleId;
    if (!cycleId) {
      return res.status(400).json({ error: 'cycleId is required to publish syllabus' });
    }
    await examMasterService.publishSyllabusVersion(req.params.examId, cycleId, req.params.syllabusId, performedBy);
    res.json({ ok: true, message: `Syllabus '${req.params.syllabusId}' is now CURRENT for ${req.params.examId} ${cycleId}` });
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to publish syllabus' });
  }
});

/**
 * POST /api/exams/admin/:examId/syllabi/extract
 * Extracts and normalizes raw syllabus text into canonical ExamStage[] JSON using structured LLM.
 */
router.post('/admin/:examId/syllabi/extract', requireAuth, requireAdminRole, async (req: Request, res: Response) => {
  try {
    const { rawText } = req.body;
    if (!rawText || typeof rawText !== 'string') {
      return res.status(400).json({ error: 'rawText is required' });
    }
    const exam = await examMasterService.getExam(req.params.examId);
    if (!exam) {
      return res.status(404).json({ error: `Exam '${req.params.examId}' not found` });
    }
    const { syllabusIngestionService } = await import('../services/exam/syllabusIngestion.service');
    // Returns structure WITHOUT canonical ids — a preview has no syllabus version to derive them
    // from, and emitting plausible-looking ids an admin might reuse would be worse than emitting
    // none. `canonical: false` says so in the payload rather than only in the docs.
    const result = await syllabusIngestionService.previewSyllabusStructure(exam, rawText);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to extract syllabus' });
  }
});

/**
 * POST /api/exams/admin/:examId/syllabi/diff
 * Generates diff report between two syllabus versions or between a draft and the current version.
 */
router.post('/admin/:examId/syllabi/diff', requireAuth, requireAdminRole, async (req: Request, res: Response) => {
  try {
    const { baseSyllabusId, targetSyllabus } = req.body;
    const { syllabusDiffService } = await import('../services/exam/syllabusDiff.service');
    const { examRepository } = await import('../repositories/exam.repository');

    const baseSyllabus = await examRepository.getSyllabusById(baseSyllabusId);
    if (!baseSyllabus) {
      return res.status(404).json({ error: `Base syllabus '${baseSyllabusId}' not found` });
    }

    const diffReport = syllabusDiffService.compare(baseSyllabus, targetSyllabus);
    res.json({ diff: diffReport });
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to compute syllabus diff' });
  }
});

/**
 * POST /api/exams/admin/:examId/syllabi/:syllabusId/index
 * Indexes published syllabus into Pinecone vector database and builds syllabus knowledge graph.
 */
router.post('/admin/:examId/syllabi/:syllabusId/index', requireAuth, requireAdminRole, async (req: Request, res: Response) => {
  try {
    const performedBy = req.user?.uid || 'admin';
    const { examRepository } = await import('../repositories/exam.repository');
    const { syllabusIngestionService } = await import('../services/exam/syllabusIngestion.service');
    const { syllabusGraphService } = await import('../services/exam/syllabusGraph.service');

    const syllabus = await examRepository.getSyllabusById(req.params.syllabusId);
    if (!syllabus) {
      return res.status(404).json({ error: `Syllabus '${req.params.syllabusId}' not found` });
    }

    const vectorCount = await syllabusIngestionService.indexSyllabusToVectorDb(syllabus, performedBy);
    const graphStats = await syllabusGraphService.buildSyllabusGraph(syllabus);

    res.json({ ok: true, vectorCount, graphStats });
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to index syllabus' });
  }
});

/**
 * ─────────────────────────────────────────────────────────────
 * Phase 3 Endpoints: Notification, Timeline & Eligibility
 * ─────────────────────────────────────────────────────────────
 */

/**
 * GET /api/exams/:examId/notification
 * Retrieves active official notification, important dates, and vacancies.
 */
router.get('/:examId/notification', async (req: Request, res: Response) => {
  try {
    const { notificationTimelineService } = await import('../services/exam/notificationTimeline.service');
    const cycleId = req.query.cycleId as string | undefined;
    const notif = await notificationTimelineService.getActiveNotification(req.params.examId, cycleId);
    if (!notif) {
      return res.status(404).json({ error: 'No active notification found for this examination cycle' });
    }
    res.json({ notification: notif });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch notification' });
  }
});

/**
 * GET /api/exams/:examId/timeline
 * Computes active timeline countdowns (application deadline, exam dates, results).
 */
router.get('/:examId/timeline', async (req: Request, res: Response) => {
  try {
    const { notificationTimelineService } = await import('../services/exam/notificationTimeline.service');
    const cycleId = req.query.cycleId as string | undefined;
    const notif = await notificationTimelineService.getActiveNotification(req.params.examId, cycleId);
    if (!notif) {
      return res.json({ timeline: [] });
    }
    const timeline = notificationTimelineService.computeTimeline(notif);
    res.json({ timeline });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to compute timeline' });
  }
});

/**
 * POST /api/exams/:examId/eligibility
 * Evaluates candidate eligibility (age on cutoff, category relaxations, degree, post qualification).
 */
router.post('/:examId/eligibility', async (req: Request, res: Response) => {
  try {
    const { notificationTimelineService } = await import('../services/exam/notificationTimeline.service');
    const { eligibilityCheckerService } = await import('../services/exam/eligibilityChecker.service');

    const cycleId = req.body.cycleId;
    const notif = await notificationTimelineService.getActiveNotification(req.params.examId, cycleId);
    if (!notif) {
      return res.status(404).json({ error: 'No active notification found to evaluate eligibility against' });
    }

    const evaluation = eligibilityCheckerService.evaluateEligibility(notif, req.body);
    res.json({ evaluation });
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to evaluate eligibility' });
  }
});

/**
 * POST /api/exams/admin/:examId/notifications/extract
 * Extracts structured notification parameters from raw notice text using structured LLM.
 */
router.post('/admin/:examId/notifications/extract', requireAuth, requireAdminRole, async (req: Request, res: Response) => {
  try {
    const { rawText, cycleId, sourceUrl } = req.body;
    if (!rawText || typeof rawText !== 'string') {
      return res.status(400).json({ error: 'rawText is required' });
    }
    const exam = await examMasterService.getExam(req.params.examId);
    if (!exam) {
      return res.status(404).json({ error: `Exam '${req.params.examId}' not found` });
    }

    const { notificationTimelineService } = await import('../services/exam/notificationTimeline.service');
    const targetCycle = cycleId || exam.currentCycle || new Date().getFullYear().toString();
    const result = await notificationTimelineService.extractNotificationData(
      exam,
      targetCycle,
      rawText,
      sourceUrl || exam.verifiedOfficialUrls.authorityHome
    );
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to extract notification data' });
  }
});

/**
 * POST /api/exams/admin/:examId/notifications
 * Creates or updates an official examination notification.
 */
router.post('/admin/:examId/notifications', requireAuth, requireAdminRole, async (req: Request, res: Response) => {
  try {
    const performedBy = req.user?.uid || 'admin';
    const cycleId = req.body.cycleId || new Date().getFullYear().toString();
    const { notificationTimelineService } = await import('../services/exam/notificationTimeline.service');

    const notification = await notificationTimelineService.saveNotification(
      req.params.examId,
      cycleId,
      req.body,
      performedBy
    );
    res.status(201).json({ notification });
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to save notification' });
  }
});

/**
 * POST /api/exams/admin/:examId/documents/archive-url
 * Fetches an official PDF from a verified source URL and permanently stores it in Firebase Storage.
 */
router.post('/admin/:examId/documents/archive-url', requireAuth, requireAdminRole, async (req: Request, res: Response) => {
  try {
    const { cycleId, docType, sourceUrl } = req.body;
    if (!sourceUrl || !cycleId || !docType) {
      return res.status(400).json({ error: 'sourceUrl, cycleId, and docType are required' });
    }

    const { examDocumentStorageService } = await import('../services/exam/examDocumentStorage.service');
    const archived = await examDocumentStorageService.archiveFromUrl({
      examId: req.params.examId,
      cycleId,
      docType,
      sourceUrl,
    });

    res.json({ archived });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to archive document to Firebase Storage' });
  }
});

export default router;
