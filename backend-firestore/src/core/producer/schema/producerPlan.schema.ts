/**
 * ProducerPlan — the AI Producer's output, and the Director's input.
 *
 * ARCHITECTURAL NOTE (flagged per the "document architectural issues" rule):
 * The AI Producer layer is NOT present in any of the four approved documents
 * (Podcast Architecture Audit, Product Specification, AI Director Architecture,
 * Implementation Plan). It was introduced by the implementation authorization.
 * These types are therefore a good-faith design derived from the eight
 * capabilities the authorization lists, and should be reviewed before Phase B
 * builds against them.
 *
 * Division of concerns:
 *   AI PRODUCER  — decides WHAT should be taught and WHY (pedagogy, strategy)
 *   AI DIRECTOR  — decides HOW it should sound and look (craft, presentation)
 *
 * The Producer is upstream and format-agnostic: the same ProducerPlan should be
 * able to drive a podcast, an interactive lesson, or a video.
 */

import { z } from 'zod';
import { UnitScalarSchema } from '../../director/schema/common.schema';

// ---------------------------------------------------------------------------
// Learner profile
// ---------------------------------------------------------------------------

export const BloomLevelSchema = z.enum([
  'remember',
  'understand',
  'apply',
  'analyze',
  'evaluate',
  'create',
]);
export type BloomLevel = z.infer<typeof BloomLevelSchema>;

export const DifficultyBandSchema = z.enum([
  'beginner',
  'intermediate',
  'advanced',
  'expert',
]);
export type DifficultyBand = z.infer<typeof DifficultyBandSchema>;

export const LearningModalitySchema = z.enum([
  'auditory',
  'visual',
  'reading',
  'kinesthetic',
]);
export type LearningModality = z.infer<typeof LearningModalitySchema>;

/**
 * A snapshot of the learner at planning time. Sourced from the existing
 * StudentContextService / MasteryEngine — the Producer aggregates, it does not
 * replace those services.
 */
export const LearnerProfileSchema = z.object({
  userId: z.string().min(1),
  activeExam: z.string().optional(),
  gradeLevel: z.string().optional(),
  difficultyBand: DifficultyBandSchema.default('intermediate'),
  /** 0..1 overall mastery of the topic area. */
  masteryLevel: UnitScalarSchema.optional(),
  weakTopics: z.array(z.string()).default([]),
  strongTopics: z.array(z.string()).default([]),
  preferredModalities: z.array(LearningModalitySchema).default([]),
  /** Minutes the learner typically sustains attention. Drives pacing. */
  attentionSpanMinutes: z.number().positive().optional(),
  language: z.string().min(1),
  /** Free-text one-liner shown in the UI, mirrors PodcastPlan.personalizationSummary. */
  personalizationSummary: z.string().default(''),
});
export type LearnerProfile = z.infer<typeof LearnerProfileSchema>;

// ---------------------------------------------------------------------------
// Learning intelligence
// ---------------------------------------------------------------------------

export const ConceptNodeSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  bloomLevel: BloomLevelSchema.default('understand'),
  difficulty: DifficultyBandSchema.default('intermediate'),
  /** Concepts that must be understood first. */
  prerequisites: z.array(z.string()).default([]),
  /** 0..1 relative exam importance — drives time allocation. */
  examWeight: UnitScalarSchema.optional(),
  /** 0..1 how urgently this needs revisiting for this learner. */
  revisionPriority: UnitScalarSchema.optional(),
  /** Reference into the existing knowledge graph, when available. */
  knowledgeGraphRef: z.string().optional(),
});
export type ConceptNode = z.infer<typeof ConceptNodeSchema>;

/**
 * The Producer's understanding of the subject matter: what concepts exist, how
 * they depend on each other, and which matter most for this learner.
 */
export const LearningIntelligenceSchema = z.object({
  primaryTopic: z.string().min(1),
  concepts: z.array(ConceptNodeSchema).default([]),
  /** Ordered concept ids — a valid teaching sequence respecting prerequisites. */
  teachingSequence: z.array(z.string()).default([]),
  targetBloomLevel: BloomLevelSchema.default('understand'),
  estimatedCognitiveLoad: UnitScalarSchema.default(0.5),
  /** Misconceptions worth pre-empting in the script. */
  commonMisconceptions: z.array(z.string()).default([]),
});
export type LearningIntelligence = z.infer<typeof LearningIntelligenceSchema>;

// ---------------------------------------------------------------------------
// Strategies
// ---------------------------------------------------------------------------

export const PedagogicalApproachSchema = z.enum([
  'direct_instruction',
  'socratic',
  'analogy_first',
  'worked_example',
  'story_driven',
  'problem_based',
  'compare_contrast',
  'spaced_recall',
]);
export type PedagogicalApproach = z.infer<typeof PedagogicalApproachSchema>;

export const EducationalStrategySchema = z.object({
  approach: PedagogicalApproachSchema.default('direct_instruction'),
  learningObjectives: z.array(z.string()).min(1),
  /** Where to slow down and add a comprehension beat. */
  emphasisConcepts: z.array(z.string()).default([]),
  /** Concrete analogies the scriptwriter should use. */
  analogies: z.array(z.string()).default([]),
  /** How often to recap, in minutes. 0 = no periodic recap. */
  recapIntervalMinutes: z.number().nonnegative().default(0),
  scaffoldingLevel: UnitScalarSchema.default(0.5),
});
export type EducationalStrategy = z.infer<typeof EducationalStrategySchema>;

