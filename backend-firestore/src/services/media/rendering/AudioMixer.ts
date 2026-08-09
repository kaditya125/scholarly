/**
 * AudioMixer — combines voice/music/ambience/SFX tracks into final podcast audio.
 *
 * Orchestrates the complete mixing pipeline:
 *   1. Accept prepared cues from all engines
 *   2. Build ffmpeg filter graph
 *   3. Execute single-pass render
 *   4. Apply mastering (loudness normalization, compression, EQ)
 *   5. Return final audio file
 *
 * Design principles:
 *   - SINGLE PASS. One ffmpeg command, no intermediate files.
 *   - GRACEFUL. Missing layers (music, ambience, sfx) render as silence.
 *   - DETERMINISTIC. Same inputs → same output, always.
 *   - OBSERVABLE. Progress callbacks, detailed timing metrics.
 *
 * Why this exists:
 *   The existing AudioComposer stitches voice segments only. This mixer adds
 *   cinematic layering while maintaining compatibility — when music/ambience/sfx
 *   are empty, it behaves identically to the old pipeline.
 */

import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import fs from 'fs';
import path from 'path';
import { logger } from '../../../utils/logger';
import { buildFilterGraph, validateFilterInputs } from './filterGraph';
import type { FilterGraphInputs } from './filterGraph';
import type { MusicCue } from '../../media/assets/MusicEngine';
import type { AmbienceCue } from './AmbienceEngine';
import type { SFXCue } from './SFXEngine';
import type { VoiceCue } from './VoiceEngine';
import type { MasteringSpec } from '../../../core/director/schema/audio.schema';

if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic as unknown as string);
}

// Timeout bounds for the ffmpeg mix step. ffmpeg-static has been observed to
// hang on complex filter graphs; without a timeout the whole podcast job sits
// at "MIXING_AUDIO" forever. These bounds keep short episodes snappy while
// still giving long-form ones enough headroom (≈4x real-time on top of the
// mixer's own 2x estimate).
const FFMPEG_MIX_MIN_MS = 60_000;              // never wait less than 60s
const FFMPEG_MIX_HARD_CAP_MS = 5 * 60_000;      // ...or more than 5 minutes
const FFMPEG_MIX_DURATION_MULTIPLIER = 4;       // 4x the episode length

export interface MixInputs {
  /** Stitched voice bus (single file). */
  voicePath: string;
  /** Pre-calculated voice duration (avoids re-probing). */
  voiceDurationMs: number;

  music: MusicCue[];
  ambience: AmbienceCue[];
  sfx: SFXCue[];

  mastering: MasteringSpec;
  /** Total timeline duration (longest track). */
  totalDurationMs: number;
}

export interface MixResult {
  outputPath: string;
  durationMs: number;
  mixTimeMs: number;
  stats: MixStats;
}

export interface MixStats {
  voiceCues: number;
  musicCues: number;
  ambienceLayers: number;
  sfxCues: number;
  totalInputs: number;
  filterComplexity: number; // Character count of filter graph (proxy for complexity)
}

export interface MixOptions {
  outputPath: string;
  onProgress?: (percent: number) => void;
  /** Dry run: build filter graph but don't execute ffmpeg. */
  dryRun?: boolean;
}

