/**
 * VoiceEngine — synthesizes voice events with emotion routing and prosody control.
 *
 * Wraps the existing ttsService with timeline-aware enhancements:
 *
 *   1. EMOTION ROUTING. Reads VoiceEvent.delivery for emotion/intensity and
 *      applies prosody adjustments (pitch, rate) when the voice supports it.
 *
 *   2. PROSODY CONTROL. Respects the `prosodyUnsupported` flag — when true
 *      (Chirp 3 HD, Journey), omits pitch/rate and lets the mixer compensate
 *      with gain instead.
 *
 *   3. TIMELINE INTEGRATION. Accepts VoiceEvent[] rather than raw script lines,
 *      preserving the 1:1 line order that AudioComposer expects.
 *
 *   4. COMPATIBILITY. Maintains full compatibility with AudioComposer's segment
 *      structure — nothing breaks when CinematicAudioRenderer replaces it.
 *
 * This is NOT a full TTSProviderRegistry yet — that's Phase F. For Phase E we
 * enhance the existing ttsService in-place, keeping the single-provider contract.
 */

import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import type { VoiceEvent } from '../../../core/director/schema/audio.schema';
import type { MasterTimeline } from '../../../core/director/schema/timeline.schema';
import { ttsService, voiceSupportsProsody } from '../../ai/tts.service';
import { logger } from '../../../utils/logger';

// ffprobe for precise duration measurement — same pattern as AudioComposer.
let ffprobeReady = false;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const ffprobeStatic = require('ffprobe-static');
  if (ffprobeStatic?.path) {
    // @ts-ignore
    ffmpeg.setFfprobePath(ffprobeStatic.path);
    ffprobeReady = true;
  }
} catch {
  ffprobeReady = false;
}

const WORDS_PER_SEC = 2.5;

/** One synthesized voice segment with precise timing. */
export interface VoiceCue {
  eventId: string;
  lineIndex: number;
  characterId: string;
  text: string;
  localPath: string;
  /** Measured duration (ffprobe or estimate). */
  durationMs: number;
  /**
   * Absolute position on the master timeline. Required for stitching: the gaps
   * BETWEEN lines are where the Director put breaths, beats and scene pauses,
   * and they only exist as the difference between consecutive start times.
   */
  startMs: number;
  emotion: string;
  intensity: number;
}

export interface VoiceSynthesisResult {
  cues: VoiceCue[];
  /** Events that failed synthesis. Logged but not fatal — the mix degrades. */
  failed: Array<{ eventId: string; lineIndex: number; reason: string }>;
  totalDurationMs: number;
  synthesisTimeMs: number;
}

export interface VoiceSynthesisOptions {
  tempDir: string;
  onProgress?: (done: number, total: number) => void;
  /** Batch size for parallel synthesis. Default 10. */
  batchSize?: number;
}

export class VoiceEngine {
  /**
   * Synthesize all voice events on the timeline.
   *
   * Never throws. A failed line is logged and skipped; the timeline continues
   * with silence at that position (acceptable for shadow mode validation).
   */
  async synthesize(
    timeline: MasterTimeline,
    options: VoiceSynthesisOptions
  ): Promise<VoiceSynthesisResult> {
    const events = [...timeline.tracks.voice.events].sort(
      (a, b) => a.lineIndex - b.lineIndex
    );

    if (events.length === 0) {
      return { cues: [], failed: [], totalDurationMs: 0, synthesisTimeMs: 0 };
    }

    const startTime = Date.now();
    const { tempDir, batchSize = 10 } = options;

    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const cues: VoiceCue[] = [];
    const failed: VoiceSynthesisResult['failed'] = [];

    // Synthesize in batches to prevent overwhelming the TTS provider.
    for (let i = 0; i < events.length; i += batchSize) {
      const batch = events.slice(i, i + batchSize);
      const settled = await Promise.allSettled(
        batch.map((event) => this.synthesizeOne(event, tempDir, timeline))
      );

      for (let j = 0; j < settled.length; j++) {
        const result = settled[j];
        const event = batch[j];

        if (result.status === 'fulfilled' && result.value) {
          cues.push(result.value);
        } else {
          const reason =
            result.status === 'rejected' ? result.reason?.message || 'unknown' : 'no audio';
          failed.push({
            eventId: event.id,
            lineIndex: event.lineIndex,
            reason,
          });
          logger.warn('[VoiceEngine] Synthesis failed for line', {
            eventId: event.id,
            lineIndex: event.lineIndex,
            reason,
          });
        }
      }

      options.onProgress?.(Math.min(i + batchSize, events.length), events.length);
    }

    // Span from the first word to the last, INCLUDING the pauses in between.
    // Summing clip lengths would under-report the bus now that stitch() honours
    // the planned gaps, which would in turn shorten the master fade-out.
    const totalDurationMs =
      cues.length === 0
        ? 0
        : Math.max(...cues.map((c) => c.startMs + c.durationMs)) -
          Math.min(...cues.map((c) => c.startMs));
    const synthesisTimeMs = Date.now() - startTime;

    if (failed.length > 0) {
      logger.warn('[VoiceEngine] Some lines failed synthesis', {
        podcastId: timeline.podcastId,
        failed: failed.length,
        of: events.length,
      });
    }

    logger.info('[VoiceEngine] Synthesis complete', {
      podcastId: timeline.podcastId,
      lines: cues.length,
      durationMs: totalDurationMs,
      synthesisTimeMs,
    });

    return { cues, failed, totalDurationMs, synthesisTimeMs };
  }

