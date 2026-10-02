/**
 * Checkpoint 1 — reference-book isolation, int8 quantization, honest hybrid scoring.
 * Qdrant is mocked at the client boundary, so these assert on exactly what would be SENT.
 */
const mockClient = {
  collectionExists: jest.fn(),
  createCollection: jest.fn(),
  getCollection: jest.fn(),
  updateCollection: jest.fn(),
  createPayloadIndex: jest.fn().mockResolvedValue(undefined),
  query: jest.fn(),
  scroll: jest.fn(),
  count: jest.fn(),
  upsert: jest.fn().mockResolvedValue(undefined),
};
jest.mock('@qdrant/js-client-rest', () => ({ QdrantClient: jest.fn(() => mockClient) }));
jest.mock('../../src/config/firebase', () => ({ db: {} }));
jest.mock('../../src/config/env', () => ({
  env: { ...jest.requireActual('../../src/config/env').env, VECTOR_STORE: 'pinecone', PINECONE_NAMESPACE: 'production' },
}));

import {
  QdrantService, SCALAR_QUANTIZATION_CONFIG, QUANTIZATION_SEARCH_PARAMS, HNSW_SETTINGS, QdrantConfigurationError,
} from '../../src/services/rag/qdrant.service';
import { toQdrantFilter, PINECONE_NAMESPACE_KEY, toQdrantId } from '../../src/services/rag/qdrantFilter';
import { REFERENCE_BOOK_NAMESPACE } from '../../src/services/rag/namespaces';
import { examRelevanceCodes } from '../../src/services/rag/referenceBooks.service';
import { bm25Idf, bm25Score, reciprocalRankFusion, queryTerms, tokenize } from '../../src/services/rag/lexicalScore';

const goodInfo = {
  config: {
    params: { vectors: { size: 768, distance: 'Cosine' } },
    hnsw_config: { ...HNSW_SETTINGS.hnsw_config },
    optimizer_config: { indexing_threshold: HNSW_SETTINGS.optimizers_config.indexing_threshold },
    quantization_config: { scalar: { ...SCALAR_QUANTIZATION_CONFIG.scalar } },
  },
};
const point = (id: string, ns: string, text: string, vector?: number[]) => ({
  id: toQdrantId(ns, id), score: 0.7, vector, payload: { text, [PINECONE_NAMESPACE_KEY]: ns, pinecone_id: id },
});

beforeEach(() => {
  jest.clearAllMocks();
  mockClient.createPayloadIndex.mockResolvedValue(undefined);
});

describe('namespace isolation', () => {
  it('every reference-book filter starts with the namespace condition', () => {
    const f = toQdrantFilter({ corpusBucket: 'REFERENCE_BOOK', exam_relevance: { $in: ['JEE_MAIN'] } }, REFERENCE_BOOK_NAMESPACE);
    expect(f.must![0]).toEqual({ key: PINECONE_NAMESPACE_KEY, match: { value: 'reference_books' } });
    expect(f.must).toContainEqual({ key: 'exam_relevance', match: { any: ['JEE_MAIN'] } });
  });

  it('the same id in two namespaces is two different points', () => {
    expect(toQdrantId('production', 'x_chunk_0')).not.toBe(toQdrantId(REFERENCE_BOOK_NAMESPACE, 'x_chunk_0'));
  });

  it('a production query can never match reference-book points', () => {
    const f = toQdrantFilter({}, 'production');
    expect(f.must).toEqual([{ key: PINECONE_NAMESPACE_KEY, match: { value: 'production' } }]);
  });

  it('maps resolver exam ids onto the tags books were ingested with — never GENERAL', () => {
    expect(examRelevanceCodes('NEET_UG')).toEqual(['NEET_UG', 'NEET']);
    expect(examRelevanceCodes('UPSC_CSE')).toEqual(['UPSC_CSE', 'UPSC']);
    expect(examRelevanceCodes('JEE_MAIN')).toEqual(['JEE_MAIN']);
    for (const e of ['NEET_UG', 'UPSC_CSE', 'SSC_CGL', 'IBPS_PO']) expect(examRelevanceCodes(e)).not.toContain('GENERAL');
  });

  it('pineconeService routes EVERY reference-namespace operation to Qdrant even when VECTOR_STORE=pinecone', async () => {
    const { pineconeService } = require('../../src/services/rag/pinecone.service');
    const { qdrantService } = require('../../src/services/rag/qdrant.service');
    const up = jest.spyOn(qdrantService, 'upsertVectors').mockResolvedValue(undefined);
    const q = jest.spyOn(qdrantService, 'queryVectors').mockResolvedValue([]);
    await pineconeService.upsertVectors([{ id: 'a', values: [1], metadata: {} }], REFERENCE_BOOK_NAMESPACE);
    await pineconeService.queryVectors([1], 3, undefined, REFERENCE_BOOK_NAMESPACE);
    expect(up).toHaveBeenCalledWith(expect.any(Array), REFERENCE_BOOK_NAMESPACE);
    expect(q).toHaveBeenCalledWith([1], 3, undefined, REFERENCE_BOOK_NAMESPACE);
  });
});

