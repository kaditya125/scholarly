/**
 * TimelineResolver — converts planned timelines to resolved timelines.
 *
 * The AI Director produces PLANNED timelines with word-count-based duration
 * estimates. The resolver synthesizes all voice segments via TTS to obtain
 * actual durations, then re-anchors every event timestamp to produce a
 * RESOLVED timeline ready for rendering.
 *
 * Why separate from the Director?
 *   1. Cost: TTS synthesis costs real money; planning is free. Separating them
 *      lets us iterate on direction logic without re-spending on voice.
 *   2. Caching: Once resolved, a timeline never needs re-resolution unless the
 *      script changes.
 *   3. Testing: A planned timeline is pure data and easily unit-tested.
 *   4. Failure isolation: TTS outages don't break planning; planning bugs don't
 *      waste TTS quota.
 *
 * Resolution is idempotent: re-running it on an already-resolved timeline is a
 * no-op (unless skipIfResolved=false).
 *
 * The resolver NEVER modifies the script, scenes, emotions, or music cues — it
 * only adjusts timestamps. The creative direction stays intact; we're just
 * measuring the actual runtime.
 *
 * COST NOTE: synthesized clips are written to `voiceDir` and recorded on each
 * event as `audio.localPath`. VoiceEngine reuses those files during the render
 * instead of re-synthesizing, so resolving a timeline does NOT double TTS spend.
 */

import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import { logger } from '../../utils/logger';
import { ttsService } from '../../services/ai/tts.service';
import type { MasterTimeline } from './schema/timeline.schema';
import type { VoiceEvent } from './schema/audio.schema';
import type { Character } from './schema/character.schema';

// ffprobe for precise duration measurement — same pattern as VoiceEngine.
let ffprobeReady = false;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const ffprobeStatic = require('ffprobe-static');
  if (ffprobeStatic?.path) {
    // @ts-ignore — fluent-ffmpeg types omit this setter
    ffmpeg.setFfprobePath(ffprobeStatic.path);
    ffprobeReady = true;
  }
} catch {
  ffprobeReady = false;
}

/** Matches VoiceEngine's fallback estimate so timings stay consistent. */
const WORDS_PER_SEC = 2.5;

/**
 * Google Cloud Wavenet list price, USD per character ($16 / 1M chars).
 * Kept local so the resolver reports cost without importing the billing layer.
 */
const COST_PER_CHAR = 0.000016;

export interface TimelineResolverOptions {
  /** Skip resolution if timeline is already resolved (default: true). */
  skipIfResolved?: boolean;
  /**
   * Directory for synthesized voice clips. Defaults to
   * `<cwd>/temp/<podcastId>_voice`. Files are left in place so the renderer
   * can reuse them rather than paying for TTS twice.
   */
  voiceDir?: string;
}

export interface ResolvedVoiceEvent extends VoiceEvent {
  /** Actual TTS duration in milliseconds. */
  actualDurationMs: number;
  /** Local path to the synthesized clip, when synthesis succeeded. */
  synthesizedPath?: string;
}

export interface ResolutionResult {
  success: boolean;
  timelineId: string;
  /** Was already resolved and skipIfResolved=true. */
  skipped: boolean;
  /** Number of voice events synthesized. */
  voiceEventsSynthesized: number;
  /** Voice events that fell back to their estimated duration. */
  voiceEventsFailed: number;
  /** Total actual duration after resolution. */
  totalDurationMs: number;
  /** Original estimated duration. */
  estimatedDurationMs: number;
  /** Duration delta (actual - estimated). */
  durationDeltaMs: number;
  /** Time taken to resolve. */
  elapsedMs: number;
  /** TTS cost incurred. */
  costUsd: number;
  /** Error message if failed. */
  error?: string;
}