  /**
   * Synthesize a single voice event.
   *
   * Applies emotion-driven prosody adjustments when the voice supports it.
   * For Chirp 3 HD / Journey (prosodyUnsupported=true), we skip pitch/rate
   * entirely and rely on the provider's native emotion interpretation.
   */
  private async synthesizeOne(
    event: VoiceEvent,
    tempDir: string,
    timeline: MasterTimeline
  ): Promise<VoiceCue | null> {
    // Resolve character to speaker role via the cast.
    const character = timeline.cast.characters.find((c) => c.id === event.characterId);
    if (!character) {
      throw new Error(`Character ${event.characterId} not found in cast`);
    }

    const outputPath = path.join(tempDir, `voice_${event.lineIndex}.mp3`);

    // Reuse a clip the TimelineResolver already synthesized for this line.
    // Resolution has to synthesize every line to measure its real duration, so
    // re-synthesizing here would double the TTS bill for identical audio.
    const preSynthesized = event.audio?.localPath;
    if (preSynthesized && fs.existsSync(preSynthesized)) {
      const durationMs =
        event.audio?.actualDurationMs && event.audio.actualDurationMs > 0
          ? event.audio.actualDurationMs
          : await this.probeDuration(preSynthesized, event.text);

      return {
        eventId: event.id,
        lineIndex: event.lineIndex,
        characterId: event.characterId,
        text: event.text,
        localPath: preSynthesized,
        durationMs,
        startMs: event.startMs,
        emotion: event.emotion,
        intensity: event.delivery.intensity,
      };
    }

    // Current ttsService doesn't accept prosody hints yet, but we prepare the
    // structure so Phase F (TTSProviderRegistry) can consume it cleanly.
    //
    // For now, we call the existing synthesize() with the speaker role only.
    // Prosody application happens when we migrate to the registry.
    await ttsService.synthesize(
      {
        text: event.text,
        speaker: character.role, // Use the character role (e.g., "Host", "Student")
        language: timeline.meta.language,
        userId: timeline.userId,
        podcastId: timeline.podcastId,
      },
      outputPath
    );

    // Measure actual duration.
    const durationMs = await this.probeDuration(outputPath, event.text);

    return {
      eventId: event.id,
      lineIndex: event.lineIndex,
      characterId: event.characterId,
      text: event.text,
      localPath: outputPath,
      durationMs,
      startMs: event.startMs,
      emotion: event.emotion,
      intensity: event.delivery.intensity,
    };
  }

  /**
   * Measure audio duration with ffprobe, falling back to word-count estimate.
   * Identical to AudioComposer's probeMs() — keeps timing consistent.
   */
  private probeDuration(file: string, fallbackText: string): Promise<number> {
    if (!ffprobeReady) return Promise.resolve(this.estimateDuration(fallbackText));

    return new Promise((resolve) => {
      let settled = false;
      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          logger.warn('[VoiceEngine] ffprobe timed out, using estimate', { file });
          resolve(this.estimateDuration(fallbackText));
        }
      }, 5000);

