import { Request, Response } from 'express';
import { zeptoMailService } from '../services/email/zeptoMail.service';
import { GeminiProvider } from '../services/ai/gemini.provider';
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

  /**
   * POST /api/contact/ai-draft
   * Uses Gemini to draft a structured, professional email from brief user notes/bullet points.
   */
  async aiDraft(req: Request, res: Response): Promise<void> {
    try {
      const { channel, prompt, senderName } = req.body;

      if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
        res.status(400).json({ error: 'Please provide a brief description of your issue or request.' });
        return;
      }

      const validChannels = ['support', 'sales', 'security', 'privacy'];
      const targetChannel = validChannels.includes(channel) ? channel : 'support';
      const name = senderName?.trim() || 'User';

      const systemPrompt = `You are the Sadhya AI Email Assistant. Your job is to convert user rough notes or issue descriptions into a professional, crystal-clear, structured inquiry email to Sadhya's ${targetChannel} department.
Return ONLY a valid JSON object with the following schema:
{
  "subject": "Concise, professional subject line",
  "body": "Well-formatted email text with greeting, detailed bullet points, clear explanation, and sign-off from ${name}"
}
Do not include any extra text outside the JSON.`;

      const gemini = new GeminiProvider('gemini-2.5-flash');
      const response = await gemini.generateResponse(
        [{ id: '1', role: 'user', content: `Channel: ${targetChannel}\nUser Notes: ${prompt.trim()}`, timestamp: Date.now() }],
        systemPrompt,
        { temperature: 0.4 }
      );

      let cleanText = (response.reply || '').trim();
      if (cleanText.startsWith('```json')) {
        cleanText = cleanText.replace(/^```json/, '').replace(/```$/, '').trim();
      } else if (cleanText.startsWith('```')) {
        cleanText = cleanText.replace(/^```/, '').replace(/```$/, '').trim();
      }

      try {
        const parsed = JSON.parse(cleanText);
        res.status(200).json({
          success: true,
          subject: parsed.subject || `Inquiry regarding ${targetChannel}`,
          body: parsed.body || cleanText,
        });
      } catch {
        res.status(200).json({
          success: true,
          subject: `Inquiry regarding ${targetChannel}`,
          body: cleanText,
        });
      }
    } catch (err: any) {
      logger.error('[ContactController] AI Draft generation failed', { error: err?.message });
      res.status(500).json({ error: 'Failed to generate draft with AI. Please use preset templates or write manually.' });
    }
  }
}

export const contactController = new ContactController();
