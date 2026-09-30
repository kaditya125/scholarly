import { Router, Request } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { SearchController } from '../controllers/search.controller';
import { requireAuth } from '../middlewares/auth';

const router = Router();
const controller = new SearchController();

router.use(requireAuth);

// Semantic search embeds + reranks every uncached query; cap it per user.
const semanticLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => req.user?.uid || ipKeyGenerator(req.ip || ''),
  message: { error: 'Too many searches. Please wait a moment.' },
});

router.get('/', controller.search);
router.get('/semantic', semanticLimiter, controller.semantic);

export default router;
