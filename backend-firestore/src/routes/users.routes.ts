import { Router } from 'express';
import { UserStatsController } from '../controllers/userStats.controller';
import { UserProfileController } from '../controllers/userProfile.controller';
import { requireAuth, enforceSelf } from '../middlewares/auth';

const router = Router();
const controller = new UserStatsController();
const profileController = new UserProfileController();

router.use(requireAuth);

router.get('/:userId/stats', enforceSelf('userId'), controller.getUserStats);
router.post('/:userId/xp', enforceSelf('userId'), controller.awardXP);

router.get('/:userId/profile', enforceSelf('userId'), profileController.getProfile);
router.put('/:userId/profile', enforceSelf('userId'), profileController.updateProfile);

export default router;
