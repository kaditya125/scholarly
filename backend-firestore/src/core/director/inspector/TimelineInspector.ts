/**
 * TimelineInspector — the primary debugging interface for the Director.
 *
 * PURE and SYNCHRONOUS. Takes a MasterTimeline (plus optionally its
 * ProducerPlan) and produces a structured report. No I/O, no network, no
 * rendering — which means every view below is unit-testable and the same report
 * can drive a CLI, an admin API, or a React page without duplication.
 *
 * The report exists to answer one question before any audio is rendered:
 * "is this direction any good?" Quality metrics are therefore designed to be
 * ACTIONABLE — each one names a specific defect rather than emitting a vague
 * score. See `QualityMetric.hint`.
 */

import {
  eventCount,
  type MasterTimeline,
} from '../schema/timeline.schema';
import { validateInvariants, type ValidationResult } from '../validation';
import type { AssetKind, Emotion } from '../schema/common.schema';
import {
  requirementFingerprint,
  type AssetRequirement,
} from '../schema/requirement.schema';
import type { AssetManifest } from '../../../services/media/assets/AssetManifest';

// ---------------------------------------------------------------------------
// Report shape
// ---------------------------------------------------------------------------

export interface TimelineInspectionReport {
  summary: InspectionSummary;
  scenes: SceneRow[];
  emotion: EmotionRow[];
  speakers: SpeakerRow[];
  learning: LearningRow[];
  music: TrackRow[];
  ambience: AmbienceRow[];
  sfx: TrackRow[];
  pauses: PauseRow[];
  visual: VisualRow[];
  knowledgeGraph: KnowledgeGraphRow[];
  assets: AssetReport;
  quality: QualityReport;
  validation: ValidationResult;
}

export interface InspectionSummary {
  podcastId: string;
  timelineId: string;
  producerPlanId?: string;
  phase: 'planned' | 'resolved';
  schemaVersion: number;
  title: string;
  language: string;
  genre: string;
  narrativeStyle: string;
  cinematicIntensity: string;
  totalDurationMs: number;
  totalDurationLabel: string;
  sceneCount: number;
  speakerCount: number;
  eventCount: number;
  createdAt: number;
  resolvedAt?: number;
  warnings: string[];
}

export interface SceneRow {
  index: number;
  id: string;
  title: string;
  chapterIndex: number;
  startMs: number;
  endMs: number;
  durationMs: number;
  durationLabel: string;
  /** Share of the episode, 0..1 — exposes a runaway or starved scene. */
  share: number;
  location: string;
  timeOfDay: string;
  environment: string;
  emotion: Emotion;
  energyLevel: number;
  tensionLevel: number;
  lineRange: string;
  lineCount: number;
  transitionIn: string;
  transitionOut: string;
}

export interface EmotionRow {
  atProgress: number;
  atMsApprox: number;
  emotion: Emotion;
  intensity: number;
  sceneId: string;
}

export interface SpeakerRow {
  characterId: string;
  displayName: string;
  role: string;
  gender: string;
  ageBand: string;
  voiceProvider: string;
  voiceId: string;
  voiceLabel?: string;
  supportsProsody: boolean;
  lineCount: number;
  /** Share of spoken lines, 0..1 — exposes a one-sided "conversation". */
  lineShare: number;
  speakingMs: number;
  emotionsUsed: Emotion[];
  allowedEmotions: Emotion[];
  /** Emotions assigned outside the allowed range (should be empty). */
  outOfRange: Emotion[];
}

export interface LearningRow {
  conceptId: string;
  label: string;
  bloomLevel: string;
  difficulty: string;
  prerequisites: string[];
  examWeight?: number;
  revisionPriority?: number;
  emphasised: boolean;
  knowledgeGraphRef?: string;
}

/**
 * How an audio layer will be sourced.
 *
 * Shown per row so a reviewer can see the Director's creative decision AND how
 * it will be satisfied, before anything is rendered. `pending` is the normal
 * state for a fresh timeline — it means "the resolver has not run yet", not
 * "broken", which is the distinction the old `assetResolved: false` blurred.
 */
