import { Router } from 'express';
import { GraphController } from '../controllers/graph.controller';
import { requireAuth } from '../middlewares/auth';
import { requireNotebookAccess } from '../middlewares/ownership';

const router = Router();
const controller = new GraphController();

// Knowledge graph endpoints require auth AND notebook access (owner/editor/viewer).
router.use(requireAuth);

router.get('/:notebookId/graph', requireNotebookAccess(), controller.getGraph);
router.get('/:notebookId/graph/search', requireNotebookAccess(), controller.searchNodes);
router.get('/:notebookId/graph/stats', requireNotebookAccess(), controller.getStats);
router.get('/:notebookId/graph/path/:nodeId', requireNotebookAccess(), controller.getLearningPath);

export default router;
