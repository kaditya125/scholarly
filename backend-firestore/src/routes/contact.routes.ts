import { Router } from 'express';
import { contactController } from '../controllers/contact.controller';
import { apiLimiter } from '../middleware/rateLimiter';

const router = Router();

// POST /api/contact/send-inquiry
router.post('/send-inquiry', apiLimiter, (req, res) => contactController.sendInquiry(req, res));

export default router;
