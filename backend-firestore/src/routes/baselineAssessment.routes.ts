import { Router } from 'express';
import { baselineAssessmentController } from '../controllers/baselineAssessment.controller';

const router = Router();

// GET /api/assessment/baseline/start/:userId
router.get('/start/:userId', baselineAssessmentController.startOrResume);

// POST /api/assessment/baseline/next-batch/:userId
router.post('/next-batch/:userId', baselineAssessmentController.getNextBatch);

// POST /api/assessment/baseline/submit/:userId
router.post('/submit/:userId', baselineAssessmentController.submitAssessment);

// GET /api/assessment/baseline/digital-twin/:userId
router.get('/digital-twin/:userId', baselineAssessmentController.getDigitalTwin);

export default router;
