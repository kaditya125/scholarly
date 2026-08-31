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

// Reconciliation + explicit cancellation, so a lost callback or a dismissed modal resolves to a
// definite state instead of leaving the user guessing whether they were charged.
router.get('/order/:orderId/status', requireAuth, controller.getOrderStatus);
router.post('/order/:orderId/cancel', requireAuth, controller.cancelOrder);
router.post('/resend-receipt/:orderId', requireAuth, controller.resendReceipt);

router.post('/verify', requireAuth, controller.verifyPayment);
router.post('/verify-payment', requireAuth, controller.verifyPayment);

export default router;
