/**
 * AIDirector — orchestrates the creative decision layer.
 *
 *   NarrativeAnalyzer   (the ONE LLM call: scenes + cast + arc)
 *          ↓
 *   CharacterPlanner    → cast bound to concrete voices
 *   ScenePlanner        → full scenes with settings, transitions, visuals
 *   EmotionPlanner      → global curve + per-line delivery
 *          ↓  (these four are pure and run in parallel)
 *   PausePlanner  MusicPlanner  AmbiencePlanner  SFXPlanner  VisualPlanner
 *          ↓
 *   TimelineBuilder     → PLANNED MasterTimeline
 *
 * Guarantees:
 *   - PRODUCES NO MEDIA. No TTS, no ffmpeg, no storage writes.
 *   - NEVER THROWS. Every planner has a deterministic fallback.
 *   - Exactly ONE LLM call per episode.
 */

import { logger } from '../../utils/logger';
import { Telemetry } from '../../lib/telemetry';
import { characterRepository } from '../../repositories/character.repository';
import { AssetManifest, emptyAssetManifest } from '../../services/media/assets/AssetManifest';
import type { DirectorInput, IAIDirector } from './interfaces';
import { TimelineBuilder, timelineBuilder } from './TimelineBuilder';
import { validateInvariants, formatValidationResult } from './validation';
import {
  DEFAULT_MASTERING,
  MasteringSpecSchema,
  type MasteringSpec,
  type VoiceEvent,
} from './schema/audio.schema';
import type { MasterTimeline, TimelineMeta } from './schema/timeline.schema';
import type { AssetRef, CinematicIntensity, MediaGenre } from './schema/common.schema';
import { NarrativeAnalyzer, narrativeAnalyzer, normalizeName, type ScriptLineLike } from './planners/NarrativeAnalyzer';
import { CharacterPlanner, characterPlanner } from './planners/CharacterPlanner';
import { ScenePlanner, scenePlanner, countWords, wordsPerSecond } from './planners/ScenePlanner';
import { EmotionPlanner, emotionPlanner } from './planners/EmotionPlanner';
import { PausePlanner, pausePlanner } from './planners/PausePlanner';
import { MusicPlanner, musicPlanner } from './planners/MusicPlanner';
import { AmbiencePlanner, ambiencePlanner } from './planners/AmbiencePlanner';
import { SFXPlanner, sfxPlanner } from './planners/SFXPlanner';
import { VisualPlanner, visualPlanner } from './planners/VisualPlanner';

/**
 * Structural subsets of the existing pipeline types, declared locally so this
 * module has NO import from `core/workflow/podcast` — the Director must not
 * depend on the pipeline it plugs into.
 */
interface PlanLike {
  title?: string;
  description?: string;
  language?: string;
  type?: string;
  speakers?: Array<{ name?: string; role?: string }>;
  segments?: Array<{ index?: number; title?: string }>;
  estimatedMinutes?: number;
}

interface ScriptLike {
  lines?: Array<{ speaker?: string; text?: string; chapterIndex?: number }>;
}

interface BriefLike {
  topic?: string;
  titleSeed?: string;
}

interface ProducerPlanLike {
  id?: string;
  media?: {
    suggestedNarrativeStyle?: string;
    pacing?: string;
    primaryFormat?: string;
  };
  accessibility?: {
    maxSpeakingRate?: number;
    reduceBackgroundAudio?: boolean;
    extendedPauseMs?: number;
    avoidStartleEffects?: boolean;
  };
  educational?: {
    emphasisConcepts?: string[];
  };
  learningIntelligence?: {
    concepts?: Array<{ id?: string; label?: string }>;
  };
}

export interface DirectorDependencies {
  analyzer?: NarrativeAnalyzer;
  characters?: CharacterPlanner;
  scenes?: ScenePlanner;
  emotions?: EmotionPlanner;
  pauses?: PausePlanner;
  music?: MusicPlanner;
  ambience?: AmbiencePlanner;
  sfx?: SFXPlanner;
  visual?: VisualPlanner;
  builder?: TimelineBuilder;
  manifest?: AssetManifest;
}

export class AIDirector implements IAIDirector {
  private readonly analyzer: NarrativeAnalyzer;
  private readonly characters: CharacterPlanner;
  private readonly scenes: ScenePlanner;
  private readonly emotions: EmotionPlanner;
  private readonly pauses: PausePlanner;
  private readonly music: MusicPlanner;
  private readonly ambience: AmbiencePlanner;
  private readonly sfx: SFXPlanner;
  private readonly visual: VisualPlanner;
  private readonly builder: TimelineBuilder;
  private readonly manifest: AssetManifest;

