"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const tests_controller_1 = require("../controllers/tests.controller");
const router = (0, express_1.Router)();
const controller = new tests_controller_1.TestsController();
router.get('/', controller.getTests);
exports.default = router;
