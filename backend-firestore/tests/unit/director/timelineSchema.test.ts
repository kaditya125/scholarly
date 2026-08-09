/**
 * MasterTimeline / Character / ProducerPlan schema tests.
 *
 * These assert the SHAPE layer only (Zod). Semantic invariants are covered by
 * timelineValidation.test.ts.
 */

import {
  MasterTimelineSchema,
  TIMELINE_SCHEMA_VERSION,
  allEvents,
  eventCount,
  sceneForLine,
} from '../../../src/core/director/schema/timeline.schema';
import {
  ALL_EMOTIONS,
  EmotionSchema,
  SpatialSpecSchema,
  TrackKindSchema,
} from '../../../src/core/director/schema/common.schema';
import {
  DEFAULT_MASTERING,
  MasteringSpecSchema,
} from '../../../src/core/director/schema/audio.schema';
import {
  CharacterSchema,
  buildCharacterId,
  findCharacter,
} from '../../../src/core/director/schema/character.schema';
import { ALL_LOCATIONS } from '../../../src/core/director/schema/scene.schema';
import {
  ProducerPlanSchema,
  PRODUCER_PLAN_SCHEMA_VERSION,
  resolveTeachingSequence,
} from '../../../src/core/producer/schema/producerPlan.schema';
import { makeCharacter, makeTimeline } from './fixtures';

describe('MasterTimeline schema', () => {
  it('accepts a minimal valid timeline', () => {
    const timeline = makeTimeline();
    expect(MasterTimelineSchema.safeParse(timeline).success).toBe(true);
    expect(timeline.schemaVersion).toBe(TIMELINE_SCHEMA_VERSION);
  });

  it('rejects an unknown schemaVersion so v1 documents cannot be misread', () => {
    const bad = { ...makeTimeline(), schemaVersion: 1 };
    expect(MasterTimelineSchema.safeParse(bad).success).toBe(false);
  });

  it('requires at least one scene', () => {
    const bad = { ...makeTimeline(), scenes: [] };
    expect(MasterTimelineSchema.safeParse(bad).success).toBe(false);
  });

  it('requires at least one emotion keyframe', () => {
    const t = makeTimeline();
    const bad = { ...t, emotionCurve: { ...t.emotionCurve, keyframes: [] } };
    expect(MasterTimelineSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects negative event start times', () => {
    const t = makeTimeline();
    t.tracks.voice.events[0].startMs = -1;
    expect(MasterTimelineSchema.safeParse(t).success).toBe(false);
  });

  it('defaults degradedAssets and warnings to empty arrays', () => {
    const t = makeTimeline();
    const { degradedAssets, warnings, ...withoutDefaults } = t;
    const parsed = MasterTimelineSchema.parse(withoutDefaults);
    expect(parsed.degradedAssets).toEqual([]);
    expect(parsed.warnings).toEqual([]);
  });

  it('preserves the visual track so future renderers have data', () => {
    const t = makeTimeline();
    expect(t.tracks.visual).toBeDefined();
    expect(Array.isArray(t.tracks.visual.events)).toBe(true);
  });
});

describe('timeline helpers', () => {
  it('counts events across every track', () => {
    // fixture: 2 voice + 1 music
    expect(eventCount(makeTimeline())).toBe(3);
  });

  it('flattens and sorts all events by start time', () => {
    const events = allEvents(makeTimeline());
    expect(events).toHaveLength(3);
    for (let i = 1; i < events.length; i++) {
      expect(events[i].startMs).toBeGreaterThanOrEqual(events[i - 1].startMs);
    }
  });

  it('resolves the scene covering a line, and null outside any range', () => {
    const t = makeTimeline();
    expect(sceneForLine(t, 0)?.id).toBe('scene_0');
    expect(sceneForLine(t, 1)?.id).toBe('scene_0');
    expect(sceneForLine(t, 99)).toBeNull();
  });
});

describe('bounded numeric guards', () => {
  it('rejects a dB value outside the plausible range', () => {
    // Catches a planner emitting 0..1 amplitude where dB was expected.
    const t = makeTimeline();
    t.tracks.music.events[0].volumeDb = -500;
    expect(MasterTimelineSchema.safeParse(t).success).toBe(false);
  });

  it('rejects a pan outside -1..1', () => {
    expect(SpatialSpecSchema.safeParse({ pan: 2, distance: 0 }).success).toBe(false);
    expect(SpatialSpecSchema.safeParse({ pan: -1, distance: 1 }).success).toBe(true);
  });

  it('applies safe mastering defaults', () => {
    expect(DEFAULT_MASTERING.targetLufs).toBe(-16);
    expect(DEFAULT_MASTERING.truePeakDb).toBe(-1);
    expect(DEFAULT_MASTERING.duckingDb).toBeLessThan(0);
    expect(MasteringSpecSchema.safeParse({}).success).toBe(true);
  });
});

describe('closed vocabularies', () => {
  it('exposes every emotion at runtime for exhaustiveness checks', () => {
    expect(ALL_EMOTIONS.length).toBe(EmotionSchema.options.length);
    expect(ALL_EMOTIONS).toContain('neutral');
    expect(ALL_EMOTIONS).toContain('suspense');
  });

  it('rejects an emotion outside the closed set', () => {
    expect(EmotionSchema.safeParse('elated').success).toBe(false);
  });

  it('covers every track kind including visual', () => {
    expect(TrackKindSchema.options).toEqual(
      expect.arrayContaining(['voice', 'music', 'ambience', 'sfx', 'pause', 'visual'])
    );
  });

  it('exposes locations so the ambience map can be checked for coverage', () => {
    expect(ALL_LOCATIONS).toContain('classroom');
    expect(ALL_LOCATIONS).toContain('ancient_rome');
    expect(ALL_LOCATIONS.length).toBeGreaterThan(20);
  });
});

describe('Character schema', () => {
  it('accepts a fully-specified character', () => {
    expect(CharacterSchema.safeParse(makeCharacter()).success).toBe(true);
  });

  it('requires at least one allowed emotion', () => {
    const bad = makeCharacter({ allowedEmotions: [] });
    expect(CharacterSchema.safeParse(bad).success).toBe(false);
  });

  it('builds deterministic ids and distinguishes different roles', () => {
    const a = buildCharacterId('Priya', 'Teacher');
    const b = buildCharacterId('Priya', 'Teacher');
    const c = buildCharacterId('Priya', 'Student');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a.startsWith('char_')).toBe(true);
  });

  it('produces a usable id from non-latin names', () => {
    const id = buildCharacterId('शिक्षक', 'Teacher');
    expect(id.startsWith('char_')).toBe(true);
    expect(id.length).toBeGreaterThan(6);
  });

  it('finds a cast member by id and returns null when absent', () => {
    const t = makeTimeline();
    expect(findCharacter(t.cast, t.cast.primarySpeakerId)).not.toBeNull();
    expect(findCharacter(t.cast, 'char_missing')).toBeNull();
  });
});