export const MediaStrategySchema = z.object({
  /** Primary output this plan targets. Others may reuse the same plan. */
  primaryFormat: z.enum(['podcast', 'video', 'interactive_lesson', 'short']).default('podcast'),
  targetDurationMinutes: z.number().positive(),
  /** Suggested narrative shape; the Director may refine it. */
  suggestedNarrativeStyle: z
    .enum([
      'linear',
      'problem_solution',
      'chronological',
      'question_driven',
      'story_arc',
      'compare_contrast',
    ])
    .default('linear'),
  suggestedSpeakerCount: z.number().int().min(1).max(6).default(2),
  /** Whether visual assets would materially help this topic. */
  visualsRecommended: z.boolean().default(false),
  pacing: z.enum(['slow', 'measured', 'brisk']).default('measured'),
});
export type MediaStrategy = z.infer<typeof MediaStrategySchema>;

export const AssessmentStrategySchema = z.object({
  /** Whether to generate checks for understanding at all. */
  enabled: z.boolean().default(true),
  /** Where in the episode to place checks, as 0..1 progress points. */
  checkpointPositions: z.array(UnitScalarSchema).default([]),
  questionTypes: z
    .array(z.enum(['recall', 'application', 'analysis', 'reflection']))
    .default(['recall']),
  targetQuestionCount: z.number().int().nonnegative().default(0),
  /** Ties into the existing podcastAssets quiz generation. */
  generatePostQuiz: z.boolean().default(true),
});
export type AssessmentStrategy = z.infer<typeof AssessmentStrategySchema>;

export const AccessibilityStrategySchema = z.object({
  /** Cap on speaking rate for comprehension-first delivery. */
  maxSpeakingRate: z.number().min(0.5).max(1.5).default(1),
  /** Require a transcript (already always produced — recorded for completeness). */
  requireTranscript: z.boolean().default(true),
  requireSubtitles: z.boolean().default(false),
  /** Keep background beds quieter for listeners with processing difficulties. */
  reduceBackgroundAudio: z.boolean().default(false),
  /** Extra pause after dense content, in ms. */
  extendedPauseMs: z.number().int().nonnegative().default(0),
  /** Avoid sudden loud SFX. */
  avoidStartleEffects: z.boolean().default(false),
  simplifiedLanguage: z.boolean().default(false),
});
export type AccessibilityStrategy = z.infer<typeof AccessibilityStrategySchema>;

export const InteractionStrategySchema = z.object({
  /** Phase K. Backend-only design; no frontend in v1. */
  interactive: z.boolean().default(false),
  allowQuestions: z.boolean().default(false),
  allowBranching: z.boolean().default(false),
  /** 0..1 progress points where the timeline may branch. */
  branchPoints: z.array(UnitScalarSchema).default([]),
  hintsAvailable: z.boolean().default(false),
  retryAllowed: z.boolean().default(false),
});
export type InteractionStrategy = z.infer<typeof InteractionStrategySchema>;

// ---------------------------------------------------------------------------
// ProducerPlan
// ---------------------------------------------------------------------------

export const PRODUCER_PLAN_SCHEMA_VERSION = 1 as const;

export const ProducerPlanSchema = z.object({
  id: z.string().min(1),
  podcastId: z.string().min(1),
  userId: z.string().min(1),
  schemaVersion: z.literal(PRODUCER_PLAN_SCHEMA_VERSION),
  createdAt: z.number().int().nonnegative(),

  learnerProfile: LearnerProfileSchema,
  learningIntelligence: LearningIntelligenceSchema,

  educational: EducationalStrategySchema,
  media: MediaStrategySchema,
  assessment: AssessmentStrategySchema,
  accessibility: AccessibilityStrategySchema,
  interaction: InteractionStrategySchema,

  /** Why the Producer made these choices — surfaced in the inspector. */
  rationale: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
});
export type ProducerPlan = z.infer<typeof ProducerPlanSchema>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Topologically order concepts so prerequisites always precede dependents.
 * Falls back to input order on a cycle rather than throwing — a cyclic
 * dependency graph must not fail an episode.
 */
export function resolveTeachingSequence(concepts: ConceptNode[]): string[] {
  const byId = new Map(concepts.map((c) => [c.id, c]));
  const visited = new Set<string>();
  const inProgress = new Set<string>();
  const order: string[] = [];
  let cyclic = false;

  const visit = (id: string): void => {
    if (visited.has(id)) return;
    if (inProgress.has(id)) {
      cyclic = true;
      return;
    }
    inProgress.add(id);
    for (const pre of byId.get(id)?.prerequisites ?? []) {
      if (byId.has(pre)) visit(pre);
    }
    inProgress.delete(id);
    visited.add(id);
    order.push(id);
  };

  for (const c of concepts) visit(c.id);
  return cyclic ? concepts.map((c) => c.id) : order;
}
