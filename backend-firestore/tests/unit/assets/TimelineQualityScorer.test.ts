/**
 * TimelineQualityScorer — the objective half of the creative review.
 *
 * Each dimension is tested for BOTH a clean timeline and a specific defect, so
 * the score is known to actually move in response to the failure it claims to
 * detect. A scorer that always returns 100 is worse than no scorer.
 */

import {
  TimelineQualityScorer,
  adjacentAge,
  emotionValence,
  WEAK_THRESHOLD,
} from '../../../src/core/director/inspector/TimelineQualityScorer';
import { VALIDATION_TOPICS, VALIDATION_TOPIC_COUNT } from '../../../src/core/director/inspector/timelineTopics';
import { syntheticDirect } from '../../../src/core/director/inspector/syntheticDirect';
import type { MasterTimeline } from '../../../src/core/director/schema/timeline.schema';

const scorer = new TimelineQualityScorer();

/** Real timeline from the offline Director — no network, no credentials. */
async function buildTimeline(
  overrideLines?: Array<{ speaker: string; text: string }>
): Promise<MasterTimeline> {
  const lines =
    overrideLines ??
    [
      { speaker: 'Narrator', text: 'Welcome to an exploration of cellular biology today.' },
      { speaker: 'Narrator', text: 'We begin in the laboratory where it all started.' },
      { speaker: 'Narrator', text: 'The key term is defined as the exchange of energy across a boundary.' },
      { speaker: 'Narrator', text: 'That definition underpins everything that follows here.' },
      { speaker: 'Narrator', text: 'But a problem emerged that nobody had anticipated at all.' },
      { speaker: 'Narrator', text: 'The tension grew as the evidence refused to fit the model.' },
      { speaker: 'Narrator', text: 'Finally the resolution arrived from an unexpected direction.' },
      { speaker: 'Narrator', text: 'And that is why this discovery still matters today.' },
    ];

  const timeline = await syntheticDirect({
    podcastId: 'qs_test',
    userId: 'tester',
    title: 'Cellular biology',
    lines,
    cinematicIntensity: 'balanced',
  });
  if (!timeline) throw new Error('syntheticDirect returned null');
  return timeline;
}

describe('TimelineQualityScorer on a real directed timeline', () => {
  let timeline: MasterTimeline;

  beforeAll(async () => {
    timeline = await buildTimeline();
  }, 30_000);

  it('scores all ten dimensions', () => {
    const report = scorer.score(timeline);
    expect(report.dimensions).toHaveLength(10);
    expect(new Set(report.dimensions.map((d) => d.dimension)).size).toBe(10);
  });

  it('keeps every dimension within 0..100', () => {
    for (const d of scorer.score(timeline).dimensions) {
      expect(d.score).toBeGreaterThanOrEqual(0);
      expect(d.score).toBeLessThanOrEqual(100);
    }
  });

  it('produces an overall score that is the mean of the dimensions', () => {
    const report = scorer.score(timeline);
    const mean =
      report.dimensions.reduce((s, d) => s + d.score, 0) / report.dimensions.length;
    expect(report.overall).toBeCloseTo(Math.round(mean * 10) / 10, 1);
  });

  it('reports counts matching the timeline', () => {
    const report = scorer.score(timeline);
    expect(report.counts.scenes).toBe(timeline.scenes.length);
    expect(report.counts.voiceEvents).toBe(timeline.tracks.voice.events.length);
    expect(report.counts.characters).toBe(timeline.cast.characters.length);
  });

  it('lists weak dimensions consistently with the threshold', () => {
    const report = scorer.score(timeline);
    for (const dim of report.weakest) {
      const score = report.dimensions.find((d) => d.dimension === dim)!.score;
      expect(score).toBeLessThan(WEAK_THRESHOLD);
    }
  });

  it('gives full marks for voice, timing and continuity on a clean single-narrator episode', () => {
    const report = scorer.score(timeline);
    const get = (d: string) => report.dimensions.find((x) => x.dimension === d)!.score;
    expect(get('voice')).toBe(100);
    expect(get('timing')).toBe(100);
    expect(get('continuity')).toBe(100);
  });

  it('is deterministic — the same timeline scores identically', () => {
    expect(scorer.score(timeline).overall).toBe(scorer.score(timeline).overall);
  });
});

// ---------------------------------------------------------------------------
// Defect detection
// ---------------------------------------------------------------------------

