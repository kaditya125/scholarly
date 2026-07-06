import { Router } from 'express';
import { AssetsController } from '../controllers/assets.controller';
import { requireAuth } from '../middlewares/auth';
import { requireNotebookAccess } from '../middlewares/ownership';

const router = Router();
const controller = new AssetsController();

// All asset mutations require auth AND access to the parent notebook (owner/editor).
router.use(requireAuth);

router.put('/:notebookId/assets/:assetId', requireNotebookAccess(), controller.updateAsset);
router.delete('/:notebookId/assets/:assetId', requireNotebookAccess(), controller.deleteAsset);
router.post('/:notebookId/assets/:assetId/duplicate', requireNotebookAccess(), controller.duplicateAsset);
router.post('/:notebookId/assets/:assetId/regenerate', requireNotebookAccess(), controller.regenerateAsset);
router.post('/:notebookId/assets/:assetId/podcast', requireNotebookAccess(), controller.generatePodcastAudio);

export default router;
