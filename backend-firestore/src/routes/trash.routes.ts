import { Router } from 'express';
import { TrashController } from '../controllers/trash.controller';
import { requireAuth } from '../middlewares/auth';

const router = Router();
const controller = new TrashController();

// All trash endpoints require authentication. Identity comes from the verified token.
router.use(requireAuth);

router.get('/', controller.list);
router.post('/restore', controller.restore);
router.delete('/', controller.empty);
router.delete('/:type/:id', controller.purge);

export default router;
