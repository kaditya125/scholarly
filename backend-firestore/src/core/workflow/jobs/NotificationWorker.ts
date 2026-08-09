import { Worker, Job } from 'bullmq';
import { env } from '../../../config/env';
import { logger } from '../../../utils/logger';
import { NotificationPayload, NotificationValidator, NotificationLogger, NotificationAnalytics } from '../../notifications/NotificationEngine';
import { notificationService } from '../../../services/notification/notification.service';
import { deviceService } from '../../../services/notification/device.service';
import { aiNotificationProcessor } from '../../notifications/AiNotificationProcessor';
import { emailNotificationService } from '../../notifications/EmailNotificationService';
import { templateEngine } from '../../notifications/templates/TemplateEngine';
import { SchedulingEngine } from '../../notifications/SchedulingEngine';
import { container, TOKENS } from '../../di/container';
import { NotificationIntelligenceService } from '../../notifications/NotificationIntelligenceService';
import { deliveryOrchestrator } from '../../notifications/DeliveryOrchestrator';
import { createClient } from 'redis';
import { db } from '../../../config/firebase'; // 'admin' is not exported, we use getFirestore or admin messaging
import * as admin from 'firebase-admin';
import { isQueueBrokerEnabled, queueBrokerDisabledReason } from './BackgroundQueue';

class NotificationWorker {
  private worker: Worker | null = null;
  private redisClient: ReturnType<typeof createClient> | null = null;

  constructor() {
    // When the broker is disabled we skip BOTH the BullMQ.Worker (job dispatcher)
    // and the standalone redis client (anti-spam rate limiter is co-located with
    // messages, so it makes no sense to keep one without the other). 'skipped'
    // notifications fall back to in-process EventBus paths in NotificationEngine.
    if (!isQueueBrokerEnabled()) {
      logger.info(
        `[NotificationWorker] Skipping BullMQ + redis anti-spam cache (${queueBrokerDisabledReason()}). ` +
        'Notifications will be processed via in-memory paths only.'
      );
      return;
    }

    const connection = { url: env.REDIS_URL! };
    this.redisClient = createClient({ url: connection.url });
    this.redisClient.on('error', (err) => console.error('[NotificationWorker] Redis error:', err.message));
    this.redisClient.connect().catch(e => logger.error('[NotificationWorker] Redis connect error', e));

    const worker: Worker = new Worker(
      process.env.NOTIFICATION_QUEUE_NAME || 'notification-jobs',
      async (job: Job) => {
        try {
          if (job.name === 'notification.process') {
            await this.handleProcessNotification(job.data as NotificationPayload);
          }
        } catch (error) {
          logger.error(`[NotificationWorker] Job ${job.id} failed`, { error });
          throw error;
        }
      },
      {
        connection,
        concurrency: 5,
        // ─── Upstash-friendly settings ───────────────────────────────────────
        // stalledInterval: how often (ms) to check for stalled jobs.
        // Default is 5 000 ms — far too aggressive for Upstash free tier.
        stalledInterval: 30_000,   // check every 30 s instead of 5 s
        // lockDuration: how long (ms) a job lock is held before renewal.
        lockDuration: 60_000,      // 60 s lock → fewer EXPIRE calls
        // drainDelay: idle poll delay (ms) when the queue is empty.
        drainDelay: 300,           // 300 ms instead of the default 5 ms
      }
    );
    this.worker = worker;

    this.redisClient.on('error', (err: any) => {
      if (err?.message?.includes('max requests limit exceeded')) {
        if (!this.quotaErrorLogged) {
          this.quotaErrorLogged = true;
          logger.warn('[NotificationWorker] Upstash Redis daily quota limit reached (500k limit exceeded). Pausing worker polling to stop error spam.');
        }
        worker.pause(true).catch(() => {});
      }
    });

    worker.on('completed', (job) => {
      logger.debug(`[NotificationWorker] Job ${job.id} completed successfully`);
    });

    worker.on('failed', (job, err) => {
      logger.error(`[NotificationWorker] Job ${job?.id} completely failed`, { error: err.message });
    });

    worker.on('error', (err: any) => {
      const msg = err?.message || '';
      if (msg.includes('max requests limit exceeded') || msg.includes('Limit:')) {
        if (!this.quotaErrorLogged) {
          this.quotaErrorLogged = true;
          logger.warn('[NotificationWorker] Upstash Redis daily quota limit reached (500k limit exceeded). Pausing worker polling to stop error spam.');
        }
        worker.pause(true).catch(() => {});
      } else {
        logger.error(`[NotificationWorker] Worker error: ${msg}`);
      }
    });
  }