export interface SourcingInfo {
  /** The semantic ask, rendered for display. */
  requirement: string;
  /** Cache key — identical fingerprints share one asset. */
  fingerprint: string;
  /** Provider that will serve it, once known. */
  provider?: string;
  /** 0..1 match quality. Low values are the signal to review. */
  confidence?: number;
  assetId?: string;
  status: 'resolved' | 'pending' | 'missing';
}

export interface TrackRow {
  id: string;
  startMs: number;
  endMs: number;
  label: string;
  detail: string;
  volumeDb?: number;
  sceneId: string;
  assetId?: string;
  assetResolved?: boolean;
  sourcing?: SourcingInfo;
}

export interface AmbienceRow extends TrackRow {
  environmentId: string;
  layers: Array<{
    assetId?: string;
    layerRole: string;
    volumeDb: number;
    loopBehavior: string;
    resolved: boolean;
    sourcing?: SourcingInfo;
  }>;
}

export interface PauseRow {
  id: string;
  startMs: number;
  durationMs: number;
  pauseType: string;
  holdBackground: boolean;
  sceneId: string;
}

export interface VisualRow {
  id: string;
  startMs: number;
  durationMs: number;
  visualType: string;
  characterId?: string;
  cameraAngle: string;
  cameraMovement: string;
  lighting: string;
  visualStyle: string;
  /** Truncated for display; the full prompt is on the timeline. */
  imagePromptPreview: string;
}

export interface KnowledgeGraphRow {
  conceptId: string;
  label: string;
  graphRef: string;
}

export interface AssetReport {
  referenced: number;
  resolved: number;
  missing: Array<{ kind: string; id: string; usedBy: string[] }>;
  /** Present on the timeline as already-known-bad. */
  degraded: Array<{ kind: string; id: string }>;
  byKind: Record<string, { referenced: number; missing: number }>;
}

export interface QualityMetric {
  key: string;
  label: string;
  value: number;
  /** Displayed unit, e.g. '%', 'ms', 'per min'. */
  unit: string;
  status: 'good' | 'warn' | 'bad';
  /** What to DO about it. Empty when status is good. */
  hint: string;
}

export interface QualityReport {
  /** 0..100 — a blunt roll-up. The individual metrics are what matter. */
  score: number;
  metrics: QualityMetric[];
}

// ---------------------------------------------------------------------------
// Inspector
// ---------------------------------------------------------------------------

export interface InspectOptions {
  /** Resolves asset availability. Omit to skip resolution checks. */
  manifest?: AssetManifest;
  /** The ProducerPlan this timeline was directed from, for the learning views. */
  producerPlan?: unknown;
}

interface ProducerPlanLike {
  learningIntelligence?: {
    concepts?: Array<{
      id?: string;
      label?: string;
      bloomLevel?: string;
      difficulty?: string;
      prerequisites?: string[];
      examWeight?: number;
      revisionPriority?: number;
      knowledgeGraphRef?: string;
    }>;
    teachingSequence?: string[];
  };
  educational?: { emphasisConcepts?: string[] };
}

export class TimelineInspector {
  inspect(
    timeline: MasterTimeline,
    options: InspectOptions = {}
  ): TimelineInspectionReport {
    const producer = (options.producerPlan ?? {}) as ProducerPlanLike;

    const scenes = this.buildScenes(timeline);
    const speakers = this.buildSpeakers(timeline);
    const assets = this.buildAssetReport(timeline, options.manifest);
    const validation = validateInvariants(timeline);

    return {
      summary: this.buildSummary(timeline, speakers.length),
      scenes,
      emotion: this.buildEmotion(timeline),
      speakers,
      learning: this.buildLearning(producer),
      music: this.buildMusic(timeline, options.manifest),
      ambience: this.buildAmbience(timeline, options.manifest),
      sfx: this.buildSfx(timeline, options.manifest),
      pauses: this.buildPauses(timeline),
      visual: this.buildVisual(timeline),
      knowledgeGraph: this.buildKnowledgeGraph(producer),
      assets,
      quality: this.buildQuality(timeline, scenes, speakers, assets, validation),
      validation,
    };
  }

