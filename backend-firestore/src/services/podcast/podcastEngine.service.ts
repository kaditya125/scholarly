import { getStorage } from 'firebase-admin/storage';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { PodcastMetadata, PodcastStatus } from '../../types';
import { podcastRepository } from '../../repositories/podcast.repository';
import { backgroundQueue } from '../../core/workflow/jobs/BackgroundQueue';
import { sourceResolver } from '../../core/workflow/podcast/SourceResolver';
import { podcastPlanner } from '../../core/workflow/podcast/PodcastPlanner';
import { conversationGenerator } from '../../core/workflow/podcast/ConversationGenerator';
import { audioComposer } from '../../core/workflow/podcast/AudioComposer';
import { podcastAssetsService } from './podcastAssets.service';
import { shadowModeRunner } from '../../core/director/ShadowModeRunner';
import { cinematicShadowRunner } from '../media/rendering';
import { Policy, handleAll, ExponentialBackoff, retry } from 'cockatiel';
import { logger } from '../../utils/logger';
import { eventBus } from '../../core/events/EventBus';
import { Telemetry } from '../../lib/telemetry';
import {
  ComposedAudio,
  PodcastGenerateRequest,
  PodcastJob,
  PodcastJobStage,
  STAGE_PROGRESS,
  DURATION_CHOICES,
} from '../../core/workflow/podcast/types';
import { isPodcastStyleId } from '../../core/workflow/podcast/podcastStyles';

class CancelledError extends Error {
  constructor() {
    super('cancelled');
    this.name = 'CancelledError';
  }
}

/** Coarse client-facing status for each granular job stage. */
const STAGE_STATUS: Record<PodcastJobStage, PodcastStatus> = {
  QUEUED: 'PENDING',
  PLANNING: 'PLANNING',
  SCRIPTING: 'GENERATING_SCRIPT',
  SYNTHESIZING: 'GENERATING_AUDIO',
  STITCHING: 'STITCHING_AUDIO',
  SYNCING: 'STITCHING_AUDIO',
  UPLOADING: 'UPLOADING',
  DONE: 'READY',
  ERROR: 'FAILED',
  CANCELLED: 'CANCELLED',
};

/**
 * PodcastEngineService — orchestrates the Phase 1 pipeline:
 *   SourceResolver → PodcastPlanner → ConversationGenerator → AudioComposer → upload → READY
 * Runs as a durable BullMQ job (enqueued by startGeneration, executed by runJob from the
 * BackgroundWorker). Writes PodcastStatus + progress to Firestore at each stage (the frontend
 * usePodcast hook streams these live via onSnapshot), and honors cooperative cancellation.
 */
export class PodcastEngineService {
  private readonly retryPolicy = retry(handleAll, {
    maxAttempts: 3,
  });

  /**
   * Generate a deduplication hash for a podcast request
   * Same request parameters = same hash = same podcast can be reused
   */
  private hashRequest(userId: string, request: PodcastGenerateRequest): string {
    const normalized = JSON.stringify({
      userId,
      type: request.type,
      source: request.source,
      durationMinutes: request.durationMinutes,
      speakerStyle: request.speakerStyle,
      voiceStyle: request.voiceStyle,
      language: request.language,
    });
    return crypto.createHash('sha256').update(normalized).digest('hex');
  }

  /** Validate + clamp the request, create the podcast + job docs, enqueue the durable job. */
  async startGeneration(userId: string, req: PodcastGenerateRequest): Promise<{ podcastId: string; jobId: string }> {
    const request = this.normalize(req);
    const requestHash = this.hashRequest(userId, request);

    // Check for duplicate in-progress generation
    const existingPodcast = await this.findInProgressByHash(userId, requestHash);
    if (existingPodcast) {
      logger.info('[PodcastEngine] Deduplication: returning existing in-progress podcast', {
        userId,
        podcastId: existingPodcast.id,
        requestHash
      });
      return { podcastId: existingPodcast.id, jobId: existingPodcast.jobId || '' };
    }

    const podcastId = `pod_${uuidv4()}`;
    const jobId = `pjob_${uuidv4()}`;
    const now = Date.now();
    const notebookId = (request.source.notebookId || '').trim();

    const podcast: PodcastMetadata = {
      id: podcastId,
      notebookId,
      userId,
      title: 'Preparing your podcast…',
      description: '',
      language: request.language || 'English',
      voiceProvider: 'Google Cloud TTS',
      speakers: [],
      status: 'PENDING',
      type: request.type,
      sourceKind: request.source.kind,
      jobId,
      progressPct: STAGE_PROGRESS.QUEUED,
      createdAt: now,
      updatedAt: now,
      requestHash, // Store hash for deduplication
    } as any;
    await podcastRepository.createPodcast(podcast);

    const job: PodcastJob = {
      id: jobId,
      podcastId,
      userId,
      request,
      stage: 'QUEUED',
      progressPct: STAGE_PROGRESS.QUEUED,
      stageMessage: 'Queued',
      cancelRequested: false,
      attempts: 0,
      createdAt: now,
      updatedAt: now,
    };
    await podcastRepository.createJob(job);

    await backgroundQueue.enqueueGeneric('podcast.generate', { jobId });
    return { podcastId, jobId };
  }

