import { Router } from 'express';
import { savedMessageController } from '../controllers/savedMessage.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

router.use(requireAuth);

router.get('/', savedMessageController.list);
router.get('/ids', savedMessageController.getIds);
router.post('/', savedMessageController.save);
router.delete('/:id', savedMessageController.remove);

export default router;
