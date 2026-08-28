/**
 * The embedding cache.
 *
 * The positive case is easy and not where the risk is. The cases that matter are the ones where
 * a cache would return something subtly WRONG: a vector from a different model, a vector of the
 * wrong length, or a degraded response frozen in place with no TTL to expire it.
 */

const mockStore = new Map<string, any>();
let getThrows = false;
let setThrows = false;

jest.mock('../../src/services/cache.service', () => ({
  cacheService: {
    async get(k: string) { if (getThrows) throw new Error('cache down'); return mockStore.get(k) ?? null; },
    async set(k: string, v: any) { if (setThrows) throw new Error('cache down'); mockStore.set(k, v); },
    async del(k: string) { mockStore.delete(k); },
  },
}));

/** Counts real API calls, so a cache hit is observable as a call that did NOT happen. */
let apiCalls = 0;
let apiReturns: number[] = new Array(768).fill(0.5);

jest.mock('@google/genai', () => ({ GoogleGenAI: class {} }));
jest.mock('../../src/services/ai/googleGenAIClient', () => ({
  createGoogleGenAIClient: () => ({
    models: {
      embedContent: async () => {
        apiCalls++;
        return { embeddings: [{ values: apiReturns }] };
      },
    },
  }),
}));
jest.mock('../../src/config/env', () => ({
  env: { GEMINI_API_KEY: 'test-key', NODE_ENV: 'test' },
  assertAIEnabled: () => {},
}));

/**
 * Telemetry.logCost schedules a deferred Firestore write. Left real, that timer fires after Jest
 * tears the environment down and crashes the process on exit — the suite passes and the run still
 * fails. A unit test for a cache has no business writing to Firestore, so it is stubbed.
 */
jest.mock('../../src/lib/telemetry', () => ({
  Telemetry: { logCost: () => {}, logCacheHit: () => {}, logLatency: () => {}, logFailure: () => {} },
}));

import { GoogleEmbeddingProvider } from '../../src/services/ai/providers/google-embedding.provider';

const DIM = 768;
const vec = (fill: number) => new Array(DIM).fill(fill);

beforeEach(() => {
  mockStore.clear();
  apiCalls = 0;
  apiReturns = vec(0.5);
  getThrows = false;
  setThrows = false;
});

describe('hits and misses', () => {
  it('calls the API once for a repeated query, not twice', async () => {
    const p = new GoogleEmbeddingProvider();
    const a = await p.generateEmbedding('what is photosynthesis');
    const b = await p.generateEmbedding('what is photosynthesis');
    expect(apiCalls).toBe(1);
    expect(b).toEqual(a);
  });

  it('treats whitespace-only differences as the same text', async () => {
    const p = new GoogleEmbeddingProvider();
    await p.generateEmbedding('what is  photosynthesis');
    await p.generateEmbedding('  what is photosynthesis\n');
    expect(apiCalls).toBe(1);
  });

  it('does NOT fold case — different case is a different embedding', async () => {
    // "Hg" and "hg" are not the same token to the model. Returning one for the other would be
    // the cache lying about what it holds.
    const p = new GoogleEmbeddingProvider();
    await p.generateEmbedding('Hg is mercury');
    await p.generateEmbedding('hg is mercury');
    expect(apiCalls).toBe(2);
  });

  it('embeds a genuinely different query separately', async () => {
    const p = new GoogleEmbeddingProvider();
    await p.generateEmbedding('what is photosynthesis');
    await p.generateEmbedding('what is respiration');
    expect(apiCalls).toBe(2);
  });
});

describe('the cache must never serve a vector from a different configuration', () => {
  it('keys on the model, so two models never share an entry', async () => {
    const a = new GoogleEmbeddingProvider('gemini-embedding-001');
    const b = new GoogleEmbeddingProvider('some-future-model');
    await a.generateEmbedding('identical text');
    await b.generateEmbedding('identical text');
    // Two calls, not one: the second model must not inherit the first model's vector, which
    // would be incompatible with the index it is searched against.
    expect(apiCalls).toBe(2);
    expect(mockStore.size).toBe(2);
  });

  it('puts the model and dimension in the key', async () => {
    await new GoogleEmbeddingProvider('gemini-embedding-001').generateEmbedding('q');
    const key = [...mockStore.keys()][0];
    expect(key).toContain('gemini-embedding-001');
    expect(key).toContain('768');
  });

  it('ignores a stored value of the wrong length instead of returning it', async () => {
    const p = new GoogleEmbeddingProvider();
    await p.generateEmbedding('poisoned');
    const key = [...mockStore.keys()][0];
    mockStore.set(key, [1, 2, 3]);            // truncated by something else
    const out = await p.generateEmbedding('poisoned');
    expect(out).toHaveLength(DIM);            // refetched, not the 3-element junk
    expect(apiCalls).toBe(2);
  });
});

describe('what must not be written', () => {
  it('does not cache a degraded (empty) response', async () => {
    // With no TTL, caching one bad response would make it permanent.
    apiReturns = [];
    const p = new GoogleEmbeddingProvider();
    await p.generateEmbedding('transient failure');
    expect(mockStore.size).toBe(0);
  });

  it('does not cache a short vector', async () => {
    apiReturns = vec(0.5).slice(0, 100);
    await new GoogleEmbeddingProvider().generateEmbedding('wrong dimensions');
    expect(mockStore.size).toBe(0);
  });

  it('does not cache long document chunks, which would evict query vectors', async () => {
    // InMemoryCache holds 5000 entries. Ingestion would fill all of them with single-use text.
    const chunk = 'x'.repeat(2000);
    await new GoogleEmbeddingProvider().generateEmbedding(chunk);
    expect(mockStore.size).toBe(0);
    expect(apiCalls).toBe(1);
  });

  it('does not cache empty input', async () => {
    await new GoogleEmbeddingProvider().generateEmbedding('');
    expect(mockStore.size).toBe(0);
  });
});

describe('the cache is never load-bearing', () => {
  it('still returns a vector when reads throw', async () => {
    getThrows = true;
    const out = await new GoogleEmbeddingProvider().generateEmbedding('cache is down');
    expect(out).toHaveLength(DIM);
    expect(apiCalls).toBe(1);
  });

  it('still returns a vector when writes throw', async () => {
    setThrows = true;
    const out = await new GoogleEmbeddingProvider().generateEmbedding('cache is down');
    expect(out).toHaveLength(DIM);
  });
});

describe('batch embedding', () => {
  it('skips the rate-limit pause for cached items', async () => {
    const p = new GoogleEmbeddingProvider();
    await p.generateEmbedding('one');
    await p.generateEmbedding('two');       // both now cached, no request needed
    apiCalls = 0;

    const started = Date.now();
    const out = await p.generateEmbeddings(['one', 'two']);
    const elapsed = Date.now() - started;

    expect(apiCalls).toBe(0);
    expect(out).toHaveLength(2);
    // The pause exists to space out requests. Two hits made none, so there is nothing to space.
    expect(elapsed).toBeLessThan(900);
  });

  it('still returns the right vectors in order', async () => {
    const p = new GoogleEmbeddingProvider();
    apiReturns = vec(0.1);
    await p.generateEmbedding('first');
    apiReturns = vec(0.2);
    await p.generateEmbedding('second');

    const out = await p.generateEmbeddings(['second', 'first']);
    expect(out[0][0]).toBeCloseTo(0.2);
    expect(out[1][0]).toBeCloseTo(0.1);
  });
});
