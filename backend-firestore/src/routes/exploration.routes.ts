import { Router } from 'express';
import { ExplorationController } from '../controllers/exploration.controller';
import { requireAuth } from '../middlewares/auth';
import { requireNotebookAccess } from '../middlewares/ownership';

/**
 * Content Pipeline inspection API (/pipeline page: useContentExploration, useContentQuality).
 *
 * ExplorationController existed but was never mounted, so every call from the Content Pipeline
 * page 404'd. Mounted under /notebooks (the paths the frontend uses). Notebook-scoped routes go
 * through requireNotebookAccess('id') — the same ownership gate the graph and asset routes use —
 * so another user's notebook id is refused before any controller runs. Cross-collection search is
 * scoped inside contentExplorationService to collections the caller can access.
 *
 * Not mounted: the controller's artifact-lineage and document-history handlers, which no client
 * calls. Mount them alongside a caller, not before.
 */
const router = Router();
const controller = new ExplorationController();
const owned = requireNotebookAccess('id');

router.use(requireAuth);

router.post('/exploration/search', controller.search);
router.post('/:id/exploration/search', owned, controller.search);

router.get('/:id/sources/:sourceId/chunks', owned, controller.getDocumentChunks);
router.get('/:id/sources/:sourceId/structure', owned, controller.getDocumentStructure);
router.get('/:id/sources/:sourceId/graph', owned, controller.getDocumentGraph);
router.get('/:id/sources/:sourceId/lineage/:chunkId', owned, controller.getDocumentLineage);
router.get('/:id/sources/:sourceId/versions', owned, controller.getDocumentVersions);
router.post('/:id/sources/:sourceId/versions/diff', owned, controller.diffDocumentVersions);
router.get('/:id/sources/:sourceId/quality', owned, controller.getDocumentQuality);
router.post('/:id/sources/:sourceId/revalidate', owned, controller.revalidateDocumentQuality);

export default router;