  /**
   * Find an in-progress podcast with the same request hash
   */
  private async findInProgressByHash(userId: string, requestHash: string): Promise<PodcastMetadata | null> {
    try {
      const allPodcasts = await podcastRepository.listByUser(userId);
      const inProgress = allPodcasts.find(
        (p) => (p as any).requestHash === requestHash && 
               ['PENDING', 'PLANNING', 'GENERATING_SCRIPT', 'GENERATING_AUDIO', 'STITCHING_AUDIO', 'UPLOADING'].includes(p.status)
      );
      return inProgress || null;
    } catch (err) {
      logger.error('[PodcastEngine] Error checking for duplicate request:', err);
      return null; // Fail open: allow new generation if dedup check fails
    }
  }

  private normalize(req: PodcastGenerateRequest): PodcastGenerateRequest {
    const minutes = (DURATION_CHOICES as readonly number[]).includes(req.durationMinutes) ? req.durationMinutes : 10;
    return {
      type: req.type || 'custom',
      source: req.source || { kind: 'prompt', prompt: '' },
      durationMinutes: minutes,
      speakerStyle: req.speakerStyle || 'teacher_student',
      voiceStyle: req.voiceStyle,
      language: req.language || 'English',
      // Normalized to a known id here so an unrecognised value from an older or
      // hand-rolled client cannot reach the planner. This field is whitelisted
      // deliberately — anything not listed in this object is dropped.
      ...(isPodcastStyleId(req.podcastStyle) ? { podcastStyle: req.podcastStyle } : {}),
    };
  }

