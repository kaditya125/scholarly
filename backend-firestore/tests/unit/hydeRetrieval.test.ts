/**
 * Checkpoint 4 — HyDE is gated, domain-aware, cached, fails safe, and wired into reference retrieval.
 */
const mockLlm = { generateResponse: jest.fn() };
const mockEmbed = { generateEmbedding: jest.fn() };
const mockCache = { get: jest.fn(), set: jest.fn() };
const mockPinecone = { hybridQuery: jest.fn(), queryVectors: jest.fn() };
const mockReranker = { rerank: jest.fn() };
jest.mock('../../src/services/ai/gemini.provider', () => ({ GeminiProvider: jest.fn(() => mockLlm) }));
jest.mock('../../src/services/ai/providers/google-embedding.provider', () => ({ GoogleEmbeddingProvider: jest.fn(() => mockEmbed) }));
jest.mock('../../src/services/ai/providers/cohere-reranker.provider', () => ({ CohereRerankerProvider: jest.fn(() => mockReranker) }));
jest.mock('../../src/services/cache.service', () => ({ cacheService: mockCache }));
jest.mock('../../src/services/rag/pinecone.service', () => ({ pineconeService: mockPinecone }));
jest.mock('../../src/services/rag/parentDocument.service', () => ({ parentDocumentService: { hydrateParentContext: jest.fn(async (r: any) => r) } }));

import { classifyHydeNeed, toHydeDomain, buildHydePrompt, HydeService, HYDE_MODEL } from '../../src/services/rag/hyde.service';
import { ReferenceBooksService, HYDE_WEAK_RESULT_COSINE } from '../../src/services/rag/referenceBooks.service';

const RAW = [0.1, 0.2];
const HYDE = [0.9, 0.8];
const hit = (id: string, score: number) => ({ id, score, metadata: { text: `text ${id}`, book_title: 'B', chapter: 'Rotational Mechanics' } });

beforeEach(() => {
  jest.clearAllMocks();
  mockCache.get.mockResolvedValue(null);
  mockCache.set.mockResolvedValue(undefined);
  mockEmbed.generateEmbedding.mockImplementation(async (t: string) => (t.startsWith('Angular momentum') ? HYDE : RAW));
  mockLlm.generateResponse.mockResolvedValue({ reply: 'Angular momentum L = Iω is conserved when net external torque is zero.' });
  mockReranker.rerank.mockImplementation(async (_q: string, docs: string[]) => docs.map((_d, index) => ({ index, relevanceScore: 0.9 })));
});

describe('classifyHydeNeed', () => {
  it.each([
    'why does a moving cycle not fall over?',
    "i don't get why the ball goes up when you throw it",
    'yaar ye torque kaise kaam karta hai',
    'what happens if you spin faster on a chair?',
  ])('colloquial → HyDE: %s', (q) => expect(classifyHydeNeed(q)).toMatchObject({ use: true }));

  it.each([
    ['State and derive the parallel axis theorem for moment of inertia', 'formal'],
    ['JEE Main 2023 shift 1 question on rotational dynamics', 'exact_lookup'],
    ['"A uniform rod of length L is pivoted at one end" find angular acceleration', 'exact_lookup'],
    ['Who wrote the Arthashastra?', 'factual'],
    ['torque', 'too_short'],
  ])('skip HyDE: %s', (q, reason) => expect(classifyHydeNeed(q)).toEqual({ use: false, reason }));
});

describe('domain propagation', () => {
  it('maps real subjects instead of defaulting everything to physics', () => {
    expect(toHydeDomain('Physics')).toBe('physics');
    expect(toHydeDomain('Chemistry')).toBe('chemistry');
    expect(toHydeDomain('Mathematics')).toBe('mathematics');
    expect(toHydeDomain('Biology')).toBe('biology');
    expect(toHydeDomain('General Knowledge')).toBe('general_knowledge');
    // Every subject label knowledgeRouter emits for humanities questions.
    for (const s of ['Political Science', 'History', 'Geography', 'Economics', 'Environment', 'art_and_culture', 'bihar_special', 'ethics']) {
      expect(toHydeDomain(s)).toBe('general_knowledge');
    }
    expect(toHydeDomain('Astrophysics trivia')).toBe('general');
    expect(toHydeDomain('polity')).toBe('general_knowledge');
    expect(toHydeDomain('quantitative_aptitude')).toBe('quantitative_aptitude');
    expect(toHydeDomain('english')).toBe('english');
    expect(toHydeDomain(undefined)).toBe('general');
  });

  it('asks for equations only in quantitative domains', () => {
    expect(buildHydePrompt('q', 'physics')).toMatch(/equations/);
    expect(buildHydePrompt('q', 'general_knowledge')).not.toMatch(/equations/);
    expect(buildHydePrompt('q', 'chemistry')).toMatch(/J\.D\. Lee/);
  });
});

