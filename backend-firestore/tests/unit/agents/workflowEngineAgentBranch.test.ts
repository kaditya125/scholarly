/**
 * The AGENT branch of WorkflowEngine.executeStream: the single chat entry hands a goal to the
 * agent runtime only when the server flag is on and the student chose Agent (or Auto) mode, and
 * says so honestly when it falls back to chat.
 */
jest.mock('uuid', () => jest.requireActual('../../helpers/uuidCjs'));
jest.mock('../../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), log: jest.fn() },
}));
// Chat-pipeline collaborators: mocked so nothing heavy loads; the agent branch must not reach them.
jest.mock('../../../src/core/workflow/services/IntentService', () => ({
  intentService: { classify: jest.fn(), buildDetailMessage: jest.fn(() => '') },
}));
jest.mock('../../../src/core/workflow/services/ContextService', () => ({
  contextService: { load: jest.fn(), buildDetailMessage: jest.fn(() => '') },
}));
jest.mock('../../../src/core/workflow/services/MemoryService', () => ({
  memoryService: { loadSessionMemory: jest.fn(), buildDetailMessage: jest.fn(() => '') },
}));
jest.mock('../../../src/core/workflow/services/MemoryUpdateService', () => ({
  memoryUpdateService: { extractProfile: jest.fn(), extractProfileTask: jest.fn(), updateSessionMemory: jest.fn() },
}));
jest.mock('../../../src/core/workflow/services/RetrievalOrchestrator', () => ({
  retrievalOrchestrator: { runGraphRetrieval: jest.fn(), buildGraphDetailMessage: jest.fn(() => ''), stream: jest.fn() },
}));
jest.mock('../../../src/core/workflow/services/GenerationOrchestrator', () => ({
  generationOrchestrator: { stream: jest.fn() },
}));
jest.mock('../../../src/core/workflow/jobs/BackgroundQueue', () => ({ backgroundQueue: { enqueueGeneric: jest.fn() } }));

const mockStartRun = jest.fn();
jest.mock('../../../src/agents', () => ({ getAgentRuntime: () => ({ startRun: mockStartRun }) }));
const mockSaveUpload = jest.fn();
const mockDeleteUpload = jest.fn();
jest.mock('../../../src/agents/uploads/agentUploads.service', () => ({
  getAgentUploadsService: () => ({ save: mockSaveUpload, deleteForUser: mockDeleteUpload }),
}));

import { workflowEngine, WorkflowEvent } from '../../../src/core/workflow/WorkflowEngine';
import { AgentRunError } from '../../../src/agents/runtime/AgentRuntime';
import { intentService } from '../../../src/core/workflow/services/IntentService';

const OVERVIEW = 'Give me an overview of the SSC CGL exam';
const req = (over: any = {}) => ({ userId: 'u1', sessionId: 's1', query: OVERVIEW, history: [], mode: 'TEACHER', traceId: 't1', ...over });

/** Reads events until `stop` matches (inclusive) or `max` events, then closes the generator. */
async function take(gen: AsyncGenerator<WorkflowEvent, void>, stop: (e: WorkflowEvent) => boolean, max = 6) {
  const events: WorkflowEvent[] = [];
  for (let i = 0; i < max; i++) {
    const { value, done } = await gen.next();
    if (done || !value) break;
    events.push(value);
    if (stop(value)) break;
  }
  await gen.return(undefined);
  return events;
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.AGENT_MODE_ENABLED = 'true';
  mockStartRun.mockResolvedValue({ runId: 'run-9', workflowId: 'exam_overview' });
});
afterAll(() => {
  delete process.env.AGENT_MODE_ENABLED;
});

