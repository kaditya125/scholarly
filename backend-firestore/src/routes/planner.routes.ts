import { Router } from 'express';
import { PlannerController } from '../controllers/planner.controller';
import { requireAuth, enforceSelf } from '../middlewares/auth';

const router = Router();
const controller = new PlannerController();

router.use(requireAuth);

router.get('/:userId/timetable', enforceSelf('userId'), controller.getTimetable);
router.post('/:userId/timetable', enforceSelf('userId'), controller.generateTimetable);
router.post('/:userId/timetable/complete', enforceSelf('userId'), controller.markTaskCompleted);
router.post('/:userId/timetable/adapt', enforceSelf('userId'), controller.adaptTimetable);

export default router;
