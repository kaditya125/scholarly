/**
 * AssetManifest + feature-flag tests.
 *
 * The manifest is the mechanism that turns an invalid asset reference into a
 * design-time error rather than a render-time failure, so its behaviour on
 * malformed input matters as much as on valid input.
 */

import { AssetManifest } from '../../../src/services/media/assets/AssetManifest';
import {
  AssetCatalogueSchema,
  EMPTY_CATALOGUE,
} from '../../../src/services/media/assets/manifest.schema';
import { CharacterRepository } from '../../../src/repositories/character.repository';
import {
  cinematicIntensity,
  cinematicTracks,
  featureFlags,
  targetLufs,
} from '../../../src/config/featureFlags';
import { makeCatalogue, makeCharacter } from './fixtures';

describe('AssetManifest construction', () => {
  it('indexes a valid catalogue', () => {
    const { manifest, errors } = AssetManifest.from(makeCatalogue());
    expect(errors).toEqual([]);
    expect(manifest.isEmpty()).toBe(false);
    expect(manifest.stats().total).toBe(4);
  });

  it('degrades to an empty manifest on malformed input instead of throwing', () => {
    const { manifest, errors } = AssetManifest.from({ version: 99, assets: 'nope' });
    expect(errors.length).toBeGreaterThan(0);
    expect(manifest.isEmpty()).toBe(true);
  });

  it('treats a missing catalogue as empty, not an error state', () => {
    const manifest = new AssetManifest(EMPTY_CATALOGUE);
    expect(manifest.isEmpty()).toBe(true);
    expect(manifest.list('music')).toEqual([]);
  });

  it('keeps the first entry when ids collide and reports the duplicate', () => {
    const cat = makeCatalogue();
    cat.assets.push({ ...cat.assets[0], path: 'music/educational/other.mp3' });
    const { manifest } = AssetManifest.from(cat);
    expect(manifest.stats().duplicateIds).toContain('edu_soft_bed_01');
    expect(manifest.get('music', 'edu_soft_bed_01')?.path).toBe(
      'music/educational/soft_bed_01.mp3'
    );
  });

  it('requires a licence on every entry', () => {
    const cat: any = makeCatalogue();
    delete cat.assets[0].licence;
    expect(AssetCatalogueSchema.safeParse(cat).success).toBe(false);
  });
});

describe('AssetManifest lookup', () => {
  const { manifest } = AssetManifest.from(makeCatalogue());

  it('distinguishes assets by kind as well as id', () => {
    expect(manifest.has('music', 'edu_soft_bed_01')).toBe(true);
    expect(manifest.has('sfx', 'edu_soft_bed_01')).toBe(false);
  });

  it('returns null rather than throwing for an unknown asset', () => {
    expect(manifest.get('music', 'nope')).toBeNull();
  });

  it('builds a full storage path from the catalogue root', () => {
    const entry = manifest.get('music', 'edu_soft_bed_01')!;
    expect(manifest.storagePath(entry)).toBe(
      'audio-assets/music/educational/soft_bed_01.mp3'
    );
  });

  it('normalises redundant slashes between root and path', () => {
    const cat = makeCatalogue({ root: 'audio-assets/' });
    cat.assets[0].path = '/music/educational/soft_bed_01.mp3';
    const { manifest: m } = AssetManifest.from(cat);
    const entry = m.get('music', 'edu_soft_bed_01')!;
    expect(m.storagePath(entry)).toBe('audio-assets/music/educational/soft_bed_01.mp3');
  });
});

describe('AssetManifest.validateRefs', () => {
  const { manifest } = AssetManifest.from(makeCatalogue());

  it('returns an empty array when every ref resolves', () => {
    const missing = manifest.validateRefs([
      { kind: 'music', id: 'edu_soft_bed_01' },
      { kind: 'sfx', id: 'bell_single' },
    ]);
    expect(missing).toEqual([]);
  });

  it('returns only the unresolvable refs', () => {
    const missing = manifest.validateRefs([
      { kind: 'music', id: 'edu_soft_bed_01' },
      { kind: 'music', id: 'ghost_track' },
      { kind: 'ambience', id: 'ghost_room' },
    ]);
    expect(missing).toHaveLength(2);
    expect(missing.map((m) => m.id)).toEqual(['ghost_track', 'ghost_room']);
  });
});

describe('AssetManifest selection helpers', () => {
  const { manifest } = AssetManifest.from(makeCatalogue());

  it('orders music candidates by closeness to the requested intensity', () => {
    const calm = manifest.findMusic({ category: 'educational', intensity: 0.2 });
    expect(calm[0].id).toBe('edu_soft_bed_01');

    const intense = manifest.findMusic({ category: 'educational', intensity: 0.9 });
    expect(intense[0].id).toBe('edu_bright_bed_01');
  });

  it('narrows music by tempo', () => {
    expect(
      manifest.findMusic({ category: 'educational', tempo: 'upbeat' }).map((a) => a.id)
    ).toEqual(['edu_bright_bed_01']);
  });

  it('returns an empty array for an unknown category rather than throwing', () => {
    expect(manifest.findMusic({ category: 'polka' })).toEqual([]);
  });

  it('finds ambience by environment and layer role', () => {
    expect(manifest.findAmbience({ environment: 'classroom' })).toHaveLength(1);
    expect(
      manifest.findAmbience({ environment: 'classroom', layerRole: 'accent' })
    ).toHaveLength(0);
  });

  it('finds sfx by effect category', () => {
    expect(manifest.findSFX({ effectCategory: 'bell' }).map((a) => a.id)).toEqual([
      'bell_single',
    ]);
  });
});

