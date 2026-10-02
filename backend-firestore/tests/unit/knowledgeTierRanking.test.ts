/**
 * Checkpoint 3 — one authority model, applied ACROSS tiers, in the real chat retrieval path.
 */
jest.mock('../../src/core/agents/KnowledgeGraphAgent', () => ({ KnowledgeGraphAgent: class { async execute() {} } }));
// Not on these code paths (no notebook, not an exact-paper request); mocked so their module graphs
// — which carry unrelated pre-existing type errors — are not compiled into this suite.
jest.mock('../../src/core/pipeline/exploration/ContentExplorationService', () => ({ contentExplorationService: {} }));
jest.mock('../../src/services/pyq/canonicalPyqRetrieval.service', () => ({ canonicalPyqRetrievalService: {} }));
jest.mock('../../src/services/pyq/pyqQueryParser', () => ({
  parsePyqQuery: jest.fn(async () => ({ intent: 'CONCEPT', examId: 'JEE_MAIN', year: null, shift: null, paper: null, topic: null })),
}));
jest.mock('../../src/core/knowledge', () => ({
  knowledgeService: {},
  KnowledgeService: class {},
  knowledgeRouter: {
    route: jest.fn(() => ({
      useCurriculum: true, useOfficialSyllabus: false, usePYQs: true, useReferenceBooks: true,
      targetExamId: 'JEE_MAIN', targetSubject: 'Physics', referenceBookFilters: { books: ['hc_verma_physics_vol1'] },
    })),
  },
}));

import {
  KNOWLEDGE_AUTHORITY_WEIGHTS, KNOWLEDGE_TIER_ORDER, rankAcrossTiers, selectContext, authorityWeight,
} from '../../src/core/knowledge/knowledgeAuthority';
import { RetrievalOrchestrator } from '../../src/core/workflow/services/RetrievalOrchestrator';

describe('central authority weights', () => {
  it('defines the four tiers once', () => {
    expect(KNOWLEDGE_AUTHORITY_WEIGHTS).toEqual({ OFFICIAL_PRIMARY: 1.4, VERIFIED_PYQ: 1.2, REFERENCE_BOOK: 0.9, AI_GENERATED: 0.6 });
    expect(KNOWLEDGE_TIER_ORDER).toEqual(['OFFICIAL_PRIMARY', 'VERIFIED_PYQ', 'REFERENCE_BOOK', 'AI_GENERATED']);
  });

  it('maps every fine-grained authority label the retrieval code uses onto a tier', () => {
    expect(authorityWeight('NCERT')).toBe(1.4);
    expect(authorityWeight('OFFICIAL_SYLLABUS')).toBe(1.4);
    expect(authorityWeight('AUTHENTIC_PYQ')).toBe(1.2);
    expect(authorityWeight('REFERENCE_BOOK')).toBe(0.9);
    expect(authorityWeight('PRACTICE_QUESTION')).toBe(0.6);
    expect(authorityWeight('USER_UPLOAD')).toBe(1.0);
    expect(authorityWeight(undefined)).toBe(1.0);
  });

  it('on equal relevance: official > PYQ > reference > AI-generated, by weighted score', () => {
    const ranked = rankAcrossTiers([
      { tier: 'AI_GENERATED', relevance: 0.8, item: 'ai' },
      { tier: 'REFERENCE_BOOK', relevance: 0.8, item: 'ref' },
      { tier: 'VERIFIED_PYQ', relevance: 0.8, item: 'pyq' },
      { tier: 'OFFICIAL_PRIMARY', relevance: 0.8, item: 'ncert' },
    ]);
    expect(ranked.map((r) => r.item)).toEqual(['ncert', 'pyq', 'ref', 'ai']);
    expect(ranked.map((r) => r.weightedScore)).toEqual([0.8 * 1.4, 0.8 * 1.2, 0.8 * 0.9, 0.8 * 0.6].map((x) => expect.closeTo(x, 10)));
  });

  it('weights, not strict precedence: a far more relevant reference passage beats a barely-relevant official one', () => {
    const ranked = rankAcrossTiers([
      { tier: 'OFFICIAL_PRIMARY', relevance: 0.2, item: 'weak-ncert' },
      { tier: 'REFERENCE_BOOK', relevance: 0.9, item: 'strong-ref' },
    ]);
    expect(ranked[0].item).toBe('strong-ref');
  });

  it('selectContext keeps the top-N by weighted score, then presents them in tier order', () => {
    const chosen = selectContext([
      { tier: 'REFERENCE_BOOK', relevance: 0.95, item: 'ref' },
      { tier: 'OFFICIAL_PRIMARY', relevance: 0.6, item: 'ncert' },
      { tier: 'VERIFIED_PYQ', relevance: 0.1, item: 'weak-pyq' },
    ], 2);
    expect(chosen.map((c) => c.item)).toEqual(['ncert', 'ref']);
  });
});

