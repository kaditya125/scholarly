import { Router } from 'express';
import { UserStatsController } from '../controllers/userStats.controller';
import { UserProfileController } from '../controllers/userProfile.controller';
import { userIdentityController } from '../controllers/userIdentity.controller';
import { requireAuth, enforceSelf } from '../middlewares/auth';

const router = Router();
const controller = new UserStatsController();
const profileController = new UserProfileController();

router.use(requireAuth);

/**
 * Identity / role foundation (Phase 1). Both routes are self-scoped by construction —
 * they read req.user.uid and accept no user identifier in the path or body, so
 * enforceSelf is unnecessary here (there is nothing to compare against).
 */
router.post('/bootstrap', userIdentityController.bootstrap);
router.get('/me', userIdentityController.me);

router.get('/:userId/stats', enforceSelf('userId'), controller.getUserStats);
router.post('/:userId/xp', enforceSelf('userId'), controller.awardXP);

router.get('/:userId/profile', enforceSelf('userId'), profileController.getProfile);
router.put('/:userId/profile', enforceSelf('userId'), profileController.updateProfile);

export default router;
