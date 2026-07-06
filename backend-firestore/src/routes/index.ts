import { Router } from 'express';
import questionsRoutes from './questions.routes';
import testsRoutes from './tests.routes';
import plannerRoutes from './planner.routes';
import leaderboardRoutes from './leaderboard.routes';
import discussionsRoutes from './discussions.routes';
import roomsRoutes from './rooms.routes';
import usersRoutes from './users.routes';
import chatRoutes from './chat.routes';
import companionRoutes from './companion.routes';
import notebooksRoutes from './notebooks.routes';
import studyGroupsRoutes from './studyGroups.routes';
import publishedAssetsRoutes from './publishedAssets.routes';
import briefingRoutes from './briefing.routes';
import graphRoutes from './graph.routes';
import assetsRoutes from './assets.routes';
import feedbackRoutes from './feedback.routes';
import enterpriseAdminRoutes from '../admin/routes/admin.routes';
import analyticsRoutes from './analytics.routes';

const router = Router();

router.use('/analytics', analyticsRoutes);

router.use('/briefing', briefingRoutes);
router.use('/questions', questionsRoutes);
router.use('/tests', testsRoutes);
router.use('/planner', plannerRoutes);
router.use('/leaderboard', leaderboardRoutes);
router.use('/discussions', discussionsRoutes);
router.use('/rooms', roomsRoutes);
router.use('/users', usersRoutes);
router.use('/chat', chatRoutes);
router.use('/chat', feedbackRoutes);
router.use('/companion', companionRoutes);
router.use('/notebooks', notebooksRoutes);
router.use('/notebooks', graphRoutes);
router.use('/notebooks', assetsRoutes);
router.use('/study-groups', studyGroupsRoutes);
router.use('/explore', publishedAssetsRoutes);
router.use('/admin', enterpriseAdminRoutes);

export default router;
