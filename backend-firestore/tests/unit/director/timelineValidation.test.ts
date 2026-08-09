/**
 * Semantic invariant tests.
 *
 * Each test mutates exactly ONE field of a known-valid timeline and asserts the
 * matching invariant fires. These invariants are the safety net for backward
 * compatibility and audio quality, so they are the highest-value tests in
 * Phase A.
 */

import {
  formatValidationResult,
  validateInvariants,
  validateLineCoverage,
  validateTimeline,
  parseTimeline,
} from '../../../src/core/director/validation';
import { makeCharacter, makeScene, makeTimeline } from './fixtures';

describe('validateTimeline (shape + semantics)', () => {
  it('passes a minimal valid timeline with no errors', () => {
    const result = validateTimeline(makeTimeline());
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('reports SHAPE_INVALID for a non-timeline value', () => {
    const result = validateTimeline({ nonsense: true });
    expect(result.valid).toBe(false);
    expect(result.errors.every((e) => e.code === 'SHAPE_INVALID')).toBe(true);
  });

  it('parseTimeline returns a typed timeline on success', () => {
    const parsed = parseTimeline(makeTimeline());
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.timeline.podcastId).toBe('pod_test_1');
  });
});

// ---------------------------------------------------------------------------
// The critical backward-compatibility invariant
// ---------------------------------------------------------------------------

describe('VOICE_LINE_MAPPING — protects transcript, chapters and click-to-seek', () => {
  it('fails when lineIndex is not 1:1 with position', () => {
    const t = makeTimeline();
    t.tracks.voice.events[1].lineIndex = 5; // gap
    const result = validateInvariants(t);
    expect(result.valid).toBe(false);
    expect(result.errors.map((e) => e.code)).toContain('VOICE_LINE_MAPPING');
  });

  it('fails when voice events are reordered', () => {
    const t = makeTimeline();
    t.tracks.voice.events.reverse();
    const result = validateInvariants(t);
    expect(result.valid).toBe(false);
    expect(result.errors.map((e) => e.code)).toContain('VOICE_LINE_MAPPING');
  });

  it('fails when there are no voice events at all', () => {
    const t = makeTimeline();
    t.tracks.voice.events = [];
    const result = validateInvariants(t);
    expect(result.valid).toBe(false);
    expect(result.errors.map((e) => e.code)).toContain('VOICE_EMPTY');
  });

  it('validateLineCoverage fails on a count mismatch with the script', () => {
    const t = makeTimeline(); // 2 voice events
    const result = validateLineCoverage(t, 3);
    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe('VOICE_LINE_MAPPING');
  });

  it('validateLineCoverage passes when counts agree', () => {
    expect(validateLineCoverage(makeTimeline(), 2).valid).toBe(true);
  });

  it('warns when a script line falls outside every scene range', () => {
    const t = makeTimeline({
      scenes: [makeScene({ lineRange: { startLine: 0, endLine: 0 } })],
    });
    const result = validateLineCoverage(t, 2);
    expect(result.warnings.map((w) => w.code)).toContain('SCENE_LINE_COVERAGE');
  });
});

// ---------------------------------------------------------------------------
// Audio quality invariants
// ---------------------------------------------------------------------------

describe('MUSIC_NO_HARD_STOP — "never stop abruptly"', () => {
  it('fails when a non-final music bed has no crossfade', () => {
    const t = makeTimeline();
    const first = t.tracks.music.events[0];
    t.tracks.music.events.push({
      ...first,
      id: 'm_1',
      startMs: 20_000,
      crossfadeToNextMs: 0,
    });
    // first is now non-final with crossfadeToNextMs = 0
    const result = validateInvariants(t);
    expect(result.valid).toBe(false);
    expect(result.errors.map((e) => e.code)).toContain('MUSIC_NO_HARD_STOP');
  });

  it('allows crossfadeToNextMs = 0 on the final bed', () => {
    // The fixture's single bed is final with 0 — must be valid.
    expect(validateInvariants(makeTimeline()).valid).toBe(true);
  });

  it('permits an explicit hard cut when transitionType is "cut"', () => {
    const t = makeTimeline();
    const first = t.tracks.music.events[0];
    first.transitionType = 'cut';
    t.tracks.music.events.push({
      ...first,
      id: 'm_1',
      startMs: 20_000,
      transitionType: 'crossfade',
    });
    const result = validateInvariants(t);
    expect(result.errors.map((e) => e.code)).not.toContain('MUSIC_NO_HARD_STOP');
  });
});

describe('MUSIC_DUCK_HEADROOM — narrator must stay intelligible', () => {
  it('warns when a bed can exceed the duck floor', () => {
    const t = makeTimeline();
    // duck floor = voiceBusGainDb(0) + duckingDb(-12) = -12dB
    t.tracks.music.events[0].volumeDb = -4;
    const result = validateInvariants(t);
    expect(result.warnings.map((w) => w.code)).toContain('MUSIC_DUCK_HEADROOM');
  });

  it('does not warn at a safe bed level', () => {
    const result = validateInvariants(makeTimeline()); // bed at -18dB
    expect(result.warnings.map((w) => w.code)).not.toContain('MUSIC_DUCK_HEADROOM');
  });
});

// ---------------------------------------------------------------------------
// Referential integrity
// ---------------------------------------------------------------------------

describe('referential integrity', () => {
  it('fails when a voice event references an unknown character', () => {
    const t = makeTimeline();
    t.tracks.voice.events[0].characterId = 'char_ghost';
    const result = validateInvariants(t);
    expect(result.valid).toBe(false);
    expect(result.errors.map((e) => e.code)).toContain('CAST_REFS');
  });

  it('fails when primarySpeakerId is not in the cast', () => {
    const t = makeTimeline();
    t.cast.primarySpeakerId = 'char_ghost';
    const result = validateInvariants(t);
    expect(result.valid).toBe(false);
    expect(result.errors.map((e) => e.code)).toContain('CAST_PRIMARY_MISSING');
  });

  it('fails when narratorId is not in the cast', () => {
    const t = makeTimeline();
    t.cast.narratorId = 'char_ghost';
    const result = validateInvariants(t);
    expect(result.valid).toBe(false);
    expect(result.errors.map((e) => e.code)).toContain('CAST_REFS');
  });

  it('fails when an event references an unknown scene', () => {
    const t = makeTimeline();
    t.tracks.music.events[0].sceneId = 'scene_ghost';
    const result = validateInvariants(t);
    expect(result.valid).toBe(false);
    expect(result.errors.map((e) => e.code)).toContain('SCENE_REFS');
  });

  it('fails when scenes are not strictly ordered by index', () => {
    const t = makeTimeline({
      scenes: [makeScene({ id: 's0', index: 1 }), makeScene({ id: 's1', index: 0 })],
    });
    // repoint events at a real scene so only SCENE_ORDER fires
    t.tracks.voice.events.forEach((e) => (e.sceneId = 's0'));
    t.tracks.music.events.forEach((e) => (e.sceneId = 's0'));
    t.emotionCurve.keyframes.forEach((k) => (k.sceneId = 's0'));
    const result = validateInvariants(t);
    expect(result.errors.map((e) => e.code)).toContain('SCENE_ORDER');
  });
});

// ---------------------------------------------------------------------------
// Emotion range
// ---------------------------------------------------------------------------

describe('EMOTION_NOT_ALLOWED', () => {
  it('warns (not errors) when a line exceeds the character emotion range', () => {
    const t = makeTimeline();
    // fixture character allows: neutral, calm, curious, happy, hope
    t.tracks.voice.events[0].emotion = 'angry';
    const result = validateInvariants(t);
    expect(result.valid).toBe(true); // advisory only — synthesizer clamps
    expect(result.warnings.map((w) => w.code)).toContain('EMOTION_NOT_ALLOWED');
  });

  it('accepts an emotion inside the allowed range', () => {
    const t = makeTimeline();
    t.tracks.voice.events[0].emotion = 'hope';
    const result = validateInvariants(t);
    expect(result.warnings.map((w) => w.code)).not.toContain('EMOTION_NOT_ALLOWED');
  });
});

// ---------------------------------------------------------------------------
// Phase-specific rules
// ---------------------------------------------------------------------------

describe('resolved-phase rules', () => {
  it('fails when a resolved timeline is missing synthesized audio', () => {
    const t = makeTimeline({ phase: 'resolved' });
    const result = validateInvariants(t);
    expect(result.valid).toBe(false);
    expect(result.errors.map((e) => e.code)).toContain('RESOLVED_WITHOUT_AUDIO');
  });

  it('passes when every voice event carries audio', () => {
    const t = makeTimeline({ phase: 'resolved' });
    t.tracks.voice.events.forEach((e, i) => {
      e.audio = { storagePath: `chunks/seg_${i}.mp3`, actualDurationMs: 10_000 };
    });
    expect(validateInvariants(t).valid).toBe(true);
  });

  it('does not require audio while still in the planned phase', () => {
    expect(validateInvariants(makeTimeline({ phase: 'planned' })).valid).toBe(true);
  });

  it('warns when a resolved event overruns totalDurationMs', () => {
    const t = makeTimeline({ phase: 'resolved', totalDurationMs: 5_000 });
    t.tracks.voice.events.forEach((e, i) => {
      e.audio = { storagePath: `chunks/seg_${i}.mp3`, actualDurationMs: 10_000 };
    });
    const result = validateInvariants(t);
    expect(result.warnings.map((w) => w.code)).toContain('EVENT_EXCEEDS_DURATION');
  });
});

describe('STINGER_MISSING_ASSET', () => {
  it('warns when a stinger transition has no asset', () => {
    const t = makeTimeline({
      scenes: [
        makeScene({ transitionIn: { style: 'stinger', durationMs: 800 } }),
      ],
    });
    const result = validateInvariants(t);
    expect(result.warnings.map((w) => w.code)).toContain('STINGER_MISSING_ASSET');
  });
});

describe('formatValidationResult', () => {
  it('reports "valid" for a clean timeline', () => {
    expect(formatValidationResult(validateInvariants(makeTimeline()))).toBe('valid');
  });

  it('summarises codes for a failing timeline', () => {
    const t = makeTimeline();
    t.cast.primarySpeakerId = 'char_ghost';
    const summary = formatValidationResult(validateInvariants(t));
    expect(summary).toContain('CAST_PRIMARY_MISSING');
    expect(summary).toContain('error');
  });
});
