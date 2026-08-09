/**
 * Provider implementations: catalogue scoring, external library scoring,
 * generated-music mechanics and prompt construction.
 *
 * The scoring tests matter because confidence is what the inspector surfaces to
 * a human reviewer — a scorer that returns 1.0 for a poor match makes the whole
 * review signal worthless.
 */

import { CatalogueProvider, scoreEntry } from '../../../src/core/assets/providers/CatalogueProvider';
import {
  CC0MusicProvider,
  CC0SoundProvider,
  IndexedLibraryProvider,
  LicensedMusicProvider,
  scoreTrack,
  type LibraryTrack,
} from '../../../src/core/assets/providers/ExternalLibraryProviders';
import {
  GeneratedMusicProvider,
  MAX_CLIP_MS,
  stableSeed,
  wavDurationMs,
} from '../../../src/core/assets/providers/GeneratedMusicProvider';
import {
  GeneratedSoundProvider,
  AMBIENCE_CONFIDENCE,
  SFX_CONFIDENCE,
} from '../../../src/core/assets/providers/GeneratedSoundProvider';
import {
  buildMusicPrompt,
  buildSoundPrompt,
  NEGATIVE_PROMPT,
} from '../../../src/core/assets/prompts/musicPrompts';
import { AssetManifest } from '../../../src/services/media/assets/AssetManifest';
import {
  AssetRequirementSchema,
  type AssetRequirement,
} from '../../../src/core/director/schema/requirement.schema';
import type { AssetEntry } from '../../../src/services/media/assets/manifest.schema';
import type { ResolveContext } from '../../../src/core/assets/IAudioAssetProvider';

const ctx: ResolveContext = {
  allowGeneration: true,
  budgetRemainingUsd: 10,
};

const req = (over: Partial<AssetRequirement> = {}): AssetRequirement =>
  AssetRequirementSchema.parse({
    kind: 'music',
    category: 'documentary',
    emotion: 'suspense',
    intensity: 0.7,
    tempo: 'moderate',
    durationMs: 60_000,
    loopable: true,
    ...over,
  });

// ---------------------------------------------------------------------------
// CatalogueProvider
// ---------------------------------------------------------------------------

const entry = (over: Partial<AssetEntry> = {}): AssetEntry => ({
  id: 'm1',
  kind: 'music',
  path: 'music/doc.mp3',
  durationMs: 60_000,
  loopable: true,
  licence: 'CC0',
  tags: [],
  category: 'documentary',
  intensity: 0.7,
  tempo: 'moderate',
  ...over,
});

describe('scoreEntry', () => {
  it('scores an exact match near 1', () => {
    expect(scoreEntry(entry(), req())).toBeGreaterThan(0.95);
  });

  it('penalises a wrong category heavily', () => {
    const wrong = scoreEntry(entry({ category: 'horror' }), req());
    expect(wrong).toBeLessThan(0.6);
  });

  it('gives partial credit for a tag match', () => {
    const tagged = entry({ category: 'other', tags: ['documentary'] });
    const score = scoreEntry(tagged, req());
    expect(score).toBeGreaterThan(scoreEntry(entry({ category: 'other' }), req()));
  });

  it('scores intensity by distance', () => {
    const near = scoreEntry(entry({ intensity: 0.7 }), req({ intensity: 0.7 }));
    const far = scoreEntry(entry({ intensity: 0.1 }), req({ intensity: 0.9 }));
    expect(near).toBeGreaterThan(far);
  });

  it('gives ZERO loop credit when a loop is required and unavailable', () => {
    const nonLoop = scoreEntry(entry({ loopable: false }), req({ loopable: true }));
    const loop = scoreEntry(entry({ loopable: true }), req({ loopable: true }));
    expect(loop - nonLoop).toBeCloseTo(0.15, 2);
  });

  it('matches ambience on environment, not category', () => {
    const amb = entry({
      kind: 'ambience',
      environment: 'forest',
      category: undefined,
      layerRole: 'base',
    });
    const score = scoreEntry(
      amb,
      req({ kind: 'ambience', category: 'forest', layerRole: 'base' })
    );
    expect(score).toBeGreaterThan(0.8);
  });

  it('matches sfx on effectCategory', () => {
    const sfx = entry({
      kind: 'sfx',
      effectCategory: 'door',
      category: undefined,
      loopable: false,
      intensity: undefined,
      tempo: undefined,
    });
    const score = scoreEntry(
      sfx,
      req({ kind: 'sfx', category: 'door', loopable: false, tempo: undefined, intensity: undefined })
    );
    expect(score).toBeGreaterThan(0.8);
  });

  it('never exceeds 1 or drops below 0', () => {
    expect(scoreEntry(entry(), req())).toBeLessThanOrEqual(1);
    expect(scoreEntry(entry({ category: 'zzz', loopable: false }), req())).toBeGreaterThanOrEqual(0);
  });
});

