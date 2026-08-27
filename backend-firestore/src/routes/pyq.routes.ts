/**
 * PYQ Routes — Express Router for Previous Year Questions
 */

import { Router } from 'express';
import { pyqController } from '../controllers/pyq.controller';
import { requireAuth } from '../middlewares/auth';

const router = Router();

// Public / Student endpoints
router.get('/matrix', (req, res) => pyqController.getAvailabilityMatrix(req, res));
router.get('/sources', (req, res) => pyqController.listSources(req, res));
router.get('/questions', (req, res) => pyqController.listQuestions(req, res));
router.get('/questions/:questionId', (req, res) => pyqController.getQuestion(req, res));
router.get('/analytics/:examId', (req, res) => pyqController.getAnalytics(req, res));

// Admin / Pipeline endpoints
router.post('/discover/:examId', requireAuth, (req, res) => pyqController.discoverSources(req, res));
router.post('/rights/approve', requireAuth, (req, res) => pyqController.approveRights(req, res));
router.post('/index', requireAuth, (req, res) => pyqController.indexApprovedQuestions(req, res));
router.post('/retrieval-test', requireAuth, (req, res) => pyqController.testRetrieval(req, res));

export default router;