describe('AssetManifest stats', () => {
  it('summarises counts, loopables and licences', () => {
    const { manifest } = AssetManifest.from(makeCatalogue());
    const stats = manifest.stats();
    expect(stats.byKind.music).toBe(2);
    expect(stats.byKind.ambience).toBe(1);
    expect(stats.byKind.sfx).toBe(1);
    expect(stats.loopable).toBe(3);
    expect(stats.licences).toEqual(['CC0']);
  });
});

// ---------------------------------------------------------------------------
// Character matching (pure, no Firestore)
// ---------------------------------------------------------------------------

describe('CharacterRepository.match', () => {
  const priya = makeCharacter({ id: 'c1', displayName: 'Priya', role: 'Teacher' });
  const riya = makeCharacter({
    id: 'c2',
    displayName: 'Riya',
    role: 'Student',
    gender: 'female',
    ageBand: 'teen',
  });

  it('prefers an exact name + role match', () => {
    const found = CharacterRepository.match([priya, riya], {
      displayName: 'Priya',
      role: 'Teacher',
    });
    expect(found?.id).toBe('c1');
  });

  it('matches case-insensitively and ignores surrounding whitespace', () => {
    const found = CharacterRepository.match([priya], {
      displayName: '  priya ',
      role: 'TEACHER',
    });
    expect(found?.id).toBe('c1');
  });

  it('falls back to role + gender + ageBand, reusing the voice under a new name', () => {
    const found = CharacterRepository.match([priya, riya], {
      displayName: 'Sneha',
      role: 'Student',
      gender: 'female',
      ageBand: 'teen',
    });
    expect(found?.id).toBe('c2');
  });

  it('returns null when nothing matches so a new character is created', () => {
    expect(
      CharacterRepository.match([priya, riya], { displayName: 'Rex', role: 'Robot' })
    ).toBeNull();
  });

  it('does not fuzzy-match across a gender mismatch', () => {
    expect(
      CharacterRepository.match([riya], {
        role: 'Student',
        gender: 'male',
        ageBand: 'teen',
      })
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Feature flags — the safety mechanism for the whole platform
// ---------------------------------------------------------------------------

describe('feature flags', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('defaults the AI Director OFF so the pipeline is unchanged', () => {
    delete process.env.AI_DIRECTOR_ENABLED;
    expect(featureFlags.aiDirector).toBe(false);
  });

  it('defaults the AI Producer OFF', () => {
    delete process.env.AI_PRODUCER_ENABLED;
    expect(featureFlags.aiProducer).toBe(false);
  });

  it('defaults Shadow Mode ON so enabling the Director cannot change output', () => {
    delete process.env.AI_DIRECTOR_SHADOW_MODE;
    expect(featureFlags.aiDirectorShadowMode).toBe(true);
  });

  it('defaults the cost-significant emotion voices OFF', () => {
    delete process.env.EMOTION_VOICES_ENABLED;
    expect(featureFlags.emotionVoices).toBe(false);
  });

  it('accepts the documented truthy spellings', () => {
    for (const v of ['1', 'true', 'TRUE', 'yes', 'on']) {
      process.env.AI_DIRECTOR_ENABLED = v;
      expect(featureFlags.aiDirector).toBe(true);
    }
  });

  it('treats an empty value as unset', () => {
    process.env.AI_DIRECTOR_ENABLED = '';
    expect(featureFlags.aiDirector).toBe(false);
  });

  it('defaults CINEMATIC_TRACKS to voice-only (empty set)', () => {
    delete process.env.CINEMATIC_TRACKS;
    expect(cinematicTracks().size).toBe(0);
  });

  it('parses a CSV track subset and ignores unknown entries', () => {
    process.env.CINEMATIC_TRACKS = 'music, ambience ,bogus';
    const tracks = cinematicTracks();
    expect(tracks.has('music')).toBe(true);
    expect(tracks.has('ambience')).toBe(true);
    expect(tracks.has('sfx')).toBe(false);
    expect(tracks.size).toBe(2);
  });

  it('defaults intensity to subtle so audio never competes with comprehension', () => {
    delete process.env.CINEMATIC_INTENSITY;
    expect(cinematicIntensity()).toBe('subtle');
  });

  it('accepts valid intensities and rejects nonsense', () => {
    process.env.CINEMATIC_INTENSITY = 'dramatic';
    expect(cinematicIntensity()).toBe('dramatic');
    process.env.CINEMATIC_INTENSITY = 'loud';
    expect(cinematicIntensity()).toBe('subtle');
  });

  it('defaults LUFS to the -16 podcast standard and clamps nonsense', () => {
    delete process.env.TARGET_LUFS;
    expect(targetLufs()).toBe(-16);
    process.env.TARGET_LUFS = '-14';
    expect(targetLufs()).toBe(-14);
    process.env.TARGET_LUFS = '5';
    expect(targetLufs()).toBe(-16);
    process.env.TARGET_LUFS = 'abc';
    expect(targetLufs()).toBe(-16);
  });
});