  // ── Summary ─────────────────────────────────────────────────────────────

  private buildSummary(t: MasterTimeline, speakerCount: number): InspectionSummary {
    return {
      podcastId: t.podcastId,
      timelineId: t.id,
      producerPlanId: t.producerPlanId,
      phase: t.phase,
      schemaVersion: t.schemaVersion,
      title: t.meta.title,
      language: t.meta.language,
      genre: t.meta.genre,
      narrativeStyle: t.meta.narrativeStyle,
      cinematicIntensity: t.meta.cinematicIntensity,
      totalDurationMs: t.totalDurationMs,
      totalDurationLabel: formatMs(t.totalDurationMs),
      sceneCount: t.scenes.length,
      speakerCount,
      eventCount: eventCount(t),
      createdAt: t.createdAt,
      resolvedAt: t.resolvedAt,
      warnings: t.warnings,
    };
  }

  // ── Scene timeline ──────────────────────────────────────────────────────

  private buildScenes(t: MasterTimeline): SceneRow[] {
    const total = Math.max(1, t.totalDurationMs);
    return t.scenes.map((s) => {
      const durationMs =
        t.phase === 'resolved' ? s.endMs - s.startMs : s.estimatedDurationMs;
      return {
        index: s.index,
        id: s.id,
        title: s.title,
        chapterIndex: s.chapterIndex,
        startMs: s.startMs,
        endMs: s.endMs,
        durationMs,
        durationLabel: formatMs(durationMs),
        share: round3(durationMs / total),
        location: s.setting.location,
        timeOfDay: s.setting.timeOfDay,
        environment: s.setting.environment,
        emotion: s.dominantEmotion,
        energyLevel: s.energyLevel,
        tensionLevel: s.tensionLevel,
        lineRange: `${s.lineRange.startLine}–${s.lineRange.endLine}`,
        lineCount: s.lineRange.endLine - s.lineRange.startLine + 1,
        transitionIn: s.transitionIn.style,
        transitionOut: s.transitionOut.style,
      };
    });
  }

  // ── Emotion timeline ────────────────────────────────────────────────────

  private buildEmotion(t: MasterTimeline): EmotionRow[] {
    return t.emotionCurve.keyframes.map((k) => ({
      atProgress: k.atProgress,
      atMsApprox: Math.round(k.atProgress * t.totalDurationMs),
      emotion: k.emotion,
      intensity: k.intensity,
      sceneId: k.sceneId,
    }));
  }

  // ── Speaker timeline ────────────────────────────────────────────────────

  private buildSpeakers(t: MasterTimeline): SpeakerRow[] {
    const voice = t.tracks.voice.events;
    const totalLines = Math.max(1, voice.length);

    return t.cast.characters.map((c) => {
      const lines = voice.filter((v) => v.characterId === c.id);
      const emotionsUsed = [...new Set(lines.map((l) => l.emotion))];
      const allowed = new Set(c.allowedEmotions);

      return {
        characterId: c.id,
        displayName: c.displayName,
        role: c.role,
        gender: c.gender,
        ageBand: c.ageBand,
        voiceProvider: c.voice.provider,
        voiceId: c.voice.voiceId,
        voiceLabel: c.voice.voiceLabel,
        supportsProsody: c.voice.supportsProsody,
        lineCount: lines.length,
        lineShare: round3(lines.length / totalLines),
        speakingMs: lines.reduce((sum, l) => sum + l.durationMs, 0),
        emotionsUsed,
        allowedEmotions: c.allowedEmotions,
        // Should always be empty — a non-empty list means the clamp was bypassed.
        outOfRange: emotionsUsed.filter((e) => !allowed.has(e)),
      };
    });
  }

