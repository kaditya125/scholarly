import { Router } from 'express';
import { requireAuth } from '../middlewares/auth';
import { PodcastController } from '../controllers/podcast.controller';
import { podcastGenerateLimiter } from '../middleware/rateLimiter';

const router = Router();
const controller = new PodcastController();

// Cinematic status endpoint (no auth required - public deployment config)
router.get('/cinematic/status', controller.getCinematicStatus);

router.use(requireAuth);

// Generate a podcast (durable async job) — 202 with {podcastId, jobId}.
router.post('/generate', podcastGenerateLimiter, controller.generate);

// History / list (self-scoped, newest first). GET '/' kept for backward compatibility.
router.get('/history', controller.list);
router.get('/', controller.list);

// Media serving (ownership-checked). Declared before the generic /:id route.
router.get('/:id/audio', controller.getAudioUrl);
router.get('/:id/cover', controller.getCoverUrl);
router.post('/:id/cover', controller.regenerateCover);
router.get('/:id/transcript', controller.getTranscript);

// Single episode (ownership-checked) + cancel + delete.
router.get('/:id', controller.get);
router.post('/:id/cancel', controller.cancel);
router.delete('/:id', controller.deletePodcast);

// Phase 3: Security & Interactivity endpoints
router.post('/:id/bookmark', controller.bookmark);
router.post('/:id/analytics', controller.analytics);
router.post('/:id/ask', controller.ask);

export default router;
