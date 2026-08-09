import { container, TOKENS } from '../di/container';
import { ISmsProvider } from './providers/SmsProvider';
import { IWhatsAppProvider } from './providers/WhatsAppProvider';
import { NotificationPayload, NotificationAnalytics } from './NotificationEngine';
import { logger } from '../../utils/logger';
import { db } from '../../config/firebase';
import { emailNotificationService } from './EmailNotificationService';

class CircuitBreaker {
  private failures = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  private nextAttemptTime = 0;
  private readonly threshold = 3;
  private readonly resetTimeoutMs = 60000; // 1 minute timeout

  async execute<T>(fn: () => Promise<T>, fallback: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() > this.nextAttemptTime) {
        this.state = 'half-open';
      } else {
        logger.warn(`[CircuitBreaker] Breaker is OPEN. Executing fallback routing.`);
        return fallback();
      }
    }

    try {
      const result = await fn();
      if (this.state === 'half-open') {
        logger.info('[CircuitBreaker] State returned to CLOSED after successful test.');
        this.state = 'closed';
        this.failures = 0;
      }
      return result;
    } catch (e: any) {
      this.failures++;
      logger.error(`[CircuitBreaker] Call failed. Failure count: ${this.failures}/${this.threshold}. Error: ${e.message}`);
      if (this.failures >= this.threshold) {
        this.state = 'open';
        this.nextAttemptTime = Date.now() + this.resetTimeoutMs;
        logger.error(`[CircuitBreaker] Breaker tripped to OPEN state. Reset timeout: ${this.resetTimeoutMs}ms`);
      }
      return fallback();
    }
  }

  getState(): string {
    return this.state;
  }
}

export class DeliveryOrchestrator {
  private waBreaker = new CircuitBreaker();
  private smsBreaker = new CircuitBreaker();

  /**
   * Tracks consecutive failures, and routes across channels safely (WhatsApp -> SMS -> Email)
   */
  async routeDelivery(payload: NotificationPayload, channels: string[], preferences: any): Promise<boolean> {
    logger.info(`[DeliveryOrchestrator] Dispatching notification ${payload.type} via channels: ${channels.join(', ')}`);
    
    let delivered = false;

    // 1. Process WhatsApp
    if (channels.includes('whatsapp') && preferences.whatsappNumber) {
      delivered = await this.waBreaker.execute(
        async () => {
          const waProvider = container.resolve<IWhatsAppProvider>(TOKENS.WhatsAppProvider);
          const start = Date.now();
          const result = await (payload.templateId
            ? waProvider.sendTemplateMessage(preferences.whatsappNumber, payload.templateId, 'en', [])
            : waProvider.sendTextMessage(preferences.whatsappNumber, payload.body));
          
          const latency = Date.now() - start;
          const cost = payload.templateId ? 0.015 : 0.005; // WhatsApp standard costs

          if (result.success) {
            await NotificationAnalytics.trackSent(payload, 'whatsapp', latency, cost);
            return true;
          }
          throw new Error(result.error || 'WhatsApp Provider Failure');
        },
        async () => {
          logger.warn(`[DeliveryOrchestrator] WhatsApp failed or blocked. Escalating to SMS fallback route...`);
          return false;
        }
      );
    }

    if (delivered) return true;

    // 2. Process SMS
    if ((channels.includes('sms') || channels.includes('whatsapp')) && preferences.phoneNumber) {
      delivered = await this.smsBreaker.execute(
        async () => {
          const smsProvider = container.resolve<ISmsProvider>(TOKENS.SmsProvider);
          const start = Date.now();
          const result = await smsProvider.sendSms(preferences.phoneNumber, payload.body);
          
          const latency = Date.now() - start;
          // Calculate SMS cost: 1 segment = 160 chars. Flat $0.01 per segment.
          const segments = Math.ceil(payload.body.length / 160);
          const cost = segments * 0.01;

          if (result.success) {
            await NotificationAnalytics.trackSent(payload, 'sms', latency, cost);
            return true;
          }
          throw new Error(result.error || 'SMS Provider Failure');
        },
        async () => {
          logger.warn(`[DeliveryOrchestrator] SMS failed or blocked. Escalating to Email fallback route...`);
          return false;
        }
      );
    }

    if (delivered) return true;

    // 3. Process Email
    if (channels.includes('email') || channels.includes('sms') || channels.includes('whatsapp')) {
      try {
        const start = Date.now();
        await emailNotificationService.sendCriticalAlert(payload);
        const latency = Date.now() - start;
        await NotificationAnalytics.trackSent(payload, 'email', latency, 0.0001); // Flat cost for SMTP
        return true;
      } catch (emailErr: any) {
        logger.error(`[DeliveryOrchestrator] Email fallback failed: ${emailErr.message}`);
      }
    }

    // 4. Send to DLQ (Dead Letter Queue) on complete failure
    if (!delivered) {
      logger.error(`[DeliveryOrchestrator] Notification completely failed delivery across all fallback paths. Routing to DLQ.`);
      await this.writeToDLQ(payload, 'Failed all delivery channels');
    }

    return delivered;
  }

  private async writeToDLQ(payload: NotificationPayload, reason: string): Promise<void> {
    try {
      await db.collection('failed_notifications').add({
        payload,
        reason,
        timestamp: Date.now()
      });
      await NotificationAnalytics.trackFailed(payload, `DLQ: ${reason}`);
    } catch (e: any) {
      logger.error('[DeliveryOrchestrator] Failed to write to DLQ collection', e);
    }
  }

  getHealthReport(): Record<string, string> {
    return {
      whatsappBreaker: this.waBreaker.getState(),
      smsBreaker: this.smsBreaker.getState()
    };
  }
}

export const deliveryOrchestrator = new DeliveryOrchestrator();