  // ── Learning timeline ───────────────────────────────────────────────────

  private buildLearning(producer: ProducerPlanLike): LearningRow[] {
    const concepts = producer.learningIntelligence?.concepts ?? [];
    const sequence = producer.learningIntelligence?.teachingSequence ?? [];
    const emphasised = new Set(producer.educational?.emphasisConcepts ?? []);

    // Present in TEACHING order, which is what a reviewer wants to sanity-check.
    const byId = new Map(concepts.map((c) => [c.id ?? '', c]));
    const ordered = sequence.length
      ? sequence.map((id) => byId.get(id)).filter(Boolean)
      : concepts;

    return (ordered as typeof concepts).map((c) => ({
      conceptId: c!.id ?? '',
      label: c!.label ?? '',
      bloomLevel: c!.bloomLevel ?? 'understand',
      difficulty: c!.difficulty ?? 'intermediate',
      prerequisites: c!.prerequisites ?? [],
      examWeight: c!.examWeight,
      revisionPriority: c!.revisionPriority,
      emphasised: emphasised.has(c!.id ?? ''),
      knowledgeGraphRef: c!.knowledgeGraphRef,
    }));
  }

  private buildKnowledgeGraph(producer: ProducerPlanLike): KnowledgeGraphRow[] {
    return (producer.learningIntelligence?.concepts ?? [])
      .filter((c) => !!c.knowledgeGraphRef)
      .map((c) => ({
        conceptId: c.id ?? '',
        label: c.label ?? '',
        graphRef: c.knowledgeGraphRef!,
      }));
  }

  // ── Audio tracks ────────────────────────────────────────────────────────

  private buildMusic(t: MasterTimeline, manifest?: AssetManifest): TrackRow[] {
    return [...t.tracks.music.events]
      .sort((a, b) => a.startMs - b.startMs)
      .map((e) => ({
        id: e.id,
        startMs: e.startMs,
        endMs: e.startMs + e.durationMs,
        label: `${e.role}: ${e.category}`,
        detail: `intensity ${e.intensity} · ${e.tempo} · ${e.loopStrategy} · xfade ${e.crossfadeToNextMs}ms`,
        volumeDb: e.volumeDb,
        sceneId: e.sceneId,
        assetId: e.assetId,
        assetResolved: e.assetId
          ? manifest
            ? manifest.has('music', e.assetId)
            : undefined
          : undefined,
        sourcing: describeSourcing(e.requirement, e.assetId, manifest, 'music'),
      }));
  }

  private buildAmbience(t: MasterTimeline, manifest?: AssetManifest): AmbienceRow[] {
    return [...t.tracks.ambience.events]
      .sort((a, b) => a.startMs - b.startMs)
      .map((e) => ({
        id: e.id,
        startMs: e.startMs,
        endMs: e.startMs + e.durationMs,
        label: e.environmentId,
        detail: `${e.layers.length} layer(s)`,
        sceneId: e.sceneId,
        environmentId: e.environmentId,
        layers: e.layers.map((l) => ({
          assetId: l.assetId,
          layerRole: l.layerRole,
          volumeDb: l.volumeDb,
          loopBehavior: l.loopBehavior,
          resolved: l.assetId ? (manifest ? manifest.has('ambience', l.assetId) : true) : false,
          sourcing: describeSourcing(l.requirement, l.assetId, manifest, 'ambience'),
        })),
      }));
  }