export class AudioMixer {
  /**
   * Mix all tracks into final podcast audio.
   *
   * Never throws on missing layers — they render as silence. Throws only on
   * fundamental errors (missing voice bus, invalid output path, ffmpeg failure).
   */
  async mix(inputs: MixInputs, options: MixOptions): Promise<MixResult> {
    const startTime = Date.now();

    // Validate inputs
    const filterInputs: FilterGraphInputs = {
      voicePath: inputs.voicePath,
      voiceDurationMs: inputs.voiceDurationMs,
      music: inputs.music,
      ambience: inputs.ambience,
      sfx: inputs.sfx,
      mastering: inputs.mastering,
      totalDurationMs: inputs.totalDurationMs,
    };

    const validationErrors = validateFilterInputs(filterInputs);
    if (validationErrors.length > 0) {
      throw new Error(`Invalid mix inputs: ${validationErrors.join('; ')}`);
    }

    const ambienceLayerCount = inputs.ambience.reduce(
      (sum, e) => sum + e.layers.length,
      0
    );
    const backgroundInputs =
      inputs.music.length + ambienceLayerCount + inputs.sfx.length;

    // ── Voice-only passthrough ────────────────────────────────────────────
    //
    // With nothing to mix, the multi-input filter graph degenerates to a single
    // input and ffmpeg rejects it outright ("Error initializing complex filters:
    // Invalid argument"). That turned an empty asset library — a recoverable,
    // expected condition — into a hard render failure. Encoding the voice bus
    // directly is both correct and faster.
    if (backgroundInputs === 0) {
      logger.info('[AudioMixer] No background layers; voice-only passthrough', {
        outputPath: options.outputPath,
      });

      if (!options.dryRun) {
        await this.renderVoiceOnly(inputs, options.outputPath, options.onProgress);
      }

      return {
        outputPath: options.outputPath,
        durationMs: inputs.voiceDurationMs || inputs.totalDurationMs,
        mixTimeMs: Date.now() - startTime,
        stats: {
          voiceCues: 1,
          musicCues: 0,
          ambienceLayers: 0,
          sfxCues: 0,
          totalInputs: 1,
          filterComplexity: 0,
        },
      };
    }

    // Build filter graph
    const graph = buildFilterGraph(filterInputs);

    logger.info('[AudioMixer] Filter graph built', {
      inputs: graph.inputCount,
      filterLength: graph.filterComplex.length,
      music: inputs.music.length,
      ambienceLayers: inputs.ambience.reduce((sum, e) => sum + e.layers.length, 0),
      sfx: inputs.sfx.length,
    });

    // Dry run: return stats without rendering
    if (options.dryRun) {
      return {
        outputPath: options.outputPath,
        durationMs: inputs.totalDurationMs,
        mixTimeMs: Date.now() - startTime,
        stats: {
          voiceCues: 1, // Voice is pre-stitched
          musicCues: inputs.music.length,
          ambienceLayers: inputs.ambience.reduce((sum, e) => sum + e.layers.length, 0),
          sfxCues: inputs.sfx.length,
          totalInputs: graph.inputCount,
          filterComplexity: graph.filterComplex.length,
        },
      };
    }

    // Execute ffmpeg
    await this.render(graph, options.outputPath, inputs.totalDurationMs, options.onProgress);

    const mixTimeMs = Date.now() - startTime;

    logger.info('[AudioMixer] Mix complete', {
      outputPath: options.outputPath,
      durationMs: inputs.totalDurationMs,
      mixTimeMs,
    });

    return {
      outputPath: options.outputPath,
      durationMs: inputs.totalDurationMs,
      mixTimeMs,
      stats: {
        voiceCues: 1,
        musicCues: inputs.music.length,
        ambienceLayers: inputs.ambience.reduce((sum, e) => sum + e.layers.length, 0),
        sfxCues: inputs.sfx.length,
        totalInputs: graph.inputCount,
        filterComplexity: graph.filterComplex.length,
      },
    };
  }

  /**
   * Encode the voice bus alone, still applying the mastering loudness target so
   * a voice-only episode is level-matched with a fully-layered one.
   */
  private renderVoiceOnly(
    inputs: MixInputs,
    outputPath: string,
    onProgress?: (percent: number) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const outputDir = path.dirname(outputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const targetLufs = inputs.mastering?.targetLufs ?? -16;
      const truePeak = inputs.mastering?.truePeakDb ?? -1;

      const command = ffmpeg()
        .input(inputs.voicePath)
        .audioFilters([`loudnorm=I=${targetLufs}:TP=${truePeak}:LRA=11`])
        .outputOptions(['-c:a', 'libmp3lame', '-b:a', '128k', '-ar', '48000', '-ac', '2'])
        .output(outputPath);

      const deadlineMs = Math.min(
        FFMPEG_MIX_HARD_CAP_MS,
        Math.max(FFMPEG_MIX_MIN_MS, inputs.voiceDurationMs * FFMPEG_MIX_DURATION_MULTIPLIER)
      );
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        logger.error('[AudioMixer] voice-only encode timed out; killing process', {
          deadlineMs,
          voiceDurationMs: inputs.voiceDurationMs,
        });
        try {
          command.kill('SIGKILL');
        } catch {
          /* ignore */
        }
        reject(new Error(`ffmpeg voice-only encode timed out after ${deadlineMs}ms`));
      }, deadlineMs);

      command.on('error', (err: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        logger.error('[AudioMixer] voice-only encode failed', { error: err.message });
        reject(err);
      });

