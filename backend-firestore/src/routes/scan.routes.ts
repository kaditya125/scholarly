import { Router } from 'express';
import { scanController } from '../controllers/scan.controller';
import { requireAuth } from '../middlewares/auth';

const router = Router();

router.use(requireAuth);

// AI Question Scanner — SSE stream of the answer for a cropped question image.
router.post('/solve', scanController.solve);

export default router;
