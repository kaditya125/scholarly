import { Router } from 'express';
import { UserStatsController } from '../controllers/userStats.controller';
import { requireAuth, enforceSelf } from '../middlewares/auth';

const router = Router();
const controller = new UserStatsController();

router.use(requireAuth);

router.get('/:userId/stats', enforceSelf('userId'), controller.getUserStats);
router.post('/:userId/xp', enforceSelf('userId'), controller.awardXP);

export default router;
