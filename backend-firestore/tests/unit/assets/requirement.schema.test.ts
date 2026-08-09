/**
 * AssetRequirement + fingerprint contract.
 *
 * The fingerprint is the cache key for paid asset generation, so its stability
 * and its deliberate insensitivities are worth testing explicitly — a change
 * here silently multiplies cost.
 */

import {
  AssetRequirementSchema,
  AssetProvenanceSchema,
  requirementFingerprint,
} from '../../../src/core/director/schema/requirement.schema';

const base = {
  kind: 'music' as const,
  category: 'documentary',
  emotion: 'suspense' as const,
  genre: 'cinematic_documentary',
  intensity: 0.75,
  tempo: 'moderate' as const,
  durationMs: 180_000,
  loopable: true,
};

describe('AssetRequirementSchema', () => {
  it('parses a full requirement', () => {
    const r = AssetRequirementSchema.parse(base);
    expect(r.kind).toBe('music');
    expect(r.intensity).toBe(0.75);
    expect(r.loopable).toBe(true);
  });

  it('defaults loopable to false and tags to empty', () => {
    const r = AssetRequirementSchema.parse({
      kind: 'sfx',
      category: 'door',
      durationMs: 1500,
    });
    expect(r.loopable).toBe(false);
    expect(r.tags).toEqual([]);
  });

  it('rejects a non-positive duration', () => {
    expect(() =>
      AssetRequirementSchema.parse({ kind: 'music', category: 'x', durationMs: 0 })
    ).toThrow();
  });

  it('rejects an empty category', () => {
    expect(() =>
      AssetRequirementSchema.parse({ kind: 'music', category: '', durationMs: 100 })
    ).toThrow();
  });

  it('rejects intensity outside 0..1', () => {
    expect(() =>
      AssetRequirementSchema.parse({ ...base, intensity: 1.4 })
    ).toThrow();
  });

  it('accepts a free-form category a closed union would reject', () => {
    // Providers may support categories the Director does not yet name.
    const r = AssetRequirementSchema.parse({
      kind: 'music',
      category: 'klezmer_funeral_march',
      durationMs: 1000,
    });
    expect(r.category).toBe('klezmer_funeral_march');
  });
});

describe('requirementFingerprint', () => {
  it('is stable across calls', () => {
    const r = AssetRequirementSchema.parse(base);
    expect(requirementFingerprint(r)).toBe(requirementFingerprint(r));
  });

  it('IGNORES durationMs so one clip serves any slot length', () => {
    // The renderer loops; regenerating per length would multiply cost for
    // audio a listener cannot distinguish.
    const short = AssetRequirementSchema.parse({ ...base, durationMs: 30_000 });
    const long = AssetRequirementSchema.parse({ ...base, durationMs: 600_000 });
    expect(requirementFingerprint(short)).toBe(requirementFingerprint(long));
  });

  it('IGNORES description so prose wording cannot fragment the cache', () => {
    const a = AssetRequirementSchema.parse({ ...base, description: 'one' });
    const b = AssetRequirementSchema.parse({ ...base, description: 'two' });
    expect(requirementFingerprint(a)).toBe(requirementFingerprint(b));
  });

  it('buckets intensity to 0.25 steps', () => {
    const a = AssetRequirementSchema.parse({ ...base, intensity: 0.72 });
    const b = AssetRequirementSchema.parse({ ...base, intensity: 0.78 });
    expect(requirementFingerprint(a)).toBe(requirementFingerprint(b));
  });

  it('separates intensities that fall in different buckets', () => {
    const quiet = AssetRequirementSchema.parse({ ...base, intensity: 0.1 });
    const loud = AssetRequirementSchema.parse({ ...base, intensity: 0.9 });
    expect(requirementFingerprint(quiet)).not.toBe(requirementFingerprint(loud));
  });

  it('DISTINGUISHES category, emotion, kind, tempo and loopability', () => {
    const r = AssetRequirementSchema.parse(base);
    const fp = requirementFingerprint(r);

    const variants = [
      { ...base, category: 'epic' },
      { ...base, emotion: 'happy' as const },
      { ...base, kind: 'stinger' as const },
      { ...base, tempo: 'driving' as const },
      { ...base, loopable: false },
      { ...base, genre: 'educational_underscore' },
    ];
    for (const v of variants) {
      expect(requirementFingerprint(AssetRequirementSchema.parse(v))).not.toBe(fp);
    }
  });

  it('is case-insensitive on category and genre', () => {
    const a = AssetRequirementSchema.parse({ ...base, category: 'Documentary' });
    const b = AssetRequirementSchema.parse({ ...base, category: 'documentary' });
    expect(requirementFingerprint(a)).toBe(requirementFingerprint(b));
  });

  it('separates ambience layer roles', () => {
    const mk = (layerRole: 'base' | 'texture') =>
      requirementFingerprint(
        AssetRequirementSchema.parse({
          kind: 'ambience',
          category: 'forest',
          layerRole,
          durationMs: 30_000,
          loopable: true,
        })
      );
    expect(mk('base')).not.toBe(mk('texture'));
  });
});

describe('AssetProvenanceSchema', () => {
  const provenance = {
    assetId: 'gen_music_abc',
    kind: 'music' as const,
    providerKind: 'generated' as const,
    provider: 'vertex-lyria',
    fingerprint: 'music|documentary|suspense|x|0.75|moderate|loop|-',
    category: 'documentary',
    durationMs: 30_000,
    storagePath: 'audio-assets/generated/music/gen_music_abc.wav',
    licence: 'generated',
    createdAt: 1,
  };

  it('parses a minimal provenance record', () => {
    const p = AssetProvenanceSchema.parse(provenance);
    expect(p.provider).toBe('vertex-lyria');
    expect(p.useCount).toBe(0);
    expect(p.loopable).toBe(false);
  });

  it('REQUIRES a licence — an unlicensed asset must not be storable', () => {
    const { licence, ...withoutLicence } = provenance;
    expect(() => AssetProvenanceSchema.parse(withoutLicence)).toThrow();
  });

  it('requires a storage path', () => {
    const { storagePath, ...without } = provenance;
    expect(() => AssetProvenanceSchema.parse(without)).toThrow();
  });

  it('requires a fingerprint so every asset is cache-addressable', () => {
    const { fingerprint, ...without } = provenance;
    expect(() => AssetProvenanceSchema.parse(without)).toThrow();
  });

  it('rejects an unknown provider kind', () => {
    expect(() =>
      AssetProvenanceSchema.parse({ ...provenance, providerKind: 'pirated' })
    ).toThrow();
  });
});
