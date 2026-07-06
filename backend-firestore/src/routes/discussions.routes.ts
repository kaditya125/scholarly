import { Router } from 'express';
import { DiscussionsController } from '../controllers/discussions.controller';
import { requireAuth } from '../middlewares/auth';

const router = Router();
const controller = new DiscussionsController();

router.use(requireAuth);

router.get('/', controller.getDiscussions);
router.post('/', controller.createDiscussion);

export default router;
