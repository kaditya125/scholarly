import { Router } from 'express';
import { DiscussionsController } from '../controllers/discussions.controller';

const router = Router();
const controller = new DiscussionsController();

router.get('/', controller.getDiscussions);

export default router;