describe('ProducerPlan schema', () => {
  const validPlan = {
    id: 'pp_1',
    podcastId: 'pod_1',
    userId: 'user_1',
    schemaVersion: PRODUCER_PLAN_SCHEMA_VERSION,
    createdAt: 1_700_000_000_000,
    learnerProfile: { userId: 'user_1', language: 'English' },
    learningIntelligence: { primaryTopic: 'Photosynthesis' },
    educational: { learningObjectives: ['Explain photosynthesis'] },
    media: { targetDurationMinutes: 10 },
    assessment: {},
    accessibility: {},
    interaction: {},
  };

  it('accepts a plan relying on defaults', () => {
    const parsed = ProducerPlanSchema.safeParse(validPlan);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.educational.approach).toBe('direct_instruction');
      expect(parsed.data.media.primaryFormat).toBe('podcast');
      expect(parsed.data.accessibility.maxSpeakingRate).toBe(1);
    }
  });

  it('requires at least one learning objective', () => {
    const bad = { ...validPlan, educational: { learningObjectives: [] } };
    expect(ProducerPlanSchema.safeParse(bad).success).toBe(false);
  });

  it('requires a positive target duration', () => {
    const bad = { ...validPlan, media: { targetDurationMinutes: 0 } };
    expect(ProducerPlanSchema.safeParse(bad).success).toBe(false);
  });
});

describe('resolveTeachingSequence', () => {
  it('orders prerequisites before dependents', () => {
    const seq = resolveTeachingSequence([
      { id: 'c', label: 'C', bloomLevel: 'understand', difficulty: 'intermediate', prerequisites: ['b'] },
      { id: 'b', label: 'B', bloomLevel: 'understand', difficulty: 'intermediate', prerequisites: ['a'] },
      { id: 'a', label: 'A', bloomLevel: 'remember', difficulty: 'beginner', prerequisites: [] },
    ] as any);
    expect(seq.indexOf('a')).toBeLessThan(seq.indexOf('b'));
    expect(seq.indexOf('b')).toBeLessThan(seq.indexOf('c'));
  });

  it('falls back to input order on a dependency cycle instead of throwing', () => {
    const seq = resolveTeachingSequence([
      { id: 'x', label: 'X', bloomLevel: 'understand', difficulty: 'intermediate', prerequisites: ['y'] },
      { id: 'y', label: 'Y', bloomLevel: 'understand', difficulty: 'intermediate', prerequisites: ['x'] },
    ] as any);
    expect(seq).toEqual(['x', 'y']);
  });

  it('ignores prerequisites that reference unknown concepts', () => {
    const seq = resolveTeachingSequence([
      { id: 'a', label: 'A', bloomLevel: 'remember', difficulty: 'beginner', prerequisites: ['ghost'] },
    ] as any);
    expect(seq).toEqual(['a']);
  });
});
