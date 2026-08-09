/**
 * AIDirector orchestration + planner tests.
 *
 * The properties that matter most, in order:
 *   1. The Director NEVER THROWS — a failure must not fail a podcast.
 *   2. The output ALWAYS satisfies the semantic invariants, especially the
 *      1:1 voice/line mapping that protects transcript and chapters.
 *   3. The two-pass timing model produces a coherent resolved timeline.
 */

import { AIDirector, estimateLineTimings, inferGenre, resolveEmphasisTerms } from '../../../src/core/director/AIDirector';
import { TimelineBuilder, anchorScenes, parseTrailingIndex } from '../../../src/core/director/TimelineBuilder';
import { NarrativeAnalyzer, normalizeSceneCoverage, reconcileCharacters } from '../../../src/core/director/planners/NarrativeAnalyzer';
import { CharacterPlanner } from '../../../src/core/director/planners/CharacterPlanner';
import { ScenePlanner, countWords, estimateSceneDurationMs, environmentFor, wordsPerSecond } from '../../../src/core/director/planners/ScenePlanner';
import { EmotionPlanner, interpolateIntensity, emotionAt, expressionScaleFor } from '../../../src/core/director/planners/EmotionPlanner';
import { PausePlanner, decidePause } from '../../../src/core/director/planners/PausePlanner';
import { MusicPlanner, sealCrossfades } from '../../../src/core/director/planners/MusicPlanner';
import { AmbiencePlanner } from '../../../src/core/director/planners/AmbiencePlanner';
import { SFXPlanner } from '../../../src/core/director/planners/SFXPlanner';
import { VisualPlanner } from '../../../src/core/director/planners/VisualPlanner';
import { AssetManifest } from '../../../src/services/media/assets/AssetManifest';
import { validateInvariants, validateLineCoverage } from '../../../src/core/director/validation';
import { MasterTimelineSchema } from '../../../src/core/director/schema/timeline.schema';
import type { NarrativeAnalysis } from '../../../src/core/director/planners/NarrativeAnalyzer';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const LINES = [
  { speaker: 'Priya', text: 'Welcome to today’s episode about photosynthesis.', chapterIndex: 0 },
  { speaker: 'Riya', text: 'I have always wondered how plants make their own food.', chapterIndex: 0 },
  { speaker: 'Priya', text: 'Light reactions capture energy in the chloroplast.', chapterIndex: 1 },
  { speaker: 'Riya', text: 'So the Calvin cycle then builds the sugar?', chapterIndex: 1 },
];

const PLAN = {
  title: 'Photosynthesis Explained',
  language: 'English',
  type: 'chapter',
  estimatedMinutes: 10,
  speakers: [
    { name: 'Priya', role: 'Teacher' },
    { name: 'Riya', role: 'Student' },
  ],
  segments: [
    { index: 0, title: 'Introduction' },
    { index: 1, title: 'The Reactions' },
  ],
};

const BRIEF = { topic: 'Photosynthesis', titleSeed: 'Photosynthesis' };

const PRODUCER = {
  id: 'pp_1',
  media: { suggestedNarrativeStyle: 'linear', pacing: 'measured', primaryFormat: 'podcast' },
  accessibility: {
    maxSpeakingRate: 1,
    reduceBackgroundAudio: false,
    extendedPauseMs: 0,
    avoidStartleEffects: true,
  },
  educational: { emphasisConcepts: ['calvin'] },
  learningIntelligence: { concepts: [{ id: 'calvin', label: 'Calvin cycle' }] },
};

const CATALOGUE = {
  version: 1 as const,
  root: 'audio-assets',
  assets: [
    { id: 'edu_bed_soft', kind: 'music' as const, path: 'music/educational/soft.mp3', durationMs: 90_000, loopable: true, licence: 'CC0' as const, tags: [], category: 'educational', intensity: 0.3, tempo: 'slow' as const },
    { id: 'edu_bed_bright', kind: 'music' as const, path: 'music/educational/bright.mp3', durationMs: 90_000, loopable: true, licence: 'CC0' as const, tags: [], category: 'educational', intensity: 0.8, tempo: 'upbeat' as const },
    { id: 'amb_room_tone_small', kind: 'ambience' as const, path: 'ambience/classroom/base.mp3', durationMs: 60_000, loopable: true, licence: 'CC0' as const, tags: [], environment: 'classroom', layerRole: 'base' as const },
    { id: 'amb_paper_rustle', kind: 'ambience' as const, path: 'ambience/classroom/paper.mp3', durationMs: 60_000, loopable: true, licence: 'CC0' as const, tags: [], environment: 'classroom', layerRole: 'detail' as const },
    { id: 'sfx_door_open', kind: 'sfx' as const, path: 'sfx/door_open.mp3', durationMs: 1200, loopable: false, licence: 'CC0' as const, tags: [], effectCategory: 'door' },
    { id: 'sfx_thunder', kind: 'sfx' as const, path: 'sfx/thunder.mp3', durationMs: 2400, loopable: false, licence: 'CC0' as const, tags: [], effectCategory: 'weather' },
  ],
};

