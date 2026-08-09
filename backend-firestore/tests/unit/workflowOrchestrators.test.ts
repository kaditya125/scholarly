import { QueryPlanningService } from '../../src/core/workflow/services/QueryPlanningService';

// Mock the KnowledgeGraphAgent that RetrievalOrchestrator instantiates internally, so the
// test never touches Firestore. The mock populates sharedState like the real agent does.
jest.mock('../../src/core/agents/KnowledgeGraphAgent', () => ({
  KnowledgeGraphAgent: class {
    async execute(ctx: any) {
      ctx.sharedState['graphContext'] = 'GRAPH CONTEXT';
      ctx.sharedState['graphExpansionTerms'] = ['neighbor'];
      ctx.sharedState['graphMeta'] = {
        nodeCount: 3, edgeCount: 5, matched: 2, matchedLabels: ['A', 'B'], expansionTerms: ['neighbor'], traversalMs: 12,
      };
    }
  },
}));

import { RetrievalOrchestrator } from '../../src/core/workflow/services/RetrievalOrchestrator';
import { WorkflowEvent } from '../../src/core/workflow/types';

async function drain<TReturn>(gen: AsyncGenerator<WorkflowEvent, TReturn>) {
  const events: WorkflowEvent[] = [];
  let res = await gen.next();
  while (!res.done) { events.push(res.value); res = await gen.next(); }
  return { events, outcome: res.value };
}

describe('QueryPlanningService', () => {
  const svc = new QueryPlanningService();

  it('flags web search for RESEARCH mode', () => {
    expect(svc.plan('anything', 'RESEARCH').needsWebSearch).toBe(true);
  });

  it('flags web search for time-sensitive queries', () => {
    expect(svc.plan('what is the latest news on X', 'TEACHER').needsWebSearch).toBe(true);
    expect(svc.plan('explain photosynthesis', 'TEACHER').needsWebSearch).toBe(false);
  });

  it('detects an attached file marker', () => {
    expect(svc.plan('[File Attached: notes.pdf]\nsummarize', 'TEACHER').hasAttachment).toBe(true);
    expect(svc.plan('no file here', 'TEACHER').hasAttachment).toBe(false);
  });
});

describe('RetrievalOrchestrator', () => {
  const makeReq = (over: any = {}) => ({ userId: 'u1', query: 'explain gauss law', history: [], ...over });
  const agentCtx = () => ({ request: {} as any, retrievedContext: 'Placeholder RAG Text', sharedState: {} as any });

  it('runGraphRetrieval populates graph shared state; buildGraphDetailMessage reflects it', async () => {
    const orch = new RetrievalOrchestrator({} as any);
    const ctx = agentCtx();
    await orch.runGraphRetrieval(ctx as any);
    expect(ctx.sharedState['graphContext']).toBe('GRAPH CONTEXT');
    expect(ctx.sharedState['graphMeta'].nodeCount).toBe(3);
    const detail = orch.buildGraphDetailMessage(makeReq({ notebookId: 'nb1' }) as any, ctx as any);
    expect(detail).toContain('Matched 2 concept(s)');
    expect(detail).toContain('traversed 3 node(s) / 5 relationship(s)');
  });

  it('notebook path: stream() is vector-only — yields RAG progress, a citation per result, RAG detail', async () => {
    const retrieval = {
      retrieveContext: jest.fn().mockResolvedValue([
        { source: 'Ch1.pdf', text: 'passage', score: 0.9, metadata: { pageNumber: 2 }, selectionReasoning: 'r' },
      ]),
      retrieveCurriculumContext: jest.fn(),
      retrieveWebContext: jest.fn(),
    };
    const orch = new RetrievalOrchestrator(retrieval as any);
    const ctx = agentCtx();
    // Simulate the graph stage having already run in the parallel batch.
    await orch.runGraphRetrieval(ctx as any);
    const { events, outcome } = await drain(
      orch.stream(makeReq({ notebookId: 'nb1' }) as any, ctx as any, { needsWebSearch: false, hasAttachment: false }),
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
      orch.stream(makeReq() as any, agentCtx() as any, { needsWebSearch: false, hasAttachment: false }),
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
      orch.stream(makeReq({ query: '[File Attached: a.pdf] summarize' }) as any, agentCtx() as any, { needsWebSearch: false, hasAttachment: true }),
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
        orch.stream(makeReq({ notebookId: 'nb1' }) as any, ctx as any, { needsWebSearch: false, hasAttachment: false }, { retrievalStrategy: 'vector' } as any),
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
        orch.stream(makeReq({ notebookId: 'nb1' }) as any, ctx as any, { needsWebSearch: false, hasAttachment: false }, { retrievalStrategy: 'none' } as any),
      );
      expect(retrieval.retrieveContext).not.toHaveBeenCalled();
      expect(retrieval.retrieveCurriculumContext).not.toHaveBeenCalled();
      expect(outcome.citationsList).toHaveLength(0);
      expect(ctx.retrievedContext).not.toContain('KNOWLEDGE GRAPH CONTEXT');
    });
  });
});