/** Zero-value result, so every failure path returns a well-formed object. */
export function emptyResolutionResult(
  overrides: Partial<ResolutionResult> = {}
): ResolutionResult {
  return {
    success: false,
    timelineId: '',
    skipped: false,
    voiceEventsSynthesized: 0,
    voiceEventsFailed: 0,
    totalDurationMs: 0,
    estimatedDurationMs: 0,
    durationDeltaMs: 0,
    elapsedMs: 0,
    costUsd: 0,
    ...overrides,
  };
}

/**
 * TimelineResolver — converts planned → resolved timelines via TTS synthesis.
 */
export class TimelineResolver {
  private readonly options: Required<Pick<TimelineResolverOptions, 'skipIfResolved'>> &
    TimelineResolverOptions;

  constructor(options: TimelineResolverOptions = {}) {
    this.options = {
      skipIfResolved: options.skipIfResolved ?? true,
      voiceDir: options.voiceDir,
    };
  }

  /**
   * Resolve a planned timeline by synthesizing all voice events and
   * re-anchoring timestamps. Mutates `timeline` in place (the caller persists
   * it) and also returns a summary.
   *
   * @param characters Optional cast override. Defaults to the cast embedded in
   *   the timeline, which is the authoritative snapshot for reproducible
   *   re-renders.
   */
  async resolve(
    timeline: MasterTimeline,
    characters?: Character[]
  ): Promise<ResolutionResult> {
    const startMs = Date.now();
    const cast = characters ?? timeline.cast?.characters ?? [];

    const result = emptyResolutionResult({
      timelineId: timeline.id,
      totalDurationMs: timeline.totalDurationMs,
      estimatedDurationMs: timeline.totalDurationMs,
    });

    // ── Already resolved? ────────────────────────────────────────────────
    if (timeline.phase === 'resolved' && this.options.skipIfResolved) {
      result.skipped = true;
      result.success = true;
      result.elapsedMs = Date.now() - startMs;
      logger.info('[TimelineResolver] Timeline already resolved; skipping', {
        timelineId: timeline.id,
      });
      return result;
    }

    try {
      const voiceEvents = timeline.tracks?.voice?.events ?? [];
      if (voiceEvents.length === 0) {
        throw new Error('Timeline has no voice events to resolve');
      }

      const voiceDir =
        this.options.voiceDir ??
        path.join(process.cwd(), 'temp', `${timeline.podcastId}_voice`);
      if (!fs.existsSync(voiceDir)) {
        fs.mkdirSync(voiceDir, { recursive: true });
      }

      // ── Synthesize every line to get real durations ───────────────────
      const resolvedVoices = await this.synthesizeVoiceEvents(
        voiceEvents,
        cast,
        timeline,
        voiceDir
      );

      result.voiceEventsSynthesized = resolvedVoices.filter(
        (v) => !!v.synthesizedPath
      ).length;
      result.voiceEventsFailed = resolvedVoices.length - result.voiceEventsSynthesized;
      result.costUsd = this.calculateCost(resolvedVoices);

      // ── Re-anchor every track to the measured durations ───────────────
      this.recalculateTimestamps(timeline, resolvedVoices);

      timeline.phase = 'resolved';
      timeline.resolvedAt = Date.now();

      result.totalDurationMs = timeline.totalDurationMs;
      result.durationDeltaMs = timeline.totalDurationMs - result.estimatedDurationMs;
      result.success = true;

      logger.info('[TimelineResolver] Timeline resolved successfully', {
        timelineId: timeline.id,
        voiceEvents: result.voiceEventsSynthesized,
        failed: result.voiceEventsFailed,
        estimatedMs: result.estimatedDurationMs,
        actualMs: result.totalDurationMs,
        deltaMs: result.durationDeltaMs,
        costUsd: Number(result.costUsd.toFixed(4)),
      });
    } catch (error: any) {
      result.error = error?.message || String(error);
      result.success = false;
      logger.error('[TimelineResolver] Resolution failed', {
        timelineId: timeline.id,
        error: result.error,
      });
    }

    result.elapsedMs = Date.now() - startMs;
    return result;
  }

