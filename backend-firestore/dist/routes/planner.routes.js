"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const planner_controller_1 = require("../controllers/planner.controller");
const router = (0, express_1.Router)();
const controller = new planner_controller_1.PlannerController();
router.get('/', controller.getTasks);
exports.default = router;
