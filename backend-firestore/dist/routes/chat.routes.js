"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const chat_controller_1 = require("../controllers/chat.controller");
const auth_1 = require("../middlewares/auth");
const router = (0, express_1.Router)();
const controller = new chat_controller_1.ChatController();
// All chat endpoints require authentication. The user identity is taken from the
// verified token (req.user.uid), never from the request body/query.
router.use(auth_1.requireAuth);
router.post('/', controller.handleChat);
router.post('/stream', controller.handleChatStream);
router.get('/sessions', controller.getUserSessions);
router.get('/sessions/:sessionId', controller.getSessionHistory);
router.delete('/sessions/:sessionId', controller.deleteSession);
exports.default = router;