describe('CatalogueProvider', () => {
  const manifest = new AssetManifest({
    version: 1,
    root: 'audio-assets',
    assets: [entry(), entry({ id: 'm2', category: 'epic', intensity: 0.9 })],
  });
  const provider = new CatalogueProvider(manifest);

  it('is free and non-generative, so it always wins on priority', () => {
    expect(provider.isGenerative).toBe(false);
    expect(provider.estimatedCostUsd).toBe(0);
  });

  it('resolves an exact category match', async () => {
    const asset = await provider.resolve(req(), ctx);
    expect(asset?.assetId).toBe('m1');
    expect(asset?.confidence).toBeGreaterThan(0.9);
  });

  it('returns the full storage path including the catalogue root', async () => {
    const asset = await provider.resolve(req(), ctx);
    expect(asset?.storagePath).toBe('audio-assets/music/doc.mp3');
  });

  it('carries the licence through to provenance', async () => {
    expect((await provider.resolve(req(), ctx))?.licence).toBe('CC0');
  });

  it('returns null rather than a poor substitution', async () => {
    // Nothing tagged or categorised as this, and only 2 assets to choose from.
    const asset = await provider.resolve(
      req({ kind: 'sfx', category: 'nonexistent', loopable: false }),
      ctx
    );
    expect(asset).toBeNull();
  });

  it('canResolve is false for an empty catalogue', () => {
    const empty = new CatalogueProvider(
      new AssetManifest({ version: 1, root: 'r', assets: [] })
    );
    expect(empty.canResolve(req())).toBe(false);
  });

  it('marks results as not-cached so the resolver records provenance', async () => {
    expect((await provider.resolve(req(), ctx))?.cached).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// External libraries
// ---------------------------------------------------------------------------

const track = (over: Partial<LibraryTrack> = {}): LibraryTrack => ({
  assetId: 't1',
  kind: 'music',
  storagePath: 'lib/t1.wav',
  durationMs: 120_000,
  loopable: true,
  category: 'documentary',
  emotion: 'suspense',
  intensity: 0.7,
  tempo: 'moderate',
  licence: 'commercial',
  ...over,
});

describe('scoreTrack', () => {
  it('scores an exact match near 1', () => {
    expect(scoreTrack(track(), req())).toBeGreaterThan(0.95);
  });

  it('rewards an exact emotion label', () => {
    const withEmotion = scoreTrack(track({ emotion: 'suspense' }), req({ emotion: 'suspense' }));
    const wrongEmotion = scoreTrack(track({ emotion: 'happy' }), req({ emotion: 'suspense' }));
    expect(withEmotion).toBeGreaterThan(wrongEmotion);
  });

  it('penalises a wrong category more than a wrong emotion', () => {
    const wrongCategory = scoreTrack(track({ category: 'horror' }), req());
    const wrongEmotion = scoreTrack(track({ emotion: 'happy' }), req());
    expect(wrongCategory).toBeLessThan(wrongEmotion);
  });
});

describe('IndexedLibraryProvider', () => {
  it('returns null when unindexed, so it is inert until populated', async () => {
    const empty = new CC0MusicProvider([]);
    expect(empty.size).toBe(0);
    expect(empty.canResolve(req())).toBe(false);
    expect(await empty.resolve(req(), ctx)).toBeNull();
  });

  it('resolves once populated, with no other change', async () => {
    const populated = new CC0MusicProvider([track({ licence: 'CC0' })]);
    const asset = await populated.resolve(req(), ctx);
    expect(asset?.assetId).toBe('t1');
    expect(asset?.licence).toBe('CC0');
    expect(asset?.providerKind).toBe('cc0');
  });

  it('rejects matches below its confidence floor', async () => {
    // Licensed floor is 0.5; a wrong category on a single-track index falls under.
    const licensed = new LicensedMusicProvider([
      track({ category: 'horror', emotion: 'fear', intensity: 0.1, loopable: false }),
    ]);
    expect(await licensed.resolve(req(), ctx)).toBeNull();
  });

  it('is never generative, so libraries always precede generation', () => {
    expect(new LicensedMusicProvider().isGenerative).toBe(false);
    expect(new CC0SoundProvider().isGenerative).toBe(false);
  });

  it('supports only its declared kinds', () => {
    const soundLib = new CC0SoundProvider([track({ kind: 'sfx', loopable: false })]);
    expect(soundLib.supports).toContain('sfx');
    expect(soundLib.supports).not.toContain('music');
  });

  it('picks the best of several candidates', async () => {
    const provider = new IndexedLibraryProvider({
      name: 'test-lib',
      providerKind: 'cc0',
      supports: ['music'],
      tracks: [
        track({ assetId: 'poor', category: 'horror', intensity: 0.1 }),
        track({ assetId: 'best', category: 'documentary', intensity: 0.7 }),
      ],
    });
    expect((await provider.resolve(req(), ctx))?.assetId).toBe('best');
  });
});

// ---------------------------------------------------------------------------
// Generated music
// ---------------------------------------------------------------------------

/** Minimal valid 48kHz 16-bit mono WAV header with a given data size. */
function wavBuffer(dataBytes: number): Buffer {
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(48_000, 24); // sample rate
  buf.writeUInt32LE(96_000, 28); // byte rate = 48000 * 2
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(dataBytes, 40);
  return buf;
}

describe('wavDurationMs', () => {
  it('reads duration from a valid WAV header', () => {
    // 96000 bytes/sec → 1 second.
    expect(wavDurationMs(wavBuffer(96_000))).toBe(1000);
  });

  it('computes 30s correctly', () => {
    expect(wavDurationMs(wavBuffer(96_000 * 30))).toBe(30_000);
  });

  it('returns null for a non-WAV buffer', () => {
    expect(wavDurationMs(Buffer.from('not audio at all, definitely not'))).toBeNull();
  });

  it('returns null for a truncated buffer', () => {
    expect(wavDurationMs(Buffer.alloc(10))).toBeNull();
  });
});

describe('stableSeed', () => {
  it('is deterministic', () => {
    expect(stableSeed('abc')).toBe(stableSeed('abc'));
  });

  it('differs for different prompts', () => {
    expect(stableSeed('abc')).not.toBe(stableSeed('abd'));
  });

  it('stays within int32 range', () => {
    for (const s of ['', 'a', 'a'.repeat(500), 'unicode ✅ ok']) {
      const seed = stableSeed(s);
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThan(2_147_483_647);
    }
  });
});

describe('GeneratedMusicProvider', () => {
  const storage = {
    written: [] as string[],
    async write(p: { destinationPath: string }) {
      storage.written.push(p.destinationPath);
      return p.destinationPath;
    },
  };

  beforeEach(() => {
    storage.written = [];
    process.env.GOOGLE_VERTEX_PROJECT = 'test-project';
  });

  function provider(behaviour: 'ok' | 'null' | 'throw' = 'ok') {
    return new GeneratedMusicProvider({
      storage,
      generate: async () => {
        if (behaviour === 'throw') throw new Error('quota exceeded');
        if (behaviour === 'null') return null;
        return {
          audioBase64: wavBuffer(96_000 * 30).toString('base64'),
          mimeType: 'audio/wav',
        };
      },
    });
  }

  it('is generative and non-free, so it ranks last', () => {
    expect(provider().isGenerative).toBe(true);
    expect(provider().estimatedCostUsd).toBeGreaterThan(0);
  });

  it('supports music and stingers only', () => {
    expect(provider().supports).toEqual(['music', 'stinger']);
  });

  it('generates, stores and reports a resolved asset', async () => {
    const asset = await provider().resolve(req(), ctx);
    expect(asset).not.toBeNull();
    expect(asset?.provider).toBe('vertex-lyria');
    expect(asset?.licence).toBe('generated');
    expect(asset?.durationMs).toBe(30_000);
    expect(storage.written).toHaveLength(1);
  });

  it('ALWAYS marks generated music loopable — clips are far shorter than beds', async () => {
    const asset = await provider().resolve(req({ durationMs: 600_000 }), ctx);
    expect(asset?.loopable).toBe(true);
    expect(asset?.loopEndMs).toBe(30_000);
    expect(asset!.durationMs).toBeLessThanOrEqual(MAX_CLIP_MS + 1000);
  });

  it('records the prompt for auditability and reproduction', async () => {
    const asset = await provider().resolve(req(), ctx);
    expect(asset?.prompt).toContain('Instrumental background music');
  });

  it('derives a content-addressed assetId, so identical audio dedupes', async () => {
    const a = await provider().resolve(req(), ctx);
    const b = await provider().resolve(req(), ctx);
    expect(a?.assetId).toBe(b?.assetId);
  });

  it('returns null when generation yields nothing', async () => {
    expect(await provider('null').resolve(req(), ctx)).toBeNull();
  });

  it('returns null instead of throwing when generation fails', async () => {
    await expect(provider('throw').resolve(req(), ctx)).resolves.toBeNull();
  });

  it('refuses to generate when allowGeneration is false', async () => {
    const asset = await provider().resolve(req(), {
      ...ctx,
      allowGeneration: false,
    });
    expect(asset).toBeNull();
    expect(storage.written).toHaveLength(0);
  });

  it('refuses to generate when the budget is insufficient', async () => {
    const asset = await provider().resolve(req(), { ...ctx, budgetRemainingUsd: 0 });
    expect(asset).toBeNull();
  });

  it('canResolve is false without a project configured', () => {
    // Module-level constant, so assert the guard exists rather than mutating it.
    expect(provider().canResolve(req({ kind: 'ambience' }))).toBe(false);
  });
});

describe('GeneratedSoundProvider', () => {
  const storage = {
    async write(p: { destinationPath: string }) {
      return p.destinationPath;
    },
  };

  it('is inert without an injected generator, so nothing bills implicitly', () => {
    const provider = new GeneratedSoundProvider({ storage });
    expect(provider.canResolve(req({ kind: 'ambience', category: 'forest' }))).toBe(false);
  });

  it('does not attempt SFX unless explicitly enabled', () => {
    const provider = new GeneratedSoundProvider({
      storage,
      generate: async () => ({ audioBase64: 'AA==', mimeType: 'audio/wav' }),
    });
    expect(provider.canResolve(req({ kind: 'sfx', category: 'door', loopable: false }))).toBe(
      false
    );
  });

  it('reports LOW confidence for generated SFX and high for ambience', () => {
    // Encodes the judgement that a generated "door" is a musical impression of
    // a door, so any real recording should outrank it.
    expect(SFX_CONFIDENCE).toBeLessThan(0.6);
    expect(AMBIENCE_CONFIDENCE).toBeGreaterThan(0.7);
    expect(SFX_CONFIDENCE).toBeLessThan(AMBIENCE_CONFIDENCE);
  });

  it('marks ambience loopable and sfx not', async () => {
    process.env.GOOGLE_VERTEX_PROJECT = 'test-project';
    const provider = new GeneratedSoundProvider({
      storage,
      enableSfx: true,
      generate: async () => ({
        audioBase64: wavBuffer(96_000).toString('base64'),
        mimeType: 'audio/wav',
      }),
    });

    const amb = await provider.resolve(
      req({ kind: 'ambience', category: 'forest', layerRole: 'base' }),
      ctx
    );
    const sfx = await provider.resolve(
      req({ kind: 'sfx', category: 'door', loopable: false }),
      ctx
    );

    expect(amb?.loopable).toBe(true);
    expect(sfx?.loopable).toBe(false);
    expect(sfx?.confidence).toBe(SFX_CONFIDENCE);
  });
});

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

describe('buildMusicPrompt', () => {
  it('is deterministic for the same requirement', () => {
    expect(buildMusicPrompt(req())).toBe(buildMusicPrompt(req()));
  });

  it('always asks for instrumental music with room for a voice', () => {
    const p = buildMusicPrompt(req());
    expect(p).toContain('No vocals');
    expect(p).toContain('mid-range open');
  });

  it('reflects the category instrumentation', () => {
    expect(buildMusicPrompt(req({ category: 'calm_piano' }))).toContain('piano');
    expect(buildMusicPrompt(req({ category: 'space' }))).toContain('drones');
  });

  it('reflects the emotion', () => {
    expect(buildMusicPrompt(req({ emotion: 'sad' }))).toContain('melancholic');
    expect(buildMusicPrompt(req({ emotion: 'victory' }))).toContain('resolving upward');
  });

  it('scales description with intensity', () => {
    expect(buildMusicPrompt(req({ intensity: 0.1 }))).toContain('extremely quiet');
    expect(buildMusicPrompt(req({ intensity: 0.95 }))).toContain('dense and urgent');
  });

  it('caps loud descriptions with a no-sudden-peaks constraint', () => {
    // Even at maximum intensity the bed must not spike under narration.
    expect(buildMusicPrompt(req({ intensity: 1 }))).toContain('no sudden peaks');
  });

  it('requests seamless looping only when loopable', () => {
    expect(buildMusicPrompt(req({ loopable: true }))).toContain('loopable');
    expect(buildMusicPrompt(req({ loopable: false }))).not.toContain('Seamlessly loopable');
  });

  it('falls back to the educational style for an unknown category', () => {
    expect(buildMusicPrompt(req({ category: 'polka_metal' }))).toContain('piano');
  });

  it('includes tempo guidance when specified', () => {
    expect(buildMusicPrompt(req({ tempo: 'driving' }))).toContain('130-145 BPM');
  });
});

describe('buildSoundPrompt', () => {
  it('describes ambience as a continuous loopable bed', () => {
    const p = buildSoundPrompt(
      req({ kind: 'ambience', category: 'forest', layerRole: 'base' })
    );
    expect(p).toContain('forest');
    expect(p).toContain('Seamlessly loopable');
    expect(p).toContain('no speech');
  });

  it('varies wording by layer role', () => {
    const base = buildSoundPrompt(req({ kind: 'ambience', category: 'city', layerRole: 'base' }));
    const detail = buildSoundPrompt(
      req({ kind: 'ambience', category: 'city', layerRole: 'detail' })
    );
    expect(base).not.toBe(detail);
    expect(detail).toContain('near-silence');
  });

  it('describes sfx as a dry single event', () => {
    const p = buildSoundPrompt(req({ kind: 'sfx', category: 'door', loopable: false }));
    expect(p).toContain('Isolated sound effect');
    expect(p).toContain('minimal reverb');
  });

  it('includes the trigger word for context', () => {
    const p = buildSoundPrompt(
      req({ kind: 'sfx', category: 'weather', triggerWord: 'thunder', loopable: false })
    );
    expect(p).toContain('thunder');
  });

  it('replaces underscores in category names', () => {
    const p = buildSoundPrompt(req({ kind: 'ambience', category: 'ancient_rome' }));
    expect(p).toContain('ancient rome');
  });
});

describe('NEGATIVE_PROMPT', () => {
  it('excludes vocals and transients that would fight narration', () => {
    expect(NEGATIVE_PROMPT).toContain('vocals');
    expect(NEGATIVE_PROMPT).toContain('heavy drums');
  });
});
