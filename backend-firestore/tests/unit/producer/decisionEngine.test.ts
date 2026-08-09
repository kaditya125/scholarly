/**
 * ProducerDecisionEngine tests.
 *
 * The engine is fully deterministic, so these tests need no mocks and assert
 * exact outputs. That determinism is the point: the same learner + topic must
 * always produce the same pedagogical strategy.
 */

import {
  ProducerDecisionEngine,
  buildObjectives,
  pickApproach,
  pickNarrativeStyle,
  pickPacing,
  pickSpeakerCount,
  questionTypesFor,
  type DecisionInput,
} from '../../../src/core/producer/ProducerDecisionEngine';
import {
  LearnerProfileSchema,
  LearningIntelligenceSchema,
  type LearnerProfile,
  type LearningIntelligence,
} from '../../../src/core/producer/schema/producerPlan.schema';

function learner(over: Partial<LearnerProfile> = {}): LearnerProfile {
  return LearnerProfileSchema.parse({
    userId: 'u1',
    language: 'English',
    difficultyBand: 'intermediate',
    masteryLevel: 0.5,
    weakTopics: [],
    strongTopics: [],
    preferredModalities: [],
    attentionSpanMinutes: 12,
    ...over,
  });
}

function intelligence(over: Partial<LearningIntelligence> = {}): LearningIntelligence {
  return LearningIntelligenceSchema.parse({
    primaryTopic: 'Photosynthesis',
    concepts: [
      { id: 'a', label: 'Light reactions', bloomLevel: 'understand', difficulty: 'intermediate', prerequisites: [] },
      { id: 'b', label: 'Calvin cycle', bloomLevel: 'understand', difficulty: 'advanced', prerequisites: ['a'] },
    ],
    teachingSequence: ['a', 'b'],
    targetBloomLevel: 'understand',
    estimatedCognitiveLoad: 0.5,
    commonMisconceptions: [],
    ...over,
  });
}

function input(over: Partial<DecisionInput> = {}): DecisionInput {
  return {
    learner: learner(),
    intelligence: intelligence(),
    targetMinutes: 10,
    ...over,
  };
}

const engine = new ProducerDecisionEngine();

// ---------------------------------------------------------------------------
// Educational
// ---------------------------------------------------------------------------

describe('decideEducational', () => {
  it('derives objectives from concepts in teaching order', () => {
    const { strategy } = engine.decideEducational(input());
    expect(strategy.learningObjectives).toEqual([
      'Understand Light reactions',
      'Understand Calvin cycle',
    ]);
  });

  it('always produces at least one objective (schema requires it)', () => {
    const { strategy } = engine.decideEducational(
      input({ intelligence: intelligence({ concepts: [], teachingSequence: [] }) })
    );
    expect(strategy.learningObjectives.length).toBeGreaterThan(0);
  });

  it('emphasises only high-revision-priority concepts', () => {
    const { strategy } = engine.decideEducational(
      input({
        intelligence: intelligence({
          concepts: [
            { id: 'weak', label: 'Calvin cycle', bloomLevel: 'understand', difficulty: 'advanced', prerequisites: [], revisionPriority: 0.9 },
            { id: 'ok', label: 'Light reactions', bloomLevel: 'understand', difficulty: 'beginner', prerequisites: [], revisionPriority: 0.4 },
          ],
          teachingSequence: ['ok', 'weak'],
        }),
      })
    );
    expect(strategy.emphasisConcepts).toEqual(['weak']);
  });

  it('adds recaps only when the episode outruns the attention span', () => {
    const short = engine.decideEducational(
      input({ targetMinutes: 10, learner: learner({ attentionSpanMinutes: 12 }) })
    );
    expect(short.strategy.recapIntervalMinutes).toBe(0);

    const long = engine.decideEducational(
      input({ targetMinutes: 30, learner: learner({ attentionSpanMinutes: 12 }) })
    );
    expect(long.strategy.recapIntervalMinutes).toBeGreaterThan(0);
  });

  it('scaffolds more for low mastery and less for high mastery', () => {
    const low = engine.decideEducational(input({ learner: learner({ masteryLevel: 0.1 }) }));
    const high = engine.decideEducational(input({ learner: learner({ masteryLevel: 0.9 }) }));
    expect(low.strategy.scaffoldingLevel).toBeGreaterThan(high.strategy.scaffoldingLevel);
  });

  it('always explains its reasoning', () => {
    expect(engine.decideEducational(input()).rationale.length).toBeGreaterThan(0);
  });
});

