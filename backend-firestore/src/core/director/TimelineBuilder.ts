/**
 * TimelineBuilder — assembles planner output into a MasterTimeline, and
 * re-anchors it to real durations once TTS has run.
 *
 * Makes NO creative decisions. Everything here is assembly and arithmetic; the
 * planners already decided what happens.
 *
 * TWO-PASS TIMING (AI_DIRECTOR_ARCHITECTURE §2.3):
 *   build()   → `planned`  offsets from word-count estimates
 *   resolve() → `resolved` offsets from measured TTS durations
 *
 * Only a resolved timeline may drive a mix, which the RESOLVED_WITHOUT_AUDIO
 * invariant enforces.
 */

import { v4 as uuidv4 } from 'uuid';
import type { ITimelineBuilder, MeasuredDurations } from './interfaces';
import {
  MasterTimelineSchema,
  TIMELINE_SCHEMA_VERSION,
  type MasterTimeline,
  type TimelineMeta,
} from './schema/timeline.schema';
import {
  DEFAULT_MASTERING,
  MasteringSpecSchema,
  type AmbienceEvent,
  type EmotionCurve,
  type MasteringSpec,
  type MusicEvent,
  type PauseEvent,
  type SFXEvent,
  type VoiceEvent,
} from './schema/audio.schema';
import type { VisualEvent } from './schema/visual.schema';
import type { CharacterCast } from './schema/character.schema';
import type { Scene } from './schema/scene.schema';
import type { AssetRef } from './schema/common.schema';
import { sealCrossfades } from './planners/MusicPlanner';

export interface TimelineParts {
  podcastId: string;
  userId: string;
  producerPlanId?: string;
  meta: TimelineMeta;
  cast: CharacterCast;
  scenes: Scene[];
  emotionCurve: EmotionCurve;
  voice: VoiceEvent[];
  music: MusicEvent[];
  ambience: AmbienceEvent[];
  sfx: SFXEvent[];
  pause: PauseEvent[];
  visual: VisualEvent[];
  mastering?: Partial<MasteringSpec>;
  degradedAssets?: AssetRef[];
  warnings?: string[];
}

export class TimelineBuilder implements ITimelineBuilder {
  /** Assemble a PLANNED timeline. */
  build(parts: TimelineParts): MasterTimeline {
    const mastering = MasteringSpecSchema.parse({
      ...DEFAULT_MASTERING,
      ...(parts.mastering ?? {}),
    });

    // Scene absolutes from pass-1 estimates.
    const scenes = anchorScenes(parts.scenes);
    const totalDurationMs =
      scenes.length > 0 ? scenes[scenes.length - 1].endMs : 0;

    return MasterTimelineSchema.parse({
      id: `tl_${uuidv4()}`,
      podcastId: parts.podcastId,
      userId: parts.userId,
      producerPlanId: parts.producerPlanId,
      schemaVersion: TIMELINE_SCHEMA_VERSION,
      phase: 'planned',
      createdAt: Date.now(),

      meta: parts.meta,
      cast: parts.cast,
      emotionCurve: parts.emotionCurve,
      scenes,

      tracks: {
        voice: { events: parts.voice },
        music: { events: sealCrossfades(parts.music) },
        ambience: { events: parts.ambience },
        sfx: { events: parts.sfx },
        pause: { events: parts.pause },
        visual: { events: parts.visual },
      },

      mastering,
      totalDurationMs,
      degradedAssets: parts.degradedAssets ?? [],
      warnings: parts.warnings ?? [],
    });
  }