describe('HydeService', () => {
  it('generates with Gemini 2.5 Flash, embeds the passage, caches it', async () => {
    const r = await new HydeService().generateAndEmbed('why does a top not fall?', 'physics');
    expect(mockLlm.generateResponse.mock.calls[0][2]).toMatchObject({ model: HYDE_MODEL });
    expect(HYDE_MODEL).toBe('gemini-2.5-flash');
    expect(mockEmbed.generateEmbedding).toHaveBeenCalledWith(r.hypotheticalPassage);
    expect(r).toMatchObject({ embedding: HYDE, domain: 'physics', fallback: false });
    expect(mockCache.set).toHaveBeenCalledWith(expect.stringContaining('hyde:v2:physics:'), expect.anything(), 3600);
  });

  it('serves a cache hit without calling Gemini', async () => {
    mockCache.get.mockResolvedValue({ embedding: HYDE, hypotheticalPassage: 'p', fallback: false });
    await new HydeService().generateAndEmbed('q one two', 'physics');
    expect(mockLlm.generateResponse).not.toHaveBeenCalled();
  });

  it('falls back to the raw query embedding when Gemini fails — and does not cache the fallback', async () => {
    mockLlm.generateResponse.mockRejectedValue(new Error('429'));
    const r = await new HydeService().generateAndEmbed('why does it spin', 'physics');
    expect(r).toMatchObject({ fallback: true, embedding: RAW, hypotheticalPassage: 'why does it spin' });
    expect(mockCache.set).not.toHaveBeenCalled();
  });
});

describe('reference retrieval wiring (useHyde: "auto")', () => {
  it('a colloquial doubt is searched with the HyDE embedding, in the caller’s domain', async () => {
    mockPinecone.hybridQuery.mockResolvedValue([hit('a', 0.7)]);
    const out = await new ReferenceBooksService().retrieveReferenceContext('why does a spinning top not fall over?', { useHyde: 'auto', domain: 'Physics' });
    expect(mockPinecone.hybridQuery.mock.calls[0][0].queryVector).toEqual(HYDE);
    expect(mockLlm.generateResponse.mock.calls[0][0][0].content).toMatch(/H\.C\. Verma/);
    expect(out[0].metadata.retrieval.hyde).toBe('colloquial');
  });

  it('a formal query with good results never calls Gemini', async () => {
    mockPinecone.hybridQuery.mockResolvedValue([hit('a', 0.8)]);
    await new ReferenceBooksService().retrieveReferenceContext('State the parallel axis theorem for moment of inertia', { useHyde: 'auto', domain: 'Physics' });
    expect(mockLlm.generateResponse).not.toHaveBeenCalled();
    expect(mockPinecone.hybridQuery).toHaveBeenCalledTimes(1);
  });

  it('a formal query with weak results is retried once with HyDE and the results merged', async () => {
    mockPinecone.hybridQuery
      .mockResolvedValueOnce([hit('weak', HYDE_WEAK_RESULT_COSINE - 0.05)])
      .mockResolvedValueOnce([hit('better', 0.75)]);
    const out = await new ReferenceBooksService().retrieveReferenceContext('Explain gyroscopic precession of a symmetric top', { useHyde: 'auto', domain: 'Physics' });
    expect(mockLlm.generateResponse).toHaveBeenCalledTimes(1);
    expect(mockPinecone.hybridQuery.mock.calls[1][0].queryVector).toEqual(HYDE);
    expect(out.map((r) => r.metadata.retrieval.hyde)).toEqual(['weak_results', 'weak_results']);
  });

  it('HyDE is off unless the caller asks for it', async () => {
    mockPinecone.hybridQuery.mockResolvedValue([hit('a', 0.45)]);
    await new ReferenceBooksService().retrieveReferenceContext('why does a spinning top not fall over?', {});
    expect(mockLlm.generateResponse).not.toHaveBeenCalled();
  });

  it('always searches the reference namespace and keeps the exam filter in the fallback query', async () => {
    mockPinecone.hybridQuery.mockResolvedValue([]);
    await new ReferenceBooksService().retrieveReferenceContext('torque on a rod', { examCode: 'NEET_UG', subject: 'physics' });
    for (const [opts] of mockPinecone.hybridQuery.mock.calls) {
      expect(opts.namespace).toBe('reference_books');
      expect(opts.filter.exam_relevance).toEqual({ $in: ['NEET_UG', 'NEET'] });
    }
    expect(mockPinecone.hybridQuery.mock.calls[1][0].filter.subject).toBeUndefined(); // facet dropped, exam kept
  });
});
