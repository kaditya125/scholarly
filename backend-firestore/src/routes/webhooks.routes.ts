import { Router } from 'express';
import { WebhooksController } from '../controllers/webhooks.controller';

const router = Router();
const controller = new WebhooksController();

// GET endpoint for Meta validation challenge
router.get('/whatsapp', controller.verifyWhatsApp);

// POST endpoint for Meta events
router.post('/whatsapp', controller.handleWhatsAppEvent);

// POST endpoint for 100ms events
router.post('/100ms', controller.handle100msEvent);

export default router;