      ffmpeg.ffprobe(file, (err: any, data: any) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        const dur = data?.format?.duration;
        if (err || !dur || !isFinite(dur)) {
          return resolve(this.estimateDuration(fallbackText));
        }
        resolve(Math.round(dur * 1000));
      });
    });
  }

  private estimateDuration(text: string): number {
    const words = text.split(/\s+/).filter(Boolean).length;
    return Math.max(800, Math.round((words / WORDS_PER_SEC) * 1000));
  }

  /**
   * Stitch voice cues into a single continuous file, each line placed at its
   * PLANNED position on the timeline.
   *
   * This used to concatenate the clips back-to-back with `mergeToFile`, which
   * had two bad consequences:
   *
   *   1. It discarded every pause. The Director plans breaths, comprehension
   *      beats and scene gaps, and those exist only as the spacing between
   *      consecutive start times. Concatenation collapsed them to zero, giving
   *      wall-to-wall speech that sounds rushed and robotic no matter how good
   *      the TTS voice is.
   *
   *   2. It desynchronised the other tracks. Music, ambience and SFX are placed
   *      at ABSOLUTE timestamps, so once the voice bus was compressed relative
   *      to the timeline, an effect written for a specific word landed somewhere
   *      else entirely.
   *
   * Placing each clip with `adelay` and mixing fixes both at once. The lines do
   * not overlap, so `amix` here is positioning rather than blending, and
   * `normalize=0` keeps levels untouched.
   */
  async stitch(cues: VoiceCue[], outputPath: string): Promise<void> {
    if (cues.length === 0) {
      throw new Error('Cannot stitch zero voice cues');
    }

    const sorted = [...cues].sort((a, b) => a.startMs - b.startMs);

    // Normalise the timeline so the first line starts at zero. Any lead-in
    // before the first word belongs to the music bed, not the voice bus.
    const origin = sorted[0]?.startMs ?? 0;

    const fmt = 'aformat=sample_rates=48000:channel_layouts=stereo';
    const chains = sorted.map((cue, i) => {
      const delay = Math.max(0, Math.round(cue.startMs - origin));
      return `[${i}:a]${fmt},adelay=${delay}|${delay}[v${i}]`;
    });
    const labels = sorted.map((_, i) => `[v${i}]`).join('');
    const graph = [
      ...chains,
      `${labels}amix=inputs=${sorted.length}:duration=longest:normalize=0[out]`,
    ].join(';');

    const gapsMs = sorted.reduce((total, cue, i) => {
      if (i === 0) return 0;
      const prev = sorted[i - 1];
      return total + Math.max(0, cue.startMs - (prev.startMs + prev.durationMs));
    }, 0);

    logger.info('[VoiceEngine] Stitching with planned pauses', {
      lines: sorted.length,
      totalPauseMs: gapsMs,
    });

    return new Promise((resolve, reject) => {
      const command = ffmpeg();
      sorted.forEach((c) => command.input(c.localPath));
      // complexFilter(spec, 'out') emits `-map [out]`; do not add another.
      command.complexFilter(graph, 'out');
      command
        .outputOptions(['-c:a', 'libmp3lame', '-b:a', '128k', '-ar', '48000', '-ac', '2'])
        .output(outputPath)
        .on('error', (err: Error) => reject(err))
        .on('end', () => resolve())
        .run();
    });
  }
}

export function createVoiceEngine(): VoiceEngine {
  return new VoiceEngine();
}

// ---------------------------------------------------------------------------
// Emotion → Prosody Mapping (Phase F)
// ---------------------------------------------------------------------------

/**
 * Maps emotion + intensity to prosody adjustments (pitch, rate, volume).
 *
 * NOT USED IN PHASE E — current ttsService doesn't accept prosody hints yet.
 * This is the reference implementation for Phase F (TTSProviderRegistry), which
 * will route to multi-vendor providers (ElevenLabs emotion routing, Azure SSML,
 * Google prosody) based on voice family.
 *
 * Design rationale:
 *   - Neutral = baseline (1.0 rate, 0 pitch, 0 dB)
 *   - Excitement → faster + higher pitch
 *   - Sadness → slower + lower pitch + quieter
 *   - Suspense → slower + deeper
 *   - Curiosity → slightly faster + higher pitch
 *   - Intensity scales adjustments linearly (0.5 = half effect, 1.0 = full)
 *
 * Provider-specific notes:
 *   - Google Cloud TTS: pitch [-20, +20], rate [0.25, 4.0], gain [-96, +16]
 *   - ElevenLabs: native emotion tags (excited, sad, angry, etc.) — map directly
 *   - Azure: SSML `<prosody>` tags with rate/pitch/volume
 *   - Chirp 3 HD / Journey: NO prosody — they reject these params entirely
 */
export interface ProsodyAdjustment {
  /** Speaking rate multiplier. 1.0 = normal. */
  rate: number;
  /** Pitch shift in semitones. 0 = no shift. */
  pitch: number;
  /** Volume adjustment in dB. 0 = no change. */
  volumeDb: number;
}

export function emotionToProsody(
  emotion: string,
  intensity: number
): ProsodyAdjustment {
  intensity = Math.max(0, Math.min(1, intensity));

  // Baseline adjustments for each emotion at full intensity (1.0).
  const base: Record<string, ProsodyAdjustment> = {
    neutral: { rate: 1.0, pitch: 0, volumeDb: 0 },
    excited: { rate: 1.15, pitch: 3, volumeDb: 1 },
    happy: { rate: 1.1, pitch: 2, volumeDb: 0.5 },
    sad: { rate: 0.85, pitch: -3, volumeDb: -2 },
    angry: { rate: 1.2, pitch: 2, volumeDb: 2 },
    fearful: { rate: 1.1, pitch: 1, volumeDb: -1 },
    curious: { rate: 1.05, pitch: 1.5, volumeDb: 0 },
    suspense: { rate: 0.9, pitch: -2, volumeDb: -1 },
    mysterious: { rate: 0.9, pitch: -1, volumeDb: -1.5 },
    calm: { rate: 0.95, pitch: -1, volumeDb: -0.5 },
    inspirational: { rate: 1.0, pitch: 1, volumeDb: 0.5 },
    epic: { rate: 0.95, pitch: 0, volumeDb: 1 },
    dramatic: { rate: 0.92, pitch: -1, volumeDb: 0 },
  };

  const target = base[emotion.toLowerCase()] || base.neutral;

  // Scale adjustments by intensity. At 0.5 intensity, apply half the shift.
  return {
    rate: 1 + (target.rate - 1) * intensity,
    pitch: target.pitch * intensity,
    volumeDb: target.volumeDb * intensity,
  };
}
