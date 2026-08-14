import { Router } from 'express';
import { bookLibraryController } from '../controllers/bookLibrary.controller';
import { requireAuth } from '../middlewares/auth';

const router = Router();

/**
 * SECURITY (Phase 0): requireAuth was commented out ("temporarily removing requireAuth so
 * the frontend can function without a login"), leaving the whole surface open to
 * unauthenticated callers — including POST .../generate, which triggers paid AI asset
 * generation.
 *
 * Restored. Cross-user exposure was never the risk here: bookLibraryService hard-restricts
 * every read to the shared NCERT corpus (bookLibrary.service.ts:79 requires the notebook id
 * to carry the curriculum prefix AND be owned by 'ncert-curriculum'), so no private notebook
 * is reachable through these routes. The gap was anonymous access, not ownership.
 *
 * Safe for the frontend: lib/api/documents.ts calls through the shared axios client, which
 * attaches the Firebase ID token on every request, and /documents is only reached from
 * pages behind ProtectedRoute.
 */
router.use(requireAuth);

// Shared curriculum book catalog — deliberately NOT ownership-scoped like /notebooks.
router.get('/books', bookLibraryController.listBooks);
router.get('/books/:notebookId', bookLibraryController.getBookDetail);
router.get('/books/:notebookId/cover', bookLibraryController.getCover);
router.get('/books/:notebookId/chapters/:sourceId/pdf', bookLibraryController.getChapterPdf);
router.get('/books/:notebookId/chapters/:sourceId/cover', bookLibraryController.getChapterCover);
router.post('/books/:notebookId/chapters/:sourceId/generate', bookLibraryController.generateChapterAssets);
router.get('/books/:notebookId/chapters/:sourceId/status', bookLibraryController.getChapterStatus);

export default router;
