/**
 * AssetResolver routing behaviour.
 *
 * The properties that matter and are tested here:
 *   - cheapest-first ordering (catalogue/CC0 before paid generation)
 *   - never throws, whatever a provider does
 *   - deduplicates by fingerprint so identical needs are billed once
 *   - respects the budget and the no-generation flag
 *   - records provenance for every newly-obtained asset
 */

import {
  AssetResolver,
  fromProvenance,
  toProvenance,
} from '../../../src/core/assets/AssetResolver';
import type {
  IAudioAssetProvider,
  ResolveContext,
  ResolvedAsset,
} from '../../../src/core/assets/IAudioAssetProvider';
import { providerPriority } from '../../../src/core/assets/IAudioAssetProvider';
import {
  AssetRequirementSchema,
  requirementFingerprint,
  type AssetProvenance,
  type AssetRequirement,
} from '../../../src/core/director/schema/requirement.schema';
import type { AssetKind } from '../../../src/core/director/schema/common.schema';

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

/** In-memory registry with the same surface the resolver uses. */
class FakeRegistry {
  readonly byFingerprint = new Map<string, AssetProvenance>();
  readonly registered: AssetProvenance[] = [];
  readonly increments: string[] = [];

  async findByFingerprint(fp: string): Promise<AssetProvenance | null> {
    return this.byFingerprint.get(fp) ?? null;
  }
  async register(p: AssetProvenance): Promise<void> {
    this.registered.push(p);
    this.byFingerprint.set(p.fingerprint, p);
  }
  async incrementUse(id: string): Promise<void> {
    this.increments.push(id);
  }
}

interface StubOptions {
  name: string;
  generative?: boolean;
  cost?: number;
  supports?: AssetKind[];
  /** null = miss. 'throw' = contract violation. */
  behaviour?: 'hit' | 'miss' | 'throw';
  confidence?: number;
  canResolve?: boolean;
}

function stubProvider(options: StubOptions): IAudioAssetProvider & { calls: number } {
  const provider = {
    name: options.name,
    providerKind: (options.generative ? 'generated' : 'cc0') as 'generated' | 'cc0',
    supports: options.supports ?? (['music', 'ambience', 'sfx', 'stinger'] as AssetKind[]),
    isGenerative: options.generative ?? false,
    estimatedCostUsd: options.cost ?? 0,
    calls: 0,
    canResolve: () => options.canResolve ?? true,
    async resolve(
      _r: AssetRequirement,
      _c: ResolveContext
    ): Promise<ResolvedAsset | null> {
      provider.calls++;
      if (options.behaviour === 'throw') throw new Error(`${options.name} exploded`);
      if (options.behaviour === 'miss') return null;
      return {
        assetId: `${options.name}_asset`,
        storagePath: `path/${options.name}.wav`,
        durationMs: 30_000,
        loopable: true,
        provider: options.name,
        providerKind: provider.providerKind,
        licence: options.generative ? 'generated' : 'CC0',
        confidence: options.confidence ?? 0.9,
        cached: false,
        costUsd: options.cost ?? 0,
      };
    },
  };
  return provider as IAudioAssetProvider & { calls: number };
}

const musicReq = (over: Partial<AssetRequirement> = {}): AssetRequirement =>
  AssetRequirementSchema.parse({
    kind: 'music',
    category: 'documentary',
    emotion: 'suspense',
    intensity: 0.5,
    durationMs: 60_000,
    loopable: true,
    ...over,
  });

function makeResolver(registry: FakeRegistry) {
  // The resolver only needs the three registry methods; cast narrowly.
  return new AssetResolver(registry as unknown as never);
}

// ---------------------------------------------------------------------------
// Ordering
// ---------------------------------------------------------------------------