  /** Executed by the BullMQ worker. Runs the full pipeline with status + cancellation. */
  async runJob(jobId: string): Promise<void> {
    const job = await podcastRepository.getJob(jobId);
    if (!job) {
      console.error(`[Podcast] job ${jobId} not found`);
      return;
    }
    const { podcastId, userId, request } = job;
    await podcastRepository.updateJob(jobId, { attempts: (job.attempts || 0) + 1 });

    const tempDir = path.join(process.cwd(), 'temp', podcastId);
    let plan = job.checkpoint?.plan;
    let scriptComplete = job.checkpoint?.scriptComplete;
    let brief = null;

    try {
      await this.assertNotCancelled(jobId);
      
      // Stage 1: Planning
      if (!plan) {
        const startPlan = performance.now();
        await this.setStage(jobId, podcastId, 'PLANNING', 'Understanding your material…');
        brief = await this.retryPolicy.execute(() => sourceResolver.resolve(userId, request.source));
        plan = await this.retryPolicy.execute(() => podcastPlanner.buildPlan(userId, brief!, request));
        
        const planMs = performance.now() - startPlan;
        logger.info(`[PodcastEngine] PLANNING stage completed for ${podcastId}`, { durationMs: planMs });
        Telemetry.logLatency('podcast.stage_duration.planning', planMs, { podcastId });

        await podcastRepository.updateJob(jobId, { 'checkpoint.plan': plan } as any);
        await podcastRepository.updatePodcast(podcastId, {
          title: plan.title,
          description: plan.description,
          speakers: plan.speakers.map((s) => s.name),
          language: plan.language,
          type: plan.type,
          difficulty: plan.difficulty,
          teachingStrategy: plan.teachingStrategy,
          learningObjectives: plan.learningObjectives,
          personalizationSummary: plan.personalizationSummary,
        });
        
        void this.note(
          podcastId,
          'PLANNING',
          `Planned "${plan.title}" — ${plan.segments.length} segments: ${plan.segments
            .map((s) => s.title)
            .slice(0, 4)
            .join(' · ')}${plan.segments.length > 4 ? ' …' : ''}`
        );
        void this.note(
          podcastId,
          'PLANNING',
          `Approach: ${plan.teachingStrategy || 'standard'} · difficulty ${plan.difficulty || 'unspecified'} · ${plan.learningObjectives?.length ?? 0} learning objectives`
        );

        // Generate cover image asynchronously (don't block the workflow)
        this.generateCoverImage(userId, podcastId, plan).catch((err) => {
          logger.warn('[PodcastEngine] Cover image generation failed', {
            podcastId,
            error: err.message,
          });
        });
      }

      await this.assertNotCancelled(jobId);
      
      // Stage 2: Scripting
      // Always regenerate script on retry (it's fast and avoids storing nested arrays in Firestore)
      const startScript = performance.now();
      await this.setStage(jobId, podcastId, 'SCRIPTING', 'Writing the conversation…');
      if (!brief) brief = await this.retryPolicy.execute(() => sourceResolver.resolve(userId, request.source));
      
      void this.note(
        podcastId,
        'SCRIPTING',
        `Writing ${plan!.segments.length} segments for ${plan!.speakers
          .map((s) => `${s.name} (${s.role})`)
          .join(' and ')} in ${plan!.language}`
      );

      const script = await this.retryPolicy.execute(() =>
        conversationGenerator.generate(userId, brief!, plan!, (detail) =>
          void this.note(podcastId, 'SCRIPTING', detail)
        )
      );
      if (!script.lines.length) throw new Error('Empty script generated');

      void this.note(
        podcastId,
        'SCRIPTING',
        `Script complete — ${script.lines.length} dialogue turns, ${script.totalWords} words`
      );

      const scriptMs = performance.now() - startScript;
      logger.info(`[PodcastEngine] SCRIPTING stage completed for ${podcastId}`, { durationMs: scriptMs, totalWords: script.totalWords });
      Telemetry.logLatency('podcast.stage_duration.scripting', scriptMs, { podcastId });

      // Don't store full script in checkpoint to avoid Firestore nested array limitation
      // The script with citations arrays would violate Firestore's nested array constraint
      // We only need to track that scripting is complete - the script is immediately used for TTS
      await podcastRepository.updateJob(jobId, { 'checkpoint.scriptComplete': true } as any);

      // Stage 2.5: AI Director (Shadow Mode) — the ONLY hook into the planning
      // layer. No-ops entirely unless AI_DIRECTOR_ENABLED is set, never throws,
      // and in shadow mode runs in the background so generation latency and the
      // rendered audio are both unaffected. See core/director/ShadowModeRunner.
      const directorOutcome = await shadowModeRunner.run({
        podcastId,
        userId,
        plan: plan!,
        script,
        brief: brief!,
        request,
      });

      // A Director failure means no timeline is stored, which makes the cinematic
      // renderer skip and hand back a voice-only episode. Say so instead of
      // letting the user wonder why the audio is flat.
      if (directorOutcome.reason === 'error') {
        void this.note(
          podcastId,
          'SCRIPTING',
          `Cinematic planning failed — this episode will be voice-only (${directorOutcome.error})`
        );
      }

      await this.assertNotCancelled(jobId);
      
      // Stage 3: Synthesizing chunks
      const startSynth = performance.now();
      await this.setStage(jobId, podcastId, 'SYNTHESIZING', 'Generating the voices…');
      void this.note(
        podcastId,
        'SYNTHESIZING',
        `Synthesizing ${script.lines.length} turns with ${plan!.speakers.length} voice(s) — ${plan!.speakers.map((s) => s.name).join(', ')}`
      );
      // Inner retry loop for TTS generation
      const chunks = await this.retryPolicy.execute(() => 
        audioComposer.composeChunks(
          userId,
          podcastId,
          (request.source.notebookId || 'none').trim() || 'none',
          plan!,
          script,  // Use the script we just generated
          tempDir,
          job.checkpoint?.ttsSegments || {},
          {
            onProgress: (done, total) => {
              const span = STAGE_PROGRESS.STITCHING - STAGE_PROGRESS.SYNTHESIZING;
              const pct = STAGE_PROGRESS.SYNTHESIZING + Math.round((done / total) * span);
              podcastRepository.updateJob(jobId, { progressPct: pct, stageMessage: `Generating voices ${done}/${total}` }).catch(() => {});
              podcastRepository.updatePodcast(podcastId, { progressPct: pct }).catch(() => {});

              // Synthesis is the longest stage by far. Report the line being
              // voiced at intervals so the panel keeps moving instead of sitting
              // on one message for minutes. Every ~25% and on the final line.
              const quarter = Math.max(1, Math.floor(total / 4));
              if (done === total || done % quarter === 0) {
                const line = script.lines[done - 1];
                void this.note(
                  podcastId,
                  'SYNTHESIZING',
                  line
                    ? `Voiced ${done}/${total} — ${line.speaker}: ${String(line.text).replace(/\s+/g, ' ').slice(0, 130)}`
                    : `Voiced ${done}/${total} lines`
                );
              }
            },
          }
        )
      );
      const synthMs = performance.now() - startSynth;
      logger.info(`[PodcastEngine] SYNTHESIZING chunks completed for ${podcastId}`, { durationMs: synthMs });
      
      const chunksMetadata = {
        transcript: chunks.transcript,
        chapters: chunks.chapters,
        durationMs: chunks.durationMs,
        totalWords: chunks.totalWords,
        totalCharacters: chunks.totalCharacters
      };
      
      // Save checkpoint with chunks metadata - MUST complete before enqueuing stitch job
      await podcastRepository.updateJob(jobId, { 
        'checkpoint.ttsSegments': chunks.ttsSegments,
        'checkpoint.chunksMetadata': chunksMetadata
      } as any);
      
      // Wait a bit to ensure Firestore write propagates (eventual consistency)
      await new Promise(resolve => setTimeout(resolve, 500));

      // Enqueue the Stitching job to the media queue
      await this.setStage(jobId, podcastId, 'STITCHING', 'Stitching audio…');
      await backgroundQueue.enqueueMediaJob('podcast.stitch', { jobId });
    } catch (err: any) {
      if (err instanceof CancelledError) {
        await this.setStage(jobId, podcastId, 'CANCELLED', 'Cancelled');
      } else {
        console.error(`[Podcast] generation failed (${podcastId}):`, err);
        const job = await podcastRepository.getJob(jobId);
        if (job && job.attempts >= 3) {
          await podcastRepository.updateJob(jobId, { stage: 'ERROR', error: String(err?.message || err), progressPct: 100 });
          await podcastRepository.updatePodcast(podcastId, { status: 'FAILED', description: String(err?.message || err) });
          eventBus.publish('podcast.failed', { podcastId, userId, error: String(err?.message || err) });
        } else {
          throw err;
        }
      }
    } finally {
      try {
        if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
      } catch { /* ignore cleanup errors */ }
    }
  }

