import { Router } from 'express';
import { WebhooksController } from '../controllers/webhooks.controller';

const router = Router();
const controller = new WebhooksController();

// GET endpoint for Meta validation challenge
router.get('/whatsapp', controller.verifyWhatsApp);

// POST endpoint for Meta events
router.post('/whatsapp', controller.handleWhatsAppEvent);

export default router;
