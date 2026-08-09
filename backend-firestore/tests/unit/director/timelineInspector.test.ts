/**
 * TimelineInspector + report renderer tests.
 *
 * The inspector is the gate before audio rendering, so its job is to CATCH
 * defects. Most tests below therefore construct a deliberately broken timeline
 * and assert the corresponding metric flips to warn/bad with an actionable hint.
 * A metric that stays green on broken input is worse than no metric at all.
 */

import { TimelineInspector, formatMs, truncate } from '../../../src/core/director/inspector/TimelineInspector';
import { renderReport } from '../../../src/core/director/inspector/renderReport';
import {
  deriveChaptersFromSegments,
  inferRoleFromSpeakerName,
  inferSpeakerStyle,
  normalizeTranscript,
} from '../../../src/core/director/inspector/DirectorDryRun';
import { AssetManifest } from '../../../src/services/media/assets/AssetManifest';
import { makeCatalogue, makeScene, makeTimeline } from './fixtures';

const inspector = new TimelineInspector();

function metric(report: ReturnType<TimelineInspector['inspect']>, key: string) {
  const m = report.quality.metrics.find((x) => x.key === key);
  if (!m) throw new Error(`metric ${key} not found`);
  return m;
}

// ---------------------------------------------------------------------------
// Structure
// ---------------------------------------------------------------------------

