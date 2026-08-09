/**
 * SFX trigger matching + one-shot fingerprint identity.
 *
 * Both behaviours here failed silently in production and produced plausible-
 * looking output, which is why they get tests rather than a comment:
 *
 *   1. Substring matching fired a RAIN effect on "rough ter-RAIN" during a Moon
 *      landing, while none of the words that mattered (landed, touched down,
 *      hatch, computer) had triggers at all — so the layer was empty except for
 *      one wrong cue.
 *
 *   2. `requirementFingerprint` ignored `triggerWord`, so a rocket launch, an
 *      engine rumble, a landing thud and a passing train — all category
 *      `vehicle` — collapsed onto ONE cache key. The first asset generated
 *      answered all four, so a Moon landing played a train.
 */

import {
  SFX_TRIGGERS,
  matchTriggers,
} from '../../../src/core/director/knowledge/sfxTriggers';
import {
  AssetRequirementSchema,
  requirementFingerprint,
} from '../../../src/core/director/schema/requirement.schema';

describe('matchTriggers word boundaries', () => {
  it('does not fire rain for "terrain"', () => {
    // The exact false positive from the Apollo 11 episode.
    const m = matchTriggers('Armstrong scanned the rough terrain for a landing site.');
    expect(m?.trigger.category).not.toBe('weather');
  });

  it('rejects other words that merely contain a pattern', () => {
    for (const text of [
      'the training was intense',
      'under considerable strain',
      'he used his brain',
      'a constrained budget',
    ]) {
      const m = matchTriggers(text);
      // None of these should produce a weather/rain cue.
      if (m) expect(m.trigger.category).not.toBe('weather');
    }
  });

  it('still matches the real word', () => {
    expect(matchTriggers('the rain hammered the roof')?.trigger.category).toBe('weather');
  });

  it('allows inflections, because many patterns are deliberately stems', () => {
    // 'footstep' -> footsteps, 'door clos' -> closed, 'fire crackl' -> crackling
    expect(matchTriggers('his footsteps echoed')?.trigger.category).toBe('footsteps');
    // Pattern is 'door clos', so the words must appear in that order.
    expect(matchTriggers('the door closed behind him')?.trigger.category).toBe('door');
    expect(matchTriggers('the fire crackling beside them')?.trigger.category).toBe('fire');
  });

  it('matches Devanagari triggers, where \\b would never work', () => {
    // JS \w is [A-Za-z0-9_], so \b never matches beside Devanagari. The guard is
    // written as an ASCII-letter lookaround precisely so Hindi keeps matching.
    expect(matchTriggers('दरवाज़ा खुला और वह अंदर आया')).toBeTruthy();
    expect(matchTriggers('अचानक एक विस्फोट हुआ')).toBeTruthy();
  });

  it('matches the narrative events that a landing story needs', () => {
    const cases: [string, string][] = [
      ['The Eagle had landed on the Sea of Tranquility.', 'vehicle'],
      ['They touched down with seconds of fuel left.', 'vehicle'],
      ['The onboard computer flashed a warning.', 'ui'],
      ['Hours later the hatch finally opened.', 'door'],
      ['The alarm sounded through the cabin.', 'ui'],
      ['Only radio static came back.', 'phone'],
    ];
    for (const [text, category] of cases) {
      expect(matchTriggers(text)?.trigger.category).toBe(category);
    }
  });

  it('returns null for ordinary expository prose', () => {
    expect(
      matchTriggers('Energy is quantised, meaning it comes in discrete packets.')
    ).toBeNull();
  });

  it('has no trigger pattern that is a bare substring of a common word', () => {
    // Guards against reintroducing a 'rain'-style pattern without boundaries.
    // 'training' is here because it caught a real bug: 'train' plus the allowed
    // -ing inflection matched it, putting a locomotive under astronaut training.
    const traps = [
      'terrain', 'training', 'brain', 'strain', 'rainbow', 'grain', 'hatched',
    ];
    for (const trap of traps) {
      const m = matchTriggers(`the ${trap} was there`);
      if (m) {
        // If something matched, it must not have matched INSIDE the trap word.
        expect(trap.includes(m.matchedPattern)).toBe(false);
      }
    }
  });
});

describe('requirementFingerprint identity for one-shots', () => {
  const sfx = (category: string, triggerWord?: string) =>
    AssetRequirementSchema.parse({
      kind: 'sfx',
      category,
      durationMs: 2000,
      loopable: false,
      tags: ['one_shot'],
      description: `${triggerWord ?? category} sound effect`,
      ...(triggerWord ? { triggerWord } : {}),
    });

  it('separates different events within the same category', () => {
    const ids = ['rocket', 'engine', 'touchdown', 'train'].map((w) =>
      requirementFingerprint(sfx('vehicle', w))
    );
    expect(new Set(ids).size).toBe(4);
  });

  it('still reuses the cache for the same event', () => {
    expect(requirementFingerprint(sfx('vehicle', 'rocket'))).toBe(
      requirementFingerprint(sfx('vehicle', 'rocket'))
    );
  });

  it('is case-insensitive on the trigger word', () => {
    expect(requirementFingerprint(sfx('vehicle', 'Rocket'))).toBe(
      requirementFingerprint(sfx('vehicle', 'rocket'))
    );
  });

  it('leaves music and ambience fingerprints untouched', () => {
    // These have no triggerWord, so nothing is appended and previously-paid-for
    // cache entries stay valid. A trailing separator here would have invalidated
    // 33 music and 10 ambience assets.
    const music = AssetRequirementSchema.parse({
      kind: 'music',
      category: 'educational',
      emotion: 'calm',
      genre: 'educational_underscore',
      intensity: 0.25,
      tempo: 'slow',
      durationMs: 30_000,
      loopable: true,
      tags: ['bed'],
      description: 'calm bed',
    });
    expect(requirementFingerprint(music)).toBe(
      'music|educational|calm|educational_underscore|0.25|slow|loop|-'
    );
    expect(requirementFingerprint(music).endsWith('|-')).toBe(true);
  });
});

describe('trigger table integrity', () => {
  it('only uses categories the asset library can satisfy', () => {
    // Every trigger category must be a real SFXCategory, otherwise a cue can be
    // planned that no asset could ever match.
    const valid = new Set([
      'door', 'footsteps', 'typing', 'phone', 'explosion', 'animal', 'weapon',
      'weather', 'glass', 'vehicle', 'fire', 'body', 'time', 'crowd', 'water',
      'wind', 'paper', 'bell', 'magic', 'ui',
    ]);
    for (const t of SFX_TRIGGERS) {
      expect(valid.has(t.category)).toBe(true);
    }
  });

  it('gives every trigger a non-empty pattern list and a sane volume', () => {
    for (const t of SFX_TRIGGERS) {
      expect(t.patterns.length).toBeGreaterThan(0);
      expect(t.patterns.every((p) => p.trim().length > 0)).toBe(true);
      expect(t.volumeDb).toBeLessThanOrEqual(0);
      expect(t.volumeDb).toBeGreaterThan(-40);
    }
  });
});
