/**
 * ProducerDecisionEngine — turns a LearnerProfile + LearningIntelligence into
 * the five strategies that make up a ProducerPlan.
 *
 * FULLY DETERMINISTIC. No LLM, no network, no I/O. Every decision is a pure
 * function of its inputs, which means:
 *   - microsecond latency, zero cost
 *   - unit-testable without mocks
 *   - reproducible: the same learner + topic always yields the same strategy
 *
 * Each method returns both a strategy and the rationale behind it. The
 * rationale is surfaced in the Timeline Inspector (Phase D) so a reviewer can
 * see WHY the Producer chose what it chose — the difference between a debuggable
 * system and a black box.
 */

import {
  AccessibilityStrategySchema,
  AssessmentStrategySchema,
  EducationalStrategySchema,
  InteractionStrategySchema,
  MediaStrategySchema,
  type AccessibilityStrategy,
  type AssessmentStrategy,
  type BloomLevel,
  type EducationalStrategy,
  type InteractionStrategy,
  type LearnerProfile,
  type LearningIntelligence,
  type MediaStrategy,
  type PedagogicalApproach,
} from './schema/producerPlan.schema';
import { PODCAST_STYLES, isPodcastStyleId } from '../workflow/podcast/podcastStyles';

export interface DecisionInput {
  learner: LearnerProfile;
  intelligence: LearningIntelligence;
  targetMinutes: number;
  /** The requested speaker style from the existing PodcastGenerateRequest. */
  speakerStyle?: string;
  /** The requested podcast type ('revision' | 'crash_course' | …). */
  podcastType?: string;
}

export interface Decision<T> {
  strategy: T;
  rationale: string[];
}

export class ProducerDecisionEngine {
  // ── Educational ─────────────────────────────────────────────────────────

  decideEducational(input: DecisionInput): Decision<EducationalStrategy> {
    const { learner, intelligence } = input;
    const rationale: string[] = [];

    const approach = pickApproach(input);
    rationale.push(`Approach '${approach}' chosen for ${describeApproachReason(input)}.`);

    // Concepts the learner is weak on, ordered by revision priority.
    const emphasis = [...intelligence.concepts]
      .filter((c) => (c.revisionPriority ?? 0) >= 0.7)
      .sort((a, b) => (b.revisionPriority ?? 0) - (a.revisionPriority ?? 0))
      .map((c) => c.id)
      .slice(0, 5);

    if (emphasis.length) {
      rationale.push(
        `Emphasising ${emphasis.length} concept(s) matching the learner's weak areas.`
      );
    }

    // Recap cadence tracks attention span. A recap costs time, so only add one
    // when the episode meaningfully outruns the learner's span.
    const span = learner.attentionSpanMinutes ?? 12;
    const recapInterval =
      input.targetMinutes > span * 1.5 ? Math.max(4, Math.round(span)) : 0;
    if (recapInterval > 0) {
      rationale.push(
        `Episode (${input.targetMinutes}min) exceeds attention span (${span}min); recapping every ${recapInterval}min.`
      );
    }

    // Scaffolding is inversely proportional to mastery, nudged by difficulty band.
    const scaffolding = clamp01(
      0.8 - (learner.masteryLevel ?? 0.4) * 0.5 + difficultyScaffoldBias(learner)
    );
    rationale.push(`Scaffolding level ${scaffolding.toFixed(2)} from mastery and difficulty band.`);

    const objectives = buildObjectives(intelligence);

    return {
      strategy: EducationalStrategySchema.parse({
        approach,
        learningObjectives: objectives,
        emphasisConcepts: emphasis,
        analogies: [],
        recapIntervalMinutes: recapInterval,
        scaffoldingLevel: scaffolding,
      }),
      rationale,
    };
  }

  // ── Media ───────────────────────────────────────────────────────────────

  decideMedia(input: DecisionInput): Decision<MediaStrategy> {
    const { learner, intelligence } = input;
    const rationale: string[] = [];

    const narrative = pickNarrativeStyle(input);
    rationale.push(`Narrative '${narrative}' suits ${input.podcastType || 'this topic'}.`);

    // Honour an explicit speakerStyle; otherwise infer from the approach.
    const speakerCount = pickSpeakerCount(input);
    rationale.push(`${speakerCount} speaker(s) for the requested conversation style.`);

    // Visuals help when the learner prefers them OR the material is dense.
    const visualsRecommended =
      learner.preferredModalities.includes('visual') ||
      intelligence.estimatedCognitiveLoad > 0.65;
    if (visualsRecommended) {
      rationale.push(
        learner.preferredModalities.includes('visual')
          ? 'Visuals recommended: learner prefers visual modality.'
          : `Visuals recommended: high cognitive load (${intelligence.estimatedCognitiveLoad}).`
      );
    }

    // Pacing: dense material and slower learners get more room.
    const pacing = pickPacing(input);
    rationale.push(`Pacing '${pacing}' from cognitive load and attention span.`);

    return {
      strategy: MediaStrategySchema.parse({
        primaryFormat: 'podcast',
        targetDurationMinutes: input.targetMinutes,
        suggestedNarrativeStyle: narrative,
        suggestedSpeakerCount: speakerCount,
        visualsRecommended,
        pacing,
      }),
      rationale,
    };
  }

