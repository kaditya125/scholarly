import { Router } from 'express';
import { baselineAssessmentController } from '../controllers/baselineAssessment.controller';
import { requireAuth, enforceSelf } from '../middlewares/auth';

const router = Router();

/**
 * SECURITY (Phase 0): every route here takes `:userId` straight from the URL and the
 * router previously had no authentication at all — so any caller could read or overwrite
 * any student's assessment, and read their Digital Twin (psychometric profile, predicted
 * scores, behavioural analysis). `submitAssessment` also regenerates the Digital Twin and
 * flips the profile to complete, so it was a write primitive too.
 *
 * requireAuth verifies the Firebase ID token; enforceSelf asserts the authenticated uid
 * matches the `:userId` in the path. Both already existed — nothing new is introduced and
 * no assessment behaviour, scoring or engine logic is touched.
 */
router.use(requireAuth);

// GET /api/baseline-assessment/start/:userId
router.get('/start/:userId', enforceSelf('userId'), baselineAssessmentController.startOrResume);

// POST /api/baseline-assessment/next-batch/:userId
router.post('/next-batch/:userId', enforceSelf('userId'), baselineAssessmentController.getNextBatch);

// POST /api/baseline-assessment/submit/:userId
router.post('/submit/:userId', enforceSelf('userId'), baselineAssessmentController.submitAssessment);

// GET /api/baseline-assessment/digital-twin/:userId
router.get('/digital-twin/:userId', enforceSelf('userId'), baselineAssessmentController.getDigitalTwin);

export default router;