describe('int8 scalar quantization', () => {
  it('declares the target configuration', () => {
    expect(SCALAR_QUANTIZATION_CONFIG).toEqual({ scalar: { type: 'int8', quantile: 0.99, always_ram: true } });
    expect(QUANTIZATION_SEARCH_PARAMS).toEqual({ rescore: true, oversampling: 2.0 });
  });

  it('creates a missing collection with int8 quantization', async () => {
    mockClient.collectionExists.mockResolvedValue({ exists: false });
    mockClient.getCollection.mockResolvedValue(goodInfo);
    const res = await new QdrantService('c').ensureCollection();
    expect(mockClient.createCollection).toHaveBeenCalledWith('c', expect.objectContaining({
      vectors: { size: 768, distance: 'Cosine' }, quantization_config: SCALAR_QUANTIZATION_CONFIG,
    }));
    expect(res.created).toBe(true);
  });

  it('upgrades an existing collection in place, then re-verifies', async () => {
    mockClient.collectionExists.mockResolvedValue({ exists: true });
    const noQuant = { config: { ...goodInfo.config, quantization_config: null } };
    mockClient.getCollection.mockResolvedValueOnce(noQuant).mockResolvedValueOnce(goodInfo);
    const res = await new QdrantService('c').ensureCollection();
    expect(mockClient.updateCollection).toHaveBeenCalledWith('c', { quantization_config: SCALAR_QUANTIZATION_CONFIG });
    expect(mockClient.createCollection).not.toHaveBeenCalled();
    expect(res.updated).toEqual(['quantization']);
  });

  it('fails loudly — and never modifies — a collection with the wrong vector size', async () => {
    mockClient.collectionExists.mockResolvedValue({ exists: true });
    mockClient.getCollection.mockResolvedValue({ config: { ...goodInfo.config, params: { vectors: { size: 1536, distance: 'Cosine' } } } });
    await expect(new QdrantService('c').ensureCollection()).rejects.toBeInstanceOf(QdrantConfigurationError);
    expect(mockClient.updateCollection).not.toHaveBeenCalled();
  });

  it('an incompatible collection found at startup disables every read with RETRIEVAL_CONFIGURATION_ERROR', async () => {
    mockClient.collectionExists.mockResolvedValue({ exists: true });
    mockClient.getCollection.mockResolvedValue({ config: { ...goodInfo.config, params: { vectors: { size: 768, distance: 'Dot' } } } });
    const svc = new QdrantService('c');
    await svc.initialize();
    expect(svc.getInitState().state).toBe('incompatible');
    await expect(svc.queryVectors([1], 3, undefined, REFERENCE_BOOK_NAMESPACE)).rejects.toMatchObject({ code: 'RETRIEVAL_CONFIGURATION_ERROR' });
    expect(mockClient.query).not.toHaveBeenCalled();
  });

  it('every dense query sends the quantization search params and the namespace filter', async () => {
    mockClient.query.mockResolvedValue({ points: [] });
    await new QdrantService('c').queryVectors([0.1], 4, { book: 'hc_verma_physics_vol1' }, REFERENCE_BOOK_NAMESPACE);
    const body = mockClient.query.mock.calls[0][1];
    expect(body.params.quantization).toEqual({ rescore: true, oversampling: 2.0 });
    expect(body.filter.must[0]).toEqual({ key: PINECONE_NAMESPACE_KEY, match: { value: 'reference_books' } });
  });
});

