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

export default router;
