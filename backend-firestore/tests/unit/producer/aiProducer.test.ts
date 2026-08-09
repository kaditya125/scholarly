/**
 * AIProducer orchestration + LearnerProfileBuilder mapping tests.
 *
 * The critical property under test: the Producer NEVER THROWS. A learner with no
 * data, an LLM outage, and a malformed brief must all still yield a schema-valid
 * ProducerPlan — because a Producer failure must never fail a podcast.
 */

import { AIProducer } from '../../../src/core/producer/AIProducer';
import { ProducerDecisionEngine } from '../../../src/core/producer/ProducerDecisionEngine';
import {
  LearnerProfileBuilder,
  estimateAttentionSpan,
  mapDifficultyBand,
  mapModalities,
  normalizePercentage,
} from '../../../src/core/producer/LearnerProfileBuilder';
import {
  LearningIntelligenceExtractor,
  conceptBudgetFor,
  estimateCognitiveLoad,
  revisionPriorityFor,
} from '../../../src/core/producer/LearningIntelligenceExtractor';
import {
  ProducerPlanSchema,
  PRODUCER_PLAN_SCHEMA_VERSION,
  type LearnerProfile,
  type LearningIntelligence,
} from '../../../src/core/producer/schema/producerPlan.schema';

// ---------------------------------------------------------------------------
// Test doubles — the Producer takes its collaborators via constructor injection
// ---------------------------------------------------------------------------

const PROFILE: LearnerProfile = {
  userId: 'u1',
  language: 'English',
  difficultyBand: 'intermediate',
  masteryLevel: 0.5,
  weakTopics: ['Calvin cycle'],
  strongTopics: [],
  preferredModalities: [],
  attentionSpanMinutes: 12,
  personalizationSummary: 'Tailored for NEET at intermediate level.',
};

const INTEL: LearningIntelligence = {
  primaryTopic: 'Photosynthesis',
  concepts: [
    { id: 'a', label: 'Light reactions', bloomLevel: 'understand', difficulty: 'intermediate', prerequisites: [], revisionPriority: 0.4 },
    { id: 'b', label: 'Calvin cycle', bloomLevel: 'understand', difficulty: 'advanced', prerequisites: ['a'], revisionPriority: 0.9 },
  ],
  teachingSequence: ['a', 'b'],
  targetBloomLevel: 'understand',
  estimatedCognitiveLoad: 0.55,
  commonMisconceptions: ['Plants only respire at night'],
};

function fakeProfiles(profile: LearnerProfile = PROFILE): LearnerProfileBuilder {
  return { build: jest.fn().mockResolvedValue(profile) } as unknown as LearnerProfileBuilder;
}

function fakeIntel(intel: LearningIntelligence = INTEL): LearningIntelligenceExtractor {
  return {
    name: 'fake',
    plan: jest.fn().mockResolvedValue(intel),
    fallback: jest.fn().mockReturnValue(intel),
  } as unknown as LearningIntelligenceExtractor;
}

const BRIEF = {
  topic: 'Photosynthesis',
  titleSeed: 'Photosynthesis',
  baseText: 'Photosynthesis converts light energy into chemical energy.',
  notebookId: 'nb1',
  focusTopics: ['Calvin cycle'],
};

const REQUEST = {
  type: 'chapter',
  durationMinutes: 10,
  speakerStyle: 'teacher_student',
  language: 'English',
};