describe('providerPriority', () => {
  it('puts non-generative before generative', () => {
    const cheap = stubProvider({ name: 'cc0', generative: false });
    const paid = stubProvider({ name: 'gen', generative: true, cost: 0.06 });
    expect([paid, cheap].sort(providerPriority)[0].name).toBe('cc0');
  });

  it('orders generative providers by cost', () => {
    const a = stubProvider({ name: 'a', generative: true, cost: 0.2 });
    const b = stubProvider({ name: 'b', generative: true, cost: 0.05 });
    expect([a, b].sort(providerPriority)[0].name).toBe('b');
  });

  it('breaks ties by name for determinism', () => {
    const z = stubProvider({ name: 'z' });
    const a = stubProvider({ name: 'a' });
    expect([z, a].sort(providerPriority).map((p) => p.name)).toEqual(['a', 'z']);
  });
});

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

describe('AssetResolver.resolve', () => {
  it('prefers a free provider over a paid one', async () => {
    const registry = new FakeRegistry();
    const free = stubProvider({ name: 'cc0-music', generative: false });
    const paid = stubProvider({ name: 'vertex-lyria', generative: true, cost: 0.06 });
    const resolver = makeResolver(registry).register(paid).register(free);

    const outcome = await resolver.resolve(musicReq());

    expect(outcome.asset?.provider).toBe('cc0-music');
    expect(paid.calls).toBe(0);
    expect(outcome.asset?.costUsd).toBe(0);
  });

  it('falls through to the paid provider when free ones miss', async () => {
    const registry = new FakeRegistry();
    const free = stubProvider({ name: 'cc0-music', behaviour: 'miss' });
    const paid = stubProvider({ name: 'vertex-lyria', generative: true, cost: 0.06 });
    const resolver = makeResolver(registry).register(free).register(paid);

    const outcome = await resolver.resolve(musicReq());

    expect(outcome.asset?.provider).toBe('vertex-lyria');
    expect(free.calls).toBe(1);
  });

  it('NEVER throws when a provider throws, and continues to the next', async () => {
    const registry = new FakeRegistry();
    const broken = stubProvider({ name: 'aaa-broken', behaviour: 'throw' });
    const good = stubProvider({ name: 'bbb-good' });
    const resolver = makeResolver(registry).register(broken).register(good);

    const outcome = await resolver.resolve(musicReq());

    expect(outcome.asset?.provider).toBe('bbb-good');
    expect(outcome.attempts.find((a) => a.provider === 'aaa-broken')?.outcome).toBe(
      'error'
    );
  });

  it('returns an unresolved outcome rather than throwing when nothing matches', async () => {
    const registry = new FakeRegistry();
    const resolver = makeResolver(registry).register(
      stubProvider({ name: 'x', behaviour: 'miss' })
    );

    const outcome = await resolver.resolve(musicReq());

    expect(outcome.asset).toBeNull();
    expect(outcome.fingerprint).toBe(requirementFingerprint(musicReq()));
  });

  it('works with no providers registered at all', async () => {
    const outcome = await makeResolver(new FakeRegistry()).resolve(musicReq());
    expect(outcome.asset).toBeNull();
  });

  it('skips providers that do not support the kind', async () => {
    const registry = new FakeRegistry();
    const musicOnly = stubProvider({ name: 'music-only', supports: ['music'] });
    const resolver = makeResolver(registry).register(musicOnly);

    const outcome = await resolver.resolve(
      musicReq({ kind: 'sfx', category: 'door', loopable: false })
    );

    expect(outcome.asset).toBeNull();
    expect(musicOnly.calls).toBe(0);
  });

  it('honours canResolve returning false', async () => {
    const registry = new FakeRegistry();
    const declines = stubProvider({ name: 'declines', canResolve: false });
    const resolver = makeResolver(registry).register(declines);

    expect((await resolver.resolve(musicReq())).asset).toBeNull();
    expect(declines.calls).toBe(0);
  });

  it('registers provenance for a newly-obtained asset', async () => {
    const registry = new FakeRegistry();
    const resolver = makeResolver(registry).register(stubProvider({ name: 'cc0' }));

    await resolver.resolve(musicReq());

    expect(registry.registered).toHaveLength(1);
    expect(registry.registered[0].provider).toBe('cc0');
    expect(registry.registered[0].licence).toBe('CC0');
    // Provenance carries the semantic metadata, so the registry is queryable.
    expect(registry.registered[0].emotion).toBe('suspense');
  });
});

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

