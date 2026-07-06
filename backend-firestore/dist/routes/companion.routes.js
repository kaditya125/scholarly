"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const companion_controller_1 = require("../controllers/companion.controller");
const auth_1 = require("../middlewares/auth");
const router = (0, express_1.Router)();
// Endpoint for Cloud Scheduler / CRON to hit nightly.
// Protected by a shared secret (env.CRON_SECRET) rather than a user token.
router.post('/evaluate', auth_1.requireCronSecret, companion_controller_1.companionController.runNightlyEvaluation);
exports.default = router;