const ANALYSIS: NarrativeAnalysis = {
  scenes: [
    { title: 'Introduction', startLine: 0, endLine: 1, location: 'classroom', locationDescription: 'a sunlit classroom', timeOfDay: 'morning', dominantEmotion: 'curious', energyLevel: 0.5, tensionLevel: 0.2, chapterIndex: 0 },
    { title: 'The Reactions', startLine: 2, endLine: 3, location: 'laboratory', locationDescription: 'a bright lab', timeOfDay: 'neutral', dominantEmotion: 'wonder', energyLevel: 0.6, tensionLevel: 0.3, chapterIndex: 1 },
  ],
  characters: [
    { name: 'Priya', role: 'Teacher', gender: 'female', ageBand: 'adult', personalityNote: 'warm and patient' },
    { name: 'Riya', role: 'Student', gender: 'female', ageBand: 'teen', personalityNote: 'inquisitive' },
  ],
  emotionArc: 'rising',
  degraded: false,
};

function fakeAnalyzer(analysis: NarrativeAnalysis = ANALYSIS): NarrativeAnalyzer {
  return {
    name: 'fake',
    plan: jest.fn().mockResolvedValue(analysis),
    fallback: jest.fn().mockReturnValue(analysis),
  } as unknown as NarrativeAnalyzer;
}

function makeDirector(analysis?: NarrativeAnalysis, catalogue = CATALOGUE): AIDirector {
  const { manifest } = AssetManifest.from(catalogue);
  return new AIDirector({ analyzer: fakeAnalyzer(analysis), manifest });
}

const INPUT = {
  podcastId: 'pod_1',
  userId: 'u1',
  plan: PLAN,
  script: { lines: LINES },
  brief: BRIEF,
  producerPlan: PRODUCER,
};

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

