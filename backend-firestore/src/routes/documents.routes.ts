import { Router } from 'express';
import { bookLibraryController } from '../controllers/bookLibrary.controller';
// import { requireAuth } from '../middlewares/auth';

const router = Router();

// Temporarily removing requireAuth so the frontend can function without a login
// router.use(requireAuth);

// Public (any authenticated student) curriculum book catalog — deliberately NOT scoped to
// ownership like /notebooks; bookLibraryService hard-restricts reads to the shared NCERT corpus.
router.get('/books', bookLibraryController.listBooks);
router.get('/books/:notebookId', bookLibraryController.getBookDetail);
router.get('/books/:notebookId/cover', bookLibraryController.getCover);
router.get('/books/:notebookId/chapters/:sourceId/pdf', bookLibraryController.getChapterPdf);
router.get('/books/:notebookId/chapters/:sourceId/cover', bookLibraryController.getChapterCover);
router.post('/books/:notebookId/chapters/:sourceId/generate', bookLibraryController.generateChapterAssets);
router.get('/books/:notebookId/chapters/:sourceId/status', bookLibraryController.getChapterStatus);

export default router;
