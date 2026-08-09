/**
 * ShadowModeRunner — the ONLY bridge between the live podcast pipeline and the
 * Producer/Director planning layers.
 *
 * Exists so that `podcastEngine.service.ts` — a working, load-bearing service —
 * gains the smallest possible diff. All the flag logic, error handling and
 * persistence lives here, so the pipeline edit is a single guarded call.
 *
 * SAFETY CONTRACT (every clause is enforced below, not just documented):
 *   1. Returns early unless AI_DIRECTOR_ENABLED is on. Default is off, so a
 *      deploy of this code changes nothing.
 *   2. NEVER throws. Every failure path is caught and logged.
 *   3. Writes ONLY to podcast_timelines / podcast_producer_plans / user
 *      characters. Never to `podcasts` or `podcast_jobs`.
 *   4. In shadow mode it is FIRE-AND-FORGET, so it adds zero latency to
 *      generation — matching the existing cover-image pattern in the engine.
 *
 * Shadow mode is the first production milestone (AI_DIRECTOR_ARCHITECTURE §16
 * Stage 0): users receive exactly the same podcast while planning artifacts are
 * generated and stored for inspection.
 */

import { logger } from '../../utils/logger';
import { featureFlags, cinematicIntensity, targetLufs } from '../../config/featureFlags';
import { timelineRepository } from '../../repositories/timeline.repository';
import { characterRepository } from '../../repositories/character.repository';
import { AssetManifest, emptyAssetManifest } from '../../services/media/assets/AssetManifest';
import { aiProducer, type AIProducer } from '../producer/AIProducer';
import { AIDirector } from './AIDirector';
import { validateInvariants, formatValidationResult } from './validation';
import type { ProducerPlan } from '../producer/schema/producerPlan.schema';
import {
  cinematicBandFor,
  isPodcastStyleId,
  resolvePodcastStyle,
} from '../workflow/podcast/podcastStyles';

export interface ShadowRunInput {
  podcastId: string;
  userId: string;
  /** The existing PodcastPlan. */
  plan: unknown;
  /** The existing GeneratedScript. */
  script: unknown;
  /** The existing GroundingBrief. */
  brief: unknown;
  /** The existing PodcastGenerateRequest. */
  request: unknown;
}

/**
 * Whether a timeline was actually persisted.
 *
 * The cinematic renderer skips entirely without a stored timeline, so the caller
 * needs to know — otherwise a Director failure is indistinguishable from a
 * deliberately voice-only episode.
 */
export interface ShadowRunOutcome {
  /** True only when a timeline was written and is ready for the renderer. */
  ok: boolean;
  reason?: 'director_disabled' | 'shadow_mode' | 'error';
  error?: string;
}

export class ShadowModeRunner {
  constructor(private readonly producer: AIProducer = aiProducer) {}

  /**
   * The cinematic band for this episode.
   *
   * The plan is typed `unknown` here to keep the Director decoupled from the
   * podcast pipeline types, so the style is read defensively. Any plan without a
   * usable style — including every plan created before the style engine — keeps
   * the previous global behaviour.
   */
  private cinematicIntensityFor(plan: unknown): 'subtle' | 'balanced' | 'dramatic' {
    if (!featureFlags.enhancedPodcastStyles) return cinematicIntensity();

    const styleId = (plan as { podcastStyle?: unknown } | null)?.podcastStyle;
    if (!isPodcastStyleId(styleId)) return cinematicIntensity();

    return cinematicBandFor(resolvePodcastStyle(styleId));
  }

  /**
   * Entry point called by the pipeline.
   *
   * In shadow mode this returns immediately and completes in the background —
   * generation latency is unaffected. When shadow mode is off (a future
   * rendering stage needs the timeline) it awaits, because the caller will
   * depend on the result.
   */
  async run(input: ShadowRunInput): Promise<ShadowRunOutcome> {
    if (!featureFlags.aiDirector) {
      return { ok: false, reason: 'director_disabled' };
    }

    if (featureFlags.aiDirectorShadowMode) {
      // Fire-and-forget: planning must never delay or fail a podcast.
      void this.execute(input).catch((err) => {
        logger.warn('[ShadowMode] Background run failed', {
          podcastId: input.podcastId,
          error: err?.message,
        });
      });
      return { ok: false, reason: 'shadow_mode' };
    }

    // Non-shadow: the cinematic renderer NEEDS the persisted timeline. A failure
    // here is why an episode silently comes out voice-only, so report it back to
    // the caller and log the stack — previously this was a bare `warn` with no
    // stack and no user-visible signal, which made the cause invisible.
    try {
      await this.execute(input);
      return { ok: true };
    } catch (err: any) {
      logger.error('[ShadowMode] Inline run FAILED — no timeline was stored, so the ' +
        'cinematic mix will be skipped and the episode will be voice-only', {
        podcastId: input.podcastId,
        error: err?.message,
        stack: err?.stack,
      });
      return { ok: false, reason: 'error', error: err?.message || String(err) };
    }
  }