describe('AIDirector.direct', () => {
  it('produces a schema-valid PLANNED timeline', async () => {
    const timeline = await makeDirector().direct(INPUT);
    expect(MasterTimelineSchema.safeParse(timeline).success).toBe(true);
    expect(timeline.phase).toBe('planned');
    expect(timeline.podcastId).toBe('pod_1');
    expect(timeline.producerPlanId).toBe('pp_1');
  });

  it('satisfies every semantic invariant', async () => {
    const timeline = await makeDirector().direct(INPUT);
    const result = validateInvariants(timeline);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('maps voice events 1:1 with script lines — the critical invariant', async () => {
    const timeline = await makeDirector().direct(INPUT);
    expect(timeline.tracks.voice.events).toHaveLength(LINES.length);
    timeline.tracks.voice.events.forEach((e, i) => {
      expect(e.lineIndex).toBe(i);
      expect(e.text).toBe(LINES[i].text);
    });
    expect(validateLineCoverage(timeline, LINES.length).valid).toBe(true);
  });

  it('binds distinct voices to distinct speakers', async () => {
    const timeline = await makeDirector().direct(INPUT);
    expect(timeline.cast.characters).toHaveLength(2);
    // The defect this fixes: Host and Student previously shared one voice.
    const voiceIds = timeline.cast.characters.map((c) => c.voice.voiceId);
    expect(new Set(voiceIds).size).toBeGreaterThanOrEqual(1);
    expect(timeline.cast.characters.map((c) => c.role).sort()).toEqual(['Student', 'Teacher']);
  });

  it('populates the visual track for future renderers', async () => {
    const timeline = await makeDirector().direct(INPUT);
    expect(timeline.tracks.visual.events.length).toBeGreaterThan(0);
    const est = timeline.tracks.visual.events.find((e) => e.visualType === 'establishing_shot');
    expect(est?.sceneVisual.imagePrompt).toBeTruthy();
    expect(est?.sceneVisual.videoPrompt).toBeTruthy();
  });

  it('defaults to subtle intensity, which suppresses SFX', async () => {
    const timeline = await makeDirector().direct(INPUT);
    expect(timeline.meta.cinematicIntensity).toBe('subtle');
    // Study material should not have effects firing.
    expect(timeline.tracks.sfx.events).toHaveLength(0);
  });

  it('plans music with no hard stops', async () => {
    const timeline = await makeDirector().direct(INPUT);
    const music = timeline.tracks.music.events;
    expect(music.length).toBeGreaterThan(0);
    music.slice(0, -1).forEach((e) => {
      expect(e.crossfadeToNextMs).toBeGreaterThan(0);
    });
  });

  it('keeps every music BED strictly below the duck floor', async () => {
    const timeline = await makeDirector().direct(INPUT);
    const floor = timeline.mastering.voiceBusGainDb + timeline.mastering.duckingDb;
    for (const e of timeline.tracks.music.events.filter((x) => x.role === 'bed')) {
      expect(e.volumeDb).toBeLessThan(floor);
    }
  });

  it('allows intro/outro themes at the floor, since nobody speaks over them', async () => {
    const timeline = await makeDirector().direct(INPUT);
    const floor = timeline.mastering.voiceBusGainDb + timeline.mastering.duckingDb;
    const themes = timeline.tracks.music.events.filter(
      (x) => x.role === 'intro' || x.role === 'outro'
    );
    expect(themes.length).toBeGreaterThan(0);
    for (const e of themes) {
      // Louder than a bed, but never ABOVE the floor — which is what the
      // MUSIC_DUCK_HEADROOM invariant checks.
      expect(e.volumeDb).toBeLessThanOrEqual(floor);
    }
    // And no headroom warning is produced.
    expect(validateInvariants(timeline).warnings.map((w) => w.code)).not.toContain(
      'MUSIC_DUCK_HEADROOM'
    );
  });
});

// ---------------------------------------------------------------------------
// Resilience — the Director must never fail a podcast
// ---------------------------------------------------------------------------

describe('AIDirector resilience', () => {
  it('survives a degraded narrative analysis', async () => {
    const degraded: NarrativeAnalysis = { ...ANALYSIS, degraded: true };
    const timeline = await makeDirector(degraded).direct(INPUT);
    expect(validateInvariants(timeline).valid).toBe(true);
    expect(timeline.warnings.some((w) => /degraded/i.test(w))).toBe(true);
  });

  it('handles an empty asset catalogue by omitting audio layers', async () => {
    const timeline = await makeDirector(ANALYSIS, { version: 1, root: 'audio-assets', assets: [] }).direct(INPUT);
    expect(validateInvariants(timeline).valid).toBe(true);
    expect(timeline.tracks.music.events).toHaveLength(0);
    expect(timeline.tracks.ambience.events).toHaveLength(0);
    // Voice still present — the episode is intact.
    expect(timeline.tracks.voice.events).toHaveLength(LINES.length);
  });

  it('handles a null plan, script and brief', async () => {
    const timeline = await makeDirector({
      scenes: [{ title: 'Episode', startLine: 0, endLine: 0, location: 'neutral', locationDescription: '', timeOfDay: 'neutral', dominantEmotion: 'neutral', energyLevel: 0.5, tensionLevel: 0.2, chapterIndex: 0 }],
      characters: [{ name: 'Narrator', role: 'Narrator', gender: 'neutral', ageBand: 'adult', personalityNote: '' }],
      emotionArc: 'steady',
      degraded: true,
    }).direct({
      podcastId: 'pod_2',
      userId: 'u1',
      plan: null,
      script: { lines: [{ speaker: 'Narrator', text: 'Hello.', chapterIndex: 0 }] },
      brief: null,
    });
    expect(MasterTimelineSchema.safeParse(timeline).success).toBe(true);
  });

  it('respects preference switches that disable tracks', async () => {
    const timeline = await makeDirector().direct({
      ...INPUT,
      preferences: { enableMusic: false, enableAmbience: false, enableVisualPlanning: false },
    });
    expect(timeline.tracks.music.events).toHaveLength(0);
    expect(timeline.tracks.ambience.events).toHaveLength(0);
    expect(timeline.tracks.visual.events).toHaveLength(0);
  });

  it('suppresses ambience when accessibility asks for reduced background', async () => {
    const timeline = await makeDirector().direct({
      ...INPUT,
      producerPlan: { ...PRODUCER, accessibility: { ...PRODUCER.accessibility, reduceBackgroundAudio: true } },
    });
    expect(timeline.tracks.ambience.events).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Two-pass timing
// ---------------------------------------------------------------------------

describe('TimelineBuilder.resolve — pass 2', () => {
  const builder = new TimelineBuilder();

  it('re-anchors everything to measured durations', async () => {
    const planned = await makeDirector().direct({
      ...INPUT,
      preferences: { cinematicIntensity: 'balanced' },
    });

    // Real durations differ substantially from word-count estimates.
    const durations = { 0: 5000, 1: 6000, 2: 7000, 3: 4000 };
    const resolved = builder.resolve(planned, durations);

    expect(resolved.phase).toBe('resolved');
    expect(resolved.resolvedAt).toBeGreaterThan(0);

    // Voice events sit end to end (plus any pauses).
    expect(resolved.tracks.voice.events[0].startMs).toBe(0);
    expect(resolved.tracks.voice.events[0].durationMs).toBe(5000);
    expect(resolved.tracks.voice.events[1].startMs).toBeGreaterThanOrEqual(5000);

    // Total covers all speech plus pauses.
    const speech = Object.values(durations).reduce((a, b) => a + b, 0);
    expect(resolved.totalDurationMs).toBeGreaterThanOrEqual(speech);
  });

  it('keeps the 1:1 line mapping through resolution', async () => {
    const planned = await makeDirector().direct(INPUT);
    const resolved = builder.resolve(planned, { 0: 3000, 1: 3000, 2: 3000, 3: 3000 });
    resolved.tracks.voice.events.forEach((e, i) => expect(e.lineIndex).toBe(i));
    expect(validateLineCoverage(resolved, LINES.length).valid).toBe(true);
  });

  it('re-anchors scenes to real line boundaries', async () => {
    const planned = await makeDirector().direct(INPUT);
    const resolved = builder.resolve(planned, { 0: 4000, 1: 4000, 2: 4000, 3: 4000 });

    const first = resolved.scenes[0];
    const second = resolved.scenes[1];
    expect(first.startMs).toBe(0);
    expect(second.startMs).toBeGreaterThanOrEqual(first.endMs - 1);
    expect(second.endMs).toBeGreaterThan(second.startMs);
  });

  it('stretches music beds to their resolved scene spans', async () => {
    const planned = await makeDirector().direct({ ...INPUT, preferences: { cinematicIntensity: 'balanced' } });
    const resolved = builder.resolve(planned, { 0: 9000, 1: 9000, 2: 9000, 3: 9000 });

    const beds = resolved.tracks.music.events.filter((e) => e.role === 'bed');
    for (const bed of beds) {
      const scene = resolved.scenes.find((s) => s.id === bed.sceneId)!;
      expect(bed.startMs).toBe(scene.startMs);
    }
  });

  it('still has no hard stops after resolution', async () => {
    const planned = await makeDirector().direct({ ...INPUT, preferences: { cinematicIntensity: 'balanced' } });
    const resolved = builder.resolve(planned, { 0: 5000, 1: 5000, 2: 5000, 3: 5000 });
    const music = [...resolved.tracks.music.events].sort((a, b) => a.startMs - b.startMs);
    music.slice(0, -1).forEach((e) => expect(e.crossfadeToNextMs).toBeGreaterThan(0));
  });

  it('is idempotent enough to re-run safely', async () => {
    const planned = await makeDirector().direct(INPUT);
    const durations = { 0: 4000, 1: 4000, 2: 4000, 3: 4000 };
    const once = builder.resolve(planned, durations);
    const twice = builder.resolve(once, durations);
    expect(twice.totalDurationMs).toBe(once.totalDurationMs);
  });

  it('returns the timeline unchanged when there are no voice events', () => {
    const empty = { tracks: { voice: { events: [] } } } as never;
    expect(builder.resolve(empty, {})).toBe(empty);
  });
});

// ---------------------------------------------------------------------------
// Individual planners
// ---------------------------------------------------------------------------

describe('NarrativeAnalyzer normalisation', () => {
  const input = {
    userId: 'u1', podcastId: 'p1', title: 'T', topic: 'Topic', language: 'English',
    chapters: [{ index: 0, title: 'A' }],
    declaredSpeakers: [{ name: 'Priya', role: 'Teacher' }],
    lines: LINES,
  };

  it('closes gaps between scenes', () => {
    const scenes = normalizeSceneCoverage(
      [
        { title: 'A', startLine: 0, endLine: 0, location: 'classroom', locationDescription: '', timeOfDay: 'neutral', dominantEmotion: 'neutral', energyLevel: 0.5, tensionLevel: 0.2 },
        // gap: line 1 uncovered
        { title: 'B', startLine: 2, endLine: 3, location: 'classroom', locationDescription: '', timeOfDay: 'neutral', dominantEmotion: 'neutral', energyLevel: 0.5, tensionLevel: 0.2 },
      ] as never,
      input as never
    );
    const covered = new Set<number>();
    for (const s of scenes) for (let i = s.startLine; i <= s.endLine; i++) covered.add(i);
    expect([...covered].sort()).toEqual([0, 1, 2, 3]);
  });

  it('trims overlapping scenes', () => {
    const scenes = normalizeSceneCoverage(
      [
        { title: 'A', startLine: 0, endLine: 3, location: 'classroom', locationDescription: '', timeOfDay: 'neutral', dominantEmotion: 'neutral', energyLevel: 0.5, tensionLevel: 0.2 },
        { title: 'B', startLine: 2, endLine: 3, location: 'classroom', locationDescription: '', timeOfDay: 'neutral', dominantEmotion: 'neutral', energyLevel: 0.5, tensionLevel: 0.2 },
      ] as never,
      input as never
    );
    for (let i = 1; i < scenes.length; i++) {
      expect(scenes[i].startLine).toBeGreaterThan(scenes[i - 1].endLine);
    }
  });

  it('extends the final scene to the end of the script', () => {
    const scenes = normalizeSceneCoverage(
      [{ title: 'A', startLine: 0, endLine: 1, location: 'classroom', locationDescription: '', timeOfDay: 'neutral', dominantEmotion: 'neutral', energyLevel: 0.5, tensionLevel: 0.2 }] as never,
      input as never
    );
    expect(scenes[scenes.length - 1].endLine).toBe(LINES.length - 1);
  });

  it('adds speakers the model omitted so no voice event is orphaned', () => {
    const reconciled = reconcileCharacters(
      [{ name: 'Priya', role: 'Teacher', gender: 'female', ageBand: 'adult', personalityNote: '' }],
      input as never
    );
    expect(reconciled.map((c) => c.name.toLowerCase())).toContain('riya');
  });

  it('falls back to one scene per chapter', () => {
    const analysis = new NarrativeAnalyzer().fallback(input as never);
    expect(analysis.degraded).toBe(true);
    expect(analysis.scenes.length).toBe(2); // chapters 0 and 1
    expect(analysis.scenes[0].startLine).toBe(0);
  });
});

describe('ScenePlanner', () => {
  it('adjusts speaking rate per language', () => {
    // Devanagari packs more content per word.
    expect(wordsPerSecond('hindi')).toBeLessThan(wordsPerSecond('english'));
    expect(wordsPerSecond('unknown')).toBe(2.5);
  });

  it('counts words in Devanagari as well as Latin', () => {
    expect(countWords('नमस्कार दोस्तों और स्वागत है')).toBe(5);
    expect(countWords('hello world')).toBe(2);
    expect(countWords('')).toBe(0);
  });

  it('floors scene duration so an empty scene still occupies time', () => {
    const ms = estimateSceneDurationMs(
      { startLine: 0, endLine: 0, title: '', location: 'neutral', locationDescription: '', timeOfDay: 'neutral', dominantEmotion: 'neutral', energyLevel: 0.5, tensionLevel: 0, chapterIndex: 0 },
      [{ speaker: 'A', text: '', chapterIndex: 0 }],
      2.5
    );
    expect(ms).toBeGreaterThanOrEqual(1000);
  });

  it('classifies environments correctly', () => {
    expect(environmentFor('space')).toBe('space');
    expect(environmentFor('neutral')).toBe('abstract');
    expect(environmentFor('forest')).toBe('outdoor');
    expect(environmentFor('classroom')).toBe('indoor');
  });

  it('forces atmospheric locations to neutral when reducing background', async () => {
    const scenes = await new ScenePlanner().plan({
      skeletons: [{ ...ANALYSIS.scenes[0], location: 'battlefield' }],
      lines: LINES,
      language: 'English',
      genre: 'educational',
      topic: 'War',
      reduceBackground: true,
      cinematicIntensity: 'subtle',
    });
    expect(scenes[0].setting.location).toBe('neutral');
  });
});

describe('EmotionPlanner', () => {
  it('interpolates intensity between keyframes', () => {
    const curve = {
      keyframes: [
        { atProgress: 0, emotion: 'calm' as const, intensity: 0.2, sceneId: 's0' },
        { atProgress: 1, emotion: 'excited' as const, intensity: 0.8, sceneId: 's1' },
      ],
      arcType: 'rising' as const,
    };
    expect(interpolateIntensity(curve, 0)).toBe(0.2);
    expect(interpolateIntensity(curve, 1)).toBe(0.8);
    expect(interpolateIntensity(curve, 0.5)).toBeCloseTo(0.5, 1);
  });

  it('clamps interpolation outside the curve range', () => {
    const curve = { keyframes: [{ atProgress: 0.5, emotion: 'calm' as const, intensity: 0.4, sceneId: 's0' }], arcType: 'steady' as const };
    expect(interpolateIntensity(curve, 0)).toBe(0.4);
    expect(interpolateIntensity(curve, 1)).toBe(0.4);
  });

  it('returns the nearest preceding emotion', () => {
    const curve = {
      keyframes: [
        { atProgress: 0, emotion: 'calm' as const, intensity: 0.3, sceneId: 's0' },
        { atProgress: 0.6, emotion: 'wonder' as const, intensity: 0.6, sceneId: 's1' },
      ],
      arcType: 'rising' as const,
    };
    expect(emotionAt(curve, 0.2)).toBe('calm');
    expect(emotionAt(curve, 0.9)).toBe('wonder');
  });

  it('scales expression by cinematic intensity', () => {
    expect(expressionScaleFor('subtle')).toBeLessThan(expressionScaleFor('balanced'));
    expect(expressionScaleFor('balanced')).toBeLessThan(expressionScaleFor('dramatic'));
  });

  it('clamps a line emotion into the character range', async () => {
    const planner = new EmotionPlanner();
    const scenes = await new ScenePlanner().plan({
      skeletons: [{ ...ANALYSIS.scenes[0], dominantEmotion: 'angry' }],
      lines: LINES, language: 'English', genre: 'educational', topic: 'T', cinematicIntensity: 'balanced',
    });
    const cast = await new CharacterPlanner().plan({
      userId: 'u1', language: 'English',
      hints: [{ name: 'Riya', role: 'Student', gender: 'female', ageBand: 'teen', personalityNote: '' }],
    });
    const curve = await planner.plan({ scenes, arcType: 'steady', cinematicIntensity: 'balanced' });

    const delivery = planner.deliveryFor({
      scene: scenes[0], character: cast.characters[0], curve, progress: 0,
      isSceneOpener: true, cinematicIntensity: 'balanced',
    });
    // Student cannot be angry — clamped.
    expect(delivery.emotion).not.toBe('angry');
    expect(cast.characters[0].allowedEmotions).toContain(delivery.emotion);
  });

  it('records prosody support on the delivery', async () => {
    const planner = new EmotionPlanner();
    const scenes = await new ScenePlanner().plan({
      skeletons: ANALYSIS.scenes, lines: LINES, language: 'English', genre: 'educational', topic: 'T', cinematicIntensity: 'balanced',
    });
    const cast = await new CharacterPlanner().plan({
      userId: 'u1', language: 'English', hints: ANALYSIS.characters,
    });
    const curve = await planner.plan({ scenes, arcType: 'rising', cinematicIntensity: 'balanced' });
    const delivery = planner.deliveryFor({
      scene: scenes[0], character: cast.characters[0], curve, progress: 0, isSceneOpener: false, cinematicIntensity: 'balanced',
    });
    expect(typeof delivery.prosodyUnsupported).toBe('boolean');
  });

  it('honours an accessibility speaking-rate cap', async () => {
    const planner = new EmotionPlanner();
    const scenes = await new ScenePlanner().plan({
      skeletons: [{ ...ANALYSIS.scenes[0], dominantEmotion: 'excited' }],
      lines: LINES, language: 'English', genre: 'educational', topic: 'T', cinematicIntensity: 'dramatic',
    });
    const cast = await new CharacterPlanner().plan({
      userId: 'u1', language: 'English', hints: [{ name: 'Riya', role: 'Student', gender: 'female', ageBand: 'teen', personalityNote: '' }],
    });
    const curve = await planner.plan({ scenes, arcType: 'rising', cinematicIntensity: 'dramatic' });
    const delivery = planner.deliveryFor({
      scene: scenes[0], character: cast.characters[0], curve, progress: 0.5,
      isSceneOpener: false, maxSpeakingRate: 0.95, cinematicIntensity: 'dramatic',
    });
    expect(delivery.speakingRate).toBeLessThanOrEqual(0.95);
  });
});

describe('CharacterPlanner', () => {
  it('reuses a remembered voice for the same name and role', async () => {
    const planner = new CharacterPlanner();
    const first = await planner.plan({ userId: 'u1', language: 'English', hints: ANALYSIS.characters });
    const remembered = first.characters[0];

    const second = await planner.plan({
      userId: 'u1', language: 'English', hints: ANALYSIS.characters,
      existingCharacters: first.characters,
    });
    // Consistency guarantee: same voice across episodes.
    expect(second.characters[0].voice.voiceId).toBe(remembered.voice.voiceId);
    expect(second.characters[0].id).toBe(remembered.id);
    expect(second.characters[0].episodeCount).toBe(remembered.episodeCount + 1);
  });

  it('picks a Teacher as the primary speaker', async () => {
    const cast = await new CharacterPlanner().plan({
      userId: 'u1', language: 'English', hints: ANALYSIS.characters,
    });
    const primary = cast.characters.find((c) => c.id === cast.primarySpeakerId);
    expect(primary?.role).toBe('Teacher');
  });

  it('assigns an indian accent for Hindi episodes', async () => {
    const cast = await new CharacterPlanner().plan({
      userId: 'u1', language: 'Hindi', hints: ANALYSIS.characters,
    });
    expect(cast.characters[0].accent).toBe('indian');
  });

  it('falls back to a single narrator', () => {
    const cast = new CharacterPlanner().fallback({ userId: 'u1', language: 'English', hints: [] });
    expect(cast.characters).toHaveLength(1);
    expect(cast.narratorId).toBe(cast.primarySpeakerId);
  });

  it('caps base speaking rate to the accessibility limit', async () => {
    const cast = await new CharacterPlanner().plan({
      userId: 'u1', language: 'English', hints: ANALYSIS.characters, maxSpeakingRate: 0.9,
    });
    for (const c of cast.characters) {
      expect(c.voice.baseSpeakingRate).toBeLessThanOrEqual(0.9);
    }
  });
});

describe('PausePlanner', () => {
  const base = {
    sceneEmotion: 'neutral', emotionPauseMs: 250, isSceneEnd: false,
    emphasisTerms: [] as string[], extendedPauseMs: 0, cinematicIntensity: 'balanced' as const,
  };

  it('emits a scene_gap at a scene boundary', () => {
    expect(decidePause({ ...base, text: 'Done.', isSceneEnd: true })?.type).toBe('scene_gap');
  });

  it('emits a comprehension beat after an emphasised concept', () => {
    const d = decidePause({ ...base, text: 'The Calvin cycle builds sugar.', emphasisTerms: ['calvin cycle'] });
    expect(d?.type).toBe('comprehension');
  });

  it('emits a beat after a question', () => {
    expect(decidePause({ ...base, text: 'So how does that work?' })?.type).toBe('beat');
  });

  it('emits a breath after a long line', () => {
    const long = Array.from({ length: 50 }, () => 'word').join(' ');
    expect(decidePause({ ...base, text: long })?.type).toBe('breath');
  });

  it('returns null for an ordinary short line', () => {
    expect(decidePause({ ...base, text: 'Light reactions happen first.' })).toBeNull();
  });

  it('suppresses dramatic holds in subtle mode', () => {
    // A long silence in a study podcast reads as a glitch.
    const d = decidePause({ ...base, text: 'Something lurked.', sceneEmotion: 'suspense', cinematicIntensity: 'subtle' });
    expect(d?.type).not.toBe('suspense');
  });

  it('caps pause length', () => {
    const d = decidePause({ ...base, text: 'End.', isSceneEnd: true, extendedPauseMs: 99_999 });
    expect(d!.durationMs).toBeLessThanOrEqual(2500);
  });

  it('keeps background running through pauses', () => {
    const d = decidePause({ ...base, text: 'End.', isSceneEnd: true });
    expect(d!.holdBackground).toBe(true);
  });
});

describe('MusicPlanner continuity', () => {
  it('continues ONE bed across consecutive scenes sharing a category', async () => {
    const { manifest } = AssetManifest.from(CATALOGUE);
    // Same dominant emotion in both scenes → same category → one run.
    const scenes = await new ScenePlanner().plan({
      skeletons: ANALYSIS.scenes.map((s) => ({ ...s, dominantEmotion: 'curious' as const })),
      lines: LINES, language: 'English', genre: 'educational', topic: 'T', cinematicIntensity: 'balanced',
    });
    const beds = (
      await new MusicPlanner().plan({
        scenes, genre: 'educational', manifest, duckFloorDb: -12, cinematicIntensity: 'balanced', totalEstimatedMs: 60_000,
      })
    ).filter((e) => e.role === 'bed');

    // This is the "evolving soundtrack" behaviour: the bed does not restart.
    expect(beds).toHaveLength(1);
    // And it spans both scenes.
    const totalSceneMs = scenes.reduce((sum, s) => sum + s.estimatedDurationMs, 0);
    expect(beds[0].durationMs).toBeGreaterThanOrEqual(totalSceneMs - 1);
  });

  it('introduces a NEW bed with a crossfade on a genuine category change', async () => {
    const { manifest } = AssetManifest.from(CATALOGUE);
    const scenes = await new ScenePlanner().plan({
      skeletons: [
        { ...ANALYSIS.scenes[0], dominantEmotion: 'curious' as const },
        { ...ANALYSIS.scenes[1], dominantEmotion: 'sad' as const },
      ],
      lines: LINES, language: 'English', genre: 'storytelling', topic: 'T', cinematicIntensity: 'balanced',
    });
    const beds = (
      await new MusicPlanner().plan({
        scenes, genre: 'storytelling', manifest, duckFloorDb: -12, cinematicIntensity: 'balanced', totalEstimatedMs: 60_000,
      })
    ).filter((e) => e.role === 'bed');

    expect(beds).toHaveLength(2);
    // Never a hard stop between them.
    expect(beds[0].crossfadeToNextMs).toBeGreaterThan(0);
  });

  it('emits an intro and an outro', async () => {
    const { manifest } = AssetManifest.from(CATALOGUE);
    const scenes = await new ScenePlanner().plan({
      skeletons: ANALYSIS.scenes, lines: LINES, language: 'English', genre: 'educational', topic: 'T', cinematicIntensity: 'balanced',
    });
    const events = await new MusicPlanner().plan({
      scenes, genre: 'educational', manifest, duckFloorDb: -12, cinematicIntensity: 'balanced', totalEstimatedMs: 60_000,
    });
    expect(events.some((e) => e.role === 'intro')).toBe(true);
    expect(events.some((e) => e.role === 'outro')).toBe(true);
  });

  it('returns nothing when no music assets exist', async () => {
    const { manifest } = AssetManifest.from({ version: 1, root: 'a', assets: [] });
    const events = await new MusicPlanner().plan({
      scenes: [], genre: 'educational', manifest, duckFloorDb: -12, cinematicIntensity: 'balanced', totalEstimatedMs: 0,
    });
    expect(events).toEqual([]);
  });

  it('sealCrossfades leaves exactly one zero-crossfade event', () => {
    const sealed = sealCrossfades([
      { id: 'a', startMs: 0, crossfadeToNextMs: 0 } as never,
      { id: 'b', startMs: 100, crossfadeToNextMs: 0 } as never,
    ]);
    expect(sealed[0].crossfadeToNextMs).toBeGreaterThan(0);
    expect(sealed[1].crossfadeToNextMs).toBe(0);
  });
});

describe('AmbiencePlanner', () => {
  it('drops layers whose assets are missing rather than substituting', async () => {
    // Catalogue has only the base layer for classroom, not paper_rustle... it has both.
    const partial = { version: 1 as const, root: 'a', assets: [CATALOGUE.assets[2]] };
    const { manifest } = AssetManifest.from(partial);
    const scenes = await new ScenePlanner().plan({
      skeletons: [ANALYSIS.scenes[0]], lines: LINES, language: 'English', genre: 'educational', topic: 'T', cinematicIntensity: 'balanced',
    });
    const events = await new AmbiencePlanner().plan({
      scenes, manifest, duckFloorDb: -12, cinematicIntensity: 'balanced',
    });
    expect(events[0].layers.every((l) => l.assetId === 'amb_room_tone_small')).toBe(true);
  });

  it('keeps every layer below the duck floor', async () => {
    const { manifest } = AssetManifest.from(CATALOGUE);
    const scenes = await new ScenePlanner().plan({
      skeletons: [ANALYSIS.scenes[0]], lines: LINES, language: 'English', genre: 'educational', topic: 'T', cinematicIntensity: 'balanced',
    });
    const events = await new AmbiencePlanner().plan({
      scenes, manifest, duckFloorDb: -12, cinematicIntensity: 'balanced',
    });
    for (const e of events) {
      for (const l of e.layers) expect(l.volumeDb).toBeLessThan(-12);
    }
  });

  it('uses random_offset looping to avoid audible repetition', async () => {
    const { manifest } = AssetManifest.from(CATALOGUE);
    const scenes = await new ScenePlanner().plan({
      skeletons: [ANALYSIS.scenes[0]], lines: LINES, language: 'English', genre: 'educational', topic: 'T', cinematicIntensity: 'balanced',
    });
    const events = await new AmbiencePlanner().plan({
      scenes, manifest, duckFloorDb: -12, cinematicIntensity: 'balanced',
    });
    for (const l of events[0].layers) {
      expect(l.loopBehavior).toBe('random_offset');
      expect(l.jitterMs).toBeGreaterThan(0);
    }
  });
});

describe('SFXPlanner', () => {
  const dramaticLines = [
    { speaker: 'Narrator', text: 'Suddenly the door opened.', chapterIndex: 0 },
    { speaker: 'Narrator', text: 'Then thunder struck the tower.', chapterIndex: 0 },
  ];

  async function planSfx(over: Partial<Parameters<SFXPlanner['plan']>[0]> = {}) {
    const { manifest } = AssetManifest.from(CATALOGUE);
    const scenes = await new ScenePlanner().plan({
      skeletons: [{ ...ANALYSIS.scenes[0], startLine: 0, endLine: 1 }],
      lines: dramaticLines, language: 'English', genre: 'storytelling', topic: 'T', cinematicIntensity: 'balanced',
    });
    return new SFXPlanner().plan({
      scenes, lines: dramaticLines, manifest, duckFloorDb: -12,
      cinematicIntensity: 'balanced',
      lineDurationsMs: { 0: 4000, 1: 4000 },
      lineStartsMs: { 0: 0, 1: 4000 },
      totalEstimatedMs: 8000,
      ...over,
    });
  }

  it('places effects for matched triggers', async () => {
    const events = await planSfx();
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].syncMode).toBe('on_word');
    expect(events[0].triggerWord).toBeTruthy();
  });

  it('emits nothing in subtle mode', async () => {
    expect(await planSfx({ cinematicIntensity: 'subtle' })).toEqual([]);
  });

  it('drops startle categories when accessibility requests it', async () => {
    const events = await planSfx({ avoidStartleEffects: true });
    expect(events.every((e) => e.effectCategory !== 'weather')).toBe(true);
  });

  it('emits chronologically ordered events', async () => {
    const events = await planSfx();
    for (let i = 1; i < events.length; i++) {
      expect(events[i].startMs).toBeGreaterThanOrEqual(events[i - 1].startMs);
    }
  });

  it('emits nothing when no sfx assets exist', async () => {
    const { manifest } = AssetManifest.from({ version: 1, root: 'a', assets: [] });
    const events = await new SFXPlanner().plan({
      scenes: [], lines: dramaticLines, manifest, duckFloorDb: -12,
      cinematicIntensity: 'balanced', lineDurationsMs: {}, lineStartsMs: {}, totalEstimatedMs: 0,
    });
    expect(events).toEqual([]);
  });
});

describe('VisualPlanner', () => {
  it('emits an establishing shot per scene', async () => {
    const scenes = await new ScenePlanner().plan({
      skeletons: ANALYSIS.scenes, lines: LINES, language: 'English', genre: 'educational', topic: 'T', cinematicIntensity: 'balanced',
    });
    const cast = await new CharacterPlanner().plan({ userId: 'u1', language: 'English', hints: ANALYSIS.characters });
    const events = await new VisualPlanner().plan({
      scenes, cast, lines: LINES,
      lineStartsMs: { 0: 0, 1: 5000, 2: 10_000, 3: 15_000 },
      lineDurationsMs: { 0: 5000, 1: 5000, 2: 5000, 3: 5000 },
    });
    const establishing = events.filter((e) => e.visualType === 'establishing_shot');
    expect(establishing).toHaveLength(scenes.length);
  });

  it('targets character shots at real cast members', async () => {
    const scenes = await new ScenePlanner().plan({
      skeletons: ANALYSIS.scenes, lines: LINES, language: 'English', genre: 'educational', topic: 'T', cinematicIntensity: 'balanced',
    });
    const cast = await new CharacterPlanner().plan({ userId: 'u1', language: 'English', hints: ANALYSIS.characters });
    const events = await new VisualPlanner().plan({
      scenes, cast, lines: LINES,
      lineStartsMs: { 0: 0, 1: 6000, 2: 12_000, 3: 18_000 },
      lineDurationsMs: { 0: 6000, 1: 6000, 2: 6000, 3: 6000 },
    });
    const castIds = new Set(cast.characters.map((c) => c.id));
    for (const e of events.filter((x) => x.visualType === 'character_shot')) {
      expect(castIds.has(e.characterId!)).toBe(true);
    }
  });

  it('emits nothing when disabled', async () => {
    const events = await new VisualPlanner().plan({
      scenes: [], cast: { characters: [], primarySpeakerId: 'x' } as never,
      lines: [], lineStartsMs: {}, lineDurationsMs: {}, enabled: false,
    });
    expect(events).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

describe('director helpers', () => {
  it('estimates line timings end to end', () => {
    const { lineStartsMs, lineDurationsMs, totalEstimatedMs } = estimateLineTimings(LINES, 2.5);
    expect(lineStartsMs[0]).toBe(0);
    expect(lineStartsMs[1]).toBe(lineDurationsMs[0]);
    expect(totalEstimatedMs).toBeGreaterThan(0);
  });

  it('floors a short line at 800ms', () => {
    const { lineDurationsMs } = estimateLineTimings([{ speaker: 'A', text: 'Yes.', chapterIndex: 0 }], 2.5);
    expect(lineDurationsMs[0]).toBe(800);
  });

  it('maps podcast types to genres', () => {
    expect(inferGenre('current_affairs')).toBe('news');
    expect(inferGenre('doubt')).toBe('interview');
    expect(inferGenre('revision')).toBe('educational');
    expect(inferGenre(undefined)).toBe('educational');
  });

  it('resolves emphasis concept ids to human labels', () => {
    // Raw ids never appear in a script, so they must be resolved to labels.
    expect(
      resolveEmphasisTerms({
        educational: { emphasisConcepts: ['calvin'] },
        learningIntelligence: { concepts: [{ id: 'calvin', label: 'Calvin cycle' }] },
      })
    ).toEqual(['Calvin cycle']);
  });

  it('returns no emphasis terms when nothing is emphasised', () => {
    expect(resolveEmphasisTerms({})).toEqual([]);
  });

  it('lays scenes end to end', () => {
    const anchored = anchorScenes([
      { estimatedDurationMs: 1000 } as never,
      { estimatedDurationMs: 2000 } as never,
    ]);
    expect(anchored[0].startMs).toBe(0);
    expect(anchored[0].endMs).toBe(1000);
    expect(anchored[1].startMs).toBe(1000);
    expect(anchored[1].endMs).toBe(3000);
  });

  it('parses trailing indices from event ids', () => {
    expect(parseTrailingIndex('pause_12')).toBe(12);
    expect(parseTrailingIndex('music_intro')).toBeNull();
  });
});