describe('AssetResolver cache behaviour', () => {
  it('serves a registry hit without calling any provider', async () => {
    const registry = new FakeRegistry();
    const req = musicReq();
    registry.byFingerprint.set(requirementFingerprint(req), {
      assetId: 'cached_1',
      kind: 'music',
      providerKind: 'generated',
      provider: 'vertex-lyria',
      fingerprint: requirementFingerprint(req),
      category: 'documentary',
      durationMs: 30_000,
      loopable: true,
      storagePath: 'p.wav',
      licence: 'generated',
      createdAt: 1,
      useCount: 3,
    });

    const provider = stubProvider({ name: 'gen', generative: true, cost: 0.06 });
    const resolver = makeResolver(registry).register(provider);

    const outcome = await resolver.resolve(req);

    expect(outcome.asset?.assetId).toBe('cached_1');
    expect(outcome.asset?.cached).toBe(true);
    expect(outcome.asset?.costUsd).toBe(0);
    expect(provider.calls).toBe(0);
    expect(registry.increments).toContain('cached_1');
  });
});

// ---------------------------------------------------------------------------
// Batch
// ---------------------------------------------------------------------------

describe('AssetResolver.resolveMany', () => {
  it('deduplicates identical fingerprints so cost is paid once', async () => {
    const registry = new FakeRegistry();
    const provider = stubProvider({ name: 'gen', generative: true, cost: 0.06 });
    const resolver = makeResolver(registry).register(provider);

    // Same semantic need, different slot durations — one asset should serve all.
    const result = await resolver.resolveMany([
      musicReq({ durationMs: 30_000 }),
      musicReq({ durationMs: 90_000 }),
      musicReq({ durationMs: 200_000 }),
    ]);

    expect(provider.calls).toBe(1);
    expect(result.outcomes.size).toBe(1);
    expect(result.totalCostUsd).toBeCloseTo(0.06, 5);
  });

  it('resolves genuinely distinct requirements separately', async () => {
    const registry = new FakeRegistry();
    const provider = stubProvider({ name: 'cc0' });
    const resolver = makeResolver(registry).register(provider);

    const result = await resolver.resolveMany([
      musicReq({ category: 'documentary' }),
      musicReq({ category: 'epic' }),
    ]);

    expect(result.outcomes.size).toBe(2);
    expect(result.resolved).toBe(2);
  });

  it('counts cache hits and fresh acquisitions separately', async () => {
    const registry = new FakeRegistry();
    const cachedReq = musicReq({ category: 'documentary' });
    registry.byFingerprint.set(requirementFingerprint(cachedReq), {
      assetId: 'c1',
      kind: 'music',
      providerKind: 'cc0',
      provider: 'cc0',
      fingerprint: requirementFingerprint(cachedReq),
      category: 'documentary',
      durationMs: 1000,
      loopable: true,
      storagePath: 'p',
      licence: 'CC0',
      createdAt: 1,
      useCount: 1,
    });
    const resolver = makeResolver(registry).register(stubProvider({ name: 'cc0' }));

    const result = await resolver.resolveMany([cachedReq, musicReq({ category: 'epic' })]);

    expect(result.cacheHits).toBe(1);
    expect(result.generated).toBe(1);
  });

  it('stops generating once the budget is exhausted', async () => {
    const registry = new FakeRegistry();
    const provider = stubProvider({ name: 'gen', generative: true, cost: 0.06 });
    const resolver = makeResolver(registry).register(provider);

    const result = await resolver.resolveMany(
      ['documentary', 'epic', 'sad', 'mystery'].map((c) => musicReq({ category: c })),
      { budgetUsd: 0.1 }
    );

    // 0.1 budget / 0.06 each → two succeed, the rest are skipped on budget.
    expect(provider.calls).toBe(2);
    expect(result.unresolved).toBe(2);
    const skipped = [...result.outcomes.values()].filter((o) =>
      o.attempts.some((a) => a.outcome === 'skipped_budget')
    );
    expect(skipped).toHaveLength(2);
  });

  it('skips ALL generative providers when allowGeneration is false', async () => {
    const registry = new FakeRegistry();
    const paid = stubProvider({ name: 'gen', generative: true, cost: 0.06 });
    const resolver = makeResolver(registry).register(paid);

    const result = await resolver.resolveMany([musicReq()], {
      allowGeneration: false,
      budgetUsd: 100,
    });

    expect(paid.calls).toBe(0);
    expect(result.resolved).toBe(0);
    expect(
      [...result.outcomes.values()][0].attempts.some(
        (a) => a.outcome === 'skipped_generation'
      )
    ).toBe(true);
  });

  it('still uses free providers when generation is disallowed', async () => {
    const registry = new FakeRegistry();
    const resolver = makeResolver(registry)
      .register(stubProvider({ name: 'cc0', generative: false }))
      .register(stubProvider({ name: 'gen', generative: true, cost: 1 }));

    const result = await resolver.resolveMany([musicReq()], { allowGeneration: false });

    expect(result.resolved).toBe(1);
    expect([...result.outcomes.values()][0].asset?.provider).toBe('cc0');
  });

  it('handles an empty requirement list', async () => {
    const result = await makeResolver(new FakeRegistry()).resolveMany([]);
    expect(result.outcomes.size).toBe(0);
    expect(result.totalCostUsd).toBe(0);
  });

  it('pick() retrieves an asset by requirement', async () => {
    const registry = new FakeRegistry();
    const resolver = makeResolver(registry).register(stubProvider({ name: 'cc0' }));
    const req = musicReq();
    const result = await resolver.resolveMany([req]);
    expect(AssetResolver.pick(result, req)?.provider).toBe('cc0');
  });

  it('pick() returns null for a requirement that was not in the batch', async () => {
    const registry = new FakeRegistry();
    const resolver = makeResolver(registry).register(stubProvider({ name: 'cc0' }));
    const result = await resolver.resolveMany([musicReq()]);
    expect(AssetResolver.pick(result, musicReq({ category: 'other' }))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

describe('AssetResolver.register', () => {
  it('is idempotent on provider name', () => {
    const resolver = makeResolver(new FakeRegistry());
    resolver.register(stubProvider({ name: 'dup' }));
    resolver.register(stubProvider({ name: 'dup' }));
    expect(resolver.providerNames().filter((n) => n === 'dup')).toHaveLength(1);
  });

  it('reports names in resolution order', () => {
    const resolver = makeResolver(new FakeRegistry())
      .register(stubProvider({ name: 'paid', generative: true, cost: 0.5 }))
      .register(stubProvider({ name: 'free' }));
    expect(resolver.providerNames()).toEqual(['free', 'paid']);
  });
});

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

describe('provenance mapping', () => {
  const provenance: AssetProvenance = {
    assetId: 'a1',
    kind: 'music',
    providerKind: 'generated',
    provider: 'vertex-lyria',
    providerModel: 'lyria-002',
    prompt: 'a prompt',
    fingerprint: 'fp',
    category: 'documentary',
    emotion: 'suspense',
    intensity: 0.75,
    durationMs: 30_000,
    loopable: true,
    loopStartMs: 0,
    loopEndMs: 30_000,
    storagePath: 'p.wav',
    licence: 'generated',
    createdAt: 5,
    useCount: 2,
  };

  it('fromProvenance marks the asset as cached and free', () => {
    const asset = fromProvenance(provenance);
    expect(asset.cached).toBe(true);
    expect(asset.costUsd).toBe(0);
    expect(asset.assetId).toBe('a1');
    expect(asset.providerModel).toBe('lyria-002');
  });

  it('fromProvenance reports below-perfect confidence for a cache hit', () => {
    // So a fresh exact match still outranks a historical one.
    expect(fromProvenance(provenance).confidence).toBeLessThan(1);
  });

  it('toProvenance round-trips the semantic metadata from the requirement', () => {
    const req = musicReq({ category: 'epic', emotion: 'victory', intensity: 0.75 });
    const p = toProvenance(fromProvenance(provenance), req, 'fp2');
    expect(p.category).toBe('epic');
    expect(p.emotion).toBe('victory');
    expect(p.intensity).toBe(0.75);
    expect(p.fingerprint).toBe('fp2');
    expect(p.useCount).toBe(1);
  });
});