  // ── Assessment ──────────────────────────────────────────────────────────

  decideAssessment(input: DecisionInput): Decision<AssessmentStrategy> {
    const { learner, intelligence, targetMinutes } = input;
    const rationale: string[] = [];

    // Roughly one checkpoint per 5 minutes, capped so an episode isn't a quiz.
    const count = Math.max(0, Math.min(6, Math.floor(targetMinutes / 5)));

    // Evenly distributed, deliberately avoiding 0 and 1 (nobody wants a test
    // before the content or after the sign-off).
    const positions: number[] = [];
    for (let i = 1; i <= count; i++) {
      positions.push(round2(i / (count + 1)));
    }
    if (count > 0) {
      rationale.push(`${count} comprehension checkpoint(s) evenly spaced through the episode.`);
    } else {
      rationale.push('Episode too short for mid-roll checkpoints; post-episode quiz only.');
    }

    // Question types escalate with the target Bloom level.
    const questionTypes = questionTypesFor(intelligence.targetBloomLevel);
    rationale.push(
      `Question types [${questionTypes.join(', ')}] match Bloom level '${intelligence.targetBloomLevel}'.`
    );

    // A learner with weak areas benefits more from recall practice.
    const enabled = count > 0 || learner.weakTopics.length > 0;

    return {
      strategy: AssessmentStrategySchema.parse({
        enabled,
        checkpointPositions: positions,
        questionTypes,
        targetQuestionCount: count,
        // Ties into the existing podcastAssets quiz generation, which already runs.
        generatePostQuiz: true,
      }),
      rationale,
    };
  }

  // ── Accessibility ───────────────────────────────────────────────────────

  decideAccessibility(input: DecisionInput): Decision<AccessibilityStrategy> {
    const { learner, intelligence } = input;
    const rationale: string[] = [];

    // Dense material and beginner learners get a slower ceiling.
    const dense = intelligence.estimatedCognitiveLoad > 0.7;
    const beginner = learner.difficultyBand === 'beginner';
    const maxRate = dense || beginner ? 0.95 : 1;
    if (maxRate < 1) {
      rationale.push(
        `Speaking rate capped at ${maxRate} (${dense ? 'dense material' : 'beginner level'}).`
      );
    }

    // Extra breathing room after dense content.
    const extendedPause = dense ? 600 : beginner ? 400 : 0;
    if (extendedPause > 0) {
      rationale.push(`Adding ${extendedPause}ms comprehension pauses after dense passages.`);
    }

    // Quieter beds when comprehension is genuinely the bottleneck.
    //
    // Deliberately keyed on cognitive load ALONE, not on `beginner`. Beginner is
    // the most common learner band, so `dense || beginner` meant the majority of
    // episodes requested reduced background — and because the ambience and SFX
    // planners treated that request as "emit nothing", most podcasts silently
    // lost two of their three cinematic layers. Difficulty is about pacing and
    // vocabulary; it is not a reason to strip atmosphere. Those planners now
    // attenuate rather than eliminate, so this flag is safe either way.
    const reduceBackground = dense;
    if (reduceBackground) {
      rationale.push(
        'Reducing background audio levels so narration stays dominant (dense material).'
      );
    }

    // Startle effects are inappropriate for a study context.
    const avoidStartle = true;
    rationale.push('Startle-inducing effects disabled for a study context.');

    return {
      strategy: AccessibilityStrategySchema.parse({
        maxSpeakingRate: maxRate,
        requireTranscript: true,
        requireSubtitles: false,
        reduceBackgroundAudio: reduceBackground,
        extendedPauseMs: extendedPause,
        avoidStartleEffects: avoidStartle,
        simplifiedLanguage: beginner,
      }),
      rationale,
    };
  }

  // ── Interaction (Phase K — designed, disabled) ───────────────────────────

  decideInteraction(input: DecisionInput): Decision<InteractionStrategy> {
    const rationale: string[] = [
      'Interactive branching is designed but disabled in v1 (Phase K, backend only).',
    ];

    // Branch points mirror assessment checkpoints so a future interactive mode
    // has somewhere sensible to pause — computed now, unused now.
    const count = Math.max(0, Math.min(6, Math.floor(input.targetMinutes / 5)));
    const branchPoints: number[] = [];
    for (let i = 1; i <= count; i++) branchPoints.push(round2(i / (count + 1)));

    return {
      strategy: InteractionStrategySchema.parse({
        interactive: false,
        allowQuestions: false,
        allowBranching: false,
        branchPoints,
        hintsAvailable: false,
        retryAllowed: false,
      }),
      rationale,
    };
  }
}

