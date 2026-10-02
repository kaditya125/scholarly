import { AgentContext } from '../../src/core/workflow/services/AgentOrchestrator';

// Mock heavy graph + RAG dependencies before importing orchestrators.
jest.mock('../../src/services/ai/providers/google-embedding.provider', () => ({ GoogleEmbeddingProvider: jest.fn(() => ({ generateEmbedding: jest.fn().mockResolvedValue([0.1]) })) }));
jest.mock('../../src/services/ai/gemini.provider', () => ({ GeminiProvider: jest.fn(() => ({ generateResponse: jest.fn() })) }));
jest.mock('../../src/services/ai/providers/cohere-reranker.provider', () => ({ CohereRerankerProvider: jest.fn(() => ({ rerank: jest.fn() })) }));
jest.mock('../../src/services/cache.service', () => ({ cacheService: { get: jest.fn().mockResolvedValue(null), set: jest.fn() } }));
jest.mock('../../src/services/rag/pinecone.service', () => ({ pineconeService: { queryVectors: jest.fn() } }));
jest.mock('../../src/services/rag/search.service', () => ({ searchService: { search: jest.fn() } }));
jest.mock('../../src/core/agents/KnowledgeGraphAgent', () => ({
  knowledgeGraphAgent: {
    findRelatedConcepts: jest.fn().mockResolvedValue({ concepts: ['neighbor'] }),
    findPrerequisites: jest.fn().mockResolvedValue({ prerequisites: [] }),
  },
}));

