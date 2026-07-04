import { Router } from 'express';
import { PlannerController } from '../controllers/planner.controller';

const router = Router();
const controller = new PlannerController();

router.get('/', controller.getTasks);

export default router;
