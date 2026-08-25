import { Worker, Job } from 'bullmq';
import { env } from '../../../config/env';
import { logger } from '../../../utils/logger';
import { GenericJobPayload, isQueueBrokerEnabled, queueBrokerDisabledReason } from './BackgroundQueue';
import { podcastEngineService } from '../../../services/podcast/podcastEngine.service';
import { noteRedisError, scheduleQuotaRecovery } from '../../../services/redisQuota';

/** How often to scan for jobs whose worker died mid-flight. See the note at the use site. */
const STALLED_INTERVAL_MS = Number(process.env.BULLMQ_STALLED_INTERVAL_MS || 300_000);

export class MediaWorker {
  private worker: Worker | null = null;

  constructor() {
    if (!isQueueBrokerEnabled()) {
      logger.info(
        `[MediaWorker] Skipping BullMQ worker (${queueBrokerDisabledReason()}). ` +
        'No media jobs will be processed.'
      );
      return;
    }
    const connection = { url: env.REDIS_URL! };
    const worker: Worker = new Worker('media-jobs', async (job: Job) => {
      const payload = job.data as GenericJobPayload;
      
      switch (job.name) {
        case 'podcast.stitch':
          await podcastEngineService.runStitchJob(payload.jobId);
          break;
        default:
          logger.warn(`[MediaWorker] Unknown job type ${job.name}`);
      }
    }, {
      connection,
      // ─── Upstash-friendly settings ───────────────────────────────────────
      stalledInterval: STALLED_INTERVAL_MS,
        // ─── Upstash bills per REQUEST, and this check runs forever ─────────
        // Three workers checking every 30 s is ~8,600 checks/day, several Redis commands
        // each — on its own more than the 500k/month allowance this account has. The only
        // thing a shorter interval buys is faster recovery of a job whose worker died
        // mid-flight, which for notifications, media and background jobs is not worth
        // spending the entire budget on. Overridable for a plan with room.
      lockDuration:   60_000,    // hold lock for 60 s → fewer EXPIRE calls
      drainDelay: 300,
        // SECONDS, not milliseconds — BullMQ blocks this long on an empty queue and the
        // default is 5. The old comment here read "300 ms instead of the default 5 ms",
        // which had the unit wrong in both halves; the value is fine, the reasoning was not.
    });
    this.worker = worker;

    worker.on('completed', (job) => {
      logger.info(`[MediaWorker] Job ${job.id} completed successfully`);
    });

    worker.on('failed', (job, err) => {
      logger.error(`[MediaWorker] Job ${job?.id} failed with error: ${err.message}`);
    });

    this.worker.on('error', (err: any) => {
      /*
       * Quota exhaustion is reported through the shared breaker so the whole process logs it
       * once, not once per worker, and so the other Redis consumers stop asking too.
       *
       * Pausing without scheduling a resume is what previously turned a temporary allowance
       * problem into a permanently dead job pipeline: nothing called resume, so jobs stayed
       * unprocessed even after the quota window rolled over.
       */
      if (noteRedisError(err, 'MediaWorker')) {
        this.worker!.pause(true).catch(() => {});
        scheduleQuotaRecovery(() => { this.worker!.resume(); }, 'MediaWorker');
        return;
      }
      logger.error(`[MediaWorker] Worker error: ${err?.message || err}`);
    });
  }


  async close() {
    try {
      if (this.worker) await this.worker.close();
    } catch (e: any) {
      logger.warn('[MediaWorker] Closed worker (suppressed Redis error during shutdown)');
    }
  }
}

export let mediaWorker: MediaWorker | null = null;

export const startMediaWorker = () => {
  if (!mediaWorker) {
    mediaWorker = new MediaWorker();
    logger.info('[MediaWorker] Started media worker loop');
  }
};
