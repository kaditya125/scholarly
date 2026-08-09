import { SemanticCache, CachedAnswer, Embedder } from '../../src/core/intelligence/SemanticCache';
import { CacheService } from '../../src/services/cache.service';

// In-memory cache double.
class FakeCache implements CacheService {
  store = new Map<string, any>();
  async get<T>(k: string): Promise<T | null> { return (this.store.has(k) ? this.store.get(k) : null) as T | null; }
  async set<T>(k: string, v: T): Promise<void> { this.store.set(k, v); }
  async del(k: string): Promise<void> { this.store.delete(k); }
}

// Deterministic embedder: maps a few known phrases to fixed unit vectors; unknown → orthogonal.
const VECS: Record<string, number[]> = {
  photosynthesis: [1, 0, 0],
  'photosynthesis process': [0.98, 0.199, 0], // ~0.98 cosine with 'photosynthesis'
  mitosis: [0, 1, 0],
};
const embedder: Embedder = {
  async generateEmbedding(text: string) {
    const key = Object.keys(VECS).find((k) => text.toLowerCase().includes(k));
    return key ? VECS[key] : [0, 0, 1];
  },
};

const answer = (q: string): CachedAnswer => ({
  question: q, answer: `answer for ${q}`, citations: [{ source: 'Ch1' }],
  workflow: 'definition', model: 'fast', confidence: 0.9, ts: Date.now(),
});

describe('SemanticCache', () => {
  let cache: FakeCache;
  let sc: SemanticCache;
  beforeEach(() => { cache = new FakeCache(); sc = new SemanticCache(embedder, cache); });

  it('miss on empty cache', async () => {
    expect(await sc.lookup('what is photosynthesis', 'global', 0.9)).toBeNull();
  });

  it('stores then returns a hit for a semantically-similar question above threshold', async () => {
    await sc.store(answer('what is photosynthesis'), 'global', 3600);
    const hit = await sc.lookup('explain the photosynthesis process', 'global', 0.9);
    expect(hit).not.toBeNull();
    expect(hit!.similarity).toBeGreaterThanOrEqual(0.9);
    expect(hit!.entry.answer).toContain('photosynthesis');
    // Stored embedding must not leak back to the caller.
    expect((hit!.entry as any).embedding).toBeUndefined();
  });

  it('misses when similarity is below threshold (different topic)', async () => {
    await sc.store(answer('what is photosynthesis'), 'global', 3600);
    expect(await sc.lookup('what is mitosis', 'global', 0.9)).toBeNull();
  });

  it('isolates entries by scope (no cross-notebook leakage)', async () => {
    await sc.store(answer('what is photosynthesis'), 'nb:A', 3600);
    expect(await sc.lookup('photosynthesis process', 'nb:B', 0.9)).toBeNull();
    expect(await sc.lookup('photosynthesis process', 'nb:A', 0.9)).not.toBeNull();
  });

  it('scopeFor maps notebookId → nb:<id>, else global', () => {
    expect(SemanticCache.scopeFor('nb123')).toBe('nb:nb123');
    expect(SemanticCache.scopeFor(undefined)).toBe('global');
  });

  it('never throws — a failing embedder degrades to miss / no-op', async () => {
    const boom: Embedder = { async generateEmbedding() { throw new Error('embed down'); } };
    const sc2 = new SemanticCache(boom, cache);
    await expect(sc2.store(answer('x'), 'global', 60)).resolves.toBeUndefined();
    await expect(sc2.lookup('x', 'global', 0.9)).resolves.toBeNull();
  });
});
