import { Worker, Job } from 'bullmq';
import { env } from '../../../config/env';
import { logger } from '../../../utils/logger';
import { WorkflowPostExecutionPayload, SessionGenerateTitlePayload, GenericJobPayload, isQueueBrokerEnabled, queueBrokerDisabledReason } from './BackgroundQueue';

// Import Services needed for background tasks
import { workflowTelemetryService } from '../services/TelemetryService';
import { memoryUpdateService } from '../services/MemoryUpdateService';
import { memoryService } from '../services/MemoryService';
import { userProfileService } from '../../../services/userProfile.service';
import { evaluationService } from '../../intelligence/EvaluationService';
import { analyticsService } from '../../intelligence/AnalyticsService';
import { masteryEngine } from '../../intelligence/MasteryEngine';
import { studentPreferenceService } from '../../intelligence/PreferenceService';
import { semanticCache } from '../../intelligence/SemanticCache';
import { ChatService } from '../../../services/chat.service';
import { podcastEngineService } from '../../../services/podcast/podcastEngine.service';
import { podcastAssetsService } from '../../../services/podcast/podcastAssets.service';
import { noteRedisError, scheduleQuotaRecovery } from '../../../services/redisQuota';

/** How often to scan for jobs whose worker died mid-flight. See the note at the use site. */
const STALLED_INTERVAL_MS = Number(process.env.BULLMQ_STALLED_INTERVAL_MS || 300_000);

export class BackgroundWorker {
  private worker: Worker | null = null;
  private chatService: ChatService;

  constructor() {
    // Defense in depth: server.ts already gates startBackgroundWorker() on
    // DISABLE_WORKERS, and the BackgroundQueue constructor gates on REDIS_URL.
    // If anyone imports this class directly (or the env flips between server
    // boot and module init), we don't want to spin up a BullMQ.Worker that
    // will spam reconnect errors.
    if (!isQueueBrokerEnabled()) {
      this.worker = null;
      this.chatService = new ChatService();
      logger.info(
        `[BackgroundWorker] Skipping BullMQ worker (${queueBrokerDisabledReason()}). ` +
        'No background jobs will be processed. Call startBackgroundWorker() only after configuring REDIS_URL.'
      );
      return;
    }
    this.chatService = new ChatService();

    const connection = { url: env.REDIS_URL! };
    const worker: Worker = new Worker('background-jobs', async (job: Job) => {
      const payload = job.data as GenericJobPayload;
      
      switch (job.name) {
        case 'workflow.post_execution':
          // Deprecated: explicit background jobs are now enqueued directly by WorkflowEngine.
          break;
        case 'session.generateTitle':
          await this.handleSessionGenerateTitle(job.data as SessionGenerateTitlePayload);
          break;
        case 'analytics.logWorkflowMetrics':
          await workflowTelemetryService.logWorkflowMetrics(payload.userId, payload.analyticsPayload);
          break;
        case 'telemetry.persist':
          await workflowTelemetryService.persistTelemetry(payload.req, payload.telemetryPayload);
          break;
        case 'memory.updateSession':
          await memoryUpdateService.updateSessionMemory(payload.userId, payload.sessionId, payload.sessionContextWindow);
          break;
        case 'memory.updateSession.cacheHit':
          const mem = await memoryService.loadSessionMemory(payload.userId, payload.sessionId);
          await memoryUpdateService.updateSessionMemory(payload.userId, payload.sessionId, [...((mem?.contextWindow) || []), payload.query]);
          break;
        case 'profile.extract':
          await memoryUpdateService.extractProfileTask(payload.userId, payload.query, payload.fullReply);
          break;
        case 'cache.store':
          await semanticCache.store(payload.cacheAnswer, payload.cacheScope, payload.ttl);
          break;
        case 'intelligence.evaluate':
          await evaluationService.record(payload.evalInput);
          break;
        case 'intelligence.analytics':
          await analyticsService.record(payload.analyticsInput);
          break;
        case 'automation.resume_execution':
          const { automationEngine } = await import('../../automation/engine/AutomationEngine');
          await automationEngine.resumeExecution(payload.executionId, payload.nodeId);
          break;
        case 'intelligence.mastery':
          await masteryEngine.recordConcepts(payload.userId, payload.concepts, payload.type);
          break;
        case 'intelligence.preferences':
          await studentPreferenceService.learnImplicit(payload.userId, payload.observations);
          break;
        case 'podcast.generate':
          await podcastEngineService.runJob(payload.jobId);
          break;
        case 'podcast.postassets':
          await podcastAssetsService.generateAssets(payload.podcastId, payload.userId, payload.transcriptPath);
          break;
        default:
          logger.warn(`[BackgroundWorker] Unknown job type ${job.name}`);
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
      logger.info(`[BackgroundWorker] Job ${job.id} completed successfully`);
    });

    worker.on('failed', (job, err) => {
      logger.error(`[BackgroundWorker] Job ${job?.id} failed with error: ${err.message}`);
    });

    worker.on('error', (err: any) => {
      /*
       * Quota exhaustion is reported through the shared breaker so the whole process logs it
       * once, not once per worker, and so the other Redis consumers stop asking too.
       *
       * Pausing without scheduling a resume is what previously turned a temporary allowance
       * problem into a permanently dead job pipeline: nothing called resume, so jobs stayed
       * unprocessed even after the quota window rolled over.
       */
      if (noteRedisError(err, 'BackgroundWorker')) {
        worker.pause(true).catch(() => {});
        scheduleQuotaRecovery(() => { worker.resume(); }, 'BackgroundWorker');
        return;
      }
      logger.error(`[BackgroundWorker] Worker error: ${err?.message || err}`);
    });
  }


  private async handleSessionGenerateTitle(payload: SessionGenerateTitlePayload) {
    await this.chatService.generateAndSaveTitle(payload.sessionId, payload.messages);
  }

  async close() {
    try {
      if (this.worker) await this.worker.close();
    } catch (e: any) {
      logger.warn('[BackgroundWorker] Closed worker (suppressed Redis error during shutdown)');
    }
  }
}

export let backgroundWorker: BackgroundWorker | null = null;

export const startBackgroundWorker = () => {
  if (!backgroundWorker) {
    backgroundWorker = new BackgroundWorker();
    logger.info('[BackgroundWorker] Started worker loop');
  }
};
