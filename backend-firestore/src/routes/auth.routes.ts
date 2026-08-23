import { Router } from 'express';
import { authController } from '../controllers/auth.controller';
import { requireAuth } from '../middlewares/auth';

const router = Router();

// Public endpoint for branded password reset via ZeptoMail
router.post('/send-password-reset', authController.sendPasswordReset);

// Authenticated endpoint for sending/resending verification email via ZeptoMail
router.post('/send-verification-email', requireAuth, authController.sendVerificationEmail);

// Authenticated endpoint for sending rich welcome email
router.post('/send-welcome-email', requireAuth, authController.sendWelcomeEmail);

export default router;
