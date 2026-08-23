"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const studentGoal_controller_1 = require("../controllers/studentGoal.controller");
const express_1 = require("express");
const userStats_controller_1 = require("../controllers/userStats.controller");
const userProfile_controller_1 = require("../controllers/userProfile.controller");
const userIdentity_controller_1 = require("../controllers/userIdentity.controller");
const capabilities_controller_1 = require("../controllers/capabilities.controller");
const referral_controller_1 = require("../controllers/referral.controller");
const auth_1 = require("../middlewares/auth");
const router = (0, express_1.Router)();
const controller = new userStats_controller_1.UserStatsController();
const profileController = new userProfile_controller_1.UserProfileController();
router.use(auth_1.requireAuth);
/**
 * Identity / role foundation (Phase 1). Both routes are self-scoped by construction —
 * they read req.user.uid and accept no user identifier in the path or body, so
 * enforceSelf is unnecessary here (there is nothing to compare against).
 */
router.post('/bootstrap', userIdentity_controller_1.userIdentityController.bootstrap);
router.get('/me', userIdentity_controller_1.userIdentityController.me);
/**
 * Derived capabilities for the caller (Phase 3B). Self-scoped like the two routes above.
 * Display contract only — see controllers/capabilities.controller.ts. Protected routes
 * re-derive server-side and never trust a client-supplied capability.
 */
router.get('/capabilities', capabilities_controller_1.capabilitiesController.get);
/** The caller's own referral activity (Phase 3L). Self-scoped like the routes above. */
router.get('/referrals', referral_controller_1.referralController.listMine);
router.get('/:userId/stats', (0, auth_1.enforceSelf)('userId'), controller.getUserStats);
router.post('/:userId/xp', (0, auth_1.enforceSelf)('userId'), controller.awardXP);
// Student goal — same enforceSelf ownership guard as the profile it sits beside.
router.get('/:userId/goal', (0, auth_1.enforceSelf)('userId'), studentGoal_controller_1.studentGoalController.get);
router.put('/:userId/goal', (0, auth_1.enforceSelf)('userId'), studentGoal_controller_1.studentGoalController.put);
router.get('/:userId/profile', (0, auth_1.enforceSelf)('userId'), profileController.getProfile);
router.put('/:userId/profile', (0, auth_1.enforceSelf)('userId'), profileController.updateProfile);
exports.default = router;
