import { Router } from 'express';
import { requireAuth } from '../middlewares/auth';
import { videoLessonController } from '../controllers/video-lesson.controller';

const router = Router();

router.use(requireAuth);

router.post('/', videoLessonController.create);
router.get('/:id', videoLessonController.status);
router.get('/:id/video', videoLessonController.video);

export default router;
