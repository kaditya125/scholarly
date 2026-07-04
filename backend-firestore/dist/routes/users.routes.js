"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const userStats_controller_1 = require("../controllers/userStats.controller");
const router = (0, express_1.Router)();
const controller = new userStats_controller_1.UserStatsController();
router.get('/:userId/stats', controller.getUserStats);
exports.default = router;