  private buildSfx(t: MasterTimeline, manifest?: AssetManifest): TrackRow[] {
    return [...t.tracks.sfx.events]
      .sort((a, b) => a.startMs - b.startMs)
      .map((e) => ({
        id: e.id,
        startMs: e.startMs,
        endMs: e.startMs + e.durationMs,
        label: e.effectCategory,
        detail: `“${e.triggerWord ?? '—'}” · line ${e.triggerLineIndex ?? '—'} · ${e.syncMode} · offset ${e.offsetMs}ms`,
        volumeDb: e.volumeDb,
        sceneId: e.sceneId,
        assetId: e.assetId,
        assetResolved: e.assetId
          ? manifest
            ? manifest.has('sfx', e.assetId)
            : undefined
          : undefined,
        sourcing: describeSourcing(e.requirement, e.assetId, manifest, 'sfx'),
      }));
  }

  private buildPauses(t: MasterTimeline): PauseRow[] {
    return [...t.tracks.pause.events]
      .sort((a, b) => a.startMs - b.startMs)
      .map((e) => ({
        id: e.id,
        startMs: e.startMs,
        durationMs: e.durationMs,
        pauseType: e.pauseType,
        holdBackground: e.holdBackground,
        sceneId: e.sceneId,
      }));
  }

  private buildVisual(t: MasterTimeline): VisualRow[] {
    return [...t.tracks.visual.events]
      .sort((a, b) => a.startMs - b.startMs)
      .map((e) => ({
        id: e.id,
        startMs: e.startMs,
        durationMs: e.durationMs,
        visualType: e.visualType,
        characterId: e.characterId,
        cameraAngle: e.sceneVisual.cameraAngle,
        cameraMovement: e.sceneVisual.cameraMovement,
        lighting: e.sceneVisual.lighting,
        visualStyle: e.sceneVisual.visualStyle,
        imagePromptPreview: truncate(e.sceneVisual.imagePrompt, 120),
      }));
  }

  // ── Assets ──────────────────────────────────────────────────────────────

  private buildAssetReport(
    t: MasterTimeline,
    manifest?: AssetManifest
  ): AssetReport {
    // Track which events use each ref, so a missing asset names its callers.
    const usage = new Map<string, Set<string>>();
    const add = (kind: string, id: string, usedBy: string) => {
      const key = `${kind}:${id}`;
      const set = usage.get(key) ?? new Set<string>();
      set.add(usedBy);
      usage.set(key, set);
    };

    // Only HINTS are checked. An event with no assetId is awaiting the resolver,
    // which is the normal state — not a missing asset.
    for (const e of t.tracks.music.events) {
      if (e.assetId) add('music', e.assetId, e.id);
    }
    for (const e of t.tracks.ambience.events) {
      for (const l of e.layers) if (l.assetId) add('ambience', l.assetId, e.id);
    }
    for (const e of t.tracks.sfx.events) {
      if (e.assetId) add('sfx', e.assetId, e.id);
    }

    const byKind: Record<string, { referenced: number; missing: number }> = {};
    const missing: AssetReport['missing'] = [];

    for (const [key, usedBy] of usage) {
      const [kind, id] = key.split(':');
      byKind[kind] = byKind[kind] ?? { referenced: 0, missing: 0 };
      byKind[kind].referenced += 1;

      const resolved = manifest ? manifest.has(kind as never, id) : true;
      if (!resolved) {
        byKind[kind].missing += 1;
        missing.push({ kind, id, usedBy: [...usedBy] });
      }
    }

    return {
      referenced: usage.size,
      resolved: usage.size - missing.length,
      missing,
      degraded: t.degradedAssets.map((a) => ({ kind: a.kind, id: a.id })),
      byKind,
    };
  }

  // ── Quality metrics ─────────────────────────────────────────────────────