  /**
   * Synthesize all voice events via TTS and measure actual durations.
   *
   * Never throws: a line that fails synthesis keeps its estimated duration so
   * resolution degrades rather than aborting the episode.
   */
  private async synthesizeVoiceEvents(
    voiceEvents: VoiceEvent[],
    cast: Character[],
    timeline: MasterTimeline,
    voiceDir: string
  ): Promise<ResolvedVoiceEvent[]> {
    const resolved: ResolvedVoiceEvent[] = [];

    for (const event of voiceEvents) {
      const character = cast.find((c) => c.id === event.characterId);
      if (!character) {
        logger.warn('[TimelineResolver] Character not found for voice event', {
          eventId: event.id,
          characterId: event.characterId,
        });
        resolved.push({ ...event, actualDurationMs: event.durationMs });
        continue;
      }

      // Deterministic filename keyed by line index — this is what lets the
      // renderer's VoiceEngine reuse the clip instead of re-synthesizing.
      const outputPath = path.join(voiceDir, `voice_${event.lineIndex}.mp3`);

      try {
        // ttsService.synthesize(request, outputPath) writes the file and
        // returns its path. `speaker` (the character role) is what selects the
        // voice — matching how VoiceEngine calls it, so the duration we measure
        // here is the duration the renderer will produce.
        await ttsService.synthesize(
          {
            text: event.text,
            speaker: character.role,
            language: timeline.meta?.language || character.language || 'en',
            userId: timeline.userId,
            podcastId: timeline.podcastId,
          },
          outputPath
        );

        const actualDurationMs = await this.probeDuration(outputPath, event.text);

        resolved.push({
          ...event,
          actualDurationMs,
          synthesizedPath: outputPath,
        });

        logger.debug('[TimelineResolver] Voice event synthesized', {
          eventId: event.id,
          estimatedMs: event.durationMs,
          actualMs: actualDurationMs,
          deltaMs: actualDurationMs - event.durationMs,
        });
      } catch (error: any) {
        logger.warn('[TimelineResolver] TTS synthesis failed; using estimate', {
          eventId: event.id,
          lineIndex: event.lineIndex,
          error: error?.message,
        });
        resolved.push({ ...event, actualDurationMs: event.durationMs });
      }
    }

    return resolved;
  }