function makeProducer(over?: {
  profiles?: LearnerProfileBuilder;
  intel?: LearningIntelligenceExtractor;
}): AIProducer {
  return new AIProducer(
    over?.profiles ?? fakeProfiles(),
    over?.intel ?? fakeIntel(),
    new ProducerDecisionEngine()
  );
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

describe('AIProducer.produce', () => {
  it('produces a schema-valid ProducerPlan', async () => {
    const plan = await makeProducer().produce({
      podcastId: 'pod_1',
      userId: 'u1',
      brief: BRIEF,
      request: REQUEST,
    });

    expect(ProducerPlanSchema.safeParse(plan).success).toBe(true);
    expect(plan.schemaVersion).toBe(PRODUCER_PLAN_SCHEMA_VERSION);
    expect(plan.podcastId).toBe('pod_1');
    expect(plan.id.startsWith('pp_')).toBe(true);
  });

  it('includes all five strategies', async () => {
    const plan = await makeProducer().produce({
      podcastId: 'pod_1',
      userId: 'u1',
      brief: BRIEF,
      request: REQUEST,
    });

    expect(plan.educational).toBeDefined();
    expect(plan.media).toBeDefined();
    expect(plan.assessment).toBeDefined();
    expect(plan.accessibility).toBeDefined();
    expect(plan.interaction).toBeDefined();
  });

  it('records rationale so decisions are inspectable', async () => {
    const plan = await makeProducer().produce({
      podcastId: 'pod_1',
      userId: 'u1',
      brief: BRIEF,
      request: REQUEST,
    });
    expect(plan.rationale.length).toBeGreaterThan(3);
  });

  it('carries the requested duration into the media strategy', async () => {
    const plan = await makeProducer().produce({
      podcastId: 'pod_1',
      userId: 'u1',
      brief: BRIEF,
      request: { ...REQUEST, durationMinutes: 30 },
    });
    expect(plan.media.targetDurationMinutes).toBe(30);
  });

  it('clamps an unsupported duration to the pipeline default', async () => {
    const plan = await makeProducer().produce({
      podcastId: 'pod_1',
      userId: 'u1',
      brief: BRIEF,
      request: { ...REQUEST, durationMinutes: 7 },
    });
    expect(plan.media.targetDurationMinutes).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// The critical resilience property
// ---------------------------------------------------------------------------

describe('AIProducer resilience — never throws', () => {
  it('survives a learner-profile failure and records a warning', async () => {
    const failing = {
      build: jest.fn().mockRejectedValue(new Error('firestore down')),
    } as unknown as LearnerProfileBuilder;

    const plan = await makeProducer({ profiles: failing }).produce({
      podcastId: 'pod_1',
      userId: 'u1',
      brief: BRIEF,
      request: REQUEST,
    });

    expect(ProducerPlanSchema.safeParse(plan).success).toBe(true);
    expect(plan.warnings.some((w) => /profile unavailable/i.test(w))).toBe(true);
    expect(plan.learnerProfile.difficultyBand).toBe('intermediate');
  });

  it('survives a degraded single-concept intelligence result', async () => {
    const degraded: LearningIntelligence = {
      primaryTopic: 'Photosynthesis',
      concepts: [
        { id: 'main_topic', label: 'Photosynthesis', bloomLevel: 'understand', difficulty: 'intermediate', prerequisites: [] },
      ],
      teachingSequence: ['main_topic'],
      targetBloomLevel: 'understand',
      estimatedCognitiveLoad: 0.5,
      commonMisconceptions: [],
    };

    const plan = await makeProducer({ intel: fakeIntel(degraded) }).produce({
      podcastId: 'pod_1',
      userId: 'u1',
      brief: BRIEF,
      request: REQUEST,
    });

    expect(ProducerPlanSchema.safeParse(plan).success).toBe(true);
    expect(plan.warnings.some((w) => /single concept/i.test(w))).toBe(true);
  });

  it('handles a completely empty brief and request', async () => {
    const plan = await makeProducer().produce({
      podcastId: 'pod_1',
      userId: 'u1',
      brief: {},
      request: {},
    });
    expect(ProducerPlanSchema.safeParse(plan).success).toBe(true);
    expect(plan.media.targetDurationMinutes).toBe(10);
  });

  it('handles null brief and request without throwing', async () => {
    const plan = await makeProducer().produce({
      podcastId: 'pod_1',
      userId: 'u1',
      brief: null,
      request: null,
    });
    expect(ProducerPlanSchema.safeParse(plan).success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// LearnerProfileBuilder pure mappers
// ---------------------------------------------------------------------------

describe('LearnerProfileBuilder mappers', () => {
  it('maps capitalised stats levels and lowercase comprehension depth', () => {
    expect(mapDifficultyBand('Beginner')).toBe('beginner');
    expect(mapDifficultyBand('Advanced')).toBe('advanced');
    expect(mapDifficultyBand(undefined, 'beginner')).toBe('beginner');
    expect(mapDifficultyBand(undefined, undefined)).toBe('intermediate');
  });

  it('applies precedence: stats > preparationLevel > comprehensionDepth', () => {
    // active setting beats both weaker signals
    expect(mapDifficultyBand('Advanced', 'beginner', 'intermediate')).toBe('advanced');
    // onboarding answer beats behavioural inference
    expect(mapDifficultyBand(undefined, 'beginner', 'advanced')).toBe('advanced');
    // behavioural inference is the last resort
    expect(mapDifficultyBand(undefined, 'beginner', undefined)).toBe('beginner');
  });

  it('maps only recognised free-form modality strings', () => {
    expect(mapModalities(['podcast', 'diagrams'])).toEqual(
      expect.arrayContaining(['auditory', 'visual'])
    );
    expect(mapModalities(['reading notes'])).toEqual(['reading']);
    expect(mapModalities(['telepathy'])).toEqual([]);
    expect(mapModalities([])).toEqual([]);
    expect(mapModalities(undefined)).toEqual([]);
  });

  it('deduplicates modalities', () => {
    expect(mapModalities(['audio', 'listening', 'voice'])).toEqual(['auditory']);
  });

  it('estimates attention span from learning speed', () => {
    expect(estimateAttentionSpan('slow')).toBeLessThan(estimateAttentionSpan('medium'));
    expect(estimateAttentionSpan('medium')).toBeLessThan(estimateAttentionSpan('fast'));
    expect(estimateAttentionSpan(undefined)).toBe(12);
  });

  it('normalizes 0..100 mastery percentages to 0..1', () => {
    expect(normalizePercentage(75)).toBe(0.75);
    expect(normalizePercentage(0.75)).toBe(0.75);
    expect(normalizePercentage(150)).toBe(1);
    expect(normalizePercentage(undefined)).toBeUndefined();
    expect(normalizePercentage(NaN)).toBeUndefined();
  });

  it('provides a usable static fallback profile', () => {
    const p = LearnerProfileBuilder.fallback('u9', 'Hindi');
    expect(p.userId).toBe('u9');
    expect(p.language).toBe('Hindi');
    expect(p.difficultyBand).toBe('intermediate');
  });
});

// ---------------------------------------------------------------------------
// LearningIntelligenceExtractor pure helpers
// ---------------------------------------------------------------------------

describe('LearningIntelligenceExtractor helpers', () => {
  it('scales the concept budget with duration, within bounds', () => {
    expect(conceptBudgetFor(5)).toBe(2);
    expect(conceptBudgetFor(10)).toBe(4);
    expect(conceptBudgetFor(30)).toBe(12);
    expect(conceptBudgetFor(60)).toBe(14); // capped
    expect(conceptBudgetFor(1)).toBe(2); // floored
  });

  it('raises revision priority for concepts matching weak topics', () => {
    const weak = new Set(['calvin cycle']);
    expect(revisionPriorityFor('The Calvin Cycle explained', weak)).toBe(0.9);
    expect(revisionPriorityFor('Light reactions', weak)).toBe(0.4);
  });

  it('matches weak topics in either direction', () => {
    expect(revisionPriorityFor('Cycle', new Set(['calvin cycle']))).toBe(0.9);
  });

  it('raises cognitive load with difficulty and density', () => {
    const easy = estimateCognitiveLoad(
      [{ id: 'a', label: 'A', bloomLevel: 'remember', difficulty: 'beginner', prerequisites: [] }],
      20
    );
    const hard = estimateCognitiveLoad(
      Array.from({ length: 12 }, (_, i) => ({
        id: `c${i}`, label: `C${i}`, bloomLevel: 'analyze' as const, difficulty: 'expert' as const, prerequisites: [],
      })),
      10
    );
    expect(hard).toBeGreaterThan(easy);
    expect(hard).toBeLessThanOrEqual(1);
    expect(easy).toBeGreaterThanOrEqual(0);
  });

  it('returns a safe default for an empty concept list', () => {
    expect(estimateCognitiveLoad([], 10)).toBe(0.3);
  });

  it('fallback yields a schema-valid single-concept model', () => {
    const extractor = new LearningIntelligenceExtractor();
    const out = extractor.fallback({
      userId: 'u1',
      topic: 'Osmosis',
      sourceText: '',
      learner: PROFILE,
      targetMinutes: 10,
    });
    expect(out.concepts).toHaveLength(1);
    expect(out.primaryTopic).toBe('Osmosis');
    expect(out.teachingSequence).toEqual(['main_topic']);
  });
});
