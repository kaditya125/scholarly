import { Router } from 'express';
import { BriefingController } from '../controllers/briefing.controller';
import { requireAuth, enforceSelf } from '../middlewares/auth';

const router = Router();
const controller = new BriefingController();

router.use(requireAuth);

router.get('/:userId/today', enforceSelf('userId'), controller.getTodayBriefing);

export default router;