  constructor(deps: DirectorDependencies = {}) {
    this.analyzer = deps.analyzer ?? narrativeAnalyzer;
    this.characters = deps.characters ?? characterPlanner;
    this.scenes = deps.scenes ?? scenePlanner;
    this.emotions = deps.emotions ?? emotionPlanner;
    this.pauses = deps.pauses ?? pausePlanner;
    this.music = deps.music ?? musicPlanner;
    this.ambience = deps.ambience ?? ambiencePlanner;
    this.sfx = deps.sfx ?? sfxPlanner;
    this.visual = deps.visual ?? visualPlanner;
    this.builder = deps.builder ?? timelineBuilder;
    this.manifest = deps.manifest ?? emptyAssetManifest;
  }

  async direct(input: DirectorInput): Promise<MasterTimeline> {
    const started = Date.now();
    const plan = (input.plan ?? {}) as PlanLike;
    const script = (input.script ?? {}) as ScriptLike;
    const brief = (input.brief ?? {}) as BriefLike;
    const producer = (input.producerPlan ?? {}) as ProducerPlanLike;

    const warnings: string[] = [];
    const prefs = input.preferences ?? {};
    const cinematicIntensity: CinematicIntensity = prefs.cinematicIntensity ?? 'subtle';

    const language = plan.language || 'English';
    const topic = brief.topic || brief.titleSeed || plan.title || 'the topic';
    const title = plan.title || topic;
    const genre = inferGenre(plan.type);

    const lines: ScriptLineLike[] = (script.lines ?? []).map((l, i) => ({
      speaker: l.speaker || 'Narrator',
      text: l.text || '',
      chapterIndex: typeof l.chapterIndex === 'number' ? l.chapterIndex : i,
    }));

    const mastering: MasteringSpec = MasteringSpecSchema.parse({
      ...DEFAULT_MASTERING,
      ...(typeof prefs.targetLoudnessLufs === 'number'
        ? { targetLufs: prefs.targetLoudnessLufs }
        : {}),
    });
    const duckFloorDb = mastering.voiceBusGainDb + mastering.duckingDb;

    const accessibility = producer.accessibility ?? {};
    const reduceBackground = !!accessibility.reduceBackgroundAudio;

    // ── 1. Narrative analysis (the one LLM call) ───────────────────────────
    const analysis = await this.analyzer.plan({
      userId: input.userId,
      podcastId: input.podcastId,
      title,
      topic,
      language,
      chapters: (plan.segments ?? []).map((s, i) => ({
        index: typeof s.index === 'number' ? s.index : i,
        title: s.title || `Segment ${i + 1}`,
      })),
      declaredSpeakers: (plan.speakers ?? []).map((s) => ({
        name: s.name || 'Narrator',
        role: s.role || 'Narrator',
      })),
      lines,
      genreHint: genre,
      narrativeStyleHint: producer.media?.suggestedNarrativeStyle,
    });

    if (analysis.degraded) {
      warnings.push('Narrative analysis degraded to deterministic fallback.');
    }

    // ── 2. Cast ────────────────────────────────────────────────────────────
    const existingCharacters = await characterRepository
      .listByUser(input.userId)
      .catch(() => []);

    const cast = await this.characters.plan({
      userId: input.userId,
      language,
      hints: analysis.characters,
      existingCharacters,
      maxSpeakingRate: accessibility.maxSpeakingRate,
    });

    // ── 3. Scenes ──────────────────────────────────────────────────────────
    const scenes = await this.scenes.plan({
      skeletons: analysis.scenes,
      lines,
      language,
      genre,
      topic,
      reduceBackground,
      cinematicIntensity,
    });

    if (scenes.length === 0) {
      warnings.push('No scenes could be planned; timeline will be minimal.');
    }

    // ── 4. Emotion curve ───────────────────────────────────────────────────
    const emotionCurve = await this.emotions.plan({
      scenes,
      arcType: analysis.emotionArc,
      maxSpeakingRate: accessibility.maxSpeakingRate,
      cinematicIntensity,
    });

    // ── 5. Pass-1 line timing (needed by SFX + visual planners) ────────────
    const wps = wordsPerSecond(language);
    const { lineStartsMs, lineDurationsMs, totalEstimatedMs } = estimateLineTimings(lines, wps);

    // ── 6. Voice events ────────────────────────────────────────────────────
    const voice = this.buildVoiceEvents({
      lines,
      scenes,
      cast,
      emotionCurve,
      lineStartsMs,
      lineDurationsMs,
      totalEstimatedMs,
      maxSpeakingRate: accessibility.maxSpeakingRate,
      cinematicIntensity,
    });

    // ── 7. Remaining planners — pure, independent, parallel ────────────────
    const emphasisTerms = resolveEmphasisTerms(producer);

    const [pause, music, ambience, sfx, visual] = await Promise.all([
      this.pauses.plan({
        scenes,
        lines,
        extendedPauseMs: accessibility.extendedPauseMs,
        emphasisTerms,
        cinematicIntensity,
      }),
      prefs.enableMusic === false
        ? Promise.resolve([])
        : this.music.plan({
            scenes,
            genre,
            manifest: this.manifest,
            duckFloorDb,
            reduceBackground,
            cinematicIntensity,
            totalEstimatedMs,
          }),
      prefs.enableAmbience === false
        ? Promise.resolve([])
        : this.ambience.plan({
            scenes,
            manifest: this.manifest,
            duckFloorDb,
            reduceBackground,
            cinematicIntensity,
          }),
      prefs.enableSFX === false
        ? Promise.resolve([])
        : this.sfx.plan({
            scenes,
            lines,
            manifest: this.manifest,
            duckFloorDb,
            avoidStartleEffects: accessibility.avoidStartleEffects,
            reduceBackground,
            cinematicIntensity,
            lineDurationsMs,
            lineStartsMs,
            totalEstimatedMs,
          }),
      this.visual.plan({
        scenes,
        cast,
        lines,
        lineStartsMs,
        lineDurationsMs,
        enabled: prefs.enableVisualPlanning !== false,
      }),
    ]);

    // ── 8. Asset validation — unresolvable refs degrade, never fail ─────────
    const degradedAssets = this.collectDegradedAssets(music, ambience, sfx);
    if (degradedAssets.length > 0) {
      warnings.push(
        `${degradedAssets.length} asset reference(s) unresolvable; those layers will be skipped.`
      );
    }

    const meta: TimelineMeta = {
      title,
      language,
      genre,
      narrativeStyle: normalizeNarrativeStyle(producer.media?.suggestedNarrativeStyle),
      cinematicIntensity,
      estimatedMinutes: plan.estimatedMinutes ?? Math.round(totalEstimatedMs / 60_000),
    };

    // ── 9. Assemble ────────────────────────────────────────────────────────
    const timeline = this.builder.build({
      podcastId: input.podcastId,
      userId: input.userId,
      producerPlanId: producer.id,
      meta,
      cast,
      scenes,
      emotionCurve,
      voice,
      music,
      ambience,
      sfx,
      pause,
      visual,
      mastering,
      degradedAssets,
      warnings,
    });

    // Validate but never block: a warning-laden timeline is still useful in
    // shadow mode, and errors are surfaced for the inspector.
    const validation = validateInvariants(timeline);
    const elapsed = Date.now() - started;

    logger.info('[AIDirector] Timeline directed', {
      podcastId: input.podcastId,
      scenes: scenes.length,
      voiceEvents: voice.length,
      musicEvents: music.length,
      ambienceEvents: ambience.length,
      sfxEvents: sfx.length,
      pauseEvents: pause.length,
      visualEvents: visual.length,
      validation: formatValidationResult(validation),
      durationMs: elapsed,
    });
    try {
      Telemetry.logLatency('director.direct', elapsed, { podcastId: input.podcastId });
    } catch {
      /* telemetry is advisory */
    }

    if (!validation.valid) {
      // Record on the timeline so the inspector shows it without a log dive.
      return {
        ...timeline,
        warnings: [
          ...timeline.warnings,
          ...validation.errors.map((e) => `${e.code}: ${e.message}`),
        ],
      };
    }

    return timeline;
  }