describe('hybrid search scores are real', () => {
  it('BM25 primitives behave as documented', () => {
    expect(bm25Idf(1000, 1)).toBeGreaterThan(bm25Idf(1000, 500));
    const idf = new Map([['kirchhoff', bm25Idf(1000, 3)]]);
    expect(bm25Score(tokenize('kirchhoff loop rule kirchhoff'), idf, 4)).toBeGreaterThan(bm25Score(tokenize('kirchhoff law and other words here'), idf, 4));
    expect(bm25Score(tokenize('nothing relevant'), idf, 4)).toBe(0);
    expect(queryTerms('What is the Kirchhoff loop rule?')).toEqual(['kirchhoff', 'loop', 'rule']);
    const fused = reciprocalRankFusion(['a', 'b'], ['b', 'c'], 0.6, 60);
    expect(fused.get('b')!).toBeGreaterThan(fused.get('a')!);
  });

  it('keyword-only hits get their TRUE cosine similarity and BM25 rank — no invented 0.58–0.85 band', async () => {
    const ns = REFERENCE_BOOK_NAMESPACE;
    const q = [1, 0];
    mockClient.query.mockResolvedValue({ points: [point('dense1', ns, 'unrelated dense text', undefined)] });
    mockClient.count.mockImplementation(async (_c: string, { filter }: any) => {
      const hasTerm = (filter.must || []).some((m: any) => m.match?.text);
      return { count: hasTerm ? 2 : 100 };
    });
    // Keyword-only hit, orthogonal-ish vector: cosine must be computed (≈0.6), not assigned.
    mockClient.scroll.mockResolvedValue({ points: [point('kw1', ns, 'kirchhoff kirchhoff loop rule', [0.6, 0.8])] });
    const out = await new QdrantService('c').hybridQuery({ queryText: 'kirchhoff loop rule', queryVector: q, topK: 5, namespace: ns });

    const kw = out.find((m) => m.id === 'kw1')!;
    expect(kw.score).toBeCloseTo(0.6, 5);
    expect(kw.hybrid!.keywordRank).toBe(1);
    expect(kw.hybrid!.bm25).toBeGreaterThan(0);
    expect(kw.hybrid!.denseRank).toBeUndefined();
    const dense = out.find((m) => m.id === 'dense1')!;
    expect(dense.score).toBe(0.7);
    // Every count/scroll the keyword arm issued stayed inside the namespace.
    for (const call of [...mockClient.count.mock.calls, ...mockClient.scroll.mock.calls]) {
      expect(call[1].filter.must[0]).toEqual({ key: PINECONE_NAMESPACE_KEY, match: { value: ns } });
    }
  });

  it('falls back to dense-only (logged) when the keyword arm fails', async () => {
    mockClient.query.mockResolvedValue({ points: [point('d', 'production', 'x')] });
    mockClient.count.mockRejectedValue(new Error('no text index'));
    const out = await new QdrantService('c').hybridQuery({ queryText: 'kirchhoff rule', queryVector: [1], topK: 3, namespace: 'production' });
    expect(out.map((m) => m.id)).toEqual(['d']);
    expect(out[0].hybrid).toEqual({ denseRank: 1, rrf: expect.any(Number) });
  });
});
