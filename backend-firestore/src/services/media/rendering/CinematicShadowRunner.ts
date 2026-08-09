/**
 * CinematicShadowRunner — integrates CinematicAudioRenderer into the podcast pipeline.
 *
 * Parallel to ShadowModeRunner (AI Director planning), but for the rendering phase.
 *
 * SAFETY CONTRACT:
 *   1. Returns early unless CINEMATIC_AUDIO_ENABLED flag is set. Default is false.
 *   2. NEVER throws. Every failure path is caught and logged.
 *   3. In shadow mode (CINEMATIC_AUDIO_ENABLED=false), runs fire-and-forget in
 *      parallel with AudioComposer. Logs render stats but DOES NOT replace output.
 *   4. In active mode (CINEMATIC_AUDIO_ENABLED=true), runs synchronously and
 *      REPLACES AudioComposer output with cinematic mix.
 *   5. Writes ONLY to podcast_timelines (render stats). Never to `podcasts` or
 *      `podcast_jobs` in shadow mode.
 *
 * Shadow mode workflow:
 *   1. Load resolved timeline from Firestore (created by AI Director)
 *   2. Render cinematic audio to temp file
 *   3. Log render stats + warnings
 *   4. Delete temp file (NOT uploaded — existing podcast audio unchanged)
 *
 * Active mode workflow:
 *   1. Load resolved timeline from Firestore
 *   2. Render cinematic audio
 *   3. Return audio path for upload (REPLACES AudioComposer output)
 *
 * Called by podcastEngine.service.ts after TTS synthesis completes.
 */

import fs from 'fs';
import path from 'path';
import { logger } from '../../../utils/logger';
import { timelineRepository } from '../../../repositories/timeline.repository';
import { assetLibrary } from '../assets/AssetLibrary';
import { timelineAssetBinder } from '../assets/TimelineAssetBinder';
import { createCinematicAudioRenderer } from './CinematicAudioRenderer';
import { timelineResolverService } from '../../timeline/timelineResolver.service';
import type { ComposedAudio } from '../../../core/workflow/podcast/types';

export interface CinematicRenderInput {
  podcastId: string;
  userId: string;
  /** AudioComposer output (used for fallback + duration comparison). */
  composedAudio: ComposedAudio;
}

export interface CinematicRenderResult {
  /** True if cinematic render succeeded. */
  rendered: boolean;
  /** Path to cinematic audio (only in active mode). */
  audioPath?: string;
  /** Render duration in ms. */
  renderTimeMs?: number;
  /** Warnings from render (degraded assets, etc.). */
  warnings?: string[];
  /** True if output replaced AudioComposer. */
  isActive: boolean;
}

export class CinematicShadowRunner {
  private readonly enabled: boolean;
  private readonly shadowMode: boolean;

  constructor() {
    // Read from environment. Default to false (shadow mode off).
    const flagValue = process.env.CINEMATIC_AUDIO_ENABLED?.toLowerCase();
    this.enabled = flagValue === 'true' || flagValue === '1';
    this.shadowMode = !this.enabled; // When enabled=true, shadowMode=false (active)

    if (this.enabled) {
      logger.info('[CinematicShadow] Cinematic audio renderer ACTIVE (replaces AudioComposer)');
    } else if (process.env.CINEMATIC_AUDIO_ENABLED !== undefined) {
      logger.info('[CinematicShadow] Cinematic audio renderer in SHADOW MODE (logs only)');
    }
  }

  /**
   * Entry point called by podcastEngine after AudioComposer completes.
   *
   * In shadow mode: fire-and-forget, returns immediately.
   * In active mode: awaits and returns cinematic audio path.
   */
  async run(input: CinematicRenderInput): Promise<CinematicRenderResult> {
    // Feature not enabled at all — return immediately
    if (!this.enabled && process.env.CINEMATIC_AUDIO_ENABLED === undefined) {
      return { rendered: false, isActive: false };
    }

    if (this.shadowMode) {
      // Fire-and-forget: rendering must never delay or fail a podcast.
      void this.execute(input).catch((err) => {
        logger.warn('[CinematicShadow] Background render failed', {
          podcastId: input.podcastId,
          error: err?.message,
        });
      });
      return { rendered: false, isActive: false };
    }

    // Active mode: await and return result for upload.
    return await this.execute(input);
  }