  /**
   * Every metric names a concrete defect and how to fix it. A single opaque
   * score would tell a reviewer nothing about what to change.
   */
  private buildQuality(
    t: MasterTimeline,
    scenes: SceneRow[],
    speakers: SpeakerRow[],
    assets: AssetReport,
    validation: ValidationResult
  ): QualityReport {
    const metrics: QualityMetric[] = [];

    // 1. Validation — the only metric that can be fatal.
    metrics.push({
      key: 'validation',
      label: 'Invariant errors',
      value: validation.errors.length,
      unit: '',
      status: validation.errors.length === 0 ? 'good' : 'bad',
      hint: validation.errors.length
        ? `Fix: ${validation.errors.map((e) => e.code).join(', ')}`
        : '',
    });

    // 2. Asset resolution.
    const assetPct = assets.referenced === 0 ? 100 : (assets.resolved / assets.referenced) * 100;
    metrics.push({
      key: 'assets',
      label: 'Assets resolved',
      value: Math.round(assetPct),
      unit: '%',
      status: assetPct === 100 ? 'good' : assetPct >= 70 ? 'warn' : 'bad',
      hint:
        assets.missing.length > 0
          ? `Upload or remap: ${assets.missing.slice(0, 5).map((m) => `${m.kind}/${m.id}`).join(', ')}`
          : '',
    });

    // 3. Scene balance — a scene taking most of the episode means boundary
    //    detection failed, which is the most common analyzer defect.
    const maxShare = scenes.length ? Math.max(...scenes.map((s) => s.share)) : 0;
    const balanced = scenes.length <= 1 || maxShare <= 0.5;
    metrics.push({
      key: 'scene_balance',
      label: 'Largest scene share',
      value: Math.round(maxShare * 100),
      unit: '%',
      status: balanced ? 'good' : maxShare <= 0.7 ? 'warn' : 'bad',
      hint: balanced
        ? ''
        : 'One scene dominates the episode — scene boundary detection likely failed.',
    });

    // 4. Speaker balance — a "conversation" where one voice says 95% of the
    //    lines is really a monologue.
    const isMulti = speakers.length > 1;
    const topShare = speakers.length ? Math.max(...speakers.map((s) => s.lineShare)) : 1;
    const speakerOk = !isMulti || topShare <= 0.8;
    metrics.push({
      key: 'speaker_balance',
      label: 'Dominant speaker share',
      value: Math.round(topShare * 100),
      unit: '%',
      status: speakerOk ? 'good' : topShare <= 0.9 ? 'warn' : 'bad',
      hint: speakerOk
        ? ''
        : 'Cast is multi-speaker but one voice dominates — check the script, not the Director.',
    });

    // 5. Emotion variety — a flat curve produces a monotone read.
    const distinctEmotions = new Set(t.emotionCurve.keyframes.map((k) => k.emotion)).size;
    const varietyOk = scenes.length <= 2 || distinctEmotions >= 2;
    metrics.push({
      key: 'emotion_variety',
      label: 'Distinct emotions',
      value: distinctEmotions,
      unit: '',
      status: varietyOk ? 'good' : 'warn',
      hint: varietyOk ? '' : 'Emotion curve is flat — delivery will sound monotone.',
    });

    // 6. Emotion range violations — should be structurally impossible.
    const outOfRange = speakers.reduce((sum, s) => sum + s.outOfRange.length, 0);
    metrics.push({
      key: 'emotion_range',
      label: 'Out-of-range emotions',
      value: outOfRange,
      unit: '',
      status: outOfRange === 0 ? 'good' : 'warn',
      hint: outOfRange ? 'Emotions assigned outside a character’s allowed range.' : '',
    });

    // 7. SFX density — the metric that guards against a radio-drama feel.
    const minutes = Math.max(1, t.totalDurationMs / 60_000);
    const sfxPerMin = t.tracks.sfx.events.length / minutes;
    metrics.push({
      key: 'sfx_density',
      label: 'SFX density',
      value: round2(sfxPerMin),
      unit: '/min',
      status: sfxPerMin <= 2.5 ? 'good' : sfxPerMin <= 4 ? 'warn' : 'bad',
      hint:
        sfxPerMin > 2.5
          ? 'Too many effects for educational content — lower MAX_SFX_PER_MINUTE.'
          : '',
    });

    // 8. Music continuity — the no-hard-stop guarantee.
    const music = [...t.tracks.music.events].sort((a, b) => a.startMs - b.startMs);
    const hardStops = music
      .slice(0, -1)
      .filter((e) => e.crossfadeToNextMs <= 0 && e.transitionType !== 'cut').length;
    metrics.push({
      key: 'music_continuity',
      label: 'Music hard stops',
      value: hardStops,
      unit: '',
      status: hardStops === 0 ? 'good' : 'bad',
      hint: hardStops ? 'Music will cut abruptly — every non-final bed needs a crossfade.' : '',
    });

    // 9. Duck headroom — the narrator-intelligibility guarantee.
    const floor = t.mastering.voiceBusGainDb + t.mastering.duckingDb;
    const tooLoud = t.tracks.music.events.filter((e) => e.volumeDb > floor).length;
    metrics.push({
      key: 'duck_headroom',
      label: 'Beds above duck floor',
      value: tooLoud,
      unit: '',
      status: tooLoud === 0 ? 'good' : 'bad',
      hint: tooLoud ? `Music may mask narration (floor ${floor}dB).` : '',
    });

    // 10. Line coverage — every line must be inside exactly one scene.
    const lineCount = t.tracks.voice.events.length;
    const covered = new Set<number>();
    for (const s of t.scenes) {
      for (let i = s.lineRange.startLine; i <= s.lineRange.endLine; i++) covered.add(i);
    }
    const uncovered = lineCount - [...covered].filter((i) => i < lineCount).length;
    metrics.push({
      key: 'line_coverage',
      label: 'Uncovered script lines',
      value: uncovered,
      unit: '',
      status: uncovered === 0 ? 'good' : 'bad',
      hint: uncovered ? 'Lines belong to no scene — scene coverage normalisation failed.' : '',
    });

    // Roll-up: 'bad' costs more than 'warn' because bad blocks a render.
    const penalty = metrics.reduce((sum, m) => {
      if (m.status === 'bad') return sum + 15;
      if (m.status === 'warn') return sum + 5;
      return sum;
    }, 0);

    return { score: Math.max(0, 100 - penalty), metrics };
  }
}

