import { Router } from 'express';
import { LeaderboardController } from '../controllers/leaderboard.controller';
import { requireAuth } from '../middlewares/auth';

const router = Router();
const controller = new LeaderboardController();

router.use(requireAuth);

router.get('/', controller.getLeaderboard);

export default router;
