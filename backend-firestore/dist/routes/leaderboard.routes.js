"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const leaderboard_controller_1 = require("../controllers/leaderboard.controller");
const router = (0, express_1.Router)();
const controller = new leaderboard_controller_1.LeaderboardController();
router.get('/', controller.getLeaderboard);
exports.default = router;
