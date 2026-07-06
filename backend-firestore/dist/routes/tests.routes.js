"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const tests_controller_1 = require("../controllers/tests.controller");
const auth_1 = require("../middlewares/auth");
const router = (0, express_1.Router)();
const controller = new tests_controller_1.TestsController();
router.use(auth_1.requireAuth);
// Test Series Endpoints
router.get('/featured', controller.getFeaturedSeries);
router.get('/categories', controller.getCategories);
// Adaptive Tests (scoped to the authenticated user)
router.post('/adaptive/:userId/generate', (0, auth_1.enforceSelf)('userId'), controller.generateAdaptiveTest);
// Attempts & Results
router.get('/attempts/:userId/incomplete', (0, auth_1.enforceSelf)('userId'), controller.getIncompleteAttempts);
router.post('/attempts/:attemptId/submit', controller.submitTestAttempt);
exports.default = router;
