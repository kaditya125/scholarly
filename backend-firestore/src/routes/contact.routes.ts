import { Router } from 'express';
import { contactController } from '../controllers/contact.controller';
import { apiLimiter } from '../middleware/rateLimiter';

const router = Router();

// POST /api/contact/send-inquiry
router.post('/send-inquiry', apiLimiter, (req, res) => contactController.sendInquiry(req, res));

// POST /api/contact/ai-draft
router.post('/ai-draft', apiLimiter, (req, res) => contactController.aiDraft(req, res));

export default router;