  /**
   * The actual work. Separated so `run()` can choose await vs fire-and-forget
   * without duplicating logic.
   */
  private async execute(input: ShadowRunInput): Promise<void> {
    const started = Date.now();

    // ── 1. Producer (optional, separately flagged) ─────────────────────────
    let producerPlan: ProducerPlan | undefined;
    if (featureFlags.aiProducer) {
      try {
        producerPlan = await this.producer.produce({
          podcastId: input.podcastId,
          userId: input.userId,
          brief: input.brief,
          request: input.request,
        });
        await timelineRepository.saveProducerPlan(producerPlan);
      } catch (err: any) {
        // The Director works without a ProducerPlan — degrade, don't abort.
        logger.warn('[ShadowMode] Producer failed; directing without a plan', {
          podcastId: input.podcastId,
          error: err?.message,
        });
        producerPlan = undefined;
      }
    }

    // ── 2. Director ────────────────────────────────────────────────────────
    const manifest = await this.loadManifest();
    const director = new AIDirector({ manifest });

    const timeline = await director.direct({
      podcastId: input.podcastId,
      userId: input.userId,
      plan: input.plan,
      script: input.script,
      brief: input.brief,
      producerPlan,
      preferences: {
        // Per-style intensity, so one topic scored six ways actually sounds
        // different: storytelling lands on 'dramatic' while a teacher/student
        // lesson stays 'subtle'. Falls back to the global env setting when the
        // style engine is off or the plan predates it.
        cinematicIntensity: this.cinematicIntensityFor(input.plan),
        targetLoudnessLufs: targetLufs(),
      },
    });

    // ── 3. Persist (new collections only) ──────────────────────────────────
    await timelineRepository.saveTimeline(timeline);

    // Remember the cast so recurring characters keep their voices across
    // episodes. Non-fatal: the timeline already embeds a full cast snapshot.
    characterRepository
      .saveMany(input.userId, timeline.cast.characters)
      .catch((err) =>
        logger.warn('[ShadowMode] Character memory write failed', {
          podcastId: input.podcastId,
          error: err?.message,
        })
      );

    const validation = validateInvariants(timeline);
    logger.info('[ShadowMode] Planning artifacts stored', {
      podcastId: input.podcastId,
      producerPlan: !!producerPlan,
      scenes: timeline.scenes.length,
      voiceEvents: timeline.tracks.voice.events.length,
      musicEvents: timeline.tracks.music.events.length,
      degradedAssets: timeline.degradedAssets.length,
      validation: formatValidationResult(validation),
      durationMs: Date.now() - started,
      // Point the reader straight at the inspector.
      inspect: `npm run inspect:timeline -- -u ${input.userId} -p ${input.podcastId}`,
    });
  }

  /**
   * Asset catalogue from Firestore config. Absent is normal until Phase E
   * uploads assets — an empty manifest simply means the Director plans no audio
   * layers, which is correct rather than broken.
   */
  private async loadManifest(): Promise<AssetManifest> {
    try {
      const { db } = await import('../../config/firebase');
      const doc = await db.collection('config').doc('audioAssetCatalogue').get();
      if (!doc.exists) return emptyAssetManifest;

      const { manifest, errors } = AssetManifest.from(doc.data());
      if (errors.length > 0) {
        logger.warn('[ShadowMode] Asset catalogue has errors', {
          errors: errors.slice(0, 3),
        });
      }
      return manifest;
    } catch {
      return emptyAssetManifest;
    }
  }
}

export const shadowModeRunner = new ShadowModeRunner();