describe('defect detection', () => {
  let clean: MasterTimeline;

  beforeAll(async () => {
    clean = await buildTimeline();
  }, 30_000);

  const dimScore = (t: MasterTimeline, dim: string) =>
    scorer.score(t).dimensions.find((d) => d.dimension === dim)!.score;

  it('detects two characters sharing one voice', () => {
    const broken: MasterTimeline = JSON.parse(JSON.stringify(clean));
    const first = broken.cast.characters[0];
    broken.cast.characters.push({
      ...first,
      id: 'char_clone',
      displayName: 'Clone',
    });
    // Make the clone speak, or it is flagged as silent cast instead.
    broken.tracks.voice.events[0].characterId = 'char_clone';

    expect(dimScore(broken, 'voice')).toBeLessThan(dimScore(clean, 'voice'));
  });

  it('detects a voice gender mismatch', () => {
    const broken: MasterTimeline = JSON.parse(JSON.stringify(clean));
    broken.cast.characters[0].gender = 'female';
    (broken.cast.characters[0].voice as Record<string, unknown>).gender = 'male';

    expect(dimScore(broken, 'genderAge')).toBeLessThan(100);
  });

  it('detects a music bed above the duck floor', () => {
    const broken: MasterTimeline = JSON.parse(JSON.stringify(clean));
    for (const e of broken.tracks.music.events) {
      if (e.role === 'bed') e.volumeDb = 0;
    }
    expect(dimScore(broken, 'music')).toBeLessThan(dimScore(clean, 'music'));
  });

  it('detects a hard music stop', () => {
    const broken: MasterTimeline = JSON.parse(JSON.stringify(clean));
    for (const e of broken.tracks.music.events) e.crossfadeToNextMs = 0;
    expect(dimScore(broken, 'music')).toBeLessThan(dimScore(clean, 'music'));
  });

  it('scores music at 50 when the score is entirely absent', () => {
    const broken: MasterTimeline = JSON.parse(JSON.stringify(clean));
    broken.tracks.music.events = [];
    expect(dimScore(broken, 'music')).toBe(50);
  });

  it('detects ambience that contradicts the scene setting', () => {
    const broken: MasterTimeline = JSON.parse(JSON.stringify(clean));
    for (const e of broken.tracks.ambience.events) e.environmentId = 'space';
    expect(dimScore(broken, 'ambience')).toBeLessThan(dimScore(clean, 'ambience'));
  });

  it('gives SFX full marks when absent, since silence is correct for study audio', () => {
    const broken: MasterTimeline = JSON.parse(JSON.stringify(clean));
    broken.tracks.sfx.events = [];
    expect(dimScore(broken, 'sfx')).toBe(100);
  });

  it('detects clustered SFX cues', () => {
    const broken: MasterTimeline = JSON.parse(JSON.stringify(clean));
    const template = {
      id: 'sfx_a',
      kind: 'sfx' as const,
      startMs: 1000,
      durationMs: 500,
      sceneId: broken.scenes[0].id,
      priority: 50,
      requirement: {
        kind: 'sfx' as const,
        category: 'door',
        durationMs: 500,
        loopable: false,
        tags: [],
      },
      effectCategory: 'door' as const,
      triggerWord: 'door',
      syncMode: 'on_word' as const,
      offsetMs: 0,
      volumeDb: -10,
      fadeInMs: 0,
      fadeOutMs: 120,
    };
    broken.tracks.sfx.events = [
      template,
      { ...template, id: 'sfx_b', startMs: 1200 },
    ];
    expect(dimScore(broken, 'sfx')).toBeLessThan(100);
  });

  it('detects non-contiguous voice line indices', () => {
    const broken: MasterTimeline = JSON.parse(JSON.stringify(clean));
    if (broken.tracks.voice.events.length > 2) {
      broken.tracks.voice.events[2].lineIndex = 99;
    }
    expect(dimScore(broken, 'timing')).toBeLessThan(dimScore(clean, 'timing'));
  });

  it('detects an event starting before zero', () => {
    const broken: MasterTimeline = JSON.parse(JSON.stringify(clean));
    if (broken.tracks.music.events.length > 0) {
      broken.tracks.music.events[0].startMs = -5000;
    }
    expect(dimScore(broken, 'timing')).toBeLessThan(dimScore(clean, 'timing'));
  });

  it('detects a voice event referencing an unknown character', () => {
    const broken: MasterTimeline = JSON.parse(JSON.stringify(clean));
    broken.tracks.voice.events[0].characterId = 'char_ghost';
    expect(dimScore(broken, 'continuity')).toBeLessThan(dimScore(clean, 'continuity'));
  });

  it('detects a cast member who never speaks', () => {
    const broken: MasterTimeline = JSON.parse(JSON.stringify(clean));
    broken.cast.characters.push({
      ...broken.cast.characters[0],
      id: 'char_mute',
      displayName: 'Mute',
    });
    expect(dimScore(broken, 'continuity')).toBeLessThan(dimScore(clean, 'continuity'));
  });

  it('detects a flat emotional arc', () => {
    const broken: MasterTimeline = JSON.parse(JSON.stringify(clean));
    for (const s of broken.scenes) s.dominantEmotion = 'neutral';
    const report = scorer.score(broken);
    const emotion = report.dimensions.find((d) => d.dimension === 'emotion')!;
    if (broken.scenes.length > 2) {
      expect(emotion.findings.some((f) => f.includes('flat arc'))).toBe(true);
    }
  });

  it('detects an out-of-range emotion for a character', () => {
    const broken: MasterTimeline = JSON.parse(JSON.stringify(clean));
    broken.cast.characters[0].allowedEmotions = ['neutral'];
    for (const e of broken.tracks.voice.events) e.emotion = 'victory';
    const emotion = scorer
      .score(broken)
      .dimensions.find((d) => d.dimension === 'emotion')!;
    expect(emotion.findings.some((f) => f.includes('allowed set'))).toBe(true);
  });

  it('detects scenes with no pauses at all', () => {
    const broken: MasterTimeline = JSON.parse(JSON.stringify(clean));
    broken.tracks.pause.events = [];
    expect(dimScore(broken, 'learning')).toBeLessThan(dimScore(clean, 'learning'));
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

describe('emotionValence', () => {
  it('is positive for positive emotions and negative for negative ones', () => {
    expect(emotionValence('victory')).toBeGreaterThan(0);
    expect(emotionValence('happy')).toBeGreaterThan(0);
    expect(emotionValence('fear')).toBeLessThan(0);
    expect(emotionValence('sad')).toBeLessThan(0);
  });

  it('is neutral for neutral', () => {
    expect(emotionValence('neutral')).toBe(0);
  });

  it('stays within -1..1 for every emotion in the closed union', () => {
    const all = [
      'neutral', 'happy', 'sad', 'fear', 'excited', 'calm', 'hope', 'angry',
      'curious', 'suspense', 'mystery', 'romantic', 'heroic', 'victory',
      'failure', 'wonder', 'surprise',
    ] as const;
    for (const e of all) {
      expect(emotionValence(e)).toBeGreaterThanOrEqual(-1);
      expect(emotionValence(e)).toBeLessThanOrEqual(1);
    }
  });
});

describe('adjacentAge', () => {
  it('accepts adjacent bands as a reasonable substitution', () => {
    expect(adjacentAge('adult', 'middle_aged')).toBe(true);
    expect(adjacentAge('adult', 'adult')).toBe(true);
  });

  it('rejects distant bands', () => {
    expect(adjacentAge('child', 'senior')).toBe(false);
  });

  it('does not penalise unknown bands', () => {
    expect(adjacentAge('adult', 'wizard')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Topic set
// ---------------------------------------------------------------------------

describe('VALIDATION_TOPICS', () => {
  it('has 20 topics', () => {
    expect(VALIDATION_TOPIC_COUNT).toBe(20);
    expect(VALIDATION_TOPICS).toHaveLength(20);
  });

  it('has unique ids', () => {
    expect(new Set(VALIDATION_TOPICS.map((t) => t.id)).size).toBe(20);
  });

  it('covers every style in the review brief', () => {
    const styles = new Set(VALIDATION_TOPICS.map((t) => t.style));
    for (const required of [
      'science', 'history', 'biology', 'physics', 'space', 'geography',
      'mystery', 'documentary', 'emotional_story', 'educational_explanation',
      'multi_speaker', 'interview',
    ]) {
      expect(styles).toContain(required);
    }
  });

  it('gives every topic expectations a reviewer can check against', () => {
    for (const t of VALIDATION_TOPICS) {
      expect(t.expect.emotions.length).toBeGreaterThan(0);
      expect(t.expect.environments.length).toBeGreaterThan(0);
      expect(t.expect.focus.length).toBeGreaterThan(10);
    }
  });

  it('marks sensitive topics as unsuitable for startle effects', () => {
    const tsunami = VALIDATION_TOPICS.find((t) => t.id === 'emo-02')!;
    expect(tsunami.expect.sfxAppropriate).toBe(false);
  });
});
