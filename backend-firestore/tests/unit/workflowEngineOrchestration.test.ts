/**
 * WorkflowEngine.executeStream orchestration.
 *
 * The engine runs its stages inline (the earlier IntentService/ContextService/GenerationOrchestrator
 * decomposition this file used to mock is no longer wired in), so these tests drive it through its
 * real seams: providers resolved from the DI container, the student-context and graph collaborators,
 * and the retrieval orchestrator. Nothing here touches Firestore, a vector store or a model.
 */
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), log: jest.fn() },
}));
jest.mock('../../src/services/studentContext.service', () => ({
  StudentContextService: jest.fn().mockImplementation(() => ({
    aggregateContext: jest.fn().mockResolvedValue({ isOnboarded: true, profile: {}, stats: {} }),
  })),
}));
jest.mock('../../src/services/teacherContext.service', () => ({
  TeacherContextService: jest.fn().mockImplementation(() => ({ aggregateContext: jest.fn().mockResolvedValue({}) })),
}));
jest.mock('../../src/services/userProfile.service', () => ({
  UserProfileService: jest.fn().mockImplementation(() => ({ extractProfileFromConversation: jest.fn().mockResolvedValue(undefined) })),
}));
jest.mock('../../src/services/telemetry.service', () => ({
  TelemetryService: jest.fn().mockImplementation(() => new Proxy({}, { get: () => jest.fn().mockResolvedValue(undefined) })),
}));
jest.mock('../../src/core/agents/KnowledgeGraphAgent', () => ({
  KnowledgeGraphAgent: jest.fn().mockImplementation(() => ({ execute: jest.fn().mockResolvedValue(undefined) })),
}));
jest.mock('../../src/core/workflow/services/RetrievalOrchestrator', () => ({
  retrievalOrchestrator: {
    runGraphRetrieval: jest.fn().mockResolvedValue(undefined),
    buildGraphDetailMessage: jest.fn(() => 'graph-detail'),
    stream: jest.fn(),
  },
}));

import { workflowEngine, WorkflowEvent } from '../../src/core/workflow/WorkflowEngine';
import { container, TOKENS } from '../../src/core/di/container';
import { retrievalOrchestrator } from '../../src/core/workflow/services/RetrievalOrchestrator';

async function collect(gen: AsyncGenerator<WorkflowEvent, void>) {
  const events: WorkflowEvent[] = [];
  for await (const e of gen) events.push(e);
  return events;
}

const req = (over: any = {}) => ({ userId: 'u1', sessionId: 's1', query: 'explain gauss law', history: [], mode: 'TEACHER', traceId: 't1', ...over });

/** Every memory-provider method resolves to an empty memory. */
const memoryCalls: Record<string, jest.Mock> = {};
const memoryProvider = new Proxy(memoryCalls, {
  get: (target, prop: string) => {
    if (prop === 'then') return undefined;
    return (target[prop] ??= jest.fn().mockResolvedValue({ contextWindow: [] }));
  },
});

describe('WorkflowEngine.executeStream', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    container.clear();
    container.register(TOKENS.ReasoningProvider, new (class GeminiProvider {})());
    container.register(TOKENS.AIProvider, {
      generateStreamResponse: async function* () { yield 'hi there!'; },
      generateResponse: jest.fn().mockResolvedValue({ reply: '[]' }),
    });
    container.register(TOKENS.MemoryProvider, memoryProvider);
    container.register(TOKENS.CacheProvider, { get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue(undefined) });
    container.register(TOKENS.AnalyticsProvider, { logWorkflowMetrics: jest.fn().mockResolvedValue(undefined) });
  });
  afterEach(() => container.clear());

  it('greeting: takes the fast reply path — streams the welcome, updates memory, never retrieves', async () => {
    const events = await collect(workflowEngine.executeStream(req({ query: 'hello' }) as any));

    expect(events.filter((e) => e.type === 'chunk').map((e) => e.chunk).join('')).toBe('hi there!');
    const last = events[events.length - 1];
    expect(last.type).toBe('done');
    expect(last.data.confidenceScore).toBe(1);
    expect(memoryCalls.updateSessionMemory).toHaveBeenCalledWith('u1', 's1', { contextWindow: ['hello'] });
    expect(retrievalOrchestrator.stream).not.toHaveBeenCalled();
  });

  it('failure: a retrieval error is surfaced as exactly one error event (never crashes the stream)', async () => {
    (retrievalOrchestrator.stream as jest.Mock).mockImplementation(async function* () { throw new Error('pinecone down'); });

    const events = await collect(workflowEngine.executeStream(req() as any));

    const errors = events.filter((e) => e.type === 'error');
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('pinecone down');
    expect(events[events.length - 1].type).toBe('error');
    expect(events.some((e) => e.type === 'done')).toBe(false);
  });

  it('cancellation: a consumer that stops after the first event halts the pipeline before retrieval', async () => {
    const gen = workflowEngine.executeStream(req() as any);
    await gen.next();            // first progress event only
    await gen.return(undefined); // client disconnects

    expect(retrievalOrchestrator.stream).not.toHaveBeenCalled();
  });
});
