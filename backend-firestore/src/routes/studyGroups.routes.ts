import { Router } from 'express';
import { studyGroupController } from '../controllers/studyGroup.controller';
import { requireAuth } from '../middlewares/auth';

const router = Router();

router.use(requireAuth);

router.get('/', studyGroupController.getGroups);
router.post('/', studyGroupController.createGroup);
router.post('/:id/members', studyGroupController.addMember);

export default router;