// Notebook access and canonical PYQ lookup are not what these tests exercise; mocked so their
// module graphs (which carry unrelated type errors) are not compiled into the suite.
jest.mock('../../src/core/pipeline/exploration/ContentExplorationService', () => ({
  contentExplorationService: { ensureCollectionAccess: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock('../../src/services/pyq/canonicalPyqRetrieval.service', () => ({ canonicalPyqRetrievalService: {} }));
jest.mock('../../src/services/pyq/pyqQueryParser', () => ({
  parsePyqQuery: jest.fn(async () => ({ intent: 'CONCEPT', examId: null, year: null, shift: null, paper: null, topic: null })),
}));
jest.mock('../../src/services/pyq/examIndex', () => ({
  ...jest.requireActual('../../src/services/pyq/examIndex'),
  detectExamId: jest.fn().mockResolvedValue(null),
}));
jest.mock('../../src/core/knowledge', () => ({
  knowledgeService: {},
  KnowledgeService: class {},
  knowledgeRouter: jest.requireActual('../../src/core/knowledge/knowledgeRouter.service').knowledgeRouter,
}));
jest.mock('../../src/services/rag/referenceBooks.service', () => ({
  referenceBooksService: { retrieveReferenceContext: jest.fn().mockResolvedValue([]) },
  ReferenceBooksService: class {},
}));

import { RetrievalOrchestrator } from '../../src/core/workflow/services/RetrievalOrchestrator';
import { contentExplorationService } from '../../src/core/pipeline/exploration/ContentExplorationService';

function makeReq(overrides: Record<string, unknown> = {}) {
  return {
    query: 'explain gauss law',
    history: [],
    systemPrompt: 'be helpful',
    notebookId: undefined,
    ...overrides,
  };
}

function agentCtx(): AgentContext {
  return {
    runId: 'r1',
    correlationId: 'c1',
    userContext: {
      authId: 'u1',
      uid: 'u1',
      email: 'u@example.com',
      displayName: 'U',
      role: 'student',
      isAnonymous: false,
      accountStatus: 'active',
      subscriptionTier: 'free',
      sessionCreatedAt: Date.now(),
    },
    clientIp: '127.0.0.1',
    timestamp: Date.now(),
    metadata: {},
    toolExecutions: [],
    isDisposed: false,
    auditLog: [],
  };
}

async function drain(gen: AsyncGenerator<any, any, any>): Promise<{ events: any[]; outcome: any }> {
  const events: any[] = [];
  while (true) {
    const next = await gen.next();
    if (next.done) return { events, outcome: next.value };
    events.push(next.value);
  }
}

describe('RetrievalOrchestrator', () => {
  it('notebook path: fuses graph search + vector search without re-running graph', async () => {
    const retrieval = {
      retrieveContext: jest.fn().mockResolvedValue([
        { source: 'Ch1.pdf', text: 'gauss text', score: 0.9, metadata: {} },
      ]),
      retrieveCurriculumContext: jest.fn(),
      retrieveWebContext: jest.fn(),
    };
    const orch = new RetrievalOrchestrator(retrieval as any);
    const ctx = agentCtx();
    // Simulate the graph stage having already run in the parallel batch.
    await orch.runGraphRetrieval(ctx as any);
    const { events, outcome } = await drain(
      orch.stream(makeReq({ notebookId: 'nb1' }) as any, ctx as any, { needsWebSearch: false, hasAttachment: false, isConversational: false }),
    );

    // Vector-only event sequence: RAG progress, citation, RAG detail (no graph events).
    const types = events.map(e => e.type);
    expect(types).toEqual(['progress', 'citation', 'progress']);
    expect(events[1].citation!.source).toBe('Ch1.pdf');
    expect(outcome.citationsList).toHaveLength(1);
    expect(retrieval.retrieveContext).toHaveBeenCalledWith('explain gauss law', 'nb1', undefined, 5, ['neighbor'], undefined);
    // Graph context (from the earlier runGraphRetrieval) is fused into the retrieved context.
    expect(ctx.retrievedContext).toContain('KNOWLEDGE GRAPH CONTEXT');
    expect(ctx.retrievedContext).toContain('NOTEBOOK CONTEXT');
  });

  it('never searches a notebook the caller does not own', async () => {
    // notebookId arrives in the request body; without the ownership gate it went straight into the
    // vector filter (an IDOR). A denied notebook falls back to the shared corpora instead.
    (contentExplorationService.ensureCollectionAccess as jest.Mock).mockRejectedValue(new Error('forbidden'));
    const retrieval = {
      retrieveContext: jest.fn(),
      retrieveCurriculumContext: jest.fn().mockResolvedValue([]),
      retrieveWebContext: jest.fn(),
    };
    const orch = new RetrievalOrchestrator(retrieval as any);
    await drain(
      orch.stream(makeReq({ notebookId: 'someone_elses_nb' }) as any, agentCtx() as any, { needsWebSearch: false, hasAttachment: false, isConversational: false }),
    );
    expect(retrieval.retrieveContext).not.toHaveBeenCalled();
  });

  it('no-notebook path: grounds in curriculum and emits a citation', async () => {
    const retrieval = {
      retrieveContext: jest.fn(),
      retrieveCurriculumContext: jest.fn().mockResolvedValue([
        { source: 'NCERT-X', text: 'c', score: 0.7, metadata: {} },
      ]),
      retrieveWebContext: jest.fn(),
    };
    const orch = new RetrievalOrchestrator(retrieval as any);
    const { events, outcome } = await drain(
      orch.stream(makeReq() as any, agentCtx() as any, { needsWebSearch: false, hasAttachment: false, isConversational: false }),
    );
    expect(retrieval.retrieveCurriculumContext).toHaveBeenCalledWith('explain gauss law', 5);
    expect(outcome.citationsList).toHaveLength(1);
    expect(events.some(e => e.type === 'citation')).toBe(true);
  });

  it('attachment path: skips curriculum retrieval and emits the attachment detail', async () => {
    const retrieval = {
      retrieveContext: jest.fn(),
      retrieveCurriculumContext: jest.fn(),
      retrieveWebContext: jest.fn(),
    };
    const orch = new RetrievalOrchestrator(retrieval as any);
    const { events, outcome } = await drain(
      orch.stream(makeReq({ query: '[File Attached: a.pdf] summarize' }) as any, agentCtx() as any, { needsWebSearch: false, hasAttachment: true, isConversational: false }),
    );
    expect(retrieval.retrieveCurriculumContext).not.toHaveBeenCalled();
    expect(outcome.citationsList).toHaveLength(0);
    const ragDetail = events.filter(e => e.type === 'progress' && e.detail).pop();
    expect(ragDetail!.message).toContain('attached');
  });

  // ── Increment 2: adaptive retrieval routing (sub-flag ENABLE_INTELLIGENCE_RETRIEVAL) ──
  describe('adaptive retrieval routing (flag on)', () => {
    const prev = process.env.ENABLE_INTELLIGENCE_RETRIEVAL;
    beforeEach(() => { process.env.ENABLE_INTELLIGENCE_RETRIEVAL = 'true'; });
    afterEach(() => { process.env.ENABLE_INTELLIGENCE_RETRIEVAL = prev; });

    it("strategy 'vector' runs vector search but does NOT fuse graph context", async () => {
      const retrieval = {
        retrieveContext: jest.fn().mockResolvedValue([{ source: 'Ch1', text: 't', score: 0.9, metadata: {} }]),
        retrieveCurriculumContext: jest.fn(), retrieveWebContext: jest.fn(),
      };
      const orch = new RetrievalOrchestrator(retrieval as any);
      const ctx = agentCtx();
      await orch.runGraphRetrieval(ctx as any); // graph ran (parallel batch), but 'vector' must not fuse it
      const { outcome } = await drain(
        orch.stream(makeReq({ notebookId: 'nb1' }) as any, ctx as any, { needsWebSearch: false, hasAttachment: false, isConversational: false }, { retrievalStrategy: 'vector' } as any),
      );
      expect(retrieval.retrieveContext).toHaveBeenCalled();
      expect(outcome.citationsList).toHaveLength(1);
      expect(ctx.retrievedContext).toContain('NOTEBOOK CONTEXT');
      expect(ctx.retrievedContext).not.toContain('KNOWLEDGE GRAPH CONTEXT'); // graph fusion skipped
    });

    it("strategy 'none' performs no retrieval", async () => {
      const retrieval = {
        retrieveContext: jest.fn(), retrieveCurriculumContext: jest.fn(), retrieveWebContext: jest.fn(),
      };
      const orch = new RetrievalOrchestrator(retrieval as any);
      const ctx = agentCtx();
      await orch.runGraphRetrieval(ctx as any);
      const { outcome } = await drain(
        orch.stream(makeReq({ notebookId: 'nb1' }) as any, ctx as any, { needsWebSearch: false, hasAttachment: false, isConversational: false }, { retrievalStrategy: 'none' } as any),
      );
      expect(retrieval.retrieveContext).not.toHaveBeenCalled();
      expect(retrieval.retrieveCurriculumContext).not.toHaveBeenCalled();
      expect(outcome.citationsList).toHaveLength(0);
      expect(ctx.retrievedContext).not.toContain('KNOWLEDGE GRAPH CONTEXT');
    });
  });
});
