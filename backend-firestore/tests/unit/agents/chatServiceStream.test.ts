/**
 * Chat SSE fixes: typed mid-stream errors, forwarded `detail` progress lines, the agent_run
 * hand-off event, and stopping generation when the client disconnects.
 */
jest.mock('../../../src/config/firebase', () => ({ db: { collection: () => ({ doc: () => ({}) }) } }));

const mockRepo = {
  getOrCreateSession: jest.fn(async () => ({})),
  getMessages: jest.fn(async () => []),
  saveMessage: jest.fn(async () => undefined),
  getSession: jest.fn(async () => null),
  updateSessionTitle: jest.fn(async () => undefined),
};
jest.mock('../../../src/repositories/chat.repository', () => {
  const actual = jest.requireActual('../../../src/repositories/chat.repository');
  return { ...actual, ChatRepository: jest.fn().mockImplementation(() => mockRepo) };
});

const mockExecuteStream = jest.fn();
jest.mock('../../../src/core/workflow/WorkflowEngine', () => ({
  workflowEngine: { executeStream: (...args: any[]) => mockExecuteStream(...args) },
}));

// A short history triggers background title generation; keep it off the network.
jest.mock('../../../src/services/ai/gemini.provider', () => ({
  GeminiProvider: jest.fn().mockImplementation(() => ({ generateResponse: async () => ({ reply: 'Test title' }) })),
}));

import { ChatService } from '../../../src/services/chat.service';

function sseRes() {
  const writes: any[] = [];
  const res: any = { headersSent: true, writableEnded: false };
  res.write = jest.fn((s: string) => {
    const m = /^data: (.*)\n\n$/s.exec(s);
    writes.push(m ? (m[1] === '[DONE]' ? '[DONE]' : JSON.parse(m[1])) : s);
  });
  res.end = jest.fn(() => {
    res.writableEnded = true;
  });
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn();
  return { res, writes };
}

async function* gen(events: any[]) {
  for (const e of events) yield e;
}

beforeEach(() => jest.clearAllMocks());

describe('ChatService.processChatStream', () => {
  it('forwards detail progress lines and the agent_run hand-off', async () => {
    mockExecuteStream.mockReturnValue(
      gen([
        { type: 'progress', stage: 'RAG_RETRIEVAL', message: 'retrieved 3 passages', detail: true },
        { type: 'agent_run', runId: 'run-1', workflowId: 'exam_overview' },
        { type: 'chunk', chunk: 'On it' },
        { type: 'done', data: {} },
      ]),
    );
    const { res, writes } = sseRes();
    await new ChatService().processChatStream('u1', 's1', 'q', 'm', 'TEACHER' as any, res);
    expect(writes[0]).toEqual({ type: 'progress', stage: 'RAG_RETRIEVAL', message: 'retrieved 3 passages', detail: true });
    expect(writes[1]).toEqual({ type: 'agent_run', runId: 'run-1', workflowId: 'exam_overview' });
    expect(writes.at(-1)).toBe('[DONE]');
    // The reply that started the run carries its id, so a reloaded chat re-attaches the run card.
    expect(mockRepo.saveMessage).toHaveBeenLastCalledWith('s1', expect.objectContaining({ role: 'ai', content: 'On it', agentRunId: 'run-1' }));
  });

  it('does not tag an ordinary reply with a run id', async () => {
    mockExecuteStream.mockReturnValue(gen([{ type: 'chunk', chunk: 'plain answer' }, { type: 'done', data: {} }]));
    const { res } = sseRes();
    await new ChatService().processChatStream('u1', 's1', 'q', 'm', 'TEACHER' as any, res);
    const saved = (mockRepo.saveMessage as jest.Mock).mock.calls.at(-1)![1];
    expect(saved.agentRunId).toBeUndefined();
  });

  it('writes mid-stream errors as a typed error event', async () => {
    mockExecuteStream.mockReturnValue(gen([{ type: 'chunk', chunk: 'partial' }, { type: 'error', message: 'provider down' }]));
    const { res, writes } = sseRes();
    await new ChatService().processChatStream('u1', 's1', 'q', 'm', 'TEACHER' as any, res);
    expect(writes.at(-1)).toEqual({ type: 'error', error: 'provider down', message: 'provider down' });
    expect(res.end).toHaveBeenCalled();
  });

  it('stops generating when the client disconnects and keeps what was streamed', async () => {
    const abort = new AbortController();
    const produced: string[] = [];
    mockExecuteStream.mockReturnValue(
      (async function* () {
        produced.push('a');
        yield { type: 'chunk', chunk: 'first part' };
        abort.abort(); // the student closes the tab while the next stage is running
        produced.push('b');
        yield { type: 'chunk', chunk: 'second part' };
        produced.push('c');
        yield { type: 'chunk', chunk: 'third part' };
      })(),
    );
    const { res, writes } = sseRes();
    await new ChatService().processChatStream('u1', 's1', 'q', 'm', 'TEACHER' as any, res, undefined, undefined, undefined, false, {
      signal: abort.signal,
    });
    expect(writes).toEqual([{ type: 'chunk', content: 'first part' }]);
    expect(produced).toEqual(['a', 'b']); // generator closed; 'c' never produced
    expect(mockRepo.saveMessage).toHaveBeenLastCalledWith('s1', expect.objectContaining({ content: 'first part' }));
    expect(res.end).toHaveBeenCalled();
  });

  it('passes the execution mode to the workflow engine', async () => {
    mockExecuteStream.mockReturnValue(gen([{ type: 'done', data: {} }]));
    const { res } = sseRes();
    await new ChatService().processChatStream('u1', 's1', 'q', 'm', 'TEACHER' as any, res, undefined, undefined, undefined, false, {
      executionMode: 'agent',
    });
    expect(mockExecuteStream).toHaveBeenCalledWith(expect.objectContaining({ executionMode: 'agent', userId: 'u1' }));
  });
});