describe('TimelineInspector — report structure', () => {
  it('produces every documented view', () => {
    const report = inspector.inspect(makeTimeline());
    for (const key of [
      'summary', 'scenes', 'emotion', 'speakers', 'learning',
      'music', 'ambience', 'sfx', 'pauses', 'visual',
      'knowledgeGraph', 'assets', 'quality', 'validation',
    ]) {
      expect(report).toHaveProperty(key);
    }
  });

  it('summarises identity and structure', () => {
    const { summary } = inspector.inspect(makeTimeline());
    expect(summary.podcastId).toBe('pod_test_1');
    expect(summary.phase).toBe('planned');
    expect(summary.sceneCount).toBe(1);
    expect(summary.speakerCount).toBe(1);
    expect(summary.eventCount).toBe(3); // 2 voice + 1 music
    expect(summary.totalDurationLabel).toBe('0:20');
  });

  it('computes each scene’s share of the episode', () => {
    const report = inspector.inspect(makeTimeline());
    expect(report.scenes[0].share).toBeCloseTo(1, 2);
    expect(report.scenes[0].lineCount).toBe(2);
    expect(report.scenes[0].lineRange).toBe('0–1');
  });

  it('reports speaker line share and voice binding', () => {
    const report = inspector.inspect(makeTimeline());
    const speaker = report.speakers[0];
    expect(speaker.lineCount).toBe(2);
    expect(speaker.lineShare).toBe(1);
    expect(speaker.voiceProvider).toBe('elevenlabs');
    expect(speaker.supportsProsody).toBe(true);
    expect(speaker.outOfRange).toEqual([]);
  });

  it('presents the learning view in TEACHING order, not array order', () => {
    const report = inspector.inspect(makeTimeline(), {
      producerPlan: {
        learningIntelligence: {
          concepts: [
            { id: 'b', label: 'Second', bloomLevel: 'understand', difficulty: 'advanced', prerequisites: ['a'] },
            { id: 'a', label: 'First', bloomLevel: 'remember', difficulty: 'beginner', prerequisites: [] },
          ],
          teachingSequence: ['a', 'b'],
        },
        educational: { emphasisConcepts: ['b'] },
      },
    });
    expect(report.learning.map((l) => l.label)).toEqual(['First', 'Second']);
    expect(report.learning[1].emphasised) .toBe(true);
    expect(report.learning[0].emphasised).toBe(false);
  });

  it('surfaces knowledge-graph references when present', () => {
    const report = inspector.inspect(makeTimeline(), {
      producerPlan: {
        learningIntelligence: {
          concepts: [
            { id: 'a', label: 'Photosynthesis', knowledgeGraphRef: 'kg://concept/photosynthesis' },
            { id: 'b', label: 'No ref' },
          ],
        },
      },
    });
    expect(report.knowledgeGraph).toHaveLength(1);
    expect(report.knowledgeGraph[0].graphRef).toBe('kg://concept/photosynthesis');
  });

  it('handles a timeline with no producer plan', () => {
    const report = inspector.inspect(makeTimeline());
    expect(report.learning).toEqual([]);
    expect(report.knowledgeGraph).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Asset resolution
// ---------------------------------------------------------------------------

describe('TimelineInspector — assets', () => {
  it('marks assets resolved against the manifest', () => {
    // The fixture music asset IS in the fixture catalogue.
    const { manifest } = AssetManifest.from(makeCatalogue());
    const report = inspector.inspect(makeTimeline(), { manifest });
    expect(report.assets.referenced).toBe(1);
    expect(report.assets.resolved).toBe(1);
    expect(report.assets.missing).toEqual([]);
    expect(report.music[0].assetResolved).toBe(true);
  });

  it('names the events that use a missing asset', () => {
    const { manifest } = AssetManifest.from({ version: 1, root: 'a', assets: [] });
    const report = inspector.inspect(makeTimeline(), { manifest });
    expect(report.assets.missing).toHaveLength(1);
    expect(report.assets.missing[0].id).toBe('edu_soft_bed_01');
    // Knowing WHICH event referenced it is what makes this actionable.
    expect(report.assets.missing[0].usedBy).toContain('m_0');
    expect(report.assets.byKind.music.missing).toBe(1);
  });

  it('skips resolution checks when no manifest is supplied', () => {
    const report = inspector.inspect(makeTimeline());
    expect(report.music[0].assetResolved).toBeUndefined();
    expect(report.assets.missing).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Quality metrics — each must FIRE on the defect it exists to catch
// ---------------------------------------------------------------------------

describe('quality metrics catch real defects', () => {
  it('scores a clean timeline highly', () => {
    const { manifest } = AssetManifest.from(makeCatalogue());
    const report = inspector.inspect(makeTimeline(), { manifest });
    expect(report.quality.score).toBeGreaterThanOrEqual(95);
    expect(metric(report, 'validation').status).toBe('good');
  });

  it('flags invariant errors as bad and names the codes', () => {
    const t = makeTimeline();
    t.cast.primarySpeakerId = 'char_ghost';
    const report = inspector.inspect(t);
    const m = metric(report, 'validation');
    expect(m.status).toBe('bad');
    expect(m.hint).toContain('CAST_PRIMARY_MISSING');
  });

  it('flags a dominating scene — the most common analyzer defect', () => {
    const t = makeTimeline({
      scenes: [
        makeScene({ id: 's0', index: 0, estimatedDurationMs: 90_000, startMs: 0, endMs: 90_000, lineRange: { startLine: 0, endLine: 0 } }),
        makeScene({ id: 's1', index: 1, estimatedDurationMs: 10_000, startMs: 90_000, endMs: 100_000, lineRange: { startLine: 1, endLine: 1 } }),
      ],
      totalDurationMs: 100_000,
      phase: 'resolved',
    });
    t.tracks.voice.events.forEach((e, i) => {
      e.sceneId = i === 0 ? 's0' : 's1';
      e.audio = { storagePath: `x_${i}.mp3`, actualDurationMs: 1000 };
    });
    t.tracks.music.events[0].sceneId = 's0';
    t.emotionCurve.keyframes.forEach((k) => (k.sceneId = 's0'));

    const m = metric(inspector.inspect(t), 'scene_balance');
    expect(m.status).toBe('bad');
    expect(m.hint).toMatch(/boundary detection/i);
  });

  it('flags a one-sided "conversation"', () => {
    const t = makeTimeline();
    // Two characters, but only one ever speaks.
    t.cast.characters.push({
      ...t.cast.characters[0],
      id: 'char_silent',
      displayName: 'Silent',
      role: 'Student',
    });
    const m = metric(inspector.inspect(t), 'speaker_balance');
    expect(m.status).toBe('bad');
    expect(m.hint).toMatch(/one voice dominates/i);
  });

  it('does NOT flag speaker balance for a single-narrator episode', () => {
    // A solo narrator legitimately says 100% of the lines.
    expect(metric(inspector.inspect(makeTimeline()), 'speaker_balance').status).toBe('good');
  });

  it('flags excessive SFX density for educational content', () => {
    const t = makeTimeline();
    for (let i = 0; i < 20; i++) {
      t.tracks.sfx.events.push({
        id: `sfx_${i}`, kind: 'sfx', startMs: i * 500, durationMs: 400,
        sceneId: 'scene_0', priority: 50, assetId: 'sfx_x', effectCategory: 'door',
        syncMode: 'after_line', offsetMs: 0, volumeDb: -12, fadeInMs: 0, fadeOutMs: 100,
      });
    }
    const m = metric(inspector.inspect(t), 'sfx_density');
    expect(m.status).toBe('bad');
    expect(m.hint).toMatch(/too many effects/i);
  });

  it('flags a music hard stop', () => {
    const t = makeTimeline();
    const first = t.tracks.music.events[0];
    t.tracks.music.events.push({ ...first, id: 'm_1', startMs: 20_000 });
    // first is now non-final with crossfadeToNextMs = 0
    const m = metric(inspector.inspect(t), 'music_continuity');
    expect(m.status).toBe('bad');
    expect(m.hint).toMatch(/cut abruptly/i);
  });

  it('flags a bed loud enough to mask narration', () => {
    const t = makeTimeline();
    t.tracks.music.events[0].volumeDb = -2; // floor is -12
    const m = metric(inspector.inspect(t), 'duck_headroom');
    expect(m.status).toBe('bad');
    expect(m.hint).toMatch(/mask narration/i);
  });

  it('flags an uncovered script line', () => {
    const t = makeTimeline({
      scenes: [makeScene({ lineRange: { startLine: 0, endLine: 0 } })],
    });
    const m = metric(inspector.inspect(t), 'line_coverage');
    expect(m.value).toBe(1);
    expect(m.status).toBe('bad');
    expect(m.hint).toMatch(/no scene/i);
  });

  it('flags an out-of-range emotion', () => {
    const t = makeTimeline();
    t.tracks.voice.events[0].emotion = 'angry'; // not in the fixture's allowed set
    const m = metric(inspector.inspect(t), 'emotion_range');
    expect(m.value).toBe(1);
    expect(m.status).toBe('warn');
  });

  it('flags a flat emotion curve on a multi-scene episode', () => {
    const t = makeTimeline({
      scenes: [
        makeScene({ id: 's0', index: 0, lineRange: { startLine: 0, endLine: 0 } }),
        makeScene({ id: 's1', index: 1, lineRange: { startLine: 1, endLine: 1 } }),
        makeScene({ id: 's2', index: 2, lineRange: { startLine: 1, endLine: 1 } }),
      ],
    });
    t.tracks.voice.events.forEach((e, i) => (e.sceneId = i === 0 ? 's0' : 's1'));
    t.tracks.music.events[0].sceneId = 's0';
    t.emotionCurve.keyframes = [
      { atProgress: 0, emotion: 'neutral', intensity: 0.4, sceneId: 's0' },
      { atProgress: 1, emotion: 'neutral', intensity: 0.4, sceneId: 's1' },
    ];
    const m = metric(inspector.inspect(t), 'emotion_variety');
    expect(m.status).toBe('warn');
    expect(m.hint).toMatch(/monotone/i);
  });

  it('penalises bad more heavily than warn', () => {
    const clean = inspector.inspect(makeTimeline(), {
      manifest: AssetManifest.from(makeCatalogue()).manifest,
    }).quality.score;

    const warned = makeTimeline();
    warned.tracks.voice.events[0].emotion = 'angry';
    const warnScore = inspector.inspect(warned, {
      manifest: AssetManifest.from(makeCatalogue()).manifest,
    }).quality.score;

    const broken = makeTimeline();
    broken.cast.primarySpeakerId = 'char_ghost';
    const badScore = inspector.inspect(broken, {
      manifest: AssetManifest.from(makeCatalogue()).manifest,
    }).quality.score;

    expect(warnScore).toBeLessThan(clean);
    expect(badScore).toBeLessThan(warnScore);
  });

  it('never returns a negative score', () => {
    const t = makeTimeline();
    t.cast.primarySpeakerId = 'char_ghost';
    t.tracks.music.events[0].volumeDb = -1;
    t.scenes = [makeScene({ lineRange: { startLine: 0, endLine: 0 } })];
    expect(inspector.inspect(t).quality.score).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

describe('renderReport', () => {
  it('renders every section heading', () => {
    const { manifest } = AssetManifest.from(makeCatalogue());
    const text = renderReport(inspector.inspect(makeTimeline(), { manifest }));

    for (const heading of [
      'TIMELINE INSPECTION', 'QUALITY', 'VALIDATION', 'SCENE TIMELINE',
      'EMOTION CURVE', 'SPEAKER TIMELINE', 'MUSIC TIMELINE',
      'AMBIENCE TIMELINE', 'SFX TIMELINE', 'ASSET REFERENCES',
    ]) {
      expect(text).toContain(heading);
    }
  });

  it('reports a clean timeline as satisfying all invariants', () => {
    const text = renderReport(inspector.inspect(makeTimeline()));
    expect(text).toContain('all invariants satisfied');
  });

  it('renders validation errors with their codes', () => {
    const t = makeTimeline();
    t.cast.primarySpeakerId = 'char_ghost';
    const text = renderReport(inspector.inspect(t));
    expect(text).toContain('CAST_PRIMARY_MISSING');
  });

  it('marks a missing asset in the asset section', () => {
    const { manifest } = AssetManifest.from({ version: 1, root: 'a', assets: [] });
    const text = renderReport(inspector.inspect(makeTimeline(), { manifest }));
    expect(text).toMatch(/Missing:/);
    expect(text).toContain('edu_soft_bed_01');
  });

  it('shows "(none)" for empty audio tracks rather than omitting them', () => {
    const text = renderReport(inspector.inspect(makeTimeline()));
    // Absence must be visible — a silently missing section hides a defect.
    expect(text).toContain('AMBIENCE TIMELINE');
    expect(text).toContain('(none)');
  });

  it('summarises pauses by type instead of listing hundreds', () => {
    const t = makeTimeline();
    for (let i = 0; i < 30; i++) {
      t.tracks.pause.events.push({
        id: `pause_${i}`, kind: 'pause', startMs: i * 1000, durationMs: 400,
        sceneId: 'scene_0', priority: 30, pauseType: 'breath', holdBackground: true,
      });
    }
    const text = renderReport(inspector.inspect(t));
    expect(text).toContain('PAUSE TIMELINE');
    expect(text).toContain('breath');
    expect(text).toContain('30');
  });

  it('produces a non-trivial report', () => {
    expect(renderReport(inspector.inspect(makeTimeline())).length).toBeGreaterThan(500);
  });
});

// ---------------------------------------------------------------------------
// Dry-run input reconstruction
// ---------------------------------------------------------------------------

describe('DirectorDryRun input reconstruction', () => {
  it('normalizes all three historical transcript shapes', () => {
    const segs = [{ speaker: 'A', text: 'x' }];
    expect(normalizeTranscript(segs)).toEqual(segs);
    expect(normalizeTranscript({ segments: segs })).toEqual(segs);
    expect(normalizeTranscript({ transcript: segs })).toEqual(segs);
    expect(normalizeTranscript(null)).toEqual([]);
    expect(normalizeTranscript({ nope: 1 })).toEqual([]);
  });

  it('recovers roles from English speaker names', () => {
    expect(inferRoleFromSpeakerName('Teacher')).toBe('Teacher');
    expect(inferRoleFromSpeakerName('The Student')).toBe('Student');
    expect(inferRoleFromSpeakerName('Narrator')).toBe('Narrator');
    expect(inferRoleFromSpeakerName('Subject Expert')).toBe('Subject Expert');
  });

  it('recovers roles from Devanagari speaker names', () => {
    // Hindi episodes store role words directly as the speaker name.
    expect(inferRoleFromSpeakerName('शिक्षक')).toBe('Teacher');
    expect(inferRoleFromSpeakerName('छात्र')).toBe('Student');
  });

  it('defaults a bare personal name to Teacher', () => {
    expect(inferRoleFromSpeakerName('Priya')).toBe('Teacher');
  });

  it('infers speaker style from the cast', () => {
    expect(inferSpeakerStyle([])).toBe('solo_narrator');
    expect(inferSpeakerStyle(['Narrator'])).toBe('solo_narrator');
    expect(inferSpeakerStyle(['शिक्षक', 'छात्र'])).toBe('teacher_student');
    expect(inferSpeakerStyle(['Host', 'Subject Expert'])).toBe('interview');
    expect(inferSpeakerStyle(['A', 'B', 'C'])).toBe('discussion');
  });

  it('derives chapter stubs from transcript chapterIndex values', () => {
    const chapters = deriveChaptersFromSegments([
      { chapterIndex: 0 }, { chapterIndex: 0 }, { chapterIndex: 2 },
    ]);
    expect(chapters.map((c) => c.index)).toEqual([0, 2]);
  });

  it('treats missing chapterIndex as chapter 0', () => {
    expect(deriveChaptersFromSegments([{}, {}])).toEqual([{ index: 0, title: 'Segment 1' }]);
  });
});

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

describe('formatting helpers', () => {
  it('formats m:ss and h:mm:ss', () => {
    expect(formatMs(0)).toBe('0:00');
    expect(formatMs(65_000)).toBe('1:05');
    expect(formatMs(3_725_000)).toBe('1:02:05');
  });

  it('handles invalid durations safely', () => {
    expect(formatMs(-1)).toBe('0:00');
    expect(formatMs(NaN)).toBe('0:00');
  });

  it('truncates only when needed', () => {
    expect(truncate('short', 10)).toBe('short');
    expect(truncate('abcdefghij', 5)).toBe('abcde…');
  });
});
