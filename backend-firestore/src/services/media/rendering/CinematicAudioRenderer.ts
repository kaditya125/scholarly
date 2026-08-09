/**
 * CinematicAudioRenderer — orchestrates the complete cinematic podcast rendering pipeline.
 *
 * Coordinates:
 *   - VoiceEngine (TTS synthesis + stitching)
 *   - MusicEngine (music cue resolution + looping)
 *   - AmbienceEngine (layered environment resolution)
 *   - SFXEngine (discrete effect resolution)
 *   - AudioMixer (multi-track mixing + mastering)
 *
 * Implements:
 *   - Asset pre-warming (parallel with TTS when possible)
 *   - Progress callbacks (synthesis → asset resolution → mixing)
 *   - Graceful degradation (missing assets → degraded render, not failure)
 *   - Detailed metrics (timing, cue counts, warnings)
 *   - Cleanup (temp files removed on success or failure)
 *
 * Guarantees:
 *   - DETERMINISTIC. Same timeline → same audio output, always.
 *   - RESILIENT. Missing music/ambience/sfx → graceful degradation.
 *   - OBSERVABLE. Progress callbacks + detailed stats.
 *   - COMPATIBLE. Produces same output structure as AudioComposer.
 *
 * Usage:
 *   const renderer = createCinematicAudioRenderer(assetLibrary);
 *   const result = await renderer.render(timeline, {
 *     tempDir: '/tmp/podcast-xyz',
 *     onProgress: (stage, pct) => console.log(stage, pct)
 *   });
 */

import fs from 'fs';
import path from 'path';
import { logger } from '../../../utils/logger';
import type { MasterTimeline } from '../../../core/director/schema/timeline.schema';
import type { IAssetLibrary } from '../../../core/director/interfaces';
import type { AssetRef } from '../../../core/director/schema/common.schema';
import { MusicEngine } from '../../media/assets/MusicEngine';
import { AmbienceEngine } from './AmbienceEngine';
import { SFXEngine } from './SFXEngine';
import { VoiceEngine } from './VoiceEngine';
import { AudioMixer } from './AudioMixer';

export interface RenderOptions {
  timeline: MasterTimeline;
  tempDir: string;
  /** Called at each pipeline stage with progress percentage. */
  onProgress?: (stage: RenderStage, percent: number) => void;
  /** Dry run: build cues but don't synthesize TTS or mix audio. */
  dryRun?: boolean;
}

export type RenderStage =
  | 'initializing'
  | 'warming_assets'
  | 'synthesizing_voice'
  | 'resolving_music'
  | 'resolving_ambience'
  | 'resolving_sfx'
  | 'mixing'
  | 'complete';

export interface RenderResult {
  /** Path to final mixed audio file. */
  audioPath: string;
  /** Actual duration (measured from voice synthesis). */
  durationMs: number;
  /** Detailed metrics. */
  stats: RenderStats;
  /** Non-fatal warnings (degraded cues, skipped assets). */
  warnings: string[];
  /** Assets that could not be resolved (timeline.degradedAssets is authoritative). */
  degradedAssets: AssetRef[];
}

export interface RenderStats {
  voiceCues: number;
  musicCues: number;
  ambienceLayers: number;
  sfxCues: number;
  /** Assets that failed resolution. */
  skippedMusic: number;
  skippedAmbience: number;
  skippedSFX: number;
  /** Pipeline timing breakdown. */
  synthesisTimeMs: number;
  assetResolutionTimeMs: number;
  mixTimeMs: number;
  totalTimeMs: number;
}

export class CinematicAudioRenderer {
  private readonly musicEngine: MusicEngine;
  private readonly ambienceEngine: AmbienceEngine;
  private readonly sfxEngine: SFXEngine;
  private readonly voiceEngine: VoiceEngine;
  private readonly audioMixer: AudioMixer;

  constructor(private readonly assetLibrary: IAssetLibrary) {
    // Cast to any to work around the concrete type requirement
    // MusicEngine expects AssetLibrary but we accept IAssetLibrary for flexibility
    this.musicEngine = new MusicEngine(assetLibrary as any);
    this.ambienceEngine = new AmbienceEngine(assetLibrary);
    this.sfxEngine = new SFXEngine(assetLibrary);
    this.voiceEngine = new VoiceEngine();
    this.audioMixer = new AudioMixer();
  }

