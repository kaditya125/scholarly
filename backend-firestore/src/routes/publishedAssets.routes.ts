import { Router } from 'express';
import { publishedAssetsController } from '../controllers/publishedAssets.controller';
import { requireAuth } from '../middlewares/auth';

const router = Router();
router.use(requireAuth);
router.get('/', publishedAssetsController.getAll);
router.post('/publish', publishedAssetsController.publish);
router.post('/:id/rate', publishedAssetsController.rate);
router.post('/:id/download', publishedAssetsController.download);
export default router;