describe('pickApproach', () => {
  it('prioritises explicit revision intent over everything else', () => {
    // Even a beginner (who would otherwise get analogy_first) gets spaced recall.
    expect(
      pickApproach(input({ podcastType: 'revision', learner: learner({ difficultyBand: 'beginner' }) }))
    ).toBe('spaced_recall');
    expect(pickApproach(input({ podcastType: 'exam_revision' }))).toBe('spaced_recall');
  });

  it('uses socratic questioning for doubt-clearing', () => {
    expect(pickApproach(input({ podcastType: 'doubt' }))).toBe('socratic');
  });

  it('grounds beginners in analogies before abstraction', () => {
    expect(pickApproach(input({ learner: learner({ difficultyBand: 'beginner' }) }))).toBe(
      'analogy_first'
    );
  });

  it('escalates approach with Bloom level', () => {
    expect(
      pickApproach(input({ intelligence: intelligence({ targetBloomLevel: 'analyze' }) }))
    ).toBe('compare_contrast');
    expect(
      pickApproach(input({ intelligence: intelligence({ targetBloomLevel: 'create' }) }))
    ).toBe('problem_based');
    expect(
      pickApproach(input({ intelligence: intelligence({ targetBloomLevel: 'apply' }) }))
    ).toBe('worked_example');
  });

  it('defaults to direct instruction', () => {
    expect(pickApproach(input())).toBe('direct_instruction');
  });
});

// ---------------------------------------------------------------------------
// Media
// ---------------------------------------------------------------------------

describe('decideMedia', () => {
  it('honours the requested speaker style', () => {
    expect(pickSpeakerCount(input({ speakerStyle: 'solo_narrator' }))).toBe(1);
    expect(pickSpeakerCount(input({ speakerStyle: 'discussion' }))).toBe(3);
    expect(pickSpeakerCount(input({ speakerStyle: 'teacher_student' }))).toBe(2);
    expect(pickSpeakerCount(input({}))).toBe(2);
  });

  it('recommends visuals when the learner prefers them', () => {
    const { strategy } = engine.decideMedia(
      input({ learner: learner({ preferredModalities: ['visual'] }) })
    );
    expect(strategy.visualsRecommended).toBe(true);
  });

  it('recommends visuals for dense material even without a visual preference', () => {
    const { strategy } = engine.decideMedia(
      input({ intelligence: intelligence({ estimatedCognitiveLoad: 0.9 }) })
    );
    expect(strategy.visualsRecommended).toBe(true);
  });

  it('does not recommend visuals for light auditory-friendly material', () => {
    const { strategy } = engine.decideMedia(
      input({
        intelligence: intelligence({ estimatedCognitiveLoad: 0.3 }),
        learner: learner({ preferredModalities: ['auditory'] }),
      })
    );
    expect(strategy.visualsRecommended).toBe(false);
  });

  it('slows pacing for dense material and beginners', () => {
    expect(pickPacing(input({ intelligence: intelligence({ estimatedCognitiveLoad: 0.9 }) }))).toBe('slow');
    expect(pickPacing(input({ learner: learner({ difficultyBand: 'beginner' }) }))).toBe('slow');
  });

  it('allows brisk pacing for light material and long attention spans', () => {
    expect(
      pickPacing(
        input({
          intelligence: intelligence({ estimatedCognitiveLoad: 0.2 }),
          learner: learner({ attentionSpanMinutes: 20 }),
        })
      )
    ).toBe('brisk');
  });

  it('picks a narrative style from type and concept count', () => {
    expect(pickNarrativeStyle(input({ podcastType: 'doubt' }))).toBe('question_driven');
    expect(pickNarrativeStyle(input({ podcastType: 'current_affairs' }))).toBe('chronological');
    expect(pickNarrativeStyle(input())).toBe('linear'); // 2 concepts
    const many = intelligence({
      concepts: Array.from({ length: 6 }, (_, i) => ({
        id: `c${i}`, label: `C${i}`, bloomLevel: 'understand' as const, difficulty: 'intermediate' as const, prerequisites: [],
      })),
      teachingSequence: ['c0', 'c1', 'c2', 'c3', 'c4', 'c5'],
    });
    expect(pickNarrativeStyle(input({ intelligence: many }))).toBe('story_arc');
  });

  it('carries the target duration through unchanged', () => {
    expect(engine.decideMedia(input({ targetMinutes: 30 })).strategy.targetDurationMinutes).toBe(30);
  });
});

// ---------------------------------------------------------------------------
// Assessment
// ---------------------------------------------------------------------------

