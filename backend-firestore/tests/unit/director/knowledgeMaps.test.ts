/**
 * Knowledge-map coverage and calibration tests.
 *
 * The schema keeps `Emotion` and `LocationId` as CLOSED unions specifically so
 * these maps can be proven exhaustive. The coverage tests below are what make
 * that guarantee real: adding an emotion or location without a profile/stack
 * fails here rather than silently degrading in production.
 */

import { ALL_EMOTIONS } from '../../../src/core/director/schema/common.schema';
import { ALL_LOCATIONS } from '../../../src/core/director/schema/scene.schema';
import {
  EMOTION_PROFILES,
  allowedEmotionsForRole,
  assertEmotionCoverage,
  clampEmotion,
  emotionProfile,
} from '../../../src/core/director/knowledge/emotionProfiles';
import {
  AMBIENCE_MAP,
  EDUCATIONAL_LOCATIONS,
  ambienceStackFor,
  assertAmbienceCoverage,
} from '../../../src/core/director/knowledge/ambienceMap';
import {
  bedVolumeDb,
  crossfadeMsFor,
  musicCategoryFor,
  tempoForIntensity,
  themeVolumeDb,
} from '../../../src/core/director/knowledge/musicMap';
import {
  MAX_SFX_PER_MINUTE,
  matchTriggers,
} from '../../../src/core/director/knowledge/sfxTriggers';
import {
  ageBandForRole,
  balanceGenders,
  hashToIndex,
  inferGenderFromRole,
  pickVoice,
  voiceCharacterForRole,
} from '../../../src/core/director/knowledge/voiceRegistry';
import {
  buildImagePrompt,
  cameraFor,
  lightingFor,
  paletteFor,
} from '../../../src/core/director/knowledge/visualStyles';

// ---------------------------------------------------------------------------
// Exhaustiveness — the reason the unions are closed
// ---------------------------------------------------------------------------

describe('emotion profile coverage', () => {
  it('defines a profile for EVERY emotion', () => {
    const { missing } = assertEmotionCoverage();
    expect(missing).toEqual([]);
    expect(Object.keys(EMOTION_PROFILES)).toHaveLength(ALL_EMOTIONS.length);
  });

  it('keeps rate multipliers within a natural-sounding band', () => {
    // Outside ~0.9–1.12 TTS starts sounding comical and comprehension drops.
    for (const e of ALL_EMOTIONS) {
      const p = emotionProfile(e);
      expect(p.rateMultiplier).toBeGreaterThanOrEqual(0.85);
      expect(p.rateMultiplier).toBeLessThanOrEqual(1.15);
    }
  });

  it('keeps pitch offsets within the schema range', () => {
    for (const e of ALL_EMOTIONS) {
      const p = emotionProfile(e);
      expect(Math.abs(p.pitchOffset)).toBeLessThanOrEqual(6);
    }
  });

  it('inversely relates stability to expressiveness', () => {
    // Excited should be more variable (lower stability) than calm.
    expect(emotionProfile('excited').elevenLabsStability).toBeLessThan(
      emotionProfile('calm').elevenLabsStability
    );
    expect(emotionProfile('excited').elevenLabsStyle).toBeGreaterThan(
      emotionProfile('calm').elevenLabsStyle
    );
  });

  it('gives dramatic emotions longer trailing pauses than upbeat ones', () => {
    expect(emotionProfile('suspense').pauseAfterMs).toBeGreaterThan(
      emotionProfile('excited').pauseAfterMs
    );
  });

  it('degrades an unknown emotion to neutral', () => {
    expect(emotionProfile('nonsense' as never).emotion).toBe('neutral');
  });
});

