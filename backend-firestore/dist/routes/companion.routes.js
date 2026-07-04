"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const companion_controller_1 = require("../controllers/companion.controller");
const router = (0, express_1.Router)();
// Endpoint for Cloud Scheduler / CRON to hit nightly
router.post('/evaluate', companion_controller_1.companionController.runNightlyEvaluation);
exports.default = router;