describe('decideAssessment', () => {
  it('spaces checkpoints evenly, never at 0 or 1', () => {
    const { strategy } = engine.decideAssessment(input({ targetMinutes: 20 }));
    expect(strategy.checkpointPositions.length).toBe(4);
    for (const p of strategy.checkpointPositions) {
      expect(p).toBeGreaterThan(0);
      expect(p).toBeLessThan(1);
    }
    // strictly ascending
    for (let i = 1; i < strategy.checkpointPositions.length; i++) {
      expect(strategy.checkpointPositions[i]).toBeGreaterThan(
        strategy.checkpointPositions[i - 1]
      );
    }
  });

  it('gives the shortest supported episode a single midpoint check', () => {
    // 5min is the shortest DURATION_CHOICES value: floor(5/5) = 1 checkpoint.
    const { strategy } = engine.decideAssessment(input({ targetMinutes: 5 }));
    expect(strategy.checkpointPositions).toEqual([0.5]);
    expect(strategy.targetQuestionCount).toBe(1);
  });

  it('emits no mid-roll checkpoints below the 5-minute threshold', () => {
    // Defensive: not reachable via DURATION_CHOICES, but the branch must hold.
    const { strategy } = engine.decideAssessment(input({ targetMinutes: 3 }));
    expect(strategy.checkpointPositions).toEqual([]);
    expect(strategy.targetQuestionCount).toBe(0);
    expect(strategy.generatePostQuiz).toBe(true);
  });

  it('caps checkpoints so a long episode is not a quiz', () => {
    const { strategy } = engine.decideAssessment(input({ targetMinutes: 60 }));
    expect(strategy.targetQuestionCount).toBeLessThanOrEqual(6);
  });

  it('escalates question types with Bloom level', () => {
    expect(questionTypesFor('remember')).toEqual(['recall']);
    expect(questionTypesFor('apply')).toEqual(['application']);
    expect(questionTypesFor('analyze')).toEqual(['application', 'analysis']);
    expect(questionTypesFor('evaluate')).toEqual(['analysis', 'reflection']);
  });

  it('always keeps the existing post-episode quiz enabled', () => {
    expect(engine.decideAssessment(input()).strategy.generatePostQuiz).toBe(true);
  });

  it('stays enabled for a short episode when the learner has weak topics', () => {
    const { strategy } = engine.decideAssessment(
      input({ targetMinutes: 5, learner: learner({ weakTopics: ['Calvin cycle'] }) })
    );
    expect(strategy.enabled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Accessibility
// ---------------------------------------------------------------------------

describe('decideAccessibility', () => {
  it('caps speaking rate for dense material', () => {
    const { strategy } = engine.decideAccessibility(
      input({ intelligence: intelligence({ estimatedCognitiveLoad: 0.85 }) })
    );
    expect(strategy.maxSpeakingRate).toBeLessThan(1);
    expect(strategy.extendedPauseMs).toBeGreaterThan(0);
    expect(strategy.reduceBackgroundAudio).toBe(true);
  });

  it('simplifies language only for beginners', () => {
    expect(
      engine.decideAccessibility(input({ learner: learner({ difficultyBand: 'beginner' }) }))
        .strategy.simplifiedLanguage
    ).toBe(true);
    expect(engine.decideAccessibility(input()).strategy.simplifiedLanguage).toBe(false);
  });

  it('always disables startle effects for a study context', () => {
    expect(engine.decideAccessibility(input()).strategy.avoidStartleEffects).toBe(true);
  });

  it('always requires a transcript', () => {
    expect(engine.decideAccessibility(input()).strategy.requireTranscript).toBe(true);
  });

  it('leaves normal material at full rate with no extra pauses', () => {
    const { strategy } = engine.decideAccessibility(input());
    expect(strategy.maxSpeakingRate).toBe(1);
    expect(strategy.extendedPauseMs).toBe(0);
    expect(strategy.reduceBackgroundAudio).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Interaction
// ---------------------------------------------------------------------------

describe('decideInteraction', () => {
  it('is disabled in v1 but pre-computes branch points for Phase K', () => {
    const { strategy } = engine.decideInteraction(input({ targetMinutes: 20 }));
    expect(strategy.interactive).toBe(false);
    expect(strategy.allowBranching).toBe(false);
    expect(strategy.branchPoints.length).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

describe('determinism', () => {
  it('produces byte-identical strategies for identical input', () => {
    const a = engine.decideEducational(input());
    const b = engine.decideEducational(input());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('buildObjectives', () => {
  it('respects teaching sequence order over concept array order', () => {
    const objectives = buildObjectives(
      intelligence({
        concepts: [
          { id: 'b', label: 'Second', bloomLevel: 'understand', difficulty: 'intermediate', prerequisites: ['a'] },
          { id: 'a', label: 'First', bloomLevel: 'understand', difficulty: 'beginner', prerequisites: [] },
        ],
        teachingSequence: ['a', 'b'],
      })
    );
    expect(objectives).toEqual(['Understand First', 'Understand Second']);
  });

  it('caps at six objectives', () => {
    const many = intelligence({
      concepts: Array.from({ length: 10 }, (_, i) => ({
        id: `c${i}`, label: `C${i}`, bloomLevel: 'understand' as const, difficulty: 'intermediate' as const, prerequisites: [],
      })),
      teachingSequence: Array.from({ length: 10 }, (_, i) => `c${i}`),
    });
    expect(buildObjectives(many)).toHaveLength(6);
  });

  it('falls back to the primary topic when no concepts exist', () => {
    expect(buildObjectives(intelligence({ concepts: [], teachingSequence: [] }))).toEqual([
      'Understand Photosynthesis',
    ]);
  });
});
