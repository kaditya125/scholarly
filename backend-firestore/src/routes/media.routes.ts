import { Router } from 'express';
import { ImageController } from '../controllers/image.controller';
import { requireAuth } from '../middlewares/auth';

const router = Router();
const controller = new ImageController();

router.use(requireAuth);
router.post('/image', controller.generate);

export default router;
