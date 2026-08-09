import { Router } from 'express';
import { doubtsController } from '../controllers/doubts.controller';
import { requireAuth } from '../middlewares/auth';

const router = Router();

router.use(requireAuth);

// Saved scanned questions (revision notebook / mistake book). Self-scoped via req.user.uid.
router.post('/', doubtsController.create);
router.get('/', doubtsController.list);
router.get('/:id', doubtsController.get);
router.patch('/:id', doubtsController.update);
router.delete('/:id', doubtsController.remove);

export default router;