// ---------------------------------------------------------------------------
// Pure decision helpers (exported for direct unit testing)
// ---------------------------------------------------------------------------

export function pickApproach(input: DecisionInput): PedagogicalApproach {
  const type = (input.podcastType || '').toLowerCase();
  const bloom = input.intelligence.targetBloomLevel;
  const band = input.learner.difficultyBand;

  // Explicit revision intent dominates everything else.
  if (type === 'revision' || type === 'exam_revision' || type === 'quiz_review') {
    return 'spaced_recall';
  }
  if (type === 'weak_topic') return 'worked_example';
  if (type === 'doubt') return 'socratic';

  // Beginners need concrete grounding before abstraction.
  if (band === 'beginner') return 'analogy_first';

  // Higher Bloom levels need reasoning-oriented approaches.
  if (bloom === 'analyze' || bloom === 'evaluate') return 'compare_contrast';
  if (bloom === 'create') return 'problem_based';
  if (bloom === 'apply') return 'worked_example';

  return 'direct_instruction';
}

function describeApproachReason(input: DecisionInput): string {
  const type = (input.podcastType || '').toLowerCase();
  if (type === 'revision' || type === 'exam_revision') return 'an exam-revision request';
  if (input.learner.difficultyBand === 'beginner') return 'a beginner-level learner';
  return `Bloom level '${input.intelligence.targetBloomLevel}'`;
}

export function pickNarrativeStyle(
  input: DecisionInput
): MediaStrategy['suggestedNarrativeStyle'] {
  const type = (input.podcastType || '').toLowerCase();
  if (type === 'current_affairs') return 'chronological';
  if (type === 'doubt') return 'question_driven';
  if (type === 'revision' || type === 'exam_revision') return 'problem_solution';

  const bloom = input.intelligence.targetBloomLevel;
  if (bloom === 'analyze' || bloom === 'evaluate') return 'compare_contrast';

  // Multi-concept topics benefit from an arc; single concepts stay linear.
  return input.intelligence.concepts.length >= 5 ? 'story_arc' : 'linear';
}

export function pickSpeakerCount(input: DecisionInput): number {
  const requested = (input.speakerStyle || '').toLowerCase();

  // A production format id knows its own cast size — defer to the registry so
  // this never drifts from podcastStyles.ts. Without this, 'storytelling' and
  // 'solo_narration' hit the default below and were given two voices.
  if (isPodcastStyleId(requested)) {
    return PODCAST_STYLES[requested].speakerCount;
  }

  switch (requested) {
    case 'solo_narrator':
      return 1;
    case 'discussion':
    case 'debate':
      return 3;
    case 'interview':
    case 'mentor':
    case 'teacher_student':
      return 2;
    default:
      return 2;
  }
}

export function pickPacing(input: DecisionInput): MediaStrategy['pacing'] {
  const load = input.intelligence.estimatedCognitiveLoad;
  const span = input.learner.attentionSpanMinutes ?? 12;

  if (load > 0.7 || input.learner.difficultyBand === 'beginner') return 'slow';
  if (load < 0.4 && span >= 18) return 'brisk';
  return 'measured';
}

export function questionTypesFor(
  bloom: BloomLevel
): AssessmentStrategy['questionTypes'] {
  switch (bloom) {
    case 'remember':
      return ['recall'];
    case 'understand':
      return ['recall', 'application'];
    case 'apply':
      return ['application'];
    case 'analyze':
      return ['application', 'analysis'];
    case 'evaluate':
      return ['analysis', 'reflection'];
    case 'create':
      return ['analysis', 'reflection'];
    default:
      return ['recall'];
  }
}

/**
 * Objectives come from concept labels in teaching order, so they are guaranteed
 * consistent with what will actually be taught. Falls back to the topic when
 * concept extraction degraded.
 */
export function buildObjectives(intelligence: LearningIntelligence): string[] {
  const byId = new Map(intelligence.concepts.map((c) => [c.id, c]));
  const ordered = intelligence.teachingSequence
    .map((id) => byId.get(id))
    .filter((c): c is NonNullable<typeof c> => !!c);

  const source = ordered.length ? ordered : intelligence.concepts;
  const objectives = source.slice(0, 6).map((c) => `Understand ${c.label}`);

  return objectives.length
    ? objectives
    : [`Understand ${intelligence.primaryTopic}`];
}

function difficultyScaffoldBias(learner: LearnerProfile): number {
  switch (learner.difficultyBand) {
    case 'beginner':
      return 0.15;
    case 'advanced':
      return -0.1;
    case 'expert':
      return -0.2;
    default:
      return 0;
  }
}

function clamp01(n: number): number {
  return round2(Math.max(0, Math.min(1, n)));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export const producerDecisionEngine = new ProducerDecisionEngine();