  /** Executed by the MediaWorker. Stitches the downloaded chunks. */
  async runStitchJob(jobId: string): Promise<void> {
    const job = await podcastRepository.getJob(jobId);
    if (!job) {
      logger.error(`[PodcastEngine] Stitch job ${jobId} not found`);
      return;
    }
    const { podcastId, userId, request } = job;
    await podcastRepository.updateJob(jobId, { attempts: (job.attempts || 0) + 1 });
    const tempDir = path.join(process.cwd(), 'temp', podcastId + '_stitch');

    try {
      await this.assertNotCancelled(jobId);

      if (!job.checkpoint?.chunksMetadata || !job.checkpoint?.ttsSegments) {
        logger.error(`[PodcastEngine] Missing checkpoint data for stitch job ${jobId}`, {
          hasCheckpoint: !!job.checkpoint,
          hasChunksMetadata: !!job.checkpoint?.chunksMetadata,
          hasTtsSegments: !!job.checkpoint?.ttsSegments,
          checkpoint: job.checkpoint
        });
        throw new Error('Missing chunks metadata in checkpoint');
      }

      const chunks = {
        ttsSegments: job.checkpoint.ttsSegments,
        ...job.checkpoint.chunksMetadata
      };

      const startStitch = performance.now();
      await this.setStage(jobId, podcastId, 'STITCHING', 'Stitching audio chunks…');
      const composed = await this.retryPolicy.execute(() => 
        audioComposer.stitchChunks(chunks, tempDir)
      );
      const stitchMs = performance.now() - startStitch;
      logger.info(`[PodcastEngine] STITCHING stage completed for ${podcastId}`, { durationMs: stitchMs });
      Telemetry.logLatency('podcast.stage_duration.stitching', stitchMs, { podcastId });

      await this.assertNotCancelled(jobId);

      // Stage 4.5: Cinematic Audio Rendering (shadow mode or active)
      // Runs the CinematicAudioRenderer in parallel with or instead of AudioComposer.
      // In shadow mode (CINEMATIC_AUDIO_ENABLED=false): fire-and-forget background rendering,
      // logs stats but doesn't replace composed audio (zero production impact).
      // In active mode (CINEMATIC_AUDIO_ENABLED=true): renders cinematic audio and uses it
      // instead of composed audio if successful (falls back to composed on failure).
      const cinematicResult = await cinematicShadowRunner.run({
        podcastId,
        userId,
        composedAudio: composed,
      });

      // Use cinematic audio if active mode succeeded, otherwise use composed audio
      const usedCinematic =
        cinematicResult.rendered && cinematicResult.isActive && !!cinematicResult.audioPath;
      const finalAudio = usedCinematic
        ? { ...composed, audioLocalPath: cinematicResult.audioPath! }
        : composed;

      // Surface the cinematic outcome honestly. When the mix fails we fall back
      // to voice-only, and previously the only trace was a server log line — the
      // user just heard a flat episode with no explanation.
      void this.note(
        podcastId,
        'STITCHING',
        usedCinematic
          ? `Cinematic mix applied — music, ambience and effects layered under the voice${
              cinematicResult.warnings?.length
                ? ` (${cinematicResult.warnings.length} warning(s))`
                : ''
            }`
          : cinematicResult.isActive
            ? 'Cinematic mix unavailable for this episode — delivered voice-only'
            : 'Voice-only mix (cinematic rendering not enabled)'
      );

      // Stage 4: Uploading
      await this.setStage(jobId, podcastId, 'UPLOADING', 'Finalizing your episode…');
      const { audioPath, transcriptPath } = await this.retryPolicy.execute(() => 
        this.upload(userId, podcastId, (request.source.notebookId || 'none').trim() || 'none', finalAudio)
      );

      // DONE
      await this.setStage(jobId, podcastId, 'DONE', 'Ready');
      await podcastRepository.updatePodcast(podcastId, {
        status: 'READY',
        audioPath,
        transcriptPath,
        durationMs: composed.durationMs,
        duration: Math.round(composed.durationMs / 1000),
        estimatedListeningTime: Math.round(composed.durationMs / 1000),
        totalWords: composed.totalWords,
        totalCharacters: composed.totalCharacters,
        chapters: composed.chapters,
        progressPct: 100,
      });

      eventBus.publish('podcast.completed', {
        podcastId,
        userId,
        durationMs: composed.durationMs
      });

      // Post-generation step: trigger asset generation (flashcards, quiz, mind map, etc.)
      await this.retryPolicy.execute(() => 
        podcastAssetsService.triggerAssetGeneration(userId, podcastId, transcriptPath)
      );
    } catch (err: any) {
      if (err instanceof CancelledError) {
        await this.setStage(jobId, podcastId, 'CANCELLED', 'Cancelled');
      } else {
        console.error(`[Podcast] stitch failed (${podcastId}):`, err);
        const job = await podcastRepository.getJob(jobId);
        if (job && job.attempts >= 3) {
          await podcastRepository.updateJob(jobId, { stage: 'ERROR', error: String(err?.message || err), progressPct: 100 });
          await podcastRepository.updatePodcast(podcastId, { status: 'FAILED', description: String(err?.message || err) });
          eventBus.publish('podcast.failed', { podcastId, userId, error: String(err?.message || err) });
        } else {
          throw err;
        }
      }

    } finally {
      try {
        if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
      } catch { /* ignore cleanup errors */ }
    }
  }

