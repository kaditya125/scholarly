/**
 * MasterTimeline — the single artifact the AI Director produces, and the source
 * of truth every renderer consumes.
 *
 * Track-based with absolute timestamps, deliberately NOT audio-specific. That
 * is the structural property which makes video / avatar / subtitle / shorts
 * renderers pure additions later (AI_DIRECTOR_ARCHITECTURE.md §15).
 */

import { z } from 'zod';
import {
  AssetRefSchema,
  CinematicIntensitySchema,
  MediaGenreSchema,
  NarrativeStyleSchema,
} from './common.schema';
import { CharacterCastSchema } from './character.schema';
import { SceneSchema } from './scene.schema';
import { VisualTrackSchema } from './visual.schema';
import {
  AmbienceTrackSchema,
  EmotionCurveSchema,
  MasteringSpecSchema,
  MusicTrackSchema,
  PauseTrackSchema,
  SFXTrackSchema,
  VoiceTrackSchema,
} from './audio.schema';

// ---------------------------------------------------------------------------
// Versioning
// ---------------------------------------------------------------------------

/**
 * Schema version. v1 is reserved for the legacy implicit model (no timeline at
 * all — the current AudioComposer path), so the first explicit timeline is v2.
 * Bump on any breaking shape change and add a migration in timeline.repository.
 */
export const TIMELINE_SCHEMA_VERSION = 2 as const;

/**
 * Two-pass timing model:
 *   `planned`  — offsets are word-count estimates; tells renderers what to fetch
 *   `resolved` — offsets re-anchored to real TTS durations; render-accurate
 * Only a `resolved` timeline may drive a mix.
 */
export const TimelinePhaseSchema = z.enum(['planned', 'resolved']);
export type TimelinePhase = z.infer<typeof TimelinePhaseSchema>;

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

export const TimelineMetaSchema = z.object({
  title: z.string().min(1),
  language: z.string().min(1),
  genre: MediaGenreSchema.default('educational'),
  narrativeStyle: NarrativeStyleSchema.default('linear'),
  cinematicIntensity: CinematicIntensitySchema.default('balanced'),
  estimatedMinutes: z.number().nonnegative(),
});
export type TimelineMeta = z.infer<typeof TimelineMetaSchema>;

// ---------------------------------------------------------------------------
// Tracks
// ---------------------------------------------------------------------------

export const TimelineTracksSchema = z.object({
  voice: VoiceTrackSchema,
  music: MusicTrackSchema,
  ambience: AmbienceTrackSchema,
  sfx: SFXTrackSchema,
  pause: PauseTrackSchema,
  /** Populated now, consumed by no renderer in v1. */
  visual: VisualTrackSchema,
});
export type TimelineTracks = z.infer<typeof TimelineTracksSchema>;

// ---------------------------------------------------------------------------
// MasterTimeline
// ---------------------------------------------------------------------------

export const MasterTimelineSchema = z.object({
  // Identity
  id: z.string().min(1),
  podcastId: z.string().min(1),
  userId: z.string().min(1),
  /** Links back to the ProducerPlan this timeline was directed from. */
  producerPlanId: z.string().optional(),

  schemaVersion: z.literal(TIMELINE_SCHEMA_VERSION),
  phase: TimelinePhaseSchema,
  createdAt: z.number().int().nonnegative(),
  resolvedAt: z.number().int().nonnegative().optional(),

  // Global creative context
  meta: TimelineMetaSchema,
  /** Embedded cast snapshot — guarantees reproducible re-renders. */
  cast: CharacterCastSchema,
  emotionCurve: EmotionCurveSchema,
  scenes: z.array(SceneSchema).min(1),

  // Render surface
  tracks: TimelineTracksSchema,

  // Output contract
  mastering: MasteringSpecSchema,
  totalDurationMs: z.number().int().nonnegative(),

  /**
   * Asset refs the AssetLibrary could not resolve. The render DEGRADES (skips
   * those layers) and never fails — a podcast without ambience is acceptable,
   * a failed podcast is not.
   */
  degradedAssets: z.array(AssetRefSchema).default([]),

  /** Non-fatal diagnostics from the Director, surfaced in the inspector. */
  warnings: z.array(z.string()).default([]),
});
export type MasterTimeline = z.infer<typeof MasterTimelineSchema>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Every event across every track, flattened and sorted by start time. */
export function allEvents(timeline: MasterTimeline): Array<{
  kind: string;
  id: string;
  startMs: number;
  durationMs: number;
  sceneId: string;
  priority: number;
}> {
  const t = timeline.tracks;
  return [
    ...t.voice.events,
    ...t.music.events,
    ...t.ambience.events,
    ...t.sfx.events,
    ...t.pause.events,
    ...t.visual.events.map((e) => ({ ...e, priority: e.priority ?? 50 })),
  ]
    .map((e) => ({
      kind: e.kind,
      id: e.id,
      startMs: e.startMs,
      durationMs: e.durationMs,
      sceneId: e.sceneId,
      priority: (e as { priority?: number }).priority ?? 50,
    }))
    .sort((a, b) => a.startMs - b.startMs || a.kind.localeCompare(b.kind));
}

/** Total event count — cheap health metric for the inspector. */
export function eventCount(timeline: MasterTimeline): number {
  const t = timeline.tracks;
  return (
    t.voice.events.length +
    t.music.events.length +
    t.ambience.events.length +
    t.sfx.events.length +
    t.pause.events.length +
    t.visual.events.length
  );
}

/** Locate the scene covering a given script line, or null. */
export function sceneForLine(
  timeline: MasterTimeline,
  lineIndex: number
): MasterTimeline['scenes'][number] | null {
  return (
    timeline.scenes.find(
      (s) => lineIndex >= s.lineRange.startLine && lineIndex <= s.lineRange.endLine
    ) ?? null
  );
}
