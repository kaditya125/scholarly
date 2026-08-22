import { Request, Response } from 'express';
import { auth } from '../config/firebase';
import { zeptoMailService } from '../services/email/zeptoMail.service';
import { logger } from '../utils/logger';

export class AuthController {
  /**
   * POST /api/users/send-verification-email
   * Requires authenticated user token (requireAuth).
   * Generates a Firebase email verification link and sends it via ZeptoMail.
   */
  sendVerificationEmail = async (req: Request, res: Response) => {
    const uid = req.user?.uid;
    const email = req.user?.email;

    if (!uid || !email) {
      return res.status(401).json({ error: 'Unauthorized or missing email address.' });
    }

    try {
      // Check if user is already verified
      const userRecord = await auth.getUser(uid);
      if (userRecord.emailVerified) {
        return res.status(200).json({
          success: true,
          alreadyVerified: true,
          message: 'Email address is already verified.',
        });
      }

      // Generate secure Firebase email verification link
      const actionCodeSettings = {
        url: 'https://sadhya.app/verify-email',
        handleCodeInApp: true,
      };

      const verificationLink = await auth.generateEmailVerificationLink(email, actionCodeSettings);

      // Dispatch via ZeptoMail
      const displayName = userRecord.displayName || req.body?.name || 'Learner';
      const sent = await zeptoMailService.sendVerificationEmail(email, displayName, verificationLink);

      if (sent) {
        logger.info('[AuthController] Verification email dispatched via ZeptoMail', { uid, email });
        return res.status(200).json({
          success: true,
          message: `Verification email sent to ${email} via ZeptoMail.`,
        });
      } else {
        return res.status(500).json({
          error: 'Failed to send verification email. Please try again.',
        });
      }
    } catch (err: any) {
      logger.error('[AuthController] Error generating verification link', {
        uid,
        email,
        error: err?.message,
      });
      return res.status(500).json({
        error: 'Failed to process email verification request.',
      });
    }
  };

  /**
   * POST /api/auth/send-password-reset
   * Public endpoint to send branded password reset email via ZeptoMail.
   */
  sendPasswordReset = async (req: Request, res: Response) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : null;

    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Please provide a valid email address.' });
    }

    try {
      const userRecord = await auth.getUserByEmail(email).catch(() => null);

      // Always return success to prevent email enumeration, but only send if user exists
      if (userRecord) {
        const actionCodeSettings = {
          url: 'https://sadhya.app/signin',
          handleCodeInApp: true,
        };

        const resetLink = await auth.generatePasswordResetLink(email, actionCodeSettings);
        await zeptoMailService.sendPasswordResetEmail(
          email,
          userRecord.displayName || 'Learner',
          resetLink
        );

        logger.info('[AuthController] Password reset link dispatched via ZeptoMail', { email });
      }

      return res.status(200).json({
        success: true,
        message: `If an account exists with ${email}, a password reset link has been sent.`,
      });
    } catch (err: any) {
      logger.error('[AuthController] Error generating password reset link', {
        email,
        error: err?.message,
      });
      return res.status(200).json({
        success: true,
        message: `If an account exists with ${email}, a password reset link has been sent.`,
      });
    }
  };
}

export const authController = new AuthController();
