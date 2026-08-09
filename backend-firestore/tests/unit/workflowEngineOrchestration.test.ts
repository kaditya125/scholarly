jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), log: jest.fn() },
}));

// Mock every collaborator service so the test verifies ORCHESTRATION only (Task 10).
jest.mock('../../src/core/workflow/services/IntentService', () => ({
  intentService: { classify: jest.fn(), buildDetailMessage: jest.fn(() => 'intent-detail') },
}));
jest.mock('../../src/core/workflow/services/ContextService', () => ({
  contextService: { load: jest.fn(), buildDetailMessage: jest.fn(() => 'ctx-detail') },
}));
jest.mock('../../src/core/workflow/services/MemoryService', () => ({
  memoryService: { loadSessionMemory: jest.fn(), buildDetailMessage: jest.fn(() => 'mem-detail') },
}));
jest.mock('../../src/core/workflow/services/MemoryUpdateService', () => ({
  memoryUpdateService: { extractProfile: jest.fn(), extractProfileTask: jest.fn(), updateSessionMemory: jest.fn() },
}));
jest.mock('../../src/core/workflow/services/TelemetryService', () => ({
  workflowTelemetryService: {
    deriveGenCost: jest.fn(() => ({ provider: 'gemini', model: 'm', promptTokens: 1, completionTokens: 1, totalCostUSD: 0 })),
    persistTelemetry: jest.fn(), logWorkflowMetrics: jest.fn(),
  },
}));
jest.mock('../../src/core/workflow/services/QueryPlanningService', () => ({
  queryPlanningService: { plan: jest.fn(() => ({ needsWebSearch: false, hasAttachment: false })) },
}));
jest.mock('../../src/core/workflow/services/RetrievalOrchestrator', () => ({
  retrievalOrchestrator: {
    runGraphRetrieval: jest.fn().mockResolvedValue(undefined),
    buildGraphDetailMessage: jest.fn(() => 'graph-detail'),
    stream: jest.fn(),
  },
}));
jest.mock('../../src/core/workflow/services/GenerationOrchestrator', () => ({
  generationOrchestrator: { stream: jest.fn() },
}));
jest.mock('../../src/core/workflow/jobs/BackgroundQueue', () => ({
  backgroundQueue: { enqueueGeneric: jest.fn() },
}));

import { workflowEngine, WorkflowEvent } from '../../src/core/workflow/WorkflowEngine';
import { container, TOKENS } from '../../src/core/di/container';
import { intentService } from '../../src/core/workflow/services/IntentService';
import { contextService } from '../../src/core/workflow/services/ContextService';
import { memoryService } from '../../src/core/workflow/services/MemoryService';
import { retrievalOrchestrator } from '../../src/core/workflow/services/RetrievalOrchestrator';
import { generationOrchestrator } from '../../src/core/workflow/services/GenerationOrchestrator';
import { backgroundQueue } from '../../src/core/workflow/jobs/BackgroundQueue';

const asMock = (fn: any) => fn as jest.Mock;

async function collect(gen: AsyncGenerator<WorkflowEvent, void>) {
  const events: WorkflowEvent[] = [];
  for await (const e of gen) events.push(e);
  return events;
}

const req = (over: any = {}) => ({ userId: 'u1', sessionId: 's1', query: 'explain gauss law', history: [], mode: 'TEACHER', traceId: 't1', ...over });

function mockNonGreetingHappyPath() {
  asMock(intentService.classify).mockReturnValue({ mode: 'TEACHER', isGreeting: false, isShortHistory: false, isGreetingFlow: false, wordCount: 3, kind: 'a learning question' });
  asMock(contextService.load).mockResolvedValue({ isOnboarded: true, profile: {}, stats: {} });
  asMock(memoryService.loadSessionMemory).mockResolvedValue({ contextWindow: ['prev'] });
  asMock(retrievalOrchestrator.stream).mockImplementation(async function* () {
    yield { type: 'citation', citation: { source: 'Ch1' } } as WorkflowEvent;
    return { citationsList: [{ source: 'Ch1', score: 0.9 }], retrievalLatencyMs: 12 };
  });
  asMock(generationOrchestrator.stream).mockImplementation(async function* () {
    yield { type: 'chunk', chunk: 'answer' } as WorkflowEvent;
    return { fullReply: 'answer', generatedResponse: 'answer', firstChunkAt: Date.now(), generationLatencyMs: 20, measuredHallucinationRate: 0, measuredCitationCoverage: 1, measuredConfidence: 0.9 };
  });
}