  private async handleProcessNotification(rawPayload: any): Promise<void> {
    try {
      // 1. Validate Payload
      const payload = NotificationValidator.validate(rawPayload);

      // 2. Preference Engine Check
      const preferences = await notificationService.getPreferences(payload.userId);
      
      // If the user has disabled this category, drop the notification
      if (preferences[payload.category] === false) {
        logger.info(`[NotificationWorker] Dropped notification ${payload.type} for user ${payload.userId} (muted by preference)`);
        NotificationAnalytics.trackFailed(payload, 'Muted by Preferences');
        return;
      }

      // 3. Smart Rate Limiting & Anti-Spam (Redis)
      // Anti-spam is best-effort: when the broker is disabled the whole block
      // is skipped (analogous to BullMQ being nulled in the constructor) and
      // delivery proceeds via the *same* downstream direct-channel APIs that
      // the broker-backed path uses \u2014 FCM HTTP (admin.messaging()), Twilio
      // HTTP, the project's configured email provider (see emailNotificationService),
      // and the Firebase in-app center. There is no in-memory queue-of-record
      // anywhere; we just lose the dedupe layer.
      if (this.redisClient) {
        const rateLimitKey = `notif:ratelimit:${payload.userId}:${payload.type}`;
        const recentCount = await this.redisClient.incr(rateLimitKey);

        if (recentCount === 1) {
          // First occurrence, set expiry (e.g., 60 seconds)
          await this.redisClient.expire(rateLimitKey, 60);
        } else if (recentCount > 3) {
          // Prevent duplicate spam (more than 3 identical events in 60s)
          logger.warn(`[NotificationWorker] Suppressed duplicate spam for ${payload.type} (User: ${payload.userId})`);
          NotificationAnalytics.trackFailed(payload, 'Rate Limited (Anti-Spam)');
          return;
        }
      } else {
        logger.debug(`[NotificationWorker] Anti-spam skipped for ${payload.type} (User: ${payload.userId}) \u2014 broker disabled.`);
      }

      // 4. AI Urgency & Timing Recommendations (NotificationIntelligenceService)
      const intelService = container.resolve<NotificationIntelligenceService>(TOKENS.NotificationIntelligenceService);
      const recommendation = await intelService.evaluate(payload);

      payload.priority = recommendation.priority;
      if (recommendation.customBody) {
        payload.body = recommendation.customBody;
      }

      // If AI classifies it as silent spam, drop it
      if (payload.priority === 'silent') {
        logger.info(`[NotificationWorker] AI classified ${payload.type} as silent spam. Dropping.`);
        NotificationAnalytics.trackFailed(payload, 'AI Classified Silent');
        return;
      }

      // 4.5 Timezone-Aware Quiet Hours Scheduling
      const delayMs = SchedulingEngine.calculateDelay(
        payload.priority,
        preferences.quietHours,
        preferences.timezone
      );
      
      if (delayMs > 0) {
        // Re-enqueue job with delay offset
        const { backgroundQueue } = require('./BackgroundQueue');
        await backgroundQueue.enqueueNotification(payload, 3, 1000, delayMs);
        logger.info(`[NotificationWorker] Rescheduled notification ${payload.type} for user ${payload.userId} in ${delayMs}ms due to quiet hours.`);
        return;
      }

      // 4.7 Centralized Template rendering (In-App)
      if (payload.templateId) {
        const rendered = templateEngine.render(payload.templateId, payload.templateVariables || {}, 'inApp');
        if (rendered) {
          if (rendered.title) payload.title = rendered.title;
          payload.body = rendered.body;
        }
      }

      // 5. Deliver to In-App Center (Firestore)
      await notificationService.createNotification(payload);
      NotificationLogger.logCreated(payload);
      NotificationAnalytics.trackDelivered(payload);

      // 6. Channel Selection: Combine AI Recommendations & User Preferences
      const activeChannels = recommendation.recommendedChannels.filter(ch => {
        if (ch === 'in_app') return true;
        if (ch === 'push') return preferences.channels.inApp && preferences.channels.push;
        if (ch === 'email') return preferences.channels.email;
        if (ch === 'whatsapp') return preferences.channels.whatsapp && preferences.whatsappNumber;
        if (ch === 'sms') return preferences.channels.sms && preferences.phoneNumber;
        return false;
      });

      // 7. Multi-Channel Routing (FCM / Push)
      if (activeChannels.includes('push')) {
        try {
          const tokens = await deviceService.getTokens(payload.userId);
          if (tokens.length > 0) {
            const pushRender = payload.templateId
              ? templateEngine.render(payload.templateId, payload.templateVariables || {}, 'push')
              : null;
            const pushTitle = pushRender?.title || payload.title;
            const pushBody = pushRender?.body || payload.body;

            const message = {
              notification: {
                title: pushTitle,
                body: pushBody,
              },
              data: {
                type: payload.type,
                actionUrl: payload.actionUrl || '',
                id: (payload as any).id || ''
              },
              tokens: tokens,
            };
            
            const start = Date.now();
            const response = await admin.messaging().sendEachForMulticast(message);
            const latency = Date.now() - start;
            await NotificationAnalytics.trackSent(payload, 'push', latency, 0.0);
            
            // Clean up stale tokens
            const failedTokens: string[] = [];
            response.responses.forEach((resp: any, idx: number) => {
              if (!resp.success) {
                const error = resp.error;
                if (error?.code === 'messaging/invalid-registration-token' ||
                    error?.code === 'messaging/registration-token-not-registered') {
                  failedTokens.push(tokens[idx]);
                }
              }
            });

            // Async cleanup
            failedTokens.forEach(token => {
              deviceService.unregisterToken(payload.userId, token).catch(() => {});
            });

            logger.info(`[NotificationWorker] FCM Push sent to ${tokens.length - failedTokens.length} devices for ${payload.userId}`);
          }
        } catch (fcmErr) {
          logger.error(`[NotificationWorker] FCM Push failed for ${payload.userId}`, fcmErr);
        }
      }

      // 8. Dispatch to external channels (SMS, WhatsApp, Email) via Orchestrator fallbacks
      const externalChannels = activeChannels.filter(ch => ch === 'sms' || ch === 'whatsapp' || ch === 'email');
      if (externalChannels.length > 0) {
        await deliveryOrchestrator.routeDelivery(payload, externalChannels, preferences);
      }
    } catch (error: any) {
      NotificationLogger.logFailed(error, rawPayload);
      throw error;
    }
  }

  private quotaErrorLogged = false;

  async close(): Promise<void> {
    try {
      if (this.worker) await this.worker.close();
    } catch (e: any) {
      logger.warn('[NotificationWorker] Closed worker (suppressed Redis error during shutdown)');
    }
    try {
      if (this.redisClient) await this.redisClient.quit();
    } catch (e: any) {
      // ignore quit error on quota limit
    }
  }
}

// Singleton instance
export let notificationWorker: NotificationWorker | null = null;

export function startNotificationWorker() {
  if (!notificationWorker) {
    notificationWorker = new NotificationWorker();
    logger.info(`[NotificationWorker] Started processing queue: ${process.env.NOTIFICATION_QUEUE_NAME || 'notification-jobs'}`);
  }
}
