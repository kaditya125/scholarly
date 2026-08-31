import { QueueEvents } from 'bullmq';
import { eventBus } from '../core/events/EventBus';
import '../core/events/subscribers'; 
import { logger } from '../utils/logger';
import { env } from '../config/env';
import { startNotificationWorker, notificationWorker } from '../core/workflow/jobs/NotificationWorker';

/*
 * DI bootstrap. This script runs application services outside server.ts, so nothing else would
 * populate the container — and an empty container fails through the same quiet degradation path
 * a genuinely missing provider does. See core/di/probeBootstrap for the incident this prevents.
 */
import { bootstrapForProbe } from '../core/di/probeBootstrap';
bootstrapForProbe();


const connection = { url: env.REDIS_URL || 'redis://localhost:6379' };
const queueEvents = new QueueEvents('notification-jobs', { connection });

async function runChaosTest() {
  logger.info(`--- Starting Chaos Test ---`);
  startNotificationWorker();
  
  // Monkey-patch the notification service to simulate random failures
  const { notificationService } = require('../services/notification/notification.service');
  const originalCreate = notificationService.createNotification.bind(notificationService);
  
  let failureCount = 0;
  notificationService.createNotification = async (payload: any) => {
    // Fail 70% of the time to trigger BullMQ retries and DLQ
    if (Math.random() < 0.7) {
      failureCount++;
      throw new Error('Simulated Chaos Crash (Transient Firestore Error)');
    }
    return originalCreate(payload);
  };

  return new Promise<void>(async (resolve) => {
    let completed = 0;
    let failedToDLQ = 0;
    const TOTAL_EVENTS = 10;

    queueEvents.on('completed', () => {
      completed++;
      checkDone();
    });

    queueEvents.on('failed', ({ failedReason }) => {
      // BullMQ emits 'failed' on the final failed attempt (moved to DLQ)
      if (failedReason.includes('Simulated Chaos')) {
        failedToDLQ++;
        checkDone();
      }
    });

    function checkDone() {
      if (completed + failedToDLQ >= TOTAL_EVENTS) {
        logger.info(`--- Chaos Test Complete ---`);
        logger.info(`Total Completed Successfully: ${completed}`);
        logger.info(`Total Failed to DLQ: ${failedToDLQ}`);
        logger.info(`Total Internal Failures Intercepted by BullMQ: ${failureCount}`);
        resolve();
      }
    }

    // Fire events
    logger.info('[ChaosTest] Firing 10 events into unstable worker...');
    for (let i = 0; i < TOTAL_EVENTS; i++) {
      await eventBus.publish('podcast.completed', {
        podcastId: `pod_chaos_${i}`,
        userId: `user_chaos_${i}`,
        durationMs: 60000,
        fileUrl: 'https://sadhya.app/chaos.mp3'
      } as any);
    }
  });
}

runChaosTest().then(async () => {
  await queueEvents.close();
  if (notificationWorker) await notificationWorker.close();
  process.exit(0);
}).catch(e => {
  logger.error('Chaos test failed', e);
  process.exit(1);
});
