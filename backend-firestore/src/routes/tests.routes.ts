import { Router } from 'express';
import { TestsController } from '../controllers/tests.controller';
import { requireAuth, enforceSelf } from '../middlewares/auth';

const router = Router();
const controller = new TestsController();

router.use(requireAuth);

// Test Series Endpoints
router.get('/featured', controller.getFeaturedSeries);
router.get('/categories', controller.getCategories);

// Adaptive Tests (scoped to the authenticated user)
router.post('/adaptive/:userId/generate', enforceSelf('userId'), controller.generateAdaptiveTest);

// Attempts & Results
router.get('/attempts/:userId/incomplete', enforceSelf('userId'), controller.getIncompleteAttempts);
router.post('/attempts/:attemptId/submit', controller.submitTestAttempt);

export default router;
