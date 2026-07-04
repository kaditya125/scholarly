import { Router } from 'express';
import { notebookController } from '../controllers/notebook.controller';
import { requireAuth } from '../middlewares/auth';
import multer from 'multer';
import { sourceController } from '../controllers/source.controller';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } }); // 25MB limit

router.use(requireAuth);

// Notebook CRUD
router.get('/', notebookController.getNotebooks);
router.post('/', notebookController.createNotebook);
router.get('/:id', notebookController.getNotebook);
router.put('/:id', notebookController.updateNotebook);
router.delete('/:id', notebookController.deleteNotebook);

// Sources
router.get('/:id/sources', notebookController.getSources);
router.post('/:id/sources', upload.single('file'), sourceController.uploadSource);
router.delete('/:id/sources/:sourceId', sourceController.deleteSource);

// Timeline & Assets
router.get('/:id/timeline', notebookController.getTimeline);
router.get('/:id/assets', notebookController.getAssets);

// Knowledge Graph
router.get('/:id/graph', notebookController.getKnowledgeGraph);

export default router;