describe('WorkflowEngine AGENT branch', () => {
  it('starts an agent run for a goal in Agent mode and returns without running the chat pipeline', async () => {
    const events = await take(workflowEngine.executeStream(req({ executionMode: 'agent' }) as any), (e) => e.type === 'done', 10);
    expect(events.map((e) => e.type)).toEqual(['progress', 'progress', 'agent_run', 'chunk', 'done']);
    expect(events[2]).toMatchObject({ runId: 'run-9', workflowId: 'exam_overview' });
    expect((events[4] as any).data).toMatchObject({ agentRunId: 'run-9' });
    expect(mockStartRun).toHaveBeenCalledWith({ userId: 'u1', goal: OVERVIEW, workflowId: 'exam_overview', sessionId: 's1', source: 'chat' });
    expect(intentService.classify).not.toHaveBeenCalled();
  });

  it('does nothing agent-related while the server flag is off', async () => {
    process.env.AGENT_MODE_ENABLED = 'false';
    const events = await take(workflowEngine.executeStream(req({ executionMode: 'agent' }) as any), () => false, 2);
    expect(mockStartRun).not.toHaveBeenCalled();
    expect(events.some((e) => e.type === 'agent_run' || e.type === 'warning')).toBe(false);
  });

  it('keeps chat mode as chat even for an agent-shaped goal', async () => {
    await take(workflowEngine.executeStream(req({ executionMode: 'chat' }) as any), () => false, 2);
    await take(workflowEngine.executeStream(req() as any), () => false, 2);
    expect(mockStartRun).not.toHaveBeenCalled();
  });

  it('answers a question in chat and says why when the student chose Agent mode', async () => {
    const events = await take(
      workflowEngine.executeStream(req({ executionMode: 'agent', query: 'What is osmosis?' }) as any),
      (e) => e.type === 'warning',
    );
    expect(events.at(-1)).toMatchObject({ type: 'warning', warning: expect.stringMatching(/looks like a question/) });
    expect(mockStartRun).not.toHaveBeenCalled();
  });

  it('says plainly when Agent mode cannot do a recognised task yet', async () => {
    const events = await take(
      workflowEngine.executeStream(req({ executionMode: 'agent', query: 'Create flashcards for photosynthesis' }) as any),
      (e) => e.type === 'warning',
    );
    expect(events.at(-1)).toMatchObject({ type: 'warning', warning: expect.stringMatching(/can't do this kind of task yet/) });
    expect(mockStartRun).not.toHaveBeenCalled();
  });

  it('in Auto mode, runs clear goals as agents and leaves plain questions in chat silently', async () => {
    const goal = await take(workflowEngine.executeStream(req({ executionMode: 'auto' }) as any), (e) => e.type === 'done', 10);
    expect(goal.some((e) => e.type === 'agent_run')).toBe(true);

    mockStartRun.mockClear();
    const question = await take(
      workflowEngine.executeStream(req({ executionMode: 'auto', query: 'What is the SSC CGL syllabus?' }) as any),
      () => false,
      2,
    );
    expect(mockStartRun).not.toHaveBeenCalled();
    expect(question.some((e) => e.type === 'warning')).toBe(false);
  });

  it('tells the student plainly when a run is refused, instead of failing the stream', async () => {
    const message = 'You already have an agent task running. Wait for it to finish or stop it first.';
    mockStartRun.mockRejectedValueOnce(new AgentRunError('USER_BUSY', message, 409));
    const events = await take(workflowEngine.executeStream(req({ executionMode: 'agent' }) as any), (e) => e.type === 'done', 10);
    expect(events.map((e) => e.type)).toEqual(['progress', 'chunk', 'done']);
    expect(events[1]).toEqual({ type: 'chunk', chunk: message });
    expect(events.some((e) => e.type === 'error' || e.type === 'agent_run')).toBe(false);
  });

  it('passes a quota refusal through in the same way', async () => {
    const quota: any = new Error("You've used all your agent tasks for this month.");
    quota.code = 'QUOTA_EXHAUSTED';
    mockStartRun.mockRejectedValueOnce(quota);
    const events = await take(workflowEngine.executeStream(req({ executionMode: 'agent' }) as any), (e) => e.type === 'done', 10);
    expect(events[1]).toEqual({ type: 'chunk', chunk: "You've used all your agent tasks for this month." });
  });

  it('still fails loudly on an unexpected error', async () => {
    mockStartRun.mockRejectedValueOnce(new Error('firestore exploded'));
    const events = await take(workflowEngine.executeStream(req({ executionMode: 'agent' }) as any), (e) => e.type === 'error', 10);
    expect(events.at(-1)).toEqual({ type: 'error', message: 'firestore exploded' });
  });
});

describe('WorkflowEngine AGENT branch — documents attached to the turn (Phase 6, golden case 4)', () => {
  const GOAL = 'Read this uploaded PDF and create revision notes + flashcards + quiz.';
  const doc = { name: 'photosynthesis.pdf', mimeType: 'application/pdf', pages: [{ pageNumber: 1, text: 'Photosynthesis is the process…' }] };
  // Ordinary chat flattens the attachment into the query; the goal is what the student typed.
  const withDoc = (over: any = {}) => req({ executionMode: 'agent', query: `[File Attached: photosynthesis.pdf]\nPhotosynthesis is the process…\n\n${GOAL}`, agentInput: { goal: GOAL, documents: [doc] }, ...over });

  it('routes on the typed words, keeps the document as the student’s upload, and gives the run its id', async () => {
    mockSaveUpload.mockResolvedValue({ uploadId: 'up-1' });
    mockStartRun.mockResolvedValue({ runId: 'run-7', workflowId: 'document_study_pack' });
    const events = await take(workflowEngine.executeStream(withDoc() as any), (e) => e.type === 'done', 10);
    expect(events.find((e) => e.type === 'agent_run')).toMatchObject({ runId: 'run-7' });
    expect(mockSaveUpload).toHaveBeenCalledWith('u1', doc);
    expect(mockStartRun).toHaveBeenCalledWith({ userId: 'u1', goal: GOAL, workflowId: 'document_study_pack', sessionId: 's1', source: 'chat', context: { uploadIds: ['up-1'] } });
  });

  it('answers in the reply when the attachment has no readable text, and starts no run', async () => {
    mockSaveUpload.mockRejectedValue(Object.assign(new Error('“scan.pdf” has no readable text.'), { name: 'AgentUploadError' }));
    const events = await take(workflowEngine.executeStream(withDoc() as any), (e) => e.type === 'done', 10);
    expect(events.find((e) => e.type === 'chunk')).toMatchObject({ chunk: '“scan.pdf” has no readable text.' });
    expect(mockStartRun).not.toHaveBeenCalled();
  });

  it('deletes what it stored when the run is then refused', async () => {
    mockSaveUpload.mockResolvedValue({ uploadId: 'up-2' });
    mockDeleteUpload.mockResolvedValue(undefined);
    mockStartRun.mockRejectedValue(new AgentRunError('USER_BUSY', 'You already have an agent task running.', 409));
    const events = await take(workflowEngine.executeStream(withDoc() as any), (e) => e.type === 'done', 10);
    expect(events.find((e) => e.type === 'chunk')).toMatchObject({ chunk: 'You already have an agent task running.' });
    expect(mockDeleteUpload).toHaveBeenCalledWith('u1', 'up-2');
  });
});
