import { Request, Response } from 'express';
import { logger } from '../utils/logger';
import { env } from '../config/env';
import { container, TOKENS } from '../core/di/container';
import { IWhatsAppProvider } from '../core/notifications/providers/WhatsAppProvider';
import { db } from '../config/firebase';
import * as crypto from 'crypto';

export class WebhooksController {
  /**
   * Helper to verify HMAC signature on incoming webhooks.
   */
  private verifySignature(req: Request): boolean {
    const appSecret = env.APP_SECRET || '';

    // If no APP_SECRET is configured, bypass verification entirely in developer sandbox.
    if (!appSecret) {
      logger.warn('[WhatsAppWebhook] APP_SECRET not set in environment. Skipping signature verification in developer sandbox.');
      return true;
    }

    const signature = req.headers['x-hub-signature-256'] as string;
    if (!signature) {
      logger.warn('[WhatsAppWebhook] Missing X-Hub-Signature-256 header.');
      return false;
    }

    const elements = signature.split('=');
    const signatureHash = elements[1];

    const rawBody = (req as any).rawBody;
    if (!rawBody) {
      logger.error('[WhatsAppWebhook] rawBody is missing on request context.');
      return false;
    }

    const expectedHash = crypto
      .createHmac('sha256', appSecret)
      .update(rawBody)
      .digest('hex');

    if (signatureHash !== expectedHash) {
      logger.warn(`[WhatsAppWebhook] Signature mismatch. expected: ${expectedHash}, got: ${signatureHash}`);
      return false;
    }

    return true;
  }

  /**
   * GET /webhooks/whatsapp
   * Verification endpoint required by Meta to validate the webhook ownership.
   */
  public verifyWhatsApp = async (req: Request, res: Response): Promise<void> => {
    try {
      const mode = req.query['hub.mode'];
      const token = req.query['hub.verify_token'];
      const challenge = req.query['hub.challenge'];

      const expectedToken = env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || 'sadhya_wa_secret';

      if (mode && token) {
        if (mode === 'subscribe' && token === expectedToken) {
          logger.info('[WhatsAppWebhook] Webhook successfully verified by Meta.');
          res.status(200).send(challenge);
          return;
        } else {
          logger.warn(`[WhatsAppWebhook] Verification failed. Expected token: ${expectedToken}, got: ${token}`);
          res.sendStatus(403);
          return;
        }
      }
      res.sendStatus(400);
    } catch (error: any) {
      logger.error('[WhatsAppWebhook] Verification error:', error);
      res.sendStatus(500);
    }
  };

  /**
   * POST /webhooks/100ms
   * Event receiver endpoint for 100ms.live webhooks (e.g. recording.success)
   */
  public handle100msEvent = async (req: Request, res: Response): Promise<void> => {
    try {
      // For a production app, verify the 100ms webhook signature here.
      // 100ms sends x-100ms-signature header.
      const body = req.body;
      logger.info('[100msWebhook] Received event', { type: body.type, roomId: body.data?.room_id });

      if (body.type === 'recording.success' || body.type === 'beam.recording.success') {
        const providerRoomId = body.data?.room_id;
        // The recording URL might be in different fields depending on the destination (S3 vs 100ms storage)
        const recordingUrl = body.data?.location || body.data?.recording_presigned_url || body.data?.url;
        
        if (providerRoomId && recordingUrl) {
          const { classSessionService } = require('../services/classSession.service');
          await classSessionService.updateRecordingRef(providerRoomId, recordingUrl);
        }
      }

      res.status(200).send('OK');
    } catch (error: any) {
      logger.error('[100msWebhook] Error handling event:', error);
      res.sendStatus(500);
    }
  };

  /**
   * POST /webhooks/whatsapp
   * Event receiver endpoint that receives user messages, button replies, and status reports.
   */
  public handleWhatsAppEvent = async (req: Request, res: Response): Promise<void> => {
    try {
      // 1. Signature Verification
      if (!this.verifySignature(req)) {
        res.sendStatus(401);
        return;
      }

      const body = req.body;

      // Check if it is a WhatsApp webhook payload
      if (body.object !== 'whatsapp_business_account') {
        res.sendStatus(404);
        return;
      }

      const entry = body.entry?.[0];
      const change = entry?.changes?.[0];
      const val = change?.value;
      const message = val?.messages?.[0];

      if (!message) {
        // Acknowledge read receipts or delivery status reports
        res.sendStatus(200);
        return;
      }

      // 2. Idempotency Check (Duplicate message protection)
      const messageId = message.id;
      if (messageId) {
        const docRef = db.collection('whatsapp_webhook_logs').doc(messageId);
        const logDoc = await docRef.get();
        if (logDoc.exists) {
          logger.info(`[WhatsAppWebhook] Duplicate webhook detected for message ID: ${messageId}. Skipping processing.`);
          res.sendStatus(200);
          return;
        }
        // Save log to register this message
        await docRef.set({
          messageId,
          timestamp: Date.now(),
          sender: message.from,
          type: message.type
        });
      }

      // Quick success response to Meta (they require 200 OK within 2-3 seconds)
      res.sendStatus(200);

      const senderNumber = message.from;
      const senderName = val?.contacts?.[0]?.profile?.name || 'Student';
      const msgType = message.type;

      logger.info(`[WhatsAppWebhook] Received ${msgType} message from ${senderName} (${senderNumber})`);

      let messageText = '';
      let buttonId: string | undefined;
      let mediaId: string | undefined;
      let mimeType: string | undefined;

      if (msgType === 'interactive') {
        const interactive = message.interactive;
        if (interactive?.type === 'button_reply') {
          buttonId = interactive.button_reply?.id;
          messageText = interactive.button_reply?.title || '';
        }
      } else if (msgType === 'text') {
        messageText = message.text?.body || '';
      } else if (msgType === 'image') {
        mediaId = message.image?.id;
        mimeType = message.image?.mime_type;
      } else if (msgType === 'document') {
        mediaId = message.document?.id;
        mimeType = message.document?.mime_type;
      }

      // Delegate message routing asynchronously to ensure fast response to Meta (within 2-3 seconds)
      const { whatsAppConversationRouter } = await import('../core/whatsapp/WhatsAppConversationRouter');
      whatsAppConversationRouter.routeMessage(senderNumber, senderName, messageText, buttonId, mediaId, mimeType).catch(err => {
        logger.error('[WhatsAppWebhook] Router failed to route message:', err);
      });
    } catch (error: any) {
      logger.error('[WhatsAppWebhook] Error handling event:', error?.message || error);
    }
  };
}
