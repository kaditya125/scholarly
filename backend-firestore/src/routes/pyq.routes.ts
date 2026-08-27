/**
 * PYQ Routes — Express Router for Previous Year Questions
 */

import { Router } from 'express';
import { pyqController } from '../controllers/pyq.controller';
import { requireAuth } from '../middlewares/auth';

const router = Router();

// Public / Student endpoints
/*
 * These read endpoints return question CONTENT, including the governance fields each record
 * asserts about itself. They were unauthenticated, which would have published the whole corpus —
 * currently 774 questions that self-certify as OFFICIAL_CONFIRMED while citing source URLs that
 * all 404 — on a public API, bypassing the Stage 7 eligibility gate entirely.
 *
 * requireAuth is the smaller, safer of the two available fixes: it does not change what the
 * operator tooling can see, and it stops the corpus being served to anyone who finds the route.
 * It is NOT a substitute for the eligibility gate — nothing here is student-facing, and no
 * student surface may read these endpoints in place of asking pyqEligibility.
 */
router.get('/matrix', requireAuth, (req, res) => pyqController.getAvailabilityMatrix(req, res));
router.get('/sources', requireAuth, (req, res) => pyqController.listSources(req, res));
router.get('/questions', requireAuth, (req, res) => pyqController.listQuestions(req, res));
router.get('/questions/:questionId', requireAuth, (req, res) => pyqController.getQuestion(req, res));
router.get('/analytics/:examId', requireAuth, (req, res) => pyqController.getAnalytics(req, res));

// Admin / Pipeline endpoints
router.post('/discover/:examId', requireAuth, (req, res) => pyqController.discoverSources(req, res));
router.post('/rights/approve', requireAuth, (req, res) => pyqController.approveRights(req, res));
router.post('/index', requireAuth, (req, res) => pyqController.indexApprovedQuestions(req, res));
router.post('/retrieval-test', requireAuth, (req, res) => pyqController.testRetrieval(req, res));

export default router;