  // ── Voice events ────────────────────────────────────────────────────────

  private buildVoiceEvents(args: {
    lines: ScriptLineLike[];
    scenes: ReturnType<ScenePlanner['fallback']>;
    cast: Awaited<ReturnType<CharacterPlanner['plan']>>;
    emotionCurve: Awaited<ReturnType<EmotionPlanner['plan']>>;
    lineStartsMs: Record<number, number>;
    lineDurationsMs: Record<number, number>;
    totalEstimatedMs: number;
    maxSpeakingRate?: number;
    cinematicIntensity: CinematicIntensity;
  }): VoiceEvent[] {
    const idByName = new Map<string, string>();
    for (const c of args.cast.characters) {
      idByName.set(normalizeName(c.displayName), c.id);
    }
    const charById = new Map(args.cast.characters.map((c) => [c.id, c]));

    // Line → scene lookup so each line inherits its scene's mood.
    const sceneOfLine = new Map<number, (typeof args.scenes)[number]>();
    for (const scene of args.scenes) {
      for (let i = scene.lineRange.startLine; i <= scene.lineRange.endLine; i++) {
        sceneOfLine.set(i, scene);
      }
    }
    const firstLineOfScene = new Set(args.scenes.map((s) => s.lineRange.startLine));
    const fallbackScene = args.scenes[0];

    return args.lines.map((line, index) => {
      const scene = sceneOfLine.get(index) ?? fallbackScene;
      const characterId =
        idByName.get(normalizeName(line.speaker)) ?? args.cast.primarySpeakerId;
      const character = charById.get(characterId) ?? args.cast.characters[0];

      const progress =
        args.totalEstimatedMs > 0
          ? (args.lineStartsMs[index] ?? 0) / args.totalEstimatedMs
          : 0;

      const delivery = this.emotions.deliveryFor({
        scene,
        character,
        curve: args.emotionCurve,
        progress,
        isSceneOpener: firstLineOfScene.has(index),
        maxSpeakingRate: args.maxSpeakingRate,
        cinematicIntensity: args.cinematicIntensity,
      });

      return {
        id: `voice_${index}`,
        kind: 'voice' as const,
        startMs: args.lineStartsMs[index] ?? 0,
        durationMs: args.lineDurationsMs[index] ?? 0,
        sceneId: scene?.id ?? 'scene_0',
        priority: 90,
        // 1:1 order-preserving with script.lines — the critical invariant.
        lineIndex: index,
        characterId,
        text: line.text,
        emotion: delivery.emotion,
        delivery,
      };
    });
  }