  /**
   * Re-anchor the whole timeline to measured TTS durations.
   *
   * Voice events are the spine: their real durations, plus any pause that
   * follows them, define the new time base. Everything else is scaled or
   * re-derived from the new scene boundaries.
   *
   * Pure arithmetic — no network, no creative choices, safe to re-run.
   */
  resolve(
    timeline: MasterTimeline,
    durations: MeasuredDurations
  ): MasterTimeline {
    const voice = timeline.tracks.voice.events;
    if (voice.length === 0) return timeline;

    // Pauses indexed by the line they follow, so they occupy real time.
    const pauseAfterLine = new Map<number, PauseEvent>();
    for (const p of timeline.tracks.pause.events) {
      const lineIndex = parseTrailingIndex(p.id);
      if (lineIndex != null) pauseAfterLine.set(lineIndex, p);
    }

    // ── Walk the voice track, accumulating real time ───────────────────────
    const newVoice: VoiceEvent[] = [];
    const newPause: PauseEvent[] = [];
    const lineStart = new Map<number, number>();
    const lineEnd = new Map<number, number>();
    let cursor = 0;

    for (const event of voice) {
      const measured =
        durations[event.lineIndex] ??
        event.audio?.actualDurationMs ??
        event.durationMs;

      const startMs = cursor;
      const durationMs = Math.max(0, Math.round(measured));
      cursor = startMs + durationMs;

      lineStart.set(event.lineIndex, startMs);
      lineEnd.set(event.lineIndex, cursor);

      newVoice.push({ ...event, startMs, durationMs });

      // A pause consumes real time immediately after its line.
      const pause = pauseAfterLine.get(event.lineIndex);
      if (pause) {
        newPause.push({ ...pause, startMs: cursor });
        cursor += pause.durationMs;
      }
    }

    const totalDurationMs = cursor;

    // ── Re-anchor scenes from their line ranges ────────────────────────────
    const newScenes = timeline.scenes.map((scene) => {
      const startMs = lineStart.get(scene.lineRange.startLine) ?? 0;
      const endMs = lineEnd.get(scene.lineRange.endLine) ?? startMs;
      // Include a trailing pause so the scene owns its own gap.
      const trailingPause = newPause.find(
        (p) => parseTrailingIndex(p.id) === scene.lineRange.endLine
      );
      return {
        ...scene,
        startMs,
        endMs: endMs + (trailingPause?.durationMs ?? 0),
      };
    });

    const sceneById = new Map(newScenes.map((s) => [s.id, s]));

    // ── Music: stretch beds to their scenes' real spans ────────────────────
    const newMusic = timeline.tracks.music.events.map((event) => {
      if (event.role === 'intro') {
        return { ...event, startMs: 0 };
      }
      if (event.role === 'outro') {
        // Overlap the tail so the outro lifts under the final words.
        const start = Math.max(0, totalDurationMs - Math.round(event.durationMs * 0.6));
        return { ...event, startMs: start };
      }
      const scene = sceneById.get(event.sceneId);
      if (!scene) return event;
      return {
        ...event,
        startMs: scene.startMs,
        durationMs: Math.max(1000, scene.endMs - scene.startMs),
      };
    });

    // ── Ambience: follow the scene, with the same lead-in as pass 1 ─────────
    const newAmbience = timeline.tracks.ambience.events.map((event) => {
      const scene = sceneById.get(event.sceneId);
      if (!scene) return event;
      return {
        ...event,
        startMs: Math.max(0, scene.startMs - 500),
        durationMs: Math.max(1000, scene.endMs - scene.startMs + 1000),
      };
    });

    // ── SFX: recompute word offsets against REAL line durations ────────────
    const newSfx = timeline.tracks.sfx.events.map((event) => {
      if (event.triggerLineIndex == null) return event;
      const start = lineStart.get(event.triggerLineIndex);
      const end = lineEnd.get(event.triggerLineIndex);
      if (start == null || end == null) return event;

      const lineDuration = end - start;
      // Preserve the original proportional position within the line.
      const ratio = originalWordRatio(event, timeline);
      const wordOffset = Math.round(ratio * lineDuration);

      return {
        ...event,
        startMs: Math.max(0, start + wordOffset + event.offsetMs),
      };
    });

    // ── Visual: re-anchor to real scene spans ──────────────────────────────
    const newVisual = timeline.tracks.visual.events.map((event) => {
      const scene = sceneById.get(event.sceneId);
      if (!scene) return event;

      if (event.visualType === 'character_shot') {
        // Character shots are scaled proportionally inside their scene rather
        // than recomputed, since speaker runs are already correct in ratio.
        const oldScene = timeline.scenes.find((s) => s.id === event.sceneId);
        const oldSpan = oldScene ? Math.max(1, oldScene.endMs - oldScene.startMs) : 1;
        const newSpan = Math.max(1, scene.endMs - scene.startMs);
        const factor = newSpan / oldSpan;
        const offsetIntoScene = event.startMs - (oldScene?.startMs ?? 0);
        return {
          ...event,
          startMs: Math.round(scene.startMs + offsetIntoScene * factor),
          durationMs: Math.max(1000, Math.round(event.durationMs * factor)),
        };
      }

      return {
        ...event,
        startMs: scene.startMs,
        durationMs: Math.max(1000, scene.endMs - scene.startMs),
      };
    });

    return MasterTimelineSchema.parse({
      ...timeline,
      phase: 'resolved',
      resolvedAt: Date.now(),
      scenes: newScenes,
      tracks: {
        voice: { events: newVoice },
        music: { events: sealCrossfades(newMusic) },
        ambience: { events: newAmbience },
        sfx: { events: newSfx },
        pause: { events: newPause },
        visual: { events: newVisual },
      },
      totalDurationMs,
    });
  }
}

// ---------------------------------------------------------------------------
// Helpers (exported for testing)
// ---------------------------------------------------------------------------

/** Lay scenes end-to-end using their pass-1 estimates. */
export function anchorScenes(scenes: Scene[]): Scene[] {
  let cursor = 0;
  return scenes.map((scene) => {
    const startMs = cursor;
    const endMs = cursor + scene.estimatedDurationMs;
    cursor = endMs;
    return { ...scene, startMs, endMs };
  });
}

/** `pause_12` → 12. Returns null when the id carries no index. */
export function parseTrailingIndex(id: string): number | null {
  const m = /_(\d+)$/.exec(id || '');
  if (!m) return null;
  const n = Number.parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Recover the proportional position of an SFX cue inside its line, so pass 2
 * can rescale it against the real duration instead of discarding it.
 */
function originalWordRatio(event: SFXEvent, timeline: MasterTimeline): number {
  const lineIndex = event.triggerLineIndex;
  if (lineIndex == null) return 0;

  const line = timeline.tracks.voice.events.find((v) => v.lineIndex === lineIndex);
  if (!line || line.durationMs <= 0) return 0;

  const offsetIntoLine = event.startMs - line.startMs - event.offsetMs;
  return Math.max(0, Math.min(1, offsetIntoLine / line.durationMs));
}

export const timelineBuilder = new TimelineBuilder();