      command.on('end', () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (onProgress) onProgress(100);
        resolve();
      });

      command.run();
    });
  }

  /**
   * Execute ffmpeg with the filter graph.
   *
   * A hard timeout is enforced (see FFMPEG_MIX_TIMEOUT_MS) — without it, a
   * malformed filter graph or an unresponsive input can leave ffmpeg spinning
   * forever, which surfaced in production as podcasts stuck at "Mixing the
   * audio" with no error and no progress. The timeout is generous (5 minutes)
   * so real long-form episodes still complete, but bounded so a hang is
   * observable and recoverable rather than silent.
   */
  private render(
    graph: { filterComplex: string; inputPaths: string[] },
    outputPath: string,
    durationMs: number,
    onProgress?: (percent: number) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      // Ensure output directory exists
      const outputDir = path.dirname(outputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const command = ffmpeg();

      // Add all inputs
      graph.inputPaths.forEach((p) => command.input(p));

      // Apply filter graph.
      //
      // complexFilter(spec, 'out') ALREADY emits `-map [out]`. Passing -map
      // again in outputOptions produced a second audio stream, which an MP3
      // container cannot hold — ffmpeg then failed with "Error opening output
      // file ... Invalid argument" even once the graph itself was valid.
      command.complexFilter(graph.filterComplex, 'out');

      // Output configuration
      command
        .outputOptions([
          '-c:a', 'libmp3lame',
          '-b:a', '128k',
          '-ar', '48000',
          '-ac', '2',
        ])
        .output(outputPath);

      // Progress tracking
      if (onProgress) {
        command.on('progress', (progress: any) => {
          if (progress.timemark) {
            // Parse timemark (format: HH:MM:SS.ms)
            const parts = progress.timemark.split(':');
            if (parts.length === 3) {
              const hours = parseInt(parts[0], 10);
              const minutes = parseInt(parts[1], 10);
              const seconds = parseFloat(parts[2]);
              const currentMs = (hours * 3600 + minutes * 60 + seconds) * 1000;
              const percent = Math.min(100, Math.round((currentMs / durationMs) * 100));
              onProgress(percent);
            }
          }
        });
      }

      // Hard timeout: kill ffmpeg if it hasn't finished within the deadline.
      // Scales with the episode duration so long-form podcasts don't get
      // starved, but caps at FFMPEG_MIX_HARD_CAP_MS so a runaway process is
      // still bounded.
      const deadlineMs = Math.min(
        FFMPEG_MIX_HARD_CAP_MS,
        Math.max(FFMPEG_MIX_MIN_MS, durationMs * FFMPEG_MIX_DURATION_MULTIPLIER)
      );
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        logger.error('[AudioMixer] ffmpeg mix timed out; killing process', {
          deadlineMs,
          durationMs,
        });
        try {
          command.kill('SIGKILL');
        } catch {
          /* ignore — process may have exited already */
        }
        reject(new Error(`ffmpeg mix timed out after ${deadlineMs}ms`));
      }, deadlineMs);

      // Error handling
      command.on('error', (err: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        logger.error('[AudioMixer] ffmpeg failed', {
          error: err.message,
        });
        reject(err);
      });

      // Success
      command.on('end', () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (onProgress) onProgress(100);
        resolve();
      });

      // Execute
      command.run();
    });
  }

  /**
   * Validate that all input files exist before mixing.
   * Returns missing paths.
   */
  validateInputFiles(inputs: MixInputs): string[] {
    const missing: string[] = [];

    if (!fs.existsSync(inputs.voicePath)) {
      missing.push(inputs.voicePath);
    }

    inputs.music.forEach((cue) => {
      if (!fs.existsSync(cue.localPath)) missing.push(cue.localPath);
    });

    inputs.ambience.forEach((cue) => {
      cue.layers.forEach((layer) => {
        if (!fs.existsSync(layer.localPath)) missing.push(layer.localPath);
      });
    });

    inputs.sfx.forEach((cue) => {
      if (!fs.existsSync(cue.localPath)) missing.push(cue.localPath);
    });

    return missing;
  }

  /**
   * Estimate mix time based on input complexity.
   * Used for progress estimation and timeout configuration.
   */
  estimateMixTimeMs(inputs: MixInputs): number {
    // Base time: 2x real-time for encoding
    let estimate = inputs.totalDurationMs * 2;

    // Add overhead for each input (I/O cost)
    const totalInputs =
      1 + // voice
      inputs.music.length +
      inputs.ambience.reduce((sum, e) => sum + e.layers.length, 0) +
      inputs.sfx.length;

    estimate += totalInputs * 500; // 500ms per input

    // Add overhead for filter complexity
    const filterOps =
      inputs.music.length * 5 + // volume, loop, trim, fades, delay
      inputs.ambience.reduce((sum, e) => sum + e.layers.length, 0) * 6 + // + jitter
      inputs.sfx.length * 4; // volume, trim, fades, delay

    estimate += filterOps * 50; // 50ms per filter operation

    return Math.round(estimate);
  }
}

export function createAudioMixer(): AudioMixer {
  return new AudioMixer();
}
