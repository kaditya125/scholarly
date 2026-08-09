import { logger } from '../../../utils/logger';
import { env } from '../../../config/env';

export interface SmsDeliveryReport {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface ISmsProvider {
  sendSms(to: string, message: string): Promise<SmsDeliveryReport>;
}

/**
 * Mock provider for local development, testing, and sandbox execution.
 */
export class MockSmsProvider implements ISmsProvider {
  async sendSms(to: string, message: string): Promise<SmsDeliveryReport> {
    logger.info(`[MockSMS] Sending SMS to ${to}: ${message}`);
    return {
      success: true,
      messageId: `mock_sms_${Date.now()}_${Math.random().toString(36).substring(7)}`
    };
  }
}

/**
 * Production provider integrating Twilio Programmable SMS.
 */
export class TwilioSmsProvider implements ISmsProvider {
  private accountSid: string;
  private authToken: string;
  private fromNumber: string;

  constructor() {
    this.accountSid = env.TWILIO_ACCOUNT_SID || '';
    this.authToken = env.TWILIO_AUTH_TOKEN || '';
    this.fromNumber = env.TWILIO_FROM_NUMBER || '';
  }

  async sendSms(to: string, message: string): Promise<SmsDeliveryReport> {
    if (!this.accountSid || !this.authToken || !this.fromNumber) {
      logger.error('[TwilioSMS] Missing required configuration parameters');
      return { success: false, error: 'Configuration Error' };
    }

    const url = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`;
    const auth = Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64');

    const params = new URLSearchParams();
    params.append('To', to);
    params.append('From', this.fromNumber);
    params.append('Body', message);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params.toString()
      });

      const data = await response.json() as any;

      if (response.ok) {
        logger.info(`[TwilioSMS] Message successfully sent to ${to} (SID: ${data.sid})`);
        return { success: true, messageId: data.sid };
      } else {
        logger.error(`[TwilioSMS] Failed to send SMS: ${data.message || response.statusText}`);
        return { success: false, error: data.message || response.statusText };
      }
    } catch (e: any) {
      logger.error(`[TwilioSMS] API Error sending message to ${to}`, e);
      return { success: false, error: e.message };
    }
  }
}
