import { Request, Response } from 'express';
import { zeptoMailService } from '../services/email/zeptoMail.service';
import { logger } from '../utils/logger';

export class ContactController {
  /**
   * POST /api/contact/send-inquiry
   * Receives user contact submissions and dispatches to support/sales/security/privacy aliases.
   */
  async sendInquiry(req: Request, res: Response): Promise<void> {
    try {
      const { name, email, channel, subject, message } = req.body;

      if (!name || !email || !message) {
        res.status(400).json({ error: 'Name, email, and message are required.' });
        return;
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.trim())) {
        res.status(400).json({ error: 'Please provide a valid email address.' });
        return;
      }

      const validChannels = ['support', 'sales', 'security', 'privacy'];
      const targetChannel = validChannels.includes(channel) ? channel : 'support';

      // 1. Forward inquiry to internal team
      const forwarded = await zeptoMailService.sendContactInquiryEmail({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        channel: targetChannel,
        subject: subject?.trim() || `Inquiry from ${name.trim()}`,
        message: message.trim(),
      });

      // 2. Send acknowledgment to the sender in parallel
      zeptoMailService.sendInquiryReceiptEmail({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        channel: targetChannel,
      }).catch(err => {
        logger.warn('[ContactController] Failed to dispatch receipt email', { error: err });
      });

      if (!forwarded) {
        logger.error('[ContactController] Failed to send contact email via ZeptoMail');
        res.status(500).json({ error: 'Failed to deliver your message. Please try emailing directly.' });
        return;
      }

      logger.info(`[ContactController] Inbound inquiry delivered for ${targetChannel}`, { email });
      res.status(200).json({
        success: true,
        message: 'Your message has been delivered. We will get back to you shortly.',
      });
    } catch (error: any) {
      logger.error('[ContactController] Error handling contact submission', { error: error.message });
      res.status(500).json({ error: 'Internal server error while sending message.' });
    }
  }
}

export const contactController = new ContactController();
