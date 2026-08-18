import { QueueEvents } from 'bullmq';
import { eventBus } from '../core/events/EventBus';
import { registerEventSubscribers } from '../core/events/subscribers';
import { logger } from '../utils/logger';
import { env } from '../config/env';
import { startNotificationWorker, notificationWorker } from '../core/workflow/jobs/NotificationWorker';

const EVENT_COUNT = 1000;
const connection = { url: env.REDIS_URL || 'redis://localhost:6379' };
const queueEvents = new QueueEvents('notification-jobs', { connection });

async function runLoadTest() {
  logger.info(`--- Starting Load Test: ${EVENT_COUNT} events ---`);
  registerEventSubscribers();
  
  // Start the worker to process the events we enqueue
  startNotificationWorker();
  
  const startTime = Date.now();
  let completed = 0;
  const latencies: number[] = [];
  const enqueueTimes = new Map<string, number>();

  return new Promise<void>((resolve) => {
    // Listen for completion
    queueEvents.on('completed', () => {
      const completionTime = Date.now();
      completed++;
      
      latencies.push(completionTime - startTime);
      // Calculate end-to-end latency (rough estimate since we lack enqueue exact timestamp on this object)
      // Actually we can just track time from start to completion since we burst them.
      if (completed % 100 === 0) {
        logger.info(`[LoadTest] Processed ${completed}/${EVENT_COUNT}`);
      }

      if (completed === EVENT_COUNT) {
        const totalDuration = Date.now() - startTime;
        latencies.sort((a, b) => a - b);
        
        const p50 = latencies[Math.floor(latencies.length * 0.50)] || 0;
        const p95 = latencies[Math.floor(latencies.length * 0.95)] || 0;
        const p99 = latencies[Math.floor(latencies.length * 0.99)] || 0;

        logger.info(`--- Load Test Complete ---`);
        logger.info(`Total Duration: ${totalDuration} ms`);
        logger.info(`Throughput: ${Math.round((EVENT_COUNT / totalDuration) * 1000)} jobs/sec`);
        logger.info(`Latency P50: ${p50} ms`);
        logger.info(`Latency P95: ${p95} ms`);
        logger.info(`Latency P99: ${p99} ms`);
        resolve();
      }
    });

    // Fire events concurrently in batches to avoid totally blocking Node loop
    const publishBatch = async (batchSize: number, total: number) => {
      for (let i = 0; i < total; i += batchSize) {
        const promises = [];
        for (let j = 0; j < batchSize && (i + j) < total; j++) {
          promises.push(
            eventBus.publish('podcast.completed', {
              podcastId: `pod_load_${i+j}`,
              userId: `user_load_${i+j}`,
              durationMs: 1200000,
              fileUrl: 'https://sadhya.app/audio.mp3'
            } as any)
          );
        }
        await Promise.all(promises);
      }
      logger.info(`[LoadTest] Successfully enqueued ${total} events`);
    };

    publishBatch(100, EVENT_COUNT).catch(e => {
      logger.error('Failed to enqueue batch', e);
    });
  });
}

runLoadTest().then(async () => {
  await queueEvents.close();
  if (notificationWorker) await notificationWorker.close();
  process.exit(0);
}).catch(e => {
  logger.error('Load test failed', e);
  process.exit(1);
});
