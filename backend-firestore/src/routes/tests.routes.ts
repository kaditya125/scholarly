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
/*
 * No enforceSelf, and that is not an omission — the parameter here is an ATTEMPT id, so there is
 * no user id in the path for the middleware to compare against. Ownership is enforced one layer
 * down, in resultAnalysisService.processSubmission, which takes the authenticated uid as a
 * required argument and 404s when the attempt is missing OR belongs to someone else.
 */
router.post('/attempts/:attemptId/submit', controller.submitTestAttempt);

export default router;