  async requestCancel(userId: string, podcastId: string): Promise<boolean> {
    const podcast = await podcastRepository.getPodcast(podcastId);
    if (!podcast || podcast.userId !== userId) return false;
    if (podcast.jobId) await podcastRepository.requestCancel(podcast.jobId);
    return true;
  }

  async deletePodcast(userId: string, podcastId: string): Promise<boolean> {
    const podcast = await podcastRepository.getPodcast(podcastId);
    if (!podcast || podcast.userId !== userId) return false;
    
    // Delete from Firestore
    await podcastRepository.deletePodcast(podcastId);
    
    // Also delete associated job if exists
    if (podcast.jobId) {
      await podcastRepository.deleteJob(podcast.jobId);
    }
    
    logger.info('[PodcastEngine] Deleted podcast', { userId, podcastId });
    return true;
  }

  async list(userId: string): Promise<PodcastMetadata[]> {
    return podcastRepository.listByUser(userId);
  }

  async get(userId: string, id: string): Promise<PodcastMetadata | null> {
    const p = await podcastRepository.getPodcast(id);
    if (!p || p.userId !== userId) return null;
    return p;
  }

  // ─── internals ──────────────────────────────────────────────────────────────

  private async assertNotCancelled(jobId: string): Promise<void> {
    const job = await podcastRepository.getJob(jobId);
    if (job?.cancelRequested) throw new CancelledError();
  }

