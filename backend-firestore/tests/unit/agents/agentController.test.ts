/**
 * Agent HTTP surface: hidden while the flag is off, owner-only, honest about unsupported goals,
 * and a replayable SSE stream.
 */
jest.mock('../../../src/config/firebase', () => ({ db: { collection: () => ({ doc: () => ({}) }) } }));

const mockAssertSessionAccess = jest.fn(async () => undefined);
jest.mock('../../../src/services/chat.service', () => ({
  ChatService: jest.fn().mockImplementation(() => ({ assertSessionAccess: mockAssertSessionAccess })),
}));

const mockHolder: { runtime?: any } = {};
jest.mock('../../../src/agents', () => {
  const actual = jest.requireActual('../../../src/agents');
  return {
    ...actual,
    getAgentRuntime: () => mockHolder.runtime,
    ensureAgentRecovery: async () => undefined,
  };
});

import { AgentController } from '../../../src/controllers/agent.controller';
import { SessionAccessError } from '../../../src/repositories/chat.repository';
import { fakeTool, fixedWorkflow, makeRuntime, registryOf } from './helpers';

function res() {
  const r: any = { headersSent: false, writableEnded: false, chunks: [] as string[] };
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  r.setHeader = jest.fn();
  r.flushHeaders = jest.fn(() => {
    r.headersSent = true;
  });
  r.write = jest.fn((s: string) => {
    r.chunks.push(s);
  });
  r.end = jest.fn(() => {
    r.writableEnded = true;
  });
  r.on = jest.fn();
  return r;
}

const wf = fixedWorkflow('fixed', {
  successCriteria: [],
  estimatedComplexity: 'low',
  requiresUserApproval: false,
  steps: [{ id: 'a', objective: 'a', label: 'Step A', type: 'retrieve', tool: 't', input: { query: 'q' }, dependsOn: [] }],
});

let controller: AgentController;
beforeEach(() => {
  jest.clearAllMocks();
  process.env.AGENT_MODE_ENABLED = 'true';
  mockHolder.runtime = makeRuntime(registryOf(fakeTool('t', async () => ({ ok: true }))), [wf]).runtime;
  controller = new AgentController();
});
afterAll(() => {
  delete process.env.AGENT_MODE_ENABLED;
});

