import { logger } from '../../../utils/logger';
import { env } from '../../../config/env';

export interface WhatsAppDeliveryReport {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface WhatsAppInteractiveButton {
  id: string;
  title: string;
}

export interface IWhatsAppProvider {
  sendTemplateMessage(to: string, templateName: string, languageCode: string, components: any[]): Promise<WhatsAppDeliveryReport>;
  sendTextMessage(to: string, text: string): Promise<WhatsAppDeliveryReport>;
  sendInteractiveButtonMessage(to: string, text: string, buttons: WhatsAppInteractiveButton[]): Promise<WhatsAppDeliveryReport>;
  sendMediaMessage(to: string, mediaType: 'image' | 'document', mediaUrl: string, caption?: string, fileName?: string): Promise<WhatsAppDeliveryReport>;
}

/**
 * Mock provider for local development, testing, and sandbox execution.
 */
export class MockWhatsAppProvider implements IWhatsAppProvider {
  async sendTemplateMessage(to: string, templateName: string, languageCode: string, components: any[]): Promise<WhatsAppDeliveryReport> {
    logger.info(`[MockWhatsApp] Sending template message "${templateName}" (${languageCode}) to ${to} with components:`, components);
    return {
      success: true,
      messageId: `mock_wa_tpl_${Date.now()}_${Math.random().toString(36).substring(7)}`
    };
  }

  async sendTextMessage(to: string, text: string): Promise<WhatsAppDeliveryReport> {
    logger.info(`[MockWhatsApp] Sending text message to ${to}: ${text}`);
    return {
      success: true,
      messageId: `mock_wa_text_${Date.now()}_${Math.random().toString(36).substring(7)}`
    };
  }

  async sendInteractiveButtonMessage(to: string, text: string, buttons: WhatsAppInteractiveButton[]): Promise<WhatsAppDeliveryReport> {
    logger.info(`[MockWhatsApp] Sending interactive button message to ${to}. Text: "${text}". Buttons:`, buttons);
    return {
      success: true,
      messageId: `mock_wa_btn_${Date.now()}_${Math.random().toString(36).substring(7)}`
    };
  }

  async sendMediaMessage(to: string, mediaType: 'image' | 'document', mediaUrl: string, caption?: string, fileName?: string): Promise<WhatsAppDeliveryReport> {
    logger.info(`[MockWhatsApp] Sending media message (${mediaType}) to ${to}. URL: ${mediaUrl}. Caption: "${caption || ''}". Filename: "${fileName || ''}"`);
    return {
      success: true,
      messageId: `mock_wa_media_${Date.now()}_${Math.random().toString(36).substring(7)}`
    };
  }
}

/**
 * Production provider integrating Meta WhatsApp Cloud API.
 */
export class MetaWhatsAppProvider implements IWhatsAppProvider {
  private accessToken: string;
  private phoneNumberId: string;

  constructor() {
    this.accessToken = env.WHATSAPP_ACCESS_TOKEN || '';
    this.phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID || '';
  }

  async sendTemplateMessage(to: string, templateName: string, languageCode: string, components: any[]): Promise<WhatsAppDeliveryReport> {
    if (!this.accessToken || !this.phoneNumberId) {
      logger.error('[MetaWhatsApp] Missing required configuration parameters');
      return { success: false, error: 'Configuration Error' };
    }

    const url = `https://graph.facebook.com/v20.0/${this.phoneNumberId}/messages`;
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        components
      }
    };

    return this.postRequest(url, payload);
  }

  async sendTextMessage(to: string, text: string): Promise<WhatsAppDeliveryReport> {
    if (!this.accessToken || !this.phoneNumberId) {
      logger.error('[MetaWhatsApp] Missing required configuration parameters');
      return { success: false, error: 'Configuration Error' };
    }

    const url = `https://graph.facebook.com/v20.0/${this.phoneNumberId}/messages`;
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { body: text }
    };

    return this.postRequest(url, payload);
  }

  async sendInteractiveButtonMessage(to: string, text: string, buttons: WhatsAppInteractiveButton[]): Promise<WhatsAppDeliveryReport> {
    if (!this.accessToken || !this.phoneNumberId) {
      logger.error('[MetaWhatsApp] Missing required configuration parameters');
      return { success: false, error: 'Configuration Error' };
    }

    const url = `https://graph.facebook.com/v20.0/${this.phoneNumberId}/messages`;
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text },
        action: {
          buttons: buttons.map(b => ({
            type: 'reply',
            reply: { id: b.id, title: b.title }
          }))
        }
      }
    };

    return this.postRequest(url, payload);
  }

  async sendMediaMessage(to: string, mediaType: 'image' | 'document', mediaUrl: string, caption?: string, fileName?: string): Promise<WhatsAppDeliveryReport> {
    if (!this.accessToken || !this.phoneNumberId) {
      logger.error('[MetaWhatsApp] Missing required configuration parameters');
      return { success: false, error: 'Configuration Error' };
    }

    const url = `https://graph.facebook.com/v20.0/${this.phoneNumberId}/messages`;
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: mediaType,
      [mediaType]: {
        link: mediaUrl,
        ...(caption ? { caption } : {}),
        ...(fileName ? { filename: fileName } : {})
      }
    };

    return this.postRequest(url, payload);
  }

  private async postRequest(url: string, payload: any): Promise<WhatsAppDeliveryReport> {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json() as any;

      if (response.ok) {
        const messageId = data.messages?.[0]?.id;
        logger.info(`[MetaWhatsApp] Message successfully sent to ${payload.to} (ID: ${messageId})`);
        return { success: true, messageId };
      } else {
        const errMsg = data.error?.message || response.statusText;
        logger.error(`[MetaWhatsApp] Failed to send message: ${errMsg}`);
        return { success: false, error: errMsg };
      }
    } catch (e: any) {
      logger.error(`[MetaWhatsApp] API Error sending message to ${payload.to}`, e);
      return { success: false, error: e.message };
    }
  }
}
