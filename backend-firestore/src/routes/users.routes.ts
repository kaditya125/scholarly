import { Router } from 'express';
import { UserStatsController } from '../controllers/userStats.controller';

const router = Router();
const controller = new UserStatsController();

router.get('/:userId/stats', controller.getUserStats);

export default router;