  /**
   * Refs the manifest cannot resolve. Reported, never fatal.
   *
   * Only events carrying an `assetId` HINT are checked. An event with no hint is
   * not degraded — it is simply awaiting the AssetResolver, which is now the
   * normal case. Counting those as degraded would report every cue as broken on
   * an empty catalogue.
   */
  private collectDegradedAssets(
    music: Array<{ assetId?: string }>,
    ambience: Array<{ layers: Array<{ assetId?: string }> }>,
    sfx: Array<{ assetId?: string }>
  ): AssetRef[] {
    const refs: AssetRef[] = [
      ...music
        .filter((m) => !!m.assetId)
        .map((m) => ({ kind: 'music' as const, id: m.assetId as string })),
      ...ambience.flatMap((a) =>
        a.layers
          .filter((l) => !!l.assetId)
          .map((l) => ({ kind: 'ambience' as const, id: l.assetId as string }))
      ),
      ...sfx
        .filter((s) => !!s.assetId)
        .map((s) => ({ kind: 'sfx' as const, id: s.assetId as string })),
    ];
    return this.manifest.validateRefs(refs);
  }
}

// ---------------------------------------------------------------------------
// Helpers (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Pass-1 line timings from word counts. Replaced wholesale by
 * `TimelineBuilder.resolve()` once TTS reports real durations.
 */
export function estimateLineTimings(
  lines: ScriptLineLike[],
  wordsPerSec: number
): {
  lineStartsMs: Record<number, number>;
  lineDurationsMs: Record<number, number>;
  totalEstimatedMs: number;
} {
  const lineStartsMs: Record<number, number> = {};
  const lineDurationsMs: Record<number, number> = {};
  let cursor = 0;

  lines.forEach((line, i) => {
    const words = countWords(line.text);
    // Floor at 800ms — even a one-word line takes time to say.
    const durationMs = Math.max(800, Math.round((words / wordsPerSec) * 1000));
    lineStartsMs[i] = cursor;
    lineDurationsMs[i] = durationMs;
    cursor += durationMs;
  });

  return { lineStartsMs, lineDurationsMs, totalEstimatedMs: cursor };
}

/** Podcast type → media genre. */
export function inferGenre(podcastType?: string): MediaGenre {
  switch ((podcastType || '').toLowerCase()) {
    case 'current_affairs':
      return 'news';
    case 'doubt':
      return 'interview';
    case 'crash_course':
    case 'revision':
    case 'exam_revision':
    case 'weak_topic':
    case 'quiz_review':
    case 'chapter':
    case 'daily':
      return 'educational';
    default:
      return 'educational';
  }
}

export function normalizeNarrativeStyle(
  style?: string
): TimelineMeta['narrativeStyle'] {
  const allowed = [
    'linear',
    'problem_solution',
    'chronological',
    'question_driven',
    'story_arc',
    'compare_contrast',
  ] as const;
  const s = (style || '').toLowerCase();
  return (allowed as readonly string[]).includes(s)
    ? (s as TimelineMeta['narrativeStyle'])
    : 'linear';
}

/**
 * Terms worth a comprehension pause: the Producer's emphasised concept IDs
 * resolved to their human labels, since a raw id never appears in the script.
 */
export function resolveEmphasisTerms(producer: {
  educational?: { emphasisConcepts?: string[] };
  learningIntelligence?: { concepts?: Array<{ id?: string; label?: string }> };
}): string[] {
  const ids = new Set(producer.educational?.emphasisConcepts ?? []);
  if (ids.size === 0) return [];

  const labels: string[] = [];
  for (const concept of producer.learningIntelligence?.concepts ?? []) {
    if (concept.id && ids.has(concept.id) && concept.label) {
      labels.push(concept.label);
    }
  }
  return labels;
}

export const aiDirector = new AIDirector();