describe('ambience map coverage', () => {
  it('defines a stack for EVERY location', () => {
    expect(assertAmbienceCoverage(ALL_LOCATIONS)).toEqual([]);
    expect(Object.keys(AMBIENCE_MAP)).toHaveLength(ALL_LOCATIONS.length);
  });

  it('keeps neutral silent so educational content is unobstructed', () => {
    expect(ambienceStackFor('neutral').layers).toEqual([]);
  });

  it('layers atmospheric locations for believability', () => {
    // A single track sounds like a track; a stack sounds like a place.
    expect(ambienceStackFor('ancient_rome').layers.length).toBeGreaterThanOrEqual(3);
    expect(ambienceStackFor('ocean').layers.length).toBeGreaterThanOrEqual(2);
  });

  it('keeps every ambience layer quiet enough to sit under narration', () => {
    for (const location of ALL_LOCATIONS) {
      for (const layer of ambienceStackFor(location).layers) {
        expect(layer.volumeDb).toBeLessThanOrEqual(-20);
      }
    }
  });

  it('orders a stack base-first', () => {
    const layers = ambienceStackFor('ancient_rome').layers;
    expect(layers[0].layerRole).toBe('base');
  });

  it('classifies study settings as educational locations', () => {
    expect(EDUCATIONAL_LOCATIONS.has('classroom')).toBe(true);
    expect(EDUCATIONAL_LOCATIONS.has('library')).toBe(true);
    expect(EDUCATIONAL_LOCATIONS.has('battlefield')).toBe(false);
  });

  it('degrades an unknown location to the silent neutral stack', () => {
    expect(ambienceStackFor('atlantis' as never).layers).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Music policy
// ---------------------------------------------------------------------------

describe('music map', () => {
  it('maps emotion to a sensible category', () => {
    expect(musicCategoryFor('victory', 'storytelling')).toBe('victory');
    expect(musicCategoryFor('sad', 'storytelling')).toBe('sad');
    expect(musicCategoryFor('mystery', 'storytelling')).toBe('mystery');
  });

  it('constrains an educational episode to calm palettes even for angry scenes', () => {
    // Comprehension first: a study podcast must not sound like a thriller.
    const category = musicCategoryFor('angry', 'educational');
    expect(['educational', 'documentary', 'calm_piano', 'inspirational', 'ambient_synth', 'strings', 'science', 'nature'])
      .toContain(category);
    expect(category).not.toBe('epic');
  });

  it('preserves mood via the affinity chain rather than collapsing to a default', () => {
    // wonder → 'space', which educational disallows. The nearest allowed
    // substitute is ambient_synth — NOT a flat fall back to 'educational',
    // which would discard the mood entirely.
    expect(musicCategoryFor('wonder', 'educational')).toBe('ambient_synth');
    // sad → 'sad' is disallowed for educational; calm_piano is the closest.
    expect(musicCategoryFor('sad', 'educational')).toBe('calm_piano');
    // Unconstrained genres keep the direct mapping.
    expect(musicCategoryFor('wonder', 'storytelling')).toBe('space');
  });

  it('constrains meditation even harder', () => {
    expect(['meditation', 'calm_piano', 'ambient_synth', 'nature']).toContain(
      musicCategoryFor('angry', 'meditation')
    );
  });

  it('escalates tempo with intensity', () => {
    expect(tempoForIntensity(0.1)).toBe('slow');
    expect(tempoForIntensity(0.4)).toBe('moderate');
    expect(tempoForIntensity(0.7)).toBe('upbeat');
    expect(tempoForIntensity(0.95)).toBe('driving');
  });

  it('ALWAYS keeps a bed below the duck floor', () => {
    // This is the narrator-intelligibility guarantee.
    const duckFloor = -12;
    for (const intensity of [0, 0.25, 0.5, 0.75, 1]) {
      for (const ci of ['subtle', 'balanced', 'dramatic'] as const) {
        for (const reduce of [true, false]) {
          const db = bedVolumeDb({ intensity, duckFloorDb: duckFloor, reduceBackground: reduce, cinematicIntensity: ci });
          expect(db).toBeLessThan(duckFloor);
        }
      }
    }
  });

  it('makes subtle mode quieter than dramatic mode', () => {
    const base = { intensity: 0.5, duckFloorDb: -12, reduceBackground: false };
    expect(bedVolumeDb({ ...base, cinematicIntensity: 'subtle' })).toBeLessThan(
      bedVolumeDb({ ...base, cinematicIntensity: 'dramatic' })
    );
  });

  it('lowers the bed further when accessibility asks for reduced background', () => {
    const base = { intensity: 0.5, duckFloorDb: -12, cinematicIntensity: 'balanced' as const };
    expect(bedVolumeDb({ ...base, reduceBackground: true })).toBeLessThan(
      bedVolumeDb({ ...base, reduceBackground: false })
    );
  });

  it('puts intro/outro themes above bed level (nobody speaks over them)', () => {
    expect(themeVolumeDb(-20)).toBeGreaterThan(-20);
  });

  it('gives every non-cut transition a positive crossfade', () => {
    expect(crossfadeMsFor('cut')).toBe(0);
    for (const t of ['crossfade', 'resolve', 'swell', 'drop'] as const) {
      expect(crossfadeMsFor(t)).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// SFX triggers
// ---------------------------------------------------------------------------

describe('sfx triggers', () => {
  it('matches English trigger phrases', () => {
    expect(matchTriggers('Then the door opened slowly')?.trigger.assetId).toBe('sfx_door_open');
    expect(matchTriggers('A loud explosion shook the ground')?.trigger.assetId).toBe('sfx_explosion');
  });

  it('matches Devanagari triggers so Hindi episodes get effects too', () => {
    expect(matchTriggers('अचानक बिजली चमकी')?.trigger.category).toBe('weather');
    expect(matchTriggers('फिर दरवाज़ा खुला')?.trigger.assetId).toBe('sfx_door_open');
  });

  it('returns null for ordinary narration', () => {
    expect(matchTriggers('Photosynthesis converts light into chemical energy')).toBeNull();
  });

  it('prefers the higher-priority trigger when a line matches several', () => {
    // explosion (90) should beat footsteps (40)
    const match = matchTriggers('He was walking when the explosion happened');
    expect(match?.trigger.category).toBe('explosion');
  });

  it('reports the word index for proportional sync', () => {
    const match = matchTriggers('One two three thunder struck');
    expect(match?.wordIndex).toBe(3);
  });

  it('biases cues EARLY so they read as deliberate', () => {
    // Landing just before the word reads intentional; landing late reads as a bug.
    const match = matchTriggers('the thunder rolled');
    expect(match!.trigger.offsetMs).toBeLessThan(0);
  });

  it('caps effect density for an educational product', () => {
    expect(MAX_SFX_PER_MINUTE).toBeLessThanOrEqual(3);
  });

  it('handles empty input safely', () => {
    expect(matchTriggers('')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Voice registry — fixes the "Host and Student sound identical" defect
// ---------------------------------------------------------------------------

describe('voice registry', () => {
  it('maps roles to voice characters', () => {
    expect(voiceCharacterForRole('Teacher')).toBe('warm');
    expect(voiceCharacterForRole('Subject Expert')).toBe('authoritative');
    expect(voiceCharacterForRole('Student')).toBe('curious');
    expect(voiceCharacterForRole('Narrator')).toBe('documentary');
    expect(voiceCharacterForRole('Exam Coach')).toBe('energetic');
  });

  it('maps student-like roles to younger age bands', () => {
    expect(ageBandForRole('Student')).toBe('teen');
    expect(ageBandForRole('Child')).toBe('child');
    expect(ageBandForRole('Teacher')).toBe('adult');
  });

  it('always returns a voice, even for an unmapped combination', () => {
    const voice = pickVoice({
      gender: 'neutral',
      ageBand: 'elderly',
      character: 'documentary',
      characterId: 'char_x',
    });
    expect(voice.voiceId).toBeTruthy();
    expect(voice.provider).toBeTruthy();
  });

  it('is deterministic for the same character id', () => {
    const args = { gender: 'female' as const, ageBand: 'adult' as const, character: 'warm' as const, characterId: 'char_abc' };
    expect(pickVoice(args).voiceId).toBe(pickVoice(args).voiceId);
  });

  it('records prosody support so the synthesizer can omit pitch/rate', () => {
    // Chirp 3 HD rejects prosody; the flag must be carried, not assumed.
    const voice = pickVoice({ gender: 'male', ageBand: 'adult', character: 'warm', characterId: 'c1' });
    expect(typeof voice.supportsProsody).toBe('boolean');
  });

  it('infers gender only from clear role conventions', () => {
    expect(inferGenderFromRole('Mother')).toBe('female');
    expect(inferGenderFromRole('King')).toBe('male');
    // Personal names are NOT used — unreliable across languages.
    expect(inferGenderFromRole('Priya')).toBe('neutral');
    expect(inferGenderFromRole('Teacher')).toBe('neutral');
  });

  it('alternates unspecified genders for vocal contrast', () => {
    const assigned = balanceGenders([
      { id: 'a', gender: 'neutral' },
      { id: 'b', gender: 'neutral' },
    ]);
    expect(assigned.get('a')).not.toBe(assigned.get('b'));
  });

  it('preserves explicit genders and opposes the next auto-assignment', () => {
    const assigned = balanceGenders([
      { id: 'a', gender: 'male' },
      { id: 'b', gender: 'neutral' },
    ]);
    expect(assigned.get('a')).toBe('male');
    expect(assigned.get('b')).toBe('female');
  });

  it('distributes distinct ids across equivalent voices', () => {
    // Two adult female characters must be able to differ.
    const results = new Set(
      ['char_1', 'char_2', 'char_3', 'char_4'].map(
        (id) => pickVoice({ gender: 'female', ageBand: 'adult', character: 'warm', characterId: id }).voiceId
      )
    );
    expect(results.size).toBeGreaterThan(1);
  });

  it('hashes deterministically into range', () => {
    expect(hashToIndex('abc', 1)).toBe(0);
    const i = hashToIndex('abc', 5);
    expect(i).toBeGreaterThanOrEqual(0);
    expect(i).toBeLessThan(5);
    expect(hashToIndex('abc', 5)).toBe(i);
  });
});

// ---------------------------------------------------------------------------
// Visual styles
// ---------------------------------------------------------------------------

describe('visual styles', () => {
  it('provides a palette for every emotion', () => {
    for (const e of ALL_EMOTIONS) {
      const palette = paletteFor(e);
      expect(palette.primary).toMatch(/^#/);
      expect(palette.mood).toBeTruthy();
    }
  });

  it('lets strong emotion override time-of-day lighting', () => {
    const setting = { location: 'forest' as const, locationDescription: '', timeOfDay: 'midday' as const, environment: 'outdoor' as const };
    expect(lightingFor(setting, 'mystery')).toBe('low_key');
    expect(lightingFor(setting, 'neutral')).toBe('harsh'); // midday
  });

  it('opens wide and closes on a pull-back', () => {
    expect(cameraFor(0, 3, 'neutral').angle).toBe('wide');
    expect(cameraFor(2, 3, 'neutral').movement).toBe('zoom_out');
  });

  it('forbids text in generated imagery', () => {
    // Text artefacts are the most common tell, and wrong words mislead learners.
    const prompt = buildImagePrompt({
      setting: { location: 'classroom', locationDescription: 'a sunlit classroom', timeOfDay: 'morning', environment: 'indoor' },
      emotion: 'curious',
      genre: 'educational',
      sceneTitle: 'Intro',
      topic: 'Photosynthesis',
    });
    expect(prompt).toMatch(/no text/i);
    expect(prompt).toMatch(/no watermarks/i);
    expect(prompt).toContain('sunlit classroom');
  });
});

// ---------------------------------------------------------------------------
// Role-based emotion ranges
// ---------------------------------------------------------------------------

describe('role emotion ranges', () => {
  it('keeps a Student out of heroic territory', () => {
    expect(allowedEmotionsForRole('Student')).not.toContain('heroic');
    expect(allowedEmotionsForRole('Student')).toContain('curious');
  });

  it('gives a Narrator a broad dramatic range', () => {
    const allowed = allowedEmotionsForRole('Narrator');
    expect(allowed).toContain('suspense');
    expect(allowed).toContain('mystery');
  });

  it('always includes neutral so clamping has a safe target', () => {
    for (const role of ['Teacher', 'Student', 'Narrator', 'Villain', 'Unknown Role']) {
      expect(allowedEmotionsForRole(role)).toContain('neutral');
    }
  });

  it('clamps a disallowed emotion to neutral', () => {
    expect(clampEmotion('angry', ['neutral', 'calm'])).toBe('neutral');
    expect(clampEmotion('calm', ['neutral', 'calm'])).toBe('calm');
  });

  it('falls back to the first allowed emotion when neutral is absent', () => {
    expect(clampEmotion('angry', ['victory'])).toBe('victory');
  });
});
