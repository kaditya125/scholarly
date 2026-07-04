import { Router } from 'express';
import { ChatController } from '../controllers/chat.controller';

const router = Router();
const controller = new ChatController();

router.post('/', controller.handleChat);
router.post('/stream', controller.handleChatStream);
router.get('/sessions', controller.getUserSessions);
router.get('/sessions/:sessionId', controller.getSessionHistory);
router.delete('/sessions/:sessionId', controller.deleteSession);

export default router;
