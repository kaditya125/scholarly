import { studentGoalController } from '../controllers/studentGoal.controller';
import { Router } from 'express';
import { UserStatsController } from '../controllers/userStats.controller';
import { UserProfileController } from '../controllers/userProfile.controller';
import { userIdentityController } from '../controllers/userIdentity.controller';
import { capabilitiesController } from '../controllers/capabilities.controller';
import { referralController } from '../controllers/referral.controller';
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

/**
 * Derived capabilities for the caller (Phase 3B). Self-scoped like the two routes above.
 * Display contract only — see controllers/capabilities.controller.ts. Protected routes
 * re-derive server-side and never trust a client-supplied capability.
 */
router.get('/capabilities', capabilitiesController.get);

/** The caller's own referral activity (Phase 3L). Self-scoped like the routes above. */
router.get('/referrals', referralController.listMine);

router.get('/:userId/stats', enforceSelf('userId'), controller.getUserStats);
router.post('/:userId/xp', enforceSelf('userId'), controller.awardXP);

// Student goal — same enforceSelf ownership guard as the profile it sits beside.
router.get('/:userId/goal', enforceSelf('userId'), studentGoalController.get);
router.put('/:userId/goal', enforceSelf('userId'), studentGoalController.put);
router.get('/:userId/profile', enforceSelf('userId'), profileController.getProfile);
router.put('/:userId/profile', enforceSelf('userId'), profileController.updateProfile);

export default router;
