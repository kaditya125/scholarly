import { Router } from 'express';
import { QuizController } from '../controllers/quiz.controller';
import { requireAuth } from '../middlewares/auth';
import { remediationDrillLimiter } from '../middleware/rateLimiter';

const router = Router();
const controller = new QuizController();

router.use(requireAuth);

// Generate a real, Gemini-authored weak-area quiz AND persist it as an in-progress attempt.
router.get('/', controller.getQuiz);
router.post('/generate', controller.getQuiz);

// Retrieve (never generate) an actual historical paper from the verified PYQ corpus.
router.get('/canonical-paper', controller.getCanonicalPaperQuiz);

// Structured, exam-scoped weak areas (examId + syllabusNodeId), for wiring a real weak-area drill.
router.get('/weak-areas', controller.getWeakAreas);

// The exam's real drillable topics, ranked by genuine PYQ frequency (dashboard drill cards).
router.get('/drill-topics', controller.getDrillTopics);

// Attempt history + progress report. Static paths are declared before the /:id param route.
router.get('/attempts', controller.listAttempts);
router.get('/progress', controller.getProgress);
router.get('/attempts/:id', controller.getAttempt);
router.post('/attempts/:id/submit', controller.submitAttempt);
// "Fix this gap": generate (once) the remediation drill for one diagnosis on the caller's own attempt.
router.post('/attempts/:id/remediation-drill', remediationDrillLimiter, controller.createRemediationDrill);

// Start an attempt from a stored mock test's own questions (no generation).
router.post('/mock-tests/:testId/start', controller.startMockTest);

export default router;
