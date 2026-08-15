import { Router } from 'express';
import { DiscussionsController } from '../controllers/discussions.controller';
import { requireAuth } from '../middlewares/auth';

const router = Router();
const controller = new DiscussionsController();

router.use(requireAuth);

router.get('/trending', controller.getTrending);
router.get('/contributors', controller.getContributors);

router.get('/', controller.getDiscussions);
router.post('/', controller.createDiscussion);

router.get('/:id', controller.getDiscussionById);
router.post('/:id/vote', controller.vote);
router.post('/:id/responses', controller.addResponse);
router.post('/:id/best', controller.setBest);
router.patch('/:id/status', controller.setStatus);

export default router;
