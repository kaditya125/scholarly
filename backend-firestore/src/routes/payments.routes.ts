import { Router } from 'express';
import { PaymentsController } from '../controllers/payments.controller';
import { requireAuth } from '../middlewares/auth';

const router = Router();
const controller = new PaymentsController();

// Public: whether payments are enabled + the publishable key id.
router.get('/config', controller.getConfig);

// Razorpay server-to-server webhook — NO auth (verified via signature over the raw body).
router.post('/webhook', controller.webhook);

// Authenticated user actions.
router.get('/subscription', requireAuth, controller.getSubscription);
router.get('/history', requireAuth, controller.getHistory);
router.post('/order', requireAuth, controller.createOrder);
router.post('/create-order', requireAuth, controller.createOrder);
router.post('/verify', requireAuth, controller.verifyPayment);
router.post('/verify-payment', requireAuth, controller.verifyPayment);

export default router;
