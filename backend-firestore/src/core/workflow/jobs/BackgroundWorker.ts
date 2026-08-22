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
      stalledInterval: 30_000,   // check stalled jobs every 30 s (default: 5 s)
      lockDuration:   60_000,    // hold lock for 60 s → fewer EXPIRE calls
      drainDelay:        300,    // idle poll every 300 ms (default: 5 ms)
    });
    this.worker = worker;

    worker.on('completed', (job) => {
      logger.info(`[BackgroundWorker] Job ${job.id} completed successfully`);
    });

    worker.on('failed', (job, err) => {
      logger.error(`[BackgroundWorker] Job ${job?.id} failed with error: ${err.message}`);
    });

    worker.on('error', (err: any) => {
      const msg = err?.message || '';
      if (msg.includes('max requests limit exceeded') || msg.includes('Limit:')) {
        if (!this.quotaErrorLogged) {
          this.quotaErrorLogged = true;
          logger.warn('[BackgroundWorker] Upstash Redis daily quota limit reached (500k limit exceeded). Pausing worker polling to stop error spam. Set DISABLE_WORKERS=true or upgrade Upstash tier.');
        }
        worker.pause(true).catch(() => {});
      } else {
        logger.error(`[BackgroundWorker] Worker error: ${msg}`);
      }
    });
  }

  private quotaErrorLogged = false;

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