  /**
   * Render a resolved timeline to final podcast audio.
   *
   * Never throws on missing assets — they degrade to silence. Throws only on
   * fundamental failures (TTS provider down, disk full, ffmpeg missing).
   */
  async render(options: RenderOptions): Promise<RenderResult> {
    const { timeline, tempDir, onProgress, dryRun = false } = options;
    const startTime = Date.now();
    const warnings: string[] = [];
    const degradedAssets: AssetRef[] = [];

    logger.info('[CinematicAudioRenderer] Starting render', {
      podcastId: timeline.podcastId,
      phase: timeline.phase,
      dryRun,
    });

    // Validate timeline phase
    if (timeline.phase !== 'resolved') {
      warnings.push(
        `Timeline phase is '${timeline.phase}', expected 'resolved'. Timings may be inaccurate.`
      );
    }

    onProgress?.('initializing', 0);

    // Ensure temp directory exists
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    try {
      // ── STAGE 1: Asset Pre-Warming ────────────────────────────────────────
      // Start asset downloads in parallel with voice synthesis to hide latency.
      onProgress?.('warming_assets', 5);
      const warmStart = Date.now();

      await Promise.all([
        this.musicEngine.prewarm(timeline),
        this.ambienceEngine.prewarm(timeline),
        this.sfxEngine.prewarm(timeline),
      ]);

      logger.info('[CinematicAudioRenderer] Assets pre-warmed', {
        timeMs: Date.now() - warmStart,
      });

      // ── STAGE 2: Voice Synthesis ──────────────────────────────────────────
      onProgress?.('synthesizing_voice', 10);
      const voiceResult = await this.voiceEngine.synthesize(timeline, {
        tempDir,
        onProgress: (done, total) => {
          const pct = 10 + Math.round((done / total) * 30); // 10-40%
          onProgress?.('synthesizing_voice', pct);
        },
      });

      if (voiceResult.failed.length > 0) {
        warnings.push(
          `Voice synthesis failed for ${voiceResult.failed.length} lines: ${voiceResult.failed
            .slice(0, 3)
            .map((f) => `line ${f.lineIndex}`)
            .join(', ')}`
        );
      }

      // Stitch voice cues into single bus file
      const voiceBusPath = path.join(tempDir, 'voice_bus.mp3');
      if (!dryRun && voiceResult.cues.length > 0) {
        await this.voiceEngine.stitch(voiceResult.cues, voiceBusPath);
      }

      // ── STAGE 3: Music Resolution ─────────────────────────────────────────
      onProgress?.('resolving_music', 45);
      const musicResult = await this.musicEngine.prepare(timeline);

      if (musicResult.skipped.length > 0) {
        warnings.push(
          `Music: ${musicResult.skipped.length} cues skipped (${musicResult.skipped
            .slice(0, 3)
            .map((s) => s.reason)
            .join(', ')})`
        );
        musicResult.skipped.forEach((s) => {
          if (s.assetId !== '(unresolved)') {
            degradedAssets.push({ kind: 'music', id: s.assetId });
          }
        });
      }

      // ── STAGE 4: Ambience Resolution ──────────────────────────────────────
      onProgress?.('resolving_ambience', 55);
      const ambienceResult = await this.ambienceEngine.prepare(timeline);

      if (ambienceResult.skipped.length > 0) {
        warnings.push(
          `Ambience: ${ambienceResult.skipped.length} layers skipped (${ambienceResult.skipped
            .slice(0, 3)
            .map((s) => s.reason)
            .join(', ')})`
        );
        ambienceResult.skipped.forEach((s) => {
          if (s.assetId !== '(unresolved)') {
            degradedAssets.push({ kind: 'ambience', id: s.assetId });
          }
        });
      }

      // ── STAGE 5: SFX Resolution ───────────────────────────────────────────
      onProgress?.('resolving_sfx', 65);
      const sfxResult = await this.sfxEngine.prepare(timeline);

      if (sfxResult.skipped.length > 0) {
        warnings.push(
          `SFX: ${sfxResult.skipped.length} cues skipped (${sfxResult.skipped
            .slice(0, 3)
            .map((s) => s.reason)
            .join(', ')})`
        );
        sfxResult.skipped.forEach((s) => {
          if (s.assetId !== '(unresolved)') {
            degradedAssets.push({ kind: 'sfx', id: s.assetId });
          }
        });
      }

      const assetResolutionTimeMs = Date.now() - warmStart;

      // ── STAGE 6: Mixing ───────────────────────────────────────────────────
      onProgress?.('mixing', 70);

      const outputPath = path.join(tempDir, 'final.mp3');
      const mixResult = await this.audioMixer.mix(
        {
          voicePath: voiceBusPath,
          voiceDurationMs: voiceResult.totalDurationMs,
          music: musicResult.cues,
          ambience: ambienceResult.cues,
          sfx: sfxResult.cues,
          mastering: timeline.mastering,
          totalDurationMs: timeline.totalDurationMs,
        },
        {
          outputPath,
          dryRun,
          onProgress: (pct) => {
            const adjusted = 70 + Math.round(pct * 0.25); // 70-95%
            onProgress?.('mixing', adjusted);
          },
        }
      );

      // ── Complete ──────────────────────────────────────────────────────────
      onProgress?.('complete', 100);

      const totalTimeMs = Date.now() - startTime;

      const stats: RenderStats = {
        voiceCues: voiceResult.cues.length,
        musicCues: musicResult.cues.length,
        ambienceLayers: ambienceResult.totalLayers,
        sfxCues: sfxResult.totalEffects,
        skippedMusic: musicResult.skipped.length,
        skippedAmbience: ambienceResult.skipped.length,
        skippedSFX: sfxResult.skipped.length,
        synthesisTimeMs: voiceResult.synthesisTimeMs,
        assetResolutionTimeMs,
        mixTimeMs: mixResult.mixTimeMs,
        totalTimeMs,
      };

      logger.info('[CinematicAudioRenderer] Render complete', {
        podcastId: timeline.podcastId,
        durationMs: mixResult.durationMs,
        stats,
        warnings: warnings.length,
        degraded: degradedAssets.length,
      });

      return {
        audioPath: outputPath,
        durationMs: mixResult.durationMs,
        stats,
        warnings,
        degradedAssets,
      };
    } catch (err: any) {
      logger.error('[CinematicAudioRenderer] Render failed', {
        podcastId: timeline.podcastId,
        error: err.message,
        stack: err.stack,
      });
      throw err;
    }
  }

