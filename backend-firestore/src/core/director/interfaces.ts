/**
 * Core contracts for the AI Director platform.
 *
 * Two rules encoded here, both structural rather than conventional:
 *
 *   1. PLANNERS DECIDE, RENDERERS RENDER. A planner has no access to ffmpeg,
 *      TTS or storage. A renderer makes no creative choices.
 *   2. PLANNERS NEVER THROW. Every planner exposes `fallback()` and must return
 *      a degraded-but-valid result instead of failing the episode.
 *
 * Everything is interface-only so Phase B/C implementations can be injected and
 * unit-tested without touching the live pipeline.
 */

import type { MasterTimeline } from './schema/timeline.schema';
import type { TrackKind, AssetKind, AssetRef } from './schema/common.schema';
import type { CinematicIntensity } from './schema/common.schema';

// ---------------------------------------------------------------------------
// Director
// ---------------------------------------------------------------------------

/**
 * Inputs the Director needs. Deliberately typed loosely against the existing
 * pipeline types (`PodcastPlan`, `GeneratedScript`, `GroundingBrief`) so this
 * file has ZERO imports from `core/workflow/podcast` — the Director must not
 * create a circular dependency on the pipeline it plugs into.
 */
export interface DirectorInput {
  podcastId: string;
  userId: string;
  /** The existing PodcastPlan. */
  plan: unknown;
  /** The existing GeneratedScript. */
  script: unknown;
  /** The existing GroundingBrief. */
  brief: unknown;
  /** Optional ProducerPlan from Phase B. */
  producerPlan?: unknown;
  preferences?: DirectorPreferences;
}

export interface DirectorPreferences {
  cinematicIntensity?: CinematicIntensity;
  enableMusic?: boolean;
  enableAmbience?: boolean;
  enableSFX?: boolean;
  enableVisualPlanning?: boolean;
  targetLoudnessLufs?: number;
  /** Reserved. Ignored by the v1 mixer. */
  spatialAudio?: boolean;
}

export interface IAIDirector {
  /** Produce a PLANNED timeline. Never throws; degrades via planner fallbacks. */
  direct(input: DirectorInput): Promise<MasterTimeline>;
}

// ---------------------------------------------------------------------------
// Planners
// ---------------------------------------------------------------------------

/**
 * Uniform planner contract. `plan()` may use an LLM; `fallback()` must be
 * deterministic, synchronous-safe and dependency-free so it always works.
 */
export interface IPlanner<TIn, TOut> {
  readonly name: string;
  plan(input: TIn): Promise<TOut>;
  fallback(input: TIn): TOut;
}

// ---------------------------------------------------------------------------
// Timeline resolution (two-pass model)
// ---------------------------------------------------------------------------

/** Real per-line durations measured after TTS, keyed by script line index. */
export type MeasuredDurations = Record<number, number>;

export interface ITimelineBuilder {
  /** Assemble planner outputs into a PLANNED timeline. */
  build(parts: unknown): MasterTimeline;
  /**
   * Re-anchor every event to real TTS durations, producing a RESOLVED timeline.
   * Pure arithmetic — no creative decisions, no network.
   */
  resolve(timeline: MasterTimeline, durations: MeasuredDurations): MasterTimeline;
}

// ---------------------------------------------------------------------------
// Renderers
// ---------------------------------------------------------------------------

export interface RenderContext {
  podcastId: string;
  userId: string;
  tempDir: string;
  onProgress?: (done: number, total: number) => void;
  /** Cooperative cancellation, mirroring the existing job cancel semantics. */
  signal?: AbortSignal;
}

/**
 * Every renderer is a consumer of the same timeline. Adding a renderer must
 * never require a Director change — that is the extensibility guarantee.
 */
export interface ITimelineRenderer<TOutput> {
  readonly name: string;
  /** Tracks this renderer needs. Used to skip work when a track is empty. */
  readonly requiredTracks: TrackKind[];
  canRender(timeline: MasterTimeline): boolean;
  render(timeline: MasterTimeline, ctx: RenderContext): Promise<TOutput>;
}

// ---------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------

export interface ResolvedAsset {
  id: string;
  kind: AssetKind;
  localPath: string;
  durationMs: number;
  loopable: boolean;
  loopStartMs?: number;
  loopEndMs?: number;
  licence: string;
}

export interface IAssetLibrary {
  /** Fetch + cache an asset. Returns null when unavailable (never throws). */
  resolve(kind: AssetKind, id: string): Promise<ResolvedAsset | null>;
  /** Synchronous manifest membership check — no I/O. */
  has(kind: AssetKind, id: string): boolean;
  /** Returns only the refs that are NOT in the manifest. */
  validateRefs(refs: AssetRef[]): AssetRef[];
}
