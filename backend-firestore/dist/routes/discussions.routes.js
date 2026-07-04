"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const discussions_controller_1 = require("../controllers/discussions.controller");
const router = (0, express_1.Router)();
const controller = new discussions_controller_1.DiscussionsController();
router.get('/', controller.getDiscussions);
exports.default = router;