describe('AgentController', () => {
  it('is invisible (404) while the flag is off', async () => {
    process.env.AGENT_MODE_ENABLED = 'false';
    for (const handler of [controller.startRun, controller.getRun, controller.listRuns, controller.cancelRun, controller.streamEvents]) {
      const r = res();
      await handler({ user: { uid: 'u1' }, body: { goal: 'x' }, params: { runId: 'r' }, query: {}, headers: {} } as any, r, jest.fn());
      expect(r.status).toHaveBeenCalledWith(404);
    }
  });

  it('requires authentication', async () => {
    const r = res();
    await controller.startRun({ user: undefined, body: {} } as any, r, jest.fn());
    expect(r.status).toHaveBeenCalledWith(401);
  });

  it('answers 422 for a question or a goal no workflow can do yet', async () => {
    const r = res();
    await controller.startRun({ user: { uid: 'u1' }, body: { goal: 'Create flashcards on osmosis' } } as any, r, jest.fn());
    expect(r.status).toHaveBeenCalledWith(422);
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'NO_AGENT_WORKFLOW' }));
  });

  it("refuses to attach a run to another user's chat session", async () => {
    mockAssertSessionAccess.mockRejectedValueOnce(new SessionAccessError());
    const r = res();
    await controller.startRun({ user: { uid: 'u1' }, body: { goal: 'anything', workflowId: 'fixed', sessionId: 'theirs' } } as any, r, jest.fn());
    expect(r.status).toHaveBeenCalledWith(403);
  });

  it('starts a run (202), lets only its owner read it, and replays events over SSE', async () => {
    const start = res();
    await controller.startRun({ user: { uid: 'owner' }, body: { goal: 'do it', workflowId: 'fixed' } } as any, start, jest.fn());
    expect(start.status).toHaveBeenCalledWith(202);
    const { runId, eventsUrl } = start.json.mock.calls[0][0];
    expect(eventsUrl).toBe(`/api/agent/runs/${runId}/events`);
    await mockHolder.runtime.waitForRun(runId);

    const mine = res();
    await controller.getRun({ user: { uid: 'owner' }, params: { runId } } as any, mine, jest.fn());
    expect(mine.json.mock.calls[0][0]).toMatchObject({ runId, status: 'completed' });
    expect(mine.json.mock.calls[0][0].lease).toBeUndefined();

    const theirs = res();
    await controller.getRun({ user: { uid: 'intruder' }, params: { runId } } as any, theirs, jest.fn());
    expect(theirs.status).toHaveBeenCalledWith(404);

    const sse = res();
    await controller.streamEvents({ user: { uid: 'owner' }, params: { runId }, query: {}, headers: {} } as any, sse, jest.fn());
    expect(sse.setHeader).toHaveBeenCalledWith('X-Accel-Buffering', 'no');
    const ids = sse.chunks.map((c: string) => Number(/^id: (\d+)/.exec(c)?.[1])).filter(Boolean);
    expect(ids[0]).toBe(1);
    expect(sse.chunks.at(-1)).toMatch(/event: agent\.completed/);
    expect(sse.end).toHaveBeenCalled();

    // Resume after event 3: only later events are sent.
    const resumed = res();
    await controller.streamEvents(
      { user: { uid: 'owner' }, params: { runId }, query: {}, headers: { 'last-event-id': '3' } } as any,
      resumed,
      jest.fn(),
    );
    const resumedIds = resumed.chunks.map((c: string) => Number(/^id: (\d+)/.exec(c)?.[1])).filter(Boolean);
    expect(resumedIds[0]).toBe(4);
    expect(resumedIds).toEqual(ids.filter((i: number) => i > 3));

    const blocked = res();
    await controller.streamEvents({ user: { uid: 'intruder' }, params: { runId }, query: {}, headers: {} } as any, blocked, jest.fn());
    expect(blocked.status).toHaveBeenCalledWith(404);
    expect(blocked.flushHeaders).not.toHaveBeenCalled();
  });

  it('delivers events in contiguous order, holding early ones until the gap closes', async () => {
    const rig = makeRuntime(registryOf(fakeTool('t', async () => ({ ok: true }))), [wf]);
    mockHolder.runtime = rig.runtime;
    const runId = 'run-with-a-gap';
    await rig.store.createRun({
      runId,
      userId: 'owner',
      goal: 'g',
      workflowId: 'fixed',
      source: 'api',
      status: 'executing',
      steps: [],
      budget: { maxSteps: 4, maxToolCalls: 4, maxTokens: 1000, maxExecutionMs: 60_000, maxCostUsd: 1 },
      usage: { steps: 0, toolCalls: 0, tokens: 0, costUsd: 0, elapsedMs: 0 },
      artifactIds: [],
      cancelRequested: false,
      lastEventSeq: 3,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as any);
    for (const seq of [1, 2, 3]) {
      await rig.store.appendEvent({ runId, seq, type: 'agent.step.started', ts: Date.now() } as any);
    }

    const r = res();
    await controller.streamEvents({ user: { uid: 'owner' }, params: { runId }, query: {}, headers: {} } as any, r, jest.fn());
    const ids = () => r.chunks.map((c: string) => Number(/^id: (\d+)/.exec(c)?.[1])).filter(Boolean);
    expect(ids()).toEqual([1, 2, 3]);

    // Seq 5 and the terminal event arrive while 4 is still in flight. Neither may be delivered
    // yet: a client that received 5 and dropped would resume from 5 and never see 4.
    rig.hub.publish({ runId, seq: 5, type: 'agent.step.completed', ts: Date.now() } as any);
    rig.hub.publish({ runId, seq: 6, type: 'agent.completed', ts: Date.now() } as any);
    expect(ids()).toEqual([1, 2, 3]);
    expect(r.end).not.toHaveBeenCalled();

    rig.hub.publish({ runId, seq: 4, type: 'agent.tool.completed', ts: Date.now() } as any);
    expect(ids()).toEqual([1, 2, 3, 4, 5, 6]); // the gap fills and the held events follow, in order
    expect(r.end).toHaveBeenCalled();

    rig.hub.publish({ runId, seq: 4, type: 'agent.tool.completed', ts: Date.now() } as any);
    expect(ids()).toEqual([1, 2, 3, 4, 5, 6]); // and never twice
  });

  it('lists workflows and tools as metadata only', async () => {
    const w = res();
    await controller.listWorkflows({ user: { uid: 'u1' } } as any, w);
    expect(w.json.mock.calls[0][0].workflows).toEqual([expect.objectContaining({ id: 'fixed' })]);
    const t = res();
    await controller.listTools({ user: { uid: 'u1' } } as any, t);
    expect(t.json.mock.calls[0][0].tools[0]).toMatchObject({ name: 't' });
    expect(t.json.mock.calls[0][0].tools[0].execute).toBeUndefined();
  });
});