  /**
   * Measure audio duration with ffprobe, falling back to a word-count estimate.
   * Mirrors VoiceEngine.probeDuration so both paths agree on timing.
   */
  private probeDuration(file: string, fallbackText: string): Promise<number> {
    if (!ffprobeReady) return Promise.resolve(this.estimateDuration(fallbackText));

    return new Promise((resolve) => {
      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        logger.warn('[TimelineResolver] ffprobe timed out, using estimate', { file });
        resolve(this.estimateDuration(fallbackText));
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
   * Re-anchor every track to the measured voice durations. Mutates `timeline`.
   *
   * Approach: rebuild the voice track sequentially, PRESERVING the original
   * inter-line gaps (which is where the Director put breaths, beats and scene
   * pauses). Each scene then gets a delta = newStart - oldStart, and every
   * background event is shifted by its own scene's delta. Because music,
   * ambience and SFX carry absolute timestamps, shifting them per-scene is what
   * keeps a stinger landing on the line it was written for.
   */
  private recalculateTimestamps(
    timeline: MasterTimeline,
    resolvedVoices: ResolvedVoiceEvent[]
  ): void {
    const durationById = new Map<string, number>();
    const pathById = new Map<string, string>();
    for (const v of resolvedVoices) {
      durationById.set(v.id, v.actualDurationMs);
      if (v.synthesizedPath) pathById.set(v.id, v.synthesizedPath);
    }

    const ordered = [...timeline.tracks.voice.events].sort(
      (a, b) => a.lineIndex - b.lineIndex
    );

    // Original gap following each event — preserved verbatim.
    const gapAfter = new Map<string, number>();
    for (let i = 0; i < ordered.length - 1; i++) {
      const cur = ordered[i];
      const next = ordered[i + 1];
      gapAfter.set(
        cur.id,
        Math.max(0, next.startMs - (cur.startMs + cur.durationMs))
      );
    }

    // Rebuild the voice track. Start from the original lead-in so an intro
    // music bed before the first line is not clipped.
    let cursor = ordered.length > 0 ? ordered[0].startMs : 0;
    const newVoiceStart = new Map<string, number>();

    const rebuilt: VoiceEvent[] = ordered.map((event) => {
      const durationMs = durationById.get(event.id) ?? event.durationMs;
      const startMs = cursor;
      newVoiceStart.set(event.id, startMs);
      cursor = startMs + durationMs + (gapAfter.get(event.id) ?? 0);

      const localPath = pathById.get(event.id);
      return {
        ...event,
        startMs,
        durationMs,
        // Record the clip so VoiceEngine can reuse it instead of re-paying TTS.
        // storagePath is required by the schema; nothing is uploaded at this
        // stage, so it mirrors the local path.
        ...(localPath
          ? {
              audio: {
                storagePath: localPath,
                localPath,
                actualDurationMs: durationMs,
              },
            }
          : {}),
      };
    });

    timeline.tracks.voice.events = rebuilt;

    // ── Per-scene deltas ────────────────────────────────────────────────
    const deltaByScene = new Map<string, number>();
    let lastDelta = 0;
    for (const scene of timeline.scenes) {
      const firstInScene = ordered.find((e) => e.sceneId === scene.id);
      if (firstInScene) {
        const newStart = newVoiceStart.get(firstInScene.id) ?? firstInScene.startMs;
        lastDelta = newStart - scene.startMs;
      }
      // Scenes with no dialogue inherit the previous scene's shift.
      deltaByScene.set(scene.id, lastDelta);
    }

    // ── Scenes ──────────────────────────────────────────────────────────
    timeline.scenes = timeline.scenes.map((scene) => {
      const inScene = rebuilt.filter((v) => v.sceneId === scene.id);
      if (inScene.length === 0) {
        const delta = deltaByScene.get(scene.id) ?? 0;
        return { ...scene, startMs: Math.max(0, scene.startMs + delta) };
      }
      const first = inScene[0];
      const last = inScene[inScene.length - 1];
      const startMs = first.startMs;
      const endMs = last.startMs + last.durationMs;
      return { ...scene, startMs, durationMs: Math.max(0, endMs - startMs) };
    });

    // ── Background tracks ───────────────────────────────────────────────
    const shift = <T extends { startMs: number; sceneId: string }>(events: T[]): T[] =>
      events.map((e) => ({
        ...e,
        startMs: Math.max(0, e.startMs + (deltaByScene.get(e.sceneId) ?? 0)),
      }));

    const tracks = timeline.tracks;
    tracks.music.events = shift(tracks.music.events);
    tracks.ambience.events = shift(tracks.ambience.events);
    tracks.sfx.events = shift(tracks.sfx.events);
    tracks.pause.events = shift(tracks.pause.events);
    if (tracks.visual?.events) {
      tracks.visual.events = shift(tracks.visual.events as any) as any;
    }

    // ── Total duration = last thing that makes a sound ──────────────────
    const allEnds: number[] = [
      ...rebuilt.map((e) => e.startMs + e.durationMs),
      ...tracks.music.events.map((e) => e.startMs + e.durationMs),
      ...tracks.ambience.events.map((e) => e.startMs + e.durationMs),
      ...tracks.sfx.events.map((e) => e.startMs + e.durationMs),
    ];
    timeline.totalDurationMs = allEnds.length > 0 ? Math.max(...allEnds) : 0;
  }

  /** Total TTS cost for the lines we actually synthesized. */
  private calculateCost(resolvedVoices: ResolvedVoiceEvent[]): number {
    let totalChars = 0;
    for (const voice of resolvedVoices) {
      if (voice.synthesizedPath) totalChars += voice.text.length;
    }
    return totalChars * COST_PER_CHAR;
  }
}

export const timelineResolver = new TimelineResolver();