// ---------------------------------------------------------------------------
// Sourcing (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Describe how an audio layer will be sourced.
 *
 * Status semantics, which are the point of this function:
 *   resolved — a hint exists AND the catalogue has it
 *   missing  — a hint exists but the catalogue does NOT have it (a real problem)
 *   pending  — no hint; the AssetResolver will obtain it at render time (normal)
 *
 * Provider and confidence are left undefined here because the Director has not
 * consulted a provider — filling them in would be inventing data. The render
 * report populates them after a resolution pass.
 */
export function describeSourcing(
  requirement: AssetRequirement | undefined,
  assetId: string | undefined,
  manifest: AssetManifest | undefined,
  kind: AssetKind
): SourcingInfo | undefined {
  if (!requirement) return undefined;

  let status: SourcingInfo['status'];
  if (!assetId) {
    status = 'pending';
  } else if (manifest && !manifest.has(kind, assetId)) {
    status = 'missing';
  } else {
    status = 'resolved';
  }

  return {
    requirement: formatRequirement(requirement),
    fingerprint: requirementFingerprint(requirement),
    assetId,
    status,
  };
}

/** One-line human summary of a requirement, for CLI and admin display. */
export function formatRequirement(r: AssetRequirement): string {
  const bits: string[] = [r.kind, r.category];
  if (r.emotion) bits.push(r.emotion);
  if (r.intensity != null) bits.push(`i=${r.intensity}`);
  if (r.tempo) bits.push(r.tempo);
  if (r.layerRole) bits.push(r.layerRole);
  bits.push(r.loopable ? 'loop' : 'one-shot');
  return bits.join(' · ');
}

// ---------------------------------------------------------------------------
// Formatting helpers (exported — the CLI renderer reuses them)
// ---------------------------------------------------------------------------

/** `m:ss` or `h:mm:ss`. */
export function formatMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '0:00';
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

export function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export const timelineInspector = new TimelineInspector();