describe('WorkflowEngine orchestration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    container.clear();
    container.register(TOKENS.ReasoningProvider, new (class GeminiProvider {})());
    container.register(TOKENS.AIProvider, { generateStreamResponse: async function* () { yield 'hi there!'; } });
  });
  afterEach(() => container.clear());

  it('non-greeting: orchestrates stages in order and ends with done', async () => {
    mockNonGreetingHappyPath();
    const events = await collect(workflowEngine.executeStream(req() as any));

    const types = events.map(e => e.type);
    expect(types[0]).toBe('progress');           // intent "Understanding..."
    expect(types).toContain('citation');          // from retrieval orchestrator
    expect(types).toContain('chunk');             // from generation orchestrator
    expect(types[types.length - 1]).toBe('done');

    // Delegated to the orchestrators, not inlined.
    expect(retrievalOrchestrator.runGraphRetrieval).toHaveBeenCalledTimes(1);
    expect(retrievalOrchestrator.stream).toHaveBeenCalledTimes(1);
    expect(generationOrchestrator.stream).toHaveBeenCalledTimes(1);

    // The done event carries the citations + confidence from generation.
    const done = events[events.length - 1];
    expect(done.data.citations).toHaveLength(1);
    expect(done.data.confidenceScore).toBe(0.9);
  });

  it('non-greeting: post-response work is enqueued on the BackgroundExecutor (off critical path)', async () => {
    mockNonGreetingHappyPath();
    await collect(workflowEngine.executeStream(req() as any));

    const jobNames = asMock(backgroundQueue.enqueueGeneric).mock.calls.map((c: any[]) => c[0]);
    expect(jobNames).toEqual(expect.arrayContaining(['analytics.logWorkflowMetrics', 'telemetry.persist', 'memory.updateSession']));
    // Onboarded user → no profile-extraction job.
    expect(jobNames).not.toContain('profile.extract');
  });

  it('greeting: takes the fast reply path and never touches memory/graph/generation', async () => {
    asMock(intentService.classify).mockReturnValue({ mode: 'TEACHER', isGreeting: true, isShortHistory: true, isGreetingFlow: true, wordCount: 1, kind: 'a casual / greeting message' });
    asMock(contextService.load).mockResolvedValue({ isOnboarded: true });

    const events = await collect(workflowEngine.executeStream(req({ query: 'hello' }) as any));

    expect(events[events.length - 1].type).toBe('done');
    expect(events.some(e => e.type === 'chunk')).toBe(true);
    // Greeting must NOT run memory load, graph retrieval, or generation.
    expect(memoryService.loadSessionMemory).not.toHaveBeenCalled();
    expect(retrievalOrchestrator.runGraphRetrieval).not.toHaveBeenCalled();
    expect(generationOrchestrator.stream).not.toHaveBeenCalled();
  });

  it('parallel execution: context + memory + graph run concurrently (not sequentially)', async () => {
    asMock(intentService.classify).mockReturnValue({ mode: 'TEACHER', isGreeting: false, isShortHistory: false, isGreetingFlow: false, wordCount: 3, kind: 'q' });
    const starts: Record<string, number> = {};
    const slow = (key: string, result: any) => async () => { starts[key] = Date.now(); await new Promise(r => setTimeout(r, 40)); return result; };
    asMock(contextService.load).mockImplementation(slow('context', { isOnboarded: true }));
    asMock(memoryService.loadSessionMemory).mockImplementation(slow('memory', { contextWindow: [] }));
    asMock(retrievalOrchestrator.runGraphRetrieval).mockImplementation(slow('graph', undefined));
    asMock(retrievalOrchestrator.stream).mockImplementation(async function* () { return { citationsList: [], retrievalLatencyMs: 0 }; });
    asMock(generationOrchestrator.stream).mockImplementation(async function* () { return { fullReply: '', generatedResponse: '', firstChunkAt: 0, generationLatencyMs: 0, measuredHallucinationRate: 0, measuredCitationCoverage: 0, measuredConfidence: 0.7 }; });

    const t0 = Date.now();
    await collect(workflowEngine.executeStream(req() as any));

    // All three started within a tight window of each other → concurrent, not serialized.
    const spread = Math.max(starts.context, starts.memory, starts.graph) - Math.min(starts.context, starts.memory, starts.graph);
    expect(spread).toBeLessThan(30);
    // And the batch took ~one delay (40ms), not three (120ms).
    expect(Date.now() - t0).toBeLessThan(110);
  });

  it('cancellation: consumer stopping early halts the pipeline before generation', async () => {
    mockNonGreetingHappyPath();
    const gen = workflowEngine.executeStream(req() as any);
    await gen.next();            // consume only the first event (intent progress)
    await gen.return(undefined); // consumer cancels (e.g. client disconnects)

    // Generation must not have run after cancellation.
    expect(generationOrchestrator.stream).not.toHaveBeenCalled();
  });

  it('failure scenario: an orchestrator error is surfaced as a single error event (never crashes)', async () => {
    asMock(intentService.classify).mockReturnValue({ mode: 'TEACHER', isGreeting: false, isShortHistory: false, isGreetingFlow: false, wordCount: 3, kind: 'q' });
    asMock(contextService.load).mockResolvedValue({ isOnboarded: true });
    asMock(memoryService.loadSessionMemory).mockResolvedValue({ contextWindow: [] });
    asMock(retrievalOrchestrator.stream).mockImplementation(async function* () { throw new Error('pinecone down'); });

    const events = await collect(workflowEngine.executeStream(req() as any));
    const last = events[events.length - 1];
    expect(last.type).toBe('error');
    expect(last.message).toContain('pinecone down');
  });
});