  private async setStage(jobId: string, podcastId: string, stage: PodcastJobStage, message: string): Promise<void> {
    const pct = STAGE_PROGRESS[stage];
    await podcastRepository.updateJob(jobId, { stage, progressPct: pct, stageMessage: message });
    await podcastRepository.updatePodcast(podcastId, { status: STAGE_STATUS[stage], progressPct: pct });
  }

  /**
   * Append a line of REAL pipeline activity for the studio UI.
   *
   * The client previously invented its own narration on a timer, so the text on
   * screen was plausible fiction with no connection to what the backend was
   * doing. These entries carry actual values (segment titles, word counts, voice
   * names, cue counts) and are appended atomically.
   *
   * Fire-and-forget and never throws: progress commentary must not be able to
   * fail a generation.
   */
  private async note(
    podcastId: string,
    stage: PodcastJobStage,
    detail: string
  ): Promise<void> {
    try {
      const { FieldValue } = await import('firebase-admin/firestore');
      await podcastRepository.updatePodcast(podcastId, {
        stageDetails: FieldValue.arrayUnion({
          stage: STAGE_STATUS[stage],
          detail,
          at: Date.now(),
        }),
      } as any);
    } catch (err: any) {
      logger.debug('[PodcastEngine] stage detail write skipped', {
        podcastId,
        error: err?.message,
      });
    }
  }

  private async upload(
    userId: string,
    podcastId: string,
    notebookScope: string,
    composed: ComposedAudio,
  ): Promise<{ audioPath: string; transcriptPath: string }> {
    const bucket = getStorage().bucket();
    // PRIVATE path (no `public/` prefix): these objects are NOT world-readable and are served
    // only through the ownership-checked endpoints (audio via a short-lived signed URL,
    // transcript via a downloaded JSON response).
    const base = `podcasts/${userId}/${notebookScope}/${podcastId}`;

    const transcriptLocalPath = path.join(path.dirname(composed.audioLocalPath), 'transcript.json');
    fs.writeFileSync(transcriptLocalPath, JSON.stringify(composed.transcript, null, 2));

    const audioDest = `${base}/audio.mp3`;
    const transcriptDest = `${base}/transcript.json`;
    await bucket.upload(composed.audioLocalPath, { destination: audioDest, metadata: { contentType: 'audio/mpeg' } });
    await bucket.upload(transcriptLocalPath, { destination: transcriptDest, metadata: { contentType: 'application/json' } });

    return { audioPath: audioDest, transcriptPath: transcriptDest };
  }

  /**
   * Generate and upload cover image for a podcast
   */
  private async generateCoverImage(userId: string, podcastId: string, plan: any): Promise<void> {
    try {
      logger.info('[PodcastEngine] Starting cover image generation', { podcastId });
      
      const { coverImageService } = await import('../ai/coverImage.service');
      
      const coverImagePath = await coverImageService.generateAndUpload({
        userId,
        podcastId,
        title: plan.title,
        description: plan.description,
        // Segment titles describe what the episode actually depicts
        // ("The Collision", "The Final Plunge"), which is far better cover
        // material than the title alone.
        topics: (plan.segments ?? []).map((s: any) => s?.title).filter(Boolean),
        language: plan.language,
        type: plan.type,
      });

      await podcastRepository.updatePodcast(podcastId, {
        coverImagePath,
      });

      logger.info('[PodcastEngine] Cover image generated and uploaded', {
        podcastId,
        path: coverImagePath,
      });
    } catch (error: any) {
      logger.error('[PodcastEngine] Cover image generation failed', {
        podcastId,
        error: error.message,
      });
      // Don't throw - cover image is optional
    }
  }
}

export const podcastEngineService = new PodcastEngineService();