  /**
   * The actual rendering work.
   */
  private async execute(
    input: CinematicRenderInput
  ): Promise<CinematicRenderResult> {
    const started = Date.now();
    const { podcastId, userId, composedAudio } = input;

    try {
      // ── 1. Load Timeline ───────────────────────────────────────────────────
      const timeline = await timelineRepository.getTimeline(podcastId);
      if (!timeline) {
        logger.warn('[CinematicShadow] No timeline found; skipping render', {
          podcastId,
        });
        return { rendered: false, isActive: false };
      }

      // ── 2. Resolve Timeline if needed ──────────────────────────────────────
      if (timeline.phase !== 'resolved') {
        logger.info('[CinematicShadow] Timeline needs resolution; resolving now', {
          podcastId,
          phase: timeline.phase,
        });

        const resolveResult = await timelineResolverService.resolve({
          userId,
          podcastId,
          force: false,
        });

        if (resolveResult.success) {
          logger.info('[CinematicShadow] Timeline resolved successfully', {
            podcastId,
            voiceEventsSynthesized: resolveResult.result.voiceEventsSynthesized,
            voiceEventsFailed: resolveResult.result.voiceEventsFailed,
            estimatedMs: resolveResult.result.estimatedDurationMs,
            actualMs: resolveResult.result.totalDurationMs,
            deltaMs: resolveResult.result.durationDeltaMs,
            costUsd: resolveResult.result.costUsd,
          });

          // Use the newly resolved timeline
          Object.assign(timeline, resolveResult.timeline);
        } else {
          // Resolution is an accuracy optimisation, NOT a render prerequisite:
          // the renderer synthesizes voice itself and only warns on a planned
          // phase. Aborting here would silently drop the whole cinematic mix
          // and hand the user a voice-only episode, which is a worse outcome
          // than background layers sitting on word-count estimates.
          logger.warn(
            '[CinematicShadow] Timeline resolution failed; rendering with planned timings',
            { podcastId, error: resolveResult.result.error }
          );
        }
      }

      // ── 3. Load Asset Library ──────────────────────────────────────────────
      await assetLibrary.loadManifest();

      // ── 3b. Bind semantic requirements to concrete assets ──────────────────
      // The Director emits requirements, the engines consume `assetId`. Nothing
      // populated that field, so every cue was skipped as "awaiting asset
      // resolver" and the mix came out voice-only. Binding is free — it matches
      // against already-generated assets and never generates.
      const bind = await timelineAssetBinder.bind(timeline);
      if (bind.missingCategories.length > 0) {
        logger.warn('[CinematicShadow] Some cues have no matching asset', {
          podcastId,
          missingCategories: bind.missingCategories,
        });
      }

      // ── 4. Render Cinematic Audio ──────────────────────────────────────────
      const renderer = createCinematicAudioRenderer(assetLibrary);
      const tempDir = path.join(process.cwd(), 'temp', `${podcastId}_cinematic`);

      logger.info('[CinematicShadow] Starting cinematic render', {
        podcastId,
        shadowMode: this.shadowMode,
        scenes: timeline.scenes.length,
        voiceEvents: timeline.tracks.voice.events.length,
        musicEvents: timeline.tracks.music.events.length,
        ambienceEvents: timeline.tracks.ambience.events.length,
        sfxEvents: timeline.tracks.sfx.events.length,
      });

      const result = await renderer.render({
        timeline,
        tempDir,
        onProgress: (stage, pct) => {
          if (pct % 20 === 0) {
            // Log every 20% to avoid spam
            logger.info('[CinematicShadow] Progress', {
              podcastId,
              stage,
              percent: pct,
            });
          }
        },
      });

      const renderTimeMs = Date.now() - started;

      // ── 5. Log Results ─────────────────────────────────────────────────────
      logger.info('[CinematicShadow] Render complete', {
        podcastId,
        shadowMode: this.shadowMode,
        renderTimeMs,
        audioPath: result.audioPath,
        durationMs: result.durationMs,
        composerDurationMs: composedAudio.durationMs,
        durationDiffMs: result.durationMs - composedAudio.durationMs,
        stats: result.stats,
        warnings: result.warnings.length,
        degradedAssets: result.degradedAssets.length,
      });

      if (result.warnings.length > 0) {
        logger.warn('[CinematicShadow] Render warnings', {
          podcastId,
          warnings: result.warnings,
        });
      }

      // ── 6. Shadow vs Active ────────────────────────────────────────────────
      if (this.shadowMode) {
        // Shadow mode: clean up temp file immediately (don't upload)
        renderer.cleanup(tempDir);
        return {
          rendered: true,
          renderTimeMs,
          warnings: result.warnings,
          isActive: false,
        };
      } else {
        // Active mode: return path for upload (temp file cleaned by caller)
        return {
          rendered: true,
          audioPath: result.audioPath,
          renderTimeMs,
          warnings: result.warnings,
          isActive: true,
        };
      }
    } catch (err: any) {
      logger.error('[CinematicShadow] Render failed', {
        podcastId,
        error: err?.message,
        stack: err.stack,
      });

      // In shadow mode, failure is logged but doesn't affect the podcast.
      // In active mode, we need to signal failure so AudioComposer output is used.
      if (this.shadowMode) {
        return { rendered: false, isActive: false };
      } else {
        // Active mode failure: log but return false so caller uses AudioComposer fallback
        logger.warn('[CinematicShadow] Active mode render failed; falling back to AudioComposer', {
          podcastId,
        });
        return { rendered: false, isActive: true };
      }
    }
  }

  /**
   * Check if cinematic rendering is enabled (shadow or active).
   */
  isEnabled(): boolean {
    return this.enabled || process.env.CINEMATIC_AUDIO_ENABLED !== undefined;
  }

  /**
   * Check if in shadow mode (logging only, not replacing output).
   */
  isShadowMode(): boolean {
    return this.shadowMode;
  }
}

export const cinematicShadowRunner = new CinematicShadowRunner();
