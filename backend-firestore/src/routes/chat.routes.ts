import { Router } from 'express';
import { ChatController } from '../controllers/chat.controller';
import { requireAuth } from '../middlewares/auth';

const router = Router();
const controller = new ChatController();

// All chat endpoints require authentication. The user identity is taken from the
// verified token (req.user.uid), never from the request body/query.
router.use(requireAuth);

router.post('/', controller.handleChat);
router.post('/stream', controller.handleChatStream);
router.get('/sessions', controller.getUserSessions);
router.get('/sessions/:sessionId', controller.getSessionHistory);
router.delete('/sessions/:sessionId', controller.deleteSession);

export default router;