  /**
   * Estimate render time based on timeline complexity.
   * Used for timeout configuration and progress estimation.
   */
  estimateRenderTimeMs(timeline: MasterTimeline): number {
    const voiceEvents = timeline.tracks.voice.events.length;
    const musicEvents = timeline.tracks.music.events.length;
    const ambienceLayers = timeline.tracks.ambience.events.reduce(
      (sum, e) => sum + e.layers.length,
      0
    );
    const sfxEvents = timeline.tracks.sfx.events.length;

    // TTS: ~500ms per line (provider-dependent, conservative estimate)
    let estimate = voiceEvents * 500;

    // Asset resolution: ~100ms per distinct asset (GCS download + disk I/O)
    const distinctAssets = musicEvents + ambienceLayers + sfxEvents;
    estimate += distinctAssets * 100;

    // Mixing: 2x real-time encoding + overhead
    estimate += timeline.totalDurationMs * 2;
    estimate += (musicEvents + ambienceLayers + sfxEvents) * 50; // Filter complexity

    return Math.round(estimate);
  }

  /**
   * Validate timeline is ready for rendering.
   * Returns error messages if timeline is invalid.
   */
  validateTimeline(timeline: MasterTimeline): string[] {
    const errors: string[] = [];

    if (timeline.tracks.voice.events.length === 0) {
      errors.push('Timeline has no voice events');
    }

    if (timeline.scenes.length === 0) {
      errors.push('Timeline has no scenes');
    }

    if (timeline.totalDurationMs <= 0) {
      errors.push('Timeline has non-positive duration');
    }

    // Check voice events are in order
    const voiceEvents = timeline.tracks.voice.events;
    for (let i = 1; i < voiceEvents.length; i++) {
      if (voiceEvents[i].lineIndex <= voiceEvents[i - 1].lineIndex) {
        errors.push(`Voice events out of order: line ${voiceEvents[i].lineIndex}`);
        break;
      }
    }

    // Check all characters exist in cast
    const castIds = new Set(timeline.cast.characters.map((c) => c.id));
    for (const event of voiceEvents) {
      if (!castIds.has(event.characterId)) {
        errors.push(`Voice event references unknown character: ${event.characterId}`);
        break;
      }
    }

    return errors;
  }

  /**
   * Clean up temporary files after render.
   * Safe to call even if render failed.
   */
  cleanup(tempDir: string): void {
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
        logger.info('[CinematicAudioRenderer] Temp files cleaned', { tempDir });
      }
    } catch (err: any) {
      logger.warn('[CinematicAudioRenderer] Cleanup failed', {
        tempDir,
        error: err.message,
      });
    }
  }
}

export function createCinematicAudioRenderer(
  assetLibrary: IAssetLibrary
): CinematicAudioRenderer {
  return new CinematicAudioRenderer(assetLibrary);
}
