import { Router } from 'express';
import { dmController } from '../controllers/dm.controller';
import { requireAuth } from '../middlewares/auth';

const router = Router();

router.use(requireAuth);

// Static routes first so they aren't shadowed by the `:otherId` param route.
router.get('/conversations', dmController.conversations);
router.get('/unread', dmController.unread);

// Thread + actions for a specific peer.
router.get('/conversations/:otherId', dmController.thread);
router.get('/conversations/:otherId/pins', dmController.pins);
router.post('/conversations/:otherId/messages', dmController.send);
router.post('/conversations/:otherId/messages/:messageId/react', dmController.react);
router.post('/conversations/:otherId/messages/:messageId/pin', dmController.pin);
router.patch('/conversations/:otherId/messages/:messageId', dmController.edit);
router.delete('/conversations/:otherId/messages/:messageId', dmController.remove);
router.post('/conversations/:otherId/read', dmController.markRead);

export default router;
