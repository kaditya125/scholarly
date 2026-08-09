import { Worker, Job } from 'bullmq';
import { env } from '../../../config/env';
import { logger } from '../../../utils/logger';
import { GenericJobPayload, isQueueBrokerEnabled, queueBrokerDisabledReason } from './BackgroundQueue';
import { podcastEngineService } from '../../../services/podcast/podcastEngine.service';

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
      stalledInterval: 30_000,   // check stalled jobs every 30 s (default: 5 s)
      lockDuration:   60_000,    // hold lock for 60 s → fewer EXPIRE calls
      drainDelay:        300,    // idle poll every 300 ms (default: 5 ms)
    });
    this.worker = worker;

    worker.on('completed', (job) => {
      logger.info(`[MediaWorker] Job ${job.id} completed successfully`);
    });

    worker.on('failed', (job, err) => {
      logger.error(`[MediaWorker] Job ${job?.id} failed with error: ${err.message}`);
    });

    this.worker.on('error', (err: any) => {
      const msg = err?.message || '';
      if (msg.includes('max requests limit exceeded') || msg.includes('Limit:')) {
        if (!this.quotaErrorLogged) {
          this.quotaErrorLogged = true;
          logger.warn('[MediaWorker] Upstash Redis daily quota limit reached (500k limit exceeded). Pausing worker polling to stop error spam. Set DISABLE_WORKERS=true or upgrade Upstash tier.');
        }
        worker.pause(true).catch(() => {});
      } else {
        logger.error(`[MediaWorker] Worker error: ${msg}`);
      }
    });
  }

  private quotaErrorLogged = false;

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
