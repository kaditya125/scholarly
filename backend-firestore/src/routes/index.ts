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

const router = Router();

router.use('/questions', questionsRoutes);
router.use('/tests', testsRoutes);
router.use('/planner', plannerRoutes);
router.use('/leaderboard', leaderboardRoutes);
router.use('/discussions', discussionsRoutes);
router.use('/rooms', roomsRoutes);
router.use('/users', usersRoutes);
router.use('/chat', chatRoutes);
router.use('/companion', companionRoutes);
router.use('/notebooks', notebooksRoutes);

export default router;
