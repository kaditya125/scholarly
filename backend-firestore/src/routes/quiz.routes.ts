import { Router } from 'express';
import { QuizController } from '../controllers/quiz.controller';
import { requireAuth } from '../middlewares/auth';

const router = Router();
const controller = new QuizController();

router.use(requireAuth);

// Generate a real, Gemini-authored weak-area quiz AND persist it as an in-progress attempt.
router.get('/', controller.getQuiz);
router.post('/generate', controller.getQuiz);

// Attempt history + progress report. Static paths are declared before the /:id param route.
router.get('/attempts', controller.listAttempts);
router.get('/progress', controller.getProgress);
router.get('/attempts/:id', controller.getAttempt);
router.post('/attempts/:id/submit', controller.submitAttempt);

// Generate a validated remediation micro-drill for a diagnosed prerequisite gap.
router.post('/remediation-drill', controller.generateRemediationDrill);

// Start an attempt from a stored mock test's own questions (no generation).
router.post('/mock-tests/:testId/start', controller.startMockTest);

export default router;