describe('RetrievalOrchestrator — reference books in the student chat path', () => {
  const drain = async (gen: AsyncGenerator<any, any>) => {
    const events: any[] = [];
    let r = await gen.next();
    while (!r.done) { events.push(r.value); r = await gen.next(); }
    return { events, outcome: r.value };
  };
  const ctx = () => ({ request: {}, retrievedContext: '', sharedState: {}, studentContext: { examContext: { examId: 'JEE_MAIN' } } });
  const plan = { needsWebSearch: false, hasAttachment: false, isConversational: false } as any;

  const build = (opts: { refFails?: boolean; rerank?: any } = {}) => {
    const retrieval = {
      retrieveCurriculumContext: jest.fn().mockResolvedValue([{ text: 'NCERT: torque', source: 'NCERT Physics XI', score: 0.7, metadata: {} }]),
      retrievePyqContext: jest.fn().mockResolvedValue([{ text: 'PYQ: a rod pivoted…', source: 'pyq', score: 0.66, metadata: { examId: 'JEE_MAIN', year: 2024 } }]),
      retrieveOfficialSyllabusContext: jest.fn().mockResolvedValue([]),
      retrieveWebContext: jest.fn().mockResolvedValue([]),
    };
    const referenceBooks = {
      retrieveReferenceContext: opts.refFails
        ? jest.fn().mockRejectedValue(new Error('qdrant down'))
        : jest.fn().mockResolvedValue([{
            text: '--- PARENT CONTEXT: HC Verma ---\nlong parent text', source: 'Concepts of Physics — p. 12', score: 0.8,
            metadata: { childText: 'child chunk about torque', book: 'hc_verma_physics_vol1', parentDocId: 'parent_x', retrieval: { hyde: 'colloquial' } },
          }]),
    };
    const reranker = { rerank: jest.fn(opts.rerank ?? (async (_q: string, docs: string[]) => docs.map((_d, index) => ({ index, relevanceScore: 0.8 })))) };
    return { retrieval, referenceBooks, reranker, orch: new RetrievalOrchestrator(retrieval as any, {} as any, referenceBooks as any, reranker as any) };
  };

  it('retrieves reference books with the student exam, HyDE on auto and the subject as the HyDE domain', async () => {
    const { orch, referenceBooks } = build();
    await drain(orch.stream({ userId: 'u', query: 'why does a spinning top not fall', history: [] } as any, ctx() as any, plan));
    expect(referenceBooks.retrieveReferenceContext).toHaveBeenCalledWith('why does a spinning top not fall', expect.objectContaining({
      examCode: 'JEE_MAIN', useHyde: 'auto', domain: 'Physics', book: ['hc_verma_physics_vol1'],
    }));
  });

  it('ranks across tiers on one reranked scale and presents official → PYQ → reference', async () => {
    const { orch, reranker } = build();
    const c = ctx();
    const { outcome } = await drain(orch.stream({ userId: 'u', query: 'torque', history: [] } as any, c as any, plan));
    expect(reranker.rerank).toHaveBeenCalledTimes(1);
    // The reference passage is reranked by its matched child chunk, not the expanded parent.
    expect(reranker.rerank.mock.calls[0][1]).toContain('child chunk about torque');
    const text: string = (c as any).retrievedContext;
    const iNcert = text.indexOf('NCERT CURRICULUM CONTEXT');
    const iPyq = text.indexOf('PREVIOUS YEAR QUESTIONS');
    const iRef = text.indexOf('REFERENCE BOOK CONTEXT');
    expect(iNcert).toBeGreaterThanOrEqual(0);
    expect(iNcert).toBeLessThan(iPyq);
    expect(iPyq).toBeLessThan(iRef);
    const byTier = Object.fromEntries(outcome.citationsList.map((x: any) => [x.authorityTier, x]));
    expect(byTier.OFFICIAL_PRIMARY.authorityScore).toBe(1.4);
    expect(byTier.VERIFIED_PYQ.authorityScore).toBe(1.2);
    expect(byTier.REFERENCE_BOOK.authorityScore).toBe(0.9);
    expect(byTier.REFERENCE_BOOK.weightedScore).toBeCloseTo(0.72, 5);
    expect(byTier.REFERENCE_BOOK.text).toBe('child chunk about torque');
    expect(outcome.trace.tiers).toMatchObject({ relevanceScale: 'reranked', examId: 'JEE_MAIN', referenceHyde: 'colloquial' });
  });

  it('drops a passage the joint rerank judges irrelevant', async () => {
    const { orch } = build({ rerank: async (_q: string, docs: string[]) => docs.map((d, index) => ({ index, relevanceScore: d.includes('child chunk') ? 0.01 : 0.8 })) });
    const { outcome } = await drain(orch.stream({ userId: 'u', query: 'torque', history: [] } as any, ctx() as any, plan));
    expect(outcome.citationsList.some((x: any) => x.authorityTier === 'REFERENCE_BOOK')).toBe(false);
  });

  it('a failing tier is reported and the other tiers still answer', async () => {
    const { orch } = build({ refFails: true });
    const { outcome } = await drain(orch.stream({ userId: 'u', query: 'torque', history: [] } as any, ctx() as any, plan));
    expect(outcome.citationsList.length).toBe(2);
    expect(outcome.trace.tiers.errors).toEqual(['reference_books']);
  });
});
